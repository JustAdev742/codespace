import { defineCheats } from '../registry.ts';
import type { CheatDef } from '../types.ts';
import { CURRENCY, nothingToTake, odds, rollOdds, scaleGain, share, standings, target, transfer } from './kit.ts';

/*
 * Category D: economy. Cheats on a game's own match currency (coins in
 * Festival Workshop and Lantern Trail, gold in Lantern Guard, energy in
 * Lantern Lands). Only the in-game economy moves: nothing here can reach a
 * player's account, wallet or collection. Purchases a mode makes still
 * happen exactly as the mode decided; refunds and surcharges change only
 * what the purchase cost.
 */

const C = CURRENCY;
const M = 'currency';

const instant: CheatDef[] = [
  {
    id: 'eco.pickpocket',
    name: 'Light Fingers',
    category: 'economy',
    description: 'Take 12% of an opponent\'s coins (or gold, or energy: whatever this game spends).',
    target: 'opponent',
    needs: C,
    cost: 20,
    cooldownMs: 20_000,
    apply: (api, c) => nothingToTake(api, target(c), M) ?? void transfer(api, M, target(c), c.caster, share(api.get(M, target(c)), 12)),
  },
  {
    id: 'eco.coin-shower',
    name: 'Coin Shower',
    category: 'economy',
    description: 'Every player gets 6% more of the game\'s currency (at least 1).',
    target: 'everyone',
    hostile: false,
    needs: C,
    cost: 20,
    cooldownMs: 45_000,
    apply: (api, c) => {
      let n = 0;
      for (const t of c.targets) n += api.add(M, t, Math.max(1, share(api.get(M, t), 6)));
      if (!n) return { error: 'Nobody can hold any more.' };
    },
  },
  {
    id: 'eco.bank-run',
    name: 'Bank Run',
    category: 'economy',
    description: 'Everyone except the poorest player loses 15% of their currency.',
    target: 'room',
    hostile: true,
    needs: C,
    cost: 40,
    cooldownMs: 60_000,
    apply: (api) => {
      const rows = standings(api, M);
      const poorest = rows.at(-1)?.id;
      let lost = 0;
      for (const r of rows) if (r.id !== poorest) lost -= api.add(M, r.id, -share(r.v, 15));
      if (!lost) return { error: 'Nobody has anything to lose.' };
    },
  },
  {
    id: 'eco.swap-wallets',
    name: 'Wallet Swap',
    category: 'economy',
    description: 'You and an opponent swap all your currency.',
    target: 'opponent',
    needs: C,
    cost: 40,
    cooldownMs: 60_000,
    apply: (api, c) => {
      const a = api.get(M, c.caster);
      const b = api.get(M, target(c));
      if (a === b) return { error: 'You already hold the same amount.' };
      api.set(M, c.caster, b);
      api.set(M, target(c), a);
    },
  },
  {
    id: 'eco.tax-audit',
    name: 'Tax Audit',
    category: 'economy',
    description: 'An opponent loses 25% of their currency; you collect a fifth of what they lose as a finder\'s fee.',
    target: 'opponent',
    needs: C,
    cost: 35,
    cooldownMs: 50_000,
    apply: (api, c) => {
      const t = target(c);
      const no = nothingToTake(api, t, M);
      if (no) return no;
      const lost = -api.add(M, t, -share(api.get(M, t), 25));
      api.add(M, c.caster, Math.max(1, Math.floor(lost / 5)));
    },
  },
  {
    id: 'eco.charity',
    name: 'Charity Drive',
    category: 'economy',
    description: 'Give 20% of your currency to whoever has the least.',
    target: 'room',
    hostile: false,
    needs: C,
    cost: 5,
    cooldownMs: 20_000,
    apply: (api, c) => {
      const poorest = standings(api, M).filter((r) => r.id !== c.caster).at(-1)?.id;
      if (!poorest) return { error: 'There is nobody to give to.' };
      return nothingToTake(api, c.caster, M) ?? void transfer(api, M, c.caster, poorest, share(api.get(M, c.caster), 20));
    },
  },
  {
    id: 'eco.windfall',
    name: 'Windfall',
    category: 'economy',
    description: `A surprise for your purse. Odds: ${odds([['+10%', 55], ['+25%', 30], ['+60%', 10], ['lose 10%', 5]])}.`,
    target: 'self',
    needs: C,
    cost: 20,
    cooldownMs: 40_000,
    apply: (api, c) => {
      const pct = rollOdds(api, [[10, 55], [25, 30], [60, 10], [-10, 5]]);
      const v = api.get(M, c.caster);
      const d = pct > 0 ? Math.max(1, share(v, pct)) : -share(v, -pct);
      if (!api.add(M, c.caster, d)) return { error: 'Your purse could not change (it is full or empty).' };
      api.feed(`Windfall: ${pct > 0 ? '+' : ''}${pct}% for ${api.name(c.caster)}.`, pct > 0 ? 'good' : 'bad');
    },
  },
];

