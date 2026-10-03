import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { parseImport } from '@shiti/shared';
import type { DbHandle } from './db.js';
import { sha256Hex } from './db.js';
import { bumpSetFromPayload, createSetFromPayload, type ImportPayloadView } from './content-service.js';
import { nowIso } from './util.js';

export interface BankFileRow {
  path: string;
  file_hash: string;
  size: number;
  mtime_ms: number;
  status: 'imported' | 'error';
  set_id: string | null;
  set_version_id: string | null;
  issues: Array<{ level: string; code: string; message: string; question_id?: string; field?: string }>;
  scanned_at: string;
}

export interface ScanSummary {
  scanned: number;
  imported: number;
  changed: number;
  errors: number;
  skipped: number;
  failures: Array<{ path: string; issues: Array<{ level: string; code: string; message: string }> }>;
}

/**
 * 扫描题库目录 question_bank/<科目>/*.json（下划线开头的是文档/示例，跳过）。
 * - 新文件：校验零错误 → 自动建卷入库
 * - 内容变化：同一题集生成新题目版本 + 新题集版本，旧练习快照不受影响
 * - 校验错误：只记录失败清单，不影响已入库内容
 */
export function scanBank(h: DbHandle, bankDir: string): ScanSummary {
  const summary: ScanSummary = { scanned: 0, imported: 0, changed: 0, errors: 0, skipped: 0, failures: [] };
  let subjects: string[] = [];
  try {
    subjects = readdirSync(bankDir, { withFileTypes: true })
      .filter((e) => e.isDirectory() && !e.name.startsWith('.') && !e.name.startsWith('_'))
      .map((e) => e.name);
  } catch {
    return summary; // 目录不存在：视为空题库
  }
  const getRow = h.db.prepare('SELECT * FROM bank_files WHERE path = ?');
  const upsert = h.db.prepare(
    'INSERT INTO bank_files (path, file_hash, size, mtime_ms, status, set_id, set_version_id, issues_json, scanned_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?) ' +
    'ON CONFLICT(path) DO UPDATE SET file_hash = excluded.file_hash, size = excluded.size, mtime_ms = excluded.mtime_ms, status = excluded.status, set_id = excluded.set_id, set_version_id = excluded.set_version_id, issues_json = excluded.issues_json, scanned_at = excluded.scanned_at',
  );

  for (const subject of subjects) {
    const dir = join(bankDir, subject);
    let files: string[] = [];
    try {
      files = readdirSync(dir, { withFileTypes: true })
        .filter((e) => e.isFile() && e.name.endsWith('.json') && !e.name.startsWith('_'))
        .map((e) => e.name);
    } catch { continue; }

    for (const file of files) {
      const rel = `${subject}/${file}`;
      const abs = join(dir, file);
      let content: string;
      let size = 0, mtimeMs = 0;
      try {
        content = readFileSync(abs, 'utf8');
        const st = statSync(abs);
        size = st.size; mtimeMs = Math.floor(st.mtimeMs);
      } catch {
        continue; // 读取瞬间消失（写入中），下轮再扫
      }
      summary.scanned += 1;
      const prev = getRow.get(rel) as
        | { file_hash: string; size: number; mtime_ms: number; status: string; set_id: string | null } | undefined;
      const hash = sha256Hex(content);
      if (prev && prev.size === size && prev.mtime_ms === mtimeMs) {
        summary.skipped += 1; // 未变化：连 hash 都不用重算
        continue;
      }
      if (prev && prev.file_hash === hash) {
        summary.skipped += 1;
        continue;
      }

      const parsed = parseImport(content);
      const issues = parsed.issues;
      const tx = h.db.transaction(() => {
        if (parsed.error_count > 0 || !parsed.payload) {
          upsert.run(rel, hash, size, mtimeMs, 'error', prev?.set_id ?? null, null, JSON.stringify(issues), nowIso());
          summary.errors += 1;
          summary.failures.push({ path: rel, issues: issues.filter((i) => i.level === 'error') });
          return;
        }
        const payload = parsed.payload as unknown as ImportPayloadView;
        const existingSet = h.db.prepare('SELECT id, bank_hash FROM question_sets WHERE workspace_id = ? AND bank_path = ?')
          .get('ws-default', rel) as { id: string; bank_hash: string | null } | undefined;
        let setId: string; let setVersionId: string;
        if (!existingSet) {
          const r = createSetFromPayload(h, payload, { now: nowIso(), bankPath: rel, bankHash: hash });
          setId = r.set_id; setVersionId = r.set_version_id;
          summary.imported += 1;
        } else if (existingSet.bank_hash === hash) {
          setId = existingSet.id;
          setVersionId = (h.db.prepare('SELECT current_version_id FROM question_sets WHERE id = ?').get(existingSet.id) as { current_version_id: string }).current_version_id;
          summary.skipped += 1;
        } else {
          const r = bumpSetFromPayload(h, existingSet.id, payload, { now: nowIso(), bankHash: hash });
          setId = r.set_id; setVersionId = r.set_version_id;
          summary.changed += 1;
        }
        upsert.run(rel, hash, size, mtimeMs, 'imported', setId, setVersionId, JSON.stringify(issues.filter((i) => i.level === 'warning')), nowIso());
      });
      tx();
    }
  }
  return summary;
}

export function listBankStatus(h: DbHandle): BankFileRow[] {
  return (h.db.prepare('SELECT * FROM bank_files ORDER BY path').all() as unknown as Array<Omit<BankFileRow, 'issues'> & { issues_json: string }>)
    .map((r) => ({
      path: r.path, file_hash: r.file_hash, size: r.size, mtime_ms: r.mtime_ms,
      status: r.status as BankFileRow['status'], set_id: r.set_id, set_version_id: r.set_version_id,
      issues: JSON.parse(r.issues_json), scanned_at: r.scanned_at,
    }));
}
