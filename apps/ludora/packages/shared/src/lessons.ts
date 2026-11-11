import { z } from 'zod';
import { mediaSchema } from './questions.ts';

/*
 * Lessons: an ordered list of steps a teacher runs in one room. A step is a game (a set with a
 * mode and its settings), an info slide or a discussion. The teacher's plan note on each step is
 * stored with the lesson and shown only on the teacher's own pages; it is never part of a room.
 */

export const LESSON_LIMITS = { steps: 20, title: 80, goals: 5, goal: 120, lines: 6, line: 160, note: 1000, prompt: 200 } as const;

const stepId = z.string().regex(/^[A-Za-z0-9_-]{1,24}$/);
const note = z.string().trim().max(LESSON_LIMITS.note, `Keep the note to ${LESSON_LIMITS.note} characters.`).default('');

/** Only the shared settings a lesson step sets; anything left out takes the mode's own default. */
export const lessonCommonSchema = z.object({
  questionTimeSec: z.number().int().min(5).max(120).optional(),
  timeLimitSec: z.number().int().min(0).max(3600).optional(),
  questionLimit: z.number().int().min(0).max(250).optional(),
  teamCount: z.number().int().min(0).max(6).optional(),
  shuffleQuestions: z.boolean().optional(),
  shuffleChoices: z.boolean().optional(),
  doubleFinal: z.boolean().optional(),
});
export type LessonCommon = z.infer<typeof lessonCommonSchema>;

export const lessonGameStepSchema = z.object({
  id: stepId,
  kind: z.literal('game'),
  /** Shown in the room ("Starter quiz"); empty uses the mode and set. */
  title: z.string().trim().max(LESSON_LIMITS.title).default(''),
  /** Null in a template until the teacher picks a set. */
  setId: z.string().uuid().nullable(),
  modeId: z.string().min(1).max(60),
  variantId: z.string().min(1).max(60).nullable().default(null),
  settings: z.record(z.string().max(60), z.union([z.number(), z.string().max(60), z.boolean()])).default({}),
  common: lessonCommonSchema.default({}),
  note,
});

export const lessonSlideStepSchema = z.object({
  id: stepId,
  kind: z.literal('slide'),
  title: z.string().trim().min(1, 'Give the slide a title.').max(LESSON_LIMITS.title),
  lines: z.array(z.string().trim().max(LESSON_LIMITS.line, `Keep each line to ${LESSON_LIMITS.line} characters.`)).max(LESSON_LIMITS.lines, `A slide has up to ${LESSON_LIMITS.lines} lines.`).default([]),
  image: mediaSchema.nullable().default(null),
  note,
});

export const lessonDiscussionStepSchema = z.object({
  id: stepId,
  kind: z.literal('discussion'),
  prompt: z.string().trim().min(1, 'Write the question to talk about.').max(LESSON_LIMITS.prompt),
  seconds: z.number().int().min(30).max(600),
  note,
});

export const lessonStepSchema = z.discriminatedUnion('kind', [lessonGameStepSchema, lessonSlideStepSchema, lessonDiscussionStepSchema]);
export type LessonStep = z.infer<typeof lessonStepSchema>;
export type LessonGameStep = z.infer<typeof lessonGameStepSchema>;
export type LessonStepKind = LessonStep['kind'];

export const lessonBodySchema = z.object({
  title: z.string().trim().min(1, 'Give the lesson a title.').max(LESSON_LIMITS.title),
  goals: z.array(z.string().trim().min(1).max(LESSON_LIMITS.goal, `Keep each goal to ${LESSON_LIMITS.goal} characters.`)).max(LESSON_LIMITS.goals, `A lesson has up to ${LESSON_LIMITS.goals} goals.`).default([]),
  /** Points add up across the lesson's games. Off: each game stands alone. */
  standings: z.boolean().default(true),
  steps: z.array(lessonStepSchema).max(LESSON_LIMITS.steps, `A lesson has up to ${LESSON_LIMITS.steps} steps.`).default([]),
});
export type LessonBody = z.infer<typeof lessonBodySchema>;

/* ------------------------------- in the room ------------------------------- */

/** What every screen in the room shows of a step that is not a game. */
export type LessonScreenView =
  | { kind: 'slide'; title: string; lines: string[]; image: { url: string; alt: string } | null }
  | { kind: 'discussion'; prompt: string; seconds: number; endsAt: number }
  | { kind: 'end' };

export interface LessonStandingView {
  name: string;
  points: number;
  rank: number;
  /** This viewer. */
  mine?: true;
}

/**
 * A lesson running in a room, as one viewer sees it. Names and points only: no account ids, and
 * never the teacher's plan notes (they are not in the room at all).
 */
export interface LessonRoomView {
  title: string;
  goals: string[];
  /** The step the class is on, from 0. */
  index: number;
  steps: { title: string; kind: LessonStepKind }[];
  standingsOn: boolean;
  /** Lesson points so far, best first. Null when standings are off. */
  standings: LessonStandingView[] | null;
  /** A step that is not a game, or the end of the lesson. */
  screen: LessonScreenView | null;
  /** The host's view only: the lesson and its run, for the teacher's own pages. */
  lessonId?: string;
  runId?: string;
  classId?: string | null;
}
