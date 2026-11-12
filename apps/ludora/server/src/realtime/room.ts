import {
  cleanText,
  containsBlockedLanguage,
  createRng,
  displayNameSchema,
  FEELINGS,
  FREE_REACTIONS,
  MAX_BAR_REACTIONS,
  generateName,
  hashString,
  S2C,
  uniformForDress,
  type AvatarLite,
  type ChaosRequest,
  type ChaosRoomView,
  type CommonSettings,
  type FeedItem,
  type Feeling,
  type HostCommand,
  type HostExtras,
  type LessonRoomView,
  type PlayerRequest,
  type SchoolDress,
  type Question,
  type ResultsView,
  type RewardSummary,
  type RoomOptions,
  type RoomStatus,
  type RoomView,
  type SettingValues,
  type TeamView,
} from '@ludora/shared';
import { extraTimeFor } from '@ludora/engine/catalog';
import { computeAwards, hostReport, missedQuestionIds } from './report.ts';
import { hideNames } from './hideNames.ts';
import { spectatorView } from '../modules/school/spectator.ts';
import {
  GameRuntime,
  makeTeams,
  prepareQuestions,
  resolveGameConfig,
  type EngineResults,
  type GameMode,
  type ModeVariant,
} from '@ludora/engine';

/*
 * One live room: a lobby, then one or more games of one mode. Knows nothing
 * about sockets or the database; the realtime layer subscribes to it and the
 * manager supplies persistence. It uses only what Node and browsers share
 * (the global crypto.randomUUID), so the playable demo runs the same room in a
 * browser.
 */

export type Ack<T = object> = ({ ok: true } & T) | { ok: false; error: { code: string; message: string } };

export function fail(code: string, message: string): { ok: false; error: { code: string; message: string } } {
  return { ok: false, error: { code, message } };
}

export interface RoomSubscriber {
  id: string;
  /** A spectator (school: a second screen) sees the big screen's view and can do nothing. */
  role: 'host' | 'player' | 'spectator';
  playerId: string | null;
  /** The host's controls-only remote (a phone): sees real names even when the big screen hides them. */
  remote?: boolean;
  emit(event: string, payload: unknown): void;
}

export interface RoomPlayer {
  id: string;
  userId: string | null;
  name: string;
  isGuest: boolean;
  isBot: boolean;
  teamId: string | null;
  connected: boolean;
  reconnectToken: string;
  avatar: AvatarLite | null;
  disconnectedAt: number | null;
  recent: Map<string, Ack>;
  lastReactionAt: number;
  skill: number;
  /** Reactions this player may send (the free ones, and those their account owns) and the bar they chose. */
  canReact?: Set<string>;
  bar?: string[];
  /** Practice bots in a solo game: how much slower (over 1) or quicker (under 1) than the mode's own pace it plays. */
  pace?: number;
  /** The account behind this slot has unlocked chaos. Set by the server from the database, never by the client. */
  chaos: boolean;
}

export type PracticeLevel = 'easy' | 'medium' | 'hard';
export const MAX_PRACTICE_BOTS = 5;
/** Practice bots' accuracy (the chance each answer is right) and pace (times the mode's own bot speed). */
export const PRACTICE_LEVELS: Record<PracticeLevel, { skill: number; pace: number }> = {
  easy: { skill: 0.4, pace: 1.6 },
  medium: { skill: 0.65, pace: 1 },
  hard: { skill: 0.88, pace: 0.6 },
};

export interface PersistOutcome {
  gameId: string;
  rewards: Map<string, RewardSummary>;
}

export interface RoomHooks {
  now(): number;
  persist(room: Room, results: EngineResults): Promise<PersistOutcome | null>;
  /** Exit ticket answers that came in after the game was saved, written onto the saved game. */
  saveFeelings?(gameId: string, feelings: Record<Feeling, number>): Promise<void>;
  onError(err: unknown, where: string, room: Room): void;
  onClosed(room: Room): void;
}

export interface RoomInit {
  code: string;
  hostUserId: string;
  hostName: string;
  modeId: string;
  variantId: string | null;
  settings: Record<string, unknown>;
  common: Partial<CommonSettings>;
  options: RoomOptions;
  set: { id: string | null; title: string; questions: Question[] };
  solo: boolean;
  classId?: string | null;
  assignmentId?: string | null;
  /** School: fixed teams (houses, two classes, a tournament match's sides), built by modules/school/teams.ts. */
  teamPlan?: TeamPlan | null;
  /** A live game for a class: only these accounts may join (checked here, and refreshed from the database by the caller). */
  classMembers?: readonly string[] | null;
  classTitle?: string | null;
  /** Extra time the class teacher set for members (user id to a share of the limit), applied as each one joins. */
  classExtraTime?: Readonly<Record<string, number>> | null;
}

/**
 * A lesson running in this room (modules/lessons/run.ts). It hears about each finished game, adds its
 * part to every view, and holds the room on a step that is not a game. It never holds plan notes.
 */
export interface RoomLesson {
  gameEnded(room: Room, results: EngineResults): void;
  view(room: Room, playerId: string | null, aliases: Map<string, string> | null): LessonRoomView;
  /** A slide, discussion or the end is showing, so there is no game to start. */
  onScreen(): boolean;
}

/** Fixed teams for a room, and which team each account belongs to. Everyone else joins the smallest team. */
export interface TeamPlan {
  teams: TeamView[];
  teamOf: Record<string, string>;
  matchId?: string;
}

/** Someone in the waiting room: their request, kept until the host lets them in or not. */
interface PendingEntry {
  id: string;
  name: string;
  input: JoinInput;
  at: number;
  admitted(reconnectToken: string): void;
  declined(message: string): void;
}

export interface JoinInput {
  name?: string | undefined;
  reconnectToken?: string | undefined;
  userId: string | null;
  accountName: string | null;
  isGuestAccount: boolean;
  avatar: AvatarLite | null;
  dress?: SchoolDress | undefined;
  /** Reactions this account owns beyond the free ones (from the database), and the bar it chose in Settings. */
  ownedReactions?: readonly string[] | undefined;
  reactionBar?: readonly string[] | undefined;
  /** Waiting room: called when the host lets this request in, or turns it away. Without them the request is refused. */
  onAdmitted?: (reconnectToken: string) => void;
  onDeclined?: (message: string) => void;
}

const MAX_RECENT_ACTIONS = 100;
const FREE_SET: ReadonlySet<string> = new Set(FREE_REACTIONS);

/** What a joining player may send and their bar: the free reactions and those their account owns, in the order they chose. */
function reactionsFor(input: JoinInput): { canReact: Set<string>; bar: string[] } {
  const canReact = new Set<string>([...FREE_REACTIONS, ...(input.ownedReactions ?? []).filter((e) => ALLOWED_REACTIONS.includes(e))]);
  const chosen = [...new Set(input.reactionBar ?? [])].filter((e) => canReact.has(e)).slice(0, MAX_BAR_REACTIONS);
  return { canReact, bar: chosen.length ? chosen : [...FREE_REACTIONS] };
}
const BROADCAST_MS = 40;
/** Pulses (positions after quiet moves) go out at most ten times a second. */
const PULSE_MS = 100;
const LOBBY_DISCONNECT_DROP_MS = 2 * 60_000;
const HOST_ABSENT_END_MS = 10 * 60_000;
const IDLE_CLOSE_MS = 45 * 60_000;
const ENDED_CLOSE_MS = 20 * 60_000;
const REACTION_GAP_MS = 1500;
const FEED_KEEP = 12;
/** A player can be nudged once in this long. */
const NUDGE_GAP_MS = 10_000;
/** A waiting-room request lapses after this long. */
const PENDING_KEEP_MS = 10 * 60_000;
const MAX_PENDING = 60;
/** Room options the host can change while a game is on. */
const LIVE_OPTIONS = ['quiet', 'reactions', 'hideNames', 'admit', 'lateJoin', 'exitTicket', 'littleHands', 'readAloud', 'sharedDevices'] as const;
/** Players under this share of right answers are listed for the teacher as maybe needing a hand. */
export const NEED_HELP_BELOW = 0.5;
export const ALLOWED_REACTIONS = ['wave', 'laugh', 'wow', 'gg', 'heart', 'fire', 'think', 'clap', 'party', 'cool', 'sleepy', 'star'];

/** A guest's chosen year group dresses their Glim; an account's own settings, already on its avatar, come first. */
function withDress(avatar: AvatarLite, dress: SchoolDress | undefined): AvatarLite {
  if (avatar.uniform || !dress) return avatar;
  const uniform = uniformForDress(dress);
  return uniform ? { ...avatar, uniform } : avatar;
}

