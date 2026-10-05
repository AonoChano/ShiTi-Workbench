import Fastify, { type FastifyInstance, type FastifyReply, type FastifyRequest } from 'fastify';
import fastifyStatic from '@fastify/static';
import { createReadStream, existsSync, statSync } from 'node:fs';
import { join, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  parseImport,
  uuidv7,
  REPORT_SCHEMA_VERSION,
  type Answer,
  type QuestionType,
} from '@shiti/shared';
import { openWorkspace, sha256Stable, type DbHandle } from './db.js';
import { runQueuedJobOnce, loadAttemptItems, timingSummaryFor, snapshotAndGrade } from './report-service.js';
import { scanBank, listBankStatus } from './bank.js';
import { createSetFromPayload } from './content-service.js';
import { drillFacets, buildDrill, normalizeSection } from './practice-service.js';
import { ensureAgentPackage } from './agent-workspace.js';
import { addSseClient, removeSseClient, listExternalReview, reviewCheckNow } from './review-service.js';
import {
  ADMIN_ID,
  AuthError,
  attemptLogin,
  clearedSessionCookie,
  createSession,
  destroySession,
  ensureAdminUser,
  readPreferences,
  registerUser,
  resolveSession,
  readSessionCookie,
  sessionCookie,
  updatePreferences,
  type SessionUser,
  type UserPreferences,
} from './auth-service.js';
import { badRequest, conflict, fail, HttpError, notFound, nowIso, ok, unprocessable } from './util.js';

const LEASE_MS = 30_000;

declare module 'fastify' {
  interface FastifyRequest {
    /** 鉴权钩子填充；公开端点（/health、/auth/*）上为空 */
    user?: SessionUser;
  }
}

export interface BuildOptions {
  dataDir: string;
  bankDir?: string;
  /** 试卷资源根目录（TestPaper），题目 images 相对路径只能落在此目录（或题库目录）内 */
  papersDir?: string;
  serveWebDist?: boolean;
  port?: number;
  /** 管理员种子密码（SHITI_ADMIN_PASSWORD）；缺省时随机生成并落盘 admin-credentials.txt */
  adminPassword?: string;
}

/** 主观题在库里以空数组存储选项位；对外一律归一为 null，前端据此区分选项题/作答题。 */
function parseOptionsJson(json: string): Array<{ id: string; text: string }> | null {
  const arr = JSON.parse(json) as Array<{ id: string; text: string }> | null;
  return Array.isArray(arr) && arr.length > 0 ? arr : null;
}

function parseImagesJson(json: string | null): string[] | null {
  if (!json) return null;
  try {
    const arr = JSON.parse(json) as unknown;
    return Array.isArray(arr) && arr.length > 0 ? arr.map(String) : null;
  } catch {
    return null;
  }
}

interface SetSection { id: string; part?: string; title: string; directions?: string[] }

function parseSectionsJson(json: string | null): SetSection[] {
  if (!json) return [];
  try {
    const arr = JSON.parse(json) as unknown;
    return Array.isArray(arr) ? (arr as SetSection[]) : [];
  } catch {
    return [];
  }
}

const IMAGE_MIME: Record<string, string> = { '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.gif': 'image/gif', '.webp': 'image/webp', '.svg': 'image/svg+xml' };

