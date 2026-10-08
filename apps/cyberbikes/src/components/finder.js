// The bike finder. It asks what a shopper knows (how they ride, how far, where, what matters, what
// they can spend), never jargon first, and answers only from the real catalogue: only bikes the shop
// lists, judged only on what their listings state. A bike whose listing is silent on a question is
// never presented as a match; it is counted, and the shopper can choose to see it as "might fit".

import { CbElement, css, define, html, rulerScale } from '../ui.js';
import { cardHTML, CARD_CSS, fitPhotos } from './card.js';
import { facts, loadBikes } from '../catalogue.js';
import { bindCompareButtons, compareIds } from '../compare-store.js';
import { config } from '../config.js';

const ROUGH = ['mountain', 'off-road', 'fat-tyre'];
// Shop by ride (homepage tiles) groups bikes by these; the finder splits terrain into its own question.
export const RIDE_USES = [
  { id: 'commute', label: 'Commuting and errands', tags: ['commuter', 'cruiser'] },
  { id: 'cargo', label: 'Carrying kids or cargo', tags: ['cargo'] },
  { id: 'offroad', label: 'Trails, sand and off-road', tags: ROUGH },
  { id: 'folding', label: 'Folds away for storage', tags: ['folding'] },
  { id: 'trike', label: 'Three wheels', tags: ['trike'] },
  { id: 'kids', label: 'Kids and teens', tags: ['kids'] },
];
const USES = RIDE_USES.filter(u => u.id !== 'offroad');
const DISTANCES = [
  { id: '20', label: 'About 20 km', need: 20 },
  { id: '40', label: 'About 40 km', need: 40 },
  { id: '60', label: 'About 60 km', need: 60 },
  { id: '80', label: '80 km or more', need: 80 },
];
const TERRAINS = [{ id: 'rough', label: 'Gravel, sand or trails', tags: ROUGH }];
const BUDGETS = [
  { id: 'u1500', label: 'Under $1,500', test: p => p < 1500 },
  { id: '1500-2500', label: '$1,500–$2,500', test: p => p >= 1500 && p <= 2500 },
  { id: '2500-4000', label: '$2,500–$4,000', test: p => p > 2500 && p <= 4000 },
  { id: 'o4000', label: 'Over $4,000', test: p => p > 4000 },
];
const MOTORS = [
  { id: '250', label: '250 W', test: w => w <= 250 },
  { id: 'over250', label: 'More than 250 W', test: w => w > 250 },
];
const SORTS = [
  { id: 'price', label: 'Lowest price', value: b => b.price, dir: 1, unknownNote: '' },
  { id: 'range', label: 'Going further', value: facts.range, dir: -1, unknownNote: 'range' },
  { id: 'weight', label: 'Light to carry', value: facts.weight, dir: 1, unknownNote: 'weight' },
  { id: 'battery', label: 'Biggest battery', value: facts.energy, dir: -1, unknownNote: 'battery size' },
];
const QUESTIONS = { use: USES, distance: DISTANCES, terrain: TERRAINS, budget: BUDGETS, motor: MOTORS };

const byTags = (bike, wanted) => {
  const tags = facts.tags(bike).filter(t => t !== 'step-through');
  if (!tags.length) return 'unknown';
  return wanted.some(t => tags.includes(t)) ? 'yes' : 'no';
};

