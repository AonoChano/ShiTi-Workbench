import { ArrowUpRight } from "lucide-react";
import { AUTH } from "../config/site";
import { Reveal } from "../components/Reveal";
import { SectionHead } from "../components/SectionHead";

const STEPS = [
  {
    n: "01",
    title: "挑一份卷",
    desc: "在题库里按年份挑，或者从题型入口进。常做的，收藏起来。",
    meta: ["题库", "按年份 / 题型"],
  },
  {
    n: "02",
    title: "坐下来做",
    desc: "边读边答，自动保存。中途暂停，下次回来接着做，不会丢。",
    meta: ["自动保存", "可暂停"],
  },
  {
    n: "03",
    title: "交卷、复盘",
    desc: "程序判分，生成 Markdown 报告。需要的话，打包交给 AI 看一遍。",
    meta: ["确定性判分", "Markdown 报告"],
  },
];

export function Steps() {
  return (
    <section id="how" className="border-t border-rule bg-material">
      <div className="wrap py-16 md:py-24">
        <SectionHead eyebrow="How it works" title="三步，开始一份卷子" lede="没有向导，没有设置页要先填。注册之后，第一屏就是题库。" />

        <ol className="paper-list panel mt-10 grid md:grid-cols-3 md:[&>*+*]:border-l md:[&>*+*]:border-t-0 md:[&>*+*]:border-divider">
          {STEPS.map((step, i) => (
            <Reveal as="li" key={step.n} index={i} className="relative p-6 md:p-7">
              <span className="watermark-num absolute right-6 top-5 select-none" aria-hidden>
                {step.n}
              </span>
              <span className="eyebrow">Step {step.n}</span>
              <h3 className="mt-2 text-[18px] font-semibold text-heading">{step.title}</h3>
              <p className="mt-2.5 max-w-[300px] text-[13.5px] leading-relaxed text-body">{step.desc}</p>
              <div className="meta mt-5">
                {step.meta.map((m) => (
                  <span key={m}>{m}</span>
                ))}
              </div>
            </Reveal>
          ))}
        </ol>

        <Reveal index={3} className="mt-8 flex flex-wrap items-center gap-4">
          <a href={AUTH.register} className="btn btn-primary btn-lg" data-entry="register">
            注册，开始第一份
            <ArrowUpRight className="arrow" size={15} strokeWidth={1.7} />
          </a>
          <span className="text-[12px] text-muted">注册只是为了把你的记录存在你自己的电脑上。</span>
        </Reveal>
      </div>
    </section>
  );
}
