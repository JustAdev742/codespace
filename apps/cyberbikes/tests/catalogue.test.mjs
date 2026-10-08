import { test } from 'node:test';
import assert from 'node:assert/strict';
import { bikeFromProduct, isAvailable } from '../src/catalogue.js';

// The store-API fields stock is read from, in the shape the live catalogue returns them.
const product = (inventory, badges) => ({
  id: 'ABC', site_product_id: 'abc', site_link: 'product/test-bike/abc', name: ' Test bike ',
  price: { low: 2499, high: 2499 }, on_sale: false, short_description: '',
  categories: { data: [] }, images: { data: [] }, options: { data: [] },
  inventory, badges: { on_sale: false, low_stock: false, out_of_stock: false, ...badges },
});

test('stock is unknown while tracking is off, whatever the badges say', () => {
  const bike = bikeFromProduct(product({ enabled: false }, { out_of_stock: true }));
  assert.equal(bike.stock, 'unknown');
  assert.equal(isAvailable(bike), true);
});

test('a tracked bike reads in stock, low or sold out from its badges', () => {
  assert.equal(bikeFromProduct(product({ enabled: true }, {})).stock, 'in');
  assert.equal(bikeFromProduct(product({ enabled: true }, { low_stock: true })).stock, 'low');
  assert.equal(bikeFromProduct(product({ enabled: true }, { out_of_stock: true })).stock, 'out');
});

test('only sold-out bikes are kept out of recommendations', () => {
  assert.equal(isAvailable({ stock: 'in' }), true);
  assert.equal(isAvailable({ stock: 'low' }), true);
  assert.equal(isAvailable({ stock: 'unknown' }), true);
  assert.equal(isAvailable({ stock: 'out' }), false);
});
