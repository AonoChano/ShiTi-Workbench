import { describe, expect, it } from 'vitest';
import { computeTimingSummary, fmtDuration } from '../src/timing.js';
import type { TimingSegment } from '../src/protocol.js';

/** docs/02 §9 黄金计时：墙钟 1122s、暂停 162s、有效 960s；题目 150+180+210+160+80=780s、共享阅读 180s。 */
describe('黄金计时样本', () => {
  const started = 0;
  const submitted = 1122_000;
  const seg = (kind: TimingSegment['kind'], item_id: string | null, s: number, e: number): TimingSegment => ({ kind, item_id, start_at: s * 1000, end_at: e * 1000 });

  const segments: TimingSegment[] = [
    seg('item', 'i1', 0, 150),
    seg('item', 'i2', 150, 330),
    seg('item', 'i3', 330, 540),
    seg('item', 'i4', 540, 700),
    seg('pause', null, 700, 862),          // 162s 暂停（600–? 让墙钟成立：780 active 前 + 暂停 162 = 942，再 item5 80 + material 180 → 超）
    seg('item', 'i5', 862, 942),
    seg('material', null, 942, 1122),
  ];
  // 核对：items 150+180+210+160+80=780s；material 180s；active=960s；pause 162s；墙钟 1122s ✓
  const t = computeTimingSummary(segments, started, submitted);

  it('墙钟/暂停/有效/未知与黄金样本一致', () => {
    expect(t.wall_ms).toBe(1_122_000);
    expect(t.paused_ms).toBe(162_000);
    expect(t.active_ms).toBe(960_000);
    expect(t.unknown_ms).toBe(0);
    expect(t.material_ms).toBe(180_000);
    expect(t.quality).toBe('complete');
  });

  it('题目时间 150+180+210+160+80=780s，且有效=题目+材料+未归属', () => {
    expect(t.item_ms).toEqual({
      i1: 150_000, i2: 180_000, i3: 210_000, i4: 160_000, i5: 80_000,
    });
    const itemSum = Object.values(t.item_ms).reduce((a, b) => a + b, 0);
    expect(itemSum).toBe(780_000);
    expect(t.active_ms).toBe(itemSum + t.material_ms + t.unattributed_ms);
  });

  it('恒等式：墙钟 = 有效 + 暂停 + 隐藏 + 未知', () => {
    expect(t.wall_ms).toBe(t.active_ms + t.paused_ms + t.hidden_ms + t.unknown_ms);
  });
});

describe('计时边界', () => {
  it('心跳丢失造成的空隙计入 unknown，quality=partial，不编成答题速度', () => {
    const t = computeTimingSummary(
      [
        { kind: 'item', item_id: 'a', start_at: 0, end_at: 60_000 },
        { kind: 'item', item_id: 'b', start_at: 120_000, end_at: 180_000 }, // 中间 60s 空隙
      ],
      0,
      180_000,
    );
    expect(t.unknown_ms).toBe(60_000);
    expect(t.active_ms).toBe(120_000);
    expect(t.quality).toBe('partial');
  });

  it('重叠段不双计', () => {
    const t = computeTimingSummary(
      [
        { kind: 'item', item_id: 'a', start_at: 0, end_at: 100_000 },
        { kind: 'item', item_id: 'b', start_at: 50_000, end_at: 150_000 }, // 与前段重叠 50s
      ],
      0,
      150_000,
    );
    expect(t.active_ms).toBe(150_000);
    expect(t.item_ms['a']).toBe(100_000);
    expect(t.item_ms['b']).toBe(50_000);
  });

  it('越界段被裁剪到 [started, submitted] 区间', () => {
    const t = computeTimingSummary(
      [{ kind: 'item', item_id: 'a', start_at: -5_000, end_at: 999_999 }],
      0,
      60_000,
    );
    expect(t.active_ms).toBe(60_000);
  });
});

describe('fmtDuration', () => {
  it('mm:ss 与 h:mm:ss', () => {
    expect(fmtDuration(65_000)).toBe('01:05');
    expect(fmtDuration(3_723_000)).toBe('1:02:03');
  });
});
