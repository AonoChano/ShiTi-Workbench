import { useEffect, useState } from 'react';
import { ArrowRight, Clock3, Database, LayoutDashboard, NotebookTabs, Sparkles, Target } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { api } from '../api';
import { useToast } from '../components/Toast';
import { navigate } from '../router';
import { clientInstanceId } from './practiceShared';

interface Facet { label: string; type: string; count: number; sections: string[] }

const TYPE_LABEL: Record<string, string> = { single_choice: '单选', multiple_choice: '多选', true_false: '判断', fill_blank: '填空', free_text: '主观题' };
const TYPE_EN: Record<string, string> = { single_choice: 'CHOICE', multiple_choice: 'MULTI', true_false: 'TRUE/FALSE', fill_blank: 'BLANKS', free_text: 'WRITTEN' };

const COUNT_OPTIONS: Array<{ label: string; value: number | null }> = [
  { label: '5 题', value: 5 },
  { label: '10 题', value: 10 },
  { label: '20 题', value: 20 },
  { label: '全部', value: null },
];

export function Drill() {
  const { notify } = useToast();
  const [facets, setFacets] = useState<Facet[] | null>(null);
  const [counts, setCounts] = useState<Record<string, number | null>>({});
  const [busy, setBusy] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  // 概览「按题型练习」跳转过来的定位高光
  const [focusKey, setFocusKey] = useState<string | null>(null);

  useEffect(() => {
    api<{ facets: Facet[] }>('GET', '/practice/facets').then((r) => setFacets(r.facets)).catch((e) => setErr((e as Error).message));
  }, []);

  // 消费概览带过来的题型名（StrictMode 双跑下第二次读不到 key 会静默跳过，无害）
  useEffect(() => {
    if (!facets) return;
    let focusName: string | null = null;
    try { focusName = sessionStorage.getItem('shiti-drill-focus'); sessionStorage.removeItem('shiti-drill-focus'); } catch { /* 隐私模式忽略 */ }
    if (!focusName) return;
    const target = facets.find((f) => f.label === focusName);
    if (!target) return;
    setFocusKey(key(target));
  }, [facets]);

  // 高光滚动定位 + 定时消退：挂在 focusKey 上，StrictMode 双跑也会重新挂定时器
  useEffect(() => {
    if (!focusKey) return;
    document.querySelector('.specialty-module.is-focus')?.scrollIntoView({ block: 'center', behavior: 'auto' });
    const clear = setTimeout(() => setFocusKey(null), 5200);
    return () => clearTimeout(clear);
  }, [focusKey]);

  function key(f: Facet) { return `${f.sections.join(',')}|${f.type}`; }

  async function start(f: Facet) {
    const k = key(f);
    setBusy(k);
    try {
      const r = await api<{ attempt_id: string; question_count: number }>('POST', '/attempts/practice', { sections: f.sections, type: f.type, count: counts[k] ?? null });
      navigate(`/practice/${r.attempt_id}`);
    } catch (e) {
      notify((e as Error).message);
      setBusy(null);
    }
  }

  if (err) return <div className="report-card state-error-line" role="alert"><img className="state-mascot" src="/images/mascots/error.png" alt="" /><span>加载失败：{err}</span></div>;
  if (facets === null) return <div style={{ color: '#9aa88b', fontSize: 12 }}>加载中…</div>;

  const iconFor = (i: number): LucideIcon => [Target, LayoutDashboard, NotebookTabs, Sparkles, Database][i % 5];

  return <section>
    <div className="specialty-intro"><span className="eyebrow">ONE FOCUS AT A TIME</span><h2>把薄弱点，练成得分点。</h2><p>从已入库真题中抽取同一大题的题目组成一组练习：材料完整保留、共享的选项组会提示占用情况，交卷后同样生成复盘报告。</p></div>
    {facets.length === 0 ? <div className="empty-state"><img className="state-mascot" src="/images/mascots/no_data.png" alt="" /><h3>题库还没有可练的题目</h3><p>先到真题题库确认试卷已入库，再来开始专项训练。</p><button className="button button-primary" onClick={() => navigate('/papers')}>去真题题库</button></div>
      : <div className="specialty-grid">
        {facets.map((f, i) => {
          const k = key(f);
          const Icon = iconFor(i);
          const chosen = counts[k] ?? null;
          const capped = COUNT_OPTIONS.filter((o) => o.value === null || o.value <= f.count);
          return <div className={`specialty-module sage${k === focusKey ? ' is-focus' : ''}`} key={k}>
            <div className="specialty-top"><span className="category-icon sage"><Icon size={21} strokeWidth={1.7} /></span><span>0{i + 1}</span></div>
            <span className="specialty-english">{TYPE_EN[f.type] ?? 'DRILL'}{f.sections.length > 1 ? ` · ${f.sections.length} 种卷型` : ''}</span>
            <h2>{f.label}</h2>
            <p>{TYPE_LABEL[f.type] ?? f.type} · 题库共 {f.count} 题</p>
            <div className="specialty-bottom">
              <span><Clock3 size={14} />
                <select aria-label="练习题数" value={chosen === null ? 'all' : String(chosen)} onChange={(e) => setCounts((prev) => ({ ...prev, [k]: e.target.value === 'all' ? null : Number(e.target.value) }))}>
                  {capped.map((o) => <option key={o.label} value={o.value === null ? 'all' : String(o.value)}>{o.label}</option>)}
                </select>
              </span>
              <button className="text-link drill-start" disabled={busy === k} onClick={() => void start(f)}>{busy === k ? '正在组卷…' : '开始练习'}<ArrowRight size={14} /></button>
            </div>
          </div>;
        })}
      </div>}
    <p className="demo-note"><Sparkles size={14} />抽题尽量保留完整材料；单篇材料超过所选题数时，取该材料靠前的题目。每次练习固定抽到的题目版本，交卷后可导出报告或交给外部 Agent 复盘。</p>
  </section>;
}
