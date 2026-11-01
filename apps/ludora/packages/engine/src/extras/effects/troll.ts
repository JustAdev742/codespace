import { defineCheats } from '../registry.ts';
import type { ActiveEffect, ChaosApi, CheatDef } from '../types.ts';
import { answerToken, currentReveal, isAnswer, pickedChoice, target } from './kit.ts';

/*
 * Category C: trolling. Harmful cheats aimed at opponents that change what
 * they can do in the game: their moves are refused for a while, or only
 * accepted on conditions, or the chaos on them is rearranged. Every refusal
 * is a real refusal by the server, with a message saying why.
 */

const freezeLook = (text: string) => () => ({ kind: 'badge', text, tone: 'bad' });

/** The question instance a player's action is about, if the mode exposes one. */
function shownAt(api: ChaosApi, id: string): number | null {
  const iid = api.question(id);
  if (!iid) return null;
  try {
    return api.ctx.questions.instance(iid).shownAt;
  } catch {
    return null;
  }
}

const gates: CheatDef[] = [
  {
    id: 'troll.freeze',
    name: 'Freeze Ray',
    category: 'troll',
    description: 'An opponent is frozen solid for 5 seconds: none of their moves go through.',
    target: 'opponent',
    cost: 35,
    cooldownMs: 40_000,
    durationMs: 5_000,
    tags: ['lockout'],
    conflicts: ['lockout'],
    hooks: { gate: () => ({ block: 'You are frozen!' }) },
    overlay: freezeLook('Frozen'),
  },
  {
    id: 'troll.slowpoke',
    name: 'Slowpoke',
    category: 'troll',
    description: 'For 15 seconds, an opponent can make only one move every 3 seconds.',
    target: 'opponent',
    cost: 25,
    cooldownMs: 40_000,
    durationMs: 15_000,
    tags: ['lockout'],
    conflicts: ['lockout'],
    hooks: {
      gate: (api, fx) => {
        const last = Number(fx.data.lastAt ?? -Infinity);
        if (api.now() - last < 3000) return { block: `Slowpoke: wait ${Math.ceil((3000 - (api.now() - last)) / 1000)} s.` };
        fx.data.lastAt = api.now();
      },
    },
    overlay: freezeLook('Slowpoke'),
  },
  {
    id: 'troll.butterfingers',
    name: 'Butterfingers',
    category: 'troll',
    description: 'For 15 seconds, one in three of an opponent\'s moves slips through their fingers and does not count.',
    target: 'opponent',
    cost: 25,
    cooldownMs: 40_000,
    durationMs: 15_000,
    tags: ['lockout'],
    conflicts: ['lockout'],
    hooks: { gate: (api) => (api.rng.chance(1 / 3) ? { block: 'Butterfingers! That one slipped. Try again.' } : undefined) },
    overlay: freezeLook('Butterfingers'),
  },
  {
    id: 'troll.double-tap',
    name: 'Stutter',
    category: 'troll',
    description: 'For 15 seconds, an opponent has to make every move twice within 2 seconds for it to count.',
    target: 'opponent',
    cost: 25,
    cooldownMs: 40_000,
    durationMs: 15_000,
    tags: ['lockout'],
    conflicts: ['lockout'],
    hooks: {
      gate: (api, fx, _id, action) => {
        const key = JSON.stringify(action);
        const armed = fx.data.armed as { key: string; at: number } | undefined;
        if (armed && armed.key === key && api.now() - armed.at <= 2000) {
          delete fx.data.armed;
          return;
        }
        fx.data.armed = { key, at: api.now() };
        return { block: 'Stutter: do that again to make it count.' };
      },
    },
    overlay: freezeLook('Stutter'),
  },
  {
    id: 'troll.snooze',
    name: 'Snooze Button',
    category: 'troll',
    description: 'An opponent falls asleep for up to 12 seconds: their moves do nothing until they have tried 4 times to wake up.',
    target: 'opponent',
    cost: 25,
    cooldownMs: 40_000,
    durationMs: 12_000,
    tags: ['lockout'],
    conflicts: ['lockout'],
    hooks: {
      gate: (api, fx) => {
        const tries = Number(fx.data.tries ?? 0) + 1;
        fx.data.tries = tries;
        if (tries >= 4) {
          api.endEffect(fx.eid, 'used');
          return { block: 'You woke up! Go again.' };
        }
        return { block: `Zzz... (${4 - tries} more to wake up)` };
      },
    },
    overlay: freezeLook('Asleep'),
  },
  {
    id: 'troll.traffic-light',
    name: 'Red Light, Green Light',
    category: 'troll',
    description: 'For 16 seconds, an opponent can only move on green: the light switches every 2 seconds.',
    target: 'opponent',
    cost: 25,
    cooldownMs: 40_000,
    durationMs: 16_000,
    tags: ['lockout'],
    conflicts: ['lockout'],
    hooks: { gate: (api, fx) => (Math.floor((api.now() - fx.startedAt) / 2000) % 2 === 0 ? { block: 'Red light! Wait for green.' } : undefined) },
    overlay: (fx) => ({ kind: 'countdown', label: 'Red light, green light (switches every 2 s)', until: fx.endsAt, phaseMs: 2000, startedAt: fx.startedAt }),
  },
  {
    id: 'troll.slow-start',
    name: 'Slow Starter',
    category: 'troll',
    description: 'For 20 seconds, an opponent cannot answer during the first 4 seconds of each question.',
    target: 'opponent',
    needs: ['question'],
    cost: 25,
    cooldownMs: 40_000,
    durationMs: 20_000,
    tags: ['answer-timing'],
    conflicts: ['answer-timing'],
    hooks: {
      gate: (api, _fx, id, action) => {
        if (!isAnswer(action)) return;
        const at = shownAt(api, id);
        if (at !== null && api.now() - at < 4000) return { block: 'Slow starter: wait a moment before answering.' };
      },
    },
    overlay: freezeLook('Slow starter'),
  },
  {
    id: 'troll.hurry-curse',
    name: 'Hurry Curse',
    category: 'troll',
    description: 'For 20 seconds, an opponent\'s answers only count in the first 6 seconds of each question.',
    target: 'opponent',
    needs: ['question'],
    cost: 30,
    cooldownMs: 45_000,
    durationMs: 20_000,
    tags: ['answer-timing'],
    conflicts: ['answer-timing'],
    hooks: {
      gate: (api, _fx, id, action) => {
        if (!isAnswer(action)) return;
        const at = shownAt(api, id);
        if (at !== null && api.now() - at > 6000) return { block: 'Too slow! The hurry curse only lets you answer early.' };
      },
    },
    overlay: freezeLook('Hurry!'),
  },
  {
    id: 'troll.stage-fright',
    name: 'Stage Fright',
    category: 'troll',
    description: 'For 25 seconds, an opponent can only answer in the last 5 seconds before a question closes.',
    target: 'opponent',
    needs: ['sync'],
    cost: 30,
    cooldownMs: 45_000,
    durationMs: 25_000,
    tags: ['answer-timing'],
    conflicts: ['answer-timing'],
    hooks: {
      gate: (api, _fx, _id, action) => {
        const sync = api.sync();
        if (!isAnswer(action) || !sync || sync.phase !== 'question') return;
        if (sync.deadline - api.now() > 5000) return { block: 'Stage fright! You can only answer in the last 5 seconds.' };
      },
    },
    overlay: freezeLook('Stage fright'),
  },
  {
    id: 'troll.forbidden-choice',
    name: 'Forbidden Choice',
    category: 'troll',
    description: 'For 20 seconds, one random choice on each multiple-choice question is off-limits to an opponent. It might be the right one.',
    target: 'opponent',
    needs: ['question'],
    cost: 30,
    cooldownMs: 45_000,
    durationMs: 20_000,
    tickMs: 400,
    apply: (api, c, fx) => void pickForbidden(api, fx!, target(c)),
    hooks: {
      tick: (api, fx) => pickForbidden(api, fx, target(fx)),
      gate: (_api, fx, _id, action) => {
        const pick = pickedChoice(action);
        if (pick && fx.data.token === pick) return { block: 'That choice is forbidden for you right now.' };
      },
    },
    overlay: (fx) => (fx.data.iid && fx.data.token ? { kind: 'forbid-choice', iid: fx.data.iid, token: fx.data.token } : null),
  },
];

