-- 题目配图：主观题（如看图作文）在题干之外的受控图片引用，相对试卷目录的 POSIX 相对路径数组
ALTER TABLE question_versions ADD COLUMN images_json TEXT;
