/** 练习相关的小工具，跨页面共享。 */
import type { Draft, ItemDTO } from './practiceTypes';

export function clientInstanceId(): string {
  const k = 'shiti-client-instance';
  let v = sessionStorage.getItem(k);
  if (!v) { v = `c-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`; sessionStorage.setItem(k, v); }
  return v;
}

export function fmtDuration(ms: number): string {
  const s = Math.floor(ms / 1000);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const mm = String(m).padStart(2, '0');
  const ss = String(s % 60).padStart(2, '0');
  return h > 0 ? `${h}:${mm}:${ss}` : `${mm}:${ss}`;
}

export function isAnswered(d?: Draft): boolean {
  if (!d) return false;
  const a = d.answer as { selected_option_ids?: string[]; text?: string; value?: unknown } | null;
  if (!a) return false;
  if (a.selected_option_ids) return a.selected_option_ids.length > 0;
  if (typeof a.text === 'string') return a.text.length > 0;
  return a.value !== undefined && a.value !== null;
}

export function typeLabel(t: ItemDTO['type']): string {
  return { single_choice: '单选', multiple_choice: '多选', true_false: '判断', fill_blank: '填空', free_text: '主观题' }[t];
}
