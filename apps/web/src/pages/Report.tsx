import { useEffect, useState } from 'react';
import { Copy, Download, FileText, Lightbulb, Sparkles } from 'lucide-react';
import { api } from '../api';
import { fmtTime } from './Papers';

interface ResultsDTO {
  attempt_id: string;
  mode: string;
  grade_revision: number;
  aggregate: {
    earned: number; graded_max: number; total_max: number; pending_max: number;
    answered_count: number; correct_count: number; incorrect_count: number; unanswered_count: number;
    partial_count: number; pending_count: number; invalid_count: number;
    score_rate: { num: number; den: number } | null;
    objective_correct_rate: { num: number; den: number } | null;
    answered_correct_rate: { num: number; den: number } | null;
  };
  timing: { wall_ms: number; paused_ms: number; active_ms: number; unknown_ms: number; material_ms: number; quality: string };
  items: Array<{
    order: number; attempt_item_id: string; question_id: string; type: string; stem: string;
    options: Array<{ id: string; text: string }> | null;
    material: { id: string; title: string; blocks: Array<{ id: string; text: string }> } | null;
    my_answer: { selected_option_ids?: string[]; text?: string; value?: boolean; blanks?: Array<{ blank_id: string; text: string }> } | null;
    answer_key: { selected_option_ids?: string[]; text?: string; value?: boolean; blanks?: Array<{ blank_id: string; accepted_values: string[] }>; reference_text?: string } | null;
    explanation: string | null;
    confidence: string | null;
    reasoning: string | null;
    flagged: boolean;
    scored: { grading_status: string; correctness: string | null; earned_score_units: number | null; max_score_units: number; basis: string };
    item_ms: number | null;
  }>;
  report: { report_revision_id: string; version: number; status: string } | null;
}

interface AgentPkg {
  status: 'none' | 'ready';
  attempt_id?: string;
  context_revision?: number;
  context_sha256?: string;
  accepted_revision?: number;
  review_status?: string;
  dir?: string;
  prompt?: string;
  errors?: Array<Record<string, unknown>>;
}
interface ExternalReview {
  prepared: boolean;
  context_revision: number;
  accepted_revision: number;
  file_status: string;
  review: { revision: number; created_at: string; status: string; parsed: {
    summary?: Record<string, string>;
    sections?: Record<string, string>;
    producer?: { name?: string; model?: string | null };
    suggested_actions?: Array<{ id: string; question_ids: string[]; evidence_ids: string[]; text: string; acceptance_check: string; suggested_interval_days: number }>;
    grading_concerns?: Array<{ question_id: string; evidence_ids: string[]; reason: string }>;
  } } | null;
  revisions: Array<{ version: number; status: string; created_at: string }>;
}

