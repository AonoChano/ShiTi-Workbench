import { ArrowUpRight } from "lucide-react";
import { AUTH, SITE } from "../config/site";
import { Reveal } from "../components/Reveal";
import { MotionPlayer } from "../components/MotionPlayer";
import { HERO_SPEC, HeroPaper } from "../remotion/HeroPaper";

export function Hero() {
  return (
    <section id="top" className="wrap pb-12 pt-12 md:pb-20 md:pt-20">
      <div className="grid items-center gap-10 lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)] lg:gap-14">
        <div>
          <Reveal className="meta">
            <span>本地运行</span>
            <span>开源</span>
            <span>考研英语真题</span>
          </Reveal>
          <Reveal index={1}>
            <h1 className="h-display mt-4">
              考研英语真题，
              <br />
              在你自己的电脑上，
              <br />
              安静地做完。
            </h1>
          </Reveal>
          <Reveal index={2}>
            <p className="lede mt-5 max-w-[520px]">
              拾题是一个本地的真题练习工具。{SITE.yearFrom} 到 {SITE.yearTo} 年的 {SITE.paperCount}{" "}
              份年份卷全部收录：选题、作答、自动保存、交卷判分、复盘报告，从头到尾是一条完整的流程。
            </p>
          </Reveal>
          <Reveal index={3} className="mt-7 flex flex-wrap items-center gap-3">
            <a href={AUTH.register} className="btn btn-primary btn-lg" data-entry="register">
              注册，开始做题
              <ArrowUpRight className="arrow" size={15} strokeWidth={1.7} />
            </a>
            <a href={AUTH.login} className="btn btn-outline btn-lg" data-entry="login">
              我已有账号，登录
            </a>
          </Reveal>
          <Reveal index={4} className="meta mt-6">
            <span className="tnum">{SITE.paperCount} 份年份卷</span>
            <span className="tnum">
              {SITE.yearFrom}–{SITE.yearTo}
            </span>
            <span>代码公开</span>
          </Reveal>
        </div>

        <div>
          <Reveal index={2} className="panel p-1.5">
            <MotionPlayer
              component={HeroPaper}
              spec={HERO_SPEC}
              label="演示动画：答题页里材料逐行出现，荧光笔划过关键句，选中一个选项后题号前进并自动保存；交卷后弹出复盘报告，正确率环被描出来。"
              className="rounded-[9px]"
            />
          </Reveal>
          <Reveal index={3} className="meta mt-3 justify-center">
            <span>上面是动效演示</span>
            <span>
              实机界面见{" "}
              <a href="#features" className="text-action underline-offset-2 hover:underline">
                下文
              </a>
            </span>
          </Reveal>
        </div>
      </div>
    </section>
  );
}
