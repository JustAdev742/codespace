import { defineCheats } from '../registry.ts';
import type { CheatDef } from '../types.ts';

/* Cheats that only make sense in confidence. Every cheat here has modes: ['confidence'] and an id starting with 'confidence.'. */

const MODE = 'confidence';

const cheats: CheatDef[] = [];

void MODE;
defineCheats(cheats);
