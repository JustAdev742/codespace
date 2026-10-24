import { useEffect, useMemo, type ReactNode } from 'react';
import { Link } from 'react-router';
import { ArrowDown, ArrowUp, ArrowUpDown, ChevronLeft, ListChecks, LogIn } from 'lucide-react';
import { QUESTION_TYPE_LABELS, type QuestionType } from '@ludora/shared';
import { EmptyState } from '../../ui/primitives.tsx';
import { ButtonLink } from '../../ui/Button.tsx';
import { formatNumber } from '../../lib/format.ts';
import { ApiError } from '../../lib/api.ts';

/*
 * Pieces shared by the class and game reports: stat tiles, tables that
 * scroll inside their own box on narrow screens, bars that always show
 * their number, and the per-question table.
 */

/** How one question went, as the API reports it (server/src/modules/analytics/report.ts). */
export interface QuestionStat {
  questionId: string;
  prompt: string;
  type: string;
  /** Players who answered it at least once. */
  players: number;
  /** Share of those players whose first try was right (0-1). */
  firstTryRate: number;
  /** All tries, including retries in puzzle modes. */
  attempts: number;
  avgResponseMs: number;
}

/** Names the browser tab while the page is open, and puts the previous name back afterwards. */
export function usePageTitle(title: string | null | undefined) {
  useEffect(() => {
    if (!title) return;
    const previous = document.title;
    document.title = `${title} | Ludora`;
    return () => {
      document.title = previous;
    };
  }, [title]);
}

/* --------------------------------- Errors ----------------------------------- */

/** The server's message when there is one; it is written for the person reading it. */
export function errorText(err: unknown, fallback: string): string {
  return err instanceof ApiError ? err.message : fallback;
}

export function hasStatus(err: unknown, ...statuses: number[]): boolean {
  return err instanceof ApiError && statuses.includes(err.status);
}

/* -------------------------------- Formatting -------------------------------- */

export function percent(rate: number): string {
  return `${Math.round(Math.max(0, Math.min(1, rate)) * 100)}%`;
}

/** 3.4 s under ten seconds, whole seconds above. */
export function seconds(ms: number): string {
  const s = Math.max(0, ms) / 1000;
  return `${s < 10 ? s.toFixed(1) : Math.round(s)} s`;
}

const sameYear = (d: Date) => d.getFullYear() === new Date().getFullYear();

/** "Sat 24 Oct, 15:05", with the year when it is not this year. */
export function dateTimeText(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', ...(sameYear(d) ? {} : { year: 'numeric' }), hour: '2-digit', minute: '2-digit' });
}

/** "24 Oct", with the year when it is not this year. */
export function dateText(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', ...(sameYear(d) ? {} : { year: 'numeric' }) });
}

export function questionTypeLabel(type: string): string | null {
  return QUESTION_TYPE_LABELS[type as QuestionType] ?? null;
}

/* --------------------------------- Layout ----------------------------------- */

export function BackLink({ to, children }: { to: string; children: ReactNode }) {
  return (
    <Link to={to} className="mb-3 inline-flex max-w-full items-center gap-1 text-sm font-semibold">
      <ChevronLeft className="size-4 shrink-0" aria-hidden />
      <span className="truncate">{children}</span>
    </Link>
  );
}

/** A row of headline numbers. Use StatTile inside. */
export function StatRow({ children, label }: { children: ReactNode; label: string }) {
  return (
    <dl aria-label={label} className="mb-8 grid grid-cols-2 gap-3 lg:grid-cols-4">
      {children}
    </dl>
  );
}

/** A headline number: condensed, tabular and big, so a report can be read at a glance. */
export function StatTile({ label, value, children }: { label: string; value: ReactNode; children?: ReactNode }) {
  return (
    <div className="flex min-w-0 flex-col rounded-[var(--radius-l)] border border-line bg-raised p-4">
      <dt className="text-sm font-semibold text-text-2">{label}</dt>
      <dd className="mt-1.5 font-display text-[2rem] leading-none font-extrabold break-words text-text tabular sm:text-[2.5rem]">{value}</dd>
      {children ? <dd className="mt-auto pt-2.5 text-sm text-text-3">{children}</dd> : null}
    </div>
  );
}

/** A value the API has no number for, read out as "none" rather than as a dash. */
export function NoValue({ label = 'None' }: { label?: string }) {
  return (
    <span className="text-text-3">
      <span aria-hidden>–</span>
      <span className="sr-only">{label}</span>
    </span>
  );
}

/* --------------------------------- Tables ----------------------------------- */

/** A table that scrolls sideways inside its own box on narrow screens, never the page. */
export function TableBox({ caption, minWidth = 640, children }: { caption: string; minWidth?: number; children: ReactNode }) {
  return (
    // Focusable so keyboard users can scroll it when it is wider than the screen. Relative, so
    // visually hidden text in cells (absolutely positioned) is clipped here instead of widening the page.
    <div className="relative overflow-x-auto rounded-[var(--radius-l)] border border-line bg-raised" role="region" aria-label={caption} tabIndex={0}>
      <table className="w-full border-collapse text-left text-sm" style={{ minWidth }}>
        <caption className="sr-only">{caption}</caption>
        {children}
      </table>
    </div>
  );
}

