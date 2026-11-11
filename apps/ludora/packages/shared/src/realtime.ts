import { z } from 'zod';
import { roomCodeSchema } from './validation.ts';
import { schoolDressSchema } from './schoolUniformSchema.ts';
import type { SchoolUniform } from './schoolUniform.ts';
import type { GlimArt, AccessoryArt, EMOTE_GLYPHS } from './economy.ts';
import type { Rarity } from './rarity.ts';
import type { Pacing, SettingValues } from './modes.ts';
import type { LessonRoomView } from './lessons.ts';

/**
 * The Socket.IO protocol between browsers and the game server.
 * Payloads from clients are validated with these schemas on arrival.
 */

export const C2S = {
  join: 'room:join',
  leave: 'room:leave',
  action: 'room:action',
  host: 'room:host',
  react: 'room:react',
  chaos: 'room:chaos',
  /** A player's own lobby and end-of-game choices: ready, their team, the exit ticket. */
  player: 'room:player',
} as const;

export const S2C = {
  view: 'room:view',
  feed: 'room:feed',
  reaction: 'room:reaction',
  closed: 'room:closed',
  rewards: 'room:rewards',
  /** Sent only to an account that has just finished the lantern ritual. */
  glow: 'room:glow',
  /** Compact, frequent updates (where everyone is standing) between full views. See `PulseView`. */
  pulse: 'room:pulse',
  /** The host is waiting for this player's answer. Sent only to that player. */
  nudge: 'room:nudge',
  /** The host let a player in from the waiting room: rejoin with this reconnect token. */
  admitted: 'room:admitted',
} as const;

/** A pulse: the mode's compact data, sent at most ten times a second after quiet moves. */
export interface PulseView<D = unknown> {
  /** Game time the pulse was taken at. */
  gameNow: number;
  d: D;
}

export const joinRequestSchema = z.object({
  code: roomCodeSchema,
  name: z.string().max(40).optional(),
  reconnectToken: z.string().min(16).max(80).optional(),
  /** A guest's school year, blazer and kit, for their uniform on a school's copy. Accounts use their settings. */
  dress: schoolDressSchema.optional(),
});
export type JoinRequest = z.infer<typeof joinRequestSchema>;

export const actionRequestSchema = z.object({
  /** Client-generated; resending the same id is a no-op on the server. */
  actionId: z.string().min(8).max(40).regex(/^[A-Za-z0-9_-]+$/),
  action: z.unknown(),
});
export type ActionRequest = z.infer<typeof actionRequestSchema>;

export const commonSettingsSchema = z.object({
  questionTimeSec: z.number().int().min(5).max(120).default(20),
  /** 0 means the mode decides when the game ends. */
  timeLimitSec: z.number().int().min(0).max(3600).default(0),
  /** 0 means use every question in the set. */
  questionLimit: z.number().int().min(0).max(250).default(0),
  shuffleQuestions: z.boolean().default(true),
  shuffleChoices: z.boolean().default(true),
  teamCount: z.number().int().min(0).max(6).default(0),
  /** The last question is worth double, and players are told before it. Modes that score points read it. */
  doubleFinal: z.boolean().default(false),
});
export type CommonSettings = z.infer<typeof commonSettingsSchema>;

export const roomOptionsSchema = z.object({
  lateJoin: z.boolean().default(true),
  maxPlayers: z.number().int().min(1).max(200).default(60),
  /** Players get a generated name instead of typing one. */
  generatedNames: z.boolean().default(false),
  /** Only signed-in accounts may join. */
  requireAccount: z.boolean().default(false),
  /**
   * Players who found the secret chaos lantern may cast cheats. Off unless the host turns it on
   * (classroom games stay calm by default); always off for assignments.
   */
  chaos: z.boolean().default(false),
  /** Seconds of "Starting in" on every screen after the host presses Start. 0 starts at once. */
  startCountdownSec: z.number().int().min(0).max(10).default(0),
  /** Start (with the countdown) by itself once this many players are in. 0 is off. */
  autoStartAt: z.number().int().min(0).max(200).default(0),
  /** Players pick their own team in the lobby. */
  teamPick: z.boolean().default(false),
  /** The big screen shows no names; each player still sees their own. */
  hideNames: z.boolean().default(false),
  /** A one-tap "How did that feel?" on players' devices at the end. The host sees only the counts. */
  exitTicket: z.boolean().default(false),
  /** Waiting room: the host lets each new player in. */
  admit: z.boolean().default(false),
  /** Every device in the room stays silent. */
  quiet: z.boolean().default(false),
  /** Players may send reactions. */
  reactions: z.boolean().default(true),
  /** Players who join after the start begin level with the lowest score in the game (host-paced modes that keep points). */
  catchUp: z.boolean().default(false),
  /** Little hands: bigger buttons and text on every player's game screen. */
  littleHands: z.boolean().default(false),
  /** The big screen reads each question and its answers aloud (the browser's own speech). */
  readAloud: z.boolean().default(false),
});
export type RoomOptions = z.infer<typeof roomOptionsSchema>;

