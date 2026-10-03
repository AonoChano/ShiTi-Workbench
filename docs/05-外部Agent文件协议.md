# 05 · 外部 Agent 文件协议与实时复盘

**版本 1.0.0 · 2026-09-29。本文根据用户补充要求制定，是 P0 核心契约。**

> 用户交卷后，在 CC 或类似 Agent Harness 中提出复盘要求。外部 Agent 按格式修改指定文件，网页自动读取并可视化。网页不内置 AI 聊天、模型 SDK、Provider Adapter 或 API Key 管理；用户不需要手工复制 AI 回复。

本文优先于早期设计中关于“粘贴外部 AI 回复”或“网页内 AI 集成”的设想。

## 1. 一句话产品路径

交卷 → 系统生成 `context.md` 与 `review.md` → 用户在外部 Agent 中要求复盘 → Agent 只编辑 `review.md` → 后端监听并校验 → 页面实时显示逐题复盘 → 用户决定是否采纳建议到复习计划。

网页不是启动或托管 Agent 的平台；“复制 Agent 指令”只复制文字，不偷偷执行 shell，不宣称已经向任何 AI 发送数据。用户自己选择 Harness、模型、账号和权限。

## 2. 工作区布局

运行数据位于用户选择的本地工作区，不默认放进源代码仓库。默认建议：`%LOCALAPPDATA%\ShitiWorkbench\workspaces\default`。

```text
<工作区>/
  workspace.sqlite
  assets/
  agent-workspace/
    AGENTS.md
    CLAUDE.md
    attempts/
      <attempt-id>/
        context.md
        context.json
        review.md
        state.json
        assets/
          <受控附件副本或安全相对引用>
        history/
          context-v0001.md
          review-v0001.md
          review-v0002.md
```

- `AGENTS.md`：外部 Agent 操作说明与只允许修改哪些文件的规则。
- `CLAUDE.md`：简短入口，明确让 CC 读取同目录 AGENTS.md；不假设每个 Harness 原生发现 AGENTS.md。
- `context.md`：本次提交的完整题目、材料、答案、评分、思路、时间、证据索引。由系统生成，供 Agent 读取。
- `context.json`：同一上下文的结构化形式，供偏好结构化数据的 Harness 使用。不是独立真相来源。
- `review.md`：**唯一的外部复盘编辑入口**。一份文件同时提供结构化元信息和可阅读分析。
- `state.json`：系统写入的当前上下文版本、最后接受修订、hash、读取状态和校验错误，供 Agent 自检；外部 Agent 不修改。
- `history/`：已接受版本与上下文历史镜像。正式恢复依据还在数据库/备份里，不仅靠此目录。

`context.md/json` 与 `state.json` 均为系统投影；用户或 Agent 误改不能改变真实成绩。系统从数据库核对hash，发现异常时显示错误，允许用户重新生成，不自动相信磁盘上被改过的state.json。

上下文的权威记录为不可变`AgentContextRevision`：固定Submission、GradeRevision、ContextDocument、Schema/renderer版本、MD/JSON完整原字节、各自SHA-256及证据索引。历史恢复取保存的原字节，不用新渲染器重新猜出旧hash。ExternalReviewRevision引用该实体；同名`grade-q03`等证据按所引用的context版本解析，不按最新评分解析。

MD和JSON从同一ContextDocument无损投影。两种格式必须等价包含题干选项、完整材料、完整参考解析、原始思路、信心、标记、答案变更、时段事件、计时、统计和证据；仅格式说明文字可不同。JSON的自报MD摘要不是真实性凭据，数据库另存并核验JSON实际字节摘要，state暴露`current_context_json_sha256`供核对。

### 2.1 文件权限不是沙箱

AGENTS.md 的“只编辑 review.md”是协作规则，不是操作系统强隔离。外部 Agent 若被授予整个账户的权限仍可能改动其他文件。产品要缩小公开目录、保留数据库快照、校验摘要并提示用户限制 Agent 目录权限；不能承诺能阻止已获文件系统权限的恶意进程。

