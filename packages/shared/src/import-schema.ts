import type { AnswerKey, MaterialBlock, Option, QuestionType } from './protocol.js';
import { IMPORT_PARSER_VERSION } from './protocol.js';

/** 导入 JSON 的目标形态（固定模板协议，不是任意排版识别——白皮书 §7.2）。 */
export const SUPPORTED_SPEC_VERSIONS = ['1.1'] as const;

/** 试卷级元数据（TestPaperJSON 规格 1.1）。全部可选但强烈建议填写。 */
export interface ImportMeta {
  year?: number;
  paper?: string;
  title?: string;
  total_score_units?: number;
  duration_minutes?: number;
  source_file?: string;
  source_images?: string;
  converted_by?: string;
  converted_at?: string;
  license_note?: string;
  notes?: string;
}

export interface ImportQuestion {
  id: string;
  type: QuestionType;
  stem: string;
  options?: Option[];
  /** 题目配图：相对试卷目录的 POSIX 相对路径（如 images/2000/xxx.jpg），最多 10 张 */
  images?: string[];
  material_id?: string;
  answer_key?: AnswerKey | null;
  explanation?: string;
  max_score_units: number;
  tags?: string[];
  source_note?: string;
  section?: string;
  source_ref?: string;
}

export interface ImportMaterial {
  id: string;
  title: string;
  blocks: MaterialBlock[];
  source_note?: string;
  section?: string;
  source_ref?: string;
}

/** 大题声明（章节扉页）：id 与 materials[]/questions[] 的 section 字段同名引用。 */
export interface ImportSection {
  /** 卷内唯一，同 questions[].section 引用值 */
  id: string;
  /** 原卷 Part 标签，如 "Part A"、"Section I" */
  part?: string;
  /** 大题中文名，如 "完形填空" */
  title: string;
  /** 原卷 Directions，逐行一条 */
  directions?: string[];
}

export interface ImportPayload {
  set: { title: string };
  meta?: ImportMeta;
  sections?: ImportSection[];
  materials?: ImportMaterial[];
  questions: ImportQuestion[];
}

export interface ValidationIssue {
  level: 'error' | 'warning';
  code: string;
  message: string;
  question_id?: string;
  field?: string;
}

export interface ParseOutcome {
  parser_version: string;
  payload: ImportPayload | null;
  issues: ValidationIssue[];
  question_count: number;
  error_count: number;
  warning_count: number;
}

export const IMPORT_LIMITS = {
  content_max_bytes: 10 * 1024 * 1024,
  stem_max_chars: 50_000,
  option_text_max_chars: 10_000,
  option_min: 2,
  option_max: 10,
  max_score_units_min: 1,
  max_score_units_max: 1_000_000,
  questions_max: 500,
  explanation_max_chars: 50_000,
  block_text_max_chars: 200_000,
} as const;

const QUESTION_TYPES: ReadonlySet<string> = new Set(['single_choice', 'multiple_choice', 'true_false', 'fill_blank', 'free_text']);

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

function checkUnknownKeys(obj: Record<string, unknown>, allowed: string[], where: string, issues: ValidationIssue[]): void {
  for (const k of Object.keys(obj)) {
    if (!allowed.includes(k)) {
      issues.push({ level: 'error', code: 'UNKNOWN_FIELD', message: `${where} 含未知字段 "${k}"`, field: k });
    }
  }
}

/**
 * 解析并校验导入 JSON（docs/02 §3.2、docs/01 §6）。
 * 错误阻止对应候选发布；警告需用户显式确认。
 */
