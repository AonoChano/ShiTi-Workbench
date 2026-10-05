import type { ReactNode } from "react";
import { Flag } from "lucide-react";
import { cn } from "../../utils/cn";
import { BrandMark } from "./BrandMark";

export type AuthMode = "login" | "register" | "forgot";

const COPY: Record<AuthMode, { title: ReactNode; sub: string }> = {
  login: {
    title: (
      <>
        Pick up where
        <br />
        you <span className="stem-mark">left off.</span>
      </>
    ),
    sub: "接着上次的进度，继续做题。",
  },
  register: {
    title: (
      <>
        Start with
        <br />a <span className="stem-mark">clean sheet.</span>
      </>
    ),
    sub: "新建一份属于你的练习册。",
  },
  forgot: {
    title: (
      <>
        Lost your place?
        <br />
        Let’s <span className="stem-mark">find it.</span>
      </>
    ),
    sub: "几分钟内，就能回到你的题库。",
  },
};

const OPTIONS = [
  { key: "A", text: "sudden and highly visible" },
  { key: "B", text: "gradual and cumulative", picked: true },
  { key: "C", text: "a matter of natural talent" },
  { key: "D", text: "difficult to measure" },
];

/** 答题卡"珠子"：1–5 已答，6 当前，3 号带旗标 */
const BEADS = Array.from({ length: 10 }, (_, i) => i + 1);
const ANSWERED = new Set([1, 2, 3, 4, 5]);
const CURRENT = 6;
const FLAGGED = 3;

/**
 * 左侧"扉页"：一张嵌在屏幕里的试卷。
 * 全部为装饰内容（aria-hidden），不承担任何交互。
 */
export function CoverPanel({ mode }: { mode: AuthMode }) {
  const copy = COPY[mode];

  return (
    <aside className="relative hidden flex-col justify-between gap-8 border-r border-line bg-material p-10 lg:flex">
      <BrandMark className="reveal" />

      <div className="space-y-7">
        {/* 标题：Georgia 34px，负字距 */}
        <div key={mode} className="reveal-fast" style={{ "--i": 0 } as React.CSSProperties}>
          <p className="eyebrow">Section I · 完形填空</p>
          <p className="mt-3 font-serif text-[34px] font-normal leading-[1.18] tracking-[-0.8px] text-heading">
            {copy.title}
          </p>
          <p className="mt-3 text-ui text-muted">{copy.sub}</p>
        </div>

        {/* 试卷一角 */}
        <div
          aria-hidden="true"
          className="reveal rounded-card border border-line bg-card p-4"
          style={{ "--i": 2 } as React.CSSProperties}
        >
          <div className="flex items-center justify-between">
            <span className="eyebrow !text-[8px]">Reading Material</span>
            <span className="text-meta tabular-nums text-faint">Text 1</span>
          </div>

          <p className="mt-2.5 font-serif text-[13px] leading-[1.95] text-body">
            Progress in a language is rarely dramatic. It comes from <span className="stem-mark">small, repeated attempts</span>,
            each a little less hesitant than the last.
          </p>

          <div className="mt-3 border-t border-hairline pt-3">
            <p className="font-serif text-ui text-heading-deep">
              <span className="tabular-nums">1.</span> The author implies that improvement is mostly ____.
            </p>
            <ul className="mt-2 space-y-1">
              {OPTIONS.map((o) => (
                <li
                  key={o.key}
                  className={cn(
                    "flex items-center gap-2.5 rounded-input px-2 py-[3px] font-serif text-ui",
                    o.picked ? "bg-tint text-picked" : "text-option",
                  )}
                >
                  <span
                    className={cn(
                      "grid size-4 shrink-0 place-items-center rounded-full border font-sans text-[9px] font-semibold",
                      o.picked ? "border-action bg-action text-white" : "border-line-strong text-faint",
                    )}
                  >
                    {o.key}
                  </span>
                  {o.text}
                </li>
              ))}
            </ul>
          </div>
        </div>
      </div>

      {/* 答题卡：画成一圈珠子 */}
      <div aria-hidden="true" className="reveal space-y-3.5" style={{ "--i": 4 } as React.CSSProperties}>
        <div className="flex items-center gap-2">
          {BEADS.map((n) => {
            const current = n === CURRENT;
            const answered = ANSWERED.has(n);
            return (
              <span
                key={n}
                className={cn(
                  "reveal-fast relative grid size-7 place-items-center rounded-full text-meta font-semibold tabular-nums",
                  current
                    ? "bg-action text-white shadow-bead"
                    : answered
                      ? "bg-fill text-white"
                      : "bg-wash text-faint",
                )}
                style={{ "--i": n + 5 } as React.CSSProperties}
              >
                {n}
                {n === FLAGGED && (
                  <Flag className="absolute -right-[3px] -top-[4px] size-[10px] fill-wheat text-wheat" strokeWidth={1.8} />
                )}
              </span>
            );
          })}
        </div>
        <div className="meta-row text-meta text-muted">
          <span>完形填空</span>
          <span>阅读理解</span>
          <span>新题型</span>
          <span>翻译</span>
          <span>写作</span>
        </div>
      </div>
    </aside>
  );
}
