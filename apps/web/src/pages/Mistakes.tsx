import { useState } from 'react';
import { CheckCircle2, ChevronDown, Lightbulb, NotebookTabs } from 'lucide-react';
import { usePersistedState } from '../hooks';
import { useToast } from '../components/Toast';
import { navigate } from '../router';

interface MistakeEntry {
  id: string;
  area: string;
  title: string;
  picked: string;
  answer: string;
  explanation: string;
  addedAt: string;
}

const seedMistakes: MistakeEntry[] = [
  {
    id: 'demo-mistake-1', area: '阅读理解 · 演示', title: '演示错题：接入判分快照后，这里会自动收录真实错题。',
    picked: 'A', answer: 'B', explanation: '这是界面演示条目。真题练习交卷后，客观题错题将按题目与判分版本自动收录，复习答对或标记掌握后移除。', addedAt: '2026-09-30',
  },
  {
    id: 'demo-mistake-2', area: '完形填空 · 演示', title: '演示错题：错题本接口属于 M3 范围，当前数据仅保存在浏览器。',
    picked: 'B', answer: 'C', explanation: '这是界面演示条目，用于展示错题回顾的完整交互。', addedAt: '2026-09-29',
  },
];

export function Mistakes() {
  const { notify } = useToast();
  const [mistakes, setMistakes] = usePersistedState<MistakeEntry[]>('shiti-mistakes-demo-v1', seedMistakes);
  const [expanded, setExpanded] = useState<string | null>(null);

  return <section className="mistakes-section">
    <div className="mistakes-toolbar">
      <div className="category-tabs">
        <button className="is-active">全部错题 <span>{mistakes.length}</span></button>
      </div>
    </div>
    <div className="mistake-list">
      {mistakes.length ? mistakes.map((mistake, index) => (
        <article className="mistake-row" key={mistake.id}>
          <span className="mistake-index">{String(index + 1).padStart(2, '0')}</span>
          <div className="mistake-main">
            <div className="mistake-meta"><span>{mistake.area}</span><span>收录于 {mistake.addedAt.replace(/-/g, '/')}</span></div>
            <h3>{mistake.title}</h3>
            <div className="mistake-answers"><span>你的答案 <strong className="wrong-text">{mistake.picked}</strong></span><span>正确答案 <strong>{mistake.answer}</strong></span></div>
            <div className="mistake-actions">
              <button className="text-link" onClick={() => setExpanded(expanded === mistake.id ? null : mistake.id)}><Lightbulb size={14} />{expanded === mistake.id ? '收起解析' : '查看解析'}<ChevronDown size={13} className={expanded === mistake.id ? 'rotate-180' : ''} /></button>
              <button className="text-link" onClick={() => navigate('/papers')}>去练习<NotebookTabs size={14} /></button>
              <button className="text-link" onClick={() => { setMistakes((items) => items.filter((item) => item.id !== mistake.id)); notify('已标记掌握，继续拾起新的进步。'); }}><CheckCircle2 size={14} />标记掌握</button>
            </div>
            {expanded === mistake.id && <div className="mistake-explanation"><h4>解析</h4><p>{mistake.explanation}</p><span>正确答案 {mistake.answer}</span></div>}
          </div>
        </article>
      )) : <div className="empty-state"><img className="state-mascot" src="/images/mascots/no_data.png" alt="" /><h3>这一页，都是已经掌握的进步</h3><p>暂时没有待复习错题。去练一组题，让知识记得更牢。</p><button className="button button-primary" onClick={() => navigate('/papers')}>开始新的练习</button></div>}
    </div>
    <p className="demo-note"><NotebookTabs size={14} />错题自动收录属于 M3 范围：交卷判分后将按题目版本聚合真实错题，本页当前为交互演示。</p>
  </section>;
}
