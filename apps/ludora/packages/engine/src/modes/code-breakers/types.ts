/*
 * Code Breakers: the shapes of the views and actions, for the screens.
 * Types only, so the browser can import them (through
 * `@ludora/engine/code-breakers`) without any game logic. The mode's view()
 * is typed against these, so they cannot drift apart.
 */
import type { FeedbackView, QuestionView } from '../../sdk/types.ts';
import type { ContentId, EventId, PacketKind, ShopItem } from './meta.ts';

/* --------------------------------- actions -------------------------------- */

export type CodeBreakersAction =
  | { type: 'answer'; iid: string; answer: unknown }
  /** Pick one of the three passphrases offered at the start (0, 1 or 2). */
  | { type: 'choosePassword'; index: number }
  /** Open one packet of the offer `offer` (its seq). */
  | { type: 'pick'; offer: number; index: number }
  /** Choose who to hack (a player id, or the vault's id in Heist). */
  | { type: 'target'; playerId: string }
  /** Pick one of the options shown in `you.hack.options`; `seq` is `you.hack.seq`. */
  | { type: 'guess'; seq: number; index: number }
  | { type: 'buy'; item: ShopItem }
  /** Use the free hack back in `you.hackBack`. */
  | { type: 'hackBack' };

/* ---------------------------------- shared -------------------------------- */

export interface BoardRow {
  playerId: string;
  name: string;
  teamId: string | null;
  bits: number;
  /** Firewall charges and 2FA are on show to everyone, like a lock on a door. */
  firewall: number;
  twoFactor: boolean;
  /** Equal bits share a rank. */
  rank: number;
  isYou: boolean;
}

export interface TeamRow {
  teamId: string;
  name: string;
  hue: number;
  members: number;
  /** The team's score: the average bits of its players (so uneven teams are fair). */
  average: number;
}

export interface EventView {
  id: EventId;
  endsAt: number;
}

export interface VaultView {
  id: string;
  name: string;
  bits: number;
  cracks: number;
}

interface BaseView {
  endsAt: number;
  goal: number;
  lockdown: boolean;
  heist: boolean;
  teamIntel: boolean;
  event: EventView | null;
  /** When the next event starts, or null when no more will run. Which event it is stays secret until then. */
  nextEventAt: number | null;
  /** During a Bounty: the leaders, who are worth twice as much to hack. */
  bounty: string[] | null;
  vault: VaultView | null;
  players: number;
  board: BoardRow[];
  teams: TeamRow[] | null;
}

/* ---------------------------------- player -------------------------------- */

export interface TargetRow {
  playerId: string;
  name: string;
  bits: number;
  firewall: number;
  twoFactor: boolean;
  vault: boolean;
  /** Why this target cannot be chosen now: still picking a passphrase, or you tried them in the last 15 seconds (until `until`). */
  blocked: 'setup' | 'recent' | null;
  until: number | null;
  /** Options you have crossed off for this target, and whether you know their password. */
  crossed: number;
  cracked: boolean;
}

export type HackView =
  | {
      stage: 'target';
      seq: number;
      source: 'hack' | 'hint' | 'back';
      deadline: number;
      /** Everyone who could be hacked at all (the list shows the richest TARGET_LIST_MAX). */
      total: number;
      targets: TargetRow[];
    }
  | {
      stage: 'guess';
      seq: number;
      source: 'hack' | 'hint' | 'back';
      deadline: number;
      /** The target was picked for you when time ran out. */
      auto: boolean;
      target: { playerId: string; name: string };
      /**
       * The real password and its decoys, minus any you crossed off, in an order only you see
       * (stable for you until the password changes). None is marked as the real one: it is
       * indistinguishable from the decoys, and it appears nowhere else in anyone's view.
       */
      options: { text: string }[];
      /** Options you have already ruled out for this target (all decoys), shown struck through. */
      crossed: string[];
    }
  | {
      /** The guess was right and the target has 2FA: answer `you.question` right for it to count. */
      stage: 'verify';
      seq: number;
      source: 'hack' | 'hint' | 'back';
      deadline: number;
      target: { playerId: string; name: string };
    };

export type HackOutcome = 'stolen' | 'firewall' | 'twoFactor' | 'wrong' | 'noTarget' | 'changed' | 'left';

export interface HackResultView {
  seq: number;
  at: number;
  target: string | null;
  name: string | null;
  outcome: HackOutcome;
  /** Bits you gained. */
  bits: number;
  title: string;
  detail: string | null;
}

export interface IncidentView {
  id: number;
  at: number;
  by: string;
  name: string;
  /** hacked: they took bits; firewall / twoFactor: they guessed right but were stopped; intrusion: they guessed wrong. */
  kind: 'hacked' | 'firewall' | 'twoFactor' | 'intrusion';
  /** Bits you lost (hacked) or earned (intrusion). */
  bits: number;
  /** They know your password now: a new password wipes that. */
  knows: boolean;
  text: string;
}

export interface OpenedView {
  seq: number;
  at: number;
  kind: PacketKind;
  content: ContentId;
  delta: number;
  title: string;
  detail: string | null;
}

export interface ShopRow {
  item: ShopItem;
  cost: number;
  can: boolean;
  reason: string | null;
}

export interface OddsGroup {
  kind: PacketKind;
  percent: number;
  rows: { id: ContentId; label: string; percent: number }[];
}

export interface YouView {
  bits: number;
  rank: number | null;
  teamId: string | null;
  level: number;
  rights: number;
  toNext: number;
  /** Your own password. Nobody else ever sees it marked as yours. Null while you are still picking. */
  password: string | null;
  choosing: { options: string[]; deadline: number } | null;
  /** When you may change your password again. */
  passwordReadyAt: number;
  defences: { firewall: number; firewallMax: number; twoFactor: boolean; backup: number; backupMax: number; exposed: number };
  shop: ShopRow[];
  boosts: { surge: number; double: number };
  /** Someone in the game could hack you. */
  hackable: boolean;
  /** An offer shows each packet's kind only. */
  offer: { seq: number; packets: { kind: PacketKind }[] } | null;
  hack: HackView | null;
  result: HackResultView | null;
  hackBack: { playerId: string; name: string; until: number } | null;
  /** What you (or your team, with team intel) have learned, most recent first. */
  notes: { playerId: string; name: string; crossed: number; cracked: boolean }[];
  incidents: IncidentView[];
  opened: OpenedView | null;
  odds: OddsGroup[];
  question: QuestionView | null;
  last: FeedbackView | null;
}

export interface CodeBreakersPlayerView extends BaseView {
  you: YouView | null;
}

/* ----------------------------------- host --------------------------------- */

export interface TowerRow {
  playerId: string;
  name: string;
  teamId: string | null;
  bits: number;
  level: number;
  firewall: number;
  twoFactor: boolean;
}

export interface HackNewsView {
  id: number;
  at: number;
  by: string;
  to: string;
  name: string;
  target: string;
  outcome: 'stolen' | 'firewall' | 'twoFactor' | 'wrong';
  bits: number;
}

export interface NewsView {
  id: number;
  at: number;
  kind: 'bigHack' | 'vault' | 'bigBits' | 'goal' | 'event';
  by: string | null;
  to: string | null;
  name: string | null;
  target: string | null;
  bits: number;
  event: EventId | null;
}

export interface CodeBreakersHostView extends BaseView {
  /** Every player's tower, richest first (at most 60). */
  towers: TowerRow[];
  /** Recent hacks between players, newest first, for the packets flying between towers. */
  hacks: HackNewsView[];
  news: NewsView[];
  totals: { bits: number; attempts: number; landed: number; stolen: number; blocked: number };
}
