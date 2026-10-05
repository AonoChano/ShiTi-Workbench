import { useEffect, useState } from 'react';
import { ArrowRight, BookOpen, CalendarDays, Check, ChevronRight, Flame, Sprout } from 'lucide-react';
import { CategoryIcon } from '../components/CategoryIcon';
import LearningChart from '../components/LearningChart';
import StudyCalendar from '../components/StudyCalendar';
import { useToast } from '../components/Toast';
import { categories, daysAgo, localDate } from '../model';
import type { StudyTask } from '../model';
import { useProfile } from '../profile';
import { api } from '../api';
import { navigate } from '../router';

interface RecentItem {
  attempt_id: string;
  title: string;
  state: string;
  updated_at: string;
  submitted_at: string | null;
  total: number | null;
  correct: number | null;
  total_graded: number | null;
  minutes: number | null;
}

interface OverviewData {
  daily: { date: string; count: number; target: number };
  checkins: string[];
  learning_dates: string[];
  series: { counts: number[]; accuracy: Array<number | null> };
  recent: RecentItem[];
}

function getStreak(dates: string[]) {
  let offset = dates.includes(localDate()) ? 0 : 1;
  let streak = 0;
  while (dates.includes(daysAgo(offset))) { streak += 1; offset += 1; }
  return streak;
}

function recentDateLabel(iso: string) {
  const date = iso.slice(0, 10);
  return date === localDate() ? '今天' : date === daysAgo(1) ? '昨天' : date.slice(5).replace('-', '/');
}