/** Guests and anonymous players get a look derived from their name. */
export function defaultAvatar(seed: string): AvatarLite {
  const r = createRng(hashString(seed));
  const bodies = ['blob', 'drop', 'bean', 'cloud', 'orb', 'bell'] as const;
  const eyes = ['dot', 'big', 'happy', 'curious', 'sparkle'] as const;
  const mouths = ['smile', 'grin', 'o', 'cat'] as const;
  // Ears and brows give guests in a crowded lobby a little personality of their own.
  const ears = ['none', 'none', 'cat', 'bunny', 'bear', 'mouse', 'fox'] as const;
  const brows = ['none', 'soft', 'determined', 'surprised'] as const;
  const hue = r.int(0, 359);
  const ear = r.pick(ears);
  const brow = r.pick(brows);
  return {
    art: {
      kind: 'glim',
      body: r.pick(bodies),
      hue,
      accentHue: (hue + 40) % 360,
      saturation: 65,
      eyes: r.pick(eyes),
      mouth: r.pick(mouths),
      pattern: 'none',
      topper: 'none',
      cheeks: true,
      ...(ear !== 'none' ? { ears: ear } : {}),
      ...(brow !== 'none' ? { brows: brow } : {}),
    },
  };
}

export class Room {
  readonly code: string;
  readonly hostUserId: string;
  readonly hostName: string;
  readonly solo: boolean;
  readonly classId: string | null;
  readonly assignmentId: string | null;
  readonly teamPlan: TeamPlan | null;
  readonly createdAt: number;
  mode!: GameMode;
  variant: ModeVariant | null = null;
  settings: SettingValues = {};
  common!: CommonSettings;
  options: RoomOptions;
  locked = false;
  /** Changes only when a lesson moves on to its next game. */
  set: { id: string | null; title: string; questions: Question[] };
  /** Lessons: the lesson running in this room, if any. */
  lesson: RoomLesson | null = null;
  prepared: Question[] = [];
  skippedCount = 0;
  status: RoomStatus = 'lobby';
  readonly players = new Map<string, RoomPlayer>();
  /** Everyone who has ever been in the room, kept after they leave so results can credit them. */
  readonly roster = new Map<string, { userId: string | null; name: string; isGuest: boolean; isBot: boolean; forgotten?: true }>();
  teams: TeamView[] = [];
  runtime: GameRuntime | null = null;
  gameId: string | null = null;
  results: EngineResults | null = null;
  rewards = new Map<string, RewardSummary>();
  rewardsPending = false;
  lastActivity: number;
  endedAt: number | null = null;
  hostDisconnectedAt: number | null = null;
  /** The game was paused because the host's connection went, not by the host: it carries on when they are back. */
  pausedForHost = false;
  gamesPlayed = 0;
  /** Server time the start countdown ends, while one runs. */
  startsAt: number | null = null;
  /** Server time a brain break ends, while one is on. */
  breakEndsAt: number | null = null;
  pinned: string | null = null;
  readonly classMembers: Set<string> | null;
  readonly classTitle: string | null;
  readonly classExtraTime: Readonly<Record<string, number>> | null;
  /** Extra time on timed questions, by player id. Only the host sees it. */
  private readonly extraTime = new Map<string, number>();
  private startTimer: ReturnType<typeof setTimeout> | null = null;
  private breakTimer: ReturnType<typeof setTimeout> | null = null;
  /** The break paused a running game, so the game carries on when it ends. */
  private breakPausedGame = false;
  /** Auto-start has fired (or the host cancelled it) in this lobby. */
  private autoStartSpent = false;
  private readonly ready = new Set<string>();
  private readonly feelings = new Map<string, Feeling>();
  /** The skill chosen for a solo game's practice bots, shown in the room. */
  practice: PracticeLevel | null = null;
  /** The save of the game that just ended, so exit ticket answers are written after it. */
  private persisting: Promise<unknown> = Promise.resolve();
  private feelingsTimer: ReturnType<typeof setTimeout> | null = null;
  private readonly nudgedAt = new Map<string, number>();
  private readonly pending = new Map<string, PendingEntry>();

  private readonly hooks: RoomHooks;
  private readonly subscribers = new Map<string, RoomSubscriber>();
  private readonly kickedTokens = new Set<string>();
  private readonly kickedUsers = new Set<string>();
  private feed: FeedItem[] = [];
  private feedSeq = 0;
  private version = 0;
  private timer: ReturnType<typeof setTimeout> | null = null;
  private broadcastTimer: ReturnType<typeof setTimeout> | null = null;
  private pulseTimer: ReturnType<typeof setTimeout> | null = null;
  private readonly botTimers = new Map<string, ReturnType<typeof setTimeout>>();
  private readonly botRng = createRng(Date.now() & 0xffffffff);
  private playerSeq = 0;
  private closed = false;

  constructor(init: RoomInit, hooks: RoomHooks) {
    this.code = init.code;
    this.hostUserId = init.hostUserId;
    this.hostName = init.hostName;
    this.solo = init.solo;
    this.classId = init.classId ?? null;
    this.assignmentId = init.assignmentId ?? null;
    this.teamPlan = init.teamPlan ?? null;
    this.options = init.options;
    this.set = init.set;
    this.classMembers = init.classMembers ? new Set(init.classMembers) : null;
    this.classTitle = init.classTitle ?? null;
    this.classExtraTime = init.classExtraTime ?? null;
    this.hooks = hooks;
    this.createdAt = hooks.now();
    this.lastActivity = this.createdAt;
    const problem = this.configure(init.modeId, init.variantId, init.settings, init.common);
    if (problem) throw new Error(problem);
    if (this.solo) this.locked = true;
  }

  /* ------------------------------ configuration ------------------------------ */

  /** Apply mode, variant and settings. Returns a problem message, or null if the room can use them. */
  configure(modeId: string, variantId: string | null, settings: Record<string, unknown>, common: Partial<CommonSettings>): string | null {
    const resolved = resolveGameConfig({ modeId, variantId, settings, common });
    if (!resolved.ok) return resolved.message;
    const prepared = prepareQuestions(resolved.value.mode, this.set.questions, hashString(this.code));
    if (prepared.problem) return prepared.problem;
    const teamCountChanged = !this.common || this.common.teamCount !== resolved.value.common.teamCount;
    this.mode = resolved.value.mode;
    this.variant = resolved.value.variant;
    this.settings = resolved.value.settings;
    this.common = resolved.value.common;
    this.prepared = prepared.questions;
    this.skippedCount = prepared.skipped.length;
    if (teamCountChanged) this.setupTeams();
    return null;
  }

  private setupTeams() {
    const count = this.common.teamCount;
    this.teams = this.teamPlan && count ? this.teamPlan.teams : makeTeams(count).map((t) => ({ id: t.id, name: t.name, hue: t.hue }));
    const players = [...this.players.values()];
    players.forEach((p, i) => (p.teamId = count ? this.planTeam(p.userId) ?? this.teams[i % this.teams.length]!.id : null));
  }

  /** The team a school team plan puts this account in, if it is still one of the room's teams. */
  private planTeam(userId: string | null): string | null {
    const t = userId ? this.teamPlan?.teamOf[userId] : undefined;
    return t && this.teams.some((x) => x.id === t) ? t : null;
  }

  private smallestTeam(): string | null {
    if (!this.teams.length) return null;
    const sizes = new Map(this.teams.map((t) => [t.id, 0]));
    for (const p of this.players.values()) if (p.teamId) sizes.set(p.teamId, (sizes.get(p.teamId) ?? 0) + 1);
    return [...sizes].sort((a, b) => a[1] - b[1])[0]![0];
  }

  /* --------------------------------- presence -------------------------------- */

  subscribe(sub: RoomSubscriber) {
    this.subscribers.set(sub.id, sub);
    if (sub.role === 'host') {
      this.hostDisconnectedAt = null;
      // A host who reloads the page or drops off the wifi for a moment should not come back to a game stuck on pause.
      if (this.pausedForHost && this.status === 'paused' && this.runtime?.resume()) {
        this.status = 'running';
        this.startBots();
        this.pushFeed('The host is back. The game carries on.', 'info');
      }
      this.pausedForHost = false;
    }
    this.touch();
    this.sendView(sub);
  }

  unsubscribe(subId: string) {
    const sub = this.subscribers.get(subId);
    if (!sub) return;
    this.subscribers.delete(subId);
    if (sub.role === 'host' && ![...this.subscribers.values()].some((s) => s.role === 'host')) {
      this.hostDisconnectedAt = this.hooks.now();
      if (this.status === 'running' && this.mode.meta.pacing === 'host' && !this.solo) {
        this.runtime?.pause();
        this.status = 'paused';
        this.pausedForHost = true;
        this.stopBots();
        this.pushFeed('The host lost connection. The game is paused until they are back.', 'info');
      }
    }
    if (sub.playerId) {
      const p = this.players.get(sub.playerId);
      const stillHere = [...this.subscribers.values()].some((s) => s.playerId === sub.playerId);
      if (p && !stillHere) {
        p.connected = false;
        p.disconnectedAt = this.hooks.now();
        this.runtime?.setConnected(p.id, false);
      }
    }
    this.scheduleBroadcast();
  }

