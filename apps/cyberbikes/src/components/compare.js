// The compare tray and the comparison sheet. One <cb-compare> per page: the tray appears once a bike
// is picked and follows the shopper between pages; the sheet sets up to three bikes side by side.

import { CbElement, css, define, html, icon, ruler, rulerScale } from '../ui.js';
import { battery, price, quantity, typeset } from '../format.js';
import { loadProduct } from '../catalogue.js';
import { clearCompare, compareIds, MAX_COMPARE, pruneCompare, removeCompare } from '../compare-store.js';
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

/** Somewhere sensible for focus when the control that had it disappears. */
function focusMain() {
  const main = document.querySelector('main') ?? document.body;
  if (!main.hasAttribute('tabindex')) main.setAttribute('tabindex', '-1');
  main.focus({ preventScroll: true });
}

function cellText(key, f) {
  if (!f) return null;
  if (key === 'battery') return battery(f);
  return f.unit && f.min != null ? quantity(f) : typeset(f.raw);
}

export class CbCompare extends CbElement {
  static styles = [css`
    :host { display: contents; }
    .tray {
      /* Above Square's own layers, below chat widgets, which keep their own corner. */
      position: fixed; z-index: 9000; left: 50%; bottom: var(--cb-space-3);
      translate: -50% 0;
      transform: translateY(calc(var(--cb-bottom-offset, 0px) * -1));
      width: min(100% - 2 * var(--cb-space-3), 46rem);
      display: flex; align-items: center; gap: var(--cb-space-3);
      padding: var(--cb-space-2) var(--cb-space-2) var(--cb-space-2) var(--cb-space-4);
      border-radius: var(--cb-radius-pill);
      background: var(--cb-ink); color: var(--cb-paper);
      box-shadow: 0 0 0 1px rgb(255 255 255 / 0.16), var(--cb-shadow-overlay);  /* a hairline so it reads on dark footers */
      /* Rises from the bottom edge when the first bike is picked; follows the buy bar up and down. */
      transition: transform var(--cb-dur-state) var(--cb-ease-move), opacity var(--cb-dur-fade) linear;
      @starting-style { transform: translateY(calc(100% + var(--cb-space-3))); opacity: 0; }
    }
    /* Leaves the way it came, faster than it arrived. */
    .tray[hidden] {
      display: none;
      transform: translateY(calc(100% + var(--cb-space-3)));
      opacity: 0;
      transition: transform var(--cb-dur-exit) var(--cb-ease-move), opacity var(--cb-dur-exit) linear,
        display var(--cb-dur-exit) allow-discrete;
    }
    .tray-count { font-family: var(--cb-font-text-medium); white-space: nowrap; }
    .thumbs { display: flex; gap: var(--cb-space-2); flex: 1; min-width: 0; }
    .thumb { position: relative; width: 2.75rem; height: 2.75rem; border-radius: 50%; background: var(--cb-sand-50); overflow: hidden; flex: none; }
    .thumb img { width: 100%; height: 100%; object-fit: contain; mix-blend-mode: multiply; }
    .tray .btn-quiet { color: var(--cb-paper); }
    .tray .btn-primary[aria-disabled="true"] { background: var(--cb-ink-800); color: var(--cb-sand-400); cursor: not-allowed; }
    @media (hover: hover) and (pointer: fine) { .tray .btn-quiet:hover { background: var(--cb-ink-800); } }
    .tray .clear { width: var(--cb-target); padding: 0; }
    /* Phones: keep clear of the bottom-right corner, where chat buttons live. */
    @media (max-width: 47.99rem) {
      .tray { left: var(--cb-space-3); right: 5.5rem; width: auto; translate: none; }
    }
    @media (max-width: 30rem) { .thumbs { display: none; } .tray-count { flex: 1; } }

    dialog {
      width: min(100%, 72rem); max-width: 100%; max-height: min(100%, 56rem); margin: auto;
      padding: 0; border: 0; border-radius: var(--cb-radius-xl);
      background: var(--cb-paper); color: var(--cb-text);
      box-shadow: var(--cb-shadow-overlay);
    }
    dialog::backdrop { background: rgb(28 28 28 / 0.55); }
    @media (max-width: 47.99rem) { dialog { width: 100%; height: 100%; max-height: 100%; border-radius: 0; } }
    /* A fixed height, so the table scrolls inside the sheet and the header row stays in view. */
    @media (min-width: 48rem) { dialog { height: min(100%, 56rem); } }

    /* Opening: the sheet scales up from just under full size (a modal stays centred); on phones it
       rises from the bottom edge and leaves the same way. Closing is faster than opening. */
    dialog, dialog::backdrop {
      transition: opacity var(--cb-dur-exit) linear, transform var(--cb-dur-exit) var(--cb-ease-out),
        overlay var(--cb-dur-exit) allow-discrete, display var(--cb-dur-exit) allow-discrete;
    }
    dialog { opacity: 0; transform: scale(0.97); }
    dialog[open] { opacity: 1; transform: none; transition-duration: var(--cb-dur-fade), var(--cb-dur-state), var(--cb-dur-state), var(--cb-dur-state); }
    dialog::backdrop { opacity: 0; }
    dialog[open]::backdrop { opacity: 1; }
    @starting-style {
      dialog[open] { opacity: 0; transform: scale(0.97); }
      dialog[open]::backdrop { opacity: 0; }
    }
    @media (max-width: 47.99rem) {
      dialog { transform: translateY(100%); }
      dialog[open] { transition-duration: var(--cb-dur-fade), var(--cb-dur-move), var(--cb-dur-move), var(--cb-dur-move);
        transition-timing-function: linear, var(--cb-ease-move); }
      @starting-style { dialog[open] { transform: translateY(100%); } }
    }
    .sheet { display: flex; flex-direction: column; height: 100%; max-height: inherit; }
    header {
      display: grid; grid-template-columns: 1fr auto auto; align-items: center; gap: var(--cb-space-2) var(--cb-space-5);
      padding: var(--cb-space-4) var(--cb-gutter); border-bottom: var(--cb-border-w) solid var(--cb-border);
    }
    header h2 { font-size: var(--cb-text-xl); }
    header h2:focus { outline: none; }
    @media (max-width: 30rem) { header { padding-block: var(--cb-space-2); } .bike .media { max-height: 4rem; } }
    @media (max-width: 47.99rem) {
      header { grid-template-columns: 1fr auto; }
      .diff { grid-row: 2; grid-column: 1 / -1; }
    }
    .diff { display: inline-flex; align-items: center; gap: var(--cb-space-2); min-height: var(--cb-target); font-size: var(--cb-text-sm); cursor: pointer; }
    .diff input { width: 1.125rem; height: 1.125rem; accent-color: var(--cb-ink); }
    .close { width: var(--cb-target); padding: 0; border-color: var(--cb-border-control); }
    .scroller { overflow: auto; flex: 1; overscroll-behavior: contain; }
    table { table-layout: fixed; border-collapse: separate; border-spacing: 0; width: 100%; min-width: calc(8rem + var(--n) * 10.5rem); font-variant-numeric: tabular-nums lining-nums; }
    col.labels { width: 9rem; }
    @media (max-width: 47.99rem) { col.labels { width: 7.5rem; } }
    th, td { padding: var(--cb-space-3) var(--cb-space-4); text-align: left; vertical-align: top; border-bottom: var(--cb-border-w) solid var(--cb-border); }
    tbody th[scope="row"] {
      position: sticky; left: 0; z-index: 1;
      background: var(--cb-paper); color: var(--cb-text-muted); font-weight: 400;
    }
    thead th { position: sticky; top: 0; z-index: 2; background: var(--cb-paper); border-bottom-color: var(--cb-ink); }
    thead th.corner { left: 0; z-index: 3; }
    .bike { display: grid; gap: var(--cb-space-2); align-content: start; font-weight: 400; }
    /* Compact, because the header row stays in view while the specs scroll under it. */
    .bike .media { aspect-ratio: 16 / 9; max-height: 7rem; border-radius: var(--cb-radius-lg); background: var(--cb-sand-50); overflow: hidden; }
    .bike img { width: 100%; height: 100%; object-fit: contain; padding: 6%; mix-blend-mode: multiply; }
    .bike-name { font-family: var(--cb-font-text-bold); font-weight: 700; font-size: var(--cb-text-sm); line-height: var(--cb-leading-snug);
      display: -webkit-box; -webkit-box-orient: vertical; -webkit-line-clamp: 2; overflow: hidden; }
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
        <button type="button" class="btn btn-quiet clear" aria-label="Clear the compare list">${icon('close')}</button>
        <button type="button" class="btn btn-primary open" aria-haspopup="dialog">${icon('columns')}<span>Compare</span></button>
      </div>
      <p class="sr-only" role="status" aria-live="polite" id="status"></p>
      <dialog aria-labelledby="cmp-title">
        <div class="sheet">
          <header>
            <h2 class="display" id="cmp-title" tabindex="-1" autofocus>Compare</h2>
            <label class="diff"><input type="checkbox" id="diff"> Only show differences</label>
            <button type="button" class="btn btn-secondary close" aria-label="Close comparison">${icon('close')}</button>
          </header>
          <div class="scroller" tabindex="0" role="region" aria-label="Comparison table"></div>
        </div>
      </dialog>`);
    this.tray = this.$('.tray');
    this.dialog = this.$('dialog');
    this.$('.open').addEventListener('click', () => this.open());
    this.$('.clear').addEventListener('click', () => { focusMain(); clearCompare(); this.say('Compare list cleared.'); });
    this.$('.close').addEventListener('click', () => this.dialog.close());
    this.$('#diff').addEventListener('change', () => {
      const { shown, total } = this.renderTable();
      this.say(shown === total ? `Showing all ${total} rows.` : `Showing the ${shown} of ${total} rows that differ.`);
    });
    this.dialog.addEventListener('click', e => { if (e.target === this.dialog) this.dialog.close(); });
    this.dialog.addEventListener('close', () => {
      const back = this.returnFocus;
      if (back?.isConnected && back.offsetParent !== null) back.focus(); else focusMain();
    });
    this.root.addEventListener('click', e => {
      const button = e.target.closest('[data-remove]');
      if (!button) return;
      this.refocusRemove = [...this.$$('[data-remove]')].indexOf(button);
      removeCompare(button.dataset.remove);
      const left = compareIds().length;
      this.say(`${button.dataset.name} removed. ${left === 1 ? '1 bike' : `${left} bikes`} left to compare.`);
    });
    this.onChange = () => this.refresh();
    this.onAnnounce = e => this.say(e.detail.message);
    this.onOpen = e => this.open(e.detail?.from);
    window.addEventListener('cb-compare-change', this.onChange);
    window.addEventListener('cb-announce', this.onAnnounce);
    window.addEventListener('cb-compare-open', this.onOpen);
    this.bikes = new Map();
    this.refresh();
  }

  disconnectedCallback() {
    window.removeEventListener('cb-compare-change', this.onChange);
    window.removeEventListener('cb-announce', this.onAnnounce);
    window.removeEventListener('cb-compare-open', this.onOpen);
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
      const gone = [];
      loaded.forEach((r, i) => {
        if (r.status === 'fulfilled' && r.value) this.bikes.set(missing[i], r.value);
        // Deleted or unpublished since it was picked: free its slot. A network failure keeps it.
        else if ((r.status === 'fulfilled' && !r.value) || / 404$/.test(r.reason?.message ?? '')) gone.push(missing[i]);
      });
      if (gone.length) { pruneCompare(ids.filter(id => !gone.includes(id))); return; }
    }
    const chosen = this.selected();
    this.tray.hidden = chosen.length === 0;
    // Keyboard focus never lands under the tray: scrolling leaves room for it.
    const offset = parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--cb-bottom-offset')) || 0;
    document.documentElement.style.scrollPaddingBottom = chosen.length ? `${this.tray.offsetHeight + offset + 24}px` : '';
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

  open(from) {
    if (this.selected().length < 2) { this.say('Pick at least two bikes to compare.'); return; }
    this.returnFocus = from ?? this.root.activeElement ?? document.activeElement;
    this.renderTable();
    this.dialog.showModal();
  }

  renderTable() {
    const bikes = this.selected();
    const onlyDiff = this.$('#diff').checked;
    const scroller = this.$('.scroller');
    if (!bikes.length) { scroller.innerHTML = html`<p class="empty">No bikes chosen.</p>`.value; return { shown: 0, total: 0 }; }
    let total = 0;
    const rangeScale = rulerScale(bikes.map(b => b.specs.fields.range?.max));
    const row = key => {
      const cells = bikes.map(b => cellText(key, b.specs.fields[key]));
      total++;
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
      <colgroup><col class="labels">${bikes.map(() => html`<col>`)}</colgroup>
      <thead><tr><th class="corner" scope="col"><span class="sr-only">Specification</span></th>${bikes.map(b => html`<th scope="col"><div class="bike">
        <div class="media">${b.images[0] ? html`<img src="${b.images[0].src}" srcset="${b.images[0].srcset}" sizes="12rem" alt="" width="${b.images[0].width}" height="${b.images[0].height}">` : ''}</div>
        <span class="bike-name" title="${b.name}">${b.name}</span>
        <span class="num">${b.priceHigh > b.price ? 'From ' : ''}${price(b.price)}</span>
        <span class="bike-actions"><a class="link" href="${b.url}">View bike</a>
          <button type="button" data-remove="${b.id}" data-name="${b.name}">Remove<span class="sr-only"> ${b.name}</span></button></span>
      </div></th>`)}</tr></thead>
      <tbody>${groups}</tbody></table>`.value;
    // After a removal, focus the Remove button now in that column, or the last one.
    if (this.refocusRemove != null) {
      const buttons = this.$$('[data-remove]');
      (buttons[Math.min(this.refocusRemove, buttons.length - 1)] ?? this.$('.close')).focus();
      this.refocusRemove = null;
    }
    return { shown: this.$$('tbody tr:not(.group)').length, total };
  }
}

define('cb-compare', CbCompare);