/**
 * A change to some settings: only the keys sent. (`.partial()` on a schema with defaults would fill
 * every missing key with its default, so changing one switch would reset all the others.)
 */
function patchOf<T extends z.ZodRawShape>(shape: T) {
  return z.object(Object.fromEntries(Object.entries(shape).map(([k, v]) => [k, (v instanceof z.ZodDefault ? (v.unwrap() as z.ZodType) : (v as unknown as z.ZodType)).optional()])));
}
const commonPatchSchema = patchOf(commonSettingsSchema.shape) as unknown as z.ZodType<Partial<CommonSettings>>;
const optionsPatchSchema = patchOf(roomOptionsSchema.shape) as unknown as z.ZodType<Partial<RoomOptions>>;

export const hostCommandSchema = z.discriminatedUnion('cmd', [
  /** `now` skips the room's countdown. */
  z.object({ cmd: z.literal('start'), now: z.boolean().optional() }),
  z.object({ cmd: z.literal('cancelStart') }),
  z.object({ cmd: z.literal('pause') }),
  z.object({ cmd: z.literal('resume') }),
  z.object({ cmd: z.literal('end') }),
  z.object({ cmd: z.literal('next') }),
  z.object({ cmd: z.literal('restart') }),
  z.object({ cmd: z.literal('kick'), playerId: z.string().min(1).max(40) }),
  z.object({ cmd: z.literal('lock'), locked: z.boolean() }),
  z.object({ cmd: z.literal('addBots'), count: z.number().int().min(1).max(20) }),
  z.object({ cmd: z.literal('removeBots') }),
  /** End every chaos effect and close chaos for the rest of this game. */
  z.object({ cmd: z.literal('chaosCalm') }),
  z.object({ cmd: z.literal('shuffleTeams') }),
  z.object({ cmd: z.literal('setTeam'), playerId: z.string().min(1).max(40), teamId: z.string().min(1).max(20) }),
  z.object({ cmd: z.literal('renameTeam'), teamId: z.string().min(1).max(20), name: z.string().max(40) }),
  z.object({ cmd: z.literal('renamePlayer'), playerId: z.string().min(1).max(40), name: z.string().max(40) }),
  /** A gentle "Your teacher is waiting for your answer" on one player's device. */
  z.object({ cmd: z.literal('nudge'), playerId: z.string().min(1).max(40) }),
  z.object({ cmd: z.literal('addTime'), seconds: z.number().int().min(5).max(60) }),
  /** Extra time for one player on timed questions: a share of the limit. Nobody else is told. */
  z.object({ cmd: z.literal('extraTime'), playerId: z.string().min(1).max(40), share: z.union([z.literal(0), z.literal(0.25), z.literal(0.5), z.literal(1)]) }),
  z.object({ cmd: z.literal('break'), seconds: z.union([z.literal(30), z.literal(60)]) }),
  z.object({ cmd: z.literal('endBreak') }),
  /** A short message pinned in the lobby, or null to take it down. */
  z.object({ cmd: z.literal('pin'), text: z.string().max(120).nullable() }),
  z.object({ cmd: z.literal('admit'), playerId: z.string().min(1).max(40), allow: z.boolean() }),
  /** The questions, for the host to look over before starting. Answered in the acknowledgement. */
  z.object({ cmd: z.literal('preview') }),
  z.object({
    cmd: z.literal('configure'),
    settings: z.record(z.string(), z.union([z.number(), z.string(), z.boolean()])).optional(),
    common: commonPatchSchema.optional(),
    options: optionsPatchSchema.optional(),
  }),
]);
export type HostCommand = z.infer<typeof hostCommandSchema>;

