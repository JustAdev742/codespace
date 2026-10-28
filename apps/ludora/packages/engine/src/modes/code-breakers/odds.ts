/*
 * Code Breakers odds and amounts for the current moment: the tables in
 * meta.ts with the settings, the event and the player's level and boosts
 * applied. Pure functions over plain values, shared by the engine (to draw
 * and open packets) and the screens (to show the odds), so both always agree.
 */
import {
  BITS_ODDS,
  BOOST_ODDS,
  DEFENCE_ODDS,
  DOUBLE,
  FIREWALL_MAX,
  BACKUP_MAX,
  HACK_ODDS,
  HACK_WEIGHT_LOCKDOWN,
  KIND_WEIGHTS,
  LEVEL_BONUS,
  LEVEL_EVERY,
  PACKET_KINDS,
  REFUND_BITS,
  STEAL,
  SURGE,
  type ContentId,
  type EventId,
  type PacketKind,
} from './meta.ts';

/** The constants the screens show, from one entry point (`@ludora/engine/code-breakers`). */
export {
  EVENT_INFO,
  EVENT_TIMING,
  FIREWALL_MAX,
  BACKUP_MAX,
  KIND_INFO,
  LEVEL_EVERY,
  OFFER_SIZE,
  OPTIONS,
  PACKET_KINDS,
  PASSWORD_COOLDOWN_SEC,
  SHOP,
  STEAL,
  TIMING,
  VAULT,
  type ContentId,
  type EventId,
  type PacketKind,
  type ShopItem,
} from './meta.ts';

/** The view and action shapes, for the screens, from the same entry point (`@ludora/engine/code-breakers`). */
export type * from './types.ts';
/** The word lists, so a screen can show a passphrase nicely. */
export { COLOURS, ANIMALS, VERBS, phraseWords } from './words.ts';

export interface OddsMoment {
  lockdown: boolean;
  /** The event running now, if any. */
  event: EventId | null;
  level: number;
  /** Surge charges left (×1.25 on the next Bits packets). */
  surge: number;
  /** Double charges left (×2 on the next Bits packet). */
  double: number;
  firewall: number;
  backup: number;
}

export interface OddsRow<T extends string = string> {
  id: T;
  weight: number;
}

/** Your level after `rights` right answers: 1, then one more every LEVEL_EVERY. */
export function levelOf(rights: number): number {
  return 1 + Math.floor(Math.max(0, rights) / LEVEL_EVERY);
}

/** Right answers still needed to reach the next level. */
export function toNextLevel(rights: number): number {
  return LEVEL_EVERY - (Math.max(0, rights) % LEVEL_EVERY);
}

/** Bits packets are worth this many times their face value at a level (+25% a level). */
export function levelMultiplier(level: number): number {
  return 1 + LEVEL_BONUS * Math.max(0, level - 1);
}

/** Data Storm, a surge and a double each multiply a Bits packet; they stack. */
export function bitsMultiplier(m: Pick<OddsMoment, 'event' | 'surge' | 'double'>): number {
  return (m.event === 'storm' ? 2 : 1) * (m.surge > 0 ? SURGE.mult : 1) * (m.double > 0 ? DOUBLE.mult : 1);
}

/** What a Bits packet pays right now. */
export function bitsAmount(base: number, m: Pick<OddsMoment, 'event' | 'surge' | 'double' | 'level'>): number {
  return Math.round(base * levelMultiplier(m.level) * bitsMultiplier(m));
}

/** The steal rule for a hack: Lockdown takes more, and a Bounty doubles the share and the cap against the leader. */
export function stealRule(lockdown: boolean, bounty: boolean): { percent: number; min: number; max: number } {
  const rule = lockdown ? STEAL.lockdown : STEAL.normal;
  return bounty ? { percent: rule.percent * 2, min: rule.min, max: rule.max * 2 } : rule;
}

/** Bits a successful hack takes from a target holding `bits`. */
export function stealAmount(bits: number, rule: { percent: number; min: number; max: number }): number {
  if (bits <= 0) return 0;
  return Math.min(bits, rule.max, Math.max(rule.min, Math.round((bits * rule.percent) / 100)));
}

/** Relative weight of each kind right now. */
export function kindWeights(m: Pick<OddsMoment, 'lockdown'>): Record<PacketKind, number> {
  const hack = m.lockdown ? HACK_WEIGHT_LOCKDOWN : KIND_WEIGHTS.hack;
  return { bits: KIND_WEIGHTS.bits + (KIND_WEIGHTS.hack - hack), boost: KIND_WEIGHTS.boost, hack, defence: KIND_WEIGHTS.defence };
}

