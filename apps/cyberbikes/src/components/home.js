// Homepage sections: the hero, shop by ride, a row of bikes and the showroom. Copy is set through
// attributes so the owner can change it in Square without touching code; the defaults only say what
// the catalogue and the shop's own pages already show to be true.

import { CbElement, charge, css, define, html, icon, prose, ruler, rulerScale } from '../ui.js';
import { cardHTML, CARD_CSS, fitPhotos, priceHTML } from './card.js';
import { facts, loadBikes } from '../catalogue.js';
import { bindCompareButtons, compareIds } from '../compare-store.js';
import { RIDE_USES } from './finder.js';
import { config } from '../config.js';
import { phoneDisplay, quantity } from '../format.js';

const SECTION_CSS = css`
  :host { padding-block: var(--cb-space-8); }
  .inner { max-width: var(--cb-content-max); margin-inline: auto; padding-inline: var(--cb-gutter); }
  .section-head { display: flex; flex-wrap: wrap; align-items: baseline; justify-content: space-between; gap: var(--cb-space-3); margin-bottom: var(--cb-space-6); }
  h2.display { font-size: var(--cb-text-3xl); }
  .more { display: inline-flex; align-items: center; gap: var(--cb-space-2); min-height: var(--cb-target); font-family: var(--cb-font-text-medium); text-decoration: none; }
  @media (hover: hover) and (pointer: fine) { .more:hover { text-decoration: underline; text-underline-offset: 0.18em; } }
`;

export class CbHero extends CbElement {
  static styles = [css`
    :host { padding-block: var(--cb-space-7) var(--cb-space-8); }
    .inner {
      max-width: var(--cb-content-max); margin-inline: auto; padding-inline: var(--cb-gutter);
      display: grid; gap: var(--cb-space-7); align-items: center;
    }
    @media (min-width: 60rem) { .inner { grid-template-columns: minmax(0, 1fr) minmax(0, 1fr); gap: var(--cb-space-8); } }
    .copy { container-type: inline-size; }
    .eyebrow { color: var(--cb-text); }
    /* Mortend is very wide: size the headline to its column so the longest word always fits. */
    .copy > .display { font-size: min(4.5rem, 11.5cqi); margin-top: var(--cb-space-4); overflow-wrap: break-word; }
    .lede { margin-top: var(--cb-space-5); font-size: var(--cb-text-lg); line-height: var(--cb-leading-snug); max-width: 30ch; }
    .stat { margin-top: var(--cb-space-4); color: var(--cb-text-muted); }
    .ctas { display: flex; flex-wrap: wrap; gap: var(--cb-space-3); margin-top: var(--cb-space-6); }
    figure { display: grid; gap: var(--cb-space-4); }
    .media { aspect-ratio: 4 / 3; border-radius: var(--cb-radius-xl); background: var(--cb-sand-50); overflow: hidden; }
    .media img { width: 100%; height: 100%; object-fit: contain; padding: 4%; mix-blend-mode: multiply; }
    /* A photograph rather than a cut-out: fill the frame, no blending. */
    .media.cover img { object-fit: cover; padding: 0; mix-blend-mode: normal; object-position: var(--pos, center); }
    figcaption { display: grid; gap: var(--cb-space-3); }
    .bike { display: flex; flex-wrap: wrap; align-items: baseline; justify-content: space-between; gap: var(--cb-space-2) var(--cb-space-4); }
    .bike a { font-family: var(--cb-font-text-bold); font-weight: 700; text-decoration: none; }
    @media (hover: hover) and (pointer: fine) { .bike a:hover { text-decoration: underline; text-underline-offset: 0.18em; } }
    .measure { display: grid; gap: var(--cb-space-2); }
    .measure-head { display: flex; align-items: baseline; gap: var(--cb-space-3); }
    .measure strong { font-family: var(--cb-font-text-bold); font-size: var(--cb-text-2xl); font-variant-numeric: tabular-nums lining-nums; }
    .measure-note { font-size: var(--cb-text-sm); color: var(--cb-text-muted); }
    .price { font-size: var(--cb-text-base); }
    .price strong { font-family: var(--cb-font-text-bold); }
  `, css`.price { display: flex; gap: var(--cb-space-2); align-items: baseline; } .price s { font-size: var(--cb-text-sm); }`];

