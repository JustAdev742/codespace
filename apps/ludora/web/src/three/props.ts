import {
  BoxGeometry,
  CanvasTexture,
  Color,
  ConeGeometry,
  CylinderGeometry,
  DodecahedronGeometry,
  Group,
  IcosahedronGeometry,
  Mesh,
  MeshBasicMaterial,
  type Object3D,
  OctahedronGeometry,
  PlaneGeometry,
  ShaderMaterial,
  SRGBColorSpace,
  TorusGeometry,
} from 'three';
import { css, outline, toon } from './toon.ts';

/*
 * A small kit of props for building scenes, all made in code in Ludora's toy
 * style: chunky, rounded, cel-shaded, a few flat colours each. Geometries are
 * shared between copies, and materials come from the toon cache, so a scene
 * can scatter a hundred trees without a hundred materials.
 *
 * Every prop stands on y = 0 at its origin and is about life-size in metres.
 * `ink` adds outlines (pass the scene's quality.outlines).
 */

const geo = {
  trunk: new CylinderGeometry(0.12, 0.18, 1, 7).translate(0, 0.5, 0),
  ball: new IcosahedronGeometry(1, 1),
  cone: new ConeGeometry(1, 1, 7).translate(0, 0.5, 0),
  box: new BoxGeometry(1, 1, 1).translate(0, 0.5, 0),
  rock: new DodecahedronGeometry(1, 0),
  barrel: new CylinderGeometry(0.42, 0.42, 1, 12).translate(0, 0.5, 0),
  hoop: new TorusGeometry(0.43, 0.035, 5, 16).rotateX(Math.PI / 2),
  post: new CylinderGeometry(0.06, 0.07, 1, 6).translate(0, 0.5, 0),
  plank: new BoxGeometry(1, 0.08, 0.3),
  lanternBody: new CylinderGeometry(0.22, 0.26, 0.5, 6).translate(0, 0.25, 0),
  lanternCap: new ConeGeometry(0.3, 0.18, 6).translate(0, 0.09, 0),
  nugget: new IcosahedronGeometry(0.12, 0).scale(1.2, 0.8, 1),
  gem: new OctahedronGeometry(0.12, 0).scale(1, 1.4, 1),
  coin: new CylinderGeometry(0.12, 0.12, 0.03, 16).rotateX(Math.PI / 2),
  plane: new PlaneGeometry(1, 1).rotateX(-Math.PI / 2),
};
for (const g of Object.values(geo)) g.computeBoundingSphere();

function mesh(g: (typeof geo)[keyof typeof geo], color: string | Color, opts: { glow?: number; shadow?: boolean } = {}): Mesh {
  const m = new Mesh(g, toon(color, { glow: opts.glow ?? 0 }));
  m.userData.sharedGeometry = true;
  m.castShadow = opts.shadow ?? true;
  m.receiveShadow = true;
  return m;
}

function inked<T extends Object3D>(root: T, ink: boolean, width = 0.025): T {
  if (!ink) return root;
  root.traverse((o) => {
    if (o instanceof Mesh && o.name !== 'ink' && !o.userData.noInk) outline(o, '#1a1426', width);
  });
  return root;
}

/** A tiny seeded random, so a scene built twice looks the same. */
export function seeded(seed: number) {
  let s = seed >>> 0 || 1;
  return () => {
    s ^= s << 13;
    s ^= s >>> 17;
    s ^= s << 5;
    return ((s >>> 0) % 100000) / 100000;
  };
}

export type TreeKind = 'round' | 'pine' | 'gum' | 'palm';