  hasHostConnected(): boolean {
    return [...this.subscribers.values()].some((s) => s.role === 'host');
  }

  /** Join as a player, or rejoin with a reconnect token. */
  join(input: JoinInput, admitted = false): Ack<{ player: RoomPlayer; resumed: boolean }> {
    if (this.closed || this.status === 'closed') return fail('room_closed', 'This room has closed.');
    if (input.reconnectToken) {
      if (this.kickedTokens.has(input.reconnectToken)) return fail('forbidden', 'The host removed you from this room.');
      const existing = [...this.players.values()].find((p) => p.reconnectToken === input.reconnectToken);
      if (existing) return { ok: true, player: this.resume(existing), resumed: true };
    }
    if (input.userId && this.kickedUsers.has(input.userId)) return fail('forbidden', 'The host removed you from this room.');
    // A signed-in player who is already in the room (another tab or device) takes over their own slot.
    if (input.userId) {
      const same = [...this.players.values()].find((p) => p.userId === input.userId);
      if (same) return { ok: true, player: this.resume(same), resumed: true };
    }
    if (this.solo && input.userId !== this.hostUserId) return fail('room_locked', 'This is a solo game.');
    if (this.classMembers && !(input.userId && this.classMembers.has(input.userId))) {
      // A friend challenge (no class): only the two friends in it.
      if (!this.classId) return fail('class_only', 'This game is just for the friends who were invited to it. Sign in with your own account to join.');
      return fail('class_only', `This game is for ${this.classTitle ?? 'a class'}. Sign in with the account you use in that class, then join again.`);
    }
    if (this.locked && !this.solo) return fail('room_locked', 'The host has locked this room.');
    if (this.options.requireAccount && (!input.userId || input.isGuestAccount)) return fail('room_requires_account', 'This room is for signed-in players with an account.');
    const humans = [...this.players.values()].filter((p) => !p.isBot).length;
    if (humans >= Math.min(this.options.maxPlayers, this.mode.meta.players.max)) return fail('room_full', 'This room is full.');
    if (this.status === 'ended') return fail('room_closed', 'This game has finished. Ask the host to start another.');
    if ((this.status === 'running' || this.status === 'paused') && !this.options.lateJoin) return fail('room_locked', 'This game has already started.');

    let name: string;
    if (this.options.generatedNames) name = this.uniqueName(generateName());
    else {
      const raw = input.name?.trim() || input.accountName || '';
      const parsed = displayNameSchema.safeParse(raw);
      if (!parsed.success) return fail('validation_failed', parsed.error.issues[0]?.message ?? 'Pick a different name.');
      name = this.uniqueName(parsed.data);
    }
    // Waiting room: the host lets each new player in. The request waits here; nothing is in the room yet.
    if (this.options.admit && !this.solo && !admitted) {
      if (!input.onAdmitted || !input.onDeclined) return fail('room_locked', 'The host lets players in one by one. Try joining again.');
      if (this.pending.size >= MAX_PENDING) return fail('room_full', 'Too many players are waiting to come in. Try again in a moment.');
      const id = `w${++this.playerSeq}`;
      this.pending.set(id, { id, name, input, at: this.hooks.now(), admitted: input.onAdmitted, declined: input.onDeclined });
      this.scheduleBroadcast();
      return { ...fail('waiting_room', 'The host will let you in shortly.'), pendingId: id } as Ack<{ player: RoomPlayer; resumed: boolean }>;
    }
    const player: RoomPlayer = {
      id: `p${++this.playerSeq}`,
      userId: input.userId,
      name,
      isGuest: !input.userId || input.isGuestAccount,
      isBot: false,
      teamId: this.planTeam(input.userId) ?? this.smallestTeam(),
      connected: true,
      reconnectToken: crypto.randomUUID().replace(/-/g, ''),
      avatar: withDress(input.avatar ?? defaultAvatar(name), input.dress),
      disconnectedAt: null,
      recent: new Map(),
      lastReactionAt: 0,
      skill: 0,
      chaos: false,
      ...reactionsFor(input),
    };
    this.players.set(player.id, player);
    this.roster.set(player.id, { userId: player.userId, name: player.name, isGuest: player.isGuest, isBot: false });
    const classExtra = player.userId ? (this.classExtraTime?.[player.userId] ?? 0) : 0;
    if (classExtra > 0) this.extraTime.set(player.id, classExtra);
    if (this.runtime) {
      const r = this.runtime.addPlayer({ id: player.id, name: player.name, teamId: player.teamId, isBot: false, ...this.extraOf(player.id) });
      if (!r.ok) this.hooks.onError(new Error(r.message), 'late-join', this);
      // Catch-up: a late joiner starts level with the lowest score, in modes that keep points (the rule is on screen).
      else if (this.options.catchUp) this.runtime.catchUp(player.id);
    }
    if (!this.solo) this.pushFeed(`${name} joined.`, 'info');
    this.touch();
    this.scheduleBroadcast();
    this.checkAutoStart();
    return { ok: true, player, resumed: false };
  }

  /** A waiting-room request went away (the player closed the page). */
  cancelPending(id: string) {
    if (this.pending.delete(id)) this.scheduleBroadcast();
  }

  /** The host's answer to a waiting-room request. */
  private admit(id: string, allow: boolean): Ack {
    const entry = this.pending.get(id);
    if (!entry) return fail('not_found', 'That player is no longer waiting.');
    this.pending.delete(id);
    if (!allow) {
      entry.declined('The host did not let you in this time.');
      this.scheduleBroadcast();
      return { ok: true };
    }
    const joined = this.join({ ...entry.input, name: entry.name }, true);
    if (!joined.ok) {
      entry.declined(joined.error.message);
      this.scheduleBroadcast();
      return fail(joined.error.code, joined.error.message);
    }
    entry.admitted(joined.player.reconnectToken);
    return { ok: true };
  }

  /** Auto-start: once enough players are in the lobby, start (with the countdown) by itself. Once per lobby. */
  private checkAutoStart() {
    const n = this.options.autoStartAt;
    if (!n || this.status !== 'lobby' || this.startsAt !== null || this.autoStartSpent || this.solo) return;
    const humans = [...this.players.values()].filter((p) => !p.isBot && p.connected).length;
    if (humans < n) return;
    this.autoStartSpent = true;
    const r = this.beginCountdown(Math.max(this.options.startCountdownSec, 5));
    if (r.ok) this.pushFeed(`${humans} players are in, so the game starts by itself.`, 'info');
  }

  private clearCountdown() {
    if (this.startTimer) clearTimeout(this.startTimer);
    this.startTimer = null;
    this.startsAt = null;
  }

  /** "Starting in 5" on every screen, then the game starts. The host can cancel it. */
  private beginCountdown(seconds: number): Ack {
    if (this.status !== 'lobby') return fail('invalid_state', 'The game has already started.');
    const problem = this.startProblem();
    if (problem) return fail('invalid_state', problem);
    this.clearCountdown();
    this.startsAt = this.hooks.now() + seconds * 1000;
    this.startTimer = setTimeout(() => {
      this.startTimer = null;
      this.startsAt = null;
      const r = this.start();
      if (!r.ok) this.pushFeed(r.error.message, 'bad');
      this.scheduleBroadcast();
    }, seconds * 1000);
    this.scheduleBroadcast();
    return { ok: true };
  }

  /** Why the game cannot start now, or null. */
  private startProblem(): string | null {
    const active = [...this.players.values()].filter((p) => p.isBot || p.connected);
    if (active.length < this.mode.meta.players.min) return `${this.mode.meta.title} needs at least ${this.mode.meta.players.min} player${this.mode.meta.players.min === 1 ? '' : 's'}.`;
    if (active.length === 0) return 'Wait for someone to join first.';
    return null;
  }

