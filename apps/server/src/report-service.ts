import type { DbHandle } from './db.js';
import { sha256Hex, sha256Stable } from './db.js';
import {
  aggregate as aggregateFn,
  buildReportJson,
  buildReportMd,
  computeTimingSummary,
  gradeCore,
  REPORT_SCHEMA_VERSION,
  type Answer,
  type AttemptAggregate,
  type MaterialBlock,
  type Option,
  type QuestionType,
  type ReportEvent,
  type ReportInput,
  type ScoredItem,
  type TimingSegment,
} from '@shiti/shared';
import { mkdirSync, readFileSync, renameSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

interface ItemRow {
  id: string;
  question_id: string;
  question_version_id: string;
  order: number;
  snapshot_json: string;
  max_score_units: number;
}

interface Snapshot {
  type: QuestionType;
  stem: string;
  options: Option[] | null;
  images?: string[] | null;
  material_id: string | null;
  material_title: string | null;
  material_blocks: MaterialBlock[] | null;
  answer_key: unknown;
  key_source: string;
  explanation: string | null;
  question_version: number;
  max_score_units: number;
}

export interface ItemData {
  row: ItemRow;
  snapshot: Snapshot;
  draft: { answer: Answer; confidence: string | null; reasoning: string | null; flagged: boolean; revision: number } | null;
  changeCount: number;
}

export function loadAttemptItems(h: DbHandle, attemptId: string): ItemData[] {
  const rows = h.db
    .prepare('SELECT * FROM attempt_items WHERE attempt_id = ? ORDER BY "order"')
    .all(attemptId) as unknown as ItemRow[];
  const changeStmt = h.db.prepare(
    "SELECT COUNT(*) AS n FROM client_actions WHERE attempt_id = ? AND attempt_item_id = ? AND event_type IN ('answer_changed','draft_changed')",
  );
  return rows.map((r) => {
    const snapshot = JSON.parse(r.snapshot_json) as Snapshot;
    const draftRow = h.db
      .prepare('SELECT * FROM answer_drafts WHERE attempt_item_id = ?')
      .get(r.id) as
      | { answer_json: string | null; confidence: string | null; reasoning: string | null; flagged: number; revision: number }
      | undefined;
    return {
      row: r,
      snapshot,
      draft: draftRow
        ? {
            answer: draftRow.answer_json ? (JSON.parse(draftRow.answer_json) as Answer) : null,
            confidence: draftRow.confidence,
            reasoning: draftRow.reasoning,
            flagged: draftRow.flagged === 1,
            revision: draftRow.revision,
          }
        : null,
      changeCount: (changeStmt.get(attemptId, r.id) as { n: number }).n,
    };
  });
}

/** 提交事务内调用：从已确认草稿生成不可变快照，并用纯函数判分（docs/02 §6 第 3–5 步）。 */
export function snapshotAndGrade(
  h: DbHandle,
  attemptId: string,
): { items: ScoredItem[]; aggregate: AttemptAggregate; snapshotHash: string } {
  const data = loadAttemptItems(h, attemptId);
  const insertSnap = h.db.prepare(
    'INSERT OR REPLACE INTO answer_snapshots (attempt_item_id, submitted_answer_json, confidence, reasoning, flagged, draft_revision) VALUES (?, ?, ?, ?, ?, ?)',
  );
  const scored: ScoredItem[] = [];
  const snapshotsForHash: unknown[] = [];
  for (const d of data) {
    const s = d.snapshot;
    const answer = d.draft?.answer ?? null;
    const draftRevision = d.draft?.revision ?? 0;
    insertSnap.run(
      d.row.id,
      answer === null ? null : JSON.stringify(answer),
      d.draft?.confidence ?? null,
      d.draft?.reasoning ?? null,
      d.draft?.flagged ? 1 : 0,
      draftRevision,
    );
    snapshotsForHash.push({
      attempt_item_id: d.row.id,
      submitted_answer: answer,
      confidence: d.draft?.confidence ?? null,
      reasoning: d.draft?.reasoning ?? null,
      flagged: d.draft?.flagged ?? false,
      draft_revision: draftRevision,
    });
    const r = gradeCore(
      s.type,
      answer,
      (s.answer_key ?? null) as never,
      d.row.max_score_units,
      s.options ? s.options.map((o) => o.id) : null,
    );
    scored.push({
      attempt_item_id: d.row.id,
      question_id: d.row.question_id,
      question_version_id: d.row.question_version_id,
      order: d.row.order,
      type: s.type,
      ...r,
      max_score_units: d.row.max_score_units,
    });
  }
  const snapshotHash = sha256Stable(snapshotsForHash);
  return { items: scored, aggregate: aggregateFn(scored), snapshotHash };
}

function closeOpenSegments(h: DbHandle, attemptId: string, atMs: number): void {
  h.db
    .prepare('UPDATE timing_segments SET end_at = ? WHERE attempt_id = ? AND end_at IS NULL')
    .run(atMs, attemptId);
}

export function timingSummaryFor(h: DbHandle, attemptId: string, startedMs: number, submittedMs: number) {
  const rows = h.db
    .prepare('SELECT item_id, kind, start_at, end_at FROM timing_segments WHERE attempt_id = ? AND end_at IS NOT NULL')
    .all(attemptId) as unknown as Array<{ item_id: string | null; kind: TimingSegment['kind']; start_at: number; end_at: number }>;
  return computeTimingSummary(
    rows.map((r) => ({ item_id: r.item_id, kind: r.kind, start_at: r.start_at, end_at: r.end_at })),
    startedMs,
    submittedMs,
  );
}

const EVENT_LABEL: Record<string, string> = {
  attempt_started: '开始练习',
  item_focused: '切换到题目',
  answer_changed: '选项变更',
  draft_changed: '草稿变更',
  confidence_changed: '把握程度变更',
  reasoning_changed: '思路变更',
  flag_changed: '标记待查',
  material_focused: '阅读共享材料',
  paused: '暂停',
  resumed: '继续',
  submitted: '交卷',
};

export function buildReportInput(h: DbHandle, attemptId: string, reportVersion: number): ReportInput {
  const attempt = h.db.prepare('SELECT * FROM attempts WHERE id = ?').get(attemptId) as {
    id: string; workspace_id: string; set_version_id: string; mode: 'training' | 'timed';
    state: string; started_at: string | null; submitted_at: string | null; revision: number;
  };
  const setVersion = h.db
    .prepare('SELECT sv.*, s.title AS set_title, s.is_demo FROM question_set_versions sv JOIN question_sets s ON s.id = sv.set_id WHERE sv.id = ?')
    .get(attempt.set_version_id) as { id: string; set_id: string; version: number; set_title: string; is_demo: number };
  const ws = h.db.prepare('SELECT * FROM workspace WHERE id = ?').get(attempt.workspace_id) as { name: string; timezone: string };
  const submission = h.db.prepare('SELECT * FROM submissions WHERE attempt_id = ?').get(attemptId) as {
    submitted_at: string; reason: 'manual' | 'deadline'; snapshot_hash: string;
  };
  const grade = h.db
    .prepare('SELECT * FROM grade_revisions WHERE attempt_id = ? ORDER BY version DESC LIMIT 1')
    .get(attemptId) as { id: string; version: number; rule_version: string; items_json: string; aggregate_json: string };
  const reportRev = h.db
    .prepare('SELECT * FROM report_revisions WHERE attempt_id = ? AND version = ?')
    .get(attemptId, reportVersion) as { id: string; input_hash: string; generated_at: string };

  const data = loadAttemptItems(h, attemptId);
  const scored = JSON.parse(grade.items_json) as ScoredItem[];
  const aggregate = JSON.parse(grade.aggregate_json) as AttemptAggregate;
  const startedMs = Date.parse(attempt.started_at ?? submission.submitted_at);
  const submittedMs = Date.parse(submission.submitted_at);
  const timing = timingSummaryFor(h, attemptId, startedMs, submittedMs);

  const snapRows = h.db
    .prepare('SELECT * FROM answer_snapshots WHERE attempt_item_id = ?')
    .all(attemptId) as unknown as Array<{ attempt_item_id: string; submitted_answer_json: string | null; confidence: string | null; reasoning: string | null; flagged: number }>;
  const snapById = new Map(snapRows.map((s) => [s.attempt_item_id, s] as const));

  const items = data.map((d) => {
    const sc = scored.find((x) => x.attempt_item_id === d.row.id)!;
    const snap = snapById.get(d.row.id);
    const myAnswer: Answer = snap?.submitted_answer_json ? (JSON.parse(snap.submitted_answer_json) as Answer) : null;
    return {
      order: d.row.order,
      attempt_item_id: d.row.id,
      question_id: d.row.question_id,
      question_version: d.snapshot.question_version,
      type: d.snapshot.type,
      stem: d.snapshot.stem,
      options: d.snapshot.options,
      material_id: d.snapshot.material_id,
      material_title: d.snapshot.material_title,
      material_blocks: d.snapshot.material_blocks,
      my_answer: myAnswer,
      answer_key: (d.snapshot.answer_key ?? null) as ReportInput['items'][number]['answer_key'],
      key_source: d.snapshot.key_source,
      explanation: d.snapshot.explanation,
      confidence: ((snap?.confidence ?? null) as ReportInput['items'][number]['confidence']),
      reasoning: snap?.reasoning ?? null,
      flagged: (snap?.flagged ?? 0) === 1,
      scored: sc,
      item_ms: timing.item_ms[d.row.id] ?? null,
      answer_change_count: d.changeCount,
    };
  });

  const actionRows = h.db
    .prepare('SELECT * FROM client_actions WHERE attempt_id = ? ORDER BY seq')
    .all(attemptId) as unknown as Array<{ event_type: string; received_at: string; attempt_item_id: string | null; payload_json: string }>;
  const orderOfItem = new Map(data.map((d) => [d.row.id, d.row.order] as const));
  const events: ReportEvent[] = [];
  if (attempt.started_at) {
    events.push({ at: attempt.started_at, kind: EVENT_LABEL['attempt_started'] ?? '开始练习', detail: `${attempt.mode === 'training' ? '训练' : '严格限时'} · ${data.length} 题` });
  }
  for (const a of actionRows) {
    const label = EVENT_LABEL[a.event_type] ?? a.event_type;
    const q = a.attempt_item_id && orderOfItem.has(a.attempt_item_id) ? `第 ${orderOfItem.get(a.attempt_item_id)} 题` : '';
    events.push({ at: a.received_at, kind: label, detail: q });
  }
  events.push({ at: submission.submitted_at, kind: EVENT_LABEL['submitted'] ?? '交卷', detail: submission.reason === 'manual' ? '手动交卷' : '到时自动封存' });

  const meta: ReportInput['meta'] = {
    workspace_name: ws.name,
    timezone: ws.timezone,
    attempt_id: attemptId,
    set_id: setVersion.set_id,
    set_title: setVersion.set_title,
    set_version: setVersion.version,
    mode: attempt.mode,
    started_at_ms: startedMs,
    submitted_at_ms: submittedMs,
    submit_reason: submission.reason,
    generated_at_ms: Date.parse(reportRev.generated_at),
    report_revision: reportVersion,
    grade_revision: grade.version,
    review_revision: null,
    is_demo: setVersion.is_demo === 1,
    rule_version: grade.rule_version,
    input_hash: reportRev.input_hash,
  };
  return { meta, timing, items, events, aggregate };
}

const MAX_REPORT_ATTEMPTS = 3;
const BACKOFF_MS = [2_000, 10_000, 30_000];

/** Worker 单次轮询：领取一个到期任务并执行（docs/02 §4.2、§10）。 */
export function runQueuedJobOnce(h: DbHandle): 'idle' | 'ran' {
  const now = Date.now();
  const job = h.db
    .prepare(
      "SELECT * FROM jobs WHERE status = 'queued' AND next_run_at <= ? AND (lease_until IS NULL OR lease_until < ?) AND cancel_requested = 0 ORDER BY next_run_at LIMIT 1",
    )
    .get(now, now) as { id: string } | undefined;
  if (!job) return 'idle';
  const claimed = h.db
    .prepare("UPDATE jobs SET status = 'running', lease_until = ?, attempts = attempts + 1, updated_at = ? WHERE id = ? AND status = 'queued'")
    .run(now + 60_000, new Date().toISOString(), job.id);
  if (claimed.changes === 0) return 'idle';

  const jobRow = h.db.prepare('SELECT * FROM jobs WHERE id = ?').get(job.id) as {
    id: string; type: string; payload_json: string; attempts: number;
  };
  try {
    if (jobRow.type === 'generate_report') {
      generateReport(h, JSON.parse(jobRow.payload_json) as { attempt_id: string; report_revision_id: string });
    } else {
      throw new Error(`未知任务类型 ${jobRow.type}`);
    }
    h.db.prepare("UPDATE jobs SET status = 'succeeded', lease_until = NULL, updated_at = ? WHERE id = ?").run(new Date().toISOString(), jobRow.id);
  } catch (e) {
    const msg = (e as Error).message.slice(0, 300);
    const attemptNo = jobRow.attempts;
    if (attemptNo < MAX_REPORT_ATTEMPTS) {
      const backoff = BACKOFF_MS[Math.min(attemptNo - 1, BACKOFF_MS.length - 1)] ?? 30_000;
      h.db
        .prepare("UPDATE jobs SET status = 'queued', lease_until = NULL, next_run_at = ?, error_message = ?, updated_at = ? WHERE id = ?")
        .run(Date.now() + backoff, msg, new Date().toISOString(), jobRow.id);
    } else {
      h.db
        .prepare("UPDATE jobs SET status = 'failed', lease_until = NULL, error_code = 'REPORT_FAILED', error_message = ?, updated_at = ? WHERE id = ?")
        .run(msg, new Date().toISOString(), jobRow.id);
      const payload = JSON.parse(jobRow.payload_json) as { report_revision_id: string };
      h.db.prepare("UPDATE report_revisions SET status = 'failed' WHERE id = ?").run(payload.report_revision_id);
    }
  }
  return 'ran';
}

function generateReport(h: DbHandle, p: { attempt_id: string; report_revision_id: string }): void {
  const rev = h.db.prepare('SELECT * FROM report_revisions WHERE id = ?').get(p.report_revision_id) as {
    id: string; attempt_id: string; version: number; status: string;
  };
  if (!rev || rev.status === 'ready') return;
  h.db.prepare("UPDATE report_revisions SET status = 'generating' WHERE id = ?").run(rev.id);
  const input = buildReportInput(h, rev.attempt_id, rev.version);
  const md = buildReportMd(input);
  const json = buildReportJson(input);

  const dir = join(h.reportsDir, rev.attempt_id);
  mkdirSync(dir, { recursive: true });
  const mdPath = join(dir, `report-v${rev.version}.md`);
  const jsonPath = join(dir, `report-v${rev.version}.json`);
  const manifestPath = join(dir, 'manifest.json');

  // 先写临时文件，校验成功后原子重命名（docs/02 §6 末段）。
  const tmpMd = `${mdPath}.tmp`;
  const tmpJson = `${jsonPath}.tmp`;
  writeFileSync(tmpMd, md, 'utf8');
  writeFileSync(tmpJson, json, 'utf8');
  if (statSync(tmpMd).size === 0) throw new Error('报告文件为空');
  renameSync(tmpMd, mdPath);
  renameSync(tmpJson, jsonPath);

  const mdSha = sha256Hex(readFileSync(mdPath));
  const jsonSha = sha256Hex(readFileSync(jsonPath));
  const manifest = {
    schema_version: REPORT_SCHEMA_VERSION,
    report_id: rev.attempt_id,
    report_revision: rev.version,
    files: [
      { path: `report-v${rev.version}.md`, bytes: statSync(mdPath).size, sha256: mdSha },
      { path: `report-v${rev.version}.json`, bytes: statSync(jsonPath).size, sha256: jsonSha },
    ],
    omitted_assets: [],
    created_at: new Date().toISOString(),
  };
  writeFileSync(manifestPath, JSON.stringify(manifest, null, 2) + '\n', 'utf8');

  h.db
    .prepare("UPDATE report_revisions SET status = 'ready', md_path = ?, json_path = ?, manifest_path = ?, md_sha256 = ?, json_sha256 = ? WHERE id = ?")
    .run(mdPath, jsonPath, manifestPath, mdSha, jsonSha, rev.id);
}
