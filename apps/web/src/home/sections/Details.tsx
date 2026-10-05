import type { ComponentType } from "react";
import { Reveal } from "../components/Reveal";
import { MotionPlayer } from "../components/MotionPlayer";
import { SectionHead } from "../components/SectionHead";
import type { MotionSpec } from "../remotion/theme";
import { LinedWriting, WRITING_SPEC } from "../remotion/LinedWriting";
import { GOAL_SPEC, GoalRing } from "../remotion/GoalRing";
import { TREND_SPEC, TrendLine } from "../remotion/TrendLine";

type Detail = {
  component: ComponentType<Record<string, never>>;
  spec: MotionSpec;
  label: string;
  title: string;
  desc: string;
};

const DETAILS: Detail[] = [
  {
    component: LinedWriting,
    spec: WRITING_SPEC,
    label: "演示动画：横线稿纸获得焦点后横线变绿，英文书信一词一词写出来，右上角的词数跟着增加。",
    title: "横线稿纸",
    desc: "作答框没有边框，横线是画出来的。点进去，横线会变成绿色——像拿起了笔。",
  },
  {
    component: GoalRing,
    spec: GOAL_SPEC,
    label: "演示动画：今日目标的环在 1.3 秒内描到 18/25，然后轻轻按下打卡，连续天数加一。",
    title: "目标环",
    desc: "今日目标是一个环，1.3 秒描完。打卡只是轻轻一下，没有烟花。",
  },
  {
    component: TrendLine,
    spec: TREND_SPEC,
    label: "演示动画：近 14 天答题量的折线在 1.6 秒内描出来，最后一个点上出现当天的小标签。",
    title: "趋势线",
    desc: "近一段时间的答题量，一条线自己描出来。看一眼就够了，不用盯着。",
  },
];

export function Details() {
  return (
    <section id="details" className="wrap py-16 md:py-24">
      <SectionHead
        eyebrow="Small things"
        title="一些我们在意的小地方"
        lede="它们不会出现在功能列表里，但你每天都会碰到。下面三段是用 Remotion 重现的界面动效，节奏和实际界面一致。"
      />
      <div className="mt-10 grid gap-4 md:grid-cols-3">
        {DETAILS.map((item, i) => (
          <Reveal key={item.title} index={i} className="panel card-hover overflow-hidden">
            <MotionPlayer component={item.component} spec={item.spec} label={item.label} className="border-b border-divider" />
            <div className="p-5">
              <div className="text-[15px] font-semibold text-heading">{item.title}</div>
              <p className="mt-1.5 text-[13px] leading-relaxed text-body">{item.desc}</p>
            </div>
          </Reveal>
        ))}
      </div>
    </section>
  );
}
