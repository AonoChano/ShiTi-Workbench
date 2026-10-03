import { readFileSync } from 'node:fs';
import { parseImport } from '../packages/shared/src/import-schema.js';

/** 试卷 JSON 自检：npm run check-json -- <文件路径>。零错误退出码 0，否则 1。 */
const file = process.argv[2];
if (!file) {
  console.error('用法：npm run check-json -- <试卷.json>');
  process.exit(2);
}
let raw: string;
try {
  raw = readFileSync(file, 'utf8');
} catch (e) {
  console.error(`无法读取文件 ${file}：${(e as Error).message}`);
  process.exit(2);
}
const r = parseImport(raw);
console.log(`文件：${file}`);
console.log(`题数：${r.question_count} · 错误：${r.error_count} · 警告：${r.warning_count}`);
if (r.payload?.meta) {
  const m = r.payload.meta;
  console.log(`元数据：year=${m.year ?? '—'} paper=${m.paper ?? '—'} source=${m.source_file ?? '—'}`);
}
if (r.issues.length > 0) {
  console.log('─'.repeat(60));
  for (const i of r.issues) {
    const tag = i.level === 'error' ? '[错误]' : '[警告]';
    const q = i.question_id ? `（${i.question_id}${i.field ? ` · ${i.field}` : ''}）` : (i.field ? `（${i.field}）` : '');
    console.log(`${tag} ${i.code}${q}: ${i.message}`);
  }
}
console.log(r.error_count === 0 ? '✓ 通过：放入 question_bank/<科目>/ 即会自动入库' : '✗ 未通过：先修正全部错误');
process.exit(r.error_count === 0 ? 0 : 1);
