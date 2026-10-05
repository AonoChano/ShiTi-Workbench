import { ChevronDown } from "lucide-react";
import { SITE } from "../config/site";
import { Reveal } from "../components/Reveal";
import { SectionHead } from "../components/SectionHead";

const QA: [string, string][] = [
  [
    "需要联网吗？",
    "做题、判分、生成报告都在你自己的电脑上完成，不依赖云端服务。只有你主动选择把答题过程打包交给外部 AI 复盘时，内容才会离开本机——发什么、发给谁，由你决定。",
  ],
  ["我的数据存在哪里？", "都在本机：题库、答题记录、学习计划、复盘报告。没有同步，没有上传。"],
  [
    "有哪些年份的题？",
    `${SITE.yearFrom} 到 ${SITE.yearTo} 年的 ${SITE.paperCount} 份年份卷，已经入库。在题库里按年份范围和科目筛选就能找到。`,
  ],
  [
    "判分准吗？",
    "客观题由程序按确定性规则判分：同一份作答，无论什么时候判，结果一样。翻译与写作这类主观题，建议配合 AI 复盘或老师批改来看。",
  ],
  ["登录和注册是做什么用的？", "用来保存你的练习记录、学习计划和复盘报告。和其它数据一样，账号信息也只存在本机。"],
  ["它是免费的吗？", "拾题是开源项目，代码公开在 GitHub 上，你可以把它跑在自己的电脑上使用。"],
];

export function Faq() {
  return (
    <section id="faq" className="wrap py-16 md:py-24">
      <div className="grid gap-10 lg:grid-cols-12">
        <div className="lg:col-span-4">
          <SectionHead eyebrow="FAQ" title="常见问题" lede="没找到想问的，去 GitHub 提个 Issue，作者会看。" />
        </div>
        <Reveal index={1} className="paper-list panel lg:col-span-8">
          {QA.map(([q, a]) => (
            <details key={q} className="faq group px-5 py-1 md:px-6">
              <summary className="flex items-center justify-between gap-4 py-4 text-[14.5px] font-medium text-heading">
                {q}
                <ChevronDown className="chev flex-none text-muted" size={16} strokeWidth={1.7} />
              </summary>
              <p className="pb-5 text-[13.5px] leading-[1.9] text-body">{a}</p>
            </details>
          ))}
        </Reveal>
      </div>
    </section>
  );
}
