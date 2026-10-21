import { useEffect, useRef, type RefObject } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import type { AvatarLite } from '@ludora/shared';
import { api, ApiError } from '../../lib/api.ts';

/*
 * Data shared by the friends, profile, stats and leaderboard pages. Shapes
 * follow server/src/modules/social/routes.ts and profiles/routes.ts.
 */

export interface Friend {
  id: string;
  displayName: string;
  level: number;
  avatar: AvatarLite | null;
  /** When you became friends, or when the request was sent. */
  since: string;
}

export interface FriendsData {
  friendCode: string;
  friends: Friend[];
  incoming: Friend[];
  outgoing: Friend[];
  max: number;
}

export interface BlockedPlayer {
  id: string;
  displayName: string;
  since: string;
}

export const friendsKey = ['friends'] as const;
export const blocksKey = ['blocks'] as const;

export const getFriends = () => api.get<FriendsData>('/api/friends');
export const getBlocks = () => api.get<{ blocked: BlockedPlayer[] }>('/api/blocks');

/** Everything a friend, request or block change can affect: lists, profiles and leaderboards. */
export function useSocialRefresh() {
  const qc = useQueryClient();
  return () => Promise.all(['friends', 'blocks', 'profile', 'leaderboard'].map((k) => qc.invalidateQueries({ queryKey: [k] })));
}

/** "12 Oct", with the year only when it is not this year. */
export function shortDate(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: d.getFullYear() === new Date().getFullYear() ? undefined : 'numeric' });
}

/** The server's message when there is one (it is written for players), otherwise the fallback. */
export function errorText(err: unknown, fallback: string): string {
  return err instanceof ApiError ? err.message : fallback;
}

const focusLost = () => !document.activeElement || document.activeElement === document.body;

/**
 * The button someone presses (Accept, Remove, Block) usually disappears once
 * the data refreshes, which would drop keyboard focus to the page. Call the
 * returned function with where focus should go; after the next change to the
 * watched data, focus moves there if it was lost.
 */
export function useFocusAfterUpdate(...watch: unknown[]) {
  const targets = useRef<RefObject<HTMLElement | null>[]>([]);
  useEffect(() => {
    const list = targets.current;
    targets.current = [];
    if (list.length && focusLost()) list.find((t) => t.current?.isConnected)?.current?.focus();
    // The watched values are the dependencies; the list has the same length on every render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, watch);
  /** The first of these still on the page gets focus. */
  return (...to: RefObject<HTMLElement | null>[]) => {
    targets.current = to;
  };
}

/**
 * The shared Dialog has no trigger element, so closing it leaves focus on the
 * page. Pass the dialog's open state; call the returned function with the
 * button that opened it, and focus goes back there when the dialog closes.
 */
export function useReturnFocus(open: boolean) {
  const opener = useRef<HTMLElement | null>(null);
  useEffect(() => {
    if (open) return;
    const el = opener.current;
    opener.current = null;
    if (!el) return;
    const t = window.setTimeout(() => {
      if (el.isConnected && focusLost()) el.focus();
    }, 0);
    return () => window.clearTimeout(t);
  }, [open]);
  return (el: HTMLElement | null) => {
    opener.current = el;
  };
}

/** Names the browser tab after the page and puts the previous name back when the page closes. */
export function usePageTitle(title: string) {
  useEffect(() => {
    const before = document.title;
    document.title = `${title} | Ludora`;
    return () => {
      document.title = before;
    };
  }, [title]);
}
