import { createRng, type Rng, type SettingValues } from '@ludora/shared';
import type { EnginePlayer, EngineTeam, ModeContext, PlayerId, Viewer } from '../sdk/types.ts';
import { cheatAvailability, comboFor, getCheat, isHostile } from './registry.ts';
import type {
  ActiveEffect,
  CastInput,
  CastOutcome,
  CastRecord,
  CastRequest,
  CasterState,
  ChaosAdapter,
  ChaosApi,
  ChaosOverlay,
  ChaosState,
  ChaosView,
  CheatDef,
  EndReason,
  MeterChange,
  MeterDef,
  ParamValues,
} from './types.ts';

/*
 * Runs the chaos layer for one game. Holds no game state itself: the runtime
 * owns a ChaosState and hands this class a draft of it inside each
 * transaction, so a cast that fails halfway leaves nothing behind.
 */

export const MAX_ENERGY = 100;
export const ENERGY_PER_SEC = 4;
export const UNDO_WINDOW_MS = 20_000;
/** At most this many harmful effects can sit on one player at once. */
export const PILE_ON_LIMIT = 4;
export const MAX_CHEATS_PER_CAST = 5;
const LOG_KEEP = 60;
const CASTS_KEEP = 40;

export interface ChaosEnv {
  players(): readonly EnginePlayer[];
  teams(): readonly EngineTeam[];
  name(id: PlayerId): string;
}

export function emptyChaosState(seed: number): ChaosState & { rng: number } {
  return { effects: [], casters: {}, casts: [], log: [], calmed: false, seq: 0, totalCasts: 0, usedBy: [], acted: 0, rng: seed >>> 0 };
}

type Draft = ChaosState & { rng: number };

export function capabilitiesOf(adapter: ChaosAdapter, teams: readonly EngineTeam[], settings: SettingValues = {}): string[] {
  const caps = [`mode:${adapter.modeId}`, ...adapter.meters.map((m) => `meter:${m.key}`)];
  if (adapter.sync) caps.push('sync');
  if (adapter.stream) caps.push('stream');
  if (adapter.question) caps.push('question');
  if (adapter.isOut) caps.push('out');
  if (adapter.revive) caps.push('revive');
  if (teams.length) caps.push('teams');
  const features = typeof adapter.features === 'function' ? adapter.features(settings) : (adapter.features ?? []);
  for (const f of features) caps.push(f);
  return caps;
}

function clampParam(def: CheatDef, raw: Record<string, unknown> | undefined, env: ChaosEnv, caster: PlayerId): ParamValues | { error: string } {
  const out: ParamValues = {};
  for (const f of def.params ?? []) {
    const v = raw?.[f.key];
    if (f.kind === 'int') {
      const n = v === undefined ? f.default : Number(v);
      if (!Number.isInteger(n) || n < f.min || n > f.max) return { error: `${f.label} must be a whole number from ${f.min} to ${f.max}.` };
      out[f.key] = n;
    } else if (f.kind === 'choice') {
      const s = v === undefined ? f.default : String(v);
      if (!f.options.some((o) => o.value === s)) return { error: `${f.label}: pick one of the options.` };
      out[f.key] = s;
    } else {
      const id = typeof v === 'string' ? v : '';
      const p = env.players().find((x) => x.id === id);
      if (!p) return { error: `${f.label}: pick a player who is in the game.` };
      if (f.filter === 'other' && id === caster) return { error: `${f.label}: pick someone other than yourself.` };
      out[f.key] = id;
    }
  }
  return out;
}

export class ChaosEngine {
  readonly capabilities: string[];

  constructor(
    readonly adapter: ChaosAdapter,
    private readonly env: ChaosEnv,
    teams: readonly EngineTeam[],
    settings: SettingValues = {},
  ) {
    this.capabilities = capabilitiesOf(adapter, teams, settings);
  }

  /* ------------------------------- helpers ------------------------------- */

  energyOf(c: CasterState, now: number): number {
    return Math.min(MAX_ENERGY, c.energy + ((now - c.energyAt) / 1000) * ENERGY_PER_SEC);
  }

  casterState(cd: Draft, id: PlayerId, now: number): CasterState {
    return (cd.casters[id] ??= { energy: MAX_ENERGY, energyAt: now, cooldowns: {}, casts: 0 });
  }

