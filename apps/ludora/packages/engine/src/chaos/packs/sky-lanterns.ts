import { defineCheats } from '../registry.ts';
import type { CheatDef } from '../types.ts';

/* Cheats that only make sense in sky-lanterns. Every cheat here has modes: ['sky-lanterns'] and an id starting with 'sky-lanterns.'. */

const MODE = 'sky-lanterns';

const cheats: CheatDef[] = [];

void MODE;
defineCheats(cheats);
