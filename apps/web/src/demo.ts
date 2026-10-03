/** 学习台演示数据（打卡/计划/错题本等尚未接后端的功能先在浏览器本地保存）。 */
export type Page = 'overview' | 'papers' | 'drill' | 'mistakes' | 'plan' | 'guide';
export type CategoryKey = 'reading' | 'cloze' | 'translation' | 'writing';
export type ExamType = '英语一' | '英语二';

export interface Mistake {
  id: string;
  exerciseId: CategoryKey;
  questionId: string;
  picked: string;
  addedAt: string;
}

export interface StudyTask {
  id: string;
  title: string;
  category: CategoryKey;
  date: string;
  minutes: number;
  done: boolean;
}

export interface HistoryItem {
  id: string;
  title: string;
  category: CategoryKey;
  date: string;
  completed: boolean;
  correct: number | null;
  total: number;
  minutes: number;
}

export interface Profile {
  name: string;
  exam: ExamType;
  dailyTarget: number;
  targetDate: string;
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

const targetYear = new Date().getMonth() === 11 && new Date().getDate() > 19 ? new Date().getFullYear() + 1 : new Date().getFullYear();

export const initialProfile: Profile = {
  name: '拾题同学',
  exam: '英语一',
  dailyTarget: 20,
  targetDate: `${targetYear}-12-19`,
};

export const initialTasks: StudyTask[] = [
  { id: 'task-1', title: '完成一篇阅读理解', category: 'reading', date: localDate(), minutes: 20, done: false },
  { id: 'task-2', title: '复习昨日的错题', category: 'cloze', date: localDate(), minutes: 10, done: true },
  { id: 'task-3', title: '积累一篇写作范文', category: 'writing', date: localDate(), minutes: 15, done: false },
];

export const initialMistakes: Mistake[] = [
  { id: 'demo-mistake-1', exerciseId: 'reading', questionId: 'reading-1', picked: 'A', addedAt: daysAgo(1) },
  { id: 'demo-mistake-2', exerciseId: 'cloze', questionId: 'cloze-2', picked: 'B', addedAt: daysAgo(2) },
];

export const initialHistory: HistoryItem[] = [
  { id: 'demo-history-1', title: '演示记录 · 接入练习记录后此处显示真题练习', category: 'reading', date: localDate(), completed: false, correct: null, total: 3, minutes: 8 },
  { id: 'demo-history-2', title: '演示记录 · 练习记录接口在后续版本提供', category: 'cloze', date: daysAgo(1), completed: true, correct: 2, total: 3, minutes: 12 },
];
