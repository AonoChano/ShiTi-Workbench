import type { CSSProperties, ReactNode } from "react";
import { AbsoluteFill, interpolate, interpolateColors, useCurrentFrame } from "remotion";
import { C, FONT, dotStyle, eyebrowStyle, fadeUp, pad2, prog, type MotionSpec } from "./theme";

/**
 * 首屏演示：一张缩小的「答题页」。
 * 材料逐行落下 → 荧光笔扫过关键句 → 选中 B → 题号珠子前进 → 自动保存 → 交卷 → 复盘报告描环。
 * 14 秒循环，首尾各有淡入淡出，循环没有跳帧感。
 */
export const HERO_SPEC: MotionSpec = {
  width: 800,
  height: 540,
  fps: 30,
  durationInFrames: 420,
  posterFrame: 215,
};

// 2013 年英语（一）阅读 Text 1 开头（公开真题），按 ≤42 字符手动断行，避免不同衬线字体下的换行差异
const LINES = [
  "In the 2006 film version of The Devil",
  "Wears Prada, Miranda Priestly, played by",
  "Meryl Streep, scolds her unattractive",
  "assistant for imagining that high fashion",
  "doesn\u2019t affect her. Priestly explains how",
  "the deep blue color of the assistant\u2019s",
  "sweater descended over the years from",
  "fashion shows to department stores and",
  "to the bargain bin in which the poor girl",
  "doubtless found her garment.",
];
const HL_LINE = 4;
const HL_TEXT = "doesn\u2019t affect her.";

const OPTIONS: ReadonlyArray<readonly [string, string]> = [
  ["A", "poor bargaining skill"],
  ["B", "insensitivity to fashion"],
  ["C", "obsession with high fashion"],
  ["D", "lack of imagination"],
];

const ROWS: ReadonlyArray<{ n: string; ans: string; ok: boolean; time: string; fix?: string }> = [
  { n: "21", ans: "B", ok: true, time: "42s" },
  { n: "22", ans: "D", ok: false, time: "1:05", fix: "A" },
  { n: "23", ans: "C", ok: true, time: "38s" },
];

const T = {
  chrome: 0,
  lines: 12,
  beads: 30,
  card: 40,
  highlight: 100,
  cursorIn: 118,
  cursorMove: 124,
  hover: 140,
  select: 152,
  advance: 160,
  cursorOut: 172,
  toastIn: 166,
  toastOut: 222,
  press: 250,
  overlay: 262,
  report: 268,
  ring: 286,
  stats: 300,
  rows: 330,
  fadeOut: 402,
} as const;

const Dot = () => <span style={dotStyle} />;

const MiniBtn = ({
  children,
  kind,
  pressed,
}: {
  children: ReactNode;
  kind: "primary" | "quiet" | "outline";
  pressed?: boolean;
}) => {
  const base: CSSProperties = {
    height: 24,
    padding: "0 10px",
    borderRadius: 6,
    fontSize: 11,
    fontWeight: 500,
    display: "inline-flex",
    alignItems: "center",
    fontFamily: FONT.sans,
    border: "1px solid transparent",
    whiteSpace: "nowrap",
  };
  const look: CSSProperties =
    kind === "primary"
      ? { background: pressed ? C.actionDeep : C.action, color: "#fff" }
      : kind === "quiet"
        ? { background: C.activeBg, color: C.heading }
        : { borderColor: C.outline, color: C.heading, background: "transparent" };
  return <span style={{ ...base, ...look }}>{children}</span>;
};