不将整个资料库、浏览器配置、环境变量、Key 或真实个人路径写进上下文。Agent 读取本地文件后可能将内容发往其模型供应商；这取决于外部 Harness，不由网页控制，首次导出需明确告知。

## 3. 用户体验

### 3.1 交卷后

基础结果立即可见；旁边“外部 Agent 复盘”面板显示真实状态：

1. 正在准备上下文。
2. 可开始复盘：`context.md` 已就绪，`review.md` 尚未填写。
3. 外部文件有变化，正在校验。
4. 已读取修订 N，刚刚更新。
5. 文件有问题，仍显示修订 N。
6. 文件被移走，仍显示上次有效结果。
7. 上下文/评分已更新，此复盘基于旧版本。

不能在只创建文件时显示“AI 正在分析”。系统不知道外部 Agent 是否运行，除非已观察到写入；即使写入也只能说明文件更新，不能推断推理进度百分比。

### 3.2 交给 Agent

主按钮“复制 Agent 指令”；次按钮“复制复盘目录”。指令包含明确绝对路径（只在本机 UI 展示/复制，不写进便于外发的报告）、应读的 AGENTS.md/context/state、只写 review.md、完成后检查 state 的要求。

示例文案：

> 请按这个目录的 AGENTS.md，读取本次练习的 context.md 和 state.json，帮我逐题复盘，并按既定格式更新 review.md。不要改原始题目、我的答案或评分。写完检查 state.json 是否接受了新版本。目录：用户当前选择的本机复盘目录。

产品不提供“已发送给 Claude”之类虚假确认。可在支持的原生包装中后续添加打开目录，但 P0 浏览器版只需可靠复制路径与指令，不依赖自定义 URI。

### 3.3 页面自动更新

成功接受新文件后无需刷新页面。保持用户当前题号、展开状态、滚动位置、文本选择；已在阅读的区域更新时显示“本题有新版本”，允许用户点击应用，避免突然跳动。没有交互/选择时可直接替换数据。

顶部显示 `review.md · 修订 N · 更新时间`，每题标“外部 Agent 分析”。未提供模型名时显示“外部 Agent，模型未声明”；producer 字段是自述，不是可信身份认证。

## 4. `review.md` 文件格式

**UTF-8、LF、最多 1MiB。仅一个顶部 YAML frontmatter；使用安全 YAML parser，禁止自定义 tags、锚点/alias、重复 key、多文档 YAML 和任意类型实例化。**

元信息必需字段：

| 字段 | 约束 |
|---|---|
| review_schema_version | `"1.0.0"`，主版本不支持则拒绝 |
| attempt_id | 必须等于该目录归属的 Attempt，不由此字段决定打开哪个目录 |
| context_revision | 正整数，对应系统生成的上下文版本 |
| context_sha256 | 64位小写十六进制，必须与系统保存的 context.md 字节摘要一致 |
| base_revision | 非负整数，必须等于 state 的当前 accepted_revision；用于乐观并发 |
| status | `draft` 或 `complete`；draft 可展示但必须标“未完成” |
| producer | `{kind:"external_agent",name:string,model:string|null}`，均为声明信息 |
| coverage | `{question_ids:[...]}`，题目 ID 唯一且必须属于此 Attempt |
| question_reviews | 每个 coverage 题都有一项 `{question_id,evidence_ids,tags,epistemic_status}` |
| suggested_actions | 数组，最多50项，字段见下 |
| grading_concerns | 数组，疑似答案问题，**不能直接改变分数** |

正文使用稳定的二级标题。UI 将英文技术标题映射为中文栏目；标题下自由写普通 Markdown：

```text
## summary
本次概览。

## q:q01
该题的分析、原文解释、选项辨析。

## q:q03
该题的分析。

## open_questions
需要用户确认的事项。
```

