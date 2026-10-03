import { useState } from 'react';
import { CalendarDays, Check, ChevronRight, Clock3, Flag, Plus, Trash2 } from 'lucide-react';
import Modal from '../components/Modal';
import StudyCalendar from '../components/StudyCalendar';
import { usePersistedState } from '../hooks';
import { useToast } from '../components/Toast';
import { categories, initialProfile, initialTasks, localDate } from '../demo';
import type { CategoryKey, Profile, StudyTask } from '../demo';
import { navigate } from '../router';

export function Plan() {
  const { notify } = useToast();
  const [profile] = usePersistedState<Profile>('shiti-profile-v1', initialProfile);
  const [tasks, setTasks] = usePersistedState<StudyTask[]>('shiti-tasks-v1', initialTasks);
  const [selectedDate, setSelectedDate] = useState(localDate());
  const [planFilter, setPlanFilter] = useState<'all' | 'pending' | 'done'>('all');
  const [modal, setModal] = useState(false);
  const [taskDraft, setTaskDraft] = useState({ title: '', date: localDate(), category: 'reading' as CategoryKey, minutes: '20' });

  const today = localDate();
  const daysToTarget = Math.max(0, Math.ceil((new Date(`${profile.targetDate}T00:00:00`).getTime() - new Date(`${today}T00:00:00`).getTime()) / 86400000));
  const dateTasks = tasks.filter((task) => task.date === selectedDate);
  const visibleTasks = dateTasks.filter((task) => planFilter === 'all' || (planFilter === 'done' ? task.done : !task.done));

  function toggleTask(id: string) {
    setTasks((items) => items.map((task) => task.id === id ? { ...task, done: !task.done } : task));
  }

  function addTask() {
    setTaskDraft({ title: '', date: selectedDate, category: 'reading', minutes: '20' });
    setModal(true);
  }

  return <div className="plan-layout">
    <section className="plan-main">
      <div className="plan-summary">
        <div><span className="eyebrow">YOUR SMALL STEPS</span><h2>{selectedDate === today ? '今天的小目标' : `${Number(selectedDate.slice(5, 7))} 月 ${Number(selectedDate.slice(8))} 日的小目标`}</h2><p>已完成 <strong>{dateTasks.filter((task) => task.done).length}</strong> / {dateTasks.length} 项，给每一份努力一个落点。</p></div>
        <span className="plan-summary-icon"><Flag size={37} strokeWidth={1.2} /></span>
      </div>
      <div className="plan-filter-bar">
        <div className="category-tabs">{([{ id: 'all', name: '全部计划' }, { id: 'pending', name: '待完成' }, { id: 'done', name: '已完成' }] as const).map((filter) => <button className={planFilter === filter.id ? 'is-active' : ''} key={filter.id} onClick={() => setPlanFilter(filter.id)}>{filter.name}</button>)}</div>
        <label className="plan-date-label"><CalendarDays size={15} /><input type="date" aria-label="计划日期" value={selectedDate} onChange={(event) => { if (event.target.value) setSelectedDate(event.target.value); }} /></label>
      </div>
      <div className="plan-task-list">
        {visibleTasks.length ? visibleTasks.map((task) => <div className={`plan-task ${task.done ? 'is-done' : ''}`} key={task.id}>
          <button className={`task-checkbox ${task.done ? 'is-checked' : ''}`} onClick={() => toggleTask(task.id)} aria-label={`${task.done ? '取消完成' : '完成'}${task.title}`} aria-pressed={task.done}>{task.done && <Check size={13} />}</button>
          <div><h3>{task.title}</h3><p><span>{categories.find((c) => c.id === task.category)?.name}</span><Clock3 size={13} />约 {task.minutes} 分钟</p></div>
          <button className="button button-quiet" onClick={() => navigate('/papers')}>{task.done ? '再练一次' : '开始'}<ChevronRight size={14} /></button>
          <button className="icon-button delete-task" onClick={() => { setTasks((items) => items.filter((item) => item.id !== task.id)); notify('已删除这项学习计划'); }} aria-label={`删除${task.title}`}><Trash2 size={15} /></button>
        </div>) : <div className="empty-state"><img className="state-mascot" src="/images/mascots/no_tasks.png" alt="" /><h3>{planFilter === 'done' ? '进步，等待你的第一步' : '给这一天留一个小目标'}</h3><p>{planFilter === 'done' ? '完成一个小计划，收获就会出现在这里。' : '用一个简单、可实现的计划，让学习轻一点。'}</p><button className="button button-primary" onClick={addTask}>添加学习计划</button></div>}
      </div>
      <button className="add-plan-row" onClick={addTask}><Plus size={17} />添加一个小目标</button>
    </section>
    <aside>
      <StudyCalendar tasks={tasks} selectedDate={selectedDate} onSelectDate={setSelectedDate} onToggleTask={toggleTask} onStartTask={() => navigate('/papers')} onAddTask={addTask} onViewPlan={() => navigate('/plan')} />
      <div className="target-note"><Flag size={17} /><span>距离你的目标日还有 <strong>{daysToTarget}</strong> 天</span></div>
    </aside>
    {modal && <Modal title="添加一个小目标" subtitle="把想做的事，变成能够完成的一步。" onClose={() => setModal(false)}>
      <form className="modal-form" onSubmit={(event) => { event.preventDefault(); if (!taskDraft.title.trim()) return; setTasks((items) => [...items, { id: `task-${Date.now()}`, title: taskDraft.title.trim(), date: taskDraft.date, category: taskDraft.category, minutes: Number(taskDraft.minutes), done: false }]); setSelectedDate(taskDraft.date); setModal(false); notify('新的小目标已加入学习计划'); }}>
        <label>计划内容<input autoFocus required maxLength={40} placeholder="例如：精读一篇阅读理解" value={taskDraft.title} onChange={(event) => setTaskDraft({ ...taskDraft, title: event.target.value })} /></label>
        <div className="form-grid">
          <label>学习日期<input type="date" required value={taskDraft.date} onChange={(event) => setTaskDraft({ ...taskDraft, date: event.target.value })} /></label>
          <label>练习题型<select value={taskDraft.category} onChange={(event) => setTaskDraft({ ...taskDraft, category: event.target.value as CategoryKey })}>{categories.map((category) => <option value={category.id} key={category.id}>{category.name}</option>)}</select></label>
        </div>
        <label>预计用时（分钟）<input type="number" min={1} max={180} required value={taskDraft.minutes} onChange={(event) => setTaskDraft({ ...taskDraft, minutes: event.target.value })} /></label>
        <div className="form-actions"><button type="button" className="button button-quiet" onClick={() => setModal(false)}>取消</button><button className="button button-primary" type="submit">加入计划<Plus size={15} /></button></div>
      </form>
    </Modal>}
  </div>;
}
