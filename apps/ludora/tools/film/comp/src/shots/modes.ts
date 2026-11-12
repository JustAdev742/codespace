// Bars 12 to 17: thirty game modes, and ten of them in 3D, one a second.
import { CanvasTexture, Group, Mesh, MeshBasicMaterial, PlaneGeometry, SRGBColorSpace } from 'three';
import { Card, Clip, H, W, bar, ease, glow, lerp, scrim, seg } from '../engine.ts';
import { caption, nameTag, punch, roll } from './kit.ts';
import type { Film, Shot } from '../film.ts';

const REEL: [string, string, string | null, number][] = [
  // clip, name, chip, first frame
  ['3d-summit', 'Summit Scramble', '3D', 12],
  ['3d-rally', 'Lantern Rally', '3D', 20],
  ['3d-spotkick', 'Spot Kick', '3D', 30],
  ['3d-tower', 'Tower Together', '3D', 10],
  ['3d-garden', 'Glim Garden', '3D', 10],
  ['3d-gold', 'Gold Rush', '3D', 10],
  ['3d-glowtag', 'Glow Tag Royale', '3D', 10],
  ['3d-catch', 'Big Catch', '3D', 10],
  ['3d-city', 'Code Breakers', '3D', 10],
  ['3d-made', 'The one you make', 'YOURS', 10],
];

/** A number that counts up, redrawn each frame on one small canvas. */
function counter(size: number, color: string) {
  const c = document.createElement('canvas');
  c.width = 1400; c.height = Math.round(size * 2.6);
  const ctx = c.getContext('2d')!;
  const tex = new CanvasTexture(c);
  tex.colorSpace = SRGBColorSpace;
  const mesh = new Mesh(new PlaneGeometry(c.width / 2, c.height / 2), new MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false }));
  mesh.renderOrder = 20;
  let shown = -1;
  return {
    mesh,
    set(n: number) {
      if (n === shown) return;
      shown = n;
      ctx.clearRect(0, 0, c.width, c.height);
      ctx.font = `italic 800 ${size * 2}px "Barlow Condensed"`;
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.shadowColor = 'rgba(255,170,20,0.55)'; ctx.shadowBlur = 60;
      ctx.fillStyle = color;
      ctx.fillText(String(n), c.width / 2, c.height / 2 + size * 0.1);
      tex.needsUpdate = true;
    },
  };
}

export async function modes(film: Film): Promise<Shot[]> {
  const { stage } = film;
  const scroll = await new Clip('modes-scroll').init();
  const clips = await Promise.all(REEL.map(([n]) => new Clip(n).init()));

  /* ---- bar 12: the number ---- */
  const D1 = new Group(), hud1 = new Group();
  const wall = new Card({ w: 2500, h: 1406, radius: 40, shadow: 0 });
  wall.position.set(120, -60, -520);
  wall.rotation.set(-0.5, 0.22, -0.1);
  const lift = glow(2400, '#ffae1a', 0.5);
  lift.position.set(0, 60, -200);
  D1.add(wall, lift);
  const num = counter(430, '#ffc233');
  num.mesh.position.set(0, 110, 0);
  const sub = caption('game modes', 0, -190, { size: 190 });
  const more = caption('Races. Builds. Heists. Tag. Every one plays differently.', 0, -372, { size: 54, font: 'sans', weight: 700, italic: false, color: '#d5dbff' });
  const shade = scrim(1500, 760, 0.72);
  shade.position.set(0, -60, -2);
  hud1.add(shade, num.mesh, sub.group, more.group);
  const s1: Shot = {
    a: bar(12), b: bar(13), group: D1, hud: hud1,
    update(t) {
      film.energy = 1; film.warm = 0.5;
      const k = punch(t, 7);
      num.set(Math.round(lerp(1, 30, ease.outCubic(seg(t, 0.02, 0.62)))));
      const land = ease.outBack(seg(t, 0, 0.45), 2.2);
      num.mesh.scale.setScalar(lerp(1.6, 1, land) * (1 + 0.08 * punch(t - 0.62, 10)));
      sub.show(t - 0.5);
      more.show(t - 0.95);
      wall.u.uBright!.value = 0.62;
      shade.material.uniforms.uOpacity!.value = 0.72 * seg(t, 0.0, 0.4);
      wall.position.y = -60 + t * 60;
      stage.view({ dolly: lerp(-100, 60, ease.outCubic(seg(t, 0, 2))) + k * 110, orbitY: lerp(-0.04, 0.04, seg(t, 0, 2)) });
      stage.fx.uFlash.value = 1 - ease.outCubic(seg(t, 0, 0.32));
      stage.fx.uZoomBlur.value = (1 - ease.outCubic(seg(t, 0, 0.3))) * 0.28;
      stage.fx.uAberration.value = 0.0012 + k * 0.005;
      stage.bloom.strength = 0.45;
      return [roll(scroll, wall, t, { from: 20, speed: 2.2 })];
    },
  };

  /* ---- bars 13 to 17: ten games, one a second ---- */
  const D2 = new Group(), hud2 = new Group();
  const frames = REEL.map(() => { const c = new Card({ w: W, h: H, radius: 0, shadow: 0 }); D2.add(c); return c; });
  const tags = REEL.map(([, name, chip]) => { const g = nameTag(name, chip); g.position.set(-880, -392, 0); hud2.add(g); return g; });
  const head = caption('10 of them in full 3D', -880, 440, { align: 'left', size: 66 });
  hud2.add(head.group);
  const s2: Shot = {
    a: bar(13), b: bar(18), group: D2, hud: hud2,
    update(t) {
      film.energy = 1;
      const i = Math.min(REEL.length - 1, Math.floor(t));
      const u = t - i;
      const waits: Promise<unknown>[] = [];
      frames.forEach((c, j) => { c.visible = j === i; });
      tags.forEach((g, j) => { g.visible = j === i; });
      const c = frames[i]!;
      const push = lerp(1.03, 1.1, u);
      c.scale.set(push, push, 1);
      c.u.uBright!.value = 1 + punch(u, 14) * 0.18;
      waits.push(roll(clips[i]!, c, u, { from: REEL[i]![3], speed: 1.6 }));
      const tag = tags[i]!;
      const inn = ease.outBack(seg(u, 0.03, 0.3), 1.4);
      tag.position.x = -880 - (1 - inn) * 700;
      tag.scale.setScalar(1);
      head.show(t - 0.2);
      stage.fx.uFlash.value = punch(u, 22) * 0.1;
      stage.fx.uAberration.value = 0.0012 + punch(u, 10) * 0.006;
      stage.fx.uVignette.value = 0.5;
      // The last one slows and falls away as the music drops out.
      if (i === REEL.length - 1) {
        const fall = ease.inCubic(seg(u, 0.55, 1.0));
        stage.fx.uFade.value = 1 - fall;
        stage.fx.uZoomBlur.value = fall * 0.2;
      }
      return waits;
    },
  };
  return [s1, s2];
}
