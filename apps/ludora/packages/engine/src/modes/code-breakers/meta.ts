/*
 * Code Breakers: metadata, settings, variants and every table the mode uses.
 * Metadata and plain data only: the browser imports this for the catalogue
 * and for the odds panel, so no game logic lives here.
 */
import type { ModeMeta, SettingField } from '@ludora/shared';
import type { ModeVariant } from '../../sdk/types.ts';

export const meta: ModeMeta = {
  id: 'code-breakers',
  title: 'Code Breakers',
  tagline: 'Mine bits, guess rivals’ passwords, and guard your own with firewalls and 2FA.',
  description:
    'Every right answer lets you pick one of three data packets: bits, a boost, a hack or a defence. A hack lets you guess a rival’s password from four options and take a share of their bits. Wrong guesses are crossed off, firewalls and 2FA stop hackers, and a new password wipes everything they have learned. The most bits when time runs out wins.',
  category: 'strategy',
  pacing: 'self',
  players: { min: 1, max: 200, recommended: '3 to 40' },
  duration: { min: 5, max: 10 },
  difficulty: 2,
  teams: 'optional',
  questionTypes: ['mcq', 'multi', 'truefalse', 'short', 'numeric', 'order', 'match'],
  minQuestions: 5,
  common: {
    fields: ['timeLimitSec'],
    defaults: { timeLimitSec: 420 },
    help: { timeLimitSec: 'The game ends when time runs out. With no limit set, it ends after 7 minutes.' },
  },
  rules: [
    'At the start, pick one of three passphrases. If you do not pick within 20 seconds, the first one is yours.',
    'Every right answer lets you pick one of three data packets. A packet shows its kind (Bits, Boost, Hack or Defence), never exactly what is inside.',
    'Bits packets add bits. Every 5 right answers they hold more. Boost packets make your next Bits packets pay more.',
    'A Hack packet lets you guess a rival’s password from 4 options. Right: take 20% of their bits. Wrong: they are warned and earn a few bits, and that option is crossed off for you.',
    'A firewall stops one hack that guessed right, then breaks. With 2FA, a hacker who guesses right must also answer one more question right.',
    'Spend bits on defences: a firewall, 2FA, or a new password, which wipes everything hackers have learned about you.',
    'If you are hacked, you get one free hack back on the hacker within 30 seconds.',
    'You cannot hack yourself, a teammate, or someone you tried to hack in the last 15 seconds.',
    'Events change the game for 20 seconds at a time: Data Storm, Bounty and System Glitch.',
    'The most bits when time runs out wins. In a team game you only hack the other teams, and the best average wins.',
  ],
  thumbnail: { glyph: 'key', hue: 196, accentHue: 150 },
  status: 'beta',
  stage: '3d',
  tags: ['strategy', 'hacking', 'passwords', 'party', 'projector', 'self-paced', '3d'],
  accessibility: [
    'Every packet shows its kind as a word and an icon, never by colour alone.',
    'Choosing a packet, a target and a password option are ordinary buttons that work with a keyboard or a switch.',
    'The odds of every packet are one tap away, with any event applied.',
    'The whole game plays without 3D: the city is a picture, not the controls.',
  ],
};

/* -------------------------------- packets -------------------------------- */

export const PACKET_KINDS = ['bits', 'boost', 'hack', 'defence'] as const;
export type PacketKind = (typeof PACKET_KINDS)[number];

/** How a kind looks and reads. Colour is never the only cue: each kind has its own word and icon. */
export const KIND_INFO: Record<PacketKind, { label: string; hue: number; icon: 'chip' | 'bolt' | 'key' | 'shield'; blurb: string }> = {
  bits: { label: 'Bits', hue: 190, icon: 'chip', blurb: 'Bits for your score. More of them as you level up.' },
  boost: { label: 'Boost', hue: 45, icon: 'bolt', blurb: 'Your next Bits packets pay more.' },
  hack: { label: 'Hack', hue: 330, icon: 'key', blurb: 'Guess a rival’s password and take some of their bits.' },
  defence: { label: 'Defence', hue: 140, icon: 'shield', blurb: 'A firewall, a backup or a new password.' },
};

/** Relative chance of each kind, drawn on its own for each of the three packets in an offer. */
export const KIND_WEIGHTS: Record<PacketKind, number> = { bits: 46, boost: 14, hack: 22, defence: 18 };
/** Hack weight in Lockdown. The difference goes to Bits, so the kinds still add up to 100. */
export const HACK_WEIGHT_LOCKDOWN = 12;
/** Packets in each offer. */
export const OFFER_SIZE = 3;

