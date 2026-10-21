/*
 * TEMPLATE: copy this folder to modes/<your-mode-id>/ to start a new mode.
 * This file is metadata only: the browser imports it for the catalogue, so
 * never import game logic from here.
 */
import type { ModeMeta, SettingField } from '@ludora/shared';
import type { ModeVariant } from '../../sdk/types.ts';

export const meta: ModeMeta = {
  id: 'template-race', // kebab-case, unique across modes and variants
  title: 'First to Ten',
  tagline: 'One line a player understands at a glance.',
  description: 'Two or three sentences: what you do, how you win, what makes it different.',
  category: 'arcade', // quiz | strategy | arcade | puzzle | party | learning
  pacing: 'self', // host (synced rounds) | self (own pace, host screen watches) | solo
  players: { min: 1, max: 200, recommended: '2 to 40' },
  duration: { min: 3, max: 8 },
  difficulty: 1, // 1 easy to learn, 2 some strategy, 3 deep strategy
  teams: 'optional', // none | optional | required
  questionTypes: ['mcq', 'multi', 'truefalse', 'short', 'numeric', 'order', 'match'], // others get converted when possible
  minQuestions: 5,
  common: { fields: ['timeLimitSec'], defaults: { timeLimitSec: 300 } },
  rules: ['Short sentences, one rule each.', 'Players read these before playing.'],
  thumbnail: { glyph: 'spark', hue: 160, accentHue: 40 }, // glyph names: web/src/art/ModeArt.tsx
  status: 'playable', // only after the conformance tests pass; otherwise 'beta' or 'planned'
};

export const settings: SettingField[] = [{ kind: 'number', key: 'target', label: 'Correct answers to win', min: 3, max: 50, step: 1, default: 10 }];

/** Variants are presets that change the rules in a way a player would notice. Not cosmetic renames. */
export const variants: ModeVariant[] = [];
