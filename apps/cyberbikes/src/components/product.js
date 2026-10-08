// Product page components: the spec panel (with the range explainer), the bike-in-box notice and the
// mobile buy bar.

import { CbElement, charge, css, define, html, icon, ruler, rulerScale } from '../ui.js';
import { battery, number, phoneDisplay, quantity, typeset, withNote } from '../format.js';
import { parseSpecBlock, SPEC_FIELDS } from '../specs.js';
import { config } from '../config.js';

const GROUPS = [
  ['Motor and battery', ['motor', 'ratedPower', 'peakPower', 'battery', 'cells', 'chargeTime']],
  ['Performance', ['range', 'topSpeed']],
  ['Frame and ride', ['type', 'frame', 'weight', 'maxLoad', 'wheels', 'brakes', 'suspension', 'gears']],
  ['Warranty and standards', ['warranty', 'standard', 'roadUse']],
];
const LABEL = Object.fromEntries(SPEC_FIELDS.map(f => [f.key, f.label]));

function contactHTML() {
  const { phone, email } = config.store;
  return html`<a class="link" href="tel:${phone}">${phoneDisplay(phone)}</a> or <a class="link" href="mailto:${email}">${email}</a>`;
}

function valueHTML(key, field) {
  if (!field) return html`<span class="muted">Not listed</span>`;
  if (key === 'battery') return battery(field);
  if (field.unit && field.min != null) return withNote(field);
  return typeset(field.raw);
}

export function rangeExplainerHTML(specs) {
  const energy = specs?.fields.battery?.energy;
  return html`<p>Range is the manufacturer’s figure. How far you get on a charge depends on how and where you ride:</p>
    <ul class="factors">
      <li><strong>Assist level.</strong> More help from the motor uses the battery faster.</li>
      <li><strong>Weight.</strong> Rider, passenger and cargo all count.</li>
      <li><strong>Hills and headwinds.</strong></li>
      <li><strong>Cold weather.</strong> Batteries give less in the cold.</li>
      <li><strong>Tyres.</strong> Soft or knobbly tyres take more effort to roll.</li>
      <li><strong>Stop-start riding.</strong> Every take-off draws extra power.</li>
    </ul>
    <p>To compare bikes, look at battery size in watt-hours (Wh): more Wh is more energy to spend.${energy
      ? html` This bike: <strong class="num">${battery(specs.fields.battery)}</strong>.` : ''}</p>`;
}

const EXPLAINER_CSS = css`
  .factors { display: grid; gap: var(--cb-space-2); margin: var(--cb-space-3) 0; }
  .factors li { padding-left: var(--cb-space-4); position: relative; }
  .factors li::before {
    content: ''; position: absolute; left: 0; top: 0.6em; width: 0.4rem; height: 0.4rem;
    border-radius: 50%; border: 1.5px solid var(--cb-ink);
  }
  .factors strong { font-family: var(--cb-font-text-medium); font-weight: 500; }
`;

export class CbSpecPanel extends CbElement {
  static styles = [EXPLAINER_CSS, css`
    :host { margin-block: var(--cb-space-7); }
    h2 { font-size: var(--cb-text-xl); margin-bottom: var(--cb-space-2); scroll-margin-top: var(--cb-space-6); }
    h2:focus { outline: none; }
    .intro { color: var(--cb-text-muted); max-width: var(--cb-measure); }
    section { margin-top: var(--cb-space-6); }
    h3 { padding-bottom: var(--cb-space-2); border-bottom: var(--cb-border-w) solid var(--cb-ink); }
    dl > div {
      display: grid; grid-template-columns: minmax(7rem, 2fr) 3fr; gap: var(--cb-space-4);
      padding-block: var(--cb-space-3); border-bottom: var(--cb-border-w) solid var(--cb-border);
    }
    dt { color: var(--cb-text-muted); }
    dd { font-family: var(--cb-font-text-medium); font-variant-numeric: tabular-nums lining-nums; overflow-wrap: anywhere; }
    .range-ruler { margin-top: var(--cb-space-3); max-width: 24rem; }
    details { margin-top: var(--cb-space-3); font-family: var(--cb-font-text); }
    summary {
      display: inline-flex; align-items: center; gap: var(--cb-space-2); min-height: var(--cb-target);
      cursor: pointer; color: var(--cb-blue); text-decoration: underline; text-decoration-thickness: 1px; text-underline-offset: 0.18em;
    }
    summary::-webkit-details-marker { display: none; }
    summary::marker { content: ''; }
    details > div { padding: var(--cb-space-4); border-radius: var(--cb-radius-lg); background: var(--cb-surface-alt); max-width: var(--cb-measure); }
    details > div > * + * { margin-top: var(--cb-space-2); }
    .note { margin-top: var(--cb-space-5); font-size: var(--cb-text-sm); color: var(--cb-text-muted); max-width: var(--cb-measure); }
    .empty { padding: var(--cb-space-5); border-radius: var(--cb-radius-lg); background: var(--cb-surface-alt); max-width: var(--cb-measure); }
    @media (min-width: 48rem) { dl > div { grid-template-columns: minmax(10rem, 1fr) 2fr; } }
  `];

