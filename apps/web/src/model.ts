/** 学习台共用模型与工具（页面、题型分类、日期工具）。 */
export type Page = 'overview' | 'papers' | 'drill' | 'mistakes' | 'plan' | 'guide';
export type CategoryKey = 'reading' | 'cloze' | 'translation' | 'writing';
export type ExamType = '英语一' | '英语二';

export interface StudyTask {
  id: string;
  title: string;
  category: CategoryKey;
  date: string;
  minutes: number;
  done: boolean;
}

export const categories: { id: CategoryKey; name: string; english: string; description: string; color: string }[] = [
  { id: 'reading', name: '阅读理解', english: 'READING', description: '读懂文章，也读懂出题人的思路', color: 'sage' },
  { id: 'cloze', name: '完形填空', english: 'CLOZE', description: '从上下文中，找到恰好的答案', color: 'peach' },
  { id: 'translation', name: '翻译', english: 'TRANSLATION', description: '拆解长难句，让表达更准确', color: 'lavender' },
  { id: 'writing', name: '写作', english: 'WRITING', description: '积累好表达，写出自己的逻辑', color: 'blue' },
];

export function localDate(date = new Date()) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

export function daysAgo(days: number) {
  const date = new Date();
  date.setDate(date.getDate() - days);
  return localDate(date);
}
