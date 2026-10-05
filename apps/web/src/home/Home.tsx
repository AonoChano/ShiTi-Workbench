import type { MouseEvent } from "react";
import "./home.css";
import { Header } from "./sections/Header";
import { Hero } from "./sections/Hero";
import { EntryCards } from "./sections/EntryCards";
import { Features } from "./sections/Features";
import { Details } from "./sections/Details";
import { Steps } from "./sections/Steps";
import { Letter } from "./sections/Letter";
import { LocalFirst } from "./sections/LocalFirst";
import { DesignNotes } from "./sections/DesignNotes";
import { OpenSource } from "./sections/OpenSource";
import { Faq } from "./sections/Faq";
import { Footer } from "./sections/Footer";
import { navigate } from "../router";

/**
 * 拾题 · 产品主页（未登录访客的第一屏）
 * - 右上角「登录 / 注册」原本是普通链接；这里接管为 SPA 跳转（元素上的 data-entry 是设计稿约定的钩子），
 *   完整页面刷新就交给 /login、/register 路由本身兜底。
 * - 截图占位 S1–S5：真图放 public/screenshots/ 即自动显示（config/screenshots.ts）。
 * - 样式作用域：整页包在 .home-root 里（见 home.css），与主界面/登录页互不染色。
 */
export default function Home() {
  // SPA 接管登录 / 注册入口：a[data-entry] 点击时不整页刷新
  function delegateEntries(event: MouseEvent<HTMLDivElement>) {
    const target = event.target as Element | null;
    const anchor = target?.closest?.("a[data-entry]") as HTMLAnchorElement | null;
    if (!anchor) return;
    const href = anchor.getAttribute("href");
    if (!href || !href.startsWith("/") || href.startsWith("//")) return;
    event.preventDefault();
    navigate(href);
  }

  return (
    <div className="home-root" onClick={delegateEntries}>
      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-50 focus:rounded-[6px] focus:bg-card focus:px-3 focus:py-2 focus:text-[13px] focus:text-heading focus:shadow-pop"
      >
        跳到正文
      </a>
      <Header />
      <main id="main">
        <Hero />
        <EntryCards />
        <Features />
        <Details />
        <Steps />
        <Letter />
        <LocalFirst />
        <DesignNotes />
        <OpenSource />
        <Faq />
      </main>
      <Footer />
    </div>
  );
}
