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
  'aviation-through-the-ages': {
    title: 'Aviation Through the Ages',
    description: 'Ready to run in about 10 minutes, made by Leviticus1001: real photos from the myth of Icarus to giant cargo planes, in two quick rounds.',
    /** The built-in sets its games use, by step: the lesson arrives ready to run (packages/content/src/lessons/aviation.ts). */
    seededSets: [null, 'lesson-aviation-round-1', null, 'lesson-aviation-round-2'],
    body: (): LessonBody => ({
      title: 'Aviation Through the Ages',
      goals: ['Retell the myth of Daedalus and Icarus, and its lesson', 'Describe the Wright brothers’ first flight in 1903', 'Name a jet, a giant airliner and a giant cargo plane', 'Say which part of a plane makes lift'],
      standings: true,
      steps: [
        {
          id: stepId(),
          kind: 'slide',
          title: 'Aviation Through the Ages',
          lines: ['Made by Leviticus1001 (@leviticus1001)', 'From a Greek myth to the biggest planes ever built.', 'Two quick rounds. Your points add up, so look closely at every photo!'],
          image: { kind: 'image', url: '/art/aviation/a380.jpg', alt: 'A Qantas Airbus A380 climbing into a blue sky after take-off' },
          note: 'About 30 seconds. Ask: “Hands up if you have ever been on a plane.” People dreamed of flying for thousands of years before anyone did it. Two rounds: dreamers and the first flight, then flying today. Every question has a real photo, and points add up across both rounds. Lesson by Leviticus1001 (@leviticus1001), used with permission. Photos: Wikimedia Commons (Adrian Pingstone; John T. Daniels; Leonardo da Vinci, photo Luc Viatour; Heinkel; Dan Nevill, CC BY 2.0; MarcelX42, CC BY-SA 4.0; Zavryk, CC BY-SA 4.0), NASA (parts of a plane), and the original Aeroplanes slides (Icarus engraving, Wright brothers portraits).',
        },
        {
          id: stepId(),
          kind: 'game',
          title: 'Round 1: Dreamers and the first flight',
          setId: null,
          modeId: 'classic',
          variantId: null,
          settings: {},
          common: { questionTimeSec: 20, shuffleQuestions: false },
          note: 'About 3 minutes, five questions. If the how-to-play walkthrough comes up, press Start now once most are ready. After each question, read the explanation aloud: Icarus ignored good advice; Leonardo studied birds around 1505; the Wright brothers ran a bicycle shop and flew for 12 seconds on 17 December 1903.',
        },
        {
          id: stepId(),
          kind: 'slide',
          title: 'Flying today',
          lines: ['1939: the first jet plane takes off.', 'Today, computers help pilots find their way, and millions of people fly every day.', 'Some planes are so big they carry other planes’ wings!'],
          image: { kind: 'image', url: '/art/aviation/b777x.jpg', alt: 'A blue and white Boeing 777X airliner in a huge hangar, with people standing around it' },
          note: 'About 30 seconds. From wooden gliders to a worldwide network: the first jet engine (Hans von Ohain, 1939) to today’s Boeing 777X. Then: “Lightning round! Twelve seconds a question, and points are doubled.”',
        },
        {
          id: stepId(),
          kind: 'game',
          title: 'Round 2: Lightning round',
          setId: null,
          modeId: 'classic',
          variantId: 'classic-lightning',
          settings: {},
          common: { questionTimeSec: 12, shuffleQuestions: false },
          note: 'About 3 minutes, six quick questions. It is the same game as round 1, so press Start now on the walkthrough. The questions: the first jet, the 777X’s folding wingtips, how safe flying is, the BelugaXL, the An-225 Mriya and the parts of a plane. The lesson ends on the class’s points.',
        },
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
  // A slide with a classroom tool takes the time planned for the tool (making).
  if (step.kind === 'slide') return step.tool ? Math.max(1, Math.ceil(step.tool.seconds / 60)) : 2;
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
