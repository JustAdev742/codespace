/*
 * Code Breakers: answer right to mine bits, guess rivals' passwords to hack
 * them, and guard your own with firewalls, 2FA and fresh passwords. The most
 * bits when the clock runs out wins.
 *
 * A right answer opens an offer of three data packets, each drawn on its own
 * by kind weight. Players see each packet's kind, never its contents, so the
 * pick is a real choice. A Hack packet starts a guess at a rival's password:
 * four options (their real password and three decoys, minus any this hacker
 * has crossed off), shown in an order that is stable for this hacker but
 * never marks which option is real.
 *
 * A password is private. It lives in one place: its owner's own view. During
 * a guess it is one of four look-alike options in the hacker's view and
 * nowhere else. Decoy order is seeded per hacker and per password version, so
 * it gives nothing away and does not shift under them until the password
 * changes.
 */
import { z } from 'zod';
import { answerSchema, createRng, hashString, type Rng } from '@ludora/shared';
import { defineMode } from '../../sdk/define.ts';
import type { ModeContext, PlayerId } from '../../sdk/types.ts';
import { streamInit, streamNext, streamQuestionView, streamSubmit, type StreamState } from '../../mechanics/selfPaced.ts';
import {
  BACKUP_MAX,
  BITS_ODDS,
  DOUBLE,
  EVENTS,
  EVENT_INFO,
  EVENT_TIMING,
  FIREWALL_MAX,
  INTRUSION_BITS,
  LEVEL_EVERY,
  NO_TARGET_BITS,
  OFFER_SIZE,
  OPTIONS,
  PACKET_KINDS,
  PASSWORD_CHOICES,
  PASSWORD_COOLDOWN_SEC,
  REFUND_BITS,
  SHOP,
  SURGE,
  TARGET_LIST_MAX,
  TIMING,
  VAULT,
  meta,
  settings,
  type ContentId,
  type EventId,
  type PacketKind,
  type ShopItem,
} from './meta.ts';
import { bitsAmount, contentWeights, kindWeights, levelMultiplier, levelOf, oddsTable, stealAmount, stealRule, toNextLevel, type OddsMoment } from './odds.ts';
import { makePhrases } from './words.ts';
import type {
  BoardRow,
  CodeBreakersHostView,
  CodeBreakersPlayerView,
  HackResultView,
  HackView,
  IncidentView,
  NewsView,
  OpenedView,
  ShopRow,
  TargetRow,
  TeamRow,
  YouView,
} from './types.ts';

export type { CodeBreakersAction, CodeBreakersPlayerView, CodeBreakersHostView, YouView } from './types.ts';

type Settings = {
  events: boolean;
  goalBits: number;
  teamIntel: boolean;
  lockdown: boolean;
  heist: boolean;
};

interface Packet {
  kind: PacketKind;
  content: ContentId;
}

interface Offer {
  seq: number;
  packets: Packet[];
}

type HackSource = 'hack' | 'hint' | 'back';
type HackStage = 'target' | 'guess' | 'verify';

interface Hack {
  seq: number;
  source: HackSource;
  stage: HackStage;
  target: PlayerId | null;
  /** The target's password version when the guess opened, so a password change mid-hack is caught. */
  version: number;
  /** The question the hacker must answer for 2FA, while verifying. */
  verifyIid: string | null;
  deadline: number;
}

/** What one hacker has learned about one target. */
interface Note {
  /** Decoy option texts ruled out by wrong guesses (or a hint). */
  crossed: string[];
  /** A right guess landed before (even if a firewall or 2FA stopped it). */
  cracked: boolean;
}

interface Incident {
  id: number;
  at: number;
  by: PlayerId;
  kind: IncidentView['kind'];
  bits: number;
  knows: boolean;
}

interface Hacker {
  stream: StreamState;
  bits: number;
  /** The real passphrase, or null while still choosing. */
  password: string | null;
  decoys: string[];
  /** Rises each time the password changes, so decoy order and stale hacks follow it. */
  version: number;
  choosing: { options: string[]; deadline: number } | null;
  firewall: number;
  twoFactor: boolean;
  backup: number;
  surge: number;
  double: number;
  passwordReadyAt: number;
  offer: Offer | null;
  hack: Hack | null;
  /** Targets this hacker tried, and when, for the recent-target guard. */
  tried: Record<PlayerId, number>;
  notes: Record<PlayerId, Note>;
  hackBack: { playerId: PlayerId; until: number } | null;
  result: HackResultView | null;
  incidents: Incident[];
  opened: OpenedView | null;
  seq: number;
  /** Totals for the summary. */
  attempts: number;
  landed: number;
}

interface Vault {
  bits: number;
  password: string;
  decoys: string[];
  version: number;
  cracks: number;
}

interface HackNews {
  id: number;
  at: number;
  by: PlayerId;
  to: PlayerId;
  outcome: 'stolen' | 'firewall' | 'twoFactor' | 'wrong';
  bits: number;
}

interface News {
  id: number;
  at: number;
  kind: NewsView['kind'];
  by: PlayerId | null;
  to: PlayerId | null;
  bits: number;
  event: EventId | null;
}

interface GameEvent {
  id: EventId;
  startedAt: number;
  endsAt: number;
}

interface State {
  hackers: Record<PlayerId, Hacker>;
  vault: Vault | null;
  endsAt: number;
  event: GameEvent | null;
  nextEventAt: number | null;
  lastEvent: EventId | null;
  hackNews: HackNews[];
  news: News[];
  seq: number;
  attempts: number;
  landed: number;
  stolen: number;
  blocked: number;
  biggestHack: { by: PlayerId; from: PlayerId; bits: number } | null;
  winner: PlayerId | null;
}

const action = z.discriminatedUnion('type', [
  z.object({ type: z.literal('answer'), iid: z.string().max(24), answer: answerSchema }),
  z.object({ type: z.literal('choosePassword'), index: z.number().int().min(0).max(PASSWORD_CHOICES - 1) }),
  z.object({ type: z.literal('pick'), offer: z.number().int().min(0), index: z.number().int().min(0).max(OFFER_SIZE - 1) }),
  z.object({ type: z.literal('target'), playerId: z.string().min(1).max(64) }),
  z.object({ type: z.literal('guess'), seq: z.number().int().min(0), index: z.number().int().min(0).max(OPTIONS - 1) }),
  z.object({ type: z.literal('buy'), item: z.enum(['firewall', 'twoFactor', 'password']) }),
  z.object({ type: z.literal('hackBack') }),
]);
type Action = z.infer<typeof action>;

const DEFAULT_TIME_SEC = meta.common.defaults.timeLimitSec!;
const HACK_NEWS_KEEP = 10;
const NEWS_KEEP = 8;
const INCIDENTS_KEEP = 5;
const NOTES_KEEP = 8;
/** Hacks of at least this many bits make the room news. */
const BIG_HACK = 150;
/** Bits packets worth at least this much make the room news. */
const BIG_BITS = 150;

const fmt = (n: number) => String(Math.round(n)).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
const bitsText = (n: number) => `${fmt(n)} ${Math.round(n) === 1 ? 'bit' : 'bits'}`;

function nameOf(ctx: ModeContext, id: PlayerId) {
  if (id === VAULT.id) return VAULT.name;
  return ctx.player(id)?.name ?? ctx.everyone().find((p) => p.id === id)?.name ?? 'A player';
}

function teamOf(ctx: ModeContext, id: PlayerId) {
  return (ctx.player(id) ?? ctx.everyone().find((p) => p.id === id))?.teamId ?? null;
}