  private log(cd: Draft, entry: ChaosState['log'][number]) {
    cd.log.push(entry);
    if (cd.log.length > LOG_KEEP) cd.log.splice(0, cd.log.length - LOG_KEEP);
  }

  /** Meters some active effect bends, so only those are snapshotted around a mode transaction. */
  private bentMeters(cd: Draft): string[] {
    const keys = new Set<string>();
    for (const fx of cd.effects) for (const k of Object.keys(getCheat(fx.cheatId)?.hooks?.delta ?? {})) keys.add(k);
    return [...keys].filter((k) => this.adapter.meters.some((m) => m.key === k));
  }

  private meterIds(m: MeterDef): string[] {
    if (m.scope === 'player') return this.env.players().map((p) => p.id);
    if (m.scope === 'team') return this.env.teams().map((t) => t.id);
    return ['game'];
  }

  hasHooks(cd: Draft): boolean {
    return cd.effects.length > 0;
  }

  /* --------------------------------- api --------------------------------- */

  api(s: any, ctx: ModeContext, cd: Draft, changes: MeterChange[] | null): ChaosApi {
    const adapter = this.adapter;
    const env = this.env;
    const meters = new Map(adapter.meters.map((m) => [m.key, m]));
    const rng: Rng = createRng(cd.rng);
    // Keep the chaos random stream inside the chaos state, so it rolls back with it.
    const sync = () => (cd.rng = rng.state());
    const wrapped: Rng = {
      next: () => {
        const v = rng.next();
        sync();
        return v;
      },
      int: (a, b) => {
        const v = rng.int(a, b);
        sync();
        return v;
      },
      pick: (items) => {
        const v = rng.pick(items);
        sync();
        return v;
      },
      shuffle: (items) => {
        const v = rng.shuffle(items);
        sync();
        return v;
      },
      chance: (p) => {
        const v = rng.chance(p);
        sync();
        return v;
      },
      state: () => rng.state(),
    };
    const ids = () => env.players().map((p) => p.id);
    const teamOf = (id: PlayerId) => env.players().find((p) => p.id === id)?.teamId ?? null;
    const set = (key: string, id: string, value: number): number => {
      const m = meters.get(key);
      if (!m || !Number.isFinite(value)) return 0;
      const cur = m.get(s, id, ctx);
      let v = m.integer === false ? value : Math.round(value);
      v = Math.max(typeof m.min === 'function' ? m.min(s, id, ctx) : (m.min ?? 0), v);
      if (m.max) v = Math.min(m.max(s, id, ctx), v);
      if (v === cur) return 0;
      m.set(s, id, v, ctx);
      const delta = m.get(s, id, ctx) - cur;
      if (changes && delta) changes.push({ meter: key, id, delta });
      return delta;
    };
    const get = (key: string, id: string) => {
      const m = meters.get(key);
      return m ? m.get(s, id, ctx) : 0;
    };
    const ranked = (key = 'score') => {
      const list = ids();
      return list.map((id, i) => ({ id, i, v: get(key, id) })).sort((a, b) => b.v - a.v || a.i - b.i).map((x) => x.id);
    };
    const api: ChaosApi = {
      s,
      ctx,
      rng: wrapped,
      adapter,
      now: () => ctx.now(),
      has: (c) => this.capabilities.includes(c),
      meter: (k) => meters.get(k) ?? null,
      get,
      set,
      add: (key, id, d) => set(key, id, get(key, id) + d),
      score: (id) => get('score', id),
      addScore: (id, d) => set('score', id, get('score', id) + d),
      setScore: (id, v) => set('score', id, v),
      players: () => env.players(),
      ids,
      others: (id) => ids().filter((x) => x !== id),
      opponents: (id) => {
        const t = teamOf(id);
        return ids().filter((x) => x !== id && (t === null || teamOf(x) !== t));
      },
      teammates: (id) => {
        const t = teamOf(id);
        return t === null ? [] : ids().filter((x) => x !== id && teamOf(x) === t);
      },
      teamOf,
      teams: () => env.teams(),
      members: (teamId) => env.players().filter((p) => p.teamId === teamId).map((p) => p.id),
      ranked,
      leader: (key) => ranked(key)[0] ?? null,
      last: (key) => ranked(key).at(-1) ?? null,
      name: (id) => env.name(id),
      feed: (text, tone, to) => ctx.feed(text, { ...(tone ? { tone } : {}), ...(to ? { to } : {}) }),
      effects: () => cd.effects,
      effectsOn: (id) => cd.effects.filter((e) => e.targets.includes(id)),
      hasTag: (id, tag) => cd.effects.some((e) => e.targets.includes(id) && (getCheat(e.cheatId)?.tags ?? []).includes(tag)),
      spawn: (cheatId, input) => {
        const def = getCheat(cheatId);
        if (!def) return { error: 'Unknown cheat.' };
        const why = cheatAvailability({ modes: def.modes ?? null, needs: def.needs ?? [] }, adapter.modeId, this.capabilities);
        if (why) return { error: why };
        const fx = this.startEffect(cd, def, input, `spawn${cd.seq + 1}`, ctx.now());
        const r = def.apply?.(api, input, fx);
        if (r && 'error' in r) {
          if (fx) cd.effects = cd.effects.filter((e) => e !== fx);
          return r;
        }
        return fx?.eid ?? 'instant';
      },
      endEffect: (eid, reason) => this.endEffect(api, cd, eid, reason),
      sync: () => adapter.sync?.(s) ?? null,
      stream: (id) => adapter.stream?.(s, id) ?? null,
      question: (id) => adapter.question?.(s, id, ctx) ?? null,
      isOut: (id) => adapter.isOut?.(s, id) ?? false,
      casterState: (id) => this.casterState(cd, id, ctx.now()),
      energy: (id) => this.energyOf(this.casterState(cd, id, ctx.now()), ctx.now()),
      setEnergy: (id, v) => {
        const c = this.casterState(cd, id, ctx.now());
        c.energy = Math.max(0, Math.min(MAX_ENERGY, v));
        c.energyAt = ctx.now();
      },
      log: () => cd.log,
    };
    return api;
  }

