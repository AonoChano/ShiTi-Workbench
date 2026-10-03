import type { DbHandle } from './db.js';
import { sha256Stable } from './db.js';
import { uuidv7 } from '@shiti/shared';
import { HttpError } from './util.js';

/** 专项练习：从当前题库的已发布题目里按大题（section）/题型（type）抽题组卷。 */

/**
 * 大题标签规范化：不同年份/转换批次的 section 命名不一致（如 "Part I · Cloze Test" 与
 * "Section I · 完形填空" 同指完形），按关键词归并为五大题型，保证专项卡片不碎。
 */
export function normalizeSection(section: string | null, type?: string | null): string {
  if (!section) return '未分类';
  const s = section.toLowerCase();
  if (/cloze|完形|use of english/.test(s)) return '完形填空';
  // 2005 年前英译汉也叫 "Reading Comprehension Part B"（如 1991/1992 卷）：新题型必为单选，
  // 同名 Part B 下的主观题按题型消歧归翻译
  if (/新题型|7选5|排序|小标题|reading.*part ?b|part ?b.*reading/.test(s)) {
    return type === 'free_text' || type === 'fill_blank' ? '翻译' : '新题型';
  }
  if (/translation|英译汉|翻译|reading.*part ?c|part ?c.*reading/.test(s)) return '翻译';
  if (/writing|作文|写作/.test(s)) return '写作';
  if (/reading|阅读/.test(s)) return '阅读理解';
  return section;
}

export interface DrillFacet {
  /** 规范化大题名，如 "完形填空" */
  label: string;
  type: string;
  count: number;
  /** 归并前的原始 section 标签（抽题按这些标签匹配） */
  sections: string[];
}

export function drillFacets(h: DbHandle): DrillFacet[] {
  const rows = h.db.prepare(`
    SELECT qv.section AS section, qv.type AS type, COUNT(*) AS n
    FROM questions q JOIN question_versions qv ON qv.id = q.current_published_version_id
    GROUP BY qv.section, qv.type
    ORDER BY (qv.section IS NULL), qv.section, qv.type
  `).all() as Array<{ section: string | null; type: string; n: number }>;
  const merged = new Map<string, DrillFacet>();
  for (const r of rows) {
    const key = `${normalizeSection(r.section, r.type)}|${r.type}`;
    const cur = merged.get(key);
    if (cur) {
      cur.count += r.n;
      if (r.section && !cur.sections.includes(r.section)) cur.sections.push(r.section);
    } else {
      merged.set(key, { label: normalizeSection(r.section, r.type), type: r.type, count: r.n, sections: r.section ? [r.section] : [] });
    }
  }
  return [...merged.values()].sort((a, b) => a.label.localeCompare(b.label, 'zh-Hans-CN'));
}

export interface DrillRequest {
  section?: string | null;
  /** 归并后的多标签抽题（如完形在各年份卷中的不同 section 名） */
  sections?: string[] | null;
  type?: string | null;
  count?: number | null;
}

export interface DrillResult {
  set_version_id: string;
  question_count: number;
  label: string;
  type: string | null;
}

const DRILL_SET_TITLE = '专项练习（自动生成）';
const DRILL_MAX_QUESTIONS = 200;
const VALID_TYPES = ['single_choice', 'multiple_choice', 'true_false', 'fill_blank', 'free_text'];