function timeLimitMs(ctx: ModeContext<Settings>) {
  return (ctx.common.timeLimitSec > 0 ? ctx.common.timeLimitSec : DEFAULT_TIME_SEC) * 1000;
}

/** Pick one row by weight. */
function pickWeighted<T extends { weight: number }>(rows: readonly T[], rng: Rng): T {
  const live = rows.filter((r) => r.weight > 0);
  const total = live.reduce((n, r) => n + r.weight, 0);
  let roll = rng.next() * total;
  for (const r of live) {
    roll -= r.weight;
    if (roll < 0) return r;
  }
  return live[live.length - 1]!;
}

function newHacker(ctx: ModeContext<Settings>): Hacker {
  const options = makePhrases(ctx.rng, PASSWORD_CHOICES);
  return {
    stream: streamInit(ctx, { present: false }),
    bits: 0,
    password: null,
    decoys: [],
    version: 0,
    choosing: { options, deadline: ctx.now() + TIMING.passwordSec * 1000 },
    firewall: 0,
    twoFactor: ctx.settings.lockdown,
    backup: 0,
    surge: 0,
    double: 0,
    passwordReadyAt: 0,
    offer: null,
    hack: null,
    tried: {},
    notes: {},
    hackBack: null,
    result: null,
    incidents: [],
    opened: null,
    seq: 0,
    attempts: 0,
    landed: 0,
  };
}

/* ------------------------------- passwords -------------------------------- */

/** Lock in a password and its decoys, bump the version, and wipe what every hacker had learned about this player. */
function setPassword(s: State, h: Hacker, password: string, decoys: string[]) {
  h.password = password;
  h.decoys = decoys;
  h.version++;
}

/** Everything hackers have learned about a target is wiped (a new password, or a System Glitch). */
function wipeNotesAbout(s: State, targetId: PlayerId) {
  for (const hk of Object.values(s.hackers)) delete hk.notes[targetId];
}

/** Choose a passphrase at the start: the chosen one is the password, the other two plus a fresh one are the decoys. */
function choosePassword(s: State, ctx: ModeContext<Settings>, id: PlayerId, index: number) {
  const h = s.hackers[id]!;
  const options = h.choosing!.options;
  const chosen = options[index] ?? options[0]!;
  const others = options.filter((o) => o !== chosen);
  const extra = makePhrases(ctx.rng, OPTIONS - 1 - others.length, options);
  setPassword(s, h, chosen, ctx.rng.shuffle([...others, ...extra]));
  h.choosing = null;
  ctx.clearTimer(`pw:${id}`);
  streamNext(h.stream, ctx);
}

/* --------------------------------- notes ---------------------------------- */

/** This hacker's notes about a target, merged with teammates' when team intel is on. */
function effectiveNote(s: State, ctx: ModeContext<Settings>, hackerId: PlayerId, targetId: PlayerId): Note {
  const own = s.hackers[hackerId]?.notes[targetId];
  if (!ctx.settings.teamIntel || !ctx.teams().length) return own ?? { crossed: [], cracked: false };
  const team = teamOf(ctx, hackerId);
  const crossed = new Set<string>();
  let cracked = false;
  for (const p of ctx.players()) {
    if (teamOf(ctx, p.id) !== team) continue;
    const n = s.hackers[p.id]?.notes[targetId];
    if (!n) continue;
    for (const c of n.crossed) crossed.add(c);
    cracked = cracked || n.cracked;
  }
  return { crossed: [...crossed], cracked };
}

function myNote(h: Hacker, targetId: PlayerId): Note {
  return (h.notes[targetId] ??= { crossed: [], cracked: false });
}

/** The real password and decoys of a target (a player or the vault). */
function secretOf(s: State, id: PlayerId): { password: string | null; decoys: string[]; version: number } {
  if (id === VAULT.id) return s.vault ? { password: s.vault.password, decoys: s.vault.decoys, version: s.vault.version } : { password: null, decoys: [], version: 0 };
  const h = s.hackers[id];
  return { password: h?.password ?? null, decoys: h?.decoys ?? [], version: h?.version ?? 0 };
}

/**
 * The option texts a hacker sees for a target, in that hacker's stable order.
 * Seeded by hacker, target and password version, so the order never shifts
 * under the hacker and gives nothing away, and changes when the password does.
 * The real password is in the list, indistinguishable from the decoys.
 */
function optionOrder(id: PlayerId, targetId: PlayerId, secret: { password: string | null; decoys: string[]; version: number }): string[] {
  if (!secret.password) return [];
  const rng = createRng(hashString(`${id}:${targetId}:${String(secret.version)}`));
  return rng.shuffle([secret.password, ...secret.decoys]);
}

/* --------------------------------- rivals --------------------------------- */

/** Everyone this player may hack: the others in the game, never a teammate, plus the vault in Heist. */
function rivals(s: State, ctx: ModeContext<Settings>, id: PlayerId): PlayerId[] {
  const team = ctx.teams().length ? teamOf(ctx, id) : null;
  const people = ctx
    .players()
    .filter((p) => p.id !== id && s.hackers[p.id] && !(team !== null && p.teamId === team))
    .map((p) => p.id);
  return s.vault ? [...people, VAULT.id] : people;
}

/** A rival is in setup (still choosing a passphrase) and cannot be hacked yet. */
function inSetup(s: State, id: PlayerId) {
  return id !== VAULT.id && !s.hackers[id]?.password;
}

/** Why a rival cannot be hacked right now, or null. */
/** When you may next try this target, if you tried them in the last few seconds. The game clock starts at 0, so "never tried" is not a time. */
function triedUntil(h: Hacker, targetId: PlayerId, now: number): number | null {
  const at = h.tried[targetId];
  return at !== undefined && at > now - TIMING.guardSec * 1000 ? at + TIMING.guardSec * 1000 : null;
}

function blockedReason(s: State, h: Hacker, id: PlayerId, targetId: PlayerId, now: number): 'setup' | 'recent' | null {
  if (inSetup(s, targetId)) return 'setup';
  if (triedUntil(h, targetId, now) !== null) return 'recent';
  return null;
}

/** Who a hack may go to: rivals who are ready and not tried recently. If that leaves nobody, the guard is relaxed. */
function hackable(s: State, ctx: ModeContext<Settings>, id: PlayerId): PlayerId[] {
  const h = s.hackers[id];
  if (!h) return [];
  const all = rivals(s, ctx, id).filter((r) => !inSetup(s, r));
  const now = ctx.now();
  const fresh = all.filter((r) => triedUntil(h, r, now) === null);
  return fresh.length ? fresh : all;
}

function richest(s: State) {
  return (a: PlayerId, b: PlayerId) => bitsOf(s, b) - bitsOf(s, a) || a.localeCompare(b);
}

function bitsOf(s: State, id: PlayerId): number {
  return id === VAULT.id ? (s.vault?.bits ?? 0) : (s.hackers[id]?.bits ?? 0);
}

/** The current leaders (most bits among players), for a Bounty. */
function leaders(s: State, ctx: ModeContext): PlayerId[] {
  const ids = ctx.players().filter((p) => s.hackers[p.id]).map((p) => p.id);
  const best = Math.max(0, ...ids.map((id) => s.hackers[id]!.bits));
  return best > 0 ? ids.filter((id) => s.hackers[id]!.bits === best) : [];
}

