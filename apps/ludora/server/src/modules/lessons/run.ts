import { createHash } from 'node:crypto';
import type { LessonRoomView, LessonScreenView, LessonStep, LessonStepKind } from '@ludora/shared';
import type { EngineResults } from '@ludora/engine';
import type { Room, RoomLesson } from '../../realtime/room.ts';
import { lessonPoints, rankTally, type Tally } from './model.ts';

/*
 * A lesson running in one room. It keeps the step the class is on, the lesson points and the games
 * played, and asks its owner (routes.ts) to save them after each change, so the lesson can carry on
 * another day. It holds what the class sees and nothing else: never a plan note.
 */

export interface RunGame {
  index: number;
  gameId: string;
  title: string;
}

export interface RunState {
  index: number;
  tally: Tally[];
  games: RunGame[];
  finished: boolean;
}

export interface LessonRunInit {
  lessonId: string;
  runId: string;
  classId: string | null;
  title: string;
  goals: string[];
  standingsOn: boolean;
  steps: { title: string; kind: LessonStepKind }[];
  index: number;
  tally: Tally[];
  games: RunGame[];
  screen: LessonScreenView | null;
  save: (state: RunState) => void;
}

/** What every screen shows for a step that is not a game. Null for a game. */
export function screenFor(step: LessonStep, now: number): LessonScreenView | null {
  if (step.kind === 'slide') return { kind: 'slide', title: step.title, lines: step.lines.filter(Boolean), image: step.image ? { url: step.image.url, alt: step.image.alt } : null, ...(step.tool ? { tool: step.tool } : {}) };
  if (step.kind === 'discussion') return { kind: 'discussion', prompt: step.prompt, seconds: step.seconds, endsAt: now + step.seconds * 1000 };
  return null;
}

export class LessonRun implements RoomLesson {
  readonly lessonId: string;
  readonly runId: string;
  readonly classId: string | null;
  title: string;
  goals: string[];
  standingsOn: boolean;
  steps: { title: string; kind: LessonStepKind }[];
  index: number;
  screen: LessonScreenView | null;
  finished = false;
  private readonly tally = new Map<string, Tally>();
  readonly games: RunGame[];
  /** Game ids already counted, so a game is never added twice. */
  private readonly counted = new Set<string>();
  private readonly save: (state: RunState) => void;

  constructor(init: LessonRunInit) {
    this.lessonId = init.lessonId;
    this.runId = init.runId;
    this.classId = init.classId;
    this.title = init.title;
    this.goals = init.goals;
    this.standingsOn = init.standingsOn;
    this.steps = init.steps;
    this.index = init.index;
    this.screen = init.screen;
    for (const t of init.tally) this.tally.set(t.key, { ...t });
    this.games = [...init.games];
    for (const g of init.games) this.counted.add(g.gameId);
    this.save = init.save;
  }

  /** A stable key for a player across rooms of this run: a hash for an account (never its id), the name for a guest. */
  keyFor(room: Room, playerId: string): string {
    const r = room.roster.get(playerId);
    if (r?.userId) return `u${createHash('sha256').update(`${this.runId}:${r.userId}`).digest('hex').slice(0, 20)}`;
    return `n${(r?.name ?? playerId).toLowerCase()}`;
  }

  onScreen(): boolean {
    return this.screen !== null;
  }

  gameEnded(room: Room, results: EngineResults): void {
    const gameId = room.gameId ?? `unsaved-${this.games.length}`;
    if (this.counted.has(gameId)) return;
    this.counted.add(gameId);
    if (room.gameId) this.games.push({ index: this.index, gameId: room.gameId, title: this.steps[this.index]?.title ?? room.set.title });
    for (const [playerId, points] of lessonPoints(results)) {
      const key = this.keyFor(room, playerId);
      const name = results.standings.find((s) => s.playerId === playerId)?.name ?? 'Player';
      const t = this.tally.get(key) ?? { key, name, points: 0 };
      t.points += points;
      t.name = name;
      this.tally.set(key, t);
    }
    this.persist();
  }

  /** Move to a step: the room has already been moved on. */
  moveTo(index: number, screen: LessonScreenView | null, steps: { title: string; kind: LessonStepKind }[]) {
    this.index = index;
    this.steps = steps;
    this.screen = screen;
    this.persist();
  }

  finish() {
    this.finished = true;
    this.screen = { kind: 'end' };
    this.persist();
  }

  state(): RunState {
    return { index: this.index, tally: [...this.tally.values()], games: this.games, finished: this.finished };
  }

  private persist() {
    this.save(this.state());
  }

  view(room: Room, playerId: string | null, aliases: Map<string, string> | null): LessonRoomView {
    const mine = playerId ? this.keyFor(room, playerId) : null;
    const alias = (n: string) => aliases?.get(n) ?? (aliases ? 'Player' : n);
    return {
      title: this.title,
      goals: this.goals,
      index: this.index,
      steps: this.steps,
      standingsOn: this.standingsOn,
      standings: this.standingsOn ? rankTally([...this.tally.values()], mine, alias) : null,
      screen: this.screen,
      ...(playerId ? {} : { lessonId: this.lessonId, runId: this.runId, classId: this.classId }),
    };
  }
}