export type BitsId = 'bits10' | 'bits20' | 'bits30' | 'bits40' | 'bits50' | 'bits75' | 'bits100' | 'bits200';
export type BoostId = 'surge' | 'double';
export type HackId = 'hack' | 'hint';
export type DefenceId = 'firewall' | 'backup' | 'password';
export type ContentId = BitsId | BoostId | HackId | DefenceId;

/** What a Bits packet holds, before the level, the event and boosts. */
export const BITS_ODDS: readonly { id: BitsId; weight: number; bits: number }[] = [
  { id: 'bits10', weight: 16, bits: 10 },
  { id: 'bits20', weight: 16, bits: 20 },
  { id: 'bits30', weight: 15, bits: 30 },
  { id: 'bits40', weight: 14, bits: 40 },
  { id: 'bits50', weight: 13, bits: 50 },
  { id: 'bits75', weight: 12, bits: 75 },
  { id: 'bits100', weight: 9, bits: 100 },
  { id: 'bits200', weight: 5, bits: 200 },
];

/** What a Boost packet holds. */
export const BOOST_ODDS: readonly { id: BoostId; weight: number }[] = [
  { id: 'surge', weight: 65 },
  { id: 'double', weight: 35 },
];
/** Surge: your next `charges` Bits packets pay ×`mult`. You can hold at most `max` charges. */
export const SURGE = { mult: 1.25, charges: 3, max: 6 } as const;
/** Double: your next Bits packet pays ×2. You can hold at most `max`. */
export const DOUBLE = { mult: 2, max: 2 } as const;

/** What a Hack packet holds. A hint crosses off one wrong option before you guess. */
export const HACK_ODDS: readonly { id: HackId; weight: number }[] = [
  { id: 'hack', weight: 75 },
  { id: 'hint', weight: 25 },
];

/** What a Defence packet holds. A password packet is a free password change. */
export const DEFENCE_ODDS: readonly { id: DefenceId; weight: number }[] = [
  { id: 'firewall', weight: 55 },
  { id: 'backup', weight: 25 },
  { id: 'password', weight: 20 },
];

/** Firewall charges you can hold at once. */
export const FIREWALL_MAX = 2;
/** Backups you can hold at once. A backup gives back half of what the next successful hack on you takes. */
export const BACKUP_MAX = 1;
/** Bits instead of a firewall, backup or boost you have no room for. */
export const REFUND_BITS = 40;

/** Your level rises every this many right answers. */
export const LEVEL_EVERY = 5;
/** Each level adds this share to Bits packets (+25%). */
export const LEVEL_BONUS = 0.25;

/* -------------------------------- hacking -------------------------------- */

/** Options a hacker chooses from: the real password and its decoys. */
export const OPTIONS = 4;
/** Passphrases offered at the start. The two you do not pick, and one more, become your decoys. */
export const PASSWORD_CHOICES = 3;

/**
 * What a successful hack takes: `percent` of the target's bits, at least
 * `min` (or all they have) and at most `max`. A Bounty doubles both
 * `percent` and `max` against the leader.
 */
export const STEAL: Record<'normal' | 'lockdown', { percent: number; min: number; max: number }> = {
  normal: { percent: 20, min: 10, max: 400 },
  lockdown: { percent: 35, min: 10, max: 600 },
};
/** A wrong guess warns the target and pays them this ("intrusion detected"). */
export const INTRUSION_BITS = 15;
/** A Hack packet with nobody to hack becomes this many bits (grows with your level). */
export const NO_TARGET_BITS = 30;

/** Seconds for each step of the game. */
export const TIMING = {
  /** To pick a passphrase at the start (or on joining late). */
  passwordSec: 20,
  /** To choose who to hack, before it goes to the richest player you may hack. */
  targetSec: 15,
  /** To pick an option, before one is picked for you at random. */
  guessSec: 15,
  /** To answer the 2FA question. */
  verifySec: 25,
  /** You cannot hack the same target again this soon after trying. */
  guardSec: 15,
  /** A hacked player has this long to hack back for free. */
  hackBackSec: 30,
} as const;

/** The target list shows at most this many players, richest first. Any rival can still be chosen by id. */
export const TARGET_LIST_MAX = 12;

/* ------------------------------- defences -------------------------------- */

export type ShopItem = 'firewall' | 'twoFactor' | 'password';