/** A tree. Gum trees are tall and pale-trunked with open, olive canopies. */
export function tree(kind: TreeKind = 'round', o: { scale?: number; ink?: boolean; hue?: number } = {}): Group {
  const g = new Group();
  const s = o.scale ?? 1;
  if (kind === 'pine') {
    const t = mesh(geo.trunk, '#7a4f2e');
    t.scale.set(1, 0.6, 1);
    g.add(t);
    for (let i = 0; i < 3; i++) {
      const c = mesh(geo.cone, css(`hsl(${o.hue ?? 140} 45% ${30 + i * 5}%)`));
      c.scale.set(0.95 - i * 0.22, 1.1, 0.95 - i * 0.22);
      c.position.y = 0.5 + i * 0.65;
      g.add(c);
    }
  } else if (kind === 'gum') {
    const t = mesh(geo.trunk, '#d9d2c3');
    t.scale.set(0.9, 2.4, 0.9);
    g.add(t);
    const leaves = css(`hsl(${o.hue ?? 95} 25% 45%)`);
    for (const [x, y, z, r] of [
      [0, 2.6, 0, 0.9],
      [0.6, 2.2, 0.2, 0.6],
      [-0.5, 2.3, -0.3, 0.65],
      [0.1, 3.1, -0.2, 0.55],
    ] as const) {
      const b = mesh(geo.ball, leaves);
      b.scale.set(r * 1.2, r * 0.7, r * 1.2);
      b.position.set(x, y, z);
      g.add(b);
    }
  } else if (kind === 'palm') {
    const t = mesh(geo.trunk, '#a07a4a');
    t.scale.set(0.8, 2.6, 0.8);
    t.rotation.z = 0.12;
    g.add(t);
    for (let i = 0; i < 6; i++) {
      const leaf = mesh(geo.cone, '#3aa65a');
      leaf.scale.set(0.18, 1.3, 0.5);
      leaf.position.set(0.3, 2.55, 0);
      leaf.rotation.set(0, (i / 6) * Math.PI * 2, 1.9);
      g.add(leaf);
    }
  } else {
    const t = mesh(geo.trunk, '#7a4f2e');
    t.scale.set(1, 0.9, 1);
    g.add(t);
    const leaves = css(`hsl(${o.hue ?? 110} 50% 42%)`);
    const b = mesh(geo.ball, leaves);
    b.scale.set(0.95, 0.85, 0.95);
    b.position.y = 1.55;
    g.add(b);
    const b2 = mesh(geo.ball, css(`hsl(${o.hue ?? 110} 52% 48%)`));
    b2.scale.setScalar(0.55);
    b2.position.set(0.45, 1.95, 0.2);
    g.add(b2);
  }
  g.scale.setScalar(s);
  return inked(g, Boolean(o.ink));
}

export function bush(o: { scale?: number; ink?: boolean; color?: string } = {}): Group {
  const g = new Group();
  const c = o.color ?? '#4f9d3a';
  for (const [x, z, r] of [
    [0, 0, 0.55],
    [0.45, 0.1, 0.4],
    [-0.4, -0.05, 0.42],
  ] as const) {
    const b = mesh(geo.ball, c);
    b.scale.set(r, r * 0.8, r);
    b.position.set(x, r * 0.6, z);
    g.add(b);
  }
  g.scale.setScalar(o.scale ?? 1);
  return inked(g, Boolean(o.ink));
}

export function rock(o: { scale?: number; ink?: boolean; color?: string; seed?: number } = {}): Mesh {
  const r = mesh(geo.rock, o.color ?? '#8d8a9a');
  const rnd = seeded(o.seed ?? 7);
  const s = o.scale ?? 0.5;
  r.scale.set(s * (0.8 + rnd() * 0.5), s * (0.55 + rnd() * 0.3), s * (0.8 + rnd() * 0.5));
  r.rotation.y = rnd() * Math.PI;
  r.position.y = r.scale.y * 0.5;
  return inked(r, Boolean(o.ink));
}

export function crate(o: { size?: number; ink?: boolean; color?: string } = {}): Group {
  const g = new Group();
  const s = o.size ?? 0.8;
  const body = mesh(geo.box, o.color ?? '#c48a4a');
  body.scale.setScalar(s);
  g.add(body);
  const band = toon('#8a5a2c');
  for (const y of [0.15, 0.85]) {
    const b = new Mesh(geo.box, band);
    b.userData.sharedGeometry = true;
    b.scale.set(s * 1.02, s * 0.1, s * 1.02);
    b.position.y = s * y - s * 0.05;
    g.add(b);
  }
  return inked(g, Boolean(o.ink));
}

export function barrel(o: { ink?: boolean; color?: string } = {}): Group {
  const g = new Group();
  const b = mesh(geo.barrel, o.color ?? '#9a6234');
  b.scale.set(1, 0.95, 1);
  g.add(b);
  for (const y of [0.18, 0.78]) {
    const h = mesh(geo.hoop, '#4a4458', { shadow: false });
    h.position.y = y;
    g.add(h);
  }
  return inked(g, Boolean(o.ink));
}

/** Ludora's paper lantern: the signature light. `lit` makes it glow. */
export function lantern(o: { hue?: number; lit?: boolean; ink?: boolean; scale?: number } = {}): Group {
  const g = new Group();
  const hue = o.hue ?? 42;
  const body = mesh(geo.lanternBody, css(`hsl(${hue} 95% ${o.lit === false ? 45 : 60}%)`), { glow: o.lit === false ? 0 : 0.85 });
  g.add(body);
  const cap = mesh(geo.lanternCap, '#3a2a40');
  cap.position.y = 0.5;
  g.add(cap);
  const base = mesh(geo.lanternCap, '#3a2a40');
  base.rotation.x = Math.PI;
  base.position.y = 0.02;
  base.scale.set(0.8, 0.5, 0.8);
  g.add(base);
  g.scale.setScalar(o.scale ?? 1);
  return inked(g, Boolean(o.ink), 0.02);
}

