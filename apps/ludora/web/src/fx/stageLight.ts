/*
 * Stage light: the big screen's floodlights as light, where the device can draw it (D62). Two beams
 * lean in from above the stage with dust turning slowly in them, and a low haze lies on the floor.
 * It is the Floodlights backdrop's own picture (game/Backdrop.tsx) drawn by the graphics chip in
 * place of its two flat beams, so it shows where a backdrop shows: in the lobby and between
 * questions, never behind a question.
 *
 * Fetched on its own and only for a board that will draw it. It is drawn at half size, at most 30
 * times a second, and not at all while it is faded out or the tab is hidden. It is never brighter
 * than the flat beams it replaces (`GAIN`), so white text on the stage keeps its contrast. If the
 * browser has no WebGL, loses it, or frames turn slow, `start` says so and the flat beams stay.
 */

/** How bright the light may be: the shader holds a beam to 1.1 of this, the flat beams' own 22% of #9db7ff. */
export const GAIN = 0.2;
/** Canvas pixels per CSS pixel: light is soft, so half the screen's size is plenty. */
const SCALE = 0.5;
const FRAME_MS = 1000 / 30;

const VERT = `attribute vec2 p; void main(){ gl_Position = vec4(p, 0.0, 1.0); }`;

const FRAG = `precision mediump float;
uniform vec2 uRes; uniform float uT; uniform vec3 uBeam; uniform vec3 uFloor; uniform float uGain;
float hash(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float noise(vec2 p){ vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), f.x), mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), f.x), f.y); }
float fbm(vec2 p){ return 0.5 * noise(p) + 0.3 * noise(p * 2.03 + 7.1) + 0.2 * noise(p * 4.1 + 3.7); }
// A cone of light from a lamp at o, above the stage: it leans, widens as it falls and thins with distance.
float beam(vec2 q, vec2 o, float lean, float width){
  vec2 d = q - o;
  if (d.y <= 0.0) return 0.0;
  float edge = abs(d.x - lean * d.y) / (width * (0.22 + d.y));
  float core = smoothstep(1.0, 0.0, edge);
  return core * core * smoothstep(0.0, 0.18, d.y) * (1.0 - 0.72 * min(1.0, d.y));
}
void main(){
  vec2 uv = gl_FragCoord.xy / uRes; uv.y = 1.0 - uv.y;
  float aspect = uRes.x / uRes.y; vec2 q = vec2(uv.x * aspect, uv.y);
  float b = beam(q, vec2(0.10 * aspect, -0.06), 0.52 + 0.09 * sin(uT * 0.11), 0.17)
          + beam(q, vec2(0.90 * aspect, -0.06), -0.52 + 0.09 * sin(uT * 0.09 + 2.0), 0.17);
  // Dust in the light: slow clouds drifting up through the beams, and fine specks that catch it.
  float dust = fbm(q * 3.0 + vec2(uT * 0.015, -uT * 0.03));
  float speck = pow(noise(q * 46.0 + vec2(0.0, -uT * 0.22)), 7.0);
  // Never more than 1.1, so with the gain the brightest point is the flat beams' own 22%.
  float light = min(1.1, b * (0.66 + 0.5 * dust) + b * speck * 0.5);
  float haze = smoothstep(0.58, 1.0, uv.y) * (0.45 + 0.55 * fbm(vec2(q.x * 1.4 + uT * 0.012, uv.y * 3.0)));
  vec3 col = (uBeam * light + uFloor * haze * 0.8) * uGain;
  // Light laid over the stage: see-through where it is dark.
  gl_FragColor = vec4(col, max(col.r, max(col.g, col.b)));
}`;

/** "#9db7ff" as the three numbers a shader wants. */
export function rgb(hex: string): [number, number, number] {
  const n = Number.parseInt(hex.replace('#', ''), 16);
  return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255];
}

export interface StageLight {
  /** Faded in (true) or out: while it is out nothing is drawn. */
  show(on: boolean): void;
  stop(): void;
}