export function Overview() {
  const { notify } = useToast();
  const { profile } = useProfile();
  const [overview, setOverview] = useState<OverviewData | null>(null);
  const [tasks, setTasks] = useState<StudyTask[]>([]);
  const [selectedDate, setSelectedDate] = useState(localDate());
  const [loadError, setLoadError] = useState(false);

  useEffect(() => {
    let alive = true;
    api<OverviewData>('GET', '/overview').then((d) => { if (alive) setOverview(d); }).catch(() => { if (alive) setLoadError(true); });
    api<StudyTask[]>('GET', '/tasks').then((d) => { if (alive) setTasks(d); }).catch(() => {});
    return () => { alive = false; };
  }, []);

  if (loadError) {
    return <div className="empty-state"><img className="state-mascot" src="/images/mascots/error.png" alt="" /><h3>概览暂时打不开</h3><p>本地服务可能还没就绪，稍等一下再刷新试试。</p></div>;
  }
  if (!overview) return <div className="page-enter" />;

  const today = localDate();
  const dailyCount = overview.daily.count;
  const dailyTarget = profile.dailyTarget || overview.daily.target;
  const checkedIn = overview.checkins.includes(today);
  const streak = getStreak([...overview.checkins, ...overview.learning_dates]);
  const learningDates = [...new Set([...overview.checkins, ...overview.learning_dates])];
  const dailyPercentage = Math.min(100, Math.round(dailyCount / dailyTarget * 100));

  function checkIn() {
    if (checkedIn) return;
    api<{ dates: string[] }>('POST', '/checkins', { date: today })
      .then((d) => { setOverview((prev) => prev ? { ...prev, checkins: d.dates } : prev); notify('今日打卡成功！你的坚持，值得被记录。'); })
      .catch(() => notify('打卡没成功，请稍后再试'));
  }

  // 按题型练习：跳转专项页并高光定位对应卡片（不直接开始组卷）
  function focusDrill(name: string) {
    try { sessionStorage.setItem('shiti-drill-focus', name); } catch { /* 隐私模式忽略 */ }
    navigate('/drill');
  }

  function toggleTask(id: string) {
    const target = tasks.find((task) => task.id === id);
    if (!target) return;
    setTasks((items) => items.map((task) => task.id === id ? { ...task, done: !task.done } : task));
    api('PATCH', `/tasks/${id}`, { done: !target.done }).catch(() => {
      setTasks((items) => items.map((task) => task.id === id ? { ...task, done: target.done } : task));
      notify('没能更新这项计划，请稍后再试');
    });
  }

  return <>
    <div className="overview-layout">
      <div className="overview-main">
        <section className="study-feature"><div className="feature-copy"><span className="feature-eyebrow"><span />拾题 · 每一道题，都算数</span><h2>每天拾一点，<br />离梦想近一点。</h2><p>不必一口气走很远，保持前进就好。</p><button className="button button-primary" onClick={() => navigate('/papers')}>开始今日练习<ArrowRight size={16} /></button><span className="continue-detail">真题题库持续更新中<span>新试卷会自动加入</span></span></div><img className="study-books" src="/images/study-books.png" alt="鼠尾草绿书籍与铅笔组成的安静学习场景" /></section>
        <section className="quick-practice"><div className="section-heading"><h2>按题型练习</h2><button className="text-link" onClick={() => navigate('/drill')}>去专项练习<ChevronRight size={14} /></button></div><div className="practice-grid">{categories.map((category) => <button className={`module-card ${category.color}`} key={category.id} onClick={() => focusDrill(category.name)}><CategoryIcon category={category.id} /><ArrowRight size={15} className="module-arrow" /><strong>{category.name}</strong><span>{category.id === 'reading' ? '读懂每一个细节' : category.id === 'cloze' ? '找到语境的线索' : category.id === 'translation' ? '拆解每一个长句' : '写出清晰的表达'}</span></button>)}</div></section>
        <LearningChart series={overview.series} />
      </div>
      <aside className="overview-aside">
        <section className="panel goal-panel">
          <div className="section-heading"><h2>今日目标</h2></div>
          <div className="goal-content"><div className="goal-ring"><svg viewBox="0 0 110 110" aria-hidden="true"><circle cx="55" cy="55" r="44" fill="none" stroke="#edf0e8" strokeWidth="7" /><circle className="goal-progress" cx="55" cy="55" r="44" fill="none" stroke="#779760" strokeWidth="7" strokeLinecap="round" strokeDasharray="276.46" strokeDashoffset={276.46 * (1 - dailyPercentage / 100)} transform="rotate(-90 55 55)" /></svg><div><strong>{dailyCount}<span>/{dailyTarget}</span></strong><span>今日已完成</span></div></div><div className="goal-copy"><strong>{dailyCount >= dailyTarget ? '今天的目标达成啦' : `再拾 ${dailyTarget - dailyCount} 题`}</strong><span>{dailyCount >= dailyTarget ? '每一份坚持，都有意义。' : '就完成今天的小目标'}</span><button className="text-link" onClick={() => navigate('/papers')}>继续积累<ArrowRight size={12} /></button></div></div>
          <div className="goal-bottom"><span><Flame size={15} />已连续学习 <strong>{streak}</strong> 天</span><button className={`checkin-button ${checkedIn ? 'is-checked' : ''}`} disabled={checkedIn} onClick={checkIn}>{checkedIn ? <><Check size={12} />已打卡</> : '今日打卡'}</button></div>
        </section>
        <StudyCalendar tasks={tasks} learningDates={learningDates} selectedDate={selectedDate} onSelectDate={setSelectedDate} onToggleTask={toggleTask} onStartTask={() => navigate('/papers')} onAddTask={() => navigate('/plan')} onViewPlan={() => navigate('/plan')} />
      </aside>
    </div>
    <section className="recent-section"><div className="section-heading"><h2>最近练习</h2><button className="text-link" onClick={() => navigate('/papers')}>继续探索题库<ChevronRight size={14} /></button></div>{overview.recent.length ? <div className="history-table"><div className="history-table-header"><span>练习内容</span><span>学习状态</span><span>最近练习</span><span /></div>{overview.recent.map((item) => <div className="history-row" key={item.attempt_id}><span className="history-title"><span><strong>{item.title}</strong><small>{item.state === 'submitted' && item.minutes ? `${item.minutes} 分钟 · ` : ''}{item.state === 'submitted' ? '已交卷' : item.state === 'in_progress' ? '进行中' : item.state === 'paused' ? '暂停中' : '刚创建'}</small></span></span><span className={`history-status ${item.state === 'submitted' ? 'is-completed' : ''}`}><span />{item.state === 'submitted' ? (item.correct !== null && item.total_graded ? `已完成 · ${Math.round(item.correct / item.total_graded * 100)}% 正确` : '已提交') : item.state === 'abandoned' ? '已放弃' : '进行中'}</span><span className="history-date">{recentDateLabel(item.updated_at)}</span><BookOpen size={15} /></div>)}</div> : <div className="empty-state"><img className="state-mascot" src="/images/mascots/no_data.png" alt="" /><h3>你的第一份练习记录会出现在这里</h3><p>从真题题库挑一份卷子开始，进度会自动保存。</p><button className="button button-primary" onClick={() => navigate('/papers')}>去真题题库看看</button></div>}</section>
  </>;
}
