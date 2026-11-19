// Bars 7 to 12: the home page is a place now, and every section of the navigation says what it does.
import { Group } from 'three';
import { Card, Clip, Phone, bar, ease, glow, lerp, seg } from '../engine.ts';
import { C, arrive, closeUp, line, place, plate, pop, punch, roll, sizeOf, still, sub } from './kit.ts';
import type { Film, Shot } from '../film.ts';

export async function home(film: Film): Promise<Shot[]> {
  const { stage } = film;
  const yard = await new Clip('home-yard').init();
  const [sidePic, menuPic] = await Promise.all(['sidebar', 'phone-menu'].map(still));

  /* ---- bars 7 to 10: the yard, filling the screen. The pointer visits each place; the buddy points the way ---- */
  const A = new Group(), hudA = new Group();
  const full = new Card({ w: 1920, h: 1080, radius: 0, shadow: 0, color: C.deep });
  A.add(full);
  const tag = place(plate('The 3D home', { size: 60, bg: C.cream }), -900, -330);
  const a1 = place(plate('Home is a place you can look round', { size: 46, bg: C.green, fg: '#ffffff' }), -900, -430);
  const a2 = place(plate('Point at somewhere: your buddy shows the way', { size: 46, bg: C.green, fg: '#ffffff' }), -900, -430);
  const a3 = place(plate('Still and flat for anyone who wants that: one switch', { size: 46, bg: C.green, fg: '#ffffff' }), -900, -430);
  hudA.add(tag.mesh, a1.mesh, a2.mesh, a3.mesh);
  const SPEED = Math.max(1, (yard.frames - 20) / 240);
  const sA: Shot = {
    a: bar(7), b: bar(11), group: A, hud: hudA,
    update(t) {
      film.energy = 0.5; film.warm = 0.2;
      film.backdrop.visible = false;
      const k = punch(t);
      tag.show(t - 0.25, 7.6);
      a1.show(t - 0.6, 1.9); a2.show(t - 2.7, 2.4); a3.show(t - 5.4, 2.3);
      // In from wide to the yard itself (right of the menu), drifting with the pointer.
      const p = ease.inOutSine(seg(t, 0.2, 7.6));
      stage.view({ x: lerp(0, 170, p), y: lerp(0, -20, p), dolly: lerp(0, 330, p) + k * 90 });
      stage.fx.uVignette.value = 0.3;
      stage.fx.uFlash.value = punch(t, 7) * 0.35;
      return [roll(yard, full, t, { from: 12, speed: SPEED, hold: true })];
    },
  };

  /* ---- bars 11 and 12: the navigation, close enough to read every line ---- */
  const B = new Group(), hudB = new Group();
  const [sw, sh] = sizeOf(sidePic);
  const SIDE_W = 600, SIDE_H = 960, FRAC = Math.min(1, (SIDE_H / SIDE_W) * (sw / sh));
  const side = closeUp(sidePic, [0, 0, 1, FRAC], SIDE_W, { glow: '#0b6b4b', radius: 26 });
  side.position.set(-560, 0, 0);
  const menu = new Phone(330, { body: '#04120d', rim: '#bfe5d0' });
  menu.position.set(690, -10, 120);
  menu.rotation.y = -0.22;
  menu.screen.show(menuPic);
  B.add(glow(2400, '#0b6b4b', 0.55), side, menu);
  const b1 = line('Every button says', 80, 170, { size: 92 });
  const b2 = line('what it does.', 80, 55, { size: 92, color: C.mint });
  const b3 = sub('Plain words, in groups, on a laptop and on a phone.', 80, -60, { size: 40 });
  hudB.add(b1.group, b2.group, b3.group);
  const sB: Shot = {
    a: bar(11), b: bar(13), group: B, hud: hudB,
    update(t) {
      film.energy = 0.45; film.warm = 0.25;
      const inn = arrive(t, 0, 0.5);
      side.position.x = -560 - (1 - inn) * 1300;
      // Down the menu, so each group passes.
      const y0 = lerp(0, 1 - FRAC, ease.inOutSine(seg(t, 0.5, 3.6)));
      side.show(sidePic, [0, y0, 1, y0 + FRAC]);
      const up = pop(t, 0.5, 0.5);
      menu.position.y = -10 - (1 - up) * 1100;
      menu.opacity = up > 0.01 ? 1 : 0;
      b1.show(t - 0.35); b2.show(t - 0.7); b3.show(t - 1.3);
      const out = ease.inCubic(seg(t, 3.7, 4.0));
      B.position.x = -out * 2400;
      stage.fx.uBlur.value.set(out * 0.1, 0);
      stage.view({ dolly: lerp(-80, 40, ease.outCubic(seg(t, 0, 4))) + punch(t) * 50, orbitY: lerp(0.05, -0.03, seg(t, 0, 4)) });
    },
  };
  return [sA, sB];
}