  /** A player's own choices: Ready in the lobby, their team (when players pick), the exit ticket at the end. */
  playerRequest(playerId: string, req: PlayerRequest): Ack {
    const p = this.players.get(playerId);
    if (!p) return fail('forbidden', 'You are not in this room.');
    this.touch();
    switch (req.op) {
      case 'ready':
        if (this.status !== 'lobby') return fail('invalid_state', 'The game has already started.');
        if (req.ready) this.ready.add(p.id);
        else this.ready.delete(p.id);
        this.scheduleBroadcast();
        return { ok: true };
      case 'team':
        if (!this.options.teamPick) return fail('forbidden', 'The host picks the teams in this game.');
        if (this.status !== 'lobby') return fail('invalid_state', 'Teams are fixed once the game starts.');
        if (!this.teams.some((t) => t.id === req.teamId)) return fail('not_found', 'That team is not in this game.');
        p.teamId = req.teamId;
        this.scheduleBroadcast();
        return { ok: true };
      case 'reactionBar': {
        const can = p.canReact ?? FREE_SET;
        const bar = [...new Set(req.emotes)].filter((e) => can.has(e)).slice(0, MAX_BAR_REACTIONS);
        if (!bar.length) return fail('bad_request', 'Choose at least one of your reactions.');
        p.bar = bar;
        this.scheduleBroadcast();
        return { ok: true };
      }
      case 'feeling':
        if (!this.options.exitTicket) return fail('forbidden', 'There is no exit ticket in this game.');
        if (this.status !== 'ended' || !this.results) return fail('invalid_state', 'The exit ticket opens when the game ends.');
        this.feelings.set(p.id, req.feeling);
        this.scheduleFeelingsSave();
        this.scheduleBroadcast();
        return { ok: true };
    }
  }

  /**
   * A player back in their own slot, by reconnect token or by account. Someone who was away when
   * the game started is not in it yet, so they are added now, whichever way they came back.
   */
  private resume(p: RoomPlayer): RoomPlayer {
    p.connected = true;
    p.disconnectedAt = null;
    if (this.runtime && !this.runtime.hasPlayer(p.id) && this.status !== 'ended') {
      this.runtime.addPlayer({ id: p.id, name: p.name, teamId: p.teamId, isBot: false, ...this.extraOf(p.id) });
    }
    this.runtime?.setConnected(p.id, true);
    this.touch();
    this.scheduleBroadcast();
    return p;
  }

  /**
   * Practice bots for a solo game at a chosen skill, decided here on the server: how often they
   * answer right and how quickly they move. They never count towards rewards (the player is still
   * playing solo), and nothing a player sends can change them once the game is made.
   */
  addPracticeBots(count: number, level: PracticeLevel): number {
    if (!this.solo || this.status !== 'lobby') return 0;
    const space = Math.max(0, this.mode.meta.players.max - this.players.size);
    const n = Math.max(0, Math.min(count, space, MAX_PRACTICE_BOTS));
    const { skill, pace } = PRACTICE_LEVELS[level];
    for (let i = 0; i < n; i++) {
      const name = this.uniqueName(this.botName());
      const id = `b${++this.playerSeq}`;
      this.roster.set(id, { userId: null, name, isGuest: true, isBot: true });
      this.players.set(id, {
        id,
        userId: null,
        name,
        isGuest: true,
        isBot: true,
        teamId: this.smallestTeam(),
        connected: true,
        reconnectToken: crypto.randomUUID(),
        avatar: defaultAvatar(name),
        disconnectedAt: null,
        recent: new Map(),
        lastReactionAt: 0,
        // A little spread, so three bots on one level do not tie on every question.
        skill: Math.min(0.97, Math.max(0.05, skill + (this.botRng.next() - 0.5) * 0.08)),
        pace: pace * (0.92 + this.botRng.next() * 0.16),
        chaos: false,
      });
    }
    this.practice = n ? level : null;
    this.scheduleBroadcast();
    return n;
  }

  /** A bot's name, a different animal from the bots already here while there are animals to spare ("Bot Nova 3" is hard to find on a board). */
  private botName(): string {
    const taken = new Set([...this.players.values()].map((p) => p.name.toLowerCase()));
    let name = '';
    for (let i = 0; i < 30; i++) {
      name = `Bot ${generateName(() => this.botRng.next()).split(' ')[1]}`;
      if (!taken.has(name.toLowerCase())) break;
    }
    return name;
  }

  private uniqueName(base: string): string {
    const taken = new Set([...this.players.values()].map((p) => p.name.toLowerCase()));
    if (!taken.has(base.toLowerCase())) return base;
    for (let i = 2; i < 500; i++) {
      const candidate = `${base.slice(0, 21)} ${i}`;
      if (!taken.has(candidate.toLowerCase())) return candidate;
    }
    return `${base.slice(0, 16)} ${crypto.randomUUID().slice(0, 4)}`;
  }

  leave(playerId: string) {
    const p = this.players.get(playerId);
    if (!p) return;
    this.removePlayer(p, `${p.name} left.`);
  }

  /**
   * The account is being deleted: its entries in the roster stop naming it, so the game is saved
   * as if a guest had played those slots (results count them, no account is linked or paid).
   */
  forgetUser(userId: string): void {
    for (const [id, r] of this.roster) if (r.userId === userId) this.roster.set(id, { ...r, userId: null, name: 'Player', isGuest: true, forgotten: true });
  }

  /** Staff removal: like a host kick, for every player slot this account holds, and it cannot rejoin. */
  removeUser(userId: string, notice: string): boolean {
    this.kickedUsers.add(userId);
    let removed = false;
    for (const p of [...this.players.values()]) {
      if (p.userId !== userId) continue;
      this.kickedTokens.add(p.reconnectToken);
      this.removePlayer(p, `${p.name} was removed.`, notice);
      removed = true;
    }
    return removed;
  }

  private removePlayer(p: RoomPlayer, line: string, notice?: string) {
    this.players.delete(p.id);
    this.ready.delete(p.id);
    this.runtime?.removePlayer(p.id);
    this.clearBot(p.id);
    const message = notice ?? (line.includes('removed') ? 'The host removed you from the room.' : 'You left the room.');
    for (const sub of this.subscribers.values()) if (sub.playerId === p.id) sub.emit('room:closed', { reason: 'removed', message });
    for (const [id, sub] of this.subscribers) if (sub.playerId === p.id) this.subscribers.delete(id);
    if (!p.isBot && !this.solo) this.pushFeed(line, 'info');
    this.scheduleBroadcast();
  }

  /* ------------------------------- host commands ------------------------------ */