/** Defences bought with bits. Spending lowers your score, so each one is a real trade-off. */
export const SHOP: Record<ShopItem, { label: string; cost: number; blurb: string }> = {
  firewall: { label: 'Firewall', cost: 80, blurb: 'Stops one hack that guessed right, then breaks. Hold up to 2.' },
  twoFactor: { label: '2FA', cost: 200, blurb: 'A hacker who guesses right must also answer a question right. Lasts all game.' },
  password: { label: 'New password', cost: 50, blurb: 'New passphrase and decoys. Wipes everything hackers have learned about you.' },
};
/** Seconds between password changes. */
export const PASSWORD_COOLDOWN_SEC = 30;

/* --------------------------------- heist --------------------------------- */

/**
 * Heist: a vault in the middle that everyone can hack. It starts with
 * `start` bits and every Bits packet anyone opens adds `share` of its bits.
 * It always has 2FA. Cracking it takes everything inside; then it locks
 * with a new password and starts again from `restart`.
 */
export const VAULT = { id: '#vault', name: 'The Vault', start: 150, restart: 100, share: 0.1 } as const;

/* --------------------------------- events -------------------------------- */

export const EVENTS = ['storm', 'bounty', 'glitch'] as const;
export type EventId = (typeof EVENTS)[number];

export const EVENT_INFO: Record<EventId, { label: string; blurb: string; needsHacks: boolean }> = {
  storm: { label: 'Data Storm', blurb: 'Bits packets pay double.', needsHacks: false },
  bounty: { label: 'Bounty', blurb: 'Hacking the leader takes twice as much.', needsHacks: true },
  glitch: { label: 'System Glitch', blurb: 'Everyone’s decoys are replaced, and every hacker’s notes are wiped.', needsHacks: true },
};

/** The first event starts this long into the game, the next ones this far apart, and each lasts this long. */
export const EVENT_TIMING = { firstSec: 60, everySec: 75, lastsSec: 20 } as const;

/* -------------------------------- settings ------------------------------- */

export const settings: SettingField[] = [
  { kind: 'toggle', key: 'events', label: 'Events', help: 'A 20-second event every 75 seconds: Data Storm, Bounty or System Glitch.', default: true },
  { kind: 'number', key: 'goalBits', label: 'Bits to win', help: 'The first player to reach this many bits wins at once. 0 plays until time runs out.', min: 0, max: 10000, step: 250, default: 0, unit: 'bits' },
  { kind: 'toggle', key: 'teamIntel', label: 'Team intel', help: 'In a team game, options crossed off and passwords guessed by one teammate are known to the whole team.', default: false },
  { kind: 'toggle', key: 'lockdown', label: 'Lockdown', help: 'Everyone starts with 2FA. Hack packets are rarer, but a hack takes 35%.', default: false },
  { kind: 'toggle', key: 'heist', label: 'Heist', help: 'A vault in the middle fills up as everyone plays. Crack its password to take everything inside.', default: false },
];

export const variants: ModeVariant[] = [
  {
    meta: {
      id: 'code-breakers-team-ops',
      modeId: 'code-breakers',
      title: 'Team Ops',
      tagline: 'Teams hack other teams and share everything they learn.',
      changes: 'Players are split into teams and only hack the other teams. Team intel is on: an option crossed off or a password guessed by one teammate is known to the whole team. The best average wins.',
      status: 'beta',
      thumbnail: { glyph: 'flag', hue: 220, accentHue: 150 },
    },
    common: { teamCount: 2 },
    settings: { teamIntel: true },
    locked: ['teamIntel'],
  },
  {
    meta: {
      id: 'code-breakers-lockdown',
      modeId: 'code-breakers',
      title: 'Lockdown',
      tagline: 'Everyone starts with 2FA. Hacks are rare, but they take 35%.',
      changes: 'Every player starts with 2FA, so a hacker who guesses right must also answer a question right. Hack packets turn up 12 times in 100 instead of 22, but a successful hack takes 35% of the target’s bits (up to 600) instead of 20%.',
      status: 'beta',
      thumbnail: { glyph: 'shield', hue: 262, accentHue: 190 },
    },
    settings: { lockdown: true },
    locked: ['lockdown'],
  },
  {
    meta: {
      id: 'code-breakers-heist',
      modeId: 'code-breakers',
      title: 'Heist',
      tagline: 'One vault in the middle. Crack it to take everything inside.',
      changes: 'A vault sits in the middle of the city. Every Bits packet anyone opens adds 10% to it. Anyone can hack it: it always has 2FA, and cracking it takes everything inside. Then it locks with a new password, wiping everyone’s notes.',
      status: 'beta',
      thumbnail: { glyph: 'chest', hue: 36, accentHue: 196 },
    },
    settings: { heist: true },
    locked: ['heist'],
  },
];
