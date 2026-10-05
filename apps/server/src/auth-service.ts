import { createHash, randomBytes, randomUUID, scryptSync, timingSafeEqual } from 'node:crypto';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import type { DbHandle } from './db.js';
import { nowIso } from './util.js';

/**
 * 认证服务：scrypt 密码哈希 + 服务端会话（Cookie 只携带随机令牌，库里存 sha256）。
 * 会话存 SQLite：重启不失效、可服务端撤销；remember 决定 30 天或浏览器会话级。
 */

const SESSION_COOKIE = 'shiti_session';
const REMEMBER_TTL_MS = 30 * 24 * 60 * 60 * 1000;
const SHORT_TTL_MS = 12 * 60 * 60 * 1000;
/** 同一账号 15 分钟内最多 10 次失败，超出临时锁定（进程内计数即可） */
const LOCKOUT_MAX = 10;
const LOCKOUT_WINDOW_MS = 15 * 60 * 1000;

export interface SessionUser {
  id: string;
  username: string;
  email: string;
  nickname: string;
  role: 'admin' | 'user';
}

interface UserRow {
  id: string;
  username: string;
  email: string;
  nickname: string;
  password_hash: string;
  role: 'admin' | 'user';
  status: 'active' | 'disabled';
  preferences_json: string;
}

export const ADMIN_ID = 'u-admin';

// ---------- 密码 ----------

export function hashPassword(password: string): string {
  const salt = randomBytes(16);
  const N = 16384, r = 8, p = 1;
  const key = scryptSync(password, salt, 64, { N, r, p });
  return `scrypt$${N}$${r}$${p}$${salt.toString('base64')}$${key.toString('base64')}`;
}

export function verifyPassword(password: string, stored: string): boolean {
  const parts = stored.split('$');
  if (parts.length !== 6 || parts[0] !== 'scrypt') return false;
  const [, n, rr, pp, saltB64, keyB64] = parts as [string, string, string, string, string, string];
  try {
    const key = scryptSync(password, Buffer.from(saltB64, 'base64'), 64, { N: Number(n), r: Number(rr), p: Number(pp) });
    return timingSafeEqual(key, Buffer.from(keyB64, 'base64'));
  } catch {
    return false;
  }
}

// ---------- 登录限流 ----------

const failures = new Map<string, { count: number; resetAt: number }>();

function checkLockout(account: string): boolean {
  const entry = failures.get(account.toLowerCase());
  return entry !== undefined && entry.count >= LOCKOUT_MAX && Date.now() < entry.resetAt;
}

function recordFailure(account: string): void {
  const key = account.toLowerCase();
  const now = Date.now();
  const entry = failures.get(key);
  if (!entry || now >= entry.resetAt) failures.set(key, { count: 1, resetAt: now + LOCKOUT_WINDOW_MS });
  else entry.count += 1;
}

function clearFailures(account: string): void {
  failures.delete(account.toLowerCase());
}

// ---------- 会话 ----------

const hashToken = (token: string) => createHash('sha256').update(token).digest('hex');

export function createSession(h: DbHandle, userId: string, remember: boolean, userAgent: string | undefined): { token: string; expiresAtMs: number } {
  const token = randomBytes(32).toString('base64url');
  const expiresAtMs = Date.now() + (remember ? REMEMBER_TTL_MS : SHORT_TTL_MS);
  h.db.prepare(
    'INSERT INTO auth_sessions (token_hash, user_id, remember, created_at, expires_at_ms, last_seen_ms, user_agent) VALUES (?, ?, ?, ?, ?, ?, ?)',
  ).run(hashToken(token), userId, remember ? 1 : 0, nowIso(), expiresAtMs, Date.now(), userAgent?.slice(0, 200) ?? null);
  return { token, expiresAtMs };
}

