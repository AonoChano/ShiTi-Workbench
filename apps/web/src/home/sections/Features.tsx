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

export function Features() {
  return (
    <section id="features" className="border-t border-rule bg-material">
      <div className="wrap py-16 md:py-24">
        <SectionHead
          eyebrow="What it does"
          title="它做的事不多：选题、做题、复盘、记一笔"
          lede="下面是实机截图。界面里没有什么需要学习的东西，看一眼就知道哪是纸、哪是笔。"
          meta={["1440 × 900 桌面视口", "实机截图", "非渲染图"]}
        />

        <div className="mt-12 space-y-16 md:space-y-24">
          {FEATURES.map((feature, i) => {
            const flip = i % 2 === 1;
            return (
              <div key={feature.shot} className="grid items-center gap-8 lg:grid-cols-12 lg:gap-12">
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
          })}
        </div>
      </div>
    </section>
  );
}