  hostCommand(cmd: HostCommand): Ack {
    if (this.closed) return fail('room_closed', 'This room has closed.');
    this.touch();
    switch (cmd.cmd) {
      case 'start':
        if (this.status === 'lobby' && !cmd.now && this.options.startCountdownSec > 0 && !this.solo) return this.beginCountdown(this.options.startCountdownSec);
        return this.start();
      case 'cancelStart':
        if (this.startsAt === null) return fail('invalid_state', 'There is no countdown to cancel.');
        this.clearCountdown();
        // A cancelled auto-start does not fire again in this lobby: the host starts when they are ready.
        this.autoStartSpent = true;
        this.pushFeed('The host stopped the countdown.', 'info');
        this.scheduleBroadcast();
        return { ok: true };
      case 'pause':
        if (this.status !== 'running' || !this.runtime?.pause()) return fail('invalid_state', 'The game is not running.');
        this.status = 'paused';
        this.stopBots();
        this.scheduleBroadcast();
        return { ok: true };
      case 'resume':
        if (this.status !== 'paused' || !this.runtime?.resume()) return fail('invalid_state', 'The game is not paused.');
        this.clearBreak();
        this.status = 'running';
        this.startBots();
        this.scheduleBroadcast();
        return { ok: true };
      case 'end':
        if (this.status === 'lobby') return fail('invalid_state', 'The game has not started.');
        if (this.status === 'ended') return { ok: true };
        this.runtime?.end('host', this.solo ? 'You finished the game early.' : 'The host ended the game.');
        return { ok: true };
      case 'next': {
        if (!this.runtime) return fail('invalid_state', 'The game has not started.');
        const r = this.runtime.hostNext();
        return r.ok ? { ok: true } : fail(r.code, r.message);
      }
      case 'restart':
        if (this.status !== 'ended') return fail('invalid_state', 'Finish this game first.');
        return this.start(true);
      case 'kick': {
        const p = this.players.get(cmd.playerId);
        if (!p) return fail('not_found', 'That player is not in the room.');
        this.kickedTokens.add(p.reconnectToken);
        if (p.userId) this.kickedUsers.add(p.userId);
        this.removePlayer(p, `${p.name} was removed by the host.`);
        return { ok: true };
      }
      case 'lock':
        this.locked = cmd.locked;
        this.scheduleBroadcast();
        return { ok: true };
      case 'addBots': {
        if (this.status !== 'lobby') return fail('invalid_state', 'Add practice bots before the game starts.');
        const room = Math.min(this.options.maxPlayers, this.mode.meta.players.max) - this.players.size;
        const count = Math.min(cmd.count, room, 20 - [...this.players.values()].filter((p) => p.isBot).length);
        if (count <= 0) return fail('room_full', 'No space for more bots.');
        for (let i = 0; i < count; i++) {
          const name = this.uniqueName(this.botName());
          const id = `b${++this.playerSeq}`;
          this.roster.set(id, { userId: null, name, isGuest: true, isBot: true });
          this.players.set(id, {
            id,
            userId: null,
            name,
            isGuest: true,
            isBot: true,
            teamId: this.smallestTeam(),
            connected: true,
            reconnectToken: crypto.randomUUID(),
            avatar: defaultAvatar(name),
            disconnectedAt: null,
            recent: new Map(),
            lastReactionAt: 0,
            skill: 0.45 + this.botRng.next() * 0.45,
            chaos: false,
          });
        }
        this.scheduleBroadcast();
        return { ok: true };
      }
      case 'removeBots':
        for (const p of [...this.players.values()]) if (p.isBot) this.removePlayer(p, '');
        return { ok: true };
      case 'chaosCalm': {
        if (!this.runtime || !this.runtime.chaosEnabled) return fail('invalid_state', 'There is no chaos to calm.');
        const r = this.runtime.calmChaos();
        return r.ok ? { ok: true } : fail(r.code, r.message);
      }
      case 'shuffleTeams': {
        if (!this.teams.length) return fail('invalid_state', 'Teams are off.');
        if (this.status !== 'lobby') return fail('invalid_state', 'Teams are fixed once the game starts.');
        const shuffled = this.botRng.shuffle([...this.players.values()]);
        shuffled.forEach((p, i) => (p.teamId = this.teams[i % this.teams.length]!.id));
        this.scheduleBroadcast();
        return { ok: true };
      }
      case 'renameTeam': {
        if (this.status !== 'lobby') return fail('invalid_state', 'Rename teams before the game starts.');
        const team = this.teams.find((t) => t.id === cmd.teamId);
        if (!team) return fail('not_found', 'That team is not in this game.');
        const parsed = displayNameSchema.safeParse(cmd.name);
        if (!parsed.success) return fail('validation_failed', parsed.error.issues[0]?.message.replace('Names', 'Team names') ?? 'Pick a different name.');
        if (this.teams.some((t) => t.id !== team.id && t.name.toLowerCase() === parsed.data.toLowerCase())) return fail('validation_failed', 'Another team already has that name.');
        this.teams = this.teams.map((t) => (t.id === team.id ? { ...t, name: parsed.data } : t));
        this.scheduleBroadcast();
        return { ok: true };
      }
      case 'renamePlayer': {
        if (this.status !== 'lobby') return fail('invalid_state', 'Rename players before the game starts.');
        const p = this.players.get(cmd.playerId);
        if (!p) return fail('not_found', 'That player is not in the room.');
        const parsed = displayNameSchema.safeParse(cmd.name);
        if (!parsed.success) return fail('validation_failed', parsed.error.issues[0]?.message ?? 'Pick a different name.');
        if (parsed.data.toLowerCase() === p.name.toLowerCase()) return { ok: true };
        const old = p.name;
        p.name = this.uniqueName(parsed.data);
        const r = this.roster.get(p.id);
        if (r) this.roster.set(p.id, { ...r, name: p.name });
        this.pushFeed(`The host renamed ${old} to ${p.name}.`, 'info');
        return { ok: true };
      }
      case 'nudge': {
        const p = this.players.get(cmd.playerId);
        if (!p || p.isBot) return fail('not_found', 'That player is not in the room.');
        if (!this.runtime?.waitingOn()?.includes(p.id)) return fail('invalid_state', `${p.name} is not on an open question right now.`);
        const now = this.hooks.now();
        if (now - (this.nudgedAt.get(p.id) ?? -Infinity) < NUDGE_GAP_MS) return fail('rate_limited', `You nudged ${p.name} a moment ago.`);
        this.nudgedAt.set(p.id, now);
        for (const sub of this.subscribers.values()) if (sub.playerId === p.id) sub.emit(S2C.nudge, { at: now });
        this.scheduleBroadcast();
        return { ok: true };
      }
      case 'extraTime': {
        const p = this.players.get(cmd.playerId);
        if (!p || p.isBot) return fail('not_found', 'That player is not in the room.');
        const kind = this.extraTimeKind();
        if (cmd.share > 0 && kind.kind === 'none') return fail('invalid_state', `Extra time does not apply in ${this.variant?.meta.title ?? this.mode.meta.title}: its only clock is the game's, shared by everyone.`);
        // Quietly: no news line, nothing on anyone else's screen. It applies from the next question.
        if (cmd.share > 0) this.extraTime.set(p.id, cmd.share);
        else this.extraTime.delete(p.id);
        this.runtime?.setExtraTime(p.id, cmd.share);
        this.scheduleBroadcast();
        return { ok: true };
      }
      case 'addTime': {
        if (!this.runtime || this.mode.meta.pacing !== 'host') return fail('invalid_state', 'Add time works in host-paced games, while a question is open.');
        const r = this.runtime.addTime(cmd.seconds * 1000);
        if (!r.ok) return fail(r.code, r.message);
        this.pushFeed(`The host added ${cmd.seconds} seconds.`, 'info');
        return { ok: true };
      }
      case 'break': {
        if (this.status !== 'running' && this.status !== 'paused') return fail('invalid_state', 'Start a brain break while a game is on.');
        if (this.status === 'running') {
          if (!this.runtime?.pause()) return fail('invalid_state', 'The game is not running.');
          this.status = 'paused';
          this.stopBots();
          this.breakPausedGame = true;
        }
        if (this.breakTimer) clearTimeout(this.breakTimer);
        this.breakEndsAt = this.hooks.now() + cmd.seconds * 1000;
        this.breakTimer = setTimeout(() => this.endBreak(), cmd.seconds * 1000);
        this.scheduleBroadcast();
        return { ok: true };
      }
      case 'endBreak':
        if (this.breakEndsAt === null) return fail('invalid_state', 'There is no brain break on.');
        this.endBreak();
        return { ok: true };
      case 'pin': {
        if (cmd.text === null || !cleanText(cmd.text)) {
          this.pinned = null;
          this.scheduleBroadcast();
          return { ok: true };
        }
        const text = cleanText(cmd.text);
        if (text.length > 120) return fail('validation_failed', 'Keep the message to 120 characters.');
        if (containsBlockedLanguage(text)) return fail('validation_failed', 'That message has a word players cannot see. Try different words.');
        this.pinned = text;
        this.scheduleBroadcast();
        return { ok: true };
      }
      case 'admit':
        return this.admit(cmd.playerId, cmd.allow);
      case 'preview':
        // Prompts only: the host's screen is often on the projector, so answers stay out of it.
        return { ok: true, questions: this.prepared.map((q) => ({ id: q.id, type: q.type, prompt: q.prompt })), plays: this.common.questionLimit ? Math.min(this.common.questionLimit, this.prepared.length) : this.prepared.length } as Ack;
      case 'setTeam': {
        if (this.status !== 'lobby') return fail('invalid_state', 'Teams are fixed once the game starts.');
        const p = this.players.get(cmd.playerId);
        if (!p || !this.teams.some((t) => t.id === cmd.teamId)) return fail('not_found', 'No such player or team.');
        p.teamId = cmd.teamId;
        this.scheduleBroadcast();
        return { ok: true };
      }
      case 'configure': {
        if (this.status === 'running' || this.status === 'paused') {
          // During a game only the room's live switches change (quiet room, reactions, names on the big screen, who can join).
          const keys = Object.keys(cmd.options ?? {});
          if (cmd.settings || cmd.common || !keys.length || keys.some((k) => !(LIVE_OPTIONS as readonly string[]).includes(k))) return fail('invalid_state', 'Change settings between games.');
          this.options = { ...this.options, ...(cmd.options as Partial<RoomOptions>) };
          this.scheduleBroadcast();
          return { ok: true };
        }
        if (this.status !== 'lobby' && this.status !== 'ended') return fail('invalid_state', 'Change settings between games.');
        const problem = this.configure(this.mode.meta.id, this.variant?.meta.id ?? null, { ...this.settings, ...cmd.settings }, { ...this.common, ...cmd.common });
        if (problem) return fail('validation_failed', problem);
        if (cmd.options) {
          const { solo: _ignored, ...rest } = cmd.options as Record<string, unknown>;
          this.options = { ...this.options, ...(rest as Partial<RoomOptions>) };
          if ('autoStartAt' in rest) this.autoStartSpent = false;
        }
        this.scheduleBroadcast();
        this.checkAutoStart();
        return { ok: true };
      }
    }
  }

  /**
   * Lessons: move the room on to the lesson's next step. Everyone stays in the room. A game brings its
   * set, mode and settings and the room goes back to the lobby for the host to start it; a step that is
   * not a game (the lesson shows it) also leaves the room in the lobby, so late arrivals can still join.
   */
  goToLessonStep(game: { set: Room['set']; modeId: string; variantId: string | null; settings: Record<string, unknown>; common: Partial<CommonSettings> } | null): Ack {
    if (this.closed) return fail('room_closed', 'This room has closed.');
    if (this.status === 'running' || this.status === 'paused') return fail('invalid_state', 'Finish this game first.');
    if (game) {
      const before = this.set;
      this.set = game.set;
      const problem = this.configure(game.modeId, game.variantId, game.settings, game.common);
      if (problem) {
        this.set = before;
        return fail('validation_failed', problem);
      }
    }
    this.clearRoomTimers();
    this.ready.clear();
    this.feelings.clear();
    this.nudgedAt.clear();
    this.runtime = null;
    this.results = null;
    this.rewards.clear();
    this.endedAt = null;
    this.feed = [];
    this.status = 'lobby';
    this.touch();
    this.scheduleBroadcast();
    return { ok: true };
  }

