# 开发与启动（M1）

## 环境

- Node.js ≥ 22（本机 22.15.0），npm 11。
- 全部命令在仓库根目录执行。

## 安装与验证

```bash
npm install          # workspaces 一次性安装
npm run typecheck    # 三个包的类型检查
npm test             # shared 判分/统计/报告确定性 + server 端到端（黄金样本）
```

## 启动

```bash
npm run dev          # 同时启动 API(127.0.0.1:8210) 与 Vite(127.0.0.1:5173)
```

生产形态：

```bash
npm run build        # 依次构建 shared / server / web
npm start            # Fastify 同源提供 web/dist，仅绑定 127.0.0.1:8210
```

## 数据位置

- 默认工作区：`%LOCALAPPDATA%\ShitiWorkbench\workspaces\default`（`workspace.sqlite` + `assets/` + `reports/`）。
- 题库目录：仓库内 `question_bank/<科目>/<年份>.json`（如 `NETEM_English_I/2000.json`），服务启动与每 5 秒自动扫描入库，文件修订自动出新版本；`SHITI_DATA_DIR`/`SHITI_BANK_DIR`/`SHITI_PORT` 可覆盖。
- 用户练习库不进 Git；`question_bank/` 内的真实真题是否纳入版本管理由用户决定。
- 测试与本地实验可用环境变量覆盖上述路径。

## 首次体验路径（M1 验收路径）

1. 打开 `http://127.0.0.1:5173` → 题库：`question_bank/NETEM_English_I/` 里的试卷 JSON 已自动入库（也可用导入向导上传 `samples/golden-five.json`）。
2. 开始训练 → 作答（可标把握/写思路、暂停/继续）→ 交卷确认 → 自动判分。
3. 报告页核对摘要数字（应与 `docs/02-数据与接口契约.md` §9 一致：得分率 60.0%、客观正确率 60.0%、已答正确率 75.0%）→ 下载 `.md`。
