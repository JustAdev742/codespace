import { describe, expect, it } from 'vitest';
import { MODES } from '../src/modes/index.ts';
import { ChaosSim } from '../src/testing/chaos.ts';
import { MIXED_SET } from '../src/testing/fixtures.ts';
import { allCheats, cheatAvailability, cheatInfo } from '../src/chaos/registry.ts';
import { capabilitiesOf } from '../src/chaos/engine.ts';
import { chaosAdapterFor } from '../src/chaos/adapters/index.ts';
import { makeTeams } from '../src/teams.ts';
import { resolveGameConfig } from '../src/registry.ts';
import type { CastRequest, CheatDef } from '../src/chaos/types.ts';
import { CASTERS, EFFECTS, META, PRE, POST, REACTIVE, SCREEN, SETTINGS, TARGETS } from './chaos-scenarios.ts';

/*
 * The catalogue suite. For every cheat and every game mode it claims to work
 * in, two identical games are played with bots; the cheat is cast in one of
 * them. The cast must be accepted, and then the two games must differ: in the
 * real game state or, for purely visual cheats, in what the targets' screens
 * are told to show.
 *
 * Some lasting cheats only act on what the mode does next (double points
 * needs points to double). If the untouched game shows no change at all
 * while the effect runs, the cheat had nothing to act on in that mode, and
 * the run counts as untriggered rather than passed. Every cheat must still
 * prove itself in at least one mode, and must never fail to act when there
 * was something to act on.
 *
 * Scenarios in chaos-scenarios.ts set up situations some cheats need (a
 * shield needs an attacker; a pop timer needs a target who does not score).
 */

const PLAYERS = 4;
const MAX_WARMUP_MS = 180_000;

interface ModeRun {
  modeId: string;
  teamCount: number;
  settings: Record<string, unknown>;
}

function modesFor(def: CheatDef): ModeRun[] {
  const info = cheatInfo(def);
  return MODES.filter((m) => m.meta.status !== 'planned').flatMap((m) => {
    const adapter = chaosAdapterFor(m.meta.id);
    if (!adapter) return [];
    const needsTeams = info.needs.includes('teams') || m.meta.teams === 'required';
    if (needsTeams && m.meta.teams === 'none') return [];
    const teams = needsTeams ? makeTeams(2) : [];
    for (const extra of [{}, ...(SETTINGS[m.meta.id] ?? [])]) {
      const resolved = resolveGameConfig({ modeId: m.meta.id, variantId: null, settings: extra, common: {} });
      if (!resolved.ok) continue;
      if (!cheatAvailability(info, m.meta.id, capabilitiesOf(adapter, teams, resolved.value.settings))) {
        return [{ modeId: m.meta.id, teamCount: needsTeams ? 2 : 0, settings: extra }];
      }
    }
    return [];
  });
}

/** A player meter's value, read straight from the mode state. */
function meter(sim: ChaosSim, key: string, id: string): number {
  const m = chaosAdapterFor(sim.rt.mode.meta.id)?.meters.find((x) => x.key === key);
  return m ? m.get(sim.state(), id, { settings: sim.rt.settings } as never) : 0;
}

function requestsFor(sim: ChaosSim, def: CheatDef, caster: string): CastRequest[] {
  const players = sim.rt.playerList();
  const me = players.find((p) => p.id === caster)!;
  // Richest first: cheats that take from someone need someone with something to take.
  const key = mainMeter(def);
  let others = players.filter((p) => p.id !== caster).sort((a, b) => meter(sim, key, b.id) - meter(sim, key, a.id));
  if (TARGETS[def.id] === 'closest-above') {
    const mine = meter(sim, key, caster);
    others = others.filter((p) => meter(sim, key, p.id) > mine).reverse();
  }
  const params = (i: number) => {
    const out: Record<string, unknown> = {};
    for (const p of def.params ?? []) if (p.kind === 'player') out[p.key] = others[i % others.length]?.id;
    return out;
  };
  const pick = (pool: { id: string }[]) => pool.map((p, i) => ({ cheatId: def.id, target: p.id, params: params(i) }));
  switch (def.target) {
    case 'opponent':
      return pick(others.filter((p) => !me.teamId || p.teamId !== me.teamId));
    case 'player':
      return pick(others);
    case 'teammate':
      return pick(others.filter((p) => me.teamId && p.teamId === me.teamId));
    case 'enemy-team': {
      const teams = [...new Set(players.filter((p) => p.teamId && p.teamId !== me.teamId).map((p) => p.teamId!))];
      return teams.map((t, i) => ({ cheatId: def.id, target: t, params: params(i) }));
    }
    default:
      return [0, 1, 2].map((i) => ({ cheatId: def.id, target: null, params: params(i) }));
  }
}

const snap = (sim: ChaosSim) => JSON.stringify(sim.state());
/** Game state plus the other cheats running and on whom, for cheats that act on cheats. Effects from `castId` itself are left out. */
const snapWithEffects = (sim: ChaosSim, cheatId: string) =>
  snap(sim) + JSON.stringify(sim.chaos().effects.filter((e) => e.cheatId !== cheatId).map((e) => [e.cheatId, e.caster, e.targets.slice().sort(), e.endsAt]).sort());
const overlaysNow = (sim: ChaosSim) => sim.ids.filter((id) => sim.rt.hasPlayer(id)).flatMap((id) => sim.view(id, false).overlays);

/** The meter a cheat works on, for picking players with something to work with. */
function mainMeter(def: CheatDef): string {
  const m = (def.needs ?? []).find((n) => n.startsWith('meter:'));
  return m ? m.slice(6) : 'score';
}

