import { useQuery, useQueryClient } from '@tanstack/react-query';
import type { LevelInfo, Permission } from '@ludora/shared';
import { api } from './api.ts';

export interface Preferences {
  theme: 'system' | 'light' | 'dark';
  reducedMotion: 'system' | 'on' | 'off';
  sound: boolean;
  music: boolean;
  textSize: 'normal' | 'large' | 'larger';
  highContrast: boolean;
  notifications: { friendRequests: boolean; gameInvites: boolean; rewards: boolean };
  privacy: { profileVisibility: 'public' | 'friends' | 'private'; allowFriendRequests: 'everyone' | 'friend_code' | 'nobody'; showOnLeaderboards: boolean };
}

export interface MeUser {
  id: string;
  username: string | null;
  displayName: string;
  isGuest: boolean;
  accountType: 'player' | 'student' | 'teacher';
  ageBand: string | null;
  isTestAccount: boolean;
  friendCode: string;
  level: LevelInfo;
  preferences: Preferences;
  muted: boolean;
}

export interface Me {
  user: MeUser | null;
  roles: string[];
  permissions: Permission[];
  environment: 'development' | 'test' | 'sandbox' | 'production';
  /** Feature flags evaluated for this viewer by the server. */
  flags?: Record<string, boolean>;
}

export const meKey = ['me'] as const;

export function useMe() {
  return useQuery({ queryKey: meKey, queryFn: () => api.get<Me>('/api/auth/me'), staleTime: 60_000 });
}

export function useFlag(key: string): boolean {
  const { data } = useMe();
  return Boolean(data?.flags?.[key]);
}

export function useCan(permission: Permission): boolean {
  const { data } = useMe();
  return Boolean(data?.permissions.includes(permission));
}

/** Refresh everything that depends on who is signed in. */
export function useRefreshSession() {
  const qc = useQueryClient();
  return () => qc.invalidateQueries();
}
