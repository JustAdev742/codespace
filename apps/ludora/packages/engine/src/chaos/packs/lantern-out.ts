import { defineCheats } from '../registry.ts';
import type { CheatDef } from '../types.ts';

/* Cheats that only make sense in lantern-out. Every cheat here has modes: ['lantern-out'] and an id starting with 'lantern-out.'. */

const MODE = 'lantern-out';

const cheats: CheatDef[] = [];

void MODE;
defineCheats(cheats);
