// Bars 31 to 34: everyone on stage, the name, and the line to leave with.
import { Group } from 'three';
import { Confetti, bar, cone, ease, glow, lerp, ring, seg, text, words, riseIn } from '../engine.ts';
import { Actor, casting, floorLight } from '../cast.ts';
import { logoTile, type Film, type Shot } from '../film.ts';

const FLOOR = -400;

export async function finale(film: Film): Promise<Shot[]> {
  const { stage } = film;
  const G = new Group(), hud = new Group();
  const wide = floorLight(1900, '#6a7bff', 0.42);
  wide.position.set(0, FLOOR, -100);
  const warm = floorLight(900, '#ffd98a', 0.6);
  warm.position.set(0, FLOOR + 1, 0);
  const lamps = [cone(1800, '#7a6cff', 0.3), cone(1800, '#ffc233', 0.26), cone(1800, '#3fd2ff', 0.26), cone(1800, '#ff5d9a', 0.22), cone(1800, '#7cf29a', 0.2)];
  lamps.forEach((l, i) => { l.position.set(-1300 + i * 650, 800, -300); G.add(l); });
  const sun = glow(2600, '#ffb31a', 0.2);
  sun.position.set(0, 200, -700);
  G.add(sun, wide, warm);

  // Three rows, the back ones higher on the picture so every face shows.
  const rows: [number, number, number, number][] = []; // x, z, scale, lift
  [[-960, -700, -440, -180, 80, 340, 600, 860], [-820, -540, -260, 20, 300, 580, 840], [-640, -330, 0, 330, 640]].forEach((xs, r) => xs.forEach((x) => rows.push([x, -330 + r * 190, 215 + r * 28, (2 - r) * 88])));
  const cast = ['glim-pebblet', 'glim-sprig', ...casting(rows.length - 2, 91)];
  const crowd = rows.map(([x, z, scale, lift], i) => {
    const a = new Actor(cast[(i * 7) % cast.length]!, scale);
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
  const rain = new Confetti(520, 71, { rain: true, width: 3000 });
  rain.position.z = 260;
  const burst = new Confetti(360, 73, { power: 2000, spread: 2.9 });
  burst.position.set(0, 120, 100);
  G.add(rain, burst);

  const mark = new Group();
  const tile = logoTile(250);
  const name = text('Ludora', { size: 272, italic: true, color: '#ffffff', shadow: true });
  const total = 228 + 30 + name.w;
  tile.position.set(-total / 2 + 114, 4, 0);
  name.position.set(-total / 2 + 228 + 30 + name.w / 2, -6, 0);
  mark.add(tile, name);
  mark.position.y = 290;
  const line = words('Turn any lesson into game night.', { size: 92, italic: true, color: '#ffc233', shadow: true });
  line.group.position.y = 112;
  const wave = ring('#ffd76a');
  wave.position.set(0, 290, -10);
  hud.add(wave, mark, line.group);

  const shot: Shot = {
    a: bar(31), b: bar(35), group: G, hud,
    update(t) {
      film.energy = 1; film.warm = 1;
      for (const a of crowd) a.seek(t);
      lamps.forEach((l, i) => { l.rotation.z = Math.sin(t * 1.9 + i * 1.4) * 0.5 + (i - 2) * -0.14; });
      rain.update(t - 0.1, 9);
      burst.update(t - 0.02);
      const pop = ease.outBack(seg(t, 0, 0.45), 1.8);
      mark.scale.setScalar(lerp(1.6, 1, pop) * (1 + 0.03 * seg(t, 0.4, 8)));
      wave.scale.setScalar(lerp(200, 3200, ease.outCubic(seg(t, 0, 0.9))));
      wave.material.uniforms.uP!.value = 1;
      wave.material.uniforms.uOpacity!.value = 1 - seg(t, 0.15, 0.9);
      riseIn(line.items, t - 1.0, { each: 0.07 });
      sun.material.opacity = 0.8 + 0.2 * Math.sin(t * 6);
      stage.view({ y: 40, lookY: -40, dolly: lerp(160, -120, ease.outCubic(seg(t, 0, 8))), orbitX: 0.1, orbitY: Math.sin(t * 0.4) * 0.05 });
      stage.fx.uFlash.value = 1 - ease.outCubic(seg(t, 0, 0.36));
      stage.fx.uZoomBlur.value = (1 - ease.outCubic(seg(t, 0, 0.3))) * 0.3;
      stage.fx.uAberration.value = 0.0012 + (1 - seg(t, 0, 0.5)) * 0.006;
      stage.fx.uFade.value = 1 - ease.inOutSine(seg(t, 6.6, 7.85));
      stage.bloom.strength = 0.4 + (1 - seg(t, 0, 0.6)) * 0.4;
    },
  };
  return [shot];
}
