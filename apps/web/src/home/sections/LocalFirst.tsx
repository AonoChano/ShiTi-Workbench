import { Code, HardDrive, ShieldCheck, type LucideIcon } from "lucide-react";
import { Reveal } from "../components/Reveal";
import { SectionHead } from "../components/SectionHead";

const ITEMS: { icon: LucideIcon; tone: string; title: string; desc: string }[] = [
  {
    icon: HardDrive,
    tone: "icon-sage",
    title: "数据在本机",
    desc: "答题记录、学习计划、复盘报告，存在你自己的电脑上，不经过任何服务器。",
  },
  {
    icon: ShieldCheck,
    tone: "icon-peach",
    title: "给谁看，你决定",
    desc: "AI 复盘是可选的：打包哪些内容、交给哪个 AI，都由你自己操作。不选，就什么都不会发出去。",
  },
  {
    icon: Code,
    tone: "icon-blue",
    title: "开源可查",
    desc: "代码公开在 GitHub。怎么存、存了什么，都能自己翻出来看。",
  },
];

export function LocalFirst() {
  return (
    <section id="local" className="border-t border-rule bg-material">
      <div className="wrap py-16 md:py-24">
        <SectionHead
          eyebrow="Local first"
          title="没有云，没有上传"
          lede="拾题在你自己的电脑上运行。题库、作答记录、报告，全都在本机——这不是一个设置项，是它本来的样子。"
        />
        <div className="paper-list panel mt-10 md:grid md:grid-cols-3 md:[&>*+*]:border-l md:[&>*+*]:border-t-0 md:[&>*+*]:border-divider">
          {ITEMS.map((item, i) => {
            const Icon = item.icon;
            return (
              <Reveal key={item.title} index={i} className="p-6 md:p-7">
                <span className={`icon-block ${item.tone}`}>
                  <Icon size={18} strokeWidth={1.7} />
                </span>
                <h3 className="mt-4 text-[16px] font-semibold text-heading">{item.title}</h3>
                <p className="mt-2 text-[13.5px] leading-relaxed text-body">{item.desc}</p>
              </Reveal>
            );
          })}
        </div>
      </div>
    </section>
  );
}
