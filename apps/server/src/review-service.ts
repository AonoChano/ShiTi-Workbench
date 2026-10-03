import { existsSync, readFileSync, writeFileSync, mkdirSync, statSync, watch, renameSync, type FSWatcher } from 'node:fs';
import { join } from 'node:path';
import { parse as parseYaml } from 'yaml';
import { sha256Hex } from './db.js';
import { uuidv7 } from '@shiti/shared';
import type { DbHandle } from './db.js';
import { nowIso } from './util.js';
import { attemptsRootDir, reviewTemplate } from './agent-workspace.js';
import { buildReportInput } from './report-service.js';

const MAX_REVIEW_BYTES = 1024 * 1024;
const REVIEW_SCHEMA_VERSION = '1.0.0';

export interface ReviewError { code: string; message: string; line?: number; path?: string }

export interface SuggestedAction {
  id: string;
  question_ids: string[];
  evidence_ids: string[];
  text: string;
  acceptance_check: string;
  suggested_interval_days: number;
}

export interface ParsedReview {
  review_schema_version: string;
  attempt_id: string;
  context_revision: number;
  context_sha256: string;
  base_revision: number;
  status: 'draft' | 'complete';
  producer: { kind: string; name: string; model: string | null };
  coverage: { question_ids: string[] };
  question_reviews: Array<{ question_id: string; evidence_ids: string[]; tags: string[]; epistemic_status: string }>;
  suggested_actions: SuggestedAction[];
  grading_concerns: Array<{ question_id: string; evidence_ids: string[]; reason: string }>;
  sections: Record<string, string>;
}

// ---------- SSE ----------
type SseClient = { reply: import('fastify').FastifyReply; attemptId: string | null };
const sseClients = new Set<SseClient>();
let sseEventId = 0;

