import { defineCheats } from '../registry.ts';
import type { ActiveEffect, ChaosApi, CheatDef } from '../types.ts';
import { inGame, odds, rollOdds, target, transfer } from '../cheats/kit.ts';
import { STORM_CHANCE_CAP, strongerWind, WINDS, type WindKind } from '../../modes/sky-lanterns/index.ts';

/*
 * Cheats that only make sense in sky-lanterns: they change the wind, call or
 * clear storms, move the wind's clock, and tamper with oil, lit lanterns
 * waiting on the ground and launches. Every cheat here has modes:
 * ['sky-lanterns'] and an id starting with 'sky-lanterns.'.
 *
 * Oil, lanterns waiting and the storm chance are adapter meters, so the oil
 * can never overfills and the forecast never shows a storm the mode would
 * not roll. A wind is only ever one the game's settings allow, and the
 * festival finale's last gale is never touched.
 */

const MODE = 'sky-lanterns';

interface Flyer {
  stream: { last: { text?: string } | null };
  oil: number;
  ground: number;
  score: number;
  launched: number;
  best: number;
  lost: number;
  lastLaunch: { count: number; mult: number; points: number; at: number } | null;
  lastLoss: { count: number; at: number } | null;
}

interface Wind {
  kind: WindKind;
  since: number;
  changeAt: number | null;
  changes: number;
  storm: { at: number; lost: number } | null;
}

const flyer = (api: ChaosApi, id: string): Flyer | undefined => api.s.flyers[id];
const wind = (api: ChaosApi): Wind => api.s.wind;
const setting = (api: ChaosApi, key: string) => api.ctx.settings[key];
const windChangeMs = (api: ChaosApi) => Number(setting(api, 'windChangeSec')) * 1000;
const isFinale = (api: ChaosApi) => setting(api, 'windPattern') === 'finale';
const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

const ORDER: readonly WindKind[] = ['calm', 'breezy', 'gusty', 'gale'];
/** The winds this game can blow (a gale only with Gales on). */
const allowedWinds = (api: ChaosApi): WindKind[] => ORDER.filter((k) => k !== 'gale' || Boolean(setting(api, 'gales')));

/** The festival finale's last gale is blowing; nothing changes it. */
function finaleLocked(api: ChaosApi): { error: string } | null {
  return isFinale(api) && wind(api).changeAt === null ? { error: 'The festival finale gale is blowing. Nothing can change it now.' } : null;
}

/** Change the wind that is blowing now. It keeps its time; a wind that followed a storm loses the storm note once it is no longer calm. */
function setWind(api: ChaosApi, kind: WindKind) {
  const w = wind(api);
  w.kind = kind;
  if (kind !== 'calm') w.storm = null;
  if (kind === 'gale') api.feed('A gale! Every lantern launched now scores ×4.', 'big');
}

/** Blow out up to `n` of a player's waiting lanterns, recorded as lost the way a storm records them. */
function blowOut(api: ChaosApi, id: string, n: number): number {
  const gone = -api.add('ground', id, -n);
  const f = flyer(api, id);
  if (gone && f) {
    f.lost += gone;
    f.lastLoss = { count: gone, at: api.now() };
  }
  return gone;
}

/** Points per lantern of a launch this transaction (the mode just made it), with the display fixed to match a new multiplier. */
function relabelLaunch(api: ChaosApi, id: string, mult: number, points: number) {
  const f = flyer(api, id);
  if (!f?.lastLaunch) return;
  f.lastLaunch.mult = mult;
  f.lastLaunch.points = points;
  f.best = Math.max(f.best, points);
  const top = api.s.launches[0];
  if (top && top.playerId === id && top.at === api.now()) {
    top.mult = mult;
    top.points = points;
  }
}

/** The launch the mode made for this player in this transaction, if any. */
function launchNow(api: ChaosApi, id: string, d: Record<string, number>) {
  const l = flyer(api, id)?.lastLaunch;
  return (d[id] ?? 0) > 0 && l && l.at === api.now() ? l : null;
}

const noWaiting = (api: ChaosApi, id: string) => (api.get('ground', id) > 0 ? null : { error: `${api.name(id)} has no lanterns waiting.` });

/*
 * A player's best launch. The mode raises it as soon as a launch lands, so a
 * cheat that makes a launch score less (or later) puts back the best from
 * before: the effect keeps it in fx.data.best, read again every second.
 */
function keepBest(api: ChaosApi, fx: ActiveEffect, id: string) {
  const f = flyer(api, id);
  if (f) fx.data.best = f.best;
}

/** After a launch that scored `full` was cut to `scored`, the best launch is what it was before, or `scored` if that is better. */
function cutBest(api: ChaosApi, fx: ActiveEffect, id: string, full: number, scored: number) {
  const f = flyer(api, id);
  if (!f) return;
  if (f.best === full) f.best = Math.max(Number(fx.data.best ?? 0), scored);
  fx.data.best = f.best;
}

