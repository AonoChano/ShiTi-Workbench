import { AbsoluteFill, useCurrentFrame } from "remotion";
import { C, FONT, dotStyle, eyebrowStyle, fadeUp, prog, type MotionSpec } from "./theme";

/** 概览页的今日目标：环 1.3s 描完，然后轻轻打一次卡。 */
export const GOAL_SPEC: MotionSpec = {
  width: 320,
  height: 220,
  fps: 30,
  durationInFrames: 240,
  posterFrame: 150,
};

const DONE = 18;
const GOAL = 25;

export const GoalRing = () => {
  const frame = useCurrentFrame();
  const p = prog(frame, 10, 40); // 约 1.3s
  const shown = Math.round(DONE * p);
  const r = 46;
  const circ = 2 * Math.PI * r;
  const offset = circ * (1 - (DONE / GOAL) * p);
  const pressed = frame >= 120 && frame < 132;
  const checked = frame >= 132;
  const streak = checked ? 13 : 12;
  const out = 1 - prog(frame, 224, 16);

  return (
    <AbsoluteFill
      style={{
        background: C.card,
        fontFamily: FONT.sans,
        opacity: out,
        padding: "0 22px",
        flexDirection: "row",
        alignItems: "center",
        gap: 22,
      }}
    >
      <svg width={116} height={116} viewBox="0 0 116 116" style={{ flex: "none", ...fadeUp(frame, 0, 12) }} aria-hidden>
        <circle cx={58} cy={58} r={r} stroke={C.lineSoft} strokeWidth={9} fill="none" />
        <circle
          cx={58}
          cy={58}
          r={r}
          stroke={C.chart}
          strokeWidth={9}
          fill="none"
          strokeLinecap="round"
          strokeDasharray={circ}
          strokeDashoffset={offset}
          transform="rotate(-90 58 58)"
        />
        <text
          x={58}
          y={56}
          textAnchor="middle"
          fontFamily={FONT.serif}
          fontSize={27}
          fill={C.heading}
          style={{ fontVariantNumeric: "tabular-nums" }}
        >
          {shown}
        </text>
        <text x={58} y={74} textAnchor="middle" fontFamily={FONT.sans} fontSize={10} fill={C.muted}>
          / {GOAL} 题
        </text>
      </svg>

      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ ...eyebrowStyle, ...fadeUp(frame, 6, 12) }}>Today</div>
        <div style={{ fontSize: 17, fontWeight: 600, color: C.heading, marginTop: 4, ...fadeUp(frame, 10, 12) }}>今日目标</div>
        <div
          style={{
            fontSize: 11,
            color: C.muted,
            marginTop: 4,
            fontVariantNumeric: "tabular-nums",
            ...fadeUp(frame, 16, 12),
          }}
        >
          还差 {GOAL - shown} 题
          <span style={dotStyle} />
          连续 {streak} 天
        </div>
        <div style={{ marginTop: 14, ...fadeUp(frame, 24, 12) }}>
          {checked ? (
            <span
              style={{
                height: 28,
                padding: "0 12px",
                borderRadius: 7,
                background: C.activeBg,
                color: C.heading,
                fontSize: 11.5,
                fontWeight: 500,
                display: "inline-flex",
                alignItems: "center",
                gap: 6,
              }}
            >
              <svg width={11} height={11} viewBox="0 0 12 12" fill="none" aria-hidden>
                <path d="M2.5 6.5l2.3 2.3L9.6 4" stroke={C.action} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
              今天已打卡
            </span>
          ) : (
            <span
              style={{
                height: 28,
                padding: "0 12px",
                borderRadius: 7,
                background: pressed ? C.actionDeep : C.action,
                color: "#fff",
                fontSize: 11.5,
                fontWeight: 500,
                display: "inline-flex",
                alignItems: "center",
                transform: pressed ? "translateY(1px)" : "none",
              }}
            >
              每日打卡
            </span>
          )}
        </div>
      </div>
    </AbsoluteFill>
  );
};