export function addSseClient(reply: import('fastify').FastifyReply, attemptId: string | null): SseClient {
  const c = { reply, attemptId };
  sseClients.add(c);
  return c;
}
export function removeSseClient(c: SseClient): void {
  sseClients.delete(c);
}
export function broadcastSSE(event: string, data: Record<string, unknown>, attemptId?: string): void {
  sseEventId += 1;
  const payload = `id: ${sseEventId}\nevent: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
  for (const c of sseClients) {
    if (attemptId && c.attemptId && c.attemptId !== attemptId) continue;
    try { c.reply.raw.write(payload); } catch { sseClients.delete(c); }
  }
}

// ---------- 上下文/状态读取 ----------
interface CtxRow {
  id: string; version: number; md_sha256: string; json_sha256: string; evidence_json: string; md_bytes: Buffer;
}

function currentContext(h: DbHandle, attemptId: string): CtxRow | undefined {
  return h.db.prepare('SELECT id, version, md_sha256, json_sha256, evidence_json, md_bytes FROM agent_context_revisions WHERE attempt_id = ? ORDER BY version DESC LIMIT 1').get(attemptId) as CtxRow | undefined;
}

function lastAccepted(h: DbHandle, attemptId: string): { version: number; file_sha256: string } | undefined {
  return h.db.prepare('SELECT version, file_sha256 FROM external_review_revisions WHERE attempt_id = ? ORDER BY version DESC LIMIT 1').get(attemptId) as { version: number; file_sha256: string } | undefined;
}

function writeState(h: DbHandle, dir: string, attemptId: string, patch: Partial<Record<string, unknown>>, errors: ReviewError[], projectionStatus: 'ok' | 'projection_error'): void {
  const ctx = currentContext(h, attemptId);
  const accepted = lastAccepted(h, attemptId);
  const reviewPath = join(dir, 'review.md');
  const observed = existsSync(reviewPath) ? sha256Hex(readFileSync(reviewPath)) : null;
  const state = {
    status: accepted ? 'accepted' : 'empty',
    accepted_revision: accepted?.version ?? 0,
    accepted_sha256: accepted?.file_sha256 ?? null,
    current_context_revision: ctx?.version ?? 0,
    current_context_sha256: ctx?.md_sha256 ?? null,
    current_context_json_sha256: ctx?.json_sha256 ?? null,
    context_status: ctx ? 'ready' : 'preparing',
    observed_file_sha256: observed,
    last_checked_at: nowIso(),
    errors: errors.map((e) => ({ code: e.code, message: e.message, ...(e.line !== undefined ? { line: e.line } : {}), ...(e.path ? { path: e.path } : {}) })),
    projection_status: projectionStatus,
    ...patch,
  };
  try {
    const tmp = `${join(dir, 'state.json')}.tmp`;
    writeFileSync(tmp, JSON.stringify(state, null, 2) + '\n', 'utf8');
    renameSafe(tmp, join(dir, 'state.json'));
  } catch {
    // 投影失败：数据库仍是权威（docs/05 §5.3）；下次扫描会重写 state
  }
}

function renameSafe(from: string, to: string): void {
  try { renameSync(from, to); } catch { /* 保留旧文件，投影下轮重试 */ }
}

// ---------- 校验 ----------
export function validateReviewCandidate(
  h: DbHandle,
  attemptId: string,
  bytes: Buffer,
): { ok: true; parsed: ParsedReview } | { ok: false; errors: ReviewError[] } {
  const errors: ReviewError[] = [];
  if (bytes.length > MAX_REVIEW_BYTES) {
    return { ok: false, errors: [{ code: 'FILE_TOO_LARGE', message: `review.md 超过 1MiB 上限（${bytes.length} 字节）` }] };
  }
  // Windows 编辑器常写 CRLF：校验前归一化换行（存储仍保留原始字节）
  const text = bytes.toString('utf8').split('\r\n').join('\n');
  if (text.includes('\uFFFD')) {
    return { ok: false, errors: [{ code: 'INVALID_UTF8', message: '文件包含无效 UTF-8 字节' }] };
  }
  if (!text.startsWith('---\n')) {
    return { ok: false, errors: [{ code: 'UNSAFE_YAML', message: '缺少 YAML frontmatter（必须以 --- 开头）', line: 1 }] };
  }
  const endIdx = text.indexOf('\n---', 4);
  if (endIdx < 0) {
    return { ok: false, errors: [{ code: 'UNSAFE_YAML', message: 'frontmatter 未闭合', line: 1 }] };
  }
  const fmText = text.slice(4, endIdx);
  const body = text.slice(endIdx + 4);

  let fm: Record<string, unknown>;
  try {
    fm = parseYaml(fmText, { uniqueKeys: true }) as Record<string, unknown>;
  } catch (e) {
    const msg = (e as Error).message.slice(0, 200);
    const dup = /duplicate/i.test(msg);
    return { ok: false, errors: [{ code: dup ? 'DUPLICATE_KEY' : 'UNSAFE_YAML', message: `frontmatter 解析失败：${msg}`, line: 1 }] };
  }
  if (typeof fm !== 'object' || fm === null || Array.isArray(fm)) {
    return { ok: false, errors: [{ code: 'UNSAFE_YAML', message: 'frontmatter 必须是键值映射' }] };
  }

  const allowed = new Set(['review_schema_version', 'attempt_id', 'context_revision', 'context_sha256', 'base_revision', 'status', 'producer', 'coverage', 'question_reviews', 'suggested_actions', 'grading_concerns']);
  for (const k of Object.keys(fm)) {
    if (!allowed.has(k)) errors.push({ code: 'UNKNOWN_FIELD', message: `frontmatter 含未知字段 "${k}"`, path: k });
  }

  const ctx = currentContext(h, attemptId);
  if (!ctx) {
    return { ok: false, errors: [{ code: 'CONTEXT_CHANGED', message: '该练习尚未准备外部复盘上下文' }] };
  }
  const evidence = new Set((JSON.parse(ctx.evidence_json) as Array<{ id: string }>).map((e) => e.id));
  const attemptQuestions = new Set(
    (h.db.prepare('SELECT DISTINCT question_id FROM attempt_items WHERE attempt_id = ?').all(attemptId) as Array<{ question_id: string }>).map((r) => r.question_id),
  );

  const str = (v: unknown, field: string, code = 'UNSAFE_YAML') => {
    if (typeof v !== 'string' || v.length === 0) { errors.push({ code, message: `${field} 必须是非空字符串`, path: field }); return undefined; }
    return v;
  };
  const int = (v: unknown, field: string) => {
    if (!Number.isInteger(v)) { errors.push({ code: 'SCHEMA_UNSUPPORTED', message: `${field} 必须是整数`, path: field }); return undefined; }
    return v as number;
  };

  const schemaVersion = str(fm['review_schema_version'], 'review_schema_version');
  if (schemaVersion && schemaVersion !== REVIEW_SCHEMA_VERSION) {
    errors.push({ code: 'SCHEMA_UNSUPPORTED', message: `review_schema_version "${schemaVersion}" 不受支持（仅 ${REVIEW_SCHEMA_VERSION}）`, path: 'review_schema_version' });
  }
  if (str(fm['attempt_id'], 'attempt_id') !== attemptId) {
    errors.push({ code: 'ATTEMPT_MISMATCH', message: `frontmatter 的 attempt_id 与本目录不一致`, path: 'attempt_id' });
  }
  const ctxRev = int(fm['context_revision'], 'context_revision');
  if (ctxRev !== undefined && ctxRev !== ctx.version) {
    errors.push({ code: 'CONTEXT_CHANGED', message: `context_revision ${ctxRev} 不是当前版本 ${ctx.version}；请重新读取 state.json 后更新`, path: 'context_revision' });
  }
  const ctxSha = str(fm['context_sha256'], 'context_sha256');
  if (ctxSha !== undefined && ctxSha !== ctx.md_sha256) {
    errors.push({ code: 'CONTEXT_CHANGED', message: 'context_sha256 与系统保存的 context.md 摘要不一致（上下文已更新或被误改）', path: 'context_sha256' });
  }
  const base = int(fm['base_revision'], 'base_revision');
  const accepted = lastAccepted(h, attemptId);
  const currentAcceptedRev = accepted?.version ?? 0;
  if (base !== undefined && base !== currentAcceptedRev) {
    errors.push({ code: 'BASE_REVISION_CONFLICT', message: `base_revision ${base} ≠ 当前已接受修订 ${currentAcceptedRev}；请重新读取 state.json`, path: 'base_revision' });
  }
  const status = fm['status'];
  if (status !== 'draft' && status !== 'complete') {
    errors.push({ code: 'SCHEMA_UNSUPPORTED', message: 'status 必须是 draft 或 complete', path: 'status' });
  }
  const producer = fm['producer'];
  if (typeof producer !== 'object' || producer === null || Array.isArray(producer)) {
    errors.push({ code: 'SCHEMA_UNSUPPORTED', message: 'producer 必须是 { kind, name, model }', path: 'producer' });
  }
  const coverage = fm['coverage'];
  let qids: string[] = [];
  if (typeof coverage !== 'object' || coverage === null || Array.isArray(coverage)) {
    errors.push({ code: 'SCHEMA_UNSUPPORTED', message: 'coverage 必须是 { question_ids: [...] }', path: 'coverage' });
  } else {
    const ids = (coverage as { question_ids?: unknown }).question_ids;
    if (!Array.isArray(ids) || ids.length === 0 || !ids.every((x) => typeof x === 'string')) {
      errors.push({ code: 'SCHEMA_UNSUPPORTED', message: 'coverage.question_ids 必须是非空字符串数组', path: 'coverage.question_ids' });
    } else {
      qids = ids as string[];
      if (new Set(qids).size !== qids.length) errors.push({ code: 'SCHEMA_UNSUPPORTED', message: 'coverage.question_ids 存在重复', path: 'coverage.question_ids' });
      for (const q of qids) {
        if (!attemptQuestions.has(q)) errors.push({ code: 'UNKNOWN_QUESTION', message: `coverage 引用了不属于本次练习的题目 "${q}"`, path: 'coverage.question_ids' });
      }
    }
  }
  const qrev = fm['question_reviews'];
  if (!Array.isArray(qrev)) {
    errors.push({ code: 'SCHEMA_UNSUPPORTED', message: 'question_reviews 必须是数组', path: 'question_reviews' });
  } else {
    const seen = new Set<string>();
    for (const r of qrev) {
      if (typeof r !== 'object' || r === null) { errors.push({ code: 'SCHEMA_UNSUPPORTED', message: 'question_reviews 元素必须是对象', path: 'question_reviews' }); continue; }
      const rec = r as Record<string, unknown>;
      for (const k of Object.keys(rec)) {
        if (!['question_id', 'evidence_ids', 'tags', 'epistemic_status'].includes(k)) errors.push({ code: 'UNKNOWN_FIELD', message: `question_reviews 含未知字段 "${k}"`, path: `question_reviews.${k}` });
      }
      const qid = rec['question_id'];
      if (typeof qid !== 'string' || !qids.includes(qid)) {
        errors.push({ code: 'UNKNOWN_QUESTION', message: `question_reviews 引用了不在 coverage 中的题目 ${JSON.stringify(qid ?? null)}`, path: 'question_reviews' });
        continue;
      }
      if (seen.has(qid)) errors.push({ code: 'SECTION_DUPLICATE', message: `题目 ${qid} 出现多条 question_reviews`, path: 'question_reviews' });
      seen.add(qid);
      const es = rec['evidence_ids'];
      if (!Array.isArray(es) || !es.every((x) => typeof x === 'string')) {
        errors.push({ code: 'SCHEMA_UNSUPPORTED', message: `题目 ${qid} 的 evidence_ids 必须是字符串数组`, path: 'question_reviews' });
      } else {
        for (const e of es) {
          if (!evidence.has(e as string)) errors.push({ code: 'UNKNOWN_EVIDENCE', message: `题目 ${qid} 引用了不存在的证据 "${e}"`, path: 'question_reviews' });
        }
      }
      const st = rec['epistemic_status'];
      if (st !== 'supported' && st !== 'hypothesis' && st !== 'insufficient_context') {
        errors.push({ code: 'SCHEMA_UNSUPPORTED', message: `题目 ${qid} 的 epistemic_status 非法`, path: 'question_reviews' });
      }
      if (!Array.isArray(rec['tags'])) errors.push({ code: 'SCHEMA_UNSUPPORTED', message: `题目 ${qid} 的 tags 必须是数组`, path: 'question_reviews' });
    }
    for (const q of qids) {
      if (!seen.has(q)) errors.push({ code: 'SECTION_MISSING', message: `coverage 中的题目 ${q} 缺少 question_reviews 条目`, path: 'question_reviews' });
    }
  }

  let actions: SuggestedAction[] = [];
  const sa = fm['suggested_actions'];
  if (sa !== undefined) {
    if (!Array.isArray(sa) || sa.length > 50) {
      errors.push({ code: 'SCHEMA_UNSUPPORTED', message: 'suggested_actions 必须是数组且最多 50 项', path: 'suggested_actions' });
    } else {
      const ids = new Set<string>();
      actions = [];
      for (const a of sa) {
        if (typeof a !== 'object' || a === null) { errors.push({ code: 'SCHEMA_UNSUPPORTED', message: 'suggested_actions 元素必须是对象', path: 'suggested_actions' }); continue; }
        const rec = a as Record<string, unknown>;
        for (const k of Object.keys(rec)) {
          if (!['id', 'question_ids', 'evidence_ids', 'text', 'acceptance_check', 'suggested_interval_days'].includes(k)) errors.push({ code: 'UNKNOWN_FIELD', message: `suggested_actions 含未知字段 "${k}"`, path: `suggested_actions.${k}` });
        }
        const id = rec['id'];
        if (typeof id !== 'string' || !/^[a-z0-9-]{1,64}$/.test(id)) { errors.push({ code: 'SCHEMA_UNSUPPORTED', message: `建议 id 非法：${JSON.stringify(id ?? null)}`, path: 'suggested_actions' }); continue; }
        if (ids.has(id)) { errors.push({ code: 'SCHEMA_UNSUPPORTED', message: `建议 id 重复：${id}`, path: 'suggested_actions' }); continue; }
        ids.add(id);
        const qsa = rec['question_ids'];
        const esa = rec['evidence_ids'];
        const text = rec['text'];
        const check = rec['acceptance_check'];
        const days = rec['suggested_interval_days'];
        let okAction = true;
        if (!Array.isArray(qsa) || qsa.length === 0 || !qsa.every((x) => typeof x === 'string' && qids.includes(x as string))) {
          errors.push({ code: 'SCHEMA_UNSUPPORTED', message: `建议 ${id} 的 question_ids 必须都属于 coverage`, path: 'suggested_actions' }); okAction = false;
        }
        if (!Array.isArray(esa) || esa.length === 0 || !esa.every((x) => typeof x === 'string' && evidence.has(x as string))) {
          errors.push({ code: 'UNKNOWN_EVIDENCE', message: `建议 ${id} 引用了不存在的证据`, path: 'suggested_actions' }); okAction = false;
        }
        if (typeof text !== 'string' || text.length < 1 || text.length > 2000) { errors.push({ code: 'SCHEMA_UNSUPPORTED', message: `建议 ${id} 的 text 必须是 1–2000 字符`, path: 'suggested_actions' }); okAction = false; }
        if (typeof check !== 'string' || check.length < 1 || check.length > 2000) { errors.push({ code: 'SCHEMA_UNSUPPORTED', message: `建议 ${id} 的 acceptance_check 必须是 1–2000 字符`, path: 'suggested_actions' }); okAction = false; }
        if (!Number.isInteger(days) || (days as number) < 1 || (days as number) > 365) { errors.push({ code: 'SCHEMA_UNSUPPORTED', message: `建议 ${id} 的 suggested_interval_days 必须是 1–365 整数`, path: 'suggested_actions' }); okAction = false; }
        if (okAction) {
          actions.push({ id, question_ids: qsa as string[], evidence_ids: esa as string[], text: text as string, acceptance_check: check as string, suggested_interval_days: days as number });
        }
      }
    }
  }
  const gc = fm['grading_concerns'];
  if (gc !== undefined && !Array.isArray(gc)) errors.push({ code: 'SCHEMA_UNSUPPORTED', message: 'grading_concerns 必须是数组', path: 'grading_concerns' });

  // 二级标题解析（行号从正文首行计）
  const sections: Record<string, string> = {};
  const seenHeaders = new Map<string, number>();
  const bodyLines = body.split('\n');
  let curHeader = '';
  let curStart = 0;
  for (let i = 0; i < bodyLines.length; i++) {
    const m = /^## (.+?)\s*$/.exec(bodyLines[i] ?? '');
    if (m && m[1]) {
      if (curHeader) sections[curHeader] = bodyLines.slice(curStart, i).join('\n').trim();
      const name = m[1].trim();
      curHeader = name; curStart = i + 1;
      if (seenHeaders.has(name)) errors.push({ code: 'SECTION_DUPLICATE', message: `二级标题重复：## ${name}`, line: i + 1 });
      else seenHeaders.set(name, i + 1);
    }
  }
  if (curHeader) sections[curHeader] = bodyLines.slice(curStart).join('\n').trim();
  const expected = new Set(['summary', 'open_questions', ...qids.map((q) => `q:${q}`)]);
  for (const name of seenHeaders.keys()) {
    if (!expected.has(name)) errors.push({ code: 'UNKNOWN_FIELD', message: `未知的二级标题 "## ${name}"（允许：summary、q:<question_id>、open_questions）`, line: seenHeaders.get(name) });
  }
  for (const name of expected) {
    if (!seenHeaders.has(name) && status === 'complete') {
      errors.push({ code: 'SECTION_MISSING', message: `缺少必需的二级标题 "## ${name}"`, line: 1 });
    }
  }
  if (status === 'complete') {
    for (const name of ['summary', ...qids.map((q) => `q:${q}`)]) {
      if ((sections[name] ?? '').length === 0) errors.push({ code: 'SECTION_MISSING', message: `status=complete 要求 "## ${name}" 非空`, line: seenHeaders.get(name) });
    }
  }

  if (errors.length > 0) return { ok: false, errors };

  const parsed: ParsedReview = {
    review_schema_version: schemaVersion as string,
    attempt_id: fm['attempt_id'] as string,
    context_revision: ctxRev as number,
    context_sha256: ctxSha as string,
    base_revision: base as number,
    status: status as 'draft' | 'complete',
    producer: producer as ParsedReview['producer'],
    coverage: { question_ids: qids },
    question_reviews: qrev as ParsedReview['question_reviews'],
    suggested_actions: actions,
    grading_concerns: (gc ?? []) as ParsedReview['grading_concerns'],
    sections,
  };
  return { ok: true, parsed };
}

