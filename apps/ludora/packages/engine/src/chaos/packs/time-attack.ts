import { defineCheats } from '../registry.ts';
import type { CheatDef } from '../types.ts';

/* Cheats that only make sense in time-attack. Every cheat here has modes: ['time-attack'] and an id starting with 'time-attack.'. */

const MODE = 'time-attack';

const cheats: CheatDef[] = [];

void MODE;
defineCheats(cheats);