export const FEELINGS = ['great', 'okay', 'tough'] as const;
export type Feeling = (typeof FEELINGS)[number];

export const playerRequestSchema = z.discriminatedUnion('op', [
  z.object({ op: z.literal('ready'), ready: z.boolean() }),
  z.object({ op: z.literal('team'), teamId: z.string().min(1).max(20) }),
  z.object({ op: z.literal('feeling'), feeling: z.enum(FEELINGS) }),
]);
export type PlayerRequest = z.infer<typeof playerRequestSchema>;

export const reactionSchema = z.object({ emote: z.string().min(1).max(20) });

const chaosActionId = z.string().min(8).max(40).regex(/^[A-Za-z0-9_-]+$/);
const chaosCast = z.object({
  cheatId: z.string().min(3).max(60).regex(/^[a-z0-9.-]+$/),
  target: z.string().min(1).max(40).nullable().optional(),
  params: z.record(z.string().max(30), z.union([z.number(), z.string().max(40)])).optional(),
});

/** Chaos requests from players. The server checks that the account has unlocked chaos before any of them. */
export const chaosRequestSchema = z.discriminatedUnion('op', [
  z.object({ op: z.literal('cast'), actionId: chaosActionId, casts: z.array(chaosCast).min(1).max(5) }),
  z.object({ op: z.literal('undo'), actionId: chaosActionId, castId: z.string().min(1).max(20) }),
  z.object({ op: z.literal('stop'), actionId: chaosActionId, eid: z.string().min(1).max(20) }),
]);
export type ChaosRequest = z.infer<typeof chaosRequestSchema>;

/** What a viewer sees of the chaos in their game. Mirrors the engine's ChaosView. */
export interface ChaosRoomView {
  calmed: boolean;
  casts: number;
  effects: {
    eid: string;
    cheatId: string;
    name: string;
    category: string;
    caster: string;
    casterName: string;
    targets: string[];
    team: string | null;
    startedAt: number;
    endsAt: number;
    hostile: boolean;
  }[];
  overlays: ({ kind: string; eid?: string; endsAt?: number } & Record<string, unknown>)[];
  me: {
    energy: number;
    maxEnergy: number;
    regenPerSec: number;
    cooldowns: Record<string, number>;
    undo: { castId: string; names: string[]; until: number }[];
    capabilities: string[];
  } | null;
}

export type AckOk<T = object> = { ok: true } & T;
export type AckErr = { ok: false; error: { code: string; message: string } };
export type Ack<T = object> = AckOk<T> | AckErr;

export type RoomStatus = 'lobby' | 'running' | 'paused' | 'ended' | 'closed';

export interface AvatarLite {
  art: GlimArt;
  /** The buddy Glim's rarity, for its finish (gloss, gold rim, sheen). */
  rarity?: Rarity;
  accessories?: AccessoryArt[];
  /** Equipped victory effect, played on the podium when this player wins. */
  victory?: { style: string; hue: number };
  /** On a school's copy, the uniform for the player's year group (schoolUniform.ts). Never the year itself. */
  uniform?: SchoolUniform;
  /** On a school's copy with houses, the player's house: its name, colour and emblem (school.ts). */
  house?: { id: string; name: string; hue: number; emblem: string };
}

export interface TeamView {
  id: string;
  name: string;
  hue: number;
}

export interface RoomPlayerView {
  id: string;
  name: string;
  teamId: string | null;
  connected: boolean;
  isBot: boolean;
  isGuest: boolean;
  avatar: AvatarLite | null;
  /** Tapped Ready in the lobby. */
  ready?: boolean;
}

export interface FeedItem {
  id: number;
  at: number;
  text: string;
  tone?: 'info' | 'good' | 'bad' | 'big';
  /** When set, only these players see the item. */
  to?: string[];
}

export interface StandingView {
  playerId: string;
  name: string;
  rank: number;
  score: number;
  label: string;
  teamId: string | null;
  correct: number;
  answered: number;
}

