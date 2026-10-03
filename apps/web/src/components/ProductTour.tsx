import { useEffect, useMemo, useState } from 'react';
import { ArrowRight, Check, ChevronLeft, X } from 'lucide-react';

export interface TourStep { selector: string; title: string; body: string }

const PAD = 9;
const TIP_W = 300;
const TIP_H_ESTIMATE = 224;

/** 交互式产品导览：聚光高亮目标元素，气泡讲解，上一步/跳过/下一步控制。
 *  只保留当前页面上真实可见的目标步骤，目标随窗口滚动/缩放实时跟随。 */
export function ProductTour({ steps, onDone }: { steps: TourStep[]; onDone: () => void }) {
  const active = useMemo(() => steps.filter((s) => {
    const el = document.querySelector(s.selector);
    return !!el && (el as HTMLElement).getBoundingClientRect().width > 0;
  }), [steps]);
  const [idx, setIdx] = useState(0);
  const [rect, setRect] = useState<DOMRect | null>(null);
  const [below, setBelow] = useState(true);

  const safeIdx = Math.min(idx, active.length - 1);
  const step = active[safeIdx];

  useEffect(() => {
    if (!step) return;
    const el = document.querySelector(step.selector) as HTMLElement | null;
    if (!el) return;
    const update = () => {
      const r = el.getBoundingClientRect();
      setRect(r);
      setBelow(window.innerHeight - r.bottom > TIP_H_ESTIMATE + 20 || r.top < TIP_H_ESTIMATE + 20);
    };
    el.scrollIntoView({ block: 'center', behavior: 'auto' });
    update();
    window.addEventListener('resize', update);
    window.addEventListener('scroll', update, true);
    return () => { window.removeEventListener('resize', update); window.removeEventListener('scroll', update, true); };
  }, [step]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onDone(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onDone]);

  if (!step || !rect) return null;
  const last = safeIdx >= active.length - 1;
  const tipTop = below ? Math.min(rect.bottom + 14, window.innerHeight - TIP_H_ESTIMATE) : Math.max(12, rect.top - TIP_H_ESTIMATE - 14);
  const tipLeft = Math.min(Math.max(12, rect.left + rect.width / 2 - TIP_W / 2), window.innerWidth - TIP_W - 12);

  return <div className="tour-root" role="dialog" aria-modal="true" aria-label="功能导览">
    <div className="tour-backdrop" />
    <div className="tour-spotlight" style={{ top: rect.top - PAD, left: rect.left - PAD, width: rect.width + PAD * 2, height: rect.height + PAD * 2 }} />
    <div className="tour-tip" style={{ top: tipTop, left: tipLeft }}>
      <div className="tour-tip-head">
        <span className="tour-step-count">第 {safeIdx + 1} 步 · 共 {active.length} 步</span>
        <button className="icon-button" aria-label="跳过导览" onClick={onDone}><X size={15} /></button>
      </div>
      <h3>{step.title}</h3>
      <p>{step.body}</p>
      <div className="tour-tip-foot">
        <div className="tour-dots">{active.map((_, i) => <i key={i} className={i === safeIdx ? 'on' : ''} />)}</div>
        <div className="tour-actions">
          {safeIdx > 0 && <button className="button button-quiet" onClick={() => setIdx(safeIdx - 1)}><ChevronLeft size={14} />上一步</button>}
          <button className="button button-primary" onClick={() => (last ? onDone() : setIdx(safeIdx + 1))}>{last ? <>完成<Check size={14} /></> : <>下一步<ArrowRight size={14} /></>}</button>
        </div>
      </div>
    </div>
  </div>;
}
