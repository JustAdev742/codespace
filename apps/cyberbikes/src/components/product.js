// Product page components: the spec panel (with the range explainer), the bike-in-box notice and the
// mobile buy bar.

import { CbElement, css, define, html, icon, ruler, rulerScale } from '../ui.js';
import { battery, phoneDisplay, quantity, typeset } from '../format.js';
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
  if (field.unit && field.min != null) return quantity(field);
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
    h2 { font-size: var(--cb-text-xl); margin-bottom: var(--cb-space-2); }
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
      const range = key === 'range' && f?.min != null ? html`<div class="range-ruler">${ruler(f, rulerScale([f.max]), { ticks: true })}</div>
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

/**
 * On phones, once the shopper scrolls past Square's own add-to-cart section, a slim bar keeps the
 * price and a way back to it in reach. It never adds to the cart itself: options and delivery are
 * chosen in Square's form, so the button takes the shopper there.
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
      transform: translateY(110%);
      transition: transform var(--cb-dur-state) var(--cb-ease-out);
    }
    .bar[data-shown] { transform: none; }
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
  }

  disconnectedCallback() { this.observer?.disconnect(); this.show(false); }

  show(on) {
    if (!this.bar) return;
    this.bar.toggleAttribute('data-shown', on);
    this.bar.inert = !on;  // hidden off-screen, so keep it out of the tab order and the accessibility tree
    document.documentElement.style.setProperty('--cb-bottom-offset', on ? `${this.bar.offsetHeight}px` : '0px');
  }

  goToCart() {
    const still = matchMedia('(prefers-reduced-motion: reduce)').matches;
    this.target.scrollIntoView({ behavior: still ? 'auto' : 'smooth', block: 'center' });
    const control = this.target.querySelector('select, input:not([type=hidden]), button');
    control?.focus({ preventScroll: true });
  }
}

define('cb-spec-panel', CbSpecPanel);
define('cb-range-explainer', CbRangeExplainer);
define('cb-box-notice', CbBoxNotice);
define('cb-buy-bar', CbBuyBar);
