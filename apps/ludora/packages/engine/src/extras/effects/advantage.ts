import { allCheats, defineCheats, isHostile } from '../registry.ts';
import type { ActiveEffect, ChaosApi, CheatDef } from '../types.ts';
import { currentReveal, target } from './kit.ts';

/*
 * Category B: player advantage. Information only the caster sees, ways to
 * shrug off other players' chaos, and help for teammates. Information
 * cheats work from the server's own question data, refreshed while they
 * last, so the caster's screen is told the truth about the question on it.
 */

/** Refresh the question an information cheat is about, for whoever it watches. */
function watchQuestion(api: ChaosApi, fx: ActiveEffect, who: string) {
  const r = currentReveal(api, who);
  fx.data.iid = r?.iid ?? null;
  fx.data.reveal = r?.reveal ?? null;
  fx.data.choices = r?.choices ?? 0;
}

function hostileOn(api: ChaosApi, id: string) {
  return api.effects().filter((e) => e.hostile && e.targets.includes(id));
}

/** Free one player from an effect; an effect left with nobody to affect ends. */
function release(api: ChaosApi, fx: ActiveEffect, id: string) {
  fx.targets = fx.targets.filter((t) => t !== id);
  if (!fx.targets.length) api.endEffect(fx.eid, 'cleansed');
}

function buffsOn(api: ChaosApi, id: string) {
  return api.effects().filter((e) => !e.hostile && e.targets.includes(id) && e.caster === id);
}

const info: CheatDef[] = [
  {
    id: 'adv.peek',
    name: 'Peek',
    category: 'advantage',
    description: 'For 15 seconds, your screen highlights the right answer to whatever question you are looking at.',
    target: 'self',
    needs: ['question'],
    cost: 45,
    cooldownMs: 60_000,
    durationMs: 15_000,
    tickMs: 500,
    apply: (api, c, fx) => void watchQuestion(api, fx!, c.caster),
    hooks: { tick: (api, fx) => watchQuestion(api, fx, fx.caster) },
    overlay: (fx) => (fx.data.iid ? { kind: 'peek', iid: fx.data.iid, reveal: fx.data.reveal } : null),
  },
  {
    id: 'adv.fifty-fifty',
    name: 'Fifty-Fifty',
    category: 'advantage',
    description: 'For 20 seconds, two wrong choices disappear from every multiple-choice question on your screen.',
    target: 'self',
    needs: ['question'],
    cost: 30,
    cooldownMs: 45_000,
    durationMs: 20_000,
    tickMs: 500,
    apply: (api, c, fx) => void watchQuestion(api, fx!, c.caster),
    hooks: { tick: (api, fx) => watchQuestion(api, fx, fx.caster) },
    overlay: (fx) => {
      const reveal = fx.data.reveal as { type?: string; correct?: unknown } | null;
      const n = Number(fx.data.choices ?? 0);
      if (!fx.data.iid || reveal?.type !== 'mcq' || n < 3) return null;
      // Which two go depends only on the question, so the same ones stay hidden while it is on screen.
      const wrong = Array.from({ length: n }, (_, i) => `c${i}`).filter((t) => t !== reveal.correct);
      const seed = String(fx.data.iid).split('').reduce((a, ch) => a + ch.charCodeAt(0), 0);
      const hide = [wrong[seed % wrong.length]!, wrong[(seed + 1) % wrong.length]!];
      return { kind: 'hide-choices', iid: fx.data.iid, tokens: [...new Set(hide)] };
    },
  },
  {
    id: 'adv.crowd-hint',
    name: 'Crowd Whisper',
    category: 'advantage',
    description: 'For 15 seconds, you see how many players have picked each choice on the open question, before the reveal.',
    target: 'self',
    needs: ['sync'],
    cost: 25,
    cooldownMs: 45_000,
    durationMs: 15_000,
    tickMs: 500,
    apply: (api, c, fx) => void tally(api, fx!),
    hooks: { tick: (api, fx) => tally(api, fx) },
    overlay: (fx) => (fx.data.iid ? { kind: 'tally', iid: fx.data.iid, counts: fx.data.counts } : null),
  },
  {
    id: 'adv.spyglass',
    name: 'Spyglass',
    category: 'advantage',
    description: 'For 20 seconds, you see which choice an opponent picked on the open question as soon as they pick it.',
    target: 'opponent',
    hostile: true,
    overlayFor: 'caster',
    needs: ['sync'],
    cost: 30,
    cooldownMs: 45_000,
    durationMs: 20_000,
    tickMs: 400,
    apply: (api, c, fx) => void spy(api, fx!, target(c)),
    hooks: { tick: (api, fx) => spy(api, fx, target(fx)) },
    overlay: (fx) => (fx.data.token ? { kind: 'spy', iid: fx.data.iid, token: fx.data.token, name: fx.data.name } : null),
  },
  {
    id: 'adv.stealth',
    name: 'Stealth Mode',
    category: 'advantage',
    description: 'For 25 seconds, your name and score vanish from everyone else\'s leaderboards.',
    target: 'self',
    cost: 20,
    cooldownMs: 60_000,
    durationMs: 25_000,
    overlayFor: 'all',
    overlay: (fx) => ({ kind: 'hide-player', playerId: fx.caster }),
  },
];

