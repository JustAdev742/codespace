// Bars 18 to 30: make it your own (notes, your own game mode, your own Glim, the collection),
// then what it gives a classroom.
import { Group } from 'three';
import { Card, Clip, bar, cone, ease, glow, lerp, loadStill, ring, seg, text, clamp01 } from '../engine.ts';
import { Actor, floorLight, hop } from '../cast.ts';
import { caption, punch, roll } from './kit.ts';
import { CROP, MARK } from './marks.ts';
import type { Film, Shot } from '../film.ts';

const FLOOR = -330;

export async function making(film: Film): Promise<Shot[]> {
  const { stage } = film;
  const [notes, code, shuffle, paint, picker] = await Promise.all(['make-notes', 'gamemaker-code', 'designs-shuffle', 'designs-paint', 'tools-picker'].map((n) => new Clip(n).init()));
  const [collection, report] = await Promise.all([loadStill('collection-full'), loadStill('report-game')]);

  /* ---- bars 18 and 19: the turn. Quiet. One Glim, one question. ---- */
  const E0 = new Group(), hud0 = new Group();
  const lamp = cone(1250, '#fff0c8', 0.4);
  lamp.position.set(0, 700, -40);
  const pool = floorLight(430, '#ffe6ad', 0.8);
  pool.position.set(0, FLOOR + 1, 0);
  const maker = new Actor('glim-sprig', 340);
  maker.path = (t) => {
    const p = seg(t, 0.25, 1.5);
    const h = hop(p, 3, 150);
    const jump = t > 2.05 && t < 2.75 ? Math.sin(((t - 2.05) / 0.7) * Math.PI) * 190 : 0;
    return { x: lerp(1300, 0, p), y: FLOOR + h.y + jump, z: 40, turn: lerp(-1.0, 0, ease.outCubic(seg(t, 1.45, 1.8))), squash: h.squash, moving: p < 1 ? 1 : 0 };
  };
  maker.cue(2.05, 'celebrate').cue(3.1, 'wave');
  await maker.glim.ready;
  E0.add(lamp, pool, maker);
  const ask = caption('And when 30 is not enough?', 0, 300, { size: 118 });
  const answer = caption('Make your own.', 0, 300, { size: 190, color: '#ffc233' });
  hud0.add(ask.group, answer.group);
  const s0: Shot = {
    a: bar(18), b: bar(20), group: E0, hud: hud0,
    update(t) {
      film.energy = 0.15; film.warm = 0.3 + 0.5 * seg(t, 2, 2.6);
      maker.seek(t);
      ask.show(t - 0.3, 1.5);
      answer.show(t - 2.02);
      answer.group.scale.setScalar(1 + 0.1 * punch(t - 2.02, 8));
      stage.view({ y: 30, lookY: -20, dolly: lerp(-260, 40, ease.inOutSine(seg(t, 0, 4))) + punch(t - 2.02) * 70, orbitX: 0.07, orbitY: Math.sin(t * 0.5) * 0.03 });
      stage.fx.uFade.value = ease.outCubic(seg(t, 0, 0.45));
      stage.fx.uAberration.value = 0.0012 + punch(t - 2.02) * 0.004;
    },
  };

  /** A scene that is one big app window with a caption under it, arriving from the side. */
  const windowScene = (a: number, b: number, clip: Clip, lines: [string, number, number, string?][], o: { from?: number; speed?: number; crop?: [number, number, number, number]; glowColor?: string; w?: number; aspect?: number } = {}): Shot => {
    const g = new Group(), hud = new Group();
    const crop = o.crop ?? CROP.page;
    const aspect = o.aspect ?? ((crop[2] - crop[0]) * 16) / ((crop[3] - crop[1]) * 9);
    const w = o.w ?? 1340;
    const frame = new Card({ w: w + 22, h: w / aspect + 22, radius: 34, color: '#04050d', rim: 2, rimColor: '#7f8be0', glow: o.glowColor ?? '#4450ff', shadow: 0.75 });
    const win = new Card({ w, h: w / aspect, radius: 24, shadow: 0 });
    win.position.z = 1;
    const holder = new Group();
    holder.add(frame, win);
    holder.position.set(0, 78, 0);
    g.add(holder);
    const caps = lines.map(([str, , , color]) => { const c = caption(str, 0, -462, { size: 96, color: color ?? '#ffffff' }); hud.add(c.group); return c; });
    return {
      a, b, group: g, hud,
      update(t) {
        film.energy = 0.45; film.warm = 0.2;
        const inn = ease.outCubic(seg(t, 0, 0.5));
        holder.position.x = (1 - inn) * 2300;
        holder.rotation.y = lerp(-0.5, 0, inn);
        win.u.uSheen!.value = lerp(-0.5, 1.9, seg(t, 0.35, 1.5));
        stage.fx.uBlur.value.set((1 - inn) * 0.1, 0);
        caps.forEach((c, i) => c.show(t - lines[i]![1], lines[i]![2]));
        stage.view({ dolly: lerp(-60, 70, ease.outCubic(seg(t, 0, b - a))), orbitY: lerp(0.06, -0.04, ease.inOutSine(seg(t, 0, b - a))), orbitX: 0.012 });
        return [roll(clip, win, t, { from: o.from ?? 1, speed: o.speed ?? 1, crop, hold: true })];
      },
    };
  };

  /* ---- bars 20 and 21: notes become questions ---- */
  const s1 = windowScene(bar(20), bar(22), notes, [['Paste your notes.', 0.3, 1.55], ['Get a game.', 2.05, 9, '#ffc233']], { from: MARK.notes, speed: 2.05 });
  /** Two cards side by side, cut from one filmed page: `left` and `right` are the parts of the picture to show. */
  type Box = [number, number, number, number];
  const pairScene = (a: number, b: number, o: {
    clipL: (t: number) => { clip: Clip; t: number; from: number; speed: number }; clipR: (t: number) => { clip: Clip; t: number; from: number; speed: number };
    left: Box; right: Box; picture: [number, number]; lines: [string, number, number, string?][]; glowL: string; glowR: string; height?: number;
  }): Shot => {
    const g = new Group(), hud = new Group();
    const H0 = o.height ?? 640;
    const size = (box: Box) => { const asp = ((box[2] - box[0]) * o.picture[0]) / ((box[3] - box[1]) * o.picture[1]); const w = Math.min(880, H0 * asp); return { w, h: w / asp }; };
    const sl = size(o.left), sr = size(o.right);
    const gap = 70, total = sl.w + sr.w + gap;
    const L = new Card({ w: sl.w, h: sl.h, radius: 28, rim: 2, rimColor: '#7f8be0', glow: o.glowL, shadow: 0.7 });
    const R = new Card({ w: sr.w, h: sr.h, radius: 28, rim: 2, rimColor: '#7f8be0', glow: o.glowR, shadow: 0.7 });
    const lx = -total / 2 + sl.w / 2, rx = total / 2 - sr.w / 2;
    L.position.set(lx, 80, 0);
    R.position.set(rx, 80, 0);
    g.add(L, R);
    const caps = o.lines.map(([str, , , color]) => { const c = caption(str, 0, -462, { size: 96, color: color ?? '#ffffff' }); hud.add(c.group); return c; });
    return {
      a, b, group: g, hud,
      update(t) {
        film.energy = 0.5; film.warm = 0.25;
        const a1 = ease.outBack(seg(t, 0, 0.5), 1.2), a2 = ease.outBack(seg(t, 0.12, 0.62), 1.2);
        L.position.x = lx - (1 - a1) * 1800;
        R.position.x = rx + (1 - a2) * 1800;
        L.rotation.y = lerp(0.5, 0.07, a1);
        R.rotation.y = lerp(-0.5, -0.07, a2);
        L.u.uSheen!.value = lerp(-0.5, 1.9, seg(t, 0.4, 1.5));
        caps.forEach((c, i) => c.show(t - o.lines[i]![1], o.lines[i]![2]));
        stage.view({ dolly: lerp(-80, 60, ease.outCubic(seg(t, 0, b - a))) + punch(t - 2) * 40, orbitY: lerp(-0.04, 0.04, seg(t, 0, b - a)) });
        const l = o.clipL(t), r = o.clipR(t);
        return [roll(l.clip, L, l.t, { from: l.from, speed: l.speed, crop: o.left, hold: true }), roll(r.clip, R, r.t, { from: r.from, speed: r.speed, crop: o.right, hold: true })];
      },
    };
  };
  const pad = (b: Box | undefined, fallback: Box, px = 0.008, py = 0.008): Box => { const v = b ?? fallback; return [Math.max(0, v[0] - px), Math.max(0, v[1] - py), Math.min(1, v[2] + px), Math.min(1, v[3] + py)]; };
  const mk = (c: Clip) => c.marks as unknown as Record<string, Box | undefined> & Record<string, number>;

  /* ---- bars 22 and 23: write your own game mode. The code on the left, the test game it drives on the right ---- */
  const codeBox = pad(mk(code).code, [0.21, 0.27, 0.6, 0.62]);
  const liveBox = pad(mk(code).live, [0.21, 0.63, 0.6, 1.0]);
  const s2 = pairScene(bar(22), bar(24), {
    clipL: (t) => ({ clip: code, t, from: Math.max(1, ((mk(code).edit as unknown as number) ?? 34) - 14), speed: 1.55 }),
    clipR: (t) => ({ clip: code, t, from: Math.max(1, ((mk(code).edit as unknown as number) ?? 34) - 14), speed: 1.55 }),
    left: codeBox, right: liveBox, picture: [1920, 1770], glowL: '#22b8a0', glowR: '#3f6bff',
    lines: [['Write your own game mode.', 0.3, 1.55], ['Simple code. A real game.', 2.05, 9, '#ffc233']],
  });

  /* ---- bars 24 and 25: your own Glim. The Glim on the left, the paint going on at the right ---- */
  const prev = mk(shuffle).preview ?? [0.4, 0.14, 0.57, 0.31];
  const glimBox: Box = [Math.max(0, prev[0] - (prev[2] - prev[0]) * 1.06), prev[1], prev[2], prev[3]];
  const paintBox = pad(mk(paint).painter ?? mk(shuffle).painter, [0.6, 0.52, 0.94, 0.76], 0.012, 0.012);
  const s3 = pairScene(bar(24), bar(26), {
    clipL: (t) => (t < 2 ? { clip: shuffle, t, from: 12, speed: 1.6 } : { clip: paint, t: t - 2, from: 6, speed: 1.5 }),
    clipR: (t) => ({ clip: paint, t: Math.max(0, t - 1.4), from: 4, speed: 1.25 }),
    left: glimBox, right: paintBox, picture: [1920, 3000], glowL: '#8a5cff', glowR: '#ff5d9a', height: 560,
    lines: [['Design your own Glim.', 0.3, 1.55], ['Shape it. Paint it. Wear it.', 2.05, 9, '#ffc233']],
  });

  /* ---- bar 26: the collection ---- */
  const E4 = new Group(), hud4 = new Group();
  const shelf = new Card({ w: 1700, h: 956, radius: 30, rim: 2, rimColor: '#7f8be0', glow: '#ffb31a', shadow: 0.7 });
  shelf.position.set(0, 70, -80);
  shelf.rotation.x = -0.12;
  shelf.show(collection, [0.195, 0.05, 1, 0.5]);
  E4.add(shelf);
  const cap4 = caption('Over 100 Glims to collect.', 0, -462, { size: 96 });
  hud4.add(cap4.group);
  const s4: Shot = {
    a: bar(26), b: bar(27), group: E4, hud: hud4,
    update(t) {
      film.energy = 0.6; film.warm = 0.5;
      const k = punch(t);
      // The picture is taller than the card: glide down it.
      const top = lerp(0.03, 0.34, ease.inOutSine(seg(t, 0, 2)));
      shelf.u.uCrop!.value = [0.195, top, 1, top + 0.4];
      cap4.show(t - 0.25);
      stage.view({ dolly: lerp(-40, 60, seg(t, 0, 2)) + k * 80, orbitY: lerp(0.05, -0.04, seg(t, 0, 2)) });
      stage.fx.uAberration.value = 0.0012 + k * 0.004;
    },
  };

  /* ---- bars 27 and 28: for the classroom ---- */
  const F1 = new Group(), hudF1 = new Group();
  const toolsCard = new Card({ w: 1040, h: 1040 * ((CROP.page[3] - CROP.page[1]) * 9) / ((CROP.page[2] - CROP.page[0]) * 16), radius: 26, rim: 2, rimColor: '#7f8be0', glow: '#3f6bff', shadow: 0.7 });
  toolsCard.position.set(-330, 90, 0);
  const reportCard = new Card({ w: 700, h: 700 * 1.0, radius: 26, rim: 2, rimColor: '#7f8be0', glow: '#22b8a0', shadow: 0.7 });
  reportCard.position.set(600, 60, 120);
  reportCard.show(report, [0.2, 0.08, 0.72, 1.0]);
  F1.add(toolsCard, reportCard);
  const capF1 = caption('Built for real classrooms.', 0, -462, { size: 96 });
  const capF2 = caption('Reports that show what to teach next.', 0, -462, { size: 88, color: '#ffc233' });
  hudF1.add(capF1.group, capF2.group);
  const sF1: Shot = {
    a: bar(27), b: bar(29), group: F1, hud: hudF1,
    update(t) {
      film.energy = 0.7; film.warm = 0.2;
      const a1 = ease.outCubic(seg(t, 0, 0.5)), a2 = ease.outBack(seg(t, 1.95, 2.5), 1.2);
      toolsCard.position.x = -330 - (1 - a1) * 2000;
      toolsCard.rotation.y = lerp(0.5, 0.1, a1);
      reportCard.position.y = 60 - (1 - a2) * 1300;
      reportCard.rotation.y = -0.14;
      reportCard.opacity = a2 > 0.01 ? 1 : 0;
      capF1.show(t - 0.3, 1.55);
      capF2.show(t - 2.05);
      stage.view({ dolly: lerp(-80, 60, ease.outCubic(seg(t, 0, 4))) + punch(t - 2) * 50, orbitY: lerp(-0.05, 0.04, seg(t, 0, 4)) });
      stage.fx.uBlur.value.set((1 - a1) * 0.1, 0);
      return [roll(picker, toolsCard, t, { from: 6, speed: 1.3, crop: CROP.page, hold: true })];
    },
  };

  /* ---- bars 29 and 30: three plain promises, one a bar ---- */
  const F2 = new Group(), hudF2 = new Group();
  const back = glow(2400, '#3a35c8', 0.55);
  back.position.z = -500;
  const hit = ring('#9aa6ff');
  F2.add(back, hit);
  const slams = ['No student emails.', 'No ads.', 'Nothing to buy.'].map((s, i) => {
    const m = text(s, { size: 230, italic: true, color: i === 2 ? '#ffc233' : '#ffffff', shadow: true });
    hudF2.add(m);
    return m;
  });
  const AT = [0, 1.0, 2.0];
  const sF2: Shot = {
    a: bar(29), b: bar(31), group: F2, hud: hudF2,
    update(t) {
      film.energy = 0.5 + 0.5 * seg(t, 2.6, 4); film.warm = 0.2 + 0.6 * seg(t, 2, 4);
      let k = 0;
      slams.forEach((m, i) => {
        const u = t - AT[i]!;
        const end = i < 2 ? AT[i + 1]! - AT[i]! : 1.25;
        const on = u >= 0 && u < end;
        m.visible = on;
        if (!on) return;
        const p = ease.outBack(seg(u, 0, 0.3), 2.0);
        m.scale.setScalar(lerp(1.5, 1, p) * (1 + 0.03 * u));
        m.material.opacity = clamp01(u / 0.08) * (1 - seg(u, end - 0.1, end));
        k = Math.max(k, punch(u, 8));
        hit.scale.setScalar(lerp(300, 2600, ease.outCubic(seg(u, 0, 0.7))));
        hit.material.uniforms.uP!.value = 1;
        hit.material.uniforms.uOpacity!.value = (1 - seg(u, 0.1, 0.7)) * 0.7;
      });
      const rush = ease.inQuart(seg(t, 3.2, 4.0));
      stage.view({ dolly: k * 110 + rush * 800, roll: Math.sin(t * 5) * 0.002 });
      stage.fx.uAberration.value = 0.0012 + k * 0.007;
      stage.fx.uZoomBlur.value = rush * 0.45;
      stage.fx.uFlash.value = ease.inCubic(seg(t, 3.72, 4.0));
      stage.bloom.strength = 0.4 + rush * 0.5;
    },
  };
  return [s0, s1, s2, s3, s4, sF1, sF2];
}
