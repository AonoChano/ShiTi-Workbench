import { useEffect, useMemo, useRef, useState } from 'react';
import { TrendingDown, TrendingUp } from 'lucide-react';

export interface ChartSeries {
  /** 近 30 天每日答题量（下标 0 最早，29 = 今天） */
  counts: number[];
  /** 近 30 天每日客观题正确率（%）；当天没交卷为 null */
  accuracy: Array<number | null>;
}

export default function LearningChart({ series }: { series: ChartSeries }) {
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

  const start = period === '7' ? 23 : 0;
  const window_ = series.counts.length === 30 ? start : Math.max(0, series.counts.length - (period === '7' ? 7 : 30));
  const data = useMemo(() => {
    if (metric === 'count') return series.counts.slice(window_).map((v) => Number(v) || 0);
    return series.accuracy.slice(window_).map((v) => (typeof v === 'number' ? v : 0));
  }, [metric, series, window_]);
  const previous = useMemo<number[]>(() => {
    // 上一个等长窗口（近 30 天序列里：近 7 天的前 7 天；30 天视图没有上一期）
    if (period !== '7') return [];
    if (metric === 'count') return series.counts.slice(16, 23).map((v) => Number(v) || 0);
    return series.accuracy.slice(16, 23).map((v) => (typeof v === 'number' ? v : 0));
  }, [period, metric, series]);
  const maximum = metric === 'count' ? Math.max(10, Math.ceil(Math.max(1, ...data) / 10) * 10) : 100;
  const points = data.map((value, index) => ({ x: 38 + index * ((width - 58) / Math.max(1, data.length - 1)), y: 125 - Math.min(value, maximum) / maximum * 105, value, at: window_ + index }));
  const path = points.reduce((result, point, index) => {
    if (index === 0) return `M ${point.x} ${point.y}`;
    const previousPoint = points[index - 1]!;
    const middle = (previousPoint.x + point.x) / 2;
    return `${result} C ${middle} ${previousPoint.y}, ${middle} ${point.y}, ${point.x} ${point.y}`;
  }, '');
  const averageOf = (values: number[]) => {
    const known = values.filter((v) => v > 0);
    return known.length ? Math.round(known.reduce((sum, value) => sum + value, 0) / known.length) : 0;
  };
  const currentTotal = metric === 'count' ? data.reduce((sum, value) => sum + value, 0) : averageOf(data);
  const previousTotal = previous.length ? (metric === 'count' ? previous.reduce((sum, value) => sum + value, 0) : averageOf(previous)) : 0;
  const change = previousTotal > 0 ? Math.round((currentTotal - previousTotal) / previousTotal * 100) : null;
  const TrendIcon = (change ?? 0) >= 0 ? TrendingUp : TrendingDown;
  const selected = hovered === null ? null : points[hovered];
  const tooltipX = selected ? Math.max(32, Math.min(width - 67, selected.x - 30)) : 0;

  function dayLabel(absoluteIndex: number) {
    const date = new Date();
    date.setDate(date.getDate() - (series.counts.length - 1 - absoluteIndex));
    return `${String(date.getMonth() + 1).padStart(2, '0')}/${String(date.getDate()).padStart(2, '0')}`;
  }

  return <section className="panel trend-panel" aria-label="学习趋势">
    <div className="trend-header"><div><h2>学习趋势</h2><div className="chart-total"><strong>{currentTotal}<span>{metric === 'count' ? '题' : '%'}</span></strong>{change !== null && <span className={`trend-change ${change < 0 ? 'is-negative' : ''}`}><TrendIcon size={12} />{change > 0 ? '+' : ''}{change}%<span>较上期</span></span>}</div></div><div className="chart-controls"><div className="metric-tabs" aria-label="图表指标"><button className={metric === 'count' ? 'is-active' : ''} aria-pressed={metric === 'count'} onClick={() => { setMetric('count'); setHovered(null); }}>答题量</button><button className={metric === 'accuracy' ? 'is-active' : ''} aria-pressed={metric === 'accuracy'} onClick={() => { setMetric('accuracy'); setHovered(null); }}>正确率</button></div><select aria-label="学习趋势时间范围" value={period} onChange={(event) => { setPeriod(event.target.value); setHovered(null); }}><option value="7">近 7 天</option><option value="30">近 30 天</option></select></div></div>
    <div className="chart-visual" ref={chart}><svg viewBox={`0 0 ${width} 154`} preserveAspectRatio="none" role="img" aria-label={`近 ${period} 天${metric === 'count' ? '答题量' : '正确率'}趋势`} onMouseLeave={() => setHovered(null)}>
      <defs><linearGradient id="chart-fill" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#a4c590" stopOpacity=".27" /><stop offset="100%" stopColor="#a4c590" stopOpacity=".01" /></linearGradient></defs>
      {[0, 1, 2, 3].map((line) => <g key={line}><line x1="38" y1={125 - line * 35} x2={width - 15} y2={125 - line * 35} className="chart-gridline" /><text x="23" y={129 - line * 35} textAnchor="end" className="chart-axis">{Math.round(line * maximum / 3)}</text></g>)}
      <path d={`${path} L ${width - 20} 125 L 38 125 Z`} fill="url(#chart-fill)" />
      <path key={`${period}-${metric}`} d={path} fill="none" className="chart-line" />
      {points.map((point, index) => <g key={index}><circle cx={point.x} cy={point.y} r="3.3" className="chart-point" /><circle cx={point.x} cy={point.y} r="14" fill="transparent" tabIndex={0} aria-label={`${dayLabel(point.at)}：${point.value}${metric === 'count' ? ' 题' : '%'}`} onMouseEnter={() => setHovered(index)} onFocus={() => setHovered(index)} onBlur={() => setHovered(null)} /><text x={point.x} y="150" textAnchor="middle" className="chart-axis">{period === '7' || index % 5 === 0 || index === data.length - 1 ? dayLabel(point.at) : ''}</text></g>)}
      {selected && <g className="chart-tooltip" pointerEvents="none"><line x1={selected.x} y1="14" x2={selected.x} y2="125" stroke="#8ea983" strokeDasharray="3 4" /><circle cx={selected.x} cy={selected.y} r="5" fill="#527b49" stroke="white" strokeWidth="2" /><rect x={tooltipX} y={Math.max(0, selected.y - 34)} width="62" height="24" rx="5" fill="#344e39" /><text x={tooltipX + 31} y={Math.max(0, selected.y - 34) + 16} textAnchor="middle" fill="white" fontSize="11">{selected.value}{metric === 'count' ? ' 题' : '%'}</text></g>}
    </svg></div>
    <div className="chart-caption"><span className="legend-dot" />{metric === 'count' ? '每日完成题目数' : '每日答题正确率'}<span>每一点进步，都有迹可循。</span></div>
  </section>;
}
