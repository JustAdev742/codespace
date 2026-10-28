import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { Apple, BookHeart, BookOpen, CakeSlice, Citrus, CircleDot, Crown, Croissant, Flower2, Package, PawPrint, ShoppingBasket, Sparkles, Sprout, Star, Store, Timer, Users, Wallet, type LucideIcon } from 'lucide-react';
import type { Answer } from '@ludora/shared';
import { CRATE_ODDS, EVENTS, LINES, PRODUCTS, UPGRADES, cashText, itemText, type CrateId, type EventKind, type LineId, type ProductId, type UpgradeId } from '@ludora/engine/corner-shop';
import type { ModeScreenProps } from './registry.ts';
import type { FeedbackView, QuestionView } from '../game/types.ts';
import { AnswerInput } from '../game/AnswerInput.tsx';
import { QuestionCard } from '../game/QuestionCard.tsx';
import { Countdown } from '../game/TimerBar.tsx';
import { ResultBanner } from '../game/Reveal.tsx';
import { Leaderboard, TeamScores } from '../game/Leaderboard.tsx';
import { Explanation, ModeTitle } from '../game/parts.tsx';
import { useAnnounce } from '../game/announce.tsx';
import { Pill, StagePanel, fallbackArt } from '../game/stage.tsx';
import { Glim } from '../../../art/glim/Glim.tsx';
import { Dialog } from '../../../ui/primitives.tsx';
import { Button } from '../../../ui/Button.tsx';
import { useNow } from '../../../lib/useNow.ts';
import { playSfx, useSfx, useSharedSounds } from '../../../lib/sound/react.tsx';
import { Stage3D, lookFor as lookOf } from '../../../three/index.ts';
import { CornerShopScene, HighStreetScene, customerArt, type ShopState, type StreetShop } from './corner-shop-scene.ts';

/*
 * Corner Shop screens. The 3D shop is the picture; everything you do is an
 * ordinary button beside it: serve a customer (or the next one, with Space),
 * pick a delivery, buy an upgrade, answer the question. With 3D off a plain
 * picture of the shelves and the queue stands in for the shop.
 */

/* ---------------------------------- types --------------------------------- */

type Kind = 'regular' | 'vip' | 'hurry';

interface Customer {
  id: number;
  name: string;
  look: number;
  kind: Kind;
  items: { product: ProductId; qty: number; have: number }[];
  arrivedAt: number;
  patienceMs: number;
  leavesAt: number;
}

interface Sale {
  seq: number;
  at: number;
  customer: { id: number; name: string; look: number; kind: Kind };
  kind: 'full' | 'partial' | 'sorry';
  got: { product: ProductId; qty: number; price: number }[];
  missing: { product: ProductId; qty: number }[];
  paid: number;
  tip: number;
  rating: number;
  waitedMs: number;
  sale: boolean;
}

interface Delivery {
  seq: number;
  at: number;
  crate: CrateId | null;
  product: ProductId | null;
  added: { product: ProductId; qty: number }[];
  wasted: number;
  cash: number;
}

type Option = { kind: 'stock'; product: ProductId; qty: number; fits: number } | { kind: 'crate' };

interface You {
  shopId: string;
  shopName: string;
  asOf: number;
  rank: number | null;
  cash: number;
  rating: number;
  stars: number;
  perMinute: number;
  shelves: { product: ProductId; stock: number; cap: number; price: number; salePrice: number | null }[];
  lines: LineId[];
  slots: number;
  lineShop: { line: LineId; cost: number; owned: boolean }[];
  queue: Customer[];
  queueMax: number;
  till: { level: number; readyAt: number; serves: number; busyMs: number };
  upgrades: { id: UpgradeId; level: number; max: number; cost: number | null }[];
  offer: { seq: number; options: Option[] } | null;
  crateOdds: { id: CrateId; weight: number }[];
  question: QuestionView | null;
  last: (FeedbackView & { text?: string }) | null;
  streak: number;
  sales: Sale[];
  delivery: Delivery | null;
  news: { seq: number; at: number; kind: 'left' | 'walked'; name: string; count: number }[];
  served: number;
  earned: number;
  shopServed: number;
  walked: number;
  left: number;
}

interface BoardRow {
  id: string;
  name: string;
  teamId: string | null;
  cash: number;
  stars: number;
  rank: number;
  isYou: boolean;
}

interface Front {
  id: string;
  name: string;
  teamId: string | null;
  cash: number;
  stars: number;
  queue: number;
  vip: boolean;
  fill: number;
  lines: number;
  up: [number, number, number, number];
}

interface CornerShopView {
  endsAt: number;
  coop: boolean;
  event: { kind: EventKind; startedAt: number; endsAt: number; seq: number } | null;
  nextEventAt: number | null;
  board: BoardRow[];
  shops: number;
  teams: { teamId: string; name: string; hue: number; members: number; cash: number }[] | null;
  you?: You | null;
  street?: Front[];
  streetMore?: number;
  served?: number;
  left?: number;
}

/* --------------------------------- helpers -------------------------------- */

