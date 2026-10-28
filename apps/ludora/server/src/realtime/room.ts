import {
  createRng,
  displayNameSchema,
  generateName,
  hashString,
  S2C,
  type AvatarLite,
  type ChaosRequest,
  type ChaosRoomView,
  type CommonSettings,
  type FeedItem,
  type HostCommand,
  type Question,
  type ResultsView,
  type RewardSummary,
  type RoomOptions,
  type RoomStatus,
  type RoomView,
  type SettingValues,
  type TeamView,
} from '@ludora/shared';
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
  role: 'host' | 'player';
  playerId: string | null;
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
  /** The account behind this slot has unlocked chaos. Set by the server from the database, never by the client. */
  chaos: boolean;
}

export interface PersistOutcome {
  gameId: string;
  rewards: Map<string, RewardSummary>;
}

export interface RoomHooks {
  now(): number;
  persist(room: Room, results: EngineResults): Promise<PersistOutcome | null>;
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
}

const MAX_RECENT_ACTIONS = 100;
const BROADCAST_MS = 40;
/** Pulses (positions after quiet moves) go out at most ten times a second. */
const PULSE_MS = 100;
const LOBBY_DISCONNECT_DROP_MS = 2 * 60_000;
const HOST_ABSENT_END_MS = 10 * 60_000;
const IDLE_CLOSE_MS = 45 * 60_000;
const ENDED_CLOSE_MS = 20 * 60_000;
const REACTION_GAP_MS = 1500;
const FEED_KEEP = 12;
export const ALLOWED_REACTIONS = ['wave', 'laugh', 'wow', 'gg', 'heart', 'fire', 'think', 'clap', 'party', 'cool', 'sleepy', 'star'];

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
  readonly createdAt: number;
  mode!: GameMode;
  variant: ModeVariant | null = null;
  settings: SettingValues = {};
  common!: CommonSettings;
  options: RoomOptions;
  locked = false;
  readonly set: { id: string | null; title: string; questions: Question[] };
  prepared: Question[] = [];
  skippedCount = 0;
  status: RoomStatus = 'lobby';
  readonly players = new Map<string, RoomPlayer>();
  /** Everyone who has ever been in the room, kept after they leave so results can credit them. */
  readonly roster = new Map<string, { userId: string | null; name: string; isGuest: boolean; isBot: boolean }>();
  teams: TeamView[] = [];
  runtime: GameRuntime | null = null;
  gameId: string | null = null;
  results: EngineResults | null = null;
  rewards = new Map<string, RewardSummary>();
  rewardsPending = false;
  lastActivity: number;
  endedAt: number | null = null;
  hostDisconnectedAt: number | null = null;
  gamesPlayed = 0;

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
    this.options = init.options;
    this.set = init.set;
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
    this.teams = makeTeams(count).map((t) => ({ id: t.id, name: t.name, hue: t.hue }));
    const players = [...this.players.values()];
    players.forEach((p, i) => (p.teamId = count ? this.teams[i % count]!.id : null));
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
    if (sub.role === 'host') this.hostDisconnectedAt = null;
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
  join(input: { name?: string | undefined; reconnectToken?: string | undefined; userId: string | null; accountName: string | null; isGuestAccount: boolean; avatar: AvatarLite | null }): Ack<{ player: RoomPlayer; resumed: boolean }> {
    if (this.closed || this.status === 'closed') return fail('room_closed', 'This room has closed.');
    if (input.reconnectToken) {
      if (this.kickedTokens.has(input.reconnectToken)) return fail('forbidden', 'The host removed you from this room.');
      const existing = [...this.players.values()].find((p) => p.reconnectToken === input.reconnectToken);
      if (existing) {
        existing.connected = true;
        existing.disconnectedAt = null;
        if (this.runtime && !this.runtime.hasPlayer(existing.id) && this.status !== 'ended') {
          this.runtime.addPlayer({ id: existing.id, name: existing.name, teamId: existing.teamId, isBot: false });
        }
        this.runtime?.setConnected(existing.id, true);
        this.touch();
        this.scheduleBroadcast();
        return { ok: true, player: existing, resumed: true };
      }
    }
    if (input.userId && this.kickedUsers.has(input.userId)) return fail('forbidden', 'The host removed you from this room.');
    // A signed-in player who is already in the room (another tab or device) takes over their own slot.
    if (input.userId) {
      const same = [...this.players.values()].find((p) => p.userId === input.userId);
      if (same) {
        same.connected = true;
        same.disconnectedAt = null;
        this.runtime?.setConnected(same.id, true);
        this.scheduleBroadcast();
        return { ok: true, player: same, resumed: true };
      }
    }
    if (this.solo && input.userId !== this.hostUserId) return fail('room_locked', 'This is a solo game.');
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
    const player: RoomPlayer = {
      id: `p${++this.playerSeq}`,
      userId: input.userId,
      name,
      isGuest: !input.userId || input.isGuestAccount,
      isBot: false,
      teamId: this.smallestTeam(),
      connected: true,
      reconnectToken: crypto.randomUUID().replace(/-/g, ''),
      avatar: input.avatar ?? defaultAvatar(name),
      disconnectedAt: null,
      recent: new Map(),
      lastReactionAt: 0,
      skill: 0,
      chaos: false,
    };
    this.players.set(player.id, player);
    this.roster.set(player.id, { userId: player.userId, name: player.name, isGuest: player.isGuest, isBot: false });
    if (this.runtime) {
      const r = this.runtime.addPlayer({ id: player.id, name: player.name, teamId: player.teamId, isBot: false });
      if (!r.ok) this.hooks.onError(new Error(r.message), 'late-join', this);
    }
    if (!this.solo) this.pushFeed(`${name} joined.`, 'info');
    this.touch();
    this.scheduleBroadcast();
    return { ok: true, player, resumed: false };
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
        return this.start();
      case 'pause':
        if (this.status !== 'running' || !this.runtime?.pause()) return fail('invalid_state', 'The game is not running.');
        this.status = 'paused';
        this.stopBots();
        this.scheduleBroadcast();
        return { ok: true };
      case 'resume':
        if (this.status !== 'paused' || !this.runtime?.resume()) return fail('invalid_state', 'The game is not paused.');
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
          const name = this.uniqueName(`Bot ${generateName(() => this.botRng.next()).split(' ')[1]}`);
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
      case 'setTeam': {
        if (this.status !== 'lobby') return fail('invalid_state', 'Teams are fixed once the game starts.');
        const p = this.players.get(cmd.playerId);
        if (!p || !this.teams.some((t) => t.id === cmd.teamId)) return fail('not_found', 'No such player or team.');
        p.teamId = cmd.teamId;
        this.scheduleBroadcast();
        return { ok: true };
      }
      case 'configure': {
        if (this.status !== 'lobby' && this.status !== 'ended') return fail('invalid_state', 'Change settings between games.');
        const problem = this.configure(this.mode.meta.id, this.variant?.meta.id ?? null, { ...this.settings, ...cmd.settings }, { ...this.common, ...cmd.common });
        if (problem) return fail('validation_failed', problem);
        if (cmd.options) {
          const { solo: _ignored, ...rest } = cmd.options as Record<string, unknown>;
          this.options = { ...this.options, ...(rest as Partial<RoomOptions>) };
        }
        this.scheduleBroadcast();
        return { ok: true };
      }
    }
  }

  private start(restart = false): Ack {
    if (this.status !== 'lobby' && !(restart && this.status === 'ended')) return fail('invalid_state', 'The game has already started.');
    const active = [...this.players.values()].filter((p) => p.isBot || p.connected);
    if (active.length < this.mode.meta.players.min) {
      return fail('invalid_state', `${this.mode.meta.title} needs at least ${this.mode.meta.players.min} player${this.mode.meta.players.min === 1 ? '' : 's'}.`);
    }
    if (active.length === 0) return fail('invalid_state', 'Wait for someone to join first.');
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
      players: active.map((p) => ({ id: p.id, name: p.name, teamId: p.teamId, isBot: p.isBot, connected: p.connected })),
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
    this.hooks
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

  /** Chaos runs in this room's games unless the host switched it off or the game is homework. */
  chaosAllowed(): boolean {
    return this.options.chaos !== false && !this.assignmentId;
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
    if (!ALLOWED_REACTIONS.includes(emote)) return fail('bad_request', 'Unknown reaction.');
    const now = this.hooks.now();
    let name = this.hostName;
    if (from === 'player') {
      const p = playerId ? this.players.get(playerId) : null;
      if (!p) return fail('forbidden', 'You are not in this room.');
      if (now - p.lastReactionAt < REACTION_GAP_MS) return fail('rate_limited', 'Slow down a little.');
      p.lastReactionAt = now;
      name = p.name;
    }
    for (const sub of this.subscribers.values()) sub.emit('room:reaction', { playerId, name, emote, at: now });
    return { ok: true, name };
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
    const delay = this.runtime.botDelay(p.id, this.botRng);
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
      sub.emit('room:view', this.view(sub.role === 'host' ? null : sub.playerId));
    } catch (err) {
      this.hooks.onError(err, 'view', this);
    }
  }

  /** The room as one viewer sees it. `playerId` null means the host. */
  view(playerId: string | null): RoomView {
    const viewer = playerId ? ({ kind: 'player', playerId } as const) : ({ kind: 'host' } as const);
    const me = playerId ? this.players.get(playerId) : null;
    const results = this.results ? this.resultsView(this.results) : null;
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
    return {
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
      },
      me: me
        ? { playerId: me.id, role: 'player', name: me.name, teamId: me.teamId, reconnectToken: me.reconnectToken }
        : { playerId: null, role: 'host', name: this.hostName, teamId: null, reconnectToken: null },
      players: [...this.players.values()].slice(0, 200).map((p) => ({
        id: p.id,
        name: p.name,
        teamId: p.teamId,
        connected: p.connected,
        isBot: p.isBot,
        isGuest: p.isGuest,
        avatar: p.avatar,
      })),
      game,
      results,
      rewards,
      feed: this.feed.filter((f) => !f.to || (playerId && f.to.includes(playerId))).slice(-FEED_KEEP),
      ...(chaos ? { chaos } : {}),
    };
  }

  private resultsView(r: EngineResults): ResultsView {
    return {
      gameId: this.gameId,
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

  /** Housekeeping, called by the manager every few seconds. Returns false once the room should go. */
  sweep(): boolean {
    const now = this.hooks.now();
    if (this.closed) return false;
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
    this.clearTimers();
    if (this.broadcastTimer) clearTimeout(this.broadcastTimer);
    if (this.pulseTimer) clearTimeout(this.pulseTimer);
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