function moment(s: State, ctx: ModeContext<Settings>, h: Hacker): OddsMoment {
  return {
    lockdown: ctx.settings.lockdown,
    event: s.event?.id ?? null,
    level: levelOf(h.stream.correct),
    surge: h.surge,
    double: h.double,
    firewall: h.firewall,
    backup: h.backup,
  };
}

function incident(s: State, h: Hacker, by: PlayerId, kind: IncidentView['kind'], bits: number, knows: boolean, at: number) {
  h.incidents = [{ id: ++s.seq, at, by, kind, bits, knows }, ...h.incidents].slice(0, INCIDENTS_KEEP);
}

function addHackNews(s: State, at: number, item: Omit<HackNews, 'id' | 'at'>) {
  s.hackNews = [{ id: ++s.seq, at, ...item }, ...s.hackNews].slice(0, HACK_NEWS_KEEP);
}

function addNews(s: State, at: number, item: Omit<News, 'id' | 'at'>) {
  s.news = [{ id: ++s.seq, at, ...item }, ...s.news].slice(0, NEWS_KEEP);
}

/* --------------------------------- offers --------------------------------- */

/** One packet: a kind by the kind weights, then its contents by that kind's table. */
export function drawPacket(m: Pick<OddsMoment, 'lockdown'>, rng: Rng): Packet {
  const weights = kindWeights(m);
  const kind = pickWeighted(
    PACKET_KINDS.map((k) => ({ kind: k, weight: weights[k] })),
    rng,
  ).kind;
  return { kind, content: pickWeighted(contentWeights(kind), rng).id };
}

function makeOffer(s: State, ctx: ModeContext<Settings>, h: Hacker) {
  const m = { lockdown: ctx.settings.lockdown };
  h.offer = { seq: ++h.seq, packets: Array.from({ length: OFFER_SIZE }, () => drawPacket(m, ctx.rng)) };
}

/** After a packet and any hack flow are done: the next question, unless one is already up (a hack back left it). */
function moveOn(s: State, ctx: ModeContext<Settings>, id: PlayerId) {
  const h = s.hackers[id];
  if (!h || s.winner || h.offer || h.hack) return;
  if (h.stream.iid === null) streamNext(h.stream, ctx);
}

function checkGoal(s: State, ctx: ModeContext<Settings>, id: PlayerId) {
  const goal = ctx.settings.goalBits;
  const h = s.hackers[id];
  if (!goal || s.winner || !h || h.bits < goal) return;
  s.winner = id;
  addNews(s, ctx.now(), { kind: 'goal', by: id, to: null, bits: h.bits, event: null });
  ctx.feed(`${nameOf(ctx, id)} reached ${bitsText(goal)}.`, { tone: 'big' });
  ctx.endGame();
}

/* ----------------------------- opening packets ---------------------------- */

function openBits(s: State, ctx: ModeContext<Settings>, id: PlayerId, h: Hacker, content: ContentId, m: OddsMoment): Omit<OpenedView, 'seq' | 'at' | 'kind' | 'content'> {
  const row = BITS_ODDS.find((r) => r.id === content)!;
  const gain = bitsAmount(row.bits, m);
  const used: string[] = [];
  if (m.event === 'storm') used.push('Data Storm doubled it.');
  if (h.double > 0) {
    h.double--;
    used.push('Double paid double.');
  } else if (h.surge > 0) {
    h.surge--;
    used.push('Surge paid more.');
  }
  if (m.level > 1) used.push(`Level ${String(m.level)} bonus.`);
  h.bits += gain;
  if (s.vault) {
    const toVault = Math.round(gain * VAULT.share);
    if (toVault > 0) s.vault.bits += toVault;
  }
  const at = ctx.now();
  if (gain >= BIG_BITS) addNews(s, at, { kind: 'bigBits', by: id, to: null, bits: gain, event: null });
  return { delta: gain, title: `+${bitsText(gain)}`, detail: used.length ? used.join(' ') : null };
}

function openBoost(h: Hacker, content: ContentId): Omit<OpenedView, 'seq' | 'at' | 'kind' | 'content'> {
  if (content === 'double') {
    if (h.double >= DOUBLE.max) return { delta: REFUND_BITS, title: `+${bitsText(REFUND_BITS)}`, detail: 'You already hold enough Doubles, so this became bits.', ...refund(h) };
    h.double = Math.min(DOUBLE.max, h.double + 1);
    return { delta: 0, title: 'Double ready', detail: 'Your next Bits packet pays double.' };
  }
  h.surge = Math.min(SURGE.max, h.surge + SURGE.charges);
  return { delta: 0, title: 'Surge', detail: `Your next ${String(h.surge)} Bits packets pay ×${String(SURGE.mult)}.` };
}

function refund(h: Hacker) {
  h.bits += REFUND_BITS;
  return {};
}

type PacketResult = Omit<OpenedView, 'seq' | 'at' | 'kind' | 'content'> & { changePassword?: boolean };

function openDefence(h: Hacker, content: ContentId): PacketResult {
  if (content === 'firewall') {
    if (h.firewall >= FIREWALL_MAX) {
      h.bits += REFUND_BITS;
      return { delta: REFUND_BITS, title: `+${bitsText(REFUND_BITS)}`, detail: 'Your firewalls are full, so this became bits.' };
    }
    h.firewall++;
    return { delta: 0, title: 'Firewall up', detail: 'It stops one hack that guesses right, then breaks.' };
  }
  if (content === 'backup') {
    if (h.backup >= BACKUP_MAX) {
      h.bits += REFUND_BITS;
      return { delta: REFUND_BITS, title: `+${bitsText(REFUND_BITS)}`, detail: 'You already hold a backup, so this became bits.' };
    }
    h.backup++;
    return { delta: 0, title: 'Backup ready', detail: 'It gives back half of the next hack that lands on you.' };
  }
  // A free password change.
  return { delta: 0, title: 'New password', detail: 'A fresh passphrase; hackers lose what they learned about you.', changePassword: true };
}

/** Open a Hack packet: start a target choice, or turn it into bits when there is nobody to hack. */
function openHack(s: State, ctx: ModeContext<Settings>, id: PlayerId, h: Hacker, source: HackSource, seq: number, m: OddsMoment): Omit<OpenedView, 'seq' | 'at' | 'kind' | 'content'> {
  if (!hackable(s, ctx, id).length) {
    const gain = Math.round(NO_TARGET_BITS * levelMultiplier(m.level));
    h.bits += gain;
    return { delta: gain, title: `No target: +${bitsText(gain)}`, detail: 'Nobody can be hacked right now, so your hack became bits.' };
  }
  const deadline = ctx.now() + TIMING.targetSec * 1000;
  h.hack = { seq, source, stage: 'target', target: null, version: 0, verifyIid: null, deadline };
  ctx.setTimer(`target:${id}`, deadline);
  return { delta: 0, title: source === 'hint' ? 'Hack with a hint' : 'Hack ready', detail: 'Choose who to hack.' };
}

function openPacket(s: State, ctx: ModeContext<Settings>, id: PlayerId, h: Hacker, packet: Packet, seq: number) {
  const m = moment(s, ctx, h);
  const at = ctx.now();
  let result: PacketResult;
  switch (packet.kind) {
    case 'bits':
      result = openBits(s, ctx, id, h, packet.content, m);
      break;
    case 'boost':
      result = openBoost(h, packet.content);
      break;
    case 'hack':
      result = openHack(s, ctx, id, h, packet.content === 'hint' ? 'hint' : 'hack', seq, m);
      break;
    default:
      result = openDefence(h, packet.content);
      break;
  }
  if (result.changePassword) {
    changePassword(s, ctx, id, h);
    delete result.changePassword;
  }
  h.opened = { seq, at, kind: packet.kind, content: packet.content, delta: result.delta, title: result.title, detail: result.detail };
  checkGoal(s, ctx, id);
}