const PRODUCT_ICON: Record<ProductId, LucideIcon> = {
  apples: Apple,
  melons: Citrus,
  bread: Croissant,
  cakes: CakeSlice,
  comics: BookOpen,
  storybooks: BookHeart,
  basil: Sprout,
  succulents: Flower2,
  yoyos: CircleDot,
  teddies: PawPrint,
};

const LINE_HUE: Record<LineId, number> = { fruit: 8, bakery: 32, books: 220, plants: 120, toys: 300 };

const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
const listItems = (items: { product: ProductId; qty: number }[]) => {
  const words = items.map((it) => itemText(it.product, it.qty));
  return words.length <= 1 ? (words[0] ?? 'nothing') : `${words.slice(0, -1).join(', ')} and ${words[words.length - 1]}`;
};
const crateInfo = (id: CrateId) => CRATE_ODDS.find((o) => o.id === id)!;

function saleLine(s: Sale): string {
  const who = s.customer.name;
  const vip = s.customer.kind === 'vip' ? 'VIP ' : '';
  if (s.kind === 'sorry') return `${vip}${who} wanted ${listItems(s.missing)}. None on the shelves, so they left with nothing.`;
  const tip = s.tip > 0 ? ` and tipped ${cashText(s.tip)}` : '';
  if (s.kind === 'partial') return `${vip}${who} bought ${listItems(s.got)} for ${cashText(s.paid)}${tip}, but you were out of ${listItems(s.missing)}.`;
  return `${vip}${who} bought ${listItems(s.got)} for ${cashText(s.paid)}${tip}.${s.sale ? ' (Sale Day prices.)' : ''}`;
}

function deliveryLine(d: Delivery): string {
  const put = d.added.length ? `${listItems(d.added)} on the shelves` : 'nothing new on the shelves';
  const waste = d.wasted > 0 ? ` ${d.wasted} did not fit.` : '';
  if (d.crate) {
    const info = crateInfo(d.crate);
    if (d.crate === 'cash') return `Mystery crate: ${info.title}! ${cashText(d.cash)} in the till.`;
    return `Mystery crate: ${info.title}! ${cap(put)}.${waste}`;
  }
  return `Delivery: ${put}.${waste}`;
}

function saleSound(s: Sale) {
  if (s.kind === 'sorry') return 'tap' as const;
  if (s.customer.kind === 'vip' && s.kind === 'full') return 'jackpot' as const;
  return 'coin' as const;
}

/** Keys typed into answers, buttons and dialogs are theirs: Space only serves from the page itself. */
function ownKey(e: KeyboardEvent): boolean {
  const t = e.target as HTMLElement | null;
  if (!t) return false;
  const tag = t.tagName;
  return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || tag === 'BUTTON' || tag === 'A' || t.isContentEditable || Boolean(t.closest('[role="dialog"], [role="radiogroup"], [role="listbox"]'));
}

/* ---------------------------------- parts --------------------------------- */

function Stat({ label, value, icon: Icon, tone = 'calm' }: { label: string; value: ReactNode; icon: LucideIcon; tone?: 'calm' | 'gold' }) {
  const colours = tone === 'gold' ? 'bg-lantern text-on-accent' : 'bg-black/45 text-white';
  return (
    <div className={`flex min-w-0 items-center gap-1.5 rounded-[var(--radius-m)] px-2.5 py-1.5 backdrop-blur-sm ${colours}`}>
      <Icon className="size-4 shrink-0" aria-hidden />
      <span className="sr-only">{label}:</span>
      <span className="truncate font-display text-lg leading-none font-extrabold tabular">{value}</span>
    </div>
  );
}

function KindBadge({ kind }: { kind: Kind }) {
  if (kind === 'vip')
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-lantern px-2 py-0.5 text-xs font-extrabold text-on-accent">
        <Crown className="size-3.5" aria-hidden /> VIP
      </span>
    );
  if (kind === 'hurry')
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-ember px-2 py-0.5 text-xs font-extrabold text-on-accent">
        <Timer className="size-3.5" aria-hidden /> In a hurry
      </span>
    );
  return null;
}

function PatienceBar({ left, total }: { left: number; total: number }) {
  const frac = Math.max(0, Math.min(1, left / Math.max(1, total)));
  const colour = frac > 0.5 ? 'bg-glim' : frac > 0.25 ? 'bg-lantern' : 'bg-ember';
  return (
    <div className="relative h-2 overflow-hidden rounded-full bg-white/[0.12]" aria-hidden>
      <div className={`absolute inset-0 origin-left rounded-full transition-transform duration-200 ease-linear ${colour}`} style={{ transform: `scaleX(${frac})` }} />
    </div>
  );
}

