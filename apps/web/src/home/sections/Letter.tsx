import { SITE } from "../config/site";
import { Reveal } from "../components/Reveal";

export function Letter() {
  return (
    <section className="wrap py-16 md:py-24">
      <Reveal className="paper mx-auto max-w-[780px] px-6 py-9 md:px-12 md:py-12">
        <span className="eyebrow">A note from the author</span>
        <h2 className="h-section mt-3">写给正在备考的你</h2>
        <div className="mt-6 space-y-4 text-[14.5px] leading-[1.95] text-body">
          <p>
            我大概知道你会怎么用它：晚上，或者周末，一坐就是两三个小时。那种时候，最不需要的是一个闪着提醒、催你打卡、拿你和别人比的仪表盘。
          </p>
          <p>
            所以拾题把界面做得很安静。背景是带一点绿意的纸色，文字是墨绿灰，错题用
            <span className="stem-mark">陶土色</span>
            标注而不是红色——负面信息被调成了铅笔批注，不是警报。你的注意力应该留给试卷本身。
          </p>
          <p>它不会推送，不会排名，也不会把你的数据送去任何地方。做完了就做完了，报告在你电脑里，想看再看。</p>
          <p>祝你顺利。</p>
        </div>
        <div className="mt-8 flex items-center gap-3 border-t border-divider pt-6">
          <span className="icon-block icon-sage overflow-hidden">
            <img
              src="/images/aonochano-avatar.png"
              alt=""
              width={38}
              height={38}
              loading="lazy"
              decoding="async"
              draggable={false}
              className="h-full w-full object-cover"
            />
          </span>
          <div>
            <div className="text-[13.5px] font-semibold text-heading">{SITE.author}</div>
            <div className="meta">
              <span>{SITE.name} 的作者</span>
              <span>独立维护</span>
            </div>
          </div>
        </div>
      </Reveal>
    </section>
  );
}
