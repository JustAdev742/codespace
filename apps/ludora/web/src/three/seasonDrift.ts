import { AdditiveBlending, BufferAttribute, BufferGeometry, CanvasTexture, Color, type ColorRepresentation, NormalBlending, Points, PointsMaterial, type PerspectiveCamera, type Texture } from 'three';
import type { Decor, SeasonTheme } from '@ludora/content/seasons';
import { css } from './toon.ts';

/*
 * The season in a 3D scene: a light drift of confetti at New Year, blossom
 * petals in spring, leaves in autumn, glowing motes at Christmas and Lunar
 * New Year. The points ride with the camera, in a box in front of it, so the
 * same drift suits a mine shaft and a park alike, and never hides the
 * players. One draw call; none at all on low graphics or with reduced motion.
 */

type Style = { tex: 'petal' | 'square' | 'dot'; fall: number; glow: boolean; size: number; colours: (t: SeasonTheme) => ColorRepresentation[] };

const hsl = (h: number, s: number, l: number) => css(`hsl(${((h % 360) + 360) % 360} ${s}% ${l}%)`);

const STYLES: Partial<Record<Decor, Style>> = {
  confetti: { tex: 'square', fall: 0.9, glow: false, size: 0.13, colours: (t) => [hsl(t.hue, 90, 62), hsl(t.accentHue, 90, 60), '#ffffff', hsl(t.hue + 120, 85, 62)] },
  bunting: { tex: 'square', fall: 0.8, glow: false, size: 0.12, colours: (t) => [hsl(t.hue, 85, 55), hsl(t.accentHue, 90, 58), '#ffffff'] },
  blossoms: { tex: 'petal', fall: 0.45, glow: false, size: 0.16, colours: (t) => [hsl(t.hue, 70, 82), '#ffffff', hsl(t.hue + 20, 75, 76)] },
  eggs: { tex: 'petal', fall: 0.45, glow: false, size: 0.15, colours: (t) => [hsl(t.hue, 70, 80), hsl(t.accentHue, 65, 75), '#ffffff'] },
  leaves: { tex: 'petal', fall: 0.6, glow: false, size: 0.2, colours: () => [hsl(24, 85, 52), hsl(40, 90, 55), hsl(8, 75, 48)] },
  snow: { tex: 'dot', fall: 0.5, glow: false, size: 0.1, colours: () => ['#ffffff', '#e6eeff'] },
  rain: { tex: 'dot', fall: 2.6, glow: false, size: 0.06, colours: (t) => [hsl(t.hue, 70, 80), '#dfe9ff'] },
  lights: { tex: 'dot', fall: -0.18, glow: true, size: 0.16, colours: (t) => [hsl(t.hue, 95, 62), hsl(t.accentHue, 95, 58), hsl(50, 100, 62)] },
  lanterns: { tex: 'dot', fall: -0.25, glow: true, size: 0.2, colours: (t) => [hsl(t.hue, 90, 58), hsl(t.accentHue, 95, 60)] },
  stars: { tex: 'dot', fall: -0.1, glow: true, size: 0.12, colours: () => ['#ffffff', hsl(48, 100, 70)] },
  fireworks: { tex: 'dot', fall: -0.12, glow: true, size: 0.14, colours: (t) => [hsl(t.hue, 95, 70), hsl(t.accentHue, 100, 64), '#ffffff'] },
  sun: { tex: 'dot', fall: -0.08, glow: true, size: 0.1, colours: () => [hsl(46, 100, 70), '#fff4cf'] },
  bats: { tex: 'dot', fall: -0.15, glow: true, size: 0.12, colours: (t) => [hsl(t.hue, 95, 60), hsl(t.accentHue, 80, 70)] },
  books: { tex: 'square', fall: 0.6, glow: false, size: 0.12, colours: (t) => [hsl(t.hue, 80, 60), hsl(t.accentHue, 75, 62), '#ffffff'] },
};

const textures = new Map<Style['tex'], Texture>();