  /* ------------------------------- effects ------------------------------- */

  private startEffect(cd: Draft, def: CheatDef, input: CastInput, castId: string, now: number): ActiveEffect | null {
    if (def.durationMs === undefined) return null;
    const fx: ActiveEffect = {
      eid: `e${++cd.seq}`,
      cheatId: def.id,
      castId,
      caster: input.caster,
      targets: input.targets.slice(),
      team: input.team,
      startedAt: now,
      endsAt: now + def.durationMs,
      nextTickAt: def.tickMs ? now + def.tickMs : null,
      params: { ...input.params },
      data: {},
      hostile: isHostile(def),
    };
    cd.effects.push(fx);
    return fx;
  }

  endEffect(api: ChaosApi, cd: Draft, eid: string, reason: EndReason) {
    const i = cd.effects.findIndex((e) => e.eid === eid);
    if (i < 0) return;
    const [fx] = cd.effects.splice(i, 1);
    const def = getCheat(fx!.cheatId);
    def?.hooks?.end?.(api, fx!, reason);
    if (reason !== 'expired' && reason !== 'used') this.log(cd, { at: api.now(), kind: reason === 'stopped' ? 'stop' : 'end', text: `${def?.name ?? fx!.cheatId} ended (${reason}).`, caster: fx!.caster, cheatId: fx!.cheatId });
  }

  /* -------------------------------- gates -------------------------------- */

  /** Returns a refusal message if an active effect stops this action. */
  gate(s: any, ctx: ModeContext, cd: Draft, playerId: PlayerId, action: unknown): string | null {
    if (!cd.effects.length) return null;
    const api = this.api(s, ctx, cd, null);
    for (const fx of cd.effects.slice()) {
      const def = getCheat(fx.cheatId);
      if (!def?.hooks?.gate) continue;
      if (fx.targets.length && !fx.targets.includes(playerId)) continue;
      const r = def.hooks.gate(api, fx, playerId, action);
      if (r && 'block' in r) {
        cd.acted++;
        return r.block;
      }
    }
    return null;
  }

  /* -------------------------------- deltas ------------------------------- */

  snapshot(s: any, ctx: ModeContext, cd: Draft): Map<string, Map<string, number>> | null {
    const keys = this.bentMeters(cd);
    if (!keys.length) return null;
    const snap = new Map<string, Map<string, number>>();
    for (const k of keys) {
      const m = this.adapter.meters.find((x) => x.key === k)!;
      snap.set(k, new Map(this.meterIds(m).map((id) => [id, m.get(s, id, ctx)])));
    }
    return snap;
  }

