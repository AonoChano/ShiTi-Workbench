import type { DbHandle } from './db.js';
import { sha256Stable } from './db.js';
import type { QuestionType } from '@shiti/shared';
import { uuidv7 } from '@shiti/shared';

export interface ImportPayloadView {
  set: { title: string };
  meta?: Record<string, unknown> | null;
  sections?: Array<{ id: string; part?: string; title: string; directions?: string[] }>;
  materials?: Array<{ id: string; title: string; blocks: unknown[]; source_note?: string; section?: string; source_ref?: string }>;
  questions: Array<{
    id: string; type: QuestionType; stem: string; options?: Array<{ id: string; text: string }>;
    images?: string[];
    material_id?: string; answer_key: unknown; explanation?: string; max_score_units: number;
    tags?: string[]; source_note?: string; section?: string; source_ref?: string;
  }>;
}

export interface CreateResult {
  set_id: string;
  set_version_id: string;
  question_count: number;
}

function isDemo(payload: ImportPayloadView): boolean {
  return /演示|demo/i.test(payload.set.title) || /演示|demo/i.test(String(payload.meta?.['notes'] ?? ''));
}

/** 由已通过校验的 payload 创建题集 v1（供导入确认与题库目录扫描共用）。须在调用方事务内执行。 */
export function createSetFromPayload(
  h: DbHandle,
  payload: ImportPayloadView,
  opts: { now: string; bankPath?: string | null; bankHash?: string | null },
): CreateResult {
  const setId = uuidv7();
  const setVersionId = uuidv7();
  const title = payload.set.title;
  h.db.prepare('INSERT INTO question_sets (id, workspace_id, title, current_version_id, is_demo, meta_json, bank_path, bank_hash, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)')
    .run(setId, 'ws-default', title, setVersionId, isDemo(payload) ? 1 : 0,
      payload.meta ? JSON.stringify(payload.meta) : null,
      opts.bankPath ?? null, opts.bankHash ?? null, opts.now, opts.now);

  const matIdMap = new Map<string, string>();
  for (const m of payload.materials ?? []) {
    const mid = uuidv7();
    matIdMap.set(m.id, mid);
    h.db.prepare('INSERT INTO materials (id, workspace_id, version, title, blocks_json, source_note, section, source_ref, hash, created_at) VALUES (?, ?, 1, ?, ?, ?, ?, ?, ?, ?)')
      .run(mid, 'ws-default', m.title, JSON.stringify(m.blocks), m.source_note ?? null, m.section ?? null, m.source_ref ?? null, sha256Stable(m), opts.now);
  }

  const entries: Array<{ question_version_id: string; order: number }> = [];
  for (const [i, q] of payload.questions.entries()) {
    const questionId = uuidv7();
    const versionId = uuidv7();
    h.db.prepare('INSERT INTO questions (id, workspace_id, current_published_version_id, source_key, created_at) VALUES (?, ?, ?, ?, ?)')
      .run(questionId, 'ws-default', versionId, q.id, opts.now);
    insertQuestionVersion(h, { versionId, questionId, version: 1, q, matIdMap, now: opts.now });
    entries.push({ question_version_id: versionId, order: i + 1 });
  }
  h.db.prepare('INSERT INTO question_set_versions (id, set_id, version, entries_json, sections_json, hash, created_at) VALUES (?, ?, 1, ?, ?, ?, ?)')
    .run(setVersionId, setId, JSON.stringify(entries), payload.sections && payload.sections.length > 0 ? JSON.stringify(payload.sections) : null, sha256Stable(entries), opts.now);
  return { set_id: setId, set_version_id: setVersionId, question_count: entries.length };
}

