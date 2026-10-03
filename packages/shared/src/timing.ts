import type { TimingSegment, TimingSummary } from './protocol.js';

/**
 * 计时汇总（docs/02 §7.1）。
 * - 墙钟跨度 = submitted - started。
 * - active = item + material + unattributed 段之和；pause/unknown 单列。
 * - 段之间的未覆盖空隙计入 unknown（>0 则 quality=partial）。
 * - 段不得重叠双计：重叠区间只计一次（按起点排序，后段截断到前段终点之后）。
 * 前台有效时间不等于真实思考时间——展示文案由报告层负责。
 */
export function computeTimingSummary(
  segments: TimingSegment[],
  startedAt: number,
  submittedAt: number,
): TimingSummary {
  const wall = Math.max(0, submittedAt - startedAt);
  const itemMs: Record<string, number> = {};
  let materialMs = 0, unattributedMs = 0, pausedMs = 0, unknownMs = 0;

  const sorted = [...segments].sort((a, b) => a.start_at - b.start_at);
  const timeline: Array<{ seg: TimingSegment; s: number; e: number }> = [];
  let lastEnd = startedAt;
  for (const seg of sorted) {
    const s = Math.max(seg.start_at, startedAt, lastEnd);
    const e = Math.min(seg.end_at, submittedAt);
    if (e <= s) continue;
    timeline.push({ seg, s, e });
    lastEnd = e;
  }

  let t = startedAt;
  for (const m of timeline) {
    if (m.s > t) unknownMs += m.s - t; // 未覆盖空隙（心跳丢失、休眠等）
    const dur = m.e - m.s;
    switch (m.seg.kind) {
      case 'item':
        if (m.seg.item_id) itemMs[m.seg.item_id] = (itemMs[m.seg.item_id] ?? 0) + dur;
        break;
      case 'material': materialMs += dur; break;
      case 'unattributed': unattributedMs += dur; break;
      case 'pause': pausedMs += dur; break;
      case 'unknown': unknownMs += dur; break;
    }
    t = m.e;
  }
  if (t < submittedAt) unknownMs += submittedAt - t;

  const activeMs = Object.values(itemMs).reduce((a, b) => a + b, 0) + materialMs + unattributedMs;
  const quality: TimingSummary['quality'] = unknownMs === 0 ? 'complete' : 'partial';
  return {
    wall_ms: wall,
    paused_ms: pausedMs,
    active_ms: activeMs,
    hidden_ms: 0,
    unknown_ms: unknownMs,
    material_ms: materialMs,
    unattributed_ms: unattributedMs,
    item_ms: itemMs,
    quality,
  };
}

/** 毫秒 → "mm:ss"（超过 1h 用 h:mm:ss）。仅展示。 */
export function fmtDuration(ms: number): string {
  const s = Math.floor(ms / 1000);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  const mm = String(m).padStart(2, '0');
  const ss = String(sec).padStart(2, '0');
  return h > 0 ? `${h}:${mm}:${ss}` : `${mm}:${ss}`;
}
