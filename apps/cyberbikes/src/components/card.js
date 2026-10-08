// The bike card used by the finder, the bike rows and the comparison suggestions. A function, not an
// element: a grid of 70 cards should not mean 70 shadow roots.

import { css, html, icon, ruler } from '../ui.js';
import { price, quantity } from '../format.js';

const SIZES = '(min-width: 75rem) 18rem, (min-width: 48rem) 30vw, (min-width: 30rem) 45vw, 90vw';

/*
 * Most supplier photos are cut-outs on white, which sit on the sand ground through multiply. About one
 * in five first photos is a backdrop or a scene instead; those fill their frame. The four corners of a
 * 12 px copy tell the two apart once the image loads (the CDN allows reading images cross-origin).
 */
let probe = null;
function fit(img) {
  try {
    probe ??= document.createElement('canvas');
    probe.width = probe.height = 12;
    const g = probe.getContext('2d', { willReadFrequently: true });
    g.drawImage(img, 0, 0, 12, 12);
    const d = g.getImageData(0, 0, 12, 12).data;
    const corner = (x, y) => { const i = (y * 12 + x) * 4; return (d[i] + d[i + 1] + d[i + 2]) / 3; };
    if ([corner(0, 0), corner(11, 0), corner(0, 11), corner(11, 11)].some(v => v < 238)) img.parentElement.classList.add('photo');
  } catch { /* unreadable: keep the cut-out treatment */ }
}

/** Watches every photo marked .fit inside `root` and frames it by what it shows. */
export function fitPhotos(root) {
  root.addEventListener('load', e => { if (e.target.classList?.contains('fit')) fit(e.target); }, true);
}

function factValue(field) {
  if (!field) return html`<span class="muted">Not listed</span>`;
  if (field.min == null) return html`<span class="muted">See specs</span>`;
  return quantity(field);
}

export function priceHTML(bike) {
  if (bike.price == null) return '';
  return html`<p class="price num">${bike.priceHigh > bike.price ? html`<span class="price-from">From</span> ` : ''}<strong>${price(bike.price)}</strong>${
    bike.regularPrice ? html` <s class="muted"><span class="sr-only">was </span>${price(bike.regularPrice)}</s>` : ''}</p>`;
}

/**
 * @param bike     from catalogue.js
 * @param scale    ruler scale shared by the whole grid, so ranges compare at a glance
 * @param compare  null for no compare button, else whether this bike is already being compared
 */
export function cardHTML(bike, { scale = 150, compare = null, heading = 'h3', eager = false } = {}) {
  const s = bike.specs.fields;
  const img = bike.images[0];
  const badge = bike.stock === 'out' ? 'Sold out' : bike.onSale ? 'Sale' : bike.stock === 'low' ? 'Low stock' : '';
  return html`<article class="card">
    <div class="card-media">${img ? html`<img class="fit" src="${img.src}" srcset="${img.srcset}" sizes="${SIZES}" alt=""
      width="${img.width}" height="${img.height}" crossorigin="anonymous" ${eager ? '' : html`loading="lazy" `}decoding="async">` : ''}${
      badge ? html`<span class="card-badge label">${badge}</span>` : ''}</div>
    <div class="card-body">
      ${bike.brand ? html`<p class="label">${bike.brand}</p>` : ''}
      <${heading} class="card-title title"><a class="card-link" href="${bike.url}"><span>${bike.name}</span></a></${heading}>
      <dl class="card-facts">
        <div><dt class="label">Motor</dt><dd class="num">${factValue(s.ratedPower)}</dd></div>
        <div><dt class="label">Range</dt><dd class="num">${factValue(s.range)}</dd></div>
        <div><dt class="label">Weight</dt><dd class="num">${factValue(s.weight)}</dd></div>
      </dl>
      ${ruler(s.range, scale, { size: 'sm' })}
      <div class="card-foot">
        ${priceHTML(bike)}
        ${compare == null ? '' : html`<button type="button" class="card-compare btn btn-secondary" data-compare="${bike.id}"
          aria-pressed="${compare ? 'true' : 'false'}" aria-label="Compare ${bike.name}">${icon(compare ? 'check' : 'plus')}<span>Compare</span></button>`}
      </div>
    </div>
  </article>`;
}

