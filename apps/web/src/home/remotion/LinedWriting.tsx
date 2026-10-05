import { AbsoluteFill, interpolate, useCurrentFrame } from "remotion";
import { C, FONT, dotStyle, eyebrowStyle, fadeUp, prog, type MotionSpec } from "./theme";

/** 横线作答区：textarea 没有边框，横线是画出来的；聚焦时横线变绿。 */
export const WRITING_SPEC: MotionSpec = {
  width: 320,
  height: 220,
  fps: 30,
  durationInFrames: 240,
  posterFrame: 170,
};

const TEXT =
  "Dear Sir or Madam, I am writing to express my sincere gratitude for the help you offered during my stay in your city. Without your guidance, I could hardly have found my way.";
const WORDS = TEXT.split(" ");
const LH = 28;

export const LinedWriting = () => {
  const frame = useCurrentFrame();
  const focus = prog(frame, 18, 10);
  const n = Math.floor(interpolate(frame, [30, 176], [0, WORDS.length], { extrapolateLeft: "clamp", extrapolateRight: "clamp" }));
  const typed = WORDS.slice(0, n).join(" ");
  const caretOn = Math.floor(frame / 14) % 2 === 0;
  const out = 1 - prog(frame, 224, 16);

  const lines = (color: string) =>
    `repeating-linear-gradient(to bottom, transparent 0, transparent ${LH - 1}px, ${color} ${LH - 1}px, ${color} ${LH}px)`;

  return (
    <AbsoluteFill style={{ background: C.card, padding: "14px 20px 12px", fontFamily: FONT.sans, opacity: out }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", ...fadeUp(frame, 0, 12) }}>
        <div>
          <div style={eyebrowStyle}>Writing · Part A</div>
          <div style={{ fontSize: 13, fontWeight: 600, color: C.heading, marginTop: 3 }}>横线稿纸</div>
        </div>
        <div style={{ fontSize: 10.5, color: n ? C.heading : C.muted, fontVariantNumeric: "tabular-nums" }}>
          {n} 词
          <span style={dotStyle} />
          {n ? "已自动保存" : "未开始"}
        </div>
      </div>

      <div
        style={{
          position: "relative",
          marginTop: 10,
          height: 5 * LH,
          borderRadius: 6,
          overflow: "hidden",
          boxShadow: `0 0 0 2px rgba(220,232,204,${focus.toFixed(3)})`,
        }}
      >
        <div style={{ position: "absolute", inset: 0, backgroundImage: lines(C.lineSoft) }} />
        <div style={{ position: "absolute", inset: 0, backgroundImage: lines(C.progress), opacity: focus }} />
        <div
          style={{
            position: "relative",
            fontFamily: FONT.serif,
            fontSize: 13.5,
            lineHeight: `${LH}px`,
            color: C.heading,
            padding: "0 3px",
          }}
        >
          {n === 0 ? <span style={{ color: C.footnote }}>Write your letter here.</span> : typed}
          <span
            style={{
              display: "inline-block",
              width: 1.5,
              height: 15,
              background: C.action,
              verticalAlign: -3,
              marginLeft: 2,
              opacity: focus > 0 && caretOn ? 1 : 0,
            }}
          />
        </div>
      </div>
    </AbsoluteFill>
  );
};
