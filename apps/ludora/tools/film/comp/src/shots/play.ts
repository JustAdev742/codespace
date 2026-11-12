// Bars 6 to 11: how a game plays. The big screen, the phones, an answer, the board, the podium.
import { Group } from 'three';
import { BigScreen, Clip, Confetti, Phone, bar, ease, glow, lerp, ring, seg } from '../engine.ts';
import { arrive, caption, punch, roll } from './kit.ts';
import { MARK } from './marks.ts';
import type { Film, Shot } from '../film.ts';

export async function play(film: Film): Promise<Shot[]> {
  const { stage } = film;
  const [q1h, q1p, q2p, join, podH, podP] = await Promise.all(['q1-host', 'q1-phone', 'q2-phone', 'phone-join', 'podium-host', 'podium-phone'].map((n) => new Clip(n).init()));

  /* ---- bars 6 and 7: one screen for the room, every device in its hand ---- */
  const C1 = new Group(), hud1 = new Group();
  const big = new BigScreen(1160, '#3f4dff');
  big.position.set(-330, 80, -120);
  const phones = [new Phone(230), new Phone(280), new Phone(230)];
  const seat: [number, number, number, number][] = [[400, -170, 120, -0.2], [640, -60, 250, -0.26], [860, -200, 90, -0.32]];
  phones.forEach((p, i) => { p.position.set(seat[i]![0], seat[i]![1], seat[i]![2]); p.rotation.y = seat[i]![3]; C1.add(p); });
  const back1 = glow(2200, '#3a35c8', 0.5);
  back1.position.set(-200, 60, -700);
  C1.add(back1, big);
  const cap1 = caption('One screen for the room.', -860, -440, { align: 'left', size: 104 });
  const cap2 = caption('Every device joins with a code.', -860, -440, { align: 'left', size: 104, color: '#ffc233' });
  hud1.add(cap1.group, cap2.group);
  const s1: Shot = {
    a: bar(6), b: bar(8), group: C1, hud: hud1,
    update(t) {
      film.energy = 0.55; film.warm = 0.1;
      const inn = arrive(t, 0, 0.5);
      C1.position.x = (1 - inn) * 2600;
      stage.fx.uBlur.value.set((1 - inn) * 0.12, 0);
      const span = Math.max(40, (q1h.marks.tap ?? MARK.tap) - 8 - 12) / 120;
      const waits = [roll(q1h, big.screen, t, { from: 12, speed: span })];
      phones.forEach((p, i) => {
        const up = ease.outBack(seg(t, 1.9 + i * 0.13, 2.45 + i * 0.13), 1.3);
        p.position.y = seat[i]![1] - (1 - up) * 1100;
        p.rotation.z = (1 - up) * 0.25 + Math.sin(t * 1.3 + i) * 0.012;
        p.opacity = up > 0.01 ? 1 : 0;
      });
      waits.push(roll(q1p, phones[1]!.screen, t, { from: 12, speed: span }), roll(join, phones[0]!.screen, t - 1.2, { from: 30, hold: true }), roll(q2p, phones[2]!.screen, t - 1.0, { from: 10, hold: true }));
      cap1.show(t - 0.35, 1.45);
      cap2.show(t - 2.15, 1.6);
      stage.view({ x: lerp(-60, 60, seg(t, 0, 4)), dolly: lerp(-160, 20, ease.outCubic(seg(t, 0, 4))) + punch(t - 2) * 40, orbitY: lerp(0.1, -0.05, ease.inOutSine(seg(t, 0, 4))), orbitX: 0.02 });
      return waits;
    },
  };

  /* ---- bar 8: the answer, close on the phone ---- */
  const C2 = new Group(), hud2 = new Group();
  const hero = new Phone(350);
  hero.position.set(470, 0, 60);
  const board = new BigScreen(980, '#2fbf8a');
  board.position.set(-420, 110, -260);
  const back2 = glow(2000, '#1f9a78', 0.45);
  back2.position.set(300, 0, -600);
  C2.add(back2, board, hero);
  // The touch: a ring of light where the thumb lands on the glass.
  const touch = ring('#ffffff');
  const dot = glow(90, '#ffffff', 0.9);
  const tx = ((q1p.marks.tapX ?? 0.74) - 0.5) * hero.screen.w, ty = (0.5 - (q1p.marks.tapY ?? 0.53)) * hero.screen.h;
  touch.position.set(tx, ty, 4);
  dot.position.set(tx, ty, 3);
  dot.renderOrder = 24;
  hero.add(touch, dot);
  const beats = [caption('Answer.', -880, -250, { align: 'left', size: 150 }), caption('Streak.', -880, -250, { align: 'left', size: 150, color: '#ffc233' }), caption('Climb.', -880, -250, { align: 'left', size: 150 })];
  beats[1]!.group.position.x = -880 + beats[0]!.width + 50;
  beats[2]!.group.position.x = beats[1]!.group.position.x + beats[1]!.width + 50;
  for (const c of beats) hud2.add(c.group);
  const TAP = q1h.marks.tap ?? MARK.tap;
  const s2: Shot = {
    a: bar(8), b: bar(9), group: C2, hud: hud2,
    update(t) {
      film.energy = 0.7; film.warm = 0.15;
      const k = punch(t);
      hero.rotation.y = lerp(-0.34, -0.16, ease.outCubic(seg(t, 0, 2)));
      hero.rotation.z = 0.03;
      hero.screen.u.uSheen!.value = lerp(-0.4, 1.8, seg(t, 0.2, 1.3));
      beats.forEach((c, i) => c.show(t - i * 0.5 - 0.02));
      const since = t - 18 / 30; // the clip starts 18 frames before the tap
      dot.material.opacity = seg(since, -0.3, -0.05) * (1 - seg(since, 0, 0.18));
      dot.scale.setScalar(lerp(150, 70, seg(since, -0.3, 0)));
      touch.visible = since >= 0 && since < 0.6;
      touch.scale.setScalar(lerp(60, 520, ease.outCubic(seg(since, 0, 0.55))));
      touch.material.uniforms.uP!.value = 1;
      touch.material.uniforms.uOpacity!.value = (1 - seg(since, 0.05, 0.55)) * 0.8;
      stage.view({ x: 40, dolly: lerp(0, 90, ease.outCubic(seg(t, 0, 2))) + k * 70, orbitY: lerp(-0.06, 0.03, seg(t, 0, 2)) });
      stage.fx.uAberration.value = 0.0012 + k * 0.004;
      return [roll(q1p, hero.screen, t, { from: TAP - 18, speed: 1.0 }), roll(q1h, board.screen, t, { from: TAP - 18, speed: 1.0 })];
    },
  };

  /* ---- bar 9: the board moves ---- */
  const C3 = new Group(), hud3 = new Group();
  const wall = new BigScreen(1500, '#4a5bff');
  wall.position.set(0, 40, 0);
  C3.add(wall);
  const cap3 = caption('Every answer moves the board.', 0, -468, { size: 92 });
  hud3.add(cap3.group);
  const LEAD = q1h.marks.next ?? MARK.lead;
  const s3: Shot = {
    a: bar(9), b: bar(10), group: C3, hud: hud3,
    update(t) {
      film.energy = 0.75;
      const k = punch(t);
      cap3.show(t - 0.25);
      stage.view({ dolly: lerp(-80, 40, ease.outCubic(seg(t, 0, 2))) + k * 80, orbitY: lerp(0.05, -0.03, seg(t, 0, 2)), orbitX: -0.015 });
      stage.fx.uAberration.value = 0.0012 + k * 0.004;
      return [roll(q1h, wall.screen, t, { from: LEAD - 4, speed: 1.15, hold: true })];
    },
  };

  /* ---- bars 10 and 11: the podium ---- */
  const C4 = new Group(), hud4 = new Group();
  const stageScreen = new BigScreen(1420, '#ffb31a');
  stageScreen.position.set(-150, 50, -60);
  const mine = new Phone(300);
  mine.position.set(780, -120, 240);
  mine.rotation.y = -0.3;
  const gold = glow(2600, '#ffa51a', 0.55);
  gold.position.set(0, 0, -700);
  const paper = new Confetti(380, 31, { rain: true, width: 2600 });
  paper.position.z = 200;
  C4.add(gold, stageScreen, mine, paper);
  const cap4 = caption('The whole class, in it together.', 0, -470, { size: 98, color: '#ffc233' });
  hud4.add(cap4.group);
  const POD = podH.marks.over ?? MARK.pod;
  const s4: Shot = {
    a: bar(10), b: bar(12), group: C4, hud: hud4,
    update(t) {
      film.energy = 0.9; film.warm = 0.8;
      const k = punch(t);
      const up = ease.outBack(seg(t, 1.5, 2.1), 1.3);
      mine.position.y = -120 - (1 - up) * 1100;
      mine.opacity = up > 0.01 ? 1 : 0;
      mine.rotation.z = (1 - up) * 0.2;
      paper.update(t - 0.6, 6);
      cap4.show(t - 0.5, 2.85);
      const rush = ease.inQuart(seg(t, 3.3, 4.0));
      stage.view({ dolly: lerp(-140, 50, ease.outCubic(seg(t, 0, 3.4))) + k * 80 + rush * 700, orbitY: lerp(0.07, -0.05, ease.inOutSine(seg(t, 0, 4))), orbitX: 0.02 });
      stage.fx.uZoomBlur.value = rush * 0.4;
      stage.fx.uFlash.value = ease.inCubic(seg(t, 3.75, 4.0));
      stage.fx.uAberration.value = 0.0012 + k * 0.004;
      return [roll(podH, stageScreen.screen, t, { from: POD - 6, speed: 1.3, hold: true }), roll(podP, mine.screen, t, { from: POD + 30, speed: 1.0, hold: true })];
    },
  };
  return [s1, s2, s3, s4];
}
