import { defineCheats } from '../registry.ts';
import type { CheatDef } from '../types.ts';

/* Cheats that only make sense in lantern-trail. Every cheat here has modes: ['lantern-trail'] and an id starting with 'lantern-trail.'. */

const MODE = 'lantern-trail';

const cheats: CheatDef[] = [];

void MODE;
defineCheats(cheats);