/* --------------------------------- hacking -------------------------------- */

/** The option texts a hacker still has to choose from for a target: the full set minus any crossed off. */
function liveOptions(s: State, ctx: ModeContext<Settings>, id: PlayerId, targetId: PlayerId): string[] {
  const order = optionOrder(id, targetId, secretOf(s, targetId));
  const note = effectiveNote(s, ctx, id, targetId);
  return order.filter((o) => !note.crossed.includes(o));
}

/** Move a waiting hack to its guess step against `targetId`. A hint crosses off one wrong option first. */
function startGuess(s: State, ctx: ModeContext<Settings>, id: PlayerId, h: Hacker, targetId: PlayerId, auto: boolean) {
  const secret = secretOf(s, targetId);
  const hack = h.hack!;
  hack.target = targetId;
  hack.version = secret.version;
  hack.stage = 'guess';
  const at = ctx.now();
  if (hack.source === 'hint') {
    const note = myNote(h, targetId);
    const wrong = optionOrder(id, targetId, secret).filter((o) => o !== secret.password && !note.crossed.includes(o));
    if (wrong.length > 1) note.crossed.push(ctx.rng.pick(wrong));
  }
  ctx.clearTimer(`target:${id}`);
  hack.deadline = at + TIMING.guessSec * 1000;
  ctx.setTimer(`guess:${id}`, hack.deadline);
  // Keep an auto flag on the result slot so the view can say the target was chosen for them.
  h.result = auto ? { seq: hack.seq, at, target: targetId, name: nameOf(ctx, targetId), outcome: 'wrong', bits: 0, title: '', detail: 'auto' } : null;
}

/** Finish a hack with an outcome, record it and tidy up. */
function finishHack(
  s: State,
  ctx: ModeContext<Settings>,
  id: PlayerId,
  h: Hacker,
  targetId: PlayerId,
  outcome: HackResultView['outcome'],
  bits: number,
  title: string,
  detail: string | null,
) {
  const hack = h.hack!;
  h.result = { seq: hack.seq, at: ctx.now(), target: targetId, name: nameOf(ctx, targetId), outcome, bits, title, detail };
  h.hack = null;
  ctx.clearTimer(`guess:${id}`);
  ctx.clearTimer(`verify:${id}`);
  h.tried[targetId] = ctx.now();
}

/** Resolve a correct guess once any 2FA is passed: a firewall absorbs it, otherwise bits are taken. */
function land(s: State, ctx: ModeContext<Settings>, id: PlayerId, h: Hacker, targetId: PlayerId) {
  const at = ctx.now();
  const me = nameOf(ctx, id);
  const them = nameOf(ctx, targetId);
  const isVault = targetId === VAULT.id;
  const target = isVault ? null : s.hackers[targetId]!;
  myNote(h, targetId).cracked = true;

  if (target && target.firewall > 0) {
    target.firewall--;
    s.blocked++;
    incident(s, target, id, 'firewall', 0, true, at);
    addHackNews(s, at, { by: id, to: targetId, outcome: 'firewall', bits: 0 });
    ctx.feed(`${them}’s firewall blocked ${me}’s hack.`, { tone: 'info', to: [id, targetId] });
    finishHack(s, ctx, id, h, targetId, 'firewall', 0, `${them}’s firewall blocked you`, 'You cracked the password, but a firewall stopped the hack and broke.');
    return;
  }

  const bounty = s.event?.id === 'bounty' && leaders(s, ctx).includes(targetId);
  const rule = stealRule(ctx.settings.lockdown, bounty);
  let gain = stealAmount(bitsOf(s, targetId), rule);
  if (isVault) {
    gain = s.vault!.bits;
    s.vault!.bits = VAULT.restart;
    s.vault!.cracks++;
    setVaultPassword(s, ctx);
    h.bits += gain;
    h.landed++;
    s.landed++;
    s.stolen += gain;
    addHackNews(s, at, { by: id, to: targetId, outcome: 'stolen', bits: gain });
    addNews(s, at, { kind: 'vault', by: id, to: null, bits: gain, event: null });
    ctx.feed(`${me} cracked the Vault for ${bitsText(gain)}.`, { tone: 'big' });
    finishHack(s, ctx, id, h, targetId, 'stolen', gain, `Cracked the Vault: +${bitsText(gain)}`, 'The Vault re-locked with a new password.');
    checkGoal(s, ctx, id);
    return;
  }

  let given = 0;
  if (target!.backup > 0 && gain > 0) {
    target!.backup--;
    given = Math.round(gain / 2);
  }
  target!.bits -= gain - given;
  h.bits += gain;
  h.landed++;
  s.landed++;
  s.stolen += gain;
  if (gain > (s.biggestHack?.bits ?? 0)) s.biggestHack = { by: id, from: targetId, bits: gain };
  incident(s, target!, id, 'hacked', gain - given, true, at);
  target!.hackBack = { playerId: id, until: at + TIMING.hackBackSec * 1000 };
  addHackNews(s, at, { by: id, to: targetId, outcome: 'stolen', bits: gain });
  if (gain >= BIG_HACK) addNews(s, at, { kind: 'bigHack', by: id, to: targetId, bits: gain, event: null });
  ctx.feed(`${me} hacked ${them} for ${bitsText(gain)}.`, gain >= BIG_HACK ? { tone: 'big' } : { tone: 'info', to: [id, targetId] });
  const detail = [given > 0 ? `${them}’s backup returned ${bitsText(given)}.` : null, bounty ? 'Bounty doubled the take.' : null].filter(Boolean).join(' ') || null;
  finishHack(s, ctx, id, h, targetId, 'stolen', gain, `Hacked ${them}: +${bitsText(gain)}`, detail);
  checkGoal(s, ctx, id);
}

/** Resolve a guess: right (then maybe 2FA), or wrong (cross it off, warn the target). */
function resolveGuess(s: State, ctx: ModeContext<Settings>, id: PlayerId, h: Hacker, chosen: string) {
  const hack = h.hack!;
  const targetId = hack.target!;
  const secret = secretOf(s, targetId);
  const me = nameOf(ctx, id);
  const them = nameOf(ctx, targetId);
  const at = ctx.now();
  h.attempts++;
  s.attempts++;

  // The target changed password since the guess opened, or has left: the hack fizzles.
  if (!secret.password || secret.version !== hack.version) {
    finishHack(s, ctx, id, h, targetId, 'changed', 0, `${them} slipped away`, 'Their password changed before you could guess.');
    return;
  }

  if (chosen !== secret.password) {
    myNote(h, targetId).crossed.push(chosen);
    if (targetId !== VAULT.id) {
      const target = s.hackers[targetId]!;
      target.bits += INTRUSION_BITS;
      incident(s, target, id, 'intrusion', INTRUSION_BITS, false, at);
      ctx.feed(`Intrusion detected: ${me} tried to hack you. +${bitsText(INTRUSION_BITS)}.`, { tone: 'info', to: [targetId] });
    }
    addHackNews(s, at, { by: id, to: targetId, outcome: 'wrong', bits: 0 });
    finishHack(s, ctx, id, h, targetId, 'wrong', 0, `Wrong guess on ${them}`, 'That option is crossed off. They were warned.');
    return;
  }

  // Right guess. The vault and 2FA players need the extra question first.
  const needs2FA = targetId === VAULT.id || (s.hackers[targetId]?.twoFactor ?? false);
  if (needs2FA) {
    myNote(h, targetId).cracked = true;
    hack.stage = 'verify';
    hack.verifyIid = ctx.questions.present(ctx.rng.pick(ctx.questions.ids()));
    hack.deadline = at + TIMING.verifySec * 1000;
    ctx.clearTimer(`guess:${id}`);
    ctx.setTimer(`verify:${id}`, hack.deadline);
    return;
  }
  land(s, ctx, id, h, targetId);
}