// ---------- 接受 ----------
export function acceptReview(h: DbHandle, workspaceDir: string, attemptId: string, bytes: Buffer): { accepted: true; version: number } | { accepted: false; noop?: boolean; errors?: ReviewError[] } {
  const fileSha = sha256Hex(bytes);
  const accepted = lastAccepted(h, attemptId);
  if (accepted && accepted.file_sha256 === fileSha) return { accepted: false, noop: true };
  // 初始模板不算 Agent 产出（docs/05 §7.1）：与系统模板字节一致 → no-op
  {
    const ctx0 = currentContext(h, attemptId);
    if (ctx0) {
      const reportVer = (h.db.prepare('SELECT version FROM report_revisions WHERE attempt_id = ? ORDER BY version DESC LIMIT 1').get(attemptId) as { version: number }).version;
      const tplSha = sha256Hex(reviewTemplate(buildReportInput(h, attemptId, reportVer), ctx0.version, ctx0.md_sha256));
      if (fileSha === tplSha) return { accepted: false, noop: true };
    }
  }

  const v = validateReviewCandidate(h, attemptId, bytes);
  const dir = join(attemptsRootDir(workspaceDir), attemptId);
  mkdirSync(join(dir, 'history'), { recursive: true });
  if (!v.ok) {
    writeState(h, dir, attemptId, {}, v.errors, 'ok');
    broadcastSSE('external_review.invalid', { attempt_id: attemptId, errors: v.errors.slice(0, 10) }, attemptId);
    return { accepted: false, errors: v.errors };
  }
  const version = (accepted?.version ?? 0) + 1;
  const id = uuidv7();
  const ctx = currentContext(h, attemptId)!;
  // CAS 在事务内复核（docs/05 §7.2）
  try { h.db.transaction(() => {
    const cur = lastAccepted(h, attemptId);
    if ((cur?.version ?? 0) !== (v.parsed.base_revision)) throw new Error('BASE_REVISION_CONFLICT');
    h.db.prepare('INSERT INTO external_review_revisions (id, attempt_id, version, context_revision_id, base_revision, file_sha256, status, md_bytes, parsed_json, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)')
      .run(id, attemptId, version, ctx.id, v.parsed.base_revision, fileSha, v.parsed.status, bytes, JSON.stringify(v.parsed), nowIso());
  })(); } catch {
    return { accepted: false, errors: [{ code: 'BASE_REVISION_CONFLICT', message: `base_revision 已被并发写入抢先接受，请重读 state.json` }] };
  }
  writeState(h, dir, attemptId, { accepted_revision: version }, [], 'ok');
  try { writeFileSync(join(dir, 'history', `review-v${String(version).padStart(4, '0')}.md`), bytes); } catch { /* 镜像失败可重建 */ }
  broadcastSSE('external_review.validated', { attempt_id: attemptId, revision: version }, attemptId);
  return { accepted: true, version };
}



