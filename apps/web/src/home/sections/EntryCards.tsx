import { BookOpen, Languages, ListChecks, PenLine, type LucideIcon } from "lucide-react";
import { Reveal } from "../components/Reveal";
import { SectionHead } from "../components/SectionHead";

type Entry = {
  icon: LucideIcon;
  tone: "icon-sage" | "icon-peach" | "icon-lavender" | "icon-blue";
  eyebrow: string;
  title: string;
  desc: string;
};

const ENTRIES: Entry[] = [
  {
    icon: BookOpen,
    tone: "icon-sage",
    eyebrow: "Reading",
    title: "阅读",
    desc: "材料和题目并排放着，边读边答，不用来回翻页。",
  },
  {
    icon: ListChecks,
    tone: "icon-peach",
    eyebrow: "Cloze",
    title: "完形",
    desc: "整篇一屏放下。答到哪儿，就自动存到哪儿。",
  },
  {
    icon: Languages,
    tone: "icon-lavender",
    eyebrow: "Translation",
    title: "翻译",
    desc: "横线作答区，像在纸上写；写一半可以先暂停。",
  },
  {
    icon: PenLine,
    tone: "icon-blue",
    eyebrow: "Writing",
    title: "写作",
    desc: "大小作文都有稿纸。写完了，可以打包交给 AI 复盘。",
  },
];

export function EntryCards() {
  return (
    <section className="wrap pb-16 md:pb-24">
      <SectionHead
        eyebrow="Practice by type"
        title="阅读、完形、翻译、写作，各有各的桌面"
        lede="按题型进，或者按年份进，都行。四种题型的作答界面是分开设计的，各自长成最顺手的样子。"
      />
      <div className="mt-8 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {ENTRIES.map((entry, i) => {
          const Icon = entry.icon;
          return (
            <Reveal key={entry.title} index={i} className="panel card-hover p-5">
              <div className="flex items-center gap-3">
                <span className={`icon-block ${entry.tone}`}>
                  <Icon size={18} strokeWidth={1.7} />
                </span>
                <div>
                  <div className="eyebrow">{entry.eyebrow}</div>
                  <div className="text-[16px] font-semibold text-heading">{entry.title}</div>
                </div>
              </div>
              <p className="mt-4 text-[13px] leading-relaxed text-body">{entry.desc}</p>
            </Reveal>
          );
        })}
      </div>
    </section>
  );
}
