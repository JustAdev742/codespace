import { z } from 'zod';
import { roomCodeSchema } from './validation.ts';
import type { GlimArt, AccessoryArt, EMOTE_GLYPHS } from './economy.ts';
import type { SettingValues } from './modes.ts';

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
} as const;

export const S2C = {
  view: 'room:view',
  feed: 'room:feed',
  reaction: 'room:reaction',
  closed: 'room:closed',
  rewards: 'room:rewards',
} as const;

export const joinRequestSchema = z.object({
  code: roomCodeSchema,
  name: z.string().max(40).optional(),
  reconnectToken: z.string().min(16).max(80).optional(),
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
});
export type CommonSettings = z.infer<typeof commonSettingsSchema>;

export const roomOptionsSchema = z.object({
  lateJoin: z.boolean().default(true),
  maxPlayers: z.number().int().min(1).max(200).default(60),
  /** Players get a generated name instead of typing one. */
  generatedNames: z.boolean().default(false),
  /** Only signed-in accounts may join. */
  requireAccount: z.boolean().default(false),
});
export type RoomOptions = z.infer<typeof roomOptionsSchema>;

export const hostCommandSchema = z.discriminatedUnion('cmd', [
  z.object({ cmd: z.literal('start') }),
  z.object({ cmd: z.literal('pause') }),
  z.object({ cmd: z.literal('resume') }),
  z.object({ cmd: z.literal('end') }),
  z.object({ cmd: z.literal('next') }),
  z.object({ cmd: z.literal('restart') }),
  z.object({ cmd: z.literal('kick'), playerId: z.string().min(1).max(40) }),
  z.object({ cmd: z.literal('lock'), locked: z.boolean() }),
  z.object({ cmd: z.literal('addBots'), count: z.number().int().min(1).max(20) }),
  z.object({ cmd: z.literal('removeBots') }),
  z.object({ cmd: z.literal('shuffleTeams') }),
  z.object({ cmd: z.literal('setTeam'), playerId: z.string().min(1).max(40), teamId: z.string().min(1).max(20) }),
  z.object({
    cmd: z.literal('configure'),
    settings: z.record(z.string(), z.union([z.number(), z.string(), z.boolean()])).optional(),
    common: commonSettingsSchema.partial().optional(),
    options: roomOptionsSchema.partial().optional(),
  }),
]);
export type HostCommand = z.infer<typeof hostCommandSchema>;

export const reactionSchema = z.object({ emote: z.string().min(1).max(20) });

export type AckOk<T = object> = { ok: true } & T;
export type AckErr = { ok: false; error: { code: string; message: string } };
export type Ack<T = object> = AckOk<T> | AckErr;

export type RoomStatus = 'lobby' | 'running' | 'paused' | 'ended' | 'closed';

export interface AvatarLite {
  art: GlimArt;
  accessories?: AccessoryArt[];
  /** Equipped victory effect, played on the podium when this player wins. */
  victory?: { style: string; hue: number };
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

export interface ResultsView {
  gameId: string | null;
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
  };
  me: { playerId: string | null; role: 'host' | 'player'; name: string | null; teamId: string | null; reconnectToken: string | null };
  players: RoomPlayerView[];
  game: G | null;
  results: ResultsView | null;
  rewards: RewardSummary | null;
  feed: FeedItem[];
}

export type EmoteGlyph = (typeof EMOTE_GLYPHS)[number];
