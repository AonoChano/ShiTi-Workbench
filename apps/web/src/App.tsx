import { useEffect, useMemo, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { AlignLeft, ArrowRight, ArrowUpRight, Bell, BookOpen, CalendarDays, Check, ChevronDown, ChevronRight, CircleHelp, GraduationCap, LayoutDashboard, LogOut, Menu, NotebookTabs, PenLine, Search, Settings2, Sprout, Target, X } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { api } from './api';
import Modal from './components/Modal';
import { ProductTour } from './components/ProductTour';
import type { TourStep } from './components/ProductTour';
import { ToastProvider, useToast } from './components/Toast';
import { usePersistedState } from './hooks';
import { localDate } from './model';
import type { ExamType, Page } from './model';
import { ProfileProvider, useProfile, type Profile } from './profile';
import { AuthProvider, useAuth } from './auth/AuthContext';
import LoginPage from './auth/pages/LoginPage';
import SessionSplash from './auth/pages/SessionSplash';
import { navigate, usePath } from './router';
import { Overview } from './pages/Overview';
import { Papers, yearOf } from './pages/Papers';
import { Drill } from './pages/Drill';
import { Mistakes } from './pages/Mistakes';
import { Plan } from './pages/Plan';
import { Guide } from './pages/Guide';
import { Practice } from './pages/Practice';
import { Report } from './pages/Report';

const navigation: { id: Page; label: string; icon: LucideIcon }[] = [
  { id: 'overview', label: '学习概览', icon: LayoutDashboard },
  { id: 'papers', label: '真题题库', icon: BookOpen },
  { id: 'drill', label: '专项练习', icon: Target },
  { id: 'mistakes', label: '我的错题', icon: NotebookTabs },
  { id: 'plan', label: '学习计划', icon: CalendarDays },
];

const pageTitles: Record<Page, { title: string; subtitle: string }> = {
  overview: { title: '', subtitle: '' },
  papers: { title: '真题里，藏着进步的线索。', subtitle: '按年份找到你的练习，让每一次落笔更有方向。' },
  drill: { title: '', subtitle: '' },
  mistakes: { title: '错过的题，也是下一次的加分项。', subtitle: '读懂每一次失误，比盲目做更多题更重要。' },
  plan: { title: '把远方的目标，拆成今天的一小步。', subtitle: '不必赶路，按自己的节奏，把计划一点点完成。' },
  guide: { title: '好的方法，让努力更有回响。', subtitle: '从这里开始，找到适合自己的英语备考方式。' },
};

// 产品导览步骤：目标不存在（如他页专属元素）的步骤会自动跳过
const TOUR_STEPS: TourStep[] = [
  { selector: '.main-nav', title: '这里是你的学习空间', body: '学习概览、真题题库、专项练习、错题本与学习计划，五个入口都在左侧导航，随时切换。' },
  { selector: '[data-tour="nav-papers"]', title: '从一份真题开始', body: '题库已收录 1986–2020 全部真题。按科目与年份范围筛选，点「开始练习」即锁定当前版本，作答自动保存。' },
  { selector: '[data-tour="nav-drill"]', title: '按题型专项突破', body: '完形、阅读、新题型、翻译、写作，想练哪类就抽哪类：材料整组保留、组内按原卷顺序，完形还能一屏连做。' },
  { selector: '[data-tour="nav-mistakes"]', title: '错题会自己找上门', body: '交卷判分后，错题自动收进错题本，附上你的作答与参考答案，复盘不用翻卷子。' },
  { selector: '.header-search', title: 'Ctrl + K 全局搜索', body: '任何页面按下 Ctrl + K（或点搜索框），按年份或卷名直达试卷；Esc 关闭弹窗。' },
  { selector: '.exam-switch', title: '英语一 / 英语二', body: '在概览页右上角即可切换备考科目，真题库同样支持按科目筛选。' },
  { selector: '.sidebar-profile', title: '账号与学习设置', body: '点这里修改昵称、备考科目与每日目标；所有作答与报告都保存在这台电脑的本地工作区里。' },
  { selector: '.sidebar-help', title: '随时再看这份导览', body: '点左下角「使用帮助」可以随时重新打开导览。准备好了，就从一份真题开始吧！' },
];

function pageFromPath(path: string): Page {
  if (path.startsWith('/papers')) return 'papers';
  if (path.startsWith('/drill')) return 'drill';
  if (path.startsWith('/mistakes')) return 'mistakes';
  if (path.startsWith('/plan')) return 'plan';
  if (path.startsWith('/guide')) return 'guide';
  return 'overview';
}

function getGreeting() {
  const hour = new Date().getHours();
  return hour < 11 ? '早上好' : hour < 14 ? '中午好' : hour < 19 ? '下午好' : '晚上好';
}

function Brand({ onClick }: { onClick: () => void }) {
  return <button className="brand" onClick={onClick} aria-label="拾题首页"><span className="brand-symbol"><svg viewBox="0 0 36 36" fill="none" aria-hidden="true"><path d="M8 11.5c4-1.6 7.4-1.3 10 1v14c-3.1-2.5-6.5-2.8-10-1.4V11.5Z" fill="#E9F0D9" /><path d="M28 9c-4.2-.8-7.5.4-10 3.5v14c3-2.9 6.3-4 10-3.2V9Z" fill="#BACEA6" /><path d="M18 12.5v14" stroke="#426749" strokeWidth="1.4" /><path d="M19.5 8.5c0-2 2-3.7 4.1-3.4.1 2.1-1.7 3.7-4.1 3.4Z" fill="#E9F0D9" /></svg></span><span className="brand-wordmark">拾题<span>SHITI</span></span></button>;
}

interface SearchSet { set_id: string; title: string; question_count: number; current_version_id: string }

function Shell({ path }: { path: string }) {
  const { notify } = useToast();
  const page = pageFromPath(path);
  const { user, signOut } = useAuth();
  const { profile, save: saveProfile } = useProfile();
  const [mobileMenu, setMobileMenu] = useState(false);
  const [settingsDraft, setSettingsDraft] = useState<Profile | null>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [tourOpen, setTourOpen] = useState(false);
  const [notificationRead, setNotificationRead] = usePersistedState('shiti-notification-read-v1', false);
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchSets, setSearchSets] = useState<SearchSet[]>([]);
  const searchInput = useRef<HTMLInputElement>(null);
  const searchContainer = useRef<HTMLDivElement>(null);
  const notificationContainer = useRef<HTMLDivElement>(null);

  const currentPageLabel = navigation.find((item) => item.id === page)?.label || '备考指南';
  const displayName = profile.nickname || user?.nickname || '拾题同学';

  // 首次访问自动进入功能导览；跳过或完成后不再自动弹出（左下角「使用帮助」可随时手动打开）
  useEffect(() => {
    if (localStorage.getItem('shiti-tour-done-v1') === '1') return;
    const t = setTimeout(() => setTourOpen(true), 900);
    return () => clearTimeout(t);
  }, []);

  function finishTour() {
    setTourOpen(false);
    try { localStorage.setItem('shiti-tour-done-v1', '1'); } catch { /* 隐私模式忽略 */ }
  }

  function go(nextPage: Page) {
    navigate(nextPage === 'overview' ? '/' : `/${nextPage}`);
    setMobileMenu(false);
    setSearchOpen(false);
    setNotificationsOpen(false);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  useEffect(() => {
    function keyboard(event: KeyboardEvent) {
      if (document.querySelector('[aria-modal="true"]')) return;
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault();
        searchInput.current?.focus();
        setSearchOpen(true);
      }
      if (event.key === 'Escape') { setSearchOpen(false); setNotificationsOpen(false); setMobileMenu(false); }
    }
    function outsideClick(event: MouseEvent) {
      if (!searchContainer.current?.contains(event.target as Node)) setSearchOpen(false);
      if (!notificationContainer.current?.contains(event.target as Node)) setNotificationsOpen(false);
    }
    document.addEventListener('keydown', keyboard);
    document.addEventListener('mousedown', outsideClick);
    return () => { document.removeEventListener('keydown', keyboard); document.removeEventListener('mousedown', outsideClick); };
  }, []);

  // 顶栏搜索：查真题题库
  useEffect(() => {
    if (!searchOpen || !searchQuery.trim()) { setSearchSets([]); return; }
    const q = searchQuery.trim().toLowerCase();
    let alive = true;
    api<SearchSet[]>('GET', '/sets')
      .then((sets) => { if (alive) setSearchSets(sets.filter((s) => s.title.toLowerCase().includes(q)).slice(0, 4)); })
      .catch(() => {});
    return () => { alive = false; };
  }, [searchQuery, searchOpen]);

  const showSearch = useMemo(() => searchOpen && searchQuery.trim().length > 0, [searchOpen, searchQuery]);

  let content: ReactNode;
  if (page === 'overview') content = <Overview />;
  else if (page === 'papers') content = <Papers />;
  else if (page === 'drill') content = <Drill />;
  else if (page === 'mistakes') content = <Mistakes />;
  else if (page === 'plan') content = <Plan />;
  else content = <Guide />;

  return <div className="app-shell">
    {mobileMenu && <button className="sidebar-scrim" onClick={() => setMobileMenu(false)} aria-label="关闭导航" />}
    <aside className={`sidebar ${mobileMenu ? 'is-open' : ''}`}>
      <div className="sidebar-brand"><Brand onClick={() => go('overview')} /><button className="icon-button sidebar-close" aria-label="关闭导航" onClick={() => setMobileMenu(false)}><X size={20} /></button></div>
      <span className="nav-caption">我的学习空间</span>
      <nav className="main-nav" aria-label="主导航">{navigation.map(({ id, label, icon: Icon }) => <button key={id} data-tour={`nav-${id}`} className={`nav-item ${page === id ? 'is-active' : ''}`} onClick={() => go(id)} aria-current={page === id ? 'page' : undefined}><Icon size={19} strokeWidth={1.65} /><span>{label}</span><span className="nav-active-dot" /></button>)}</nav>
      <div className="sidebar-secondary"><span className="nav-caption">更多</span><button className={`nav-item ${page === 'guide' ? 'is-active' : ''}`} onClick={() => go('guide')}><GraduationCap size={19} strokeWidth={1.65} /><span>备考指南</span><ArrowUpRight size={14} className="nav-end-icon" /></button></div>
      <div className="sidebar-bottom"><div className="sidebar-encouragement"><Sprout size={28} strokeWidth={1.2} /><p>保持热爱，也保持耐心。</p><span>你走的每一步，都算数。</span></div><button className="sidebar-help" onClick={() => setTourOpen(true)}><CircleHelp size={17} /><span>使用帮助</span><ArrowUpRight size={13} /></button><button className="sidebar-profile" onClick={() => { setSettingsDraft(profile); setSettingsOpen(true); }}><span className="avatar">{displayName.slice(0, 1)}</span><span className="profile-copy"><strong>{displayName}</strong><span>{profile.exam} · 已登录</span></span><Settings2 size={16} /></button></div>
    </aside>

    <div className="workspace">
      <header className="topbar"><div className="breadcrumb"><button className="icon-button mobile-menu-button" aria-label="打开导航" onClick={() => setMobileMenu(true)}><Menu size={20} /></button><span>学习空间</span><ChevronRight size={13} /><strong>{currentPageLabel}</strong></div><div className="topbar-actions"><div className="header-search-wrap" ref={searchContainer}><div className="header-search"><Search size={16} /><input ref={searchInput} aria-label="搜索真题" placeholder="搜索真题、年份..." value={searchQuery} onFocus={() => setSearchOpen(true)} onChange={(event) => { setSearchQuery(event.target.value); setSearchOpen(true); }} onKeyDown={(event) => { if (event.key === 'Enter') { go('papers'); } }} /><kbd>Ctrl K</kbd></div>{showSearch && <div className="search-results"><div className="popover-heading">找到你的下一份真题</div>{searchSets.length ? searchSets.map((s) => <button className="search-result" key={s.set_id} onClick={() => { go('papers'); }}><span className="category-icon sage" style={{ width: 32, height: 32, borderRadius: 6 }}><BookOpen size={16} /></span><span>{s.title}<small>{s.question_count} 题</small></span><ArrowUpRight size={15} /></button>) : <p className="search-empty"><img className="state-mascot" src="/images/mascots/no_results.png" alt="" />暂时没有匹配的试卷，试试年份如 “2010”。</p>}<button className="all-search-results" onClick={() => go('papers')}>查看全部题库<ArrowRight size={14} /></button></div>}</div><span className="topbar-divider" /><div className="notification-wrap" ref={notificationContainer}><button className={`icon-button notification-button ${notificationsOpen ? 'is-active' : ''}`} aria-label="通知" aria-expanded={notificationsOpen} onClick={() => setNotificationsOpen((open) => !open)}><Bell size={19} strokeWidth={1.6} />{!notificationRead && <span className="notification-dot" />}</button>{notificationsOpen && <div className="notification-popover"><div className="popover-heading"><strong>学习消息</strong><button className="text-link" onClick={() => { setNotificationRead(true); notify('所有消息已标记为已读'); }}>{notificationRead ? '已全部读完' : '全部已读'}</button></div><button className="notice-item" onClick={() => { setNotificationRead(true); go('plan'); }}><span className="notice-icon"><CalendarDays size={18} /></span><span><strong>今天的学习计划已就绪</strong><small>从一个小目标开始，进入专注状态。</small><em>今天</em></span></button><button className="notice-item" onClick={() => { setNotificationRead(true); go('papers'); }}><span className="notice-icon peach"><BookOpen size={18} /></span><span><strong>真题题库持续入库中</strong><small>新试卷会自动加入题库，无需手动导入。</small><em>题库</em></span></button></div>}</div><button className="header-profile" onClick={() => { setSettingsDraft(profile); setSettingsOpen(true); }} aria-label="个人设置"><span className="avatar avatar-small">{displayName.slice(0, 1)}</span><ChevronDown size={12} /></button></div></header>

      <main className="main-content">
        {page !== 'drill' && <div className="page-heading">
          <div><h1>{page === 'overview' ? <>{getGreeting()}，{displayName}<span className="heading-period">.</span></> : pageTitles[page].title}</h1><p>{page === 'overview' ? '备考是一场长跑，今天也为自己积攒一点底气。' : pageTitles[page].subtitle}</p></div>
          <div className="page-heading-extra">{page === 'overview' ? <><span className="today-label"><CalendarDays size={14} />{new Date().toLocaleDateString('zh-CN', { month: 'long', day: 'numeric', weekday: 'long' })}</span><select className="exam-switch" aria-label="当前考试类型" value={profile.exam} onChange={(event) => { void saveProfile({ exam: event.target.value as ExamType }); }}><option>英语一</option><option>英语二</option></select></> : null}</div>
        </div>}
        <div key={page} className="page-enter">{content}</div>
        <footer className="workspace-footer"><span><Sprout size={13} />拾题，让每一次努力都有回响。</span><span>本地工作区 · 学习数据保存在此电脑</span></footer>
      </main>
    </div>

    {settingsOpen && settingsDraft && <Modal title="我的学习设置" subtitle="目标很远，但你每天都在靠近。" onClose={() => setSettingsOpen(false)}>
      <form className="modal-form" onSubmit={(event) => {
        event.preventDefault();
        const nickname = settingsDraft.nickname.trim() || '拾题同学';
        void saveProfile({ nickname, exam: settingsDraft.exam, dailyTarget: settingsDraft.dailyTarget, targetDate: settingsDraft.targetDate })
          .then(() => { setSettingsOpen(false); notify('学习设置已保存'); })
          .catch(() => notify('保存失败，请稍后再试'));
      }}>
        <label>怎么称呼你<input autoFocus required maxLength={16} value={settingsDraft.nickname} onChange={(event) => setSettingsDraft({ ...settingsDraft, nickname: event.target.value })} placeholder="你的昵称" /></label>
        <div className="form-grid">
          <label>备考科目<select value={settingsDraft.exam} onChange={(event) => setSettingsDraft({ ...settingsDraft, exam: event.target.value as ExamType })}><option>英语一</option><option>英语二</option></select></label>
          <label>每日目标（题）<input type="number" min={1} max={500} required value={settingsDraft.dailyTarget} onChange={(event) => setSettingsDraft({ ...settingsDraft, dailyTarget: Number(event.target.value) })} /></label>
        </div>
        <label>目标考试日<input type="date" value={settingsDraft.targetDate} onChange={(event) => setSettingsDraft({ ...settingsDraft, targetDate: event.target.value })} /></label>
        <p className="form-note">目标日期由你设定，并非官方考试时间。登录账号：{user?.email || profile.username || displayName}</p>
        <div className="form-actions"><button type="button" className="button button-quiet" onClick={() => { void signOut(); }}><LogOut size={14} />退出登录</button><span style={{ flex: 1 }} /><button className="button button-primary" type="submit">保存设置<Check size={15} /></button></div>
      </form>
    </Modal>}

    {tourOpen && <ProductTour steps={TOUR_STEPS} onDone={finishTour} />}
  </div>;
}

