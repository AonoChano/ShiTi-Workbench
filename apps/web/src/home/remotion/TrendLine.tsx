import { AbsoluteFill, useCurrentFrame } from "remotion";
import { C, FONT, dotStyle, eyebrowStyle, fadeUp, prog, type MotionSpec } from "./theme";

/** 概览页的学习趋势：SVG 自绘折线，1.6s 用 dashoffset 描出来。 */
export const TREND_SPEC: MotionSpec = {
  width: 320,
  height: 220,
  fps: 30,
  durationInFrames: 240,
  posterFrame: 150,
};

const DATA = [12, 18, 15, 22, 20, 26, 19, 24, 28, 23, 30, 27, 25, 32];
const X0 = 24;
const X1 = 296;
const Y0 = 62;
const Y1 = 168;
const MAX = 36;

const PTS = DATA.map((v, i) => [X0 + (i / (DATA.length - 1)) * (X1 - X0), Y1 - (v / MAX) * (Y1 - Y0)] as const);
const PATH = PTS.map(([x, y], i) => `${i ? "L" : "M"}${x.toFixed(1)} ${y.toFixed(1)}`).join(" ");
const AREA = `${PATH} L${X1} ${Y1} L${X0} ${Y1} Z`;
const LENGTH = PTS.reduce((sum, [x, y], i) => {
  if (!i) return 0;
  const [px, py] = PTS[i - 1];
  return sum + Math.hypot(x - px, y - py);
}, 0);
const LAST = PTS[PTS.length - 1];

export const TrendLine = () => {
  const frame = useCurrentFrame();
  const draw = prog(frame, 8, 48); // 1.6s
  const areaO = prog(frame, 44, 20);
  const tip = fadeUp(frame, 86, 12, 6);
  const out = 1 - prog(frame, 224, 16);

  return (
    <AbsoluteFill style={{ background: C.card, fontFamily: FONT.sans, opacity: out }}>
      <div style={{ position: "absolute", left: 22, top: 16, ...fadeUp(frame, 0, 12) }}>
        <div style={eyebrowStyle}>Trend</div>
        <div style={{ fontSize: 15, fontWeight: 600, color: C.heading, marginTop: 3 }}>学习趋势</div>
      </div>

      <svg width={320} height={220} viewBox="0 0 320 220" style={{ position: "absolute", inset: 0 }} aria-hidden>
        {[0.25, 0.5, 0.75, 1].map((t) => {
          const y = Y1 - t * (Y1 - Y0);
          return <line key={t} x1={X0} x2={X1} y1={y} y2={y} stroke={C.divider} />;
        })}
        <line x1={X0} x2={X1} y1={Y1} y2={Y1} stroke={C.border} />
        <path d={AREA} fill={C.activeBg} opacity={areaO} />
        <path
          d={PATH}
          fill="none"
          stroke={C.chart}
          strokeWidth={2}
          strokeLinejoin="round"
          strokeLinecap="round"
          strokeDasharray={LENGTH}
          strokeDashoffset={LENGTH * (1 - draw)}
        />
        {PTS.map(([x, y], i) => {
          const last = i === PTS.length - 1;
          return (
            <circle
              key={i}
              cx={x}
              cy={y}
              r={last ? 4 : 2.5}
              fill={last ? C.action : C.card}
              stroke={last ? "#fff" : C.chart}
              strokeWidth={1.5}
              opacity={prog(frame, 54 + i * 2, 6)}
            />
          );
        })}
        {[0, 6, 13].map((i) => (
          <text
            key={i}
            x={PTS[i][0]}
            y={Y1 + 14}
            fontSize={9}
            fill={C.footnote}
            textAnchor="middle"
            fontFamily={FONT.sans}
            style={{ fontVariantNumeric: "tabular-nums" }}
          >
            {i === 13 ? "今天" : `${14 - i} 天前`}
          </text>
        ))}
      </svg>

      <div
        style={{
          position: "absolute",
          left: LAST[0] - 108,
          top: LAST[1] - 40,
          background: C.card,
          border: `1px solid ${C.border}`,
          borderRadius: 6,
          padding: "4px 8px",
          fontSize: 10,
          color: C.heading,
          boxShadow: "0 8px 24px #23391726",
          whiteSpace: "nowrap",
          ...tip,
        }}
      >
        周三
        <span style={dotStyle} />
        32 题
        <span style={dotStyle} />
        正确率 81%
      </div>

      <div
        style={{
          position: "absolute",
          left: 22,
          right: 22,
          bottom: 12,
          fontSize: 10,
          color: C.muted,
          display: "flex",
          justifyContent: "space-between",
          ...fadeUp(frame, 60, 12),
        }}
      >
        <span>
          近 14 天
          <span style={dotStyle} />
          312 题
          <span style={dotStyle} />
          正确率 74%
        </span>
        <span style={{ color: C.footnote }}>7 天 / 30 天</span>
      </div>
    </AbsoluteFill>
  );
};