/** 本地日期（服务器时区 = 用户机器时区；与打卡/学习计划的 YYYY-MM-DD 一致） */
function todayLocal(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/** 把作答/参考答案渲染成给人看的标签：选项题出字母，判断题出 T/F，其余原样 */
function answerLabel(answer: unknown, options: Array<{ id: string; text: string }> | null): string | null {
  if (!answer || typeof answer !== 'object') return null;
  const a = answer as Record<string, unknown>;
  if (Array.isArray(a['selected_option_ids'])) {
    const ids = a['selected_option_ids'] as string[];
    if (options) {
      return ids.map((id) => {
        const idx = options.findIndex((o) => o.id === id);
        return idx >= 0 ? String.fromCharCode(65 + idx) : id;
      }).join(', ');
    }
    return ids.join(', ');
  }
  if (typeof a['value'] === 'boolean') return a['value'] ? 'T' : 'F';
  if (Array.isArray(a['blanks'])) return (a['blanks'] as Array<{ text?: string }>).map((b) => String(b.text ?? '')).filter(Boolean).join(' ｜ ') || null;
  if (typeof a['text'] === 'string' && a['text']) return a['text'];
  return null;
}

/**
 * 交卷事务内调用：判分错的客观题按 (user, question) 聚合进错题本（答错重新激活），
 * 答对的自动结清。无参考答案的题跳过（无法对照）。
 */
function collectMistakes(
  h: DbHandle,
  attemptId: string,
  userId: string,
  items: Array<{ attempt_item_id: string; question_id: string; question_version_id: string; type: string; correctness: string | null }>,
  submittedIso: string,
): void {
  const itemStmt = h.db.prepare('SELECT snapshot_json FROM attempt_items WHERE id = ?');
  const snapStmt = h.db.prepare('SELECT submitted_answer_json FROM answer_snapshots WHERE attempt_item_id = ?');
  const upsert = h.db.prepare(
    `INSERT INTO mistake_book (id, user_id, question_id, question_version_id, attempt_id, attempt_item_id, type, section, stem, options_json, my_answer_json, answer_key_json, explanation, wrong_count, resolved, first_wrong_at, last_wrong_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, 0, ?, ?)
     ON CONFLICT(user_id, question_id) DO UPDATE SET
       question_version_id = excluded.question_version_id, attempt_id = excluded.attempt_id, attempt_item_id = excluded.attempt_item_id,
       type = excluded.type, section = excluded.section, stem = excluded.stem, options_json = excluded.options_json,
       my_answer_json = excluded.my_answer_json, answer_key_json = excluded.answer_key_json, explanation = excluded.explanation,
       wrong_count = wrong_count + 1, resolved = 0, last_wrong_at = excluded.last_wrong_at`,
  );
  const resolve = h.db.prepare("UPDATE mistake_book SET resolved = 1 WHERE user_id = ? AND question_id = ? AND resolved = 0");
  for (const it of items) {
    if (it.correctness === 'correct') {
      resolve.run(userId, it.question_id);
      continue;
    }
    if (it.correctness !== 'incorrect' && it.correctness !== 'partial') continue;
    const itemRow = itemStmt.get(it.attempt_item_id) as { snapshot_json: string } | undefined;
    if (!itemRow) continue;
    const snapshot = JSON.parse(itemRow.snapshot_json) as { stem: string; options: Array<{ id: string; text: string }> | null; section?: string | null; answer_key: unknown; explanation: string | null };
    if (snapshot.answer_key == null) continue;
    const snapRow = snapStmt.get(it.attempt_item_id) as { submitted_answer_json: string | null } | undefined;
    upsert.run(
      `mb-${it.attempt_item_id}`, userId, it.question_id, it.question_version_id, attemptId, it.attempt_item_id,
      it.type, snapshot.section ?? null, snapshot.stem,
      snapshot.options ? JSON.stringify(snapshot.options) : null,
      snapRow?.submitted_answer_json ?? null,
      JSON.stringify(snapshot.answer_key), snapshot.explanation,
      submittedIso, submittedIso,
    );
  }
}

export async function buildApp(opts: BuildOptions): Promise<FastifyInstance & { h: DbHandle; runWorkerOnce: () => 'idle' | 'ran'; rescanBank: () => ReturnType<typeof scanBank> }> {
  const h = openWorkspace(opts.dataDir);
  const bankDir = opts.bankDir ?? null;
  const app = Fastify({ bodyLimit: 12 * 1024 * 1024, trustProxy: false, logger: { level: 'error' } }) as unknown as FastifyInstance & { h: DbHandle; runWorkerOnce: () => 'idle' | 'ran'; rescanBank: () => ReturnType<typeof scanBank> };
  app.h = h;
  // 管理员种子：首次启动创建固定 id 的管理员账号，存量数据经迁移默认值归属该账号
  const seeded = ensureAdminUser(h, opts.adminPassword);
  if (seeded.created && !opts.adminPassword) {
    app.log.warn(`管理员账号已初始化，随机密码见：${seeded.credentialsFile ?? '<写入失败，请用 SHITI_ADMIN_PASSWORD 重置>'}`);
  }
  app.runWorkerOnce = () => runQueuedJobOnce(h);
  app.rescanBank = () => (bankDir ? scanBank(h, bankDir) : { scanned: 0, imported: 0, changed: 0, errors: 0, skipped: 0, failures: [] });

  /** 这些端点匿名可达：健康检查 + 认证入口本身 */
  const PUBLIC_API = new Set([
    '/api/v1/health',
    '/api/v1/auth/login',
    '/api/v1/auth/register',
    '/api/v1/auth/password/forgot',
  ]);

  app.addHook('onRequest', async (req, reply) => {
    // 同源即放行（Chromium 对同源子资源也可能带 Origin 头）；带 Origin 但主机不匹配 → 拒绝
    const origin = req.headers.origin;
    if (origin) {
      try {
        if (new URL(origin).host !== req.headers.host) {
          return fail(reply, 403, 'ORIGIN_NOT_ALLOWED', '该来源不被本机服务允许');
        }
      } catch {
        return fail(reply, 403, 'ORIGIN_NOT_ALLOWED', 'Origin 头无法解析');
      }
    }
    // API 鉴权：Cookie 会话；静态资源放行（其中的 API 调用各自受保护）
    const path = (req.raw.url ?? '').split('?')[0] ?? '';
    if (!path.startsWith('/api/') || PUBLIC_API.has(path)) return;
    const user = resolveSession(h, readSessionCookie(req));
    if (!user) return fail(reply, 401, 'UNAUTHORIZED', '请先登录后再继续');
    req.user = user;
  });

  app.addHook('onClose', async () => {
    h.db.close();
  });

  app.setErrorHandler((err, req, reply) => {
    if (err instanceof HttpError) {
      return fail(reply, err.status, err.code, err.message, err.extra);
    }
    if (err instanceof AuthError) {
      return fail(reply, err.status, err.code, err.message, err.fieldErrors ? { fieldErrors: err.fieldErrors } : undefined);
    }
    if ((err as { statusCode?: number }).statusCode === 413) {
      return fail(reply, 413, 'TOO_LARGE', '请求体超过限制');
    }
    req.log.error(err);
    return fail(reply, 500, 'INTERNAL', '服务内部错误');
  });

  /** 幂等包装：同 key 同端点重放返回首次响应（docs/02 §8.1）。 */
  async function withIdempotency(
    reply: import('fastify').FastifyReply,
    key: string | undefined,
    endpoint: string,
    fn: () => { status: number; body: unknown },
  ): Promise<import('fastify').FastifyReply> {
    if (!key) throw badRequest('IDEMPOTENCY_KEY_REQUIRED', '此操作需要 Idempotency-Key 头');
    const wsId = 'ws-default';
    const hit = h.db.prepare('SELECT * FROM idempotency_keys WHERE key = ? AND endpoint = ?').get(key, endpoint) as
      | { status_code: number; response_json: string } | undefined;
    if (hit) return reply.code(hit.status_code).send(JSON.parse(hit.response_json));
    const { status, body } = fn();
    h.db
      .prepare('INSERT OR IGNORE INTO idempotency_keys (key, workspace_id, endpoint, status_code, response_json, created_at) VALUES (?, ?, ?, ?, ?, ?)')
      .run(key, wsId, endpoint, status, JSON.stringify(body), nowIso());
    return reply.code(status).send(body);
  }

  const getAttempt = (id: string) =>
    h.db.prepare('SELECT * FROM attempts WHERE id = ?').get(id) as
      | { id: string; workspace_id: string; user_id: string; set_version_id: string; mode: 'training' | 'timed'; state: string; started_at: string | null; submitted_at: string | null; item_order_json: string; revision: number; writer_epoch: number; lease_client: string | null; lease_until: number | null; created_at: string }
      | undefined;

  /** 练习按用户隔离：别人的练习一律按不存在处理（不泄露 id 存在性） */
  const getOwnedAttempt = (id: string, userId: string) => {
    const at = getAttempt(id);
    if (!at || at.user_id !== userId) throw notFound('练习不存在');
    return at;
  };

  const getSetVersion = (id: string) =>
    h.db.prepare('SELECT sv.*, s.title AS set_title, s.is_demo FROM question_set_versions sv JOIN question_sets s ON s.id = sv.set_id WHERE sv.id = ?').get(id) as
      | { id: string; set_id: string; version: number; entries_json: string; set_title: string; is_demo: number } | undefined;

  // ---------- 基础 ----------
  app.get('/api/v1/health', () => ({ data: { ready: true, version: '0.1.0' } }));

  // 题目配图：仅允许试卷资源目录/题库目录内的图片文件，防路径穿越
  const papersDir = opts.papersDir ?? (bankDir ? resolve(bankDir, '../../TestPaper') : null);
  app.get('/api/v1/paper-image', async (req, reply) => {
    const src = (req.query as { src?: string }).src;
    if (!src || typeof src !== 'string' || src.includes('\\') || src.startsWith('/') || src.split('/').includes('..') || /^[a-zA-Z]:/.test(src)) {
      throw badRequest('INVALID_IMAGE_PATH', '图片路径必须是相对路径');
    }
    const ext = src.slice(src.lastIndexOf('.')).toLowerCase();
    const mime = IMAGE_MIME[ext];
    if (!mime) throw badRequest('INVALID_IMAGE_PATH', '不支持的图片格式');
    const roots = [papersDir, bankDir].filter((r): r is string => typeof r === 'string');
    for (const root of roots) {
      const abs = resolve(root, src);
      if (!abs.startsWith(resolve(root) + sep)) continue;
      if (!existsSync(abs) || !statSync(abs).isFile()) continue;
      const stat = statSync(abs);
      if (stat.size > 20 * 1024 * 1024) throw unprocessable('IMAGE_TOO_LARGE', '图片超过 20MB 上限');
      reply.type(mime);
      return createReadStream(abs);
    }
    throw notFound('图片不存在：请确认 SHITI_PAPERS_DIR / TestPaper 目录位置');
  });

  app.get('/api/v1/workspace', async (_req, reply) => {
    const ws = h.db.prepare('SELECT * FROM workspace LIMIT 1').get() as { id: string; name: string; timezone: string };
    return ok(reply, {
      id: ws.id, name: ws.name, timezone: ws.timezone,
      data_dir: h.dataDir, // 本机用户需要知道数据在哪（docs/01 §3：可复制路径）
      data_dir_basis: '数据保存在此电脑；清理浏览器不会删除已保存记录',
    });
  });

  // ---------- 认证 ----------

  app.post('/api/v1/auth/login', async (req, reply) => {
    const body = req.body as { account?: unknown; password?: unknown; remember?: unknown } | null;
    const account = typeof body?.['account'] === 'string' ? body['account'].trim() : '';
    const password = typeof body?.['password'] === 'string' ? body['password'] : '';
    const remember = body?.['remember'] === true;
    if (!account || !password) {
      throw new AuthError(422, 'VALIDATION_FAILED', '请输入账号和密码', !account ? { account: '请输入邮箱或用户名' } : { password: '请输入密码' });
    }
    const user = attemptLogin(h, account, password);
    const { token } = createSession(h, user.id, remember, req.headers['user-agent']);
    h.db.prepare('DELETE FROM auth_sessions WHERE expires_at_ms < ?').run(Date.now()); // 顺手清理过期会话
    reply.header('set-cookie', sessionCookie(token, remember));
    return ok(reply, { user });
  });

  app.post('/api/v1/auth/register', async (req, reply) => {
    const body = req.body as { nickname?: unknown; email?: unknown; password?: unknown } | null;
    const user = registerUser(h, {
      nickname: String(body?.['nickname'] ?? ''),
      email: String(body?.['email'] ?? ''),
      password: String(body?.['password'] ?? ''),
    });
    const { token } = createSession(h, user.id, true, req.headers['user-agent']);
    reply.header('set-cookie', sessionCookie(token, true));
    return reply.code(201).send({ data: { user }, meta: { request_id: reply.request.id } });
  });

  app.post('/api/v1/auth/password/forgot', async (_req, reply) => {
    // 本部署未配置邮件服务：如实告知，而不是假装发送成功（避免用户苦等一封不存在的邮件）
    return fail(reply, 503, 'EMAIL_NOT_CONFIGURED', '此部署未配置邮件服务，请联系管理员重置密码。');
  });

  app.get('/api/v1/auth/me', async (req, reply) => ok(reply, { user: req.user }));

  app.post('/api/v1/auth/logout', async (req, reply) => {
    destroySession(h, readSessionCookie(req));
    reply.header('set-cookie', clearedSessionCookie);
    return ok(reply, { ok: true });
  });

  // ---------- 个人资料与偏好 ----------

  app.get('/api/v1/profile', async (req, reply) => {
    const row = h.db.prepare('SELECT id, username, email, nickname, role, preferences_json, created_at FROM users WHERE id = ?')
      .get(req.user!.id) as { id: string; username: string; email: string; nickname: string; role: string; preferences_json: string; created_at: string };
    const prefs = readPreferences(row.preferences_json);
    return ok(reply, {
      id: row.id, username: row.username, email: row.email, nickname: row.nickname, role: row.role, created_at: row.created_at,
      exam: prefs.exam ?? '英语一',
      daily_target: prefs.daily_target ?? 20,
      target_date: prefs.target_date ?? null,
    });
  });

  app.put('/api/v1/profile', async (req, reply) => {
    const body = req.body as Record<string, unknown> | null;
    const patch: { nickname?: string } & UserPreferences = {};
    if (body?.['nickname'] !== undefined) {
      const nickname = String(body['nickname']).trim();
      if (nickname.length < 1 || nickname.length > 16) throw badRequest('INVALID_NICKNAME', '昵称需要 1–16 个字符');
      patch.nickname = nickname;
    }
    if (body?.['exam'] !== undefined) {
      const exam = String(body['exam']);
      if (exam !== '英语一' && exam !== '英语二') throw badRequest('INVALID_EXAM', '备考科目只能是英语一或英语二');
      patch.exam = exam;
    }
    if (body?.['daily_target'] !== undefined) {
      const n = Number(body['daily_target']);
      if (!Number.isInteger(n) || n < 1 || n > 500) throw badRequest('INVALID_DAILY_TARGET', '每日目标需要是 1–500 的整数');
      patch.daily_target = n;
    }
    if (body?.['target_date'] !== undefined) {
      const d = String(body['target_date']);
      if (!/^\d{4}-\d{2}-\d{2}$/.test(d)) throw badRequest('INVALID_TARGET_DATE', '目标日期格式应为 YYYY-MM-DD');
      patch.target_date = d;
    }
    if (patch.nickname) {
      h.db.prepare('UPDATE users SET nickname = ?, updated_at = ? WHERE id = ?').run(patch.nickname, nowIso(), req.user!.id);
    }
    const prefs = updatePreferences(h, req.user!.id, patch);
    return ok(reply, { saved: true, exam: prefs.exam ?? '英语一', daily_target: prefs.daily_target ?? 20, target_date: prefs.target_date ?? null });
  });

  // ---------- 导入 ----------
  app.post('/api/v1/imports', async (req, reply) => {
    const body = req.body as { content?: unknown } | null;
    if (!body || typeof body['content'] !== 'string') {
      throw badRequest('INVALID_BODY', '请求体必须是 {"content": "<JSON 文本>"}');
    }
    const parsed = parseImport(body['content']);
    const id = uuidv7();
    const now = nowIso();
    const contentHash = sha256Stable(body['content']);
    h.db.prepare(
      "INSERT INTO import_sessions (id, workspace_id, status, draft_json, issues_json, parser_version, content_hash, created_at, updated_at) VALUES (?, ?, 'needs_review', ?, ?, ?, ?, ?, ?)",
    ).run(id, 'ws-default', JSON.stringify(parsed.payload), JSON.stringify(parsed.issues), parsed.parser_version, contentHash, now, now);
    return ok(reply, {
      import_id: id,
      status: 'needs_review',
      question_count: parsed.question_count,
      error_count: parsed.error_count,
      warning_count: parsed.warning_count,
      issues: parsed.issues,
    });
  });

  app.get('/api/v1/imports/:id', async (req, reply) => {
    const { id } = req.params as { id: string };
    const row = h.db.prepare('SELECT * FROM import_sessions WHERE id = ?').get(id) as
      | { id: string; status: string; draft_json: string; issues_json: string; committed_set_version_id: string | null; revision: number } | undefined;
    if (!row) throw notFound('导入会话不存在');
    return ok(reply, {
      import_id: row.id, status: row.status, revision: row.revision,
      payload: JSON.parse(row.draft_json), issues: JSON.parse(row.issues_json),
      committed_set_version_id: row.committed_set_version_id,
    });
  });

  app.post('/api/v1/imports/:id/commit', async (req, reply) => {
    const { id } = req.params as { id: string };
    const key = req.headers['idempotency-key'] as string | undefined;
    return withIdempotency(reply, key, `imports/${id}/commit`, () => {
      const session = h.db.prepare('SELECT * FROM import_sessions WHERE id = ?').get(id) as
        | { id: string; status: string; draft_json: string; issues_json: string; revision: number } | undefined;
      if (!session) throw notFound('导入会话不存在');
      if (session.status === 'committed') {
        const row = h.db.prepare('SELECT committed_set_version_id FROM import_sessions WHERE id = ?').get(id) as { committed_set_version_id: string };
        return { status: 200, body: { data: { set_version_id: row.committed_set_version_id, already_committed: true } } };
      }
      if (session.status !== 'needs_review') throw conflict('IMPORT_STATE', `导入会话状态为 ${session.status}，不能提交`);
      const payload = JSON.parse(session.draft_json);
      if (!payload) throw unprocessable('IMPORT_HAS_ERRORS', '导入内容存在错误，需修正后重新导入');
      const issues = JSON.parse(session.issues_json) as Array<{ level: string; code: string }>;
      const warnings = issues.filter((i) => i.level === 'warning');
      const confirmed = (req.body as { confirmed_warnings?: string[] } | null)?.confirmed_warnings ?? [];
      const unacked = warnings.filter((w) => !confirmed.includes(w.code));
      if (unacked.length > 0) {
        throw unprocessable('WARNINGS_UNCONFIRMED', '存在需要你明确确认的警告', { unconfirmed: unacked.map((w) => w.code) });
      }

      const now = nowIso();
      const result = h.db.transaction(() =>
        createSetFromPayload(h, payload as never, { now }),
      )();
      h.db.prepare("UPDATE import_sessions SET status = 'committed', committed_set_version_id = ?, revision = revision + 1, updated_at = ? WHERE id = ?")
        .run(result.set_version_id, now, id);
      return { status: 200, body: { data: result } };
    });
  });

  // ---------- 题库目录自动识别 ----------
  app.post('/api/v1/bank/scan', async (_req, reply) => {
    const summary = app.rescanBank();
    return ok(reply, { ...summary, status: listBankStatus(h) });
  });

  app.get('/api/v1/bank/status', async (_req, reply) => {
    return ok(reply, { files: listBankStatus(h), bank_enabled: bankDir !== null });
  });

  // ---------- 题库 ----------
  app.get('/api/v1/sets', async (req, reply) => {
    // 只列正常试卷（kind='paper'）；专项练习抽题生成的内部题集不出现在题库列表
    const rows = h.db.prepare("SELECT * FROM question_sets WHERE kind = 'paper' AND archived_at IS NULL ORDER BY updated_at DESC, id DESC LIMIT 100").all() as Array<{ id: string; title: string; current_version_id: string; is_demo: number; updated_at: string }>;
    const sets = rows;
    const countStmt = h.db.prepare('SELECT COUNT(*) AS n FROM question_set_versions WHERE id = ?');
    const list = sets.map((s) => {
      const sv = h.db.prepare('SELECT entries_json FROM question_set_versions WHERE id = ?').get(s.current_version_id) as { entries_json: string } | undefined;
      const entries = sv ? JSON.parse(sv.entries_json) as Array<{ question_version_id: string }> : [];
      const hasKeyStmt = h.db.prepare('SELECT answer_key_json FROM question_versions WHERE id = ?');
      const hasKey = entries.filter((e) => {
        const v = hasKeyStmt.get(e.question_version_id) as { answer_key_json: string | null } | undefined;
        return v?.answer_key_json != null;
      }).length;
      return { set_id: s.id, title: s.title, is_demo: s.is_demo === 1, question_count: entries.length, has_key_count: hasKey, updated_at: s.updated_at, current_version_id: s.current_version_id };
    });
    void countStmt;
    return ok(reply, list);
  });

  app.get('/api/v1/sets/:id', async (req, reply) => {
    const { id } = req.params as { id: string };
    const set = h.db.prepare('SELECT * FROM question_sets WHERE id = ?').get(id) as { id: string; title: string; current_version_id: string; is_demo: number; updated_at: string } | undefined;
    if (!set) throw notFound('题集不存在');
    const sv = h.db.prepare('SELECT * FROM question_set_versions WHERE id = ?').get(set.current_version_id) as { version: number; entries_json: string };
    const entries = JSON.parse(sv.entries_json) as Array<{ question_version_id: string; order: number }>;
    const qStmt = h.db.prepare('SELECT * FROM question_versions WHERE id = ?');
    const matStmt = h.db.prepare('SELECT * FROM materials WHERE id = ?');
    const questions = entries.map((e) => {
      const v = qStmt.get(e.question_version_id) as { question_id: string; type: QuestionType; stem: string; options_json: string; material_id: string | null; max_score_units: number; tags_json: string; answer_key_json: string | null };
      const mat = v.material_id ? matStmt.get(v.material_id) as { id: string; title: string } | undefined : undefined;
      return {
        question_id: v.question_id, order: e.order, type: v.type, stem: v.stem,
        options: parseOptionsJson(v.options_json),
        images: parseImagesJson((v as { images_json?: string | null }).images_json ?? null),
        section: (v as { section?: string | null }).section ?? null,
        material: mat ? { id: mat.id, title: mat.title } : null,
        max_score_units: v.max_score_units,
        has_answer_key: v.answer_key_json != null,
        tags: JSON.parse(v.tags_json) as string[],
      };
    });
    return ok(reply, {
      set_id: set.id, title: set.title, version: sv.version, is_demo: set.is_demo === 1, updated_at: set.updated_at,
      sections: parseSectionsJson((sv as { sections_json?: string | null }).sections_json ?? null),
      questions, // M1：题库详情不回传 answer_key/explanation（预览含答案属 M2）
    });
  });

  // ---------- 练习 ----------
  /** 由题集版本创建训练 Attempt（题目版本快照进入 attempt_items）。 */
  function createAttemptForVersion(setVersionId: string, mode: 'training', userId: string): { attempt_id: string; mode: string; state: string; server_time: number } {
    const sv = getSetVersion(setVersionId);
    if (!sv) throw notFound('题集版本不存在');
    const entries = JSON.parse(sv.entries_json) as Array<{ question_version_id: string; order: number }>;
    if (entries.length === 0) throw conflict('EMPTY_SET', '该题集没有已发布题目');

    const attemptId = uuidv7();
    const now = nowIso();
    const nowMs = Date.now();
    const tx = h.db.transaction(() => {
      h.db.prepare("INSERT INTO attempts (id, workspace_id, user_id, set_version_id, mode, state, item_order_json, created_at, updated_at) VALUES (?, ?, ?, ?, ?, 'draft', ?, ?, ?)")
        .run(attemptId, 'ws-default', userId, setVersionId, mode, JSON.stringify(entries.map((e) => e.order)), now, now);
      const itemStmt = h.db.prepare('INSERT INTO attempt_items (id, attempt_id, question_id, question_version_id, "order", snapshot_json, max_score_units) VALUES (?, ?, ?, ?, ?, ?, ?)');
      const qvStmt = h.db.prepare('SELECT * FROM question_versions WHERE id = ?');
      const matStmt = h.db.prepare('SELECT * FROM materials WHERE id = ?');
      for (const e of entries) {
        const v = qvStmt.get(e.question_version_id) as { id: string; question_id: string; type: QuestionType; stem: string; options_json: string; images_json?: string | null; material_id: string | null; answer_key_json: string | null; explanation: string | null; max_score_units: number; version: number };
        if (!v) throw unprocessable('QUESTION_VERSION_MISSING', '题集引用的题目版本缺失，请重建题集');
        const mat = v.material_id ? matStmt.get(v.material_id) as { id: string; title: string; blocks_json: string } | undefined : undefined;
        const snapshot = {
          type: v.type,
          stem: v.stem,
          options: parseOptionsJson(v.options_json),
          images: parseImagesJson(v.images_json ?? null),
          section: (v as { section?: string | null }).section ?? null,
          material_id: mat?.id ?? null,
          material_title: mat?.title ?? null,
          material_blocks: mat ? JSON.parse(mat.blocks_json) as Array<{ id: string; type: string; text: string }> : null,
          answer_key: v.answer_key_json ? JSON.parse(v.answer_key_json) : null,
          key_source: '题库参考（导入内容提供）',
          explanation: v.explanation,
          question_version: v.version,
          max_score_units: v.max_score_units,
        };
        const itemId = uuidv7();
        itemStmt.run(itemId, attemptId, v.question_id, v.id, e.order, JSON.stringify(snapshot), v.max_score_units);
      }
    });
    tx();
    return { attempt_id: attemptId, mode, state: 'draft', server_time: nowMs };
  }

  app.post('/api/v1/attempts', async (req, reply) => {
    const body = req.body as { set_version_id?: unknown; mode?: unknown } | null;
    const setVersionId = body?.['set_version_id'];
    const mode = body?.['mode'];
    if (typeof setVersionId !== 'string' || mode !== 'training') {
      throw mode === 'timed'
        ? unprocessable('MODE_NOT_SUPPORTED_M1', '严格限时模式将在 M2 提供，当前仅支持训练模式')
        : badRequest('INVALID_BODY', '请求体需要 { set_version_id, mode: "training" }');
    }
    return ok(reply, createAttemptForVersion(setVersionId, 'training', req.user!.id));
  });

  // 专项练习：按大题/题型从当前题库抽题，生成内部 drill 题集版本并直接建练习
  app.get('/api/v1/practice/facets', async (_req, reply) => ok(reply, { facets: drillFacets(h) }));

  app.post('/api/v1/attempts/practice', async (req, reply) => {
    const body = req.body as { section?: unknown; sections?: unknown; type?: unknown; count?: unknown } | null;
    const section = body?.['section'];
    const sections = body?.['sections'];
    const type = body?.['type'];
    const count = body?.['count'];
    if (section !== undefined && section !== null && typeof section !== 'string') throw badRequest('INVALID_BODY', 'section 必须是字符串');
    if (sections !== undefined && sections !== null && (!Array.isArray(sections) || !sections.every((s) => typeof s === 'string'))) throw badRequest('INVALID_BODY', 'sections 必须是字符串数组');
    if (type !== undefined && type !== null && typeof type !== 'string') throw badRequest('INVALID_BODY', 'type 必须是字符串');
    if (count !== undefined && count !== null && (!Number.isInteger(count) || (count as number) < 1 || (count as number) > 200)) {
      throw badRequest('INVALID_BODY', 'count 必须是 1–200 的整数');
    }
    const tx = h.db.transaction(() => buildDrill(h, { section: (section as string) ?? null, sections: (sections as string[]) ?? null, type: (type as string) ?? null, count: (count as number) ?? null }, { now: nowIso() }));
    const drill = tx();
    const created = createAttemptForVersion(drill.set_version_id, 'training', req.user!.id);
    return ok(reply, { attempt_id: created.attempt_id, mode: created.mode, state: created.state, question_count: drill.question_count, label: drill.label, type: drill.type, server_time: created.server_time });
  });

  app.post('/api/v1/attempts/:id/start', async (req, reply) => {
    const { id } = req.params as { id: string };
    const key = req.headers['idempotency-key'] as string | undefined;
    return withIdempotency(reply, key, `attempts/${id}/start`, () => {
      const at = getOwnedAttempt(id, req.user!.id);
      if (at.state === 'in_progress' || at.state === 'paused' || at.state === 'submitted' || at.state === 'abandoned') {
        return { status: 200, body: { data: { attempt_id: id, state: at.state, already_started: true, writer_epoch: at.writer_epoch } } };
      }
      const body = req.body as { expected_revision?: number; client_instance_id?: string } | null;
      if (!body || typeof body['client_instance_id'] !== 'string') throw badRequest('INVALID_BODY', '需要 client_instance_id');
      if (body['expected_revision'] !== at.revision) throw conflict('REVISION_CONFLICT', '练习状态已在别处更新', { conflict_revision: at.revision });
      const nowMs = Date.now();
      h.db.prepare("UPDATE attempts SET state = 'in_progress', started_at = ?, writer_epoch = 1, lease_client = ?, lease_until = ?, revision = revision + 1, updated_at = ? WHERE id = ?")
        .run(nowIso(), body['client_instance_id'], nowMs + LEASE_MS, nowIso(), id);
      return { status: 200, body: { data: { attempt_id: id, state: 'in_progress', writer_epoch: 1, lease_expires_at: nowMs + LEASE_MS, server_time: nowMs } } };
    });
  });

  app.get('/api/v1/attempts/:id', async (req, reply) => {
    const { id } = req.params as { id: string };
    const at = getOwnedAttempt(id, req.user!.id);
    if (at.state === 'submitted' || at.state === 'abandoned') {
      const sub = h.db.prepare('SELECT * FROM submissions WHERE attempt_id = ?').get(id) as { submitted_at: string } | undefined;
      const rep = h.db.prepare('SELECT id, version, status FROM report_revisions WHERE attempt_id = ? ORDER BY version DESC LIMIT 1').get(id) as { id: string; version: number; status: string } | undefined;
      return ok(reply, { attempt_id: id, state: at.state, submitted_at: sub?.submitted_at ?? null, latest_report: rep ?? null });
    }
      const sv = getSetVersion(at.set_version_id)!;
    const data = loadAttemptItems(h, id);
    return ok(reply, {
      attempt_id: id,
      state: at.state,
      mode: at.mode,
      set_title: sv.set_title,
      sections: parseSectionsJson((sv as { sections_json?: string | null }).sections_json ?? null),
      revision: at.revision,
      writer_epoch: at.writer_epoch,
      lease_expires_at: at.lease_until,
      started_at: at.started_at,
      server_time: Date.now(),
      items: data.map((d) => ({
        attempt_item_id: d.row.id,
        order: d.row.order,
        type: d.snapshot.type,
        stem: d.snapshot.stem,
        options: d.snapshot.options,
        images: (d.snapshot as { images?: string[] | null }).images ?? null,
        section: (d.snapshot as { section?: string | null }).section ?? null,
        max_score_units: d.row.max_score_units,
        has_answer_key: d.snapshot.answer_key !== null && d.snapshot.answer_key !== undefined,
        material: d.snapshot.material_id
          ? { id: d.snapshot.material_id, title: d.snapshot.material_title, blocks: d.snapshot.material_blocks }
          : null,
        // PracticeDTO 白名单：绝不包含 answer_key / explanation（docs/02 §8.2 末段）
        draft: d.draft ? { answer: d.draft.answer, confidence: d.draft.confidence, reasoning: d.draft.reasoning, flagged: d.draft.flagged, revision: d.draft.revision } : null,
      })),
    });
  });

  app.post('/api/v1/attempts/:id/lease', async (req, reply) => {
    const { id } = req.params as { id: string };
    const at = getOwnedAttempt(id, req.user!.id);
    if (at.state !== 'in_progress' && at.state !== 'paused') throw conflict('ATTEMPT_STATE', `状态 ${at.state} 不能持有写租约`);
    const body = req.body as { client_instance_id?: string; takeover?: boolean } | null;
    if (!body || typeof body['client_instance_id'] !== 'string') throw badRequest('INVALID_BODY', '需要 client_instance_id');
    if (body['takeover'] === true) throw unprocessable('TAKEOVER_M2', '多标签页接管将在 M2 提供');
    const nowMs = Date.now();
    if (at.lease_client && at.lease_client !== body['client_instance_id'] && (at.lease_until ?? 0) > nowMs) {
      throw conflict('LEASE_LOST', '另一个页面正在作答', { current_holder: true });
    }
    const epoch = at.lease_client === body['client_instance_id'] ? at.writer_epoch : at.writer_epoch + 1;
    h.db.prepare('UPDATE attempts SET writer_epoch = ?, lease_client = ?, lease_until = ?, updated_at = ? WHERE id = ?')
      .run(epoch, body['client_instance_id'], nowMs + LEASE_MS, nowIso(), id);
    return ok(reply, { writer_epoch: epoch, lease_expires_at: nowMs + LEASE_MS, server_time: nowMs });
  });

  app.post('/api/v1/attempts/:id/actions', async (req, reply) => {
    const { id } = req.params as { id: string };
    const at = getOwnedAttempt(id, req.user!.id);
    const body = req.body as {
      writer_epoch?: number;
      actions?: Array<{
        action_id?: string; client_seq?: number; attempt_item_id?: string;
        expected_draft_revision?: number; event_type?: string; changed_fields?: Record<string, unknown>; occurred_at?: string;
      }>;
    } | null;
    if (!body || typeof body['writer_epoch'] !== 'number' || !Array.isArray(body['actions']) || body['actions'].length === 0) {
      throw badRequest('INVALID_BODY', '需要 { writer_epoch, actions[] }（单批最多 50 条）');
    }
    if (body['actions'].length > 50) throw badRequest('TOO_MANY_ACTIONS', '单批最多 50 条动作');
    const actions = body['actions'];
    if (body['writer_epoch'] !== at.writer_epoch) throw conflict('LEASE_LOST', '写租约已变化，请刷新', { conflict_revision: at.revision });

    const nowMs = Date.now();
    const results: Array<Record<string, unknown>> = [];
    const blockedItems = new Set<string>();
    const getItem = h.db.prepare('SELECT id FROM attempt_items WHERE attempt_id = ? AND id = ?');
    const getDraft = h.db.prepare('SELECT revision FROM answer_drafts WHERE attempt_item_id = ?');
    const getDraftFull = h.db.prepare('SELECT answer_json, confidence, reasoning, flagged FROM answer_drafts WHERE attempt_item_id = ?');
    const putDraft = h.db.prepare(
      'INSERT OR REPLACE INTO answer_drafts (attempt_item_id, answer_json, confidence, reasoning, flagged, revision, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)',
    );
    const closeOpen = h.db.prepare('UPDATE timing_segments SET end_at = ? WHERE attempt_id = ? AND end_at IS NULL');
    const openSeg = h.db.prepare('INSERT INTO timing_segments (attempt_id, item_id, kind, start_at) VALUES (?, ?, ?, ?)');
    const insertAction = h.db.prepare(
      'INSERT INTO client_actions (attempt_id, action_id, client_seq, attempt_item_id, expected_draft_revision, event_type, payload_json, ack_json, received_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
    );
    const existingAction = h.db.prepare('SELECT payload_json, ack_json FROM client_actions WHERE attempt_id = ? AND action_id = ?');

    const tx = h.db.transaction(() => {
      for (const a of actions) {
        if (!a || typeof a['action_id'] !== 'string' || typeof a['event_type'] !== 'string') {
          results.push({ action_id: String(a?.['action_id'] ?? ''), ok: false, error_code: 'INVALID_ACTION', message: '动作缺少 action_id 或 event_type' });
          continue;
        }
        const prev = existingAction.get(id, a['action_id']) as { payload_json: string; ack_json: string } | undefined;
        if (prev) {
          if (prev.payload_json === sha256Stable(a)) {
            results.push(JSON.parse(prev.ack_json));
          } else {
            results.push({ action_id: a['action_id'], ok: false, error_code: 'IDEMPOTENCY_CONFLICT', message: '同一动作 ID 携带了不同内容' });
          }
          continue;
        }
        let ack: Record<string, unknown>;
        if (at.state !== 'in_progress') {
          ack = { action_id: a['action_id'], ok: false, error_code: 'ATTEMPT_NOT_ACTIVE', message: `当前状态 ${at.state} 不能作答` };
        } else if (a['event_type'] === 'heartbeat') {
          ack = { action_id: a['action_id'], ok: true };
        } else if (a['event_type'] === 'item_focused' || a['event_type'] === 'material_focused') {
          closeOpen.run(nowMs, id);
          openSeg.run(id, a['event_type'] === 'item_focused' ? a['attempt_item_id'] ?? null : null, a['event_type'] === 'item_focused' ? 'item' : 'material', nowMs);
          ack = { action_id: a['action_id'], ok: true };
        } else if (['answer_changed', 'confidence_changed', 'reasoning_changed', 'flag_changed', 'draft_changed'].includes(a['event_type'])) {
          const itemId = a['attempt_item_id'];
          if (!itemId || !getItem.get(id, itemId)) {
            ack = { action_id: a['action_id'], ok: false, error_code: 'ITEM_NOT_FOUND', message: '题目不属于本次练习' };
          } else if (blockedItems.has(itemId)) {
            ack = { action_id: a['action_id'], ok: false, error_code: 'HALTED_AFTER_CONFLICT', message: '同题前序动作冲突，本条未应用' };
          } else {
            const cur = getDraft.get(itemId) as { revision: number } | undefined;
            const currentRev = cur?.revision ?? 0;
            if ((a['expected_draft_revision'] ?? 0) !== currentRev) {
              blockedItems.add(itemId);
              ack = { action_id: a['action_id'], ok: false, error_code: 'REVISION_CONFLICT', message: '草稿版本冲突，请刷新题目', conflict_revision: currentRev };
            } else {
              const cf = a['changed_fields'] ?? {};
              const existing = getDraftFull.get(itemId) as
                | { answer_json: string | null; confidence: string | null; reasoning: string | null; flagged: number } | undefined;
              const nextAnswer = 'answer' in cf ? (cf['answer'] ?? null) : existing?.answer_json ? JSON.parse(existing.answer_json) as Answer : null;
              const nextConfidence = 'confidence' in cf ? (cf['confidence'] ?? null) : existing?.confidence ?? null;
              const nextReasoning = 'reasoning' in cf ? (cf['reasoning'] ?? null) : existing?.reasoning ?? null;
              const nextFlagged = 'flagged' in cf ? Boolean(cf['flagged']) : (existing?.flagged ?? 0) === 1;
              putDraft.run(
                itemId,
                nextAnswer === null ? null : JSON.stringify(nextAnswer),
                nextConfidence,
                nextReasoning,
                nextFlagged ? 1 : 0,
                currentRev + 1,
                nowIso(),
              );
              ack = { action_id: a['action_id'], ok: true, accepted_revision: currentRev + 1, saved_at: nowIso() };
            }
          }
        } else {
          ack = { action_id: a['action_id'], ok: false, error_code: 'UNKNOWN_EVENT', message: `未知事件类型 ${a['event_type']}` };
        }
        insertAction.run(id, a['action_id'], a['client_seq'] ?? 0, a['attempt_item_id'] ?? null, a['expected_draft_revision'] ?? null, a['event_type'], sha256Stable(a), JSON.stringify(ack), nowIso());
        results.push(ack);
      }
      h.db.prepare('UPDATE attempts SET lease_until = ?, updated_at = ? WHERE id = ?').run(nowMs + LEASE_MS, nowIso(), id);
    });
    tx();
    return ok(reply, { results }, { server_time: nowMs });
  });

  app.post('/api/v1/attempts/:id/pause', async (req, reply) => {
    const { id } = req.params as { id: string };
    return pauseResume(id, req, reply, 'pause');
  });
  app.post('/api/v1/attempts/:id/resume', async (req, reply) => {
    const { id } = req.params as { id: string };
    return pauseResume(id, req, reply, 'resume');
  });

  function pauseResume(id: string, req: import('fastify').FastifyRequest, reply: import('fastify').FastifyReply, kind: 'pause' | 'resume'): import('fastify').FastifyReply {
    const at = getOwnedAttempt(id, req.user!.id);
    const body = req.body as { writer_epoch?: number; expected_revision?: number } | null;
    if (!body || body['writer_epoch'] !== at.writer_epoch) throw conflict('LEASE_LOST', '写租约不匹配');
    if (body['expected_revision'] !== at.revision) throw conflict('REVISION_CONFLICT', '练习状态已在别处更新', { conflict_revision: at.revision });
    if (at.mode !== 'training') throw unprocessable('MODE_FORBIDS_PAUSE', '严格限时不允许暂停');
    const nowMs = Date.now();
    if (kind === 'pause') {
      if (at.state !== 'in_progress') throw conflict('ATTEMPT_STATE', '只有进行中的训练可暂停');
      h.db.transaction(() => {
        h.db.prepare('UPDATE timing_segments SET end_at = ? WHERE attempt_id = ? AND end_at IS NULL').run(nowMs, id);
        h.db.prepare('INSERT INTO timing_segments (attempt_id, item_id, kind, start_at, end_at) VALUES (?, NULL, ?, ?, NULL)').run(id, 'pause', nowMs);
        h.db.prepare("UPDATE attempts SET state = 'paused', revision = revision + 1, updated_at = ? WHERE id = ?").run(nowIso(), id);
      })();
    } else {
      if (at.state !== 'paused') throw conflict('ATTEMPT_STATE', '只有已暂停的练习可继续');
      h.db.transaction(() => {
        h.db.prepare('UPDATE timing_segments SET end_at = ? WHERE attempt_id = ? AND end_at IS NULL').run(nowMs, id);
        h.db.prepare("UPDATE attempts SET state = 'in_progress', revision = revision + 1, updated_at = ? WHERE id = ?").run(nowIso(), id);
      })();
    }
    const after = getAttempt(id)!;
    return ok(reply, { state: after.state, revision: after.revision, server_time: nowMs });
  }

  app.post('/api/v1/attempts/:id/submit', async (req, reply) => {
    const { id } = req.params as { id: string };
    const key = req.headers['idempotency-key'] as string | undefined;
    return withIdempotency(reply, key, `attempts/${id}/submit`, () => {
      const at = getOwnedAttempt(id, req.user!.id);
      const body = req.body as { expected_revision?: number } | null;
      if (at.state === 'submitted') {
        const sub = h.db.prepare('SELECT * FROM submissions WHERE attempt_id = ?').get(id) as { idempotency_key: string; submitted_at: string };
        const grade = h.db.prepare('SELECT id, version FROM grade_revisions WHERE attempt_id = ? ORDER BY version DESC LIMIT 1').get(id) as { id: string; version: number };
        const rep = h.db.prepare('SELECT id FROM report_revisions WHERE attempt_id = ? ORDER BY version DESC LIMIT 1').get(id) as { id: string };
        return { status: 200, body: { data: { attempt_id: id, state: 'submitted', submission: { submitted_at: sub.submitted_at }, grade_revision_id: grade.id, report_revision_id: rep?.id ?? null, already_submitted: true } } };
      }
      if (at.state !== 'in_progress' && at.state !== 'paused') throw conflict('ATTEMPT_STATE', `状态 ${at.state} 不能交卷`);
      if (!body || body['expected_revision'] !== at.revision) throw conflict('REVISION_CONFLICT', '练习状态已在别处更新', { conflict_revision: at.revision });

      const nowMs = Date.now();
      const submittedIso = nowIso();
      let gradeRevId = '';
      let reportRevId = '';
      let jobId = '';
      const tx = h.db.transaction(() => {
        // 1-2. 状态/版本校验已完成；训练模式无 deadline
        // 3. 固化计时：关闭所有未闭合段
        h.db.prepare('UPDATE timing_segments SET end_at = ? WHERE attempt_id = ? AND end_at IS NULL').run(nowMs, id);
        // 快照 + 判分（纯函数，无外部 IO）
        const { items, aggregate, snapshotHash } = snapshotAndGrade(h, id);
        // 4. Submission
        h.db.prepare('INSERT INTO submissions (attempt_id, idempotency_key, submitted_at, reason, snapshot_hash, ack_revision) VALUES (?, ?, ?, ?, ?, ?)')
          .run(id, key ?? '', submittedIso, 'manual', snapshotHash, at.revision + 1);
        // 5. GradeRevision
        gradeRevId = uuidv7();
        h.db.prepare('INSERT INTO grade_revisions (id, attempt_id, version, rule_version, source, items_json, aggregate_json, created_at) VALUES (?, ?, 1, ?, ?, ?, ?, ?)')
          .run(gradeRevId, id, '1', 'system_rule', JSON.stringify(items), JSON.stringify(aggregate), submittedIso);
        // 6. ReportRevision + Job（同一事务）
        const inputHash = sha256Stable({ snapshot_hash: snapshotHash, grade_revision_id: gradeRevId, rule_version: '1' });
        reportRevId = uuidv7();
        h.db.prepare("INSERT INTO report_revisions (id, attempt_id, version, grade_revision_id, schema_version, export_profile, input_hash, generated_at, status, created_at) VALUES (?, ?, 1, ?, ?, 'full_review', ?, ?, 'queued', ?)")
          .run(reportRevId, id, gradeRevId, REPORT_SCHEMA_VERSION, inputHash, submittedIso, submittedIso);
        jobId = uuidv7();
        h.db.prepare("INSERT INTO jobs (id, type, status, payload_json, dedupe_key, next_run_at, created_at, updated_at) VALUES (?, 'generate_report', 'queued', ?, ?, ?, ?, ?)")
          .run(jobId, JSON.stringify({ attempt_id: id, report_revision_id: reportRevId }), `report:${id}:v1`, nowMs, submittedIso, submittedIso);
        // 7. 状态
        h.db.prepare("UPDATE attempts SET state = 'submitted', submitted_at = ?, revision = revision + 1, updated_at = ? WHERE id = ?")
          .run(submittedIso, submittedIso, id);
        // 8. 错题自动收录：判分版答错的客观题进错题本，答对的自动结清（同一事务保证与判分一致）
        collectMistakes(h, id, req.user!.id, items, submittedIso);
      });
      tx();
      return {
        status: 200,
        body: { data: { attempt_id: id, state: 'submitted', submission: { submitted_at: submittedIso }, grade_revision_id: gradeRevId, report_revision_id: reportRevId, report_job_id: jobId } },
      };
    });
  });

  app.post('/api/v1/attempts/:id/abandon', async (req, reply) => {
    const { id } = req.params as { id: string };
    const at = getOwnedAttempt(id, req.user!.id);
    const body = req.body as { confirmation?: boolean; expected_revision?: number } | null;
    if (!body || body['confirmation'] !== true) throw badRequest('CONFIRMATION_REQUIRED', '放弃练习需要显式确认 confirmation=true');
    if (body['expected_revision'] !== at.revision) throw conflict('REVISION_CONFLICT', '练习状态已在别处更新', { conflict_revision: at.revision });
    if (at.state === 'submitted' || at.state === 'abandoned') throw conflict('ATTEMPT_STATE', `状态 ${at.state} 不能放弃`);
    h.db.prepare("UPDATE attempts SET state = 'abandoned', revision = revision + 1, updated_at = ? WHERE id = ?").run(nowIso(), id);
    return ok(reply, { attempt_id: id, state: 'abandoned' });
  });

  app.get('/api/v1/attempts', async (req, reply) => {
    const q = req.query as { state?: string; cursor?: string; limit?: string };
    const limit = Math.min(Math.max(Number(q['limit'] ?? 30), 1), 100);
    let sql = 'SELECT * FROM attempts';
    const where: string[] = ['user_id = ?'];
    const params: unknown[] = [req.user!.id];
    if (q['state']) { where.push('state = ?'); params.push(q['state']); }
    if (q['cursor']) {
      const [ts, id] = Buffer.from(q['cursor'], 'base64url').toString('utf8').split('|');
      where.push('(updated_at < ? OR (updated_at = ? AND id < ?))');
      params.push(ts, ts, id);
    }
    if (where.length) sql += ' WHERE ' + where.join(' AND ');
    sql += ' ORDER BY updated_at DESC, id DESC LIMIT ?';
    params.push(limit + 1);
    const rows = h.db.prepare(sql).all(...params) as Array<{ id: string; state: string; mode: string; set_version_id: string; updated_at: string }>;
    const hasMore = rows.length > limit;
    const page = rows.slice(0, limit);
    const titleStmt = h.db.prepare('SELECT title FROM question_sets WHERE id = (SELECT set_id FROM question_set_versions WHERE id = ?)');
    const data = page.map((r) => ({
      attempt_id: r.id, state: r.state, mode: r.mode,
      set_title: (titleStmt.get(r.set_version_id) as { title: string } | undefined)?.title ?? '',
      updated_at: r.updated_at,
    }));
    const last = page[page.length - 1];
    return ok(reply, data, {
      has_more: hasMore,
      cursor: hasMore && last ? Buffer.from(`${last.updated_at}|${last.id}`).toString('base64url') : null,
    });
  });

  // ---------- 结果 / 评分 / 报告 ----------
  app.get('/api/v1/attempts/:id/results', async (req, reply) => {
    const { id } = req.params as { id: string };
    const at = getOwnedAttempt(id, req.user!.id);
    if (at.state !== 'submitted') throw conflict('ATTEMPT_NOT_SUBMITTED', '练习尚未交卷，不能读取答案与评分');
    const grade = h.db.prepare('SELECT * FROM grade_revisions WHERE attempt_id = ? ORDER BY version DESC LIMIT 1').get(id) as { id: string; version: number; items_json: string; aggregate_json: string; rule_version: string };
    const data = loadAttemptItems(h, id);
    const scored = JSON.parse(grade.items_json) as Array<Record<string, unknown>>;
    const submittedMs = Date.parse(at.submitted_at ?? nowIso());
    const startedMs = Date.parse(at.started_at ?? nowIso());
    const timing = timingSummaryFor(h, id, startedMs, submittedMs);
    const rep = h.db.prepare('SELECT id, version, status, md_sha256 FROM report_revisions WHERE attempt_id = ? ORDER BY version DESC LIMIT 1').get(id) as { id: string; version: number; status: string; md_sha256: string | null } | undefined;
    const items = data.map((d) => {
      const sc = scored.find((x) => x['attempt_item_id'] === d.row.id)!;
      const snap = h.db.prepare('SELECT * FROM answer_snapshots WHERE attempt_item_id = ?').get(d.row.id) as { submitted_answer_json: string | null; confidence: string | null; reasoning: string | null; flagged: number } | undefined;
      return {
        order: d.row.order,
        attempt_item_id: d.row.id,
        question_id: d.row.question_id,
        type: d.snapshot.type,
        stem: d.snapshot.stem,
        options: d.snapshot.options,
        material: d.snapshot.material_id ? { id: d.snapshot.material_id, title: d.snapshot.material_title, blocks: d.snapshot.material_blocks } : null,
        my_answer: snap?.submitted_answer_json ? JSON.parse(snap.submitted_answer_json) as Answer : null,
        answer_key: d.snapshot.answer_key,
        key_source: d.snapshot.key_source,
        explanation: d.snapshot.explanation,
        confidence: snap?.confidence ?? null,
        reasoning: snap?.reasoning ?? null,
        flagged: (snap?.flagged ?? 0) === 1,
        scored: sc,
        item_ms: timing.item_ms[d.row.id] ?? null,
      };
    });
    return ok(reply, {
      attempt_id: id,
      mode: at.mode,
      grade_revision: grade.version,
      rule_version: grade.rule_version,
      aggregate: JSON.parse(grade.aggregate_json),
      timing,
      items,
      report: rep ? { report_revision_id: rep.id, version: rep.version, status: rep.status, md_sha256: rep.md_sha256 } : null,
    });
  });

  app.get('/api/v1/reports/:id', async (req, reply) => {
    const { id } = req.params as { id: string };
    const rep = h.db.prepare('SELECT * FROM report_revisions WHERE id = ?').get(id) as
      | { id: string; attempt_id: string; version: number; status: string; md_sha256: string | null; generated_at: string; input_hash: string } | undefined;
    if (!rep) throw notFound('报告不存在');
    return ok(reply, {
      report_revision_id: rep.id, attempt_id: rep.attempt_id, version: rep.version,
      status: rep.status, md_sha256: rep.md_sha256, generated_at: rep.generated_at, input_hash: rep.input_hash,
    });
  });

  app.get('/api/v1/reports/:id/download', async (req, reply) => {
    const { id } = req.params as { id: string };
    const q = req.query as { format?: string };
    const format = q['format'] === 'json' ? 'json' : 'md';
    const rep = h.db.prepare('SELECT * FROM report_revisions WHERE id = ?').get(id) as
      | { id: string; version: number; status: string; md_path: string | null; json_path: string | null } | undefined;
    if (!rep) throw notFound('报告不存在');
    if (rep.status !== 'ready') throw conflict('REPORT_NOT_READY', '报告尚未生成完成，可稍后重试下载');
    const path = format === 'json' ? rep.json_path : rep.md_path;
    if (!path || !existsSync(path)) throw conflict('REPORT_FILE_MISSING', '报告文件缺失，可重试生成');
    const ext = format === 'json' ? 'json' : 'md';
    return reply
      .header('content-type', format === 'json' ? 'application/json; charset=utf-8' : 'text/markdown; charset=utf-8')
      .header('content-disposition', `attachment; filename="shiti-report-${rep.id.slice(0, 8)}-v${rep.version}.${ext}"`)
      .send(createReadStream(path));
  });

  app.get('/api/v1/jobs/:id', async (req, reply) => {
    const { id } = req.params as { id: string };
    const job = h.db.prepare('SELECT id, type, status, attempts, error_code, error_message, created_at, updated_at FROM jobs WHERE id = ?').get(id) as
      | Record<string, unknown> | undefined;
    if (!job) throw notFound('任务不存在');
    return ok(reply, job);
  });

  // ---------- 学习数据：概览 / 学习计划 / 打卡 / 错题本 ----------

  app.get('/api/v1/overview', async (req, reply) => {
    const userId = req.user!.id;
    const today = todayLocal();
    const prefRow = h.db.prepare('SELECT preferences_json FROM users WHERE id = ?').get(userId) as { preferences_json: string };
    const prefs = readPreferences(prefRow.preferences_json);
    const dailyTarget = Number.isInteger(prefs.daily_target) ? (prefs.daily_target as number) : 20;

    // 今日答题量：今天有过更新的练习里，已作答的题目数（含未交卷的草稿）
    const dailyCount = (h.db.prepare(`
      SELECT COUNT(*) AS n FROM answer_drafts d
      JOIN attempt_items ai ON ai.id = d.attempt_item_id
      JOIN attempts a ON a.id = ai.attempt_id
      WHERE a.user_id = ? AND d.answer_json IS NOT NULL AND date(a.updated_at, 'localtime') = ?`).get(userId, today) as { n: number }).n;

    const checkins = (h.db.prepare('SELECT date FROM check_ins WHERE user_id = ? ORDER BY date').all(userId) as Array<{ date: string }>).map((r) => r.date);
    const learningRows = h.db.prepare(`
      SELECT DISTINCT date(s.submitted_at, 'localtime') AS d FROM submissions s JOIN attempts a ON a.id = s.attempt_id
      WHERE a.user_id = ? ORDER BY d`).all(userId) as Array<{ d: string }>;

    // 近 30 天答题量（按当天作答的草稿计）与正确率（按当天交卷的判分计）
    const sinceDate = (() => {
      const d = new Date();
      d.setDate(d.getDate() - 29);
      return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    })();
    const countRows = h.db.prepare(`
      SELECT date(a.updated_at, 'localtime') AS d, COUNT(*) AS n FROM answer_drafts d2
      JOIN attempt_items ai ON ai.id = d2.attempt_item_id
      JOIN attempts a ON a.id = ai.attempt_id
      WHERE a.user_id = ? AND d2.answer_json IS NOT NULL AND date(a.updated_at, 'localtime') >= ?
      GROUP BY d`).all(userId, sinceDate) as Array<{ d: string; n: number }>;
    const countsByDate = new Map(countRows.map((r) => [r.d, r.n] as const));
    const gradeRows = h.db.prepare(`
      SELECT g.items_json, date(s.submitted_at, 'localtime') AS d
      FROM grade_revisions g JOIN attempts a ON a.id = g.attempt_id JOIN submissions s ON s.attempt_id = a.id
      WHERE a.user_id = ? AND g.version = 1 AND date(s.submitted_at, 'localtime') >= ?`).all(userId, sinceDate) as Array<{ items_json: string; d: string }>;
    const accByDate = new Map<string, { c: number; n: number }>();
    for (const row of gradeRows) {
      const graded = JSON.parse(row.items_json) as Array<{ correctness: string | null }>;
      const cur = accByDate.get(row.d) ?? { c: 0, n: 0 };
      for (const g of graded) {
        if (g.correctness === 'correct' || g.correctness === 'incorrect' || g.correctness === 'partial') {
          cur.n += 1;
          if (g.correctness === 'correct') cur.c += 1;
        }
      }
      accByDate.set(row.d, cur);
    }
    const counts: number[] = [];
    const accuracy: Array<number | null> = [];
    for (let i = 29; i >= 0; i--) {
      const d = (() => {
        const dd = new Date();
        dd.setDate(dd.getDate() - i);
        return `${dd.getFullYear()}-${String(dd.getMonth() + 1).padStart(2, '0')}-${String(dd.getDate()).padStart(2, '0')}`;
      })();
      counts.push(countsByDate.get(d) ?? 0);
      const acc = accByDate.get(d);
      accuracy.push(acc && acc.n > 0 ? Math.round(acc.c / acc.n * 100) : null);
    }

    // 最近练习（任意状态 3 条；已交卷的带正确率与用时）
    const recentRows = h.db.prepare(`
      SELECT a.id, a.state, a.started_at, a.submitted_at, a.updated_at, s.title AS set_title
      FROM attempts a
      JOIN question_set_versions sv ON sv.id = a.set_version_id
      JOIN question_sets s ON s.id = sv.set_id
      WHERE a.user_id = ? ORDER BY a.updated_at DESC LIMIT 3`).all(userId) as Array<{ id: string; state: string; started_at: string | null; submitted_at: string | null; updated_at: string; set_title: string }>;
    const recent = recentRows.map((r) => {
      const total = (h.db.prepare('SELECT COUNT(*) AS n FROM attempt_items WHERE attempt_id = ?').get(r.id) as { n: number }).n;
      let correct: number | null = null;
      let totalGraded: number | null = null;
      let minutes: number | null = null;
      if (r.state === 'submitted') {
        const agg = h.db.prepare('SELECT aggregate_json FROM grade_revisions WHERE attempt_id = ? ORDER BY version DESC LIMIT 1').get(r.id) as { aggregate_json: string } | undefined;
        if (agg) {
          const a = JSON.parse(agg.aggregate_json) as { answered_correct_rate: { num: number; den: number } | null };
          if (a.answered_correct_rate) { correct = a.answered_correct_rate.num; totalGraded = a.answered_correct_rate.den; }
        }
        if (r.started_at && r.submitted_at) minutes = Math.max(1, Math.round((Date.parse(r.submitted_at) - Date.parse(r.started_at)) / 60000));
      }
      return { attempt_id: r.id, title: r.set_title, state: r.state, updated_at: r.updated_at, submitted_at: r.submitted_at, total, correct, total_graded: totalGraded, minutes };
    });

    return ok(reply, {
      daily: { date: today, count: dailyCount, target: dailyTarget },
      checkins,
      learning_dates: learningRows.map((r) => r.d),
      series: { counts, accuracy },
      recent,
    });
  });

  // 学习计划任务
  const TASK_CATEGORIES = ['reading', 'cloze', 'translation', 'writing'];
  const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

  app.get('/api/v1/tasks', async (req, reply) => {
    const rows = h.db.prepare('SELECT * FROM study_tasks WHERE user_id = ? ORDER BY date, created_at LIMIT 500').all(req.user!.id) as Array<Record<string, unknown>>;
    return ok(reply, rows.map((r) => ({ ...r, done: r['done'] === 1 })));
  });

  app.post('/api/v1/tasks', async (req, reply) => {
    const body = req.body as Record<string, unknown> | null;
    const title = String(body?.['title'] ?? '').trim();
    const category = String(body?.['category'] ?? 'reading');
    const date = String(body?.['date'] ?? '');
    const minutes = Number(body?.['minutes'] ?? 20);
    if (!title || title.length > 40) throw badRequest('INVALID_TITLE', '计划内容需要 1–40 个字符');
    if (!TASK_CATEGORIES.includes(category)) throw badRequest('INVALID_CATEGORY', `题型必须是 ${TASK_CATEGORIES.join(' / ')}`);
    if (!DATE_RE.test(date)) throw badRequest('INVALID_DATE', '学习日期格式应为 YYYY-MM-DD');
    if (!Number.isInteger(minutes) || minutes < 1 || minutes > 180) throw badRequest('INVALID_MINUTES', '预计用时需要是 1–180 的整数');
    const id = uuidv7();
    const now = nowIso();
    h.db.prepare('INSERT INTO study_tasks (id, user_id, title, category, date, minutes, done, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, 0, ?, ?)')
      .run(id, req.user!.id, title, category, date, minutes, now, now);
    return reply.code(201).send({ data: { id, title, category, date, minutes, done: false }, meta: { request_id: reply.request.id } });
  });

  app.patch('/api/v1/tasks/:id', async (req, reply) => {
    const { id } = req.params as { id: string };
    const row = h.db.prepare('SELECT * FROM study_tasks WHERE id = ? AND user_id = ?').get(id, req.user!.id) as { id: string } | undefined;
    if (!row) throw notFound('学习计划不存在');
    const body = req.body as Record<string, unknown> | null;
    const sets: string[] = [];
    const params: unknown[] = [];
    if (body?.['title'] !== undefined) {
      const title = String(body['title']).trim();
      if (!title || title.length > 40) throw badRequest('INVALID_TITLE', '计划内容需要 1–40 个字符');
      sets.push('title = ?'); params.push(title);
    }
    if (body?.['done'] !== undefined) { sets.push('done = ?'); params.push(body['done'] === true || body['done'] === 1 ? 1 : 0); }
    if (body?.['date'] !== undefined) {
      const date = String(body['date']);
      if (!DATE_RE.test(date)) throw badRequest('INVALID_DATE', '学习日期格式应为 YYYY-MM-DD');
      sets.push('date = ?'); params.push(date);
    }
    if (body?.['category'] !== undefined) {
      const category = String(body['category']);
      if (!TASK_CATEGORIES.includes(category)) throw badRequest('INVALID_CATEGORY', `题型必须是 ${TASK_CATEGORIES.join(' / ')}`);
      sets.push('category = ?'); params.push(category);
    }
    if (body?.['minutes'] !== undefined) {
      const minutes = Number(body['minutes']);
      if (!Number.isInteger(minutes) || minutes < 1 || minutes > 180) throw badRequest('INVALID_MINUTES', '预计用时需要是 1–180 的整数');
      sets.push('minutes = ?'); params.push(minutes);
    }
    if (sets.length === 0) throw badRequest('EMPTY_PATCH', '没有需要更新的字段');
    sets.push('updated_at = ?'); params.push(nowIso(), id, req.user!.id);
    h.db.prepare(`UPDATE study_tasks SET ${sets.join(', ')} WHERE id = ? AND user_id = ?`).run(...params);
    return ok(reply, { saved: true });
  });

  app.delete('/api/v1/tasks/:id', async (req, reply) => {
    const { id } = req.params as { id: string };
    const r = h.db.prepare('DELETE FROM study_tasks WHERE id = ? AND user_id = ?').run(id, req.user!.id);
    if (r.changes === 0) throw notFound('学习计划不存在');
    return ok(reply, { deleted: true });
  });

  // 每日打卡（幂等：同一天重复打卡只记一次）
  app.post('/api/v1/checkins', async (req, reply) => {
    const body = req.body as { date?: unknown } | null;
    const date = String(body?.['date'] ?? todayLocal());
    if (!DATE_RE.test(date)) throw badRequest('INVALID_DATE', '打卡日期格式应为 YYYY-MM-DD');
    h.db.prepare('INSERT OR IGNORE INTO check_ins (user_id, date, created_at) VALUES (?, ?, ?)').run(req.user!.id, date, nowIso());
    const dates = (h.db.prepare('SELECT date FROM check_ins WHERE user_id = ? ORDER BY date').all(req.user!.id) as Array<{ date: string }>).map((r) => r.date);
    return ok(reply, { dates });
  });

  // 错题本
  app.get('/api/v1/mistakes', async (req, reply) => {
    const rows = h.db.prepare('SELECT * FROM mistake_book WHERE user_id = ? AND resolved = 0 ORDER BY last_wrong_at DESC LIMIT 200')
      .all(req.user!.id) as Array<Record<string, unknown>>;
    return ok(reply, rows.map((r) => {
      const options = r['options_json'] ? JSON.parse(r['options_json'] as string) as Array<{ id: string; text: string }> : null;
      const myAnswer = r['my_answer_json'] ? JSON.parse(r['my_answer_json'] as string) : null;
      const answerKey = r['answer_key_json'] ? JSON.parse(r['answer_key_json'] as string) : null;
      return {
        id: r['id'],
        area: normalizeSection((r['section'] as string | null) ?? null, r['type'] as string),
        title: r['stem'],
        picked: answerLabel(myAnswer, options),
        answer: answerLabel(answerKey, options),
        explanation: r['explanation'] ?? null,
        wrong_count: r['wrong_count'],
        added_at: String(r['last_wrong_at']).slice(0, 10),
      };
    }));
  });

  app.post('/api/v1/mistakes/:id/resolve', async (req, reply) => {
    const { id } = req.params as { id: string };
    const r = h.db.prepare('UPDATE mistake_book SET resolved = 1 WHERE id = ? AND user_id = ?').run(id, req.user!.id);
    if (r.changes === 0) throw notFound('错题不存在');
    return ok(reply, { resolved: true });
  });

  // ---------- 外部 Agent 文件驱动复盘（docs/05） ----------
  app.get('/api/v1/attempts/:id/agent-package', async (req, reply) => {
    const { id } = req.params as { id: string };
    getOwnedAttempt(id, req.user!.id);
    const hasCtx = h.db.prepare('SELECT id FROM agent_context_revisions WHERE attempt_id = ? LIMIT 1').get(id);
    if (!hasCtx) return ok(reply, { status: 'none', attempt_id: id });
    const pkg = ensureAgentPackage(h, h.dataDir, id);
    return ok(reply, { status: 'ready', attempt_id: id, ...pkg });
  });

  app.post('/api/v1/attempts/:id/agent-package', async (req, reply) => {
    const { id } = req.params as { id: string };
    const key = req.headers['idempotency-key'] as string | undefined;
    return withIdempotency(reply, key, `attempts/${id}/agent-package`, () => {
      getOwnedAttempt(id, req.user!.id);
      const pkg = ensureAgentPackage(h, h.dataDir, id);
      return { status: 200, body: { data: { status: 'ready', attempt_id: id, ...pkg } } };
    });
  });

  app.get('/api/v1/attempts/:id/external-review', async (req, reply) => {
    const { id } = req.params as { id: string };
    getOwnedAttempt(id, req.user!.id);
    return ok(reply, listExternalReview(h, id));
  });

  app.post('/api/v1/attempts/:id/external-review/rescan', async (req, reply) => {
    const { id } = req.params as { id: string };
    getOwnedAttempt(id, req.user!.id);
    const r = await reviewCheckNow(h, h.dataDir, id);
    return ok(reply, r);
  });

  // 同源 SSE：事件只带 ID/修订/状态（docs/05 §10）
  app.get('/api/v1/events', async (req, reply) => {
    const q = req.query as { attempt_id?: string };
    reply.raw.writeHead(200, {
      'content-type': 'text/event-stream',
      'cache-control': 'no-cache',
      connection: 'keep-alive',
    });
    reply.raw.write(': connected\n\n');
    const client = addSseClient(reply, q['attempt_id'] ?? null);
    req.raw.on('close', () => removeSseClient(client));
    // 保持连接打开：显式返回不结束响应
    await new Promise(() => { /* 由 close 事件结束 */ });
  });

  // 生产形态：同源提供前端静态文件（白皮书 §4）
  if (opts.serveWebDist !== false) {
    const dist = fileURLToPath(new URL('../../web/dist', import.meta.url));
    if (existsSync(dist)) {
      await app.register(fastifyStatic, { root: dist, prefix: '/' });
      app.setNotFoundHandler((req, reply) => {
        if (req.url.startsWith('/api/')) return fail(reply, 404, 'NOT_FOUND', '接口不存在');
        return reply.sendFile('index.html');
      });
    }
  }

  return app;
}