function tally(api: ChaosApi, fx: ActiveEffect) {
  const sync = api.sync();
  if (!sync || sync.phase !== 'question' || !sync.iid) {
    fx.data.iid = null;
    return;
  }
  const counts: Record<string, number> = {};
  for (const a of Object.values(sync.answers)) if (a.token) counts[a.token] = (counts[a.token] ?? 0) + 1;
  fx.data.iid = sync.iid;
  fx.data.counts = counts;
}

function spy(api: ChaosApi, fx: ActiveEffect, who: string) {
  const sync = api.sync();
  const a = sync && sync.phase === 'question' ? sync.answers[who] : undefined;
  fx.data.iid = sync?.iid ?? null;
  fx.data.token = a?.token ?? null;
  fx.data.name = api.name(who);
}

const defence: CheatDef[] = [
  {
    id: 'adv.shield',
    name: 'Shield',
    category: 'advantage',
    description: 'Blocks the next harmful cheat anyone casts at you in the next 30 seconds.',
    target: 'self',
    cost: 20,
    cooldownMs: 40_000,
    durationMs: 30_000,
    tags: ['shield'],
    apply: (_api, _c, fx) => void (fx!.data.charges = 1),
    overlay: () => ({ kind: 'badge', text: 'Shielded', tone: 'good' }),
  },
  {
    id: 'adv.mirror',
    name: 'Magic Mirror',
    category: 'advantage',
    description: 'The next harmful cheat cast at you in the next 30 seconds bounces back onto whoever cast it.',
    target: 'self',
    cost: 30,
    cooldownMs: 50_000,
    durationMs: 30_000,
    tags: ['reflect'],
    apply: (_api, _c, fx) => void (fx!.data.charges = 1),
    overlay: () => ({ kind: 'badge', text: 'Mirror up', tone: 'good' }),
  },
  {
    id: 'adv.fortress',
    name: 'Fortress',
    category: 'advantage',
    description: 'For 15 seconds no cheat can touch you, but you cannot cast any either.',
    target: 'self',
    cost: 35,
    cooldownMs: 90_000,
    durationMs: 15_000,
    tags: ['shield', 'fortress'],
    apply: (_api, _c, fx) => void (fx!.data.charges = 1_000),
    overlay: () => ({ kind: 'badge', text: 'Fortress', tone: 'good' }),
  },
  {
    id: 'adv.cleanse',
    name: 'Cleanse',
    category: 'advantage',
    description: 'Ends every harmful cheat on you right now.',
    target: 'self',
    cost: 25,
    cooldownMs: 45_000,
    apply: (api, c) => {
      const curses = hostileOn(api, c.caster);
      if (!curses.length) return { error: 'Nothing harmful is on you.' };
      for (const fx of curses) release(api, fx, c.caster);
    },
  },
  {
    id: 'adv.rescue',
    name: 'Rescue',
    category: 'advantage',
    description: 'Ends every harmful cheat on another player you choose.',
    target: 'player',
    hostile: false,
    cost: 20,
    cooldownMs: 40_000,
    apply: (api, c) => {
      if (target(c) === c.caster) return { error: 'Use Cleanse on yourself.' };
      const curses = hostileOn(api, target(c));
      if (!curses.length) return { error: `Nothing harmful is on ${api.name(target(c))}.` };
      for (const fx of curses) release(api, fx, target(c));
    },
  },
  {
    id: 'adv.dispel',
    name: 'Dispel',
    category: 'advantage',
    description: 'Ends every helpful cheat an opponent has cast on themselves.',
    target: 'opponent',
    cost: 30,
    cooldownMs: 45_000,
    apply: (api, c) => {
      const buffs = buffsOn(api, target(c));
      if (!buffs.length) return { error: `${api.name(target(c))} has no helpful cheats running.` };
      for (const fx of buffs) api.endEffect(fx.eid, 'cleansed');
    },
  },
  {
    id: 'adv.steal-buff',
    name: 'Buff Thief',
    category: 'advantage',
    description: 'Takes an opponent\'s newest helpful cheat and moves it onto you, with the time it has left.',
    target: 'opponent',
    cost: 35,
    cooldownMs: 60_000,
    undoable: false,
    apply: (api, c) => {
      const buff = buffsOn(api, target(c)).sort((a, b) => b.startedAt - a.startedAt)[0];
      if (!buff) return { error: `${api.name(target(c))} has no helpful cheats to steal.` };
      buff.caster = c.caster;
      buff.targets = [c.caster];
    },
  },
  {
    id: 'adv.bodyguard',
    name: 'Bodyguard',
    category: 'advantage',
    description: 'For 25 seconds, harmful cheats aimed at a player you choose hit you instead.',
    target: 'player',
    hostile: false,
    cost: 20,
    cooldownMs: 45_000,
    durationMs: 25_000,
    tags: ['bodyguard'],
    apply: (api, c) => (target(c) === c.caster ? { error: 'Pick someone else to protect.' } : undefined),
    overlay: (fx) => ({ kind: 'badge', text: 'Guarded', tone: 'good', by: fx.caster }),
  },
  {
    id: 'adv.decoy',
    name: 'Decoy',
    category: 'advantage',
    description: 'The next harmful cheat aimed at you in the next 30 seconds hits a random other player instead.',
    target: 'self',
    cost: 20,
    cooldownMs: 45_000,
    durationMs: 30_000,
    tags: ['decoy'],
    overlay: () => ({ kind: 'badge', text: 'Decoy ready', tone: 'good' }),
  },
  {
    id: 'adv.team-aura',
    name: 'Guardian Aura',
    category: 'advantage',
    description: 'Every player on your team gets a shield that blocks one harmful cheat in the next 20 seconds.',
    target: 'my-team',
    needs: ['teams'],
    cost: 45,
    cooldownMs: 90_000,
    durationMs: 20_000,
    tags: ['shield'],
    // One effect covers the team; each block uses one of the team's charges.
    apply: (_api, c, fx) => void (fx!.data.charges = c.targets.length),
    overlay: () => ({ kind: 'badge', text: 'Aura', tone: 'good' }),
  },
];

