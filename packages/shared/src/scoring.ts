import type {
  Answer,
  AnswerKey,
  AttemptAggregate,
  QuestionType,
  ScoredItem,
} from './protocol.js';
import { RULE_VERSION } from './protocol.js';

function basis(rule: string): string {
  return `rule:${rule}@${RULE_VERSION}`;
}

function normFillText(
  text: string,
  spec: { trim_outer_whitespace: boolean; case_sensitive: boolean; collapse_internal_whitespace: boolean },
): string {
  let t = text.normalize('NFC');
  if (spec.trim_outer_whitespace) t = t.trim();
  if (spec.collapse_internal_whitespace) t = t.replace(/\s+/g, ' ');
  if (!spec.case_sensitive) t = t.toLowerCase();
  return t;
}

/** 判定答案是否有任何内容（docs/02 §3.4：不能用 truthy 判断 false）。 */
export function isAnswered(type: QuestionType, answer: Answer): boolean {
  if (answer === null || answer === undefined) return false;
  switch (type) {
    case 'single_choice':
    case 'multiple_choice':
      return 'selected_option_ids' in answer && Array.isArray(answer.selected_option_ids) && answer.selected_option_ids.length > 0;
    case 'true_false':
      return 'value' in answer && typeof answer.value === 'boolean';
    case 'fill_blank':
      return 'blanks' in answer && Array.isArray(answer.blanks) && answer.blanks.some((b) => typeof b.text === 'string' && b.text.length > 0);
    case 'free_text':
      return 'text' in answer && typeof answer.text === 'string' && answer.text.length > 0;
  }
}

/** 判分键是否可执行：引用缺失/形态错误 → invalid，不得判用户零分（docs/02 §3.3）。 */
export function isKeyValid(type: QuestionType, key: AnswerKey | null, optionIds: string[] | null): boolean {
  if (key === null || key === undefined) return false;
  switch (type) {
    case 'single_choice': {
      const k = key as { selected_option_ids?: unknown };
      if (!Array.isArray(k.selected_option_ids) || k.selected_option_ids.length !== 1) return false;
      return optionIds === null || k.selected_option_ids.every((id) => optionIds.includes(String(id)));
    }
    case 'multiple_choice': {
      const k = key as { selected_option_ids?: unknown };
      if (!Array.isArray(k.selected_option_ids) || k.selected_option_ids.length === 0) return false;
      const uniq = new Set(k.selected_option_ids.map(String));
      if (uniq.size !== k.selected_option_ids.length) return false;
      return optionIds === null || k.selected_option_ids.every((id) => optionIds.includes(String(id)));
    }
    case 'true_false':
      return typeof (key as { value?: unknown }).value === 'boolean';
    case 'fill_blank': {
      const k = key as { blanks?: Array<{ blank_id: unknown; accepted_values: unknown; score_units: unknown }> };
      if (!Array.isArray(k.blanks) || k.blanks.length === 0) return false;
      return k.blanks.every(
        (b) =>
          typeof b.blank_id === 'string' &&
          Array.isArray(b.accepted_values) &&
          b.accepted_values.length > 0 &&
          Number.isInteger(b.score_units) &&
          (b.score_units as number) >= 0,
      );
    }
    case 'free_text':
      return true; // 参考答案/rubric 不参与自动判分
  }
}

/**
 * 纯函数判分（docs/02 §3.3）。绝不读取网络、时间或全局状态。
 * optionIds 用于校验 key 引用；无选项表（free_text 等）传 null。
 */
