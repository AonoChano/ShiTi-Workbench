import { Reveal } from "../components/Reveal";
import { ScreenshotFrame } from "../components/ScreenshotFrame";
import { SectionHead } from "../components/SectionHead";

const RULES = [
  ["试卷用衬线，界面用无衬线。", "屏幕里嵌着一张纸——材料、题干、年份大数字都是 Georgia。"],
  ["错误是陶土色，警告是麦色。", "负面信息是铅笔批注，不是警报。"],
];

export function DesignNotes() {
  return (
    <section id="design" className="wrap py-16 md:py-24">
      <div className="grid gap-10 lg:grid-cols-12 lg:gap-14">
        <div className="lg:col-span-5">
          <SectionHead
            eyebrow="Why sage green"
            title="它长这样，是有原因的"
            lede="整套界面只有一个主角：鼠尾草绿，从深到浅五种浓度，各管一件事。一个人要在这里坐两三个小时，界面只需要让人安定下来。"
          />
          <ul className="mt-7 space-y-4">
            {RULES.map(([head, rest], i) => (
              <Reveal as="li" key={head} index={i} className="flex gap-3">
                <span className="mt-[9px] h-[2px] w-[2px] flex-none rounded-full bg-muted" aria-hidden />
                <p className="text-[13.5px] leading-relaxed text-body">
                  <span className="font-semibold text-heading">{head}</span>
                  {rest}
                </p>
              </Reveal>
            ))}
          </ul>
        </div>

        <div className="lg:col-span-7">
          {/* SCREENSHOT-PLACEHOLDER:S5 登录页 → public/screenshots/home-login.png */}
          <Reveal index={1}>
            <ScreenshotFrame id="S5" />
          </Reveal>
          <Reveal index={2} className="meta mt-3">
            <span>登录页全貌</span>
            <span>扉页试卷、答题卡珠子、荧光笔标记</span>
          </Reveal>
        </div>
      </div>
    </section>
  );
}
