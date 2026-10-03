import { describe, expect, it } from 'vitest';
import { aggregate, gradeCore, isAnswered } from '../src/scoring.js';
import type { ScoredItem } from '../src/protocol.js';

const OPTS = ['q1-a', 'q1-b', 'q1-c', 'q1-d'];

function score(
  attempt_item_id: string,
  question_id: string,
  type: Parameters<typeof gradeCore>[0],
  answer: Parameters<typeof gradeCore>[1],
  key: Parameters<typeof gradeCore>[2],
  max = 200,
  optionIds: string[] | null = OPTS,
  order = 1,
): ScoredItem {
  const r = gradeCore(type, answer, key, max, optionIds);
  return {
    attempt_item_id,
    question_id,
    question_version_id: 'qv-test',
    order,
    type,
    ...r,
    max_score_units: max,
  };
}

describe('黄金样本判分（docs/02 §9）', () => {
  const keyOf = (id: string) => ({ selected_option_ids: [id] });
  const ans = (id: string) => ({ selected_option_ids: [id] });

  const items: ScoredItem[] = [
    score('i1', 'q1', 'single_choice', ans('q1-b'), keyOf('q1-b'), 200, OPTS, 1),
    score('i2', 'q2', 'single_choice', ans('q2-c'), keyOf('q2-c'), 200, ['q2-a', 'q2-b', 'q2-c', 'q2-d'], 2),
    score('i3', 'q3', 'single_choice', ans('q3-a'), keyOf('q3-b'), 200, ['q3-a', 'q3-b', 'q3-c', 'q3-d'], 3),
    score('i4', 'q4', 'single_choice', ans('q4-d'), keyOf('q4-d'), 200, ['q4-a', 'q4-b', 'q4-c', 'q4-d'], 4),
    score('i5', 'q5', 'single_choice', null, keyOf('q5-a'), 200, ['q5-a', 'q5-b', 'q5-c', 'q5-d'], 5),
  ];

  const agg = aggregate(items);

  it('earned=600 graded_max=1000 total_max=1000 pending_max=0', () => {
    expect(agg.earned).toBe(600);
    expect(agg.graded_max).toBe(1000);
    expect(agg.total_max).toBe(1000);
    expect(agg.pending_max).toBe(0);
    expect(agg.graded_max + agg.pending_max).toBe(agg.total_max);
  });

  it('answered=4 correct=3 incorrect=1 unanswered=1 partial=0 pending=0', () => {
    expect(agg.answered_count).toBe(4);
    expect(agg.correct_count).toBe(3);
    expect(agg.incorrect_count).toBe(1);
    expect(agg.unanswered_count).toBe(1);
    expect(agg.partial_count).toBe(0);
    expect(agg.pending_count).toBe(0);
  });

  it('客观正确率 60.0%、已答正确率 75.0%、得分率 60.0%', () => {
    expect(agg.objective_correct_rate).toEqual({ num: 3, den: 5 });
    expect(agg.answered_correct_rate).toEqual({ num: 3, den: 4 });
    expect(agg.score_rate).toEqual({ num: 600, den: 1000 });
  });
});

describe('独立待评案例（docs/02 §9 末段）', () => {
  const mcq: ScoredItem[] = [
    score('i1', 'q1', 'single_choice', { selected_option_ids: ['q1-b'] }, { selected_option_ids: ['q1-b'] }, 200, OPTS, 1),
    score('i2', 'q2', 'single_choice', { selected_option_ids: ['q2-c'] }, { selected_option_ids: ['q2-c'] }, 200, null, 2),
    score('i3', 'q3', 'single_choice', { selected_option_ids: ['q3-a'] }, { selected_option_ids: ['q3-b'] }, 200, null, 3),
    score('i4', 'q4', 'single_choice', { selected_option_ids: ['q4-d'] }, { selected_option_ids: ['q4-d'] }, 200, null, 4),
    score('i5', 'q5', 'single_choice', null, { selected_option_ids: ['q5-a'] }, 200, null, 5),
    score('i6', 'q6', 'free_text', { text: '（未人工评分）' }, { reference_text: '参考' }, 1000, null, 6),
  ];
  const agg = aggregate(mcq);
  it('earned=600 graded_max=1000 total_max=2000 pending_max=1000', () => {
    expect(agg.earned).toBe(600);
    expect(agg.graded_max).toBe(1000);
    expect(agg.total_max).toBe(2000);
    expect(agg.pending_max).toBe(1000);
  });
  it('free_text 无论内容与否先 pending，不进入已判分母', () => {
    const r = gradeCore('free_text', null, { reference_text: 'x' }, 1000, null);
    expect(r.grading_status).toBe('pending');
    expect(r.earned_score_units).toBeNull();
    expect(isAnswered('free_text', null)).toBe(false);
    expect(isAnswered('free_text', { text: '答案' })).toBe(true);
  });
});

