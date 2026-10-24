// An illustrated classroom seen from the back of the room: 28 students at desks with laptops and tablets,
// and the projector at the front showing real Ludora footage. Like the rest of the trailer, every frame is
// drawn from the time alone: makeClassroom(parent).draw(u, cue) paints the room at u seconds into a scene.
'use strict';
(function () {
  const NS = 'http://www.w3.org/2000/svg';
  const SKIN = ['#f1cfb4', '#e2ad86', '#c58a5f', '#a26840', '#7a4a2c', '#583421'];
  const HAIR = ['#17110d', '#261911', '#3f281b', '#64422a', '#9a6a39', '#cfa65f', '#7d3418'];
  const TOPS = ['#2c3d93', '#7d2f3d', '#1e6f69', '#4b5168', '#b5862a', '#5c3f8f', '#2f5ae8', '#3f7e3b', '#8c4a22'];
  const SCARF = ['#2f5ae8', '#7d2f3d', '#1e6f69', '#5c3f8f', '#c2563d', '#3f7e3b'];
  const STYLES = ['short', 'long', 'ponytail', 'bun', 'curly', 'braids', 'buzz', 'short', 'long', 'hijab', 'curly', 'short'];
  const POSES = ['v', 'v', 'clap', 'wave', 'fist', 'v', 'clap', 'one'];
  const ANSWER = ['#ff8a2b', '#3d8bff', '#22c77f', '#ff5c8a'];
  // The projector screen, in room coordinates (the room is 1920 x 1080).
  const SCREEN = { x: 960 - 436, y: 64, w: 872, h: 490 };
  const ROWS = [
    { y: 640, k: 0.62 },
    { y: 712, k: 0.76 },
    { y: 804, k: 0.94 },
    { y: 922, k: 1.17 },
  ];

  function rng(seed) {
    return () => {
      seed |= 0;
      seed = (seed + 0x6d2b79f5) | 0;
      let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  const clamp = (x, a = 0, b = 1) => Math.min(b, Math.max(a, x));
  const lerp = (a, b, t) => a + (b - a) * t;
  const out3 = (t) => 1 - Math.pow(1 - clamp(t), 3);
  const inout = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
  function el(tag, attrs, parent) {
    const e = document.createElementNS(NS, tag);
    for (const k in attrs) e.setAttribute(k, attrs[k]);
    if (parent) parent.appendChild(e);
    return e;
  }
  function shade(hex, f, to = [10, 16, 48]) {
    const n = parseInt(hex.slice(1), 16);
    const c = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((v, i) => Math.round(lerp(v, to[i], f)));
    return `rgb(${c[0]},${c[1]},${c[2]})`;
  }

  // Hair shapes in head units (1 = head radius), origin at the head's centre.
  const HAIRS = {
    short: ['M-1.03 0.28C-1.12 -0.62 -0.6 -1.1 0 -1.1C0.6 -1.1 1.12 -0.62 1.03 0.28C0.9 0.58 0.5 0.66 0 0.66C-0.5 0.66 -0.9 0.58 -1.03 0.28Z'],
    buzz: ['M-0.99 0.2C-1.05 -0.6 -0.58 -1.04 0 -1.04C0.58 -1.04 1.05 -0.6 0.99 0.2C0.86 0.5 0.48 0.58 0 0.58C-0.48 0.58 -0.86 0.5 -0.99 0.2Z'],
    long: ['M-1.05 0.1C-1.12 -0.66 -0.6 -1.12 0 -1.12C0.6 -1.12 1.12 -0.66 1.05 0.1L1.16 1.55C0.62 1.78 -0.62 1.78 -1.16 1.55Z'],
    ponytail: ['M-1.03 0.28C-1.12 -0.62 -0.6 -1.1 0 -1.1C0.6 -1.1 1.12 -0.62 1.03 0.28C0.9 0.58 0.5 0.66 0 0.66C-0.5 0.66 -0.9 0.58 -1.03 0.28Z', 'M-0.3 0.45C-0.42 0.9 -0.3 1.55 0 1.75C0.3 1.55 0.42 0.9 0.3 0.45Z'],
    bun: ['M-1.03 0.28C-1.12 -0.62 -0.6 -1.1 0 -1.1C0.6 -1.1 1.12 -0.62 1.03 0.28C0.9 0.58 0.5 0.66 0 0.66C-0.5 0.66 -0.9 0.58 -1.03 0.28Z', 'M0 -1.62A0.46 0.46 0 1 1 0 -0.7A0.46 0.46 0 1 1 0 -1.62Z'],
    braids: ['M-1.03 0.28C-1.12 -0.62 -0.6 -1.1 0 -1.1C0.6 -1.1 1.12 -0.62 1.03 0.28C0.9 0.58 0.5 0.66 0 0.66C-0.5 0.66 -0.9 0.58 -1.03 0.28Z', 'M-0.72 0.3L-0.42 0.3L-0.5 1.8L-0.78 1.8Z', 'M0.42 0.3L0.72 0.3L0.78 1.8L0.5 1.8Z'],
    curly: (() => {
      let d = 'M0 -1.42A1.3 1.3 0 1 1 0 1.18A1.3 1.3 0 1 1 0 -1.42Z';
      for (let i = 0; i < 11; i++) {
        const a = -Math.PI * 0.95 + (i / 10) * Math.PI * 1.9;
        const cx = Math.sin(a) * 1.22, cy = -0.12 - Math.cos(a) * 1.22;
        d += `M${(cx - 0.4).toFixed(2)} ${cy.toFixed(2)}a0.4 0.4 0 1 1 0.8 0a0.4 0.4 0 1 1 -0.8 0Z`;
      }
      return [d];
    })(),
    hijab: ['M-1.2 0C-1.27 -0.82 -0.66 -1.24 0 -1.24C0.66 -1.24 1.27 -0.82 1.2 0C1.32 0.72 1.62 1.22 1.84 1.8C0.82 2.06 -0.82 2.06 -1.84 1.8C-1.62 1.22 -1.32 0.72 -1.2 0Z'],
  };

  function makeStudents(seed) {
    const r = rng(seed);
    const out = [];
    ROWS.forEach((row, ri) => {
      for (let c = 0; c < 7; c++) {
        const style = STYLES[Math.floor(r() * STYLES.length)];
        out.push({
          row: ri,
          col: c,
          x: 960 + (c - 3) * 248 * row.k + (r() - 0.5) * 22 * row.k + (ri % 2 ? 40 * row.k : 0),
          y: row.y + (r() - 0.5) * 8,
          k: row.k * (0.94 + r() * 0.1),
          skin: SKIN[Math.floor(r() * SKIN.length)],
          hair: style === 'hijab' ? SCARF[Math.floor(r() * SCARF.length)] : HAIR[Math.floor(r() * HAIR.length)],
          top: TOPS[Math.floor(r() * TOPS.length)],
          style,
          hood: r() < 0.35,
          device: r() < 0.7 ? 'laptop' : 'tablet',
          side: r() < 0.5 ? -1 : 1,
          delay: 0.04 + r() * 0.3,
          energy: 0.65 + r() * 0.35,
          pose: POSES[Math.floor(r() * POSES.length)],
          hold: 1.1 + r() * 1.3,
          phase: r() * Math.PI * 2,
          tilt: (r() - 0.5) * 8,
          wrong: r() < 0.16,
          team: c < 3 || (c === 3 && ri % 2) ? 0 : 1,
        });
      }
    });
    return out;
  }

  // Arm end points (relative to the shoulder centre, in units of k) for a pose at strength p.
  function arms(s, p, t) {
    const restE = [78, 108], restH = [56, 150];
    const w = Math.sin(t * 13 + s.phase);
    let L, R;
    switch (s.pose) {
      case 'clap': {
        const c = (Math.sin(t * 15 + s.phase) + 1) / 2;
        L = { e: [-72, -72], h: [-14 - c * 22, -182] };
        R = { e: [72, -72], h: [14 + c * 22, -182] };
        break;
      }
      case 'wave':
        L = { e: [-restE[0], restE[1]], h: [-restH[0], restH[1]] };
        R = { e: [98, -58], h: [104 + w * 30, -170] };
        break;
      case 'one':
        L = { e: [-restE[0], restE[1]], h: [-restH[0], restH[1]] };
        R = { e: [92, -66], h: [96, -180] };
        break;
      case 'fist':
        L = { e: [-96, -42], h: [-86, -128 - Math.max(0, w) * 26] };
        R = { e: [96, -42], h: [86, -128 - Math.max(0, -w) * 26] };
        break;
      default:
        L = { e: [-100, -62], h: [-118 - w * 6, -168] };
        R = { e: [100, -62], h: [118 + w * 6, -168] };
    }
    const mix = (pose, sign) => ({
      e: [lerp(sign * restE[0], pose.e[0], p), lerp(restE[1], pose.e[1], p)],
      h: [lerp(sign * restH[0], pose.h[0], p), lerp(restH[1], pose.h[1], p)],
    });
    return [mix(L, -1), mix(R, 1)];
  }

  window.makeClassroom = function (parent, { seed = 21 } = {}) {
    const root = document.createElement('div');
    root.style.cssText = 'position:absolute;inset:0;overflow:hidden';
    parent.appendChild(root);
    const cam = document.createElement('div');
    cam.style.cssText = 'position:absolute;left:0;top:0;width:1920px;height:1080px;transform-origin:0 0';
    root.appendChild(cam);

    // The back layer: walls, a clock, the screen's frame and glow.
    const back = el('svg', { width: 1920, height: 1080, viewBox: '0 0 1920 1080', style: 'position:absolute;left:0;top:0' }, cam);
    const defs = el('defs', {}, back);
    defs.innerHTML = `
      <linearGradient id="cr-wall" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#121b4e"/><stop offset="1" stop-color="#0b1132"/></linearGradient>
      <radialGradient id="cr-glow" cx="0.5" cy="0.28" r="0.62"><stop offset="0" stop-color="#5a7dff" stop-opacity="0.55"/><stop offset="0.5" stop-color="#3a5bd8" stop-opacity="0.16"/><stop offset="1" stop-color="#3a5bd8" stop-opacity="0"/></radialGradient>
      <radialGradient id="cr-gold" cx="0.5" cy="0.3" r="0.75"><stop offset="0" stop-color="#ffc233" stop-opacity="0.55"/><stop offset="0.6" stop-color="#ffb020" stop-opacity="0.12"/><stop offset="1" stop-color="#ffb020" stop-opacity="0"/></radialGradient>
      <linearGradient id="cr-beam" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#cfe0ff" stop-opacity="0.0"/><stop offset="1" stop-color="#cfe0ff" stop-opacity="0.07"/></linearGradient>
      <radialGradient id="cr-dev" cx="0.5" cy="0.5" r="0.5"><stop offset="0" stop-color="#8fb0ff" stop-opacity="0.45"/><stop offset="1" stop-color="#8fb0ff" stop-opacity="0"/></radialGradient>
      <linearGradient id="cr-floor" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#0d1438"/><stop offset="1" stop-color="#070b22"/></linearGradient>`;
    el('rect', { x: 0, y: 0, width: 1920, height: 1080, fill: 'url(#cr-wall)' }, back);
    el('rect', { x: 0, y: 610, width: 1920, height: 470, fill: 'url(#cr-floor)' }, back);
    el('path', { d: 'M0 0L300 70L300 640L0 780Z', fill: '#0a1030' }, back);
    el('path', { d: 'M1920 0L1620 70L1620 640L1920 780Z', fill: '#0a1030' }, back);
    // Two blank posters and a clock at twenty to eleven: period 3.
    el('path', { d: 'M56 200L232 236L232 430L56 424Z', fill: '#2a2440' }, back);
    [['#3d5fd0', 74, 228], ['#c2563d', 132, 240], ['#2f8f6a', 182, 252], ['#b5862a', 88, 316], ['#7a4fb0', 150, 326], ['#3d5fd0', 196, 336]].forEach(([c, x, y], i) =>
      el('path', { d: `M${x} ${y}l40 ${7 + i % 2}l0 50l-40 -2Z`, fill: c, opacity: 0.55 }, back));
    el('path', { d: 'M1866 150L1690 190L1690 470L1866 492Z', fill: '#1a2350' }, back);
    for (let i = 0; i < 14; i++) {
      const y0 = 160 + i * 23.5, y1 = 196 + i * 20.4;
      el('path', { d: `M1866 ${y0}L1690 ${y1}`, stroke: i % 4 === 1 ? '#9fb4ff' : '#26306a', 'stroke-width': i % 4 === 1 ? 1.4 : 3, opacity: i % 4 === 1 ? 0.35 : 1 }, back);
    }
    el('circle', { cx: 1500, cy: 150, r: 40, fill: '#d9def0', opacity: 0.85 }, back);
    el('circle', { cx: 1500, cy: 150, r: 34, fill: '#eef1fb' }, back);
    el('path', { d: 'M1500 150L1478 141M1500 150L1500 121', stroke: '#1a2350', 'stroke-width': 4, 'stroke-linecap': 'round' }, back);
    const glow = el('rect', { x: 0, y: 0, width: 1920, height: 1080, fill: 'url(#cr-glow)' }, back);
    el('rect', { x: SCREEN.x - 16, y: SCREEN.y - 26, width: SCREEN.w + 32, height: 22, rx: 6, fill: '#20284f' }, back);
    el('rect', { x: SCREEN.x - 8, y: SCREEN.y - 8, width: SCREEN.w + 16, height: SCREEN.h + 16, rx: 4, fill: '#cfd6ee' }, back);

    // The projector image itself.
    const img = document.createElement('img');
    img.style.cssText = `position:absolute;left:${SCREEN.x}px;top:${SCREEN.y}px;width:${SCREEN.w}px;height:${SCREEN.h}px;object-fit:cover;filter:saturate(1.05)`;
    cam.appendChild(img);

    // The front layer: the beam, the desks, the students, and the room's light.
    const front = el('svg', { width: 1920, height: 1080, viewBox: '0 0 1920 1080', style: 'position:absolute;left:0;top:0' }, cam);
    const fdefs = el('defs', {}, front);
    fdefs.innerHTML = `<filter id="cr-dof" x="-10%" y="-10%" width="120%" height="120%"><feGaussianBlur stdDeviation="2.2"/></filter>`;
    el('path', { d: `M880 -40L1040 -40L${SCREEN.x + SCREEN.w} ${SCREEN.y + SCREEN.h}L${SCREEN.x} ${SCREEN.y + SCREEN.h}Z`, fill: 'url(#cr-beam)' }, front);
    const teacherG = el('g', {}, front);
    const rowsG = ROWS.map((_, i) => el('g', i === 3 ? { filter: 'url(#cr-dof)' } : {}, front));
    const light = el('rect', { x: 0, y: 0, width: 1920, height: 1080, fill: 'url(#cr-gold)', opacity: 0, style: 'mix-blend-mode:screen' }, front);
    const dust = el('g', { opacity: 0.5 }, front);
    const motes = Array.from({ length: 26 }, (_, i) => ({ x: 860 + ((i * 97) % 200), y: (i * 53) % 560, s: 1 + (i % 3) }));
    const students = makeStudents(seed);

    function device(g, s, x, y, k, state) {
      const w = (s.device === 'laptop' ? 112 : 84) * k, h = (s.device === 'laptop' ? 72 : 60) * k;
      const cx = x + s.side * 74 * k, bottom = y - 30 * k;
      const X = cx - w / 2, Y = bottom - h;
      el('ellipse', { cx, cy: Y + h / 2, rx: w * 0.9, ry: h * 0.9, fill: 'url(#cr-dev)' }, g);
      el('rect', { x: X - 3 * k, y: Y - 3 * k, width: w + 6 * k, height: h + 6 * k, rx: 5 * k, fill: '#0c1024' }, g);
      el('rect', { x: X, y: Y, width: w, height: h, rx: 3 * k, fill: '#0b1236' }, g);
      const pad = 5 * k, tw = (w - pad * 3) / 2, th = (h - pad * 3 - 10 * k) / 2;
      if (state === 'correct' || state === 'wrong') {
        el('rect', { x: X + pad, y: Y + pad, width: w - pad * 2, height: h * 0.38, rx: 3 * k, fill: state === 'correct' ? '#22c77f' : '#ff5c8a' }, g);
        for (let i = 0; i < 2; i++) el('rect', { x: X + pad + i * (tw + pad), y: Y + h * 0.5, width: tw, height: h * 0.38, rx: 2 * k, fill: '#26306a' }, g);
      } else if (state === 'team') {
        el('rect', { x: X + pad, y: Y + pad, width: w - pad * 2, height: h - pad * 2, rx: 3 * k, fill: s.team ? '#3d8bff' : '#ffc233', opacity: 0.85 }, g);
      } else {
        el('rect', { x: X + pad, y: Y + pad, width: w - pad * 2, height: 7 * k, rx: 2 * k, fill: '#eef1fb' }, g);
        for (let i = 0; i < 4; i++) el('rect', { x: X + pad + (i % 2) * (tw + pad), y: Y + pad * 2 + 8 * k + Math.floor(i / 2) * (th + pad), width: tw, height: th, rx: 2 * k, fill: ANSWER[i] }, g);
      }
      if (s.device === 'laptop') el('rect', { x: X - 10 * k, y: bottom + 2 * k, width: w + 20 * k, height: 6 * k, rx: 3 * k, fill: '#1c2244' }, g);
    }

    function teacher(g, u, cheer) {
      const x = 404, y = 652, sil = '#0c1234', rim = '#8fa8ff';
      const c = clamp(cheer);
      const clapX = 12 + ((Math.sin(u * 15) + 1) / 2) * 16 * c;
      for (const sign of [-1, 1]) {
        const sh = [x + sign * 34, y - 268];
        const e = [x + sign * lerp(44, 30, c), y - lerp(206, 222, c)];
        const hd = [x + sign * lerp(30, clapX, c), y - lerp(176, 238, c)];
        el('path', { d: `M${sh[0]} ${sh[1]}L${e[0]} ${e[1]}L${hd[0]} ${hd[1]}`, stroke: sil, 'stroke-width': 17, 'stroke-linecap': 'round', 'stroke-linejoin': 'round', fill: 'none' }, g);
      }
      el('path', { d: `M${x - 40} ${y - 262}C${x - 40} ${y - 282} ${x - 22} ${y - 288} ${x} ${y - 288}C${x + 22} ${y - 288} ${x + 40} ${y - 282} ${x + 40} ${y - 262}L${x + 36} ${y - 130}L${x - 36} ${y - 130}Z`, fill: sil }, g);
      el('rect', { x: x - 9, y: y - 304, width: 18, height: 20, fill: sil }, g);
      el('ellipse', { cx: x, cy: y - 322, rx: 21, ry: 24, fill: sil }, g);
      el('path', { d: `M${x + 14} ${y - 340}C${x + 22} ${y - 330} ${x + 22} ${y - 312} ${x + 16} ${y - 302}M${x + 38} ${y - 268}L${x + 36} ${y - 200}`, stroke: rim, 'stroke-width': 2.4, 'stroke-linecap': 'round', fill: 'none', opacity: 0.6 }, g);
      el('path', { d: `M${x - 62} ${y - 168}L${x + 62} ${y - 168}L${x + 50} ${y}L${x - 50} ${y}Z`, fill: '#1b2353' }, g);
      el('path', { d: `M${x - 62} ${y - 168}L${x + 62} ${y - 168}`, stroke: '#3a4796', 'stroke-width': 3 }, g);
      el('path', { d: `M${x - 30} ${y - 170}L${x - 22} ${y - 200}L${x + 26} ${y - 200}L${x + 30} ${y - 170}Z`, fill: '#9fb4ff', opacity: 0.35 }, g);
    }

    function student(g, s, x, y, k, P) {
      const lift = P.lift * k;
      const by = y - lift;
      const haze = [0.16, 0.1, 0.04, 0][s.row];
      const top = s.top, dark = shade(top, 0.55 + haze, [18, 27, 78]), darker = shade(top, 0.72 + haze * 0.5, [14, 20, 60]);
      const [L, R] = arms(s, P.arms, P.t);
      const sx = x, sy = by;
      // Arms first, so the body covers where they join.
      for (const [arm, sign] of [[L, -1], [R, 1]]) {
        const p0 = [sx + sign * 64 * k, sy + 14 * k];
        const e = [sx + arm.e[0] * k, sy + arm.e[1] * k], hnd = [sx + arm.h[0] * k, sy + arm.h[1] * k];
        el('path', { d: `M${p0[0]} ${p0[1]}L${e[0]} ${e[1]}L${hnd[0]} ${hnd[1]}`, stroke: darker, 'stroke-width': 27 * k, 'stroke-linecap': 'round', 'stroke-linejoin': 'round', fill: 'none' }, g);
        if (P.arms > 0.25) el('circle', { cx: hnd[0], cy: hnd[1], r: 13 * k, fill: shade(s.skin, 0.35) }, g);
      }
      el('path', { d: `M${sx - 78 * k} ${sy + 24 * k}C${sx - 76 * k} ${sy + 2 * k} ${sx - 52 * k} ${sy - 8 * k} ${sx - 24 * k} ${sy - 12 * k}L${sx + 24 * k} ${sy - 12 * k}C${sx + 52 * k} ${sy - 8 * k} ${sx + 76 * k} ${sy + 2 * k} ${sx + 78 * k} ${sy + 24 * k}L${sx + 74 * k} ${sy + 230 * k}L${sx - 74 * k} ${sy + 230 * k}Z`, fill: dark }, g);
      el('path', { d: `M${sx - 70 * k} ${sy + 12 * k}C${sx - 60 * k} ${sy - 4 * k} ${sx - 40 * k} ${sy - 9 * k} ${sx - 22 * k} ${sy - 11 * k}M${sx + 22 * k} ${sy - 11 * k}C${sx + 40 * k} ${sy - 9 * k} ${sx + 60 * k} ${sy - 4 * k} ${sx + 70 * k} ${sy + 12 * k}`, stroke: shade(top, 0.15, [190, 205, 255]), 'stroke-width': 3.2 * k, 'stroke-linecap': 'round', fill: 'none', opacity: 0.55 }, g);
      if (s.hood && s.style !== 'hijab') el('ellipse', { cx: sx, cy: sy - 2 * k, rx: 36 * k, ry: 16 * k, fill: darker }, g);
      // Neck and head, turned a little.
      const hx = sx + Math.sin((s.tilt + P.tilt) * 0.0174) * 20 * k, hy = sy - 60 * k;
      if (s.style !== 'hijab') {
        el('rect', { x: sx - 13 * k, y: sy - 34 * k, width: 26 * k, height: 26 * k, fill: shade(s.skin, 0.45) }, g);
        el('ellipse', { cx: hx - 32 * k, cy: hy + 2 * k, rx: 7 * k, ry: 10 * k, fill: shade(s.skin, 0.4) }, g);
        el('ellipse', { cx: hx + 32 * k, cy: hy + 2 * k, rx: 7 * k, ry: 10 * k, fill: shade(s.skin, 0.4) }, g);
        el('ellipse', { cx: hx, cy: hy, rx: 33 * k, ry: 37 * k, fill: shade(s.skin, 0.42) }, g);
      }
      const hairG = el('g', { transform: `translate(${hx} ${hy}) rotate(${s.tilt + P.tilt}) scale(${35 * k})` }, g);
      for (const d of HAIRS[s.style]) el('path', { d, fill: shade(s.hair, 0.25), opacity: s.style === 'buzz' ? 0.9 : 1 }, hairG);
      el('path', { d: s.style === 'curly' ? 'M-1.1 -1.0C-0.62 -1.58 0.62 -1.58 1.1 -1.0' : 'M-0.9 -0.66C-0.58 -1.08 0.58 -1.08 0.9 -0.66', stroke: '#b9c8ff', 'stroke-width': 0.05, 'stroke-linecap': 'round', fill: 'none', opacity: 0.22 }, hairG);
      // The chair back is nearer to us than the student, so it goes on top; standing lifts the student above it.
      const cy = y + 92 * k;
      el('rect', { x: x - 64 * k, y: cy, width: 128 * k, height: 96 * k, rx: 14 * k, fill: '#121836' }, g);
      el('path', { d: `M${x - 56 * k} ${cy + 3 * k}L${x + 56 * k} ${cy + 3 * k}`, stroke: '#2c3770', 'stroke-width': 3 * k, 'stroke-linecap': 'round' }, g);
    }

    // cue: { img(src) set by the caller, lean, glow, gold, devices, cheers: [{at, power, stand, who}], team: {at, beat} , cam: {x,y,zoom}, dof }
    function draw(u, cue = {}) {
      const camZ = cue.cam?.zoom ?? 1, camX = cue.cam?.x ?? 960, camY = cue.cam?.y ?? 540;
      cam.style.transform = `translate(${960 - camX * camZ}px, ${540 - camY * camZ}px) scale(${camZ})`;
      glow.setAttribute('opacity', String(0.8 + (cue.glow ?? 0) * 0.6));
      light.setAttribute('opacity', String(cue.gold ?? 0));
      rowsG.forEach((g) => g.replaceChildren());
      teacherG.replaceChildren();
      let teach = 0;
      for (const c of cue.cheers ?? []) { const t = u - c.at - 0.15; if (t > 0) teach = Math.max(teach, out3(t / 0.25) * (1 - clamp((t - (c.hold ?? 1.6)) / 0.5))); }
      teacher(teacherG, u, teach);
      dust.replaceChildren();
      for (const m of motes) el('circle', { cx: m.x + Math.sin(u * 0.4 + m.y) * 30, cy: (m.y + u * 12) % 560 + 20, r: m.s, fill: '#cfe0ff' }, dust);
      for (let ri = 0; ri < ROWS.length; ri++) {
        const row = ROWS[ri], g = rowsG[ri];
        // The desk the row sits at, then devices on it, then the students in front of it.
        const span = 7 * 248 * row.k;
        el('rect', { x: 960 - span / 2 - 60 * row.k, y: row.y - 34 * row.k, width: span + 120 * row.k, height: 26 * row.k, rx: 6 * row.k, fill: '#1b2353' }, g);
        el('rect', { x: 960 - span / 2 - 60 * row.k, y: row.y - 34 * row.k, width: span + 120 * row.k, height: 4 * row.k, fill: '#34418a' }, g);
        const rs = students.filter((s) => s.row === ri);
        for (const s of rs) {
          let state = cue.devices ?? 'answer';
          if (state === 'reveal') state = s.wrong ? 'wrong' : 'correct';
          device(g, s, s.x, s.y, s.k, state);
        }
        for (const s of rs) {
          const P = { t: u, lift: 0, arms: 0, tilt: Math.sin(u * 0.9 + s.phase) * 2 };
          P.lift += Math.sin(u * 1.7 + s.phase) * 1.5 + (cue.lean ?? 0) * 8;
          for (const c of cue.cheers ?? []) {
            if (c.who === 'team0' && s.team !== 0) continue;
            if (c.who === 'team1' && s.team !== 1) continue;
            const t = u - c.at - s.delay;
            if (t < 0) continue;
            const wrongDamp = c.right && s.wrong ? 0.25 : 1;
            const len = (c.hold ?? s.hold) + (c.hold ? 0 : 0);
            const up = out3(t / 0.2) * (1 - clamp((t - len) / 0.5)) * (c.power ?? 1) * s.energy * wrongDamp;
            P.arms = Math.max(P.arms, up);
            const bounce = Math.abs(Math.sin(t * Math.PI * 2.1 + s.phase)) * up;
            P.lift += bounce * 16 + (c.stand ? out3(t / 0.45) * 120 : 0) * (1 - clamp((t - len - 0.4) / 0.6) * (c.sitBack ? 1 : 0));
            P.tilt += up * Math.sin(t * 7 + s.phase) * 6;
          }
          student(g, s, s.x, s.y, s.k, P);
        }
      }
    }
    return { root, img, draw, SCREEN };
  };
})();