规则：summary 与 open_questions 各出现一次；每个 coverage question_id 对应且只对应一个 `q:<id>` 二级标题；不在 coverage 中的题目不得写入该报告文件。二级标题只允许上述类型；内部可用三级或四级中文标题组织。未知二级标题提示具体行号，而不是默默吞掉。

`complete` 要求 summary 和所有所选题章节非空；open_questions 可写“无”。`draft` 可留待补章节并明确部分完成，但字段结构和 ID 仍需完全合法。

### 4.1 建议与证据

`epistemic_status`：`supported|hypothesis|insufficient_context`。supported 至少包含1个可用 evidence_id；hypothesis 也应提供触发假设的证据，没有证据只可 insufficient_context。

`suggested_actions` 每项：

- `id`：1–64位小写字母/数字/连字符标识，在当前文件内唯一。
- `question_ids`：非空、均属于 coverage。
- `evidence_ids`：非空且属于此次 context 的证据表。
- `text`：具体动作，1–2000字符。
- `acceptance_check`：用户如何判断完成，1–2000字符。
- `suggested_interval_days`：1–365 整数；不直接替用户安排具体日程。

`grading_concerns` 每项为 `{question_id,evidence_ids,reason}`。不接受 `new_score`、`override_key` 等事实修改字段。所有未知字段拒绝，防止 Harness 以为新增字段生效了。

证据 ID 校验仅能证明引用存在，无法证明推理正确；网页仍标外部建议。正文里自己写“用户已确认”不能获得确认权，确认状态只从产品内 DecisionEvent 读取。

## 5. 监听与一致性

### 5.1 后端监听，不能让浏览器直接盯文件

使用后端文件 watcher（推荐成熟跨平台库，具体依赖在开发时核查），仅监听受控 attempts 目录的 `review.md`。浏览器通过同源 SSE `/api/v1/events` 接收复盘事件。不能依赖浏览器 File System Access API 授予长期任意目录权限。

Windows 编辑器常以临时文件+rename 保存，监听目录而不是只绑定原文件 inode。启动时全量核对已登记 Attempt 的文件；只扫描已登记路径，不递归跟随任意外部链接。watcher 丢事件时每5秒核对已登记文件的 mtime/size，必要时算hash；收到 `rescan_required`、服务重启或用户“重新读取”时强制核对。

### 5.2 稳定读取

1. 事件到达后静默窗口 500ms；读取前后各取文件状态，大小/mtime 改变则重新等待。
2. 超出大小上限立即拒绝；临时缺失（rename 窗口）最多宽限2秒。
3. 成功读取完整字节并算 SHA-256；与最后接受文件 hash 相同则 no-op，不增长修订。
4. 解析安全 YAML 和 Markdown AST；校验字段、题目、证据、上下文、base_revision。
5. 只有全部通过才创建不可变 ExternalReviewRevision、存完整字节和解析对象、更新索引。
6. 将新的 accepted_revision/hash/status 原子写入 state.json；推送 SSE；渲染前端安全 Markdown。

“500ms没变”不能保证作者完成写入，所以推荐外部 Agent 使用同目录临时文件、flush/close 后原子 rename；普通直接保存仍支持，写半截的解析错误不会清空旧结果。规范结构完整但语义半成品只能通过 `status:draft` 或 Agent 遵守完整写入协定缓解，不能声称能自动识别所有半成品。

### 5.3 故障原子性

数据库事务记录候选字节、解析结果、accepted_revision与hash后才对外发送成功事件。history/state是可重建投影；若其写入失败标`projection_error`并重试，不把已接受修订丢掉。重启先核对现存投影与数据库保存的最后已知投影摘要：不存在且属于可自动恢复的系统投影，或命中已记录的投影失败恢复任务，才重建；若现存字节不是已知成功/失败版本，视为外部修改，保留原文件、通过API报告异常，用户确认另存后才重建。禁止先无条件覆盖state再检查；恢复期间不从磁盘state恢复权威状态。

