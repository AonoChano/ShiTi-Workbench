/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** 注入 index.html 的内容安全策略，见 .env.development / .env.production */
  readonly VITE_CSP?: string;
  /** 登录页入口（站内相对路径或 https 地址），默认 /login */
  readonly VITE_AUTH_LOGIN_URL?: string;
  /** 注册页入口（站内相对路径或 https 地址），默认 /register */
  readonly VITE_AUTH_REGISTER_URL?: string;
  /** GitHub Star 数来源：空=GitHub 公开 API；https 地址=自建代理；off=关闭外部请求 */
  readonly VITE_GITHUB_STARS_ENDPOINT?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
