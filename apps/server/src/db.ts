import Database from 'better-sqlite3';
import { createHash } from 'node:crypto';
import { mkdirSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

export interface DbHandle {
  db: Database.Database;
  dataDir: string;
  reportsDir: string;
}

export function sha256Hex(s: string | Buffer): string {
  return createHash('sha256').update(s).digest('hex');
}

/** 规范化 JSON：递归排序对象键，用于 hash 与幂等比较。 */
export function stableStringify(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(',')}]`;
  const keys = Object.keys(value as Record<string, unknown>).sort();
  return `{${keys.map((k) => `${JSON.stringify(k)}:${stableStringify((value as Record<string, unknown>)[k])}`).join(',')}}`;
}

export function sha256Stable(value: unknown): string {
  return sha256Hex(stableStringify(value));
}

const MIGRATIONS_DIR = new URL('../migrations/', import.meta.url);

export function openWorkspace(dataDir: string): DbHandle {
  mkdirSync(dataDir, { recursive: true });
  mkdirSync(join(dataDir, 'assets'), { recursive: true });
  const reportsDir = join(dataDir, 'reports');
  mkdirSync(reportsDir, { recursive: true });
  const db = new Database(join(dataDir, 'workspace.sqlite'));
  db.pragma('journal_mode = WAL');
  db.pragma('synchronous = FULL');
  db.pragma('foreign_keys = ON');
  migrate(db);
  ensureWorkspaceRow(db);
  return { db, dataDir, reportsDir };
}

function migrate(db: Database.Database): void {
  db.exec('CREATE TABLE IF NOT EXISTS schema_migrations (version INTEGER PRIMARY KEY, checksum TEXT NOT NULL, applied_at TEXT NOT NULL)');
  const applied = new Set(
    (db.prepare('SELECT version FROM schema_migrations').all() as Array<{ version: number }>).map((r) => r.version),
  );
  const files = readdirSync(MIGRATIONS_DIR).filter((f) => f.endsWith('.sql')).sort();
  for (const f of files) {
    const version = Number(f.split('_')[0]);
    if (applied.has(version)) continue;
    const sql = readFileSync(new URL(f, MIGRATIONS_DIR), 'utf8');
    const checksum = sha256Hex(sql);
    const tx = db.transaction(() => {
      db.exec(sql);
      db.prepare('INSERT INTO schema_migrations (version, checksum, applied_at) VALUES (?, ?, ?)').run(version, checksum, new Date().toISOString());
    });
    tx();
  }
}

function ensureWorkspaceRow(db: Database.Database): void {
  const n = (db.prepare('SELECT COUNT(*) AS n FROM workspace').get() as { n: number }).n;
  if (n === 0) {
    const now = new Date().toISOString();
    db.prepare('INSERT INTO workspace (id, name, timezone, created_at, updated_at) VALUES (?, ?, ?, ?, ?)')
      .run('ws-default', '默认工作区', 'Asia/Shanghai', now, now);
  }
}