function fmtMs(ms: number): string {
  const s = Math.floor(ms / 1000);
  return `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
}
function score(units: number): string {
  return String(Math.round(units) / 100);
}
function pct(r: { num: number; den: number } | null): string {
  if (!r || r.den <= 0) return '—';
  const tenths = Math.floor((2000 * r.num + r.den) / (2 * r.den));
  return `${(tenths / 10).toFixed(1)}%`;
}
function badgeTag(s: { grading_status: string; correctness: string | null }): string {
  if (s.grading_status === 'pending') return 'tag-warn';
  if (s.grading_status === 'invalid') return 'tag-err';
  if (s.correctness === 'correct') return 'tag-ok';
  if (s.correctness === 'partial') return 'tag-blue';
  return 'tag-err';
}
function badgeText(s: { grading_status: string; correctness: string | null; earned_score_units: number | null; max_score_units: number }): string {
  if (s.grading_status === 'pending') return `待评 / 满分 ${score(s.max_score_units)} 分`;
  if (s.grading_status === 'invalid') return '判分键无效';
  const c = s.correctness === 'correct' ? '正确' : s.correctness === 'partial' ? '部分正确' : s.correctness === 'unanswered' ? '未答' : '错误';
  return `${c} · ${score(s.earned_score_units ?? 0)} / ${score(s.max_score_units)} 分`;
}

export function Report({ path }: { path: string }) {
  const attemptId = path.split('/')[2] ?? '';
  const [res, setRes] = useState<ResultsDTO | null>(null);
  const [reportStatus, setReportStatus] = useState<string>('loading');
  const [err, setErr] = useState<string | null>(null);
  const [copied, setCopied] = useState<string | null>(null);
  const [pkg, setPkg] = useState<AgentPkg | null>(null);
  const [ext, setExt] = useState<ExternalReview | null>(null);
  const [preparing, setPreparing] = useState(false);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const r = await api<ResultsDTO>('GET', `/attempts/${attemptId}/results`);
        if (!alive) return;
        setRes(r);
        setReportStatus(r.report?.status ?? 'none');
        const p = await api<AgentPkg>('GET', `/attempts/${attemptId}/agent-package`);
        if (!alive) return;
        setPkg(p);
        if (p.status === 'ready') {
          const er = await api<ExternalReview>('GET', `/attempts/${attemptId}/external-review`);
          if (alive) setExt(er);
        }
      } catch (e) {
        if (alive) setErr((e as Error).message);
      }
    })();
    return () => { alive = false; };
  }, [attemptId]);

  // SSE 实时刷新 + 20s 兜底轮询（docs/05 §10）
  useEffect(() => {
    if (!res) return;
    const es = new EventSource(`/api/v1/events?attempt_id=${attemptId}`);
    const refresh = () => {
      void api<ExternalReview>('GET', `/attempts/${attemptId}/external-review`).then(setExt).catch(() => {});
    };
    es.addEventListener('external_review.validated', refresh);
    es.addEventListener('external_review.invalid', refresh);
    es.addEventListener('external_review.missing', refresh);
    es.addEventListener('agent_context.updated', refresh);
    const t = setInterval(refresh, 20000);
    return () => { es.close(); clearInterval(t); };
  }, [res, attemptId]);

  async function prepareAgentPackage() {
    setPreparing(true);
    try {
      const p = await api<AgentPkg>('POST', `/attempts/${attemptId}/agent-package`, {}, { 'idempotency-key': `agent-${attemptId}` });
      setPkg(p);
      const er = await api<ExternalReview>('GET', `/attempts/${attemptId}/external-review`);
      setExt(er);
    } finally { setPreparing(false); }
  }

  function reviewSection(qid: string): string | null {
    const sec = ext?.review?.parsed?.sections;
    if (!sec) return null;
    const v = sec[`q:${qid}`];
    return v && v.length > 0 ? v : null;
  }

  useEffect(() => {
    if (!res?.report || reportStatus === 'ready' || reportStatus === 'failed') return;
    const t = setInterval(async () => {
      try {
        const r = await api<{ status: string }>('GET', `/reports/${res.report!.report_revision_id}`);
        setReportStatus(r.status);
      } catch { /* 保持当前状态 */ }
    }, 1000);
    return () => clearInterval(t);
  }, [res?.report, reportStatus]);

  if (err) return <div className="report-card" role="alert">{err}</div>;
  if (!res) return <div style={{ color: '#9aa88b', fontSize: 12 }}>加载中…</div>;

  const agg = res.aggregate;
  const hasPending = agg.pending_max > 0 || agg.invalid_count > 0;
  const rid = res.report?.report_revision_id ?? '';

  async function copyAgentPrompt() {
    if (!pkg?.prompt) { await prepareAgentPackage(); return; }
    await navigator.clipboard.writeText(pkg.prompt);
    setCopied('agent');
    setTimeout(() => setCopied(null), 4000);
  }

  async function copyReviewDir() {
    if (!pkg?.dir) { await prepareAgentPackage(); return; }
    await navigator.clipboard.writeText(pkg.dir);
    setCopied('dir');
    setTimeout(() => setCopied(null), 4000);
  }

  async function copyMd() {
    const res2 = await fetch(`/api/v1/reports/${rid}/download?format=md`);
    const text = await res2.text();
    await navigator.clipboard.writeText(text);
    setCopied('md');
    setTimeout(() => setCopied(null), 4000);
  }

  return <div style={{ maxWidth: 980 }}>
    <section className="report-card">
      <h2>复盘报告 · {res.items.length} 题</h2>
      <p className="sub-line">训练模式 · 报告版本 v{res.report?.version ?? 1} · 判分规则 v{res.grade_revision} · 报告{reportStatus === 'ready' ? '已生成' : reportStatus === 'failed' ? '生成失败（作答已保存，可稍后重试）' : '生成中…'}</p>
      <div className="report-actions">
        <button className="button button-primary" onClick={() => void copyAgentPrompt()}><Copy size={14} />{copied === 'agent' ? '已复制' : '复制 Agent 指令'}</button>
        <button className="button button-quiet" onClick={() => void copyReviewDir()}>{copied === 'dir' ? '已复制' : '复制复盘目录'}</button>
        <a className="button button-quiet" href={`/api/v1/reports/${rid}/download?format=md`}><Download size={14} />导出 Markdown</a>
        <a className="button button-quiet" href={`/api/v1/reports/${rid}/download?format=json`}>导出 JSON</a>
        <button className="button button-quiet" onClick={() => void copyMd()}><FileText size={14} />{copied === 'md' ? '已复制全文' : '复制全文'}</button>
      </div>
      <p className="form-note" style={{ marginTop: 10 }}>把 Markdown 发给任意网页版 AI（无需 API Key）即可复盘；「复制 Agent 指令」适用于让本机 Claude Code 直接读取并回写复盘文件，网页自动更新。</p>
    </section>

    <section className="report-card" id="agent-review">
      <div className="item-head" style={{ marginBottom: 6 }}>
        <h2 style={{ fontSize: 15, fontWeight: 550, color: '#4b5e3e' }}>外部 Agent 复盘</h2>
        {pkg?.status === 'ready' ? (
          ext && ext.accepted_revision > 0 ? <span className="tag tag-ok">已读取 review.md · 修订 {ext.accepted_revision}{ext.review && <> · {fmtTime(ext.review.created_at)}</>}</span>
            : pkg.review_status === 'empty' ? <span className="tag">可开始复盘：context.md 已就绪，review.md 尚未填写</span>
            : null
        ) : <span className="tag">尚未准备复盘目录</span>}
        <span style={{ flex: 1 }} />
        {pkg?.status !== 'ready' && <button className="button button-primary" style={{ height: 30, fontSize: 11 }} disabled={preparing} onClick={() => void prepareAgentPackage()}>{preparing ? '正在准备…' : '准备复盘目录'}</button>}
      </div>
      {pkg?.status === 'ready' && <>
        <p className="form-note">复盘目录 <code>{pkg.dir}</code>（context.md 已生成{ext?.accepted_revision ? `；外部分析修订 ${ext.accepted_revision}` : ''}）。{ext?.review?.parsed?.producer?.name ? <> 分析来源：外部 Agent「{ext.review.parsed.producer.name}」{ext.review.parsed.producer.model ? `（${ext.review.parsed.producer.model}）` : '，模型未声明'}。</> : ' 分析来源：外部 Agent，模型未声明。'}</p>
        {ext?.review?.parsed?.sections?.['summary'] && <div className="review-box"><div className="review-tag"><Sparkles size={12} style={{ display: 'inline', marginRight: 4 }} />本次概览 · 外部 Agent 分析</div><div className="review-body">{ext.review.parsed.sections['summary']}</div></div>}
        {ext?.file_status === 'missing' && <p className="tag tag-warn" role="alert" style={{ marginTop: 8 }}>review.md 已被移走；仍显示上次有效复盘。</p>}
        {ext?.review?.parsed?.suggested_actions && ext.review.parsed.suggested_actions.length > 0 && <div className="review-box">
          <div className="review-tag">建议动作 · 尚未采纳</div>
          {ext.review.parsed.suggested_actions.map((a) => <div key={a.id} className="review-body" style={{ borderTop: '1px solid #e7f0db', paddingTop: 8, marginTop: 8 }}>· {a.text}<div className="form-note" style={{ marginTop: 4 }}>完成标准：{a.acceptance_check} · 建议间隔 {a.suggested_interval_days} 天 · 证据 {a.evidence_ids.join('、')}</div></div>)}
          <div className="form-note" style={{ marginTop: 10 }}>采纳到复习计划将在 M3 提供（需用户逐条确认）。</div>
        </div>}
        {ext?.review?.parsed?.grading_concerns && ext.review.parsed.grading_concerns.length > 0 && <div className="review-box">
          <div className="review-tag">评分异议 · 不会直接改分</div>
          {ext.review.parsed.grading_concerns.map((g, i) => <div key={i} className="review-body">· {g.question_id}: {g.reason} <span className="form-note">（证据 {g.evidence_ids.join('、')}）</span></div>)}
        </div>}
      </>}
    </section>

    <section className="report-card">
      <h2>成绩概览</h2>
      <div className="report-summary-grid">
        <div>
          <div className="report-big">{score(agg.earned)}<small>/ {score(agg.graded_max)} 分（已判）</small></div>
          {hasPending ? <div className="kv">另有待评 {score(agg.pending_max)} 分 · 整卷满分 {score(agg.total_max)} 分（当前不是最终成绩）</div> : <div className="kv">整卷满分 {score(agg.total_max)} 分</div>}
        </div>
        <div>
          <div className="kv">得分率（已判口径）：{pct(agg.score_rate)}</div>
          <div className="kv">客观正确率：{pct(agg.objective_correct_rate)}</div>
          <div className="kv">已答正确率：{pct(agg.answered_correct_rate)}</div>
        </div>
        <div>
          <div className="kv">已答 {agg.answered_count} · 正确 {agg.correct_count} · 错误 {agg.incorrect_count}</div>
          <div className="kv">未答 {agg.unanswered_count} · 待评 {agg.pending_count} · 部分对 {agg.partial_count}</div>
        </div>
        <div>
          <div className="kv">前台有效 {fmtMs(res.timing.active_ms)}（{res.timing.quality === 'complete' ? '完整' : '部分可核实'}）</div>
          <div className="kv">墙钟 {fmtMs(res.timing.wall_ms)} · 暂停 {fmtMs(res.timing.paused_ms)} · 未知 {fmtMs(res.timing.unknown_ms)}</div>
        </div>
      </div>
    </section>

    {res.items.map((it) => (
      <article className="report-item" key={it.attempt_item_id}>
        <div className="item-head">
          <b>第 {it.order} 题</b>
          <span className={`tag ${badgeTag(it.scored)}`}>{badgeText(it.scored)}</span>
          {it.item_ms !== null && <span className="tag">{fmtMs(it.item_ms)}</span>}
        </div>
        <div className="stem">{it.stem}</div>
        {it.options?.map((o, i) => {
          const mine = it.my_answer && 'selected_option_ids' in it.my_answer && it.my_answer.selected_option_ids?.includes(o.id);
          const key = it.answer_key && 'selected_option_ids' in it.answer_key && it.answer_key.selected_option_ids?.includes(o.id);
          return <div key={o.id} className="ans-line" style={{ fontWeight: mine ? 600 : 400 }}>
            <span className="lab">{String.fromCharCode(65 + i)}.</span>{o.text}
            {mine && <span className="tag tag-blue" style={{ marginLeft: 8 }}>我的答案</span>}
            {key && <span className="tag tag-ok" style={{ marginLeft: 6 }}>标准答案</span>}
          </div>;
        })}
        {!it.options && it.my_answer && 'text' in it.my_answer && <div className="ans-line"><span className="lab">我的作答</span>{it.my_answer.text}</div>}
        {it.type === 'free_text' && it.answer_key && 'reference_text' in it.answer_key && it.answer_key.reference_text && <div className="ans-line"><span className="lab">参考答案</span>{it.answer_key.reference_text}</div>}
        <div className="ans-line"><span className="lab">我的思路</span>{it.reasoning || '未记录'} · 把握：{it.confidence ? { guess: '猜测', uncertain: '不确定', sure: '确定' }[it.confidence as 'guess'] : '未记录'}</div>
        <div className="ans-line"><span className="lab">判分依据</span><code style={{ fontSize: 11, color: '#8b9a7c' }}>{it.scored.basis}</code></div>
        {reviewSection(it.question_id) && <div className="review-box"><div className="review-tag">外部 Agent 分析 · review.md{ext?.review ? ` · 修订 ${ext.review.revision}` : ''}</div><div className="review-body">{reviewSection(it.question_id)}</div></div>}
        {it.explanation && <div className="ans-line"><span className="lab">解析</span>{it.explanation}</div>}
      </article>
    ))}

    <section className="report-card">
      <h2>下一步</h2>
      <p className="form-note">· 交卷后原始作答与判分快照不可改写；外部 Agent 的分析仅展示为建议，采纳与复习计划需用户确认（M3）。<br />· 严格限时、多标签接管与备份恢复属于 M2 范围。</p>
      <p className="demo-note"><Lightbulb size={14} />外部文件复盘的完整协议见 docs/05；本页随 review.md 的保存自动更新。</p>
    </section>
  </div>;
}
