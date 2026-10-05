-- 009 · 用户系统：账号、服务端会话、学习数据按用户归属
-- 存量单机数据（attempts）通过 DEFAULT 'u-admin' 全部归属管理员账号（auth-service 启动种子用同一 id）。

CREATE TABLE users (
  id TEXT PRIMARY KEY,
  username TEXT NOT NULL COLLATE NOCASE UNIQUE,
  email TEXT NOT NULL COLLATE NOCASE UNIQUE,
  nickname TEXT NOT NULL,
  password_hash TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'user' CHECK (role IN ('admin', 'user')),
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'disabled')),
  preferences_json TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE auth_sessions (
  token_hash TEXT PRIMARY KEY, -- 只存 sha256(token)，原文仅出现在 Cookie 里
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  remember INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  expires_at_ms INTEGER NOT NULL,
  last_seen_ms INTEGER NOT NULL,
  user_agent TEXT
);
CREATE INDEX idx_sessions_user ON auth_sessions(user_id);

-- SQLite 的 ADD COLUMN 带 REFERENCES 时默认值必须为 NULL，因此 user_id 不建外键，
-- 归属正确性由应用层保证（管理员种子固定 id='u-admin'）
ALTER TABLE attempts ADD COLUMN user_id TEXT NOT NULL DEFAULT 'u-admin';
CREATE INDEX idx_attempts_user ON attempts(user_id, updated_at);

CREATE TABLE study_tasks (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  title TEXT NOT NULL,
  category TEXT NOT NULL,
  date TEXT NOT NULL,
  minutes INTEGER NOT NULL DEFAULT 20,
  done INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX idx_tasks_user_date ON study_tasks(user_id, date);

CREATE TABLE check_ins (
  user_id TEXT NOT NULL,
  date TEXT NOT NULL,
  created_at TEXT NOT NULL,
  PRIMARY KEY (user_id, date)
);

-- 错题本：交卷判分时按 (user_id, question_id) 聚合收录；答对自动结清，答错重新激活
CREATE TABLE mistake_book (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  question_id TEXT NOT NULL,
  question_version_id TEXT NOT NULL,
  attempt_id TEXT NOT NULL,
  attempt_item_id TEXT NOT NULL,
  type TEXT NOT NULL,
  section TEXT,
  stem TEXT NOT NULL,
  options_json TEXT,
  my_answer_json TEXT,
  answer_key_json TEXT,
  explanation TEXT,
  wrong_count INTEGER NOT NULL DEFAULT 1,
  resolved INTEGER NOT NULL DEFAULT 0,
  first_wrong_at TEXT NOT NULL,
  last_wrong_at TEXT NOT NULL,
  UNIQUE (user_id, question_id)
);
CREATE INDEX idx_mistakes_user ON mistake_book(user_id, resolved, last_wrong_at);