  focusHeading() { const h = this.$('h2'); if (h) { h.tabIndex = -1; h.focus({ preventScroll: true }); } }

  static get observedAttributes() { return ['description']; }
  attributeChangedCallback() { this.specs = parseSpecBlock(this.getAttribute('description') ?? ''); }

  set specs(specs) { this._specs = specs; this.update(); }
  get specs() { return this._specs; }
  connectedCallback() { this.update(); }

  update() {
    const s = this._specs;
    if (!s || !this.isConnected) return;
    if (!s.found) {
      this.render(html`<h2 class="title">Specifications</h2>
        <p class="empty">This bike’s full specifications aren’t on the page yet. Ask us for them: ${contactHTML()}.</p>`);
      return;
    }
    const rows = keys => keys.map(key => {
      const f = s.fields[key];
      const range = key === 'range' && f?.min != null ? html`<div class="range-ruler">${ruler(f, rulerScale([f.max]), { ticks: true, animate: true })}</div>
        <details><summary>${icon('info')}What affects range?</summary><div>${rangeExplainerHTML(s)}</div></details>` : '';
      return html`<div><dt>${LABEL[key]}</dt><dd>${valueHTML(key, f)}${range}</dd></div>`;
    });
    const missing = s.missing.length;
    this.render(html`<h2 class="title">Specifications</h2>
      <p class="intro">Figures as stated by the manufacturer.</p>
      ${GROUPS.map(([name, keys]) => html`<section><h3 class="label">${name}</h3><dl>${rows(keys)}</dl></section>`)}
      ${s.extra.length ? html`<section><h3 class="label">Also listed</h3><dl>${s.extra.map(e =>
        html`<div><dt>${e.label}</dt><dd>${typeset(e.raw)}</dd></div>`)}</dl></section>` : ''}
      ${missing ? html`<p class="note">“Not listed” means we don’t have the manufacturer’s figure on this page yet.
        Ask us: ${contactHTML()}.</p>` : ''}`);
    charge(this.root);
  }
}

/** The range explainer on its own, for guides and the homepage. */
export class CbRangeExplainer extends CbElement {
  static styles = [EXPLAINER_CSS, css`
    :host { max-width: var(--cb-measure); }
    h2 { font-size: var(--cb-text-xl); margin-bottom: var(--cb-space-3); }
    p + ul, ul + p { margin-top: var(--cb-space-3); }
  `];
  connectedCallback() {
    this.render(html`<h2 class="title">${this.getAttribute('heading') ?? 'How far will it go?'}</h2>${rangeExplainerHTML(null)}`);
  }
}

export class CbBoxNotice extends CbElement {
  static styles = [css`
    :host { margin-block: var(--cb-space-4); }
    .notice {
      display: grid; grid-template-columns: auto 1fr; gap: var(--cb-space-3);
      padding: var(--cb-space-4); border-radius: var(--cb-radius-lg);
      background: var(--cb-sand-100); color: var(--cb-ink-800);
      font-size: var(--cb-text-sm);
    }
    .icon { width: 1.5rem; height: 1.5rem; margin-top: 0.1rem; }
    strong { display: block; font-family: var(--cb-font-text-bold); font-weight: 700; font-size: var(--cb-text-base); margin-bottom: var(--cb-space-1); }
  `];
  connectedCallback() {
    const { title, body } = config.boxNotice;
    this.render(html`<div class="notice">${icon('box')}<p><strong>${title}</strong><slot>${body}</slot></p></div>`);
  }
}

