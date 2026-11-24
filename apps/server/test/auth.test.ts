import { describe, expect, it, beforeEach, afterAll } from 'vitest';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { buildApp } from '../src/app.js';
import type { DbHandle } from '../src/db.js';
import type { FastifyInstance } from 'fastify';
import { TEST_ADMIN_PASSWORD, loginCookie } from './helpers.js';

const sample = readFileSync(join(import.meta.dirname ?? '.', '..', '..', '..', 'samples', 'golden-five.json'), 'utf8');

let dataDir: string;
let app: FastifyInstance & { h: DbHandle; runWorkerOnce: () => 'idle' | 'ran' };
let cookie = '';

async function api(method: string, url: string, body?: unknown, headers?: Record<string, string>) {
  const res = await app.inject({ method: method as never, url, payload: body, headers: { cookie, ...headers } });
  return { status: res.statusCode, json: res.json() as Record<string, unknown>, headers: res.headers };
}
const data = (r: { json: Record<string, unknown> }) => r.json['data'] as Record<string, unknown>;
const errCode = (r: { json: Record<string, unknown> }) => (r.json['error'] as Record<string, unknown>)['code'];

/** 注册一个新用户并返回其会话 Cookie */
async function registerAndLogin(nickname: string, email: string): Promise<string> {
  const res = await app.inject({
    method: 'POST', url: '/api/v1/auth/register',
    payload: { nickname, email, password: 'passw0rd8' },
  });
  expect(res.statusCode).toBe(201);
  const raw = res.headers['set-cookie'];
  const header = Array.isArray(raw) ? raw.join('\n') : raw ?? '';
  return header.split(';')[0]?.trim() ?? '';
}

/** 管理员走完整流程建一个练习（默认只答错第 1 题）；样本只导入一次，保证跨练习同一 question_id */
let goldenSv = '';
async function makeAttempt(answerQ1: string): Promise<string> {
  if (!goldenSv) {    const imp = await api('POST', '/api/v1/imports', { content: sample });
    const importId = data(imp)['import_id'] as string;
    const commit = await api('POST', `/api/v1/imports/${importId}/commit`, { confirmed_warnings: [] }, { 'idempotency-key': 'c-golden' });
    expect(commit.status).toBe(200);
    goldenSv = data(commit)['set_version_id'] as string;
  }
  const created = await api('POST', '/api/v1/attempts', { set_version_id: goldenSv, mode: 'training' });
  const attemptId = data(created)['attempt_id'] as string;
  await api('POST', `/api/v1/attempts/${attemptId}/start`, { expected_revision: 1, client_instance_id: 't' }, { 'idempotency-key': `s-${attemptId}` });
  const dto = await api('GET', `/api/v1/attempts/${attemptId}`);
  const items = data(dto)['items'] as Array<{ attempt_item_id: string; options: Array<{ id: string }> }>;
  const first = items[0]!;
  const target = first.options.find((o) => o.id === `q1-${answerQ1}`)?.id ?? `q1-${answerQ1}`;
  await api('POST', `/api/v1/attempts/${attemptId}/actions`, { writer_epoch: 1, actions: [
    { action_id: 'a1', client_seq: 1, attempt_item_id: first.attempt_item_id, expected_draft_revision: 0, event_type: 'answer_changed', changed_fields: { answer: { selected_option_ids: [target] } }, occurred_at: new Date().toISOString() },
  ] });
  const sub = await api('POST', `/api/v1/attempts/${attemptId}/submit`, { expected_revision: 2 }, { 'idempotency-key': `sub-${attemptId}` });
  expect(sub.status).toBe(200);
  return attemptId;
}

