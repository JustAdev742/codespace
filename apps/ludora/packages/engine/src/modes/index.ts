import type { GameMode, ModeVariant } from '../sdk/types.ts';
import { classic } from './classic/index.ts';
import { variants as classicVariants } from './classic/meta.ts';
import { cometDash } from './comet-dash/index.ts';
import { variants as cometVariants } from './comet-dash/meta.ts';
import { quickDraw } from './quick-draw/index.ts';
import { variants as quickDrawVariants } from './quick-draw/meta.ts';
import { lanternOut } from './lantern-out/index.ts';
import { variants as lanternOutVariants } from './lantern-out/meta.ts';
import { confidence } from './confidence/index.ts';
import { variants as confidenceVariants } from './confidence/meta.ts';
import { glimgo } from './glimgo/index.ts';
import { variants as glimgoVariants } from './glimgo/meta.ts';
import { lanternMatch } from './lantern-match/index.ts';
import { variants as lanternMatchVariants } from './lantern-match/meta.ts';
import { wordScramble } from './word-scramble/index.ts';
import { variants as wordScrambleVariants } from './word-scramble/meta.ts';
import { timeAttack } from './time-attack/index.ts';
import { variants as timeAttackVariants } from './time-attack/meta.ts';
import { survivalRun } from './survival-run/index.ts';
import { variants as survivalRunVariants } from './survival-run/meta.ts';
import { flashcardStudy } from './flashcard-study/index.ts';
import { variants as flashcardStudyVariants } from './flashcard-study/meta.ts';
import { skyLanterns } from './sky-lanterns/index.ts';
import { variants as skyLanternsVariants } from './sky-lanterns/meta.ts';
import { gloomGiant } from './gloom-giant/index.ts';
import { variants as gloomGiantVariants } from './gloom-giant/meta.ts';
import { tugOfWar } from './tug-of-war/index.ts';
import { variants as tugOfWarVariants } from './tug-of-war/meta.ts';
import { nightMarket } from './night-market/index.ts';
import { variants as nightMarketVariants } from './night-market/meta.ts';
import { lanternGuard } from './lantern-guard/index.ts';
import { variants as lanternGuardVariants } from './lantern-guard/meta.ts';
import { glimDuels } from './glim-duels/index.ts';
import { variants as glimDuelsVariants } from './glim-duels/meta.ts';
import { lanternTrail } from './lantern-trail/index.ts';
import { variants as lanternTrailVariants } from './lantern-trail/meta.ts';
import { lanternLands } from './lantern-lands/index.ts';
import { variants as lanternLandsVariants } from './lantern-lands/meta.ts';
import { festivalWorkshop } from './festival-workshop/index.ts';
import { variants as festivalWorkshopVariants } from './festival-workshop/meta.ts';
import { goldRush } from './gold-rush/index.ts';
import { variants as goldRushVariants } from './gold-rush/meta.ts';
import { glowTag } from './glow-tag/index.ts';
import { variants as glowTagVariants } from './glow-tag/meta.ts';
import { bigCatch } from './big-catch/index.ts';
import { variants as bigCatchVariants } from './big-catch/meta.ts';

/** Every mode with logic. Order here is the default catalogue order. */
export const MODES: readonly GameMode[] = [classic, cometDash, quickDraw, lanternOut, confidence, glimgo, lanternMatch, wordScramble, timeAttack, survivalRun, flashcardStudy, skyLanterns, gloomGiant, tugOfWar, nightMarket, lanternGuard, glimDuels, lanternTrail, lanternLands, festivalWorkshop, goldRush, glowTag, bigCatch];

export const VARIANTS: readonly ModeVariant[] = [
  ...classicVariants,
  ...cometVariants,
  ...quickDrawVariants,
  ...lanternOutVariants,
  ...confidenceVariants,
  ...glimgoVariants,
  ...lanternMatchVariants,
  ...wordScrambleVariants,
  ...timeAttackVariants,
  ...survivalRunVariants,
  ...flashcardStudyVariants,
  ...skyLanternsVariants,
  ...gloomGiantVariants,
  ...tugOfWarVariants,
  ...nightMarketVariants,
  ...lanternGuardVariants,
  ...glimDuelsVariants,
  ...lanternTrailVariants,
  ...lanternLandsVariants,
  ...festivalWorkshopVariants,
  ...goldRushVariants,
  ...glowTagVariants,
  ...bigCatchVariants,
];
