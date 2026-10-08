// The bikes, read from Square's public store API: the same read-only endpoints the storefront calls
// from every visitor's browser (CORS open to any origin). Each product's Specifications block is
// parsed once, here.

import { config } from './config.js';
import { parseSpecBlock } from './specs.js';

const CACHE_KEY = 'cb-bikes-v2';
const CACHE_MS = 10 * 60 * 1000;
let pending = null;
const products = new Map();

/**
 * Every bike, cached for the page and (when storage allows) for ten minutes across pages. A JSON
 * array of store-API products at `src`, or config.catalogueSrc, replaces the live API: the local
 * preview uses it to show the drafted spec blocks before they are pasted into Square.
 */
export function loadBikes({ src = config.catalogueSrc } = {}) {
  pending ??= (async () => {
    const cached = src ? null : readCache();
    if (cached) return cached;
    const list = (src ? await fetchJson(src) : await fetchStore())
      .filter(p => !isPaymentPlan(p) && p.visibility !== 'hidden')
      .map(bikeFromProduct);
    if (!src) writeCache(list);
    return list;
  })();
  pending.catch(() => { pending = null; });  // a failed load can be retried
  return pending;
}

/** One product by id, without loading the whole catalogue. */
export function loadProduct(id) {
  if (!products.has(id)) {
    const load = config.catalogueSrc
      ? loadBikes().then(list => list.find(b => b.id === id || b.siteId === id) ?? null)
      : fetchJson(`${config.storeApi}/products/${encodeURIComponent(id)}?include=images,categories,options`)
        .then(res => bikeFromProduct(res.data ?? res));
    load.catch(() => products.delete(id));
    products.set(id, load);
  }
  return products.get(id);
}

async function fetchJson(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`${url}: ${res.status}`);
  return res.json();
}

async function fetchStore() {
  const query = config.bikeCategoryIds.map(id => `categories[]=${id}`).join('&');
  const found = new Map();
  for (let page = 1, pages = 1; page <= pages; page++) {
    const data = await fetchJson(`${config.storeApi}/products?${query}&include=images,categories,options&per_page=100&page=${page}`);
    for (const p of data.data ?? []) found.set(p.id, p);
    pages = data.meta?.pagination?.total_pages ?? 1;
  }
  return [...found.values()];
}

// The parsed bikes are cached, not the raw products: a fraction of the size.
function readCache() {
  try {
    const hit = JSON.parse(sessionStorage.getItem(CACHE_KEY));
    return hit && Date.now() - hit.at < CACHE_MS ? hit.bikes : null;
  } catch { return null; }
}

function writeCache(bikes) {
  try { sessionStorage.setItem(CACHE_KEY, JSON.stringify({ at: Date.now(), bikes })); } catch { /* full or blocked */ }
}

/**
 * Rent-to-own and deposit listings are products but not bikes for sale. Some say so only in the
 * description, priced at the weekly instalment; no bike sells for under config.minBikePrice.
 */
export function isPaymentPlan(p) {
  return config.notABike.test(p.name)
    || ((p.price?.low ?? 0) < config.minBikePrice && config.notABike.test(p.short_description ?? ''));
}

/**
 * Whether a bike may be recommended (finder, homepage sections). Sold-out bikes never are. Until stock
 * tracking is on in Square, every bike's stock is unknown and counts as available. A bike a shopper
 * picked to compare still shows there, marked sold out.
 */
export const isAvailable = bike => bike.stock !== 'out';

/** One store-API product as the shape every component uses. */
export function bikeFromProduct(p) {
  const categories = (p.categories?.data ?? []).map(c => c.name);
  const images = (p.images?.data ?? []).map(i => ({
    src: i.absolute_urls?.['1280'] ?? i.absolute_url,
    thumb: i.absolute_urls?.['160'] ?? i.absolute_url,
    srcset: Object.entries(i.absolute_urls ?? {}).map(([w, url]) => `${url} ${w}w`).join(', '),
    width: i.width,
    height: i.height,
  }));
  const tracked = p.inventory?.enabled;
  return {
    id: p.id,
    siteId: p.site_product_id ?? p.id,  // product URLs use this id
    name: p.name.trim(),
    url: config.links.product(p),
    price: p.price?.low ?? null,
    priceHigh: p.price?.high ?? null,
    regularPrice: p.on_sale ? p.price?.regular_low ?? null : null,
    onSale: Boolean(p.on_sale),
    brand: config.brands.find(b => categories.includes(b)) ?? null,
    categories,
    images,
    options: (p.options?.data ?? []).map(o => ({ name: o.name, choices: o.choice_order ?? [] })),
    // Stock is only known when tracking is on; otherwise the site cannot say (catalogue audit P0-6).
    stock: !tracked ? 'unknown' : p.badges?.out_of_stock ? 'out' : p.badges?.low_stock ? 'low' : 'in',
    specs: parseSpecBlock(p.short_description ?? ''),
  };
}

/** Answers to the questions shoppers filter on. `null` means the listing does not say. */
export const facts = {
  power: b => b.specs.fields.ratedPower?.max ?? null,
  range: b => b.specs.fields.range?.max ?? null,
  rangeMin: b => b.specs.fields.range?.min ?? null,
  weight: b => b.specs.fields.weight?.min ?? null,
  energy: b => b.specs.fields.battery?.energy?.max ?? null,
  tags: b => [...new Set([...(b.specs.fields.type?.tags ?? []),
    ...(/\bstep[- ]?thr(?:ough|u)\b/i.test(b.specs.fields.frame?.raw ?? '') ? ['step-through'] : [])])],
};