/** Brings every compare button inside `root` up to date: pressed state and icon together. */
export function syncCompareButtons(root, ids) {
  for (const button of root.querySelectorAll('[data-compare]')) {
    const on = ids.includes(button.dataset.compare);
    if (button.getAttribute('aria-pressed') === String(on)) continue;
    button.setAttribute('aria-pressed', String(on));
    button.querySelector('svg')?.replaceWith(document.createRange().createContextualFragment(icon(on ? 'check' : 'plus').value));
  }
}

export const CARD_CSS = css`
  .card { position: relative; display: flex; flex-direction: column; gap: var(--cb-space-3); min-width: 0; }
  .card-media {
    position: relative; aspect-ratio: 4 / 3; overflow: hidden;
    border-radius: var(--cb-radius-xl); background: var(--cb-sand-50);
  }
  /* Supplier photos are shot on white; multiply lets every bike stand on the same warm ground. */
  .card-media img {
    width: 100%; height: 100%; object-fit: contain; padding: 5%;
    mix-blend-mode: multiply;
    transition: transform var(--cb-dur-state) var(--cb-ease-out);
  }
  .card-media.photo img { object-fit: cover; padding: 0; mix-blend-mode: normal; }
  .card-badge {
    position: absolute; top: var(--cb-space-3); left: var(--cb-space-3);
    padding: var(--cb-space-1) var(--cb-space-2); border-radius: var(--cb-radius-pill);
    background: var(--cb-ink); color: var(--cb-paper);
  }
  .card-body { display: flex; flex-direction: column; gap: var(--cb-space-2); flex: 1; }
  /* Two lines reserved and two shown, so facts and prices line up across a row; the full name is the link's. */
  .card-title { font-size: var(--cb-text-md); min-height: calc(2 * var(--cb-leading-snug) * 1em); }
  .card-link { text-decoration: none; }
  .card-link span { display: -webkit-box; -webkit-box-orient: vertical; -webkit-line-clamp: 2; overflow: hidden; overflow-wrap: anywhere; }
  .card-link::after { content: ''; position: absolute; inset: 0; border-radius: var(--cb-radius-xl); }
  .card-link:focus-visible { outline: none; }
  /* Drawn inside the card so a scrolling row can't clip it. */
  .card-link:focus-visible::after { outline: 2px solid var(--cb-focus); outline-offset: -3px; }
  .card-facts {
    display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: var(--cb-space-2);
    margin-top: var(--cb-space-1); padding-top: var(--cb-space-3); border-top: var(--cb-border-w) solid var(--cb-border);
  }
  .card-facts dd { font-family: var(--cb-font-text-medium); font-size: var(--cb-text-sm); overflow-wrap: anywhere; }
  .card-foot { display: flex; align-items: end; justify-content: space-between; gap: var(--cb-space-3); margin-top: auto; padding-top: var(--cb-space-2); }
  .card-compare { position: relative; z-index: 1; min-height: 2.75rem; padding-inline: var(--cb-space-4); font-size: var(--cb-text-sm); }
  .card-compare[aria-pressed="true"] { background: var(--cb-ink); color: var(--cb-paper); border-color: var(--cb-ink); }
  @media (forced-colors: active) {
    .card-compare[aria-pressed="true"] { forced-color-adjust: none; background: Highlight; color: HighlightText; border-color: Highlight; }
  }
  .price { display: flex; align-items: baseline; flex-wrap: wrap; gap: 0 var(--cb-space-2); font-size: var(--cb-text-lg); }
  .price strong { font-family: var(--cb-font-text-bold); font-weight: 700; }
  .price s { font-size: var(--cb-text-sm); }
  .price-from { font-size: var(--cb-text-sm); color: var(--cb-text-muted); }
  @media (hover: hover) and (pointer: fine) {
    .card:hover .card-media img { transform: scale(var(--cb-hover-scale)); }
    .card:hover .card-link { text-decoration: underline; text-decoration-thickness: 1px; text-underline-offset: 0.18em; }
  }
`;