beforeEach(async () => {
  dataDir = mkdtempSync(join(tmpdir(), 'shiti-auth-'));
  app = await buildApp({ dataDir, serveWebDist: false, adminPassword: TEST_ADMIN_PASSWORD });
  await app.ready();
  cookie = await loginCookie(app);
  goldenSv = ''; // 每个测试都是全新 DB，黄金样本需要重新导入
});
afterAll(async () => {
  await app?.close();
  rmSync(dataDir, { recursive: true, force: true, maxRetries: 8, retryDelay: 250 });
});

describe('认证', () => {
  it('受保护接口匿名 → 401；/health 公开', async () => {
    const anon = await app.inject({ method: 'GET', url: '/api/v1/sets' });
    expect(anon.statusCode).toBe(401);
    expect((anon.json() as Record<string, unknown>)['error']).toMatchObject({ code: 'UNAUTHORIZED' });
    const health = await app.inject({ method: 'GET', url: '/api/v1/health' });
    expect(health.statusCode).toBe(200);
  });

  it('登录成功/失败；me 与 logout 闭环', async () => {
    const bad = await app.inject({ method: 'POST', url: '/api/v1/auth/login', payload: { account: 'admin', password: 'wrong-pass1' } });
    expect(bad.statusCode).toBe(401);
    expect((bad.json() as Record<string, unknown>)['error']).toMatchObject({ code: 'INVALID_CREDENTIALS' });

    // 邮箱大小写不敏感 + 用户名均可登录
    const byEmail = await app.inject({ method: 'POST', url: '/api/v1/auth/login', payload: { account: 'ADMIN@SHITI.LOCAL', password: TEST_ADMIN_PASSWORD, remember: true } });
    expect(byEmail.statusCode).toBe(200);
    const meRes = await app.inject({ method: 'GET', url: '/api/v1/auth/me', headers: { cookie: loginHeader(byEmail.headers['set-cookie']) } });
    expect((meRes.json() as Record<string, unknown>)['data']).toMatchObject({ user: { username: 'admin', role: 'admin' } });

    // 登出后 me → 401
    const token = loginHeader(byEmail.headers['set-cookie']);
    const out = await app.inject({ method: 'POST', url: '/api/v1/auth/logout', headers: { cookie: token } });
    expect(out.statusCode).toBe(200);
    const me2 = await app.inject({ method: 'GET', url: '/api/v1/auth/me', headers: { cookie: token } });
    expect(me2.statusCode).toBe(401);
  });

  it('注册：成功 → 重复邮箱 409；校验失败 422 带 fieldErrors', async () => {
    const dup = await app.inject({ method: 'POST', url: '/api/v1/auth/register', payload: { nickname: '张三', email: 'ADMIN@SHITI.LOCAL', password: 'passw0rd8' } });
    expect(dup.statusCode).toBe(409);
    expect((dup.json() as Record<string, unknown>)['error']).toMatchObject({ code: 'EMAIL_TAKEN' });

    const weak = await app.inject({ method: 'POST', url: '/api/v1/auth/register', payload: { nickname: '李四', email: 'lisi@example.com', password: 'short' } });
    expect(weak.statusCode).toBe(422);
    const err = (weak.json() as Record<string, unknown>)['error'] as Record<string, unknown>;
    expect(err['fieldErrors']).toMatchObject({ password: expect.any(String) });
  });

  it('同一账号连错 10 次临时锁定（423）', async () => {
    for (let i = 0; i < 10; i++) {
      await app.inject({ method: 'POST', url: '/api/v1/auth/login', payload: { account: 'nobody@nowhere.test', password: 'whatever1' } });
    }
    const locked = await app.inject({ method: 'POST', url: '/api/v1/auth/login', payload: { account: 'nobody@nowhere.test', password: 'whatever1' } });
    expect(locked.statusCode).toBe(423);
    expect((locked.json() as Record<string, unknown>)['error']).toMatchObject({ code: 'ACCOUNT_LOCKED' });
  });

  it('找回密码：未配置邮件服务时如实报错而不是假装发送', async () => {
    const r = await api('POST', '/api/v1/auth/password/forgot', { email: 'admin@shiti.local' });
    expect(r.status).toBe(503);
    expect(errCode(r)).toBe('EMAIL_NOT_CONFIGURED');
  });

  it('旧版播种的管理员账号，升级后统一为默认 admin', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'shiti-admin-rename-'));
    const before = await buildApp({ dataDir: dir, serveWebDist: false, adminPassword: TEST_ADMIN_PASSWORD });
    await before.ready();
    // 还原旧版本播种出来的身份（维护者个人用户名/邮箱）
    before.h.db
      .prepare("UPDATE users SET username = 'AonoChano', email = 'CYChano@outlook.com', nickname = 'AonoChano' WHERE id = 'u-admin'")
      .run();
    await before.close();

    const after = await buildApp({ dataDir: dir, serveWebDist: false, adminPassword: TEST_ADMIN_PASSWORD });
    await after.ready();
    const byAdmin = await after.inject({ method: 'POST', url: '/api/v1/auth/login', payload: { account: 'admin', password: TEST_ADMIN_PASSWORD, remember: false } });
    expect(byAdmin.statusCode).toBe(200);
    const byLegacy = await after.inject({ method: 'POST', url: '/api/v1/auth/login', payload: { account: 'AonoChano', password: TEST_ADMIN_PASSWORD, remember: false } });
    expect(byLegacy.statusCode).toBe(401);
    const row = after.h.db.prepare('SELECT username, email, nickname FROM users WHERE id = ?').get('u-admin') as Record<string, string>;
    expect(row).toMatchObject({ username: 'admin', email: 'admin@shiti.local', nickname: '管理员' });
    await after.close();
    rmSync(dir, { recursive: true, force: true, maxRetries: 8, retryDelay: 250 });
  });
});

