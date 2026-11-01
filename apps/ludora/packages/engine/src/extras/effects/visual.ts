import { defineCheats } from '../registry.ts';
import { LOOKS, TAUNTS, type Look, type LookGroup } from '../overlays.ts';
import type { CheatDef } from '../types.ts';

/*
 * Category F: visual and interface. These change what an opponent's screen
 * shows for a few seconds: the server keeps the effect and tells the
 * target's browser to draw it, so it reaches them on every device they are
 * playing on and survives a reconnect. They never claim anything happened
 * in the game; they only make it harder (or sillier) to look at.
 */

interface LookSpec {
  look: Look;
  name: string;
  description: string;
  seconds: number;
  cost: number;
  target?: 'opponent' | 'everyone-else';
}

const groupOf = (look: Look): LookGroup => (Object.keys(LOOKS) as LookGroup[]).find((g) => (LOOKS[g] as readonly string[]).includes(look))!;

const specs: LookSpec[] = [
  // Transforms: the whole game area moves.
  { look: 'upside-down', name: 'Upside Down', description: 'An opponent\'s game screen turns upside down for 12 seconds.', seconds: 12, cost: 20 },
  { look: 'mirror', name: 'Mirror World', description: 'An opponent\'s game screen is flipped left to right for 15 seconds.', seconds: 15, cost: 20 },
  { look: 'tilt', name: 'Wonky Tilt', description: 'An opponent\'s game screen tilts sideways by about 12 degrees for 15 seconds.', seconds: 15, cost: 10 },
  { look: 'tiny', name: 'Shrink Ray', description: 'An opponent\'s game shrinks to 60% of its size for 12 seconds.', seconds: 12, cost: 15 },
  { look: 'zoom', name: 'Magnifying Glass', description: 'An opponent\'s game is zoomed in so far that the edges fall off the screen, for 10 seconds.', seconds: 10, cost: 20 },
  { look: 'squash', name: 'Pancake', description: 'An opponent\'s game is squashed flat to half its height for 12 seconds.', seconds: 12, cost: 15 },
  { look: 'stretch', name: 'Noodle Screen', description: 'An opponent\'s game is stretched tall and thin for 12 seconds.', seconds: 12, cost: 15 },
  { look: 'spin', name: 'Merry-Go-Round', description: 'An opponent\'s game slowly turns a full circle every 8 seconds, for 10 seconds.', seconds: 10, cost: 25 },
  { look: 'wobble', name: 'Jelly Screen', description: 'An opponent\'s game wobbles like jelly for 12 seconds.', seconds: 12, cost: 15 },
  { look: 'seasick', name: 'Seasick', description: 'An opponent\'s game rocks gently from side to side like a boat for 15 seconds.', seconds: 15, cost: 15 },
  { look: 'sideways', name: 'Sideways', description: 'An opponent\'s game is turned on its side for 10 seconds.', seconds: 10, cost: 25 },
  { look: 'skew', name: 'Funhouse Mirror', description: 'An opponent\'s game is skewed like a funhouse mirror for 12 seconds.', seconds: 12, cost: 15 },
  // Filters: the colours or sharpness change.
  { look: 'blur', name: 'Steamy Glasses', description: 'An opponent\'s screen steams up and slowly clears over 10 seconds.', seconds: 10, cost: 20 },
  { look: 'old-movie', name: 'Old Movie', description: 'An opponent\'s screen turns black and white with film grain for 15 seconds.', seconds: 15, cost: 10 },
  { look: 'invert', name: 'Photo Negative', description: 'An opponent\'s screen shows its colours inverted for 12 seconds.', seconds: 12, cost: 15 },
  { look: 'hue-spin', name: 'Rainbow Shift', description: 'The colours on an opponent\'s screen slowly drift round the rainbow for 15 seconds, so answer colours stop meaning what they did.', seconds: 15, cost: 15 },
  { look: 'night', name: 'Lights Out', description: 'An opponent\'s screen goes very dim for 10 seconds.', seconds: 10, cost: 20 },
  { look: 'washed', name: 'Sunburn', description: 'An opponent\'s screen is washed out bright and pale for 12 seconds.', seconds: 12, cost: 15 },
  { look: 'pixelate', name: 'Pixel Vision', description: 'An opponent\'s screen turns into chunky pixels for 12 seconds.', seconds: 12, cost: 20 },
  { look: 'thermal', name: 'Heat Vision', description: 'An opponent\'s screen shows everything in false heat-camera colours for 12 seconds.', seconds: 12, cost: 15 },
  { look: 'sepia', name: 'Sepia Postcard', description: 'An opponent\'s screen turns brown and faded like an old postcard for 15 seconds.', seconds: 15, cost: 10 },
  // Weather: things drift across the screen.
  { look: 'snow', name: 'Blizzard', description: 'Snow falls thickly over an opponent\'s screen for 15 seconds.', seconds: 15, cost: 15 },
  { look: 'bubbles', name: 'Bubble Bath', description: 'Bubbles float up over an opponent\'s screen for 15 seconds.', seconds: 15, cost: 15 },
  { look: 'leaves', name: 'Autumn Gust', description: 'Leaves blow sideways across an opponent\'s screen for 15 seconds.', seconds: 15, cost: 15 },
  { look: 'rain', name: 'Downpour', description: 'Rain streaks down an opponent\'s screen for 15 seconds.', seconds: 15, cost: 15 },
  { look: 'confetti', name: 'Confetti Cannon', description: 'A burst of confetti drifts down over an opponent\'s screen for 10 seconds.', seconds: 10, cost: 10 },
  { look: 'fireflies', name: 'Fireflies', description: 'Glowing fireflies wander over an opponent\'s screen for 15 seconds.', seconds: 15, cost: 10 },
  { look: 'glim-parade', name: 'Glim Parade', description: 'A parade of little Glims marches across an opponent\'s screen for 12 seconds.', seconds: 12, cost: 15 },
  { look: 'balloons', name: 'Balloon Release', description: 'Balloons rise up over an opponent\'s screen for 12 seconds.', seconds: 12, cost: 15 },
  { look: 'paper-planes', name: 'Paper Planes', description: 'Paper planes swoop across an opponent\'s screen for 12 seconds.', seconds: 12, cost: 15 },
  { look: 'disco', name: 'Disco Fever', description: 'Slow coloured disco lights sweep over every other player\'s screen for 12 seconds.', seconds: 12, cost: 30, target: 'everyone-else' },
  // Blockers: parts of the screen are covered.
  { look: 'fog', name: 'Pea Souper', description: 'Thick fog drifts over parts of an opponent\'s screen for 12 seconds.', seconds: 12, cost: 20 },
  { look: 'sticky-notes', name: 'Sticky Notes', description: 'Sticky notes cover parts of an opponent\'s screen for 15 seconds. They can tap each one to peel it off.', seconds: 15, cost: 20 },
  { look: 'mud', name: 'Mud Splat', description: 'Mud splats an opponent\'s screen for 15 seconds. They can tap the splats to wipe them away.', seconds: 15, cost: 20 },
  { look: 'cobwebs', name: 'Cobwebs', description: 'Cobwebs spread in from the corners of an opponent\'s screen for 15 seconds.', seconds: 15, cost: 15 },
  { look: 'flashlight', name: 'Flashlight', description: 'An opponent\'s screen goes dark except for a torch beam that follows their finger or mouse, for 10 seconds.', seconds: 10, cost: 25 },
  { look: 'peephole', name: 'Peephole', description: 'Only a small drifting circle of an opponent\'s screen stays visible for 10 seconds.', seconds: 10, cost: 25 },
  { look: 'blinds', name: 'Venetian Blinds', description: 'Half-closed blinds cover an opponent\'s screen in stripes for 12 seconds.', seconds: 12, cost: 20 },
  { look: 'curtain', name: 'Stage Curtain', description: 'Curtains slowly close across an opponent\'s screen and open again, over 12 seconds.', seconds: 12, cost: 20 },
  { look: 'ink', name: 'Ink Blot', description: 'An ink blot spreads across an opponent\'s screen from one corner for 12 seconds.', seconds: 12, cost: 20 },
  { look: 'frost', name: 'Jack Frost', description: 'Frost creeps in from the edges of an opponent\'s screen for 15 seconds.', seconds: 15, cost: 15 },
  // Text: the words themselves misbehave.
  { look: 'comic-font', name: 'Comic Relief', description: 'All the text on an opponent\'s screen switches to a goofy hand-drawn font for 15 seconds.', seconds: 15, cost: 10 },
  { look: 'microprint', name: 'Microprint', description: 'The text on an opponent\'s screen shrinks to tiny print for 8 seconds.', seconds: 8, cost: 20 },
  { look: 'jumble', name: 'Jumbled Letters', description: 'The letters inside each word of an opponent\'s question get shuffled (first and last stay put) for 12 seconds.', seconds: 12, cost: 25 },
  { look: 'typewriter', name: 'Typewriter', description: 'For 15 seconds, each new question on an opponent\'s screen types itself out one letter at a time.', seconds: 15, cost: 20 },
  { look: 'backwards', name: 'Backwards Writing', description: 'The writing on an opponent\'s screen is mirrored back to front for 10 seconds.', seconds: 10, cost: 20 },
  { look: 'wavy', name: 'Wavy Words', description: 'The letters on an opponent\'s screen bob up and down like waves for 12 seconds.', seconds: 12, cost: 15 },
  { look: 'caps', name: 'Shouty Caps', description: 'EVERYTHING ON AN OPPONENT\'S SCREEN IS IN CAPITALS for 15 seconds.', seconds: 15, cost: 5 },
  // Interface tricks: the controls misbehave.
  { look: 'dodge', name: 'Slippery Buttons', description: 'An opponent\'s answer buttons slide away from their pointer for 10 seconds (on touch screens they jump to a new spot after each tap).', seconds: 10, cost: 25 },
  { look: 'shrink-buttons', name: 'Shrinking Buttons', description: 'An opponent\'s answer buttons shrink smaller and smaller over 12 seconds.', seconds: 12, cost: 20 },
  { look: 'colour-swap', name: 'Colour Confusion', description: 'The colours of an opponent\'s answer buttons swap around every 2 seconds for 15 seconds.', seconds: 15, cost: 15 },
  { look: 'musical-buttons', name: 'Musical Buttons', description: 'An opponent\'s answer buttons trade places every 3 seconds for 12 seconds.', seconds: 12, cost: 25 },
  { look: 'ghost-buttons', name: 'Ghost Buttons', description: 'An opponent\'s answer buttons fade in and out of sight for 12 seconds.', seconds: 12, cost: 20 },
  { look: 'reverse-choices', name: 'Back to Front', description: 'An opponent sees the choices in reverse order for 15 seconds.', seconds: 15, cost: 10 },
  { look: 'vanishing-question', name: 'Vanishing Ink', description: 'For 15 seconds, the question text on an opponent\'s screen fades away 2 seconds after it appears (the choices stay).', seconds: 15, cost: 30 },
  { look: 'quake', name: 'Earthquake', description: 'Every other player\'s screen rumbles gently for 8 seconds.', seconds: 8, cost: 30, target: 'everyone-else' },
];