/** 同一题集的文件内容变化：为每题生成新版本并创建新的题集版本；旧练习快照不受影响（docs/02 §7.3）。须在调用方事务内执行。 */
export function bumpSetFromPayload(
  h: DbHandle,
  setId: string,
  payload: ImportPayloadView,
  opts: { now: string; bankHash?: string | null },
): CreateResult & { changed: number; added: number } {
  const prevSv = h.db.prepare('SELECT * FROM question_set_versions WHERE set_id = ? ORDER BY version DESC LIMIT 1').get(setId) as
    | { id: string; version: number; entries_json: string } | undefined;
  if (!prevSv) throw new Error('题集不存在，无法升级版本');
  const prevEntries = JSON.parse(prevSv.entries_json) as Array<{ question_version_id: string; order: number }>;
  // source_key → question_id（限定本卷既有题目）
  const keyToQuestion = new Map<string, string>();
  for (const e of prevEntries) {
    const row = h.db.prepare('SELECT q.id, q.source_key FROM questions q JOIN question_versions v ON v.question_id = q.id WHERE v.id = ?')
      .get(e.question_version_id) as { id: string; source_key: string | null } | undefined;
    if (row?.source_key) keyToQuestion.set(row.source_key, row.id);
  }
  const newVersionIdForSet = uuidv7();
  const matIdMap = new Map<string, string>();
  for (const m of payload.materials ?? []) {
    const mid = uuidv7();
    matIdMap.set(m.id, mid);
    h.db.prepare('INSERT INTO materials (id, workspace_id, version, title, blocks_json, source_note, section, source_ref, hash, created_at) VALUES (?, ?, 1, ?, ?, ?, ?, ?, ?, ?)')
      .run(mid, 'ws-default', m.title, JSON.stringify(m.blocks), m.source_note ?? null, m.section ?? null, m.source_ref ?? null, sha256Stable(m), opts.now);
  }

  const entries: Array<{ question_version_id: string; order: number }> = [];
  let changed = 0, added = 0;
  for (const [i, q] of payload.questions.entries()) {
    const existingQid = keyToQuestion.get(q.id);
    let questionId: string;
    let nextVersion: number;
    if (existingQid) {
      questionId = existingQid;
      nextVersion = (h.db.prepare('SELECT MAX(version) AS v FROM question_versions WHERE question_id = ?').get(existingQid) as { v: number }).v + 1;
      changed += 1;
    } else {
      questionId = uuidv7();
      h.db.prepare('INSERT INTO questions (id, workspace_id, current_published_version_id, source_key, created_at) VALUES (?, ?, ?, ?, ?)')
        .run(questionId, 'ws-default', null, q.id, opts.now);
      nextVersion = 1;
      added += 1;
    }
    const versionId = uuidv7();
    insertQuestionVersion(h, { versionId, questionId, version: nextVersion, q, matIdMap, now: opts.now });
    h.db.prepare('UPDATE questions SET current_published_version_id = ? WHERE id = ?').run(versionId, questionId);
    entries.push({ question_version_id: versionId, order: i + 1 });
  }
  h.db.prepare('INSERT INTO question_set_versions (id, set_id, version, entries_json, sections_json, hash, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)')
    .run(newVersionIdForSet, setId, prevSv.version + 1, JSON.stringify(entries), payload.sections && payload.sections.length > 0 ? JSON.stringify(payload.sections) : null, sha256Stable(entries), opts.now);
  h.db.prepare('UPDATE question_sets SET current_version_id = ?, bank_hash = ?, updated_at = ? WHERE id = ?')
    .run(newVersionIdForSet, opts.bankHash ?? null, opts.now, setId);
  return { set_id: setId, set_version_id: newVersionIdForSet, question_count: entries.length, changed, added };
}

function insertQuestionVersion(
  h: DbHandle,
  args: {
    versionId: string; questionId: string; version: number;
    q: ImportPayloadView['questions'][number];
    matIdMap: Map<string, string>; now: string;
  },
): void {
  const { versionId, questionId, version, q, matIdMap, now } = args;
  h.db.prepare(
    'INSERT INTO question_versions (id, question_id, version, type, stem, options_json, images_json, material_id, answer_key_json, explanation, max_score_units, tags_json, source_note, section, source_ref, hash, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
  ).run(
    versionId, questionId, version, q.type, q.stem,
    JSON.stringify(q.options ?? []), q.images && q.images.length > 0 ? JSON.stringify(q.images) : null,
    q.material_id ? matIdMap.get(q.material_id) ?? null : null,
    q.answer_key === null || q.answer_key === undefined ? null : JSON.stringify(q.answer_key),
    q.explanation ?? null, q.max_score_units, JSON.stringify(q.tags ?? []), q.source_note ?? null,
    q.section ?? null, q.source_ref ?? null,
    sha256Stable(q), now,
  );
}
