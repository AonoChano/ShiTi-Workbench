-- 005 · 外部 Agent 文件驱动复盘（docs/05 P0 契约）
-- 上下文投影的不可变版本：MD/JSON 原字节 + 摘要 + 证据索引
CREATE TABLE agent_context_revisions (
  id TEXT PRIMARY KEY,
  attempt_id TEXT NOT NULL REFERENCES attempts(id),
  version INTEGER NOT NULL,
  grade_revision_id TEXT NOT NULL,
  md_bytes BLOB NOT NULL,
  json_bytes BLOB NOT NULL,
  md_sha256 TEXT NOT NULL,
  json_sha256 TEXT NOT NULL,
  evidence_json TEXT NOT NULL,
  created_at TEXT NOT NULL,
  UNIQUE (attempt_id, version)
);

-- 外部 Agent 提交并通过校验的 review 修订（不可变，存完整字节与解析结果）
CREATE TABLE external_review_revisions (
  id TEXT PRIMARY KEY,
  attempt_id TEXT NOT NULL REFERENCES attempts(id),
  version INTEGER NOT NULL,
  context_revision_id TEXT NOT NULL REFERENCES agent_context_revisions(id),
  base_revision INTEGER NOT NULL,
  file_sha256 TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('draft', 'complete')),
  md_bytes BLOB NOT NULL,
  parsed_json TEXT NOT NULL,
  created_at TEXT NOT NULL,
  UNIQUE (attempt_id, version)
);

CREATE INDEX idx_ctx_attempt ON agent_context_revisions(attempt_id);
CREATE INDEX idx_review_attempt ON external_review_revisions(attempt_id);
