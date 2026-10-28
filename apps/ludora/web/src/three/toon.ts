import {
  BackSide,
  Color,
  DataTexture,
  type Material,
  Mesh,
  MeshBasicMaterial,
  MeshToonMaterial,
  NearestFilter,
  type Object3D,
  RedFormat,
  type Texture,
} from 'three';

/*
 * The look of every 3D scene: Ludora's vinyl-toy style in three dimensions.
 * Hard cel shading in three steps (like the 2D Glims' shadow and light
 * crescents), and ink outlines drawn as an inverted shell. Materials are
 * cached by colour so a scene with a hundred crates still has a handful of
 * materials, which keeps draw setup cheap on school laptops.
 */

/** Colour from HSL in the same units the 2D art uses (degrees, percent). */
export function hsl(h: number, s: number, l: number): Color {
  return new Color().setHSL((((h % 360) + 360) % 360) / 360, Math.max(0, Math.min(100, s)) / 100, Math.max(0, Math.min(100, l)) / 100, 'srgb');
}

/**
 * A colour from a CSS string. Handles the space-separated `hsl(h s% l%)` the 2D art writes,
 * which three's own parser does not read.
 */
export function css(style: string): Color {
  const m = /^hsla?\(\s*(-?[\d.]+)(?:deg)?[\s,]+([\d.]+)%[\s,]+([\d.]+)%/.exec(style.trim());
  if (m) return hsl(Number(m[1]), Number(m[2]), Number(m[3]));
  return new Color(style);
}

let ramp: DataTexture | null = null;

/** Three hard steps of light: shadow, mid, lit. */
export function toonRamp(): DataTexture {
  if (ramp) return ramp;
  const data = new Uint8Array([96, 178, 255]);
  ramp = new DataTexture(data, data.length, 1, RedFormat);
  ramp.minFilter = NearestFilter;
  ramp.magFilter = NearestFilter;
  ramp.generateMipmaps = false;
  ramp.needsUpdate = true;
  return ramp;
}

const toonCache = new Map<string, MeshToonMaterial>();

export interface ToonOptions {
  /** Light of its own (lantern glass, screens, glowing cover pieces), 0..1. */
  glow?: number;
  map?: Texture | null;
  transparent?: boolean;
  opacity?: number;
  /** Do not share: the caller will change this material (fades, flashes). */
  unique?: boolean;
}

/** A cel-shaded material. Shared by colour unless `unique` or a map is given. */
export function toon(color: Color | string | number, opts: ToonOptions = {}): MeshToonMaterial {
  const c = color instanceof Color ? color : typeof color === 'string' ? css(color) : new Color(color);
  const key = `${c.getHexString()}|${opts.glow ?? 0}|${opts.opacity ?? 1}|${opts.transparent ? 1 : 0}`;
  if (!opts.unique && !opts.map) {
    const hit = toonCache.get(key);
    if (hit) return hit;
  }
  const m = new MeshToonMaterial({ color: c, gradientMap: toonRamp(), map: opts.map ?? null });
  if (opts.glow) {
    m.emissive = c.clone();
    m.emissiveIntensity = opts.glow;
  }
  if (opts.transparent || (opts.opacity ?? 1) < 1) {
    m.transparent = true;
    m.opacity = opts.opacity ?? 1;
    m.depthWrite = (opts.opacity ?? 1) >= 0.95;
  }
  if (!opts.unique && !opts.map) toonCache.set(key, m);
  return m;
}

const inkCache = new Map<string, MeshBasicMaterial>();

/**
 * The outline material: back faces pushed out along their normals by
 * `width` (in the mesh's own units), drawn flat in the ink colour.
 */
export function inkMaterial(color: Color | string | number, width: number): MeshBasicMaterial {
  const c = color instanceof Color ? color : typeof color === 'string' ? css(color) : new Color(color);
  const key = `${c.getHexString()}|${width}`;
  const hit = inkCache.get(key);
  if (hit) return hit;
  const m = new MeshBasicMaterial({ color: c, side: BackSide });
  m.onBeforeCompile = (shader) => {
    shader.uniforms.inkWidth = { value: width };
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nuniform float inkWidth;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\ntransformed += normalize(normal) * inkWidth;');
  };
  m.customProgramCacheKey = () => `ink${width}`;
  inkCache.set(key, m);
  return m;
}

/** Give a mesh an ink outline (a child shell sharing its geometry). Returns the shell. */
export function outline(mesh: Mesh, color: Color | string | number = '#141022', width = 0.02): Mesh {
  const shell = new Mesh(mesh.geometry, inkMaterial(color, width));
  shell.name = 'ink';
  shell.castShadow = false;
  shell.receiveShadow = false;
  shell.renderOrder = -1;
  mesh.add(shell);
  return shell;
}

/** Outline every mesh under `root` (skipping ones already outlined or marked `noInk`). */
export function outlineAll(root: Object3D, color: Color | string | number = '#141022', width = 0.02) {
  const meshes: Mesh[] = [];
  root.traverse((o) => {
    if (o instanceof Mesh && o.name !== 'ink' && !o.userData.noInk && !o.children.some((c) => c.name === 'ink')) meshes.push(o);
  });
  for (const m of meshes) outline(m, color, width);
}

/** Free a subtree's geometries, textures and unshared materials. Shared (cached) materials stay. */
export function disposeTree(root: Object3D) {
  const shared = new Set<Material>([...toonCache.values(), ...inkCache.values()]);
  root.traverse((o) => {
    if (!(o instanceof Mesh)) return;
    if (o.name !== 'ink' && !o.userData.sharedGeometry) o.geometry.dispose();
    const mats = Array.isArray(o.material) ? o.material : [o.material];
    for (const m of mats) {
      if (shared.has(m)) continue;
      for (const v of Object.values(m)) if (v && typeof v === 'object' && 'isTexture' in v && !(v as Texture).userData?.shared) (v as Texture).dispose();
      m.dispose();
    }
  });
}
