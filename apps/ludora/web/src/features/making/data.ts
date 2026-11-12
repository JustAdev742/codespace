import { useQuery } from '@tanstack/react-query';
import type { Question, Subject } from '@ludora/shared';
import { api } from '../../lib/api.ts';
import { useMe } from '../../lib/session.ts';

/* What the Make page reads from the server (server/src/modules/making/routes.ts). */

export interface RecentItem {
  kind: 'set' | 'lesson' | 'game';
  id: string;
  title: string;
  at: string;
  detail: string;
}

export interface DraftSummary {
  id: string;
  kind: 'quick';
  title: string;
  updatedAt: string;
  questions: number;
  step: DraftBody['step'];
}

export interface DraftBody {
  title: string;
  subject?: Subject;
  text: string;
  questions: Question[];
  step: 'paste' | 'choose' | 'done';
  setId: string | null;
}

export interface MakingOverview {
  recent: RecentItem[];
  drafts: DraftSummary[];
  counts: { sets: number; lessons: number; games: number; classes: number; hosted: number; homework: number };
  dismissed: string[];
}

export const makingKeys = {
  overview: ['making', 'overview'] as const,
  draft: (id: string) => ['making', 'draft', id] as const,
  today: (day: string) => ['making', 'today', day] as const,
  tools: (classId: string) => ['making', 'tools', classId] as const,
};

export function useMakingOverview() {
  const me = useMe();
  const signedIn = Boolean(me.data?.user && !me.data.user.isGuest);
  return useQuery({ queryKey: makingKeys.overview, queryFn: () => api.get<MakingOverview>('/api/making/overview'), enabled: signedIn });
}

export const RECENT_LINK: Record<RecentItem['kind'], (id: string) => string> = {
  set: (id) => `/sets/${id}`,
  lesson: (id) => `/lessons/${id}`,
  game: (id) => `/host?game=${id}`,
};

export const RECENT_LABEL: Record<RecentItem['kind'], string> = { set: 'Question set', lesson: 'Lesson', game: 'Saved game' };
