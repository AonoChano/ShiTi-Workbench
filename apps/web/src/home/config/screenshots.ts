/**
 * 【截图占位清单】—— 与 UI-STYLE-ANALYSIS.md 第 11 节的 S1–S5 一一对应。
 *
 * 替换方式：
 *   把 1440×900 的实机截图放进 public/screenshots/，文件名与下方 file 字段一致即可，页面会自动显示；
 *   文件不存在时显示占位框（不会出现破图）。
 *
 * 定位方式：
 *   全局搜索 "SCREENSHOT-PLACEHOLDER:S1" … "SCREENSHOT-PLACEHOLDER:S5"，可以找到每张图在页面里的使用位置。
 */
export const SCREENSHOTS = Object.freeze({
  S1: Object.freeze({
    id: "S1",
    file: "home-overview.png",
    title: "学习概览整页",
    bar: "拾题 · 学习概览",
    alt: "拾题学习概览页：hero 插画区、四个题型入口卡、学习趋势折线图，右栏是今日目标与学习日历",
    note: "信息密而不挤；所有面板是「一叠纸」的边框分层；右栏辅助信息成列。",
  }),
  S2: Object.freeze({
    id: "S2",
    file: "home-practice.png",
    title: "答题页",
    bar: "拾题 · 答题",
    alt: "拾题答题页：左栏衬线试卷材料与荧光笔标记，右栏题目与横线作答区，右侧可折叠的题号导航",
    note: "sans / serif 双轨制在同一屏内的分界；横线作答区的「纸上写字」隐喻。",
  }),
  S3: Object.freeze({
    id: "S3",
    file: "home-report.png",
    title: "复盘报告",
    bar: "拾题 · 复盘报告",
    alt: "拾题复盘报告页：判分聚合、逐题对错与用时、外部 AI 复盘意见",
    note: "数据呈现仍是「纸面批注」气质，错误信息走陶土色而非红色。",
  }),
  S4: Object.freeze({
    id: "S4",
    file: "home-library.png",
    title: "真题题库",
    bar: "拾题 · 题库",
    alt: "拾题真题题库：35 份年份卷列表，年份范围筛选、科目筛选与收藏",
    note: "列表是「整块白卡内部画分隔线」；年份号是 Georgia 大数字。",
  }),
  S5: Object.freeze({
    id: "S5",
    file: "home-login.png",
    title: "登录页",
    bar: "拾题 · 登录",
    alt: "拾题登录页：左侧扉页试卷插画与答题卡珠子，右侧登录表单",
    note: "语义令牌化后的设计系统完成度参照：扉页试卷、答题卡珠子、荧光笔标记。",
  }),
});

export type ScreenshotId = keyof typeof SCREENSHOTS;

/** 截图的实际地址：public/screenshots/<file> */
export const screenshotSrc = (id: ScreenshotId) => `/screenshots/${SCREENSHOTS[id].file}`;