const looks: CheatDef[] = specs.map((s) => ({
  id: `look.${s.look}`,
  name: s.name,
  category: 'visual',
  description: s.description,
  target: s.target ?? 'opponent',
  cost: s.cost,
  cooldownMs: 20_000 + s.cost * 600,
  durationMs: s.seconds * 1000,
  tags: [`x:look-${groupOf(s.look)}`, 'look'],
  overlay: () => ({ kind: 'look', look: s.look }),
}));

const hides: CheatDef[] = [
  {
    id: 'look.hide-timer',
    name: 'Lost Watch',
    category: 'visual',
    description: 'An opponent\'s timer disappears from their screen for 20 seconds.',
    target: 'opponent',
    cost: 15,
    cooldownMs: 30_000,
    durationMs: 20_000,
    overlay: () => ({ kind: 'hide', part: 'timer' }),
  },
  {
    id: 'look.hide-scores',
    name: 'Blindfold Board',
    category: 'visual',
    description: 'Scores and the leaderboard disappear from an opponent\'s screen for 25 seconds.',
    target: 'opponent',
    cost: 15,
    cooldownMs: 30_000,
    durationMs: 25_000,
    overlay: () => ({ kind: 'hide', part: 'scores' }),
  },
  {
    id: 'look.hide-names',
    name: 'Masquerade',
    category: 'visual',
    description: 'Every name on an opponent\'s screen turns into question marks for 25 seconds.',
    target: 'opponent',
    cost: 10,
    cooldownMs: 30_000,
    durationMs: 25_000,
    overlay: () => ({ kind: 'hide', part: 'names' }),
  },
  {
    id: 'look.taunt',
    name: 'Taunt',
    category: 'visual',
    description: 'Flashes a big taunt of your choice (from a fixed list) across an opponent\'s screen for 4 seconds, signed with your name.',
    target: 'opponent',
    params: [{ key: 'taunt', label: 'Taunt', kind: 'choice', options: Object.entries(TAUNTS).map(([value, label]) => ({ value, label })), default: 'too-easy' }],
    cost: 5,
    cooldownMs: 20_000,
    durationMs: 4_000,
    overlay: (fx) => ({ kind: 'taunt', taunt: fx.params.taunt, from: fx.caster }),
  },
  {
    id: 'look.golden-glow',
    name: 'Golden Glow',
    category: 'visual',
    description: 'Your name glows gold on everyone\'s leaderboard for 30 seconds.',
    target: 'self',
    cost: 10,
    cooldownMs: 60_000,
    durationMs: 30_000,
    overlayFor: 'all',
    overlay: (fx) => ({ kind: 'glow-player', playerId: fx.caster }),
  },
];

defineCheats([...looks, ...hides]);
