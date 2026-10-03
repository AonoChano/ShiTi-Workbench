import { randomBytes } from 'node:crypto';

/** UUIDv7：48bit 毫秒时间戳 + 随机位（docs/02 §1）。同毫秒内单调靠随机不保证，M1 单进程写入无需严格单调。 */
export function uuidv7(now = Date.now()): string {
  const ts = Buffer.alloc(6);
  ts.writeUIntBE(now, 0, 6);
  const rand = randomBytes(10);
  const b = Buffer.concat([ts, rand]);
  b[6] = ((b[6] ?? 0) & 0x0f) | 0x70; // version 7
  b[8] = ((b[8] ?? 0) & 0x3f) | 0x80; // variant 10
  const h = b.toString('hex');
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
}
