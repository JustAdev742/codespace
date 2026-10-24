import { defineCheats } from '../registry.ts';
import type { CheatDef } from '../types.ts';

/* Cheats that only make sense in classic. Every cheat here has modes: ['classic'] and an id starting with 'classic.'. */

const MODE = 'classic';

const cheats: CheatDef[] = [];

void MODE;
defineCheats(cheats);