临时写入文件必须在同一卷；Windows rename 失败或杀毒暂时占用时有限重试，保留原状态。不要先删除旧 state/review 再重命名导致空窗。系统**不会重写外部正在编辑的 review.md**。

## 6. 谁是事实来源

| 数据 | 权威 | 文件与页面角色 |
|---|---|---|
| 题目/作答/原始思路/计时 | 数据库不可变提交快照 | context 是只读投影 |
| 评分 | GradeRevision | 外部文件只能提出异议 |
| 外部分析内容 | 最后通过校验的 review.md 字节版本 | 数据库存不可变版本和解析索引，页面由该版本渲染 |
| 当前正在编辑但无效的文件 | 磁盘候选 | 不替换上次有效结果 |
| 用户是否采纳建议 | DecisionEvent | 不信任外部文件的“已采纳”自述 |
| 实际复习任务 | ReviewItem/ReviewEvent | 必须经用户产品内确认 |

P0 不提供另一个会直接改相同分析正文的网页编辑器，以免数据库和 Markdown 双向争夺真相。用户可让外部 Agent 再改文件，或者在网页写“我的补充笔记”（单独 UserNote，不冒充外部分析）。

## 7. 并发与修订协议

### 7.1 初始版本

系统创建有格式的 review.md 空模板，并在 state 中记录 `accepted_revision=0`、`review_status="empty"`、初始文件 hash。它不算 Agent 已产出复盘。模板 `base_revision=0`。

### 7.2 每次 Agent 修改

Agent 先读取 state.json，保存其中 accepted_revision 为 N；读取现有 review.md；将新文件 `base_revision=N`，其他身份字段从当前 context state复制；完成后原子保存。

系统在同一个数据库事务内CAS检查：当前accepted_revision仍为N、context_status=ready、agent_context_revision_id/context_revision/context_sha256仍等于候选校验依据，并且该上下文的grade_revision_id等于desired_grade_revision_id，才接受为N+1。任何一项变化均拒绝，不允许“事务外校验context，事务内只比review版本”。

人工改分事务必须立即设置desired_grade_revision_id并将context_status置preparing，再入队上下文生成；此窗口拒绝新review候选并显示“上下文准备中”。新AgentContextRevision生成并发布后原子切换current_context_revision_id和ready。旧复盘仍可读但标过期。系统只更新state.json和历史镜像，**不改回review.md的base_revision**，避免与Agent的写入冲突和自触发循环。

因此下一轮 Agent 必须重新读取 state，不能照抄 review.md 的旧 base_revision。AGENTS 模板明确写这一点；页面的“复制 Agent 指令”也包含“写前读 state”。

相同 hash 重复事件先 no-op；不能因为接受后 base_revision 看起来落后就错误报冲突。

### 7.3 两个 Agent 同时写

两者都基于 N；先通过校验者生成 N+1，后者以 N 提交被拒 `BASE_REVISION_CONFLICT`。界面继续显示 N+1，磁盘上仍保留后者候选，提供候选与最后有效版本差异。数据库/历史已保存 N+1，因此不会因磁盘文件被第二个写者覆盖而丢失。

外部 Agent 必须人工/自行审阅合并后，重读 state，以 N+1 为 base 提交新文件。不得只改版本号而忽略内容冲突。系统不能保证捕获两个完整写入之间短于 watcher 合并窗口的每个候选，因此推荐一个 Attempt 同时只让一个 Agent 编辑；若某一候选从未被观察/接受，不能声称它已保存。

### 7.4 用户采纳与内容更新

采纳记录绑定`review_revision + suggestion_id + normalized_suggestion_hash`。新版本相同ID且相同内容可以显示已有决定；相同ID但内容变化必须重新确认，不能沿用采纳。复习任务创建用独立幂等键，重复点击不会新增重复任务。

