// Rendering: the chamber, bodies, and recursive views through a linked portal pair.
//
// Technique: render-to-texture with screen-space lookup. For a portal P with partner Q,
// a virtual camera V = T(P->Q) * camera sits behind Q looking out of it; its projection
// gets Lengyel's oblique near plane on Q's surface so nothing behind Q is drawn. The
// scene seen by V goes into a render target, and P's disc samples that target at
// gl_FragCoord / resolution, so the pixels line up exactly with the camera's view.
// Recursion (portals visible inside portal views) renders deeper levels first.

import * as THREE from 'three';
import { obliqueProjection, PORTAL_RADIUS } from './portal-math.js';

const PORTAL_TINT = { A: new THREE.Color(0x35ff6a), B: new THREE.Color(0x29d8ff) };

const gridVertex = /* glsl */`
varying vec3 vWorldPos;
varying vec3 vNormal;
void main() {
  vec4 wp = modelMatrix * vec4(position, 1.0);
  vWorldPos = wp.xyz;
  vNormal = normalize(mat3(modelMatrix) * normal);
  gl_Position = projectionMatrix * viewMatrix * wp;
}`;

const gridFragment = /* glsl */`
uniform vec3 baseColor;
uniform vec3 lineColor;
varying vec3 vWorldPos;
varying vec3 vNormal;
float gridLine(vec2 uv, float scale) {
  vec2 p = uv / scale;
  vec2 g = abs(fract(p - 0.5) - 0.5) / max(fwidth(p), vec2(1e-4));
  return 1.0 - min(min(g.x, g.y), 1.0);
}
void main() {
  vec3 n = normalize(vNormal);
  vec2 uv = abs(n.x) > 0.5 ? vWorldPos.zy : (abs(n.y) > 0.5 ? vWorldPos.xz : vWorldPos.xy);
  vec3 L = normalize(vec3(0.35, 0.9, 0.2));
  float diff = 0.58 + 0.42 * max(dot(n, L), 0.0);
  float face = abs(n.y) > 0.5 ? (n.y > 0.0 ? 1.0 : 0.78) : (abs(n.x) > 0.5 ? 0.88 : 0.95);
  vec3 col = baseColor * diff * face;
  float l1 = gridLine(uv, 1.0);
  float l4 = gridLine(uv, 4.0);
  col = mix(col, lineColor, max(l1 * 0.28, l4 * 0.55));
  gl_FragColor = vec4(col, 1.0);
  #include <colorspace_fragment>
}`;

const portalVertex = /* glsl */`
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}`;

const portalFragment = /* glsl */`
uniform sampler2D map;
uniform vec2 resolution;
uniform float hasView;
uniform float opaque;
uniform float time;
uniform float isCap;
uniform vec3 tint;
varying vec2 vUv;
float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float noise(vec2 p) {
  vec2 i = floor(p), f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash(i), hash(i + vec2(1, 0)), u.x), mix(hash(i + vec2(0, 1)), hash(i + vec2(1, 1)), u.x), u.y);
}
vec3 swirl(vec2 p) {
  float r = length(p);
  float a = atan(p.y, p.x);
  float w = a + 2.6 * r - time * 1.4;
  float n = noise(vec2(cos(w) * 2.0 + r * 3.0, sin(w) * 2.0 - time * 0.4)) * 0.6
          + noise(vec2(w * 1.7, r * 6.0 - time)) * 0.4;
  float bands = 0.5 + 0.5 * sin(6.0 * w + 4.0 * n);
  vec3 deep = tint * 0.08;
  vec3 bright = mix(tint, vec3(1.0), 0.35);
  return mix(deep, bright, clamp(0.25 + 0.75 * bands * (0.4 + 0.6 * n), 0.0, 1.0)) * (0.65 + 0.35 * (1.0 - r));
}
void main() {
  vec2 p = vUv * 2.0 - 1.0;
  float r = length(p);
  vec3 col;
  if (hasView > 0.5 && opaque < 0.5) {
    col = texture2D(map, gl_FragCoord.xy / resolution).rgb;
    if (isCap < 0.5) {
      float edge = smoothstep(0.84, 1.0, r);
      col = mix(col, swirl(p), edge);
    }
  } else {
    col = swirl(p);
  }
  gl_FragColor = vec4(col, 1.0);
  #include <colorspace_fragment>
}`;

