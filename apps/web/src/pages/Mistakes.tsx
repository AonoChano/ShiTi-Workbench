import { useEffect, useState } from 'react';
import { CheckCircle2, ChevronDown, Lightbulb, NotebookTabs } from 'lucide-react';
import { useToast } from '../components/Toast';
import { api } from '../api';
import { navigate } from '../router';

interface MistakeEntry {
  id: string;
  area: string;
  title: string;
  picked: string | null;
  answer: string | null;
  explanation: string | null;
  wrong_count: number;
  added_at: string;
}

export function Mistakes() {
  const { notify } = useToast();
  const [mistakes, setMistakes] = useState<MistakeEntry[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [expanded, setExpanded] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    api<MistakeEntry[]>('GET', '/mistakes')
      .then((d) => { if (alive) { setMistakes(d); setLoaded(true); } })
      .catch(() => { if (alive) setLoaded(true); });
    return () => { alive = false; };
  }, []);

  function resolve(id: string) {
    const snapshot = mistakes;
    setMistakes((items) => items.filter((item) => item.id !== id));
    notify('已标记掌握，继续拾起新的进步。');
    api('POST', `/mistakes/${id}/resolve`).catch(() => {
      setMistakes(snapshot);
      notify('没能更新错题状态，请稍后再试');
    });
  }

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
            <div className="mistake-meta"><span>{mistake.area}</span><span>收录于 {mistake.added_at.replace(/-/g, '/')}{mistake.wrong_count > 1 ? ` · 错过 ${mistake.wrong_count} 次` : ''}</span></div>
            <h3>{mistake.title}</h3>
            <div className="mistake-answers"><span>你的答案 <strong className="wrong-text">{mistake.picked ?? '未作答'}</strong></span><span>正确答案 <strong>{mistake.answer ?? '—'}</strong></span></div>
            <div className="mistake-actions">
              {mistake.explanation && <button className="text-link" onClick={() => setExpanded(expanded === mistake.id ? null : mistake.id)}><Lightbulb size={14} />{expanded === mistake.id ? '收起解析' : '查看解析'}<ChevronDown size={13} className={expanded === mistake.id ? 'rotate-180' : ''} /></button>}
              <button className="text-link" onClick={() => navigate('/papers')}>去练习<NotebookTabs size={14} /></button>
              <button className="text-link" onClick={() => resolve(mistake.id)}><CheckCircle2 size={14} />标记掌握</button>
            </div>
            {expanded === mistake.id && mistake.explanation && <div className="mistake-explanation"><h4>解析</h4><p>{mistake.explanation}</p><span>正确答案 {mistake.answer ?? '—'}</span></div>}
          </div>
        </article>
      )) : loaded ? <div className="empty-state"><img className="state-mascot" src="/images/mascots/no_data.png" alt="" /><h3>这一页，都是已经掌握的进步</h3><p>暂时没有待复习错题。去练一组题，让知识记得更牢。</p><button className="button button-primary" onClick={() => navigate('/papers')}>开始新的练习</button></div> : null}
    </div>
  </section>;
}