  afterTransact(s: any, ctx: ModeContext, cd: Draft, before: Map<string, Map<string, number>>) {
    const api = this.api(s, ctx, cd, null);
    for (const [key, prev] of before) {
      const m = this.adapter.meters.find((x) => x.key === key)!;
      const raw: Record<string, number> = {};
      for (const [id, v] of prev) {
        const now = m.get(s, id, ctx);
        if (now !== v) raw[id] = now - v;
      }
      if (!Object.keys(raw).length) continue;
      const d: Record<string, number> = { ...raw };
      const hooked = cd.effects
        .map((fx) => ({ fx, def: getCheat(fx.cheatId) }))
        .filter((x) => x.def?.hooks?.delta?.[key])
        .sort((a, b) => (a.def!.priority ?? 20) - (b.def!.priority ?? 20) || a.fx.startedAt - b.fx.startedAt);
      for (const { fx, def } of hooked) {
        if (!cd.effects.includes(fx)) continue;
        def!.hooks!.delta![key]!(api, fx, d);
      }
      let acted = false;
      for (const id of new Set([...Object.keys(raw), ...Object.keys(d)])) {
        if (!prev.has(id)) continue;
        const want = prev.get(id)! + (d[id] ?? 0);
        if (want !== m.get(s, id, ctx) && api.set(key, id, want) !== 0) acted = true;
      }
      if (acted) cd.acted++;
    }
  }

  /* -------------------------------- timers ------------------------------- */

  nextDue(cd: Draft): number | null {
    let best: number | null = null;
    for (const fx of cd.effects) {
      const t = fx.nextTickAt !== null && fx.nextTickAt < fx.endsAt ? fx.nextTickAt : fx.endsAt;
      if (best === null || t < best) best = t;
    }
    return best;
  }

  fireDue(s: any, ctx: ModeContext, cd: Draft) {
    const now = ctx.now();
    const api = this.api(s, ctx, cd, null);
    for (const fx of cd.effects.slice().sort((a, b) => a.startedAt - b.startedAt)) {
      if (!cd.effects.includes(fx)) continue;
      const def = getCheat(fx.cheatId);
      if (fx.nextTickAt !== null && fx.nextTickAt <= now && fx.nextTickAt < fx.endsAt) {
        def?.hooks?.tick?.(api, fx);
        // Missed ticks are not replayed in a burst; the next one is a full interval away.
        fx.nextTickAt = Math.max(fx.nextTickAt + (def?.tickMs ?? 1000), now + 1);
      }
      if (cd.effects.includes(fx) && fx.endsAt <= now) this.endEffect(api, cd, fx.eid, 'expired');
    }
  }

  /** Drop due effects without running their hooks: used when a tick itself failed, so a broken effect cannot loop. */
  dropDue(cd: Draft, now: number) {
    const due = cd.effects.filter((fx) => fx.endsAt <= now || (fx.nextTickAt !== null && fx.nextTickAt <= now));
    cd.effects = cd.effects.filter((fx) => !due.includes(fx));
    for (const fx of due) this.log(cd, { at: now, kind: 'end', text: `${getCheat(fx.cheatId)?.name ?? fx.cheatId} was stopped because it failed.`, cheatId: fx.cheatId });
  }

  /* -------------------------------- casting ------------------------------ */

  private resolve(def: CheatDef, caster: PlayerId, raw: string | null | undefined): { targets: PlayerId[]; team: string | null } | { error: string } {
    const players = this.env.players();
    const me = players.find((p) => p.id === caster)!;
    const byId = (id: string | null | undefined) => (id ? players.find((p) => p.id === id) : undefined);
    switch (def.target) {
      case 'self':
        return { targets: [caster], team: null };
      case 'room':
        return { targets: [], team: null };
      case 'everyone':
        return { targets: players.map((p) => p.id), team: null };
      case 'everyone-else': {
        const t = players.filter((p) => p.id !== caster).map((p) => p.id);
        return t.length ? { targets: t, team: null } : { error: 'Nobody else is in this game.' };
      }
      case 'player': {
        const p = byId(raw);
        return p ? { targets: [p.id], team: null } : { error: 'Pick a player who is in the game.' };
      }
      case 'opponent': {
        const p = byId(raw);
        if (!p) return { error: 'Pick an opponent who is in the game.' };
        if (p.id === caster) return { error: 'Pick someone other than yourself.' };
        if (me.teamId && p.teamId === me.teamId) return { error: `${p.name} is on your team. Pick an opponent.` };
        return { targets: [p.id], team: null };
      }
      case 'teammate': {
        const p = byId(raw);
        if (!p || p.id === caster || !me.teamId || p.teamId !== me.teamId) return { error: 'Pick a teammate who is in the game.' };
        return { targets: [p.id], team: me.teamId };
      }
      case 'my-team': {
        if (!me.teamId) return { error: 'You are not on a team.' };
        return { targets: players.filter((p) => p.teamId === me.teamId).map((p) => p.id), team: me.teamId };
      }
      case 'enemy-team': {
        const team = this.env.teams().find((t) => t.id === raw);
        if (!team) return { error: 'Pick a team.' };
        if (team.id === me.teamId) return { error: 'That is your own team. Pick another.' };
        const members = players.filter((p) => p.teamId === team.id).map((p) => p.id);
        return members.length ? { targets: members, team: team.id } : { error: `${team.name} has nobody in the game.` };
      }
    }
  }