function CustomerCard({ c, now, canServe, onServe }: { c: Customer; now: number; canServe: boolean; onServe: () => void }) {
  const left = Math.max(0, c.leavesAt - now);
  const secs = Math.ceil(left / 1000);
  const ready = c.items.every((it) => it.have >= it.qty);
  const none = c.items.every((it) => it.have === 0);
  return (
    <li className={`flex min-w-[11rem] shrink-0 flex-col gap-1.5 rounded-[var(--radius-m)] p-2.5 lg:min-w-0 ${c.kind === 'vip' ? 'bg-lantern/[0.12] ring-2 ring-lantern/70 ring-inset' : c.kind === 'hurry' ? 'bg-ember/[0.1] ring-2 ring-ember/60 ring-inset' : 'bg-white/[0.07]'}`}>
      <div className="flex items-center gap-2">
        <Glim art={customerArt(c.look)} size={32} className="size-8 shrink-0" />
        <span className="min-w-0 flex-1 truncate font-bold">{c.name}</span>
        <KindBadge kind={c.kind} />
      </div>
      <ul className="flex flex-col gap-0.5 text-sm">
        {c.items.map((it) => {
          const Icon = PRODUCT_ICON[it.product];
          const short = it.have < it.qty;
          return (
            <li key={it.product} className="flex items-center gap-1.5">
              <Icon className="size-4 shrink-0 text-text-2" aria-hidden />
              <span className="min-w-0 flex-1 truncate">{itemText(it.product, it.qty)}</span>
              <span className={`shrink-0 text-xs font-bold tabular ${short ? 'text-ember' : 'text-glim'}`}>{short ? `have ${it.have}` : 'ready'}</span>
            </li>
          );
        })}
      </ul>
      <div className="flex items-center gap-2">
        <div className="flex-1">
          <PatienceBar left={left} total={c.patienceMs} />
        </div>
        <span className={`text-xs font-bold tabular ${secs <= 5 ? 'text-ember' : 'text-text-2'}`}>{secs}s</span>
      </div>
      <Button size="sm" variant={ready ? 'primary' : 'secondary'} disabled={!canServe} onClick={onServe} aria-label={`Serve ${c.name}${c.kind === 'vip' ? ', a VIP' : c.kind === 'hurry' ? ', in a hurry' : ''}: ${listItems(c.items)}. ${ready ? 'You have it all.' : none ? 'You have none of it.' : 'You have some of it.'} ${secs} seconds of patience left.`}>
        {ready ? 'Serve' : none ? 'Say sorry' : 'Serve what you have'}
      </Button>
    </li>
  );
}

function OddsList({ odds }: { odds: { id: CrateId; weight: number }[] }) {
  const total = odds.reduce((n, o) => n + o.weight, 0) || 1;
  return (
    <ul className="flex flex-col gap-1 text-sm">
      {odds.map((o) => {
        const info = crateInfo(o.id);
        return (
          <li key={o.id} className="flex items-baseline gap-2">
            <span className="w-11 shrink-0 text-right font-display text-base font-bold tabular">{Math.round((o.weight / total) * 100)}%</span>
            <span>
              <span className="font-bold">{info.title}</span> <span className="text-text-2">{info.text}</span>
            </span>
          </li>
        );
      })}
    </ul>
  );
}