const Check = ({ color = "#fff", size = 9 }: { color?: string; size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 12 12" fill="none" aria-hidden>
    <path d="M2.5 6.5l2.3 2.3L9.6 4" stroke={color} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

const Cross = ({ color = C.clayDeep, size = 9 }: { color?: string; size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 12 12" fill="none" aria-hidden>
    <path d="M3 3l6 6M9 3l-6 6" stroke={color} strokeWidth="1.8" strokeLinecap="round" />
  </svg>
);

/* ---------------- 材料栏 ---------------- */
const Material = ({ frame, hl }: { frame: number; hl: number }) => (
  <div
    style={{
      flex: 1,
      minWidth: 0,
      background: C.material,
      border: `1px solid ${C.border}`,
      borderRadius: 9,
      padding: "18px 20px",
      overflow: "hidden",
    }}
  >
    <div style={eyebrowStyle}>Reading material · Text 1</div>
    <div style={{ fontFamily: FONT.serif, fontSize: 17, color: C.heading, marginTop: 6, marginBottom: 10 }}>Text 1</div>
    {LINES.map((line, i) => {
      const style: CSSProperties = {
        fontFamily: FONT.serif,
        fontSize: 14,
        lineHeight: "26px",
        color: C.body,
        whiteSpace: "nowrap",
        overflow: "hidden",
        ...fadeUp(frame, T.lines + i * 6, 12, 6),
      };
      if (i !== HL_LINE) {
        return (
          <div key={i} style={style}>
            {line}
          </div>
        );
      }
      const rest = line.slice(HL_TEXT.length);
      const w = `${(hl * 100).toFixed(1)}%`;
      return (
        <div key={i} style={style}>
          <span
            style={{
              backgroundImage: `linear-gradient(${C.progress}, ${C.progress}), linear-gradient(to bottom, transparent 54%, ${C.selectedBg} 54%)`,
              backgroundSize: `${w} 2px, ${w} 100%`,
              backgroundPosition: "left bottom, left top",
              backgroundRepeat: "no-repeat",
              padding: "0 1px",
            }}
          >
            {HL_TEXT}
          </span>
          {rest}
        </div>
      );
    })}
    <div style={{ marginTop: 14, fontSize: 9, color: C.footnote, fontFamily: FONT.sans }}>
      Paragraph 1 / 6<Dot />
      ↓ 继续阅读
    </div>
  </div>
);

/* ---------------- 答题卡珠子 ---------------- */
const Bead = ({ n, state, flagged }: { n: number; state: "idle" | "answered" | "current"; flagged?: boolean }) => {
  const look: CSSProperties =
    state === "current"
      ? { background: C.action, color: "#fff", boxShadow: C.shadowNode }
      : state === "answered"
        ? { background: C.answered, color: "#fff" }
        : { background: "#f1f3ec", color: C.muted, border: `1px solid ${C.border}` };
  return (
    <span
      style={{
        position: "relative",
        width: 24,
        height: 24,
        borderRadius: 12,
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        fontSize: 10.5,
        fontVariantNumeric: "tabular-nums",
        fontFamily: FONT.sans,
        ...look,
      }}
    >
      {n}
      {flagged ? (
        <span
          style={{
            position: "absolute",
            top: -2,
            right: -2,
            width: 7,
            height: 7,
            borderRadius: 2,
            background: C.wheat,
            border: "1px solid #fff",
          }}
        />
      ) : null}
    </span>
  );
};

const Beads = ({ frame, advanced }: { frame: number; advanced: boolean }) => {
  const answered = advanced ? 1 : 0;
  const current = advanced ? 22 : 21;
  return (
    <div
      style={{
        background: C.card,
        border: `1px solid ${C.border}`,
        borderRadius: 9,
        padding: "12px 14px",
        ...fadeUp(frame, T.beads, 12),
      }}
    >
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 10 }}>
        <span style={eyebrowStyle}>Answer sheet · 21–30</span>
        <span style={{ fontSize: 10, color: C.muted, fontVariantNumeric: "tabular-nums", fontFamily: FONT.sans }}>
          已答 {answered}/10
        </span>
      </div>
      <div style={{ display: "flex", gap: 6 }}>
        {Array.from({ length: 10 }, (_, i) => 21 + i).map((n) => (
          <Bead key={n} n={n} state={n < 21 + answered ? "answered" : n === current ? "current" : "idle"} flagged={n === 25} />
        ))}
      </div>
    </div>
  );
};

/* ---------------- 题目卡 ---------------- */
const Question = ({ frame, hoverP, selP }: { frame: number; hoverP: number; selP: number }) => (
  <div
    style={{
      flex: 1,
      background: C.card,
      border: `1px solid ${C.border}`,
      borderRadius: 9,
      padding: "16px 16px 12px",
      ...fadeUp(frame, T.card, 14),
    }}
  >
    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
      <span style={eyebrowStyle}>Question 21</span>
      <span style={{ fontSize: 9.5, color: C.footnote, fontFamily: FONT.sans }}>单选</span>
    </div>
    <div style={{ fontFamily: FONT.serif, fontSize: 14.5, lineHeight: 1.5, color: C.heading, margin: "8px 0 10px" }}>
      Priestly criticizes her assistant for her ____.
    </div>
    {OPTIONS.map(([key, text], i) => {
      const isB = key === "B";
      const hoverBg = interpolateColors(hoverP, [0, 1], ["#ffffff", C.activeBg]);
      const bg = isB ? interpolateColors(selP, [0, 1], [hoverBg, C.selectedBg]) : "transparent";
      const selected = isB && selP > 0.5;
      return (
        <div
          key={key}
          style={{
            display: "flex",
            alignItems: "center",
            gap: 10,
            padding: "6px 9px",
            margin: "0 -9px",
            borderRadius: 6,
            background: bg,
            borderLeft: `2px solid ${isB && selP > 0 ? C.action : "transparent"}`,
            ...fadeUp(frame, T.card + 12 + i * 6, 10, 6),
          }}
        >
          <span
            style={{
              width: 20,
              height: 20,
              borderRadius: 10,
              border: `1px solid ${selected ? C.action : C.outline}`,
              background: selected ? C.action : "transparent",
              color: selected ? "#fff" : C.option,
              fontSize: 10,
              fontWeight: 600,
              display: "inline-flex",
              alignItems: "center",
              justifyContent: "center",
              fontFamily: FONT.sans,
              flex: "none",
            }}
          >
            {key}
          </span>
          <span style={{ fontSize: 12.5, color: selected ? C.selectedText : C.option, fontFamily: FONT.sans }}>{text}</span>
        </div>
      );
    })}
    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 8 }}>
      <span style={{ fontSize: 9.5, color: C.footnote, fontFamily: FONT.sans }}>
        ← 上一题<Dot />标记
      </span>
      <MiniBtn kind="outline">下一题 →</MiniBtn>
    </div>
  </div>
);

