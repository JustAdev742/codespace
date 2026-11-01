import { defineCombo } from '../registry.ts';
import type { ActiveEffect, ChaosApi } from '../types.ts';
import { share, transfer } from './kit.ts';

/*
 * Combinations: two or more cheats cast together in one go do something
 * extra. The menu lists them; casting the set together triggers the bonus
 * on top of each cheat's own effect.
 */

const extend = (effects: ActiveEffect[], ids: string[], ms: number) => {
  for (const fx of effects) if (ids.includes(fx.cheatId)) fx.endsAt += ms;
};

const stealMore = (api: ChaosApi, caster: string, effects: ActiveEffect[], from: string | undefined, pct: number) => {
  if (from && from !== caster) transfer(api, 'score', from, caster, share(api.score(from), pct));
  void effects;
};

defineCombo({
  id: 'combo.smash-and-grab',
  name: 'Smash and Grab',
  cheats: ['troll.freeze', 'score.pickpocket'],
  description: 'Freeze someone and pick their pocket together: you grab another 10% while they are frozen.',
  apply: (api, caster, effects) => stealMore(api, caster, effects, effects.find((e) => e.cheatId === 'troll.freeze')?.targets[0], 10),
});

defineCombo({
  id: 'combo.diamond-skin',
  name: 'Diamond Skin',
  cheats: ['adv.shield', 'adv.mirror'],
  description: 'Shield and mirror together: each blocks (or bounces) one extra cheat and both last 15 seconds longer.',
  apply: (_api, _caster, effects) => {
    for (const fx of effects) fx.data.charges = Number(fx.data.charges ?? 1) + 1;
    extend(effects, ['adv.shield', 'adv.mirror'], 15_000);
  },
});

defineCombo({
  id: 'combo.golden-hour',
  name: 'Golden Hour',
  cheats: ['score.double-points', 'score.compound-interest'],
  description: 'Double points with compound interest: both last 10 seconds longer.',
  apply: (_api, _caster, effects) => extend(effects, ['score.double-points', 'score.compound-interest'], 10_000),
});

defineCombo({
  id: 'combo.lost-in-space',
  name: 'Lost in Space',
  cheats: ['look.upside-down', 'look.night'],
  description: 'Upside down in the dark: both last 6 seconds longer.',
  apply: (_api, _caster, effects) => extend(effects, ['look.upside-down', 'look.night'], 6_000),
});

defineCombo({
  id: 'combo.cold-snap',
  name: 'Cold Snap',
  cheats: ['troll.freeze', 'round.rush'],
  description: 'Freeze someone and rush the question: they stay frozen until it closes.',
  apply: (api, _caster, effects) => {
    const freeze = effects.find((e) => e.cheatId === 'troll.freeze');
    const sync = api.sync();
    if (freeze && sync && sync.phase === 'question') freeze.endsAt = Math.max(freeze.endsAt, sync.deadline);
  },
});

defineCombo({
  id: 'combo.vampire-lord',
  name: 'Vampire Lord',
  cheats: ['score.siphon', 'score.bleed'],
  description: 'Siphon and bloodsucker on the same victim: both last 10 seconds longer.',
  apply: (_api, _caster, effects) => extend(effects, ['score.siphon', 'score.bleed'], 10_000),
});

defineCombo({
  id: 'combo.white-out',
  name: 'White-Out',
  cheats: ['look.snow', 'look.fog'],
  description: 'Blizzard and fog together: the victim also loses their timer for as long as the snow falls.',
  apply: (api, caster, effects) => {
    const snow = effects.find((e) => e.cheatId === 'look.snow');
    if (snow) api.spawn('look.hide-timer', { caster, targets: snow.targets.slice(), team: null, params: {} });
  },
});

defineCombo({
  id: 'combo.heist-crew',
  name: 'Heist Crew',
  cheats: ['score.grand-heist', 'adv.decoy'],
  description: 'A heist with a decoy ready: you take an extra 5% from your mark.',
  apply: (api, caster) => {
    const mark = api.log().filter((l) => l.kind === 'cast' && l.caster === caster).at(-1)?.targets?.find((t) => t !== caster);
    stealMore(api, caster, [], mark, 5);
  },
});

defineCombo({
  id: 'combo.total-lockdown',
  name: 'Total Lockdown',
  cheats: ['troll.silence', 'troll.slowpoke'],
  description: 'Silence and slowpoke on someone: both last 8 seconds longer.',
  apply: (_api, _caster, effects) => extend(effects, ['troll.silence', 'troll.slowpoke'], 8_000),
});

defineCombo({
  id: 'combo.market-crash',
  name: 'Market Crash',
  cheats: ['eco.bank-run', 'eco.price-hike'],
  description: 'A bank run while prices are hiked: the price hike lasts 10 seconds longer.',
  apply: (_api, _caster, effects) => extend(effects, ['eco.price-hike'], 10_000),
});