  connectedCallback() {
    const a = name => this.getAttribute(name);
    const level = a('heading-level') === '2' ? 'h2' : 'h1';
    this.render(html`<div class="inner">
      <div class="copy">
        <p class="label eyebrow">${a('eyebrow') ?? 'E-bike showroom · Leichhardt, Sydney'}</p>
        <${level} class="display">${a('headline') ?? 'E-bikes, measured.'}</${level}>
        <p class="lede">${prose(a('lede') ?? 'Compare power, battery and range side by side, then take the one you like for a free test ride in Leichhardt.')}</p>
        <p class="stat num" aria-live="polite"></p>
        <div class="ctas">
          <a class="btn btn-primary" href="${a('primary-href') ?? config.links.finder}">${a('primary-label') ?? 'Find your bike'}${icon('arrow')}</a>
          <a class="btn btn-secondary" href="${a('secondary-href') ?? config.links.booking}">${a('secondary-label') ?? 'Book a free test ride'}</a>
        </div>
      </div>
      <figure hidden></figure>
    </div>`);
    loadBikes().then(bikes => {
      const brands = new Set(bikes.map(b => b.brand).filter(Boolean));
      this.$('.stat').textContent = `${bikes.length} e-bikes from ${brands.size} brands`;
      const bike = bikes.find(b => b.id === a('bike')) ?? bikes.find(b => facts.range(b) != null && b.images.length);
      if (!bike?.images.length) return;
      const range = bike.specs.fields.range;
      // Which photo, and whether it is a cut-out (contain) or a photograph that fills the frame (cover).
      const img = bike.images[Number(a('image') ?? 0)] ?? bike.images[0];
      const cover = a('image-fit') === 'cover';
      const figure = this.$('figure');
      figure.innerHTML = html`<div class="media${cover ? ' cover' : ''}" style="--pos:${a('image-position') ?? 'center'}"><img src="${img.src}" srcset="${img.srcset}" sizes="(min-width: 60rem) 40rem, 100vw"
          alt="${bike.name}" width="${img.width}" height="${img.height}" fetchpriority="high"></div>
        <figcaption>
          <div class="bike"><a href="${bike.url}">${bike.name}</a>${priceHTML(bike)}</div>
          ${range?.min != null ? html`<div class="measure"><p class="measure-head"><span class="label">Range</span><strong>${quantity(range)}</strong></p>
            ${ruler(range, rulerScale([range.max]), { ticks: true, size: 'lg', animate: true })}<p class="measure-note">Manufacturer’s figure</p></div>` : ''}
        </figcaption>`.value;
      figure.hidden = false;
      charge(this.root);
    }).catch(() => { /* the copy and buttons stand on their own */ });
  }
}

export class CbRideTypes extends CbElement {
  static styles = [SECTION_CSS, css`
    ul { display: grid; grid-template-columns: repeat(auto-fit, minmax(min(100%, 12rem), 1fr)); gap: var(--cb-space-5) var(--cb-space-4); }
    @media (max-width: 30rem) { ul { grid-template-columns: repeat(2, minmax(0, 1fr)); } }
    a { display: grid; gap: var(--cb-space-3); text-decoration: none; border-radius: var(--cb-radius-xl); }
    .media { aspect-ratio: 1; border-radius: var(--cb-radius-xl); background: var(--cb-sand-50); overflow: hidden; }
    .media img { width: 100%; height: 100%; object-fit: contain; padding: 8%; mix-blend-mode: multiply; transition: transform var(--cb-dur-state) var(--cb-ease-out); }
    .media.photo img { object-fit: cover; padding: 0; mix-blend-mode: normal; }
    .name { font-family: var(--cb-font-text-bold); font-weight: 700; line-height: var(--cb-leading-snug); }
    .n { color: var(--cb-text-muted); font-size: var(--cb-text-sm); }
    @media (hover: hover) and (pointer: fine) { a:hover .media img { transform: scale(var(--cb-hover-scale)); } a:hover .name { text-decoration: underline; text-underline-offset: 0.18em; } }
  `];

  connectedCallback() {
    this.hidden = true;
    loadBikes().then(bikes => {
      const tiles = RIDE_USES.map(use => {
        const list = bikes.filter(b => facts.tags(b).some(t => use.tags.includes(t))).sort((x, y) => x.price - y.price);
        return { use, list };
      }).filter(t => t.list.length >= 2);
      if (!tiles.length) return;  // types not listed yet: show nothing rather than empty tiles
      fitPhotos(this.root);
      const finder = this.getAttribute('finder-href') ?? config.links.finder;
      this.render(html`<div class="inner">
        <div class="section-head"><h2 class="display">${this.getAttribute('heading') ?? 'Shop by ride'}</h2></div>
        <ul role="list">${tiles.map(({ use, list }) => {
          const img = list.find(b => b.images.length)?.images[0];
          return html`<li><a href="${finder}?use=${use.id}">
            <div class="media">${img ? html`<img class="fit" src="${img.thumb.replace('width=160', 'width=640')}" alt="" width="${img.width}" height="${img.height}" crossorigin="anonymous" loading="lazy" decoding="async">` : ''}</div>
            <span><span class="name">${use.label}</span><br><span class="n">${list.length} bikes</span></span></a></li>`;
        })}</ul></div>`);
      this.hidden = false;
    }).catch(() => {});
  }
}

export class CbBikeRow extends CbElement {
  static styles = [SECTION_CSS, CARD_CSS, css`
    .row { display: grid; grid-auto-flow: column; grid-auto-columns: min(78%, 17rem); gap: var(--cb-space-5);
      overflow-x: auto; scroll-snap-type: x mandatory; overscroll-behavior-x: contain; padding-bottom: var(--cb-space-4);
      scrollbar-width: thin; }
    .row > li { scroll-snap-align: start; }
    @media (min-width: 64rem) { .row { grid-auto-flow: row; grid-template-columns: repeat(4, minmax(0, 1fr)); overflow: visible; } }
  `];