摘要算法固定为`suggestion-hash-v1`：构造对象`{hash_schema:"suggestion-hash-v1",question_ids,evidence_ids,text,acceptance_check,suggested_interval_days}`；question_ids/evidence_ids按Unicode码点排序并拒绝重复；字符串统一NFC和LF，不trim、不折叠空白、不删标点；按RFC8785 JCS规范序列化UTF-8，再SHA-256。suggestion_id由独立绑定键校验，不作为语义内容字段；题目、证据、检查标准、间隔改变均必须改变hash。由后端从指定不可变复盘版本计算，客户端传入hash仅作乐观校验，不能授权。测试向量保存在`specs/suggestion-hash-vectors.json`。

接受外部文件是“可展示”，不是“用户赞同”；两者在 UI、API、报告中必须用不同词。

## 8. 上下文更新与缺失

人工改分会生成新的 context_revision 和 context_sha256；保留 `history/context-vNNNN.md`。页面标记旧分析“基于旧评分版本”，不会删除它。Agent 开始前总是读取最新 context/state；提交基于旧上下文的新候选会被拒 `CONTEXT_CHANGED`，需重新核对后编辑。

用户手工移动或删除 review.md：标 `file_missing`，继续显示最后有效结果；可下载最后有效版本或用户确认后重新生成文件。未经确认不直接覆盖用户可能正准备放回的文件。

用户误改 context/state：检测与数据库摘要不一致，明确“系统文件被修改，未改变原始作答”；重新生成是显式用户动作，保留异常文件供用户选择另存，不依赖不可信 state 接受候选。

## 9. 错误诊断

state.json只包含安全诊断：`status,accepted_revision,accepted_sha256,current_context_revision,current_context_sha256,current_context_json_sha256,context_status,observed_file_sha256,last_checked_at,errors[{code,line,column,path,message}],projection_status`。

错误码至少：FILE_MISSING、FILE_TOO_LARGE、INVALID_UTF8、UNSAFE_YAML、DUPLICATE_KEY、SCHEMA_UNSUPPORTED、ATTEMPT_MISMATCH、CONTEXT_CHANGED、BASE_REVISION_CONFLICT、UNKNOWN_QUESTION、UNKNOWN_EVIDENCE、SECTION_MISSING、SECTION_DUPLICATE、UNKNOWN_FIELD、UNSAFE_LINK、WRITE_IN_PROGRESS、PROJECTION_WRITE_FAILED。

例：`第24行 suggested_actions[0].evidence_ids[1] 引用了不存在的 mat-p9。仍显示修订2。` 不打印整个敏感上下文或异常堆栈。status 给 Agent 机器读取，前端同时展示可读解释。

Agent 保存后可用自己的文件读取能力检查 state 是否接受该 hash。它不需要无限轮询；建议最多等待10秒、有界重读，未获得确认时如实告知“文件已写，但网页尚未确认读取”。网站不负责调用/唤醒外部 Agent。

## 10. SSE 与 API 补充

| API | 用途 |
|---|---|
| GET `/attempts/:id/agent-package` | 准备状态、本机目录显示、复制指令内容、当前上下文版本；仅本机会话可见 |
| POST `/attempts/:id/agent-package` | 幂等准备上下文与初始模板；已有 review 不覆盖 |
| GET `/attempts/:id/external-review` | 最后接受版本的解析结果、文件状态、历史版本索引 |
| POST `/attempts/:id/external-review/rescan` | 强制重读已登记路径，不接受任意路径参数 |
| GET `/attempts/:id/external-review/revisions/:revision` | 查看指定有效版本 |
| POST `/attempts/:id/review-decisions` | suggestion引用、内容hash、accept/reject，创建用户决定 |
| GET `/events` | 同源 SSE，事件仅带 IDs/修订/状态，不带整份题目或分析 |

