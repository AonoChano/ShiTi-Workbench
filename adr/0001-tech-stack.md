# ADR 0001 · 技术栈与 M1 范围决策

日期：2026-09-29 · 状态：已采纳（用户开工指令"先做起来"）

## 决策

1. 采用白皮书 §4 推荐形态：npm workspaces 单仓，`packages/shared`（纯领域模块，无 IO）、`apps/server`（Fastify 5 + SQLite）、`apps/web`（React 19 + Vite）。Node 22 LTS 本机已装（v22.15.0 / npm 11.17.0），版本写入 lockfile。
2. SQLite 驱动首选 `better-sqlite3`（同步 API 契合短事务模型；Node 22 有 Windows x64 预编译）。若预编译安装失败，备选 `node:sqlite`（Node 22 需 `--experimental-sqlite`）并另写 ADR，不静默更换。
3. 迁移使用自研轻量 runner（SQL 文件 + 版本表 + 校验和），不引入 ORM/迁移框架；M1 表结构为契约 §2 的子集，字段命名保持一致以便扩展。
4. M1 的报告 Job 使用进程内轮询 Worker（同一 SQLite Job 表语义：租约、重试、去重），ADR 记录与 §10"分进程 Worker"的偏差；M2 拆分时仅改部署不改协议。
5. M1 范围 = 白皮书 §18 M1：JSON 导入 → 训练作答（自动保存/恢复、暂停/继续）→ 幂等提交 → 确定性判分 → 无 AI 完整 Markdown 报告（版本化、字节级可复现）。严格限时、多标签接管、复习队列、备份恢复、AI 归属 M2/M3。
6. 浏览器草稿队列 M1 用 localStorage（容量足够单卷草稿），契约 §5.1 的 IndexedDB 迁移留待 M2，接口形状（action_id / expected_revision / 回执删除）按契约实现。
7. 黄金样本为**原创演示内容**（自写英文短文与题目，非真实真题），遵守白皮书 §16"不内置盗版真题"；用户真实题库通过导入功能进入，不进 Git。