/* ---------------- 光标 ---------------- */
const Cursor = ({ frame }: { frame: number }) => {
  const inP = prog(frame, T.cursorIn, 8);
  const outP = prog(frame, T.cursorOut, 10);
  const move = prog(frame, T.cursorMove, 18);
  const x = interpolate(move, [0, 1], [690, 560]);
  const y = interpolate(move, [0, 1], [470, 272]);
  const click = frame >= T.select && frame < T.select + 4 ? 1 : 0;
  return (
    <svg
      width={16}
      height={20}
      viewBox="0 0 16 20"
      style={{
        position: "absolute",
        left: x,
        top: y + click,
        opacity: inP * (1 - outP),
        filter: "drop-shadow(0 1px 1px #23391733)",
      }}
      aria-hidden
    >
      <path d="M1.5 1.5l12 9.2-5.4.9 3 6.4-2.4 1.1-3-6.4-4.2 3.6z" fill="#fff" stroke={C.heading} strokeWidth="1.1" strokeLinejoin="round" />
    </svg>
  );
};

/* ---------------- 自动保存 Toast ---------------- */
const Toast = ({ opacity }: { opacity: number }) => (
  <div
    style={{
      position: "absolute",
      right: 24,
      bottom: 22,
      background: C.card,
      border: `1px solid ${C.border}`,
      borderRadius: 8,
      padding: "8px 12px",
      fontSize: 11,
      color: C.heading,
      fontFamily: FONT.sans,
      boxShadow: C.shadowPop,
      display: "flex",
      alignItems: "center",
      gap: 8,
      opacity,
      transform: `translateY(${((1 - opacity) * 6).toFixed(2)}px)`,
    }}
  >
    <span
      style={{
        width: 14,
        height: 14,
        borderRadius: 7,
        background: C.answered,
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      <Check />
    </span>
    已自动保存
    <Dot />
    刚刚
  </div>
);

/* ---------------- 复盘报告 ---------------- */
const Report = ({ frame, overlayP, ringP }: { frame: number; overlayP: number; ringP: number }) => {
  if (overlayP <= 0) return null;
  const r = 40;
  const circ = 2 * Math.PI * r;
  const ratio = 0.78;
  const pct = Math.round(ratio * 100 * ringP);
  return (
    <AbsoluteFill
      style={{
        background: `rgba(34,48,28,${(0.36 * overlayP).toFixed(3)})`,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        fontFamily: FONT.sans,
      }}
    >
      <div
        style={{
          width: 470,
          background: C.card,
          border: `1px solid ${C.border}`,
          borderRadius: 12,
          boxShadow: C.shadowFloat,
          padding: "20px 22px 18px",
          ...fadeUp(frame, T.report, 18, 16),
        }}
      >
        <div style={eyebrowStyle}>Review report · 2013 · 英语（一）</div>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginTop: 6 }}>
          <div style={{ fontSize: 15, fontWeight: 600, color: C.heading }}>复盘报告已生成</div>
          <div style={{ fontSize: 10, color: C.muted }}>
            2013-en1-review.md<Dot />12 KB
          </div>
        </div>

        <div style={{ display: "flex", gap: 18, marginTop: 14, alignItems: "center" }}>
          <svg width={96} height={96} viewBox="0 0 96 96" aria-hidden>
            <circle cx={48} cy={48} r={r} stroke={C.lineSoft} strokeWidth={8} fill="none" />
            <circle
              cx={48}
              cy={48}
              r={r}
              stroke={C.chart}
              strokeWidth={8}
              fill="none"
              strokeLinecap="round"
              strokeDasharray={circ}
              strokeDashoffset={circ * (1 - ratio * ringP)}
              transform="rotate(-90 48 48)"
            />
            <text
              x={48}
              y={47}
              textAnchor="middle"
              fontFamily={FONT.serif}
              fontSize={22}
              fill={C.heading}
              style={{ fontVariantNumeric: "tabular-nums" }}
            >
              {pct}%
            </text>
            <text x={48} y={63} textAnchor="middle" fontFamily={FONT.sans} fontSize={8.5} fill={C.muted}>
              正确率
            </text>
          </svg>

          <div style={{ flex: 1, display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 8 }}>
            {(
              [
                ["用时", "48:12", C.heading],
                ["答对", "35", C.heading],
                ["答错", "10", C.clayDeep],
              ] as const
            ).map(([label, value, color], i) => (
              <div
                key={label}
                style={{
                  background: C.material,
                  border: `1px solid ${C.border}`,
                  borderRadius: 8,
                  padding: "8px 10px",
                  ...fadeUp(frame, T.stats + i * 8, 12),
                }}
              >
                <div style={{ fontSize: 9, color: C.muted, letterSpacing: 1 }}>{label}</div>
                <div style={{ fontFamily: FONT.serif, fontSize: 20, color, fontVariantNumeric: "tabular-nums", marginTop: 2 }}>
                  {value}
                </div>
              </div>
            ))}
          </div>
        </div>

        <div style={{ marginTop: 12, borderTop: `1px solid ${C.divider}` }}>
          {ROWS.map((row, i) => (
            <div
              key={row.n}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 10,
                height: 30,
                borderBottom: `1px solid ${C.divider}`,
                fontSize: 11,
                color: C.body,
                ...fadeUp(frame, T.rows + i * 7, 10, 6),
              }}
            >
              <span style={{ width: 22, color: C.muted, fontVariantNumeric: "tabular-nums" }}>{row.n}</span>
              <span style={{ width: 48, fontFamily: FONT.serif, color: C.heading }}>你选 {row.ans}</span>
              <span style={{ display: "inline-flex", alignItems: "center", gap: 6, color: row.ok ? C.list : C.clayDeep }}>
                {row.ok ? <Check color={C.chart} size={10} /> : <Cross size={10} />}
                {row.ok ? "正确" : `错误，应为 ${row.fix}`}
              </span>
              <span style={{ marginLeft: "auto", color: C.footnote, fontVariantNumeric: "tabular-nums" }}>{row.time}</span>
            </div>
          ))}
        </div>

        <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", marginTop: 12, ...fadeUp(frame, T.rows + 28, 12, 6) }}>
          <MiniBtn kind="outline">导出 Markdown</MiniBtn>
          <MiniBtn kind="primary">打包交给 AI 复盘</MiniBtn>
        </div>
      </div>
    </AbsoluteFill>
  );
};

