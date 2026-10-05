import { useState } from "react";
import { Menu, X } from "lucide-react";
import { AUTH, NAV, SITE } from "../config/site";
import { GitHubStars } from "../components/GitHubStars";

export function Header() {
  const [open, setOpen] = useState(false);

  return (
    <header className="site-header">
      <div className="wrap flex h-[60px] items-center gap-3">
        <a href="#top" className="flex items-baseline gap-2" aria-label={`${SITE.name} 首页`}>
          <span className="text-[19px] font-semibold tracking-[-0.4px] text-title">{SITE.name}</span>
          <span className="eyebrow hidden sm:inline">{SITE.latin}</span>
        </a>

        <nav className="ml-5 hidden items-center gap-0.5 lg:flex" aria-label="主导航">
          {NAV.map((item) => (
            <a key={item.href} href={item.href} className="nav-link">
              {item.label}
            </a>
          ))}
        </nav>

        <div className="ml-auto flex items-center gap-2">
          <GitHubStars />
          {/*
            登录 / 注册入口 —— 只是链接，指向已开发好的页面。
            地址在 src/config/site.ts（AUTH），可用 VITE_AUTH_LOGIN_URL / VITE_AUTH_REGISTER_URL 覆盖，经 safeUrl 校验。
            主页本身不包含任何鉴权、表单或会话逻辑。
          */}
          <a href={AUTH.login} className="btn btn-outline btn-sm hidden sm:inline-flex" data-entry="login">
            登录
          </a>
          <a href={AUTH.register} className="btn btn-primary btn-sm" data-entry="register">
            注册
          </a>
          <button
            type="button"
            className="btn btn-quiet btn-sm px-2 lg:hidden"
            aria-expanded={open}
            aria-controls="mobile-nav"
            aria-label={open ? "关闭菜单" : "打开菜单"}
            onClick={() => setOpen((v) => !v)}
          >
            {open ? <X size={16} strokeWidth={1.7} /> : <Menu size={16} strokeWidth={1.7} />}
          </button>
        </div>
      </div>

      {open ? (
        <div id="mobile-nav" className="border-t border-rule bg-paper lg:hidden">
          <nav className="wrap flex flex-col py-2" aria-label="主导航（移动端）">
            {NAV.map((item) => (
              <a key={item.href} href={item.href} className="nav-link py-2.5" onClick={() => setOpen(false)}>
                {item.label}
              </a>
            ))}
            <a href={AUTH.login} className="nav-link py-2.5 sm:hidden" data-entry="login">
              登录
            </a>
          </nav>
        </div>
      ) : null}
    </header>
  );
}
