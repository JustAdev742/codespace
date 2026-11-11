import { useQuery } from '@tanstack/react-query';
import type { LessonBody, LessonStep } from '@ludora/shared';
import { api } from '../../lib/api.ts';
import { formatDate } from '../../lib/format.ts';

/* Shapes returned by server/src/modules/lessons/routes.ts. */

export interface LessonSummary {
  id: string;
  title: string;
  steps: number;
  games: number;
  minutes: number;
  className: string | null;
  startsAt: string | null;
  updatedAt: string;
}

export interface StepInfo {
  title: string;
  modeTitle: string | null;
  setTitle: string | null;
  questionCount: number | null;
  minutes: number;
  /** Why this step cannot run yet, if it cannot. */
  problem: string | null;
}

export interface LessonDetail {
  lesson: LessonBody & { id: string; classId: string | null; className: string | null; startsAt: string | null; updatedAt: string };
  info: StepInfo[];
  totalMinutes: number;
  lastRun: { id: string; index: number; finished: boolean; startedAt: string; games: number } | null;
  liveCode: string | null;
}

export interface TemplateSummary {
  id: string;
  title: string;
  description: string;
  steps: number;
}

export interface RunReport {
  lesson: { id: string; title: string; goals: string[]; standingsOn: boolean };
  run: { id: string; startedAt: string; finishedAt: string | null; index: number; classId: string | null };
  steps: { title: string; kind: LessonStep['kind'] }[];
  games: { index: number; title: string; gameId: string | null; players: number | null; modeTitle: string | null }[];
  sets: { id: string; title: string; modeId: string }[];
  standings: { name: string; points: number; rank: number }[];
}

export const lessonKeys = {
  list: ['lessons'] as const,
  one: (id: string) => ['lessons', id] as const,
  runs: (id: string) => ['lessons', id, 'runs'] as const,
  report: (runId: string) => ['lesson-run', runId] as const,
  templates: ['lessons', 'templates'] as const,
  forClass: (classId: string) => ['class-lessons', classId] as const,
};

export function useLessons(enabled = true) {
  return useQuery({ queryKey: lessonKeys.list, queryFn: () => api.get<{ lessons: LessonSummary[] }>('/api/lessons'), enabled });
}

export function useLesson(id: string) {
  return useQuery({ queryKey: lessonKeys.one(id), queryFn: () => api.get<LessonDetail>(`/api/lessons/${id}`), retry: false });
}

export function useTemplates(enabled = true) {
  return useQuery({ queryKey: lessonKeys.templates, queryFn: () => api.get<{ templates: TemplateSummary[] }>('/api/lessons/templates'), staleTime: Infinity, enabled });
}

export const KIND_LABEL: Record<LessonStep['kind'], string> = { game: 'Game', slide: 'Info slide', discussion: 'Discussion' };

export function minutesText(n: number): string {
  return n < 60 ? `About ${n} min` : `About ${Math.floor(n / 60)} h ${n % 60 ? `${n % 60} min` : ''}`.trim();
}

/** A fresh step id, unique within a lesson. */
export function newStepId(): string {
  return `s${Date.now().toString(36).slice(-5)}${Math.random().toString(36).slice(2, 7)}`;
}

/** Move one item in a list from one place to another. */
export function moveItem<T>(list: readonly T[], from: number, to: number): T[] {
  if (from === to || from < 0 || to < 0 || from >= list.length || to >= list.length) return [...list];
  const out = [...list];
  const [item] = out.splice(from, 1);
  out.splice(to, 0, item!);
  return out;
}

/** Datetime-local input value ("2026-11-12T10:15") from an ISO time, in the browser's own time zone. */
export function toLocalInput(iso: string | null): string {
  if (!iso) return '';
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/** "Starts at 10:15" today, or with the day when it is another day. */
export function startsText(iso: string, now = new Date()): string {
  const d = new Date(iso);
  const time = formatDate(d, { hour: '2-digit', minute: '2-digit' });
  // The same day in the viewer's chosen time zone, not the device's.
  const dayOf = (x: Date) => formatDate(x, { year: 'numeric', month: 'numeric', day: 'numeric' });
  const sameDay = dayOf(d) === dayOf(now);
  if (sameDay) return d.getTime() < now.getTime() ? `Started at ${time}` : `Starts at ${time}`;
  return `Starts ${formatDate(d, { weekday: 'long', day: 'numeric', month: 'long' })} at ${time}`;
}
