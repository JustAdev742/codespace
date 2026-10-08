// What every component shares: escaped HTML templates, a base element that adopts the shared
// stylesheet into its shadow root, the icon set and the range ruler.

export class Raw {
  constructor(value) { this.value = String(value); }
  toString() { return this.value; }
}
export const raw = value => new Raw(value);

const ESCAPES = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
const out = v => v == null || v === false ? '' : v instanceof Raw ? v.value
  : Array.isArray(v) ? v.map(out).join('') : String(v).replace(/[&<>"']/g, c => ESCAPES[c]);

/** Text for running copy: escaped, and "e-bike" never split across lines at its hyphen. */
export const prose = text => raw(out(text).replace(/\b([Ee]-[a-z]+)/g, '<span class="nw">$1</span>'));

/** Template literal that escapes every interpolated value unless it is raw() or another html``. */
export const html = (strings, ...values) => raw(strings.reduce((acc, s, i) => acc + out(values[i - 1]) + s));

export const css = (strings, ...values) => strings.reduce((acc, s, i) => acc + values[i - 1] + s);

const sheets = new Map();
function sheetFor(text) {
  if (!sheets.has(text)) {
    let sheet = null;
    try { sheet = new CSSStyleSheet(); sheet.replaceSync(text); } catch { sheet = null; }
    sheets.set(text, sheet);
  }
  return sheets.get(text);
}

export class CbElement extends HTMLElement {
  static styles = [];

  constructor() {
    super();
    this.root = this.attachShadow({ mode: 'open' });
    const texts = [BASE, ...this.constructor.styles];
    const adopted = texts.map(sheetFor);
    if (adopted.every(Boolean) && 'adoptedStyleSheets' in this.root) this.root.adoptedStyleSheets = adopted;
    else this.inlineStyle = `<style>${texts.join('\n')}</style>`;
  }

  render(markup) {
    this.root.innerHTML = (this.inlineStyle ?? '') + out(markup);
  }

  $(selector) { return this.root.querySelector(selector); }
  $$(selector) { return [...this.root.querySelectorAll(selector)]; }
}

export function define(name, cls) {
  if (!customElements.get(name)) customElements.define(name, cls);
}

// 24 px grid, 1.5 px strokes, round caps; decorative wherever text sits next to them.
const ICONS = {
  arrow: '<path d="M5 12h14M13 6l6 6-6 6"/>',
  check: '<path d="M5 12.5l4.5 4.5L19 7.5"/>',
  close: '<path d="M6 6l12 12M18 6L6 18"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  box: '<path d="M3.5 7.5L12 3l8.5 4.5v9L12 21l-8.5-4.5z"/><path d="M3.5 7.5L12 12l8.5-4.5M12 12v9"/>',
  columns: '<rect x="3.5" y="4.5" width="7" height="15" rx="1.5"/><rect x="13.5" y="4.5" width="7" height="15" rx="1.5"/>',
  pin: '<path d="M12 21s-6.5-5.8-6.5-10.5a6.5 6.5 0 0 1 13 0C18.5 15.2 12 21 12 21z"/><circle cx="12" cy="10.5" r="2.25"/>',
  phone: '<path d="M6.5 3.5h3l1.5 4.5-2 1.25a10 10 0 0 0 5.75 5.75l1.25-2 4.5 1.5v3a2 2 0 0 1-2 2A15.5 15.5 0 0 1 4.5 5.5a2 2 0 0 1 2-2z"/>',
  mail: '<rect x="3.5" y="5.5" width="17" height="13" rx="2"/><path d="M4 7l8 6 8-6"/>',
  calendar: '<rect x="3.5" y="5" width="17" height="15.5" rx="2"/><path d="M3.5 10h17M8 3v4M16 3v4"/>',
  info: '<circle cx="12" cy="12" r="8.5"/><path d="M12 11v5.5M12 7.75v.01"/>',
};

export const icon = (name, cls = 'icon') => raw(`<svg class="${cls}" viewBox="0 0 24 24" fill="none" stroke="currentColor" `
  + `stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">${ICONS[name]}</svg>`);

/** A clean upper bound for a ruler: the next 50 km above the longest range, at least 100. */
export function rulerScale(values) {
  const top = Math.max(0, ...values.filter(v => v != null));
  return Math.max(100, Math.ceil(top / 50) * 50);
}

/**
 * The range ruler: a measured track, solid yellow to the lowest stated figure and hatched to the
 * highest, so "60–80 km" reads as a span. Decorative: the figure is always written next to it.
 */
export function ruler(range, scale, { ticks = false, size = 'md', animate = false } = {}) {
  const pct = v => `${Math.min(100, (v / scale) * 100).toFixed(2)}%`;
  const known = range && range.min != null;
  const steps = scale / 50;
  const tickMarks = ticks ? html`<div class="ruler-ticks">${Array.from({ length: steps + 1 },
    (_, i) => html`<span style="--at:${pct(i * 50)}">${i * 50}${i === steps ? '\u00a0km' : ''}</span>`)}</div>` : '';
  return html`<div class="ruler ruler-${size}${known ? '' : ' ruler-empty'}"${animate && known ? raw(' data-charge') : ''} aria-hidden="true">
    <div class="ruler-track">${known ? html`<span class="ruler-fill" style="--to:${pct(range.min)}"></span>${range.max > range.min
      ? html`<span class="ruler-span" style="--from:${pct(range.min)};--to:${pct(range.max)}"></span>` : ''}` : ''}</div>${tickMarks}</div>`;
}

/** Fills every ruler marked data-charge inside `root` once it is half in view. */
export function charge(root) {
  const rulers = root.querySelectorAll('.ruler[data-charge]:not([data-charged])');
  if (!rulers.length) return;
  const io = new IntersectionObserver(entries => entries.forEach(e => {
    if (!e.isIntersecting) return;
    e.target.setAttribute('data-charged', '');
    io.unobserve(e.target);
  }), { threshold: 0.5 });
  rulers.forEach(r => io.observe(r));
}

export const BASE = css`
  :host {
    all: initial;
    display: block;
    box-sizing: border-box;
    width: 100%;
    min-width: 0;
    font-family: var(--cb-font-text);
    font-size: var(--cb-text-base);
    line-height: var(--cb-leading-body);
    color: var(--cb-text);
    font-kerning: normal;
    font-variant-numeric: lining-nums;
    text-rendering: optimizeLegibility;
    -webkit-font-smoothing: antialiased;
    -webkit-text-size-adjust: 100%;
  }
  :host([hidden]) { display: none; }
  *, *::before, *::after { box-sizing: inherit; }
  h1, h2, h3, h4, p, ul, ol, dl, dd, figure, fieldset { margin: 0; }
  ul, ol { padding: 0; list-style: none; }
  fieldset { border: 0; padding: 0; min-width: 0; }
  legend { padding: 0; }
  img { display: block; max-width: 100%; height: auto; }
  button, input, select { font: inherit; color: inherit; }
  button { cursor: pointer; }
  a { color: inherit; }
  [hidden]:not(.tray) { display: none !important; }

  .display {
    font-family: var(--cb-font-display);
    font-weight: 800;
    text-transform: uppercase;
    letter-spacing: var(--cb-tracking-display);
    line-height: var(--cb-leading-tight);
    hyphens: none;
    text-wrap: balance;
  }
  .title { font-family: var(--cb-font-text-bold); font-weight: 700; line-height: var(--cb-leading-snug); text-wrap: balance; }
  /* Mixed-case headings tighten slightly as they grow; capitals (.display) get space instead. */
  h2.title { letter-spacing: -0.01em; }
  .label {
    font-family: var(--cb-font-text-medium);
    font-weight: 500;
    font-size: var(--cb-text-xs);
    line-height: var(--cb-leading-snug);
    text-transform: uppercase;
    letter-spacing: var(--cb-tracking-label);
    color: var(--cb-text-muted);
  }
  .num { font-variant-numeric: tabular-nums lining-nums; }
  .muted { color: var(--cb-text-muted); }
  .link { color: var(--cb-blue); text-decoration: underline; text-decoration-thickness: 1px; text-underline-offset: 0.18em; }
  .sr-only {
    position: absolute; width: 1px; height: 1px; padding: 0; margin: -1px;
    overflow: hidden; clip: rect(0 0 0 0); white-space: nowrap; border: 0;
  }
  .icon { width: 1.25em; height: 1.25em; flex: none; }
  .nw { white-space: nowrap; }

  :focus-visible { outline: 2px solid var(--cb-focus); outline-offset: 2px; }
  .on-dark :focus-visible { outline-color: var(--cb-signal); }

  .btn {
    display: inline-flex; align-items: center; justify-content: center; gap: var(--cb-space-2);
    min-height: var(--cb-target); padding: 0 var(--cb-space-5);
    border: var(--cb-border-w) solid transparent; border-radius: var(--cb-radius-pill);
    font-family: var(--cb-font-text-bold); font-weight: 700; font-size: var(--cb-text-base); line-height: 1;
    text-decoration: none; white-space: nowrap;
    transition: background-color var(--cb-dur-tap) ease, transform var(--cb-dur-tap) var(--cb-ease-out);
    -webkit-tap-highlight-color: transparent;
  }
  .btn:active { transform: scale(0.97); }
  @media (prefers-reduced-motion: reduce) { .btn:active { transform: none; } }
  .btn-primary { background: var(--cb-action); color: var(--cb-on-action); }
  .btn-secondary { background: transparent; color: var(--cb-text); border-color: var(--cb-border-control); }
  .btn-quiet { background: transparent; color: var(--cb-text); padding-inline: var(--cb-space-3); }
  .on-dark .btn-secondary { color: var(--cb-paper); border-color: var(--cb-sand-400); }
  @media (hover: hover) and (pointer: fine) {
    .btn-primary:hover { background: var(--cb-signal-press); }
    .btn-secondary:hover, .btn-quiet:hover { background: var(--cb-sand-100); }
    .on-dark .btn-secondary:hover { background: var(--cb-ink-800); }
  }

  /* The range ruler */
  .ruler { --h: 0.5rem; position: relative; }
  .ruler-sm { --h: 0.3125rem; }
  .ruler-lg { --h: 0.75rem; }
  .ruler-track {
    position: relative; height: var(--h); overflow: hidden;
    border-radius: var(--cb-radius-pill);
    background: var(--cb-sand-100);
    box-shadow: inset 0 0 0 1px var(--cb-sand-400);
  }
  .ruler-empty .ruler-track { background: repeating-linear-gradient(90deg, var(--cb-sand-200) 0 4px, transparent 4px 8px); box-shadow: none; }
  .ruler-fill, .ruler-span {
    position: absolute; inset-block: 0; left: 0; width: var(--to);
    border-radius: var(--cb-radius-pill);
    box-shadow: inset 0 0 0 1px var(--cb-ink);
    transform-origin: left center;
  }
  .ruler-fill { background: var(--cb-signal); }
  /* The one flourish: a ruler marked data-charge fills left to right the first time it is seen. */
  .ruler[data-charge] .ruler-fill, .ruler[data-charge] .ruler-span {
    clip-path: inset(0 100% 0 0);
    transition: clip-path var(--cb-dur-charge) var(--cb-ease-out);
  }
  .ruler[data-charge] .ruler-span { transition-delay: calc(var(--cb-dur-charge) * 0.35); }
  .ruler[data-charged] .ruler-fill, .ruler[data-charged] .ruler-span { clip-path: inset(0 0 0 0); }
  .ruler-span {
    left: var(--from); width: calc(var(--to) - var(--from));
    border-radius: 0 var(--cb-radius-pill) var(--cb-radius-pill) 0;
    background: repeating-linear-gradient(-45deg, var(--cb-signal) 0 2px, var(--cb-sand-50) 2px 5px);
  }
  .ruler-ticks { position: relative; height: 1.25rem; margin-top: var(--cb-space-1); font-size: 0.6875rem; color: var(--cb-text-muted); }
  .ruler-ticks span { position: absolute; left: var(--at); transform: translateX(-50%); font-variant-numeric: tabular-nums; white-space: nowrap; }
  .ruler-ticks span:first-child { transform: none; }
  .ruler-ticks span:last-child { transform: translateX(-100%); }
`;
