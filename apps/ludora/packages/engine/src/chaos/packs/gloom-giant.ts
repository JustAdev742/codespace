import { defineCheats } from '../registry.ts';
import type { CheatDef } from '../types.ts';

/* Cheats that only make sense in gloom-giant. Every cheat here has modes: ['gloom-giant'] and an id starting with 'gloom-giant.'. */

const MODE = 'gloom-giant';

const cheats: CheatDef[] = [];

void MODE;
defineCheats(cheats);
