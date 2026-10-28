import { createRng } from '@ludora/shared';
import type { ChaosSim } from '../../src/testing/chaos.ts';
import type { Post, Pre, ScenarioSet } from '../chaos-scenarios.ts';

/* Catalogue-suite scenarios for classic cheats. See chaos-scenarios.ts for what each field does. */

type Sync = { phase: string; iid: string | null; answers: Record<string, unknown>; deadline: number; scores: Record<string, number> };
const syncOf = (sim: ChaosSim) => (sim.state() as { sync: Sync }).sync;

/** Play on in small steps until a question is open that `ok` accepts, with `minLeft` ms still on its clock. */
function until(sim: ChaosSim, ok: (s: Sync) => boolean, minLeft = 4000): boolean {
  for (let t = 0; t < 90_000 && sim.rt.status === 'running'; t += 100) {
    const s = syncOf(sim);
    if (s.phase === 'question' && s.iid && s.deadline - sim.now > minLeft && ok(s)) return true;
    sim.run(100);
  }
  return false;
}

/** `id` answers the next question they can: right (as a perfect bot would) or wrong. */
function answerAs(sim: ChaosSim, id: string, right: boolean) {
  if (!until(sim, (s) => !s.answers[id])) return;
  const action = right ? sim.rt.botAction(id, 1, createRng(7)) : { type: 'answer', iid: syncOf(sim).iid, answer: { type: 'short', text: 'not the answer' } };
  if (action) sim.rt.act(id, action);
}

/** A fresh question: plenty of time left and at least two players still to answer. */
const freshQuestion: Pre = (sim) => void until(sim, (s) => Object.keys(s.answers).length <= sim.ids.length - 2, 8000);

/** Someone else calls a curtain call, so there is an encore to cut. */
const encoreQueued: Pre = (sim, caster) => {
  const other = sim.ids.find((id) => id !== caster && sim.rt.hasPlayer(id));
  freshQuestion(sim, caster);
  if (other) sim.cast(other, { cheatId: 'classic.curtain-call' });
};

/** The richest other player answers wrong, so the penalty takes something from them. */
const someoneMisses: Post = (sim, caster) => {
  const scores = syncOf(sim).scores;
  const victim = sim.ids.filter((id) => id !== caster && (scores[id] ?? 0) > 0).sort((a, b) => (scores[b] ?? 0) - (scores[a] ?? 0))[0];
  if (victim) answerAs(sim, victim, false);
};

/** The caster gets the next question right and their teammate gets it wrong: unison missed by one voice. */
const oneVoiceShort: Post = (sim, caster) => {
  const team = sim.rt.playerList().find((p) => p.id === caster)?.teamId;
  const mate = sim.rt.playerList().find((p) => p.id !== caster && p.teamId === team)?.id;
  if (!mate || !until(sim, (s) => !s.answers[caster] && !s.answers[mate])) return;
  const right = sim.rt.botAction(caster, 1, createRng(7));
  if (right) sim.rt.act(caster, right);
  sim.rt.act(mate, { type: 'answer', iid: syncOf(sim).iid, answer: { type: 'short', text: 'not the answer' } });
};

/** A question nobody has answered yet, with plenty of time left. Bots answer the moment they see a question, so they hold back while it opens. */
const untouchedQuestion: Pre = (sim) => {
  const held = sim.ids.filter((id) => !sim.idle.has(id));
  for (const id of held) sim.idle.add(id);
  until(sim, (s) => Object.keys(s.answers).length === 0, 8000);
  for (const id of held) sim.idle.delete(id);
};

/** The caster's bot holds back, so the caster answers by hand a moment into the question (see stoppedClockAnswer). */
const casterWaits: Pre = (sim, caster) => {
  sim.idle.add(caster);
  until(sim, (s) => !s.answers[caster], 8000);
};

/** The caster answers right a second and a half into the question, so there is speed bonus left to win. */
const stoppedClockAnswer: Post = (sim, caster) => {
  sim.run(1500);
  answerAs(sim, caster, true);
  sim.idle.delete(caster);
};

/** A player still in the game stops answering, so the knockout rule has someone to put out. */
const someoneWillMiss: Post = (sim, caster) => {
  const out = (sim.state() as { out: Record<string, number> }).out;
  const victim = sim.ids.find((id) => id !== caster && sim.rt.hasPlayer(id) && out[id] === undefined && !syncOf(sim).answers[id]);
  if (victim) sim.idle.add(victim);
};

/** Nobody answers the open question, so its pot goes unclaimed; then everyone plays on. */
const nobodyAnswers: Post = (sim) => {
  for (const id of sim.ids) sim.idle.add(id);
  for (let t = 0; t < 60_000 && syncOf(sim).phase === 'question' && sim.rt.status === 'running'; t += 100) sim.run(100);
  for (const id of sim.ids) sim.idle.delete(id);
};

/** Play on until the two teams have different unison bonuses, so there is something to swap. */
const bonusesDiffer: Pre = (sim) => {
  const differ = () => new Set(Object.values((sim.state() as { teamBonus: Record<string, number> }).teamBonus).concat(0)).size > 1;
  for (let t = 0; t < 150_000 && !differ() && sim.rt.status === 'running'; t += 2000) sim.run(2000);
};

export const scenarios: ScenarioSet = {
  settings: { classic: [{ encore: true }, { comeback: true }, { unisonBonus: 500 }, { scoring: 'pot' }] },
  pre: {
    'classic.cut-the-encore': encoreQueued,
    'classic.underdog-disguise': (sim, caster) => void until(sim, (s) => !s.answers[caster], 8000),
    'classic.revoke-comeback': freshQuestion,
    'classic.double-dip': (sim, caster) => void until(sim, (s) => !s.answers[caster], 8000),
    'classic.stopped-clock': casterWaits,
    'classic.tortoise-round': untouchedQuestion,
    'classic.fresh-deal': untouchedQuestion,
    'classic.reprieve-bell': freshQuestion,
    'classic.rollover': untouchedQuestion,
    'classic.back-yourself': (sim, caster) => void until(sim, (s) => !s.answers[caster], 8000),
    'classic.sizzling-answers': freshQuestion,
    'classic.harmony-swap': bonusesDiffer,
  },
  screen: ['classic.sneak-preview'],
  post: {
    'classic.stopped-clock': stoppedClockAnswer,
    'classic.reprieve-bell': someoneWillMiss,
    'classic.rollover': nobodyAnswers,
    'classic.sizzling-answers': (sim, _caster, _def, target) => target && answerAs(sim, target, false),
    'classic.stand-in-singer': oneVoiceShort,
    // The caster earns a share of the pot, and the bots usually share it with them.
    'classic.double-dip': (sim, caster) => answerAs(sim, caster, true),
    // The streak has to try to grow while the effect runs.
    'classic.cold-streak': (sim, _caster, _def, target) => target && answerAs(sim, target, true),
    // The protected player misses, so the game tries to knock them out.
    'classic.spotlight-immunity': (sim, _caster, _def, target) => void (target && sim.idle.add(target)),
    'classic.penalty-collector': someoneMisses,
  },
};