// ---------- 监听 ----------
interface WatchState { lastSize: number; lastMtime: number }
const watchStates = new Map<string, WatchState>(); // key: attemptId
let watcher: FSWatcher | null = null;
let watchTimer: NodeJS.Timeout | null = null;

export function startReviewWatcher(h: DbHandle, workspaceDir: string): void {
  const root = attemptsRootDir(workspaceDir);
  mkdirSync(root, { recursive: true });
  const processAll = async () => {
    const rows = h.db.prepare('SELECT DISTINCT attempt_id FROM agent_context_revisions').all() as Array<{ attempt_id: string }>;
    for (const { attempt_id } of rows) {
      try {
        await checkAttemptFile(h, workspaceDir, attempt_id);
      } catch { /* 单个失败不影响其他 */ }
    }
  };
  void processAll();
  try {
    watcher = watch(root, { recursive: true }, (_e, fname) => {
      if (!fname || !String(fname).endsWith('review.md')) return;
      setTimeout(() => { void processAll(); }, 500); // 静默窗口（docs/05 §5.1）
    });
  } catch { /* watcher 不可用时靠 interval 兜底 */ }
  watchTimer = setInterval(() => { void processAll(); }, 5000);
  watchTimer.unref?.();
}

export function stopReviewWatcher(): void {
  watcher?.close();
  watcher = null;
  if (watchTimer) clearInterval(watchTimer);
  watchTimer = null;
}