export function parseImport(raw: string): ParseOutcome {
  const issues: ValidationIssue[] = [];
  if (Buffer.byteLength(raw, 'utf8') > IMPORT_LIMITS.content_max_bytes) {
    return { parser_version: IMPORT_PARSER_VERSION, payload: null, issues: [{ level: 'error', code: 'TOO_LARGE', message: `导入内容超过 ${IMPORT_LIMITS.content_max_bytes / 1024 / 1024}MB 上限` }], question_count: 0, error_count: 1, warning_count: 0 };
  }
  let root: unknown;
  try {
    root = JSON.parse(raw);
  } catch (e) {
    return { parser_version: IMPORT_PARSER_VERSION, payload: null, issues: [{ level: 'error', code: 'INVALID_JSON', message: `JSON 解析失败：${(e as Error).message}` }], question_count: 0, error_count: 1, warning_count: 0 };
  }
  if (!isRecord(root)) {
    return { parser_version: IMPORT_PARSER_VERSION, payload: null, issues: [{ level: 'error', code: 'INVALID_JSON', message: '顶层必须是 JSON 对象' }], question_count: 0, error_count: 1, warning_count: 0 };
  }
  checkUnknownKeys(root, ['spec_version', 'meta', 'set', 'sections', 'materials', 'questions'], '顶层', issues);
  if (root['spec_version'] !== undefined && root['spec_version'] !== '1.1') {
    issues.push({ level: 'error', code: 'UNSUPPORTED_SPEC_VERSION', message: `spec_version "${String(root['spec_version'])}" 不受支持，当前仅 1.1` });
  }
  let meta: ImportMeta | undefined;
  if (root['meta'] !== undefined) {
    if (!isRecord(root['meta'])) {
      issues.push({ level: 'error', code: 'INVALID_META', message: 'meta 必须是对象' });
    } else {
      checkUnknownKeys(root['meta'], ['year', 'paper', 'title', 'total_score_units', 'duration_minutes', 'source_file', 'source_images', 'converted_by', 'converted_at', 'license_note', 'notes'], 'meta', issues);
      meta = {};
      const m = root['meta'] as Record<string, unknown>;
      if (m['year'] !== undefined) {
        if (!Number.isInteger(m['year']) || (m['year'] as number) < 1980 || (m['year'] as number) > 2100) {
          issues.push({ level: 'error', code: 'INVALID_META', message: `meta.year 必须是 1980–2100 的整数，收到 ${JSON.stringify(m['year'])}`, field: 'meta.year' });
        } else {
          meta.year = m['year'] as number;
        }
      }
      for (const k of ['paper', 'title', 'source_file', 'source_images', 'converted_by', 'converted_at', 'license_note', 'notes'] as const) {
        if (m[k] !== undefined) {
          if (typeof m[k] !== 'string' || (m[k] as string).length === 0 || (m[k] as string).length > 500) {
            issues.push({ level: 'error', code: 'INVALID_META', message: `meta.${k} 必须是 1–500 字符的字符串`, field: `meta.${k}` });
          } else {
            meta[k] = m[k] as string;
          }
        }
      }
      for (const k of ['total_score_units', 'duration_minutes'] as const) {
        if (m[k] !== undefined) {
          if (!Number.isInteger(m[k]) || (m[k] as number) <= 0) {
            issues.push({ level: 'error', code: 'INVALID_META', message: `meta.${k} 必须是正整数`, field: `meta.${k}` });
          } else {
            meta[k] = m[k] as number;
          }
        }
      }
    }
  }
  const setRaw = root['set'];
  if (!isRecord(setRaw) || typeof setRaw['title'] !== 'string' || setRaw['title'].trim().length === 0) {
    issues.push({ level: 'error', code: 'SET_TITLE_REQUIRED', message: '缺少题集标题 set.title' });
  }
  const questionsRaw = root['questions'];
  if (!Array.isArray(questionsRaw) || questionsRaw.length === 0) {
    issues.push({ level: 'error', code: 'QUESTIONS_REQUIRED', message: 'questions 必须是非空数组' });
    return { parser_version: IMPORT_PARSER_VERSION, payload: null, issues, question_count: 0, error_count: issues.filter((i) => i.level === 'error').length, warning_count: issues.filter((i) => i.level === 'warning').length };
  }
  if (questionsRaw.length > IMPORT_LIMITS.questions_max) {
    issues.push({ level: 'error', code: 'TOO_MANY_QUESTIONS', message: `题数超过 ${IMPORT_LIMITS.questions_max} 上限` });
  }

  const materials: ImportMaterial[] = [];
  const matIds = new Set<string>();
  const sectionIds = new Set<string>();
  if (root['sections'] !== undefined) {
    if (!Array.isArray(root['sections'])) {
      issues.push({ level: 'error', code: 'INVALID_SECTIONS', message: 'sections 必须是数组' });
    } else {
      if (root['sections'].length > 20) issues.push({ level: 'error', code: 'INVALID_SECTIONS', message: 'sections 超过 20 个大题上限' });
      for (const s of root['sections'] as unknown[]) {
        if (!isRecord(s)) { issues.push({ level: 'error', code: 'INVALID_SECTION_DECL', message: 'sections 数组元素必须是对象' }); continue; }
        checkUnknownKeys(s, ['id', 'part', 'title', 'directions'], 'sections[]', issues);
        const sid = typeof s['id'] === 'string' ? s['id'] : '';
        if (!sid || sid.length > 100) {
          issues.push({ level: 'error', code: 'SECTION_ID_REQUIRED', message: `大题声明缺少 1–100 字符的 id`, field: 'sections[].id' });
        } else if (sectionIds.has(sid)) {
          issues.push({ level: 'error', code: 'DUPLICATE_SECTION_ID', message: `大题 id 重复：${sid}`, field: 'sections[].id' });
        } else {
          sectionIds.add(sid);
        }
        if (s['part'] !== undefined && (typeof s['part'] !== 'string' || (s['part'] as string).length === 0 || (s['part'] as string).length > 100)) {
          issues.push({ level: 'error', code: 'INVALID_SECTION_DECL', message: `大题 ${sid} 的 part 必须是 1–100 字符字符串`, field: 'sections[].part' });
        }
        const stitle = s['title'];
        if (typeof stitle !== 'string' || stitle.length === 0 || stitle.length > 100) {
          issues.push({ level: 'error', code: 'INVALID_SECTION_DECL', message: `大题 ${sid} 缺少 1–100 字符的 title`, field: 'sections[].title' });
        }
        const dirs = s['directions'];
        if (dirs !== undefined) {
          if (!Array.isArray(dirs) || dirs.length > 12 || !dirs.every((d) => typeof d === 'string' && d.length > 0 && d.length <= 4000)) {
            issues.push({ level: 'error', code: 'INVALID_SECTION_DECL', message: `大题 ${sid} 的 directions 必须是不超过 12 行、每行 1–4000 字符的字符串数组`, field: 'sections[].directions' });
          }
        }
      }
    }
  }
  if (root['materials'] !== undefined) {
    if (!Array.isArray(root['materials'])) issues.push({ level: 'error', code: 'INVALID_MATERIALS', message: 'materials 必须是数组' });
    else {
      for (const m of root['materials']) {
        if (!isRecord(m)) { issues.push({ level: 'error', code: 'INVALID_MATERIAL', message: 'materials 数组元素必须是对象' }); continue; }
        checkUnknownKeys(m, ['id', 'title', 'blocks', 'source_note', 'section', 'source_ref'], 'materials[]', issues);
        const id = typeof m['id'] === 'string' ? m['id'] : '';
        const title = typeof m['title'] === 'string' ? m['title'] : '';
        const blocksRaw = Array.isArray(m['blocks']) ? m['blocks'] : [];
        const blocks: MaterialBlock[] = [];
        blocksRaw.forEach((b, bi) => {
          if (!isRecord(b)) { issues.push({ level: 'error', code: 'INVALID_BLOCK', message: `材料 ${id || bi} 的 blocks[${bi}] 必须是对象`, field: 'blocks' }); return; }
          checkUnknownKeys(b, ['id', 'type', 'text'], `materials[${id}].blocks[${bi}]`, issues);
          const text = typeof b['text'] === 'string' ? b['text'] : '';
          if (text.length === 0) issues.push({ level: 'error', code: 'EMPTY_BLOCK', message: `材料 ${id} 的段落 ${b['id'] ?? bi} 文本为空`, field: 'blocks' });
          if (text.length > IMPORT_LIMITS.block_text_max_chars) issues.push({ level: 'error', code: 'BLOCK_TOO_LONG', message: `材料 ${id} 的段落超出长度上限`, field: 'blocks' });
          if (typeof b['type'] === 'string' && b['type'] !== 'paragraph') issues.push({ level: 'error', code: 'UNSUPPORTED_BLOCK_TYPE', message: `材料 ${id} 的段落类型 ${b['type']} 不受支持（P0 仅 paragraph）`, field: 'blocks' });
          blocks.push({ id: typeof b['id'] === 'string' ? b['id'] : `${id}-b${bi + 1}`, type: 'paragraph', text });
        });
        if (!id) issues.push({ level: 'error', code: 'MATERIAL_ID_REQUIRED', message: '材料缺少 id', field: 'id' });
        else if (matIds.has(id)) issues.push({ level: 'error', code: 'DUPLICATE_MATERIAL_ID', message: `材料 id 重复：${id}`, field: 'id' });
        else matIds.add(id);
        if (!title) issues.push({ level: 'error', code: 'MATERIAL_TITLE_REQUIRED', message: `材料 ${id} 缺少标题`, field: 'title' });
        if (m['section'] !== undefined && (typeof m['section'] !== 'string' || (m['section'] as string).length === 0 || (m['section'] as string).length > 100)) {
          issues.push({ level: 'error', code: 'INVALID_SECTION', message: `材料 ${id} 的 section 必须是 1–100 字符字符串`, field: 'section' });
        }
        if (m['source_ref'] !== undefined && (typeof m['source_ref'] !== 'string' || (m['source_ref'] as string).length === 0 || (m['source_ref'] as string).length > 200)) {
          issues.push({ level: 'error', code: 'INVALID_SOURCE_REF', message: `材料 ${id} 的 source_ref 必须是 1–200 字符字符串`, field: 'source_ref' });
        }
        materials.push({ id, title, blocks, source_note: typeof m['source_note'] === 'string' ? m['source_note'] : undefined, section: typeof m['section'] === 'string' ? m['section'] : undefined, source_ref: typeof m['source_ref'] === 'string' ? m['source_ref'] : undefined });
      }
    }
  }

  const questions: ImportQuestion[] = [];
  const qIds = new Set<string>();
  questionsRaw.forEach((qRaw, qi) => {
    const qidLabel = isRecord(qRaw) && typeof qRaw['id'] === 'string' ? qRaw['id'] : `#${qi + 1}`;
    if (!isRecord(qRaw)) { issues.push({ level: 'error', code: 'INVALID_QUESTION', message: `第 ${qi + 1} 题必须是对象`, question_id: qidLabel }); return; }
    checkUnknownKeys(qRaw, ['id', 'type', 'stem', 'options', 'images', 'material_id', 'answer_key', 'explanation', 'max_score_units', 'tags', 'source_note', 'section', 'source_ref'], `题目 ${qidLabel}`, issues);
    const id = typeof qRaw['id'] === 'string' && qRaw['id'].length > 0 ? qRaw['id'] : '';
    if (!id) issues.push({ level: 'error', code: 'QUESTION_ID_REQUIRED', message: `第 ${qi + 1} 题缺少 id`, field: 'id' });
    else if (qIds.has(id)) issues.push({ level: 'error', code: 'DUPLICATE_QUESTION_ID', message: `题目 id 重复：${id}`, question_id: id, field: 'id' });
    else qIds.add(id);

    const type = qRaw['type'];
    if (typeof type !== 'string' || !QUESTION_TYPES.has(type)) {
      issues.push({ level: 'error', code: 'UNKNOWN_TYPE', message: `题目 ${qidLabel} 的题型未声明或不支持`, question_id: id, field: 'type' });
      return; // 无法按题型继续校验
    }
    const qType = type as QuestionType;

    const stem = qRaw['stem'];
    if (typeof stem !== 'string' || stem.trim().length === 0) {
      issues.push({ level: 'error', code: 'EMPTY_STEM', message: `题目 ${qidLabel} 题干为空`, question_id: id, field: 'stem' });
    } else if (stem.length > IMPORT_LIMITS.stem_max_chars) {
      issues.push({ level: 'error', code: 'STEM_TOO_LONG', message: `题目 ${qidLabel} 题干超出长度上限`, question_id: id, field: 'stem' });
    }

    const maxScore = qRaw['max_score_units'];
    if (!Number.isInteger(maxScore) || (maxScore as number) < IMPORT_LIMITS.max_score_units_min || (maxScore as number) > IMPORT_LIMITS.max_score_units_max) {
      issues.push({ level: 'error', code: 'INVALID_SCORE', message: `题目 ${qidLabel} 的 max_score_units 必须是 ${IMPORT_LIMITS.max_score_units_min}–${IMPORT_LIMITS.max_score_units_max} 的整数`, question_id: id, field: 'max_score_units' });
    }

    const explanation = qRaw['explanation'];
    if (explanation !== undefined && (typeof explanation !== 'string' || explanation.length > IMPORT_LIMITS.explanation_max_chars)) {
      issues.push({ level: 'error', code: 'EXPLANATION_TOO_LONG', message: `题目 ${qidLabel} 解析超长`, question_id: id, field: 'explanation' });
    }

    let options: Option[] | undefined;
    let optionIds: string[] | null = null;
    if (qType === 'single_choice' || qType === 'multiple_choice') {
      const optRaw = qRaw['options'];
      if (!Array.isArray(optRaw)) {
        issues.push({ level: 'error', code: 'OPTIONS_REQUIRED', message: `题目 ${qidLabel} 缺少 options`, question_id: id, field: 'options' });
      } else if (optRaw.length < IMPORT_LIMITS.option_min || optRaw.length > IMPORT_LIMITS.option_max) {
        issues.push({ level: 'error', code: 'OPTIONS_COUNT', message: `题目 ${qidLabel} 选项数必须在 ${IMPORT_LIMITS.option_min}–${IMPORT_LIMITS.option_max} 之间`, question_id: id, field: 'options' });
      } else {
        options = [];
        optionIds = [];
        for (const o of optRaw) {
          if (!isRecord(o) || typeof o['id'] !== 'string' || o['id'].length === 0 || typeof o['text'] !== 'string' || o['text'].length === 0) {
            issues.push({ level: 'error', code: 'INVALID_OPTION', message: `题目 ${qidLabel} 存在空 id 或空文本的选项`, question_id: id, field: 'options' });
            continue;
          }
          if (o['text'].length > IMPORT_LIMITS.option_text_max_chars) issues.push({ level: 'error', code: 'OPTION_TOO_LONG', message: `题目 ${qidLabel} 选项 ${o['id']} 文本超长`, question_id: id, field: 'options' });
          if (optionIds.includes(o['id'])) issues.push({ level: 'error', code: 'DUPLICATE_OPTION_ID', message: `题目 ${qidLabel} 选项 id 重复：${o['id']}`, question_id: id, field: 'options' });
          else optionIds.push(o['id']);
          options.push({ id: o['id'], text: o['text'] });
        }
      }
    } else if (qRaw['options'] !== undefined) {
      issues.push({ level: 'error', code: 'OPTIONS_NOT_ALLOWED', message: `题目 ${qidLabel} 的题型 ${qType} 不应有 options`, question_id: id, field: 'options' });
    }

    // 题目配图：相对路径数组，供答题页左栏与报告还原原图
    let images: string[] | undefined;
    const imagesRaw = qRaw['images'];
    if (imagesRaw !== undefined) {
      if (!Array.isArray(imagesRaw) || imagesRaw.length === 0 || imagesRaw.length > 10) {
        issues.push({ level: 'error', code: 'INVALID_IMAGES', message: `题目 ${qidLabel} 的 images 必须是 1–10 个元素的字符串数组`, question_id: id, field: 'images' });
      } else {
        images = [];
        for (const img of imagesRaw) {
          if (typeof img !== 'string' || img.length === 0 || img.length > 500 || img.includes('\\') || img.startsWith('/') || /^[a-zA-Z]:/.test(img) || img.split('/').includes('..')) {
            issues.push({ level: 'error', code: 'INVALID_IMAGE_PATH', message: `题目 ${qidLabel} 的图片路径必须是相对试卷目录的 POSIX 相对路径（不含盘符、反斜杠、绝对路径或 ..）`, question_id: id, field: 'images' });
            continue;
          }
          images.push(img);
        }
      }
    }

    const materialId = qRaw['material_id'];
    if (materialId !== undefined) {
      if (typeof materialId !== 'string' || !matIds.has(materialId)) {
        issues.push({ level: 'error', code: 'MATERIAL_NOT_FOUND', message: `题目 ${qidLabel} 引用的材料 ${JSON.stringify(materialId ?? null)} 不存在`, question_id: id, field: 'material_id' });
      }
    }

    const keyRaw = qRaw['answer_key'];
    let answerKey: AnswerKey | null = null;
    if (keyRaw === undefined || keyRaw === null) {
      issues.push({ level: 'warning', code: 'NO_ANSWER_KEY', message: `题目 ${qidLabel} 未提供答案，本题将待评（无法自动判分）`, question_id: id, field: 'answer_key' });
    } else if (isRecord(keyRaw)) {
      answerKey = validateKey(qType, keyRaw, optionIds, id, qidLabel, typeof maxScore === 'number' ? maxScore : 0, issues);
    } else {
      issues.push({ level: 'error', code: 'INVALID_KEY', message: `题目 ${qidLabel} 的 answer_key 必须是对象`, question_id: id, field: 'answer_key' });
    }

    if (explanation === undefined) {
      issues.push({ level: 'warning', code: 'NO_EXPLANATION', message: `题目 ${qidLabel} 缺少解析`, question_id: id, field: 'explanation' });
    }
    for (const [k, maxLen] of [['section', 100], ['source_ref', 200]] as const) {
      const v = qRaw[k];
      if (v !== undefined && (typeof v !== 'string' || (v as string).length === 0 || (v as string).length > maxLen)) {
        issues.push({ level: 'error', code: k === 'section' ? 'INVALID_SECTION' : 'INVALID_SOURCE_REF', message: `题目 ${qidLabel} 的 ${k} 必须是 1–${maxLen} 字符字符串`, question_id: id, field: k });
      }
    }

    questions.push({
      id, type: qType,
      stem: typeof stem === 'string' ? stem : '',
      options, images,
      material_id: typeof materialId === 'string' ? materialId : undefined,
      answer_key: keyRaw === undefined ? null : answerKey,
      explanation: typeof explanation === 'string' ? explanation : undefined,
      max_score_units: Number.isInteger(maxScore) ? (maxScore as number) : 0,
      tags: Array.isArray(qRaw['tags']) ? qRaw['tags'].map(String) : undefined,
      source_note: typeof qRaw['source_note'] === 'string' ? qRaw['source_note'] : undefined,
      section: typeof qRaw['section'] === 'string' ? qRaw['section'] : undefined,
      source_ref: typeof qRaw['source_ref'] === 'string' ? qRaw['source_ref'] : undefined,
    });
  });

  // 交叉校验：声明了 sections 时，materials/questions 的 section 应引用已声明的大题
  const sectionsOut: ImportSection[] = [];
  if (Array.isArray(root['sections'])) {
    for (const s of root['sections'] as Array<Record<string, unknown>>) {
      if (!isRecord(s) || typeof s['id'] !== 'string' || !sectionIds.has(s['id'])) continue;
      sectionsOut.push({
        id: s['id'],
        part: typeof s['part'] === 'string' ? s['part'] : undefined,
        title: typeof s['title'] === 'string' ? s['title'] : '',
        directions: Array.isArray(s['directions']) ? (s['directions'] as string[]).map(String) : undefined,
      });
    }
    for (const q of questions) {
      if (q.section && !sectionIds.has(q.section)) {
        issues.push({ level: 'warning', code: 'SECTION_NOT_DECLARED', message: `题目 ${q.id} 的 section "${q.section}" 未在 sections 中声明（答题页将没有该大题的扉页说明）`, question_id: q.id, field: 'section' });
      }
    }
    for (const m of materials) {
      if (m.section && !sectionIds.has(m.section)) {
        issues.push({ level: 'warning', code: 'SECTION_NOT_DECLARED', message: `材料 ${m.id} 的 section "${m.section}" 未在 sections 中声明`, field: 'section' });
      }
    }
  }

  const error_count = issues.filter((i) => i.level === 'error').length;
  const warning_count = issues.filter((i) => i.level === 'warning').length;
  return {
    parser_version: IMPORT_PARSER_VERSION,
    payload: error_count === 0 ? { set: { title: (root['set'] as { title: string })?.title ?? '' }, meta, sections: sectionsOut.length > 0 ? sectionsOut : undefined, materials, questions } : null,
    issues,
    question_count: questions.length,
    error_count,
    warning_count,
  };
}

