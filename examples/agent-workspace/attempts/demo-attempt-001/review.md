---
review_schema_version: "1.0.0"
attempt_id: "demo-attempt-001"
context_revision: 1
context_sha256: "c15e6ca539426fb630a0289c549c8aaf7bf7638fc237586ea5e167b22b74fdd1"
base_revision: 0
status: "complete"
producer:
  kind: "external_agent"
  name: "设计Agent编写的虚构演示"
  model: null
coverage:
  question_ids: ["q01", "q02", "q03", "q04", "q05"]
question_reviews:
  - question_id: "q01"
    evidence_ids: ["mat-demo-p1", "ans-q01", "grade-q01"]
    tags: ["证据对应"]
    epistemic_status: "supported"
  - question_id: "q02"
    evidence_ids: ["mat-demo-p1", "ans-q02", "grade-q02"]
    tags: ["猜对", "需要回访"]
    epistemic_status: "supported"
  - question_id: "q03"
    evidence_ids: ["mat-demo-p2", "mat-demo-p3", "ans-q03", "grade-q03", "annotation-q03-1"]
    tags: ["范围扩大", "证据定位"]
    epistemic_status: "supported"
  - question_id: "q04"
    evidence_ids: ["mat-demo-p3", "ans-q04", "grade-q04"]
    tags: ["正确但不确定"]
    epistemic_status: "supported"
  - question_id: "q05"
    evidence_ids: ["mat-demo-p2", "ans-q05", "grade-q05"]
    tags: ["未答", "原因待确认"]
    epistemic_status: "supported"
suggested_actions:
  - id: "scope-q03"
    question_ids: ["q03"]
    evidence_ids: ["mat-demo-p2", "ans-q03"]
    text: "圈出P2限制范围的词，并把A改写成与原文一致的非绝对表述。"
    acceptance_check: "明确说出one group不等于every community，并去掉无依据的always。"
    suggested_interval_days: 1
  - id: "locate-q02"
    question_ids: ["q02"]
    evidence_ids: ["mat-demo-p1", "ans-q02"]
    text: "不看选项，重新写出careful readers会询问什么，再定位到原句。"
    acceptance_check: "回答包含研究参与者，并能定位P1末句。"
    suggested_interval_days: 1
  - id: "paraphrase-q04"
    question_ids: ["q04"]
    evidence_ids: ["mat-demo-p3", "ans-q04"]
    text: "用自己的英文改写matching each claim to the evidence，再核对D。"
    acceptance_check: "保留主张与支持证据的对应关系，不把certainty当目标。"
    suggested_interval_days: 1
  - id: "retry-q05"
    question_ids: ["q05"]
    evidence_ids: ["mat-demo-p2", "ans-q05"]
    text: "在不看参考答案的重做界面完成Q5，并补一句上次未答的实际原因。"
    acceptance_check: "提交一个答案及理由；未答原因可以是仍无法确定，不强行归因。"
    suggested_interval_days: 1
grading_concerns: []
---

## summary

**这是虚构演示复盘，不是用户真实学习诊断。** 本轮5题，3题正确、1题答错、1题未答，得分6/10；其中Q2为猜对，Q4答对但不确定，因此不能只看分数认为这两题已经稳定掌握。

优先处理Q3的范围判断，再回访Q2和Q4的证据定位，最后在不看答案的状态下重新完成Q5。下方所有动作都只是建议，当前没有任何建议被用户采纳。

本分析基于context_revision=1；题库参考答案在本次材料内有对应支持，未提出改分请求。该结论仅适用于这五道原创演示题，不推广到整体英语能力。

## q:q01

### 事实与自述

你选择B，参考答案B，得到2/2分；当时记录“确定”，并写下“标题可能把小研究说成普遍规律”。依据：`ans-q01`、`grade-q01`。

### 为什么B有依据

P1的“small study”与“universal rule”形成范围反差。B的“limited findings sound universal”保留了这个反差，也保留may而非always。依据：`mat-demo-p1`。

### 保留的做法

先明确原文范围，再检查选项是否扩大范围。这道题的思路与证据一致。仅一次答对不能证明长期掌握，不需要额外重复做大量同题来获得虚假的熟练感。

## q:q02

### 事实与不确定性

你选C且正确，但自报“猜测”，没有记录思路。可以确认结果和信心不一致，不能确认究竟是不认识词、定位慢还是随机选择。依据：`ans-q02`、`grade-q02`。

### 原文定位

P1末句直接写出“ask who took part in the research”，与C一致。依据：`mat-demo-p1`。

### 建议

先遮住选项，自己复述careful readers的问题，再回原文定位。这样可检查是否真正理解，而不只是认出重复词。结构化建议为`locate-q02`，尚未采纳。

## q:q03

### 发生了什么

最终答案A，参考答案B，0/2分；轨迹为未答→B→A。当时自报不确定，并记录“我把 one group 理解成了普遍结论，想再核对一次”。依据：`ans-q03`、`grade-q03`。

### 逐项辨析

- **A：** always和every community把适用范围扩到所有群体，但P2只说one group，并明确without explaining every community。该选项过度概括。
- **B：** “may change when more evidence appears”对应“More evidence can change an early conclusion”，为直接同义转述。
- **C：** 原文没有要求结论替代原始研究。
- **D：** 原文没有说结论只有确定时才有用，P3还反对把阅读当寻找确定性的活动。

主要依据：`mat-demo-p2`；D的辅助辨析另引用`mat-demo-p3`。两处证据均已在本题元信息中登记。

### 为什么值得复盘

用户已高亮one group，却仍提交A，因此“找到关键词”与“正确限制推论范围”是不同步骤。可以建议加强范围核对，但不能断言改选原因就是粗心；记录并未给出明确动机。依据：`annotation-q03-1`、`ans-q03`。

### 最小行动

圈出one、every、always，分别说明哪个来自原文、哪个来自选项；把A改成不扩大范围的陈述。结构化建议`scope-q03`，尚未采纳。

## q:q04

### 事实

你选D，2/2分，但自报不确定并标记待查。原始思路已提到结论和证据对应。依据：`ans-q04`、`grade-q04`。

### 证据

P3末句把good reading定义为matching each claim to the evidence。D保留相同关系；不能把被not否定的certainty选作目标。依据：`mat-demo-p3`。

### 建议

用一句自己的英文复述该关系，再解释D为什么成立。这能检查是否理解句意，而不是只在字面上匹配。建议`paraphrase-q04`，尚未采纳。

## q:q05

### 事实边界

没有保存的答案，依规则计0分；记录显示在本题停留80秒，但没有思路和信心。时间不能证明不会做，也不能证明时间不够。依据：`ans-q05`、`grade-q05`。

### 原文对应

one group与every community的对比强调适用范围有限，对应A。依据：`mat-demo-p2`。

### 建议

进入隐藏答案的重做界面完成此题。再由用户确认上次未答的实际原因；若不记得就写无法确定，不补造理由。建议`retry-q05`，尚未采纳。

## open_questions

1. Q3从B改为A时，有没有具体的一句话或词触发改选？记录目前无法确认。
2. Q5未答是主动跳过、忘记提交、时间不足，还是其他原因？不要只根据80秒推断。
3. 是否采纳这四个复习建议？网页应等待用户点击确认；本文件不能替用户决定。