const meta: CheatDef[] = [
  {
    id: 'adv.second-wind',
    name: 'Second Wind',
    category: 'advantage',
    description: 'Refills 50 chaos energy at once.',
    target: 'self',
    cost: 0,
    cooldownMs: 120_000,
    undoable: false,
    apply: (api, c) => {
      const e = api.energy(c.caster);
      if (e >= 100) return { error: 'Your energy is already full.' };
      api.setEnergy(c.caster, e + 50);
    },
  },
  {
    id: 'adv.cooldown-reset',
    name: 'Reset the Clock',
    category: 'advantage',
    description: 'Every cheat you have cooling down is ready again.',
    target: 'self',
    cost: 40,
    cooldownMs: 180_000,
    undoable: false,
    apply: (api, c) => {
      const cs = api.casterState(c.caster);
      const waiting = Object.entries(cs.cooldowns).filter(([, until]) => until > api.now());
      if (!waiting.length) return { error: 'Nothing is cooling down.' };
      cs.cooldowns = {};
    },
  },
  {
    id: 'adv.thrift',
    name: 'Bargain Hunter',
    category: 'advantage',
    description: 'For 20 seconds, your cheats cost half as much energy.',
    target: 'self',
    cost: 15,
    cooldownMs: 90_000,
    durationMs: 20_000,
    tags: ['thrifty'],
    overlay: () => ({ kind: 'badge', text: 'Half-price chaos', tone: 'good' }),
  },
];