/** Record lanterns scoring now (a delayed launch landing), as the mode records a launch. */
function recordLaunch(api: ChaosApi, id: string, count: number, mult: number, points: number) {
  const f = flyer(api, id);
  if (!f) return;
  const at = api.now();
  f.best = Math.max(f.best, points);
  f.lastLaunch = { count, mult, points, at };
  api.s.launches = [{ playerId: id, count, mult, points, at }, ...api.s.launches].slice(0, 6);
}

const LANTERNS = ['lanterns'] as const;
const GROUND = ['lanterns', 'meter:ground'] as const;
const OIL = ['lanterns', 'meter:oil'] as const;
const STORMS = ['lanterns', 'storms'] as const;

const instant: CheatDef[] = [
  {
    id: 'sky-lanterns.summon-gust',
    name: 'Summon a Sky Gust',
    category: 'round',
    description: 'The wind blowing now gets one step stronger (calm to breezy, breezy to gusty, gusty to a gale when Gales are on). It still changes at its usual time.',
    target: 'room',
    modes: [MODE],
    needs: LANTERNS,
    undoable: false,
    cost: 35,
    cooldownMs: 50_000,
    apply: (api) => {
      const locked = finaleLocked(api);
      if (locked) return locked;
      const now = wind(api).kind;
      const next = strongerWind(now, Boolean(setting(api, 'gales')));
      if (next === now) return { error: 'The wind is already as strong as this game allows.' };
      setWind(api, next);
      api.feed(`A summoned gust: the wind is now ${WINDS[next].label.toLowerCase()} (×${WINDS[next].mult}).`, 'info');
    },
  },
  {
    id: 'sky-lanterns.dead-calm',
    name: 'Dead Calm Skies',
    category: 'troll',
    description: 'The wind blowing now drops to calm (×1) until its usual change.',
    target: 'room',
    hostile: true,
    modes: [MODE],
    needs: LANTERNS,
    undoable: false,
    cost: 30,
    cooldownMs: 50_000,
    apply: (api) => {
      const locked = finaleLocked(api);
      if (locked) return locked;
      if (wind(api).kind === 'calm') return { error: 'The wind is already calm.' };
      setWind(api, 'calm');
      api.feed('The wind died away to a dead calm (×1).', 'bad');
    },
  },
  {
    id: 'sky-lanterns.hurry-wind',
    name: 'Hurry the Sky Wind',
    category: 'round',
    description: 'The wind changes right now instead of at its usual time, with the storm chance the forecast shows. The next change comes the usual time after this one.',
    target: 'room',
    modes: [MODE],
    needs: LANTERNS,
    undoable: false,
    cost: 30,
    cooldownMs: 50_000,
    apply: (api) => {
      const w = wind(api);
      if (w.changeAt === null) return { error: 'This is the last wind of the game.' };
      w.changeAt = api.now();
      api.ctx.setTimer('wind', w.changeAt);
    },
  },
  {
    id: 'sky-lanterns.hold-breeze',
    name: 'Hold the Sky Breeze',
    category: 'round',
    description: 'The wind blowing now lasts 15 seconds longer before it changes. Not when that would carry it to the end of the game.',
    target: 'room',
    modes: [MODE],
    needs: LANTERNS,
    undoable: false,
    cost: 30,
    cooldownMs: 50_000,
    apply: (api) => {
      const s = api.s;
      const w = wind(api);
      if (w.changeAt === null) return { error: 'This wind already lasts until the end of the game.' };
      const at = w.changeAt + 15_000;
      if (at >= s.endsAt) return { error: 'Held that long, this wind would blow until the end of the game.' };
      w.changeAt = at;
      api.ctx.setTimer('wind', at);
      // Festival finale: if the held change is now the last one, it brings the gale and no storm, so the forecast says so.
      if (isFinale(api) && at + windChangeMs(api) >= s.endsAt) s.stormChance = 0;
      api.feed(`The ${WINDS[w.kind].label.toLowerCase()} wind will hold for 15 more seconds.`, 'info');
    },
  },
  {
    id: 'sky-lanterns.storm-front',
    name: 'Sky Storm Front',
    category: 'troll',
    description: `A storm front rolls in: the storm chance for the next wind change jumps to ${STORM_CHANCE_CAP}%. The mode sets the chance again after that change. Needs Storms on.`,
    target: 'room',
    hostile: true,
    modes: [MODE],
    needs: STORMS,
    cost: 40,
    cooldownMs: 60_000,
    apply: (api) => {
      if (!api.add('stormChance', 'game', STORM_CHANCE_CAP)) return { error: 'No bigger storm can come at the next change.' };
      api.feed(`A storm front! ${STORM_CHANCE_CAP}% chance of a storm at the next wind change.`, 'bad');
    },
  },
  {
    id: 'sky-lanterns.clear-skies',
    name: 'Clear Night Skies',
    category: 'advantage',
    description: 'The sky clears: the storm chance for the next wind change drops to 0%. The mode sets the chance again after that change. Needs Storms on.',
    target: 'room',
    modes: [MODE],
    needs: STORMS,
    cost: 35,
    cooldownMs: 60_000,
    apply: (api) => {
      if (!api.set('stormChance', 'game', 0)) return { error: 'There is no chance of a storm at the next change already.' };
      api.feed('The sky cleared: no storm can come at the next wind change.', 'good');
    },
  },
  {
    id: 'sky-lanterns.lightning',
    name: 'Sky Lantern Lightning',
    category: 'troll',
    description: 'A bolt of lightning blows out half of an opponent\'s waiting lanterns (rounded up). Launched points are safe.',
    target: 'opponent',
    modes: [MODE],
    needs: GROUND,
    undoable: false,
    cost: 35,
    cooldownMs: 45_000,
    apply: (api, c) => {
      const t = target(c);
      const no = noWaiting(api, t);
      if (no) return no;
      const gone = blowOut(api, t, Math.ceil(api.get('ground', t) / 2));
      api.feed(`Lightning blew out ${plural(gone, 'lantern')} of ${api.name(t)}'s.`, 'bad');
    },
  },
  {
    id: 'sky-lanterns.oil-siphon',
    name: 'Sky Oil Siphon',
    category: 'economy',
    description: 'Siphon half of an opponent\'s oil (rounded up) into your own can, as much as your can will hold.',
    target: 'opponent',
    modes: [MODE],
    needs: OIL,
    cost: 20,
    cooldownMs: 30_000,
    apply: (api, c) => {
      const t = target(c);
      const have = api.get('oil', t);
      if (have <= 0) return { error: `${api.name(t)} has no oil.` };
      if (!transfer(api, 'oil', t, c.caster, Math.ceil(have / 2))) return { error: 'Your oil can is already full.' };
    },
  },
  {
    id: 'sky-lanterns.lantern-thief',
    name: 'Sky Lantern Thief',
    category: 'economy',
    description: 'Steal a third of an opponent\'s waiting lanterns (rounded up) and add them to yours, still lit.',
    target: 'opponent',
    modes: [MODE],
    needs: GROUND,
    cost: 30,
    cooldownMs: 40_000,
    apply: (api, c) => {
      const t = target(c);
      const no = noWaiting(api, t);
      if (no) return no;
      const got = transfer(api, 'ground', t, c.caster, Math.ceil(api.get('ground', t) / 3));
      api.feed(`${api.name(c.caster)} stole ${plural(got, 'lantern')} from ${api.name(t)}.`, 'info');
    },
  },
  {
    id: 'sky-lanterns.lantern-swap',
    name: 'Sky Lantern Swap',
    category: 'troll',
    description: 'Swap every lantern you have waiting on the ground for every lantern an opponent has waiting.',
    target: 'opponent',
    modes: [MODE],
    needs: GROUND,
    cost: 35,
    cooldownMs: 50_000,
    apply: (api, c) => {
      const t = target(c);
      const mine = api.get('ground', c.caster);
      const theirs = api.get('ground', t);
      if (mine === theirs) return { error: 'You have the same number of lanterns waiting.' };
      api.set('ground', c.caster, theirs);
      api.set('ground', t, mine);
    },
  },
  {
    id: 'sky-lanterns.sky-toll',
    name: 'Sky Lantern Toll',
    category: 'troll',
    description: 'Every other player with a lantern waiting pays you a toll of one lit lantern.',
    target: 'everyone-else',
    modes: [MODE],
    needs: GROUND,
    cost: 35,
    cooldownMs: 50_000,
    apply: (api, c) => {
      let got = 0;
      for (const id of c.targets) if (api.get('ground', id) > 0) got += transfer(api, 'ground', id, c.caster, 1);
      if (!got) return { error: 'Nobody else has a lantern waiting.' };
      api.feed(`${api.name(c.caster)} collected a toll of ${plural(got, 'lantern')}.`, 'info');
    },
  },
  {
    id: 'sky-lanterns.full-can',
    name: 'Brimming Sky-Oil Can',
    category: 'economy',
    description: 'Your oil can fills to the brim (enough oil for two lanterns).',
    target: 'self',
    modes: [MODE],
    needs: OIL,
    cost: 25,
    cooldownMs: 40_000,
    apply: (api, c) => (api.add('oil', c.caster, 999) ? undefined : { error: 'Your oil can is already full.' }),
  },
  {
    id: 'sky-lanterns.festival',
    name: 'Sky Lantern Festival',
    category: 'economy',
    description: 'A festival gift: every player, you included, gets one free lit lantern waiting on the ground.',
    target: 'everyone',
    modes: [MODE],
    needs: GROUND,
    cost: 25,
    cooldownMs: 60_000,
    apply: (api, c) => {
      for (const id of c.targets) api.add('ground', id, 1);
      api.feed('Lantern festival! Everyone has a free lantern waiting.', 'good');
    },
  },
  {
    id: 'sky-lanterns.forced-launch',
    name: 'Forced Lantern Launch',
    category: 'troll',
    description: 'Launch all of an opponent\'s waiting lanterns right now, on whatever wind is blowing. They keep the points the wind gives.',
    target: 'opponent',
    modes: [MODE],
    needs: GROUND,
    undoable: false,
    cost: 30,
    cooldownMs: 45_000,
    apply: (api, c) => {
      const t = target(c);
      const no = noWaiting(api, t);
      if (no) return no;
      const f = flyer(api, t)!;
      const mult = WINDS[wind(api).kind].mult;
      const count = api.get('ground', t);
      const points = count * mult;
      const at = api.now();
      api.set('ground', t, 0);
      api.addScore(t, points);
      f.launched += count;
      f.best = Math.max(f.best, points);
      f.lastLaunch = { count, mult, points, at };
      api.s.launches = [{ playerId: t, count, mult, points, at }, ...api.s.launches].slice(0, 6);
      api.feed(`${api.name(t)}'s ${plural(count, 'lantern')} were launched early on a ${WINDS[wind(api).kind].label.toLowerCase()} wind for ${plural(points, 'point')}.`, 'info');
    },
  },
  {
    id: 'sky-lanterns.longer-night',
    name: 'Longer Sky Lantern Night',
    category: 'round',
    description: 'The night lasts 20 seconds longer, and the wind keeps changing on its usual beat until the new end. Not in the festival finale, whose last gale keeps its time.',
    target: 'room',
    modes: [MODE],
    needs: LANTERNS,
    undoable: false,
    cost: 35,
    cooldownMs: 90_000,
    apply: (api) => {
      if (isFinale(api)) return { error: 'The festival finale keeps its own time.' };
      const s = api.s;
      s.endsAt += 20_000;
      api.ctx.setTimer('time', s.endsAt);
      const w = wind(api);
      // The last wind was meant to blow until the end; with the end later, it changes on the usual beat if that now comes first.
      const at = w.since + windChangeMs(api);
      if (w.changeAt === null && at < s.endsAt) {
        w.changeAt = at;
        api.ctx.setTimer('wind', at);
      }
      api.feed('The night grows longer: 20 more seconds to launch lanterns.', 'good');
    },
  },
  {
    id: 'sky-lanterns.sky-wish',
    name: 'Sky Wish Lantern',
    category: 'random',
    description: `Make a wish on a lantern. Odds: ${odds([['two free lit lanterns', 50], ['one free lit lantern', 30], ['a gust blows one of your waiting lanterns away (if none are waiting, you get one instead)', 20]])}.`,
    target: 'self',
    modes: [MODE],
    needs: GROUND,
    undoable: false,
    cost: 20,
    cooldownMs: 30_000,
    apply: (api, c) => {
      const roll = rollOdds(api, [[2, 50], [1, 30], [-1, 20]]);
      if (roll < 0 && api.get('ground', c.caster) > 0) {
        blowOut(api, c.caster, 1);
        api.feed(`${api.name(c.caster)}'s wish backfired: a gust took a lantern.`, 'bad');
        return;
      }
      const got = api.add('ground', c.caster, Math.abs(roll));
      api.feed(`${api.name(c.caster)}'s wish came true: ${plural(got, 'free lantern')}.`, 'good');
    },
  },
  {
    id: 'sky-lanterns.weather-vane',
    name: 'Sky Weather Vane',
    category: 'random',
    description: `Spin the weather vane: the wind blowing now turns into a different one at random. Odds: ${odds([['each other wind this game allows', 50]])} with Gales off (two to choose from), or about 33% each with Gales on (three).`,
    target: 'room',
    modes: [MODE],
    needs: LANTERNS,
    undoable: false,
    cost: 25,
    cooldownMs: 40_000,
    apply: (api) => {
      const locked = finaleLocked(api);
      if (locked) return locked;
      const now = wind(api).kind;
      const next = api.rng.pick(allowedWinds(api).filter((k) => k !== now));
      setWind(api, next);
      api.feed(`The weather vane spun: the wind is now ${WINDS[next].label.toLowerCase()} (×${WINDS[next].mult}).`, 'info');
    },
  },
  {
    id: 'sky-lanterns.rekindle',
    name: 'Sky Lantern Rekindle',
    category: 'advantage',
    description: 'Relight the lanterns you lost most recently (to a storm, lightning, a fuse or any other blow-out), if they went out in the last 30 seconds. They wait on the ground again, lit.',
    target: 'self',
    modes: [MODE],
    needs: GROUND,
    undoable: false,
    cost: 30,
    cooldownMs: 50_000,
    apply: (api, c) => {
      const f = flyer(api, c.caster);
      const loss = f?.lastLoss;
      if (!f || !loss || loss.count <= 0) return { error: 'You have no lost lanterns to relight.' };
      if (api.now() - loss.at > 30_000) return { error: 'Your lanterns went out more than 30 seconds ago: the embers are cold.' };
      const back = api.add('ground', c.caster, loss.count);
      if (!back) return { error: 'Your lanterns could not be relit.' };
      // The lanterns are no longer lost: the player's tally, and the storm's if a storm took them, say so.
      f.lost = Math.max(0, f.lost - back);
      const storm = wind(api).storm;
      if (storm && storm.at === loss.at) storm.lost = Math.max(0, storm.lost - back);
      f.lastLoss = null;
      api.feed(`${api.name(c.caster)} rekindled ${plural(back, 'lost lantern')}.`, 'good');
    },
  },
  {
    id: 'sky-lanterns.early-dawn',
    name: 'Early Sky Lantern Dawn',
    category: 'round',
    description: 'Dawn comes early: the night ends 20 seconds sooner, never closer than 30 seconds from now. A wind change that would now come after the end is called off, so the wind blowing then lasts until the end. Not in the festival finale, whose last gale keeps its time.',
    target: 'room',
    modes: [MODE],
    needs: LANTERNS,
    undoable: false,
    cost: 35,
    cooldownMs: 90_000,
    apply: (api) => {
      if (isFinale(api)) return { error: 'The festival finale keeps its own time.' };
      const s = api.s;
      const to = Math.max(s.endsAt - 20_000, api.now() + 30_000);
      if (to >= s.endsAt) return { error: 'The night is already down to its last 30 seconds.' };
      const cut = Math.round((s.endsAt - to) / 1000);
      s.endsAt = to;
      api.ctx.setTimer('time', to);
      // As the mode schedules it: a change only comes if it is due before the end.
      const w = wind(api);
      if (w.changeAt !== null && w.changeAt >= to) {
        w.changeAt = null;
        api.ctx.clearTimer('wind');
      }
      api.feed(`Dawn is coming early: the night is ${cut} seconds shorter.`, 'info');
    },
  },
];

