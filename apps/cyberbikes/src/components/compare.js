// The compare tray and the comparison sheet. One <cb-compare> per page: the tray appears once a bike
// is picked and follows the shopper between pages; the sheet sets up to three bikes side by side.

import { CbElement, css, define, html, icon, ruler, rulerScale } from '../ui.js';
import { battery, price, quantity, typeset } from '../format.js';
import { loadProduct } from '../catalogue.js';
import { clearCompare, compareIds, MAX_COMPARE, removeCompare } from '../compare-store.js';
import { SPEC_FIELDS } from '../specs.js';

const LABEL = Object.fromEntries(SPEC_FIELDS.map(f => [f.key, f.label]));
const ROWS = [
  ['Motor and battery', ['motor', 'ratedPower', 'peakPower', 'battery', 'chargeTime']],
  ['Performance', ['range', 'topSpeed']],
  ['Frame and ride', ['type', 'frame', 'weight', 'maxLoad', 'wheels', 'brakes', 'suspension', 'gears']],
  ['Warranty and standards', ['warranty', 'standard', 'roadUse']],
];
// Rows drawn as bars on a shared scale, and the number each bar measures.
const BARS = {
  ratedPower: b => b.specs.fields.ratedPower?.max,
  battery: b => b.specs.fields.battery?.energy?.max,
  weight: b => b.specs.fields.weight?.min,
  maxLoad: b => b.specs.fields.maxLoad?.max,
};

function cellText(key, f) {
  if (!f) return null;
  if (key === 'battery') return battery(f);
  return f.unit && f.min != null ? quantity(f) : typeset(f.raw);
}

export class CbCompare extends CbElement {
  static styles = [css`
    :host { display: contents; }
    .tray {
      position: fixed; z-index: 2147482000; left: 50%; bottom: calc(var(--cb-bottom-offset, 0px) + var(--cb-space-3));
      transform: translateX(-50%);
      width: min(100% - 2 * var(--cb-space-3), 46rem);
      display: flex; align-items: center; gap: var(--cb-space-3);
      padding: var(--cb-space-2) var(--cb-space-2) var(--cb-space-2) var(--cb-space-4);
      border-radius: var(--cb-radius-pill);
      background: var(--cb-ink); color: var(--cb-paper);
      box-shadow: var(--cb-shadow-overlay);
      transition: bottom var(--cb-dur-state) var(--cb-ease-out);
    }
    .tray-count { font-family: var(--cb-font-text-medium); white-space: nowrap; }
    .thumbs { display: flex; gap: var(--cb-space-2); flex: 1; min-width: 0; }
    .thumb { position: relative; width: 2.75rem; height: 2.75rem; border-radius: 50%; background: var(--cb-sand-50); overflow: hidden; flex: none; }
    .thumb img { width: 100%; height: 100%; object-fit: contain; mix-blend-mode: multiply; }
    .tray .btn-quiet { color: var(--cb-paper); }
    .tray .btn-primary[aria-disabled="true"] { background: var(--cb-ink-800); color: var(--cb-sand-400); cursor: not-allowed; }
    @media (hover: hover) and (pointer: fine) { .tray .btn-quiet:hover { background: var(--cb-ink-800); } }
    @media (max-width: 30rem) { .tray .clear { display: none; } }

    dialog {
      width: min(100%, 72rem); max-width: 100%; max-height: min(100%, 56rem); margin: auto;
      padding: 0; border: 0; border-radius: var(--cb-radius-xl);
      background: var(--cb-paper); color: var(--cb-text);
      box-shadow: var(--cb-shadow-overlay);
    }
    dialog::backdrop { background: rgb(28 28 28 / 0.55); }
    @media (max-width: 47.99rem) { dialog { width: 100%; height: 100%; max-height: 100%; border-radius: 0; } }
    .sheet { display: flex; flex-direction: column; height: 100%; max-height: inherit; }
    header {
      display: flex; align-items: center; flex-wrap: wrap; gap: var(--cb-space-3) var(--cb-space-5);
      padding: var(--cb-space-4) var(--cb-gutter); border-bottom: var(--cb-border-w) solid var(--cb-border);
    }
    header h2 { font-size: var(--cb-text-xl); margin-right: auto; }
    .diff { display: inline-flex; align-items: center; gap: var(--cb-space-2); min-height: var(--cb-target); font-size: var(--cb-text-sm); cursor: pointer; }
    .diff input { width: 1.125rem; height: 1.125rem; accent-color: var(--cb-ink); }
    .close { width: var(--cb-target); padding: 0; border-color: var(--cb-border-control); }
    .scroller { overflow: auto; flex: 1; overscroll-behavior: contain; }
    table { border-collapse: separate; border-spacing: 0; width: 100%; min-width: calc(8rem + var(--n) * 10.5rem); font-variant-numeric: tabular-nums lining-nums; }
    th, td { padding: var(--cb-space-3) var(--cb-space-4); text-align: left; vertical-align: top; border-bottom: var(--cb-border-w) solid var(--cb-border); }
    tbody th[scope="row"] {
      position: sticky; left: 0; z-index: 1; width: 9rem;
      background: var(--cb-paper); color: var(--cb-text-muted); font-weight: 400;
    }
    thead td, thead th { position: sticky; top: 0; z-index: 2; background: var(--cb-paper); border-bottom-color: var(--cb-ink); }
    thead td { left: 0; z-index: 3; }
    .bike { display: grid; gap: var(--cb-space-2); align-content: start; font-weight: 400; }
    .bike .media { aspect-ratio: 4 / 3; border-radius: var(--cb-radius-lg); background: var(--cb-sand-50); overflow: hidden; }
    .bike img { width: 100%; height: 100%; object-fit: contain; padding: 6%; mix-blend-mode: multiply; }
    .bike-name { font-family: var(--cb-font-text-bold); font-weight: 700; font-size: var(--cb-text-sm); line-height: var(--cb-leading-snug); }
    .bike-actions { display: flex; flex-wrap: wrap; gap: var(--cb-space-1) var(--cb-space-3); font-size: var(--cb-text-sm); }
    .bike-actions button { min-height: 2.75rem; padding: 0; border: 0; background: none; color: var(--cb-text-muted); text-decoration: underline; text-underline-offset: 0.18em; }
    .bike-actions a { display: inline-flex; align-items: center; min-height: 2.75rem; }
    .group th { padding-top: var(--cb-space-6); border-bottom-color: var(--cb-ink); text-align: left; }
    .group th span { position: sticky; left: var(--cb-space-4); }
    td { font-family: var(--cb-font-text-medium); }
    .bar { height: 0.3125rem; margin-top: var(--cb-space-2); border-radius: var(--cb-radius-pill); background: var(--cb-sand-100); overflow: hidden; }
    .bar span { display: block; height: 100%; width: var(--w); background: var(--cb-signal); box-shadow: inset 0 0 0 1px var(--cb-ink); border-radius: inherit; }
    td .ruler { margin-top: var(--cb-space-2); }
    .empty { padding: var(--cb-space-7) var(--cb-gutter); text-align: center; color: var(--cb-text-muted); }
  `];

