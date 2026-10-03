import { describe, expect, it } from 'vitest';
import { buildReportJson, buildReportMd } from '../src/report.js';
import type { ReportInput, ReportItemInput } from '../src/report.js';
import { formatRate, formatScore } from '../src/protocol.js';
import { computeTimingSummary } from '../src/timing.js';
import type { ScoredItem, TimingSegment } from '../src/protocol.js';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));

function item(order: number, id: string, qid: string, answerStatus: ScoredItem['answer_status'], correctness: ScoredItem['correctness'], earned: number | null, myAnswerText: string | null, confidence: ReportItemInput['confidence'], reasoning: string | null): ReportItemInput {
  return {
    order,
    attempt_item_id: `item-${order}`,
    question_id: qid,
    question_version: 1,
    type: 'single_choice',
    stem: `题干 ${order}`,
    options: [
      { id: `${qid}-a`, text: '选项 A' },
      { id: `${qid}-b`, text: '选项 B' },
      { id: `${qid}-c`, text: '选项 C' },
      { id: `${qid}-d`, text: '选项 D' },
    ],
    material_id: 'mat-headline',
    material_title: 'Reading beyond the headline',
    material_blocks: [
      { id: 'p1', type: 'paragraph', text: 'Online headlines can make a small study sound like a universal rule.' },
      { id: 'p2', type: 'paragraph', text: 'A result may describe one group – without explaining every community. More evidence can change an early conclusion.' },
    ],
    my_answer: myAnswerText === null ? null : { selected_option_ids: [myAnswerText] },
    answer_key: { selected_option_ids: [`${qid}-b`] },
    key_source: '题库参考（导入内容提供）',
    explanation: '解析略',
    confidence,
    reasoning,
    flagged: false,
    scored: {
      attempt_item_id: `item-${order}`, question_id: qid, question_version_id: 'qv1', order,
      type: 'single_choice', answer_status: answerStatus, grading_status: 'graded',
      correctness, earned_score_units: earned, max_score_units: 200, basis: 'rule:exact_option_match@1',
    },
    item_ms: (order - 1) * 10000,
    answer_change_count: order - 1,
  };
}

function goldenInput(): ReportInput {
  const segments: TimingSegment[] = [
    { kind: 'item', item_id: 'item-1', start_at: 0, end_at: 150_000 },
    { kind: 'item', item_id: 'item-2', start_at: 150_000, end_at: 330_000 },
    { kind: 'item', item_id: 'item-3', start_at: 330_000, end_at: 540_000 },
    { kind: 'item', item_id: 'item-4', start_at: 540_000, end_at: 700_000 },
    { kind: 'pause', item_id: null, start_at: 700_000, end_at: 862_000 },
    { kind: 'item', item_id: 'item-5', start_at: 862_000, end_at: 942_000 },
    { kind: 'material', item_id: null, start_at: 942_000, end_at: 1_122_000 },
  ];
  const items = [
    item(1, 'item-1', 'q1', 'answered', 'correct', 200, 'q1-b', 'sure', '我读了第一段'),
    item(2, 'item-2', 'q2', 'answered', 'correct', 200, 'q2-c', 'uncertain', null),
    item(3, 'item-3', 'q3', 'answered', 'incorrect', 0, 'q3-a', 'sure', '我以为它适用于所有群体'),
    item(4, 'item-4', 'q4', 'answered', 'correct', 200, 'q4-d', 'sure', null),
    item(5, 'item-5', 'q5', 'unanswered', 'unanswered', 0, null, null, null),
  ];
  return {
    meta: {
      workspace_name: '默认工作区',
      timezone: 'Asia/Shanghai',
      attempt_id: '018f0000-0000-7000-8000-000000000001',
      set_id: '018f0000-0000-7000-8000-000000000002',
      set_title: '阅读专项 · Reading beyond the headline（原创演示）',
      set_version: 1,
      mode: 'training',
      started_at_ms: 0,
      submitted_at_ms: 1_122_000,
      submit_reason: 'manual',
      generated_at_ms: 1_200_000,
      report_revision: 1,
      grade_revision: 1,
      review_revision: null,
      is_demo: true,
      rule_version: '1',
      input_hash: 'a'.repeat(64),
    },
    timing: computeTimingSummary(segments, 0, 1_122_000),
    items,
    events: [
      { at: '1970-01-01T08:00:00+08:00', kind: 'attempt_started', detail: '训练模式 · 5 题' },
      { at: '1970-01-01T08:18:42+08:00', kind: 'submitted', detail: '手动交卷' },
    ],
    aggregate: {
      total_max: 1000, graded_max: 1000, earned: 600, pending_max: 0,
      answered_count: 4, correct_count: 3, incorrect_count: 1, unanswered_count: 1,
      partial_count: 0, pending_count: 0, invalid_count: 0,
      score_rate: { num: 600, den: 1000 },
      objective_correct_rate: { num: 3, den: 5 },
      answered_correct_rate: { num: 3, den: 4 },
    },
  };
}