/** The hacker answered the 2FA question: right lands the hack, wrong blocks it. */
function resolveVerify(s: State, ctx: ModeContext<Settings>, id: PlayerId, h: Hacker, correct: boolean) {
  const hack = h.hack!;
  const targetId = hack.target!;
  const them = nameOf(ctx, targetId);
  if (correct) {
    land(s, ctx, id, h, targetId);
    return;
  }
  s.blocked++;
  if (targetId !== VAULT.id) {
    const target = s.hackers[targetId]!;
    incident(s, target, id, 'twoFactor', 0, true, ctx.now());
    ctx.feed(`${nameOf(ctx, id)} cracked your password but 2FA stopped them.`, { tone: 'info', to: [targetId] });
  }
  addHackNews(s, ctx.now(), { by: id, to: targetId, outcome: 'twoFactor', bits: 0 });
  finishHack(s, ctx, id, h, targetId, 'twoFactor', 0, `2FA stopped you on ${them}`, 'You had the password, but could not get past the second factor.');
}

/** Time ran out on a target choice: it goes to the richest player the hacker may hack, or becomes bits. */
function autoTarget(s: State, ctx: ModeContext<Settings>, id: PlayerId) {
  const h = s.hackers[id];
  if (!h?.hack || h.hack.stage !== 'target') return;
  const options = hackable(s, ctx, id).sort(richest(s));
  if (!options.length) {
    const gain = Math.round(NO_TARGET_BITS * levelMultiplier(levelOf(h.stream.correct)));
    h.bits += gain;
    h.result = { seq: h.hack.seq, at: ctx.now(), target: null, name: null, outcome: 'noTarget', bits: gain, title: `No target: +${bitsText(gain)}`, detail: 'Nobody was left to hack.' };
    h.hack = null;
    ctx.clearTimer(`target:${id}`);
    return;
  }
  startGuess(s, ctx, id, h, options[0]!, true);
}

/** Time ran out on a guess: one of the live options is chosen at random. */
function autoGuess(s: State, ctx: ModeContext<Settings>, id: PlayerId) {
  const h = s.hackers[id];
  if (!h?.hack || h.hack.stage !== 'guess') return;
  const live = liveOptions(s, ctx, id, h.hack.target!);
  resolveGuess(s, ctx, id, h, live.length ? ctx.rng.pick(live) : '');
}

/* ------------------------------ password changes -------------------------- */

function changePassword(s: State, ctx: ModeContext<Settings>, id: PlayerId, h: Hacker) {
  const decoys = makePhrases(ctx.rng, OPTIONS, [h.password ?? '', ...h.decoys]);
  setPassword(s, h, decoys[0]!, decoys.slice(1));
  wipeNotesAbout(s, id);
  h.passwordReadyAt = ctx.now() + PASSWORD_COOLDOWN_SEC * 1000;
}

function setVaultPassword(s: State, ctx: ModeContext<Settings>) {
  if (!s.vault) return;
  const phrases = makePhrases(ctx.rng, OPTIONS, [s.vault.password, ...s.vault.decoys]);
  s.vault.password = phrases[0]!;
  s.vault.decoys = phrases.slice(1);
  s.vault.version++;
  wipeNotesAbout(s, VAULT.id);
}

/* --------------------------------- events --------------------------------- */

/** A hack could be attempted by somebody right now (so Bounty and Glitch have a point). */
function hacksPossible(s: State, ctx: ModeContext<Settings>) {
  if (s.vault) return true;
  return ctx.players().some((p) => s.hackers[p.id]?.password && rivals(s, ctx, p.id).some((r) => !inSetup(s, r)));
}

function scheduleEvent(s: State, ctx: ModeContext<Settings>, at: number) {
  if (at + EVENT_TIMING.lastsSec * 1000 <= s.endsAt) {
    s.nextEventAt = at;
    ctx.setTimer('event', at);
  } else {
    s.nextEventAt = null;
    ctx.clearTimer('event');
  }
}

function startEvent(s: State, ctx: ModeContext<Settings>) {
  const at = s.nextEventAt ?? ctx.now();
  if (at + EVENT_TIMING.lastsSec * 1000 <= ctx.now()) {
    scheduleEvent(s, ctx, at + EVENT_TIMING.everySec * 1000);
    return;
  }
  const live = hacksPossible(s, ctx);
  const pool = EVENTS.filter((e) => e !== s.lastEvent && (live || !EVENT_INFO[e].needsHacks)).map((id) => ({ id, weight: 1 }));
  // Nothing can run now (e.g. a solo game where only Data Storm fits and it just ran): wait for the next slot.
  if (!pool.length) {
    scheduleEvent(s, ctx, at + EVENT_TIMING.everySec * 1000);
    return;
  }
  const id = pickWeighted(pool, ctx.rng).id;
  const endsAt = at + EVENT_TIMING.lastsSec * 1000;
  s.event = { id, startedAt: at, endsAt };
  s.lastEvent = id;
  ctx.setTimer('eventEnd', endsAt);
  addNews(s, at, { kind: 'event', by: null, to: null, bits: 0, event: id });
  ctx.feed(`${EVENT_INFO[id].label}: ${EVENT_INFO[id].blurb} (${String(EVENT_TIMING.lastsSec)} seconds)`, { tone: 'big' });
  if (id === 'glitch') applyGlitch(s, ctx);
  scheduleEvent(s, ctx, at + EVENT_TIMING.everySec * 1000);
}

/** System Glitch: new decoys for everyone (and the vault), and every hacker's notes are wiped. */
function applyGlitch(s: State, ctx: ModeContext<Settings>) {
  for (const [id, h] of Object.entries(s.hackers)) {
    if (!h.password) continue;
    h.decoys = makePhrases(ctx.rng, OPTIONS - 1, [h.password, ...h.decoys]);
    h.version++;
    wipeNotesAbout(s, id);
  }
  if (s.vault) {
    s.vault.decoys = makePhrases(ctx.rng, OPTIONS - 1, [s.vault.password, ...s.vault.decoys]);
    s.vault.version++;
    wipeNotesAbout(s, VAULT.id);
  }
}

/* --------------------------------- shop ----------------------------------- */

function shopReason(s: State, ctx: ModeContext<Settings>, h: Hacker, item: ShopItem): string | null {
  const spec = SHOP[item];
  if (h.bits < spec.cost) return `You need ${bitsText(spec.cost)}.`;
  if (item === 'firewall' && h.firewall >= FIREWALL_MAX) return 'Your firewalls are full.';
  if (item === 'twoFactor' && h.twoFactor) return 'You already have 2FA.';
  if (item === 'password' && h.passwordReadyAt > ctx.now()) return 'Your password was just changed.';
  return null;
}

function buy(s: State, ctx: ModeContext<Settings>, id: PlayerId, h: Hacker, item: ShopItem) {
  const reason = shopReason(s, ctx, h, item);
  if (reason) return { error: reason };
  h.bits -= SHOP[item].cost;
  if (item === 'firewall') h.firewall++;
  else if (item === 'twoFactor') h.twoFactor = true;
  else changePassword(s, ctx, id, h);
  return undefined;
}