/** Warm up until at least two players have some of the cheat's meter (or a time limit), so there is something to cheat with. */
function warm(sims: ChaosSim[], key: string) {
  const [a] = sims;
  for (let t = 0; t < MAX_WARMUP_MS; t += 2000) {
    const scored = a!.ids.filter((id) => meter(a!, key, id) !== 0).length;
    if (t >= 12_000 && scored >= 2) break;
    for (const s of sims) s.run(2000);
    if (a!.rt.status !== 'running') break;
  }
}

const cheats = allCheats();

describe('chaos catalogue: every cheat does something real', () => {
  for (const def of cheats) {
    const modes = modesFor(def);
    const outcome = { passed: [] as string[], untriggered: [] as string[] };
    describe(`${def.id} (${def.name})`, () => {
      for (const run of modes) {
        it(`changes the game in ${run.modeId}`, () => {
          const make = () =>
            new ChaosSim({ modeId: run.modeId, questions: MIXED_SET, players: PLAYERS, seed: 99, settings: run.settings, common: run.teamCount ? { teamCount: run.teamCount } : {} });
          const a = make();
          const b = make();
          warm([a, b], mainMeter(def));
          expect(a.rt.status, `${run.modeId} ended before the cheat could be cast`).toBe('running');
          // Players furthest behind cast first: comeback cheats need someone behind.
          const casters = a.ids.slice().sort((x, y) => meter(a, mainMeter(def), x) - meter(a, mainMeter(def), y));
          if (CASTERS[def.id] === 'richest') casters.reverse();
          let caster: string | null = null;
          const tried: string[] = [];
          // If nobody can cast it yet (say, both teams are level), play on a little and try again.
          for (let round = 0; round < 12 && !caster && a.rt.status === 'running'; round++) {
            if (round > 0) {
              a.run(10_000);
              b.run(10_000);
            }
            for (const c of casters) {
              PRE[def.id]?.(a, c);
              PRE[def.id]?.(b, c);
              for (const req of requestsFor(a, def, c)) {
                const r = a.cast(c, req);
                if (r.ok) {
                  caster = c;
                  break;
                }
                tried.push(`${c}: ${r.message}`);
              }
              if (caster) break;
            }
          }
          expect(caster, `could not cast ${def.id} in ${run.modeId}:\n${[...new Set(tried)].join('\n')}`).not.toBeNull();
          const firstTarget = a.chaos().log.filter((l) => l.kind === 'cast').at(-1)?.targets?.[0] ?? null;
          POST[def.id]?.(a, caster!, def, firstTarget);
          POST[def.id]?.(b, caster!, def, firstTarget);
          if (META.has(def.id)) {
            // Cheats about chaos itself: some player's energy or cooldowns differ from the untouched game,
            // beyond what this cast cost and the cooldown it started.
            const chaosOf = (x: ChaosSim, self: boolean) =>
              JSON.stringify(
                x.ids.map((id) => {
                  const me = x.view(id).me!;
                  const cooldowns = Object.fromEntries(Object.entries(me.cooldowns).filter(([k]) => k !== def.id));
                  return { id, e: me.energy + (self && id === caster ? def.cost : 0), cooldowns };
                }),
              );
            expect(chaosOf(a, true), `${def.id} changed no chaos state`).not.toBe(chaosOf(b, false));
            expect(a.errors).toEqual([]);
            outcome.passed.push(run.modeId);
            return;
          }
          const compare = EFFECTS.has(def.id) ? (x: ChaosSim) => snapWithEffects(x, def.id) : snap;
          let seen = overlaysNow(a).length > 0;
          let diverged = compare(a) !== compare(b);
          const actedBefore = a.chaos().acted;
          const span = (def.durationMs ?? 0) + 6_000;
          for (let t = 0; t < span && !diverged; t += 1000) {
            a.run(1000);
            b.run(1000);
            if (!seen) seen = overlaysNow(a).length > 0;
            if (compare(a) !== compare(b)) diverged = true;
          }
          const acted = a.chaos().acted > actedBefore;
          expect(a.errors.map((e) => `${e.where}: ${String(e.error)}`)).toEqual([]);
          const visualOnly = SCREEN.has(def.id) || (!EFFECTS.has(def.id) && !def.apply && !def.hooks?.delta && !def.hooks?.tick && !def.hooks?.gate);
          if (visualOnly) {
            if (!seen && REACTIVE.has(def.id)) {
              outcome.untriggered.push(run.modeId);
              return;
            }
            expect(seen, `${def.id} showed nothing in ${run.modeId}`).toBe(true);
            outcome.passed.push(run.modeId);
            return;
          }
          // A reactive effect (it bends or refuses what the mode does, or waits for a situation) that never acted had nothing to act on.
          const reactive = Boolean(def.hooks?.delta || def.hooks?.gate || REACTIVE.has(def.id));
          if (!diverged && reactive && !acted) {
            outcome.untriggered.push(run.modeId);
            return;
          }
          expect(diverged, `${def.id} changed nothing in ${run.modeId}`).toBe(true);
          outcome.passed.push(run.modeId);
        });
      }
      it('proved itself in at least one game mode', () => {
        expect(modes.length, `${def.id} works in no mode`).toBeGreaterThan(0);
        expect(outcome.passed.length, `${def.id} never had anything to act on (untriggered in ${outcome.untriggered.join(', ')})`).toBeGreaterThan(0);
      });
    });
  }
});
