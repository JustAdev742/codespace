import { defineCheats } from '../registry.ts';
import type { CheatDef } from '../types.ts';

/* Cheats that only make sense in lantern-guard. Every cheat here has modes: ['lantern-guard'] and an id starting with 'lantern-guard.'. */

const MODE = 'lantern-guard';

const cheats: CheatDef[] = [];

void MODE;
defineCheats(cheats);
