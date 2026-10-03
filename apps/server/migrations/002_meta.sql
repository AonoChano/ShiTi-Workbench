-- 002 · 试卷元数据（TestPaperJSON 规格 1.1）
ALTER TABLE question_sets ADD COLUMN meta_json TEXT;
ALTER TABLE materials ADD COLUMN section TEXT;
ALTER TABLE question_versions ADD COLUMN section TEXT;
ALTER TABLE question_versions ADD COLUMN source_ref TEXT;
