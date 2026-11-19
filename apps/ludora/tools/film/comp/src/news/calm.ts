// Bars 13 to 18: calm play. The teacher's choice for a room, a walkthrough before every game, and
// one thing at a time. A real Classic game on the school's copy: thirteen players, twelve of them
// small windows that really join in their own school year's uniform.
import { Group } from 'three';
import { BigScreen, Clip, Phone, bar, ease, glow, lerp, ring, seg } from '../engine.ts';
import { C, arrive, closeUp, line, place, plate, pop, punch, roll, still, sub } from './kit.ts';
import type { Film, Shot } from '../film.ts';

const SCREEN = { body: '#04120d', rim: '#bfe5d0' };

export async function calm(film: Film): Promise<Shot[]> {
  const { stage } = film;
  const [lobby, walkH, walkP, q1h, q1p] = await Promise.all(['host-lobby', 'walk-host', 'walk-phone', 'q1-host', 'q1-phone'].map((n) => new Clip(n).init()));
  const lobbyPhone = await still('phone-lobby');

  /* ---- bars 13 and 14: the class arrives, and the room is calm because the teacher said so ---- */
  const A = new Group(), hudA = new Group();
  const board = new BigScreen(1280, '#00a766', SCREEN);
  board.position.set(-250, 60, -80);
  const hand = new Phone(300, SCREEN);
  hand.position.set(700, -40, 160);
  hand.rotation.y = -0.24;
  hand.screen.show(lobbyPhone);
  // The phone's own words about it, close enough to read.
  const notice = closeUp(lobbyPhone, [0.03, 0.548, 0.97, 0.655], 760, { glow: '#0b6b4b' });
  notice.position.set(430, -330, 240);
  A.add(glow(2400, '#0b6b4b', 0.5), board, hand, notice);
  const tagA = place(plate('Calm play', { size: 60, bg: C.green, fg: '#ffffff' }), -900, 455);
  const a1 = line('The teacher chooses it.', -900, -410, { align: 'left', size: 84 });
  const a2 = line('The game keeps to it.', -900, -410, { align: 'left', size: 84, color: C.mint });
  hudA.add(tagA.mesh, a1.group, a2.group);
  const sA: Shot = {
    a: bar(13), b: bar(15), group: A, hud: hudA,
    update(t) {
      film.energy = 0.3; film.warm = 0.25;
      const inn = arrive(t, 0, 0.6);
      A.position.x = (1 - inn) * 2400;
      stage.fx.uBlur.value.set((1 - inn) * 0.1, 0);
      const up = pop(t, 0.7, 0.5);
      hand.position.y = -40 - (1 - up) * 1100;
      hand.opacity = up > 0.01 ? 1 : 0;
      const n = pop(t, 1.9, 0.45);
      notice.scale.setScalar(Math.max(0.001, 0.8 + 0.2 * n));
      notice.opacity = seg(t, 1.9, 2.1);
      tagA.show(t - 0.3);
      a1.show(t - 0.5, 1.6); a2.show(t - 2.3);
      stage.view({ x: lerp(-40, 40, seg(t, 0, 4)), dolly: lerp(-140, 30, ease.outCubic(seg(t, 0, 4))), orbitY: lerp(0.07, -0.03, ease.inOutSine(seg(t, 0, 4))), orbitX: 0.015 });
      return [roll(lobby, board.screen, t, { from: 18, speed: 1.35, hold: true })];
    },
  };

  /* ---- bars 15 and 16: how to play, before every game ---- */
  const B = new Group(), hudB = new Group();
  const phone = new Phone(400, SCREEN);
  phone.position.set(520, 0, 120);
  const wall = new BigScreen(980, '#00a766', SCREEN);
  wall.position.set(-440, 150, -160);
  B.add(glow(2200, '#0b6b4b', 0.5), wall, phone);
  const tagB = place(plate('How to play', { size: 60, bg: C.cream }), -900, 455);
  const b1 = line('A walkthrough before every game.', -900, -330, { align: 'left', size: 74 });
  const b2 = sub('Short, with pictures. Everyone says when they are ready.', -900, -420, { align: 'left', size: 44 });
  hudB.add(tagB.mesh, b1.group, b2.group);
  const OPEN = walkP.marks.open ?? 20;
  const sB: Shot = {
    a: bar(15), b: bar(17), group: B, hud: hudB,
    update(t) {
      film.energy = 0.3; film.warm = 0.3;
      const k = punch(t);
      phone.rotation.y = lerp(-0.3, -0.12, ease.outCubic(seg(t, 0, 2)));
      phone.screen.u.uSheen!.value = lerp(-0.4, 1.8, seg(t, 0.2, 1.4));
      wall.position.x = -440 - (1 - arrive(t, 0.1, 0.5)) * 1600;
      tagB.show(t - 0.2);
      b1.show(t - 0.45); b2.show(t - 1.0);
      stage.view({ x: 30, dolly: lerp(-60, 70, ease.outCubic(seg(t, 0, 4))) + k * 60, orbitY: lerp(-0.05, 0.03, seg(t, 0, 4)) });
      // Through the steps a little faster than they were read, to the last one.
      const span = Math.max(60, (walkP.marks.ready ?? walkP.frames) - OPEN - 20) / 120;
      return [roll(walkP, phone.screen, t, { from: OPEN + 8, speed: span, hold: true }), roll(walkH, wall.screen, t, { from: OPEN + 8, speed: span, hold: true })];
    },
  };

  /* ---- bars 17 and 18: one thing at a time ---- */
  const D = new Group(), hudD = new Group();
  const big = new BigScreen(1220, '#00a766', SCREEN);
  big.position.set(-300, 70, -100);
  const mine = new Phone(340, SCREEN);
  mine.position.set(650, -20, 160);
  mine.rotation.y = -0.2;
  const touch = ring('#ffffff');
  const tx = ((q1p.marks.tapX ?? 0.26) - 0.5) * mine.screen.w, ty = (0.5 - (q1p.marks.tapY ?? 0.42)) * mine.screen.h;
  touch.position.set(tx, ty, 4);
  mine.add(touch);
  D.add(glow(2400, '#0b6b4b', 0.5), big, mine);
  const d1 = line('One thing at a time.', -900, -350, { align: 'left', size: 100 });
  const d2 = sub('No flashing. No countdown ticks. The same game.', -900, -445, { align: 'left', size: 48 });
  hudD.add(d1.group, d2.group);
  const TAP = q1h.marks.tap ?? 8;
  // The student answers almost at once (the question's own clock runs in real time while it is filmed), so the shot
  // opens on the question, holds it for a beat, and then plays.
  const LEAD = 0.8;
  const FROM = Math.max(0, TAP - 14);
  const sD: Shot = {
    a: bar(17), b: bar(19), group: D, hud: hudD,
    update(t) {
      film.energy = 0.35; film.warm = 0.3;
      const k = punch(t);
      d1.show(t - 0.3); d2.show(t - 1.0);
      const since = t - LEAD - (TAP - FROM) / 30;
      touch.visible = since >= 0 && since < 0.6;
      touch.scale.setScalar(lerp(50, 460, ease.outCubic(seg(since, 0, 0.55))));
      touch.material.uniforms.uP!.value = 1;
      touch.material.uniforms.uOpacity!.value = (1 - seg(since, 0.05, 0.55)) * 0.8;
      // Out to the next scene: the last quarter second slides away.
      const out = ease.inCubic(seg(t, 3.7, 4.0));
      D.position.x = -out * 2400;
      stage.fx.uBlur.value.set(out * 0.1, 0);
      stage.view({ x: 20, dolly: lerp(-80, 60, ease.outCubic(seg(t, 0, 4))) + k * 60, orbitY: lerp(0.05, -0.04, ease.inOutSine(seg(t, 0, 4))) });
      const tt = Math.max(0, t - LEAD);
      return [roll(q1h, big.screen, tt, { from: FROM, speed: 1.0, hold: true }), roll(q1p, mine.screen, tt, { from: FROM, speed: 1.0, hold: true })];
    },
  };
  return [sA, sB, sD];
}
