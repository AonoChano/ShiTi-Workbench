import type { LucideIcon } from 'lucide-react';
import { AlignLeft, BookOpen, Languages, PenLine } from 'lucide-react';
import { categories } from '../demo';
import type { CategoryKey } from '../demo';

export const categoryIcons: Record<CategoryKey, LucideIcon> = { reading: BookOpen, cloze: AlignLeft, translation: Languages, writing: PenLine };

export function CategoryIcon({ category, small = false }: { category: CategoryKey; small?: boolean }) {
  const Icon = categoryIcons[category];
  const info = categories.find((item) => item.id === category);
  const color = info?.color ?? 'sage';
  return <span className={`category-icon ${color} ${small ? 'category-icon-small' : ''}`}><Icon size={small ? 17 : 21} strokeWidth={1.7} /></span>;
}