export function App() {
  return (
    <AuthProvider>
      <AuthGate />
    </AuthProvider>
  );
}

/** 认证闸门：启动时确认会话；未登录只看到登录页，主应用不加载 */
function AuthGate() {
  const { status } = useAuth();
  if (status === 'checking') return <SessionSplash />;
  if (status === 'anonymous') return <div className="auth-root"><LoginPage /></div>;
  return <MainApp />;
}

function MainApp() {
  const path = usePath();
  // 答题界面沉浸模式：不渲染全局外壳，练习页独占视口
  if (/^\/practice\//.test(path)) return <ProfileProvider><ToastProvider><Practice path={path} /></ToastProvider></ProfileProvider>;
  if (path.startsWith('/attempts/') && path.endsWith('/report')) {
    return <ProfileProvider><ToastProvider><ShellInner title="复盘报告"><Report path={path} /></ShellInner></ToastProvider></ProfileProvider>;
  }
  return <ProfileProvider><ToastProvider><Shell path={path} /></ToastProvider></ProfileProvider>;
}

function ShellInner({ children, title }: { children: ReactNode; title: string }) {
  return <div className="app-shell">
    <div className="workspace" style={{ marginLeft: 0 }}>
      <header className="topbar"><div className="breadcrumb"><span>学习空间</span><ChevronRight size={13} /><strong>{title}</strong></div></header>
      <main className="main-content">
        <div className="page-enter">{children}</div>
        <footer className="workspace-footer"><span><Sprout size={13} />拾题，让每一次努力都有回响。</span><span>{localDate()}</span></footer>
      </main>
    </div>
  </div>;
}
