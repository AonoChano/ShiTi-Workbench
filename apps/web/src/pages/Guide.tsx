import { ChevronDown, Lightbulb } from 'lucide-react';

const guides = [
  { title: '阅读理解，从读懂逻辑开始', text: '先在限时状态下独立完成一篇文章，再回到原文精读。不要一开始就逐词翻译，试着先找到每段的中心句、转折关系与作者态度。核对答案时，关注正确选项怎样改写原文，也要弄清错误选项为什么看起来很有迷惑性。', tip: '小建议：每天一篇，留出与做题同样长的时间复盘。' },
  { title: '错题复盘，不只是记住答案', text: '把失误分成三类：词句没读懂、定位不准确、逻辑判断偏差。针对不同原因采取不同方法，比反复背正确选项更有效。隔几天再次独立作答，能解释每个选项的依据，才算真正掌握。', tip: '小建议：用“为什么选它，为什么不选其他项”检验自己。' },
  { title: '学习计划，小而稳定更有力量', text: '从每天能完成的任务量开始，为阅读、词汇和输出练习留出固定时段。计划中也要留白，让难题复盘和休息有空间。偶尔没有完成不代表失败，调整之后再次开始，持续积累就是进步。', tip: '小建议：先设定 20 道题的小目标，再根据实际节奏调整。' },
  { title: '翻译与写作，让表达回到语境', text: '翻译先找句子主干，再识别从句和修饰关系，最后检查中文是否自然。写作不必追求生僻词，多积累能够灵活迁移的表达，做到结构清楚、信息完整、语法准确。写完后留时间检查连接词与时态。', tip: '小建议：每周写一篇短文，用自己的语言重新表达范文。' },
];

export function Guide() {
  return <section className="guide-section">
    <div className="guide-title"><span className="eyebrow">A GUIDE TO YOUR JOURNEY</span><h2>慢慢来，比较快。</h2><p>备考方法可以很多，但适合自己的才最重要。</p></div>
    {guides.map((guide, index) => <details className="guide-item" key={guide.title} open={index === 0}>
      <summary><span>0{index + 1}</span><h3>{guide.title}</h3><ChevronDown size={18} /></summary>
      <div className="guide-answer"><p>{guide.text}</p><span><Lightbulb size={15} />{guide.tip}</span></div>
    </details>)}
  </section>;
}