/** What a packet of `kind` may hold, with relative weights. */
export function contentWeights(kind: PacketKind): readonly OddsRow<ContentId>[] {
  switch (kind) {
    case 'bits':
      return BITS_ODDS;
    case 'boost':
      return BOOST_ODDS;
    case 'hack':
      return HACK_ODDS;
    case 'defence':
      return DEFENCE_ODDS;
  }
}

/** The chance of each kind right now, in percent. */
export function kindPercents(m: Pick<OddsMoment, 'lockdown'>): { kind: PacketKind; percent: number }[] {
  const w = kindWeights(m);
  const total = PACKET_KINDS.reduce((n, k) => n + w[k], 0);
  return PACKET_KINDS.filter((k) => w[k] > 0).map((kind) => ({ kind, percent: (w[kind] / total) * 100 }));
}

/** Which kind a content belongs to. */
export function kindOfContent(id: ContentId): PacketKind {
  for (const kind of PACKET_KINDS) if (contentWeights(kind).some((r) => r.id === id)) return kind;
  return 'bits';
}

const fmt = (n: number) => String(Math.round(n)).replace(/\B(?=(\d{3})+(?!\d))/g, ',');

/** A short label for what a packet holds, as a player reads it, with the level, event and boosts applied. */
export function contentLabel(id: ContentId, m: OddsMoment): string {
  const b = BITS_ODDS.find((r) => r.id === id);
  if (b) return `+${fmt(bitsAmount(b.bits, m))} bits`;
  switch (id) {
    case 'surge':
      return `Bits ×${String(SURGE.mult)} for ${String(SURGE.charges)} packets`;
    case 'double':
      return 'Next Bits ×2';
    case 'hack':
      return `Hack: take ${String(stealRule(m.lockdown, false).percent)}%`;
    case 'hint':
      return 'Hack with a hint';
    case 'firewall':
      return m.firewall >= FIREWALL_MAX ? `Firewall (full: +${String(REFUND_BITS)} bits)` : 'Firewall';
    case 'backup':
      return m.backup >= BACKUP_MAX ? `Backup (full: +${String(REFUND_BITS)} bits)` : 'Backup';
    case 'password':
      return 'Free new password';
    default:
      return id;
  }
}

/** A longer line for the odds panel: what this content does. */
export function contentHelp(id: ContentId, m: OddsMoment): string {
  const b = BITS_ODDS.find((r) => r.id === id);
  if (b) {
    const parts = [m.level > 1 ? `Level ${String(m.level)}: ×${String(levelMultiplier(m.level))}.` : '', bitsMultiplier(m) > 1 ? `Paid ×${String(bitsMultiplier(m))} right now.` : ''].filter(Boolean);
    return parts.length ? parts.join(' ') : 'Bits for your score.';
  }
  const steal = stealRule(m.lockdown, false);
  switch (id) {
    case 'surge':
      return `Your next ${String(SURGE.charges)} Bits packets pay ×${String(SURGE.mult)}.`;
    case 'double':
      return 'Your next Bits packet pays double.';
    case 'hack':
      return `Guess a rival’s password from 4 options. Right: take ${String(steal.percent)}% of their bits, up to ${fmt(steal.max)}. If nobody can be hacked, it becomes bits.`;
    case 'hint':
      return 'A hack that crosses off one wrong option before you guess.';
    case 'firewall':
      return `Stops one hack that guessed right, then breaks. Hold up to ${String(FIREWALL_MAX)}.`;
    case 'backup':
      return 'Gives back half of what the next successful hack on you takes.';
    case 'password':
      return 'A new passphrase and decoys, free. Hackers lose everything they learned about you.';
    default:
      return '';
  }
}

/** The whole odds panel: each kind's chance, and inside it each content's chance and label. Percents are rounded to one decimal place. */
export function oddsTable(m: OddsMoment): { kind: PacketKind; percent: number; rows: { id: ContentId; label: string; percent: number }[] }[] {
  const round1 = (x: number) => Math.round(x * 10) / 10;
  return kindPercents(m).map(({ kind, percent }) => {
    const rows = contentWeights(kind);
    const total = rows.reduce((n, r) => n + r.weight, 0);
    return { kind, percent: round1(percent), rows: rows.map((r) => ({ id: r.id, label: contentLabel(r.id, m), percent: round1((r.weight / total) * 100) })) };
  });
}