/** Pick one choice to forbid on the target's current question, once per question. */
function pickForbidden(api: ChaosApi, fx: ActiveEffect, who: string) {
  const r = currentReveal(api, who);
  if (!r || r.choices < 2) {
    fx.data.iid = null;
    fx.data.token = null;
    return;
  }
  if (fx.data.iid === r.iid) return;
  fx.data.iid = r.iid;
  fx.data.token = `c${api.rng.int(0, r.choices - 1)}`;
}

const curses = (api: ChaosApi, id: string) => api.effects().filter((e) => e.hostile && e.targets.includes(id));

const shuffles: CheatDef[] = [
  {
    id: 'troll.switcheroo',
    name: 'Switcheroo',
    category: 'troll',
    description: 'You and an opponent swap every cheat running on you: your curses become theirs and their buffs become yours.',
    target: 'opponent',
    cost: 40,
    cooldownMs: 60_000,
    undoable: false,
    apply: (api, c) => {
      const t = target(c);
      const touched = api.effects().filter((e) => e.targets.includes(c.caster) !== e.targets.includes(t));
      if (!touched.length) return { error: 'Neither of you has anything to swap.' };
      for (const e of touched) {
        e.targets = e.targets.map((x) => (x === c.caster ? t : x === t ? c.caster : x));
        if (!e.hostile && e.caster === t) e.caster = c.caster;
        else if (!e.hostile && e.caster === c.caster) e.caster = t;
      }
    },
  },
  {
    id: 'troll.pass-the-curse',
    name: 'Pass the Curse',
    category: 'troll',
    description: 'Every harmful cheat on you jumps onto an opponent, with the time it has left.',
    target: 'opponent',
    cost: 30,
    cooldownMs: 45_000,
    undoable: false,
    apply: (api, c) => {
      const mine = curses(api, c.caster).filter((e) => e.caster !== target(c));
      if (!mine.length) return { error: 'Nothing harmful is on you to pass on.' };
      for (const e of mine) e.targets = [...new Set(e.targets.map((x) => (x === c.caster ? target(c) : x)))];
    },
  },
  {
    id: 'troll.curse-spreader',
    name: 'Curse Spreader',
    category: 'troll',
    description: 'Every harmful cheat on an opponent spreads to their whole team, for the time it has left.',
    target: 'opponent',
    needs: ['teams'],
    cost: 45,
    cooldownMs: 75_000,
    undoable: false,
    apply: (api, c) => {
      const t = target(c);
      const team = api.teammates(t);
      const theirs = curses(api, t);
      if (!theirs.length || !team.length) return { error: `${api.name(t)} has no curses to spread, or no teammates.` };
      for (const e of theirs) e.targets = [...new Set([...e.targets, ...team])];
    },
  },
  {
    id: 'troll.extend-curses',
    name: 'Lingering Hex',
    category: 'troll',
    description: 'Every harmful cheat on an opponent lasts 8 seconds longer.',
    target: 'opponent',
    cost: 25,
    cooldownMs: 45_000,
    undoable: false,
    apply: (api, c) => {
      const theirs = curses(api, target(c));
      if (!theirs.length) return { error: `${api.name(target(c))} has no curses to stretch.` };
      for (const e of theirs) e.endsAt += 8000;
    },
  },
  {
    id: 'troll.silence',
    name: 'Silence',
    category: 'troll',
    description: 'For 20 seconds, an opponent cannot cast any cheats.',
    target: 'opponent',
    cost: 30,
    cooldownMs: 60_000,
    durationMs: 20_000,
    tags: ['silenced'],
    overlay: freezeLook('Silenced: no chaos'),
  },
  {
    id: 'troll.energy-drain',
    name: 'Energy Vampire',
    category: 'troll',
    description: 'Drains 30 chaos energy from an opponent and gives it to you.',
    target: 'opponent',
    cost: 10,
    cooldownMs: 45_000,
    undoable: false,
    apply: (api, c) => {
      const t = target(c);
      const theirs = api.energy(t);
      if (theirs < 1) return { error: `${api.name(t)} has no energy to drain.` };
      const take = Math.min(30, theirs);
      api.setEnergy(t, theirs - take);
      api.setEnergy(c.caster, api.energy(c.caster) + take);
    },
  },
  {
    id: 'troll.cooldown-jam',
    name: 'Jammed Gears',
    category: 'troll',
    description: 'Every cheat an opponent has cooling down takes 20 seconds longer to be ready.',
    target: 'opponent',
    cost: 20,
    cooldownMs: 45_000,
    undoable: false,
    apply: (api, c) => {
      const cs = api.casterState(target(c));
      const waiting = Object.entries(cs.cooldowns).filter(([, until]) => until > api.now());
      if (!waiting.length) return { error: `${api.name(target(c))} has nothing cooling down to jam.` };
      for (const [id, until] of waiting) cs.cooldowns[id] = until + 20_000;
    },
  },
  {
    id: 'troll.jinx',
    name: 'Jinx',
    category: 'troll',
    description: 'An opponent\'s answer streak drops to zero, so they lose any streak bonus they were building.',
    target: 'opponent',
    needs: ['sync'],
    cost: 20,
    cooldownMs: 40_000,
    undoable: false,
    apply: (api, c) => {
      const sync = api.sync()!;
      const t = target(c);
      if (!(sync.streaks[t] ?? 0)) return { error: `${api.name(t)} has no streak to break.` };
      sync.streaks[t] = 0;
    },
  },
  {
    id: 'troll.contrarian',
    name: 'Contrarian Curse',
    category: 'troll',
    description: 'For 20 seconds, an opponent cannot pick any choice someone else has already picked on the open question.',
    target: 'opponent',
    needs: ['sync'],
    cost: 30,
    cooldownMs: 45_000,
    durationMs: 20_000,
    hooks: {
      gate: (api, _fx, id, action) => {
        const sync = api.sync();
        const pick = answerToken(action);
        if (!pick || !sync || sync.phase !== 'question') return;
        if (Object.entries(sync.answers).some(([who, a]) => who !== id && a.token === pick)) return { block: 'Contrarian curse: someone already picked that one. Choose another.' };
      },
    },
    overlay: freezeLook('Contrarian'),
  },
];

defineCheats([...gates, ...shuffles]);
