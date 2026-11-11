import { useQuery } from '@tanstack/react-query';
import type { AvatarLite, HouseEmblem } from '@ludora/shared';
import { api } from '../../lib/api.ts';
import { useMe } from '../../lib/session.ts';

/* The School pages' data, from /api/school. Every rule is the server's; these are only shapes. */

export interface House {
  id: string;
  name: string;
  hue: number;
  emblem: HouseEmblem;
}

export interface SchoolOverview {
  houses: House[];
  settings: { houseChoice: boolean; dailyCap: number; pointsPerCorrect: number; meritPoints: number; values: string[]; timeZone: string; meritsPerTeacherPerDay: number };
  me: { house: House | null; canChoose: boolean };
  can: { manage: boolean; viewUsage: boolean; teach: boolean };
}

export interface RankedHouse extends House {
  points: number;
  rank: number;
}

export interface Standings {
  period: 'week' | 'cup' | 'all';
  from: string | null;
  to: string | null;
  cup: { id: string; name: string; startsOn: string; endsOn: string } | null;
  houses: RankedHouse[];
  years: { id: string; year: number | null; points: number; players: number }[];
}

export interface PastCup {
  id: string;
  name: string;
  startsOn: string;
  endsOn: string;
  winnerName: string | null;
  totals: RankedHouse[];
}

export interface SchoolMe {
  house: House | null;
  welcome: boolean;
  sportDays: number[];
  ownSportDays: boolean;
  sportToday: boolean;
}

export interface SchoolEvent {
  id: string;
  title: string;
  message: string;
  decor: string;
  hue: number;
  startsAt: string;
  endsAt: string;
  on: boolean;
}

export interface Notice {
  id: string;
  title: string;
  body: string;
  audience: 'students' | 'teachers' | 'everyone';
  startsAt: string;
  endsAt: string;
}

export interface ClassRoster {
  class: { id: string; name: string };
  students: { id: string; displayName: string; houseId: string | null; avatar: AvatarLite | null }[];
  sportDays: number[];
  merits: { givenToday: number; limit: number; values: string[]; points: number };
}

export const schoolKeys = {
  overview: ['school'] as const,
  me: ['school', 'me'] as const,
  standings: (p: string) => ['school', 'standings', p] as const,
  cups: ['school', 'cups'] as const,
  fame: ['school', 'fame'] as const,
  notices: ['school', 'notices'] as const,
  event: ['school', 'event'] as const,
};

const signedIn = (me: ReturnType<typeof useMe>) => Boolean(me.data?.user && !me.data.user.isGuest);

export function useSchool() {
  const me = useMe();
  return useQuery({ queryKey: schoolKeys.overview, queryFn: () => api.get<SchoolOverview>('/api/school'), enabled: Boolean(me.data?.user), staleTime: 30_000 });
}

export function useSchoolMe() {
  const me = useMe();
  return useQuery({ queryKey: schoolKeys.me, queryFn: () => api.get<SchoolMe>('/api/school/me'), enabled: signedIn(me), staleTime: 60_000 });
}

export function useStandings(period: 'week' | 'cup' | 'all') {
  return useQuery({ queryKey: schoolKeys.standings(period), queryFn: () => api.get<Standings>(`/api/school/standings?period=${period}`) });
}

export function useSchoolEvent() {
  const me = useMe();
  return useQuery({ queryKey: schoolKeys.event, queryFn: () => api.get<{ event: SchoolEvent | null }>('/api/school/event'), enabled: Boolean(me.data?.user), staleTime: 5 * 60_000 });
}

export function useNotices() {
  const me = useMe();
  return useQuery({ queryKey: schoolKeys.notices, queryFn: () => api.get<{ notices: Notice[] }>('/api/school/notices'), enabled: Boolean(me.data?.user), staleTime: 60_000 });
}

export const WEEKDAYS = [
  { value: 1, short: 'Mon', long: 'Monday' },
  { value: 2, short: 'Tue', long: 'Tuesday' },
  { value: 3, short: 'Wed', long: 'Wednesday' },
  { value: 4, short: 'Thu', long: 'Thursday' },
  { value: 5, short: 'Fri', long: 'Friday' },
];

/** "3 March" from "2027-03-03". */
export function dayText(day: string): string {
  return new Date(`${day}T12:00:00Z`).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', timeZone: 'UTC' });
}

/** "Kindergarten", "Year 7", or "Year not given". */
export function yearLabel(year: number | null): string {
  return year === null ? 'Year not given' : year === 0 ? 'Kindergarten' : `Year ${year}`;
}