  /**
   * Cast one or more cheats together, all or nothing. Runs inside a runtime
   * transaction: `s` and `cd` are drafts that are thrown away if this
   * returns an error.
   */
  cast(s: any, ctx: ModeContext, cd: Draft, caster: PlayerId, requests: readonly CastRequest[]): CastOutcome {
    const now = ctx.now();
    if (cd.calmed) return { ok: false, code: 'invalid_state', message: 'The host calmed the room. No more chaos this game.' };
    if (!this.env.players().some((p) => p.id === caster)) return { ok: false, code: 'rejected', message: 'You are not in this game.' };
    if (!requests.length || requests.length > MAX_CHEATS_PER_CAST) return { ok: false, code: 'rejected', message: `Cast between 1 and ${MAX_CHEATS_PER_CAST} cheats at once.` };
    if (new Set(requests.map((r) => r.cheatId)).size !== requests.length) return { ok: false, code: 'rejected', message: 'Each cheat can only be in a combination once.' };
    const me = this.casterState(cd, caster, now);
    // Energy spent so far in this cast; a cheat may refill energy mid-cast, so it is read fresh each time.
    let spent = 0;
    const energyLeft = () => this.energyOf(me, now) - spent;
    const roomTags = new Set(cd.effects.filter((e) => e.targets.length === 0).flatMap((e) => getCheat(e.cheatId)?.tags ?? []));
    const myTags = new Set(cd.effects.filter((e) => e.targets.includes(caster)).flatMap((e) => getCheat(e.cheatId)?.tags ?? []));
    if (myTags.has('fortress')) return { ok: false, code: 'rejected', message: 'You cannot cast from inside your fortress.' };
    if (myTags.has('silenced')) return { ok: false, code: 'rejected', message: 'You have been silenced: no cheats for a little while.' };
    const castId = `c${++cd.seq}`;
    const changes: MeterChange[] = [];
    const api = this.api(s, ctx, cd, changes);
    const made: ActiveEffect[] = [];
    const hit = new Set<PlayerId>();
    const lines: string[] = [];
    let undoable = true;

    for (const req of requests) {
      const def = getCheat(req.cheatId);
      if (!def) return { ok: false, code: 'rejected', message: 'That cheat does not exist.' };
      const why = cheatAvailability({ modes: def.modes ?? null, needs: def.needs ?? [] }, this.adapter.modeId, this.capabilities);
      if (why) return { ok: false, code: 'rejected', message: `${def.name} does not work here: ${why}.` };
      const until = me.cooldowns[def.id] ?? 0;
      if (until > now) return { ok: false, code: 'rejected', message: `${def.name} is cooling down for ${Math.ceil((until - now) / 1000)} more seconds.` };
      const cost = Math.ceil(def.cost / (roomTags.has('mayhem') ? 2 : 1) / (myTags.has('thrifty') ? 2 : 1));
      if (energyLeft() < cost) return { ok: false, code: 'rejected', message: `Not enough chaos energy for ${def.name} (${Math.floor(energyLeft())} of ${cost}).` };
      const params = clampParam(def, req.params, this.env, caster);
      if ('error' in params) return { ok: false, code: 'rejected', message: `${def.name}: ${params.error}` };
      const resolved = this.resolve(def, caster, req.target);
      if ('error' in resolved) return { ok: false, code: 'rejected', message: `${def.name}: ${resolved.error}` };
      let targets = resolved.targets;
      const hostile = isHostile(def);
      const blocked: string[] = [];
      if (hostile && roomTags.has('pacifist')) return { ok: false, code: 'rejected', message: 'A peace zone is up: nobody can cast harmful cheats right now.' };
      if (hostile && def.target !== 'room' && roomTags.has('karma') && !targets.includes(caster)) {
        targets = [caster];
        lines.push('karma sent it straight back');
        this.log(cd, { at: now, kind: 'reflect', text: `Karma turned ${def.name} back on ${this.env.name(caster)}.`, caster, cheatId: def.id });
      }

      if (hostile && def.target !== 'room') {
        const kept: PlayerId[] = [];
        for (let t of targets) {
          // A bodyguard takes the hit for the player they protect.
          const body = cd.effects.find((e) => e.targets.includes(t) && e.caster !== t && e.caster !== caster && (getCheat(e.cheatId)?.tags ?? []).includes('bodyguard') && this.env.players().some((p) => p.id === e.caster));
          if (body) {
            lines.push(`${this.env.name(body.caster)} took it for ${this.env.name(t)}`);
            t = body.caster;
          }
          // A decoy sends the next harmful cheat to someone else at random, then is used up.
          const decoy = cd.effects.find((e) => e.targets.includes(t) && (getCheat(e.cheatId)?.tags ?? []).includes('decoy'));
          if (decoy) {
            const pool = this.env.players().map((p) => p.id).filter((id) => id !== t && id !== caster);
            this.endEffect(api, cd, decoy.eid, 'used');
            if (pool.length) {
              const to = api.rng.pick(pool);
              lines.push(`${this.env.name(t)}'s decoy sent it to ${this.env.name(to)}`);
              t = to;
            }
          }
          if (kept.includes(t)) continue;
          const guard = cd.effects.find((e) => e.targets.includes(t) && e.caster !== caster && (getCheat(e.cheatId)?.tags ?? []).some((g) => g === 'shield' || g === 'reflect'));
          if (guard) {
            const kind = (getCheat(guard.cheatId)?.tags ?? []).includes('reflect') ? 'reflect' : 'shield';
            const charges = Number(guard.data.charges ?? 1) - 1;
            guard.data.charges = charges;
            if (charges <= 0) this.endEffect(api, cd, guard.eid, 'used');
            if (kind === 'reflect' && t !== caster && !kept.includes(caster)) {
              kept.push(caster);
              this.log(cd, { at: now, kind: 'reflect', text: `${this.env.name(t)} reflected ${def.name} back at ${this.env.name(caster)}.`, caster, cheatId: def.id });
              lines.push(`${this.env.name(t)} reflected it back!`);
            } else {
              blocked.push(this.env.name(t));
            }
            continue;
          }
          const piled = cd.effects.filter((e) => e.hostile && e.targets.includes(t)).length;
          if (def.durationMs !== undefined && piled >= PILE_ON_LIMIT) {
            blocked.push(`${this.env.name(t)} (already has ${PILE_ON_LIMIT} curses)`);
            continue;
          }
          kept.push(t);
        }
        targets = kept;
        if (!targets.length) {
          // Shields did their job: the cast is spent, nothing else happens.
          spent += cost;
          me.cooldowns[def.id] = now + def.cooldownMs;
          lines.push(`${def.name}, but it was blocked by ${blocked.join(', ')}`);
          this.log(cd, { at: now, kind: 'blocked', text: `${this.env.name(caster)}'s ${def.name} was blocked by ${blocked.join(', ')}.`, caster, cheatId: def.id });
          continue;
        }
      }

      // Conflicts: a cheat refuses to share a target with tags it conflicts with; exclusive x: tags replace.
      const defTags = def.tags ?? [];
      const sameScope = (e: ActiveEffect) => (targets.length ? e.targets.some((t) => targets.includes(t)) : e.targets.length === 0);
      for (const e of cd.effects.filter(sameScope)) {
        const other = getCheat(e.cheatId);
        if (!other) continue;
        const otherTags = other.tags ?? [];
        if ((def.conflicts ?? []).some((c) => otherTags.includes(c)) || (other.conflicts ?? []).some((c) => defTags.includes(c))) {
          return { ok: false, code: 'rejected', message: `${def.name} conflicts with ${other.name}, which is already active there.` };
        }
      }
      if (def.durationMs !== undefined) {
        const same = cd.effects.find((e) => e.cheatId === def.id && (targets.length ? targets.every((t) => e.targets.includes(t)) : e.targets.length === 0) && e.team === resolved.team);
        if (same && (def.stacking ?? 'refresh') === 'reject') return { ok: false, code: 'rejected', message: `${def.name} is already active there.` };
        if (same && (def.stacking ?? 'refresh') === 'refresh') {
          same.endsAt = now + def.durationMs;
          spent += cost;
          me.cooldowns[def.id] = now + def.cooldownMs;
          lines.push(`${def.name} was renewed.`);
          made.push(same);
          continue;
        }
        for (const e of cd.effects.filter(sameScope)) {
          const other = getCheat(e.cheatId);
          if (other && other.id !== def.id && (other.tags ?? []).some((t) => t.startsWith('x:') && defTags.includes(t))) this.endEffect(api, cd, e.eid, 'replaced');
        }
      }

      for (const t of targets) hit.add(t);
      const input: CastInput = { caster, targets, team: resolved.team, params };
      const fx = this.startEffect(cd, def, input, castId, now);
      const r = def.apply?.(api, input, fx);
      if (r && 'error' in r) return { ok: false, code: 'rejected', message: `${def.name}: ${r.error}` };
      if (fx) made.push(fx);
      if (def.undoable === false) undoable = false;
      spent += cost;
      me.cooldowns[def.id] = now + def.cooldownMs;
      const who = def.target === 'room' ? '' : def.target === 'self' ? '' : ` on ${resolved.team ? (this.env.teams().find((t) => t.id === resolved.team)?.name ?? 'a team') : targets.map((t) => this.env.name(t)).join(', ')}`;
      lines.push(`${def.name}${who}`);
      if (blocked.length) lines.push(`(blocked by ${blocked.join(', ')})`);
    }

    let combo: string | null = null;
    const c = requests.length > 1 ? comboFor(requests.map((r) => r.cheatId)) : null;
    if (c) {
      c.apply(api, caster, made);
      combo = c.name;
      this.log(cd, { at: now, kind: 'combo', text: `${this.env.name(caster)} triggered the ${c.name} combo.`, caster });
    }

    me.energy = Math.max(0, energyLeft());
    me.energyAt = now;
    me.casts++;
    cd.totalCasts++;
    if (!cd.usedBy.includes(caster)) cd.usedBy.push(caster);
    const record: CastRecord = {
      castId,
      caster,
      cheatIds: requests.map((r) => r.cheatId),
      at: now,
      changes,
      effects: made.map((e) => e.eid),
      undoableUntil: undoable ? now + UNDO_WINDOW_MS : 0,
      undone: false,
    };
    cd.casts.push(record);
    if (cd.casts.length > CASTS_KEEP) cd.casts.splice(0, cd.casts.length - CASTS_KEEP);
    const text = `${this.env.name(caster)} cast ${lines.join(', ')}${combo ? `. Combo: ${combo}!` : '.'}`;
    this.log(cd, { at: now, kind: 'cast', text, caster, cheatId: requests[0]!.cheatId, targets: [...hit] });
    ctx.feed(`✦ ${text}`, { tone: 'big' });
    return { ok: true, castId, effects: made.map((e) => e.eid), text, combo };
  }

