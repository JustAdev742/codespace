import { createRng } from '@ludora/shared';
import type { ChaosSim } from '../../src/testing/chaos.ts';
import type { Post, Pre, ScenarioSet } from '../chaos-scenarios.ts';

/* Catalogue-suite scenarios for time-attack cheats. See chaos-scenarios.ts for what each field does. */

/** The player answers the question on their screen now: right (skill 1) or wrong (skill 0). */
function answers(sim: ChaosSim, id: string, right: boolean) {
  if (sim.rt.status !== 'running' || !sim.rt.hasPlayer(id)) return;
  const action = sim.rt.botAction(id, right ? 1 : 0, createRng(29));
  if (action) sim.rt.act(id, action);
}

const casterWrong: Post = (sim, caster) => answers(sim, caster, false);
const casterRight: Post = (sim, caster) => answers(sim, caster, true);
const targetWrong: Post = (sim, _caster, _def, target) => target && answers(sim, target, false);
const targetRight: Post = (sim, _caster, _def, target) => target && answers(sim, target, true);
/** Five right answers in a row always take a multiplier up a step (below its top). */
const targetRightFive: Post = (sim, _caster, _def, target) => {
  for (let i = 0; i < 5 && target; i++) answers(sim, target, true);
};
/** The caster stops playing, so their clock runs down. */
const casterIdles: Post = (sim, caster) => void sim.idle.add(caster);

const BUMP = 'time-attack.multiplier-bump';
const running = (sim: ChaosSim, id: string) => sim.rt.status === 'running' && sim.rt.hasPlayer(id);
/** The caster raises their own multiplier a step, so it can go either way. */
const casterBumps: Pre = (sim, caster) => void (running(sim, caster) && sim.cast(caster, { cheatId: BUMP }));
/** Every other player raises their multiplier a step, so there is a multiplier to pinch or mute. */
const othersBump: Pre = (sim, caster) => {
  for (const id of sim.ids) if (id !== caster && running(sim, id)) sim.cast(id, { cheatId: BUMP });
};

export const scenarios: ScenarioSet = {
  // Bonus seconds are a run setting.
  settings: { 'time-attack': [{ bonusSeconds: 2 }] },
  pre: {
    'time-attack.multiplier-dice': casterBumps,
    'time-attack.multiplier-pinch': othersBump,
    'time-attack.multiplier-mute': othersBump,
  },
  post: {
    'time-attack.penalty-box': targetWrong,
    'time-attack.time-shield': casterWrong,
    'time-attack.multiplier-lock': casterWrong,
    'time-attack.safety-net': casterWrong,
    'time-attack.fuse-snuffer': targetRight,
    'time-attack.time-wager': casterRight,
    'time-attack.penalty-pass': casterWrong,
    'time-attack.bonus-heist': targetRight,
    'time-attack.clock-pressure': casterRight,
    'time-attack.multiplier-mute': targetRight,
    'time-attack.multiplier-echo': targetRightFive,
    'time-attack.last-second-save': casterIdles,
  },
  // A multiplier worth locking comes from a good run.
  casters: { 'time-attack.multiplier-lock': 'richest' },
};
