import { AUTH, SITE } from "../config/site";
import { GitHubMark } from "../components/GitHubMark";

export function Footer() {
  return (
    <footer className="border-t border-rule bg-material">
      <div className="wrap flex flex-col gap-8 py-12 md:flex-row md:items-start md:justify-between">
        <div>
          <div className="flex items-baseline gap-2">
            <span className="text-[17px] font-semibold tracking-[-0.3px] text-title">{SITE.name}</span>
            <span className="eyebrow">{SITE.latin}</span>
          </div>
          <p className="mt-2 max-w-[360px] text-[13px] leading-relaxed text-body">{SITE.tagline}。考研英语真题，在你自己的电脑上，安静地做完。</p>
          <div className="meta mt-4">
            <span>© {new Date().getFullYear()}</span>
            <span>{SITE.author}</span>
            <span>
              {SITE.yearFrom}–{SITE.yearTo} · {SITE.paperCount} 份年份卷
            </span>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-x-12 gap-y-6 text-[13px] sm:grid-cols-3">
          <div>
            <div className="eyebrow mb-3">产品</div>
            <ul className="space-y-2 text-body">
              <li>
                <a href="#features" className="hover:text-heading">
                  它能做什么
                </a>
              </li>
              <li>
                <a href="#how" className="hover:text-heading">
                  怎么用
                </a>
              </li>
              <li>
                <a href="#design" className="hover:text-heading">
                  为什么是绿色
                </a>
              </li>
              <li>
                <a href="#faq" className="hover:text-heading">
                  常见问题
                </a>
              </li>
            </ul>
          </div>
          <div>
            <div className="eyebrow mb-3">账号</div>
            <ul className="space-y-2 text-body">
              <li>
                <a href={AUTH.login} className="hover:text-heading" data-entry="login">
                  登录
                </a>
              </li>
              <li>
                <a href={AUTH.register} className="hover:text-heading" data-entry="register">
                  注册
                </a>
              </li>
            </ul>
          </div>
          <div>
            <div className="eyebrow mb-3">开源</div>
            <ul className="space-y-2 text-body">
              <li>
                <a href={SITE.repo.url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1.5 hover:text-heading">
                  <GitHubMark size={13} />
                  GitHub 仓库
                </a>
              </li>
              <li>
                <a href={`${SITE.repo.url}/issues`} target="_blank" rel="noopener noreferrer" className="hover:text-heading">
                  提一个 Issue
                </a>
              </li>
              <li>
                <a href="#top" className="hover:text-heading">
                  回到顶部
                </a>
              </li>
            </ul>
          </div>
        </div>
      </div>
      <div className="border-t border-divider">
        <div className="wrap meta py-4">
          <span>本页没有统计脚本，不收集访问数据</span>
          <span>唯一的外部请求是右上角的 GitHub Star 数，可关闭</span>
        </div>
      </div>
    </footer>
  );
}