export class PortalRenderer {
  constructor(canvas, world, { maxPixelRatio = 1.5, maxDepth = 3 } = {}) {
    this.world = world;
    this.canvas = canvas;
    this.maxDepth = maxDepth;
    this.opaque = false;
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, maxPixelRatio));
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x0e1116);
    this.camera = new THREE.PerspectiveCamera(75, 1, 0.03, 300);
    this.camera.layers.enable(0);
    this.camera.layers.enable(2);
    this.scene.add(new THREE.HemisphereLight(0xffffff, 0x556070, 2.2));
    const sun = new THREE.DirectionalLight(0xffffff, 1.6);
    sun.position.set(6, 12, 4);
    this.scene.add(sun);
    this.time = 0;
    this.stats = { renders: 0 };
    this.buildStatic();
    this.buildPortals();
    this.buildAvatar();
    this.bodyMeshes = new Map();
    this.previewRing = this.buildPreview();
    this.vcams = [];
    this.rts = [];
    this.frustum = new THREE.Frustum();
    this.projScreen = new THREE.Matrix4();
    this.resize();
  }

  // ------------------------------------------------------------------ scene
  buildStatic() {
    this.boxMeshes = new Map();
    for (const b of this.world.boxes) {
      const size = b.max.clone().sub(b.min);
      const geo = new THREE.BoxGeometry(size.x, size.y, size.z);
      const mat = new THREE.ShaderMaterial({
        vertexShader: gridVertex, fragmentShader: gridFragment,
        uniforms: {
          baseColor: { value: new THREE.Color(b.color ?? 0xd9d6cf) },
          lineColor: { value: new THREE.Color(b.portalable ? 0x7f8790 : 0x1a1d22) },
        },
      });
      const mesh = new THREE.Mesh(geo, mat);
      mesh.position.copy(b.min).add(b.max).multiplyScalar(0.5);
      mesh.userData.boxId = b.id;
      this.scene.add(mesh);
      this.boxMeshes.set(b.id, mesh);
    }
  }

  makePortalMaterial(which, isCap) {
    return new THREE.ShaderMaterial({
      vertexShader: portalVertex, fragmentShader: portalFragment,
      side: isCap ? THREE.BackSide : THREE.FrontSide,
      uniforms: {
        map: { value: null }, resolution: { value: new THREE.Vector2(1, 1) }, hasView: { value: 0 },
        opaque: { value: 0 }, time: { value: 0 }, isCap: { value: isCap ? 1 : 0 }, tint: { value: PORTAL_TINT[which].clone() },
      },
    });
  }

  buildPortals() {
    this.portalGroups = {};
    this.portalMats = {};
    const R = PORTAL_RADIUS;
    for (const which of ['A', 'B']) {
      const group = new THREE.Group();
      group.matrixAutoUpdate = false;
      const disc = new THREE.Mesh(new THREE.CircleGeometry(R, 72), this.makePortalMaterial(which, false));
      disc.position.z = 0.004;
      const depth = 0.45;
      const tubeGeo = new THREE.CylinderGeometry(R, R, depth, 72, 1, true);
      tubeGeo.rotateX(Math.PI / 2);
      tubeGeo.translate(0, 0, -depth / 2);
      const capMat = this.makePortalMaterial(which, true);
      const tube = new THREE.Mesh(tubeGeo, capMat);
      const back = new THREE.Mesh(new THREE.CircleGeometry(R, 72), capMat);
      back.position.z = -depth;
      back.material = capMat.clone();
      back.material.side = THREE.FrontSide;
      const rim = new THREE.Mesh(new THREE.RingGeometry(R, R + 0.07, 72),
        new THREE.MeshBasicMaterial({ color: PORTAL_TINT[which] }));
      rim.position.z = 0.005;
      group.add(disc, tube, back, rim);
      group.visible = false;
      this.scene.add(group);
      this.portalGroups[which] = group;
      this.portalMats[which] = [disc.material, capMat, back.material];
    }
  }

  buildAvatar() {
    const mat = new THREE.MeshStandardMaterial({ color: 0xff8a3d, roughness: 0.6 });
    const body = new THREE.Mesh(new THREE.CapsuleGeometry(0.3, 1.2, 6, 16), mat);
    body.position.y = 0.9;
    const visor = new THREE.Mesh(new THREE.BoxGeometry(0.36, 0.12, 0.12), new THREE.MeshStandardMaterial({ color: 0x1b2836 }));
    visor.position.set(0, 1.55, -0.26);
    this.avatar = new THREE.Group();
    this.avatar.add(body, visor);
    this.avatar.traverse((o) => o.layers.set(1));
    this.scene.add(this.avatar);
  }

  buildPreview() {
    const ring = new THREE.Mesh(new THREE.RingGeometry(PORTAL_RADIUS - 0.05, PORTAL_RADIUS, 64),
      new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.55, depthWrite: false }));
    ring.visible = false;
    ring.matrixAutoUpdate = false;
    ring.layers.set(2); // targeting overlay: main camera only, never inside portal views
    this.scene.add(ring);
    return ring;
  }

  bodyMesh(body) {
    let rec = this.bodyMeshes.get(body.id);
    if (!rec) {
      const hue = (this.bodyMeshes.size * 0.17) % 1;
      const color = body.color ?? new THREE.Color().setHSL(hue, 0.65, 0.55);
      const geo = new THREE.SphereGeometry(body.r, 28, 18);
      const mat = new THREE.MeshStandardMaterial({ color, roughness: 0.45, metalness: 0.1 });
      const main = new THREE.Mesh(geo, mat);
      const clone = new THREE.Mesh(geo, mat);
      clone.visible = false;
      this.scene.add(main, clone);
      rec = { main, clone };
      this.bodyMeshes.set(body.id, rec);
    }
    return rec;
  }

  // ------------------------------------------------------------------ sync
  resize() {
    const w = this.canvas.clientWidth || window.innerWidth;
    const h = this.canvas.clientHeight || window.innerHeight;
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    const size = this.renderer.getDrawingBufferSize(new THREE.Vector2());
    for (const level of this.rts) for (const k of ['A', 'B']) level?.[k]?.setSize(size.x, size.y);
    for (const which of ['A', 'B']) for (const m of this.portalMats[which]) m.uniforms.resolution.value.copy(size);
  }

  rt(level, which) {
    if (!this.rts[level]) this.rts[level] = {};
    if (!this.rts[level][which]) {
      const size = this.renderer.getDrawingBufferSize(new THREE.Vector2());
      this.rts[level][which] = new THREE.WebGLRenderTarget(size.x, size.y, { type: THREE.HalfFloatType });
    }
    return this.rts[level][which];
  }

  vcam(level, which) {
    if (!this.vcams[level]) this.vcams[level] = {};
    let c = this.vcams[level][which];
    if (!c) {
      c = new THREE.PerspectiveCamera();
      c.matrixAutoUpdate = false;
      c.matrixWorldAutoUpdate = false;
      c.layers.enable(0);
      c.layers.enable(1);
      this.vcams[level][which] = c;
    }
    return c;
  }

  syncFromWorld() {
    const w = this.world;
    const p = w.player;
    if (p) {
      const eye = w.eyeOf(p);
      this.camera.position.copy(eye);
      const q = new THREE.Quaternion().setFromEuler(new THREE.Euler(p.pitch, p.yaw, -p.roll, 'YXZ'));
      this.camera.quaternion.copy(q);
      this.avatar.position.copy(p.root);
      this.avatar.rotation.set(0, p.yaw, 0);
    }
    this.camera.updateMatrixWorld();
    for (const b of w.boxes) {
      if (!b.kinematic) continue;
      this.boxMeshes.get(b.id).position.copy(b.min).add(b.max).multiplyScalar(0.5);
    }
    for (const which of ['A', 'B']) {
      const portal = w.portals[which];
      const g = this.portalGroups[which];
      g.visible = !!portal;
      if (portal) {
        g.matrix.copy(portal.frame.matrix);
        g.matrixWorldNeedsUpdate = true;
      }
      for (const m of this.portalMats[which]) {
        m.uniforms.time.value = this.time;
        m.uniforms.opaque.value = this.opaque ? 1 : 0;
      }
    }
    const linked = w.linked();
    const seen = new Set();
    for (const b of w.bodies) {
      seen.add(b.id);
      const rec = this.bodyMesh(b);
      rec.main.position.copy(b.pos);
      rec.clone.visible = false;
      if (!linked) continue;
      for (const which of ['A', 'B']) {
        const P = w.portals[which].frame;
        const d = P.signedDistance(b.pos);
        if (d >= 0 && d < b.r && P.lateralSq(b.pos) < (w.portals[which].R + b.r) ** 2) {
          rec.clone.position.copy(b.pos).applyMatrix4(w.transform(which));
          rec.clone.visible = true;
        }
      }
    }
    for (const [id, rec] of this.bodyMeshes) {
      if (!seen.has(id)) {
        this.scene.remove(rec.main, rec.clone);
        this.bodyMeshes.delete(id);
      }
    }
  }

  setPreview(plan, okColor = 0x35ff6a) {
    const ring = this.previewRing;
    if (!plan || !plan.frame) { ring.visible = false; return; }
    ring.visible = true;
    ring.material.color.setHex(plan.ok ? okColor : 0xff4d4d);
    ring.matrix.copy(plan.frame.matrix).multiply(new THREE.Matrix4().makeTranslation(0, 0, 0.012));
    ring.matrixWorldNeedsUpdate = true;
  }

  // ------------------------------------------------------------------ portal views
  portalVisible(which, cam) {
    const portal = this.world.portals[which];
    const camPos = new THREE.Vector3().setFromMatrixPosition(cam.matrixWorld);
    if (portal.frame.signedDistance(camPos) <= 0) return false;
    this.projScreen.multiplyMatrices(cam.projectionMatrix, cam.matrixWorldInverse);
    this.frustum.setFromProjectionMatrix(this.projScreen);
    return this.frustum.intersectsSphere(new THREE.Sphere(portal.frame.center, portal.R * 1.05));
  }

  virtualCamera(cam, which, level) {
    const w = this.world;
    const other = w.partner(which);
    const v = this.vcam(level, which);
    v.matrixWorld.multiplyMatrices(w.transform(which), cam.matrixWorld);
    v.matrixWorldInverse.copy(v.matrixWorld).invert();
    const q = w.portals[other].frame;
    // clip plane 2 mm in front of the exit face (keeps its wall out of the view)
    const plane = new THREE.Plane().setFromNormalAndCoplanarPoint(q.normal, q.center.clone().addScaledVector(q.normal, 0.002));
    plane.applyMatrix4(v.matrixWorldInverse);
    const C = new THREE.Vector4(plane.normal.x, plane.normal.y, plane.normal.z, plane.constant);
    if (C.w >= 0) return null; // camera on the wrong side: degenerate view, skip
    v.projectionMatrix.copy(obliqueProjection(this.camera.projectionMatrix, C));
    v.projectionMatrixInverse.copy(v.projectionMatrix).invert();
    return v;
  }

  renderView(cam, level, hide, target) {
    const w = this.world;
    const keys = w.linked() ? ['A', 'B'] : [];
    const visible = keys.filter((k) => k !== hide && this.portalVisible(k, cam));
    const ready = new Set();
    if (level < this.maxDepth) {
      for (const k of visible) {
        const v = this.virtualCamera(cam, k, level + 1);
        if (!v) continue;
        this.renderView(v, level + 1, w.partner(k), this.rt(level + 1, k));
        ready.add(k);
      }
    }
    for (const k of ['A', 'B']) {
      const [disc, cap, back] = this.portalMats[k];
      const has = ready.has(k) ? 1 : 0;
      for (const m of [disc, cap, back]) {
        m.uniforms.hasView.value = has;
        if (has) m.uniforms.map.value = this.rt(level + 1, k).texture;
      }
    }
    if (hide) this.portalGroups[hide].visible = false;
    const avatarWasVisible = this.avatar.visible;
    this.renderer.setRenderTarget(target);
    this.renderer.render(this.scene, cam);
    this.stats.renders++;
    this.avatar.visible = avatarWasVisible;
    if (hide) this.portalGroups[hide].visible = true;
  }

  /** Test hook: render the current view off-screen and return the RGBA (0-255, linear) at a pixel. */
  probe(px, py) {
    const size = this.renderer.getDrawingBufferSize(new THREE.Vector2());
    if (!this._probeRT || this._probeRT.width !== size.x || this._probeRT.height !== size.y) {
      this._probeRT?.dispose();
      this._probeRT = new THREE.WebGLRenderTarget(size.x, size.y);
    }
    this.syncFromWorld();
    this.renderView(this.camera, 0, null, this._probeRT);
    const buf = new Uint8Array(4);
    this.renderer.readRenderTargetPixels(this._probeRT, Math.round(px), Math.round(size.y - 1 - py), 1, 1, buf);
    this.renderer.setRenderTarget(null);
    return Array.from(buf);
  }

  /** Screen position (drawing-buffer pixels, origin top-left) of a world point. */
  project(p) {
    this.syncFromWorld();
    const size = this.renderer.getDrawingBufferSize(new THREE.Vector2());
    const q = p.clone().project(this.camera);
    return { x: (q.x * 0.5 + 0.5) * size.x, y: (1 - (q.y * 0.5 + 0.5)) * size.y, z: q.z };
  }

  render(dt = 0) {
    if (this.animateSwirl !== false) this.time += dt;
    this.stats.renders = 0;
    this.syncFromWorld();
    this.renderView(this.camera, 0, null, null);
  }
}
