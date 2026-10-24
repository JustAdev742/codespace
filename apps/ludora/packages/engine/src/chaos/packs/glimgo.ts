import { defineCheats } from '../registry.ts';
import type { CheatDef } from '../types.ts';

/* Cheats that only make sense in glimgo. Every cheat here has modes: ['glimgo'] and an id starting with 'glimgo.'. */

const MODE = 'glimgo';

const cheats: CheatDef[] = [];

void MODE;
defineCheats(cheats);