describe('练习按用户隔离', () => {
  it('A 建的练习，B 读不到（404），列表互不可见', async () => {
    const attemptId = await makeAttempt('a'); // 管理员建并交卷（答错）
    const other = await registerAndLogin('同学乙', 'student-b@example.com');

    const forbidden = await app.inject({ method: 'GET', url: `/api/v1/attempts/${attemptId}`, headers: { cookie: other } });
    expect(forbidden.statusCode).toBe(404);
    const forbiddenResults = await app.inject({ method: 'GET', url: `/api/v1/attempts/${attemptId}/results`, headers: { cookie: other } });
    expect(forbiddenResults.statusCode).toBe(404);

    const listA = data(await api('GET', '/api/v1/attempts')) as Array<Record<string, unknown>>;
    expect(listA).toHaveLength(1);
    const listB = await app.inject({ method: 'GET', url: '/api/v1/attempts', headers: { cookie: other } });
    expect(((listB.json() as Record<string, unknown>)['data'] as unknown[])).toHaveLength(0);
  });
});

describe('错题自动收录', () => {
  it('答错收录、标记掌握、重答自动结清、再错重新激活', async () => {
    // 1. 答错 q1（正确答案 b）→ 错题本出现，附字母标签
    await makeAttempt('a');
    const list = data(await api('GET', '/api/v1/mistakes')) as Array<Record<string, unknown>>;
    expect(list).toHaveLength(1);
    expect(list[0]).toMatchObject({ picked: 'A', answer: 'B' });
    expect(list[0]['area']).toBe('未分类'); // 黄金样本未声明 section
    expect(String(list[0]['title'])).toContain('According to the first paragraph'); // stem 可读
    const mistakeId = list[0]!['id'] as string;

    // 2. 标记掌握 → 列表清空
    const resolved = await api('POST', `/api/v1/mistakes/${mistakeId}/resolve`);
    expect(resolved.status).toBe(200);
    expect((data(await api('GET', '/api/v1/mistakes')) as unknown[])).toHaveLength(0);

    // 3. 重答正确 → 保持已结清
    await makeAttempt('b');
    expect((data(await api('GET', '/api/v1/mistakes')) as unknown[])).toHaveLength(0);

    // 4. 再答错 → 重新激活且 wrong_count 累加
    await makeAttempt('a');
    const again = data(await api('GET', '/api/v1/mistakes')) as Array<Record<string, unknown>>;
    expect(again).toHaveLength(1);
    expect(again[0]!['wrong_count']).toBe(2);
  });
});

