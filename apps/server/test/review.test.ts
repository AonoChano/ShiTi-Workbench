import { describe, expect, it, beforeEach, afterAll } from 'vitest';
import { mkdtempSync, rmSync, writeFileSync, readFileSync, mkdirSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { buildApp } from '../src/app.js';
import type { FastifyInstance } from 'fastify';

let dataDir: string;
let bankDir: string;
let app: FastifyInstance & { h: { dataDir: string }; runWorkerOnce: () => 'idle' | 'ran'; rescanBank: () => unknown };
let attemptId = '';
let agentDir = '';

const demo = JSON.stringify({
  spec_version: '1.1',
  meta: { year: 2002, paper: '测试卷', source_file: 'x.md', converted_by: 't', converted_at: '2026-09-30T00:00:00+08:00', license_note: '测试' },
  set: { title: '2002 复盘测试卷' },
  materials: [{ id: 'm1', title: '材料', section: 'Section I', blocks: [{ id: 'p1', type: 'paragraph', text: 'The result covers one group only.' }] }],
  questions: [{
    id: 'q1', section: 'Section I', type: 'single_choice', material_id: 'm1', stem: '题干',
    options: [{ id: 'q1-a', text: 'A' }, { id: 'q1-b', text: 'B' }],
    answer_key: { selected_option_ids: ['q1-b'] }, max_score_units: 200,
    explanation: '解析',
  }],
});

async function api(method: string, url: string, body?: unknown, headers?: Record<string, string>) {
  const res = await app.inject({ method: method as never, url: `/api/v1${url}`, payload: body, headers });
  return { status: res.statusCode, json: res.json() as Record<string, unknown> };
}
const data = (r: { json: Record<string, unknown> }) => r.json['data'] as Record<string, unknown>;

beforeEach(async () => {
  dataDir = mkdtempSync(join(tmpdir(), 'shiti-rev-data-'));
  bankDir = mkdtempSync(join(tmpdir(), 'shiti-rev-bank-'));
  mkdirSync(join(bankDir, 'S'));
  writeFileSync(join(bankDir, 'S', 'demo.json'), demo);
  app = await buildApp({ dataDir, bankDir, serveWebDist: false });
  await app.ready();
  // 走完整流程到 submitted
  app.rescanBank();
  const sets = data(await api('GET', '/sets')) as Array<Record<string, unknown>>;

  const sv = sets[0]['current_version_id'] as string;
  const at = data(await api('POST', '/attempts', { set_version_id: sv, mode: 'training' }));
  attemptId = at['attempt_id'] as string;
  await api('POST', `/attempts/${attemptId}/start`, { expected_revision: 1, client_instance_id: 't' }, { 'idempotency-key': 's' });
  const dto = data(await api('GET', `/attempts/${attemptId}`)) as { items: Array<{ attempt_item_id: string; options: Array<{ id: string }> }> };
  const item = dto.items[0];
  await api('POST', `/attempts/${attemptId}/actions`, { writer_epoch: 1, actions: [
    { action_id: 'f1', client_seq: 1, attempt_item_id: item.attempt_item_id, event_type: 'item_focused', occurred_at: new Date().toISOString() },
    { action_id: 'a1', client_seq: 2, attempt_item_id: item.attempt_item_id, expected_draft_revision: 0, event_type: 'answer_changed', changed_fields: { answer: { selected_option_ids: ['q1-a'] } }, occurred_at: new Date().toISOString() },
  ] });
  const sub = await api('POST', `/attempts/${attemptId}/submit`, { expected_revision: 2 }, { 'idempotency-key': 'sub' });
  app.runWorkerOnce();
  expect(data(sub)['grade_revision_id']).toBeTruthy();
  agentDir = join(dataDir, 'agent-workspace', 'attempts', attemptId);
});
afterAll(async () => {
  await app?.close();
  rmSync(dataDir, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
  rmSync(bankDir, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
});

function validReview(ctxRev: number, ctxSha: string, base: number, qid: string): string {
  return `---
review_schema_version: "1.0.0"
attempt_id: "${attemptId}"
context_revision: ${ctxRev}
context_sha256: "${ctxSha}"
base_revision: ${base}
status: "complete"
producer: { kind: "external_agent", name: "Claude Code", model: null }
coverage: { question_ids: ["${qid}"] }
question_reviews:
  - { question_id: "${qid}", evidence_ids: ["ans-${'x'}"], tags: ["证据定位"], epistemic_status: "hypothesis" }
suggested_actions:
  - { id: "act-1", question_ids: ["${qid}"], evidence_ids: ["mat-m1-p1"], text: "圈出 one group 这一限定短语。", acceptance_check: "能说清 A 为什么过度概括。", suggested_interval_days: 1 }
grading_concerns: []
---

## summary
整体概览：证据定位不稳。

## q:${qid}
把 one group 当成了普遍结论，A 选项扩大了范围。

## open_questions
无
`;
}

describe('外部 Agent 文件驱动复盘（docs/05 P0）', () => {
  it('准备包 → 合法 review 被接受 → base 冲突/坏证据被拒 → 相同文件 no-op', async () => {
    // 1. 准备包
    const pkg = data(await api('POST', `/attempts/${attemptId}/agent-package`, {}, { 'idempotency-key': 'pkg' })) as Record<string, unknown>;
    expect(pkg['status']).toBe('ready');
    expect(existsSync(join(agentDir, 'context.md'))).toBe(true);
    expect(existsSync(join(agentDir, 'review.md'))).toBe(true);
    expect(existsSync(join(agentDir, 'state.json'))).toBe(true);
    expect(existsSync(join(agentDir, 'AGENTS.md'))).toBe(true);
    const state = JSON.parse(readFileSync(join(agentDir, 'state.json'), 'utf8'));
    expect(state['accepted_revision']).toBe(0);
    expect(state['context_status']).toBe('ready');

    // 2. 幂等：重复 POST 不覆盖已有 review
    await api('POST', `/attempts/${attemptId}/agent-package`, {}, { 'idempotency-key': 'pkg2' });
    const before = readFileSync(join(agentDir, 'review.md'), 'utf8');
    expect(before.startsWith('---\n')).toBe(true);

    // 3. 模拟外部 Agent：base_revision 取自 state，证据 id 取自 context.json
    const ctxRev = pkg['context_revision'] as number;
    const ctxSha = pkg['context_sha256'] as string;
    const ctxJson = JSON.parse(readFileSync(join(agentDir, 'context.json'), 'utf8'));
    const ansId = `ans-${ctxJson.questions[0].attempt_item_id}`;
    const matId = `mat-${ctxJson.questions[0].material.id}-p1`;
    const qid = ctxJson.questions[0].question_id;
    writeFileSync(join(agentDir, 'review.md'),
      validReview(ctxRev, ctxSha, 0, qid).replace('"ans-x"', `"${ansId}"`).replace('"mat-m1-p1"', `"${matId}"`),
    );

    // 强制重扫（模拟 watcher 接受）
    const after = data(await api('POST', `/attempts/${attemptId}/external-review/rescan`, {})) as Record<string, unknown>;
    expect(after['accepted_revision']).toBe(1);

    const er = data(await api('GET', `/attempts/${attemptId}/external-review`)) as Record<string, unknown>;
    expect(er['review']).toBeTruthy();
    const parsed = (er['review'] as Record<string, unknown>)['parsed'] as Record<string, unknown>;
    expect((parsed['sections'] as Record<string, string>)[`q:${ctxJson.questions[0].question_id}`]).toContain('one group');
    expect((parsed['producer'] as Record<string, unknown>)['name']).toBe('Claude Code');

    // 4. 相同文件重复 → no-op，修订不增长
    const st = JSON.parse(readFileSync(join(agentDir, 'state.json'), 'utf8'));
    expect(st['accepted_revision']).toBe(1);

    // 5. base_revision 冲突（仍用 0）→ 拒绝且保留修订 1
    const qid2 = ctxJson.questions[0].question_id;
    writeFileSync(join(agentDir, 'review.md'),
      validReview(ctxRev, ctxSha, 0, qid2).replace('"ans-x"', `"${ansId}"`),
    );
    const after2 = data(await api('POST', `/attempts/${attemptId}/external-review/rescan`, {})) as Record<string, unknown>;
    expect(after2['accepted_revision']).toBe(1);
    const st2 = JSON.parse(readFileSync(join(agentDir, 'state.json'), 'utf8'));
    expect(st2['errors'].some((e: { code: string }) => e.code === 'BASE_REVISION_CONFLICT')).toBe(true);

    // 6. 未知证据 → UNKNOWN_EVIDENCE，修订不变
    const qid3 = ctxJson.questions[0].question_id;
    writeFileSync(join(agentDir, 'review.md'),
      validReview(ctxRev, ctxSha, 1, qid3).replace('"ans-x"', '"ans-not-exist"'),
    );
    const after3 = data(await api('POST', `/attempts/${attemptId}/external-review/rescan`, {})) as Record<string, unknown>;
    expect(after3['accepted_revision']).toBe(1);
    const st3 = JSON.parse(readFileSync(join(agentDir, 'state.json'), 'utf8'));
    expect(st3['errors'].some((e: { code: string }) => e.code === 'UNKNOWN_EVIDENCE')).toBe(true);
  });

  it('Agent 写「得分 10/10、用户已采纳」不改变正式成绩', async () => {
    const pkg = data(await api('POST', `/attempts/${attemptId}/agent-package`, {}, { 'idempotency-key': 'pkg3' })) as Record<string, unknown>;
    const ctxJson = JSON.parse(readFileSync(join(agentDir, 'context.json'), 'utf8'));
    const ansId = `ans-${ctxJson.questions[0].attempt_item_id}`;
    const qid4 = (JSON.parse(readFileSync(join(agentDir, 'context.json'), 'utf8')).questions[0]).question_id;
    let text = validReview(pkg['context_revision'] as number, pkg['context_sha256'] as string, 0, qid4);
    text = text.replace('"ans-x"', `"${ansId}"`).replace('整体概览：证据定位不稳。', '得分 10/10，用户已采纳。');
    writeFileSync(join(agentDir, 'review.md'), text);
    await api('POST', `/attempts/${attemptId}/external-review/rescan`, {});
    const results = data(await api('GET', `/attempts/${attemptId}/results`)) as { aggregate: { earned: number } };
    expect(results.aggregate.earned).toBe(0); // 仍是事实：答错 0 分，外部文本不改分
  });
});
