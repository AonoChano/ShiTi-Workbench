-- 004 · 题库目录自动识别（question_bank/<科目>/<年份>.json）
ALTER TABLE question_sets ADD COLUMN bank_path TEXT;
ALTER TABLE question_sets ADD COLUMN bank_hash TEXT;
ALTER TABLE questions ADD COLUMN source_key TEXT;
CREATE INDEX idx_questions_source_key ON questions(source_key);
CREATE UNIQUE INDEX idx_sets_bank_path ON question_sets(workspace_id, bank_path);

CREATE TABLE bank_files (
  path TEXT PRIMARY KEY,
  file_hash TEXT NOT NULL,
  size INTEGER NOT NULL DEFAULT 0,
  mtime_ms INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL CHECK (status IN ('imported', 'error')),
  set_id TEXT,
  set_version_id TEXT,
  issues_json TEXT NOT NULL DEFAULT '[]',
  scanned_at TEXT NOT NULL
);
