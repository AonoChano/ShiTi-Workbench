import { useEffect, useRef, useState } from "react";
import {
  CalendarDays,
  Check,
  FileText,
  Flag,
  Highlighter,
  LayoutDashboard,
  Library,
  MessageSquareText,
  PenLine,
  Pencil,
  Save,
  Search,
  Star,
  Target,
  TrendingUp,
  type LucideIcon,
} from "lucide-react";
import type { ScreenshotId } from "../config/screenshots";
import { Reveal } from "../components/Reveal";
import { ScreenshotFrame } from "../components/ScreenshotFrame";
import { SectionHead } from "../components/SectionHead";
import { useReducedMotion } from "../lib/useReducedMotion";
import { cn } from "../utils/cn";

type Feature = {
  shot: ScreenshotId;
  eyebrow: string;
  title: string;
  body: string;
  bullets: { icon: LucideIcon; text: string }[];
};

const FEATURES: Feature[] = [
  {
    // SCREENSHOT-PLACEHOLDER:S2 答题页 → public/screenshots/home-practice.png
    shot: "S2",
    eyebrow: "Practice",
    title: "做题的时候，界面退到纸后面",
    body: "材料正文用衬线字排版，读起来像试卷，不像网页。要划重点，有荧光笔；要写翻译和作文，有横线稿纸。每一步都自动保存，中途可以暂停，明天接着做。",
    bullets: [
      { icon: Highlighter, text: "衬线材料正文，荧光笔只涂字的下半部" },
      { icon: PenLine, text: "横线作答区，写字像在纸上" },
      { icon: Save, text: "自动保存，随时暂停" },
      { icon: Flag, text: "题号珠子：一眼看清做到哪、标记了哪" },
    ],
  },
  {
    // SCREENSHOT-PLACEHOLDER:S3 复盘报告 → public/screenshots/home-report.png
    shot: "S3",
    eyebrow: "Review",
    title: "交卷之后，给你一份能带走的复盘",
    body: "客观题由程序判分，规则是确定的——同一份作答，什么时候判结果都一样。每次练习都会生成一份完整的 Markdown 复盘报告：逐题对错、用时、你的作答。愿意的话，还可以把整个答题过程打包，交给你信任的 AI 做深度复盘。",
    bullets: [
      { icon: Check, text: "确定性判分，不靠运气" },
      { icon: FileText, text: "Markdown 报告，随手带走" },
      { icon: MessageSquareText, text: "答题过程可打包交给外部 AI" },
      { icon: Pencil, text: "错题用陶土色批注，不是红色警报" },
    ],
  },
  {
    // SCREENSHOT-PLACEHOLDER:S4 真题题库 → public/screenshots/home-library.png
    shot: "S4",
    eyebrow: "Library",
    title: "35 份真题，1986 到 2020，一份不少",
    body: "按年份范围和科目筛选，常做的卷子可以收藏。列表就是一整张白纸，年份是大号衬线数字——找一份卷子，不需要搜索引擎。",
    bullets: [
      { icon: Library, text: "35 份年份卷已入库" },
      { icon: CalendarDays, text: "按年份范围、科目筛选" },
      { icon: Star, text: "收藏常做的卷子" },
      { icon: Search, text: "Ctrl K，全局搜索" },
    ],
  },
  {
    // SCREENSHOT-PLACEHOLDER:S1 学习概览整页 → public/screenshots/home-overview.png
    shot: "S1",
    eyebrow: "Overview",
    title: "每天记一笔，知道自己走到哪了",
    body: "今日目标、连续天数、学习日历、近 7 / 30 天的趋势线、最近三份练习——都在登录后的第一屏。不是为了打榜，只是帮你看见自己的节奏。",
    bullets: [
      { icon: Target, text: "今日目标：一个环，描完就是今天" },
      { icon: TrendingUp, text: "近 7 / 30 天答题量与正确率" },
      { icon: CalendarDays, text: "学习日历：打卡与练习日期" },
      { icon: LayoutDashboard, text: "最近练习的状态与正确率" },
    ],
  },
];

const SECTION_HEAD = {
  eyebrow: "What it does",
  title: "它做的事不多：选题、做题、复盘、记一笔",
  lede: "下面是实机截图。界面里没有什么需要学习的东西，看一眼就知道哪是纸、哪是笔。",
  meta: ["1440 × 900 桌面视口", "实机截图", "非渲染图"],
};

