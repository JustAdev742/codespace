import { useCallback, useSyncExternalStore } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { api } from './api.ts';
import { meKey, useMe, type Me, type Preferences } from './session.ts';

/*
 * Which walkthroughs (the "how to play" steps before a game) someone has finished, so a mode they
 * know does not show its steps again. Signed in, it is kept with the account and follows them to
 * any device (the server also reads it when they join a room). Signed out, it is kept on this device.
 * Keys are a room's `tutorialKey`: the mode id, or `made:<id>` for a made game.
 */

const LOCAL_KEY = 'ludora.tutorials';
/** The server keeps the newest 300 (users/preferences.ts); so does this device. */
export const SEEN_MAX = 300;

/** `current` with `add` on the end, each once, the newest kept. */
export function withSeen(current: readonly string[], add: string): string[] {
  return [...current.filter((k) => k !== add), add].slice(-SEEN_MAX);
}

function readLocal(): string[] {
  try {
    const v = JSON.parse(localStorage.getItem(LOCAL_KEY) ?? '[]') as unknown;
    return Array.isArray(v) ? v.filter((k): k is string => typeof k === 'string') : [];
  } catch {
    return [];
  }
}

let local: string[] | null = null;
const listeners = new Set<() => void>();
const getLocal = () => (local ??= readLocal());
const subscribe = (l: () => void) => {
  listeners.add(l);
  return () => listeners.delete(l);
};

function markLocal(key: string) {
  local = withSeen(getLocal(), key);
  try {
    localStorage.setItem(LOCAL_KEY, JSON.stringify(local));
  } catch {
    /* storage can be unavailable (private mode): it is remembered for this visit */
  }
  listeners.forEach((l) => l());
}

/** The walkthroughs this player has finished, and a way to add one. */
export function useTutorialsSeen(): { seen: (key: string) => boolean; markSeen: (key: string) => void; ready: boolean } {
  const me = useMe();
  const qc = useQueryClient();
  const user = me.data?.user ?? null;
  const device = useSyncExternalStore(subscribe, getLocal, getLocal);
  const list = user ? (user.preferences.tutorials ?? []) : device;
  const seen = useCallback((key: string) => list.includes(key), [list]);
  const markSeen = useCallback(
    (key: string) => {
      const current = qc.getQueryData<Me>(meKey)?.user;
      if (!current) {
        markLocal(key);
        return;
      }
      if (current.preferences.tutorials?.includes(key)) return;
      const tutorials = withSeen(current.preferences.tutorials ?? [], key);
      qc.setQueryData<Me>(meKey, (old) => (old?.user ? { ...old, user: { ...old.user, preferences: { ...old.user.preferences, tutorials } } } : old));
      // The server adds it to what it already has, so two devices never undo each other.
      api
        .patch<{ preferences: Preferences }>('/api/me/preferences', { tutorials: [key] })
        .then((r) => qc.setQueryData<Me>(meKey, (old) => (old?.user ? { ...old, user: { ...old.user, preferences: r.preferences } } : old)))
        .catch(() => {
          /* Not saved: they see the steps once more next time, which does no harm. */
        });
    },
    [qc],
  );
  return { seen, markSeen, ready: !me.isLoading };
}