describe('学习数据接口', () => {
  it('打卡幂等；任务增删改；概览汇总', async () => {
    // 打卡
    const today = new Date();
    const date = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
    const c1 = data(await api('POST', '/api/v1/checkins', { date })) as { dates: string[] };
    expect(c1.dates).toContain(date);
    const c2 = data(await api('POST', '/api/v1/checkins', { date })) as { dates: string[] };
    expect(c2.dates.filter((d) => d === date)).toHaveLength(1);

    // 任务
    const task = data(await api('POST', '/api/v1/tasks', { title: '精读一篇阅读', category: 'reading', date, minutes: 25 })) as { id: string };
    const patched = await api('PATCH', `/api/v1/tasks/${task.id}`, { done: true });
    expect(patched.status).toBe(200);
    let tasks = data(await api('GET', '/api/v1/tasks')) as Array<Record<string, unknown>>;
    expect(tasks).toHaveLength(1);
    expect(tasks[0]).toMatchObject({ title: '精读一篇阅读', done: true, minutes: 25 });

    // 别人的任务删不掉
    const other = await registerAndLogin('同学丙', 'student-c@example.com');
    const gone = await app.inject({ method: 'DELETE', url: `/api/v1/tasks/${task.id}`, headers: { cookie: other } });
    expect(gone.statusCode).toBe(404);

    // 概览：答题量/打卡/最近练习
    await makeAttempt('b'); // 答对，不产生错题
    const ov = data(await api('GET', '/api/v1/overview')) as Record<string, unknown>;
    expect(ov['daily']).toMatchObject({ date, target: 20 });
    expect((ov['checkins'] as string[])).toContain(date);
    const recent = ov['recent'] as Array<Record<string, unknown>>;
    expect(recent).toHaveLength(1);
    expect(recent[0]).toMatchObject({ state: 'submitted', correct: 1, total_graded: 1 });
    const series = ov['series'] as { counts: number[]; accuracy: Array<number | null> };
    expect(series.counts).toHaveLength(30);
    expect(series.counts[29]).toBe(1);
    expect(series.accuracy[29]).toBe(100);
    expect((ov['learning_dates'] as string[])).toContain(date);

    // 删除任务
    const del = await api('DELETE', `/api/v1/tasks/${task.id}`);
    expect(del.status).toBe(200);
    tasks = data(await api('GET', '/api/v1/tasks')) as Array<Record<string, unknown>>;
    expect(tasks).toHaveLength(0);
  });

  it('资料读写：昵称与偏好', async () => {
    const p1 = data(await api('GET', '/api/v1/profile')) as Record<string, unknown>;
    expect(p1).toMatchObject({ username: 'admin', exam: '英语一', daily_target: 20 });
    const p2 = await api('PUT', '/api/v1/profile', { nickname: '阿诺', exam: '英语二', daily_target: 30, target_date: '2027-12-19' });
    expect(p2.status).toBe(200);
    const p3 = data(await api('GET', '/api/v1/profile')) as Record<string, unknown>;
    expect(p3).toMatchObject({ nickname: '阿诺', exam: '英语二', daily_target: 30, target_date: '2027-12-19' });
    const bad = await api('PUT', '/api/v1/profile', { daily_target: 0 });
    expect(bad.status).toBe(400);
  });
});

function loginHeader(raw: unknown): string {
  const header = Array.isArray(raw) ? raw.join('\n') : raw ?? '';
  return header.split(';')[0]?.trim() ?? '';
}
