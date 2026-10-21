import type { SeedSet } from '../types.ts';
import { ancientCivilisations } from './ancient-civilisations.ts';
import { artColour } from './art-colour.ts';
import { codingComputers } from './coding-computers.ts';
import { elementsMatter } from './elements-matter.ts';
import { fractionsDecimalsPercentages } from './fractions-decimals-percentages.ts';
import { frenchStarter } from './french-starter.ts';
import { generalKnowledge } from './general-knowledge.ts';
import { grammarPunctuation } from './grammar-punctuation.ts';
import { healthyHabitsSport } from './healthy-habits-sport.ts';
import { humanBody } from './human-body.ts';
import { inventionsDiscoveries } from './inventions-discoveries.ts';
import { musicBasics } from './music-basics.ts';
import { plantsEcosystems } from './plants-ecosystems.ts';
import { riversMountainsOceans } from './rivers-mountains-oceans.ts';
import { shapesAngles } from './shapes-angles.ts';
import { solarSystem } from './solar-system.ts';
import { spanishStarter } from './spanish-starter.ts';
import { timesTables } from './times-tables.ts';
import { wordMeanings } from './word-meanings.ts';
import { worldCapitals } from './world-capitals.ts';

/** Built-in question sets, grouped roughly by subject. All original to Ludora. */
export const SETS: SeedSet[] = [
  timesTables,
  fractionsDecimalsPercentages,
  shapesAngles,
  worldCapitals,
  riversMountainsOceans,
  solarSystem,
  humanBody,
  plantsEcosystems,
  elementsMatter,
  ancientCivilisations,
  inventionsDiscoveries,
  grammarPunctuation,
  wordMeanings,
  spanishStarter,
  frenchStarter,
  codingComputers,
  musicBasics,
  healthyHabitsSport,
  artColour,
  generalKnowledge,
];