export function resolveSession(h: DbHandle, token: string | undefined | null): SessionUser | null {
  if (!token) return null;
  const row = h.db.prepare(
    `SELECT u.id, u.username, u.email, u.nickname, u.role, u.status, s.expires_at_ms, s.last_seen_ms
     FROM auth_sessions s JOIN users u ON u.id = s.user_id WHERE s.token_hash = ?`,
  ).get(hashToken(token)) as (UserRow & { expires_at_ms: number; last_seen_ms: number }) | undefined;
  if (!row || row.status !== 'active' || Date.now() >= row.expires_at_ms) return null;
  // last_seen 节流写入：距上次超过 10 分钟才碰库
  if (Date.now() - row.last_seen_ms > 10 * 60 * 1000) {
    h.db.prepare('UPDATE auth_sessions SET last_seen_ms = ? WHERE token_hash = ?').run(Date.now(), hashToken(token));
  }
  return { id: row.id, username: row.username, email: row.email, nickname: row.nickname, role: row.role };
}

export function destroySession(h: DbHandle, token: string | undefined | null): void {
  if (!token) return;
  h.db.prepare('DELETE FROM auth_sessions WHERE token_hash = ?').run(hashToken(token));
}

export function pruneExpiredSessions(h: DbHandle): void {
  h.db.prepare('DELETE FROM auth_sessions WHERE expires_at_ms < ?').run(Date.now());
}

export function sessionCookie(token: string, remember: boolean): string {
  const parts = [`${SESSION_COOKIE}=${token}`, 'Path=/', 'HttpOnly', 'SameSite=Lax'];
  if (remember) parts.push(`Max-Age=${Math.floor(REMEMBER_TTL_MS / 1000)}`);
  return parts.join('; ');
}

export const clearedSessionCookie = `${SESSION_COOKIE}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0`;

export function readSessionCookie(req: { headers: { cookie?: string | string[] | undefined } }): string | undefined {
  const raw = req.headers.cookie;
  if (!raw) return undefined;
  const header = Array.isArray(raw) ? raw.join('; ') : raw;
  for (const pair of header.split(';')) {
    const eq = pair.indexOf('=');
    if (eq > 0 && pair.slice(0, eq).trim() === SESSION_COOKIE) return pair.slice(eq + 1).trim() || undefined;
  }
  return undefined;
}

// ---------- 账号 ----------

export class AuthError extends Error {
  constructor(public status: number, public code: string, message: string, public fieldErrors?: Record<string, string>) {
    super(message);
  }
}

export function findUserByAccount(h: DbHandle, account: string): UserRow | undefined {
  return h.db.prepare('SELECT * FROM users WHERE username = ? OR email = ?').get(account.trim(), account.trim().toLowerCase()) as UserRow | undefined;
}

export function attemptLogin(h: DbHandle, account: string, password: string): SessionUser {
  if (checkLockout(account)) {
    throw new AuthError(423, 'ACCOUNT_LOCKED', '尝试次数过多，账号已被暂时锁定，请稍后再试。');
  }
  const user = findUserByAccount(h, account);
  if (!user || !verifyPassword(password, user.password_hash)) {
    recordFailure(account);
    throw new AuthError(401, 'INVALID_CREDENTIALS', '账号或密码不正确。');
  }
  if (user.status !== 'active') {
    throw new AuthError(403, 'ACCOUNT_DISABLED', '该账号已被停用，如有疑问请联系管理员。');
  }
  clearFailures(account);
  return { id: user.id, username: user.username, email: user.email, nickname: user.nickname, role: user.role };
}

export interface RegisterInput { nickname: string; email: string; password: string }

