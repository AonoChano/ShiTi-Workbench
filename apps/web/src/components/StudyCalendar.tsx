import { useEffect, useState } from 'react';
import { ArrowRight, Check, ChevronLeft, ChevronRight, Plus } from 'lucide-react';
import { daysAgo, localDate } from '../demo';
import type { StudyTask } from '../demo';

interface StudyCalendarProps {
  tasks: StudyTask[];
  learningDates?: string[];
  selectedDate: string;
  onSelectDate: (date: string) => void;
  onToggleTask: (id: string) => void;
  onStartTask: (task: StudyTask) => void;
  onAddTask: () => void;
  onViewPlan: () => void;
}

export default function StudyCalendar({ tasks, learningDates, selectedDate, onSelectDate, onToggleTask, onStartTask, onAddTask, onViewPlan }: StudyCalendarProps) {
  const [month, setMonth] = useState(() => new Date(`${selectedDate.slice(0, 7)}-01T12:00:00`));
  const firstDay = (month.getDay() + 6) % 7;
  const days = new Date(month.getFullYear(), month.getMonth() + 1, 0).getDate();
  const cellCount = Math.ceil((firstDay + days) / 7) * 7;
  const learningDays = new Set(learningDates || [0, 1, 2, 4, 5, 7, 8, 10, 11, 12].map(daysAgo));
  tasks.filter((task) => task.done).forEach((task) => learningDays.add(task.date));
  const dayTasks = tasks.filter((task) => task.date === selectedDate);
  const pendingTasks = dayTasks.filter((task) => !task.done).slice(0, 2);

  useEffect(() => { setMonth(new Date(`${selectedDate.slice(0, 7)}-01T12:00:00`)); }, [selectedDate]);

  function moveMonth(direction: number) {
    setMonth(new Date(month.getFullYear(), month.getMonth() + direction, 1));
  }

  return <section className="panel calendar-panel">
    <div className="section-heading"><h2>学习日历</h2><span className="calendar-legend"><span />已学习</span></div>
    <div className="calendar-month"><strong>{month.getFullYear()} 年 {month.getMonth() + 1} 月</strong><div><button className="icon-button" aria-label="上个月" onClick={() => moveMonth(-1)}><ChevronLeft size={15} /></button><button className="icon-button" aria-label="下个月" onClick={() => moveMonth(1)}><ChevronRight size={15} /></button></div></div>
    <div className="calendar-weekdays">{['一', '二', '三', '四', '五', '六', '日'].map((day) => <span key={day}>{day}</span>)}</div>
    <div className="calendar-grid">{Array.from({ length: cellCount }, (_, index) => {
      const day = index - firstDay + 1;
      const date = new Date(month.getFullYear(), month.getMonth(), day);
      const iso = localDate(date);
      const inMonth = day > 0 && day <= days;
      return <button key={index} disabled={!inMonth} className={`calendar-date ${!inMonth ? 'is-outside' : ''} ${iso === selectedDate ? 'is-selected' : ''} ${learningDays.has(iso) && inMonth ? 'has-learning' : ''} ${iso === localDate() ? 'is-today' : ''}`} onClick={() => onSelectDate(iso)} aria-label={`${iso}${learningDays.has(iso) ? '，已学习' : ''}`} aria-pressed={iso === selectedDate}>{date.getDate()}<span className="day-dot" /></button>;
    })}</div>
    <div className="calendar-agenda"><div className="section-heading"><h3>{selectedDate === localDate() ? '今日安排' : `${Number(selectedDate.slice(5, 7))} 月 ${Number(selectedDate.slice(8))} 日安排`}</h3><button className="icon-button" aria-label="添加学习安排" onClick={onAddTask}><Plus size={16} /></button></div>
      {pendingTasks.length ? <div className="mini-tasks">{pendingTasks.map((task) => <div className="mini-task" key={task.id}><button className="task-checkbox" aria-label={`完成${task.title}`} onClick={() => onToggleTask(task.id)} /><button className="mini-task-title" onClick={() => onStartTask(task)}>{task.title}<span>约 {task.minutes} 分钟</span></button><ChevronRight size={13} /></div>)}</div> : <div className="agenda-empty">{dayTasks.length ? <><Check size={18} /><span>今天的计划都完成啦</span></> : <><span>为这一天拾起一个小目标</span><button className="text-link" onClick={onAddTask}>添加计划</button></>}</div>}
      <button className="calendar-plan-link" onClick={onViewPlan}>查看完整计划<ArrowRight size={13} /></button>
    </div>
  </section>;
}