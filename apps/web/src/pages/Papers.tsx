import { useEffect, useMemo, useState } from 'react';
import { ArrowRight, Bookmark, ChevronRight, Database, Lightbulb, Search, SlidersHorizontal, Upload, X } from 'lucide-react';
import { api } from '../api';
import Modal from '../components/Modal';
import { useToast } from '../components/Toast';
import { usePersistedState } from '../hooks';
import { navigate } from '../router';
import { clientInstanceId } from './practiceShared';

interface SetRow { set_id: string; title: string; question_count: number; has_key_count: number; is_demo: boolean; updated_at: string; current_version_id: string }
interface BankFile { path: string; status: 'imported' | 'error'; set_id: string | null; issues: Array<{ level: string; code: string; message: string; question_id?: string; field?: string }>; scanned_at: string }
interface Issue { level: 'error' | 'warning'; code: string; message: string; question_id?: string; field?: string }
interface ImportPreview { import_id: string; question_count: number; error_count: number; warning_count: number; issues: Issue[] }

export function fmtTime(iso: string): string {
  return new Date(iso).toLocaleString('zh-CN', { hour12: false, month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' });
}

export function yearOf(title: string): number | null {
  const m = title.match(/(19|20)\d{2}/);
  return m ? Number(m[0]) : null;
}

/** 科目：题库按目录分科目（NETEM_English_I/II），set 暂无科目列，由卷名推导——
 *  标注"英语（二）"的归英语二，其余（含早年英语统考卷）都属英语一脉络 */
export function subjectOf(title: string): 'english1' | 'english2' {
  return /英语（二）|英语二/.test(title) ? 'english2' : 'english1';
}

export function Papers() {
  const { notify } = useToast();
  const [sets, setSets] = useState<SetRow[] | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);
  const [subjectFilter, setSubjectFilter] = useState<'all' | 'english1' | 'english2'>('all');
  const [rangeFilter, setRangeFilter] = useState('all');
  const [sortBy, setSortBy] = useState('year-desc');
  const [librarySearch, setLibrarySearch] = useState('');
  const [onlyBookmarks, setOnlyBookmarks] = useState(false);
  const [filtersVisible, setFiltersVisible] = useState(true);
  const [paperPage, setPaperPage] = useState(1);
  const [bookmarks, setBookmarks] = usePersistedState<string[]>('shiti-set-bookmarks-v1', []);
  const [manageOpen, setManageOpen] = useState(false);

  useEffect(() => {
    api<SetRow[]>('GET', '/sets').then(setSets).catch((e) => setErr(String((e as Error).message)));
  }, [reloadKey]);

  // 5 年一档的年份范围（锚定首卷 1986），只列出有试卷的档位，避免一长串空年份
  const ranges = useMemo(() => {
    const counts = new Map<number, number>();
    for (const s of sets ?? []) {
      const y = yearOf(s.title);
      if (!y) continue;
      const start = 1986 + Math.floor((y - 1986) / 5) * 5;
      counts.set(start, (counts.get(start) ?? 0) + 1);
    }
    return [...counts.entries()].sort((a, b) => b[0] - a[0]);
  }, [sets]);

  const subjectEmpty = subjectFilter === 'english2' && (sets ?? []).length > 0 && !(sets ?? []).some((s) => subjectOf(s.title) === 'english2');

  const filtered = useMemo(() => {
    const lo = rangeFilter === 'all' ? null : Number(rangeFilter);
    const list = (sets ?? []).filter((s) => {
      const y = yearOf(s.title);
      return (lo === null || (y !== null && y >= lo && y <= lo + 4)) &&
        (subjectFilter === 'all' || subjectOf(s.title) === subjectFilter) &&
        (!onlyBookmarks || bookmarks.includes(s.set_id)) &&
        (!librarySearch.trim() || s.title.toLowerCase().includes(librarySearch.trim().toLowerCase()));
    });
    const byYear = (a: SetRow, b: SetRow) => (yearOf(a.title) ?? 0) - (yearOf(b.title) ?? 0);
    return list.sort((a, b) =>
      sortBy === 'year-asc' ? byYear(a, b)
        : sortBy === 'updated' ? b.updated_at.localeCompare(a.updated_at)
          : byYear(b, a));
  }, [sets, rangeFilter, subjectFilter, onlyBookmarks, bookmarks, librarySearch, sortBy]);

  const pageCount = Math.max(1, Math.ceil(filtered.length / 8));
  const safePage = Math.min(paperPage, pageCount);
  const visible = filtered.slice((safePage - 1) * 8, safePage * 8);

  function toggleBookmark(id: string) {
    const exists = bookmarks.includes(id);
    setBookmarks((items) => exists ? items.filter((item) => item !== id) : [...items, id]);
    notify(exists ? '已取消收藏' : '已收藏，下一次更快找到它。');
  }

  async function startPractice(setVersionId: string) {
    try {
      const created = await api<{ attempt_id: string }>('POST', '/attempts', { set_version_id: setVersionId, mode: 'training' });
      await api('POST', `/attempts/${created.attempt_id}/start`, { expected_revision: 1, client_instance_id: clientInstanceId() }, { 'idempotency-key': `start-${created.attempt_id}` });
      navigate(`/practice/${created.attempt_id}`);
    } catch (e) { notify((e as Error).message); }
  }

  return <section className="library-section">
    <div className="library-toolbar">
      <div className="category-tabs" aria-label="题库视图">
        <button className="is-active">全部真题 <span>{sets?.length ?? '…'}</span></button>
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
        <button className="filter-button" onClick={() => setManageOpen(true)}><Database size={15} />题库管理</button>
        <button className={`filter-button ${filtersVisible ? 'is-active' : ''}`} onClick={() => setFiltersVisible((v) => !v)}><SlidersHorizontal size={15} />筛选</button>
      </div>
    </div>
    {filtersVisible && <div className="library-filters">
      <div>
        <label>科目
          <select value={subjectFilter} onChange={(event) => { setSubjectFilter(event.target.value as 'all' | 'english1' | 'english2'); setPaperPage(1); }}>
            <option value="all">全部科目</option>
            <option value="english1">英语一</option>
            <option value="english2">英语二</option>
          </select>
        </label>
        <label>年份
          <select className="range-select" value={rangeFilter} onChange={(event) => { setRangeFilter(event.target.value); setPaperPage(1); }}>
            <option value="all">全部年份</option>
            {ranges.map(([start, n]) => <option key={start} value={String(start)}>{start}–{start + 4} 年 · {n} 份</option>)}
          </select>
        </label>
        <label>排序
          <select value={sortBy} onChange={(event) => { setSortBy(event.target.value); setPaperPage(1); }}>
            <option value="year-desc">年份从新到旧</option>
            <option value="year-asc">年份从旧到新</option>
            <option value="updated">最近更新</option>
          </select>
        </label>
        <label>
          <button className={`button button-outline ${onlyBookmarks ? 'is-selected' : ''}`} style={{ height: 32, fontSize: 11 }} onClick={() => setOnlyBookmarks((v) => !v)}><Bookmark size={14} fill={onlyBookmarks ? 'currentColor' : 'none'} />{onlyBookmarks ? '只看收藏' : '我的收藏'}</button>
        </label>
      </div>
      <div className="library-search"><Search size={15} /><input aria-label="搜索题库" placeholder="搜索年份或试卷名" value={librarySearch} onChange={(event) => { setLibrarySearch(event.target.value); setPaperPage(1); }} />{librarySearch && <button className="icon-button" onClick={() => setLibrarySearch('')} aria-label="清空题库搜索"><X size={14} /></button>}</div>
    </div>}
    <div className="list-summary"><span>共 <strong>{filtered.length}</strong> 份试卷{onlyBookmarks && ' · 我的收藏'}</span><span>新试卷自动入库 · 开始练习即锁定当前版本</span></div>
    {err && <div className="report-card state-error-line" role="alert"><img className="state-mascot" src="/images/mascots/error.png" alt="" /><span>加载失败：{err}</span></div>}
    <div className="paper-list">
      {sets === null ? <div className="bank-empty">加载中…</div>
        : visible.length ? visible.map((s) => {
          const disabled = s.question_count === 0 || s.has_key_count === 0;
          return <div className="paper-row" key={s.set_id}>
            <span className="category-icon sage"><Database size={19} strokeWidth={1.7} /></span>
            <div className="paper-info">
              <h3>{s.title}{s.is_demo && <span className="tag" style={{ marginLeft: 8 }}>演示</span>}</h3>
              <p>{yearOf(s.title)?.toString() ?? ''}<span />{s.question_count} 题<span />{s.has_key_count} 题可判分<span />更新于 {fmtTime(s.updated_at)}</p>
            </div>
            <div className="paper-progress"><span>{s.question_count > 0 ? '已入库' : '待入库'}</span><div><span style={{ width: s.question_count > 0 ? '100%' : '0%' }} /></div></div>
            <button className={`icon-button bookmark-button ${bookmarks.includes(s.set_id) ? 'is-bookmarked' : ''}`} aria-label={bookmarks.includes(s.set_id) ? '取消收藏' : '收藏试卷'} onClick={() => toggleBookmark(s.set_id)}><Bookmark size={17} fill={bookmarks.includes(s.set_id) ? 'currentColor' : 'none'} /></button>
            <button className="button button-outline" disabled={disabled} title={disabled ? '该题集暂无可判分题目' : undefined} onClick={() => void startPractice(s.current_version_id)}>开始练习<ArrowRight size={14} /></button>
          </div>;
        })
        : <div className="empty-state"><img className="state-mascot" src={subjectEmpty ? '/images/mascots/no_data.png' : '/images/mascots/no_results.png'} alt="" /><h3>{onlyBookmarks ? '还没有收藏的试卷' : subjectEmpty ? '英语二试卷还没有入库' : '没有找到相关试卷'}</h3><p>{onlyBookmarks ? '点击试卷旁的书签，把想练的内容留在这里。' : subjectEmpty ? '加入后这里会自动更新，也可以先看看英语一。' : '换个科目、年份范围或关键词，或到「题库管理」查看入库状态。'}</p></div>}
    </div>
    {filtered.length > 8 && <div className="pagination">
      <span>第 {(safePage - 1) * 8 + 1} - {Math.min(safePage * 8, filtered.length)} 份，共 {filtered.length} 份</span>
      <div>
        <button className="icon-button" disabled={safePage === 1} onClick={() => setPaperPage(safePage - 1)} aria-label="上一页"><ChevronRight size={16} className="rotate-180" /></button>
        {Array.from({ length: pageCount }, (_, i) => <button className={`page-number ${safePage === i + 1 ? 'is-active' : ''}`} key={i} onClick={() => setPaperPage(i + 1)}>{i + 1}</button>)}
        <button className="icon-button" disabled={safePage === pageCount} onClick={() => setPaperPage(safePage + 1)} aria-label="下一页"><ChevronRight size={16} /></button>
      </div>
    </div>}
    <p className="demo-note"><Lightbulb size={14} />转换好的试卷会自动加入题库；也可以在「题库管理」里手动导入或重新扫描。</p>

    {manageOpen && <Modal title="题库管理" subtitle="题库目录自动识别 · 手动导入" onClose={() => { setManageOpen(false); setReloadKey((k) => k + 1); }} wide>
      <BankManage onRefresh={() => setReloadKey((k) => k + 1)} />
    </Modal>}
  </section>;
}

function BankManage({ onRefresh }: { onRefresh: () => void }) {
  const [tab, setTab] = useState<'bank' | 'import'>('bank');
  return <div className="bank-modal-body">
    <div className="metric-tabs" role="tablist" aria-label="题库管理视图">
      <button className={tab === 'bank' ? 'is-active' : ''} onClick={() => setTab('bank')}>目录状态</button>
      <button className={tab === 'import' ? 'is-active' : ''} onClick={() => setTab('import')}>手动导入 JSON</button>
    </div>
    {tab === 'bank' ? <BankPanel onRefresh={onRefresh} /> : <ImportWizard onDone={onRefresh} />}
  </div>;
}

function BankPanel({ onRefresh }: { onRefresh: () => void }) {
  const [files, setFiles] = useState<BankFile[] | null>(null);
  const [scanning, setScanning] = useState(false);
  const [summary, setSummary] = useState<string | null>(null);

  const load = () => api<{ files: BankFile[] }>('GET', '/bank/status').then((r) => setFiles(r.files)).catch(() => setFiles([]));
  useEffect(() => { void load(); }, []);

  async function rescan() {
    setScanning(true);
    try {
      const r = await api<{ scanned: number; imported: number; changed: number; errors: number; skipped: number; files: BankFile[] }>('POST', '/bank/scan');
      setFiles(r.files);
      setSummary(`扫描 ${r.scanned} 个文件：新入库 ${r.imported} · 内容更新 ${r.changed} · 错误 ${r.errors} · 无变化 ${r.skipped}`);
      if (r.imported > 0 || r.changed > 0) onRefresh();
    } catch (e) { setSummary((e as Error).message); } finally { setScanning(false); }
  }

  return <div>
    <div className="report-actions" style={{ marginBottom: 12 }}>
      <button className="button button-primary" disabled={scanning} onClick={() => void rescan()}>{scanning ? '扫描中…' : '重新扫描'}</button>
      {summary && <span className="tag tag-blue" role="status">{summary}</span>}
    </div>
    <p className="form-note" style={{ marginBottom: 12 }}>
      把符合规格的 &lt;年份&gt;.json 放进 shiti-workbench/question_bank/&lt;科目&gt;/（如 NETEM_English_I/2000.json），系统每 5 秒自动扫描入库；文件内容修订会生成新题目版本，已答过的练习不受影响。下划线开头的文件是规格文档，不导入。
    </p>
    {files === null ? <div className="bank-empty">加载中…</div>
        : files.length === 0 ? <div className="bank-empty state-mascot-block"><img className="state-mascot" src="/images/mascots/no_data.png" alt="" />题库目录还没有已识别的试卷，转换好的试卷放入后会自动出现。</div>
        : files.map((f) => (
          <div className="bank-file" key={f.path}>
            <code>{f.path}</code>{' '}
            <span className={`tag ${f.status === 'imported' ? 'tag-ok' : 'tag-err'}`}>{f.status === 'imported' ? '已入库' : '校验错误'}</span>
            {f.issues.filter((i) => i.level === 'warning').length > 0 && <span className="tag tag-warn" style={{ marginLeft: 6 }}>警告 {f.issues.filter((i) => i.level === 'warning').length}</span>}
            {f.status === 'error' && <div className="issues">{f.issues.filter((i) => i.level === 'error').slice(0, 5).map((i, k) => <div key={k}>{i.question_id ? `[${i.question_id}] ` : ''}{i.message}</div>)}</div>}
            <div className="form-note" style={{ marginTop: 6 }}>扫描于 {fmtTime(f.scanned_at)}</div>
          </div>
        ))}
  </div>;
}

function ImportWizard({ onDone }: { onDone: () => void }) {
  const { notify } = useToast();
  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [content, setContent] = useState('');
  const [fileName, setFileName] = useState('');
  const [preview, setPreview] = useState<ImportPreview | null>(null);
  const [ackWarnings, setAckWarnings] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<{ set_version_id: string; question_count: number } | null>(null);

  async function readFile(f: File) {
    if (f.size > 10 * 1024 * 1024) { setError('文件超过 10MB 上限'); return; }
    setFileName(f.name);
    setContent(await f.text());
    setPreview(null);
    setStep(2);
  }

  async function validate() {
    setBusy(true); setError(null);
    try { setPreview(await api<ImportPreview>('POST', '/imports', { content })); setAckWarnings(false); }
    catch (e) { setError((e as Error).message); } finally { setBusy(false); }
  }

  async function commit() {
    if (!preview) return;
    setBusy(true); setError(null);
    try {
      const warnings = preview.issues.filter((i) => i.level === 'warning').map((i) => i.code);
      const r = await api<{ set_version_id: string; question_count: number }>('POST', `/imports/${preview.import_id}/commit`, { confirmed_warnings: warnings }, { 'idempotency-key': `commit-${preview.import_id}` });
      setDone(r); setStep(3); onDone(); notify(`已导入 ${r.question_count} 题`);
    } catch (e) { setError((e as Error).message); } finally { setBusy(false); }
  }

  if (done) return <div>
    <p style={{ fontSize: 12, color: '#7c8d6b' }}>已发布 {done.question_count} 题为一个新题集（幂等事务，重复点击不会重复建题）。</p>
    <div className="report-actions" style={{ marginTop: 12 }}><button className="button button-primary" onClick={() => { setStep(1); setDone(null); setContent(''); setFileName(''); }}>继续导入</button></div>
  </div>;

  return <div>
    <div className="step" aria-hidden><div className={step === 1 ? 'on' : ''}>1 选择与声明</div><div className={step === 2 ? 'on' : ''}>2 预览与校验</div><div className={step === 3 ? 'on' : ''}>3 确认发布</div></div>
    {step <= 2 && <div>
      <label className="form-note" style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
        <Upload size={14} />选择 JSON 文件
        <input type="file" accept=".json,application/json" onChange={(e) => { const f = e.target.files?.[0]; if (f) void readFile(f); }} />
      </label>
      <div className="form-note" style={{ margin: '8px 0' }}>{fileName || '或直接粘贴 JSON 内容：'}</div>
      <textarea className="import-area" value={content} spellCheck={false} onChange={(e) => setContent(e.target.value)} placeholder='{"meta":{…},"materials":[…],"questions":[…]}' />
      {error && <p className="tag tag-err" role="alert" style={{ marginTop: 8 }}>{error}</p>}
      <div className="report-actions" style={{ marginTop: 12 }}>
        <button className="button button-primary" disabled={busy || content.trim().length === 0} onClick={() => void validate()}>{busy ? '正在解析…' : '解析并校验'}</button>
      </div>
    </div>}
    {step === 2 && preview && <div style={{ marginTop: 16 }}>
      <p><span className="tag tag-ok">可导入 {preview.question_count - preview.error_count} 题</span>{' '}{preview.error_count > 0 && <span className="tag tag-err">错误 {preview.error_count}</span>}{' '}{preview.warning_count > 0 && <span className="tag tag-warn">警告 {preview.warning_count}</span>}</p>
      <div style={{ marginTop: 8 }}>
        {preview.issues.length === 0 && <div className="bank-empty">没有发现问题。</div>}
        {preview.issues.map((iss, i) => <div className="issue-row" key={i}><span className={`tag ${iss.level === 'error' ? 'tag-err' : 'tag-warn'}`}>{iss.level === 'error' ? '错误' : '警告'}</span><div>{iss.question_id && <code style={{ marginRight: 6 }}>{iss.question_id}</code>}{iss.message}{iss.field && <span style={{ color: '#a4b392' }}> · 字段 {iss.field}</span>}</div></div>)}
      </div>
      {preview.error_count === 0 && preview.warning_count > 0 && <p style={{ marginTop: 10 }}><label className="form-note"><input type="checkbox" checked={ackWarnings} onChange={(e) => setAckWarnings(e.target.checked)} /> 我已确认上述警告（例如部分题目没有可判分答案，将按待评处理）。</label></p>}
      <div className="report-actions" style={{ marginTop: 12 }}>
        <button className="button button-quiet" onClick={() => { setStep(1); setPreview(null); }}>返回修改</button>
        <button className="button button-primary" disabled={busy || preview.error_count > 0 || (preview.warning_count > 0 && !ackWarnings)} onClick={() => void commit()}>{busy ? '正在发布…' : `导入 ${preview.question_count - preview.error_count} 题`}</button>
      </div>
    </div>}
  </div>;
}
