import { Star } from "lucide-react";
import { SITE } from "../config/site";
import { formatStars, useGitHubStars } from "../lib/github";
import { GitHubMark } from "./GitHubMark";

/** 右上角的 GitHub 徽标：标记 + Star 数。数字来自经过校验的接口返回，失败时静默降级为只显示入口。 */
export function GitHubStars({ className }: { className?: string }) {
  const stars = useGitHubStars();
  const known = typeof stars === "number";

  return (
    <a
      className={className ? `gh-badge ${className}` : "gh-badge"}
      href={SITE.repo.url}
      target="_blank"
      rel="noopener noreferrer"
      aria-label={`在 GitHub 上查看 ${SITE.repo.owner}/${SITE.repo.name}${known ? `，${stars} 个 Star` : ""}`}
      title={`${SITE.repo.owner}/${SITE.repo.name}`}
    >
      <span>
        <GitHubMark size={15} />
        <span className="hidden md:inline">GitHub</span>
      </span>
      <span aria-hidden={!known}>
        <Star size={11} strokeWidth={1.7} className={known ? "text-chart" : "text-footnote"} />
        {known ? <span className="tnum">{formatStars(stars)}</span> : stars === "loading" ? <span className="text-footnote">…</span> : <span className="text-footnote">Star</span>}
      </span>
    </a>
  );
}
