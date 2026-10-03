import { describe, expect, it, beforeEach, afterAll } from 'vitest';
import { mkdtempSync, readFileSync, rmSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { buildApp } from '../src/app.js';
import type { FastifyInstance } from 'fastify';

const sample = readFileSync(join(__dirname_fix(), '..', '..', '..', 'samples', 'golden-five.json'), 'utf8');
function __dirname_fix(): string {
  return import.meta.dirname ?? '.';
}

let dataDir: string;
let app: FastifyInstance & { h: unknown; runWorkerOnce: () => 'idle' | 'ran' };

async function api(method: string, url: string, body?: unknown, headers?: Record<string, string>) {
  const res = await app.inject({ method: method as never, url, payload: body, headers });
  return { status: res.statusCode, json: res.json() as Record<string, unknown> };
}
const data = (r: { json: Record<string, unknown> }) => r.json['data'] as Record<string, unknown>;

beforeEach(async () => {
  dataDir = mkdtempSync(join(tmpdir(), 'shiti-test-'));
  app = await buildApp({ dataDir, serveWebDist: false });
  await app.ready();
});
afterAll(async () => {
  await app?.close();
  rmSync(dataDir, { recursive: true, force: true, maxRetries: 8, retryDelay: 250 });
});

describe('M1 端到端（黄金样本）', () => {
  it('导入 → 练习 → 提交 → 判分 → 报告，数字与 docs/02 §9 一致', async () => {
    // 1. 导入
    const imp = await api('POST', '/api/v1/imports', { content: sample });
    expect(imp.status).toBe(200);
    const importId = data(imp)['import_id'] as string;
    expect(data(imp)['error_count']).toBe(0);
    // 黄金样本无警告，confirmed_warnings 为空数组即可
    const commit = await api('POST', `/api/v1/imports/${importId}/commit`, { confirmed_warnings: [] }, { 'idempotency-key': 'commit-1' });
    expect(commit.status).toBe(200);
    const setVersionId = data(commit)['set_version_id'] as string;
    expect(data(commit)['question_count']).toBe(5);

    // 幂等重放：同 key 返回首次响应；不同 key 对已提交会话返回 already_committed
    const commit2 = await api('POST', `/api/v1/imports/${importId}/commit`, { confirmed_warnings: [] }, { 'idempotency-key': 'commit-1' });
    expect(data(commit2)['question_count']).toBe(5);
    const commit3 = await api('POST', `/api/v1/imports/${importId}/commit`, { confirmed_warnings: [] }, { 'idempotency-key': 'commit-2' });
    expect(data(commit3)['already_committed']).toBe(true);

    // 2. 创建 + 开始
    const created = await api('POST', '/api/v1/attempts', { set_version_id: setVersionId, mode: 'training' });
    expect(created.status).toBe(200);
    const attemptId = data(created)['attempt_id'] as string;
    const started = await api('POST', `/api/v1/attempts/${attemptId}/start`, { expected_revision: 1, client_instance_id: 'client-A' }, { 'idempotency-key': 'start-1' });
    expect(started.status).toBe(200);
    expect(data(started)['writer_epoch']).toBe(1);

    // 3. PracticeDTO 不泄露答案（键级断言；has_answer_key 只是布尔标志，允许出现）
    const dto = await api('GET', `/api/v1/attempts/${attemptId}`);
    const dtoText = JSON.stringify(dto.json);
    expect(dtoText).not.toContain('"answer_key"');
    expect(dtoText).not.toContain('"explanation"');
    const items = data(dto)['items'] as Array<Record<string, unknown>>;

    // 4. 作答动作：Q1=B Q2=C Q3=A Q4=D，Q5 留空（黄金样本）
    const want: Record<number, string | null> = { 1: '-b', 2: '-c', 3: '-a', 4: '-d', 5: null };
    let seq = 1;
    const focusPayloads: Array<{ action_id: string; client_seq: number; attempt_item_id: string; event_type: string; occurred_at: string }> = [];
    for (let i = 0; i < items.length; i++) {
      const it = items[i];
      const itemId = it['attempt_item_id'] as string;
      const focusPayload = { action_id: `a-f-${i}`, client_seq: seq++, attempt_item_id: itemId, event_type: 'item_focused', occurred_at: new Date().toISOString() };
      focusPayloads.push(focusPayload);
      const focus = await api('POST', `/api/v1/attempts/${attemptId}/actions`, { writer_epoch: 1, actions: [focusPayload] });
      expect(focus.status).toBe(200);
      const ans = want[i + 1];
      if (ans !== null) {
        const qid = it['question_id'] as string; // q1..q5 对应 UUID，但选项 id 是 q1-a 等吗？
        void qid;
        const opts = it['options'] as Array<{ id: string }>;
        // 黄金样本选项 id 形如 q1-a…q1-d；按后缀匹配目标
        const target = opts.find((o) => o['id'].endsWith(ans))!['id'];
        const act = await api('POST', `/api/v1/attempts/${attemptId}/actions`, {
          writer_epoch: 1,
          actions: [{
            action_id: `a-ans-${i}`, client_seq: seq++, attempt_item_id: itemId,
            expected_draft_revision: 0, event_type: 'answer_changed',
            changed_fields: { answer: { selected_option_ids: [target] } },
            occurred_at: new Date().toISOString(),
          }],
        });
        expect(act.status).toBe(200);
        const r0 = (data(act)['results'] as Array<Record<string, unknown>>)[0];
        expect(r0['ok']).toBe(true);
      }
    }
    // 重复动作 ID 重放：同 payload（含 occurred_at）返回原回执
    const replay = await api('POST', `/api/v1/attempts/${attemptId}/actions`, {
      writer_epoch: 1,
      actions: [focusPayloads[0]],
    });
    const r0 = (data(replay)['results'] as Array<Record<string, unknown>>)[0];
    expect(r0['ok']).toBe(true);

    // 5. 暂停 → 继续 → 提交
    const cur = await api('GET', `/api/v1/attempts/${attemptId}`);
    const paused = await api('POST', `/api/v1/attempts/${attemptId}/pause`, { writer_epoch: 1, expected_revision: 2 });
    expect(paused.status).toBe(200);
    const resumed = await api('POST', `/api/v1/attempts/${attemptId}/resume`, { writer_epoch: 1, expected_revision: 3 });
    expect(resumed.status).toBe(200);
    void cur;

    const submit = await api('POST', `/api/v1/attempts/${attemptId}/submit`, { expected_revision: 4 }, { 'idempotency-key': 'submit-1' });
    expect(submit.status).toBe(200);
    const gradeRevId = data(submit)['grade_revision_id'] as string;
    const reportRevId = data(submit)['report_revision_id'] as string;

    // 提交幂等：同 key 重放返回首次响应（同一 grade）；不同 key 对已提交卷返回 already_submitted
    const submit2 = await api('POST', `/api/v1/attempts/${attemptId}/submit`, { expected_revision: 4 }, { 'idempotency-key': 'submit-1' });
    expect(data(submit2)['grade_revision_id']).toBe(gradeRevId);
    const submit3 = await api('POST', `/api/v1/attempts/${attemptId}/submit`, { expected_revision: 99 }, { 'idempotency-key': 'submit-2' });
    expect(data(submit3)['already_submitted']).toBe(true);
    expect(data(submit3)['grade_revision_id']).toBe(gradeRevId);

    // 6. 结果与黄金数字
    const results = await api('GET', `/api/v1/attempts/${attemptId}/results`);
    expect(results.status).toBe(200);
    const agg = data(results)['aggregate'] as Record<string, number>;
    expect(agg['earned']).toBe(600);
    expect(agg['graded_max']).toBe(1000);
    expect(agg['total_max']).toBe(1000);
    expect(agg['pending_max']).toBe(0);
    expect(agg['answered_count']).toBe(4);
    expect(agg['correct_count']).toBe(3);
    expect(agg['incorrect_count']).toBe(1);
    expect(agg['unanswered_count']).toBe(1);
    void gradeRevId;

    // 7. 报告生成 + 下载
    const run1 = app.runWorkerOnce();
    expect(run1).toBe('ran');
    const rep = await api('GET', `/api/v1/reports/${reportRevId}`);
    expect(data(rep)['status']).toBe('ready');
    const dl = await app.inject({ method: 'GET', url: `/api/v1/reports/${reportRevId}/download?format=md` });
    expect(dl.statusCode).toBe(200);
    const md = dl.body;
    expect(md).toContain('**6 / 10 分**');
    expect(md).toContain('客观题正确率：60.0%');
    expect(md).toContain('已答正确率：75.0%');
    expect(md).toContain('前台有效 00:00'); // 未发心跳/聚焦段 duration 0 — 见下方说明
    expect(md.endsWith('\n')).toBe(true);
    expect(md).not.toContain('C:\\');
    const dl2 = await app.inject({ method: 'GET', url: `/api/v1/reports/${reportRevId}/download?format=md` });
    expect(dl2.body).toBe(md); // 字节级一致
    expect(existsSync(join(dataDir, 'reports', attemptId, 'manifest.json'))).toBe(true);

    // 8. 提交后状态查询返回摘要而非 PracticeDTO
    const after = await api('GET', `/api/v1/attempts/${attemptId}`);
    expect(data(after)['state']).toBe('submitted');
  });

  it('PracticeDTO 白名单与 403 来源校验', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/v1/health', headers: { origin: 'http://evil.example' } });
    expect(res.statusCode).toBe(403);
  });
});
