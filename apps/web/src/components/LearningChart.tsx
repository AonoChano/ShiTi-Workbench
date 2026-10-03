import { useEffect, useMemo, useRef, useState } from 'react';
import { TrendingDown, TrendingUp } from 'lucide-react';

export default function LearningChart({ dailyCount, todayAccuracy }: { dailyCount: number; todayAccuracy: number }) {
  const [period, setPeriod] = useState('7');
  const [metric, setMetric] = useState<'count' | 'accuracy'>('count');
  const [hovered, setHovered] = useState<number | null>(null);
  const [width, setWidth] = useState(700);
  const chart = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const element = chart.current;
    if (!element) return;
    const measure = () => setWidth(Math.max(240, Math.round(element.getBoundingClientRect().width)));
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  const data = useMemo(() => {
    const counts = period === '7' ? [12, 18, 14, 22, 16, 25, dailyCount] : Array.from({ length: 30 }, (_, index) => 7 + (index * 7 % 13) + Math.floor(index / 4));
    const accuracy = period === '7' ? [72, 78, 74, 82, 79, 88, 84] : Array.from({ length: 30 }, (_, index) => 63 + (index * 3 % 12) + Math.floor(index / 2));
    counts[counts.length - 1] = dailyCount;
    accuracy[accuracy.length - 1] = todayAccuracy;
    return metric === 'count' ? counts : accuracy;
  }, [period, metric, dailyCount, todayAccuracy]);
  const maximum = metric === 'count' ? Math.ceil(Math.max(30, ...data) / 30) * 30 : 100;
  const points = data.map((value, index) => ({ x: 38 + index * ((width - 58) / (data.length - 1)), y: 125 - value / maximum * 105, value }));
  const path = points.reduce((result, point, index) => {
    if (index === 0) return `M ${point.x} ${point.y}`;
    const previous = points[index - 1];
    const middle = (previous.x + point.x) / 2;
    return `${result} C ${middle} ${previous.y}, ${middle} ${point.y}, ${point.x} ${point.y}`;
  }, '');
  const total = metric === 'count' ? data.reduce((sum, value) => sum + value, 0) : Math.round(data.reduce((sum, value) => sum + value, 0) / data.length);
  const comparison = metric === 'count' ? period === '7' ? 101 : 460 : 73;
  const change = Math.round((total - comparison) / comparison * 100);
  const TrendIcon = change >= 0 ? TrendingUp : TrendingDown;
  const selected = hovered === null ? null : points[hovered];
  const tooltipX = selected ? Math.max(32, Math.min(width - 67, selected.x - 30)) : 0;

  function dayLabel(index: number) {
    const date = new Date();
    date.setDate(date.getDate() - (data.length - 1 - index));
    return `${String(date.getMonth() + 1).padStart(2, '0')}/${String(date.getDate()).padStart(2, '0')}`;
  }

  return <section className="panel trend-panel" aria-label="学习趋势">
    <div className="trend-header"><div><h2>学习趋势</h2><div className="chart-total"><strong>{total}<span>{metric === 'count' ? '题' : '%'}</span></strong><span className={`trend-change ${change < 0 ? 'is-negative' : ''}`}><TrendIcon size={12} />{change > 0 ? '+' : ''}{change}%<span>较上期</span></span></div></div><div className="chart-controls"><div className="metric-tabs" aria-label="图表指标"><button className={metric === 'count' ? 'is-active' : ''} aria-pressed={metric === 'count'} onClick={() => { setMetric('count'); setHovered(null); }}>答题量</button><button className={metric === 'accuracy' ? 'is-active' : ''} aria-pressed={metric === 'accuracy'} onClick={() => { setMetric('accuracy'); setHovered(null); }}>正确率</button></div><select aria-label="学习趋势时间范围" value={period} onChange={(event) => { setPeriod(event.target.value); setHovered(null); }}><option value="7">近 7 天</option><option value="30">近 30 天</option></select></div></div>
    <div className="chart-visual" ref={chart}><svg viewBox={`0 0 ${width} 154`} preserveAspectRatio="none" role="img" aria-label={`近 ${period} 天${metric === 'count' ? '答题量' : '正确率'}趋势`} onMouseLeave={() => setHovered(null)}>
      <defs><linearGradient id="chart-fill" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#a4c590" stopOpacity=".27" /><stop offset="100%" stopColor="#a4c590" stopOpacity=".01" /></linearGradient></defs>
      {[0, 1, 2, 3].map((line) => <g key={line}><line x1="38" y1={125 - line * 35} x2={width - 15} y2={125 - line * 35} className="chart-gridline" /><text x="23" y={129 - line * 35} textAnchor="end" className="chart-axis">{Math.round(line * maximum / 3)}</text></g>)}
      <path d={`${path} L ${width - 20} 125 L 38 125 Z`} fill="url(#chart-fill)" />
      <path key={`${period}-${metric}`} d={path} fill="none" className="chart-line" />
      {points.map((point, index) => <g key={index}><circle cx={point.x} cy={point.y} r="3.3" className="chart-point" /><circle cx={point.x} cy={point.y} r="14" fill="transparent" tabIndex={0} aria-label={`${dayLabel(index)}：${point.value}${metric === 'count' ? '题' : '%'}`} onMouseEnter={() => setHovered(index)} onFocus={() => setHovered(index)} onBlur={() => setHovered(null)} /><text x={point.x} y="150" textAnchor="middle" className="chart-axis">{period === '7' || index % 5 === 0 || index === data.length - 1 ? dayLabel(index) : ''}</text></g>)}
      {selected && <g className="chart-tooltip" pointerEvents="none"><line x1={selected.x} y1="14" x2={selected.x} y2="125" stroke="#8ea983" strokeDasharray="3 4" /><circle cx={selected.x} cy={selected.y} r="5" fill="#527b49" stroke="white" strokeWidth="2" /><rect x={tooltipX} y={Math.max(0, selected.y - 34)} width="62" height="24" rx="5" fill="#344e39" /><text x={tooltipX + 31} y={Math.max(0, selected.y - 34) + 16} textAnchor="middle" fill="white" fontSize="11">{selected.value}{metric === 'count' ? ' 题' : '%'}</text></g>}
    </svg></div>
    <div className="chart-caption"><span className="legend-dot" />{metric === 'count' ? '每日完成题目数' : '每日答题正确率'}<span>每一点进步，都有迹可循。</span></div>
  </section>;
}