  /** Reverse a recent cast by its caster: meter changes are put back and its effects end. */
  undo(s: any, ctx: ModeContext, cd: Draft, caster: PlayerId, castId: string): { ok: true; text: string } | { ok: false; message: string } {
    const now = ctx.now();
    const rec = cd.casts.find((c) => c.castId === castId);
    if (!rec || rec.caster !== caster) return { ok: false, message: 'There is no cast of yours to undo with that id.' };
    if (rec.undone) return { ok: false, message: 'That cast was already undone.' };
    if (rec.undoableUntil < now) return { ok: false, message: rec.undoableUntil === 0 ? 'That cast cannot be undone.' : 'Too late: casts can only be undone for 20 seconds.' };
    const api = this.api(s, ctx, cd, null);
    for (const ch of rec.changes.slice().reverse()) api.add(ch.meter, ch.id, -ch.delta);
    for (const eid of rec.effects) this.endEffect(api, cd, eid, 'undone');
    rec.undone = true;
    const names = rec.cheatIds.map((id) => getCheat(id)?.name ?? id).join(', ');
    const text = `${this.env.name(caster)} undid ${names}.`;
    this.log(cd, { at: now, kind: 'undo', text, caster });
    ctx.feed(`✦ ${text}`, { tone: 'info' });
    return { ok: true, text };
  }

