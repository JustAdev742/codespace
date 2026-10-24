import { useQuery } from '@tanstack/react-query';
import type { AvatarLite, ItemArt, LevelInfo, ModeMeta, ModeThumbnail, SettingField, VariantMeta } from '@ludora/shared';
import { api } from './api.ts';
import { useMe } from './session.ts';

export interface EquippedSlot {
  itemId: string;
  name: string;
  rarity: string;
  art: ItemArt;
}

export interface QuestView {
  id: string;
  /** 'event' quests belong to a running limited-time event such as the Frost Festival. */
  kind: 'daily' | 'weekly' | 'event';
  title: string;
  description: string;
  progress: number;
  target: number;
  period: string;
  completed: boolean;
  claimed: boolean;
  reward: { sparks?: number; moonstones?: number; xp?: number; frost_tickets?: number };
}

export interface Overview {
  balances: Record<string, number>;
  currencies: { code: string; name: string; kind: string; hue: number; description: string; howToEarn: string; howToSpend: string; expiresAt: string | null }[];
  stats: {
    gamesPlayed: number;
    gamesWon: number;
    podiums: number;
    gamesHosted: number;
    questionsAnswered: number;
    questionsCorrect: number;
    accuracy: number | null;
    bestStreak: number;
    dailyStreak: number;
    longestDailyStreak: number;
    playedToday: boolean;
    packsOpened: number;
  };
  dailySparks: { earned: number; cap: number };
  avatar: AvatarLite | null;
  equipped: Record<string, EquippedSlot>;
  level: LevelInfo;
  quests: { resets: { daily: string; weekly: string }; list: QuestView[] };
  recentGames: { gameId: string; modeId: string; title: string; setTitle: string; endedAt: string; players: number; entrants: number; rank: number; label: string; correct: number; answered: number }[];
}

export function useOverview() {
  const me = useMe();
  return useQuery({
    queryKey: ['overview'],
    queryFn: () => api.get<Overview>('/api/me/overview'),
    enabled: Boolean(me.data?.user),
    staleTime: 15_000,
  });
}

export interface CatalogVariant {
  meta: VariantMeta;
  settings?: Record<string, unknown>;
  common?: Record<string, unknown>;
  locked?: string[];
  hidden?: boolean;
}

export interface CatalogEntry {
  meta: ModeMeta;
  settings: SettingField[];
  variants: CatalogVariant[];
  featured: boolean;
  hidden: boolean;
}

export function useModes() {
  return useQuery({ queryKey: ['modes'], queryFn: () => api.get<{ modes: CatalogEntry[]; betaVisible: boolean }>('/api/modes'), staleTime: 60_000 });
}

export function thumbFor(mode: ModeMeta, variant?: VariantMeta | null): ModeThumbnail {
  return { ...mode.thumbnail, ...(variant?.thumbnail ?? {}) };
}

export interface SetSummary {
  id: string;
  title: string;
  description: string;
  subject: string;
  gradeBand: string | null;
  language?: string;
  tags: string[];
  visibility: 'private' | 'unlisted' | 'public';
  cover: { glyph: string; hue: number } | null;
  questionCount: number;
  isOfficial: boolean;
  isFeatured: boolean;
  hidden: boolean;
  plays: number;
  ownerId: string | null;
  ownerName: string | null;
  updatedAt: string;
}

export function useSets(params: { scope?: string; q?: string; subject?: string; page?: number }) {
  const search = new URLSearchParams(Object.entries(params).filter(([, v]) => v !== undefined && v !== '').map(([k, v]) => [k, String(v)]));
  return useQuery({
    queryKey: ['sets', params],
    queryFn: ({ signal }) => api.get<{ sets: SetSummary[]; total: number; page: number; pageSize: number }>(`/api/sets?${search}`, signal),
    placeholderData: (prev) => prev,
  });
}