  private start(restart = false): Ack {
    if (this.status !== 'lobby' && !(restart && this.status === 'ended')) return fail('invalid_state', 'The game has already started.');
    if (this.lesson?.onScreen()) return fail('invalid_state', 'This step of the lesson is not a game. Press Next to move on.');
    const active = [...this.players.values()].filter((p) => p.isBot || p.connected);
    const problem = this.startProblem();
    if (problem) return fail('invalid_state', problem);
    this.clearCountdown();
    this.clearBreak();
    this.ready.clear();
    this.flushFeelings();
    this.feelings.clear();
    this.nudgedAt.clear();
    this.clearTimers();
    this.results = null;
    this.rewards.clear();
    this.rewardsPending = false;
    this.endedAt = null;
    this.gameId = crypto.randomUUID();
    const runtime = new GameRuntime({
      mode: this.mode,
      settings: this.settings,
      common: this.common,
      questions: this.prepared,
      players: active.map((p) => ({ id: p.id, name: p.name, teamId: p.teamId, isBot: p.isBot, connected: p.connected, ...this.extraOf(p.id) })),
      teams: this.teams.map((t) => ({ id: t.id, name: t.name, hue: t.hue })),
      seed: hashString(`${this.code}:${this.gameId}`),
      clock: { now: () => this.hooks.now() },
      chaos: this.chaosAllowed(),
      listener: {
        changed: () => this.scheduleBroadcast(),
        pulsed: () => this.schedulePulse(),
        feed: (item) => this.pushFeedItem(item),
        timersChanged: () => this.armTimer(),
        error: (err, where) => this.hooks.onError(err, `mode:${this.mode.meta.id}:${where}`, this),
        ended: (results) => this.onEnded(results),
      },
    });
    this.runtime = runtime;
    this.status = 'running';
    this.feed = [];
    const r = runtime.start();
    if (!r.ok && runtime.status !== 'ended') return fail(r.code, r.message);
    if (runtime.status === 'running') this.startBots();
    this.armTimer();
    this.scheduleBroadcast();
    return { ok: true };
  }

  private onEnded(results: EngineResults) {
    this.status = 'ended';
    this.endedAt = this.hooks.now();
    this.results = results;
    this.gamesPlayed++;
    this.clearTimers();
    this.rewardsPending = true;
    this.scheduleBroadcast();
    this.persisting = this.hooks
      .persist(this, results)
      .then((outcome) => {
        if (outcome) {
          this.rewards = outcome.rewards;
          this.gameId = outcome.gameId;
        }
      })
      .catch((err) => this.hooks.onError(err, 'persist', this))
      .finally(() => {
        this.rewardsPending = false;
        // Lessons: the game's points join the lesson's standings (once its id is known).
        if (this.lesson) this.lesson.gameEnded(this, results);
        this.scheduleBroadcast();
      });
  }

  /* ---------------------------------- actions --------------------------------- */

  action(playerId: string, actionId: string, action: unknown): Ack {
    const p = this.players.get(playerId);
    if (!p) return fail('forbidden', 'You are not in this room.');
    const seen = p.recent.get(actionId);
    if (seen) return seen;
    if (!this.runtime || this.status === 'lobby') return fail('invalid_state', 'The game has not started yet.');
    const r = this.runtime.act(playerId, action);
    const ack: Ack = r.ok ? { ok: true } : fail(r.code === 'rejected' ? 'invalid_state' : r.code, r.message);
    p.recent.set(actionId, ack);
    if (p.recent.size > MAX_RECENT_ACTIONS) p.recent.delete(p.recent.keys().next().value!);
    this.touch();
    return ack;
  }

  /**
   * Chaos runs in every live game, for the accounts that have unlocked it, and never in homework.
   * There is no room option for it (the owner's decision, 12 November 2026): the host's control is
   * "Calm the room", which ends every effect and stops casting for the rest of that game.
   */
  chaosAllowed(): boolean {
    return !this.assignmentId;
  }

  /** Record (from the database) whether an account has unlocked chaos, for every slot it holds here. */
  setChaosUnlocked(userId: string, unlocked: boolean) {
    let changed = false;
    for (const p of this.players.values()) {
      if (p.userId !== userId || p.chaos === unlocked) continue;
      p.chaos = unlocked;
      changed = true;
    }
    if (changed) this.scheduleBroadcast();
  }

  /**
   * A chaos request from a player. The caller has already checked the
   * account's unlock against the database; this checks the slot as well and
   * deduplicates by action id like any other move.
   */
  chaos(playerId: string, req: ChaosRequest): Ack<{ text?: string; castId?: string; combo?: string | null }> {
    const p = this.players.get(playerId);
    if (!p) return fail('forbidden', 'You are not in this room.');
    if (!p.chaos) return fail('forbidden', 'Nothing happens.');
    const seen = p.recent.get(req.actionId);
    if (seen) return seen;
    let ack: Ack<{ text?: string; castId?: string; combo?: string | null }>;
    if (!this.runtime || this.status === 'lobby') ack = fail('invalid_state', 'Chaos only works once the game has started.');
    else if (!this.runtime.chaosEnabled) ack = fail('invalid_state', 'Chaos is switched off in this game.');
    else if (req.op === 'cast') {
      const r = this.runtime.cast(playerId, req.casts.map((c) => ({ cheatId: c.cheatId, target: c.target ?? null, ...(c.params ? { params: c.params } : {}) })));
      ack = r.ok ? { ok: true, text: r.text, castId: r.castId, combo: r.combo } : fail(r.code === 'rejected' ? 'invalid_state' : r.code, r.message);
    } else {
      const r = req.op === 'undo' ? this.runtime.undoCast(playerId, req.castId) : this.runtime.stopEffect(playerId, req.eid);
      ack = r.ok ? { ok: true } : fail(r.code === 'rejected' ? 'invalid_state' : r.code, r.message);
    }
    p.recent.set(req.actionId, ack);
    if (p.recent.size > MAX_RECENT_ACTIONS) p.recent.delete(p.recent.keys().next().value!);
    this.touch();
    return ack;
  }

  react(playerId: string | null, emote: string, from: 'host' | 'player'): Ack<{ name: string }> {
    // "hop": lobby play, a player tapping their Glim to make it hop on the big screen. Same path and limit as reactions.
    const hop = emote === 'hop';
    if (!hop && !ALLOWED_REACTIONS.includes(emote)) return fail('bad_request', 'Unknown reaction.');
    if (hop && (from !== 'player' || this.status !== 'lobby')) return fail('invalid_state', 'Hops are for the lobby.');
    if (!this.options.reactions && from === 'player') return fail('forbidden', 'The host has turned reactions off.');
    const now = this.hooks.now();
    let name = this.hostName;
    if (from === 'player') {
      const p = playerId ? this.players.get(playerId) : null;
      if (!p) return fail('forbidden', 'You are not in this room.');
      // Bought reactions are for the accounts that own them, whatever a device sends.
      if (!hop && !(p.canReact ?? FREE_SET).has(emote)) return fail('forbidden', 'That reaction is not one of yours.');
      if (now - p.lastReactionAt < REACTION_GAP_MS) return fail('rate_limited', 'Slow down a little.');
      p.lastReactionAt = now;
      name = p.name;
    }
    // Names hidden on the big screen: the projector's reaction shows "Player 3" too.
    const alias = this.options.hideNames && from === 'player' ? (this.nameAliases().get(name) ?? name) : name;
    for (const sub of this.subscribers.values()) sub.emit('room:reaction', { playerId, name: sub.role === 'host' && !sub.remote ? alias : name, emote, at: now });
    return { ok: true, name };
  }

  private clearBreak() {
    if (this.breakTimer) clearTimeout(this.breakTimer);
    this.breakTimer = null;
    this.breakEndsAt = null;
    this.breakPausedGame = false;
  }

  /** The brain break is over: a game the break paused carries on, unless the host has gone. */
  private endBreak() {
    const resume = this.breakPausedGame;
    this.clearBreak();
    if (resume && this.status === 'paused') {
      if (!this.hasHostConnected() && this.mode.meta.pacing === 'host' && !this.solo) this.pausedForHost = true;
      else if (this.runtime?.resume()) {
        this.status = 'running';
        this.startBots();
      }
    }
    this.scheduleBroadcast();
  }