  /** The caster ends one of their own effects early. */
  stop(s: any, ctx: ModeContext, cd: Draft, caster: PlayerId, eid: string): { ok: true } | { ok: false; message: string } {
    const fx = cd.effects.find((e) => e.eid === eid);
    if (!fx) return { ok: false, message: 'That effect has already ended.' };
    if (fx.caster !== caster) return { ok: false, message: 'Only the player who cast it can stop it.' };
    const api = this.api(s, ctx, cd, null);
    this.endEffect(api, cd, eid, 'stopped');
    ctx.feed(`✦ ${this.env.name(caster)} stopped ${getCheat(fx.cheatId)?.name ?? 'an effect'}.`, { tone: 'info' });
    return { ok: true };
  }

  /** The host ends every effect and closes chaos for the rest of the game. */
  calm(s: any, ctx: ModeContext, cd: Draft) {
    const api = this.api(s, ctx, cd, null);
    for (const fx of cd.effects.slice()) this.endEffect(api, cd, fx.eid, 'calmed');
    cd.calmed = true;
    this.log(cd, { at: ctx.now(), kind: 'calm', text: 'The host calmed the room.' });
    ctx.feed('The host calmed the room. Chaos is over for this game.', { tone: 'info' });
  }

  /** A player left: effects on them go; their own buffs go; curses they cast on others run out as normal. */
  dropPlayer(s: any, ctx: ModeContext, cd: Draft, id: PlayerId) {
    const api = this.api(s, ctx, cd, null);
    for (const fx of cd.effects.slice()) {
      if (!fx.targets.includes(id) && !(fx.caster === id && !fx.hostile)) continue;
      fx.targets = fx.targets.filter((t) => t !== id);
      if (!fx.targets.length || (fx.caster === id && !fx.hostile)) this.endEffect(api, cd, fx.eid, 'left');
    }
  }