function texture(kind: Style['tex']): Texture {
  const hit = textures.get(kind);
  if (hit) return hit;
  const n = 64;
  const c = document.createElement('canvas');
  c.width = c.height = n;
  const g = c.getContext('2d')!;
  g.fillStyle = '#fff';
  if (kind === 'square') g.fillRect(n * 0.2, n * 0.32, n * 0.6, n * 0.36);
  else if (kind === 'petal') {
    g.beginPath();
    g.ellipse(n / 2, n / 2, n * 0.22, n * 0.38, Math.PI / 5, 0, Math.PI * 2);
    g.fill();
  } else {
    const grad = g.createRadialGradient(n / 2, n / 2, 0, n / 2, n / 2, n / 2);
    grad.addColorStop(0, 'rgba(255,255,255,1)');
    grad.addColorStop(0.45, 'rgba(255,255,255,0.8)');
    grad.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = grad;
    g.fillRect(0, 0, n, n);
  }
  const t = new CanvasTexture(c);
  textures.set(kind, t);
  return t;
}

/** The box in front of the camera that the drift fills, in camera space (metres). */
const BOX = { w: 14, h: 8, near: 2.5, far: 11 };

export class SeasonDrift {
  readonly points: Points;
  private style: Style;
  private pos: Float32Array;
  private phase: Float32Array;
  private count: number;

  constructor(theme: SeasonTheme, density: number) {
    this.style = STYLES[theme.decor[0]!] ?? STYLES.confetti!;
    this.count = Math.round(70 * density);
    this.pos = new Float32Array(this.count * 3);
    this.phase = new Float32Array(this.count);
    const colours = this.style.colours(theme).map((c) => new Color(c));
    const col = new Float32Array(this.count * 3);
    for (let i = 0; i < this.count; i++) {
      this.pos[i * 3] = (Math.random() - 0.5) * BOX.w;
      this.pos[i * 3 + 1] = (Math.random() - 0.5) * BOX.h;
      this.pos[i * 3 + 2] = -(BOX.near + Math.random() * (BOX.far - BOX.near));
      this.phase[i] = Math.random() * Math.PI * 2;
      const c = colours[i % colours.length]!;
      col.set([c.r, c.g, c.b], i * 3);
    }
    const geo = new BufferGeometry();
    geo.setAttribute('position', new BufferAttribute(this.pos, 3));
    geo.setAttribute('color', new BufferAttribute(col, 3));
    const mat = new PointsMaterial({
      size: this.style.size,
      map: texture(this.style.tex),
      vertexColors: true,
      transparent: true,
      opacity: this.style.glow ? 0.85 : 0.9,
      depthWrite: false,
      blending: this.style.glow ? AdditiveBlending : NormalBlending,
      sizeAttenuation: true,
      fog: false,
      alphaTest: this.style.glow ? 0 : 0.3,
    });
    this.points = new Points(geo, mat);
    this.points.name = 'season-drift';
    this.points.frustumCulled = false;
    this.points.renderOrder = 10;
  }

  attach(camera: PerspectiveCamera) {
    camera.add(this.points);
  }

  update(dt: number, t: number) {
    const { fall } = this.style;
    const half = BOX.h / 2;
    for (let i = 0; i < this.count; i++) {
      const p = this.phase[i]!;
      const k = i * 3;
      this.pos[k] = this.pos[k]! + Math.sin(t * 0.6 + p) * 0.25 * dt;
      this.pos[k + 1] = this.pos[k + 1]! - fall * (0.7 + (p % 1) * 0.6) * dt;
      if (this.pos[k + 1]! < -half) this.pos[k + 1] = half;
      else if (this.pos[k + 1]! > half) this.pos[k + 1] = -half;
    }
    (this.points.geometry.getAttribute('position') as BufferAttribute).needsUpdate = true;
  }

  dispose() {
    this.points.removeFromParent();
    this.points.geometry.dispose();
    (this.points.material as PointsMaterial).dispose();
  }
}
