/**
 * Playing solo, the "Your settings" stage: what a player changed last time for a game, kept on
 * this device, and the one-line summary of the settings a game will start with. Pure apart from
 * the storage it is handed: no React, no DOM.
 */
import { PRACTICE_LEVEL_IDS, PRACTICE_LEVEL_INFO, type PracticeLevel } from '@ludora/shared';

/** What a solo player changed for one game (a mode, a variant or a made game), and nothing else. */
export interface SoloPrefs {
  common: Record<string, number | boolean>;
  settings: Record<string, string | number | boolean>;
  bots: number;
  botLevel: PracticeLevel;
}

/** The part of Storage this needs, so tests can hand in a plain object. */
export type KeyValueStore = Pick<Storage, 'getItem' | 'setItem'>;

export const SOLO_PREFS_KEY = 'ludora.solo-settings';
/** Games remembered at most; the oldest is forgotten first. */
export const SOLO_PREFS_MAX = 30;
const MAX_BOTS = 5;

/** The key a game's settings are remembered under: the variant, else the mode, else the made game. */
export const soloPrefsKey = (c: { modeId: string; variantId?: string | null; madeGameId?: string | null }) => (c.madeGameId ? `made:${c.madeGameId}` : (c.variantId ?? c.modeId));

function browserStore(): KeyValueStore | null {
  try {
    return typeof localStorage === 'undefined' ? null : localStorage;
  } catch {
    return null;
  }
}

const isRecord = (v: unknown): v is Record<string, unknown> => Boolean(v) && typeof v === 'object' && !Array.isArray(v);

function pick<T>(v: unknown, keep: (x: unknown) => x is T): Record<string, T> {
  if (!isRecord(v)) return {};
  return Object.fromEntries(Object.entries(v).filter((e): e is [string, T] => e[0].length <= 60 && keep(e[1])).slice(0, 40));
}
const numOrBool = (x: unknown): x is number | boolean => typeof x === 'boolean' || (typeof x === 'number' && Number.isFinite(x));
const primitive = (x: unknown): x is string | number | boolean => numOrBool(x) || (typeof x === 'string' && x.length <= 200);

/** One remembered entry, cleaned: anything malformed (an old version, a hand edit) is dropped rather than trusted. */
export function cleanPrefs(v: unknown): SoloPrefs | null {
  if (!isRecord(v)) return null;
  const bots = typeof v.bots === 'number' && Number.isInteger(v.bots) ? Math.min(MAX_BOTS, Math.max(0, v.bots)) : 0;
  const botLevel = PRACTICE_LEVEL_IDS.includes(v.botLevel as PracticeLevel) ? (v.botLevel as PracticeLevel) : 'mixed';
  return { common: pick(v.common, numOrBool), settings: pick(v.settings, primitive), bots, botLevel };
}

function readAll(store: KeyValueStore | null): Record<string, unknown> {
  try {
    const v = JSON.parse(store?.getItem(SOLO_PREFS_KEY) ?? '{}') as unknown;
    return isRecord(v) ? v : {};
  } catch {
    return {};
  }
}

/** What this player changed last time for this game, on this device, or null the first time. */
export function readSoloPrefs(key: string, store: KeyValueStore | null = browserStore()): SoloPrefs | null {
  return cleanPrefs(readAll(store)[key]);
}

/** Remember what the player chose for this game. Kept newest last; past the limit the oldest goes. */
export function writeSoloPrefs(key: string, prefs: SoloPrefs, store: KeyValueStore | null = browserStore()): void {
  if (!store) return;
  const all = readAll(store);
  delete all[key];
  all[key] = cleanPrefs(prefs);
  const keys = Object.keys(all);
  for (const k of keys.slice(0, Math.max(0, keys.length - SOLO_PREFS_MAX))) delete all[k];
  try {
    store.setItem(SOLO_PREFS_KEY, JSON.stringify(all));
  } catch {
    /* storage can be full or unavailable (private mode): the game still starts, it just is not remembered */
  }
}

/** The most bots a game can take beside the player: the server allows 5, and a mode's player limit can lower it. */
export const maxBots = (playersMax: number) => Math.max(0, Math.min(MAX_BOTS, playersMax - 1));

/** "10 questions, 20 seconds each, 3 bots (Mixed class)": what Start playing will start, in words. */
export function soloSummary(s: { questionLimit?: number | undefined; questionTimeSec?: number | undefined; timeLimitSec?: number | undefined; bots: number; botLevel: PracticeLevel; onlyLevel?: '' | 'medium' | 'hard' }): string {
  const parts: string[] = [];
  if (s.questionLimit !== undefined) parts.push(s.questionLimit > 0 ? `${s.questionLimit} ${s.questionLimit === 1 ? 'question' : 'questions'}` : 'every question');
  if (s.onlyLevel === 'hard') parts.push('only the hard ones');
  else if (s.onlyLevel === 'medium') parts.push('medium and hard only');
  if (s.questionTimeSec !== undefined) parts.push(`${s.questionTimeSec} seconds each`);
  if (s.timeLimitSec !== undefined) parts.push(s.timeLimitSec > 0 ? `${Math.round((s.timeLimitSec / 60) * 10) / 10} min to play` : 'no time limit');
  parts.push(s.bots > 0 ? `${s.bots} ${s.bots === 1 ? 'bot' : 'bots'} (${PRACTICE_LEVEL_INFO[s.botLevel].label})` : 'no bots');
  return parts.join(', ');
}