export function Features() {
  const reduced = useReducedMotion();
  const [desktop, setDesktop] = useState(
    () => typeof window !== "undefined" && window.matchMedia("(min-width: 1024px)").matches,
  );

  useEffect(() => {
    const mq = window.matchMedia("(min-width: 1024px)");
    const onChange = (e: MediaQueryListEvent) => setDesktop(e.matches);
    mq.addEventListener?.("change", onChange);
    return () => mq.removeEventListener?.("change", onChange);
  }, []);

  // lg+ 且未开启“减少动态效果”时走滚动叙事；窄屏与 reduced-motion 退回普通分栏排版
  if (desktop && !reduced) {
    return (
      <section id="features" className="border-t border-rule bg-material">
        <div className="wrap pb-12 pt-16 md:pb-16 md:pt-24">
          <SectionHead {...SECTION_HEAD} />
        </div>
        <ScrollyStage />
      </section>
    );
  }

  return (
    <section id="features" className="border-t border-rule bg-material">
      <div className="wrap py-16 md:py-24">
        <SectionHead {...SECTION_HEAD} />
        <div className="mt-12 space-y-16 md:space-y-24">
          {FEATURES.map((feature, i) => (
            <StaticRow key={feature.shot} feature={feature} index={i} />
          ))}
        </div>
      </div>
    </section>
  );
}

