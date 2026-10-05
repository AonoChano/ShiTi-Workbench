# 拾题主页 · 接入与安全说明

> 这份文档给接手主页的人看：接口在哪、占位怎么换、做了哪些安全处理、哪些事情前端做不到。

## 1. 结构

```
index.html                     标题 / meta / CSP（由 VITE_CSP 注入）
.env.development               开发期 CSP（放行 React Refresh 内联脚本与 HMR WebSocket）
.env.production                生产 CSP（见下文"singlefile 的限制"）
src/
  config/site.ts               站点常量、登录/注册入口（safeUrl 校验）、导航
  config/screenshots.ts        截图占位清单 S1–S5
  lib/github.ts                GitHub Star 数（白名单、超时、响应校验、去重、缓存）
  lib/harden.ts                生产环境加固（React DevTools 钩子失效）
  lib/useReducedMotion.ts
  components/
    MotionPlayer.tsx           Remotion <Player> 封装（视口内才播放、reduced-motion 停帧、无控件无音频）
    ScreenshotFrame.tsx        截图画框 + 占位回退
    GitHubMark.tsx / GitHubStars.tsx
    Reveal.tsx / SectionHead.tsx
  remotion/                    四段动画：HeroPaper（首屏）、LinedWriting、GoalRing、TrendLine
  sections/                    页面各段落
public/screenshots/            放实机截图的位置（见其中 README）
```

## 2. 接口与占位

### 登录 / 注册入口

页面上所有「登录」「注册」都是 `<a href>`，指向 `src/config/site.ts` 里的 `AUTH.login` / `AUTH.register`，默认 `/login`、`/register`。
可用环境变量覆盖：

```
VITE_AUTH_LOGIN_URL=/account/login
VITE_AUTH_REGISTER_URL=https://app.example.com/register
```

覆盖值会经过 `safeUrl` 校验：只接受"单个 `/` 开头的站内路径"或 `https:` 绝对地址；`javascript:`、`data:`、`//evil`、`/\evil`、`http:` 一律回退默认值。
所有入口元素带 `data-entry="login|register"`，接 SPA 路由时可以统一拦截。

### 截图占位 S1–S5

把截图放进 `public/screenshots/`，文件名见 `src/config/screenshots.ts`；代码中搜索 `SCREENSHOT-PLACEHOLDER:S1` … `S5` 可定位使用处。图不存在时显示占位框，不会破图。

### GitHub Star 数

默认直接请求 `https://api.github.com/repos/AonoChano/ShiTi-Workbench`（匿名，60 次/小时/IP，页面只请求一次并缓存 10 分钟）。

```
VITE_GITHUB_STARS_ENDPOINT=                       # 留空：GitHub 公开 API
VITE_GITHUB_STARS_ENDPOINT=https://你的域名/api/stars   # 自建代理，返回 { "stars": 123 } 或 GitHub 原样 JSON
VITE_GITHUB_STARS_ENDPOINT=off                    # 不发任何外部请求
```

## 3. 安全设计（前端能做的）

| 项 | 做法 |
| --- | --- |
| 内容安全策略 | `index.html` 内 `<meta http-equiv="Content-Security-Policy">`，内容由 `VITE_CSP` 注入；`object-src 'none'`、`base-uri 'self'`、`form-action 'self'`、`frame-src 'none'`，`connect-src` 只放行自身与 GitHub API |
| 外部链接 | 全部 `target="_blank" rel="noopener noreferrer"` |
| Referrer | `<meta name="referrer" content="strict-origin-when-cross-origin">`；GitHub 请求本身 `referrerPolicy: no-referrer` |
| 外部数据 | Star 数：校验状态码、最终 origin、Content-Type、字段类型与范围，只渲染一个整数；sessionStorage 读取同样校验 |
| 入口地址 | `safeUrl` 校验，防 `javascript:` / 协议相对 / 开放重定向 |
| DOM | 没有 `dangerouslySetInnerHTML`、没有 `eval`、没有动态插入脚本、没有第三方统计 |
| 配置对象 | `Object.freeze`，运行期不可改 |
| React DevTools | `src/lib/harden.ts`（main.tsx 第一个 import）在生产环境让 DevTools 钩子失效，组件树与 props 不可被扩展读取 |
| 不收集数据 | 页面没有表单、没有埋点；唯一外部请求可关闭 |

### 关于"反前端逆向"

前端 bundle 对任何人都是可读的，混淆只能增加阅读成本、不能保密。本主页的策略是**让 bundle 里没有值得逆向的东西**：

- 没有密钥、没有内部接口、没有后台路径、没有鉴权逻辑——登录/注册只是跳转链接；
- 生产构建默认压缩、不输出 sourcemap（Vite 默认，不要打开 `build.sourcemap`）；
- 所有"可变的东西"（入口地址、Star 来源）都走环境变量，并在读取时校验。

真正的防护在服务端：鉴权、限流、CSRF、会话管理都应该由登录页之后的系统承担，主页不参与。

### singlefile 的限制与接入主仓库后的收紧

当前仓库用 `vite-plugin-singlefile` 把脚本内联进 `index.html`，因此生产 CSP 不得不放行 `script-src 'unsafe-inline'`。
接入主仓库（脚本为独立 `/assets/*.js`）后，请：

1. 把 `.env.production` 里的 `script-src` 改为 `'self'`；
2. 改由 HTTP 响应头下发 CSP（meta 标签不支持 `frame-ancestors`），并补上其它响应头。

nginx 示例：

```nginx
add_header Content-Security-Policy "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; font-src 'self' data:; connect-src 'self' https://api.github.com; object-src 'none'; base-uri 'self'; form-action 'self'; frame-ancestors 'none'; upgrade-insecure-requests" always;
add_header X-Content-Type-Options "nosniff" always;
add_header X-Frame-Options "DENY" always;
add_header Referrer-Policy "strict-origin-when-cross-origin" always;
add_header Permissions-Policy "camera=(), microphone=(), geolocation=(), payment=(), usb=()" always;
add_header Cross-Origin-Opener-Policy "same-origin" always;
add_header Strict-Transport-Security "max-age=31536000; includeSubDomains" always;
```

Netlify / Cloudflare Pages 的 `_headers` 文件写法相同（一行一个头）。
`style-src` 里的 `'unsafe-inline'` 是 Remotion Player 与 React 内联样式所需，影响面远小于脚本。

## 4. Remotion

- 只用了 `@remotion/player` 在浏览器里播放 React 组件，不涉及服务端渲染视频。
- `acknowledgeRemotionLicense` 已开启以关闭控制台提示。Remotion 对个人与 3 人以下团队免费，开源项目亦可；团队规模变化时请对照 remotion.dev/license。
- 动画只在进入视口时播放；`prefers-reduced-motion` 下停在代表帧（`posterFrame`）。
- 四段动画的色值在 `src/remotion/theme.ts`，与 `src/index.css` 的 `@theme` 令牌一致。

## 5. 文案与事实

页面上的产品事实只来自 UI-STYLE-ANALYSIS.md：35 份年份卷（1986–2020）、自动保存、可暂停、确定性判分、Markdown 报告、可打包交给外部 AI、数据只在本机、今日目标 / 连续天数 / 日历 / 近 7 / 30 天趋势 / 最近练习、题库年份与科目筛选、收藏、Ctrl K 搜索。
如有出入，直接改 `src/sections/*.tsx` 里的文案即可，没有其它数据源。
