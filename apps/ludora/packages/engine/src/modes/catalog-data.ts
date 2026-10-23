import type { ModeMeta, SettingField } from '@ludora/shared';
import type { ModeVariant } from '../sdk/types.ts';
import * as classic from './classic/meta.ts';
import * as cometDash from './comet-dash/meta.ts';
import * as quickDraw from './quick-draw/meta.ts';
import * as lanternOut from './lantern-out/meta.ts';
import * as confidence from './confidence/meta.ts';
import * as glimgo from './glimgo/meta.ts';
import * as lanternMatch from './lantern-match/meta.ts';
import * as wordScramble from './word-scramble/meta.ts';
import * as timeAttack from './time-attack/meta.ts';
import * as survivalRun from './survival-run/meta.ts';
import * as flashcardStudy from './flashcard-study/meta.ts';
import * as skyLanterns from './sky-lanterns/meta.ts';
import * as gloomGiant from './gloom-giant/meta.ts';
import * as tugOfWar from './tug-of-war/meta.ts';
import * as nightMarket from './night-market/meta.ts';
import * as lanternGuard from './lantern-guard/meta.ts';

/**
 * Metadata only, no game logic, so the browser can import the catalogue
 * without bundling every mode. Keep in step with ./index.ts (a test checks).
 */
export const CATALOG_DATA: readonly { meta: ModeMeta; settings: readonly SettingField[]; variants: readonly ModeVariant[] }[] = [
  classic,
  cometDash,
  quickDraw,
  lanternOut,
  confidence,
  glimgo,
  lanternMatch,
  wordScramble,
  timeAttack,
  survivalRun,
  flashcardStudy,
  skyLanterns,
  gloomGiant,
  tugOfWar,
  nightMarket,
  lanternGuard,
];
