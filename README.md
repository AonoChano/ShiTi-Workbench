# 拾题 · Shiti Workbench

> 本地优先的考研英语真题练习与复盘工作台。做题、判分、专项、错题、报告导出——所有学习数据只存在自己电脑上。

![学习概览](docs/images/overview.png)

## 功能一览

- **真题题库**：1986–2020 年考研英语（一）真题已全量入库（35 份），转换 AI 产出的 JSON 放入题库目录即自动识别；支持按科目、五年年份范围筛选与多种排序
- **训练模式**：整卷练习，材料/选项按原卷排版；完形填空一屏连做、新题型空位回填字母、翻译/写作横线作答区，主观题交卷后进入 AI 评卷流程
- **专项练习**：按大题/题型从全库抽题组卷，材料整组保留、组内保持原卷顺序；完形共享选项组带占用提示
- **草稿同步**：作答实时自动保存（CAS 乐观并发 + 幂等事件队列），关页面、断网都不丢
- **复盘报告**：交卷自动判分生成报告，可导出 Markdown 给任意网页版 AI 复盘，也支持外部 Agent 按文件协议直接编写 review 文件、网页实时可视化
- **学习辅助**：错题本、学习计划与打卡、学习日历、做题趋势图、交互式产品导览

## 技术栈

npm workspaces 单仓三包，前端零重度依赖（除图标库）：

| 包 | 说明 |
|---|---|
| `apps/web` | React 19 + Vite 6 + Tailwind v4 基座，自研组件与鼠尾草绿设计体系 |
| `apps/server` | Fastify 5 + better-sqlite3，题库扫描、导入校验、练习会话、判分与复盘协议 |
| `packages/shared` | 领域纯函数：导入 Schema 校验、判分、报告、协议、ID |

## 快速开始

```bash
npm install        # Node ≥ 20
npm run dev        # 同时启动 API(127.0.0.1:8210) 与网页(127.0.0.1:5173)
```

打开 http://127.0.0.1:5173 即可使用。生产构建 `npm run build` 后由服务端单端口托管。

其他常用脚本：

```bash
npm run check-json -- question_bank/NETEM_English_I/2000.json   # 试卷 JSON 自检（零错误即入库资格）
npm test         # shared + server 全部测试
npm run typecheck
```

学习数据（SQLite）存放在 `%LOCALAPPDATA%\ShitiWorkbench\workspaces\default`，不写进仓库。

## 题库流水线

1. 阅读题库目录下的 [_规格说明.md](question_bank/NETEM_English_I/_规格说明.md)，把年份试卷交给转换 AI 产出 `<年份>.json`（也可手写或用「题库管理 → 手动导入」）
2. 文件放入 `question_bank/NETEM_English_I/` 后被服务端自动扫描入库；内容修订会生成新题目版本，已答过的练习不受影响
3. 真题内容的版权与使用边界见 [题库版权说明](question_bank/NETEM_English_I/_版权与使用说明.md)

## 目录结构

```
apps/web          # 网页前端（页面/组件/样式）
apps/server       # API 服务（含 bank/practice/report/review 服务与迁移）
packages/shared   # 共享领域逻辑与测试
question_bank/    # 转换 AI 产出的试卷 JSON（自动识别入库）
docs/             # 交互规格、数据契约、复盘协议、验收记录
design/           # 设计原图与迭代过程
docs/05/AGENT_HANDOFF.md 等为早期设计阶段文档，范围表述以本 README 为准
```

## 文档索引

| 文档 | 内容 |
|---|---|
| [WHITEPAPER.md](WHITEPAPER.md) | 产品白皮书：目标、需求、阶段规划 |
| [docs/01 交互与页面](docs/01-交互与页面规格.md) | 页面、操作、状态、错误文案、键盘 |
| [docs/02 数据与接口](docs/02-数据与接口契约.md) | 实体、判分、计时、快照、HTTP 契约 |
| [docs/03 Markdown 报告](docs/03-Markdown与AI复盘协议.md) | context/review/report 分工与导出安全 |
| [docs/05 外部 Agent 文件协议](docs/05-外部Agent文件协议.md) | 文件驱动复盘的完整契约 |
| [AGENT_HANDOFF.md](AGENT_HANDOFF.md) | 执行 Agent 交接说明（设计阶段存档） |
| [question_bank 版权说明](question_bank/NETEM_English_I/_版权与使用说明.md) | 真题内容版权与使用边界 |

![专项练习定位高光](docs/images/drill-focus.png)

## 版权

- **代码**：本仓库代码仅供学习交流，未附开源许可证前保留所有权利
- **真题内容**：考研试题著作权归命题机构所有，`question_bank/` 内的转录产物仅限个人学习使用，请勿商用或再分发，详见[版权说明](question_bank/NETEM_English_I/_版权与使用说明.md)
