// The trailer as a pure function of time: window.renderFrame(t) draws the frame at t seconds.
// Nothing runs on its own clock, so every frame renders the same way every time.
'use strict';
const FPS = 30;
const F = window.FOOTAGE;
const ROOT = '../';
const W = 1920;
const H = 1080;

// ---------------------------------------------------------------- helpers
const clamp = (x, a = 0, b = 1) => Math.min(b, Math.max(a, x));
const lerp = (a, b, t) => a + (b - a) * t;
const inv = (a, b, x) => clamp((x - a) / (b - a));
const E = {
  lin: (t) => t,
  out2: (t) => 1 - (1 - t) * (1 - t),
  out3: (t) => 1 - Math.pow(1 - t, 3),
  out5: (t) => 1 - Math.pow(1 - t, 5),
  in3: (t) => t * t * t,
  inout3: (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2),
  outBack: (t) => {
    const c1 = 1.5, c3 = c1 + 1;
    return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2);
  },
};
const ease = (u, a, b, fn = E.out3) => fn(inv(a, b, u));
function h(tag, cls, parent, html) {
  const el = document.createElement(tag);
  if (cls) el.className = cls;
  if (html != null) el.innerHTML = html;
  if (parent) parent.appendChild(el);
  return el;
}
function css(el, props) {
  for (const k in props) el.style[k] = props[k];
}
function mulberry(seed) {
  return () => {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Footage: image sequences at 30 fps and stills.
function seqSrc(key, n) {
  const f = F[key];
  const i = Math.max(1, Math.min(f.count, Math.round(n)));
  return `${ROOT}${f.dir}/f${String(i).padStart(4, '0')}.jpg`;
}
function setSrc(img, src) {
  if (img.dataset.src !== src) {
    img.dataset.src = src;
    img.src = src;
  }
}
function seq(img, key, u, speed) {
  const f = F[key];
  setSrc(img, seqSrc(key, (f.in || 1) + u * FPS * (speed ?? f.speed ?? 1)));
}
function still(img, key, k = 0) {
  const f = F[key];
  setSrc(img, ROOT + f.file);
  if (!f.crop0) return;
  const c = f.crop0.map((v, i) => lerp(v, f.crop1[i], E.inout3(clamp(k))));
  const [sw, sh] = f.size;
  css(img, { inset: 'auto', objectFit: 'fill', width: (sw / c[2]) * 100 + '%', height: (sh / c[3]) * 100 + '%', left: (-c[0] / c[2]) * 100 + '%', top: (-c[1] / c[3]) * 100 + '%' });
}

// Building blocks.
function screen(parent, w = 1280) {
  const root = h('div', 'screen', parent);
  css(root, { width: w + 'px', height: (w * 9) / 16 + 'px' });
  const img = h('img', '', root);
  const glare = h('div', 'glare', root);
  return { root, img, glare, w, hgt: (w * 9) / 16 };
}
function phone(parent, scale = 1) {
  const root = h('div', 'phone', parent);
  const glass = h('div', 'glass', root);
  h('div', 'island', glass);
  const img = h('img', '', glass);
  return { root, img, scale };
}
// Places a box's centre at (x, y) with a 3D transform.
function place(el, w, hh, x, y, { s = 1, rx = 0, ry = 0, rz = 0, z = 0, o = 1, blur = 0, bright = 1 } = {}) {
  el.style.transform = `translate3d(${x - w / 2}px, ${y - hh / 2}px, ${z}px) rotateX(${rx}deg) rotateY(${ry}deg) rotateZ(${rz}deg) scale(${s})`;
  el.style.opacity = o;
  el.style.filter = blur || bright !== 1 ? `blur(${blur}px) brightness(${bright})` : 'none';
}
function glare(sc, p) {
  sc.glare.style.transform = `translateX(${lerp(-60, 60, p)}%)`;
}
function superText(parent, html, size, x, y, align = 'left') {
  const el = h('div', 'super', parent, html);
  css(el, { fontSize: size + 'px', left: x + 'px', top: y + 'px', textAlign: align });
  if (align === 'center') css(el, { left: '0', right: '0' });
  return el;
}
function sub(parent, text, x, y, w = 760) {
  const el = h('div', 'sub', parent, text);
  css(el, { left: x + 'px', top: y + 'px', maxWidth: w + 'px' });
  return el;
}
// A line of type that slams in: scale down from 1.12, quick fade, a slight rise.
function slam(el, u, a, dur = 0.22, out = null) {
  const p = ease(u, a, a + dur, E.out3);
  let o = inv(a, a + dur * 0.6, u);
  if (out) o *= 1 - inv(out[0], out[1], u);
  el.style.opacity = o;
  el.style.transform = `translateY(${(1 - p) * 26}px) scale(${lerp(1.1, 1, p)})`;
  el.style.filter = p < 1 ? `blur(${(1 - p) * 6}px)` : 'none';
}
function rise(el, u, a, dur = 0.4, out = null, dist = 30) {
  const p = ease(u, a, a + dur, E.out3);
  let o = p;
  if (out) o *= 1 - inv(out[0], out[1], u);
  el.style.opacity = o;
  el.style.transform = `translateY(${(1 - p) * dist}px)`;
}

// ---------------------------------------------------------------- global layers
const scenesEl = document.getElementById('scenes');
const fx = document.getElementById('fx').getContext('2d');
const flashEl = document.getElementById('flash');
const blackEl = document.getElementById('black');
const grainEl = document.getElementById('grain');
const barTop = document.getElementById('barTop');
const barBot = document.getElementById('barBot');
const beam1 = document.getElementById('beam1');
const beam2 = document.getElementById('beam2');

const scenes = [];
function scene(start, end, build) {
  const el = h('div', 'scene', scenesEl);
  const s = { start, end, el };
  s.update = build(el, s);
  scenes.push(s);
  return s;
}

// Shard bursts: crisp triangles in Ludora's colours, flung out and falling.
const BURSTS = [];
function burst(t0, x, y, { count = 46, power = 900, colors = ['#ffc233', '#1fd38f', '#3d9bff', '#ff5c8a', '#ffffff'], seed = 1, life = 1.3, size = 22 } = {}) {
  const r = mulberry(seed);
  const parts = [];
  for (let i = 0; i < count; i++) {
    const a = r() * Math.PI * 2;
    const v = power * (0.35 + r() * 0.75);
    parts.push({ vx: Math.cos(a) * v, vy: Math.sin(a) * v - power * 0.25, spin: (r() - 0.5) * 14, rot: r() * 6, s: size * (0.5 + r()), c: colors[i % colors.length], shape: r() < 0.7 ? 0 : 1 });
  }
  BURSTS.push({ t0, x, y, parts, life });
}
function drawBursts(t) {
  fx.clearRect(0, 0, W, H);
  for (const b of BURSTS) {
    const dt = t - b.t0;
    if (dt < 0 || dt > b.life) continue;
    for (const p of b.parts) {
      const drag = Math.exp(-dt * 2.2);
      const dist = (1 - drag) / 2.2;
      const x = b.x + p.vx * dist;
      const y = b.y + p.vy * dist + 520 * dt * dt;
      const fade = 1 - Math.pow(dt / b.life, 2);
      fx.save();
      fx.globalAlpha = Math.max(0, fade);
      fx.translate(x, y);
      fx.rotate(p.rot + p.spin * dt);
      fx.fillStyle = p.c;
      fx.beginPath();
      if (p.shape === 0) {
        fx.moveTo(0, -p.s);
        fx.lineTo(p.s * 0.55, p.s * 0.6);
        fx.lineTo(-p.s * 0.55, p.s * 0.6);
      } else {
        fx.rect(-p.s * 0.5, -p.s * 0.14, p.s, p.s * 0.28);
      }
      fx.closePath();
      fx.fill();
      fx.restore();
    }
  }
}

// Hits: a flash, a little shake.
const HITS = [
  { t: 8.0, flash: 0.85, shake: 14, dur: 0.32 },
  { t: 12.2, flash: 0.28, shake: 8, dur: 0.25 },
  { t: 16.0, flash: 0.15, shake: 4, dur: 0.2 },
  { t: 28.0, flash: 0.45, shake: 12, dur: 0.3 },
  { t: 36.0, flash: 0.35, shake: 10, dur: 0.25 },
  { t: 52.0, flash: 0.35, shake: 10, dur: 0.25 },
  { t: 60.0, flash: 0.18, shake: 5, dur: 0.2 },
  { t: 68.0, flash: 0.5, shake: 14, dur: 0.3 },
  { t: 71.0, flash: 0.32, shake: 10, dur: 0.25 },
  { t: 78.5, flash: 0.95, shake: 16, dur: 0.5 },
];

// Frame n of a sequence, by frame number rather than by time.
function seqFrame(img, key, n) {
  setSrc(img, seqSrc(key, n));
}
// Piecewise-linear map through [[x, y], ...].
function through(points, x) {
  if (x <= points[0][0]) return points[0][1];
  for (let i = 1; i < points.length; i++) {
    if (x <= points[i][0]) return lerp(points[i - 1][1], points[i][1], (x - points[i - 1][0]) / (points[i][0] - points[i - 1][0]));
  }
  return points[points.length - 1][1];
}
// The camera move that opens a classroom scene on the projector and pulls back to show the room.
function pullBack(u, a, b, from = 2.05) {
  const p = ease(u, a, b, E.out3);
  return { x: 960, y: lerp(309, 540, p), zoom: lerp(from, 1, p) };
}

// ---------------------------------------------------------------- the scenes
// 1. Cold open, 0-8 s: the classroom before the game. The lobby is on the projector, students waving from their
// devices; then the app's own countdown, matched to ours.
scene(0, 8, (el) => {
  const room = makeClassroom(el, { seed: 21 });
  const low = h('div', 'layer', el);
  css(low, { background: 'linear-gradient(0deg, rgba(5,8,26,0.9) 0%, rgba(5,8,26,0.0) 42%)' });
  const dim = h('div', 'layer', el);
  css(dim, { background: '#05081a', opacity: 0 });
  const lines = ['Period 3.', '28 students.', 'One question.'].map((t) => {
    const l = h('div', 'line', el, t);
    css(l, { top: '850px' });
    return l;
  });
  const times = [[0.7, 2.2], [2.5, 4.2], [4.5, 5.85]];
  const num = h('div', 'count count-num', el);
  const rings = [0, 1, 2].map(() => h('div', 'ring', el));
  return (u) => {
    if (u < 6) seqFrame(room.img, 'cr_lobby', 600 + u * 30 * 0.8);
    else seqFrame(room.img, 'cr_again', through([[6, 73], [6.5, 97], [7, 133], [7.7, 160]], u));
    const zoom = lerp(1.0, 1.08, ease(u, 0, 6, E.inout3)) + ease(u, 6, 7.75, E.in3) * 0.55;
    const camY = lerp(430, 400, ease(u, 0, 6, E.inout3)) - 70 * ease(u, 6, 7.75, E.in3);
    room.draw(u, { lean: ease(u, 5.6, 6.6), cam: { x: 960, y: camY, zoom }, glow: ease(u, 6, 7) * 0.4 });
    dim.style.opacity = 0.5 * ease(u, 5.9, 6.05) * (1 - inv(7.45, 7.6, u));
    lines.forEach((l, i) => {
      const [a, b] = times[i];
      const p = ease(u, a, a + 0.45);
      l.style.opacity = p * (1 - inv(b - 0.3, b, u));
      l.style.transform = `translateY(${(1 - p) * 16}px)`;
      l.style.letterSpacing = `${lerp(0.12, 0.01, p)}em`;
    });
    const starts = [6.0, 6.5, 7.0];
    let k = -1;
    for (let i = 0; i < 3; i++) if (u >= starts[i]) k = i;
    if (k >= 0 && u < 7.48) {
      const local = u - starts[k];
      const p = ease(local, 0, 0.16, E.out3);
      num.textContent = ['3', '2', '1'][k];
      num.style.opacity = k === 2 ? 1 - inv(7.32, 7.48, u) : 1;
      num.style.transform = `scale(${lerp(1.45, 1, p)})`;
      num.style.filter = `blur(${(1 - p) * 10}px)`;
    } else num.style.opacity = 0;
    rings.forEach((r, i) => {
      const local = u - starts[i];
      if (local < 0 || local > 0.6) return void (r.style.opacity = 0);
      const s = lerp(260, 1100, E.out3(local / 0.6));
      css(r, { width: s + 'px', height: s + 'px', marginLeft: -s / 2 + 'px', marginTop: -s / 2 + 'px', opacity: (1 - local / 0.6) * 0.7 });
    });
  };
});

// 2a. The question on the projector, 8-10 s: the answers counting in.
scene(8, 10, (el) => {
  const p = h('div', 'persp', el);
  const sc = screen(p, 1280);
  return (u) => {
    const k = u / 2;
    seq(sc.img, 'q_big', u);
    place(sc.root, 1280, 720, 960, lerp(560, 540, E.out3(k)), { s: lerp(1.16, 1.3, E.out2(k)), ry: lerp(-9, -3, k), rx: lerp(5, 2, k), z: 0 });
    glare(sc, k);
  };
});

// 2b. Phones answering the same question; the hero's comes up Correct, 10-12 s.
scene(10, 12, (el) => {
  const p = h('div', 'persp', el);
  const left = phone(p), right = phone(p), hero = phone(p);
  return (u) => {
    seq(hero.img, 'hero_correct', u);
    seq(left.img, 'phone_b', u);
    seq(right.img, 'phone_c', u);
    const e = (d) => ease(u, d, d + 0.38, E.out3);
    const drift = u * 6;
    place(left.root, 330, 700, 960 - 440, 560 + (1 - e(0.06)) * 400, { s: 0.84, ry: 22, rz: -3, z: -260, o: e(0.06), bright: 0.8 });
    place(right.root, 330, 700, 960 + 440, 560 + (1 - e(0.12)) * 400, { s: 0.84, ry: -22, rz: 3, z: -260, o: e(0.12), bright: 0.8 });
    place(hero.root, 330, 700, 960, 548 + (1 - e(0)) * 420 - drift, { s: 1.08, rx: 4, z: 40, o: e(0) });
  };
});

// 2c. The reveal, 12-16 s: from the projector, the camera pulls back as the whole room goes up.
scene(12, 16, (el) => {
  const room = makeClassroom(el, { seed: 21 });
  return (u) => {
    seq(room.img, 'cr_reveal', u);
    const cam = pullBack(u, 0.0, 1.15);
    cam.zoom += ease(u, 2.4, 4, E.inout3) * 0.06;
    room.draw(u, {
      lean: 1 - ease(u, 0.15, 0.4),
      devices: u < 0.2 ? 'answer' : 'reveal',
      cheers: [{ at: 0.2, power: 1, right: true, hold: 2.3 }],
      gold: ease(u, 0.2, 0.45) * (1 - inv(1.4, 3.2, u)) * 0.5,
      glow: ease(u, 0.2, 0.4) * (1 - inv(1.0, 2.5, u)) * 0.6,
      cam,
    });
  };
});

// 2d. The leaderboard reshuffles, 16-18.5 s: your lesson, their game.
scene(16, 18.5, (el) => {
  const p = h('div', 'persp', el);
  const sc = screen(p, 1280);
  const t1 = superText(el, 'Your lesson.', 190, 0, 330, 'center');
  const t2 = superText(el, '<span class="plate"><span>Their game.</span></span>', 190, 0, 540, 'center');
  return (u) => {
    seq(sc.img, 'lb_big', u);
    const k = u / 2.5;
    const card = ease(u, 0.9, 1.15);
    place(sc.root, 1280, 720, 960, 540, { s: lerp(1.25, 1.34, k), rx: lerp(8, 3, k), ry: lerp(4, -2, k), blur: card * 14, bright: lerp(1, 0.42, card) });
    glare(sc, k);
    slam(t1, u, 1.0);
    slam(t2, u, 1.5);
  };
});

// 3a. One code: the lobby filling on the projector, 18.5-21 s.
scene(18.5, 21, (el) => {
  const p = h('div', 'persp', el);
  const sc = screen(p, 1280);
  const t = superText(el, 'One code.', 150, 120, 350);
  const s = sub(el, 'Everyone joins with the 6-digit code on the board.', 124, 520, 540);
  return (u) => {
    seq(sc.img, 'lobby', u);
    const k = u / 2.5;
    const enter = ease(u, 0, 0.45, E.out5);
    place(sc.root, 1280, 720, lerp(1760, 1330, enter), 540, { s: lerp(0.84, 0.9, k), ry: lerp(-20, -12, k), rx: 3, z: 0 });
    glare(sc, k);
    slam(t, u, 0.2);
    rise(s, u, 0.5);
  };
});

// 3b. Any device: a phone joins, 21-23 s.
scene(21, 23, (el) => {
  const p = h('div', 'persp', el);
  const ph = phone(p);
  const t = superText(el, 'Any device.', 150, 120, 350);
  const s = sub(el, 'Phones, tablets and Chromebooks. Nothing to install.', 124, 520, 560);
  return (u) => {
    seq(ph.img, 'join_phone', u);
    const enter = ease(u, 0, 0.4, E.out5);
    place(ph.root, 330, 700, 1300, 560 + (1 - enter) * 500 - u * 8, { s: 1.12, ry: -10, rx: 3, o: enter });
    slam(t, u, 0.12);
    rise(s, u, 0.4);
  };
});

// 3c. The room fills and waves, 23-26 s.
scene(23, 26, (el) => {
  const p = h('div', 'persp', el);
  const sc = screen(p, 1280);
  const shade = h('div', 'layer', el);
  css(shade, { background: 'linear-gradient(0deg, rgba(5,8,26,0.92) 0%, rgba(5,8,26,0.0) 46%)' });
  const t = superText(el, 'No student emails.', 130, 120, 770);
  const s = sub(el, 'Players join as guests. Accounts are optional.', 124, 905, 900);
  return (u) => {
    seq(sc.img, 'lobby_fill', u);
    const k = u / 3;
    place(sc.root, 1280, 720, 960, 520, { s: lerp(1.28, 1.38, k), rx: lerp(6, 2, k) });
    glare(sc, k);
    slam(t, u, 0.2);
    rise(s, u, 0.45);
  };
});

// 4a. One set, twenty ways, 26-28 s.
scene(26, 28, (el) => {
  const t1 = superText(el, 'One question set.', 170, 0, 330, 'center');
  const t2 = superText(el, '<span class="plate"><span>Twenty ways to play.</span></span>', 170, 0, 540, 'center');
  return (u) => {
    slam(t1, u, 0.0);
    slam(t2, u, 1.0);
  };
});

// 4b. The modes, 28-36 s, with the class split into two teams for Tug of War.
const MONTAGE = [
  ['comet-dash', 'Comet Dash', 28.0, 29.0], ['tug-of-war', 'Tug of War', 29.0, 30.0],
  ['lantern-guard', 'Lantern Guard', 31.5, 32.5], ['night-market', 'Night Market', 32.5, 33.5],
  ['quick-draw', 'Quick Draw', 33.5, 34.0], ['glimgo', 'Glimgo', 34.0, 34.5], ['sky-lanterns', 'Sky Lanterns', 34.5, 35.0],
  ['gloom-giant', 'Gloom Giant', 35.0, 35.5], ['glim-duels', 'Glim Duels', 35.5, 36.0],
];
MONTAGE.forEach(([key, name, a, b], i) => {
  scene(a, b, (el) => {
    const p = h('div', 'persp', el);
    const sc = screen(p, 1280);
    const tag = h('div', 'modename', sc.root, `<span class="plate blue"><span>${name}</span></span>`);
    const slow = b - a >= 1;
    return (u) => {
      seq(sc.img, `m_${key}`, u);
      const d = b - a;
      const k = u / d;
      if (slow) {
        const enter = ease(u, 0, 0.22, E.out5);
        const dir = i % 2 ? -1 : 1;
        place(sc.root, 1280, 720, 960 + (1 - enter) * 700 * dir, 540, { s: lerp(1.1, 1.18, k), ry: lerp(9 * dir, 4 * dir, k), rx: 3, blur: (1 - enter) * 16 });
      } else {
        place(sc.root, 1280, 720, 960, 540, { s: lerp(1.3, 1.22, E.out3(k)), rx: 2 });
      }
      glare(sc, k);
      const tp = ease(u, 0.04, 0.2, E.out3);
      tag.style.opacity = tp;
      tag.style.transform = `translateX(${(1 - tp) * -60}px)`;
    };
  });
});
scene(30.0, 31.5, (el) => {
  const room = makeClassroom(el, { seed: 21 });
  const tag = h('div', 'modename', el, '<span class="plate"><span>Comets v Lanterns</span></span>');
  css(tag, { left: '60px', bottom: '60px' });
  return (u) => {
    seqFrame(room.img, 'm_tug-of-war', 31 + u * 30);
    room.draw(u, {
      devices: 'team',
      cheers: [{ at: 0.02, who: 'team0', power: 1, hold: 0.42 }, { at: 0.52, who: 'team1', power: 1, hold: 0.42 }, { at: 1.02, who: 'team0', power: 1, hold: 0.5 }],
      cam: { x: lerp(880, 1040, u / 1.5), y: 520, zoom: lerp(1.14, 1.05, E.out3(u / 1.5)) },
      glow: 0.2,
    });
    const tp = ease(u, 0.04, 0.2, E.out3);
    tag.style.opacity = tp;
    tag.style.transform = `translateX(${(1 - tp) * -60}px)`;
  };
});

// 4c. The wall of modes, 36-41 s: 20 modes, 100 variants.
scene(36, 41, (el) => {
  const p = h('div', 'persp', el);
  css(p, { perspective: '1800px' });
  const wall = h('div', 'wall', p);
  const keys = ['classic', 'comet-dash', 'quick-draw', 'lantern-out', 'confidence', 'glimgo', 'lantern-match', 'word-scramble', 'sky-lanterns', 'gloom-giant', 'tug-of-war', 'night-market', 'lantern-guard', 'glim-duels', 'lantern-trail', 'lantern-lands'];
  const tiles = keys.map((key, i) => {
    const t = h('div', 'tile', wall);
    const img = h('img', '', t);
    const c = i % 4, r = Math.floor(i / 4);
    css(t, { left: (c - 2) * 680 + 20 + 'px', top: (r - 2) * 400 + 20 + 'px' });
    return { t, img, key };
  });
  const shade = h('div', 'layer', el);
  css(shade, { background: 'radial-gradient(60% 50% at 50% 50%, rgba(5,8,26,0.78) 0%, rgba(5,8,26,0.35) 70%, rgba(5,8,26,0.1) 100%)' });
  const big = h('div', 'super', el);
  css(big, { left: '0', right: '0', top: '330px', textAlign: 'center', fontSize: '230px', fontStyle: 'italic' });
  const line2 = superText(el, '<span class="plate"><span>100 variants</span></span>', 110, 0, 690, 'center');
  return (u) => {
    tiles.forEach(({ img, key }) => (F[`m_${key}`] ? seq(img, `m_${key}`, u * 0.6 + 2) : still(img, 'classic_still')));
    const zoom = ease(u, 0, 2.2, E.inout3);
    wall.style.transform = `translateZ(${lerp(900, -620, zoom) - u * 30}px) rotateX(${lerp(4, 16, zoom)}deg) rotateZ(${lerp(0, -7, zoom)}deg)`;
    const n = Math.round(lerp(0, 20, ease(u, 0.3, 1.4, E.out3)));
    big.innerHTML = `<span style="color:var(--gold)">${n}</span> game modes`;
    big.style.opacity = ease(u, 0.25, 0.45);
    slam(line2, u, 2.0);
    shade.style.opacity = lerp(0.35, 1, ease(u, 0.2, 1.0));
    el.style.opacity = 1 - inv(4.3, 5, u);
  };
});

// 5a. For the classroom, 41-43 s.
scene(41, 43, (el) => {
  const t = superText(el, 'Made for the classroom.', 150, 0, 455, 'center');
  return (u) => {
    const p = ease(u, 0.1, 1.0, E.out3);
    t.style.opacity = p * (1 - inv(1.75, 2, u));
    t.style.filter = `blur(${(1 - p) * 18}px)`;
    t.style.transform = `scale(${lerp(1.06, 1, p)})`;
  };
});

// 5b-d. The teacher's side, 43-52 s, and the collection at 55.6-58 s: a headline on the left, the real page on
// the right, cropped to the part that matters and moving slowly across it.
function pageScene(key, a, b, title, line, { flyOut = false } = {}) {
  scene(a, b, (el) => {
    const p = h('div', 'persp', el);
    const sc = screen(p, 1280);
    const t = superText(el, title, 118, 110, 330);
    const s = sub(el, line, 114, 600, 560);
    return (u) => {
      const d = b - a;
      const k = u / d;
      still(sc.img, key, k);
      const enter = ease(u, 0, 0.5, E.out5);
      const fly = flyOut ? ease(u, d - 0.45, d, E.in3) : 0;
      place(sc.root, 1280, 720, lerp(1620, 1330, enter) - fly * 320, 540, { s: lerp(0.88, 0.92, k) + fly * 1.3, ry: lerp(-16, -10, k) * (1 - fly), rx: 2.5 * (1 - fly), o: Math.min(1, u / 0.12), blur: fly * 12 + (1 - enter) * 6, bright: 1.15 });
      glare(sc, k);
      rise(t, u, 0.06, 0.45, [d - 0.22, d]);
      rise(s, u, 0.3, 0.45, [d - 0.22, d]);
    };
  });
}
pageScene('t_library', 43.0, 46.0, 'Write it<br>once.', 'Every set works in every mode. Write your own with 8 question types, or start from 20 ready-made sets.');
pageScene('t_report', 46.0, 49.0, 'See who<br>needs help.', 'A report after every game shows how the class did on each question.');
pageScene('t_host', 49.0, 52.0, 'Pick a set.<br>Pick a mode.', 'Host from any laptop. The class plays on whatever they have.', { flyOut: true });

// 6a. Something to play for: a Lantern opens, 52-55.6 s.
scene(52, 55.6, (el) => {
  const p = h('div', 'persp', el);
  const ph = phone(p);
  const t = superText(el, 'Something<br>to play for.', 150, 120, 300);
  const s = sub(el, '112 Glims to collect, earned by answering, from common to mythic.', 124, 600, 620);
  return (u) => {
    seq(ph.img, 'lantern', u);
    const enter = ease(u, 0, 0.35, E.out5);
    place(ph.root, 330, 700, 1290, 550 + (1 - enter) * 500, { s: 1.16 + u * 0.02, ry: -8, rx: 2, o: enter });
    slam(t, u, 0.2);
    rise(s, u, 0.5);
  };
});

// 6b. Earned, never bought, 55.6-58 s.
pageScene('t_collection', 55.6, 58.0, 'Earned,<br>never bought.', 'Nothing in Ludora is sold for real money.');

// 6c. Odds on every Lantern, 58-60 s.
scene(58, 60, (el) => {
  const p = h('div', 'persp', el);
  const ph = phone(p);
  const t = superText(el, 'Odds on<br>every Lantern.', 140, 760, 330);
  const s = sub(el, 'Every chance is shown before anything is opened.', 764, 640, 640);
  return (u) => {
    still(ph.img, 'p_shop');
    const enter = ease(u, 0, 0.35, E.out5);
    place(ph.root, 330, 700, 500, 560 + (1 - enter) * 500 - u * 10, { s: 1.22, ry: 12, rx: 2, o: enter });
    ph.img.style.objectPosition = `50% ${lerp(30, 55, u / 2)}%`;
    slam(t, u, 0.1);
    rise(s, u, 0.35);
  };
});

// 7. Built for school: three promises, 60-68 s, each with the real thing beside it.
const ICONS = {
  shield: '<svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="#0b1020" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3l7 3v6c0 4.5-3 7.6-7 9-4-1.4-7-4.5-7-9V6z"/><path d="M9 12l2 2 4-4"/></svg>',
  eye: '<svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="#0b1020" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M4 7V5h11v2"/><path d="M9.5 5v14"/><path d="M7.5 19h4"/><path d="M14 12v-1.5h7V12"/><path d="M17.5 10.5V19"/><path d="M16 19h3"/></svg>',
  devices: '<svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="#0b1020" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="4" width="14" height="10" rx="1.5"/><path d="M6 18h6"/><rect x="17" y="8" width="5" height="12" rx="1.2"/></svg>',
};
scene(60, 68, (el) => {
  const title = superText(el, 'Built for school.', 96, 110, 120);
  const items = [
    ['shield', 'var(--mint)', 'Safe by design', 'No free-text chat. Under-13s start with a friends-only profile. Reporting and moderation built in.', 'p_privacy'],
    ['eye', 'var(--gold)', 'Accessible', 'Large text, high contrast and reduced motion. Live announcements for screen readers.', 'access'],
    ['devices', '#7fa6ff', 'Works anywhere', 'Phones, tablets, Chromebooks and projectors. All it needs is a browser.', null],
  ];
  const beat = 8 / 3;
  const beats = items.map(([icon, color, head, body, key], i) => {
    const wrap = h('div', 'layer', el);
    const text = h('div', '', wrap, `<div class="ico" style="width:84px;height:84px;border-radius:20px;display:grid;place-items:center;background:${color}">${ICONS[icon]}</div><h3 style="margin:28px 0 18px;font-family:BC;font-weight:800;font-size:104px;line-height:0.92">${head}</h3><p style="margin:0;font-size:34px;line-height:1.38;color:var(--text2);max-width:560px">${body}</p>`);
    css(text, { position: 'absolute', left: '110px', top: '330px' });
    const p = h('div', 'persp', wrap);
    const sc = key ? null : screen(p, 1280);
    const ph = phone(p);
    return { wrap, text, sc, ph, key, a: i * beat };
  });
  return (u) => {
    slam(title, u, 0.05, 0.22, [7.6, 8]);
    beats.forEach(({ wrap, text, sc, ph, key, a }, i) => {
      const local = u - a;
      const on = local >= -0.05 && local < beat + 0.05;
      wrap.style.display = on ? 'block' : 'none';
      if (!on) return;
      const k = clamp(local / beat);
      const inP = ease(local, 0, 0.4, E.out5);
      const out = i < 2 ? ease(local, beat - 0.2, beat, E.in3) : inv(7.6 - a, 8 - a, local);
      text.style.opacity = inP * (1 - out);
      text.style.transform = `translateY(${(1 - inP) * 40 - out * 20}px)`;
      if (key) {
        if (F[key].dir) seq(ph.img, key, Math.max(0, local));
        else still(ph.img, key);
        place(ph.root, 330, 700, 1200 - out * 80, 590 + (1 - inP) * 420, { s: lerp(1.28, 1.34, k), ry: -9, rx: 2, o: Math.min(1, local / 0.1) * (1 - out) });
      } else {
        still(sc.img, 't_lobby');
        still(ph.img, 'p_joined');
        place(sc.root, 1280, 720, lerp(1560, 1460, inP), 560, { s: lerp(0.74, 0.78, k), ry: -12, rx: 2.5, o: Math.min(1, local / 0.12) * (1 - out) });
        const pin = ease(local, 0.15, 0.6, E.out5);
        place(ph.root, 330, 700, 872, 650 + (1 - pin) * 300, { s: 0.8, ry: 8, rx: 2, z: 60, o: pin * (1 - out) });
        glare(sc, k);
      }
    });
  };
});

// 8a. The podium, 68-71 s.
scene(68, 71, (el) => {
  const p = h('div', 'persp', el);
  const sc = screen(p, 1280);
  return (u) => {
    seq(sc.img, 'podium', u);
    const k = u / 3;
    place(sc.root, 1280, 720, lerp(960, 1250, E.inout3(k)), lerp(540, 630, E.inout3(k)), { s: lerp(1.3, 1.75, E.inout3(k)), rx: lerp(6, 1, k), ry: lerp(-3, 2, k) });
    glare(sc, k);
  };
});

// 8b. The whole class on its feet, 71-73.5 s.
scene(71, 73.5, (el) => {
  const room = makeClassroom(el, { seed: 21 });
  return (u) => {
    seq(room.img, 'cr_podium', u);
    room.draw(u, {
      devices: 'reveal',
      cheers: [{ at: 0.02, power: 1, stand: true, hold: 3 }],
      gold: ease(u, 0, 0.25) * 0.5 * (1 - inv(1.6, 2.5, u) * 0.5),
      glow: 0.4,
      cam: { x: 960, y: lerp(470, 520, ease(u, 0, 2.5, E.out3)), zoom: lerp(1.16, 1.0, ease(u, 0, 2.5, E.out3)) },
    });
  };
});

// 8c. You are 1st, 73.5-75.5 s.
scene(73.5, 75.5, (el) => {
  const p = h('div', 'persp', el);
  const ph = phone(p);
  return (u) => {
    seq(ph.img, 'first_phone', u);
    const enter = ease(u, 0, 0.3, E.out5);
    place(ph.root, 330, 700, 960, lerp(800, 840, u / 2) + (1 - enter) * 520, { s: lerp(1.6, 1.72, u / 2), rx: 3, o: enter });
  };
});

// 8d. One more round? The teacher presses Play again; the class is in, 75.5-78 s.
scene(75.5, 78, (el) => {
  const room = makeClassroom(el, { seed: 21 });
  const low = h('div', 'layer', el);
  css(low, { background: 'linear-gradient(0deg, rgba(5,8,26,0.92) 0%, rgba(5,8,26,0.0) 40%)' });
  const t = superText(el, 'One more round?', 150, 0, 800, 'center');
  return (u) => {
    seq(room.img, 'cr_again', u);
    room.draw(u, {
      devices: 'answer',
      cheers: [{ at: 0.55, power: 1, hold: 1.6 }],
      gold: ease(u, 0.55, 0.8) * 0.35,
      glow: 0.3,
      cam: { x: 960, y: lerp(540, 470, ease(u, 0, 2.5, E.inout3)), zoom: lerp(1.0, 1.14, ease(u, 0, 2.5, E.inout3)) },
    });
    slam(t, u, 0.15);
  };
});

// 9. The logo, 78.5-88.5 s.
scene(78.5, 88.5, (el) => {
  const lock = h('div', 'layer', el);
  const mark = h('div', 'logo-mark', lock, `<svg width="250" height="250" viewBox="0 0 64 64"><g transform="translate(32 32) skewX(-10) translate(-32 -32)"><rect x="9" y="5" width="46" height="54" rx="9" fill="#E9A400"/><rect x="9" y="5" width="46" height="49" rx="9" fill="#FFC233"/><path d="M22 14h9.5v24.5H44V47H22z" fill="#0B1020"/></g></svg>`);
  const word = h('div', 'super', lock, 'Ludora');
  css(word, { fontSize: '300px', fontStyle: 'italic', top: '300px' });
  const tagline = superText(el, 'Turn any lesson into a live game.', 76, 0, 640, 'center');
  css(tagline, { fontWeight: '700', color: '#e6eaff' });
  const small = h('div', 'line', el, 'Join with a code on any device. Nothing to install.');
  css(small, { top: '780px', fontSize: '32px', fontWeight: '500', color: 'var(--text2)' });
  return (u) => {
    const p = ease(u, 0, 0.32, E.out5);
    const markX = lerp(960 - 125, 960 - 470, ease(u, 0.35, 1.0, E.inout3));
    css(mark, { left: markX + 'px', top: 380 - 125 + 'px', transform: `scale(${lerp(1.7, 1, p)})`, opacity: p, filter: `blur(${(1 - p) * 12}px)` });
    const wp = ease(u, 0.45, 1.05, E.out5);
    css(word, { left: 960 - 470 + 270 + (1 - wp) * -80 + 'px', opacity: wp, clipPath: `inset(0 ${(1 - wp) * 100}% 0 0)` });
    rise(tagline, u, 1.5, 0.7, null, 24);
    rise(small, u, 4.0, 0.7, null, 16);
    el.style.opacity = 1 - inv(8.4, 10, u);
  };
});

// Bursts on the big moments (positions match the shots above).
const CONFETTI = { count: 50, power: 1150, life: 1.7 };
burst(11.57, 960, 425, { seed: 3, count: 40, power: 820, life: 0.42, colors: ['#1fd38f', '#ffc233', '#ffffff', '#3d9bff'] });
burst(12.33, 700, 650, { seed: 13, ...CONFETTI });
burst(12.38, 1220, 650, { seed: 14, ...CONFETTI });
burst(12.48, 960, 600, { seed: 15, ...CONFETTI, count: 40 });
burst(30.06, 520, 620, { seed: 16, count: 26, power: 800, life: 0.9, colors: ['#ffc233', '#ffd36b', '#ffffff'] });
burst(30.56, 1400, 620, { seed: 17, count: 26, power: 800, life: 0.9, colors: ['#3d8bff', '#8fb0ff', '#ffffff'] });
burst(31.06, 520, 620, { seed: 18, count: 26, power: 800, life: 0.44, colors: ['#ffc233', '#ffd36b', '#ffffff'] });
burst(F.lantern_burst_t || 53.4, 1290, 370, { seed: 5, count: 56, power: 1000, colors: ['#ffb627', '#ffc233', '#ffffff', '#ff5ca8'] });
burst(F.podium_burst_t || 69.25, 647, 450, { seed: 7, count: 60, power: 1100 });
burst(71.06, 520, 520, { seed: 19, ...CONFETTI });
burst(71.1, 1400, 520, { seed: 20, ...CONFETTI });
burst(71.55, 960, 420, { seed: 21, ...CONFETTI, count: 60, life: 1.9 });
burst(73.62, 960, 340, { seed: 9, count: 44, power: 900, life: 1.3 });
burst(76.08, 960, 500, { seed: 22, count: 46, power: 1000, life: 1.6 });
burst(78.52, 960 - 470 + 125, 380, { seed: 11, count: 70, power: 1300, life: 1.6 });

// ---------------------------------------------------------------- per frame
function globalUpdate(t) {
  // Letterbox for the cold open, opening on the first hit.
  const lb = t < 8 ? 139 : 139 * (1 - ease(t, 8, 8.6, E.out3));
  barTop.style.height = barBot.style.height = lb + 'px';
  // Black: in from black, the two silences, out to black.
  let blk = 1 - inv(0, 0.6, t);
  if (t >= 7.76 && t < 8) blk = 1;
  if (t >= 78.0 && t < 78.5) blk = 1;
  blk = Math.max(blk, inv(86.9, 88.5, t));
  blackEl.style.opacity = blk;
  document.getElementById('bg').style.opacity = 1;
  let fl = 0, shake = 0;
  for (const hit of HITS) {
    const d = t - hit.t;
    if (d >= 0 && d < hit.dur) {
      fl = Math.max(fl, hit.flash * (1 - d / hit.dur));
      shake = Math.max(shake, hit.shake * Math.pow(1 - d / hit.dur, 2));
    }
  }
  flashEl.style.opacity = fl;
  const r = mulberry(Math.floor(t * FPS) + 99);
  scenesEl.style.transform = shake ? `translate(${(r() - 0.5) * 2 * shake}px, ${(r() - 0.5) * 2 * shake}px)` : 'none';
  grainEl.style.backgroundPosition = `${Math.floor(r() * 512)}px ${Math.floor(r() * 512)}px`;
  beam1.style.transform = `translateX(${300 + Math.sin(t * 0.21) * 220}px) rotate(${-18 + Math.sin(t * 0.17) * 6}deg)`;
  beam2.style.transform = `translateX(${1100 + Math.cos(t * 0.19) * 240}px) rotate(${16 + Math.cos(t * 0.13) * 6}deg)`;
  drawBursts(t);
}

window.renderFrame = async function (t) {
  globalUpdate(t);
  for (const s of scenes) {
    const on = t >= s.start && t < s.end;
    s.el.style.display = on ? 'block' : 'none';
    if (on) s.update(t - s.start, t);
  }
  const imgs = [...document.querySelectorAll('.scene img')].filter((i) => i.offsetParent !== null && i.getAttribute('src'));
  await Promise.all(imgs.map((i) => (i.complete && i.naturalWidth ? i.decode().catch(() => {}) : new Promise((res) => { i.onload = i.onerror = () => res(); }))));
  await document.fonts.ready;
  return true;
};
window.DURATION = 88.5;