/* --------------------------------- views ---------------------------------- */

function boardRows(s: State, ctx: ModeContext, me: PlayerId | null): BoardRow[] {
  const rows = ctx
    .players()
    .filter((p) => s.hackers[p.id])
    .map((p) => {
      const h = s.hackers[p.id]!;
      return { playerId: p.id, name: p.name, teamId: p.teamId, bits: h.bits, firewall: h.firewall, twoFactor: h.twoFactor, rank: 0, isYou: p.id === me };
    })
    .sort((a, b) => b.bits - a.bits || a.name.localeCompare(b.name) || a.playerId.localeCompare(b.playerId));
  rows.forEach((r, i) => (r.rank = i > 0 && rows[i - 1]!.bits === r.bits ? rows[i - 1]!.rank : i + 1));
  return rows;
}

function teamRows(s: State, ctx: ModeContext): TeamRow[] | null {
  if (!ctx.teams().length) return null;
  const everyone = ctx.everyone();
  return ctx.teams().map((t) => {
    const members = everyone.filter((p) => p.teamId === t.id && s.hackers[p.id]);
    const total = members.reduce((n, p) => n + s.hackers[p.id]!.bits, 0);
    return { teamId: t.id, name: t.name, hue: t.hue, members: members.length, average: members.length ? Math.round(total / members.length) : 0 };
  });
}

function targetRows(s: State, ctx: ModeContext<Settings>, id: PlayerId, h: Hacker): TargetRow[] {
  const now = ctx.now();
  return rivals(s, ctx, id)
    .sort(richest(s))
    .slice(0, TARGET_LIST_MAX)
    .map((rid) => {
      const target = rid === VAULT.id ? null : s.hackers[rid]!;
      const note = effectiveNote(s, ctx, id, rid);
      return {
        playerId: rid,
        name: nameOf(ctx, rid),
        bits: bitsOf(s, rid),
        firewall: target?.firewall ?? 0,
        twoFactor: rid === VAULT.id ? true : (target?.twoFactor ?? false),
        vault: rid === VAULT.id,
        blocked: blockedReason(s, h, id, rid, now),
        until: triedUntil(h, rid, now),
        crossed: note.crossed.length,
        cracked: note.cracked,
      };
    });
}

function hackView(s: State, ctx: ModeContext<Settings>, id: PlayerId, h: Hacker): HackView | null {
  const hack = h.hack;
  if (!hack) return null;
  if (hack.stage === 'target') {
    const list = targetRows(s, ctx, id, h);
    return { stage: 'target', seq: hack.seq, source: hack.source, deadline: hack.deadline, total: rivals(s, ctx, id).filter((r) => !inSetup(s, r)).length, targets: list };
  }
  const targetId = hack.target!;
  const name = nameOf(ctx, targetId);
  if (hack.stage === 'verify') {
    return { stage: 'verify', seq: hack.seq, source: hack.source, deadline: hack.deadline, target: { playerId: targetId, name } };
  }
  const note = effectiveNote(s, ctx, id, targetId);
  const live = liveOptions(s, ctx, id, targetId);
  const auto = h.result?.seq === hack.seq && h.result.detail === 'auto';
  return {
    stage: 'guess',
    seq: hack.seq,
    source: hack.source,
    deadline: hack.deadline,
    auto,
    target: { playerId: targetId, name },
    options: live.map((text) => ({ text })),
    crossed: note.crossed,
  };
}

/** How many other hackers know this player's current password. */
function exposedCount(s: State, id: PlayerId): number {
  let n = 0;
  for (const [hid, hk] of Object.entries(s.hackers)) if (hid !== id && hk.notes[id]?.cracked) n++;
  return n;
}

function notesList(s: State, ctx: ModeContext<Settings>, id: PlayerId): YouView['notes'] {
  return rivals(s, ctx, id)
    .map((rid) => ({ rid, note: effectiveNote(s, ctx, id, rid) }))
    .filter(({ note }) => note.crossed.length || note.cracked)
    .map(({ rid, note }) => ({ playerId: rid, name: nameOf(ctx, rid), crossed: note.crossed.length, cracked: note.cracked }))
    .slice(0, NOTES_KEEP);
}

const INCIDENT_TEXT: Record<IncidentView['kind'], (name: string, bits: number) => string> = {
  hacked: (name, bits) => `${name} hacked you for ${bitsText(bits)}.`,
  firewall: (name) => `${name} guessed your password; your firewall stopped them.`,
  twoFactor: (name) => `${name} guessed your password; 2FA stopped them.`,
  intrusion: (name, bits) => `${name} tried to hack you. +${bitsText(bits)}.`,
};

function youView(s: State, ctx: ModeContext<Settings>, id: PlayerId, h: Hacker, rank: number | null): YouView {
  const m = moment(s, ctx, h);
  const verifyQ = h.hack?.stage === 'verify' && h.hack.verifyIid ? ctx.questions.view(h.hack.verifyIid, { deadline: h.hack.deadline }) : null;
  const shop: ShopRow[] = (Object.keys(SHOP) as ShopItem[]).map((item) => {
    const reason = shopReason(s, ctx, h, item);
    return { item, cost: SHOP[item].cost, can: reason === null, reason };
  });
  const back = h.hackBack && h.hackBack.until > ctx.now() && s.hackers[h.hackBack.playerId] ? { playerId: h.hackBack.playerId, name: nameOf(ctx, h.hackBack.playerId), until: h.hackBack.until } : null;
  return {
    bits: h.bits,
    rank,
    teamId: ctx.player(id)?.teamId ?? null,
    level: m.level,
    rights: h.stream.correct,
    toNext: toNextLevel(h.stream.correct),
    password: h.password,
    choosing: h.choosing,
    passwordReadyAt: h.passwordReadyAt,
    defences: { firewall: h.firewall, firewallMax: FIREWALL_MAX, twoFactor: h.twoFactor, backup: h.backup, backupMax: BACKUP_MAX, exposed: exposedCount(s, id) },
    shop,
    boosts: { surge: h.surge, double: h.double },
    hackable: rivals(s, ctx, id).some((r) => !inSetup(s, r)),
    offer: h.offer ? { seq: h.offer.seq, packets: h.offer.packets.map((p) => ({ kind: p.kind })) } : null,
    hack: hackView(s, ctx, id, h),
    result: h.result && h.result.title ? h.result : null,
    hackBack: back,
    notes: notesList(s, ctx, id),
    incidents: h.incidents.map((n) => ({ id: n.id, at: n.at, by: n.by, name: nameOf(ctx, n.by), kind: n.kind, bits: n.bits, knows: n.knows, text: INCIDENT_TEXT[n.kind](nameOf(ctx, n.by), n.bits) })),
    opened: h.opened,
    odds: oddsTable(m),
    // The stream question, or the 2FA question while verifying; null while an offer or a hack is open.
    question: verifyQ ?? (h.offer || h.hack ? null : streamQuestionView(h.stream, ctx)),
    last: h.stream.last,
  };
}

