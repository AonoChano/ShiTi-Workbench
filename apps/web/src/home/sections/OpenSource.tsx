import { ArrowUpRight, Lightbulb, Star } from "lucide-react";
import { SITE } from "../config/site";
import { formatStars, useGitHubStars } from "../lib/github";
import { GitHubMark } from "../components/GitHubMark";
import { Reveal } from "../components/Reveal";
import { SectionHead } from "../components/SectionHead";

const TAGS = ["Python", "题库", "开源", "教育"];

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

        <Reveal index={1} className="panel card-hover relative mt-10 overflow-hidden">
          {/* 右下角的叶片水印 */}
          <svg
            viewBox="0 0 100 100"
            aria-hidden
            className="pointer-events-none absolute -bottom-9 -right-7 h-48 w-48 rotate-[8deg] text-watermark"
            fill="currentColor"
          >
            <path d="M12 92C12 44 44 12 92 12c0 48-32 80-80 80Z" />
            <path d="M20 84C36 62 56 42 80 26" stroke="var(--color-card)" strokeWidth="2.5" fill="none" strokeLinecap="round" />
          </svg>

          <div className="relative grid gap-8 p-6 sm:p-8 md:grid-cols-[minmax(0,1fr)_auto] md:items-center md:gap-10 md:p-10">
            {/* 左：仓库信息 */}
            <div className="flex items-start gap-5">
              <span className="icon-block icon-sage shrink-0" style={{ width: 56, height: 56, borderRadius: 16 }} aria-hidden>
                <GitHubMark size={28} />
              </span>
              <div className="min-w-0">
                <div className="eyebrow">Repository</div>
                <div className="mt-1.5 text-[22px] font-semibold tracking-[-0.4px] text-title md:text-[26px]">
                  {SITE.repo.owner} <span className="text-muted">/</span> {SITE.repo.name}
                </div>
                <div className="meta mt-2">
                  <span>作者 {SITE.author}</span>
                  <span>本地运行</span>
                  <span>养成英语套题</span>
                  <span className="tnum">
                    {SITE.yearFrom}–{SITE.yearTo}
                  </span>
                </div>
                <div className="mt-4 flex flex-wrap gap-2">
                  {TAGS.map((tag) => (
                    <span key={tag} className="rounded-full border border-divider bg-card px-3 py-1 text-[12px] text-body">
                      {tag}
                    </span>
                  ))}
                </div>
              </div>
            </div>

            {/* 右：Star 数与动作 */}
            <div className="flex flex-wrap items-center gap-3 md:justify-end md:border-l md:border-divider md:pl-10">
              <div className="rounded-[14px] border border-divider bg-card px-5 py-2.5">
                <div className="flex items-center gap-1.5 text-[14px] font-semibold text-heading">
                  <Star size={15} strokeWidth={1.7} className="text-chart" />
                  Star
                </div>
                <div className="tnum mt-0.5 text-[14px] text-muted">
                  {known ? formatStars(stars) : stars === "loading" ? "…" : "—"}
                </div>
              </div>
              <a href={SITE.repo.url} target="_blank" rel="noopener noreferrer" className="btn btn-primary btn-lg btn-pill">
                <GitHubMark size={16} />
                在 GitHub 上查看
                <ArrowUpRight className="arrow" size={15} strokeWidth={1.7} />
              </a>
              <a href={SITE.repo.url} target="_blank" rel="noopener noreferrer" className="btn btn-outline btn-lg btn-pill">
                <Star size={14} strokeWidth={1.7} />
                Star 一下
              </a>
            </div>
          </div>
        </Reveal>

        <Reveal index={2} className="meta mt-4">
          <Lightbulb size={14} strokeWidth={1.7} className="text-chart" aria-hidden />
          <span>Star 数来自 GitHub 公开接口</span>
          <span>只请求一次，10 分钟内不重复</span>
          <span>可以在配置里关闭</span>
        </Reveal>
      </div>
    </section>
  );
}