const thClass = 'px-3 py-2.5 text-xs font-semibold whitespace-nowrap text-text-2';

export function Th({ children, align = 'left', className = '' }: { children: ReactNode; align?: 'left' | 'right'; className?: string }) {
  return (
    <th scope="col" className={`${thClass} ${align === 'right' ? 'text-right' : ''} ${className}`}>
      {children}
    </th>
  );
}

export interface SortState<K extends string> {
  key: K;
  dir: 'asc' | 'desc';
}

/** A column header that sorts the table. Screen readers hear which column is sorted and which way. */
export function SortTh<K extends string>({ label, sortKey, sort, onSort, align = 'left' }: { label: string; sortKey: K; sort: SortState<K>; onSort: (key: K) => void; align?: 'left' | 'right' }) {
  const active = sort.key === sortKey;
  const Icon = !active ? ArrowUpDown : sort.dir === 'asc' ? ArrowUp : ArrowDown;
  return (
    <th scope="col" aria-sort={active ? (sort.dir === 'asc' ? 'ascending' : 'descending') : undefined} className={`${thClass} ${align === 'right' ? 'text-right' : ''}`}>
      {/* Takes presses across 44px: an invisible strip above and below fills the header row. */}
      <button type="button" onClick={() => onSort(sortKey)} className={`relative inline-flex items-center gap-1 rounded-[var(--radius-s)] font-semibold after:absolute after:-inset-x-1.5 after:-inset-y-3.5 hover:text-text ${active ? 'text-text' : ''}`}>
        {label}
        <Icon className={`size-3.5 shrink-0 ${active ? '' : 'opacity-60'}`} aria-hidden />
      </button>
    </th>
  );
}

/**
 * A share from 0 to 1 as a short bar with its percentage beside it. The number carries the meaning; the bar helps
 * scanning. A plain groove with a solid fill in the brand blue, which stands out from the groove in both themes.
 */
export function RateBar({ rate }: { rate: number }) {
  const pct = Math.round(Math.max(0, Math.min(1, rate)) * 100);
  return (
    <span className="flex items-center gap-2.5">
      <span className="w-11 shrink-0 text-right font-display text-lg leading-none font-bold text-text tabular">{pct}%</span>
      <span className="h-2.5 w-20 shrink-0 overflow-hidden rounded-[var(--radius-s)] bg-sunken shadow-[inset_0_0_0_1px_var(--line)] sm:w-28" aria-hidden>
        <span className="block h-full rounded-[var(--radius-s)] bg-[var(--floodlight)]" style={{ width: `${pct}%` }} />
      </span>
    </span>
  );
}

/** Lowest first-try rate first; among equals, the question more players answered. */
export function hardestFirst(questions: QuestionStat[]): QuestionStat[] {
  return [...questions].sort((a, b) => a.firstTryRate - b.firstTryRate || b.players - a.players);
}

/**
 * How each question went, hardest first. The API counts each player once per
 * game, judged on their first try; across several games (an assignment) that
 * is a count of games, so the caller names the column.
 */
export function QuestionTable({ questions, caption, empty, countLabel = 'Players' }: { questions: QuestionStat[]; caption: string; empty: ReactNode; countLabel?: string }) {
  const rows = useMemo(() => hardestFirst(questions), [questions]);
  if (!rows.length) {
    return (
      <EmptyState icon={<ListChecks className="size-8" />} title="No answers yet">
        {empty}
      </EmptyState>
    );
  }
  return (
    <TableBox caption={caption} minWidth={660}>
      <thead className="bg-surface-2">
        <tr>
          <Th>Question</Th>
          <Th>Right first time</Th>
          <Th align="right">{countLabel}</Th>
          <Th align="right">Attempts</Th>
          <Th align="right">Average time</Th>
        </tr>
      </thead>
      <tbody>
        {rows.map((q) => {
          const type = questionTypeLabel(q.type);
          return (
            <tr key={q.questionId} className="border-t border-line align-top">
              <td className="min-w-[16rem] px-3 py-3">
                <p className="font-semibold text-text [overflow-wrap:anywhere]">{q.prompt}</p>
                {type ? <p className="text-xs text-text-3">{type}</p> : null}
              </td>
              <td className="px-3 py-3">
                <RateBar rate={q.firstTryRate} />
              </td>
              <td className="px-3 py-3 text-right text-text tabular">{formatNumber(q.players)}</td>
              <td className="px-3 py-3 text-right text-text tabular">{formatNumber(q.attempts)}</td>
              <td className="px-3 py-3 text-right whitespace-nowrap text-text tabular">{q.avgResponseMs > 0 ? seconds(q.avgResponseMs) : <NoValue />}</td>
            </tr>
          );
        })}
      </tbody>
    </TableBox>
  );
}

/* ---------------------------------- Gates ----------------------------------- */

export function SignInPrompt({ title, next, children }: { title: string; next: string; children: ReactNode }) {
  return (
    <EmptyState
      icon={<LogIn className="size-8" />}
      title={title}
      action={
        <div className="flex flex-wrap justify-center gap-2">
          <ButtonLink to={`/signin?next=${encodeURIComponent(next)}`} variant="primary">
            Sign in
          </ButtonLink>
          <ButtonLink to="/signup">Create an account</ButtonLink>
        </div>
      }
    >
      {children}
    </EmptyState>
  );
}