事件类型：`external_review.validated`、`external_review.invalid`、`external_review.missing`、`agent_context.updated`。包含单调 event_id。客户端断线后退避重连（1/2/5/10秒，上限10秒），携带 Last-Event-ID；服务端日志窗口不足时发 `rescan_required`，客户端重新 GET 当前状态。不可依靠永不丢失的内存事件队列。

前台页面每15秒可以轻量状态兜底核对；真正文件变化主要由 watcher 推送。目标：本地稳定写入后 p95 2秒内网页显示新版本，10秒以内给出成功或具体错误。都是待实现的验收预算，不是当前实测。

## 11. 复盘渲染

每题将 metadata + Markdown section 转为：分析正文、引用证据、原因标签、建议动作、评分异议。引用按钮可定位 immutable context 中的段落/答案；未知引用在接受阶段拒绝。

Markdown 禁止原始 HTML、iframe、script、远程图片请求及自动链接预取。允许 http/https 普通链接但明确外部打开；`javascript:`、`file:`、`data:`、任意 shell 链接拒绝。图片只能引用此 package 中已登记的资产 ID 对应相对路径。

不得将 Markdown 中的“采纳”“改分”“删除”标题映射为可自动执行的命令。UI 动作来自固定的 schema 字段和人工点击，不能由文档自定义工具。

## 12. 导出整合

`context.md` 是给 Agent 的输入，不是最终复盘；`review.md` 是外部分析编辑文件；`report.md` 是用户下载的完整合成报告。

新 ReportRevision 固定：Submission + GradeRevision + ExternalReviewRevision + UserNoteRevision + DecisionEvent cutoff + 导出配置。报告注明分析来源和基于的 context revision。若分析已过期，默认提示用户先更新；用户仍可导出旧分析但正文必须标注基准差异。

P0 没有 Agent 结果时仍可下载完整事实报告；不逼用户调用外部模型才能交卷或看分。

## 13. 必须通过的验收

1. 无内置 AI SDK/Key 的情况下，编辑 review.md 后网页自动出现逐题分析与动作卡。
2. 使用 CC 和至少一种普通文本编辑器各完成一次文件更新；接口不绑定某个 Harness 私有格式。
3. 增量写半个 YAML、损坏 frontmatter、未知题号/证据：保留旧显示，指出位置。
4. 使用 VS Code 风格临时文件 rename 保存可被监听；服务重启、丢事件后能补读。
5. 相同文件重复事件不增加修订；state/history 写入不触发自身无限循环。
6. 两个已经分别观察到的候选基于同一 base_revision：只有第一个接受，第二个明确冲突。
7. 改评分后旧 context 候选被拒，已接受旧复盘显示“过期”，不会消失。
8. Agent 在文件里写“得分10/10、用户已采纳”：只能显示为外部文本，正式分仍6/10，任务不自动建立。
9. 改动已采纳建议的内容、保留旧ID：必须重新确认，旧复习任务不被静默改写。
10. review 删除/移走、state误改、context误改、磁盘满、SQLite锁：无原始数据丢失。
11. 存储恢复后 context/review版本/采纳状态一致；导出报告可追溯到接受的字节hash。
12. 390px移动布局也能显示同步状态和错误，但P0不意味着已经支持手机远程连接本机。

13. 候选通过解析后、接受事务前人工改分：接受事务重新校验上下文身份并拒绝；上下文preparing期间不接受旧分析。
14. 停机时改state/context.json，重启先发现外部修改而不是覆盖；历史上下文字节hash可从备份精确恢复。
15. MD/JSON逐字段事实等价；建议只改间隔、检查标准或题目引用时hash必须改变，证据集合换序hash不变。

## 14. 示例文件

见 `examples/agent-workspace/`。这是公开的原创虚构演示包，不是用户真实作答。生产 context_sha256 由实际文件字节生成，不能固定复制示例摘要。示例 state 是离线说明，不会随编辑自动改变，因为本仓库没有运行中的文件监听器。
