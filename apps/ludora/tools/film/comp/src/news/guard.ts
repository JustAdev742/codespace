// Bars 31 to 41: the server that guards itself. Ludora OS, its sentinel and its staff dashboard,
// filmed from the dashboard's own demo: the real pages, with a pretend server sending the guard's
// real sentences. The film says so on screen while the pretend attack runs.
import { Color, Group } from 'three';
import { Card, Clip, Phone, bar, ease, glow, lerp, ring, seg } from '../engine.ts';
import { C, arrive, closeUp, line, place, plate, pop, punch, roll, sheet, still, sub } from './kit.ts';
import type { Film, Shot } from '../film.ts';

const FULL: [number, number] = [1920, 1080];
const screenCard = () => new Card({ w: FULL[0], h: FULL[1], radius: 0, shadow: 0, color: C.term });

export async function guard(film: Film): Promise<Shot[]> {
  const { stage } = film;
  const [attack, security, calmClip] = await Promise.all(['dash-attack', 'dash-security', 'dash-calm'].map((n) => new Clip(n).init()));
  const [healthPic, phonePic] = await Promise.all(['dash-health-full', 'dash-phone'].map(still));
  const M = attack.marks;
  // Said on screen while it runs: this is the dashboard's demo, not a school's server under real attack.
  const note = () => { const p = plate('A pretend attack on a demo server', { size: 25, bg: '#061113', fg: '#9dbfb8', lean: 0 }); p.mesh.position.set(940 - p.w / 2, 492, 0); return p; };
  // The server room: the stage's own light is off and what is behind the pictures is the dashboard's deep teal (linear values).
  const TEAL = new Color(0.0022, 0.0075, 0.0085);
  const dark = (t: number) => { film.energy = 0; film.warm = 0; film.backdrop.visible = false; stage.renderer.setClearColor(TEAL, 1); void t; };

  /* ---- bar 31: the lights go down ---- */
  const A = new Group(), hudA = new Group();
  const sweep = ring(C.calm);
  sweep.position.set(0, 20, -200);
  const core = glow(900, '#0d4a44', 0.5);
  core.position.set(0, 20, -400);
  A.add(core, sweep);
  // Said carefully: the live site is hosted elsewhere today; Ludora OS is for a school that runs its own.
  const a1 = line('And on a school’s own server,', 0, 110, { size: 96 });
  const a2 = line('it guards itself.', 0, -20, { size: 132, color: C.calm });
  const os = place(plate('Ludora OS', { size: 48, bg: C.calm, fg: C.term }), -150, -190);
  hudA.add(a1.group, a2.group, os.mesh);
  const sA: Shot = {
    a: bar(31), b: bar(32), group: A, hud: hudA,
    update(t) {
      dark(t);
      stage.fx.uFade.value = seg(t, 0, 0.25);
      stage.fx.uVignette.value = 0.7;
      const p = (t / 2) % 1;
      sweep.scale.setScalar(lerp(200, 1900, ease.outCubic(p)));
      sweep.material.uniforms.uP!.value = 1;
      sweep.material.uniforms.uOpacity!.value = (1 - p) * 0.35;
      a1.show(t - 0.15, 1.75); a2.show(t - 0.7, 1.75); os.show(t - 1.1, 1.75);
      stage.view({ dolly: lerp(-60, 60, seg(t, 0, 2)) });
    },
  };

  /* ---- bars 32 to 35: calm, a probe, guessing, a flood, the shield ---- */
  const B = new Group(), hudB = new Group();
  const wall = screenCard();
  B.add(wall);
  // Six seconds from a calm morning to the attack (so it lands on the first beat of bar 35), then real time.
  const FROM = 34, HIT = 6, SPEED = (M.attack! - FROM) / (HIT * 30);
  const at = (mark: number) => (mark <= M.attack! ? (mark - FROM) / (30 * SPEED) : HIT + (mark - M.attack!) / 30);
  const frameAt = (t: number) => (t < HIT ? FROM + t * 30 * SPEED : M.attack! + (t - HIT) * 30);
  const caps = [
    { p: place(plate('The sentinel watches every door', { size: 50 }), -900, -400), a: 0.3, z: at(M.probe!) - 0.05 },
    { p: place(plate('A probe. Banned.', { size: 50, bg: C.amber }), -900, -400), a: at(M.probe!) + 0.15, z: at(M.guess!) },
    { p: place(plate('Password guessing. Banned.', { size: 50, bg: C.amber }), -900, -400), a: at(M.guess!) + 0.1, z: at(M.decoy!) },
    { p: place(plate('A decoy port touched. Banned.', { size: 50, bg: C.amber }), -900, -400), a: at(M.decoy!) + 0.1, z: at(M.attack!) },
    { p: place(plate('An attack: the shield goes up by itself', { size: 54, bg: C.coral }), -900, -400), a: at(M.attack!) + 0.12, z: 7.8 },
  ];
  const nB = note();
  hudB.add(nB.mesh, ...caps.map((c) => c.p.mesh));
  const sB: Shot = {
    a: bar(32), b: bar(36), group: B, hud: hudB,
    update(t) {
      dark(t);
      const hit = punch(t - at(M.attack!) - 0.05, 6);
      for (const c of caps) c.p.show(t - c.a, c.z - c.a);
      nB.show(t - 0.6);
      // Close on what is happening now (the top of the page), easing out as the picture fills with red.
      const inn = ease.inOutCubic(seg(t, 0.2, 2.2)), out = ease.inOutCubic(seg(t, at(M.attack!) - 0.4, at(M.attack!) + 0.5));
      const z = lerp(0, 520, inn) - out * 330;
      stage.view({ x: lerp(0, -150, inn) + out * 120, y: lerp(0, 150, inn) - out * 110, dolly: z + hit * 90 });
      stage.fx.uAberration.value = 0.0009 + hit * 0.006;
      stage.fx.uFlash.value = hit * 0.12;
      stage.fx.uVignette.value = 0.25;
      stage.fx.uFade.value = seg(t, 0, 0.2);
      return [attack.frame(Math.min(frameAt(t), M.scroll! - 2)).then((tex) => wall.show(tex))];
    },
  };

  /* ---- bar 36: what it has seen, line by line ---- */
  const D = new Group(), hudD = new Group();
  const feed = screenCard();
  D.add(feed);
  const d1 = place(plate('Floods. Probes. Decoys. Guessing.', { size: 50, bg: C.cream }), -900, -330);
  const d2 = place(plate('Even likely cheating in a game', { size: 50, bg: C.mint }), -900, -420);
  const nD = note();
  hudD.add(d1.mesh, d2.mesh, nD.mesh);
  const sD: Shot = {
    a: bar(36), b: bar(37), group: D, hud: hudD,
    update(t) {
      dark(t);
      d1.show(t - 0.15); d2.show(t - 0.75); nD.show(t);
      const k = punch(t);
      // Close on the right-hand column, where the list is.
      stage.view({ x: 420, y: lerp(40, -30, seg(t, 0, 2)), dolly: 880 + k * 60 });
      stage.fx.uVignette.value = 0.25;
      return [roll(attack, feed, t, { from: M.feed! - 70, speed: 1.15, to: M.feed! + 40 })];
    },
  };

  /* ---- bar 37: it tells the right people ---- */
  const E = new Group(), hudE = new Group();
  const handset = new Phone(330, { body: '#06100f', rim: '#6fb3ab' });
  handset.position.set(-560, -10, 60);
  handset.rotation.y = 0.22;
  handset.screen.show(phonePic);
  // The message as the server writes it (alerts.compose), cut to its first lines.
  const push1 = sheet([
    { t: 'ntfy', color: '#5b6b66', size: 22, font: 'lato', weight: 700, gap: 2 },
    { t: '[Ludora OS ludora-school] Security', color: C.ink, size: 27, font: 'lato', weight: 900, gap: 2 },
    { t: 'Shield raised: 5 addresses misbehaved within two minutes.... (and 3 more events)', color: '#24352e', size: 24, font: 'lato' },
  ], 430, { bg: '#fffdf8', rimColor: C.cream, rim: 0, radius: 26, pad: 24 });
  push1.position.set(-560, 250, 120);
  const mail = sheet([
    { t: 'To: it@school.example', color: '#9dbfb8', size: 22, gap: 4 },
    { t: '[Ludora OS ludora-school] Security: Shield raised: 5 addresses misbehaved within two minutes.... (and 3 more events)', color: '#fff7e0', weight: 700, size: 25, gap: 14 },
    { t: 'What the server did: Refused 3 addresses for up to 60 minutes. Staff addresses are never refused.', color: C.termText, size: 23, gap: 12 },
    { t: 'Server: ludora-school (https://play.school.example)', color: '#9dbfb8', size: 22 },
  ], 900, { glow: '#0f5d55' });
  mail.position.set(380, 150, 0);
  const e1 = line('It tells the right people.', 380, -150, { size: 84 });
  const e2 = sub('By email, a push to a phone, or Telegram. All free.', 380, -245, { size: 46 });
  E.add(glow(1800, '#0b3d3a', 0.24), handset, push1, mail);
  hudE.add(e1.group, e2.group);
  const sE: Shot = {
    a: bar(37), b: bar(38), group: E, hud: hudE,
    update(t) {
      dark(t);
      const k = punch(t);
      handset.position.y = -10 - (1 - arrive(t, 0, 0.45)) * 900;
      const drop = pop(t, 0.35, 0.4);
      push1.position.y = 250 + (1 - drop) * 220;
      push1.opacity = seg(t, 0.35, 0.5);
      push1.scale.setScalar(0.9 + 0.1 * drop);
      mail.position.x = 380 + (1 - arrive(t, 0.15, 0.5)) * 1500;
      e1.show(t - 0.6); e2.show(t - 1.0);
      stage.view({ dolly: lerp(-40, 40, seg(t, 0, 2)) + k * 50, orbitY: lerp(0.03, -0.02, seg(t, 0, 2)) });
    },
  };

  /* ---- bar 38: every alert read by fixed rules; an AI second opinion if wanted ---- */
  const F = new Group(), hudF = new Group();
  const reading = sheet([
    { t: 'What the guard makes of it (worked out by fixed rules from what it recorded):', color: '#fff7e0', weight: 700, size: 30, gap: 14 },
    { t: '- What it was: an attempt to overload the server.', color: C.termText, size: 30, gap: 6 },
    { t: '- How serious: needs a person to act now.', color: C.coral, size: 30, gap: 6 },
    { t: '- 3 devices were at it together.', color: C.termText, size: 30 },
  ], 1180, { glow: '#0f5d55', pad: 44 });
  reading.position.set(0, 320, 0);
  const f1 = line('Every alert, read by fixed rules.', 0, 70, { size: 84 });
  // The dashboard's own words about the optional AI model.
  const analyst = closeUp(healthPic, [0.565, 0.438, 0.98, 0.552], 820, { rim: 2.5 });
  analyst.u.uRimColor!.value.set('#3f7f7a');
  analyst.position.set(0, -260, 0);
  F.add(glow(2000, '#0b3d3a', 0.22), reading, analyst);
  hudF.add(f1.group);
  const sF: Shot = {
    a: bar(38), b: bar(39), group: F, hud: hudF,
    update(t) {
      dark(t);
      const inn = pop(t, 0, 0.45);
      reading.scale.setScalar(0.86 + 0.14 * inn);
      reading.opacity = seg(t, 0, 0.18);
      f1.show(t - 0.35);
      const up = pop(t, 0.85, 0.4);
      analyst.position.y = -260 - (1 - up) * 520;
      analyst.opacity = seg(t, 0.85, 1.0);
      stage.view({ dolly: lerp(-30, 50, seg(t, 0, 2)) + punch(t) * 40 });
    },
  };

  /* ---- bar 39: one switch closes the doors ---- */
  const G = new Group(), hudG = new Group();
  const lock = screenCard();
  G.add(lock);
  const g1 = place(plate('One switch closes the doors', { size: 54, bg: C.coral }), -900, -400);
  const nG = note();
  hudG.add(g1.mesh, nG.mesh);
  const S = security.marks;
  const sG: Shot = {
    a: bar(39), b: bar(40), group: G, hud: hudG,
    update(t) {
      dark(t);
      g1.show(t - 0.2); nG.show(t);
      // The question it asks first, then (cut on the bolt) the padlock closed.
      const asked = t < 0.8;
      if (asked) stage.view({ x: 0, y: -40, dolly: 420 + punch(t) * 60 });
      else stage.view({ x: 440, y: 20, dolly: 880 + punch(t - 0.8) * 70 });
      stage.fx.uVignette.value = 0.25;
      stage.fx.uFlash.value = punch(t - 0.8, 14) * 0.25;
      const f = asked ? (S.yes ?? 170) - 26 + t * 30 : (security.frames - 60) + (t - 0.8) * 30;
      return [security.frame(Math.min(f, security.frames)).then((tex) => lock.show(tex))];
    },
  };

  /* ---- bar 40: looked after from a browser ---- */
  const Hh = new Group(), hudH = new Group();
  // The self-check list, scrolling; the backups and support access panels beside it. All from the Health page.
  const CH = 0.2295;
  const checks = closeUp(healthPic, [0.21, 0.33, 0.55, 0.33 + CH], 760, { rim: 2.5, glow: '#0b3d3a' });
  checks.u.uRimColor!.value.set('#3f7f7a');
  checks.position.set(-500, 30, 0);
  const backups = closeUp(healthPic, [0.565, 0.252, 0.98, 0.303], 800, { rim: 2.5 });
  backups.u.uRimColor!.value.set('#3f7f7a');
  backups.position.set(430, 330, 0);
  const support = closeUp(healthPic, [0.565, 0.345, 0.98, 0.435], 800, { rim: 2.5 });
  support.u.uRimColor!.value.set('#3f7f7a');
  support.position.set(430, 60, 0);
  Hh.add(glow(2200, '#0b3d3a', 0.22), checks, backups, support);
  // No number here: the demo's list is shorter than a real server's (31 checks in doctor.py).
  const h1 = line('It checks itself.', 430, -220, { size: 84 });
  const h2 = line('Encrypted backups, every night.', 430, -330, { size: 60, color: C.calm });
  hudH.add(h1.group, h2.group);
  const sH: Shot = {
    a: bar(40), b: bar(41), group: Hh, hud: hudH,
    update(t) {
      dark(t);
      checks.position.x = -500 - (1 - arrive(t, 0, 0.4)) * 1400;
      const y0 = lerp(0.33, 0.70, ease.inOutSine(seg(t, 0.2, 2.0)));
      checks.show(healthPic, [0.21, y0, 0.55, y0 + CH]);
      backups.position.x = 430 + (1 - arrive(t, 0.12, 0.4)) * 1500;
      support.position.x = 430 + (1 - arrive(t, 0.24, 0.4)) * 1500;
      h1.show(t - 0.5); h2.show(t - 0.95);
      stage.view({ dolly: lerp(-50, 30, seg(t, 0, 2)) + punch(t) * 40 });
    },
  };

  /* ---- bar 41: calm again ---- */
  const I = new Group(), hudI = new Group();
  const quiet = screenCard();
  I.add(quiet);
  const i1 = place(plate('And then it is calm again', { size: 58, bg: C.calm }), -900, -400);
  hudI.add(i1.mesh);
  const sI: Shot = {
    a: bar(41), b: bar(42), group: I, hud: hudI,
    update(t) {
      dark(t);
      i1.show(t - 0.25, 1.7);
      stage.view({ x: -150, y: 150, dolly: lerp(520, 300, ease.outCubic(seg(t, 0, 2))) });
      stage.fx.uVignette.value = 0.25;
      stage.fx.uFade.value = 1 - ease.inCubic(seg(t, 1.7, 2.0));
      return [roll(calmClip, quiet, t, { from: 20, speed: 1 })];
    },
  };
  return [sA, sB, sD, sE, sF, sG, sH, sI];
}
