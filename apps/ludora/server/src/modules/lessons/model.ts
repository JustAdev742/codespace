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
    description: 'A 10-minute presentation and quiz in one, made by Leviticus1001: real photos from the myth of Icarus to giant cargo planes, with the script in the notes.',
    /** The built-in sets its games use, by step: the lesson arrives ready to run (packages/content/src/lessons/aviation.ts). */
    seededSets: [null, null, null, null, 'lesson-aviation-round-1', null, null, null, 'lesson-aviation-round-2'],
    body: (): LessonBody => {
      const art = (name: string, alt: string) => ({ kind: 'image' as const, url: `/art/aviation/${name}.jpg`, alt });
      const slide = (title: string, seconds: number, lines: string[], image: ReturnType<typeof art>, note: string): LessonStep => ({ id: stepId(), kind: 'slide', title, lines, image, seconds, note });
      return {
        title: 'Aviation Through the Ages',
        goals: ['Retell the myth of Daedalus and Icarus, and its lesson', 'Describe the Wright brothers’ first flight in 1903', 'Name a jet, a giant airliner and a giant cargo plane', 'Say which part of a plane makes lift'],
        standings: true,
        steps: [
          slide(
            'Aviation Through the Ages',
            20,
            ['Made by Leviticus1001 (@leviticus1001)', 'From a Greek myth to the biggest planes ever built.', 'Join with the code on the board. Two quiz rounds, and your points add up!'],
            art('a380', 'A Qantas Airbus A380 climbing into a blue sky after take-off'),
            'About 20 seconds, while everyone joins. Say: “Welcome to Aviation Through the Ages! Join on your device with the code on the board. We’re going from a Greek myth to the biggest planes ever built, with two quick quiz rounds on the way.” Lesson by Leviticus1001 (@leviticus1001), used with permission. Photos: Wikimedia Commons (Adrian Pingstone; John T. Daniels; Leonardo da Vinci, photo Luc Viatour; Heinkel; Dan Nevill, CC BY 2.0; MarcelX42, CC BY-SA 4.0; Zavryk, CC BY-SA 4.0), NASA, and the original Aeroplanes slides.',
          ),
          slide(
            'Myths: Daedalus and Icarus',
            45,
            ['Daedalus made wings of feathers and wax to escape Crete.', 'Too low: sea spray weighs down the feathers.', 'Too high: the sun melts the wax.', 'Icarus flew too high. Listen to good advice!'],
            art('icarus', 'An old coloured engraving: Daedalus flies on feathered wings while Icarus falls towards the sea'),
            'Levi, about 45 seconds. “Daedalus was a brilliant inventor from Athens. When King Minos imprisoned him and his son Icarus on the island of Crete, Daedalus made wings from feathers and wax so they could escape by flying. He warned Icarus not to fly too low, because the sea spray would weigh down the feathers, and not too high, because the sun would melt the wax. Icarus thought it was so cool that he ignored the advice, climbed towards the sun, lost his wings and drowned. This story is used as a warning not to ignore good advice.”',
          ),
          slide(
            'Leonardo da Vinci',
            35,
            ['An Italian inventor and artist, 1452 to 1519.', 'About 1505: the Codex on the Flight of Birds.', 'His flying machines never flew, but his ideas did.'],
            art('leonardo', 'A page of Leonardo da Vinci’s notebook with ink sketches of a flapping-wing machine and his mirror writing'),
            'Levi, about 35 seconds. “Leonardo Da Vinci was an Italian Renaissance polymath, born in 1452. He never got a flying machine off the ground, but around 1505 he wrote the Codex on the Flight of Birds, which looks at how birds’ wings catch air and how often they flap. His idea of a flying machine is one we now have the technology to make real.”',
          ),
          slide(
            'The Wright brothers',
            45,
            ['17 December 1903, near Kitty Hawk, North Carolina', 'The first powered flight: 12 seconds and 36.6 metres', 'By 1905: over 30 minutes in the air'],
            art('wright-flight', 'The famous 1903 photo of the Wright Flyer lifting off the sand at Kitty Hawk, with Wilbur Wright running beside it'),
            'Levi, about 45 seconds. “Orville and Wilbur Wright owned a bicycle shop in Dayton, Ohio, and that mechanical background helped them build the Wright Flyer, the first successful powered, controlled, heavier-than-air aeroplane. On December 17, 1903, near Kitty Hawk, North Carolina, Orville flew it for 12 seconds and 36.6 metres. Later that day Wilbur flew for 59 seconds. By 1905 the Wright Flyer III could fly for over 30 minutes and do figure eights.” Then: “Quiz time! Round 1.”',
          ),
          {
            id: stepId(),
            kind: 'game',
            title: 'Round 1: Dreamers and the first flight',
            setId: null,
            modeId: 'classic',
            variantId: null,
            settings: {},
            common: { questionTimeSec: 15, shuffleQuestions: false },
            note: 'About 2½ minutes: five questions, 15 seconds each. If the how-to-play walkthrough comes up, press Start now once most are ready. At each reveal, read the explanation only if there is time.',
          },
          slide(
            'Commercial flights',
            40,
            ['1939: the first jet engine, by Hans von Ohain', 'Today: the Boeing 777X, whose wingtips fold up', 'About one fatal accident in every 5.6 million flights (2021 to 2025)'],
            art('b777x', 'A blue and white Boeing 777X airliner in a huge hangar, with people standing around it'),
            'Ella, about 40 seconds. “From the first jet engine in 1939, made by Hans von Ohain, to the latest Boeing 777X, aviation has transformed massively over the past century. Fragile wooden gliders became a fast, mass-market and highly automated global network, and we rely on computerised navigation to help fly safely. It’s one of the safest ways to travel: from 2021 to 2025 there was about one fatal accident for every 5.6 million flights.”',
          ),
          slide(
            'Cargo planes',
            50,
            ['Airbus BelugaXL: a hold big enough for whole aircraft wings', 'Antonov An-124: lifts over 100 tonnes', 'Antonov An-225 Mriya: about 250 tonnes, the most ever'],
            art('beluga', 'The Airbus BelugaXL cargo plane in flight, painted with eyes and a smile'),
            'Ella, about 50 seconds. “Cargo planes aren’t just passenger jets with the seats ripped out. Most move everyday stuff like parcels, electronics and fresh food around the world. My favourite is the Airbus BelugaXL. It’s named after the beluga whale, and once you see that big rounded head, you get why. Its hold can swallow whole aircraft wings. For lifting power, the Antonov An-124 can carry over 100 tonnes. Only one plane ever beat it, the An-225 Mriya, at around 250 tonnes. There was only ever one, and it was destroyed in its hangar near Kyiv on 27 February 2022. Ukraine has said it wants to finish a second one.”',
          ),
          slide(
            'Parts of a plane',
            25,
            ['The wings make lift.', 'The engines push the plane forward.', 'The rudder and elevator on the tail steer it.'],
            art('plane-parts', 'A diagram of a plane with its parts labelled, including the wings, jet engines, rudder, elevator, flaps and cockpit'),
            'About 25 seconds. “Here are the main parts of a plane. The wings make lift, the jet engines push it forward, and the rudder and elevator on the tail steer it. Remember them, because they’re in the lightning round!”',
          ),
          {
            id: stepId(),
            kind: 'game',
            title: 'Round 2: Lightning round',
            setId: null,
            modeId: 'classic',
            variantId: 'classic-lightning',
            settings: {},
            common: { questionTimeSec: 12, shuffleQuestions: false },
            note: 'About 2½ minutes: six questions, 12 seconds each, double points. It is the same game as round 1, so press Start now on the walkthrough. Then press Finish the lesson: everyone sees today’s goals and the final points.',
          },
        ],
      };
    },
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
  if (step.kind === 'slide') return step.tool ? Math.max(1, Math.ceil(step.tool.seconds / 60)) : step.seconds ? Math.max(1, Math.round(step.seconds / 60)) : 2;
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
 * About how many seconds a step takes, for adding up a whole lesson: a slide with a planned time
 * counts that time (a 45-second presentation slide is not two minutes), anything else its minutes.
 */
export function stepSeconds(step: LessonStep, questionCount: number | null): number {
  if (step.kind === 'slide' && !step.tool && step.seconds) return step.seconds;
  return stepMinutes(step, questionCount) * 60;
}

/** A whole lesson's length in minutes, from its steps' seconds. */
export function lessonMinutes(seconds: readonly number[]): number {
  return Math.round(seconds.reduce((n, s) => n + s, 0) / 60);
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
