import { expect } from 'vitest';
import { commonSettingsSchema, createRng, type Answer, type CommonSettings, type Question } from '@ludora/shared';
import { GameRuntime } from '../src/runtime/runtime.ts';
import { parseSettings } from '../src/sdk/settings.ts';
import type { GameMode, ModeVariant } from '../src/sdk/types.ts';
import { adaptQuestions } from '../src/questions/adapt.ts';
import { makeTeams } from '../src/teams.ts';

/*
 * Drives one game of a mode on a fake clock, for the rule tests. Questions
 * are not shuffled (unless asked), so tests know which answer is right:
 * choice tokens follow the authored order (c0, c1, ...).
 */

/* eslint-disable @typescript-eslint/no-explicit-any */

/** A player id, or a player on a team (1-based team number). */
export type Seat = string | { id: string; team: number };

export interface DriveOptions {
  players?: Seat[];
  settings?: Record<string, unknown>;
  common?: Partial<CommonSettings>;
  /** Apply a variant's preset (settings and common) before `settings` and `common`. */
  variant?: ModeVariant;
  questions?: readonly Question[];
  teams?: number;
  seed?: number;
  shuffle?: boolean;
}

/** Four-choice questions, so the tests know the right and wrong tokens. */
export const MCQ: Question[] = Array.from({ length: 8 }, (_, i) => ({
  id: `m${i + 1}`,
  type: 'mcq' as const,
  prompt: `Multiple choice question number ${i + 1}?`,
  choices: [
    { id: 'a', text: `Answer A${i + 1}` },
    { id: 'b', text: `Answer B${i + 1}` },
    { id: 'c', text: `Answer C${i + 1}` },
    { id: 'd', text: `Answer D${i + 1}` },
  ],
  correct: (['a', 'b', 'c', 'd'] as const)[i % 4]!,
}));

/** Every statement is true, so `true` is always right and `false` always wrong. */
export const TRUE_SET: Question[] = Array.from({ length: 8 }, (_, i) => ({ id: `tf${i + 1}`, type: 'truefalse' as const, prompt: `Statement ${i + 1} is true.`, correct: true }));

export function drive(mode: GameMode, o: DriveOptions = {}) {
  const clock = { t: 1_000, now: () => clock.t };
  const errors: unknown[] = [];
  const feed: { text: string; to?: string[] }[] = [];
  /** Full changes (views for everyone) and quiet ones (a pulse only), as the room hears them. */
  const changes = { changed: 0, pulsed: 0 };
  const teamCount = o.teams ?? o.variant?.common?.teamCount ?? 0;
  const common = commonSettingsSchema.parse({
    ...mode.defaults,
    shuffleQuestions: o.shuffle ?? false,
    shuffleChoices: o.shuffle ?? false,
    ...o.variant?.common,
    ...o.common,
    teamCount,
  });
  const authored = o.questions ?? MCQ;
  const questions = adaptQuestions(authored, mode.meta.questionTypes, createRng(1)).questions;
  const teams = makeTeams(teamCount);
  const seats = o.players ?? ['a', 'b'];
  const rt = new GameRuntime({
    mode,
    settings: parseSettings(mode.settings, { ...o.variant?.settings, ...o.settings }),
    common,
    questions,
    players: seats.map((s) => {
      const id = typeof s === 'string' ? s : s.id;
      return { id, name: id.toUpperCase(), teamId: typeof s === 'string' ? null : `t${s.team}`, isBot: false };
    }),
    teams,
    seed: o.seed ?? 42,
    clock,
    strict: true,
    listener: {
      error: (e) => errors.push(e),
      feed: (f) => feed.push({ text: f.text, ...(f.to ? { to: f.to } : {}) }),
      changed: () => changes.changed++,
      pulsed: () => changes.pulsed++,
    },
  });
  expect(rt.start().ok).toBe(true);

  const view = (id: string): any => rt.view({ kind: 'player', playerId: id });
  const host = (): any => rt.view({ kind: 'host' });
  /** The question a player is looking at, wherever the mode keeps it. */
  const questionOf = (id: string): { iid: string; q: { prompt: string } } => {
    const v = view(id);
    const qv = v?.sync?.question ?? v?.question ?? v?.you?.question ?? v?.you?.word?.question;
    if (!qv) throw new Error(`${id} has no question to answer`);
    return qv;
  };
  /** A right or wrong answer to the question a player sees, in the tokens players send. */
  const answerFor = (id: string, which: 'right' | 'wrong'): { iid: string; answer: Answer } => {
    const qv = questionOf(id);
    const q = questions.find((x) => x.prompt === qv.q.prompt);
    if (!q) throw new Error(`no question with prompt ${qv.q.prompt}`);
    return { iid: qv.iid, answer: tokensFor(q, which) };
  };
  return {
    rt,
    clock,
    errors,
    feed,
    changes,
    view,
    host,
    state: (): any => rt.debugState(),
    /** Move the game clock on and fire any timers that are due. */
    tick(ms: number) {
      clock.t += ms;
      rt.fireDueTimers();
    },
    /** Move the game clock on without firing timers (time passing while a player thinks). */
    wait(ms: number) {
      clock.t += ms;
    },
    answerFor,
    answer: (id: string, which: 'right' | 'wrong' = 'right') => {
      const a = answerFor(id, which);
      return rt.act(id, { type: 'answer', ...a });
    },
    feedTo: (id: string) => feed.filter((f) => !f.to || f.to.includes(id)).map((f) => f.text),
  };
}

export type Driven = ReturnType<typeof drive>;

/** The right (or a wrong) answer to an authored question, in presentation tokens with nothing shuffled. */
export function tokensFor(q: Question, which: 'right' | 'wrong'): Answer {
  const right = which === 'right';
  switch (q.type) {
    case 'mcq': {
      const i = q.choices.findIndex((c) => c.id === q.correct);
      return { type: 'mcq', choiceId: `c${right ? i : i === 0 ? 1 : 0}` };
    }
    case 'truefalse':
      return { type: 'truefalse', value: right ? q.correct : !q.correct };
    case 'short':
      return { type: 'short', text: right ? q.accepted[0]! : 'definitely not this' };
    case 'numeric':
      return { type: 'numeric', value: right ? q.answer : q.answer + 1000 };
    default:
      throw new Error(`tokensFor does not handle ${q.type}`);
  }
}
