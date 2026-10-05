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
/* 粘性叙事（scrollytelling）：只读滚动，不劫持滚动                     */
/*                                                                      */
/* 轨道高保持 n*90+100vh 不变，span=n*90vh。时间线切成 n 个 dwell +       */
/* n-1 个 trans：dwell 40vh 静读（带 14px 缓慢上浮，保证滚动总有反馈），  */
/* trans ~66.7vh 交接（旧场景整体上浮淡出，新场景逐行浮现）。             */
/* p ∈ [0,1] 由轨道位置归一化得出，所有样式由 p 一次性算出，可倒滚。      */
/* 不做节点跳转/惯性回弹/锚点定时 hack，键盘、触控板、锚点全是原生行为。  */
/* ------------------------------------------------------------------ */

const DWELL_VH = 40; // 每个场景静读段（vh）
const RISE = 48; // 退场整体上浮距离（px）
const DRIFT = 14; // dwell 段内缓慢上移（px）
const DROP = 12; // 单行入场起始下坠（px）
const LINE_T = 0.28; // 单行浮现占整个过渡的比例
const STICKY_TOP_FALLBACK = 60; // 与 home.css .site-header 高度一致，实测失败时回落

const clamp01 = (v: number) => Math.min(1, Math.max(0, v));

// 时间线分数：总高度不变，dwell 固定 40vh，剩余均分给过渡段
const _N = FEATURES.length;
const _SPAN_VH = _N * 90;
const _TRANS_RAW = _N > 1 ? (_SPAN_VH - _N * DWELL_VH) / (_N - 1) / _SPAN_VH : 0;
const TRANS_F = _TRANS_RAW > 0.02 ? _TRANS_RAW : _N > 1 ? 0.6 / _N : 0;
const DWELL_F = _N > 0 ? (1 - (_N - 1) * TRANS_F) / _N : 1;

type ScrollySeg = {
  dwellStart: number;
  dwellEnd: number;
  transStart: number;
  transEnd: number;
};

const SEGS: ScrollySeg[] = (() => {
  const n = FEATURES.length;
  const segs: ScrollySeg[] = [];
  let cursor = 0;
  for (let i = 0; i < n; i++) {
    const dwellStart = cursor;
    const dwellEnd = i === n - 1 ? 1 : Math.min(1, dwellStart + DWELL_F);
    let transStart = dwellEnd;
    let transEnd = dwellEnd;
    if (i < n - 1) {
      transStart = dwellEnd;
      transEnd = Math.min(1, transStart + TRANS_F);
      cursor = transEnd;
    } else {
      cursor = dwellEnd;
    }
    segs.push({ dwellStart, dwellEnd, transStart, transEnd });
  }
  return segs;
})();