export function gradeCore(
  type: QuestionType,
  answer: Answer,
  key: AnswerKey | null,
  maxScoreUnits: number,
  optionIds: string[] | null,
): { answer_status: 'answered' | 'unanswered'; grading_status: 'graded' | 'pending' | 'invalid'; correctness: 'correct' | 'incorrect' | 'partial' | 'unanswered' | null; earned_score_units: number | null; basis: string } {
  const answered = isAnswered(type, answer);
  switch (type) {
    case 'single_choice':
    case 'multiple_choice':
    case 'true_false': {
      if (!isKeyValid(type, key, optionIds)) {
        return { answer_status: answered ? 'answered' : 'unanswered', grading_status: 'invalid', correctness: null, earned_score_units: null, basis: basis('invalid_key') };
      }
      if (!answered) {
        return { answer_status: 'unanswered', grading_status: 'graded', correctness: 'unanswered', earned_score_units: 0, basis: basis('unanswered_zero') };
      }
      if (type === 'single_choice') {
        const sel = (answer as { selected_option_ids: string[] }).selected_option_ids;
        const want = (key as { selected_option_ids: string[] }).selected_option_ids;
        const ok = sel.length === 1 && sel.every((s) => want.includes(s));
        return { answer_status: 'answered', grading_status: 'graded', correctness: ok ? 'correct' : 'incorrect', earned_score_units: ok ? maxScoreUnits : 0, basis: basis('exact_option_match') };
      }
      if (type === 'multiple_choice') {
        const sel = new Set((answer as { selected_option_ids: string[] }).selected_option_ids.map(String));
        const want = new Set((key as { selected_option_ids: string[] }).selected_option_ids.map(String));
        const ok = sel.size === want.size && [...sel].every((id) => want.has(id));
        return { answer_status: 'answered', grading_status: 'graded', correctness: ok ? 'correct' : 'incorrect', earned_score_units: ok ? maxScoreUnits : 0, basis: basis('set_equality') };
      }
      const ok = (answer as { value: boolean }).value === (key as { value: boolean }).value;
      return { answer_status: 'answered', grading_status: 'graded', correctness: ok ? 'correct' : 'incorrect', earned_score_units: ok ? maxScoreUnits : 0, basis: basis('boolean_equal') };
    }
    case 'fill_blank': {
      if (!isKeyValid(type, key, optionIds)) {
        return { answer_status: answered ? 'answered' : 'unanswered', grading_status: 'invalid', correctness: null, earned_score_units: null, basis: basis('invalid_key') };
      }
      if (!answered) {
        return { answer_status: 'unanswered', grading_status: 'graded', correctness: 'unanswered', earned_score_units: 0, basis: basis('unanswered_zero') };
      }
      const blanks = (key as { blanks: Array<{ blank_id: string; accepted_values: string[]; score_units: number; trim_outer_whitespace: boolean; case_sensitive: boolean; collapse_internal_whitespace: boolean }> }).blanks;
      const given = new Map((answer as { blanks: { blank_id: string; text: string }[] }).blanks.map((b) => [b.blank_id, b.text]));
      let earned = 0;
      for (const spec of blanks) {
        const raw = given.get(spec.blank_id);
        if (typeof raw !== 'string' || raw.length === 0) continue; // 空白 = 0 分，不是错误
        const norm = normFillText(raw, spec);
        if (spec.accepted_values.some((acc) => normFillText(acc, spec) === norm)) {
          earned += spec.score_units;
        }
      }
      const correctness = earned >= maxScoreUnits ? 'correct' : earned === 0 ? 'incorrect' : 'partial';
      return { answer_status: 'answered', grading_status: 'graded', correctness, earned_score_units: Math.min(earned, maxScoreUnits), basis: basis('blank_accepted_values') };
    }
    case 'free_text':
      // 无论空白与否先 pending；人工可明确给空白 0 分（docs/02 §3.3）。
      return { answer_status: answered ? 'answered' : 'unanswered', grading_status: 'pending', correctness: null, earned_score_units: null, basis: basis('manual_pending') };
  }
}

const OBJECTIVE_TYPES: ReadonlySet<QuestionType> = new Set(['single_choice', 'multiple_choice', 'true_false', 'fill_blank']);

/** 整卷聚合（docs/02 §3.4）。整数运算；比率以精确分数返回，展示时统一 half-up。 */
export function aggregate(items: ScoredItem[]): AttemptAggregate {
  let total_max = 0, graded_max = 0, earned = 0, pending_max = 0;
  let answered_count = 0, correct_count = 0, incorrect_count = 0, unanswered_count = 0;
  let partial_count = 0, pending_count = 0, invalid_count = 0;
  let objAll = 0, objGraded = 0, objAnsweredGraded = 0, objAnsweredAll = 0;
  for (const it of items) {
    total_max += it.max_score_units;
    if (it.grading_status === 'graded') {
      graded_max += it.max_score_units;
      earned += it.earned_score_units ?? 0;
      if (it.correctness === 'correct') correct_count += 1;
      else if (it.correctness === 'unanswered') unanswered_count += 1;
      else if (it.correctness === 'incorrect') incorrect_count += 1;
      else if (it.correctness === 'partial') partial_count += 1;
    } else if (it.grading_status === 'pending') {
      pending_max += it.max_score_units;
      pending_count += 1;
    } else {
      pending_max += it.max_score_units; // invalid 计入待定满分，不进已判分母
      invalid_count += 1;
    }
    if (it.answer_status === 'answered') answered_count += 1;
    if (OBJECTIVE_TYPES.has(it.type)) {
      if (it.grading_status === 'graded') {
        objGraded += 1;
        if (it.correctness === 'correct') objAll += 1;
        if (it.answer_status === 'answered') {
          objAnsweredGraded += 1;
          if (it.correctness === 'correct') objAnsweredAll += 1;
        }
      }
    }
  }
  return {
    total_max,
    graded_max,
    earned,
    pending_max,
    answered_count,
    correct_count,
    incorrect_count,
    unanswered_count,
    partial_count,
    pending_count,
    invalid_count,
    score_rate: graded_max > 0 ? { num: earned, den: graded_max } : null,
    objective_correct_rate: objGraded > 0 ? { num: objAll, den: objGraded } : null,
    answered_correct_rate: objAnsweredGraded > 0 ? { num: objAnsweredAll, den: objAnsweredGraded } : null,
  };
}
