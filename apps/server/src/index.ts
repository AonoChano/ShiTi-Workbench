import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildApp } from './app.js';
import { startReviewWatcher, stopReviewWatcher } from './review-service.js';

const dataDir = process.env['SHITI_DATA_DIR']
  ?? join(process.env['LOCALAPPDATA'] ?? join('C:', 'Users', 'Public'), 'ShitiWorkbench', 'workspaces', 'default');
// 题库目录：question_bank/<科目>/*.json，转换 AI 产出后自动识别入库
const bankDir = process.env['SHITI_BANK_DIR']
  ?? fileURLToPath(new URL('../../../question_bank', import.meta.url));

const app = await buildApp({ dataDir, bankDir, serveWebDist: true });
const port = Number(process.env['SHITI_PORT'] ?? 8210);

await app.ready();
// 题库目录自动识别：启动扫一遍，之后每 5s 增量扫描（mtime/size 未变的文件直接跳过）
app.rescanBank();
const bankTimer = setInterval(() => {
  try {
    app.rescanBank();
  } catch {
    // 单轮失败不影响服务，下轮重扫
  }
}, 5000);
bankTimer.unref?.();
// M1：进程内 Worker，1s 轮询 Job 表（ADR 0001 第 4 条；M2 拆分独立进程）
const timer = setInterval(() => {
  try {
    app.runWorkerOnce();
  } catch {
    // 单次失败不拖垮服务；Job 表有重试与退避
  }
}, 1000);
timer.unref?.();

startReviewWatcher(app.h, dataDir);
await app.listen({ port, host: '127.0.0.1' });
app.log.info(`拾题 API 就绪：http://127.0.0.1:${port}  数据目录：${dataDir}  题库目录：${bankDir}`);

for (const sig of ['SIGINT', 'SIGTERM'] as const) {
  process.on(sig, () => {
    clearInterval(timer);
    clearInterval(bankTimer);
    stopReviewWatcher();
    void app.close().finally(() => process.exit(0));
  });
}
