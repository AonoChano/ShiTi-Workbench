-- 001 · M1 初始结构（docs/02 §2 的 M1 子集；命名保持一致以便扩展）
PRAGMA foreign_keys = ON;

CREATE TABLE workspace (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  timezone TEXT NOT NULL,
  schema_version INTEGER NOT NULL DEFAULT 1,
  preferences_json TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE materials (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL,
  version INTEGER NOT NULL DEFAULT 1,
  title TEXT NOT NULL,
  blocks_json TEXT NOT NULL,
  source_note TEXT,
  hash TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE TABLE questions (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL,
  current_published_version_id TEXT,
  archived_at TEXT,
  created_at TEXT NOT NULL
);

CREATE TABLE question_versions (
  id TEXT PRIMARY KEY,
  question_id TEXT NOT NULL REFERENCES questions(id),
  version INTEGER NOT NULL,
  type TEXT NOT NULL,
  stem TEXT NOT NULL,
  options_json TEXT NOT NULL,
  material_id TEXT,
  answer_key_json TEXT,
  explanation TEXT,
  max_score_units INTEGER NOT NULL,
  tags_json TEXT NOT NULL DEFAULT '[]',
  source_note TEXT,
  hash TEXT NOT NULL,
  created_at TEXT NOT NULL,
  UNIQUE (question_id, version)
);

CREATE TABLE question_sets (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL,
  title TEXT NOT NULL,
  current_version_id TEXT,
  is_demo INTEGER NOT NULL DEFAULT 0,
  archived_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE question_set_versions (
  id TEXT PRIMARY KEY,
  set_id TEXT NOT NULL REFERENCES question_sets(id),
  version INTEGER NOT NULL,
  entries_json TEXT NOT NULL,
  hash TEXT NOT NULL,
  created_at TEXT NOT NULL,
  UNIQUE (set_id, version)
);

CREATE TABLE import_sessions (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('needs_review', 'committed', 'cancelled')),
  draft_json TEXT NOT NULL,
  issues_json TEXT NOT NULL,
  parser_version TEXT NOT NULL,
  content_hash TEXT NOT NULL,
  committed_set_version_id TEXT,
  revision INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE attempts (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL,
  set_version_id TEXT NOT NULL REFERENCES question_set_versions(id),
  mode TEXT NOT NULL CHECK (mode IN ('training', 'timed')),
  state TEXT NOT NULL CHECK (state IN ('draft', 'in_progress', 'paused', 'submitted', 'abandoned')),
  started_at TEXT,
  submitted_at TEXT,
  item_order_json TEXT NOT NULL,
  revision INTEGER NOT NULL DEFAULT 1,
  writer_epoch INTEGER NOT NULL DEFAULT 0,
  lease_client TEXT,
  lease_until INTEGER,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE attempt_items (
  id TEXT PRIMARY KEY,
  attempt_id TEXT NOT NULL REFERENCES attempts(id),
  question_id TEXT NOT NULL,
  question_version_id TEXT NOT NULL,
  "order" INTEGER NOT NULL,
  snapshot_json TEXT NOT NULL,
  max_score_units INTEGER NOT NULL,
  UNIQUE (attempt_id, "order")
);

CREATE TABLE answer_drafts (
  attempt_item_id TEXT PRIMARY KEY REFERENCES attempt_items(id),
  answer_json TEXT,
  confidence TEXT,
  reasoning TEXT,
  flagged INTEGER NOT NULL DEFAULT 0,
  revision INTEGER NOT NULL DEFAULT 0,
  updated_at TEXT NOT NULL
);

CREATE TABLE client_actions (
  seq INTEGER PRIMARY KEY AUTOINCREMENT,
  attempt_id TEXT NOT NULL REFERENCES attempts(id),
  action_id TEXT NOT NULL,
  client_seq INTEGER NOT NULL,
  attempt_item_id TEXT,
  expected_draft_revision INTEGER,
  event_type TEXT NOT NULL,
  payload_json TEXT NOT NULL,
  ack_json TEXT NOT NULL,
  received_at TEXT NOT NULL,
  UNIQUE (attempt_id, action_id)
);

CREATE TABLE answer_snapshots (
  attempt_item_id TEXT PRIMARY KEY REFERENCES attempt_items(id),
  submitted_answer_json TEXT,
  confidence TEXT,
  reasoning TEXT,
  flagged INTEGER NOT NULL DEFAULT 0,
  draft_revision INTEGER NOT NULL
);

CREATE TABLE timing_segments (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  attempt_id TEXT NOT NULL REFERENCES attempts(id),
  item_id TEXT,
  kind TEXT NOT NULL CHECK (kind IN ('item', 'material', 'unattributed', 'pause', 'unknown')),
  start_at INTEGER NOT NULL,
  end_at INTEGER
);

CREATE TABLE submissions (
  attempt_id TEXT PRIMARY KEY REFERENCES attempts(id),
  idempotency_key TEXT NOT NULL,
  submitted_at TEXT NOT NULL,
  reason TEXT NOT NULL CHECK (reason IN ('manual', 'deadline')),
  snapshot_hash TEXT NOT NULL,
  ack_revision INTEGER NOT NULL
);

CREATE TABLE grade_revisions (
  id TEXT PRIMARY KEY,
  attempt_id TEXT NOT NULL,
  version INTEGER NOT NULL,
  rule_version TEXT NOT NULL,
  source TEXT NOT NULL,
  items_json TEXT NOT NULL,
  aggregate_json TEXT NOT NULL,
  created_at TEXT NOT NULL,
  UNIQUE (attempt_id, version)
);

CREATE TABLE report_revisions (
  id TEXT PRIMARY KEY,
  attempt_id TEXT NOT NULL,
  version INTEGER NOT NULL,
  grade_revision_id TEXT NOT NULL,
  schema_version TEXT NOT NULL,
  export_profile TEXT NOT NULL,
  input_hash TEXT NOT NULL,
  generated_at TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('queued', 'generating', 'ready', 'failed')),
  md_path TEXT,
  json_path TEXT,
  manifest_path TEXT,
  md_sha256 TEXT,
  json_sha256 TEXT,
  created_at TEXT NOT NULL,
  UNIQUE (attempt_id, version)
);

CREATE TABLE jobs (
  id TEXT PRIMARY KEY,
  type TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('queued', 'running', 'succeeded', 'failed', 'cancelled')),
  payload_json TEXT NOT NULL,
  dedupe_key TEXT UNIQUE,
  attempts INTEGER NOT NULL DEFAULT 0,
  next_run_at INTEGER NOT NULL,
  lease_until INTEGER,
  cancel_requested INTEGER NOT NULL DEFAULT 0,
  error_code TEXT,
  error_message TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE idempotency_keys (
  key TEXT NOT NULL,
  workspace_id TEXT NOT NULL,
  endpoint TEXT NOT NULL,
  status_code INTEGER NOT NULL,
  response_json TEXT NOT NULL,
  created_at TEXT NOT NULL,
  PRIMARY KEY (key, endpoint)
);

CREATE INDEX idx_attempts_state ON attempts(workspace_id, state);
CREATE INDEX idx_items_attempt ON attempt_items(attempt_id, "order");
CREATE INDEX idx_segments_attempt ON timing_segments(attempt_id);
CREATE INDEX idx_actions_attempt ON client_actions(attempt_id, client_seq);
