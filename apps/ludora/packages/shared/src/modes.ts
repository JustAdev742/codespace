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

/** Shared game settings a mode may read. Everything else is a mode setting. */
export const COMMON_FIELDS = ['questionTimeSec', 'timeLimitSec', 'questionLimit'] as const;
export type CommonField = (typeof COMMON_FIELDS)[number];

export type ModeThumbnail = {
  /** Icon drawn on the thumbnail; see web/src/art/ModeArt.tsx. */
  glyph: string;
  hue: number;
  accentHue: number;
};

/** One step of a mode's walkthrough: a few plain words a player of 8 can read on a phone. */
export interface TutorialStep {
  /** Two or three words, e.g. "Answer for charges". */
  title: string;
  /** One or two short sentences. */
  text: string;
}

/** One thing a player presses in a mode besides answering, for the picture of the controls. */
export interface ModeControl {
  /** The words on the button, as the game screen shows them. */
  label: string;
  /** What it does, in a short sentence. */
  does: string;
  /** The key that does the same on a keyboard, when there is one (e.g. "B", "Left arrow"). */
  key?: string;
}

/**
 * How to play a mode, shown before the game starts (docs/GAME_MODE_SDK.md, "The walkthrough").
 * Written from the mode's own rules: two to four steps, and the mode's controls when it has any.
 */
export interface ModeTutorial {
  steps: readonly TutorialStep[];
  controls?: readonly ModeControl[];
}

/** The walkthrough's limits. The catalogue test holds every mode to them. */
export const TUTORIAL_LIMITS = { minSteps: 2, maxSteps: 4, titleChars: 28, textChars: 150, controls: 5 } as const;

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
  /**
   * The shared settings this mode reads and its defaults for them. The host
   * form shows only these fields, starting from these values, and the
   * engine uses the same defaults. A time limit of 0 means no limit.
   */
  common: { fields: readonly CommonField[]; defaults: Partial<Record<CommonField, number>>; help?: Partial<Record<CommonField, string>> };
  rules: readonly string[];
  thumbnail: ModeThumbnail;
  status: ModeStatus;
  tags?: readonly string[];
  accessibility?: readonly string[];
  /**
   * '3d' for modes drawn with the 3D engine (web/src/three). The catalogue marks them, and
   * each one still plays without WebGL through its plain controls.
   */
  stage?: '2d' | '3d';
  /** The walkthrough players see before the game. A mode without one gets its first rules as steps (`tutorialOf`). */
  tutorial?: ModeTutorial;
  /**
   * Set by a mode that gives players one thing at a time in calm play (`ctx.calm`): what calm play
   * changes in this mode, in a sentence or two for players. A mode where a question stays open
   * during an action that needs steering, aiming or timing must set it and follow it. The
   * conformance suite plays every mode that sets it in calm play as well.
   */
  calmPlay?: string;
}

const firstSentence = (text: string) => {
  const m = /^.*?[.!?](?=\s|$)/.exec(text);
  return (m ? m[0] : text).trim();
};

/**
 * The walkthrough for a mode: its own, or (for a mode that has none, such as a made game) its
 * first rules, one step each, cut to their first sentence.
 */
export function tutorialOf(meta: Pick<ModeMeta, 'rules' | 'tutorial'>): ModeTutorial {
  if (meta.tutorial && meta.tutorial.steps.length >= TUTORIAL_LIMITS.minSteps) return meta.tutorial;
  const steps = meta.rules.slice(0, 3).map((rule, i) => ({ title: `Rule ${i + 1}`, text: firstSentence(rule) }));
  while (steps.length < TUTORIAL_LIMITS.minSteps) steps.push({ title: 'Answer', text: 'Read each question and pick your answer.' });
  return { steps };
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
