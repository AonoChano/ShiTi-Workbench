-- 大题声明（章节扉页）：随题集版本存储，答题页据此渲染 Part X + Directions
ALTER TABLE question_set_versions ADD COLUMN sections_json TEXT;
