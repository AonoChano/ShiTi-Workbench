import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { ArrowLeft, ArrowRight, CheckCircle2, Clock3, FileText, Lightbulb, List, Pause, Play, X } from 'lucide-react';
import { api, uuid } from '../api';
import { navigate } from '../router';
import Modal from '../components/Modal';
import { QuestionNavigator } from '../components/QuestionNavigator';
import type { NavigatorGroup } from '../components/QuestionNavigator';
import { clientInstanceId, fmtDuration, isAnswered, typeLabel } from './practiceShared';
import type { AttemptDTO, Draft, ItemDTO, SetSection } from './practiceTypes';

interface QueuedAction { action_id: string; client_seq: number; attempt_item_id: string; expected_draft_revision: number; event_type: string; changed_fields: Record<string, unknown>; occurred_at: string }

type SaveState = { kind: 'saved'; at: string } | { kind: 'syncing' } | { kind: 'staged' } | { kind: 'error'; n: number } | { kind: 'offline' };

function SaveChip({ state, onRetry }: { state: SaveState; onRetry: () => void }) {
  if (state.kind === 'saved') return <span className="save-chip ok" aria-live="polite">已保存 · {state.at}</span>;
  if (state.kind === 'syncing') return <span className="save-chip">正在记录…</span>;
  if (state.kind === 'staged') return <span className="save-chip warn">已暂存浏览器，正在同步…</span>;
  if (state.kind === 'error') return <span className="save-chip err" aria-live="assertive">尚有修改未同步 <button onClick={onRetry}>重试</button></span>;
  return <span className="save-chip err">无法保存，请先复制当前答案</span>;
}

/** 组卷惯例：分值 ≥ 10 分的主观题视为作文，提供标题输入（标题与正文合成存储在 answer.text 首段）。 */
function isEssay(item: ItemDTO): boolean {
  return item.type === 'free_text' && item.max_score_units >= 1000;
}

function roman(n: number): string {
  const table: Array<[number, string]> = [[100, 'C'], [90, 'XC'], [50, 'L'], [40, 'XL'], [10, 'X'], [9, 'IX'], [5, 'V'], [4, 'IV'], [1, 'I']];
  let out = '';
  for (const [v, s] of table) { while (n >= v) { out += s; n -= v; } }
  return out || 'I';
}