export function registerUser(h: DbHandle, input: RegisterInput): SessionUser {
  const nickname = input.nickname.trim();
  const email = input.email.trim().toLowerCase();
  if (nickname.length < 2 || nickname.length > 16) {
    throw new AuthError(422, 'VALIDATION_FAILED', '昵称需要 2–16 个字符', { nickname: '昵称需要 2–16 个字符' });
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    throw new AuthError(422, 'VALIDATION_FAILED', '邮箱格式好像不太对', { email: '邮箱格式好像不太对' });
  }
  if (input.password.length < 8 || !/[a-zA-Z]/.test(input.password) || !/\d/.test(input.password)) {
    throw new AuthError(422, 'VALIDATION_FAILED', '密码至少 8 位，需同时包含字母和数字', { password: '至少 8 位，需同时包含字母和数字' });
  }
  if (h.db.prepare('SELECT id FROM users WHERE email = ?').get(email)) {
    throw new AuthError(409, 'EMAIL_TAKEN', '这个邮箱已经注册过了，直接登录就好。', { email: '这个邮箱已经注册过了' });
  }
  const id = `u-${randomUUID()}`;
  const now = nowIso();
  // 用户名默认取邮箱前缀，保证唯一（冲突时追加序号）
  let username = email.split('@')[0]?.replace(/[^a-z0-9_-]/gi, '') || 'user';
  for (let i = 1; h.db.prepare('SELECT id FROM users WHERE username = ?').get(username); i++) username = `${username}${i}`;
  h.db.prepare(
    'INSERT INTO users (id, username, email, nickname, password_hash, role, status, preferences_json, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
  ).run(id, username, email, nickname, hashPassword(input.password), 'user', 'active', '{}', now, now);
  return { id, username, email, nickname, role: 'user' };
}

/**
 * 管理员种子：首次启动时创建固定 id 的管理员（u-admin），存量 attempts 通过迁移默认值归属该账号。
 * 密码优先取 SHITI_ADMIN_PASSWORD 环境变量；没有则随机生成并写入数据目录下的 admin-credentials.txt。
 */
export function ensureAdminUser(h: DbHandle, adminPassword?: string): { created: boolean; credentialsFile?: string } {
  const existing = h.db.prepare('SELECT id FROM users WHERE id = ?').get(ADMIN_ID);
  if (existing) return { created: false };
  const now = nowIso();
  let password = adminPassword;
  let credentialsFile: string | undefined;
  if (!password) {
    password = randomBytes(12).toString('base64url');
    try {
      mkdirSync(h.dataDir, { recursive: true });
      credentialsFile = join(h.dataDir, 'admin-credentials.txt');
      writeFileSync(credentialsFile, `拾题管理员账号\n用户名：AonoChano\n邮箱：CYChano@outlook.com\n密码：${password}\n\n首次启动时自动生成；请妥善保管本文件，登录成功后可删除。\n`, 'utf8');
    } catch {
      // 写不进去就只在启动日志里提醒一次，账号仍可用环境变量重置
    }
  }
  h.db.prepare(
    'INSERT INTO users (id, username, email, nickname, password_hash, role, status, preferences_json, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
  ).run(ADMIN_ID, 'AonoChano', 'CYChano@outlook.com', 'AonoChano', hashPassword(password), 'admin', 'active', '{}', now, now);
  return { created: true, credentialsFile };
}

/** 用户偏好（备考科目/每日目标/目标日期）存 preferences_json */
export interface UserPreferences { exam?: string; daily_target?: number; target_date?: string }

export function readPreferences(userJson: string): UserPreferences {
  try {
    return JSON.parse(userJson) as UserPreferences;
  } catch {
    return {};
  }
}

export function updatePreferences(h: DbHandle, userId: string, patch: UserPreferences): UserPreferences {
  const row = h.db.prepare('SELECT preferences_json FROM users WHERE id = ?').get(userId) as { preferences_json: string };
  const next = { ...readPreferences(row.preferences_json), ...patch };
  // 空串 / undefined 的字段表示清除该偏好
  for (const key of Object.keys(next) as Array<keyof UserPreferences>) {
    if (next[key] === '' || next[key] === undefined) delete next[key];
  }
  h.db.prepare('UPDATE users SET preferences_json = ?, updated_at = ? WHERE id = ?').run(JSON.stringify(next), nowIso(), userId);
  return next;
}
