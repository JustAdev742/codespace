import type { SettingValues } from '@ludora/shared';
import type { GameMode, ModeVariant } from './types.ts';

/** Identity helpers that keep a mode's own types precise while it is written. */
export function defineMode<S, TSettings extends SettingValues, A>(mode: GameMode<S, TSettings, A>): GameMode<S, TSettings, A> {
  return mode;
}

export function defineVariant(variant: ModeVariant): ModeVariant {
  return variant;
}
