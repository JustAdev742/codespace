import type { ChaosSim } from '../../src/testing/chaos.ts';
import type { Pre, Post, ScenarioSet } from '../chaos-scenarios.ts';

/* Catalogue-suite scenarios for quick-draw cheats. See chaos-scenarios.ts for what each field does. */

type Sync = { phase: string; iid: string | null; answers: Record<string, unknown>; deadline: number; round: number; roundsPlayed: number };
const syncOf = (sim: ChaosSim) => (sim.state() as { sync: Sync }).sync;
const winsOf = (sim: ChaosSim) => (sim.state() as { wins: { round: number }[] }).wins;

/** Play on in small steps until a question is open that `ok` accepts, with a few seconds still on its clock. */
function until(sim: ChaosSim, ok: (s: Sync) => boolean): boolean {
  for (let t = 0; t < 90_000 && sim.rt.status === 'running'; t += 50) {
    const s = syncOf(sim);
    if (s.phase === 'question' && s.iid && s.deadline - sim.now > 4000 && ok(s)) return true;
    sim.run(50);
  }
  return false;
}

/** `id` answers the next question they can, wrong. */
function missAs(sim: ChaosSim, id: string, ok: (s: Sync) => boolean = (s) => !s.answers[id]) {
  if (until(sim, ok)) sim.rt.act(id, { type: 'answer', iid: syncOf(sim).iid, answer: { type: 'short', text: 'not the answer' } });
}

/** The target answers wrong while the effect runs. */
const targetMisses: Post = (sim, _caster, _def, target) => {
  if (target) missAs(sim, target);
};

/** A teammate of the caster answers wrong while the caster has not answered yet, locking the team out (One Voice). */
const mateMisses: Pre = (sim, caster) => {
  const team = sim.rt.playerList().find((p) => p.id === caster)?.teamId;
  const mate = sim.rt.playerList().find((p) => p.id !== caster && p.teamId === team)?.id;
  if (mate) missAs(sim, mate, (s) => !s.answers[mate] && !s.answers[caster]);
};

/** Someone other than the caster answers wrong while at least two others have not answered yet. */
const otherMisses: Pre = (sim, caster) => {
  const other = sim.ids.find((id) => id !== caster && sim.rt.hasPlayer(id));
  if (other) missAs(sim, other, (s) => !s.answers[other] && Object.keys(s.answers).length <= sim.ids.length - 3);
};

/** Everybody stops answering until a round closes with nobody winning it, then play goes on. */
const nobodyWins: Post = (sim) => {
  const idle = new Set(sim.idle);
  for (const id of sim.ids) sim.idle.add(id);
  const start = syncOf(sim).roundsPlayed;
  for (let t = 0; t < 60_000 && sim.rt.status === 'running'; t += 250) {
    const s = syncOf(sim);
    if (s.roundsPlayed > start && !winsOf(sim).some((w) => w.round === s.round)) break;
    sim.run(250);
  }
  sim.idle.clear();
  for (const id of idle) sim.idle.add(id);
};

/** Only the caster keeps playing, so they win every round they answer right. */
const casterAlone: Post = (sim, caster) => {
  for (const id of sim.ids) if (id !== caster) sim.idle.add(id);
};

/** The target answers wrong, then is the only one still playing, so they try the next question too. */
const targetMissesThenAlone: Post = (sim, _caster, _def, target) => {
  if (!target) return;
  missAs(sim, target);
  for (const id of sim.ids) if (id !== target) sim.idle.add(id);
};

export const scenarios: ScenarioSet = {
  settings: { 'quick-draw': [{ teamTry: true }] },
  pre: {
    'quick-draw.reholster': (sim, caster) => missAs(sim, caster),
    'quick-draw.posse-pardon': mateMisses,
    'quick-draw.turnabout': otherMisses,
  },
  post: {
    'quick-draw.shaky-trigger': targetMisses,
    'quick-draw.buzzard-bounty': targetMisses,
    'quick-draw.saddle-sore': targetMissesThenAlone,
    'quick-draw.tumbleweed-jackpot': nobodyWins,
    'quick-draw.lightning-draw': casterAlone,
    'quick-draw.winning-streak': casterAlone,
    'quick-draw.bold-claim': casterAlone,
  },
  // A wrong answer under a bold claim only costs something to a player with a point to lose.
  casters: { 'quick-draw.bold-claim': 'richest' },
};