  connectedCallback() {
    this.hidden = true;
    loadBikes().then(bikes => {
      const show = this.getAttribute('show') ?? 'sale';
      let list;
      if (show.startsWith('ids:')) list = show.slice(4).split(',').map(id => bikes.find(b => b.id === id.trim())).filter(Boolean);
      else if (show.startsWith('brand:')) list = bikes.filter(b => b.brand === show.slice(6));
      else list = bikes.filter(b => b.onSale).sort((x, y) => (y.regularPrice - y.price) - (x.regularPrice - x.price));
      list = list.slice(0, Number(this.getAttribute('limit') ?? 8));
      if (!list.length) return;
      const ids = compareIds();
      const scale = rulerScale(list.map(facts.range));
      const more = this.getAttribute('more-href');
      this.render(html`<div class="inner">
        <div class="section-head"><h2 class="display">${this.getAttribute('heading') ?? 'On sale now'}</h2>
          ${more ? html`<a class="more" href="${more}">${this.getAttribute('more-label') ?? 'See all'}${icon('arrow')}</a>` : ''}</div>
        <ul class="row" role="list">${list.map(b => html`<li>${cardHTML(b, { scale, compare: ids.includes(b.id) })}</li>`)}</ul>
      </div>`);
      bindCompareButtons(this.root, new Map(bikes.map(b => [b.id, b])));
      fitPhotos(this.root);
      window.addEventListener('cb-compare-change', () => this.$$('[data-compare]').forEach(button =>
        button.setAttribute('aria-pressed', String(compareIds().includes(button.dataset.compare)))));
      this.hidden = false;
    }).catch(() => {});
  }
}

export class CbVisit extends CbElement {
  static styles = [css`
    :host { padding: var(--cb-space-7) var(--cb-gutter); }
    /* A contained panel, not a full-bleed band: it sits right in any Square section width. */
    .inner {
      max-width: var(--cb-content-max); margin-inline: auto; padding: var(--cb-space-8) clamp(var(--cb-space-5), 5vw, var(--cb-space-8));
      display: grid; gap: var(--cb-space-7); border-radius: var(--cb-radius-xl);
      background: var(--cb-ink); color: var(--cb-paper);
    }
    @media (min-width: 60rem) { .inner { grid-template-columns: 1fr 1fr; align-items: start; } }
    h2 { font-size: var(--cb-text-3xl); color: var(--cb-paper); }
    .lede { margin-top: var(--cb-space-4); color: var(--cb-sand-200); max-width: 36ch; font-size: var(--cb-text-lg); line-height: var(--cb-leading-snug); }
    address { font-style: normal; font-size: var(--cb-text-lg); line-height: var(--cb-leading-snug); }
    .details { display: grid; gap: var(--cb-space-5); }
    .contact { display: grid; gap: var(--cb-space-1); }
    .contact a { display: inline-flex; align-items: center; gap: var(--cb-space-3); min-height: var(--cb-target); color: var(--cb-paper); text-decoration: none; }
    @media (hover: hover) and (pointer: fine) { .contact a:hover { text-decoration: underline; text-underline-offset: 0.18em; } }
    dl { display: grid; grid-template-columns: auto 1fr; gap: var(--cb-space-1) var(--cb-space-5); color: var(--cb-sand-200); }
    dd { font-variant-numeric: tabular-nums; }
    .ctas { display: flex; flex-wrap: wrap; gap: var(--cb-space-3); }
    .label { color: var(--cb-sand-400); }
  `];

  connectedCallback() {
    const s = config.store;
    const where = `${s.street}, ${s.suburb} ${s.state} ${s.postcode}`;
    const maps = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${s.name}, ${where}`)}`;
    this.render(html`<div class="inner on-dark">
      <div>
        <h2 class="display">${this.getAttribute('heading') ?? 'Visit the showroom'}</h2>
        <p class="lede">${prose(this.getAttribute('lede') ?? 'Ride before you buy: test rides are free. We service e-bikes here too.')}</p>
      </div>
      <div class="details">
        <address>${s.name}<br>${s.street}<br>${s.suburb} ${s.state} ${s.postcode}</address>
        <div class="contact">
          <a href="tel:${s.phone}">${icon('phone')}${phoneDisplay(s.phone)}</a>
          <a href="mailto:${s.email}">${icon('mail')}${s.email}</a>
        </div>
        ${s.hours ? html`<div><p class="label">Opening hours</p><dl>${s.hours.map(([days, time]) => html`<dt>${days}</dt><dd>${time}</dd>`)}</dl></div>` : ''}
        <div class="ctas">
          <a class="btn btn-primary" href="${config.links.booking}">${icon('calendar')}Book a free test ride</a>
          <a class="btn btn-secondary" href="${maps}" target="_blank" rel="noopener">${icon('pin')}Get directions<span class="sr-only"> (opens Google Maps)</span></a>
        </div>
      </div>
    </div>`);
  }
}

define('cb-hero', CbHero);
define('cb-ride-types', CbRideTypes);
define('cb-bike-row', CbBikeRow);
define('cb-visit', CbVisit);
