import { containsBlockedLanguage, type LessonBody, type LessonStandingView, type LessonStep } from '@ludora/shared';
import { getMode, getVariant, type EngineResults } from '@ludora/engine';

/*
 * The pure parts of lessons: templates, the language check on everything a class will read,
 * estimated lengths, and lesson points. No database here, so each is unit tested on its own.
 */

let seq = 0;
/** A short id for a new step, unique enough within one lesson. */
export function stepId(): string {
  return `s${Date.now().toString(36).slice(-5)}${(++seq).toString(36)}${Math.random().toString(36).slice(2, 5)}`;
}

/** The templates a new lesson can start from. Game steps have no set until the teacher picks one. */
export const TEMPLATES = {
  'starter-main-exit': {
    title: 'Starter, main and exit ticket',
    description: 'A quick quiz to start, teaching with a slide and a talk, a game to practise, and three questions to finish.',
    body: (): LessonBody => ({
      title: 'Starter, main and exit ticket',
      goals: [],
      standings: false,
      steps: [
        { id: stepId(), kind: 'slide', title: 'Welcome', lines: ['Get ready to answer on your device.'], image: null, note: '' },
        { id: stepId(), kind: 'game', title: 'Starter', setId: null, modeId: 'classic', variantId: null, settings: {}, common: { questionLimit: 5 }, note: '' },
        { id: stepId(), kind: 'slide', title: 'Today we are learning', lines: ['Write the main idea here.'], image: null, note: '' },
        { id: stepId(), kind: 'discussion', prompt: 'Talk to the person next to you: what do you already know about this?', seconds: 120, note: '' },
        { id: stepId(), kind: 'game', title: 'Practice', setId: null, modeId: 'gold-rush', variantId: null, settings: {}, common: {}, note: '' },
        { id: stepId(), kind: 'game', title: 'Exit ticket', setId: null, modeId: 'classic', variantId: null, settings: {}, common: { questionLimit: 3 }, note: '' },
      ],
    }),
  },
  'revision-carousel': {
    title: 'Revision carousel',
    description: 'Four short games in different modes, with lesson points adding up across them.',
    body: (): LessonBody => ({
      title: 'Revision carousel',
      goals: [],
      standings: true,
      steps: [
        { id: stepId(), kind: 'slide', title: 'Revision carousel', lines: ['Four games, one set of lesson points.', 'Every right answer counts.'], image: null, note: '' },
        { id: stepId(), kind: 'game', title: 'Station 1', setId: null, modeId: 'classic', variantId: null, settings: {}, common: { questionLimit: 6 }, note: '' },
        { id: stepId(), kind: 'game', title: 'Station 2', setId: null, modeId: 'gold-rush', variantId: null, settings: {}, common: {}, note: '' },
        { id: stepId(), kind: 'game', title: 'Station 3', setId: null, modeId: 'tug-of-war', variantId: null, settings: {}, common: {}, note: '' },
        { id: stepId(), kind: 'game', title: 'Station 4', setId: null, modeId: 'classic', variantId: 'classic-ladder', settings: {}, common: {}, note: '' },
      ],
    }),
  },
  'friday-quiz': {
    title: 'Friday quiz',
    description: 'Three rounds and a final, with lesson points and a winner at the end.',
    body: (): LessonBody => ({
      title: 'Friday quiz',
      goals: [],
      standings: true,
      steps: [
        { id: stepId(), kind: 'slide', title: 'Friday quiz', lines: ['Three rounds and a final.', 'Points add up across every round.'], image: null, note: '' },
        { id: stepId(), kind: 'game', title: 'Round 1', setId: null, modeId: 'classic', variantId: null, settings: {}, common: { questionLimit: 8 }, note: '' },
        { id: stepId(), kind: 'game', title: 'Round 2', setId: null, modeId: 'classic', variantId: null, settings: {}, common: { questionLimit: 8 }, note: '' },
        { id: stepId(), kind: 'game', title: 'Round 3', setId: null, modeId: 'gold-rush', variantId: null, settings: {}, common: {}, note: '' },
        { id: stepId(), kind: 'game', title: 'The final', setId: null, modeId: 'classic', variantId: 'classic-lightning', settings: {}, common: { questionLimit: 5 }, note: '' },
      ],
    }),
  },
} as const;
export type TemplateId = keyof typeof TEMPLATES;

/**
 * Everything in a lesson that a class reads on the big screen or a device goes through the same
 * language filter as other teacher text shown to a class. Returns a field and message, or null.
 * Plan notes are not checked: no player ever sees them.
 */
