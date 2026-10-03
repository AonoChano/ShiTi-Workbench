import { describe, expect, it, beforeEach, afterAll } from 'vitest';
import { mkdtempSync, rmSync, writeFileSync, mkdirSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { buildApp } from '../src/app.js';
import type { FastifyInstance } from 'fastify';

const demoPayload = JSON.stringify({
  spec_version: '1.1',
  meta: { year: 2001, paper: '测试卷', source_file: 'x.md', converted_by: 't', converted_at: '2026-09-30T00:00:00+08:00', license_note: '测试' },
  set: { title: '2001 测试卷' },
  materials: [{ id: 'm1', title: '材料一', section: 'Section I', blocks: [{ id: 'p1', type: 'paragraph', text: '正文' }] }],
  questions: [{
    id: 'q1', section: 'Section I', type: 'single_choice', material_id: 'm1', stem: '题干',
    options: [{ id: 'q1-a', text: 'A' }, { id: 'q1-b', text: 'B' }],
    answer_key: { selected_option_ids: ['q1-a'] }, max_score_units: 100,
  }],
});

let dataDir: string;
let bankDir: string;
let app: FastifyInstance & { h: unknown; runWorkerOnce: () => 'idle' | 'ran'; rescanBank: () => unknown };
const subjectDir = () => join(bankDir, 'TEST_SUBJECT');

beforeEach(() => {
  dataDir = mkdtempSync(join(tmpdir(), 'shiti-bank-data-'));
  bankDir = mkdtempSync(join(tmpdir(), 'shiti-bank-src-'));
  mkdirSync(subjectDir());
  writeFileSync(join(subjectDir(), 'demo.json'), demoPayload);
  return buildApp({ dataDir, bankDir, serveWebDist: false }).then(async (a) => {
    app = a;
    await a.ready();
  });
});
afterAll(async () => {
  await app?.close();
  rmSync(dataDir, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
  rmSync(bankDir, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
});

describe('题库目录自动识别', () => {
  it('新文件自动入库；未变化跳过；内容修订生成新版本', async () => {
    // 1. 首次扫描 → 入库
    const s1 = app.rescanBank() as { scanned: number; imported: number; skipped: number };
    expect(s1.imported).toBe(1);
    const sets1 = JSON.parse((await app.inject({ method: 'GET', url: '/api/v1/sets' })).body).data as Array<Record<string, unknown>>;
    expect(sets1).toHaveLength(1);
    const setId = sets1[0]['set_id'] as string;
    expect(sets1[0]['question_count']).toBe(1);

    // 2. 立即重扫 → 全部跳过（幂等，不重复建卷）
    const s2 = app.rescanBank() as { imported: number; changed: number };
    expect(s2.imported).toBe(0);
    expect(s2.changed).toBe(0);

    // 3. 内容修订（换答案）→ 同一题集生成新版本
    const changed = demoPayload.replace('"selected_option_ids":["q1-a"]', '"selected_option_ids":["q1-b"]');
    expect(changed).not.toBe(demoPayload);
    writeFileSync(join(subjectDir(), 'demo.json'), changed);
    const s3 = app.rescanBank() as { changed: number; imported: number };
    expect(s3.changed).toBe(1);
    const detail = JSON.parse((await app.inject({ method: 'GET', url: `/api/v1/sets/${setId}` })).body).data as { version: number };
    expect(detail.version).toBe(2);

    // 4. 未变化的文件不重复扫描（mtime/size 命中即跳过）
    const s4 = app.rescanBank() as { scanned: number; skipped: number };
    expect(s4.scanned).toBe(1);
    expect(s4.skipped).toBe(1);
  });

  it('校验错误文件标记 error，不影响已入库内容；下划线文件被忽略', async () => {
    // 依赖前一个用例的题库状态？beforeEach 每次重建 —— 这里重新放文件
    writeFileSync(join(subjectDir(), 'broken.json'), '{oops');
    writeFileSync(join(subjectDir(), '_规格说明.json'), JSON.stringify({ anything: true }));
    const s = app.rescanBank() as { imported: number; errors: number };
    expect(s.errors).toBe(1);
    const status = JSON.parse((await app.inject({ method: 'GET', url: '/api/v1/bank/status' })).body).data as { files: Array<{ path: string; status: string }> };
    const broken = status.files.find((f) => f.path.endsWith('broken.json'));
    expect(broken?.status).toBe('error');
    // 下划线文件不进状态表
    expect(status.files.some((f) => f.path.includes('_规格说明'))).toBe(false);
    // broken 不产生题集；demo.json 正常入库
    const sets = JSON.parse((await app.inject({ method: 'GET', url: '/api/v1/sets' })).body).data as Array<unknown>;
    expect(sets).toHaveLength(1);
  });
});