describe('判分规则边界', () => {
  it('true_false：false 是作答且可判分，不是未答', () => {
    const r = gradeCore('true_false', { value: false }, { value: false }, 100, null);
    expect(r).toMatchObject({ answer_status: 'answered', grading_status: 'graded', correctness: 'correct', earned_score_units: 100 });
    const w = gradeCore('true_false', { value: false }, { value: true }, 100, null);
    expect(w).toMatchObject({ correctness: 'incorrect', earned_score_units: 0 });
  });

  it('多选：去重后集合完全相等得满分，否则零分；不按顺序判错', () => {
    const key = { selected_option_ids: ['a', 'b'] };
    expect(gradeCore('multiple_choice', { selected_option_ids: ['b', 'a'] }, key, 200, ['a', 'b', 'c']).correctness).toBe('correct');
    expect(gradeCore('multiple_choice', { selected_option_ids: ['a'] }, key, 200, ['a', 'b', 'c']).correctness).toBe('incorrect');
    expect(gradeCore('multiple_choice', { selected_option_ids: ['a', 'b', 'b'] }, key, 200, ['a', 'b', 'c']).correctness).toBe('correct');
  });

  it('单选未答：graded、unanswered、0 分', () => {
    expect(gradeCore('single_choice', null, { selected_option_ids: ['a'] }, 200, ['a'])).toMatchObject({
      answer_status: 'unanswered', grading_status: 'graded', correctness: 'unanswered', earned_score_units: 0,
    });
  });

  it('无效 key：invalid、不判分、不判零', () => {
    expect(gradeCore('single_choice', { selected_option_ids: ['a'] }, { selected_option_ids: ['zzz'] }, 200, ['a'])).toMatchObject({
      grading_status: 'invalid', correctness: null, earned_score_units: null,
    });
    expect(gradeCore('single_choice', null, { selected_option_ids: ['a', 'b'] }, 200, ['a', 'b'])).toMatchObject({ grading_status: 'invalid' });
  });

  it('填空：逐空判分、部分对 partial、归一化按题内声明', () => {
    const key = {
      blanks: [
        { blank_id: 'b1', accepted_values: [' industrial revolution '], score_units: 100, trim_outer_whitespace: true, case_sensitive: false, collapse_internal_whitespace: true },
        { blank_id: 'b2', accepted_values: ['factory'], score_units: 100, trim_outer_whitespace: true, case_sensitive: false, collapse_internal_whitespace: true },
      ],
    };
    const full = gradeCore('fill_blank', { blanks: [{ blank_id: 'b1', text: ' Industrial  Revolution ' }, { blank_id: 'b2', text: 'factory' }] }, key, 200, null);
    expect(full).toMatchObject({ answer_status: 'answered', grading_status: 'graded', correctness: 'correct', earned_score_units: 200 });
    const part = gradeCore('fill_blank', { blanks: [{ blank_id: 'b1', text: 'industrial revolution' }, { blank_id: 'b2', text: 'wrong' }] }, key, 200, null);
    expect(part).toMatchObject({ correctness: 'partial', earned_score_units: 100 });
    const none = gradeCore('fill_blank', { blanks: [{ blank_id: 'b1', text: 'x' }, { blank_id: 'b2', text: 'y' }] }, key, 200, null);
    expect(none).toMatchObject({ correctness: 'incorrect', earned_score_units: 0 });
    const halfEmpty = gradeCore('fill_blank', { blanks: [{ blank_id: 'b1', text: 'industrial revolution' }, { blank_id: 'b2', text: '' }] }, key, 200, null);
    expect(halfEmpty).toMatchObject({ answer_status: 'answered', correctness: 'partial', earned_score_units: 100 });
    expect(gradeCore('fill_blank', null, key, 200, null)).toMatchObject({ answer_status: 'unanswered', earned_score_units: 0 });
  });
});
