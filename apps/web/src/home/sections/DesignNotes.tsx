import { Reveal } from "../components/Reveal";
import { ScreenshotFrame } from "../components/ScreenshotFrame";
import { SectionHead } from "../components/SectionHead";

const SWATCHES: [string, string][] = [
  ["#f7f8f4", "页面底"],
  ["#fafbf6", "材料底"],
  ["#ffffff", "卡片"],
  ["#526f43", "主绿 · 动作"],
  ["#465b39", "深标题"],
  ["#5a6850", "正文绿灰"],
  ["#a9c491", "已答"],
  ["#dce8cc", "选中底"],
  ["#e7ebdf", "边框"],
  ["#bc9b87", "错误 · 陶土"],
  ["#c1aa8e", "警告 · 麦色"],
  ["#adb99d", "最浅注脚"],
];

const RULES = [
  ["分层靠 1px 边框，不靠阴影。", "阴影只留给真正浮起来的东西：弹窗、气泡、当前题号。"],
  ["试卷用衬线，界面用无衬线。", "屏幕里嵌着一张纸——材料、题干、年份大数字都是 Georgia。"],
  ["错误是陶土色，警告是麦色。", "负面信息是铅笔批注，不是警报。"],
  ["入场只有一种动作。", "淡入加上移 8px，200–450ms，模块错峰出现。没有弹性，没有回弹。"],
];

export function DesignNotes() {
  return (
    <section id="design" className="wrap py-16 md:py-24">
      <div className="grid gap-10 lg:grid-cols-12 lg:gap-14">
        <div className="lg:col-span-5">
          <SectionHead
            eyebrow="Why sage green"
            title="它长这样，是有原因的"
            lede="整套界面只有一个主角：鼠尾草绿，从深到浅五种浓度，各管一件事。没有第二品牌色，没有渐变，没有玻璃效果——一个人要在这里坐两三个小时，界面不该制造情绪波动。"
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
          <div className="mt-8 grid grid-cols-2 gap-2 sm:grid-cols-3">
            {SWATCHES.map(([hex, role], i) => (
              <Reveal key={hex} index={i % 6} className="swatch">
                <i style={{ background: hex }} aria-hidden />
                <span className="min-w-0">
                  <span className="block text-[11px] font-medium text-heading">{role}</span>
                  <span className="block font-mono text-[10px] text-footnote">{hex}</span>
                </span>
              </Reveal>
            ))}
          </div>
        </div>

        <div className="lg:col-span-7">
          {/* SCREENSHOT-PLACEHOLDER:S5 登录页 → public/screenshots/home-login.png */}
          <Reveal index={1}>
            <ScreenshotFrame id="S5" />
          </Reveal>
          <Reveal index={2} className="meta mt-3">
            <span>登录页</span>
            <span>语义令牌化之后的样子</span>
            <span>扉页试卷、答题卡珠子、荧光笔标记</span>
          </Reveal>
        </div>
      </div>
    </section>
  );
}
