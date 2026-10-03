/**
 * 题目导航面板（原"答题卡"）。
 * 只负责：分组展示、状态展示、跳转入口、展开/收起、跟随滚动。
 * 不负责：修改 drafts、保存数据、判题、API 调用。
 */
import { useEffect, useRef, useState } from 'react';
import { useMemo } from 'react';
import { BookOpen, Check, CheckCircle2, ChevronDown, FileText, Languages, ListChecks, PanelRightClose, PanelRightOpen, PenLine, Flag } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import type { Draft, ItemDTO, SetSection } from '../pages/practiceTypes';
import { isAnswered } from '../pages/practiceShared';

export interface NavigatorGroup {
  /** 稳定分组键（材料 id 或 section） */
  key: string;
  /** 子分组展示名：普通试卷=材料清理名；专项=罗马数字（由 Practice 生成） */
  title: string;
  /** 所属大题 section 标签（用于扉页高亮与一级分组） */
  sectionId: string | null;
  items: ItemDTO[];
}

interface QuestionNavigatorProps {
  title: string;
  sections: SetSection[];
  groups: NavigatorGroup[];
  drafts: Record<string, Draft>;
  current: number;
  items: ItemDTO[];
  gotoItem: (item: ItemDTO) => void;
  collapsed?: boolean;
  onCollapsedChange?: (collapsed: boolean) => void;
  /** 跟随滚动开关（扉页/抽屉关闭时停用） */
  followScroll?: boolean;
  frontActive?: boolean;
  frontSectionId?: string | null;
  /** 专项模式：子分组用罗马数字序号 */
  drill?: boolean;
}

function roman(n: number): string {
  const table: Array<[number, string]> = [[100, 'C'], [90, 'XC'], [50, 'L'], [40, 'XL'], [10, 'X'], [9, 'IX'], [5, 'V'], [4, 'IV'], [1, 'I']];
  let out = '';
  for (const [v, s] of table) { while (n >= v) { out += s; n -= v; } }
  return out || 'I';
}

function sectionIcon(title: string): LucideIcon {
  if (/完形/.test(title)) return FileText;
  if (/阅读/.test(title)) return BookOpen;
  if (/新题型/.test(title)) return ListChecks;
  if (/翻译/.test(title)) return Languages;
  if (/写作|作文/.test(title)) return PenLine;
  return FileText;
}

/** 一级大题的展示名：优先 sections 声明的 title；未声明的 section 回退到材料名 */
function sectionDisplayName(sectionId: string | null, sections: SetSection[], fallback: string): string {
  if (sectionId) {
    const declared = sections.find((s) => s.id === sectionId);
    if (declared) return declared.title;
  }
  return fallback || '未分类题目';
}

