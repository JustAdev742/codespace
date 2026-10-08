// The Cyberbikes site-wide script for Square Online (Website → Settings → Custom code, site-wide
// footer). It restyles Square's templates through one CSS layer, fixes what Square renders wrongly,
// and places the components where they belong.
//
// Every fix checks for the problem first and does nothing once Square or the owner has fixed it
// at the source. It never adds to the cart, never changes prices and never writes to Square.
//
// Components can also be placed by the owner: a Square text block containing only a marker such as
// [[bike-finder sync-url]] or [[hero bike=IQNARFJR5KK42SAYKPCXBQDD]] is replaced by that component.

import TOKENS from '../tokens.css';
import LAYER from './square.css';
import { config } from '../config.js';
import { isSpecHeading, parseSpecBlock } from '../specs.js';
import { loadProduct } from '../catalogue.js';
import '../components/product.js';
import '../components/compare.js';
import '../components/finder.js';
import '../components/home.js';

const MARKERS = {
  'bike-finder': 'cb-bike-finder',
  hero: 'cb-hero',
  'ride-types': 'cb-ride-types',
  'bike-row': 'cb-bike-row',
  visit: 'cb-visit',
  'range-explainer': 'cb-range-explainer',
};
const MARKER = /^\[\[([a-z-]+)((?:\s+[a-z-]+(?:=(?:"[^"]*"|[^\s\]]+))?)*)\s*\]\]$/;
// The wording 65 listings share, which the notice now says once for every bike.
const STANDARD_BOX_WORDING = /^Online price\s*=\s*Bike-in-Box\.\s*The price shown online is for the bike in its original box, unassembled\.\s*Buy in store at [^.]+ and assembly is included in the price\.$/i;

const productId = () => location.pathname.match(/\/product\/[^/]+\/([^/?#]+)/)?.[1] ?? null;
const categoryId = () => location.pathname.match(/\/shop\/[^/]+\/([^/?#]+)/)?.[1] ?? null;

function addStyles() {
  if (document.getElementById('cb-styles')) return;
  const style = document.createElement('style');
  style.id = 'cb-styles';
  style.textContent = TOKENS + LAYER;
  document.head.append(style);
}

/** Square writes lang="en_AU"; HTML language tags use a hyphen. */
function fixLang() {
  const lang = document.documentElement.getAttribute('lang');
  if (lang?.includes('_')) document.documentElement.setAttribute('lang', lang.replace('_', '-'));
}

/**
 * Category pages show the category name as an <h3> and have no <h1>. Marking the visible title as
 * the level-1 heading fixes the outline for screen readers without touching Square's own elements;
 * a real <h1> needs Square's template (or a custom storefront).
 */
function categoryTitle() {
  if (!categoryId() || document.querySelector('h1')) return;
  for (const title of document.querySelectorAll('.category__title :is(h2, h3, h4)')) {
    if (title.getAttribute('aria-level') === '1') continue;
    title.setAttribute('role', 'heading');
    title.setAttribute('aria-level', '1');
  }
}

/** Hides the description's own Specifications list once the spec panel shows the same lines. */
function hideRawSpecs(description) {
  const blocks = [...description.querySelectorAll('p, ul, ol, h2, h3, h4, div')].filter(el => !el.querySelector('p, ul, ol, div'));
  const start = blocks.findIndex(el => isSpecHeading(el.textContent));
  if (start < 0) return;
  blocks[start].classList.add('cb-raw-specs');
  for (const el of blocks.slice(start + 1)) {
    const lines = el.matches('ul, ol') ? [...el.children].map(li => li.textContent) : [el.textContent];
    if (!lines.every(line => /\S\s*(?::|\t|\s[–—-]\s)/.test(line))) break;
    el.classList.add('cb-raw-specs');
    if (el.matches('ul, ol')) break;
  }
}

function hideStandardBoxWording(description) {
  for (const p of description.querySelectorAll('p')) {
    if (STANDARD_BOX_WORDING.test(p.textContent.replace(/\s+/g, ' ').trim())) p.classList.add('cb-raw-notice');
  }
}

/** Adds brand and URL to Square's product structured data when it lacks them. */
async function enrichStructuredData(id) {
  const bike = await loadProduct(id).catch(() => null);
  if (!bike || productId() !== id) return;
  for (const script of document.querySelectorAll('script[type="application/ld+json"]')) {
    let data;
    try { data = JSON.parse(script.textContent); } catch { continue; }
    const product = [data, data?.mainEntity, ...(Array.isArray(data?.['@graph']) ? data['@graph'] : [])]
      .find(node => node?.['@type'] === 'Product');
    if (!product) continue;
    let changed = false;
    if (!product.brand && bike.brand) { product.brand = { '@type': 'Brand', name: bike.brand }; changed = true; }
    if (!product.url) { product.url = location.origin + location.pathname; changed = true; }
    if (changed) script.textContent = JSON.stringify(data);
  }
}

function productPage() {
  const id = productId();
  if (!id) return;
  const description = document.querySelector('.w-product-description');
  const descriptionBlock = document.querySelector('.w-wrapper.product-description') ?? description?.parentElement;
  const cart = document.querySelector('.add-to-cart__wrapper');

  // Square reuses the page when moving between products, so anything placed for another product goes.
  for (const el of document.querySelectorAll('[data-cb-product]')) if (el.dataset.cbProduct !== id) el.remove();

  if (description && descriptionBlock && !document.querySelector(`cb-spec-panel[data-cb-product="${id}"]`)) {
    const specs = parseSpecBlock(description.getAttribute('content') || description.innerHTML);
    const panel = document.createElement('cb-spec-panel');
    panel.dataset.cbProduct = id;
    panel.specs = specs;
    descriptionBlock.after(panel);
    if (specs.found) {
      hideRawSpecs(description);
      // The key facts go under the price, but only once the listing has a spec block to read.
      const header = document.querySelector('.product__header');
      if (header) {
        const facts = document.createElement('cb-key-facts');
        facts.dataset.cbProduct = id;
        facts.specs = specs;
        header.after(facts);
      }
    }
    enrichStructuredData(id);
  }
  if (cart && !document.querySelector(`cb-box-notice[data-cb-product="${id}"]`)) {
    const notice = document.createElement('cb-box-notice');
    notice.dataset.cbProduct = id;
    cart.after(notice);
    if (description) hideStandardBoxWording(description);
  }
  if (cart && !document.querySelector(`cb-buy-bar[data-cb-product="${id}"]`)) {
    const bar = document.createElement('cb-buy-bar');
    bar.dataset.cbProduct = id;
    bar.setAttribute('name', document.querySelector('.product__title h1')?.textContent.trim() ?? '');
    bar.setAttribute('price', document.querySelector('.product__price')?.textContent.replace(/\s+/g, ' ').trim() ?? '');
    document.body.append(bar);
  }
}

function markers() {
  const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT, {
    acceptNode: node => (node.nodeValue.includes('[[') ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_SKIP),
  });
  const found = [];
  while (walker.nextNode()) found.push(walker.currentNode);
  for (const node of found) {
    const holder = node.parentElement?.closest('p, h1, h2, h3, h4, div');
    const m = holder?.textContent.trim().match(MARKER);
    if (!m || !MARKERS[m[1]]) continue;
    const el = document.createElement(MARKERS[m[1]]);
    for (const [, key, quoted, bare] of m[2].matchAll(/([a-z-]+)(?:=(?:"([^"]*)"|([^\s\]]+)))?/g)) el.setAttribute(key, quoted ?? bare ?? '');
    holder.replaceWith(el);
  }
}

function compareTray() {
  if (!document.querySelector('cb-compare')) document.body.append(document.createElement('cb-compare'));
}

function apply() {
  fixLang();
  markers();
  productPage();
  categoryTitle();
  compareTray();
}

let queued = false;
function schedule() {
  if (queued) return;
  queued = true;
  setTimeout(() => { queued = false; apply(); }, 120);
}

export function start() {
  addStyles();
  apply();
  // Square renders and navigates client-side: re-check after its DOM settles.
  new MutationObserver(schedule).observe(document.body, { childList: true, subtree: true });
  addEventListener('popstate', schedule);
}

export { config };
