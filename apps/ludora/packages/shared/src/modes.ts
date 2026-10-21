import type { QuestionType } from './questions.ts';

/**
 * Catalogue metadata for game modes. Mode logic lives in @ludora/engine;
 * this is the part the browser, the API and the admin panel all read.
 */

export const MODE_CATEGORIES = ['quiz', 'strategy', 'arcade', 'puzzle', 'party', 'learning'] as const;
export type ModeCategory = (typeof MODE_CATEGORIES)[number];

export const MODE_CATEGORY_INFO: Record<ModeCategory, { label: string; description: string }> = {
  quiz: { label: 'Quiz', description: 'Answer fast, answer right.' },
  strategy: { label: 'Strategy', description: 'Answer to earn resources, then decide how to use them.' },
  arcade: { label: 'Arcade', description: 'Races, reflexes and score attack.' },
  puzzle: { label: 'Puzzle', description: 'Memory, words, patterns and numbers.' },
  party: { label: 'Party', description: 'Teams, duels and the whole class at once.' },
  learning: { label: 'Study', description: 'Practice built for remembering.' },
};

/**
 * Implementation status shown to players. `playable` modes have passed the
 * automated full-game test; `beta` modes are playable but still changing;
 * `planned` modes are designed but cannot be launched.
 */
export const MODE_STATUSES = ['playable', 'beta', 'planned'] as const;
export type ModeStatus = (typeof MODE_STATUSES)[number];

/** How questions reach players. */
export const PACINGS = ['host', 'self', 'solo'] as const;
export type Pacing = (typeof PACINGS)[number];

export const PACING_INFO: Record<Pacing, string> = {
  host: 'Everyone sees the same question at the same time. The host moves the game on.',
  self: 'Everyone answers at their own pace. The host screen shows the race.',
  solo: 'One player, on their own.',
};

export type ModeThumbnail = {
  /** Icon drawn on the thumbnail; see web/src/art/ModeArt.tsx. */
  glyph: string;
  hue: number;
  accentHue: number;
};

export interface ModeMeta {
  id: string;
  title: string;
  tagline: string;
  description: string;
  category: ModeCategory;
  pacing: Pacing;
  players: { min: number; max: number; recommended?: string };
  /** Typical length in minutes. */
  duration: { min: number; max: number };
  difficulty: 1 | 2 | 3;
  teams: 'none' | 'optional' | 'required';
  /** Question types the mode can use directly. Others are adapted when possible. */
  questionTypes: readonly QuestionType[];
  minQuestions: number;
  rules: readonly string[];
  thumbnail: ModeThumbnail;
  status: ModeStatus;
  tags?: readonly string[];
  accessibility?: readonly string[];
}

export interface VariantMeta {
  id: string;
  modeId: string;
  title: string;
  tagline: string;
  /** What is different from the base mode, in one or two sentences. */
  changes: string;
  status: ModeStatus;
  thumbnail?: Partial<ModeThumbnail>;
}

/** Settings fields a mode exposes to hosts. The host form is generated from these. */
export type SettingField =
  | { kind: 'number'; key: string; label: string; help?: string; min: number; max: number; step?: number; default: number; unit?: string }
  | { kind: 'select'; key: string; label: string; help?: string; options: readonly { value: string; label: string }[]; default: string }
  | { kind: 'toggle'; key: string; label: string; help?: string; default: boolean };

export type SettingValues = Record<string, number | string | boolean>;
