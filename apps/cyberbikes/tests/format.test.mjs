import { test } from 'node:test';
import assert from 'node:assert/strict';
import { quantity, withNote } from '../src/format.js';

const NBSP = ' ';

test('approximate and up-to figures keep their wording', () => {
  assert.equal(quantity({ min: 25, max: 25, unit: 'kg', approx: true }), `approx. 25${NBSP}kg`);
  assert.equal(quantity({ min: 180, max: 180, unit: 'km', upTo: true }), `up to 180${NBSP}km`);
});

test('a condition is shown with the figure in the full specifications', () => {
  assert.equal(withNote({ min: 120, max: 120, unit: 'km', note: 'under 25 km/h' }), `120${NBSP}km (under 25${NBSP}km/h)`);
  assert.equal(withNote({ min: 60, max: 80, unit: 'km' }), `60–80${NBSP}km`);
});