export function lampPost(o: { hue?: number; ink?: boolean; height?: number } = {}): Group {
  const g = new Group();
  const h = o.height ?? 3;
  const p = mesh(geo.post, '#2e2a3a');
  p.scale.set(1, h, 1);
  g.add(p);
  const l = lantern({ hue: o.hue ?? 44, scale: 0.8 });
  l.position.y = h;
  g.add(l);
  return inked(g, Boolean(o.ink), 0.02);
}

export function fence(length: number, o: { ink?: boolean; color?: string } = {}): Group {
  const g = new Group();
  const c = o.color ?? '#b98a5a';
  const n = Math.max(2, Math.round(length / 1.2) + 1);
  for (let i = 0; i < n; i++) {
    const p = mesh(geo.post, c);
    p.scale.set(1.3, 0.9, 1.3);
    p.position.x = -length / 2 + (i / (n - 1)) * length;
    g.add(p);
  }
  for (const y of [0.35, 0.7]) {
    const r = mesh(geo.plank, c);
    r.scale.set(length, 0.8, 0.35);
    r.position.y = y;
    g.add(r);
  }
  return inked(g, Boolean(o.ink), 0.015);
}

/** A canvas tent with poles, as on a goldfield or a market. */
export function tent(o: { color?: string; ink?: boolean; scale?: number } = {}): Group {
  const g = new Group();
  const c = o.color ?? '#e9dcc0';
  const body = new Mesh(new CylinderGeometry(0, 1.2, 1.3, 4, 1).rotateY(Math.PI / 4).translate(0, 0.65, 0), toon(c));
  body.scale.set(1, 1, 1.5);
  body.castShadow = true;
  g.add(body);
  const door = new Mesh(new PlaneGeometry(0.5, 0.75).translate(0, 0.37, 0), toon('#3a2a2a'));
  door.position.set(0, 0, 0.9);
  door.rotation.x = -0.36;
  door.userData.noInk = true;
  g.add(door);
  g.scale.setScalar(o.scale ?? 1);
  return inked(g, Boolean(o.ink), 0.02);
}

export function nugget(o: { color?: string; ink?: boolean; scale?: number } = {}): Mesh {
  const m = mesh(geo.nugget, o.color ?? '#ffcc33', { glow: 0.25 });
  m.scale.setScalar(o.scale ?? 1);
  return inked(m, Boolean(o.ink), 0.012);
}

export function gem(o: { color?: string; ink?: boolean; scale?: number } = {}): Mesh {
  const m = mesh(geo.gem, o.color ?? '#5ad1ff', { glow: 0.35 });
  m.scale.setScalar(o.scale ?? 1);
  return inked(m, Boolean(o.ink), 0.012);
}

export function coin(o: { ink?: boolean; scale?: number } = {}): Mesh {
  const m = mesh(geo.coin, '#ffcf3f', { glow: 0.2 });
  m.scale.setScalar(o.scale ?? 1);
  return inked(m, Boolean(o.ink), 0.01);
}

/** A flat ground in one colour, receiving shadows. */
export function ground(width: number, depth: number, color = '#6fae4f'): Mesh {
  const m = new Mesh(geo.plane, toon(color));
  m.userData.sharedGeometry = true;
  m.scale.set(width, 1, depth);
  m.receiveShadow = true;
  return m;
}

/** A sign with words on it, drawn on a canvas. */
export function sign(text: string, o: { width?: number; color?: string; ink?: boolean; post?: boolean } = {}): Group {
  const g = new Group();
  const w = o.width ?? 1.6;
  const c = document.createElement('canvas');
  c.width = 512;
  c.height = 160;
  const x = c.getContext('2d')!;
  x.fillStyle = o.color ?? '#f6e7c8';
  x.fillRect(0, 0, 512, 160);
  x.fillStyle = '#2a1c14';
  x.font = '800 78px "Barlow Condensed", system-ui, sans-serif';
  x.textAlign = 'center';
  x.textBaseline = 'middle';
  x.fillText(text, 256, 84, 480);
  const tex = new CanvasTexture(c);
  tex.colorSpace = SRGBColorSpace;
  const board = new Mesh(new BoxGeometry(w, w * 0.32, 0.06), [toon('#8a5a2c'), toon('#8a5a2c'), toon('#8a5a2c'), toon('#8a5a2c'), toon('#ffffff', { map: tex }), toon('#8a5a2c')]);
  board.position.y = o.post === false ? 0 : 1.4;
  board.castShadow = true;
  g.add(board);
  if (o.post !== false) {
    const p = mesh(geo.post, '#6a4426');
    p.scale.set(1.2, 1.25, 1.2);
    g.add(p);
  }
  return inked(g, Boolean(o.ink), 0.015);
}

