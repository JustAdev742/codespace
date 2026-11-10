import { useCallback } from 'react';
import { useQuery } from '@tanstack/react-query';
import { toast } from 'sonner';
import type { AvatarLite, ModeThumbnail } from '@ludora/shared';
import { api } from '../../lib/api.ts';
import { useMe } from '../../lib/session.ts';
import { useModes, thumbFor, type CatalogEntry, type CatalogVariant } from '../../lib/queries.ts';
import type { QuestionStat } from '../reports/reportUi.tsx';

/* Shapes returned by server/src/modules/classes/routes.ts. */

export interface TeachingClass {
  id: string;
  name: string;
  joinCode: string;
  members: number;
  assignments: number;
  archived: boolean;
  createdAt: string;
}

export interface MemberClass {
  id: string;
  name: string;
  teacher: string;
}

export interface ClassesResponse {
  canTeach: boolean;
  teaching: TeachingClass[];
  member: MemberClass[];
}

interface AssignmentBase {
  id: string;
  title: string;
  instructions: string;
  setId: string;
  setTitle: string;
  modeId: string;
  variantId: string | null;
  dueAt: string | null;
  /** Students see and can start it from this time; null means straight away. */
  opensAt: string | null;
  /** After this it cannot be started; null means it never closes. */
  closesAt: string | null;
  /** Plays each student may start; null means any number. */
  maxAttempts: number | null;
  createdAt: string;
}

export interface TeacherAssignment extends AssignmentBase {
  /** Students who have played it at least once. */
  started: number;
  /** Students in the class now. */
  of: number;
}

/** The student's own numbers. bestCorrect and bestAnswered are each the highest across plays, not necessarily from the same play. */
export interface MyResult {
  plays: number;
  bestCorrect: number;
  bestAnswered: number;
  lastPlayedAt: string;
}

export interface StudentAssignment extends AssignmentBase {
  mine: MyResult | null;
  /** Why it cannot be started right now (closed, attempts used), from the server; null when it can. */
  blocked: string | null;
}

export interface ClassMember {
  id: string;
  displayName: string;
  username: string | null;
  level: number;
  joinedAt: string;
  lastSeenAt: string | null;
  avatar: AvatarLite | null;
  /** Made by the teacher with a class login, so the teacher resets its passcode. */
  classLogin: boolean;
  /** The teacher has a private note on this student. */
  hasNote: boolean;
}

interface ClassInfo {
  id: string;
  name: string;
  /** As the teacher typed it; text only. */
  schoolName: string | null;
  teacher: string;
  archived: boolean;
  leaderboardOn: boolean;
}

export interface ClassNotice {
  id: string;
  body: string;
  createdAt: string;
}

export interface ClassGoal {
  id: string;
  title: string;
  target: number;
  progress: number;
  startsAt: string;
  endsAt: string;
  reachedAt: string | null;
  /** The viewing student's badge for this goal; null for the teacher. */
  badge: boolean | null;
}

export interface ClassEvent {
  id: string;
  title: string;
  message: string;
  decor: string;
  hue: number;
  startsAt: string;
  endsAt: string;
}

export interface TeacherClassDetail {
  class: ClassInfo & { joinCode: string };
  role: 'teacher';
  memberCount: number;
  members: ClassMember[];
  assignments: TeacherAssignment[];
  events: ClassEvent[];
  notices: ClassNotice[];
  goal: ClassGoal | null;
}

export interface StudentClassDetail {
  class: ClassInfo;
  role: 'student';
  memberCount: number;
  members: null;
  assignments: StudentAssignment[];
  events: ClassEvent[];
  notices: ClassNotice[];
  goal: ClassGoal | null;
}

export type ClassDetail = TeacherClassDetail | StudentClassDetail;

export interface ReportStudent {
  id: string;
  displayName: string;
  username: string | null;
  attempts: number;
  best: {
    correct: number;
    answered: number;
    score: number;
    accuracy: number | null;
  } | null;
  firstPlayedAt: string | null;
  lastPlayedAt: string | null;
  /** Every attempt finished after the due date. */
  late: boolean;
}

