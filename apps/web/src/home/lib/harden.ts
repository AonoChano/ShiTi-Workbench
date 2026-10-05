/**
 * 生产环境的轻量加固。必须是 main.tsx 的第一个 import，才能赶在 react-dom 求值之前执行。
 *
 * 做了什么
 * - 让 React DevTools 的全局钩子失效：扩展装了也看不到组件树与 props，增加逆向阅读成本。
 *
 * 没做什么（有意为之）
 * - 不禁右键、不拦 F12、不检测 debugger：这些对真正的攻击者无效，只会伤害普通用户与无障碍工具。
 * - 不做代码混淆：bundle 里本来就没有值得保密的东西（见 HOMEPAGE-NOTES.md）。
 */
declare global {
  interface Window {
    __REACT_DEVTOOLS_GLOBAL_HOOK__?: Record<string, unknown>;
  }
}

if (import.meta.env.PROD && typeof window !== "undefined") {
  const hook = window.__REACT_DEVTOOLS_GLOBAL_HOOK__;
  if (hook && typeof hook === "object") {
    for (const key of Object.keys(hook)) {
      if (key === "renderers") {
        hook[key] = new Map();
      } else {
        hook[key] = typeof hook[key] === "function" ? () => undefined : null;
      }
    }
  }
}

export {};
