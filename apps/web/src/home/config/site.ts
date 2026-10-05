/**
 * 站点配置 —— 整个主页里唯一允许出现"外部地址 / 入口路径"的地方。
 *
 * 安全约定
 * 1. 这里只放公开信息：仓库地址、作者名、登录 / 注册入口路径。
 *    不要放任何密钥、内部接口、后台路径、灰度开关。前端 bundle 对任何人都是可读的。
 * 2. 登录 / 注册入口可用环境变量覆盖（VITE_AUTH_LOGIN_URL / VITE_AUTH_REGISTER_URL），
 *    但必须通过 safeUrl 校验：只接受站内相对路径（单个 / 开头）或 https 绝对地址，
 *    其它一律回退默认值，避免被配置成 javascript: / data: / 协议相对地址 / 开放重定向。
 * 3. 对象全部 Object.freeze，运行期不可被第三方脚本篡改。
 */

export const SITE = Object.freeze({
  name: "拾题",
  latin: "ShiTi Workbench",
  author: "AonoChano",
  tagline: "一台「纸质学习室」里的低刺激工具",
  repo: Object.freeze({
    owner: "AonoChano",
    name: "ShiTi-Workbench",
    url: "https://github.com/AonoChano/ShiTi-Workbench",
  }),
  paperCount: 35,
  yearFrom: 1986,
  yearTo: 2020,
});

const DEFAULT_AUTH = Object.freeze({
  login: "/login",
  register: "/register",
});

/**
 * 校验一个来自配置的地址。
 * - 站内相对路径：以单个 "/" 开头，且第二个字符不是 "/" 或 "\"（否则会被浏览器解释成协议相对地址）。
 * - 绝对地址：仅接受 https:。
 * 其它情况（javascript:、data:、http:、空串、超长）回退到 fallback。
 */
export function safeUrl(candidate: unknown, fallback: string): string {
  if (typeof candidate !== "string") return fallback;
  const value = candidate.trim();
  if (!value || value.length > 2048) return fallback;
  // 控制字符一律拒绝
  // eslint-disable-next-line no-control-regex
  if (/[\u0000-\u001f\u007f]/.test(value)) return fallback;

  if (value.startsWith("/")) {
    const second = value.charAt(1);
    if (second === "/" || second === "\\") return fallback;
    return value;
  }

  try {
    const url = new URL(value);
    if (url.protocol === "https:") return url.href;
  } catch {
    /* 非法 URL，回退 */
  }
  return fallback;
}

/** 登录 / 注册入口。页面里所有"登录""注册"按钮都只引用这里，不含任何鉴权逻辑。 */
export const AUTH = Object.freeze({
  login: safeUrl(import.meta.env.VITE_AUTH_LOGIN_URL, DEFAULT_AUTH.login),
  register: safeUrl(import.meta.env.VITE_AUTH_REGISTER_URL, DEFAULT_AUTH.register),
});

/** 主导航锚点 */
export const NAV = Object.freeze([
  { href: "#features", label: "它能做什么" },
  { href: "#details", label: "在意的小地方" },
  { href: "#how", label: "怎么用" },
  { href: "#design", label: "为什么是绿色" },
  { href: "#opensource", label: "开源" },
  { href: "#faq", label: "常见问题" },
]);
