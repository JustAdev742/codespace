// Bars 1 to 6: one Glim in uniform on a dark stage, eight quick looks at what is new, and the title.
import { Group, type Texture } from 'three';
import { Card, Phone, bar, clamp01, cone, ease, glow, lerp, ring, seg, text } from '../engine.ts';
import { Actor, floorLight, hop } from '../cast.ts';
import { C, line, logoTile, place, plate, punch, schoolPlate, sizeOf, still, type Plate } from './kit.ts';
import type { Film, Shot } from '../film.ts';

const FLOOR = -330;

export async function open(film: Film): Promise<Shot[]> {
  const { stage } = film;

  /* ---- bars 1 and 2: the stage ---- */
  const A = new Group(), hudA = new Group();
  const lamp = cone(1250, '#f6ecd2', 0.42);
  lamp.position.set(0, 700, -40);
  const pool = floorLight(430, '#f6ecd2', 0.8);
  pool.position.set(0, FLOOR + 1, 0);
  const wide = floorLight(1500, '#00a766', 0.28);
  wide.position.set(0, FLOOR, -100);
  A.add(lamp, wide, pool);
  const hero = new Actor('glim-pebblet', 300, 'junior-green');
  hero.path = (t) => {
    const p = seg(t, 0.7, 2.3);
    const h = hop(p, 4, 150);
    return { x: lerp(-1250, 0, p), y: FLOOR + h.y, z: 150, turn: lerp(1.05, 0, ease.outCubic(seg(t, 2.25, 2.6))), squash: h.squash, moving: p < 1 ? 1 : 0 };
  };
  hero.cue(2.55, 'wave').cue(3.5, 'cheer');
  A.add(hero);
  await hero.glim.ready;
  const a1 = line('A lot is new', 0, 330, { size: 128 });
  const a2 = line('this term.', 0, 185, { size: 128, color: C.mint });
  hudA.add(a1.group, a2.group);
  const sA: Shot = {
    a: bar(1), b: bar(3), group: A, hud: hudA,
    update(t) {
      film.energy = 0.1; film.warm = seg(t, 0.3, 2.5) * 0.5;
      hero.seek(t);
      lamp.rotation.z = Math.sin(t * 0.7) * 0.04;
      a1.show(t - 2.3); a2.show(t - 2.75);
      stage.fx.uFade.value = seg(t, 0, 0.6);
      stage.view({ y: 20, dolly: lerp(-320, 60, ease.outCubic(seg(t, 0, 4))), orbitY: lerp(-0.1, 0.02, ease.inOutSine(seg(t, 0, 4))), orbitX: 0.03 });
    },
  };

  /* ---- bars 3 and 4: eight quick looks, one a beat ---- */
  const LOOKS: [string, string, 'wide' | 'phone'][] = [
    ['home-yard', 'A 3D home', 'wide'], ['host-lobby', 'Calm play', 'wide'], ['phone-walk-1', 'How to play', 'phone'], ['wallet-top', 'The Wallet', 'phone'],
    ['rewards', 'Class rewards', 'wide'], ['econ-health', 'An economy room', 'wide'], ['landing-light', 'The school’s colours', 'wide'], ['dash-attack', 'A server that guards itself', 'wide'],
  ];
  const pics = await Promise.all(LOOKS.map(([name]) => still(name)));
  const B = new Group(), hudB = new Group();
  const full = new Card({ w: 1920, h: 1080, radius: 0, shadow: 0, color: C.deep });
  const phone = new Phone(440, { body: '#04120d', rim: '#bfe5d0' });
  const back = glow(2600, '#0b6b4b', 0.8);
  back.position.z = -300;
  B.add(back, full, phone);
  const tags: Plate[] = LOOKS.map(([, label], i) => place(plate(label, { size: 64, bg: i === 7 ? '#9be27a' : C.cream, fg: i === 7 ? '#0a1a1c' : C.ink }), -900, -400));
  for (const p of tags) hudB.add(p.mesh);
  const cover = (tex: Texture | null) => { const [w, h] = sizeOf(tex); const r = w / h, want = 16 / 9; return r > want ? [(1 - want / r) / 2, 0, 1 - (1 - want / r) / 2, 1] as [number, number, number, number] : [0, (1 - r / want) / 2, 1, 1 - (1 - r / want) / 2] as [number, number, number, number]; };
  const sB: Shot = {
    a: bar(3), b: bar(5), group: B, hud: hudB,
    update(t) {
      const i = Math.min(7, Math.floor(t / 0.5)), u = t - i * 0.5;
      film.energy = 0.5 + i * 0.07; film.warm = 0.3;
      const [, , kind] = LOOKS[i]!;
      const wideShot = kind === 'wide';
      full.visible = wideShot; phone.visible = !wideShot; back.visible = !wideShot;
      film.backdrop.visible = !wideShot;
      if (wideShot) full.show(pics[i]!, cover(pics[i]!)); else phone.screen.show(pics[i]!);
      phone.rotation.y = lerp(-0.25, 0.05, u * 2);
      phone.rotation.z = lerp(0.04, -0.01, u * 2);
      tags.forEach((p, k) => { if (k === i) p.show(u - 0.04); else p.mesh.visible = false; });
      const k = punch(u, 11);
      // Each look pushes in a little further than the last; the eighth is the one the cut lands on.
      stage.view({ dolly: (wideShot ? 60 : -40) + i * 14 + u * 120 + k * 130, roll: (i % 2 ? 1 : -1) * 0.012 * (1 - u * 2) });
      stage.fx.uFlash.value = Math.max(k * 0.45, ease.inCubic(clamp01((t - 3.8) / 0.2)));
      stage.fx.uAberration.value = 0.0009 + k * 0.006;
      stage.fx.uVignette.value = 0.3;
    },
  };

  /* ---- bars 5 and 6: the title ---- */
  const T = new Group(), hudT = new Group();
  const lamps = [cone(1700, '#f6ecd2', 0.3), cone(1700, '#5fdcaa', 0.24), cone(1700, '#f6ecd2', 0.34), cone(1700, '#5fdcaa', 0.24), cone(1700, '#f6ecd2', 0.3)];
  lamps.forEach((l, i) => { l.position.set(-1300 + i * 650, 800, -300); T.add(l); });
  const floor = floorLight(1700, '#f6ecd2', 0.45);
  floor.position.set(0, -470, 0);
  T.add(floor, glow(2600, '#0b6b4b', 0.8));
  const five: [string, string, number][] = [['glim-sprig', 'kinder', -720], ['glim-mossbun', 'junior-grey', -360], ['glim-pebblet', 'junior-green', 0], ['glim-dandelump', 'senior-green', 360], ['glim-capling', 'sport', 720]];
  const cast = five.map(([id, dress, x], i) => {
    const a = new Actor(id, 250, dress as never);
    const at = 0.25 + i * 0.12;
    a.path = (t) => {
      const p = seg(t, at, at + 0.5);
      const h = hop(p, 1, 260);
      const idle = Math.max(0, Math.sin((t - at - 0.6) * 5 + i)) * 26 * (t > at + 0.6 ? 1 : 0);
      return { x, y: lerp(-1000, -470, ease.outCubic(p)) + h.y * 0.4 + idle, z: 220, turn: Math.sin(t * 1.3 + i) * 0.15, squash: h.squash };
    };
    a.cue(at + 0.5, i % 2 ? 'cheer' : 'wave').cue(2.2 + i * 0.1, 'celebrate');
    T.add(a);
    return a;
  });
  await Promise.all(cast.map((a) => a.glim.ready));
  const mark = new Group();
  const tile = logoTile(150);
  const name = text('Ludora', { size: 164, italic: true, color: '#ffffff', shadow: true, shadowColor: 'rgba(1,14,9,0.9)' });
  const total = 138 + 20 + name.w;
  tile.position.set(-total / 2 + 69, 4, 0);
  name.position.set(-total / 2 + 138 + 20 + name.w / 2, -4, 0);
  mark.add(tile, name);
  mark.position.y = 400;
  const title = text('What’s new', { size: 300, font: 'lato', weight: 900, color: C.cream, shadow: true, shadowColor: 'rgba(1,14,9,0.9)', tracking: -6 });
  title.position.y = 150;
  const school = await schoolPlate(96);
  school.position.set(0, -60, 0);
  const wave = ring('#f6ecd2');
  wave.position.set(0, 150, -10);
  hudT.add(wave, mark, title, school);
  const sT: Shot = {
    a: bar(5), b: bar(7), group: T, hud: hudT,
    update(t) {
      film.energy = 0.95; film.warm = 0.8;
      const land = ease.outBack(seg(t, 0, 0.45), 1.7);
      title.scale.setScalar(0.5 + 0.5 * land);
      title.material.opacity = seg(t, 0, 0.1);
      const m = ease.outBack(seg(t, 0.25, 0.7), 1.5);
      mark.scale.setScalar(Math.max(0.001, m));
      const s = ease.outBack(seg(t, 0.9, 1.35), 1.5);
      school.scale.setScalar(Math.max(0.001, s));
      school.visible = t > 0.9;
      wave.scale.setScalar(lerp(200, 2600, ease.outCubic(seg(t, 0, 0.9))));
      wave.material.uniforms.uP!.value = 1;
      wave.material.uniforms.uOpacity!.value = (1 - seg(t, 0.1, 0.9)) * 0.7;
      for (const a of cast) a.seek(t);
      lamps.forEach((l, i) => { l.rotation.z = Math.sin(t * 1.1 + i * 1.3) * 0.3; });
      const out = ease.inQuart(seg(t, 3.5, 4.0));
      stage.fx.uZoomBlur.value = out * 0.4;
      stage.fx.uFlash.value = Math.max(Math.exp(-t * 6) * 0.6, ease.inCubic(seg(t, 3.8, 4.0)));
      stage.bloom.strength = 0.4;
      stage.view({ y: 20, dolly: lerp(-200, 40, ease.outCubic(seg(t, 0, 3.5))) + Math.exp(-t * 7) * 150 + out * 700, orbitY: Math.sin(t * 0.5) * 0.025 });
    },
  };
  return [sA, sB, sT];
}
