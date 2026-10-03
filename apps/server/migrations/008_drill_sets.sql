-- 题集分类：paper = 正常试卷（题库导入/手动导入），drill = 专项练习抽题生成的内部题集（不出现在题库列表）
ALTER TABLE question_sets ADD COLUMN kind TEXT NOT NULL DEFAULT 'paper';
