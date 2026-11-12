// Bars 1 to 5. A dark stage, one Glim in a pool of light, the big screen waking, the class
// arriving, and the name.
import { Group } from 'three';
import { BigScreen, Clip, Confetti, bar, cone, ease, glow, lerp, ring, seg, text, words, riseIn, clamp01 } from '../engine.ts';
import { Actor, casting, floorLight, hop } from '../cast.ts';
import { logoTile, type Film, type Shot } from '../film.ts';

const FLOOR = -330;

export async function opening(film: Film): Promise<Shot[]> {
  const { stage } = film;

  /* ---------------- the stage: bars 1 to 4 ---------------- */
  const A = new Group(), hudA = new Group();
  const lamp = cone(1250, '#fff0c8', 0.42);
  lamp.position.set(0, 700, -40);
  const pool = floorLight(420, '#ffe6ad', 0.8);
  pool.position.set(0, FLOOR + 1, 0);
  const wide = floorLight(1500, '#5a6cff', 0.3);
  wide.position.set(0, FLOOR, -100);
  A.add(lamp, wide, pool);

  const screen = new BigScreen(1040, '#4455ff');
  screen.position.set(0, 215, -560);
  A.add(screen);
  const lobby = await new Clip('host-lobby').init();

  const hero = new Actor('glim-pebblet', 290);
  hero.path = (t) => {
    const p = seg(t, 0.7, 2.3);
    const h = hop(p, 4, 150);
    const facing = lerp(1.05, 0, ease.outCubic(seg(t, 2.25, 2.6)));
    // Later it turns half round to look at the screen, then back to us.
    const look = Math.sin(seg(t, 4.05, 4.5) * Math.PI) * 0;
    return { x: lerp(-1250, 0, p), y: FLOOR + h.y + bounce(t, 7.0), z: 150, turn: facing + look, squash: h.squash, moving: p < 1 ? 1 : 0 };
  };
  hero.cue(2.55, 'wave').cue(4.15, 'cheer').cue(5.6, 'wave').cue(7.0, 'celebrate');
  A.add(hero);

  // The class: twelve more, hopping in from both sides to stand around the first.
  const spots: [number, number][] = [[-270, 60], [280, 70], [-560, 0], [570, 10], [-850, 60], [860, 50], [-150, -190], [160, -200], [-430, -230], [440, -240], [-720, -200], [730, -210]];
  const crowd = casting(12, 23).map((who, i) => {
    const a = new Actor(who, 235);
    const [sx, sz] = spots[i]!;
    const from = sx < 0 ? -1500 : 1500;
    const start = 4.15 + i * 0.19;
    a.path = (t) => {
      const p = seg(t, start, start + 1.15);
      const h = hop(p, 3, 120);
      const facing = lerp(sx < 0 ? 1.0 : -1.0, 0, ease.outCubic(seg(t, start + 1.1, start + 1.4)));
      return { x: lerp(from, sx, ease.outCubic(p) * 0.35 + p * 0.65), y: FLOOR + (sz < -100 ? 95 : 0) + h.y + bounce(t, 7.0, i * 0.04), z: sz, turn: facing, squash: h.squash, moving: p < 1 ? 1 : 0 };
    };
    a.cue(start + 1.3, i % 2 ? 'cheer' : 'wave').cue(7.0 + (i % 3) * 0.05, 'celebrate');
    A.add(a);
    return a;
  });
  const ready = [hero, ...crowd].map((a) => a.glim.ready);
  await Promise.all(ready);

  const line1 = words('What if every lesson', { size: 132, italic: true, color: '#ffffff' });
  line1.group.position.set(0, 285, 0);
  const line2 = words('felt like game night?', { size: 132, italic: true, color: '#ffc233', shadow: true });
  line2.group.position.set(0, -455, 0);
  hudA.add(line1.group, line2.group);

  const shotA: Shot = {
    a: 0, b: bar(5), group: A, hud: hudA,
    update(t) {
      const waits: Promise<unknown>[] = [];
      film.warm = 0.25 + 0.5 * seg(t, 4, 7.5);
      film.energy = seg(t, 4, 8);
      lamp.children[0]!.visible = t > 0.15;
      (lamp.children[0] as never as { material: { opacity: number } }).material.opacity = ease.outCubic(seg(t, 0.2, 1.1));
      lamp.rotation.z = Math.sin(t * 0.6) * 0.03;
      (pool.material as { opacity: number }).opacity = ease.outCubic(seg(t, 0.25, 1.1));
      (wide.material as { opacity: number }).opacity = ease.outCubic(seg(t, 3.9, 4.8));
      hero.seek(t);
      for (const a of crowd) { a.seek(t); a.visible = t > 4.1; }

      // The screen wakes on bar 3.
      const on = seg(t, 4.0, 4.4);
      screen.opacity = ease.outCubic(on);
      const s = lerp(0.9, 1, ease.outBack(on));
      screen.scale.setScalar(s);
      screen.position.y = 215 + (1 - ease.outCubic(on)) * -60;
      if (on > 0) waits.push(lobby.frame(1 + (t - 4.0) * 30 * 1.55).then((tex) => screen.screen.show(tex)));

      riseIn(line1.items, t - 0.95, { out: 2.75 });
      riseIn(line2.items, t - 4.55, { out: 2.8, each: 0.08 });

      // A slow push in, a nudge when the screen wakes, then the rush into the name.
      const rush = ease.inQuart(seg(t, 7.15, 8.0));
      const nudge = Math.exp(-Math.max(0, t - 4.0) * 7) * (t >= 4.0 ? 1 : 0);
      stage.view({ y: 30, lookY: -20, dolly: lerp(-320, 60, ease.inOutSine(seg(t, 0, 7.2))) + nudge * 70 + rush * 900, orbitX: 0.11, orbitY: Math.sin(t * 0.45) * 0.035 });
      stage.fx.uZoomBlur.value = rush * 0.42;
      stage.fx.uFlash.value = ease.inCubic(seg(t, 7.72, 8.0));
      stage.fx.uFade.value = ease.outCubic(seg(t, 0.0, 0.5));
      stage.bloom.strength = 0.35 + rush * 0.5;
      return waits;
    },
  };

  /* ---------------- the name: bar 5 ---------------- */
  const B = new Group(), hudB = new Group();
  const mark = new Group();
  const tile = logoTile(330);
  const name = text('Ludora', { size: 360, italic: true, color: '#ffffff', shadow: true });
  const total = 300 + 40 + name.w;
  tile.position.set(-total / 2 + 150, 4, 0);
  name.position.set(-total / 2 + 300 + 40 + name.w / 2, -8, 0);
  mark.add(tile, name);
  mark.position.y = 70;
  const tag = words('Game night, for learning.', { size: 62, font: 'sans', weight: 700, color: '#d5dbff', tracking: 1.5 });
  tag.group.position.set(0, -200, 0);
  const sun = glow(2300, '#ffb31a', 0.26);
  sun.position.set(0, 60, -300);
  const halo = glow(1500, '#6a5cff', 0.32);
  halo.position.set(0, 60, -500);
  const wave = ring('#ffd76a');
  const lamps = [cone(1700, '#7a6cff', 0.3), cone(1700, '#ffc233', 0.24), cone(1700, '#3fd2ff', 0.24), cone(1700, '#ff5d9a', 0.2)];
  lamps.forEach((l, i) => { l.position.set(-1080 + i * 720, 760, -260); B.add(l); });
  const paper = new Confetti(420, 9, { power: 1900, spread: 2.9 });
  paper.position.set(0, -60, 40);
  const left = new Confetti(180, 14, { power: 1700, spread: 0.9 });
  left.position.set(-1000, -560, 60); left.rotation.z = -0.5;
  const right = new Confetti(180, 17, { power: 1700, spread: 0.9 });
  right.position.set(1000, -560, 60); right.rotation.z = 0.5;
  B.add(halo, sun, paper, left, right);
  hudB.add(wave, mark, tag.group);

  const shotB: Shot = {
    a: bar(5), b: bar(6), group: B, hud: hudB,
    update(t) {
      film.warm = 1; film.energy = 1;
      const pop = ease.outBack(seg(t, 0, 0.42), 1.9);
      const settle = lerp(1.7, 1, pop) * (1 + 0.035 * seg(t, 0.4, 2));
      const leave = ease.inCubic(seg(t, 1.62, 2.0));
      mark.scale.setScalar(settle);
      mark.position.x = -leave * 2900;
      tag.group.position.x = -leave * 3300;
      riseIn(tag.items, t - 0.5, { each: 0.06 });
      wave.scale.setScalar(lerp(200, 3400, ease.outCubic(seg(t, 0, 0.9))));
      wave.material.uniforms.uP!.value = 1;
      wave.material.uniforms.uOpacity!.value = 1 - seg(t, 0.15, 0.9);
      wave.position.y = 60;
      sun.material.opacity = (0.85 + 0.15 * Math.sin(t * 9)) * (1 - leave);
      halo.material.opacity = 1 - leave;
      lamps.forEach((l, i) => { l.rotation.z = Math.sin(t * 2.2 + i * 1.7) * 0.5 + (i - 1.5) * -0.16; });
      paper.update(t - 0.02); left.update(t - 0.08); right.update(t - 0.08);
      stage.view({ dolly: lerp(-140, 30, ease.outCubic(seg(t, 0, 1.6))), orbitY: lerp(0.05, -0.03, seg(t, 0, 2)) });
      stage.fx.uFlash.value = 1 - ease.outCubic(seg(t, 0, 0.36));
      stage.fx.uZoomBlur.value = (1 - ease.outCubic(seg(t, 0, 0.3))) * 0.3;
      stage.fx.uBlur.value.set(leave * 0.14, 0);
      stage.fx.uAberration.value = 0.0012 + (1 - seg(t, 0, 0.5)) * 0.006;
      stage.bloom.strength = 0.4 + (1 - seg(t, 0, 0.6)) * 0.4;
    },
  };
  return [shotA, shotB];
}

/** A little jump on the spot at time `at` (the crowd's cheer as the music lifts). */
function bounce(t: number, at: number, delay = 0) {
  const u = (t - at - delay) / 0.42;
  if (u < 0 || u > 2) return 0;
  return Math.abs(Math.sin(u * Math.PI)) * 70 * clamp01(1.25 - u * 0.5);
}