export function languageProblem(body: Pick<LessonBody, 'title' | 'goals' | 'steps'>): { field: string; message: string } | null {
  const bad = (s: string) => containsBlockedLanguage(s);
  const msg = 'has a word players cannot see. Try different words.';
  if (bad(body.title)) return { field: 'title', message: `The title ${msg}` };
  for (const [i, g] of body.goals.entries()) if (bad(g)) return { field: `goals.${i}`, message: `Goal ${i + 1} ${msg}` };
  for (const [i, s] of body.steps.entries()) {
    const texts = s.kind === 'game' ? [s.title] : s.kind === 'slide' ? [s.title, ...s.lines, s.image?.alt ?? ''] : [s.prompt];
    if (texts.some(bad)) return { field: `steps.${i}`, message: `Step ${i + 1} ${msg}` };
  }
  return null;
}

/** The title a step shows in the room and on the plan. */
export function stepTitle(step: LessonStep, setTitle: string | null): string {
  if (step.kind === 'slide') return step.title;
  if (step.kind === 'discussion') return 'Discussion';
  if (step.title) return step.title;
  const mode = modeTitle(step.modeId, step.variantId);
  return setTitle ? `${mode}: ${setTitle}` : mode;
}

export function modeTitle(modeId: string, variantId: string | null): string {
  return (variantId ? getVariant(variantId)?.meta.title : null) ?? getMode(modeId)?.meta.title ?? 'A game';
}

/**
 * About how many minutes a step takes: a game from its questions and settings (the same sum as the
 * lobby's "About N minutes"), a slide two minutes, a discussion its timer and a minute to settle.
 */
export function stepMinutes(step: LessonStep, questionCount: number | null): number {
  if (step.kind === 'slide') return 2;
  if (step.kind === 'discussion') return Math.ceil(step.seconds / 60) + 1;
  const variant = step.variantId ? getVariant(step.variantId) : undefined;
  const mode = getMode(variant?.meta.modeId ?? step.modeId);
  if (!mode) return 5;
  const defaults = mode.meta.common.defaults as Partial<Record<'questionTimeSec' | 'timeLimitSec' | 'questionLimit', number>>;
  const pick = (k: 'questionTimeSec' | 'timeLimitSec' | 'questionLimit', fallback: number) => step.common[k] ?? (variant?.common as Record<string, number> | undefined)?.[k] ?? defaults[k] ?? fallback;
  const timeLimit = pick('timeLimitSec', 0);
  if (timeLimit) return Math.max(1, Math.round(timeLimit / 60));
  const limit = pick('questionLimit', 0);
  const total = questionCount ?? 10;
  const n = limit ? Math.min(limit, total) : total;
  const sec = pick('questionTimeSec', 20);
  const each = mode.meta.pacing === 'host' ? sec * 0.8 + 9 : sec * 0.6;
  // Getting everyone into the game and the results at the end take a minute or so.
  return Math.max(1, Math.round((n * each + 10) / 60)) + 1;
}

/**
 * Lesson points for one game: 10 for each right answer, and in a competitive game with more than
 * one person 30, 20 and 10 for the top three places; a class that wins a co-op game gets 20 each.
 * Right answers count most, so a mode with huge scores cannot swamp the rest of the lesson.
 */
export function lessonPoints(results: Pick<EngineResults, 'standings' | 'outcome'>): Map<string, number> {
  const people = results.standings.filter((s) => !s.isBot);
  const out = new Map<string, number>();
  for (const s of people) {
    let p = s.stats.correct * 10;
    if (results.outcome === 'competitive' && people.length > 1) p += [30, 20, 10][s.rank - 1] ?? 0;
    if (results.outcome === 'coop-win') p += 20;
    out.set(s.playerId, p);
  }
  return out;
}

export interface Tally {
  key: string;
  name: string;
  points: number;
}

/** Best first, sharing a rank on equal points; names only, with the viewer's own row marked. */
export function rankTally(tally: readonly Tally[], mine: string | null, alias: (name: string) => string = (n) => n): LessonStandingView[] {
  const sorted = [...tally].sort((a, b) => b.points - a.points || a.name.localeCompare(b.name));
  let rank = 0;
  let last = Number.NaN;
  return sorted.map((t, i) => {
    if (t.points !== last) rank = i + 1;
    last = t.points;
    return { name: alias(t.name), points: t.points, rank, ...(mine && t.key === mine ? { mine: true as const } : {}) };
  });
}
