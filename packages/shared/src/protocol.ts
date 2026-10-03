/** 领域协议类型。与 docs/02-数据与接口契约.md 保持同名同义；仅供类型使用，运行时零依赖。 */

export type QuestionType =
  | 'single_choice'
  | 'multiple_choice'
  | 'true_false'
  | 'fill_blank'
  | 'free_text';

export interface Option {
  id: string;
  text: string;
}

export interface FillBlankSpec {
  blank_id: string;
  accepted_values: string[];
  score_units: number;
  trim_outer_whitespace: boolean;
  case_sensitive: boolean;
  collapse_internal_whitespace: boolean;
}

/** answer_key 的形态按题型而定（docs/02 §3.1）。 */
export type AnswerKey =
  | { selected_option_ids: string[] }
  | { value: boolean }
  | { blanks: FillBlankSpec[] }
  | { reference_text?: string; rubric?: string };

export type Answer =
  | { selected_option_ids: string[] }
  | { value: boolean }
  | { blanks: { blank_id: string; text: string }[] }
  | { text: string }
  | null;

export interface MaterialBlock {
  id: string;
  type: 'paragraph';
  text: string;
}

export const RULE_VERSION = '1';
export const REPORT_SCHEMA_VERSION = '1.0.0';
export const IMPORT_PARSER_VERSION = '1';

/** 单题判分结果（docs/02 §3.3）。 */
export interface ScoredItem {
  attempt_item_id: string;
  question_id: string;
  question_version_id: string;
  order: number;
  type: QuestionType;
  answer_status: 'answered' | 'unanswered';
  grading_status: 'graded' | 'pending' | 'invalid';
  correctness: 'correct' | 'incorrect' | 'partial' | 'unanswered' | null;
  earned_score_units: number | null;
  max_score_units: number;
  basis: string;
}

/** 整卷聚合（docs/02 §3.4）。分母恒等式 graded_max + pending_max = total_max 必须成立。 */
export interface AttemptAggregate {
  total_max: number;
  graded_max: number;
  earned: number;
  pending_max: number;
  answered_count: number;
  correct_count: number;
  incorrect_count: number;
  unanswered_count: number;
  partial_count: number;
  pending_count: number;
  invalid_count: number;
  score_rate: { num: number; den: number } | null;
  objective_correct_rate: { num: number; den: number } | null;
  answered_correct_rate: { num: number; den: number } | null;
}

export interface TimingSegment {
  item_id: string | null;
  kind: 'item' | 'material' | 'unattributed' | 'pause' | 'unknown';
  start_at: number;
  end_at: number;
}

export interface TimingSummary {
  wall_ms: number;
  paused_ms: number;
  active_ms: number;
  hidden_ms: number;
  unknown_ms: number;
  material_ms: number;
  unattributed_ms: number;
  item_ms: Record<string, number>;
  quality: 'complete' | 'partial' | 'clock_anomaly';
}

/** 统计口径的确定性展示：一位小数 half-up（整数运算避免浮点边界）；分母为 0 显示 "—"。 */
export function formatRate(rate: { num: number; den: number } | null): string {
  if (!rate || rate.den === 0) return '—';
  // 百分比一位小数 = 十分位取整 half-up：floor((2000·num + den) / (2·den)) / 10
  const tenths = Math.floor((2000 * rate.num + rate.den) / (2 * rate.den));
  return `${(tenths / 10).toFixed(1)}%`;
}

/** score_units → 展示分数：units/100，最多两位小数，去尾零。 */
export function formatScore(units: number): string {
  const v = Math.round(units) / 100;
  return String(parseFloat(v.toFixed(2)));
}
