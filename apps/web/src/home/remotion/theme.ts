import type { CSSProperties } from "react";
import { Easing, interpolate } from "remotion";

/** 与 index.css 的 @theme 令牌一一对应（Remotion 组合里只能用内联样式，所以镜像一份） */
export const C = {
  paper: "#f7f8f4",
  material: "#fafbf6",
  card: "#ffffff",
  action: "#526f43",
  actionDeep: "#4d673d",
  brand: "#4b6c45",
  heading: "#465b39",
  title: "#333e2e",
  ink: "#303a2e",
  body: "#5a6850",
  option: "#657b51",
  list: "#72895c",
  answered: "#a9c491",
  progress: "#b3c998",
  chart: "#819c65",
  selectedBg: "#dce8cc",
  selectedText: "#3c5033",
  activeBg: "#edf2e7",
  border: "#e7ebdf",
  lineSoft: "#e9eedf",
  divider: "#f0f3e9",
  watermark: "#e1e9d6",
  muted: "#a4b392",
  footnote: "#adb99d",
  focus: "#87a96b",
  clay: "#bc9b87",
  clayDeep: "#a4694c",
  wheat: "#c1aa8e",
  outline: "#cfdac1",
  shadowNode: "0 0 0 2px #ffffff, 0 3px 10px #42573055",
  shadowPop: "0 12px 36px #23391733",
  shadowFloat: "0 24px 90px #23391726",
} as const;

export const FONT = {
  sans: 'Inter, "Noto Sans SC", "PingFang SC", "Microsoft YaHei", system-ui, sans-serif',
  serif: 'Georgia, "Times New Roman", "Songti SC", "Noto Serif SC", serif',
} as const;

export type MotionSpec = {
  width: number;
  height: number;
  fps: number;
  durationInFrames: number;
  /** reduced-motion 下停在的代表帧 */
  posterFrame: number;
};

/** 全站没有弹性与回弹：统一用 ease-out cubic */
export const ease = Easing.out(Easing.cubic);

const clamp = { extrapolateLeft: "clamp", extrapolateRight: "clamp" } as const;

/** start 帧开始、dur 帧内从 0 走到 1 */
export const prog = (frame: number, start: number, dur: number, easing = ease) =>
  interpolate(frame, [start, start + dur], [0, 1], { ...clamp, easing });

/** 入场母题：opacity + 若干像素的 translateY */
export const fadeUp = (frame: number, start: number, dur = 12, dy = 8): CSSProperties => {
  const p = prog(frame, start, dur);
  return { opacity: p, transform: `translateY(${((1 - p) * dy).toFixed(2)}px)` };
};

export const pad2 = (n: number) => String(n).padStart(2, "0");

export const eyebrowStyle: CSSProperties = {
  fontFamily: FONT.sans,
  fontSize: 8,
  letterSpacing: 1.8,
  textTransform: "uppercase",
  fontWeight: 600,
  color: C.muted,
};

/** 2px 圆点分隔 */
export const dotStyle: CSSProperties = {
  display: "inline-block",
  width: 2,
  height: 2,
  borderRadius: 1,
  background: C.muted,
  margin: "0 7px",
  verticalAlign: "middle",
};
