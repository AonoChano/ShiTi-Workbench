import { describe, expect, it, beforeEach, afterAll } from 'vitest';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { buildApp } from '../src/app.js';
import type { FastifyInstance } from 'fastify';
import { TEST_ADMIN_PASSWORD, loginCookie } from './helpers.js';

const sample = readFileSync(join(import.meta.dirname ?? '.', '..', '..', '..', 'samples', 'golden-five.json'), 'utf8');

let dataDir: string;
let app: FastifyInstance & { h: unknown; runWorkerOnce: () => 'idle' | 'ran' };
let cookie = '';

async function api(method: string, url: string, body?: unknown, headers?: Record<string, string>) {
  const res = await app.inject({ method: method as never, url, payload: body, headers: { cookie, ...headers } });
  return { status: res.statusCode, json: res.json() as Record<string, unknown> };
}
const data = (r: { json: Record<string, unknown> }) => r.json['data'] as Record<string, unknown>;

beforeEach(async () => {
  dataDir = mkdtempSync(join(tmpdir(), 'shiti-drill-'));
  app = await buildApp({ dataDir, serveWebDist: false, adminPassword: TEST_ADMIN_PASSWORD });
  await app.ready();
  cookie = await loginCookie(app);
  const imp = await api('POST', '/api/v1/imports', { content: sample });
  const importId = data(imp)['import_id'] as string;
  await api('POST', `/api/v1/imports/${importId}/commit`, { confirmed_warnings: [] }, { 'idempotency-key': 'commit-1' });
});
afterAll(async () => {
  await app?.close();
  rmSync(dataDir, { recursive: true, force: true, maxRetries: 8, retryDelay: 250 });
});

describe('专项练习（从题库按题型抽题）', () => {
  it('facets 统计 + 抽题建练习 + sets 列表不含内部题集', async () => {
    const facets = await api('GET', '/api/v1/practice/facets');
    expect(facets.status).toBe(200);
    const list = data(facets)['facets'] as Array<{ label: string; type: string; count: number; sections: string[] }>;
    expect(list).toHaveLength(1);
    expect(list[0]).toMatchObject({ type: 'single_choice', count: 5 });
    expect(list[0]['sections']).toEqual([]); // 黄金样本未声明 section 标签

    // 按题型抽题：count 小于材料题数时截取材料前面的题目（不超发）
    const drill = await api('POST', '/api/v1/attempts/practice', { type: 'single_choice', count: 3 });
    expect(drill.status).toBe(200);
    expect(data(drill)['question_count']).toBe(3);
    const attemptId = data(drill)['attempt_id'] as string;
    const dto = await api('GET', `/api/v1/attempts/${attemptId}`);
    expect(dto.status).toBe(200);
    expect((data(dto)['items'] as unknown[]).length).toBe(3);

    // 不传 count → 200 上限内全取（黄金样本无 section 标签，按题型抽）
    const drillAll = await api('POST', '/api/v1/attempts/practice', { type: 'single_choice' });
    expect(data(drillAll)['question_count']).toBe(5);

    // sets 列表只含 paper 题集，内部 drill 题集不出现
    const sets = await api('GET', '/api/v1/sets');
    expect((data(sets) as unknown[]).every((s) => (s as { title: string }).title !== '专项练习（自动生成）')).toBe(true);

    // 无匹配条件 → 422
    const none = await api('POST', '/api/v1/attempts/practice', { type: 'true_false' });
    expect(none.status).toBe(422);
    expect((none.json['error'] as Record<string, unknown>)['code']).toBe('NO_QUESTIONS');

    // 非法题型 → 400
    const bad = await api('POST', '/api/v1/attempts/practice', { type: 'essay' });
    expect(bad.status).toBe(400);
  });

  it('count 超过剩余题目时全部取完；count=2 截取 2 题（黄金样本 5 题同一材料）', async () => {
    const drill = await api('POST', '/api/v1/attempts/practice', { type: 'single_choice', count: 2 });
    expect(data(drill)['question_count']).toBe(2);
  });

  it('同一材料内保持原卷顺序（先按空位顺序，组间才按新卷优先）', async () => {
    const drill = await api('POST', '/api/v1/attempts/practice', { type: 'single_choice' });
    const attemptId = data(drill)['attempt_id'] as string;
    const dto = await api('GET', `/api/v1/attempts/${attemptId}`);
    const items = data(dto)['items'] as Array<{ stem: string }>;
    const sampleOrder = (JSON.parse(sample) as { questions: Array<{ stem: string }> }).questions.map((q) => q.stem);
    expect(items.map((i) => i.stem)).toEqual(sampleOrder);
  });
});