const lasting: CheatDef[] = [
  {
    id: 'eco.free-spree',
    name: 'Shopping Spree',
    category: 'economy',
    description: 'For 15 seconds, everything you buy is refunded in full.',
    target: 'self',
    needs: C,
    cost: 45,
    cooldownMs: 90_000,
    durationMs: 15_000,
    tags: ['spending'],
    conflicts: ['spending'],
    priority: 40,
    hooks: { delta: { currency: (_api, fx, d) => void ((d[fx.caster] ?? 0) < 0 && (d[fx.caster] = 0)) } },
    overlay: () => ({ kind: 'badge', text: 'Everything free', tone: 'good' }),
  },
  {
    id: 'eco.price-hike',
    name: 'Price Hike',
    category: 'economy',
    description: 'For 15 seconds, everything an opponent buys costs them double (as far as they can pay).',
    target: 'opponent',
    needs: C,
    cost: 30,
    cooldownMs: 45_000,
    durationMs: 15_000,
    tags: ['spending'],
    conflicts: ['spending'],
    priority: 30,
    hooks: { delta: { currency: (_api, fx, d) => void ((d[target(fx)] ?? 0) < 0 && (d[target(fx)]! *= 2)) } },
    overlay: () => ({ kind: 'badge', text: 'Prices doubled', tone: 'bad' }),
  },
  {
    id: 'eco.cashback',
    name: 'Cashback',
    category: 'economy',
    description: 'For 30 seconds, a quarter of everything you spend comes back to you.',
    target: 'self',
    needs: C,
    cost: 20,
    cooldownMs: 45_000,
    durationMs: 30_000,
    priority: 45,
    hooks: { delta: { currency: (_api, fx, d) => void ((d[fx.caster] ?? 0) < 0 && (d[fx.caster] = d[fx.caster]! + Math.max(1, Math.floor(-d[fx.caster]! / 4)))) } },
    overlay: () => ({ kind: 'badge', text: 'Cashback 25%', tone: 'good' }),
  },
  {
    id: 'eco.counterfeit',
    name: 'Counterfeit Coins',
    category: 'economy',
    description: 'For 20 seconds, an opponent earns only half the currency they should.',
    target: 'opponent',
    needs: C,
    cost: 25,
    cooldownMs: 40_000,
    durationMs: 20_000,
    priority: 20,
    tags: ['income'],
    conflicts: ['income'],
    hooks: { delta: { currency: (_api, fx, d) => void ((d[target(fx)] ?? 0) > 0 && (d[target(fx)] = scaleGain(d[target(fx)]!, 0.5))) } },
    overlay: () => ({ kind: 'badge', text: 'Counterfeit', tone: 'bad' }),
  },
  {
    id: 'eco.wallet-freeze',
    name: 'Frozen Purse',
    category: 'economy',
    description: 'For 12 seconds, an opponent cannot earn any currency.',
    target: 'opponent',
    needs: C,
    cost: 30,
    cooldownMs: 45_000,
    durationMs: 12_000,
    priority: 40,
    tags: ['income'],
    conflicts: ['income'],
    hooks: { delta: { currency: (_api, fx, d) => void ((d[target(fx)] ?? 0) > 0 && (d[target(fx)] = 0)) } },
    overlay: () => ({ kind: 'badge', text: 'Purse frozen', tone: 'bad' }),
  },
  {
    id: 'eco.money-printer',
    name: 'Money Printer',
    category: 'economy',
    description: 'For 20 seconds, you gain 4% more currency (at least 1) every 4 seconds.',
    target: 'self',
    needs: C,
    cost: 30,
    cooldownMs: 60_000,
    durationMs: 20_000,
    tickMs: 4_000,
    hooks: { tick: (api, fx) => void api.add(M, fx.caster, Math.max(1, share(api.get(M, fx.caster), 4))) },
    overlay: () => ({ kind: 'badge', text: 'Printing money', tone: 'good' }),
  },
  {
    id: 'eco.loan-shark',
    name: 'Loan Shark',
    category: 'economy',
    description: 'Borrow 40% of your currency now (at least 3). In 25 seconds you pay back 1.5 times what you borrowed, or everything you have if that is less.',
    target: 'self',
    needs: C,
    cost: 10,
    cooldownMs: 60_000,
    durationMs: 25_000,
    stacking: 'reject',
    apply: (api, c, fx) => {
      const got = api.add(M, c.caster, Math.max(3, share(api.get(M, c.caster), 40)));
      if (!got) return { error: 'You cannot hold any more right now.' };
      fx!.data.owed = Math.ceil(got * 1.5);
    },
    hooks: {
      end: (api, fx, reason) => {
        if (reason === 'left' || reason === 'undone') return;
        const paid = -api.add(M, fx.caster, -Number(fx.data.owed ?? 0));
        api.feed(`${api.name(fx.caster)} paid the loan shark ${paid}.`, 'info');
      },
    },
    overlay: (fx) => ({ kind: 'countdown', label: `Loan due: ${Number(fx.data.owed ?? 0)}`, until: fx.endsAt }),
  },
  {
    id: 'eco.skim',
    name: 'Skimming',
    category: 'economy',
    description: 'For 20 seconds, 20% of everything an opponent earns goes to you instead.',
    target: 'opponent',
    needs: C,
    cost: 30,
    cooldownMs: 45_000,
    durationMs: 20_000,
    priority: 10,
    hooks: {
      delta: {
        currency: (api, fx, d) => {
          const t = target(fx);
          if ((d[t] ?? 0) <= 0 || !api.ids().includes(fx.caster)) return;
          const cut = share(d[t]!, 20);
          d[t]! -= cut;
          d[fx.caster] = (d[fx.caster] ?? 0) + cut;
        },
      },
    },
    overlay: () => ({ kind: 'badge', text: 'Being skimmed', tone: 'bad' }),
  },
];

defineCheats([...instant, ...lasting]);
