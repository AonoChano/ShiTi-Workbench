import { describe, expect, it } from 'vitest';
import { normalizeSection } from '../src/practice-service.js';

describe('normalizeSection 大题标签归并', () => {
  it('2005 年前的英译汉 Part B 按主观题型归为翻译（1991/1992 误分类回归）', () => {
    expect(normalizeSection('Section II · Reading Comprehension Part B', 'free_text')).toBe('翻译');
    expect(normalizeSection('Part II · Reading Comprehension Part B', 'free_text')).toBe('翻译');
    expect(normalizeSection('Section II · Reading Comprehension Part B', 'fill_blank')).toBe('翻译');
  });

  it('同名 Part B 的单选仍归新题型', () => {
    expect(normalizeSection('Section II · Reading Comprehension Part B', 'single_choice')).toBe('新题型');
    expect(normalizeSection('Section II · Reading Comprehension Part B')).toBe('新题型');
  });

  it('其余标签归并不受影响', () => {
    expect(normalizeSection('Section II · Reading Comprehension Part C', 'free_text')).toBe('翻译');
    expect(normalizeSection('Section II · 翻译 Part B', 'free_text')).toBe('翻译');
    expect(normalizeSection('英译汉', 'free_text')).toBe('翻译');
    expect(normalizeSection('新题型（排序）', 'single_choice')).toBe('新题型');
    expect(normalizeSection('新题型（7选5）', 'single_choice')).toBe('新题型');
    expect(normalizeSection('英语知识运用（完形填空）', 'single_choice')).toBe('完形填空');
    expect(normalizeSection('Section I · Use of English', 'single_choice')).toBe('完形填空');
    expect(normalizeSection('Section II · 阅读理解 Part A', 'single_choice')).toBe('阅读理解');
    expect(normalizeSection('Section III · 写作 Part A', 'free_text')).toBe('写作');
    expect(normalizeSection(null)).toBe('未分类');
  });
});