  /* ---------------------------------- timers ---------------------------------- */

  private armTimer() {
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
    const ms = this.runtime?.msUntilNextTimer();
    if (ms === null || ms === undefined) return;
    this.timer = setTimeout(() => {
      this.timer = null;
      try {
        this.runtime?.fireDueTimers();
      } catch (err) {
        this.hooks.onError(err, 'timers', this);
      }
      this.armTimer();
    }, ms + 5);
  }

  private startBots() {
    for (const p of this.players.values()) if (p.isBot) this.scheduleBot(p);
  }

  private stopBots() {
    for (const t of this.botTimers.values()) clearTimeout(t);
    this.botTimers.clear();
  }

  private clearBot(id: string) {
    const t = this.botTimers.get(id);
    if (t) clearTimeout(t);
    this.botTimers.delete(id);
  }

  private scheduleBot(p: RoomPlayer) {
    if (!this.runtime || this.status !== 'running') return;
    this.clearBot(p.id);
    const delay = Math.round(this.runtime.botDelay(p.id, this.botRng) * (p.pace ?? 1));
    this.botTimers.set(
      p.id,
      setTimeout(() => {
        this.botTimers.delete(p.id);
        if (!this.runtime || this.status !== 'running' || !this.players.has(p.id)) return;
        const action = this.runtime.botAction(p.id, p.skill, this.botRng);
        if (action) this.runtime.act(p.id, action);
        this.scheduleBot(p);
      }, delay),
    );
  }

  private clearTimers() {
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
    this.stopBots();
  }

  /** Every timer the room keeps, for closing. */
  private clearRoomTimers() {
    this.clearTimers();
    this.clearCountdown();
    this.clearBreak();
  }

  /* ----------------------------------- views ---------------------------------- */

  private pushFeed(text: string, tone: FeedItem['tone']) {
    this.pushFeedItem({ id: 0, at: this.runtime?.gameNow() ?? 0, text, ...(tone ? { tone } : {}) });
  }

  private pushFeedItem(item: FeedItem) {
    this.feed.push({ ...item, id: ++this.feedSeq });
    if (this.feed.length > FEED_KEEP * 3) this.feed = this.feed.slice(-FEED_KEEP * 2);
    this.scheduleBroadcast();
  }

  scheduleBroadcast() {
    this.version++;
    if (this.broadcastTimer || this.closed) return;
    this.broadcastTimer = setTimeout(() => {
      this.broadcastTimer = null;
      for (const sub of this.subscribers.values()) this.sendView(sub);
    }, BROADCAST_MS);
  }

  /** Quiet moves changed the game: send everyone the mode's pulse, not full views. */
  schedulePulse() {
    if (this.pulseTimer || this.closed) return;
    this.pulseTimer = setTimeout(() => {
      this.pulseTimer = null;
      if (!this.runtime || this.closed) return;
      const d = this.runtime.pulse();
      if (d === null || d === undefined) return;
      const payload = { gameNow: this.runtime.gameNow(), d };
      for (const sub of this.subscribers.values()) sub.emit(S2C.pulse, payload);
    }, PULSE_MS);
  }

  private sendView(sub: RoomSubscriber) {
    try {
      // A spectator sees the big screen and nothing only the host sees (modules/school/spectator.ts).
      sub.emit('room:view', sub.role === 'spectator' ? spectatorView(this.view(null)) : this.view(sub.role === 'host' ? null : sub.playerId, sub.remote === true));
    } catch (err) {
      this.hooks.onError(err, 'view', this);
    }
  }

  /** The room as one viewer sees it. `playerId` null means the host; `remote` is the host's controls-only phone. */
  view(playerId: string | null, remote = false): RoomView {
    const viewer = playerId ? ({ kind: 'player', playerId } as const) : ({ kind: 'host' } as const);
    const me = playerId ? this.players.get(playerId) : null;
    const results = this.results ? this.resultsView(this.results, !playerId) : null;
    const game = this.runtime && this.runtime.status !== 'idle' ? this.runtime.view(viewer) : null;
    let chaos: ChaosRoomView | null = null;
    if (this.runtime?.chaosEnabled) {
      const v = this.runtime.chaosView(viewer, Boolean(me?.chaos)) as ChaosRoomView | null;
      // Players who have not found chaos see nothing of it until someone uses it in their game.
      if (v && (v.casts > 0 || me?.chaos)) chaos = v;
    }
    let rewards: RewardSummary | null = null;
    if (me && this.results) {
      rewards = this.rewards.get(me.id) ?? (this.rewardsPending ? { status: 'pending', sparks: 0, xp: 0, quests: [], achievements: [], notes: [] } : null);
    }
    const sync = game && typeof game === 'object' ? (game as { sync?: { phase?: string; round?: number; total?: number; doubleFinal?: boolean } }).sync : undefined;
    // Double points: the final question is open, or it is the next one (said between questions, before it starts).
    const last = (sync?.total ?? 0) - 1;
    const round = sync?.round ?? -1;
    const doubleNow = Boolean(sync?.doubleFinal && last >= 0 && (((sync.phase === 'question' || sync.phase === 'reveal') && round === last) || (sync.phase !== 'question' && sync.phase !== 'done' && round + 1 === last)));
    const view: RoomView = {
      version: this.version,
      serverNow: this.hooks.now(),
      gameNow: this.runtime?.gameNow() ?? 0,
      paused: this.status === 'paused',
      room: {
        code: this.code,
        status: this.status,
        modeId: this.mode.meta.id,
        pacing: this.mode.meta.pacing,
        variantId: this.variant?.meta.id ?? null,
        title: this.variant?.meta.title ?? this.mode.meta.title,
        setTitle: this.set.title,
        questionCount: this.prepared.length,
        hostName: this.hostName,
        locked: this.locked,
        solo: this.solo,
        options: this.options,
        common: this.common,
        settings: this.settings,
        teams: this.teams,
        hostConnected: this.hasHostConnected(),
        startsAt: this.startsAt,
        breakEndsAt: this.breakEndsAt,
        pinned: this.pinned,
        readyCount: this.ready.size,
        classTitle: this.classTitle,
        doubleNow,
      },
      me: me
        ? { playerId: me.id, role: 'player', name: me.name, teamId: me.teamId, reconnectToken: me.reconnectToken, ready: this.ready.has(me.id), feeling: this.feelings.get(me.id) ?? null, reactions: me.bar ?? [...FREE_REACTIONS], canReact: [...(me.canReact ?? FREE_SET)] }
        : { playerId: null, role: 'host', name: this.hostName, teamId: null, reconnectToken: null },
      players: [...this.players.values()].slice(0, 200).map((p) => ({
        id: p.id,
        name: p.name,
        teamId: p.teamId,
        connected: p.connected,
        isBot: p.isBot,
        isGuest: p.isGuest,
        avatar: p.avatar,
        ...(this.ready.has(p.id) ? { ready: true } : {}),
      })),
      game,
      results,
      rewards,
      feed: this.feed.filter((f) => !f.to || (playerId && f.to.includes(playerId))).slice(-FEED_KEEP),
      ...(chaos ? { chaos } : {}),
      ...(playerId ? {} : { host: this.hostExtras() }),
      ...(this.lesson ? { lesson: this.lesson.view(this, playerId, !playerId && !remote && this.options.hideNames ? this.nameAliases() : null) } : {}),
    };
    // Names hidden on the big screen: the projector shows "Player 3" for each person; the host's phone remote keeps real names.
    if (!playerId && !remote && this.options.hideNames) return hideNames(view, this.nameAliases());
    return view;
  }

  /** "Player 1", "Player 2" … in the order people joined; bots keep their names. */
  private nameAliases(): Map<string, string> {
    const map = new Map<string, string>();
    let n = 0;
    for (const r of this.roster.values()) if (!r.isBot && !map.has(r.name)) map.set(r.name, `Player ${++n}`);
    for (const p of this.players.values()) if (!p.isBot && !map.has(p.name)) map.set(p.name, `Player ${++n}`);
    return map;
  }

  private hostExtras(): HostExtras {
    const now = this.hooks.now();
    const waitingIds = this.status === 'running' || this.status === 'paused' ? this.runtime?.waitingOn() : null;
    const waiting = waitingIds
      ? waitingIds
          .map((id) => this.players.get(id))
          .filter((p): p is RoomPlayer => Boolean(p && !p.isBot))
          .map((p) => ({ id: p.id, name: p.name, nudged: now - (this.nudgedAt.get(p.id) ?? -Infinity) < NUDGE_GAP_MS * 2 }))
      : null;
    return {
      waiting,
      canAddTime: Boolean(waitingIds && this.status === 'running' && this.mode.meta.pacing === 'host' && this.runtime && 'addTime' in this.mode && this.mode.addTime),
      pending: [...this.pending.values()].map((e) => ({ id: e.id, name: e.name })),
      feelings: this.options.exitTicket ? this.feelingCounts() : null,
      extraTime: Object.fromEntries(this.extraTime),
      extraTimeKind: this.extraTimeKind(),
    };
  }