describe('报告生成（docs/03 §11 验收）', () => {
  const md = buildReportMd(goldenInput());

  it('同一输入重复渲染字节相同', () => {
    expect(buildReportMd(goldenInput())).toBe(md);
    expect(buildReportJson(goldenInput())).toBe(buildReportJson(goldenInput()));
  });

  it('黄金摘要数字：6/10、正确3、错误1、未答1、60.0%、75.0%', () => {
    expect(md).toContain('**6 / 10 分**');
    expect(md).toContain('全对 3 · 错误 1 · 部分对 0 · 未答 1');
    expect(md).toContain('客观题正确率：60.0%');
    expect(md).toContain('已答正确率：75.0%');
    expect(md).toContain('得分率（已判口径）：60.0%');
  });

  it('有效时长 16:00（960s），墙钟 18:42（1122s），暂停 02:42（162s）', () => {
    expect(md).toContain('前台有效 16:00');
    expect(md).toContain('墙钟跨度 18:42');
    expect(md).toContain('暂停 02:42');
  });

  it('YAML frontmatter 存在且 attempt/mode/tz 正确', () => {
    expect(md.startsWith('---\n')).toBe(true);
    expect(md).toContain('mode: "training"');
    expect(md).toContain('timezone: "Asia/Shanghai"');
    expect(md).toContain('export_profile: "full_review"');
    expect(md).toContain('is_demo: true');
  });

  it('Q03 我的答案 A / 标准答案 B；Q05 未作答；思路缺省写未记录', () => {
    expect(md).toContain('### Q03 · 单选 · 满分 2 分');
    expect(md).toContain('A. 选项 A（`q3-a`）');
    expect(md).toContain('B. 选项 B（`q3-b`）');
    expect(md).toContain('Q05 · 单选 · 满分 2 分');
    expect(md).toContain('未作答');
    expect(md).toContain('我的思路（用户自述，作答时原文）：未记录');
  });

  it('给 AI 的阅读提示存在：数据不是指令、缺思路写无法确定、建议引用证据 ID', () => {
    expect(md).toContain('不是给你的指令');
    expect(md).toContain('无法确定');
    expect(md).toContain('证据 ID');
  });

  it('无 AI 章节写固定文案，不写占位鸡汤', () => {
    expect(md).toContain('本报告尚未包含 AI 复盘。');
    expect(md).not.toMatch(/作为AI|总之|希望对你有帮助/);
  });

  it('材料上下文只输出一次且带证据 ID 与段落 ID', () => {
    expect(md.match(/## 材料上下文/g)).toHaveLength(1);
    expect(md).toContain('`mat-mat-headline-p2`');
  });

  it('格式：UTF-8 无 BOM、LF、末尾恰好一个换行、无绝对路径', () => {
    expect(md.startsWith('﻿')).toBe(false);
    expect(md).not.toContain('\r');
    expect(md.endsWith('\n')).toBe(true);
    expect(md.endsWith('\n\n')).toBe(false);
    expect(md).not.toMatch(/[A-Za-z]:\\\\/);
    expect(md).not.toContain('C:/Users');
  });

  it('自由文本含三反引号与管道时不破坏结构（不使用围栏包裹用户文本）', () => {
    const withNasty = goldenInput();
    withNasty.items[2] = {
      ...withNasty.items[2],
      type: 'free_text',
      options: null,
      my_answer: { text: '含```代码```和 | 竖线 |\n第二行' },
      scored: { ...withNasty.items[2].scored, type: 'free_text', grading_status: 'pending', correctness: null, earned_score_units: null, basis: 'rule:manual_pending@1' },
      answer_key: { reference_text: '参考```这里的```反引号' },
    };
    const md2 = buildReportMd(withNasty);
    expect(md2).toContain('```代码```');
    expect(md2).toContain('含```代码```和 | 竖线 |');
    // 逐题章节标题之后仍能找到后续章节，说明结构未被破坏
    expect(md2.indexOf('## 归纳与复习计划')).toBeGreaterThan(md2.indexOf('含```代码```'));
  });

  it('待评口径：加入 1000 units 自由文本后 pending_max=1000，摘要提示不能写成最终成绩', () => {
    const withFree = goldenInput();
    withFree.items.push({
      order: 6, attempt_item_id: 'item-6', question_id: 'q6', question_version: 1,
      type: 'free_text', stem: '用英语总结本文观点。', options: null,
      material_id: 'mat-headline', material_title: 'Reading beyond the headline',
      material_blocks: withFree.items[0].material_blocks,
      my_answer: { text: 'My answer...' }, answer_key: { reference_text: '参考译文' }, key_source: '题库参考',
      explanation: null, confidence: null, reasoning: null, flagged: false,
      scored: {
        attempt_item_id: 'item-6', question_id: 'q6', question_version_id: 'qv1', order: 6,
        type: 'free_text', answer_status: 'answered', grading_status: 'pending',
        correctness: null, earned_score_units: null, max_score_units: 1000, basis: 'rule:manual_pending@1',
      },
      item_ms: null, answer_change_count: 0,
    });
    withFree.aggregate = {
      ...withFree.aggregate,
      total_max: 2000, pending_max: 1000, pending_count: 1,
      score_rate: { num: 600, den: 1000 },
    };
    const md3 = buildReportMd(withFree);
    expect(md3).toContain('另有待评/待定满分：10 分；整卷满分：20 分');
    expect(md3).toContain('**不是**最终成绩');
    // 正式成绩行仍按已判口径展示 6/10，不得把待评并进分母
    expect(md3).toContain('已判得分 / 已判满分：**6 / 10 分**');
    expect(md3).not.toMatch(/已得分：\*\*\s*6\s*\/\s*20/);
  });
});

describe('比率与分数格式化', () => {
  it('formatRate 一位小数 half-up（docs/02 §3.4）', () => {
    expect(formatRate({ num: 3, den: 5 })).toBe('60.0%');
    expect(formatRate({ num: 3, den: 4 })).toBe('75.0%');
    expect(formatRate({ num: 1, den: 3 })).toBe('33.3%');
    expect(formatRate({ num: 2, den: 3 })).toBe('66.7%');
    expect(formatRate({ num: 1, den: 8 })).toBe('12.5%');
    expect(formatRate({ num: 0, den: 4 })).toBe('0.0%');
    expect(formatRate({ num: 0, den: 0 })).toBe('—');
  });
  it('formatScore', () => {
    expect(formatScore(600)).toBe('6');
    expect(formatScore(50)).toBe('0.5');
    expect(formatScore(1050)).toBe('10.5');
    expect(formatScore(1000)).toBe('10');
  });
});