/** 'yes', 'no', 'unknown', or for distance 'top' (reached only at the top of the stated range). */
const TESTS = {
  use: (bike, id) => byTags(bike, USES.find(u => u.id === id).tags),
  terrain: (bike, id) => byTags(bike, TERRAINS.find(t => t.id === id).tags),
  distance(bike, id) {
    const range = bike.specs.fields.range;
    const { need } = DISTANCES.find(d => d.id === id);
    if (range?.min == null) return 'unknown';
    if (range.min >= need) return 'yes';
    return range.max >= need ? 'top' : 'no';
  },
  budget(bike, id) {
    if (bike.price == null) return 'unknown';
    return BUDGETS.find(b => b.id === id).test(bike.price) ? 'yes' : 'no';
  },
  motor(bike, id) {
    const w = facts.power(bike);
    if (w == null) return 'unknown';
    return MOTORS.find(m => m.id === id).test(w) ? 'yes' : 'no';
  },
  step(bike) {
    const s = bike.specs.fields;
    if (facts.tags(bike).includes('step-through')) return 'yes';
    return s.type || s.frame ? 'no' : 'unknown';
  },
};
const WHAT = { use: 'what they’re built for', distance: 'their range', terrain: 'what they’re built for', motor: 'motor power', step: 'frame style' };
const FILTERS = ['use', 'distance', 'terrain', 'budget', 'motor'];

export class CbBikeFinder extends CbElement {
  static styles = [CARD_CSS, css`
    :host { --gap: var(--cb-space-6); }
    .inner { max-width: var(--cb-content-max); margin-inline: auto; padding: var(--cb-space-7) var(--cb-gutter) var(--cb-space-8); }
    .head { max-width: var(--cb-measure); margin-bottom: var(--cb-space-6); }
    .jump { display: none; }
    .results:focus { outline: none; }
    @media (max-width: 63.99rem) { .jump { display: inline-flex; justify-self: start; } }
    h2.display { font-size: var(--cb-text-3xl); }
    .head p { margin-top: var(--cb-space-3); color: var(--cb-text-muted); }
    .layout { display: grid; gap: var(--gap); }
    @media (min-width: 64rem) {
      .layout { grid-template-columns: 21rem 1fr; align-items: start; }
      form { position: sticky; top: var(--cb-space-5); max-height: calc(100vh - 2 * var(--cb-space-5)); overflow: auto; padding: 2px; }
    }
    form { display: grid; gap: var(--cb-space-5); }
    legend { font-family: var(--cb-font-text-bold); font-weight: 700; margin-bottom: var(--cb-space-2); }
    .hint { font-size: var(--cb-text-sm); color: var(--cb-text-muted); margin: calc(-1 * var(--cb-space-1)) 0 var(--cb-space-2); }
    .chips { position: relative; display: flex; flex-wrap: wrap; gap: var(--cb-space-2); }
    .chips input { position: absolute; opacity: 0; pointer-events: none; }
    .chip {
      display: inline-flex; align-items: center; gap: var(--cb-space-2);
      min-height: var(--cb-target); padding: 0 var(--cb-space-4);
      border: var(--cb-border-w) solid var(--cb-border-control); border-radius: var(--cb-radius-pill);
      background: var(--cb-surface); cursor: pointer; font-size: var(--cb-text-sm);
      transition: background-color var(--cb-dur-tap) ease, color var(--cb-dur-tap) ease, transform var(--cb-dur-tap) var(--cb-ease-out);
      -webkit-tap-highlight-color: transparent;
    }
    .chip:active { transform: scale(0.97); }
    @media (prefers-reduced-motion: reduce) { .chip:active { transform: none; } }
    .chip .n { color: var(--cb-text-muted); font-variant-numeric: tabular-nums; }
    .chip[data-zero] { color: var(--cb-text-muted); }
    input:checked + .chip { background: var(--cb-ink); border-color: var(--cb-ink); color: var(--cb-paper); }
    input:checked + .chip .n { color: var(--cb-sand-200); }
    input:focus-visible + .chip { outline: 2px solid var(--cb-focus); outline-offset: 2px; }
    @media (hover: hover) and (pointer: fine) { input:not(:checked) + .chip:hover { background: var(--cb-sand-100); } }
    .check { display: flex; align-items: center; gap: var(--cb-space-3); min-height: var(--cb-target); cursor: pointer; }
    .check input { width: 1.25rem; height: 1.25rem; accent-color: var(--cb-ink); flex: none; }
    details.more { border-top: var(--cb-border-w) solid var(--cb-border); padding-top: var(--cb-space-3); }
    details.more summary {
      display: flex; align-items: center; min-height: var(--cb-target); cursor: pointer;
      font-family: var(--cb-font-text-medium); color: var(--cb-text);
    }
    details.more[open] summary { margin-bottom: var(--cb-space-3); }
    .actions { display: flex; flex-wrap: wrap; gap: var(--cb-space-3); }

    .status { display: flex; flex-wrap: wrap; align-items: baseline; justify-content: space-between; gap: var(--cb-space-2) var(--cb-space-4); margin-bottom: var(--cb-space-5); }
    .count { font-size: var(--cb-text-xl); font-family: var(--cb-font-text-bold); font-weight: 700; }
    .note { font-size: var(--cb-text-sm); color: var(--cb-text-muted); max-width: 46ch; }
    .grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(min(100%, 15.5rem), 1fr)); gap: var(--cb-space-7) var(--cb-space-5); }
    .maybe { margin-top: var(--cb-space-8); padding-top: var(--cb-space-5); border-top: var(--cb-border-w) solid var(--cb-ink); }
    .maybe h3 { font-family: var(--cb-font-text-bold); font-weight: 700; font-size: var(--cb-text-lg); }
    .maybe > p { margin: var(--cb-space-2) 0 var(--cb-space-5); color: var(--cb-text-muted); max-width: var(--cb-measure); }
    .empty { padding: var(--cb-space-6); border-radius: var(--cb-radius-lg); background: var(--cb-surface-alt); max-width: var(--cb-measure); }
    .empty p + p { margin-top: var(--cb-space-3); }
    .skeleton { aspect-ratio: 4 / 3; border-radius: var(--cb-radius-xl); background: var(--cb-sand-100); animation: wait 1.1s ease-in-out infinite alternate; }
    @keyframes wait { from { opacity: 0.55; } to { opacity: 1; } }
    @media (prefers-reduced-motion: reduce) { .skeleton { animation: none; } }
  `];