  /** What extra time does in this game: longer timed questions, a longer clock of their own, or nothing (one shared clock). */
  extraTimeKind(): { kind: 'rounds' | 'own' | 'none'; what: string } {
    return extraTimeFor(this.mode.meta.id, this.variant?.meta.id ?? null, this.settings);
  }

  /** The extra time to hand the game for a player, if they have any. */
  private extraOf(playerId: string): { extraTime?: number } {
    const e = this.extraTime.get(playerId);
    return e ? { extraTime: e } : {};
  }

  /** Exit ticket answers are saved with the game a moment after the last one, so a class's taps make one write. */
  private scheduleFeelingsSave() {
    if (!this.hooks.saveFeelings || this.feelingsTimer) return;
    this.feelingsTimer = setTimeout(() => this.flushFeelings(), 1500);
    this.feelingsTimer.unref?.();
  }

  /** Write the exit ticket counts now, onto the game they belong to (after that game's own save). */
  flushFeelings() {
    if (!this.feelingsTimer) return;
    clearTimeout(this.feelingsTimer);
    this.feelingsTimer = null;
    const gameId = this.gameId;
    const save = this.hooks.saveFeelings;
    if (!gameId || !save || !this.options.exitTicket) return;
    const counts = this.feelingCounts();
    void this.persisting
      .then(() => save(gameId, counts))
      .catch((err) => this.hooks.onError(err, 'feelings', this));
  }

  /** What the class said that is not an answer, for the saved game: exit ticket counts and each poll's votes in words. */
  voiceFor(results: EngineResults): { feelings: Record<Feeling, number> | null; polls: { questionId: string; prompt: string; choices: { id: string; text: string; votes: number }[] }[] } | null {
    const questions = new Map([...this.set.questions, ...this.prepared].map((q) => [q.id, q] as const));
    const polls = (results.polls ?? []).flatMap((p) => {
      const q = questions.get(p.qid);
      if (!q || q.type !== 'poll') return [];
      return [{ questionId: p.qid, prompt: q.prompt.slice(0, 300), choices: q.choices.map((c) => ({ id: c.id, text: c.text.slice(0, 120), votes: p.votes[c.id] ?? 0 })) }];
    });
    const feelings = this.options.exitTicket ? this.feelingCounts() : null;
    return feelings || polls.length ? { feelings, polls } : null;
  }

  private feelingCounts(): Record<Feeling, number> {
    const counts = Object.fromEntries(FEELINGS.map((f) => [f, 0])) as Record<Feeling, number>;
    for (const f of this.feelings.values()) counts[f]++;
    return counts;
  }

  /** The questions of the last game most players got wrong, hardest first, for "Play the missed questions again". */
  missedQuestions(limit = 10): Question[] {
    if (!this.results) return [];
    const byId = new Map([...this.set.questions, ...this.prepared].map((q) => [q.id, q] as const));
    const original = new Map(this.set.questions.map((q) => [q.id, q] as const));
    const bots = new Set([...this.roster].filter(([, r]) => r.isBot).map(([id]) => id));
    return missedQuestionIds(this.results.answers.filter((a) => !bots.has(a.playerId)), limit)
      .map((id) => original.get(id) ?? byId.get(id))
      .filter((q): q is Question => Boolean(q));
  }

  private resultsView(r: EngineResults, forHost: boolean): ResultsView {
    const bots = new Set(r.standings.filter((s) => s.isBot).map((s) => s.playerId));
    const humans = r.answers.filter((a) => !bots.has(a.playerId));
    const awards = computeAwards(r, bots);
    let report: ResultsView['report'];
    if (forHost) {
      const questions = new Map([...this.set.questions, ...this.prepared].map((q) => [q.id, q] as const));
      report = hostReport(humans, r.standings.filter((s) => !s.isBot), (id) => questions.get(id)?.prompt ?? 'A question', NEED_HELP_BELOW, this.options.exitTicket ? this.feelingCounts() : null);
    }
    return {
      gameId: this.gameId,
      ...(awards.length ? { awards } : {}),
      ...(report ? { report } : {}),
      standings: r.standings.map((s) => ({
        playerId: s.playerId,
        name: s.name,
        rank: s.rank,
        score: s.score,
        label: s.label,
        teamId: s.teamId,
        correct: s.stats.correct,
        answered: s.stats.answered,
      })),
      teamStandings: r.teamStandings,
      outcome: r.outcome,
      summary: r.summary,
      durationMs: r.durationMs,
      ...(r.chaos ? { chaos: true } : {}),
    };
  }

  /* --------------------------------- lifecycle -------------------------------- */

  private touch() {
    this.lastActivity = this.hooks.now();
  }

  /**
   * Who may show this game on a second screen (school: the hall or a spare display). The host's own
   * account and school staff always. Anyone else only where they could have joined and seen the
   * same names anyway: a member of the class in a class game, any account in an open room. A locked
   * room or one with a waiting room is closed to onlookers as it is to new players.
   */
  watchAllowed(userId: string, staff: boolean): boolean {
    if (this.solo) return false;
    if (userId === this.hostUserId || staff) return true;
    if (this.classMembers) return this.classMembers.has(userId);
    return !this.locked && !this.options.admit;
  }

  /** Housekeeping, called by the manager every few seconds. Returns false once the room should go. */
  sweep(): boolean {
    const now = this.hooks.now();
    if (this.closed) return false;
    // Removing the entry being visited is safe while walking a Map.
    for (const e of this.pending.values()) {
      if (now - e.at > PENDING_KEEP_MS) {
        this.pending.delete(e.id);
        e.declined('Nobody let you in, so the request lapsed. Try joining again.');
        this.scheduleBroadcast();
      }
    }
    if (this.status === 'lobby') {
      for (const p of [...this.players.values()]) {
        if (!p.isBot && !p.connected && p.disconnectedAt && now - p.disconnectedAt > LOBBY_DISCONNECT_DROP_MS) this.removePlayer(p, `${p.name} left.`);
      }
    }
    if ((this.status === 'running' || this.status === 'paused') && this.hostDisconnectedAt && !this.solo && now - this.hostDisconnectedAt > HOST_ABSENT_END_MS) {
      this.runtime?.end('host', 'The host did not come back, so the game ended.');
    }
    if (this.status === 'ended' && this.endedAt && now - this.endedAt > ENDED_CLOSE_MS && !this.rewardsPending) return false;
    if (now - this.lastActivity > IDLE_CLOSE_MS && this.status !== 'running') return false;
    if (this.solo && this.subscribers.size === 0 && now - this.lastActivity > 10 * 60_000) {
      if (this.status === 'running' || this.status === 'paused') this.runtime?.end('host', 'The game ended because the player left.');
      return this.status === 'ended' && !this.rewardsPending ? false : true;
    }
    return true;
  }

  /** Close the room, ending (and saving) any game in progress first. */
  close(reason: string) {
    if (this.closed) return;
    if (this.status === 'running' || this.status === 'paused') this.runtime?.end('host', reason);
    this.closed = true;
    this.status = 'closed';
    this.clearRoomTimers();
    for (const e of this.pending.values()) e.declined(reason);
    this.pending.clear();
    if (this.broadcastTimer) clearTimeout(this.broadcastTimer);
    if (this.pulseTimer) clearTimeout(this.pulseTimer);
    this.flushFeelings();
    for (const sub of this.subscribers.values()) sub.emit('room:closed', { reason: 'closed', message: reason });
    this.subscribers.clear();
    this.hooks.onClosed(this);
  }

  isClosed() {
    return this.closed;
  }

  playerByUser(userId: string): RoomPlayer | undefined {
    return [...this.players.values()].find((p) => p.userId === userId);
  }

  summary() {
    return {
      code: this.code,
      status: this.status,
      modeId: this.mode.meta.id,
      variantId: this.variant?.meta.id ?? null,
      title: this.variant?.meta.title ?? this.mode.meta.title,
      setTitle: this.set.title,
      hostUserId: this.hostUserId,
      hostName: this.hostName,
      players: [...this.players.values()].filter((p) => !p.isBot).length,
      bots: [...this.players.values()].filter((p) => p.isBot).length,
      connected: [...this.players.values()].filter((p) => p.connected && !p.isBot).length,
      solo: this.solo,
      locked: this.locked,
      createdAt: new Date(this.createdAt).toISOString(),
      lastActivity: new Date(this.lastActivity).toISOString(),
      gamesPlayed: this.gamesPlayed,
      errors: this.runtime?.errorCount ?? 0,
    };
  }
}