  connectedCallback() {
    this.render(html`
      <div class="tray on-dark" hidden>
        <p class="tray-count" id="count"></p>
        <div class="thumbs"></div>
        <button type="button" class="btn btn-quiet clear">Clear</button>
        <button type="button" class="btn btn-primary open" aria-haspopup="dialog">${icon('columns')}<span>Compare</span></button>
      </div>
      <p class="sr-only" role="status" aria-live="polite" id="status"></p>
      <dialog aria-labelledby="cmp-title">
        <div class="sheet">
          <header>
            <h2 class="display" id="cmp-title">Compare</h2>
            <label class="diff"><input type="checkbox" id="diff"> Only show differences</label>
            <button type="button" class="btn btn-secondary close" aria-label="Close comparison">${icon('close')}</button>
          </header>
          <div class="scroller" tabindex="0" role="region" aria-labelledby="cmp-title"></div>
        </div>
      </dialog>`);
    this.tray = this.$('.tray');
    this.dialog = this.$('dialog');
    this.$('.open').addEventListener('click', () => this.open());
    this.$('.clear').addEventListener('click', () => { clearCompare(); this.say('Compare list cleared.'); });
    this.$('.close').addEventListener('click', () => this.dialog.close());
    this.$('#diff').addEventListener('change', () => this.renderTable());
    this.dialog.addEventListener('click', e => { if (e.target === this.dialog) this.dialog.close(); });
    this.dialog.addEventListener('close', () => this.returnFocus?.focus());
    this.root.addEventListener('click', e => {
      const button = e.target.closest('[data-remove]');
      if (!button) return;
      removeCompare(button.dataset.remove);
      this.say(`${button.dataset.name} removed from compare.`);
    });
    this.onChange = () => this.refresh();
    this.onAnnounce = e => this.say(e.detail.message);
    window.addEventListener('cb-compare-change', this.onChange);
    window.addEventListener('cb-announce', this.onAnnounce);
    this.bikes = new Map();
    this.refresh();
  }

