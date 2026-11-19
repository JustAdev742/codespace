// Bars 42 to 44: everyone on stage in uniform, the name, and the line to leave with.
import { Group } from 'three';
import { Confetti, bar, cone, ease, glow, lerp, ring, seg, text } from '../engine.ts';
import { Actor, casting, floorLight } from '../cast.ts';
import { C, PAPER, UNIFORMS, line, logoTile, schoolPlate } from './kit.ts';
import type { Film, Shot } from '../film.ts';

const FLOOR = -400;

export async function end(film: Film): Promise<Shot[]> {
  const { stage } = film;
  const G = new Group(), hud = new Group();
  const wide = floorLight(1900, '#00a766', 0.36);
  wide.position.set(0, FLOOR, -100);
  const warm = floorLight(950, '#f6ecd2', 0.55);
  warm.position.set(0, FLOOR + 1, 0);
  const lamps = [cone(1800, '#f6ecd2', 0.26), cone(1800, '#5fdcaa', 0.24), cone(1800, '#f6ecd2', 0.3), cone(1800, '#5fdcaa', 0.24), cone(1800, '#f6ecd2', 0.26)];
  lamps.forEach((l, i) => { l.position.set(-1300 + i * 650, 800, -300); G.add(l); });
  const sun = glow(2600, '#f6ecd2', 0.16);
  sun.position.set(0, 200, -700);
  G.add(sun, wide, warm);

  // Three rows, the back ones higher on the picture so every face shows. Every uniform is on stage.
  const rows: [number, number, number, number][] = []; // x, z, scale, lift
  [[-960, -700, -440, -180, 80, 340, 600, 860], [-820, -540, -260, 20, 300, 580, 840], [-640, -330, 0, 330, 640]].forEach((xs, r) => xs.forEach((x) => rows.push([x, -330 + r * 190, 215 + r * 28, (2 - r) * 88])));
  const cast = ['glim-pebblet', 'glim-sprig', ...casting(rows.length - 2, 47)];
  const crowd = rows.map(([x, z, scale, lift], i) => {
    const a = new Actor(cast[(i * 7) % cast.length]!, scale, UNIFORMS[(i * 3) % UNIFORMS.length]!.id);
    const phase = (i * 0.37) % 1;
    a.path = (t) => {
      const u = ((t + phase) / 0.62) % 1;
      const jump = Math.sin(u * Math.PI);
      return { x, y: FLOOR + lift + jump * (70 + (i % 3) * 22), z, turn: Math.sin(t * 1.2 + i) * 0.22, squash: 1 - 0.1 * Math.max(0, 1 - u * 5) + 0.05 * jump };
    };
    for (let c = 0; c < 9; c++) a.cue(c * 1.1 + phase * 0.6, c % 2 === i % 2 ? 'celebrate' : 'cheer');
    G.add(a);
    return a;
  });
  await Promise.all(crowd.map((a) => a.glim.ready));
  const rain = new Confetti(520, 71, { rain: true, width: 3000, paper: PAPER });
  rain.position.z = 260;
  const burst = new Confetti(360, 73, { power: 2000, spread: 2.9, paper: PAPER });
  burst.position.set(0, 120, 100);
  G.add(rain, burst);

  const mark = new Group();
  const tile = logoTile(230);
  const name = text('Ludora', { size: 250, italic: true, color: '#ffffff', shadow: true, shadowColor: 'rgba(1,14,9,0.9)' });
  const total = 210 + 28 + name.w;
  tile.position.set(-total / 2 + 105, 4, 0);
  name.position.set(-total / 2 + 210 + 28 + name.w / 2, -6, 0);
  mark.add(tile, name);
  mark.position.y = 330;
  const said = line('All of this is new this term.', 0, 160, { size: 86, color: C.cream });
  const school = await schoolPlate(104);
  school.position.set(0, 40, 0);
  const wave = ring('#f6ecd2');
  wave.position.set(0, 330, -10);
  hud.add(wave, mark, said.group, school);

  const shot: Shot = {
    a: bar(42), b: bar(45), group: G, hud,
    update(t) {
      film.energy = 1; film.warm = 1;
      const land = ease.outBack(seg(t, 0, 0.5), 1.6);
      mark.scale.setScalar(0.4 + 0.6 * land);
      mark.visible = t >= 0;
      wave.scale.setScalar(lerp(200, 2400, ease.outCubic(seg(t, 0, 0.9))));
      wave.material.uniforms.uP!.value = 1;
      wave.material.uniforms.uOpacity!.value = (1 - seg(t, 0.1, 0.9)) * 0.7;
      said.show(t - 0.8);
      const s = ease.outBack(seg(t, 1.5, 1.95), 1.5);
      school.scale.setScalar(Math.max(0.001, s));
      school.visible = t > 1.5;
      for (const a of crowd) a.seek(t);
      burst.update(t, 5);
      rain.update(t - 0.3, 8);
      lamps.forEach((l, i) => { l.rotation.z = Math.sin(t * 1.1 + i * 1.3) * 0.34; });
      stage.view({ y: 30, dolly: lerp(-260, 60, ease.outCubic(seg(t, 0, 6))) + Math.exp(-t * 7) * 140, orbitY: Math.sin(t * 0.4) * 0.03, orbitX: 0.03 });
      stage.fx.uFlash.value = Math.exp(-t * 6) * 0.55;
      stage.bloom.strength = 0.42;
      // Out at the very end: the last second goes to black with the music.
      stage.fx.uFade.value = 1 - ease.inCubic(seg(t, 5.0, 5.95));
    },
  };
  return [shot];
}