/** Square's own fixed add-to-cart bar, which its theme shows on phones; null when there is none. */
function squareStickyCart() {
  for (const button of document.querySelectorAll('button')) {
    if (button.closest('cb-buy-bar') || !/add to cart/i.test(button.textContent)) continue;
    for (let el = button.parentElement; el && el !== document.body; el = el.parentElement) {
      if (getComputedStyle(el).position === 'fixed') return el;
    }
  }
  return null;
}

/**
 * Keeps the price and a way back to Square's add-to-cart section in reach on phones. Square's theme
 * already has a sticky add-to-cart bar on phones; where it is present this bar stays out of the way
 * and only reports that bar's height, so the compare tray sits above it. It never adds to the cart
 * itself: options and delivery are chosen in Square's form, so the button takes the shopper there.
 */
export class CbBuyBar extends CbElement {
  static styles = [css`
    :host { display: contents; }
    .bar {
      position: fixed; inset: auto 0 0 0; z-index: 2147483000;
      display: flex; align-items: center; gap: var(--cb-space-3);
      padding: var(--cb-space-3) var(--cb-gutter) calc(var(--cb-space-3) + env(safe-area-inset-bottom));
      background: var(--cb-paper); border-top: var(--cb-border-w) solid var(--cb-border);
      box-shadow: 0 -12px 32px -24px rgb(0 0 0 / 0.4);
      transform: translateY(110%); opacity: 0;
      /* Leaves the way it came, a little faster than it arrived. */
      transition: transform var(--cb-dur-exit) var(--cb-ease-move), opacity var(--cb-dur-fade) linear;
    }
    .bar[data-shown] { transform: none; opacity: 1; transition-duration: var(--cb-dur-state), var(--cb-dur-fade); }
    .what { flex: 1; min-width: 0; }
    .name { font-size: var(--cb-text-sm); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
    .price { font-family: var(--cb-font-text-bold); font-weight: 700; font-variant-numeric: tabular-nums; }
    @media (min-width: 64rem) { .bar { display: none; } }
  `];

  connectedCallback() {
    this.target = document.querySelector(this.getAttribute('target') ?? '.add-to-cart__wrapper');
    if (!this.target) return;
    this.render(html`<div class="bar" inert>
      <div class="what"><p class="name">${this.getAttribute('name') ?? ''}</p><p class="price">${this.getAttribute('price') ?? ''}</p></div>
      <button type="button" class="btn btn-primary">Buy</button></div>`);
    this.bar = this.$('.bar');
    this.$('button').addEventListener('click', () => this.goToCart());
    this.observer = new IntersectionObserver(([entry]) => {
      this.show(!entry.isIntersecting && entry.boundingClientRect.bottom < 0);
    });
    this.observer.observe(this.target);
    this.onResize = () => this.reportOffset();
    addEventListener('resize', this.onResize);
    addEventListener('scroll', this.onResize, { passive: true });
  }

  disconnectedCallback() {
    this.observer?.disconnect();
    removeEventListener('resize', this.onResize);
    removeEventListener('scroll', this.onResize);
    document.documentElement.style.setProperty('--cb-bottom-offset', '0px');
  }

  show(on) {
    if (!this.bar) return;
    const yieldToSquare = Boolean(squareStickyCart());
    this.bar.toggleAttribute('data-shown', on && !yieldToSquare);
    this.bar.inert = !on || yieldToSquare;  // off-screen: out of the tab order and the accessibility tree
    this.reportOffset();
  }

  /** How much of the bottom edge is covered by a purchase bar (ours or Square's), for the compare tray. */
  reportOffset() {
    let offset = 0;
    const square = squareStickyCart();
    if (square) {
      const r = square.getBoundingClientRect();
      offset = Math.min(r.height, Math.max(0, innerHeight - r.top));
    } else if (this.bar?.hasAttribute('data-shown')) {
      offset = this.bar.offsetHeight;
    }
    const value = `${Math.round(offset)}px`;
    if (value !== this.lastOffset) document.documentElement.style.setProperty('--cb-bottom-offset', (this.lastOffset = value));
  }

  goToCart() {
    const still = matchMedia('(prefers-reduced-motion: reduce)').matches;
    this.target.scrollIntoView({ behavior: still ? 'auto' : 'smooth', block: 'center' });
    const control = this.target.querySelector('select, input:not([type=hidden]), button');
    control?.focus({ preventScroll: true });
  }
}