const rounds: CheatDef[] = [
  {
    id: 'adv.streak-saver',
    name: 'Streak Saver',
    category: 'advantage',
    description: 'For 40 seconds, if your answer streak breaks, it is put back once.',
    target: 'self',
    needs: ['sync'],
    cost: 20,
    cooldownMs: 60_000,
    durationMs: 40_000,
    tickMs: 250,
    apply: (api, c, fx) => {
      const sync = api.sync()!;
      fx!.data.streak = sync.streaks[c.caster] ?? 0;
    },
    hooks: {
      tick: (api, fx) => {
        const sync = api.sync();
        if (!sync) return;
        const now = sync.streaks[fx.caster] ?? 0;
        const was = Number(fx.data.streak ?? 0);
        if (now === 0 && was > 0) {
          sync.streaks[fx.caster] = was;
          api.feed(`${api.name(fx.caster)}'s streak of ${was} was saved.`, 'good', [fx.caster]);
          api.endEffect(fx.eid, 'used');
          return;
        }
        fx.data.streak = now;
      },
    },
    overlay: () => ({ kind: 'badge', text: 'Streak saver', tone: 'good' }),
  },
  {
    id: 'adv.streak-boost',
    name: 'Hot Hand',
    category: 'advantage',
    description: 'Adds 2 to your answer streak right now, so streak bonuses kick in sooner.',
    target: 'self',
    needs: ['sync'],
    cost: 20,
    cooldownMs: 45_000,
    undoable: false,
    apply: (api, c) => {
      const sync = api.sync()!;
      sync.streaks[c.caster] = (sync.streaks[c.caster] ?? 0) + 2;
    },
  },
  {
    id: 'adv.revive',
    name: 'Second Life',
    category: 'advantage',
    description: 'Brings a knocked-out player (you or anyone else) back into the game.',
    target: 'player',
    hostile: false,
    needs: ['revive', 'knockouts'],
    cost: 60,
    cooldownMs: 120_000,
    undoable: false,
    apply: (api, c) => {
      const t = target(c);
      if (!api.isOut(t)) return { error: `${api.name(t)} is still in the game.` };
      if (!api.adapter.revive?.(api.s, t, api.ctx)) return { error: `${api.name(t)} cannot come back in this game.` };
      api.feed(`${api.name(t)} is back in the game!`, 'big');
    },
  },
];

/** Cheats a roulette or mystery box may hand out as buffs. Exported for random.ts. */
export function buffPool(): CheatDef[] {
  return allCheats().filter((d) => d.target === 'self' && !isHostile(d) && d.durationMs !== undefined && !(d.tags ?? []).includes('fortress'));
}

defineCheats([...info, ...defence, ...meta, ...rounds]);
