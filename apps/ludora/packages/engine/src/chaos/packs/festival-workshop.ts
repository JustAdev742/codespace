import { defineCheats } from '../registry.ts';
import type { CheatDef } from '../types.ts';

/* Cheats that only make sense in festival-workshop. Every cheat here has modes: ['festival-workshop'] and an id starting with 'festival-workshop.'. */

const MODE = 'festival-workshop';

const cheats: CheatDef[] = [];

void MODE;
defineCheats(cheats);