function validateKey(
  qType: QuestionType,
  key: Record<string, unknown>,
  optionIds: string[] | null,
  id: string,
  label: string,
  qMaxScore: number,
  issues: ValidationIssue[],
): AnswerKey {
  switch (qType) {
    case 'single_choice':
    case 'multiple_choice': {
      checkUnknownKeys(key, ['selected_option_ids'], `题目 ${label} answer_key`, issues);
      const ids = key['selected_option_ids'];
      if (!Array.isArray(ids) || ids.length === 0 || !ids.every((x) => typeof x === 'string')) {
        issues.push({ level: 'error', code: 'INVALID_KEY', message: `题目 ${label} 的答案必须是选项 id 数组`, question_id: id, field: 'answer_key' });
        return { selected_option_ids: [] };
      }
      if (qType === 'single_choice' && ids.length !== 1) {
        issues.push({ level: 'error', code: 'INVALID_KEY', message: `题目 ${label} 单选答案必须恰好一项`, question_id: id, field: 'answer_key' });
      }
      if (optionIds !== null) {
        for (const oid of ids) {
          if (!optionIds.includes(oid as string)) {
            issues.push({ level: 'error', code: 'KEY_OPTION_NOT_FOUND', message: `题目 ${label} 的答案引用了不存在的选项 ${oid}`, question_id: id, field: 'answer_key' });
          }
        }
      }
      return { selected_option_ids: ids.map(String) };
    }
    case 'true_false': {
      checkUnknownKeys(key, ['value'], `题目 ${label} answer_key`, issues);
      if (typeof key['value'] !== 'boolean') {
        issues.push({ level: 'error', code: 'INVALID_KEY', message: `题目 ${label} 判断题答案必须是布尔`, question_id: id, field: 'answer_key' });
        return { value: false };
      }
      return { value: key['value'] as boolean };
    }
    case 'fill_blank': {
      checkUnknownKeys(key, ['blanks'], `题目 ${label} answer_key`, issues);
      const blanksRaw = key['blanks'];
      if (!Array.isArray(blanksRaw) || blanksRaw.length === 0) {
        issues.push({ level: 'error', code: 'INVALID_KEY', message: `题目 ${label} 填空答案必须有 blanks 数组`, question_id: id, field: 'answer_key' });
        return { blanks: [] };
      }
      const blanks = [];
      for (const b of blanksRaw) {
        if (!isRecord(b)) { issues.push({ level: 'error', code: 'INVALID_KEY', message: `题目 ${label} 的 blank 必须是对象`, question_id: id, field: 'answer_key' }); continue; }
        checkUnknownKeys(b, ['blank_id', 'accepted_values', 'score_units', 'trim_outer_whitespace', 'case_sensitive', 'collapse_internal_whitespace'], `题目 ${label} blank`, issues);
        const okId = typeof b['blank_id'] === 'string' && b['blank_id'].length > 0;
        const okVals = Array.isArray(b['accepted_values']) && b['accepted_values'].length > 0 && b['accepted_values'].every((v) => typeof v === 'string' && v.length > 0);
        const okScore = Number.isInteger(b['score_units']) && (b['score_units'] as number) >= 0;
        const flags = ['trim_outer_whitespace', 'case_sensitive', 'collapse_internal_whitespace'].every((f) => typeof b[f] === 'boolean');
        if (!okId) issues.push({ level: 'error', code: 'INVALID_KEY', message: `题目 ${label} 的 blank 缺少 blank_id`, question_id: id, field: 'answer_key' });
        if (!okVals) issues.push({ level: 'error', code: 'INVALID_KEY', message: `题目 ${label} 的 blank 缺少非空 accepted_values`, question_id: id, field: 'answer_key' });
        if (!okScore) issues.push({ level: 'error', code: 'INVALID_SCORE', message: `题目 ${label} 的 blank 分值无效`, question_id: id, field: 'answer_key' });
        if (!flags) issues.push({ level: 'error', code: 'BLANK_FLAGS_REQUIRED', message: `题目 ${label} 的 blank 必须显式声明三个归一化开关`, question_id: id, field: 'answer_key' });
        if (okId && okVals && okScore && flags) {
          blanks.push({ blank_id: b['blank_id'] as string, accepted_values: b['accepted_values'] as string[], score_units: b['score_units'] as number, trim_outer_whitespace: b['trim_outer_whitespace'] as boolean, case_sensitive: b['case_sensitive'] as boolean, collapse_internal_whitespace: b['collapse_internal_whitespace'] as boolean });
        }
      }
      if (blanks.length > 0 && Number.isInteger(qMaxScore) && (qMaxScore as number) > 0) {
        const sum = blanks.reduce((a, b) => a + b.score_units, 0);
        if (sum !== qMaxScore) {
          issues.push({ level: 'error', code: 'FILL_SCORE_SUM', message: `题目 ${label} 各空分值之和 ${sum} ≠ 本题满分 ${qMaxScore}`, question_id: id, field: 'answer_key' });
        }
      }
      return { blanks };
    }
    case 'free_text': {
      checkUnknownKeys(key, ['reference_text', 'rubric'], `题目 ${label} answer_key`, issues);
      const out: AnswerKey = {};
      if (typeof key['reference_text'] === 'string') out.reference_text = key['reference_text'];
      if (typeof key['rubric'] === 'string') out.rubric = key['rubric'];
      return out;
    }
  }
}