/**
 * The first answers a shopper wants, under the price: what kind of bike, how far, what powers it,
 * what it weighs. Unknowns say so. The full panel stays further down for anyone who wants it all.
 */
export class CbKeyFacts extends CbElement {
  static styles = [css`
    :host { margin-block: var(--cb-space-4) var(--cb-space-5); }
    .type { font-family: var(--cb-font-text-medium); margin-bottom: var(--cb-space-3); }
    dl { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: var(--cb-space-3); }
    @media (min-width: 30rem) { dl { grid-template-columns: repeat(4, minmax(0, 1fr)); } }
    dl > div { padding: var(--cb-space-3); border-radius: var(--cb-radius-md); background: var(--cb-surface-alt); }
    dd { margin-top: var(--cb-space-1); font-family: var(--cb-font-text-bold); font-weight: 700; font-size: var(--cb-text-lg);
      font-variant-numeric: tabular-nums lining-nums; line-height: var(--cb-leading-snug); }
    dd.unknown { font-family: var(--cb-font-text); font-weight: 400; font-size: var(--cb-text-base); color: var(--cb-text-muted); }
    dd.as-written { font-family: var(--cb-font-text); font-weight: 400; font-size: var(--cb-text-sm); overflow-wrap: anywhere; }
    dd small { display: block; font-family: var(--cb-font-text); font-weight: 400; font-size: var(--cb-text-xs); color: var(--cb-text-muted); }
    .links { display: flex; flex-wrap: wrap; gap: var(--cb-space-1) var(--cb-space-5); margin-top: var(--cb-space-3); font-size: var(--cb-text-sm); }
    .links a, .links button { display: inline-flex; align-items: center; gap: var(--cb-space-2); min-height: var(--cb-target); padding: 0;
      border: 0; background: none; color: var(--cb-blue); text-decoration: underline; text-decoration-thickness: 1px; text-underline-offset: 0.18em; }
  `];

  set specs(specs) { this._specs = specs; if (this.isConnected) this.update(); }
  connectedCallback() { if (this._specs) this.update(); }

  update() {
    const f = this._specs.fields;
    const energy = f.battery?.energy;
    const fact = (label, value, note = '', plain = false) => value
      ? html`<div><dt class="label">${label}</dt><dd class="${plain ? 'as-written' : ''}">${value}${note ? html`<small>${note}</small>` : ''}</dd></div>`
      : html`<div><dt class="label">${label}</dt><dd class="unknown">Not listed</dd></div>`;
    // Stated, but not as one comparable figure (two weights, a range that needs a second battery): as written.
    const asWritten = (label, field) => fact(label, field ? typeset(field.raw) : '', '', true);
    const wh = energy ? `${energy.min === energy.max ? number(energy.min) : `${number(energy.min)}–${number(energy.max)}`}\u00a0Wh` : '';
    this.render(html`${f.type ? html`<p class="type">${typeset(f.type.raw)}</p>` : ''}
      <dl>
        ${f.range?.min != null ? fact('Range', quantity(f.range), `manufacturer’s figure${f.range.note ? `, ${typeset(f.range.note)}` : ''}`) : asWritten('Range', f.range)}
        ${f.ratedPower?.min != null ? fact('Motor', quantity(f.ratedPower), f.ratedPower.note ? typeset(f.ratedPower.note) : '') : asWritten('Motor', f.ratedPower)}
        ${wh ? fact('Battery', wh, energy.source === 'calculated' ? 'from volts × amp-hours' : '') : asWritten('Battery', f.battery)}
        ${f.weight?.min != null ? fact('Weight', quantity(f.weight), f.weight.note ? typeset(f.weight.note) : '') : asWritten('Weight', f.weight)}
      </dl>
      <p class="links"><button type="button" class="all">All specifications</button>
        <a href="${config.links.booking}">${icon('calendar')}Book a free test ride</a></p>`);
    this.$('.all').addEventListener('click', () => {
      const panel = document.querySelector('cb-spec-panel');
      if (!panel) return;
      panel.scrollIntoView({ behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth', block: 'start' });
      panel.focusHeading?.();
    });
  }
}

define('cb-spec-panel', CbSpecPanel);
define('cb-key-facts', CbKeyFacts);
define('cb-range-explainer', CbRangeExplainer);
define('cb-box-notice', CbBoxNotice);
define('cb-buy-bar', CbBuyBar);
