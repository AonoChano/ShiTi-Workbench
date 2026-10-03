# 拾题 · Shiti Workbench

本地优先的考研英语真题练习工作台。1986–2020 年英语（一）真题已全量入库，做题、判分、专项和复盘都在自己电脑上完成。

![学习概览](docs/images/overview.png)

题库来自一份[转换规格](question_bank/NETEM_English_I/_规格说明.md)：把年份原卷交给 AI 按规格产出结构化 JSON，放进 `question_bank/` 就会自动入库。网页端负责做题与复盘，不需要联网，也没有内置 AI 聊天。

## Features

- **真题题库**：35 份英语（一）真题，按科目与五年年份范围筛选，支持搜索、收藏和排序
- **整卷训练**：按原卷结构作答。完形填空一屏连做，新题型选完自动回填空位，翻译和写作有独立作答区
- **专项练习**：按题型跨年份抽题组卷，材料整组保留，题序与原卷一致
- **自动保存**：答案实时写入本地数据库，中途关闭页面后回来可以接着做
- **判分与复盘**：客观题交卷即判分，主观题标记待评。报告可导出 Markdown/JSON，也可以让本地 Agent 按文件协议写复盘、网页实时刷新

## Screenshots

![专项练习](docs/images/drill-focus.png)

从概览页的题型卡片跳转过来时，对应的专项卡会高亮定位。

## Tech Stack

| Package | Stack |
|---|---|
| `apps/web` | React 19 · Vite 6 · TypeScript |
| `apps/server` | Fastify 5 · better-sqlite3 |
| `packages/shared` | 前后端共享的领域逻辑：导入校验、判分、报告 |

## Getting Started

需要 Node.js 与 npm（本项目在 Node 22 下开发）。

```bash
git clone https://github.com/AonoChano/ShiTi-Workbench.git
cd ShiTi-Workbench
npm install
npm run dev
```

`npm run dev` 会同时启动网页（127.0.0.1:5173）和 API（127.0.0.1:8210），打开 http://127.0.0.1:5173 即可使用。

其他常用命令：

```bash
npm run build      # 生产构建，由服务端单端口托管
npm test           # shared 与 server 测试
npm run typecheck  # 类型检查
npm run check-json -- question_bank/NETEM_English_I/2000.json   # 校验试卷 JSON
```

练习数据保存在 `%LOCALAPPDATA%\ShitiWorkbench\workspaces\default`。页面只与本机 API 通信，服务端没有外联请求；导出报告或使用外部 Agent 复盘时，内容由你主动带出应用。

## Question Bank

试卷内容不是手工录入的。[_规格说明.md](question_bank/NETEM_English_I/_规格说明.md) 定义了 JSON 格式，把年份原卷交给 AI 按规格转换：

```text
规格说明 + 原卷 Markdown
        ↓
<年份>.json
        ↓
check-json 校验
        ↓
放入 question_bank/ 自动扫描入库
        ↓
版本化题库（内容修订生成新版本，已答练习不受影响）
```

真题内容版权归命题机构所有，收录与使用边界见[版权说明](question_bank/NETEM_English_I/_版权与使用说明.md)。

## Project Structure

```
apps/web          网页前端（页面、组件、样式）
apps/server       API 服务：题库扫描、导入校验、练习会话、复盘协议
packages/shared   前后端共享的领域逻辑
question_bank/    转换产出的试卷 JSON
docs/             交互规格、数据契约、复盘协议、验收记录
design/           设计原图与迭代过程
```

## Documentation

| 文档 | 内容 |
|---|---|
| [WHITEPAPER.md](WHITEPAPER.md) | 产品白皮书与阶段规划 |
| [交互与页面规格](docs/01-交互与页面规格.md) | 页面、操作、状态、错误文案 |
| [数据与接口契约](docs/02-数据与接口契约.md) | 实体、判分、计时、HTTP 契约 |
| [Markdown 与 AI 复盘协议](docs/03-Markdown与AI复盘协议.md) | context / review / report 的分工 |
| [外部 Agent 文件协议](docs/05-外部Agent文件协议.md) | 文件驱动复盘契约 |
| [AGENT_HANDOFF.md](AGENT_HANDOFF.md) | 设计阶段交接说明 |

## License

[MIT](LICENSE)。

考研真题内容的著作权归命题机构所有。`question_bank/` 内的转录产物仅限个人学习使用，详见[版权说明](question_bank/NETEM_English_I/_版权与使用说明.md)。
