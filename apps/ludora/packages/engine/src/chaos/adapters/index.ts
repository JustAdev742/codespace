import type { ChaosAdapter } from '../types.ts';
import { classicAdapter } from './classic.ts';
import { cometDashAdapter } from './comet-dash.ts';
import { confidenceAdapter } from './confidence.ts';
import { festivalWorkshopAdapter } from './festival-workshop.ts';
import { flashcardStudyAdapter } from './flashcard-study.ts';
import { glimDuelsAdapter } from './glim-duels.ts';
import { glimgoAdapter } from './glimgo.ts';
import { goldRushAdapter } from './gold-rush.ts';
import { gloomGiantAdapter } from './gloom-giant.ts';
import { lanternGuardAdapter } from './lantern-guard.ts';
import { lanternLandsAdapter } from './lantern-lands.ts';
import { lanternMatchAdapter } from './lantern-match.ts';
import { lanternOutAdapter } from './lantern-out.ts';
import { lanternTrailAdapter } from './lantern-trail.ts';
import { nightMarketAdapter } from './night-market.ts';
import { quickDrawAdapter } from './quick-draw.ts';
import { skyLanternsAdapter } from './sky-lanterns.ts';
import { survivalRunAdapter } from './survival-run.ts';
import { timeAttackAdapter } from './time-attack.ts';
import { tugOfWarAdapter } from './tug-of-war.ts';
import { wordScrambleAdapter } from './word-scramble.ts';

export const CHAOS_ADAPTERS: readonly ChaosAdapter[] = [
  classicAdapter,
  cometDashAdapter,
  confidenceAdapter,
  festivalWorkshopAdapter,
  flashcardStudyAdapter,
  glimDuelsAdapter,
  glimgoAdapter,
  goldRushAdapter,
  gloomGiantAdapter,
  lanternGuardAdapter,
  lanternLandsAdapter,
  lanternMatchAdapter,
  lanternOutAdapter,
  lanternTrailAdapter,
  nightMarketAdapter,
  quickDrawAdapter,
  skyLanternsAdapter,
  survivalRunAdapter,
  timeAttackAdapter,
  tugOfWarAdapter,
  wordScrambleAdapter,
];

const byMode = new Map(CHAOS_ADAPTERS.map((a) => [a.modeId, a]));

export function chaosAdapterFor(modeId: string): ChaosAdapter | null {
  return byMode.get(modeId) ?? null;
}