async function checkAttemptFile(h: DbHandle, workspaceDir: string, attemptId: string): Promise<void> {
  const p = join(attemptsRootDir(workspaceDir), attemptId, 'review.md');
  let size = 0, mtime = 0;
  let exists = existsSync(p);
  if (exists) {
    const st = statSync(p);
    size = st.size; mtime = Math.floor(st.mtimeMs);
  }
  const prev = watchStates.get(attemptId);
  if (prev && prev.lastSize === size && prev.lastMtime === mtime) return; // 无变化
  watchStates.set(attemptId, { lastSize: size, lastMtime: mtime });
  if (!exists) {
    if (lastAccepted(h, attemptId)) {
      const dir = join(attemptsRootDir(workspaceDir), attemptId);
      writeState(h, dir, attemptId, {}, [{ code: 'FILE_MISSING', message: 'review.md 不在原位；仍显示上次有效复盘' }], 'ok');
      broadcastSSE('external_review.missing', { attempt_id: attemptId }, attemptId);
    }
    return;
  }
  // 稳定读取：前后两次状态一致才处理（docs/05 §5.2）
  const b1 = readFileSync(p);
  const st1 = statSync(p);
  await new Promise((r) => setTimeout(r, 150)); // 稳定读取：静默窗口后再核对一次
  if (!existsSync(p)) return;
  const st2 = statSync(p);
  if (st1.size !== st2.size || st1.mtimeMs !== st2.mtimeMs) return; // 仍在写入，下轮再来
  const b2 = readFileSync(p);
  if (b1.length !== b2.length) return;
  acceptReview(h, workspaceDir, attemptId, b2);
}