/* ---------------- 根组件 ---------------- */
export const HeroPaper = () => {
  const frame = useCurrentFrame();
  const seconds = 12 * 60 + 48 + Math.floor(frame / HERO_SPEC.fps);
  const timer = `00:${pad2(Math.floor(seconds / 60))}:${pad2(seconds % 60)}`;

  const hl = prog(frame, T.highlight, 22);
  const hoverP = prog(frame, T.hover, 8);
  const selP = prog(frame, T.select, 6);
  const advanced = frame >= T.advance;
  const toastO = Math.min(prog(frame, T.toastIn, 12), 1 - prog(frame, T.toastOut, 12));
  const overlayP = prog(frame, T.overlay, 16);
  const ringP = prog(frame, T.ring, 40);
  const out = 1 - prog(frame, T.fadeOut, 18);

  return (
    <AbsoluteFill style={{ background: C.paper, fontFamily: FONT.sans, color: C.ink, opacity: out }}>
      <div style={{ position: "absolute", inset: 14, display: "flex", flexDirection: "column", gap: 10, ...fadeUp(frame, T.chrome, 14) }}>
        <div style={{ height: 34, display: "flex", alignItems: "center", justifyContent: "space-between", padding: "0 4px" }}>
          <div style={{ fontSize: 11, color: C.muted }}>
            题库
            <Dot />
            2013 年
            <Dot />
            英语（一）
            <Dot />
            <span style={{ color: C.heading }}>阅读 · Text 1</span>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <span style={{ fontSize: 12.5, color: C.heading, fontVariantNumeric: "tabular-nums", marginRight: 4 }}>{timer}</span>
            <MiniBtn kind="quiet">暂停</MiniBtn>
            <MiniBtn kind="primary" pressed={frame >= T.press && frame < T.press + 14}>
              交卷
            </MiniBtn>
          </div>
        </div>

        <div style={{ flex: 1, display: "flex", gap: 10, minHeight: 0 }}>
          <Material frame={frame} hl={hl} />
          <div style={{ width: 332, display: "flex", flexDirection: "column", gap: 10 }}>
            <Beads frame={frame} advanced={advanced} />
            <Question frame={frame} hoverP={hoverP} selP={selP} />
          </div>
        </div>
      </div>

      <Cursor frame={frame} />
      <Toast opacity={toastO} />
      <Report frame={frame} overlayP={overlayP} ringP={ringP} />
    </AbsoluteFill>
  );
};