  touchesPlayer(cd: Draft, id: PlayerId): boolean {
    return cd.effects.some((fx) => fx.targets.includes(id) || fx.caster === id);
  }

  /* --------------------------------- view -------------------------------- */

  view(cd: Draft, viewer: Viewer, now: number, unlocked: boolean): ChaosView {
    const overlays: ChaosOverlay[] = [];
    const vid = viewer.kind === 'player' ? viewer.playerId : null;
    for (const fx of cd.effects) {
      const def = getCheat(fx.cheatId);
      if (!def?.overlay || vid === null) continue;
      const scope = def.overlayFor ?? 'targets';
      const sees = scope === 'all' || (scope === 'caster' ? fx.caster === vid : fx.targets.includes(vid) || (fx.targets.length === 0 && scope === 'targets'));
      if (!sees) continue;
      const o = def.overlay(fx);
      if (o) overlays.push({ ...o, eid: fx.eid, endsAt: fx.endsAt });
    }
    let me: ChaosView['me'] = null;
    if (unlocked && vid) {
      const c = cd.casters[vid];
      const cooldowns: Record<string, number> = {};
      for (const [id, until] of Object.entries(c?.cooldowns ?? {})) if (until > now) cooldowns[id] = until;
      me = {
        energy: Math.floor(c ? this.energyOf(c, now) : MAX_ENERGY),
        maxEnergy: MAX_ENERGY,
        regenPerSec: ENERGY_PER_SEC,
        cooldowns,
        undo: cd.casts
          .filter((r) => r.caster === vid && !r.undone && r.undoableUntil > now)
          .map((r) => ({ castId: r.castId, names: r.cheatIds.map((id) => getCheat(id)?.name ?? id), until: r.undoableUntil })),
        capabilities: this.capabilities,
      };
    }
    return {
      calmed: cd.calmed,
      casts: cd.totalCasts,
      effects: cd.effects.map((fx) => {
        const def = getCheat(fx.cheatId);
        return {
          eid: fx.eid,
          cheatId: fx.cheatId,
          name: def?.name ?? fx.cheatId,
          category: def?.category ?? 'random',
          caster: fx.caster,
          casterName: this.env.name(fx.caster),
          targets: fx.targets,
          team: fx.team,
          startedAt: fx.startedAt,
          endsAt: fx.endsAt,
          hostile: fx.hostile,
        };
      }),
      overlays,
      me,
    };
  }
}