export function Practice({ path }: { path: string }) {
  const attemptId = path.split('/').pop() ?? '';
  const [dto, setDto] = useState<AttemptDTO | null>(null);
  const [drafts, setDrafts] = useState<Record<string, Draft>>({});
  const [current, setCurrent] = useState(0);
  const [saveState, setSaveState] = useState<SaveState>({ kind: 'syncing' });
  const [showSubmit, setShowSubmit] = useState(false);
  const [showQuit, setShowQuit] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [nowTick, setNowTick] = useState(Date.now());
  const [toast, setToast] = useState<string | null>(null);
  const [abandoned, setAbandoned] = useState(false);
  // 扉页：翻页流中的一页。seenSections 已读过的大题；frontOverride 手动查看（顶栏点击）
  const [seenSections, setSeenSections] = useState<Set<string>>(() => {
    try { return new Set(JSON.parse(sessionStorage.getItem(`shiti-front-${attemptId}`) ?? '[]') as string[]); } catch { return new Set(); }
  });
  const [frontOverride, setFrontOverride] = useState<string | null>(null);
  const [sheetCollapsed, setSheetCollapsed] = useState(() => localStorage.getItem('shiti-sheet-collapsed') === '1');
  const [navOpen, setNavOpen] = useState(false); // 移动端题目导航抽屉

  const queueRef = useRef<QueuedAction[]>([]);
  const seqRef = useRef(0);
  const epochRef = useRef(1);
  const flushTimer = useRef<number | null>(null);
  const lastAckRef = useRef<string>('');
  const sheetItemRefs = useRef<Map<string, HTMLElement>>(new Map());

  const load = useCallback(async () => {
    const d = await api<AttemptDTO>('GET', `/attempts/${attemptId}`);
    if (d.state === 'submitted') { navigate(`/attempts/${attemptId}/report`); return; }
    if (d.state === 'abandoned') { setAbandoned(true); setDto(d); return; }
    epochRef.current = d.writer_epoch;
    const ds: Record<string, Draft> = {};
    for (const it of d.items) {
      ds[it.attempt_item_id] = {
        answer: it.draft?.answer ?? null,
        confidence: it.draft?.confidence ?? null,
        reasoning: it.draft?.reasoning ?? null,
        flagged: it.draft?.flagged ?? false,
        revision: it.draft?.revision ?? 0,
      };
    }
    setDto(d);
    setDrafts(ds);
  }, [attemptId]);

  useEffect(() => { void load(); }, [load]);

  useEffect(() => {
    const t = setInterval(() => setNowTick(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);

  // 租约续期：每 10s
  useEffect(() => {
    if (!dto || dto.state !== 'in_progress') return;
    const t = setInterval(() => {
      void api('POST', `/attempts/${attemptId}/lease`, { client_instance_id: clientInstanceId(), takeover: false })
        .then((r) => { epochRef.current = (r as { writer_epoch: number }).writer_epoch; })
        .catch(() => { /* 到期后下一条动作会收到 LEASE_LOST，再统一处理 */ });
    }, 10_000);
    return () => clearInterval(t);
  }, [dto?.state, attemptId]);

  const flush = useCallback(async () => {
    if (queueRef.current.length === 0 || !dto) return;
    const batch = queueRef.current.slice(0, 50);
    try {
      const res = await api<{ results: Array<{ action_id: string; ok: boolean; accepted_revision?: number; error_code?: string; message?: string; conflict_revision?: number }> }>(
        'POST', `/attempts/${attemptId}/actions`,
        { writer_epoch: epochRef.current, actions: batch.map(({ action_id, client_seq, attempt_item_id, expected_draft_revision, event_type, changed_fields, occurred_at }) => ({ action_id, client_seq, attempt_item_id, expected_draft_revision, event_type, changed_fields, occurred_at })) },
      );
      const acked = new Set<string>();
      let conflicted = false;
      for (const r of res.results) {
        if (r.ok) {
          acked.add(r.action_id);
          if (typeof r.accepted_revision === 'number') {
            const qa = batch.find((b) => b.action_id === r.action_id);
            if (qa) setDrafts((prev) => {
              const d = prev[qa.attempt_item_id];
              if (!d) return prev;
              return { ...prev, [qa.attempt_item_id]: { ...d, revision: Math.max(d.revision, r.accepted_revision ?? 0) } };
            });
          }
          lastAckRef.current = new Date().toLocaleTimeString('zh-CN', { hour12: false });
        } else if (r.error_code === 'REVISION_CONFLICT' || r.error_code === 'LEASE_LOST') {
          conflicted = true;
        }
      }
      queueRef.current = queueRef.current.filter((q) => !acked.has(q.action_id) && !conflicted);
      if (conflicted) {
        queueRef.current = [];
        setSaveState({ kind: 'error', n: 0 });
        setToast('这条记录已在别处更新，已载入最新内容');
        await load();
      } else {
        setSaveState(queueRef.current.length > 0 ? { kind: 'staged' } : { kind: 'saved', at: lastAckRef.current });
      }
    } catch {
      setSaveState({ kind: 'error', n: queueRef.current.length });
    }
  }, [attemptId, dto, load]);

  const enqueue = useCallback((action: Omit<QueuedAction, 'action_id' | 'client_seq' | 'occurred_at'>, opts?: { immediate?: boolean }) => {
    const full: QueuedAction = { ...action, action_id: uuid(), client_seq: ++seqRef.current, occurred_at: new Date().toISOString() };
    queueRef.current.push(full);
    setSaveState({ kind: 'syncing' });
    // 本地乐观 revision 前移，下一条动作基于新版本
    setDrafts((prev) => {
      const d = prev[action.attempt_item_id];
      if (!d) return prev;
      const nf = { ...d };
      if ('answer' in action.changed_fields) nf.answer = action.changed_fields['answer'] ?? null;
      if ('confidence' in action.changed_fields) nf.confidence = (action.changed_fields['confidence'] as string | null) ?? null;
      if ('reasoning' in action.changed_fields) nf.reasoning = (action.changed_fields['reasoning'] as string | null) ?? null;
      if ('flagged' in action.changed_fields) nf.flagged = Boolean(action.changed_fields['flagged']);
      return { ...prev, [action.attempt_item_id]: { ...nf, revision: d.revision + 1 } };
    });
    if (opts?.immediate) {
      if (flushTimer.current) { clearTimeout(flushTimer.current); flushTimer.current = null; }
      void flush();
    } else {
      if (flushTimer.current) clearTimeout(flushTimer.current);
      flushTimer.current = window.setTimeout(() => void flush(), 800);
    }
  }, [flush]);

  useEffect(() => {
    const onBlur = () => void flush();
    window.addEventListener('blur', onBlur);
    return () => window.removeEventListener('blur', onBlur);
  }, [flush]);

  useEffect(() => {
    const h = (e: BeforeUnloadEvent) => {
      if (queueRef.current.length > 0) { e.preventDefault(); e.returnValue = ''; }
    };
    window.addEventListener('beforeunload', h);
    return () => window.removeEventListener('beforeunload', h);
  }, []);

  const items = dto?.items ?? [];
  const cur = items[current];
  const curDraft = cur ? drafts[cur.attempt_item_id] ?? null : null;
  const answeredCount = useMemo(
    () => items.filter((it) => isAnswered(drafts[it.attempt_item_id])).length,
    [items, drafts],
  );
  const flaggedCount = items.filter((it) => drafts[it.attempt_item_id]?.flagged).length;
  const pendingCount = queueRef.current.length;

  const paused = dto?.state === 'paused';
  const sections = dto?.sections ?? [];
  // 答题卡按"篇"（材料）分组：完形/每篇阅读各一组；无材料的题（写作等）按 section 归组
  // 专项练习：组标题用归一化题型名 + 罗马数字篇序（"完形填空专项 · II"），不暴露各卷原始命名
  const isDrill = dto?.set_title.startsWith('专项练习') ?? false;
  const sheetGroups = useMemo(() => {
    const cleanTitle = (t: string) => {
      const last = t.split(' · ').pop() ?? t;
      return last.replace(/(原文|短文)$/, '').trim() || t;
    };
    const groups: Array<{ key: string; title: string; sectionId: string | null; items: ItemDTO[] }> = [];
    const index = new Map<string, number>();
    for (const it of items) {
      const key = it.material ? `m:${it.material.id}` : `s:${it.section ?? 'none'}`;
      let gi = index.get(key);
      if (gi === undefined) {
        gi = groups.length;
        index.set(key, gi);
        const title = it.material ? cleanTitle(it.material.title) : it.section ? (it.section.split(' · ').pop() ?? it.section) : '其他题目';
        groups.push({ key, title, sectionId: it.section ?? null, items: [] });
      }
      groups[gi]!.items.push(it);
    }
    // 同名子组消歧（不同年份都有 "Passage 1"…）：追加题号范围（专项模式由导航组件用罗马数字编号）
    if (!isDrill) {
      const titleCount = new Map<string, number>();
      for (const g of groups) titleCount.set(g.title, (titleCount.get(g.title) ?? 0) + 1);
      for (const g of groups) {
        if ((titleCount.get(g.title) ?? 0) > 1 && g.items.length > 0) {
          g.title = `${g.title} · ${g.items[0]!.order}–${g.items[g.items.length - 1]!.order}`;
        }
      }
    }
    return groups;
  }, [items, isDrill]);

  const currentSection = sections.find((s) => s.id === cur?.section) ?? null;
  const pendingFront = currentSection !== null && !seenSections.has(currentSection.id);
  const showFront = !paused && !abandoned && (frontOverride !== null || pendingFront);
  const frontSection = frontOverride ? sections.find((s) => s.id === frontOverride) ?? currentSection : currentSection;
  const frontItems = frontSection ? items.filter((it) => it.section === frontSection.id) : [];
  const frontRange = frontItems.length > 0 ? `第 ${frontItems[0].order}–${frontItems[frontItems.length - 1].order} 题` : '';
  const frontViewMode = showFront && frontSection !== null;

  function markSeen(id: string) {
    setSeenSections((prev) => {
      if (prev.has(id)) return prev;
      const next = new Set(prev).add(id);
      try { sessionStorage.setItem(`shiti-front-${attemptId}`, JSON.stringify([...next])); } catch { /* 隐私模式忽略 */ }
      return next;
    });
  }

  function confirmFront() {
    if (frontSection) markSeen(frontSection.id);
    setFrontOverride(null);
    if (frontItems.length > 0) setCurrent(items.indexOf(frontItems[0]));
  }

  function gotoItem(item: ItemDTO) {
    if (item.section) markSeen(item.section);
    setFrontOverride(null);
    void flush();
    setCurrent(items.indexOf(item));
  }

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement;
      if (t && (t.tagName === 'TEXTAREA' || t.tagName === 'INPUT')) return;
      if (showSubmit || showQuit) return;
      if (e.ctrlKey && e.key === 'Enter') { setShowSubmit(true); return; }
      if (/^[1-9]$/.test(e.key) && curOptions) {
        const opt = curOptions[Number(e.key) - 1];
        if (opt) selectOption(opt.id);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  // 完形组卷模式：同一篇材料全是短选项单选（一空一个单词/短语）时，一屏做完所有空，
  // 选项按试卷版式一行多个，选中的词直接填进原文空格。新题型/阅读选项是长句，仍逐题作答。
  const matGroup = useMemo(() => {
    if (!cur || !cur.material) return [];
    return items.filter((it) => it.material?.id === cur.material?.id).sort((a, b) => a.order - b.order);
  }, [items, cur]);
  const groupMode = useMemo(() =>
    matGroup.length >= 2
    && matGroup.every((q) => q.type === 'single_choice' && q.options && q.options.length > 0)
    && matGroup.every((q) => (q.options ?? []).every((o) => o.text.length <= 20)),
  [matGroup]);
  const blankMap = useMemo(() => {
    const map = new Map<string, ItemDTO>();
    for (const q of matGroup) {
      const m = q.stem.match(/第\s*(\d+)\s*空/);
      if (m?.[1]) map.set(m[1], q);
    }
    return map;
  }, [matGroup]);
  const blankNo = (q: ItemDTO): string => q.stem.match(/第\s*(\d+)\s*空/)?.[1] ?? q.stem.match(/(\d+)/)?.[1] ?? String(q.order);

  // 完形组卷模式：当前空位的选项行保持在可视区
  useEffect(() => {
    if (!groupMode || !cur || frontViewMode) return;
    document.querySelector(`.cloze-row[data-item="${cur.attempt_item_id}"]`)?.scrollIntoView({ block: 'nearest' });
  }, [current, groupMode, cur, frontViewMode]);

  const curOptions = cur?.options && cur.options.length > 0 ? cur.options : null;
  const isChoice = curOptions !== null;
  const curImages = cur && !isChoice ? cur.images ?? null : null;
  const stemLines = cur && !isChoice ? cur.stem.split('\n').filter((l) => l.trim().length > 0) : [];
  const curIsEssay = cur ? isEssay(cur) : false;
  // 作文标题/正文拆装：存储仍是 {text}（title + 空行 + body），判分、报告、复盘零改动
  const fullText = (curDraft?.answer as { text?: string } | null)?.text ?? '';
  const titleMatch = curIsEssay ? fullText.match(/^([^\n]{1,120})\n\n([\s\S]*)$/) : null;
  const essayTitle = titleMatch ? titleMatch[1] ?? '' : '';
  const essayBody = titleMatch ? titleMatch[2] ?? '' : curIsEssay ? fullText : fullText;
  // 新题型（7选5/排序/小标题）：同一组选项在多个空之间共用，标记已被其他空占用的选项
  const usedByOther = useMemo(() => {
    const map = new Map<string, number[]>();
    if (!curOptions) return map;
    for (const it of items) {
      if (it.attempt_item_id === cur?.attempt_item_id) continue;
      const a = drafts[it.attempt_item_id]?.answer as { selected_option_ids?: string[] } | null;
      for (const oid of a?.selected_option_ids ?? []) {
        const arr = map.get(oid) ?? [];
        arr.push(it.order);
        map.set(oid, arr);
      }
    }
    return map;
  }, [items, drafts, cur, curOptions]);

  // 小标题匹配子类型：来自 section/材料标题的“小标题”标注（转换规格约定，新题型空位渲染用）
  const curSectionTitle = sections.find((s) => s.id === cur?.section)?.title ?? '';
  const headingMatch = /小标题|heading/i.test(`${curSectionTitle} ${matOf(cur)?.title ?? ''}`);

  function setText(text: string) {
    if (!cur) return;
    enqueue({ attempt_item_id: cur.attempt_item_id, expected_draft_revision: drafts[cur.attempt_item_id]?.revision ?? 0, event_type: 'answer_changed', changed_fields: { answer: { text } } });
  }
  function setEssayParts(title: string, body: string) {
    setText(title.trim() ? `${title.trim()}\n\n${body}` : body);
  }

  function selectOptionFor(item: ItemDTO, optId: string) {
    if (!dto || dto.state === 'paused') return;
    const isSingle = item.type !== 'multiple_choice';
    const prev = (drafts[item.attempt_item_id]?.answer ?? null) as { selected_option_ids?: string[] } | null;
    let next: string[];
    if (isSingle || !prev?.selected_option_ids) next = [optId];
    else next = prev.selected_option_ids.includes(optId) ? prev.selected_option_ids.filter((x) => x !== optId) : [...prev.selected_option_ids, optId];
    enqueue(
      { attempt_item_id: item.attempt_item_id, expected_draft_revision: drafts[item.attempt_item_id]?.revision ?? 0, event_type: 'answer_changed', changed_fields: { answer: { selected_option_ids: next } } },
      { immediate: true },
    );
  }

  function selectOption(optId: string) {
    if (cur) selectOptionFor(cur, optId);
  }

  function clearAnswer() {
    if (!cur) return;
    enqueue({ attempt_item_id: cur.attempt_item_id, expected_draft_revision: drafts[cur.attempt_item_id]?.revision ?? 0, event_type: 'answer_changed', changed_fields: { answer: null } }, { immediate: true });
  }

  async function togglePause() {
    if (!dto) return;
    try {
      if (dto.state === 'in_progress') {
        await api('POST', `/attempts/${attemptId}/pause`, { writer_epoch: epochRef.current, expected_revision: dto.revision });
      } else {
        await api('POST', `/attempts/${attemptId}/resume`, { writer_epoch: epochRef.current, expected_revision: dto.revision });
      }
      await load();
    } catch (e) { setToast((e as Error).message); }
  }

  async function doQuit() {
    if (!dto) return;
    try {
      await api('POST', `/attempts/${attemptId}/abandon`, { confirmation: true, expected_revision: dto.revision });
      navigate('/papers');
    } catch (e) { setToast((e as Error).message); setShowQuit(false); }
  }

  async function doSubmit() {
    if (!dto) return;
    setSubmitting(true); setSubmitError(null);
    try {
      await flush();
      if (queueRef.current.length > 0) { setSubmitError('尚有未同步的作答，不能交卷'); return; }
      await api('POST', `/attempts/${attemptId}/submit`, { expected_revision: dto.revision }, { 'idempotency-key': `submit-${attemptId}` });
      navigate(`/attempts/${attemptId}/report`);
    } catch (e) { setSubmitError((e as Error).message); } finally { setSubmitting(false); }
  }

  if (!dto) return <div className="practice-app"><div style={{ margin: 'auto', color: '#9aa88b', fontSize: 13 }}>加载中…</div></div>;

  if (abandoned) return (
    <div className="practice-app"><div className="pause-mask" style={{ position: 'static', flex: 1 }}><div className="pause-card">
      <h3>本次练习已放弃</h3>
      <p>草稿已保留但不再计入成绩。重新开始将从第一题重新作答。</p>
      <button className="button button-primary" onClick={() => navigate('/papers')}>返回题库</button>
    </div></div></div>
  );

  if (dto.state === 'draft') return (
    <div className="practice-app"><div className="pause-mask" style={{ position: 'static', flex: 1 }}><div className="pause-card">
      <h3>准备开始</h3>
      <p>{dto.set_title} · 训练模式 · 共 {dto.items.length} 题<br />「开始练习」将固定题目版本快照并开始计时；作答自动保存到本机，交卷前不显示答案。</p>
      <button className="button button-primary" onClick={async () => {
        await api('POST', `/attempts/${attemptId}/start`, { expected_revision: dto.revision, client_instance_id: clientInstanceId() }, { 'idempotency-key': `start-${attemptId}` });
        await load();
      }}>开始练习</button>
    </div></div></div>
  );

  const wallMs = dto.started_at ? nowTick - Date.parse(dto.started_at) : 0;

  // 完形组卷模式：把原文里的 __N__ 空位渲染成可点选的填空位，显示已选单词、点击切换到该空
  function renderPassageWithBlanks(text: string): ReactNode {
    const parts = text.split(/(__\d+__)/);
    return parts.map((p, i) => {
      const m = p.match(/^__(\d+)__$/);
      if (!m?.[1]) return <span key={i}>{p}</span>;
      const q = blankMap.get(m[1]);
      if (!q) return <span key={i}>{p}</span>;
      const selId = ((drafts[q.attempt_item_id]?.answer ?? null) as { selected_option_ids?: string[] } | null)?.selected_option_ids?.[0];
      const word = q.options?.find((o) => o.id === selId)?.text;
      return <button key={i} className={`blank-fill${word ? ' is-filled' : ''}${cur?.attempt_item_id === q.attempt_item_id ? ' is-current' : ''}`} onClick={() => gotoItem(q)} title={`第 ${m[1]} 空`}>{word ?? m[1]}</button>;
    });
  }

  // 新题型材料：空位显示作答状态——小标题题回填粗体标题，其余显示选项字母（如 41[A]），
  // 未作答保持 __N__ 原样；当前题的空位高亮，点击跳到该题。完形一屏多空走 renderPassageWithBlanks。
  function renderNewTypeBlanks(text: string): ReactNode {
    if (!cur || !text.includes('__')) return text;
    return text.split(/(__\d+__)/).map((p, i) => {
      const m = p.match(/^__(\d+)__$/);
      if (!m?.[1]) return <span key={i}>{p}</span>;
      const q = blankMap.get(m[1]);
      if (!q) {
        const cm = cur.stem.match(/第\s*(\d+)\s*空/);
        return cm?.[1] === m[1] ? <mark key={i} className="stem-mark">{p}</mark> : <span key={i}>{p}</span>;
      }
      const isCur = cur.attempt_item_id === q.attempt_item_id;
      const opts = q.options ?? [];
      const selId = ((drafts[q.attempt_item_id]?.answer ?? null) as { selected_option_ids?: string[] } | null)?.selected_option_ids?.[0];
      const idx = selId ? opts.findIndex((o) => o.id === selId) : -1;
      if (idx < 0) return isCur ? <mark key={i} className="stem-mark">{p}</mark> : <span key={i}>{p}</span>;
      if (headingMatch) {
        return <mark key={i} className={`blank-slot is-heading${isCur ? ' is-current' : ''}`} onClick={() => gotoItem(q)} title={`第 ${m[1]} 空 · 点击跳转`}><b>{opts[idx]!.text}</b></mark>;
      }
      const letter = opts[idx]!.id.match(/-([a-h])$/i)?.[1]?.toUpperCase() ?? String.fromCharCode(65 + idx);
      return <mark key={i} className={`blank-slot${isCur ? ' is-current' : ''}`} onClick={() => gotoItem(q)} title={`第 ${m[1]} 空 · 点击跳转`}>{m[1]}[{letter}]</mark>;
    });
  }

  // 材料正文中高亮当前题对应的完整句子（题干原文即材料子串；空白形态不一致时退回顺序匹配）
  function highlightStem(text: string): ReactNode {
    if (!cur || isChoice) return text;
    const stem = cur.stem.replace(/\s+/g, ' ').trim();
    if (stem.length < 12) return text;
    const wrap = (s: number, e: number): ReactNode => [text.slice(0, s), <mark key="hl" className="stem-mark">{text.slice(s, e)}</mark>, text.slice(e)];
    const direct = text.indexOf(stem);
    if (direct >= 0) return wrap(direct, direct + stem.length);
    // 慢路径：用题干前 60 字符在归一化文本中定位起点，再逐字符消费完整题干（跳过空白）
    const normalized = text.replace(/\s+/g, ' ');
    const idx = normalized.indexOf(stem.slice(0, 60));
    if (idx < 0) return text;
    const map: number[] = [];
    let j = 0;
    for (let i = 0; i < text.length; i++) {
      if (/\s/.test(text[i])) continue;
      if (j < normalized.length) { map[i] = j; j++; }
    }
    const startCandidates = Object.entries(map).filter(([, n]) => n === idx).map(([i]) => Number(i));
    const start = startCandidates.length > 0 ? startCandidates[0] : -1;
    if (start < 0) return text;
    let end = start;
    let si = 0;
    while (end < text.length && si < stem.length) {
      if (/\s/.test(text[end])) { end++; continue; }
      if (stem[si] === ' ') { si++; continue; }
      if (text[end] !== stem[si]) return text;
      end++;
      si++;
    }
    return si >= stem.length ? wrap(start, end) : text;
  }

  return (
    <div className="practice-app">
      <header className="practice-toolbar">
        <span className="practice-type"><FileText size={15} />{dto.set_title}<span className="toolbar-divider" />{currentSection && !frontViewMode && <button className="text-button" title="查看本部分说明（翻回扉页）" onClick={() => setFrontOverride(currentSection.id)}>{currentSection.part ? `${currentSection.part} · ` : ''}{currentSection.title}</button>}{currentSection && !frontViewMode && <span className="toolbar-divider" />}{frontViewMode ? '本部分说明' : paused ? '已暂停' : `已作答 ${answeredCount} / ${items.length} 题`}</span>
        <div className="practice-toolbar-actions">
          <SaveChip state={saveState} onRetry={() => void flush()} />
          <span><Clock3 size={14} />{fmtDuration(wallMs)}</span>
          <button className="text-button" onClick={() => void togglePause()}>{paused ? <><Play size={14} />继续</> : <><Pause size={14} />暂停</>}</button>
          <button className="text-button" onClick={() => setShowQuit(true)}>退出</button>
          <button className="button button-primary" style={{ height: 30, fontSize: 11 }} onClick={() => setShowSubmit(true)}>交卷</button>
        </div>
      </header>

      {paused ? (
        <div className="pause-mask"><div className="pause-card">
          <h3>已暂停</h3>
          <p>暂停期间不显示试题内容，时间也不会计入练习。</p>
          <button className="button button-primary" onClick={() => void togglePause()}>继续练习</button>
        </div></div>
      ) : (
        <div className={`practice-body ${sheetCollapsed ? 'sheet-collapsed' : ''}`}>
          {frontViewMode && frontSection ? (
            <>
              <section className="front-view-title">
                <span className="article-eyebrow">SECTION</span>
                <h1>{frontSection.part ? `${frontSection.part} · ` : ''}{frontSection.title}</h1>
                <p>{frontItems.length > 0 ? `本部分共 ${frontItems.length} 题（${frontRange}）` : '本部分暂无题目'}</p>
              </section>
              <section className="front-view-directions">
                <h3>Directions:</h3>
                {(frontSection.directions ?? ['本部分没有单独的作答说明。']).map((d, i) => <p key={i}>{d}</p>)}
                <button className="button button-primary" onClick={confirmFront}>下一页 · 开始作答{frontRange ? `（${frontRange}）` : ''}<ArrowRight size={15} /></button>
              </section>
            </>
          ) : (
            <>
              <article className="reading-passage">
                {matOf(cur) && <>
                  <span className="article-eyebrow">READING MATERIAL</span>
                  <h3>{matOf(cur)!.title}</h3>
                  <div className="passage-text">{matOf(cur)!.blocks.map((b) => <p className="para" key={b.id}><span className="pnum">{b.id.toUpperCase()}</span>{groupMode ? renderPassageWithBlanks(b.text) : isChoice ? renderNewTypeBlanks(b.text) : highlightStem(b.text)}</p>)}</div>
                </>}
                {cur && !isChoice && curIsEssay && <div className={matOf(cur) ? 'prompt-block' : ''}>
                  {!matOf(cur) && <span className="article-eyebrow">QUESTION {String(cur.order).padStart(2, '0')}</span>}
                  {matOf(cur) && <h3 className="prompt-heading">题目</h3>}
                  <div className="passage-text prompt-stem">{stemLines.map((line, i) => <p key={i}>{line}</p>)}</div>
                  {curImages && curImages.length > 0 && <div className="prompt-images">{curImages.map((img) => <img className="prompt-image" key={img} src={`/api/v1/paper-image?src=${encodeURIComponent(img)}`} alt="题目配图" />)}</div>}
                </div>}
                {cur && !isChoice && !curIsEssay && curImages && curImages.length > 0 && <div className={matOf(cur) ? 'prompt-block' : ''}>
                  {matOf(cur) && <h3 className="prompt-heading">题目配图</h3>}
                  <div className="prompt-images">{curImages.map((img) => <img className="prompt-image" key={img} src={`/api/v1/paper-image?src=${encodeURIComponent(img)}`} alt="题目配图" />)}</div>
                </div>}
                {cur && isChoice && !matOf(cur) && <div className="passage-text"><p>本题无共享材料。</p></div>}
                {cur && !isChoice && !curIsEssay && !matOf(cur) && !(curImages && curImages.length > 0) && <div className="passage-text"><p>本题无共享材料，题目与作答区在右侧。</p></div>}
                <div className="article-note"><Lightbulb size={15} />段落编号（如 P1、P2）用于复盘时引用证据。快捷键：数字键选选项，Ctrl+Enter 交卷。</div>
              </article>

          <section className="question-pane">
            {cur && groupMode ? <div className="cloze-sheet">
              <span className="article-eyebrow">CLOZE · 点选单词，填入左侧原文空格</span>
              {matGroup.map((q) => {
                const selIds = ((drafts[q.attempt_item_id]?.answer ?? null) as { selected_option_ids?: string[] } | null)?.selected_option_ids ?? [];
                return <div key={q.attempt_item_id} data-item={q.attempt_item_id} className={`cloze-row${cur?.attempt_item_id === q.attempt_item_id ? ' is-current' : ''}`}>
                  <span className="cloze-row-label">第 {blankNo(q)} 空</span>
                  <div className="cloze-chips">
                    {(q.options ?? []).map((o) => <button key={o.id} className={`cloze-chip${selIds.includes(o.id) ? ' is-selected' : ''}`} onClick={() => { if (cur?.attempt_item_id !== q.attempt_item_id) setCurrent(items.indexOf(q)); selectOptionFor(q, o.id); }} aria-pressed={selIds.includes(o.id)}>{o.text}</button>)}
                  </div>
                </div>;
              })}
            </div>
            : cur && <>
              {isChoice ? <div className="question-content" key={cur.attempt_item_id}>
                    <span className="question-label">QUESTION {String(cur.order).padStart(2, '0')} · {typeLabel(cur.type)} · 满分 {cur.max_score_units / 100} 分</span>
                    <h3>{cur.stem}</h3>
                    {curOptions && <div className="answer-options" role={cur.type === 'multiple_choice' ? 'group' : 'radiogroup'} aria-label="选项">
                      {curOptions.map((o, i) => {
                        const sel = ((curDraft?.answer ?? null) as { selected_option_ids?: string[] } | null)?.selected_option_ids?.includes(o.id) ?? false;
                        const used = usedByOther.get(o.id);
                        return <button key={o.id} className={`answer-option ${sel ? 'is-selected' : ''}`} onClick={() => selectOption(o.id)} aria-pressed={sel}>
                          <span className="option-letter">{String.fromCharCode(65 + i)}</span><span>{o.text}</span>
                          {used && used.length > 0 && <span className="option-used">已用于第 {used.join('、')} 空</span>}
                        </button>;
                      })}
                    </div>}
                  </div>
                  : <div className="written-question subjective-answer" key={cur.attempt_item_id}>
                    <span className="question-label" style={{ marginTop: 0 }}>QUESTION {String(cur.order).padStart(2, '0')} · {typeLabel(cur.type)} · 满分 {cur.max_score_units / 100} 分</span>
                    {!curIsEssay && <div className="subjective-stem">{stemLines.map((line, i) => <p key={i}>{line}</p>)}</div>}
                    {curIsEssay && <p className="essay-side-hint">题目与配图在左侧，在这里专注写作。</p>}
                    {curIsEssay && <label className="essay-title-row"><span>标题</span><input aria-label="作文标题" placeholder="为你的作文起一个标题…" value={essayTitle} onChange={(e) => setEssayParts(e.target.value, essayBody)} /></label>}
                    <div className={`answer-lines ${curIsEssay ? 'essay' : 'short'}`}>
                      <textarea aria-label="你的答案" placeholder={cur.type === 'fill_blank' ? '填入你的答案…' : curIsEssay ? '在横线上写下你的作文…' : '在横线上写出你的译文…'} value={curIsEssay ? essayBody : fullText} onChange={(e) => curIsEssay ? setEssayParts(essayTitle, e.target.value) : setText(e.target.value)} onBlur={() => void flush()} />
                    </div>
                    <span className="word-count">{fullText.length} 字</span>
                  </div>}
                  <div className="optional-block">
                    <label>把握程度（可选）</label>
                    <div className="seg" role="radiogroup" aria-label="把握程度">
                      {(['guess', 'uncertain', 'sure'] as const).map((c) => (
                        <button key={c} type="button" className={curDraft?.confidence === c ? 'on' : ''} onClick={() => enqueue({ attempt_item_id: cur.attempt_item_id, expected_draft_revision: drafts[cur.attempt_item_id]?.revision ?? 0, event_type: 'confidence_changed', changed_fields: { confidence: curDraft?.confidence === c ? null : c } }, { immediate: true })}>
                          {c === 'guess' ? '猜测' : c === 'uncertain' ? '不确定' : '确定'}
                        </button>
                      ))}
                    </div>
                    <label style={{ marginTop: 12 }}>我的思路（可选，仅自述记录，交卷后锁定）</label>
                    <textarea value={curDraft?.reasoning ?? ''} onChange={(e) => enqueue({ attempt_item_id: cur.attempt_item_id, expected_draft_revision: drafts[cur.attempt_item_id]?.revision ?? 0, event_type: 'reasoning_changed', changed_fields: { reasoning: e.target.value } })} onBlur={() => void flush()} placeholder="记录你当时为什么这样选…" />
                  </div>
                </>}
              </section>
            </>
          )}

          <aside className={`sheet-sidebar ${sheetCollapsed ? 'is-collapsed' : ''}`} aria-label="题目导航">
            <QuestionNavigator
              title={dto.set_title}
              sections={sections}
              groups={sheetGroups as NavigatorGroup[]}
              drafts={drafts}
              current={current}
              items={items}
              gotoItem={gotoItem}
              collapsed={sheetCollapsed}
              onCollapsedChange={(v) => { setSheetCollapsed(v); localStorage.setItem('shiti-sheet-collapsed', v ? '1' : '0'); }}
              followScroll={!frontViewMode}
              frontActive={frontViewMode}
              frontSectionId={frontSection?.id ?? null}
              drill={isDrill}
            />
          </aside>
        </div>
      )}

      <footer className="practice-footer">
        <span className="autosave"><span className="status-dot" />作答自动保存到本机工作区</span>
        {!frontViewMode && <div>
          <button className="button button-quiet" disabled={current === 0} onClick={() => { void flush(); setCurrent(current - 1); }}><ArrowLeft size={15} />上一题</button>
          <button className="button button-quiet" onClick={clearAnswer} title="清空本题作答">清空本题</button>
          <button className={`flag-button ${curDraft?.flagged ? 'on' : ''}`} onClick={() => cur && enqueue({ attempt_item_id: cur.attempt_item_id, expected_draft_revision: drafts[cur.attempt_item_id]?.revision ?? 0, event_type: 'flag_changed', changed_fields: { flagged: !curDraft?.flagged } }, { immediate: true })}>{curDraft?.flagged ? '取消标记' : '标记待查'}</button>
          {cur !== undefined && current < items.length - 1
            ? <button className="button button-primary" onClick={() => { void flush(); setCurrent(current + 1); }}>下一题<ArrowRight size={15} /></button>
            : <button className="button button-primary" onClick={() => setShowSubmit(true)}>交卷<CheckCircle2 size={15} /></button>}
        </div>}
      </footer>

      {/* 移动端题目导航：浮动按钮 + 抽屉（<1024px 显示，桌面隐藏） */}
      {!frontViewMode && <button className="qnav-fab" onClick={() => setNavOpen(true)} aria-label="打开题目导航">
        <List size={16} />题目<span className="qnav-fab-badge">{items.length - answeredCount}</span>
      </button>}
      <div className={`qnav-drawer${navOpen ? ' is-open' : ''}`} aria-hidden={!navOpen}>
        <button className="qnav-drawer-scrim" aria-label="关闭题目导航" onClick={() => setNavOpen(false)} tabIndex={navOpen ? 0 : -1} />
        <div className="qnav-drawer-panel" role="dialog" aria-label="题目导航">
          <div className="qnav-drawer-head">
            <span>题目导航</span>
            <button className="icon-button" onClick={() => setNavOpen(false)} aria-label="关闭"><X size={17} /></button>
          </div>
          <QuestionNavigator
            title={dto.set_title}
            sections={sections}
            groups={sheetGroups as NavigatorGroup[]}
            drafts={drafts}
            current={current}
            items={items}
            gotoItem={(it) => { gotoItem(it); setNavOpen(false); }}
            collapsed={false}
            followScroll={navOpen && !frontViewMode}
            frontActive={frontViewMode}
            frontSectionId={frontSection?.id ?? null}
            drill={isDrill}
          />
        </div>
      </div>

      {showSubmit && <Modal title="确认交卷" subtitle="交卷后原始作答与判分快照不可改写" onClose={() => setShowSubmit(false)}>
        <div className="modal-form">
          <ul className="form-note" style={{ paddingLeft: 18, lineHeight: 2.1 }}>
            <li>已答 <b>{answeredCount} / {items.length}</b> 题{items.map((it) => ({ n: it.order, answered: isAnswered(drafts[it.attempt_item_id]) })).filter((x) => !x.answered).map((x) => x.n).length > 0 && <>；未答：第 {items.map((it) => ({ n: it.order, answered: isAnswered(drafts[it.attempt_item_id]) })).filter((x) => !x.answered).map((x) => x.n).join('、')} 题</>}</li>
            <li>客观自动判分 {items.filter((i) => i.has_answer_key).length} 题；无答案/主观待评 {items.filter((i) => !i.has_answer_key).length} 题（待评不算零分）</li>
            <li>待同步 {pendingCount} 处；报告将自动生成，可直接导出 Markdown 给 AI 复盘。</li>
          </ul>
          {pendingCount > 0 && <span className="tag tag-warn" role="alert">尚有 {pendingCount} 处未同步，正在重试同步…</span>}
          {submitError && <span className="tag tag-err" role="alert">{submitError}</span>}
          <div className="form-actions">
            <button type="button" className="button button-quiet" onClick={() => setShowSubmit(false)} autoFocus>返回作答</button>
            <button className="button button-primary" disabled={submitting || pendingCount > 0} onClick={() => void doSubmit()}>{submitting ? '正在交卷…' : '仍然交卷'}</button>
          </div>
        </div>
      </Modal>}
      {showQuit && <Modal title="中途退出练习？" subtitle="这个决定会影响本次练习的成绩" onClose={() => setShowQuit(false)}>
        <div className="modal-form">
          <p className="form-note" style={{ lineHeight: 2 }}>
            已作答 <b>{answeredCount}</b> 题。退出将<b>放弃本次练习</b>：已答内容不计入成绩，之后重新开始将从<b>第一题</b>重新作答。
            <br />如果只是想歇一下，用「暂停」更合适——暂停会保留作答与进度。
          </p>
          <div className="form-actions">
            <button className="button button-primary" onClick={() => setShowQuit(false)} autoFocus>继续作答</button>
            <button className="button danger" onClick={() => void doQuit()}>放弃并退出</button>
          </div>
        </div>
      </Modal>}
      {toast && <div className="toast" role="status">{toast}</div>}
    </div>
  );
}

function matOf(item: ItemDTO | undefined) {
  return item?.material ?? null;
}