export interface AssignmentReportData {
  assignment: {
    id: string;
    title: string;
    modeId: string;
    variantId: string | null;
    dueAt: string | null;
    opensAt: string | null;
    closesAt: string | null;
    maxAttempts: number | null;
    setTitle: string;
  };
  summary: {
    students: number;
    started: number;
    averageAccuracy: number | null;
  };
  students: ReportStudent[];
  questions: QuestionStat[];
}

/* Query keys. Invalidating `all` refreshes every class list, class and report. */
export const classKeys = {
  all: ['classes'] as const,
  list: ['classes', 'list'] as const,
  detail: (id: string) => ['classes', 'detail', id] as const,
  report: (id: string, aid: string) => ['classes', 'detail', id, 'report', aid] as const,
  attempts: (id: string, aid: string) => ['classes', 'detail', id, 'attempts', aid] as const,
  insights: (id: string) => ['classes', 'detail', id, 'insights'] as const,
  student: (id: string, uid: string) => ['classes', 'detail', id, 'student', uid] as const,
};

/* ------------------------------ Gradebook and insights ------------------------------ */

export interface GradeCell {
  attempts: number;
  best: {
    correct: number;
    answered: number;
    score: number;
    accuracy: number | null;
  } | null;
  late: boolean;
  lastPlayedAt: string | null;
}

export interface InsightsData {
  assignments: {
    id: string;
    title: string;
    dueAt: string | null;
    maxAttempts: number | null;
    setTitle: string;
    subject: string | null;
  }[];
  gradebook: {
    id: string;
    displayName: string;
    username: string | null;
    cells: Record<string, GradeCell>;
  }[];
  timeOnTask: {
    assignmentId: string;
    totalMs: number;
    students: number;
    medianMs: number | null;
  }[];
  byType: { type: string; answers: number; rate: number }[];
  needsAHand: {
    threshold: number;
    days: number;
    students: {
      id: string;
      displayName: string;
      rate: number;
      answers: number;
      overdue: number;
      missed: { setId: string | null; questionId: string; prompt: string }[];
    }[];
    notStarted: { id: string; displayName: string; overdue: number }[];
  };
  mostMissed: {
    setId: string | null;
    questionId: string;
    prompt: string;
    type: string;
    setTitle: string | null;
    tries: number;
    wrong: number;
    rate: number;
  }[];
}

export function useInsights(id: string, enabled = true) {
  return useQuery({
    queryKey: classKeys.insights(id),
    queryFn: () => api.get<InsightsData>(`/api/classes/${encodeURIComponent(id)}/insights`),
    enabled: enabled && Boolean(id),
  });
}

export type QuestionResult = 'right' | 'wrong';

export interface Attempt {
  gameId: string;
  endedAt: string;
  correct: number;
  answered: number;
  score: number;
  durationMs: number;
  late: boolean;
  results: Record<string, QuestionResult>;
}

export interface AttemptsData {
  assignment: { id: string; title: string; dueAt: string | null };
  questions: { id: string; prompt: string; type: string }[];
  students: { id: string; displayName: string; attempts: Attempt[] }[];
}

export function useAttempts(id: string, aid: string, enabled = true) {
  return useQuery({
    queryKey: classKeys.attempts(id, aid),
    queryFn: () => api.get<AttemptsData>(`/api/classes/${encodeURIComponent(id)}/assignments/${encodeURIComponent(aid)}/attempts`),
    enabled: enabled && Boolean(id && aid),
  });
}

export type WorkStatus = 'done' | 'late' | 'overdue' | 'todo';

export interface StudentReportData {
  class: {
    id: string;
    name: string;
    teacher: string;
    schoolName: string | null;
  };
  student: { id: string; displayName: string; username?: string | null };
  summary: {
    assignments: number;
    done: number;
    late: number;
    accuracy: number | null;
    timeMs: number;
  };
  assignments: (GradeCell & {
    id: string;
    title: string;
    setTitle: string;
    dueAt: string | null;
    status: WorkStatus;
    firstAccuracy: number | null;
    lastAccuracy: number | null;
    timeMs: number;
  })[];
  bySubject: {
    subject: string;
    correct: number;
    answered: number;
    rate: number | null;
  }[];
  byType: { type: string; answers: number; rate: number }[];
  weekly: { weekOf: string; games: number; rate: number | null }[];
  /** Teacher only. */
  note?: { body: string; updatedAt: string } | null;
}

