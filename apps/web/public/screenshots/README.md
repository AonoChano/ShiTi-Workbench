# 截图占位（S1–S5）

把 1440×900 的实机截图放到这个目录，文件名与下表一致即可，页面会自动显示；文件不存在时显示占位框。
每张图在代码里的使用位置：全局搜索 `SCREENSHOT-PLACEHOLDER:S1` … `SCREENSHOT-PLACEHOLDER:S5`。
清单与文案在 `src/config/screenshots.ts`。

| 占位 | 文件名 | 内容 | 使用位置 |
| --- | --- | --- | --- |
| S1 | `home-overview.png` | 学习概览整页 | `src/sections/Features.tsx`（第四行 · Overview） |
| S2 | `home-practice.png` | 答题页 | `src/sections/Features.tsx`（第一行 · Practice） |
| S3 | `home-report.png` | 复盘报告 | `src/sections/Features.tsx`（第二行 · Review） |
| S4 | `home-library.png` | 真题题库 | `src/sections/Features.tsx`（第三行 · Library） |
| S5 | `home-login.png` | 登录页 | `src/sections/DesignNotes.tsx` |

建议导出 PNG，宽 1440 即可（画框按 16:10 裁切，顶部对齐）。