/** A podium award, worked out on the server from the answers. */
export interface AwardView {
  kind: 'streak' | 'fastest' | 'improved' | 'comeback';
  playerId: string;
  name: string;
  /** What earned it, e.g. "7 right in a row". */
  detail: string;
}

/** One question of a finished game, for the host's breakdown. */
export interface QuestionReportView {
  qid: string;
  prompt: string;
  answered: number;
  right: number;
  /** The most common wrong answer and how many gave it, when answers can be told apart. */
  commonWrong: { text: string; count: number } | null;
  avgMs: number;
}

/** What only the host sees at the end: how the class did. */
export interface HostReportView {
  answered: number;
  right: number;
  questions: QuestionReportView[];
  /** Players under the threshold, lowest first. */
  needHelp: { playerId: string; name: string; right: number; answered: number }[];
  threshold: number;
  /** Exit ticket counts, never who chose what. Null when the exit ticket was off. */
  feelings: Record<Feeling, number> | null;
}

export interface ResultsView {
  gameId: string | null;
  awards?: AwardView[];
  /** Only in the host's view. */
  report?: HostReportView;
  /** Chaos cheats were cast in this game, so places earn no rewards. */
  chaos?: boolean;
  standings: StandingView[];
  teamStandings: { teamId: string; name: string; rank: number; score: number; label: string }[];
  outcome: 'competitive' | 'coop-win' | 'coop-loss';
  summary: string;
  durationMs: number;
}

/** What a player earned from a finished game. */
export interface RewardSummary {
  status: 'pending' | 'granted' | 'none';
  sparks: number;
  xp: number;
  levelUp?: { from: number; to: number };
  quests: { title: string; progress: number; target: number; completed: boolean }[];
  achievements: { title: string }[];
  /** Plain-language notes, e.g. the daily limit was reached or guests need an account to keep rewards. */
  notes: string[];
}

export interface RoomView<G = unknown> {
  version: number;
  serverNow: number;
  gameNow: number;
  paused: boolean;
  room: {
    code: string;
    status: RoomStatus;
    modeId: string;
    /** Host-paced games pause while the host is away; self-paced ones keep going. */
    pacing: Pacing;
    variantId: string | null;
    title: string;
    setTitle: string;
    questionCount: number;
    hostName: string;
    locked: boolean;
    solo: boolean;
    options: RoomOptions;
    common: CommonSettings;
    settings: SettingValues;
    teams: TeamView[];
    hostConnected: boolean;
    /** Server time the countdown ends and the game starts, while one is running. */
    startsAt?: number | null;
    /** Server time a brain break ends, while one is on. */
    breakEndsAt?: number | null;
    /** The host's pinned lobby message. */
    pinned?: string | null;
    /** How many players have tapped Ready. */
    readyCount?: number;
    /** A class game: only that class's members can join. */
    classTitle?: string | null;
    /** The last question is worth double and is the next or current one. */
    doubleNow?: boolean;
  };
  me: {
    playerId: string | null;
    role: 'host' | 'player';
    name: string | null;
    teamId: string | null;
    reconnectToken: string | null;
    ready?: boolean;
    /** The exit ticket choice this player made. */
    feeling?: Feeling | null;
  };
  /** Only in the host's view. */
  host?: HostExtras;
  players: RoomPlayerView[];
  game: G | null;
  results: ResultsView | null;
  rewards: RewardSummary | null;
  feed: FeedItem[];
  /** Present once chaos has been used in this game, or for a viewer who has unlocked it. */
  chaos?: ChaosRoomView | null;
  /** A lesson running in this room (lessons.ts). */
  lesson?: LessonRoomView | null;
}

export interface HostExtras {
  /** Who the open question is waiting for. Null when this mode or moment has no single question to wait on. */
  waiting: { id: string; name: string; nudged: boolean }[] | null;
  /** "Add time" works now: a timed question is open in a host-paced game. */
  canAddTime: boolean;
  /** Players asking to come in (waiting room). */
  pending: { id: string; name: string }[];
  /** Exit ticket counts while players answer it. */
  feelings: Record<Feeling, number> | null;
  /** Players with extra time on timed questions (player id to a share of the limit). The host's view only. */
  extraTime?: Record<string, number>;
}

export type EmoteGlyph = (typeof EMOTE_GLYPHS)[number];