const lasting: CheatDef[] = [
  {
    id: 'sky-lanterns.raincloud',
    name: 'Personal Raincloud',
    category: 'troll',
    description: 'A raincloud follows an opponent until the next wind change (at most 60 seconds). When the wind changes, every lantern they still have waiting is blown out, storm or no storm. Only on an opponent with lanterns waiting.',
    target: 'opponent',
    modes: [MODE],
    needs: GROUND,
    cost: 35,
    cooldownMs: 60_000,
    durationMs: 60_000,
    apply: (api, c) => {
      if (wind(api).changeAt === null) return { error: 'The wind will not change again this game.' };
      return noWaiting(api, target(c)) ?? undefined;
    },
    hooks: {
      delta: {
        windChanges: (api, fx, d) => {
          if ((d.game ?? 0) <= 0) return;
          const t = target(fx);
          const gone = blowOut(api, t, api.get('ground', t));
          if (gone) api.feed(`The raincloud over ${api.name(t)} burst and blew out ${plural(gone, 'lantern')}.`, 'bad');
          api.endEffect(fx.eid, 'used');
        },
      },
    },
    overlay: () => ({ kind: 'badge', text: 'A raincloud hangs over your lanterns until the wind changes', tone: 'bad' }),
  },
  {
    id: 'sky-lanterns.fuse-lantern',
    name: 'Sky Lantern Fuse',
    category: 'troll',
    description: 'Light a fuse under an opponent\'s lanterns: if they still have lanterns waiting after 12 seconds, half of them (rounded up) burn away. Launching them in time is safe.',
    target: 'opponent',
    modes: [MODE],
    needs: GROUND,
    cost: 25,
    cooldownMs: 40_000,
    durationMs: 12_000,
    apply: (api, c) => noWaiting(api, target(c)) ?? undefined,
    hooks: {
      end: (api, fx, reason) => {
        const t = target(fx);
        if (reason !== 'expired') return;
        const gone = blowOut(api, t, Math.ceil(api.get('ground', t) / 2));
        if (gone) api.feed(`The fuse burnt out ${plural(gone, 'lantern')} of ${api.name(t)}'s.`, 'bad');
      },
    },
    overlay: (fx) => ({ kind: 'countdown', label: 'Fuse lit: launch your lanterns!', until: fx.endsAt }),
  },
  {
    id: 'sky-lanterns.shelter',
    name: 'Sky Storm Shelter',
    category: 'advantage',
    description: 'Shelter your waiting lanterns until the next wind change (at most 60 seconds): if that change brings a storm, your lanterns come through it. Needs Storms on.',
    target: 'self',
    modes: [MODE],
    needs: ['lanterns', 'meter:ground', 'storms'],
    cost: 30,
    cooldownMs: 50_000,
    durationMs: 60_000,
    apply: (api, c) => {
      if (wind(api).changeAt === null) return { error: 'The wind will not change again this game.' };
      return noWaiting(api, c.caster) ?? undefined;
    },
    hooks: {
      delta: {
        windChanges: (api, fx, d) => {
          if ((d.game ?? 0) <= 0) return;
          const me = fx.caster;
          const f = flyer(api, me);
          const storm = wind(api).storm;
          const loss = f?.lastLoss;
          if (f && storm && storm.at === api.now() && loss && loss.at === api.now()) {
            const back = api.add('ground', me, loss.count);
            f.lost -= back;
            storm.lost -= back;
            f.lastLoss = null;
            api.feed(`${api.name(me)}'s ${plural(back, 'lantern')} came through the storm in a shelter.`, 'good');
          }
          api.endEffect(fx.eid, 'used');
        },
      },
    },
    overlay: () => ({ kind: 'badge', text: 'Lanterns sheltered from the next storm', tone: 'good' }),
  },
  {
    id: 'sky-lanterns.rigged-wind',
    name: 'Rigged Sky Wind',
    category: 'round',
    description: 'Rig the weather: the storm chance drops to 0%, and the next wind change (within 60 seconds) brings a gusty wind (×3). Not when the next change is the festival finale gale.',
    target: 'room',
    modes: [MODE],
    needs: LANTERNS,
    cost: 50,
    cooldownMs: 90_000,
    durationMs: 60_000,
    apply: (api) => {
      const w = wind(api);
      if (w.changeAt === null) return { error: 'The wind will not change again this game.' };
      if (isFinale(api) && w.changeAt + windChangeMs(api) >= api.s.endsAt) return { error: 'The next change is the festival finale gale already.' };
      api.set('stormChance', 'game', 0);
    },
    hooks: {
      delta: {
        windChanges: (api, fx, d) => {
          if ((d.game ?? 0) <= 0) return;
          api.endEffect(fx.eid, 'used');
          // A hold may have made this the finale's last change after all: its gale stands.
          if (finaleLocked(api) || wind(api).kind === 'gusty') return;
          setWind(api, 'gusty');
          api.feed('The rigged wind arrived: it is gusty (×3).', 'info');
        },
      },
    },
    overlay: () => ({ kind: 'badge', text: 'A gusty wind is on its way', tone: 'info' }),
  },
  {
    id: 'sky-lanterns.grounded',
    name: 'Grounded Sky Lanterns',
    category: 'troll',
    description: 'For 10 seconds, an opponent cannot launch their lanterns.',
    target: 'opponent',
    modes: [MODE],
    needs: GROUND,
    cost: 30,
    cooldownMs: 45_000,
    durationMs: 10_000,
    hooks: { gate: (_api, _fx, _id, a) => ((a as { type?: string }).type === 'launch' ? { block: 'Your lanterns are grounded for a moment!' } : undefined) },
    overlay: (fx) => ({ kind: 'countdown', label: 'Grounded: no launching', until: fx.endsAt }),
  },
  {
    id: 'sky-lanterns.wet-wicks',
    name: 'Wet Sky-Lantern Wicks',
    category: 'troll',
    description: 'For 10 seconds, an opponent\'s wicks are wet: they cannot light lanterns.',
    target: 'opponent',
    modes: [MODE],
    needs: OIL,
    cost: 25,
    cooldownMs: 40_000,
    durationMs: 10_000,
    hooks: { gate: (_api, _fx, _id, a) => ((a as { type?: string }).type === 'light' ? { block: 'Your wicks are wet! They will not light yet.' } : undefined) },
    overlay: (fx) => ({ kind: 'countdown', label: 'Wet wicks: no lighting', until: fx.endsAt }),
  },
  {
    id: 'sky-lanterns.leaky-curse',
    name: 'Leaky Oil Can Curse',
    category: 'troll',
    description: 'For 20 seconds, every wrong answer an opponent gives spills 1 oil from their can (on top of any Leaky Can spill).',
    target: 'opponent',
    modes: [MODE],
    needs: ['lanterns', 'meter:oil', 'meter:wrongAnswers'],
    cost: 20,
    cooldownMs: 35_000,
    durationMs: 20_000,
    hooks: {
      delta: {
        wrongAnswers: (api, fx, d) => {
          const t = target(fx);
          if ((d[t] ?? 0) <= 0 || !api.add('oil', t, -1)) return;
          const last = flyer(api, t)?.stream.last;
          if (last) last.text = `${last.text ?? 'No oil'} · cursed can: spilt 1 oil`;
        },
      },
    },
    overlay: () => ({ kind: 'badge', text: 'Cursed can: wrong answers spill oil', tone: 'bad' }),
  },
  {
    id: 'sky-lanterns.oil-rush',
    name: 'Sky Oil Rush',
    category: 'economy',
    description: 'For 20 seconds, the oil you earn from correct answers is doubled (your can still only holds two lanterns\' worth).',
    target: 'self',
    modes: [MODE],
    needs: OIL,
    cost: 25,
    cooldownMs: 40_000,
    durationMs: 20_000,
    priority: 20,
    hooks: { delta: { oil: (_api, fx, d) => void ((d[fx.caster] ?? 0) > 0 && (d[fx.caster]! *= 2)) } },
    overlay: () => ({ kind: 'badge', text: 'Oil rush: oil ×2', tone: 'good' }),
  },
  {
    id: 'sky-lanterns.dry-spell',
    name: 'Sky Oil Dry Spell',
    category: 'troll',
    description: 'For 15 seconds, an opponent\'s correct answers earn them no oil.',
    target: 'opponent',
    modes: [MODE],
    needs: OIL,
    cost: 25,
    cooldownMs: 40_000,
    durationMs: 15_000,
    priority: 40,
    hooks: {
      delta: {
        oil: (api, fx, d) => {
          const t = target(fx);
          if ((d[t] ?? 0) <= 0) return;
          d[t] = 0;
          const last = flyer(api, t)?.stream.last;
          if (last) last.text = 'Dry spell: no oil';
        },
      },
    },
    overlay: () => ({ kind: 'badge', text: 'Dry spell: no oil from answers', tone: 'bad' }),
  },
  {
    id: 'sky-lanterns.twin-wicks',
    name: 'Twin Sky-Lantern Wicks',
    category: 'economy',
    description: 'For 20 seconds, every lantern you light comes with a twin: you get two lit lanterns for the oil of one.',
    target: 'self',
    modes: [MODE],
    needs: OIL,
    cost: 30,
    cooldownMs: 45_000,
    durationMs: 20_000,
    priority: 20,
    hooks: { delta: { ground: (_api, fx, d) => void ((d[fx.caster] ?? 0) > 0 && (d[fx.caster]! *= 2)) } },
    overlay: () => ({ kind: 'badge', text: 'Twin wicks: two lanterns per light', tone: 'good' }),
  },
  {
    id: 'sky-lanterns.updraft',
    name: 'Sky Lantern Updraft',
    category: 'advantage',
    description: 'For 20 seconds, an updraft lifts your launches: each lantern you launch scores as if the wind were one step stronger (+1 point per lantern).',
    target: 'self',
    modes: [MODE],
    needs: GROUND,
    cost: 30,
    cooldownMs: 45_000,
    durationMs: 20_000,
    priority: 20,
    hooks: {
      delta: {
        score: (api, fx, d) => {
          const me = fx.caster;
          const l = launchNow(api, me, d);
          if (!l) return;
          d[me]! += l.count;
          relabelLaunch(api, me, l.mult + 1, l.points + l.count);
        },
      },
    },
    overlay: () => ({ kind: 'badge', text: 'Updraft: +1 per lantern launched', tone: 'good' }),
  },
  {
    id: 'sky-lanterns.crosswind',
    name: 'Sky Lantern Crosswind',
    category: 'troll',
    description: 'For 20 seconds, a crosswind drags an opponent\'s launches: each lantern scores as if the wind were one step weaker. On a calm wind their launch scores half (rounded down).',
    target: 'opponent',
    modes: [MODE],
    needs: GROUND,
    cost: 30,
    cooldownMs: 45_000,
    durationMs: 20_000,
    priority: 30,
    hooks: {
      delta: {
        score: (api, fx, d) => {
          const t = target(fx);
          const l = launchNow(api, t, d);
          if (!l) return;
          const points = l.mult > 1 ? l.count * (l.mult - 1) : Math.floor(l.count / 2);
          d[t]! -= l.points - points;
          relabelLaunch(api, t, l.mult > 1 ? l.mult - 1 : 0.5, points);
        },
      },
    },
    overlay: () => ({ kind: 'badge', text: 'Crosswind: launches score less', tone: 'bad' }),
  },
  {
    id: 'sky-lanterns.bottled-wind',
    name: 'Bottled Sky Wind',
    category: 'advantage',
    description: 'Bottle the wind blowing now. Within 30 seconds, the first time you launch on a weaker wind, your lanterns score at the bottled wind instead. Not on a calm wind.',
    target: 'self',
    modes: [MODE],
    needs: GROUND,
    cost: 30,
    cooldownMs: 50_000,
    durationMs: 30_000,
    priority: 20,
    apply: (api, _c, fx) => {
      const mult = WINDS[wind(api).kind].mult;
      if (mult <= 1) return { error: 'A calm wind is not worth bottling.' };
      if (fx) fx.data.mult = mult;
    },
    hooks: {
      delta: {
        score: (api, fx, d) => {
          const me = fx.caster;
          const l = launchNow(api, me, d);
          const mult = Number(fx.data.mult);
          if (!l || l.mult >= mult) return;
          d[me]! += l.count * (mult - l.mult);
          relabelLaunch(api, me, mult, l.count * mult);
          api.feed(`${api.name(me)} uncorked a bottled wind: ${plural(l.count, 'lantern')} at ×${mult}.`, 'good');
          api.endEffect(fx.eid, 'used');
        },
      },
    },
    overlay: () => ({ kind: 'badge', text: 'Wind in a bottle', tone: 'good' }),
  },
  {
    id: 'sky-lanterns.storm-chaser',
    name: 'Sky Storm Chaser',
    category: 'score',
    description: 'Chase the next storm: if the next wind change (within 60 seconds) brings one, you score 1 point for every lantern of another player\'s that it blows out. Needs Storms on.',
    target: 'self',
    modes: [MODE],
    needs: STORMS,
    cost: 30,
    cooldownMs: 60_000,
    durationMs: 60_000,
    // After shelters (20): lanterns a shelter brings through the storm were not blown out.
    priority: 45,
    apply: (api) => (wind(api).changeAt === null ? { error: 'The wind will not change again this game.' } : undefined),
    hooks: {
      delta: {
        windChanges: (api, fx, d) => {
          if ((d.game ?? 0) <= 0) return;
          api.endEffect(fx.eid, 'used');
          const storm = wind(api).storm;
          if (!storm || storm.at !== api.now() || !inGame(api, fx.caster)) return;
          let caught = 0;
          for (const id of api.others(fx.caster)) {
            const loss = flyer(api, id)?.lastLoss;
            if (loss && loss.at === api.now()) caught += loss.count;
          }
          const got = caught ? api.addScore(fx.caster, caught) : 0;
          if (got) api.feed(`${api.name(fx.caster)} chased the storm: +${plural(got, 'point')} for the lanterns it blew out.`, 'good');
        },
      },
    },
    overlay: () => ({ kind: 'badge', text: 'Storm chaser: the next storm pays you', tone: 'good' }),
  },
  {
    id: 'sky-lanterns.tangled-strings',
    name: 'Sky Lantern Tangled Strings',
    category: 'troll',
    description: 'For 20 seconds, an opponent\'s lantern strings are tangled: each launch sends up only half their lanterns (rounded up) and scores only for those. The rest stay lit on the ground, where a storm can still reach them.',
    target: 'opponent',
    modes: [MODE],
    needs: GROUND,
    cost: 30,
    cooldownMs: 45_000,
    durationMs: 20_000,
    tickMs: 1000,
    // Before multipliers (20) and the crosswind (30), so they work on the lanterns that really went up.
    priority: 15,
    apply: (api, c, fx) => keepBest(api, fx!, target(c)),
    hooks: {
      tick: (api, fx) => keepBest(api, fx, target(fx)),
      delta: {
        score: (api, fx, d) => {
          const t = target(fx);
          const l = launchNow(api, t, d);
          const f = flyer(api, t);
          if (!l || !f || l.count < 2) return;
          const stay = Math.floor(l.count / 2);
          const full = l.points;
          api.add('ground', t, stay);
          f.launched -= stay;
          l.count -= stay;
          d[t] = Math.max(0, d[t]! - stay * l.mult);
          const top = api.s.launches[0];
          if (top && top.playerId === t && top.at === api.now()) top.count = l.count;
          relabelLaunch(api, t, l.mult, l.count * l.mult);
          cutBest(api, fx, t, full, l.count * l.mult);
          api.feed(`Tangled strings: ${plural(stay, 'lantern')} stayed on the ground.`, 'bad', [t]);
        },
      },
    },
    overlay: () => ({ kind: 'badge', text: 'Tangled strings: half your lanterns stay down', tone: 'bad' }),
  },
  {
    id: 'sky-lanterns.high-drift',
    name: 'Sky Lantern High Drift',
    category: 'advantage',
    description: 'For 45 seconds, your launches drift high instead of scoring at once: they score at the next wind change, at the new wind. A storm at that change brings a calm wind (×1) but cannot touch lanterns in the air. Lanterns still drifting when this ends score at the wind blowing then. Not on the last wind of the game.',
    target: 'self',
    modes: [MODE],
    needs: GROUND,
    cost: 25,
    cooldownMs: 50_000,
    durationMs: 45_000,
    tickMs: 250,
    // Before everything else that bends a launch: the launch scores nothing now, so there is nothing to bend until it lands.
    priority: 5,
    apply: (api, c, fx) => {
      if (wind(api).changeAt === null) return { error: 'This is the last wind of the game: there is no next wind to drift to.' };
      fx!.data.held = 0;
      keepBest(api, fx!, c.caster);
    },
    hooks: {
      delta: {
        score: (api, fx, d) => {
          const me = fx.caster;
          const l = launchNow(api, me, d);
          // On the last wind there is no change to wait for: the launch scores as usual.
          if (!l || wind(api).changeAt === null) return;
          d[me]! -= l.points;
          fx.data.held = Number(fx.data.held) + l.count;
          fx.data.changes = wind(api).changes;
          const f = flyer(api, me)!;
          cutBest(api, fx, me, l.points, 0);
          f.lastLaunch = null;
          const top = api.s.launches[0];
          if (top && top.playerId === me && top.at === api.now()) api.s.launches = api.s.launches.slice(1);
          api.feed(`Your ${plural(l.count, 'lantern')} drift high: they score at the next wind change.`, 'info', [me]);
        },
      },
      // Lanterns land just after a change, once cheats that rig the new wind have had their say.
      tick: (api, fx) => {
        const held = Number(fx.data.held ?? 0);
        if (!held) return keepBest(api, fx, fx.caster);
        if (wind(api).changes <= Number(fx.data.changes)) return;
        landDrift(api, fx);
      },
      end: (api, fx) => landDrift(api, fx),
    },
    overlay: (fx) => ({ kind: 'badge', text: Number(fx.data.held ?? 0) ? `${plural(Number(fx.data.held), 'lantern')} drifting high` : 'High drift: launches score at the next wind', tone: 'good' }),
  },
];

/** Drifting lanterns land and score at the wind blowing now. */
function landDrift(api: ChaosApi, fx: ActiveEffect) {
  const held = Number(fx.data.held ?? 0);
  fx.data.held = 0;
  const me = fx.caster;
  if (!held || !inGame(api, me)) return;
  const w = WINDS[wind(api).kind];
  const got = api.addScore(me, held * w.mult);
  recordLaunch(api, me, held, w.mult, got);
  api.feed(`${api.name(me)}'s ${plural(held, 'drifting lantern')} caught the ${w.label.toLowerCase()} wind for ${plural(got, 'point')}.`, held * w.mult >= 10 ? 'big' : 'good');
}

defineCheats([...instant, ...lasting]);