/**
 * Starts the light on `canvas`. `onLost` is called if it has to give up later (the graphics context
 * went, or frames turned slow): the caller puts the flat beams back. Returns null if it cannot start.
 */
export function start(canvas: HTMLCanvasElement, colors: { beam: string; floor: string }, onLost: () => void): StageLight | null {
  const gl = canvas.getContext('webgl', { alpha: true, antialias: false, depth: false, stencil: false, premultipliedAlpha: true, powerPreference: 'low-power' });
  if (!gl) return null;
  const compile = (type: number, src: string) => {
    const s = gl.createShader(type);
    if (!s) return null;
    gl.shaderSource(s, src);
    gl.compileShader(s);
    return gl.getShaderParameter(s, gl.COMPILE_STATUS) ? s : null;
  };
  const vs = compile(gl.VERTEX_SHADER, VERT);
  const fs = compile(gl.FRAGMENT_SHADER, FRAG);
  const program = gl.createProgram();
  if (!vs || !fs || !program) return null;
  gl.attachShader(program, vs);
  gl.attachShader(program, fs);
  gl.linkProgram(program);
  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) return null;
  gl.useProgram(program);
  // One triangle that covers the screen.
  const buffer = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
  const at = gl.getAttribLocation(program, 'p');
  gl.enableVertexAttribArray(at);
  gl.vertexAttribPointer(at, 2, gl.FLOAT, false, 0, 0);
  const u = (name: string) => gl.getUniformLocation(program, name);
  const uRes = u('uRes');
  const uT = u('uT');
  gl.uniform3fv(u('uBeam'), rgb(colors.beam));
  gl.uniform3fv(u('uFloor'), rgb(colors.floor));
  gl.uniform1f(u('uGain'), GAIN);

  let raf = 0;
  let last = 0;
  let shown = false;
  let dead = false;
  let slow = 0;
  const began = performance.now();

  const size = () => {
    const w = Math.max(1, Math.round(canvas.clientWidth * SCALE));
    const h = Math.max(1, Math.round(canvas.clientHeight * SCALE));
    if (canvas.width !== w || canvas.height !== h) {
      canvas.width = w;
      canvas.height = h;
    }
    gl.viewport(0, 0, w, h);
    gl.uniform2f(uRes, w, h);
  };
  const draw = (now: number) => {
    size();
    gl.uniform1f(uT, (now - began) / 1000);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
  };
  const frame = (now: number) => {
    raf = 0;
    if (dead || !shown || document.hidden) return;
    const dt = now - last;
    if (dt >= FRAME_MS - 2) {
      // Frames that keep arriving late (under 12 a second for four seconds) mean this device should not be drawing it.
      if (last && dt < 400) slow = dt > 80 ? slow + 1 : Math.max(0, slow - 1);
      last = now;
      draw(now);
      if (slow > 48) {
        give();
        return;
      }
    }
    raf = requestAnimationFrame(frame);
  };
  const wake = () => {
    if (!raf && !dead && shown && !document.hidden) {
      last = 0;
      raf = requestAnimationFrame(frame);
    }
  };
  const give = () => {
    stop();
    onLost();
  };
  const lost = (e: Event) => {
    e.preventDefault();
    give();
  };
  const stop = () => {
    if (dead) return;
    dead = true;
    if (raf) cancelAnimationFrame(raf);
    document.removeEventListener('visibilitychange', wake);
    window.removeEventListener('resize', wake);
    canvas.removeEventListener('webglcontextlost', lost);
    gl.getExtension('WEBGL_lose_context')?.loseContext();
  };
  document.addEventListener('visibilitychange', wake);
  window.addEventListener('resize', wake);
  canvas.addEventListener('webglcontextlost', lost);
  // One frame at once, so the light is there as the backdrop fades in.
  draw(began);
  return {
    show(on: boolean) {
      shown = on;
      wake();
    },
    stop,
  };
}
