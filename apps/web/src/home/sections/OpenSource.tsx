import { ArrowUpRight, Star } from "lucide-react";
import { SITE } from "../config/site";
import { formatStars, useGitHubStars } from "../lib/github";
import { GitHubMark } from "../components/GitHubMark";
import { Reveal } from "../components/Reveal";
import { SectionHead } from "../components/SectionHead";

export function OpenSource() {
  const stars = useGitHubStars();
  const known = typeof stars === "number";

  return (
    <section id="opensource" className="border-t border-rule bg-material">
      <div className="wrap py-16 md:py-24">
        <SectionHead
          eyebrow="Open source"
          title="拾题是开源的"
          lede={`由 ${SITE.author} 开发维护。代码、题库格式、判分逻辑都在 GitHub 上。如果它帮到了你，给个 Star；遇到问题，欢迎提 Issue。`}
        />

        <Reveal index={1} className="panel card-hover mt-10 grid gap-6 p-6 md:grid-cols-[minmax(0,1fr)_auto] md:items-center md:p-8">
          <div className="flex items-start gap-4">
            <span className="icon-block icon-sage h-12 w-12 rounded-[12px]">
              <GitHubMark size={24} />
            </span>
            <div className="min-w-0">
              <div className="eyebrow">Repository</div>
              <div className="mt-1 truncate text-[18px] font-semibold tracking-[-0.3px] text-heading">
                {SITE.repo.owner} <span className="text-muted">/</span> {SITE.repo.name}
              </div>
              <div className="meta mt-1.5">
                <span>作者 {SITE.author}</span>
                <span>本地运行</span>
                <span>考研英语真题</span>
                <span className="tnum">
                  {SITE.yearFrom}–{SITE.yearTo}
                </span>
              </div>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-3 md:justify-end">
            <div className="paper flex min-w-[120px] items-center gap-3 px-4 py-2.5">
              <Star size={16} strokeWidth={1.7} className="text-chart" />
              <div>
                <div className="font-serif text-[24px] leading-none text-heading tnum">
                  {known ? formatStars(stars) : stars === "loading" ? "…" : "—"}
                </div>
                <div className="mt-1 text-[10px] uppercase tracking-[1.4px] text-muted">Stars</div>
              </div>
            </div>
            <a href={SITE.repo.url} target="_blank" rel="noopener noreferrer" className="btn btn-primary">
              在 GitHub 上查看
              <ArrowUpRight className="arrow" size={14} strokeWidth={1.7} />
            </a>
            <a href={SITE.repo.url} target="_blank" rel="noopener noreferrer" className="btn btn-outline">
              <Star size={13} strokeWidth={1.7} />
              Star 一下
            </a>
          </div>
        </Reveal>

        <Reveal index={2} className="meta mt-4">
          <span>Star 数来自 GitHub 公开接口</span>
          <span>只请求一次，10 分钟内不重复</span>
          <span>可以在配置里关闭</span>
        </Reveal>
      </div>
    </section>
  );
}