  connectedCallback() {
    const q = new URLSearchParams(location.search);
    const pick = (name, list) => (list.some(o => o.id === q.get(name)) ? q.get(name) : '');
    this.state = {
      use: pick('use', USES),
      distance: pick('distance', DISTANCES),
      // "Trails, sand and off-road" on the homepage arrives as use=offroad: that is terrain here.
      terrain: q.get('use') === 'offroad' ? 'rough' : pick('terrain', TERRAINS),
      budget: pick('budget', BUDGETS),
      motor: pick('motor', MOTORS),
      step: q.get('step') === '1',
      sort: SORTS.some(s => s.id === q.get('sort')) ? q.get('sort') : 'price',
      maybe: false,
    };
    const radios = (name, options, anyLabel = 'Any') => html`<div class="chips">${(anyLabel ? [{ id: '', label: anyLabel }, ...options] : options).map(o => html`
      <input type="radio" name="${name}" id="${name}-${o.id || 'any'}" value="${o.id}" ${(this.state[name] || '') === o.id ? 'checked' : ''}>
      <label class="chip" for="${name}-${o.id || 'any'}" data-option="${name}:${o.id}">${o.label}<span class="n"></span></label>`)}</div>`;
    this.render(html`<div class="inner">
      <div class="head">
        <h2 class="display">${this.getAttribute('heading') ?? 'Find your bike'}</h2>
        <p>A few questions about how you’ll ride. Every result is a bike we sell, matched on the figures in its own listing.</p>
      </div>
      <div class="layout">
        <form aria-label="Your answers">
          <fieldset><legend>How will you mostly ride it?</legend>${radios('use', USES, 'A bit of everything')}</fieldset>
          <fieldset><legend>How far in a day, there and back?</legend>${radios('distance', DISTANCES, 'Not sure')}</fieldset>
          <fieldset><legend>Where will you ride?</legend>${radios('terrain', TERRAINS, 'Roads and bike paths')}</fieldset>
          <fieldset><legend>What matters most?</legend>${radios('sort', SORTS, null)}
            <label class="check"><input type="checkbox" name="step" ${this.state.step ? 'checked' : ''}> Easy to step on and off (step-through frame)</label></fieldset>
          <fieldset><legend>What’s your budget?</legend>${radios('budget', BUDGETS)}</fieldset>
          <details class="more"${this.state.motor ? ' open' : ''}><summary>More options</summary>
            <fieldset><legend>Motor power</legend><p class="hint">Rated power, as the manufacturer states it.</p>${radios('motor', MOTORS)}</fieldset>
          </details>
          <div class="actions">
            <button type="reset" class="btn btn-secondary">Start again</button>
            <a class="btn btn-primary jump" href="#results">See the bikes</a>
          </div>
        </form>
        <section class="results" id="results" tabindex="-1" aria-labelledby="count" aria-busy="true">
          <div class="status"><p class="count" id="count" role="status">Loading bikes…</p><p class="note"></p></div>
          <div class="list"><div class="grid">${Array.from({ length: 6 }, () => html`<div class="skeleton"></div>`)}</div></div>
        </section>
      </div></div>`);
    // In-page jump inside a shadow root: scroll and move focus to the results ourselves.
    this.$('.jump').addEventListener('click', e => {
      e.preventDefault();
      const results = this.$('#results');
      results.scrollIntoView({ behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' });
      results.focus({ preventScroll: true });
    });
    fitPhotos(this.root);
    const form = this.$('form');
    form.addEventListener('change', e => {
      const { name, value, checked, type } = e.target;
      this.state[name] = type === 'checkbox' ? checked : value;
      this.update();
    });
    form.addEventListener('reset', () => setTimeout(() => {
      Object.assign(this.state, { use: '', distance: '', terrain: '', budget: '', motor: '', step: false, sort: 'price', maybe: false });
      this.update();
    }));
    this.root.addEventListener('change', e => {
      if (e.target.name === 'maybe') { this.state.maybe = e.target.checked; this.update(); }
    });
    this.onCompare = () => this.$$('[data-compare]').forEach(b => this.syncCompareButton(b));
    window.addEventListener('cb-compare-change', this.onCompare);

    loadBikes().then(bikes => {
      this.bikes = bikes;
      bindCompareButtons(this.root, new Map(bikes.map(b => [b.id, b])));
      this.update();
    }).catch(() => {
      this.$('.results').removeAttribute('aria-busy');
      this.$('#count').textContent = 'We couldn’t load the bikes just now.';
      this.$('.list').innerHTML = html`<div class="empty"><p><a class="link" href="${config.links.allBikes}">Browse every e-bike</a> instead.</p></div>`.value;
    });
  }

  disconnectedCallback() { window.removeEventListener('cb-compare-change', this.onCompare); }

  syncCompareButton(button) {
    button.setAttribute('aria-pressed', String(compareIds().includes(button.dataset.compare)));
  }

  /** How one bike answers the current questions, ignoring `skip` (for the option counts). */
  judge(bike, skip) {
    const answers = [];
    for (const name of FILTERS) if (name !== skip && this.state[name]) answers.push([name, TESTS[name](bike, this.state[name])]);
    if (skip !== 'step' && this.state.step) answers.push(['step', TESTS.step(bike)]);
    if (answers.some(([, a]) => a === 'no')) return { verdict: 'no' };
    const unknown = answers.filter(([, a]) => a === 'unknown').map(([n]) => n);
    const top = answers.some(([, a]) => a === 'top');
    return { verdict: unknown.length || top ? 'maybe' : 'yes', unknown, top };
  }

  update() {
    if (!this.bikes) return;
    const { state } = this;
    // Option counts: how many definite matches each answer would give, with the other answers held.
    for (const label of this.$$('[data-option]')) {
      const [name, id] = label.dataset.option.split(':');
      if (!QUESTIONS[name]) continue;
      const n = this.bikes.filter(b => this.judge(b, name).verdict === 'yes' && (!id || TESTS[name](b, id) === 'yes')).length;
      label.querySelector('.n').textContent = ` ${n}`;
      label.toggleAttribute('data-zero', n === 0);
    }
    const sort = SORTS.find(s => s.id === state.sort);
    const byChoice = (a, b) => {
      const va = sort.value(a), vb = sort.value(b);
      if (va == null || vb == null) return (va == null) - (vb == null) || a.price - b.price;
      return (va - vb) * sort.dir || a.price - b.price;
    };
    const judged = this.bikes.map(b => ({ bike: b, ...this.judge(b) }));
    const yes = judged.filter(j => j.verdict === 'yes').map(j => j.bike).sort(byChoice);
    const maybe = judged.filter(j => j.verdict === 'maybe').sort((a, b) => byChoice(a.bike, b.bike));
    const unsaid = [...new Set(maybe.flatMap(j => j.unknown).map(n => WHAT[n]).filter(Boolean))];
    const reasons = [
      unsaid.length ? `their listings don’t say ${unsaid.join(' or ')}` : '',
      maybe.some(j => j.top) ? 'they reach your distance only at the top of their stated range' : '',
    ].filter(Boolean).join(', or ');
    const scale = rulerScale([...yes, ...(state.maybe ? maybe.map(j => j.bike) : [])].map(facts.range));
    const ids = compareIds();
    const cards = list => html`<ul class="grid" role="list">${list.map(b => html`<li>${cardHTML(b, { scale, compare: ids.includes(b.id), heading: 'h3' })}</li>`)}</ul>`;
    const notes = [
      state.distance ? 'Matched on each manufacturer’s range figure; hills, load, cold weather and assist level all shorten it.' : '',
      sort.unknownNote && yes.some(b => sort.value(b) == null) ? `Bikes that don’t list their ${sort.unknownNote} are shown last.` : '',
    ].filter(Boolean).join(' ');

    if (this.hasAttribute('sync-url')) {
      const q = new URLSearchParams(location.search);
      for (const k of FILTERS) state[k] ? q.set(k, state[k]) : q.delete(k);
      state.step ? q.set('step', '1') : q.delete('step');
      state.sort !== 'price' ? q.set('sort', state.sort) : q.delete('sort');
      const query = q.toString();
      history.replaceState(history.state, '', `${location.pathname}${query ? `?${query}` : ''}${location.hash}`);
    }

    const refocus = this.root.activeElement?.name === 'maybe';
    this.$('.results').removeAttribute('aria-busy');
    this.$('#count').textContent = yes.length === 1 ? '1 bike matches' : `${yes.length} bikes match`;
    this.$('.jump').textContent = yes.length === 1 ? 'See the 1 bike' : `See ${yes.length} bikes`;
    this.$('.note').textContent = notes;
    this.$('.list').innerHTML = html`
      ${yes.length ? cards(yes) : html`<div class="empty"><p>No bike we sell matches all of those answers.</p>
        <p>Try a wider budget or a shorter distance, or look at the bikes that might fit below.</p></div>`}
      ${maybe.length ? html`<div class="maybe">
        <h3>${maybe.length === 1 ? '1 more bike might fit' : `${maybe.length} more bikes might fit`}</h3>
        <p>We can’t tell for sure: ${reasons}. Ask us, or look at them yourself.</p>
        <label class="check"><input type="checkbox" name="maybe" ${state.maybe ? 'checked' : ''}> Show them</label>
        ${state.maybe ? cards(maybe.map(j => j.bike)) : ''}
      </div>` : ''}`.value;
    if (refocus) this.$('input[name="maybe"]')?.focus();
  }
}

define('cb-bike-finder', CbBikeFinder);