function OfferCards({ you, onPick, busy, paused }: { you: You; onPick: (i: number) => void; busy: boolean; paused: boolean }) {
  const offer = you.offer!;
  return (
    <section className="flex flex-col gap-2" aria-label="Pick a delivery">
      <h3 className="font-display text-xl font-extrabold">Pick a delivery</h3>
      <ul className="grid gap-2 sm:grid-cols-3">
        {offer.options.map((o, i) => {
          if (o.kind === 'crate')
            return (
              <li key={i}>
                <button
                  type="button"
                  disabled={busy || paused}
                  onClick={() => onPick(i)}
                  className="flex h-full w-full flex-col gap-2 rounded-[var(--radius-m)] bg-dusk/[0.25] p-3 text-left ring-2 ring-dusk/70 transition-colors ring-inset hover:bg-dusk/[0.35] disabled:opacity-55"
                  aria-label="Mystery crate. What is inside is drawn when you open it."
                >
                  <span className="flex items-center gap-2 font-display text-lg font-extrabold">
                    <Sparkles className="size-5 text-lantern" aria-hidden /> Mystery crate
                  </span>
                  <OddsList odds={you.crateOdds} />
                </button>
              </li>
            );
          const shelf = you.shelves.find((s) => s.product === o.product);
          const Icon = PRODUCT_ICON[o.product];
          const fitText = o.fits >= o.qty ? 'All fit' : o.fits === 0 ? 'Shelf full: none fit' : `${o.fits} fit, ${o.qty - o.fits} wasted`;
          return (
            <li key={i}>
              <button
                type="button"
                disabled={busy || paused}
                onClick={() => onPick(i)}
                className="flex h-full w-full flex-col gap-1.5 rounded-[var(--radius-m)] bg-white/[0.08] p-3 text-left ring-2 ring-white/15 transition-colors ring-inset hover:bg-white/[0.13] disabled:opacity-55"
                aria-label={`${itemText(o.product, o.qty)}. ${fitText}. You have ${shelf?.stock ?? 0} of ${shelf?.cap ?? 0}.`}
              >
                <span className="flex items-center gap-2 font-display text-lg font-extrabold">
                  <Icon className="size-5 shrink-0 text-lantern" aria-hidden /> {itemText(o.product, o.qty)}
                </span>
                <span className={`text-sm font-bold ${o.fits < o.qty ? 'text-ember' : 'text-glim'}`}>{fitText}</span>
                <span className="text-sm text-text-2">
                  On the shelf: {shelf?.stock ?? 0} of {shelf?.cap ?? 0}. {cashText(PRODUCTS[o.product].price)} each.
                </span>
              </button>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

function Shelves({ you }: { you: You }) {
  return (
    <StagePanel className="flex flex-col gap-2 p-3" as="section" label="Your shelves">
      <h3 className="flex items-center gap-2 font-display text-lg font-extrabold">
        <ShoppingBasket className="size-5 text-lantern" aria-hidden /> Shelves
        <span className="ml-auto text-sm font-semibold text-text-2">Each holds {you.shelves[0]?.cap ?? 0}</span>
      </h3>
      <ul className="grid gap-x-4 gap-y-1.5 2xl:grid-cols-2">
        {you.shelves.map((s) => {
          const Icon = PRODUCT_ICON[s.product];
          const frac = s.stock / Math.max(1, s.cap);
          return (
            <li key={s.product} className="grid grid-cols-[1rem_minmax(5rem,8rem)_minmax(2rem,1fr)_3.25rem_3.5rem] items-center gap-2 text-sm">
              <Icon className="size-4" style={{ color: `hsl(${LINE_HUE[PRODUCTS[s.product].line]} 70% 65%)` }} aria-hidden />
              <span className="truncate font-semibold" aria-hidden>
                {cap(PRODUCTS[s.product].many)}
              </span>
              <span className="relative h-2.5 overflow-hidden rounded-full bg-white/[0.12]" aria-hidden>
                <span className={`absolute inset-y-0 left-0 rounded-full ${frac === 0 ? '' : frac < 0.25 ? 'bg-ember' : 'bg-glim'}`} style={{ width: `${frac * 100}%` }} />
              </span>
              <span className="text-right font-bold tabular" aria-hidden>
                {s.stock}
                <span className="text-text-2">/{s.cap}</span>
              </span>
              <span className="text-right tabular" aria-hidden>
                {s.salePrice !== null ? (
                  <>
                    <s className="text-text-2">{cashText(s.price)}</s> <span className="font-bold text-lantern">{cashText(s.salePrice)}</span>
                  </>
                ) : (
                  cashText(s.price)
                )}
              </span>
              <span className="sr-only">{`${PRODUCTS[s.product].many}: ${s.stock} of ${s.cap}, ${cashText(s.salePrice ?? s.price)} each.`}</span>
            </li>
          );
        })}
      </ul>
    </StagePanel>
  );
}

function UpgradesDialog({ open, onOpenChange, you, onBuy, onLine, busy }: { open: boolean; onOpenChange: (v: boolean) => void; you: You; onBuy: (id: UpgradeId) => void; onLine: (line: LineId) => void; busy: boolean }) {
  const free = you.slots - you.lines.length;
  return (
    <Dialog open={open} onOpenChange={onOpenChange} size="lg" title="Upgrades" description={`Paid for with your cash: you have ${cashText(you.cash)}. Spending lowers your cash, so buy what will pay for itself before the shop shuts.`}>
      <ul className="flex flex-col gap-2">
        {you.upgrades.map((u) => {
          const info = UPGRADES[u.id];
          const next = u.cost !== null ? info.levels[u.level] : null;
          const now = u.level > 0 ? info.levels[u.level - 1] : null;
          return (
            <li key={u.id} className="flex items-center gap-3 rounded-[var(--radius-m)] bg-white/[0.06] p-3">
              <div className="min-w-0 flex-1">
                <p className="font-bold">
                  {info.name} <span className="font-normal text-text-2">level {u.level} of {u.max}</span>
                </p>
                <p className="text-sm text-text-2">{next ? `${next.title}: ${next.text}` : `${now?.title ?? info.name}: the best there is.`}</p>
              </div>
              {next && u.cost !== null ? (
                <Button size="sm" variant={you.cash >= u.cost ? 'primary' : 'secondary'} disabled={busy || you.cash < u.cost} onClick={() => onBuy(u.id)} aria-label={`Buy ${next.title} for ${cashText(u.cost)}`}>
                  {cashText(u.cost)}
                </Button>
              ) : null}
            </li>
          );
        })}
      </ul>
      <h3 className="mt-4 mb-1 font-display text-lg font-extrabold">Product lines</h3>
      <p className="mb-2 text-sm text-text-2">{free > 0 ? `Room for ${free} more ${free === 1 ? 'line' : 'lines'}.` : 'No room for another line: bigger shelves make room.'} Each new line brings 10% more customers and opens with empty shelves.</p>
      <ul className="grid gap-2 sm:grid-cols-2">
        {you.lineShop.map((l) => {
          const info = LINES[l.line];
          const [a, b] = info.products;
          return (
            <li key={l.line} className="flex flex-col gap-1.5 rounded-[var(--radius-m)] bg-white/[0.06] p-3">
              <p className="flex items-center gap-2 font-bold">
                <span className="size-3 rounded-full" style={{ background: `hsl(${LINE_HUE[l.line]} 70% 58%)` }} aria-hidden />
                {info.name}
                {l.owned ? <span className="ml-auto text-sm font-semibold text-glim">In your shop</span> : null}
              </p>
              <p className="text-sm text-text-2">
                {cap(PRODUCTS[a].many)} {cashText(PRODUCTS[a].price)}, {PRODUCTS[b].many} {cashText(PRODUCTS[b].price)}. {info.blurb}
              </p>
              {l.owned ? null : (
                <Button size="sm" variant={free > 0 && you.cash >= l.cost ? 'primary' : 'secondary'} disabled={busy || free <= 0 || you.cash < l.cost} onClick={() => onLine(l.line)} aria-label={`Add the ${info.name} line for ${cashText(l.cost)}`}>
                  Add for {cashText(l.cost)}
                </Button>
              )}
            </li>
          );
        })}
      </ul>
    </Dialog>
  );
}

/** Whether the till can take a customer now. Ticks with the game clock while someone waits, so only these small parts re-render. */
function useTill(you: You, busy: boolean, paused: boolean, gameNow: () => number) {
  useNow(250, you.queue.length > 0 && !paused);
  const now = gameNow();
  const tillBusy = you.queue.length > 0 && you.till.readyAt > now;
  return { now, tillBusy, canServe: you.queue.length > 0 && !busy && !paused && !tillBusy };
}

function TillButtons({ you, busy, paused, gameNow, onServe, onUpgrades }: { you: You; busy: boolean; paused: boolean; gameNow: () => number; onServe: () => void; onUpgrades: () => void }) {
  const { tillBusy, canServe } = useTill(you, busy, paused, gameNow);
  const front = you.queue[0];
  const canBuy = you.upgrades.some((u) => u.cost !== null && u.cost <= you.cash) || (you.lines.length < you.slots && you.lineShop.some((l) => !l.owned && l.cost <= you.cash));
  return (
    <div className="flex items-center gap-2">
      <Button size="lg" variant="primary" className="flex-1" disabled={!canServe} onClick={onServe} aria-label={front ? `Serve the next customer, ${front.name}: ${listItems(front.items)}. Shortcut: Space.` : 'Serve the next customer. Nobody is waiting.'} aria-keyshortcuts="Space">
        <Store className="size-5" aria-hidden /> {tillBusy ? 'Till busy' : 'Serve next'}
        <kbd className="ml-1 hidden rounded bg-black/20 px-1.5 text-xs font-bold sm:inline">Space</kbd>
      </Button>
      <Button size="lg" variant="secondary" onClick={onUpgrades} aria-label={`Upgrades${canBuy ? ': you can buy something' : ''}`}>
        <Package className="size-5" aria-hidden /> Upgrades{canBuy ? <span className="ml-1 size-2.5 rounded-full bg-lantern" aria-hidden /> : null}
      </Button>
    </div>
  );
}

function Queue({ you, busy, paused, gameNow, onServe }: { you: You; busy: boolean; paused: boolean; gameNow: () => number; onServe: (id: number) => void }) {
  const { now, canServe } = useTill(you, busy, paused, gameNow);
  return (
    <section aria-label={`Queue: ${you.queue.length} of ${you.queueMax}`}>
      <h3 className="mb-1 flex items-center gap-2 text-sm font-bold text-text-2">
        Queue {you.queue.length}/{you.queueMax}
        <span className="font-semibold">· about {you.perMinute} customers a minute</span>
      </h3>
      {you.queue.length ? (
        <ul className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-1 lg:grid lg:grid-cols-2 lg:overflow-visible xl:grid-cols-3">
          {you.queue.map((c) => (
            <CustomerCard key={c.id} c={c} now={now} canServe={canServe} onServe={() => onServe(c.id)} />
          ))}
        </ul>
      ) : (
        <p className="rounded-[var(--radius-m)] bg-white/[0.05] px-3 py-2 text-sm text-text-2">Nobody is waiting. Answer questions to stock up.</p>
      )}
    </section>
  );
}

/** The plain picture that stands in for the 3D shop: shelves as stock bars and the queue as faces. */
function ShopPicture({ you }: { you: You }) {
  return (
    <div className="flex h-full flex-col gap-2 rounded-[var(--radius-l)] bg-[linear-gradient(180deg,#f3e3c7_0,#f3e3c7_62%,#b9895a_62%)] p-3 pt-14 text-[#2a1c14]" role="img" aria-label={`${you.shopName}: ${you.queue.length} ${you.queue.length === 1 ? 'customer' : 'customers'} queuing, shelves ${you.shelves.map((s) => `${PRODUCTS[s.product].many} ${s.stock} of ${s.cap}`).join(', ')}.`}>
      <div className="grid flex-1 grid-cols-2 content-start gap-x-3 gap-y-1 sm:grid-cols-3">
        {you.shelves.map((s) => {
          const Icon = PRODUCT_ICON[s.product];
          return (
            <div key={s.product} className="flex items-center gap-1.5 rounded bg-[#9a6234]/25 px-1.5 py-1 text-xs font-bold">
              <Icon className="size-3.5 shrink-0" aria-hidden />
              <span className="relative h-2 flex-1 overflow-hidden rounded-full bg-black/15">
                <span className="absolute inset-y-0 left-0 rounded-full bg-[#3f9e4d]" style={{ width: `${(s.stock / Math.max(1, s.cap)) * 100}%` }} />
              </span>
              <span className="tabular">{s.stock}</span>
            </div>
          );
        })}
      </div>
      <div className="flex items-end gap-1 overflow-hidden">
        {you.queue.map((c) => (
          <div key={c.id} className="relative shrink-0">
            <Glim art={customerArt(c.look)} size={40} className="size-10" />
            {c.kind === 'vip' ? <Crown className="absolute -top-1 left-1/2 size-4 -translate-x-1/2 text-[#c99a1a]" aria-hidden /> : c.kind === 'hurry' ? <Timer className="absolute -top-1 right-0 size-4 text-[#d6334f]" aria-hidden /> : null}
          </div>
        ))}
        {you.queue.length === 0 ? <span className="text-sm font-bold opacity-70">No one waiting.</span> : null}
      </div>
    </div>
  );
}

/** The words for what just happened at the till and the door, held back until the picture has shown it. */
function useOutcome(you: You | null, threeD: boolean) {
  const [line, setLine] = useState<{ key: string; text: string; tone: 'good' | 'bad' | 'info' } | null>(null);
  const seen = useRef<{ sale: number; delivery: number; news: number } | null>(null);
  const sales = you?.sales;
  const delivery = you?.delivery ?? null;
  const news = you?.news[0] ?? null;
  useEffect(() => {
    if (!you) return;
    const topSale = Math.max(0, ...(sales ?? []).map((s) => s.seq));
    const now = { sale: topSale, delivery: delivery?.seq ?? 0, news: news?.seq ?? 0 };
    const was = seen.current;
    seen.current = now;
    if (!was) return;
    const timers: ReturnType<typeof setTimeout>[] = [];
    if (now.sale > was.sale) {
      const fresh = (sales ?? []).filter((s) => s.seq > was.sale);
      timers.push(
        setTimeout(
          () => {
            setLine({ key: `s${now.sale}`, text: fresh.map(saleLine).join(' '), tone: fresh.some((s) => s.kind !== 'full') ? 'info' : 'good' });
            playSfx(saleSound(fresh[0]!));
          },
          threeD ? 1300 : 0,
        ),
      );
    }
    if (delivery && now.delivery > was.delivery) {
      timers.push(
        setTimeout(
          () => {
            setLine({ key: `d${delivery.seq}`, text: deliveryLine(delivery), tone: 'good' });
            playSfx(delivery.crate === 'cash' ? 'coin' : 'build');
          },
          threeD ? 1450 : 0,
        ),
      );
    }
    if (news && now.news > was.news) {
      setLine({ key: `n${news.seq}`, text: news.kind === 'left' ? `${news.name} got tired of waiting and left.` : `${news.count === 1 ? 'A customer' : `${news.count} customers`} walked past: the queue was full.`, tone: 'bad' });
      playSfx(news.kind === 'left' ? 'lose' : 'tap');
    }
    return () => timers.forEach(clearTimeout);
    // `you` changes with every view; the seqs say what is new.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sales, delivery, news, threeD]);
  return line;
}

/* --------------------------------- player --------------------------------- */

export function CornerShopPlayer({ view, act, gameNow, paused, room }: ModeScreenProps<CornerShopView>) {
  const you = view.you ?? null;
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  const [upOpen, setUpOpen] = useState(false);
  const [threeD, setThreeD] = useState(true);
  const scene = useRef<CornerShopScene | null>(null);
  const me = room.players.find((p) => p.id === room.me.playerId);
  const look = useMemo(() => lookOf(me?.avatar, fallbackArt(room.me.playerId ?? 'me')), [me?.avatar, room.me.playerId]);
  const mates = useMemo(
    () => (view.coop && me?.teamId ? room.players.filter((p) => p.teamId === me.teamId && p.id !== me.id).map((p) => lookOf(p.avatar, fallbackArt(p.id))) : []),
    // Teammates are fixed for the game; read once.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [view.coop, me?.teamId],
  );
  const outcome = useOutcome(you, threeD);
  const shared = useSharedSounds();
  const eventKey = view.event ? `${view.event.kind}|${view.event.seq}` : null;
  useAnnounce(view.event ? `${EVENTS[view.event.kind].title}. ${EVENTS[view.event.kind].text}` : null, eventKey);
  useSfx('event', eventKey, shared && view.event !== null);
  useAnnounce(outcome?.text, outcome?.key);
  const offerKey = you?.offer ? `offer${you.offer.seq}` : null;
  useAnnounce(you?.offer ? `Pick a delivery: ${you.offer.options.map((o) => (o.kind === 'crate' ? 'a mystery crate' : itemText(o.product, o.qty))).join(', ')}.` : null, offerKey);

  const state: ShopState | null = you
    ? {
        shopName: you.shopName,
        lines: you.lines,
        slots: you.slots,
        cap: you.shelves[0]?.cap ?? 12,
        stock: Object.fromEntries(you.shelves.map((s) => [s.product, s.stock])),
        up: Object.fromEntries(you.upgrades.map((u) => [u.id, u.level])) as ShopState['up'],
        queue: you.queue,
        sales: you.sales,
        delivery: you.delivery,
        event: view.event?.kind ?? null,
      }
    : null;
  useEffect(() => {
    if (state) scene.current?.setState(state);
  });
  const onWorld = useCallback(
    (w: CornerShopScene | null) => {
      scene.current = w;
      setThreeD(Boolean(w));
      if (w && state) w.setState(state);
    },
    // The scene reads the newest state through the effect above.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );

  const send = useCallback(
    async (a: unknown) => {
      setBusy(true);
      const ack = await act(a);
      setBusy(false);
      setNote(ack.ok ? null : ack.error.message);
      return ack.ok;
    },
    [act],
  );
  const serve = useCallback(
    (customer?: number) => {
      playSfx('tap');
      void send(customer === undefined ? { type: 'serve' } : { type: 'serve', customer });
    },
    [send],
  );
  // Space serves the next customer, unless a key belongs to an answer box, a button or a dialog.
  const serveNext = useRef<() => void>(() => {});
  serveNext.current = () => {
    if (you && you.queue.length && !busy && !paused && you.till.readyAt <= gameNow()) serve();
  };
  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      if (e.code !== 'Space' || e.repeat || ownKey(e) || e.altKey || e.ctrlKey || e.metaKey) return;
      e.preventDefault();
      serveNext.current();
    };
    window.addEventListener('keydown', down);
    return () => window.removeEventListener('keydown', down);
  }, []);

  if (!you) return <p className="font-semibold text-text-2">Watching the high street.</p>;

  const submit = async (answer: Answer) => {
    const q = you.question;
    if (!q) return false;
    return (await act({ type: 'answer', iid: q.iid, answer })).ok;
  };
  const pick = (index: number) => {
    playSfx('tap');
    void send({ type: 'pickDelivery', offer: you.offer!.seq, index });
  };

  return (
    <div className="mx-auto grid w-full max-w-6xl gap-3 lg:grid-cols-[minmax(0,1.25fr)_minmax(0,1fr)] lg:items-start lg:gap-5">
      <section className="flex min-w-0 flex-col gap-2" aria-label="Your shop">
        <div className="relative">
          <Stage3D<CornerShopScene>
            label={`${you.shopName}: ${you.queue.length} ${you.queue.length === 1 ? 'customer' : 'customers'} in the queue.`}
            create={(env) => new CornerShopScene(env, look, gameNow, mates)}
            onWorld={onWorld}
            className="h-[30vh] min-h-[210px] rounded-[var(--radius-l)] sm:h-[40vh] lg:h-[52vh]"
            fallback={<ShopPicture you={you} />}
          />
          <div className="pointer-events-none absolute top-2 left-2 flex max-w-[calc(100%-3.5rem)] flex-wrap gap-1.5">
            <Stat label="Cash" value={cashText(you.cash)} icon={Wallet} tone="gold" />
            <Stat label="Rating" value={`${you.stars.toFixed(1)}`} icon={Star} />
            <Stat label="Customers served" value={you.shopServed} icon={Users} />
          </div>
          {view.event ? (
            <div className="pointer-events-none absolute bottom-2 left-2">
              <Pill tone="lantern" className="px-3 py-1 text-sm">
                {EVENTS[view.event.kind].title} <Countdown until={view.event.endsAt} gameNow={gameNow} />
              </Pill>
            </div>
          ) : null}
        </div>
        <TillButtons you={you} busy={busy} paused={paused} gameNow={gameNow} onServe={() => serve()} onUpgrades={() => setUpOpen(true)} />
        <Queue you={you} busy={busy} paused={paused} gameNow={gameNow} onServe={serve} />
        {outcome ? (
          <StagePanel className={`flex items-center gap-3 px-4 py-3 ${outcome.tone === 'bad' ? 'border-ember/60' : outcome.tone === 'good' ? 'border-glim/50' : ''}`}>
            <p className="font-bold">{outcome.text}</p>
          </StagePanel>
        ) : null}
        {note ? (
          <p className="text-sm font-bold text-ember" role="alert">
            {note}
          </p>
        ) : null}
      </section>
      <section className="flex min-w-0 flex-col gap-3" aria-label="Questions and deliveries">
        <p className="text-sm font-semibold text-text-2">Right answers bring deliveries. {you.streak > 1 ? `${you.streak} in a row.` : ''}</p>
        {you.last && !you.last.correct && you.question ? (
          <div className="flex flex-col gap-2">
            <ResultBanner key={you.last.iid} correct={false} partial={you.last.partial} text={you.last.text} />
            <Explanation text={you.last.explanation} />
          </div>
        ) : you.last?.correct ? (
          <ResultBanner key={you.last.iid} correct text={you.last.text} />
        ) : null}
        {you.offer ? <OfferCards you={you} onPick={pick} busy={busy} paused={paused} /> : null}
        {you.question ? (
          <>
            <QuestionCard q={you.question.q} />
            <AnswerInput key={you.question.iid} q={you.question.q} onSubmit={submit} disabled={paused} compact />
          </>
        ) : null}
        <Shelves you={you} />
      </section>
      <UpgradesDialog
        open={upOpen}
        onOpenChange={setUpOpen}
        you={you}
        busy={busy}
        onBuy={(id) => {
          playSfx('upgrade');
          void send({ type: 'upgrade', upgrade: id });
        }}
        onLine={(line) => {
          playSfx('upgrade');
          void send({ type: 'addLine', line });
        }}
      />
    </div>
  );
}

/* ---------------------------------- host ---------------------------------- */

/** The big screen without 3D: a row of shopfront cards. */
function StreetCards({ street }: { street: Front[] }) {
  return (
    <ul className="grid h-full content-start gap-2 overflow-hidden p-2 pt-16 [grid-template-columns:repeat(auto-fill,minmax(11rem,1fr))]" aria-label="The high street">
      {street.map((s, i) => (
        <li key={s.id} className="flex flex-col gap-1.5 rounded-[var(--radius-m)] p-2.5 text-[#2a1c14]" style={{ background: `hsl(${(i * 47 + 20) % 360} 40% 84%)` }}>
          <p className="truncate font-display text-lg font-extrabold">{s.name}</p>
          <p className="text-sm font-bold">
            ★ {s.stars.toFixed(1)} · {cashText(s.cash)}
          </p>
          <div className="flex min-h-7 items-end gap-0.5">
            {Array.from({ length: Math.min(8, s.queue) }, (_, k) => (
              <Glim key={k} art={fallbackArt(`${s.id}-${k}`)} size={24} className="size-6" />
            ))}
            {s.vip ? <Crown className="size-5 text-[#c99a1a]" aria-label="A VIP is waiting" /> : null}
          </div>
          <span className="sr-only">{`${s.queue} queuing.`}</span>
        </li>
      ))}
    </ul>
  );
}

export function CornerShopHost({ view, gameNow, room }: ModeScreenProps<CornerShopView>) {
  const scene = useRef<HighStreetScene | null>(null);
  const shops: StreetShop[] = useMemo(
    () =>
      (view.street ?? []).map((s) => {
        const owner = s.id.startsWith('p:') ? s.id.slice(2) : null;
        const team = s.id.startsWith('t:') ? s.id.slice(2) : null;
        const keeper = owner ? room.players.find((p) => p.id === owner) : room.players.find((p) => p.teamId === team);
        return { id: s.id, name: owner ? `${s.name}'s shop` : `The ${s.name}`, cash: s.cash, stars: s.stars, queue: s.queue, vip: s.vip, fill: s.fill, lines: s.lines, look: lookOf(keeper?.avatar, fallbackArt(keeper?.id ?? s.id)) };
      }),
    [view.street, room.players],
  );
  useEffect(() => {
    scene.current?.setShops(shops);
  }, [shops]);
  const eventKey = view.event ? `${view.event.kind}|${view.event.seq}` : null;
  useSfx('event', eventKey, view.event !== null);
  const rows = view.board.map((r) => ({ playerId: r.id.slice(2), name: r.name, score: r.cash, rank: r.rank, teamId: r.teamId }));

  return (
    <div className="relative mx-auto flex w-full max-w-[110rem] flex-1 flex-col gap-3">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex flex-col items-start gap-1">
          <ModeTitle>Corner Shop</ModeTitle>
          <p className="font-semibold text-text-2">Right answers bring the deliveries. Customers bring the cash.</p>
        </div>
        <div className="flex items-center gap-2 text-[clamp(1.1rem,1.8vw,2rem)]">
          <Pill className="px-5 py-1.5">{`${view.served ?? 0} served`}</Pill>
          <Pill className="px-5 py-1.5 text-[1.15em]">
            <Countdown until={view.endsAt} gameNow={gameNow} label="Time left" />
          </Pill>
        </div>
      </div>
      <div className="grid min-h-0 flex-1 gap-3 lg:grid-cols-[minmax(0,1fr)_minmax(18rem,26rem)]">
        <div className="relative min-h-[50vh]">
          <Stage3D<HighStreetScene>
            label={`The high street: ${view.shops} ${view.shops === 1 ? 'shop' : 'shops'} open.`}
            create={(env) => new HighStreetScene(env)}
            onWorld={(w) => {
              scene.current = w;
              w?.setShops(shops);
            }}
            className="absolute inset-0 rounded-[var(--radius-l)]"
            fallback={<StreetCards street={view.street ?? []} />}
          />
          {view.event ? (
            <div className="absolute top-3 left-3">
              <Pill tone="lantern" className="px-4 py-1.5 text-[clamp(1rem,1.6vw,1.6rem)]">
                {EVENTS[view.event.kind].title}: {EVENTS[view.event.kind].text} <Countdown until={view.event.endsAt} gameNow={gameNow} />
              </Pill>
            </div>
          ) : null}
          {view.streetMore ? (
            <div className="absolute right-3 bottom-3">
              <Pill className="px-4 py-1.5 text-[clamp(1rem,1.4vw,1.4rem)]">{`+${view.streetMore} more shops`}</Pill>
            </div>
          ) : null}
        </div>
        <StagePanel className="flex flex-col gap-3 p-3" as="aside" label="Most cash">
          <h3 className="font-display text-xl font-extrabold">Most cash</h3>
          {view.teams ? <TeamScores teams={view.teams.map((t) => ({ teamId: t.teamId, name: t.name, hue: t.hue, score: t.cash, members: t.members }))} format={cashText} /> : null}
          <Leaderboard rows={rows} players={room.players} teams={room.room.teams} big dense label={(r) => cashText(r.score)} />
          <p className="text-sm font-semibold text-text-2">
            {`${view.served ?? 0} customers served on the high street`}
            {view.left ? `, ${view.left} gave up waiting.` : '.'}
          </p>
        </StagePanel>
      </div>
    </div>
  );
}