export function useStudentReport(id: string, uid: string, enabled = true) {
  return useQuery({
    queryKey: classKeys.student(id, uid),
    queryFn: () => api.get<StudentReportData>(`/api/classes/${encodeURIComponent(id)}/students/${encodeURIComponent(uid)}/report`),
    enabled: enabled && Boolean(id && uid),
  });
}

/** A class login as the server returns it once: the passcode is never shown again. */
export interface LoginCard {
  userId: string;
  displayName: string;
  username: string;
  passcode: string;
}

/** Who is looking: classes need a full account, so guests and signed-out visitors get a prompt instead. */
export function useAccountState(): 'loading' | 'signedOut' | 'guest' | 'account' {
  const me = useMe();
  if (me.isLoading) return 'loading';
  const user = me.data?.user;
  if (!user) return 'signedOut';
  return user.isGuest ? 'guest' : 'account';
}

export function useClassList(enabled: boolean) {
  return useQuery({
    queryKey: classKeys.list,
    queryFn: () => api.get<ClassesResponse>('/api/classes'),
    enabled,
  });
}

export function useClassDetail(id: string, enabled: boolean) {
  return useQuery({
    queryKey: classKeys.detail(id),
    queryFn: () => api.get<ClassDetail>(`/api/classes/${encodeURIComponent(id)}`),
    enabled: enabled && Boolean(id),
  });
}

/* ---------------------------------- Modes ----------------------------------- */

const FALLBACK_THUMB: ModeThumbnail = {
  glyph: 'spark',
  hue: 255,
  accentHue: 42,
};

export interface ModeInfo {
  title: string;
  thumb: ModeThumbnail;
  mode: CatalogEntry | null;
  variant: CatalogVariant | null;
}

function humanise(id: string): string {
  const s = id.replace(/[-_]+/g, ' ').trim();
  return s ? s.charAt(0).toUpperCase() + s.slice(1) : 'Game';
}

/** Titles and artwork for the mode an assignment uses, from the catalogue. */
export function useModeInfo(): (modeId: string, variantId: string | null) => ModeInfo {
  const modes = useModes();
  const list = modes.data?.modes;
  return useCallback(
    (modeId: string, variantId: string | null) => {
      const mode = list?.find((m) => m.meta.id === modeId) ?? null;
      const variant = (variantId && mode?.variants.find((v) => v.meta.id === variantId)) || null;
      return {
        title: variant?.meta.title ?? mode?.meta.title ?? humanise(variantId ?? modeId),
        thumb: mode ? thumbFor(mode.meta, variant?.meta) : FALLBACK_THUMB,
        mode,
        variant,
      };
    },
    [list],
  );
}

/* --------------------------------- Dates ------------------------------------ */

const pad = (n: number) => String(n).padStart(2, '0');

/** An ISO time as the value a datetime-local input expects, in this device's time zone. */
export function toLocalInput(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/** A datetime-local value (local time, no zone) as ISO 8601 with this device's offset, for example 2026-10-24T15:00:00+01:00. */
export function fromLocalInput(value: string): string | null {
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(value)) return null;
  // Date-time strings without an offset are read as local time.
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return null;
  const offset = -d.getTimezoneOffset();
  const sign = offset >= 0 ? '+' : '-';
  const abs = Math.abs(offset);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}:00${sign}${pad(Math.floor(abs / 60))}:${pad(abs % 60)}`;
}

export function isPast(iso: string | null, now: number): boolean {
  return Boolean(iso && new Date(iso).getTime() < now);
}

/* --------------------------------- Clipboard -------------------------------- */

export async function copyText(text: string, done: string) {
  try {
    if (!navigator.clipboard) throw new Error('Clipboard unavailable');
    await navigator.clipboard.writeText(text);
    toast.success(done);
  } catch {
    toast.error(`Copying did not work. The code is ${text}.`);
  }
}