  disconnectedCallback() {
    window.removeEventListener('cb-compare-change', this.onChange);
    window.removeEventListener('cb-announce', this.onAnnounce);
  }

  say(message) {
    const status = this.$('#status');
    status.textContent = '';
    requestAnimationFrame(() => { status.textContent = message; });
  }

  selected() { return compareIds().map(id => this.bikes?.get(id)).filter(Boolean); }

  /** Loads only the chosen bikes (up to three small requests), never the whole catalogue. */
  async refresh() {
    const ids = compareIds();
    const missing = ids.filter(id => !this.bikes.has(id));
    if (missing.length) {
      const loaded = await Promise.allSettled(missing.map(loadProduct));
      loaded.forEach((r, i) => { if (r.status === 'fulfilled' && r.value) this.bikes.set(missing[i], r.value); });
    }
    const chosen = this.selected();
    this.tray.hidden = chosen.length === 0;
    this.$('#count').textContent = `${chosen.length} of ${MAX_COMPARE}`;
    this.$('.thumbs').innerHTML = html`${chosen.map(b => html`<span class="thumb">${b.images[0]
      ? html`<img src="${b.images[0].thumb}" alt="${b.name}" width="80" height="60">` : ''}</span>`)}`.value;
    const open = this.$('.open');
    open.setAttribute('aria-disabled', String(chosen.length < 2));
    open.querySelector('span').textContent = chosen.length < 2 ? 'Pick one more' : 'Compare';
    if (this.dialog.open) {
      if (chosen.length) this.renderTable(); else this.dialog.close();
    }
  }

  open() {
    if (this.selected().length < 2) { this.say('Pick at least two bikes to compare.'); return; }
    this.returnFocus = this.root.activeElement ?? document.activeElement;
    this.renderTable();
    this.dialog.showModal();
  }

  renderTable() {
    const bikes = this.selected();
    const onlyDiff = this.$('#diff').checked;
    const scroller = this.$('.scroller');
    if (!bikes.length) { scroller.innerHTML = html`<p class="empty">No bikes chosen.</p>`.value; return; }
    const rangeScale = rulerScale(bikes.map(b => b.specs.fields.range?.max));
    const row = key => {
      const cells = bikes.map(b => cellText(key, b.specs.fields[key]));
      if (onlyDiff && new Set(cells.map(c => c ?? '')).size === 1) return '';
      const measure = BARS[key];
      const top = measure ? Math.max(...bikes.map(b => measure(b) ?? 0)) : 0;
      return html`<tr><th scope="row">${LABEL[key]}</th>${bikes.map((b, i) => {
        const text = cells[i];
        let visual = '';
        if (text && key === 'range') visual = ruler(b.specs.fields.range, rangeScale, { size: 'sm' });
        else if (text && measure && measure(b) && top) visual = html`<div class="bar" aria-hidden="true"><span style="--w:${((measure(b) / top) * 100).toFixed(1)}%"></span></div>`;
        return html`<td>${text ?? html`<span class="muted">Not listed</span>`}${visual}</td>`;
      })}</tr>`;
    };
    const groups = ROWS.map(([name, keys]) => {
      const rows = keys.map(row).filter(Boolean);
      return rows.length ? html`<tr class="group"><th colspan="${bikes.length + 1}" scope="colgroup"><span class="label">${name}</span></th></tr>${rows}` : '';
    });
    scroller.innerHTML = html`<table style="--n:${bikes.length}">
      <caption class="sr-only">The bikes you chose, side by side. Figures as stated by each manufacturer.</caption>
      <thead><tr><td></td>${bikes.map(b => html`<th scope="col"><div class="bike">
        <div class="media">${b.images[0] ? html`<img src="${b.images[0].src}" srcset="${b.images[0].srcset}" sizes="12rem" alt="" width="${b.images[0].width}" height="${b.images[0].height}">` : ''}</div>
        <span class="bike-name">${b.name}</span>
        <span class="num">${b.priceHigh > b.price ? 'From ' : ''}${price(b.price)}</span>
        <span class="bike-actions"><a class="link" href="${b.url}">View bike</a>
          <button type="button" data-remove="${b.id}" data-name="${b.name}">Remove<span class="sr-only"> ${b.name}</span></button></span>
      </div></th>`)}</tr></thead>
      <tbody>${groups}</tbody></table>`.value;
  }
}

define('cb-compare', CbCompare);