/**
 * Moving water: a plane whose vertices ripple, shaded in two bands with a
 * lighter crest, under the scene's fog. `time` is advanced by the scene.
 */
export function water(width: number, depth: number, o: { color?: string; deep?: string; segments?: number; calm?: boolean } = {}): Mesh & { time: (t: number) => void } {
  const seg = o.segments ?? 48;
  const g = new PlaneGeometry(width, depth, seg, Math.max(4, Math.round((seg * depth) / width))).rotateX(-Math.PI / 2);
  const mat = new ShaderMaterial({
    uniforms: {
      uTime: { value: 0 },
      uColor: { value: new Color(o.color ?? '#2fa6d6') },
      uDeep: { value: new Color(o.deep ?? '#1a5d9a') },
      uAmp: { value: o.calm ? 0.02 : 0.07 },
      fogColor: { value: new Color() },
      fogNear: { value: 1 },
      fogFar: { value: 1000 },
    },
    fog: true,
    vertexShader: /* glsl */ `
      uniform float uTime; uniform float uAmp;
      varying float vWave; varying vec2 vXZ;
      #include <fog_pars_vertex>
      void main() {
        vec3 p = position;
        float w = sin(p.x * 0.9 + uTime * 1.3) * 0.5 + sin(p.z * 1.3 - uTime * 1.1) * 0.35 + sin((p.x + p.z) * 2.1 + uTime * 2.0) * 0.15;
        p.y += w * uAmp;
        vWave = w; vXZ = p.xz;
        vec4 mvPosition = modelViewMatrix * vec4(p, 1.0);
        gl_Position = projectionMatrix * mvPosition;
        #include <fog_vertex>
      }`,
    fragmentShader: /* glsl */ `
      uniform vec3 uColor; uniform vec3 uDeep; uniform float uTime;
      varying float vWave; varying vec2 vXZ;
      #include <fog_pars_fragment>
      void main() {
        vec3 c = vWave > 0.15 ? uColor : mix(uDeep, uColor, 0.55);
        float glint = step(0.985, sin(vXZ.x * 3.0 + uTime) * sin(vXZ.y * 2.6 - uTime * 0.8));
        c = mix(c, vec3(1.0), glint * 0.6 + step(0.62, vWave) * 0.25);
        gl_FragColor = vec4(c, 1.0);
        #include <colorspace_fragment>
        #include <fog_fragment>
      }`,
  });
  const m = new Mesh(g, mat) as unknown as Mesh & { time: (t: number) => void };
  m.receiveShadow = false;
  m.time = (t: number) => {
    mat.uniforms.uTime!.value = t;
  };
  return m;
}

/** A soft round shadow on the ground, for things that do not cast real ones. */
export function blobShadow(radius: number): Mesh {
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const x = c.getContext('2d')!;
  const grad = x.createRadialGradient(32, 32, 0, 32, 32, 32);
  grad.addColorStop(0, 'rgba(0,0,0,0.5)');
  grad.addColorStop(1, 'rgba(0,0,0,0)');
  x.fillStyle = grad;
  x.fillRect(0, 0, 64, 64);
  const m = new Mesh(geo.plane, new MeshBasicMaterial({ map: new CanvasTexture(c), transparent: true, depthWrite: false }));
  m.userData.sharedGeometry = true;
  m.scale.set(radius * 2, 1, radius * 2);
  m.position.y = 0.01;
  return m;
}

/** Bunting: a string of little flags between two points (in a scene's own units). */
export function bunting(length: number, o: { colors?: string[]; sag?: number } = {}): Group {
  const g = new Group();
  const colors = o.colors ?? ['#ff4d6a', '#ffc233', '#1fd38f', '#3d9bff', '#c86bff'];
  const n = Math.max(3, Math.round(length / 0.5));
  const flag = new ConeGeometry(0.14, 0.3, 3).rotateX(Math.PI).translate(0, -0.15, 0);
  for (let i = 0; i < n; i++) {
    const t = i / (n - 1);
    const f = new Mesh(flag, toon(colors[i % colors.length]!));
    f.position.set(-length / 2 + t * length, -Math.sin(t * Math.PI) * (o.sag ?? 0.4), 0);
    f.rotation.y = Math.PI / 6;
    g.add(f);
  }
  return g;
}

