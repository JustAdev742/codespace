import { defineCheats } from '../registry.ts';
import type { CheatDef } from '../types.ts';

/* Cheats that only make sense in lantern-lands. Every cheat here has modes: ['lantern-lands'] and an id starting with 'lantern-lands.'. */

const MODE = 'lantern-lands';

const cheats: CheatDef[] = [];

void MODE;
defineCheats(cheats);