function ScrollyStage() {
  const trackRef = useRef<HTMLDivElement>(null);
  const stickyRef = useRef<HTMLDivElement>(null);
  const railRef = useRef<HTMLDivElement>(null);
  const sceneRefs = useRef<Array<HTMLDivElement | null>>([]);

  useEffect(() => {
    const track = trackRef.current;
    const sticky = stickyRef.current;
    if (!track || !sticky) return;
    const n = FEATURES.length;
    if (n === 0) return;

    // 每个场景里参与逐行入场的元素（DOM 序 = 图框、eyebrow、标题、正文、各条目）
    const lines = Array.from({ length: n }, (_, i) => {
      const el = sceneRefs.current[i];
      return el ? Array.from(el.querySelectorAll<HTMLElement>("[data-reveal]")) : [];
    });
    const steps = lines.map((l) => (l.length > 1 ? (1 - LINE_T) / (l.length - 1) : 0));

    let raf = 0;

    const measureSticky = () => {
      let top = STICKY_TOP_FALLBACK;
      const header = document.querySelector(".site-header") as HTMLElement | null;
      if (header) {
        const h = Math.round(header.getBoundingClientRect().height);
        if (Number.isFinite(h) && h >= 40 && h <= 160) top = h;
      }
      const vh = window.innerHeight;
      sticky.style.top = `${top}px`;
      sticky.style.height = `${Math.max(0, vh - top)}px`;
    };

    const paint = () => {
      raf = 0;
      const vh = window.innerHeight;
      const span = track.offsetHeight - vh;
      const p = span > 0 ? clamp01(-track.getBoundingClientRect().top / span) : 0;

      if (railRef.current) railRef.current.style.transform = `scaleX(${p.toFixed(4)})`;

      for (let i = 0; i < n; i++) {
        const el = sceneRefs.current[i];
        if (!el) continue;
        const s = SEGS[i];
        const prev = i > 0 ? SEGS[i - 1] : null;
        const sceneLines = lines[i];
        const st = steps[i];

        let mode: "dwell" | "out" | "in" | "hidden" = "hidden";
        let cOpacity = 0;
        let cY = 0;
        let t = 0;

        if (p >= s.dwellStart - 0.000001 && p <= s.dwellEnd + 0.000001) {
          mode = "dwell";
          const d = DWELL_F > 0 ? clamp01((p - s.dwellStart) / DWELL_F) : 1;
          cOpacity = 1;
          cY = -d * DRIFT;
        } else if (i < n - 1 && p > s.dwellEnd && p <= s.transEnd + 0.000001) {
          mode = "out";
          t = TRANS_F > 0 ? clamp01((p - s.transStart) / TRANS_F) : 1;
          cOpacity = 1 - t;
          cY = -DRIFT - t * RISE;
        } else if (prev && p >= prev.transStart - 0.000001 && p < s.dwellStart) {
          mode = "in";
          t = TRANS_F > 0 ? clamp01((p - prev.transStart) / TRANS_F) : 1;
          if (t <= 0.001) {
            mode = "hidden";
            cOpacity = 0;
            cY = 0;
          } else {
            cOpacity = 1;
            cY = 0;
          }
        } else {
          mode = "hidden";
          cOpacity = 0;
          cY = 0;
        }

        const visible = mode !== "hidden" && cOpacity > 0.001;
        el.style.opacity = cOpacity.toFixed(3);
        el.style.transform = `translate3d(0, ${cY.toFixed(2)}px, 0)`;
        el.style.visibility = visible ? "visible" : "hidden";
        if (!visible) {
          el.style.pointerEvents = "none";
          el.setAttribute("aria-hidden", "true");
          continue;
        }
        el.setAttribute("aria-hidden", cOpacity >= 0.05 ? "false" : "true");

        if (mode === "in") {
          for (let k = 0; k < sceneLines.length; k++) {
            const x = clamp01((t - k * st) / LINE_T);
            const line = sceneLines[k];
            line.style.opacity = x.toFixed(3);
            line.style.transform = `translate3d(0, ${((1 - x) * DROP).toFixed(2)}px, 0)`;
          }
          el.style.pointerEvents = t > 0.4 ? "auto" : "none";
        } else {
          for (let k = 0; k < sceneLines.length; k++) {
            const line = sceneLines[k];
            line.style.opacity = "1";
            line.style.transform = "translate3d(0, 0px, 0)";
          }
          el.style.pointerEvents = mode === "dwell" ? "auto" : t < 0.6 ? "auto" : "none";
        }
      }
    };

    const request = () => {
      if (!raf) raf = requestAnimationFrame(paint);
    };
    const onScroll = () => request();
    const onResize = () => {
      measureSticky();
      request();
    };

    measureSticky();
    paint();
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onResize);
    let ro: ResizeObserver | null = null;
    if (typeof ResizeObserver !== "undefined") {
      ro = new ResizeObserver(() => request());
      ro.observe(track);
    }
    return () => {
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onResize);
      if (ro) ro.disconnect();
      if (raf) cancelAnimationFrame(raf);
    };
  }, []);

  return (
    <div ref={trackRef} className="relative" style={{ height: `${FEATURES.length * 90 + 100}vh` }}>
      <div ref={stickyRef} className="sticky flex items-center overflow-hidden" style={{ top: STICKY_TOP_FALLBACK, height: `calc(100vh - ${STICKY_TOP_FALLBACK}px)` }}>
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
                <div data-reveal className={cn("lg:col-span-7", imageRight && "lg:order-2")}>
                  {/* 真图放到 public/screenshots/ 即自动替换，编号见 FEATURES 数组内的 SCREENSHOT-PLACEHOLDER 注释 */}
                  <ScreenshotFrame id={feature.shot} />
                </div>
                <div className={cn("lg:col-span-5", imageRight && "lg:order-1")}>
                  <span data-reveal className="eyebrow">
                    {feature.eyebrow}
                  </span>
                  <h3 data-reveal className="h-section mt-3">
                    {feature.title}
                  </h3>
                  <p data-reveal className="lede mt-4">
                    {feature.body}
                  </p>
                  <ul className="mt-6 space-y-2.5">
                    {feature.bullets.map((bullet) => {
                      const Icon = bullet.icon;
                      return (
                        <li data-reveal key={bullet.text} className="flex items-center gap-3 text-[13.5px] text-option">
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