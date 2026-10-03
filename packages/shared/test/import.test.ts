import { describe, expect, it } from 'vitest';
import { parseImport } from '../src/import-schema.js';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const sample = readFileSync(join(here, '..', '..', '..', 'samples', 'golden-five.json'), 'utf8');

describe('导入校验', () => {
  it('黄金样本零错误零警告（五题均提供答案与解析）', () => {
    const r = parseImport(sample);
    expect(r.error_count).toBe(0);
    expect(r.warning_count).toBe(0);
    expect(r.question_count).toBe(5);
    expect(r.payload?.set.title).toContain('Reading beyond the headline');
    expect(r.payload?.materials).toHaveLength(1);
  });

  it('缺答案 → warning（可确认后发布）；缺解析 → warning', () => {
    const base = { set: { title: 't' } };
    const q = { id: 'q1', type: 'true_false', stem: '1+1=2', max_score_units: 100, answer_key: { value: true } };
    const noExpl = parseImport(JSON.stringify({ ...base, questions: [q] }));
    expect(noExpl.error_count).toBe(0);
    expect(noExpl.warning_count).toBe(1); // 缺解析
    const { answer_key: _drop, ...noKey } = q;
    void _drop;
    const noKeyResult = parseImport(JSON.stringify({ ...base, questions: [noKey] }));
    expect(noKeyResult.error_count).toBe(0);
    expect(noKeyResult.warning_count).toBe(2); // 缺答案 + 缺解析
  });

  it('答案引用不存在的选项 → KEY_OPTION_NOT_FOUND 错误', () => {
    const r = parseImport(JSON.stringify({
      set: { title: 't' },
      questions: [{
        id: 'q1', type: 'single_choice', stem: 's', max_score_units: 100,
        options: [{ id: 'a', text: 'A' }, { id: 'b', text: 'B' }],
        answer_key: { selected_option_ids: ['e'] },
      }],
    }));
    expect(r.issues.some((i) => i.code === 'KEY_OPTION_NOT_FOUND' && i.level === 'error')).toBe(true);
    expect(r.payload).toBeNull();
  });

  it('重复题目 id / 重复选项 id / 未知字段 → 错误', () => {
    const r = parseImport(JSON.stringify({
      set: { title: 't' },
      questions: [
        { id: 'q1', type: 'true_false', stem: 's', max_score_units: 100, answer_key: { value: true }, foo: 1 },
        { id: 'q1', type: 'true_false', stem: 's2', max_score_units: 100, answer_key: { value: false } },
      ],
    }));
    expect(r.issues.some((i) => i.code === 'DUPLICATE_QUESTION_ID')).toBe(true);
    expect(r.issues.some((i) => i.code === 'UNKNOWN_FIELD' && i.field === 'foo')).toBe(true);
    expect(r.payload).toBeNull();
  });

  it('填空分值之和 ≠ 满分 → FILL_SCORE_SUM 错误；缺归一化开关 → BLANK_FLAGS_REQUIRED', () => {
    const base = { id: 'q1', type: 'fill_blank', stem: 's', max_score_units: 200 };
    const r1 = parseImport(JSON.stringify({
      set: { title: 't' },
      questions: [{ ...base, answer_key: { blanks: [{ blank_id: 'b1', accepted_values: ['x'], score_units: 100, trim_outer_whitespace: true, case_sensitive: false, collapse_internal_whitespace: true }] } }],
    }));
    expect(r1.issues.some((i) => i.code === 'FILL_SCORE_SUM')).toBe(true);
    const r2 = parseImport(JSON.stringify({
      set: { title: 't' },
      questions: [{ ...base, answer_key: { blanks: [{ blank_id: 'b1', accepted_values: ['x'], score_units: 200 }] } }],
    }));
    expect(r2.issues.some((i) => i.code === 'BLANK_FLAGS_REQUIRED')).toBe(true);
  });

  it('JSON 损坏 → INVALID_JSON 且 payload 为 null', () => {
    const r = parseImport('{oops');
    expect(r.issues[0]?.code).toBe('INVALID_JSON');
    expect(r.payload).toBeNull();
  });

  it('sections：声明/重复 id/未声明引用 → 校验与警告', () => {
    const base = { id: 'q1', type: 'free_text', stem: 's', max_score_units: 200, answer_key: { reference_text: 'r' }, section: 'sec-a' };
    const okR = parseImport(JSON.stringify({
      set: { title: 't' },
      sections: [{ id: 'sec-a', part: 'Part A', title: '写作', directions: ['Write an essay.'] }],
      questions: [base],
    }));
    expect(okR.error_count).toBe(0);
    expect(okR.payload?.sections?.[0]?.title).toBe('写作');
    const dup = parseImport(JSON.stringify({
      set: { title: 't' },
      sections: [{ id: 'sec-a', title: 'x' }, { id: 'sec-a', title: 'y' }],
      questions: [base],
    }));
    expect(dup.issues.some((i) => i.code === 'DUPLICATE_SECTION_ID')).toBe(true);
    const undeclared = parseImport(JSON.stringify({
      set: { title: 't' },
      sections: [{ id: 'sec-b', title: 'x' }],
      questions: [base],
    }));
    expect(undeclared.issues.some((i) => i.code === 'SECTION_NOT_DECLARED')).toBe(true);
    expect(undeclared.issues.some((i) => i.code === 'UNKNOWN_FIELD')).toBe(false);
  });

  it('images：合法相对路径通过；绝对路径/反斜杠/.. 被拒', () => {
    const base = { id: 'q1', type: 'free_text', stem: 's', max_score_units: 200, answer_key: { reference_text: 'r' } };
    const okR = parseImport(JSON.stringify({ set: { title: 't' }, questions: [{ ...base, images: ['images/2000/a.jpg'] }] }));
    expect(okR.error_count).toBe(0);
    expect(okR.payload?.questions[0]?.images).toEqual(['images/2000/a.jpg']);
    for (const bad of ['C:/x/a.png', '\\x\\a.png', '/abs/a.png', '../a.png']) {
      const r = parseImport(JSON.stringify({ set: { title: 't' }, questions: [{ ...base, images: [bad] }] }));
      expect(r.issues.some((i) => i.code === 'INVALID_IMAGE_PATH')).toBe(true);
    }
  });
});