function baseView(s: State, ctx: ModeContext<Settings>, board: BoardRow[]) {
  return {
    endsAt: s.endsAt,
    goal: ctx.settings.goalBits,
    lockdown: ctx.settings.lockdown,
    heist: Boolean(s.vault),
    teamIntel: ctx.settings.teamIntel && ctx.teams().length > 0,
    event: s.event ? { id: s.event.id, endsAt: s.event.endsAt } : null,
    nextEventAt: s.nextEventAt,
    bounty: s.event?.id === 'bounty' ? leaders(s, ctx) : null,
    vault: s.vault ? { id: VAULT.id, name: VAULT.name, bits: s.vault.bits, cracks: s.vault.cracks } : null,
    players: board.length,
    teams: teamRows(s, ctx),
  };
}

/* ---------------------------------- mode ---------------------------------- */

export const codeBreakers = defineMode<State, Settings, Action>({
  meta,
  settings,
  defaults: meta.common.defaults,
  action,
  init(ctx) {
    const hackers: Record<PlayerId, Hacker> = {};
    for (const p of ctx.players()) {
      hackers[p.id] = newHacker(ctx);
      ctx.setTimer(`pw:${p.id}`, ctx.now() + TIMING.passwordSec * 1000);
    }
    const now = ctx.now();
    const endsAt = now + timeLimitMs(ctx);
    ctx.setTimer('time', endsAt);
    const s: State = {
      hackers,
      vault: null,
      endsAt,
      event: null,
      nextEventAt: null,
      lastEvent: null,
      hackNews: [],
      news: [],
      seq: 0,
      attempts: 0,
      landed: 0,
      stolen: 0,
      blocked: 0,
      biggestHack: null,
      winner: null,
    };
    if (ctx.settings.heist) {
      const phrases = makePhrases(ctx.rng, OPTIONS);
      s.vault = { bits: VAULT.start, password: phrases[0]!, decoys: phrases.slice(1), version: 1, cracks: 0 };
    }
    if (ctx.settings.events) scheduleEvent(s, ctx, now + EVENT_TIMING.firstSec * 1000);
    return s;
  },
  onPlayerJoin(s, p, ctx) {
    if (s.hackers[p.id]) return;
    s.hackers[p.id] = newHacker(ctx);
    ctx.setTimer(`pw:${p.id}`, ctx.now() + TIMING.passwordSec * 1000);
  },
  onPlayerLeave(s, p, ctx) {
    const h = s.hackers[p.id];
    if (!h) return;
    h.offer = null;
    h.hack = null;
    h.choosing = null;
    ctx.clearTimer(`pw:${p.id}`);
    ctx.clearTimer(`target:${p.id}`);
    ctx.clearTimer(`guess:${p.id}`);
    ctx.clearTimer(`verify:${p.id}`);
  },
  onAction(s, playerId, a, ctx) {
    const h = s.hackers[playerId];
    if (!h) return { error: 'You are not in this game.' };
    switch (a.type) {
      case 'choosePassword': {
        if (!h.choosing) return { error: 'You have already chosen your password.' };
        choosePassword(s, ctx, playerId, a.index);
        return;
      }
      case 'answer': {
        // Answering a 2FA challenge.
        if (h.hack?.stage === 'verify') {
          if (a.iid !== h.hack.verifyIid) return { error: 'Answer the 2FA question.' };
          const inst = ctx.questions.instance(h.hack.verifyIid);
          const grade = ctx.questions.grade(h.hack.verifyIid, a.answer);
          ctx.recordAnswer({ playerId, qid: inst.qid, correct: grade.correct, partial: grade.partial, responseMs: ctx.now() - inst.shownAt });
          resolveVerify(s, ctx, playerId, h, grade.correct);
          moveOn(s, ctx, playerId);
          return;
        }
        // Answering before choosing a password picks the first one, then the answer is theirs next time.
        if (h.choosing) {
          choosePassword(s, ctx, playerId, 0);
          return;
        }
        if (h.offer) return { error: 'Pick a packet first.' };
        if (h.hack) return { error: 'Finish your hack first.' };
        const res = streamSubmit(h.stream, playerId, a.iid, a.answer, ctx);
        if ('error' in res) return res;
        if (!res.correct) {
          if (h.stream.last) h.stream.last.text = 'No packet';
          streamNext(h.stream, ctx);
          return;
        }
        makeOffer(s, ctx, h);
        const levelUp = h.stream.correct % LEVEL_EVERY === 0 ? levelOf(h.stream.correct) : null;
        if (h.stream.last) h.stream.last.text = `${levelUp ? `Level ${String(levelUp)}. ` : ''}Pick a packet.`;
        return;
      }
      case 'pick': {
        const offer = h.offer;
        if (!offer) return { error: h.hack ? 'Finish your hack first.' : 'There is no packet to open right now.' };
        if (offer.seq !== a.offer) return { error: 'That packet has already been opened.' };
        const packet = offer.packets[a.index];
        if (!packet) return { error: 'There is no packet there.' };
        h.offer = null;
        openPacket(s, ctx, playerId, h, packet, offer.seq);
        moveOn(s, ctx, playerId);
        return;
      }
      case 'target': {
        if (!h.hack || h.hack.stage !== 'target') return { error: 'There is no hack waiting for a target.' };
        const targetId = a.playerId;
        if (targetId === playerId) return { error: 'You cannot hack yourself.' };
        if (!rivals(s, ctx, playerId).includes(targetId)) return { error: targetId === VAULT.id ? 'There is no vault in this game.' : 'You cannot hack that player.' };
        const reason = blockedReason(s, h, playerId, targetId, ctx.now());
        if (reason && hackable(s, ctx, playerId).length && !hackable(s, ctx, playerId).includes(targetId)) {
          return { error: reason === 'setup' ? 'That player is still setting up. Choose someone else.' : 'You tried that target a moment ago. Choose someone else.' };
        }
        startGuess(s, ctx, playerId, h, targetId, false);
        return;
      }
      case 'guess': {
        if (!h.hack || h.hack.stage !== 'guess') return { error: 'There is no guess to make right now.' };
        if (h.hack.seq !== a.seq) return { error: 'That hack has moved on.' };
        const live = liveOptions(s, ctx, playerId, h.hack.target!);
        const chosen = live[a.index];
        if (chosen === undefined) return { error: 'There is no option there.' };
        resolveGuess(s, ctx, playerId, h, chosen);
        moveOn(s, ctx, playerId);
        return;
      }
      case 'buy': {
        if (h.choosing) return { error: 'Choose your password first.' };
        const r = buy(s, ctx, playerId, h, a.item);
        if (r) return r;
        return;
      }
      case 'hackBack': {
        const back = h.hackBack;
        if (!back || back.until <= ctx.now()) return { error: 'You have no hack back right now.' };
        if (h.offer || h.hack) return { error: 'Finish what you are doing first.' };
        if (!s.hackers[back.playerId] || inSetup(s, back.playerId)) return { error: 'That hacker has left.' };
        if (!rivals(s, ctx, playerId).includes(back.playerId)) return { error: 'You cannot hack back right now.' };
        h.hackBack = null;
        const deadline = ctx.now() + TIMING.guessSec * 1000;
        h.hack = { seq: ++h.seq, source: 'back', stage: 'guess', target: back.playerId, version: secretOf(s, back.playerId).version, verifyIid: null, deadline };
        ctx.setTimer(`guess:${playerId}`, deadline);
        h.result = null;
        return;
      }
    }
  },
  onTimer(s, timerId, ctx) {
    if (timerId === 'time') {
      ctx.endGame();
      return;
    }
    if (timerId === 'event') {
      startEvent(s, ctx);
      return;
    }
    if (timerId === 'eventEnd') {
      if (s.event && ctx.now() >= s.event.endsAt) s.event = null;
      return;
    }
    if (timerId.startsWith('pw:')) {
      const id = timerId.slice(3);
      if (s.hackers[id]?.choosing) choosePassword(s, ctx, id, 0);
      return;
    }
    if (timerId.startsWith('target:')) {
      const id = timerId.slice('target:'.length);
      autoTarget(s, ctx, id);
      moveOn(s, ctx, id);
      return;
    }
    if (timerId.startsWith('guess:')) {
      const id = timerId.slice('guess:'.length);
      autoGuess(s, ctx, id);
      moveOn(s, ctx, id);
      return;
    }
    if (timerId.startsWith('verify:')) {
      const id = timerId.slice('verify:'.length);
      const h = s.hackers[id];
      if (h?.hack?.stage === 'verify') {
        resolveVerify(s, ctx, id, h, false);
        moveOn(s, ctx, id);
      }
      return;
    }
  },
  view(s, viewer, ctx): CodeBreakersPlayerView | CodeBreakersHostView {
    const me = viewer.kind === 'player' ? viewer.playerId : null;
    const board = boardRows(s, ctx, me);
    if (viewer.kind === 'host') {
      const towers = board.slice(0, 60).map((r) => {
        const h = s.hackers[r.playerId]!;
        return { playerId: r.playerId, name: r.name, teamId: r.teamId, bits: r.bits, level: levelOf(h.stream.correct), firewall: r.firewall, twoFactor: r.twoFactor };
      });
      const host: CodeBreakersHostView = {
        ...baseView(s, ctx, board),
        board: board.slice(0, 10),
        towers,
        hacks: s.hackNews.map((n) => ({ id: n.id, at: n.at, by: n.by, to: n.to, name: nameOf(ctx, n.by), target: nameOf(ctx, n.to), outcome: n.outcome, bits: n.bits })),
        news: s.news.map((n) => ({ id: n.id, at: n.at, kind: n.kind, by: n.by, to: n.to, name: n.by ? nameOf(ctx, n.by) : null, target: n.to ? nameOf(ctx, n.to) : null, bits: n.bits, event: n.event })),
        totals: { bits: board.reduce((n, r) => n + r.bits, 0), attempts: s.attempts, landed: s.landed, stolen: s.stolen, blocked: s.blocked },
      };
      return host;
    }
    const top = board.slice(0, 6);
    const mine = board.find((r) => r.isYou);
    if (mine && !top.includes(mine)) top.push(mine);
    const h = me ? s.hackers[me] : undefined;
    const player: CodeBreakersPlayerView = {
      ...baseView(s, ctx, board),
      board: top,
      you: me && h ? youView(s, ctx, me, h, mine?.rank ?? null) : null,
    };
    return player;
  },
  results(s, ctx) {
    const standings = ctx.everyone().map((p) => {
      const bits = s.hackers[p.id]?.bits ?? 0;
      return { playerId: p.id, score: bits, label: bitsText(bits) };
    });
    const teams = teamRows(s, ctx);
    const best = Math.max(0, ...standings.map((r) => r.score));
    const leadersNow = standings.filter((r) => r.score === best);
    let summary = 'The game ended before anyone mined a bit.';
    if (s.winner) summary = `${nameOf(ctx, s.winner)} reached ${bitsText(ctx.settings.goalBits)} first.`;
    else if (best > 0) summary = leadersNow.length === 1 ? `${nameOf(ctx, leadersNow[0]!.playerId)} finished on top with ${bitsText(best)}.` : `${String(leadersNow.length)} players tied on top with ${bitsText(best)}.`;
    const hack = s.biggestHack;
    if (hack) summary += ` Biggest hack: ${nameOf(ctx, hack.by)} took ${bitsText(hack.bits)} from ${nameOf(ctx, hack.from)}.`;
    return {
      standings,
      ...(teams ? { teamStandings: teams.map((t) => ({ teamId: t.teamId, score: t.average, label: `${bitsText(t.average)} on average` })) } : {}),
      summary,
    };
  },
  bot(view, ctx) {
    const v = view as CodeBreakersPlayerView;
    const you = v?.you;
    if (!you) return null;
    if (you.choosing) return { type: 'choosePassword', index: ctx.rng.int(0, you.choosing.options.length - 1) };
    if (you.hack?.stage === 'verify') {
      const q = you.question;
      return q ? { type: 'answer', iid: q.iid, answer: ctx.answer(q.iid) } : null;
    }
    if (you.hack?.stage === 'target') {
      const t = botTarget(you.hack.targets);
      return t ? { type: 'target', playerId: t } : null;
    }
    if (you.hack?.stage === 'guess') {
      const n = you.hack.options.length;
      return n > 0 ? { type: 'guess', seq: you.hack.seq, index: ctx.rng.int(0, n - 1) } : null;
    }
    if (you.offer) return { type: 'pick', offer: you.offer.seq, index: botPick(v, you, ctx.rng) };
    // Sometimes spend bits on a defence, and take a free hack back when one is open.
    if (you.hackBack && ctx.rng.chance(0.6)) return { type: 'hackBack' };
    const buyItem = botBuy(you, ctx.rng);
    if (buyItem) return { type: 'buy', item: buyItem };
    const q = you.question;
    return q ? { type: 'answer', iid: q.iid, answer: ctx.answer(q.iid) } : null;
  },
  botDelay(view, rng) {
    const you = (view as CodeBreakersPlayerView)?.you;
    if (you?.choosing) return 500 + rng.int(0, 1500);
    if (you?.offer || (you?.hack && you.hack.stage !== 'verify') || you?.hackBack) return 700 + rng.int(0, 1500);
    return 2200 + rng.int(0, 4500);
  },
});