/** 抽题组卷：材料整组保留不拆散，组间按最新导入优先；写入 kind='drill' 的内部题集新版本（须在调用方事务内）。 */
export function buildDrill(h: DbHandle, req: DrillRequest, opts: { now: string }): DrillResult {
  const count = Math.max(1, Math.min(DRILL_MAX_QUESTIONS, Math.floor(req.count ?? DRILL_MAX_QUESTIONS)));
  const rawSections = [...(req.sections ?? []), ...(req.section ? [req.section] : [])];
  const type = req.type ?? null;
  for (const s of rawSections) {
    if (typeof s !== 'string' || s.length === 0 || s.length > 100) throw new HttpError(400, 'INVALID_BODY', 'section 标签长度需在 1–100 字符之间');
  }
  if (rawSections.length > 20) throw new HttpError(400, 'INVALID_BODY', 'section 标签最多 20 个');
  if (type !== null && !VALID_TYPES.includes(type)) {
    throw new HttpError(400, 'INVALID_BODY', `不支持的题型 ${String(req.type)}`);
  }
  const sections = rawSections.length > 0 ? rawSections : null;
  const label = sections && sections.length > 0 ? normalizeSection(sections[0] ?? null, type) : type ? `题型练习` : '综合练习';

  const placeholders = sections ? sections.map(() => '?').join(', ') : null;
  const params: unknown[] = [...(sections ?? []), ...(type ? [type] : [])];
  const candidates = h.db.prepare(`
    SELECT qv.id AS vid, qv.section AS section, qv.type AS type, qv.material_id AS material_id
    FROM questions q JOIN question_versions qv ON qv.id = q.current_published_version_id
    WHERE (${sections ? `qv.section IN (${placeholders})` : '1=1'}) ${type ? 'AND qv.type = ?' : ''}
    ORDER BY qv.id DESC
  `).all(...params) as Array<{ vid: string; section: string | null; type: string; material_id: string | null }>;
  // 原卷顺序：题目版本在来源 paper 题集 entries 中的下标（uuidv7 同毫秒随机，不能按 id 排）
  const paperPos = new Map<string, number>();
  const paperSets = h.db.prepare("SELECT sv.entries_json AS entries_json FROM question_set_versions sv JOIN question_sets s ON s.id = sv.set_id WHERE s.kind = 'paper'").all() as Array<{ entries_json: string }>;
  for (const row of paperSets) {
    const entries = JSON.parse(row.entries_json) as Array<{ question_version_id: string }>;
    entries.forEach((e, i) => { if (!paperPos.has(e.question_version_id)) paperPos.set(e.question_version_id, i); });
  }
  if (candidates.length === 0) {
    throw new HttpError(422, 'NO_QUESTIONS', '题库里没有符合该条件的题目，请先导入试卷或调整筛选');
  }

  // 按材料成组（共享材料的题尽量整组保留；组超过剩余名额时截取该组前面的题目）
  const groups = new Map<string, Array<{ vid: string; section: string | null; type: string; material_id: string | null; pos: number }>>();
  for (const c of candidates) {
    const key = c.material_id ?? `q:${c.vid}`;
    const arr = groups.get(key) ?? [];
    arr.push({ ...c, pos: paperPos.get(c.vid) ?? Number.MAX_SAFE_INTEGER });
    groups.set(key, arr);
  }
  // 组内恢复原卷顺序（uuidv7 同毫秒随机，不能用 id 排序）；组间保持最新导入优先
  for (const arr of groups.values()) arr.sort((a, b) => a.pos - b.pos);
  const picked: Array<{ vid: string; section: string | null; type: string }> = [];
  for (const arr of groups.values()) {
    if (picked.length >= count) break;
    if (picked.length + arr.length <= count) {
      picked.push(...arr);
    } else {
      picked.push(...arr.slice(0, count - picked.length));
      break;
    }
  }
  const entries = picked.map((c, i) => ({ question_version_id: c.vid, order: i + 1 }));

  // 大题扉页声明：收录被选中题目的去重 section，标题用归一化题型名（"完形填空专项"），
  // 答题卡分组与扉页据此显示，不再暴露各年份卷的原始命名差异
  const sectionsOut: Array<{ id: string; title: string }> = [];
  const seenSection = new Set<string>();
  for (const c of picked) {
    if (!c.section || seenSection.has(c.section)) continue;
    seenSection.add(c.section);
    sectionsOut.push({ id: c.section, title: `${normalizeSection(c.section, c.type)}专项` });
  }

  // 内部 drill 题集：不存在则创建，每次专项练习追加一个新版本
  let set = h.db.prepare("SELECT id, current_version_id FROM question_sets WHERE kind = 'drill' ORDER BY created_at LIMIT 1").get() as { id: string; current_version_id: string | null } | undefined;
  const setVersionId = uuidv7();
  if (!set) {
    const setId = uuidv7();
    h.db.prepare("INSERT INTO question_sets (id, workspace_id, title, current_version_id, is_demo, kind, created_at, updated_at) VALUES (?, 'ws-default', ?, ?, 0, 'drill', ?, ?)")
      .run(setId, DRILL_SET_TITLE, setVersionId, opts.now, opts.now);
    set = { id: setId, current_version_id: null };
  }
  let version = 1;
  if (set.current_version_id) {
    const prev = h.db.prepare('SELECT version FROM question_set_versions WHERE id = ?').get(set.current_version_id) as { version: number } | undefined;
    version = (prev?.version ?? 0) + 1;
  }
  h.db.prepare('INSERT INTO question_set_versions (id, set_id, version, entries_json, sections_json, hash, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)')
    .run(setVersionId, set.id, version, JSON.stringify(entries), sectionsOut.length > 0 ? JSON.stringify(sectionsOut) : null, sha256Stable(entries), opts.now);
  h.db.prepare('UPDATE question_sets SET current_version_id = ?, updated_at = ? WHERE id = ?')
    .run(setVersionId, opts.now, set.id);

  return { set_version_id: setVersionId, question_count: entries.length, label, type };
}
