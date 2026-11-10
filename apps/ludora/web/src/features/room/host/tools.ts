import { useCallback, useEffect, useRef, useState } from 'react';
import type { RoomView } from '@ludora/shared';

/*
 * The host's tools that live in the browser: full screen for the big screen, keyboard shortcuts,
 * the server clock (for countdowns the server set), and a rough length for the game.
 */

/** Full screen for the big screen. `supported` is false where the browser has no full screen (some iPhones). */
export function useFullscreen() {
  const [on, setOn] = useState(() => typeof document !== 'undefined' && Boolean(document.fullscreenElement));
  useEffect(() => {
    const update = () => setOn(Boolean(document.fullscreenElement));
    document.addEventListener('fullscreenchange', update);
    return () => document.removeEventListener('fullscreenchange', update);
  }, []);
  const supported = typeof document !== 'undefined' && Boolean(document.fullscreenEnabled);
  const toggle = useCallback(() => {
    if (!supported) return;
    if (document.fullscreenElement) void document.exitFullscreen().catch(() => {});
    else void document.documentElement.requestFullscreen().catch(() => {});
  }, [supported]);
  return { on, toggle, supported };
}

/** True while the user is typing somewhere a key means a letter, not a shortcut. */
export function isTyping(target: EventTarget | null): boolean {
  if (typeof HTMLElement === 'undefined' || !(target instanceof HTMLElement)) return false;
  if (target.isContentEditable) return true;
  const tag = target.tagName;
  if (tag === 'TEXTAREA' || tag === 'SELECT') return true;
  if (tag === 'INPUT') {
    const type = (target as HTMLInputElement).type;
    return !['button', 'checkbox', 'radio', 'range', 'submit', 'reset'].includes(type);
  }
  return false;
}

export interface Shortcut {
  /** The key as `KeyboardEvent.key`, lower case for letters. */
  key: string;
  /** What the sheet and tooltips show, e.g. "N". */
  label: string;
  /** What it does, for the sheet. */
  does: string;
  run: () => void;
  /** Left out of the sheet and ignored when false. */
  when?: boolean;
}

/** The host's keyboard shortcuts. Never while typing in a field, never with Ctrl, Cmd or Alt held, never inside an open dialog. */
export function useShortcuts(shortcuts: Shortcut[], enabled = true) {
  const ref = useRef(shortcuts);
  ref.current = shortcuts;
  useEffect(() => {
    if (!enabled) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.defaultPrevented || e.ctrlKey || e.metaKey || e.altKey || e.repeat) return;
      if (isTyping(e.target)) return;
      // A dialog or menu that is open has its own keys (Escape closes it); the page's shortcuts wait.
      if (document.querySelector('[role="dialog"][data-state="open"], [role="menu"][data-state="open"], [role="alertdialog"][data-state="open"]')) return;
      const key = e.key.length === 1 ? e.key.toLowerCase() : e.key;
      const hit = ref.current.find((s) => s.when !== false && s.key === key);
      if (!hit) return;
      // Space on a focused button presses that button; the shortcut is for when nothing else wants it.
      if (key === ' ' && e.target instanceof HTMLElement && e.target.closest('button, a, [role="button"]')) return;
      e.preventDefault();
      hit.run();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [enabled]);
}

/** The server's clock, from the last view: countdowns the server set (the start, a brain break) read against it. */
export function serverClock(view: RoomView, receivedAt: number): () => number {
  return () => view.serverNow + (Date.now() - receivedAt);
}

/**
 * Roughly how long a game will take, in minutes, for the lobby: the time limit when there is one,
 * otherwise each question's time plus a few seconds to read the answer and the scores.
 */
export function estimateMinutes(room: RoomView['room']): number | null {
  if (room.common.timeLimitSec) return Math.max(1, Math.round(room.common.timeLimitSec / 60));
  const n = room.common.questionLimit ? Math.min(room.common.questionLimit, room.questionCount) : room.questionCount;
  if (!n) return null;
  // Host-paced games add a reveal and a leaderboard between questions; self-paced players answer faster than the clock.
  const each = room.pacing === 'host' ? room.common.questionTimeSec * 0.8 + 9 : room.common.questionTimeSec * 0.6;
  return Math.max(1, Math.round((n * each + 10) / 60));
}

/** The keys shown on a button's tooltip, e.g. "Pause (P)". */
export const withKey = (label: string, key: string) => `${label} (${key})`;