/* ---------------------------------- bots ---------------------------------- */

/** Pick a packet: a hack when a rich rival is reachable, a defence when exposed and well-off, a boost sometimes, else bits. */
function botPick(view: CodeBreakersPlayerView, you: YouView, rng: Rng): number {
  const packets = you.offer!.packets;
  const at = (kind: PacketKind) => packets.findIndex((p) => p.kind === kind);
  const richestRival = Math.max(0, ...view.board.filter((r) => !r.isYou && !(you.teamId && r.teamId === you.teamId)).map((r) => r.bits));
  if (at('hack') >= 0 && you.hackable && richestRival >= Math.max(40, you.bits * 0.6)) return at('hack');
  if (at('defence') >= 0 && you.bits > 150 && (you.defences.exposed > 0 || (you.rank !== null && you.rank <= 2)) && rng.chance(0.7)) return at('defence');
  if (at('boost') >= 0 && rng.chance(0.4)) return at('boost');
  for (const kind of ['bits', 'boost', 'defence', 'hack'] as const) if (at(kind) >= 0) return at(kind);
  return 0;
}

/** Hack the richest reachable target. */
function botTarget(targets: TargetRow[]): string | null {
  const open = targets.filter((t) => !t.blocked);
  return open[0]?.playerId ?? null;
}

/** Occasionally buy a defence: 2FA when rich and undefended, a firewall when being hacked. */
function botBuy(you: YouView, rng: Rng): ShopItem | null {
  const can = (item: ShopItem) => you.shop.find((s) => s.item === item)?.can;
  if (you.defences.exposed > 0 && can('password') && rng.chance(0.3)) return 'password';
  if (!you.defences.twoFactor && can('twoFactor') && you.bits > 320 && rng.chance(0.25)) return 'twoFactor';
  if (can('firewall') && you.incidents.some((i) => i.kind === 'hacked') && you.bits > 160 && rng.chance(0.3)) return 'firewall';
  return null;
}