/** 窄屏 / reduced-motion 的回落排版：与滚动叙事同一份内容，保持原有的交替分栏 + 入场动效 */
function StaticRow({ feature, index }: { feature: Feature; index: number }) {
  const flip = index % 2 === 1;
  return (
    <div className="grid items-center gap-8 lg:grid-cols-12 lg:gap-12">
      <div className={cn("lg:col-span-5", flip && "lg:order-2")}>
        <Reveal>
          <span className="eyebrow">{feature.eyebrow}</span>
        </Reveal>
        <Reveal index={1}>
          <h3 className="h-section mt-3">{feature.title}</h3>
        </Reveal>
        <Reveal index={2}>
          <p className="lede mt-4">{feature.body}</p>
        </Reveal>
        <ul className="mt-6 space-y-2.5">
          {feature.bullets.map((bullet, j) => {
            const Icon = bullet.icon;
            return (
              <Reveal as="li" key={bullet.text} index={3 + j} className="flex items-center gap-3 text-[13.5px] text-option">
                <span className="icon-block icon-sage h-7 w-7 rounded-[7px]">
                  <Icon size={14} strokeWidth={1.7} />
                </span>
                {bullet.text}
              </Reveal>
            );
          })}
        </ul>
      </div>

      <Reveal index={1} className={cn("lg:col-span-7", flip && "lg:order-1")}>
        {/* 截图占位 S1–S4 在上方 FEATURES 数组里逐条标注（搜索 SCREENSHOT-PLACEHOLDER）；真图放到 public/screenshots/ 即自动替换 */}
        <ScreenshotFrame id={feature.shot} />
      </Reveal>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* 滚动驱动的粘性叙事（scrollytelling）                                  */
/*                                                                      */
/* 整段只有一条时间线：轨道高 = 场景数 × 90vh + 100vh，舞台 sticky 钉在   */
/* 视口里（让出 60px 的站点顶栏）。滚动进度 p ∈ [0,1] 由轨道位置归一化    */
/* 得出，每个场景占 1/n 的时间片，片内三段：                             */
/*   淡入（自右侧 DRIFT px 移入）→ 停留 → 淡出（向左移出）               */
/* 首场景开场即在台上，末场景不退场。所有样式都由 p 一次性算出（scrub）， */
/* 不经过任何时间动画，可倒着滚、可停在任何位置。                        */
/* ------------------------------------------------------------------ */

const SLOT = 1 / FEATURES.length; // 每个场景占的时间片
const FADE = 0.08; // 一次淡入或淡出占整条时间线的比例
const DRIFT = 26; // 进出场水平位移（px）
const STICKY_TOP = 60; // 与 home.css .site-header 的高度一致

const clamp01 = (v: number) => Math.min(1, Math.max(0, v));

function ScrollyStage() {
  const trackRef = useRef<HTMLDivElement>(null);
  const railRef = useRef<HTMLDivElement>(null);
  const sceneRefs = useRef<Array<HTMLDivElement | null>>([]);

  useEffect(() => {
    const track = trackRef.current;
    if (!track) return;
    const n = FEATURES.length;
    let raf = 0;

    const paint = () => {
      raf = 0;
      const span = track.offsetHeight - window.innerHeight;
      const p = span > 0 ? clamp01(-track.getBoundingClientRect().top / span) : 0;

      if (railRef.current) railRef.current.style.transform = `scaleX(${p.toFixed(4)})`;

      FEATURES.forEach((_, i) => {
        const el = sceneRefs.current[i];
        if (!el) return;
        const eIn = i === 0 ? 1 : clamp01((p - i * SLOT) / FADE);
        const eOut = i === n - 1 ? 0 : clamp01((p - ((i + 1) * SLOT - FADE)) / FADE);
        const opacity = eIn * (1 - eOut);
        const x = (1 - eIn) * DRIFT - eOut * DRIFT;
        const scale = 1 - 0.015 * (1 - eIn + eOut);
        el.style.opacity = opacity.toFixed(3);
        el.style.transform = `translate3d(${x.toFixed(2)}px, 0, 0) scale(${scale.toFixed(4)})`;
        el.style.visibility = opacity <= 0.001 ? "hidden" : "visible";
        el.setAttribute("aria-hidden", opacity < 0.05 ? "true" : "false");
      });
    };

    const request = () => {
      if (!raf) raf = requestAnimationFrame(paint);
    };

    paint();
    window.addEventListener("scroll", request, { passive: true });
    window.addEventListener("resize", request);
    return () => {
      window.removeEventListener("scroll", request);
      window.removeEventListener("resize", request);
      if (raf) cancelAnimationFrame(raf);
    };
  }, []);

  return (
    <div ref={trackRef} className="relative" style={{ height: `${FEATURES.length * 90 + 100}vh` }}>
      <div className="sticky flex items-center overflow-hidden" style={{ top: STICKY_TOP, height: `calc(100vh - ${STICKY_TOP}px)` }}>
        {/* 进度轨：与场景共用同一条滚动进度，只作位置提示 */}
        <div className="absolute inset-x-0 bottom-7 flex justify-center" aria-hidden>
          <div className="h-px w-28 overflow-hidden rounded-full bg-watermark">
            <div ref={railRef} className="h-full origin-left bg-chart" style={{ transform: "scaleX(0)" }} />
          </div>
        </div>

        {FEATURES.map((feature, i) => {
          const imageRight = i % 2 === 1; // 偶数场景图左文右，奇数场景文左图右
          return (
            <div
              key={feature.shot}
              ref={(el) => {
                sceneRefs.current[i] = el;
              }}
              className="absolute inset-0 flex items-center will-change-transform"
              style={{ visibility: i === 0 ? "visible" : "hidden" }}
              aria-hidden={i === 0 ? undefined : "true"}
            >
              <div className="wrap grid w-full items-center gap-8 lg:grid-cols-12 lg:gap-12">
                <div className={cn("lg:col-span-7", imageRight && "lg:order-2")}>
                  {/* 真图放到 public/screenshots/ 即自动替换，编号见 FEATURES 数组内的 SCREENSHOT-PLACEHOLDER 注释 */}
                  <ScreenshotFrame id={feature.shot} />
                </div>
                <div className={cn("lg:col-span-5", imageRight && "lg:order-1")}>
                  <span className="eyebrow">{feature.eyebrow}</span>
                  <h3 className="h-section mt-3">{feature.title}</h3>
                  <p className="lede mt-4">{feature.body}</p>
                  <ul className="mt-6 space-y-2.5">
                    {feature.bullets.map((bullet) => {
                      const Icon = bullet.icon;
                      return (
                        <li key={bullet.text} className="flex items-center gap-3 text-[13.5px] text-option">
                          <span className="icon-block icon-sage h-7 w-7 rounded-[7px]">
                            <Icon size={14} strokeWidth={1.7} />
                          </span>
                          {bullet.text}
                        </li>
                      );
                    })}
                  </ul>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