// ---------- 查询与强制重扫 ----------
export function listExternalReview(h: DbHandle, attemptId: string, workspaceDir?: string): Record<string, unknown> {
  const ctx = currentContext(h, attemptId);
  const accepted = lastAccepted(h, attemptId);
  const revisions = (h.db.prepare('SELECT version, status, created_at, file_sha256, base_revision FROM external_review_revisions WHERE attempt_id = ? ORDER BY version').all(attemptId) as Array<Record<string, unknown>>);
  const reviewPath = workspaceDir ? join(attemptsRootDir(workspaceDir), attemptId, 'review.md') : null;
  let file_status = 'not_prepared';
  if (reviewPath !== null) file_status = existsSync(reviewPath) ? 'present' : 'missing';
  let review: Record<string, unknown> | null = null;
  if (accepted) {
    const row = h.db.prepare('SELECT parsed_json, created_at, status FROM external_review_revisions WHERE attempt_id = ? AND version = ?').get(attemptId, accepted.version) as { parsed_json: string; created_at: string; status: string };
    review = { revision: accepted.version, file_sha256: accepted.file_sha256, created_at: row.created_at, status: row.status, parsed: JSON.parse(row.parsed_json) };
  }
  return {
    attempt_id: attemptId,
    prepared: Boolean(ctx),
    context_revision: ctx?.version ?? 0,
    accepted_revision: accepted?.version ?? 0,
    file_status,
    review,
    revisions,
  };
}

export async function reviewCheckNow(h: DbHandle, workspaceDir: string, attemptId: string): Promise<Record<string, unknown>> {
  await checkAttemptFile(h, workspaceDir, attemptId);
  return listExternalReview(h, attemptId, workspaceDir);
}
