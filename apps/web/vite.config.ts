import { defineConfig, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

/**
 * 生产构建时向 index.html 注入 Content-Security-Policy meta。
 * - 开发期不注入：@vitejs/plugin-react 的 React Refresh 预载脚本是内联的，HMR 还需要 ws:。
 * - script-src 收紧为 'self'（主仓库脚本为独立 /assets/*.js，不是 singlefile 内联）。
 * - 主页唯一的外部请求是 GitHub 公开 API（Star 数）；用 VITE_GITHUB_STARS_ENDPOINT=off 构建时
 *   应同时用 VITE_CSP 覆盖并去掉 api.github.com。
 * - meta 标签不支持 frame-ancestors，部署时由 HTTP 响应头补全（见 MainPage 交接说明的 nginx 示例）。
 */
function cspMeta(): Plugin {
  const csp = process.env.VITE_CSP
    ?? "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; font-src 'self' data:; connect-src 'self' https://api.github.com; object-src 'none'; base-uri 'self'; form-action 'self'; frame-src 'none'; upgrade-insecure-requests";
  return {
    name: 'shiti-csp-meta',
    apply: 'build',
    transformIndexHtml(html) {
      return html.replace(
        '</head>',
        `    <meta http-equiv="Content-Security-Policy" content="${csp}" />\n  </head>`,
      );
    },
  };
}

export default defineConfig({
  plugins: [react(), tailwindcss(), cspMeta()],
  server: {
    host: '127.0.0.1',
    port: 5173,
    proxy: {
      '/api': { target: 'http://127.0.0.1:8210', changeOrigin: false },
    },
  },
});
