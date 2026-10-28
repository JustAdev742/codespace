import { createRng } from '@ludora/shared';
import type { ChaosSim } from '../../src/testing/chaos.ts';
import type { Post, Pre, ScenarioSet } from '../chaos-scenarios.ts';

/* Catalogue-suite scenarios for lantern-out cheats. See chaos-scenarios.ts for what each field does. */

type State = {
  sync: { phase: string; round: number; iid: string | null; answers: Record<string, unknown>; deadline: number; streaks: Record<string, number> };
  lanterns: Record<string, number>;
  revival: { round: number; on: boolean };
};
const st = (sim: ChaosSim) => sim.state() as State;
const lit = (sim: ChaosSim, id: string) => st(sim).lanterns[id] ?? 0;
const revival = (sim: ChaosSim) => st(sim).revival.on && st(sim).revival.round === st(sim).sync.round;
const playing = (sim: ChaosSim) => sim.rt.status === 'running';

/** Play on in small steps until `ok` holds (up to `ms` of game time). */
function until(sim: ChaosSim, ok: () => boolean, ms = 120_000): boolean {
  for (let t = 0; t < ms && playing(sim); t += 100) {
    if (ok()) return true;
    sim.run(100);
  }
  return ok();
}

/** A question is open that `id` may answer (lit in a normal round, out in a revival round) and has not yet. */
const canAnswer = (sim: ChaosSim, id: string) => {
  const s = st(sim).sync;
  return s.phase === 'question' && s.deadline - sim.now > 3000 && !s.answers[id] && (revival(sim) ? lit(sim, id) <= 0 : lit(sim, id) > 0);
};

/** `id` answers the next question they may answer, right (as a perfect bot would). */
function answerRight(sim: ChaosSim, id: string) {
  if (!until(sim, () => canAnswer(sim, id))) return;
  const action = sim.rt.botAction(id, 1, createRng(7));
  if (action) sim.rt.act(id, action);
}

/** The last player stops answering, so they run out of lanterns and there is someone to revive (or not). */
const lastPlayerFades: Pre = (sim) => void sim.idle.add(sim.ids[sim.ids.length - 1]!);

/** The target stops answering, so they lose lanterns while the effect runs. */
const targetFades: Post = (sim, _caster, _def, target) => void (target && sim.idle.add(target));

/** The caster stops answering, so they lose lanterns while the effect runs. */
const casterFades: Post = (sim, caster) => void sim.idle.add(caster);

/** A question nobody has answered yet: bots answer the moment they see one, so they hold back while it opens. */
const untouchedQuestion: Pre = (sim) => {
  const held = sim.ids.filter((id) => !sim.idle.has(id));
  for (const id of held) sim.idle.add(id);
  until(sim, () => st(sim).sync.phase === 'question' && Object.keys(st(sim).sync.answers).length === 0 && st(sim).sync.deadline - sim.now > 8000 && !revival(sim));
  for (const id of held) sim.idle.delete(id);
};

/** The caster stops answering until every lantern of theirs is out, and stays quiet. */
const casterGoesOut: Pre = (sim, caster) => {
  sim.idle.add(caster);
  until(sim, () => lit(sim, caster) <= 0, 200_000);
};

/** In the next revival round the caster answers right, then plays on as normal. */
const casterRevives: Post = (sim, caster) => {
  if (until(sim, () => revival(sim) && canAnswer(sim, caster), 200_000)) answerRight(sim, caster);
  sim.idle.delete(caster);
};

/** Someone other than `id` and `not` blows out one of `id`'s lanterns, so they have room for one more. */
function makeRoom(sim: ChaosSim, id: string, not: string) {
  const by = sim.ids.find((x) => x !== id && x !== not && sim.rt.hasPlayer(x));
  if (by && lit(sim, id) >= 3) sim.cast(by, { cheatId: 'lantern-out.gust', target: id });
}

/** The target has room for a lantern and a streak one short of three, then answers right: Kindling would relight one. */
const targetKindles: Post = (sim, caster, _def, target) => {
  if (!target) return;
  makeRoom(sim, target, caster);
  sim.cast(target, { cheatId: 'lantern-out.dry-tinder' });
  sim.idle.add(target);
  answerRight(sim, target);
  sim.idle.delete(target);
};

/** The caster has room for a lantern and answers right until a run of three. */
const casterRunsOfThree: Post = (sim, caster) => {
  makeRoom(sim, caster, caster);
  sim.idle.add(caster);
  for (let k = 0; k < 3 && playing(sim); k++) answerRight(sim, caster);
  sim.idle.delete(caster);
};

/** The caster answers the open question right at once, so they win the duel if their opponent is wrong or slower. */
const casterAnswersFirst: Post = (sim, caster) => answerRight(sim, caster);

/** Two players blow out two of a third player's lanterns, so the lit rows are uneven. */
const unevenRows: Pre = (sim, caster) => {
  const others = sim.ids.filter((id) => id !== caster && sim.rt.hasPlayer(id));
  const victim = others.find((id) => lit(sim, id) >= 3);
  if (!victim) return;
  for (const by of sim.ids.filter((id) => id !== victim && sim.rt.hasPlayer(id)).slice(0, 2)) sim.cast(by, { cheatId: 'lantern-out.gust', target: victim });
};

export const scenarios: ScenarioSet = {
  settings: { 'lantern-out': [{ kindling: true }] },
  pre: {
    'lantern-out.call-revival': lastPlayerFades,
    'lantern-out.snuff-revival': lastPlayerFades,
    'lantern-out.flame-duel': untouchedQuestion,
    // Cast as a question opens, so the target's miss on it closes well inside the 30 seconds.
    'lantern-out.shelter': untouchedQuestion,
    'lantern-out.ripple': untouchedQuestion,
    'lantern-out.double-wick': casterGoesOut,
    // Two questions asked, so a streak can be long enough to kindle.
    'lantern-out.damp-kindling': (sim) => void until(sim, () => st(sim).sync.round >= 2),
    'lantern-out.even-glow': unevenRows,
  },
  post: {
    'lantern-out.windbreak': targetFades,
    'lantern-out.downdraft': targetFades,
    'lantern-out.moth-to-the-flame': targetFades,
    'lantern-out.flame-duel': casterAnswersFirst,
    'lantern-out.double-wick': casterRevives,
    'lantern-out.damp-kindling': targetKindles,
    'lantern-out.tinderbox': casterRunsOfThree,
    'lantern-out.shelter': targetFades,
    'lantern-out.ripple': casterFades,
  },
};