export function QuestionNavigator({ title, sections, groups, drafts, current, items, gotoItem, collapsed = false, onCollapsedChange, followScroll = true, frontActive = false, frontSectionId = null, drill = false }: QuestionNavigatorProps) {
  const listRef = useRef<HTMLDivElement>(null);
  const miniListRef = useRef<HTMLDivElement>(null);
  const nodeRefs = useRef<Map<string, HTMLElement>>(new Map());
  const [closedSections, setClosedSections] = useState<Record<string, boolean>>({});
  const [closedGroups, setClosedGroups] = useState<Record<string, boolean>>({});

  const total = items.length;
  const answered = items.filter((it) => isAnswered(drafts[it.attempt_item_id])).length;
  const flagged = items.filter((it) => drafts[it.attempt_item_id]?.flagged).length;
  const currentItem = items[current];

  // 一级大题：按 section 聚合 groups（保持题序）；无 section 的归入"其他"
  const sections_out = useMemo(() => {
    const out: Array<{ key: string; name: string; icon: LucideIcon; sectionId: string | null; groups: NavigatorGroup[]; flatItems: ItemDTO[] }> = [];
    const index = new Map<string, number>();
    for (const g of groups) {
      const key = g.sectionId ?? '__none__';
      let si = index.get(key);
      if (si === undefined) {
        si = out.length;
        index.set(key, si);
        const name = sectionDisplayName(g.sectionId, sections, g.title);
        out.push({ key, name, icon: sectionIcon(name), sectionId: g.sectionId, groups: [], flatItems: [] });
      }
      out[si]!.groups.push(g);
      out[si]!.flatItems.push(...g.items);
    }
    return out;
  }, [groups, sections]);

  const firstFrontSectionIndex = frontSectionId ? sections_out.findIndex((s) => s.sectionId === frontSectionId) : -1;

  // 当前题号滚动到可见区域（扉页/抽屉关闭时停用；顶/底由 scrollTop 自然钳制）
  useEffect(() => {
    if (!followScroll || !currentItem) return;
    const el = nodeRefs.current.get(currentItem.attempt_item_id);
    const list = collapsed ? miniListRef.current : listRef.current;
    if (!el || !list) return;
    const lr = list.getBoundingClientRect();
    const er = el.getBoundingClientRect();
    if (lr.height === 0) return;
    const delta = (er.top + er.height / 2) - (lr.top + lr.height / 2);
    if (Math.abs(delta) > 24) list.scrollTo({ top: list.scrollTop + delta, behavior: 'auto' });
  }, [current, collapsed, currentItem, followScroll]);

  function toggleSection(key: string) { setClosedSections((prev) => ({ ...prev, [key]: !prev[key] })); }
  function toggleGroup(key: string) { setClosedGroups((prev) => ({ ...prev, [key]: !prev[key] })); }

  function node(it: ItemDTO, mini = false) {
    const d = drafts[it.attempt_item_id];
    // 扉页态（尚未进入任何题目作答）不高亮题号，只由组卡片框选表明位置
    const isCur = !frontActive && currentItem?.attempt_item_id === it.attempt_item_id;
    const cls = [
      mini ? 'qnav-mini-item' : 'qnav-item',
      isCur ? 'is-current' : '',
      isAnswered(d) ? 'is-answered' : '',
      d?.flagged ? 'is-flagged' : '',
    ].join(' ');
    return (
      <button key={it.attempt_item_id} ref={(el) => { if (el) nodeRefs.current.set(it.attempt_item_id, el); else nodeRefs.current.delete(it.attempt_item_id); }} className={cls} onClick={() => gotoItem(it)} aria-label={`第 ${it.order} 题`} aria-current={isCur ? 'step' : undefined}>
        {it.order}
        {d?.flagged && <Flag className="qnav-flag" size={mini ? 8 : 9} strokeWidth={2.4} aria-hidden="true" />}
      </button>
    );
  }

  if (collapsed) {
    return (
      <div className="qnav qnav-mini">
        <button className="qnav-toggle" onClick={() => onCollapsedChange?.(false)} aria-label="展开题目导航"><PanelRightOpen size={16} /></button>
        <div className="qnav-mini-list" ref={miniListRef}>
          {sections_out.map((s, si) => {
            const isFront = frontActive && si === firstFrontSectionIndex;
            const isCur = !!currentItem && s.flatItems.some((it) => it.attempt_item_id === currentItem.attempt_item_id);
            return (
              <div key={s.key}>
                <div className={`qnav-divider${isFront ? ' is-front' : ''}${isCur ? ' is-current' : ''}`} title={s.name} />
                {s.flatItems.map((it) => node(it, true))}
              </div>
            );
          })}
        </div>
      </div>
    );
  }

  const pct = total > 0 ? Math.round((answered / total) * 100) : 0;

  return (
    <div className="qnav">
      <div className="qnav-toolbar">
        <span className="qnav-toolbar-name"><ListChecks size={15} />题目导航</span>
        {onCollapsedChange && <button className="qnav-collapse" onClick={() => onCollapsedChange(true)} aria-label="收起题目导航"><PanelRightClose size={14} />收起</button>}
      </div>

      <div className="qnav-head">
        <div className="qnav-paper">{title}</div>
        <div className="qnav-progress-line"><span>完成进度 {answered} / {total}</span><span>{pct}%</span></div>
        <div className="qnav-bar" role="progressbar" aria-valuenow={answered} aria-valuemin={0} aria-valuemax={total}><span style={{ width: `${pct}%` }} /></div>
        <div className="qnav-stats">
          <div className="qnav-stat"><span className="qnav-stat-icon is-done"><Check size={12} strokeWidth={3} /></span><span>已答<i>{answered}</i></span></div>
          <div className="qnav-stat"><span className="qnav-stat-icon"><i className="qnav-hollow" /></span><span>待答<i>{total - answered}</i></span></div>
          <div className="qnav-stat"><span className="qnav-stat-icon is-flag"><Flag size={11} /></span><span>标记<i>{flagged}</i></span></div>
        </div>
      </div>

      <div className="qnav-list">
        {sections_out.map((s, si) => {
          const sDone = s.flatItems.filter((it) => isAnswered(drafts[it.attempt_item_id])).length;
          const sOpen = !closedSections[s.key];
          const isCur = !!currentItem && s.flatItems.some((it) => it.attempt_item_id === currentItem.attempt_item_id);
          const isFront = frontActive && si === firstFrontSectionIndex;
          const Icon = s.icon;
          return (
            <section key={s.key} className={`qnav-section${isCur ? ' is-current' : ''}${isFront ? ' is-front' : ''}`}>
              <button className="qnav-section-head" onClick={() => toggleSection(s.key)} aria-expanded={sOpen}>
                <span className="qnav-section-icon"><Icon size={15} strokeWidth={1.8} /></span>
                <span className="qnav-section-name">{s.name}</span>
                <span className="qnav-section-count">{sDone} / {s.flatItems.length}</span>
                <ChevronDown size={14} className={`qnav-caret${sOpen ? '' : ' rotate-180'}`} />
              </button>
              {sOpen && <div className="qnav-section-body">
                {s.groups.map((g) => {
                  const gDone = g.items.filter((it) => isAnswered(drafts[it.attempt_item_id])).length;
                  const gOpen = !closedGroups[g.key];
                  const allDone = gDone === g.items.length && g.items.length > 0;
                  const gIsCur = !!currentItem && g.items.some((it) => it.attempt_item_id === currentItem.attempt_item_id);
                  const subName = drill ? roman(s.groups.indexOf(g) + 1) : g.title;
                  return (
                    <div key={g.key} className={`qnav-subgroup${gIsCur ? ' is-current' : ''}`}>
                      <button className="qnav-subgroup-head" onClick={() => toggleGroup(g.key)} aria-expanded={gOpen}>
                        <span className="qnav-subgroup-name">{subName}</span>
                        {allDone && <span className="qnav-done-badge"><Check size={11} strokeWidth={3} /></span>}
                        <span className="qnav-subgroup-count">{gDone} / {g.items.length}</span>
                        <ChevronDown size={12} className={`qnav-caret${gOpen ? '' : ' rotate-180'}`} />
                      </button>
                      {gOpen && <div className="qnav-items">{g.items.map((it) => node(it))}</div>}
                    </div>
                  );
                })}
              </div>}
            </section>
          );
        })}
      </div>

      <div className="qnav-footnote"><CheckCircle2 size={12} />完成一组后可进入下一组；点击任意题号直接跳转。</div>
    </div>
  );
}
