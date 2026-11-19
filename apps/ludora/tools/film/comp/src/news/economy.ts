// Bars 19 to 26: the economy. A Wallet for every player, class rewards from teachers, sales that
// end on a day, and an economy manager with a room of their own.
import { Group } from 'three';
import { BigScreen, Clip, Phone, bar, ease, glow, lerp, seg } from '../engine.ts';
import { C, arrive, closeUp, line, picture, place, plate, pop, punch, roll, sizeOf, still, sub } from './kit.ts';
import type { Film, Shot } from '../film.ts';

const SCREEN = { body: '#04120d', rim: '#bfe5d0' };

export async function economy(film: Film): Promise<Shot[]> {
  const { stage } = film;
  const [wallet, rewards] = await Promise.all(['wallet', 'rewards'].map((n) => new Clip(n).init()));
  const [salePic, healthPic, rulesPic, salesPic, grantPic] = await Promise.all(['shop-sale', 'econ-health-full', 'econ-rules', 'econ-sales', 'econ-grant-dialog'].map(still));
  const W = wallet.marks;

  /* ---- bars 19 to 21: the Wallet, and a goal to save for ---- */
  const A = new Group(), hudA = new Group();
  const phone = new Phone(400, SCREEN);
  phone.position.set(-520, -10, 60);
  A.add(glow(2400, '#0b6b4b', 0.55), phone);
  const tagA = place(plate('The Wallet', { size: 60, bg: C.cream }), -60, 330);
  const a1 = line('What you have,', -60, 170, { align: 'left', size: 88 });
  const a2 = line('and where it came from.', -60, 60, { align: 'left', size: 88 });
  const a3 = sub('Earned by playing. None of it is real money.', -60, -50, { align: 'left', size: 44 });
  const a4 = line('Save up for something.', -60, 115, { align: 'left', size: 96, color: C.mint });
  const a5 = sub('A goal from your own wishlist.', -60, 5, { align: 'left', size: 44 });
  const a6 = sub('Sparks boosts for special days:', -60, -75, { align: 'left', size: 44 });
  const a7 = sub('the daily limit stays the same.', -60, -130, { align: 'left', size: 44 });
  hudA.add(tagA.mesh, a1.group, a2.group, a3.group, a4.group, a5.group, a6.group, a7.group);
  const GOAL = W.goal ?? 62;
  const sA: Shot = {
    a: bar(19), b: bar(22), group: A, hud: hudA,
    update(t) {
      film.energy = 0.55; film.warm = 0.3;
      const inn = arrive(t, 0, 0.55);
      phone.position.x = -520 - (1 - inn) * 1500;
      phone.rotation.y = lerp(0.34, 0.14, ease.outCubic(seg(t, 0, 2.5)));
      phone.screen.u.uSheen!.value = lerp(-0.4, 1.8, seg(t, 0.3, 1.5));
      tagA.show(t - 0.3);
      a1.show(t - 0.5, 3.0); a2.show(t - 0.85, 2.65); a3.show(t - 1.5, 2.0);
      a4.show(t - 4.05); a5.show(t - 4.5); a6.show(t - 4.95); a7.show(t - 5.15);
      // The balances for four seconds, then the goal being chosen and its bar.
      const f = t < 4 ? 8 + t * 10 : GOAL - 6 + (t - 4) * 30;
      const k = punch(t - 4);
      stage.view({ x: lerp(0, -30, seg(t, 0, 6)), dolly: lerp(-170, -70, ease.outCubic(seg(t, 0, 6))) + punch(t) * 40 + k * 50, orbitY: lerp(-0.04, 0.03, seg(t, 0, 6)) });
      return [wallet.frame(Math.min(f, (W.scroll ?? wallet.frames) - 1)).then((tex) => phone.screen.show(tex))];
    },
  };

  /* ---- bars 22 and 23: a teacher says well done, and it lands in every Wallet ---- */
  const B = new Group(), hudB = new Group();
  const desk = new BigScreen(1520, '#00a766', SCREEN);
  desk.position.set(-250, 150, -80);
  const kid = new Phone(320, SCREEN);
  kid.position.set(730, -60, 160);
  kid.rotation.y = -0.22;
  B.add(glow(2400, '#0b6b4b', 0.6), desk, kid);
  const tagB = place(plate('Class rewards', { size: 60, bg: C.cream }), -900, 455);
  const b1 = line('Teachers can say well done.', -900, -375, { align: 'left', size: 80 });
  const b2 = sub('Sparks from a weekly class budget, with the reason. Students cannot send them to each other.', -900, -455, { align: 'left', size: 38 });
  hudB.add(tagB.mesh, b1.group, b2.group);
  const R = rewards.marks;
  const sB: Shot = {
    a: bar(22), b: bar(24), group: B, hud: hudB,
    update(t) {
      film.energy = 0.8; film.warm = 0.45;
      const inn = arrive(t, 0, 0.5);
      B.position.x = (1 - inn) * 2400;
      stage.fx.uBlur.value.set((1 - inn) * 0.1, 0);
      const up = pop(t, 1.9, 0.5);
      kid.position.y = -60 - (1 - up) * 1100;
      kid.opacity = up > 0.01 ? 1 : 0;
      tagB.show(t - 0.25);
      b1.show(t - 0.5); b2.show(t - 1.1);
      stage.view({ x: lerp(-30, 30, seg(t, 0, 4)), dolly: lerp(-120, 40, ease.outCubic(seg(t, 0, 4))) + punch(t) * 60, orbitY: lerp(0.06, -0.03, ease.inOutSine(seg(t, 0, 4))) });
      // The reason chosen, the button pressed, the toast. On the phone: the Wallet's list, where the reward now is.
      const from = (R.reason ?? 50) - 14;
      return [roll(rewards, desk.screen, t, { from, speed: Math.max(1, (rewards.frames - from - 30) / 110), hold: true }), wallet.frame((W.end ?? wallet.frames) + Math.min(40, Math.max(0, t - 2) * 20)).then((tex) => kid.screen.show(tex))];
    },
  };

  /* ---- bar 24: sales end on a day ---- */
  const D = new Group(), hudD = new Group();
  const [pw, ph] = sizeOf(salePic);
  const sale = picture(salePic, Math.min(560, (760 * pw) / ph), { rim: 3, radius: 26, glow: '#0b6b4b' });
  sale.position.set(-480, 10, 0);
  D.add(glow(2200, '#0b6b4b', 0.6), sale);
  const tagD = place(plate('Sales', { size: 60, bg: C.red, fg: '#ffffff' }), -40, 300);
  const d1 = line('On sale until a day.', -40, 140, { align: 'left', size: 96 });
  const d2 = line('Never a countdown.', -40, 25, { align: 'left', size: 96, color: C.mint });
  const d3 = sub('The shop says the day a sale ends, in words.', -40, -90, { align: 'left', size: 40 });
  hudD.add(tagD.mesh, d1.group, d2.group, d3.group);
  const sD: Shot = {
    a: bar(24), b: bar(25), group: D, hud: hudD,
    update(t) {
      film.energy = 0.8; film.warm = 0.5;
      const inn = pop(t, 0, 0.45);
      sale.scale.setScalar(Math.max(0.001, 0.7 + 0.3 * inn));
      sale.rotation.z = (1 - inn) * -0.12 - 0.02;
      sale.opacity = seg(t, 0, 0.15);
      tagD.show(t - 0.15);
      d1.show(t - 0.3); d2.show(t - 0.75); d3.show(t - 1.15);
      stage.view({ dolly: lerp(-40, 50, seg(t, 0, 2)) + punch(t) * 70 });
    },
  };

  /* ---- bars 25 and 26: the economy manager's room ---- */
  const E = new Group(), hudE = new Group();
  // The health page, panning down: what was earned and spent, where it came from, how balances are spread.
  const [hw, hh] = sizeOf(healthPic);
  const PAGE: [number, number, number] = [0.388, 0.992, 960];      // left edge of the page (past both menus), right edge, card width
  const PAGE_H = 600, HFRAC = (PAGE_H / PAGE[2]) * ((PAGE[1] - PAGE[0]) * hw) / hh;
  const TOP = 0.045, LOWER = 0.47; // under the staff banner; then the tables of where Sparks come from
  const room = closeUp(healthPic, [PAGE[0], TOP, PAGE[1], TOP + HFRAC], PAGE[2], { glow: '#0b6b4b' });
  room.position.set(-430, 150, -60);
  const rule = closeUp(rulesPic, [0.394, 0.815, 0.885, 0.975], 760, {});
  rule.position.set(455, 330, 60);
  const sales = closeUp(salesPic, [0.394, 0.73, 0.775, 0.895], 700, {});
  sales.position.set(480, 70, 80);
  const grant = closeUp(grantPic, [0.30, 0.055, 0.685, 0.95], 400, {});
  grant.position.set(600, -40, 100);
  E.add(glow(2400, '#0b6b4b', 0.55), room, rule, sales);
  void grant;
  const tagE = place(plate('The economy manager', { size: 56, bg: C.cream }), -900, 470);
  const e1 = line('Someone to keep it fair.', -900, -300, { align: 'left', size: 84 });
  const e2 = sub('A staff role for the economy and nothing else. Rules are previewed before they change, and can be undone.', -900, -390, { align: 'left', size: 36 });
  const e3 = sub('Grants keep to a daily limit. A refund gives the price back, once. Every change is recorded.', -900, -445, { align: 'left', size: 36 });
  hudE.add(tagE.mesh, e1.group, e2.group, e3.group);
  const sE: Shot = {
    a: bar(25), b: bar(27), group: E, hud: hudE,
    update(t) {
      film.energy = 0.85; film.warm = 0.45;
      const inn = arrive(t, 0, 0.5);
      room.position.x = -430 - (1 - inn) * 1700;
      const y0 = lerp(TOP, LOWER, ease.inOutCubic(seg(t, 1.5, 2.9)));
      room.show(healthPic, [PAGE[0], y0, PAGE[1], y0 + HFRAC]);
      const r = pop(t, 0.9, 0.45), s = pop(t, 1.7, 0.45);
      rule.position.x = 455 + (1 - r) * 1500; rule.rotation.z = (1 - r) * 0.1 + 0.015;
      sales.position.x = 480 + (1 - s) * 1500; sales.rotation.z = (1 - s) * -0.1 - 0.02;
      tagE.show(t - 0.2);
      e1.show(t - 0.45); e2.show(t - 1.1); e3.show(t - 1.5);
      const out = ease.inCubic(seg(t, 3.6, 4.0));
      stage.fx.uZoomBlur.value = out * 0.35;
      stage.fx.uFlash.value = ease.inCubic(seg(t, 3.8, 4.0)) * 0.9;
      stage.view({ dolly: lerp(-100, 40, ease.outCubic(seg(t, 0, 3.6))) + punch(t) * 60 + out * 600, orbitY: lerp(0.05, -0.03, seg(t, 0, 4)) });
    },
  };
  return [sA, sB, sD, sE];
}
