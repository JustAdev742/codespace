import { defineCheats } from '../registry.ts';
import type { CheatDef } from '../types.ts';

/* Cheats that only make sense in tug-of-war. Every cheat here has modes: ['tug-of-war'] and an id starting with 'tug-of-war.'. */

const MODE = 'tug-of-war';

const cheats: CheatDef[] = [];

void MODE;
defineCheats(cheats);
