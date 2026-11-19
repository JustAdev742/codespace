// Bars 27 to 30: the school's own copy. Its colours, its uniform for every year, its name on what
// is printed. Only what the repository already holds about the school is shown.
import { Group } from 'three';
import { BigScreen, bar, cone, ease, glow, lerp, seg, text } from '../engine.ts';
import { Actor, floorLight, hop } from '../cast.ts';
import { C, UNIFORMS, arrive, closeUp, line, picture, place, plate, pop, punch, still, sub } from './kit.ts';
import type { Film, Shot } from '../film.ts';

const FLOOR = -330;

export async function school(film: Film): Promise<Shot[]> {
  const { stage } = film;
  const [light, dark, lobby, cards, uniform] = await Promise.all(['landing-light', 'rewards', 'host-lobby', 'class-logins', 'settings-uniform'].map(still));

  /* ---- bar 27: the school's colours, on the front page and on a teacher's page ---- */
  const A = new Group(), hudA = new Group();
  const day = picture(light, 1040, { rim: 3, glow: '#0b6b4b' });
  const night = picture(dark, 1040, { rim: 3, rimColor: '#bfe5d0', glow: '#0b6b4b' });
  day.position.set(-380, 130, 0); night.position.set(400, -20, 120);
  A.add(glow(2600, '#0b6b4b', 0.7), day, night);
  const tagA = place(plate('Your school’s copy', { size: 60, bg: C.cream }), -900, 470);
  const a1 = line('In the school’s colours,', -900, -360, { align: 'left', size: 92 });
  const a2 = line('on every page.', -900, -360, { align: 'left', size: 92, color: C.mint });
  hudA.add(tagA.mesh, a1.group, a2.group);
  a2.group.position.x = -900 + a1.width + 30;
  const sA: Shot = {
    a: bar(27), b: bar(28), group: A, hud: hudA,
    update(t) {
      film.energy = 1; film.warm = 0.7;
      const k = punch(t);
      day.position.x = -380 - (1 - arrive(t, 0, 0.4)) * 1700; day.rotation.z = 0.02;
      night.position.x = 400 + (1 - arrive(t, 0.12, 0.4)) * 1700; night.rotation.z = -0.025;
      tagA.show(t - 0.15);
      a1.show(t - 0.3); a2.show(t - 0.8);
      stage.fx.uFlash.value = punch(t, 7) * 0.5;
      stage.view({ dolly: lerp(-140, 20, ease.outCubic(seg(t, 0, 2))) + k * 90, orbitY: lerp(0.05, -0.02, seg(t, 0, 2)) });
    },
  };

  /* ---- bars 28 and 29: the uniform, for every year. Seven Glims step forward, one a beat ---- */
  const B = new Group(), hudB = new Group();
  const lamps = [cone(1500, '#f6ecd2', 0.3), cone(1500, '#5fdcaa', 0.22), cone(1500, '#f6ecd2', 0.3)];
  lamps.forEach((l, i) => { l.position.set(-900 + i * 900, 760, -260); B.add(l); });
  const pool = floorLight(1700, '#f6ecd2', 0.5);
  pool.position.set(0, FLOOR + 1, 0);
  B.add(pool, glow(2600, '#0b6b4b', 0.6));
  const who = ['glim-sprig', 'glim-pebblet', 'glim-mossbun', 'glim-dandelump', 'glim-capling', 'glim-pebblet', 'glim-sprig'];
  const STEP = 1.0; // the first steps forward a second in (bar 28, the third beat), then one every half second
  const line7 = UNIFORMS.map((u, i) => {
    const x = -765 + i * 255;
    const a = new Actor(who[i]!, 235, u.id);
    const at = STEP + i * 0.5;
    a.path = (t) => {
      const p = seg(t, at, at + 0.42);
      const h = hop(p, 1, 130);
      return { x, y: FLOOR + h.y, z: lerp(-260, 120, ease.outCubic(p)), turn: 0, squash: h.squash, moving: p > 0 && p < 1 ? 1 : 0 };
    };
    a.cue(at + 0.45, i % 2 ? 'wave' : 'cheer').cue(3.6, 'celebrate');
    B.add(a);
    // Which years wear it, under each one.
    const tags = u.years.split('\n').map((words, n) => {
      const tag = text(words, { size: n ? 24 : 28, font: 'lato', weight: n ? 400 : 700, color: n ? C.mint : C.cream, shadow: true, shadowColor: 'rgba(1,14,9,0.9)' });
      tag.position.set(x, FLOOR - 58 - n * 36, 200);
      B.add(tag);
      return tag;
    });
    return { a, tags, at };
  });
  await Promise.all(line7.map((m) => m.a.glim.ready));
  const b1 = line('In the school’s uniform,', 0, 400, { size: 88 });
  const b2 = line('for every year.', 0, 295, { size: 88, color: C.mint });
  hudB.add(b1.group, b2.group);
  const sB: Shot = {
    a: bar(28), b: bar(30), group: B, hud: hudB,
    update(t) {
      film.energy = 1; film.warm = 0.9;
      for (const m of line7) {
        m.a.seek(t);
        for (const tag of m.tags) {
          tag.material.opacity = seg(t, m.at + 0.3, m.at + 0.55);
          tag.visible = tag.material.opacity > 0.01;
        }
      }
      b1.show(t - 0.25); b2.show(t - 0.6);
      lamps.forEach((l, i) => { l.rotation.z = Math.sin(t * 0.9 + i * 1.7) * 0.25; });
      stage.view({ y: -90, dolly: lerp(-260, -90, ease.outCubic(seg(t, 0, 4))) + punch(t) * 80, orbitY: lerp(-0.06, 0.06, ease.inOutSine(seg(t, 0, 4))), orbitX: 0.03 });
      stage.bloom.strength = 0.38;
    },
  };

  /* ---- bar 30: on the board, in settings, on the login cards ---- */
  const D = new Group(), hudD = new Group();
  const board = new BigScreen(1040, '#00a766', { body: '#04120d', rim: '#bfe5d0' });
  board.position.set(-420, 120, -60);
  board.screen.show(lobby);
  const card = picture(cards, 760, { rim: 3, glow: '#0b6b4b' });
  card.position.set(520, 200, 60);
  const dress = picture(uniform, 620, { rim: 3 });
  dress.position.set(560, -170, 120);
  D.add(glow(2600, '#0b6b4b', 0.7), board, card, dress);
  const d1 = line('On the board, on the login cards, in settings.', 0, -440, { size: 66 });
  hudD.add(d1.group);
  const sD: Shot = {
    a: bar(30), b: bar(31), group: D, hud: hudD,
    update(t) {
      film.energy = 0.9; film.warm = 0.6;
      board.position.x = -420 - (1 - arrive(t, 0, 0.4)) * 1700;
      const c = pop(t, 0.2, 0.4), u = pop(t, 0.45, 0.4);
      card.position.x = 520 + (1 - c) * 1500; card.rotation.z = 0.02;
      dress.position.x = 560 + (1 - u) * 1500; dress.rotation.z = -0.02;
      d1.show(t - 0.4, 1.5);
      // The lights go down on the last half second: the next scene is the server room.
      stage.fx.uFade.value = 1 - ease.inCubic(seg(t, 1.45, 1.98));
      stage.view({ dolly: lerp(-100, 30, ease.outCubic(seg(t, 0, 2))) + punch(t) * 60, orbitY: lerp(0.04, -0.02, seg(t, 0, 2)) });
    },
  };
  void closeUp; void sub;
  return [sA, sB, sD];
}
