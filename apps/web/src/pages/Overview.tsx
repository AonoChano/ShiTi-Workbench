import { useState } from 'react';
import { ArrowRight, BookOpen, CalendarDays, Check, ChevronRight, Flame, Sprout } from 'lucide-react';
import { usePersistedState } from '../hooks';
import { CategoryIcon } from '../components/CategoryIcon';
import LearningChart from '../components/LearningChart';
import StudyCalendar from '../components/StudyCalendar';
import { useToast } from '../components/Toast';
import { categories, daysAgo, initialHistory, initialProfile, initialTasks, localDate } from '../demo';
import type { CategoryKey, HistoryItem, Profile, StudyTask } from '../demo';
import { navigate } from '../router';

function getStreak(dates: string[]) {
  let offset = dates.includes(localDate()) ? 0 : 1;
  let streak = 0;
  while (dates.includes(daysAgo(offset))) { streak += 1; offset += 1; }
  return streak;
}

export function Overview() {
  const { notify } = useToast();
  const [profile] = usePersistedState<Profile>('shiti-profile-v1', initialProfile);
  const [tasks, setTasks] = usePersistedState<StudyTask[]>('shiti-tasks-v1', initialTasks);
  const [history] = usePersistedState<HistoryItem[]>('shiti-history-v1', initialHistory);
  const [dailyStudy, setDailyStudy] = usePersistedState('shiti-daily-v1', { date: localDate(), count: 0, checkedIn: false });
  const [checkIns, setCheckIns] = usePersistedState<string[]>('shiti-checkins-v1', []);
  const [selectedDate, setSelectedDate] = useState(localDate());

  const today = localDate();
  const dailyCount = dailyStudy.date === today ? dailyStudy.count : 0;
  const checkedIn = checkIns.includes(today);
  const streak = getStreak(checkIns);
  const learningDates = [...checkIns, ...history.map((item) => item.date)];
  const dailyPercentage = Math.min(100, Math.round(dailyCount / profile.dailyTarget * 100));

  function checkIn() {
    if (checkedIn) return;
    setCheckIns((dates) => [...dates, today]);
    setDailyStudy({ date: today, count: dailyCount, checkedIn: true });
    notify('今日打卡成功！你的坚持，值得被记录。');
  }

  function toggleTask(id: string) {
    setTasks((items) => items.map((task) => task.id === id ? { ...task, done: !task.done } : task));
  }

  return <>
    <div className="overview-layout">
      <div className="overview-main">
        <section className="study-feature"><div className="feature-copy"><span className="feature-eyebrow"><span />拾题 · 每一道题，都算数</span><h2>每天拾一点，<br />离梦想近一点。</h2><p>不必一口气走很远，保持前进就好。</p><button className="button button-primary" onClick={() => navigate('/papers')}>开始今日练习<ArrowRight size={16} /></button><span className="continue-detail">真题题库持续更新中<span>新试卷会自动加入</span></span></div><img className="study-books" src="/images/study-books.png" alt="鼠尾草绿书籍与铅笔组成的安静学习场景" /></section>
        <section className="quick-practice"><div className="section-heading"><h2>按题型练习</h2><button className="text-link" onClick={() => navigate('/papers')}>去真题题库<ChevronRight size={14} /></button></div><div className="practice-grid">{categories.map((category) => <button className={`module-card ${category.color}`} key={category.id} onClick={() => navigate('/papers')}><CategoryIcon category={category.id} /><ArrowRight size={15} className="module-arrow" /><strong>{category.name}</strong><span>{category.id === 'reading' ? '读懂每一个细节' : category.id === 'cloze' ? '找到语境的线索' : category.id === 'translation' ? '拆解每一个长句' : '写出清晰的表达'}</span></button>)}</div></section>
        <LearningChart dailyCount={dailyCount} todayAccuracy={84} />
      </div>
      <aside className="overview-aside">
        <section className="panel goal-panel">
          <div className="section-heading"><h2>今日目标</h2></div>
          <div className="goal-content"><div className="goal-ring"><svg viewBox="0 0 110 110" aria-hidden="true"><circle cx="55" cy="55" r="44" fill="none" stroke="#edf0e8" strokeWidth="7" /><circle className="goal-progress" cx="55" cy="55" r="44" fill="none" stroke="#779760" strokeWidth="7" strokeLinecap="round" strokeDasharray="276.46" strokeDashoffset={276.46 * (1 - dailyPercentage / 100)} transform="rotate(-90 55 55)" /></svg><div><strong>{dailyCount}<span>/{profile.dailyTarget}</span></strong><span>今日已完成</span></div></div><div className="goal-copy"><strong>{dailyCount >= profile.dailyTarget ? '今天的目标达成啦' : `再拾 ${profile.dailyTarget - dailyCount} 题`}</strong><span>{dailyCount >= profile.dailyTarget ? '每一份坚持，都有意义。' : '就完成今天的小目标'}</span><button className="text-link" onClick={() => navigate('/papers')}>继续积累<ArrowRight size={12} /></button></div></div>
          <div className="goal-bottom"><span><Flame size={15} />已连续学习 <strong>{streak}</strong> 天</span><button className={`checkin-button ${checkedIn ? 'is-checked' : ''}`} disabled={checkedIn} onClick={checkIn}>{checkedIn ? <><Check size={12} />已打卡</> : '今日打卡'}</button></div>
        </section>
        <StudyCalendar tasks={tasks} learningDates={learningDates} selectedDate={selectedDate} onSelectDate={setSelectedDate} onToggleTask={toggleTask} onStartTask={() => navigate('/papers')} onAddTask={() => navigate('/plan')} onViewPlan={() => navigate('/plan')} />
      </aside>
    </div>
    <section className="recent-section"><div className="section-heading"><h2>最近练习</h2><button className="text-link" onClick={() => navigate('/papers')}>继续探索题库<ChevronRight size={14} /></button></div><div className="history-table"><div className="history-table-header"><span>练习内容</span><span>学习状态</span><span>最近练习</span><span /></div>{history.slice(0, 3).map((item) => <div className="history-row" key={item.id}><span className="history-title"><CategoryIcon category={item.category} small /><span><strong>{item.title}</strong><small>{item.minutes} 分钟 · 本地演示数据</small></span></span><span className={`history-status ${item.completed ? 'is-completed' : ''}`}><span />{item.completed ? item.correct === null ? '已提交' : `已完成 · ${Math.round(item.correct / item.total * 100)}% 正确` : '进行中'}</span><span className="history-date">{item.date === today ? '今天' : item.date === daysAgo(1) ? '昨天' : item.date.slice(5).replace('-', '/')}</span><BookOpen size={15} /></div>)}</div><p className="demo-note"><Sprout size={14} />练习记录列表将在后续版本接入本地工作区数据库；交卷后的报告可从答题页直接进入。</p></section>
  </>;
}
