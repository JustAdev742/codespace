import type { GameMode, ModeVariant } from '../sdk/types.ts';
import { classic } from './classic/index.ts';
import { variants as classicVariants } from './classic/meta.ts';
import { cometDash } from './comet-dash/index.ts';
import { variants as cometVariants } from './comet-dash/meta.ts';

/** Every mode with logic. Order here is the default catalogue order. */
export const MODES: readonly GameMode[] = [classic, cometDash];

export const VARIANTS: readonly ModeVariant[] = [...classicVariants, ...cometVariants];
