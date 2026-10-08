import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseSpecBlock, readQuantity, htmlToLines, SPEC_FIELDS } from '../src/specs.js';

const block = `
<p>The Defender is built for sand and gravel.</p>
<p><strong>Specifications</strong></p>
<ul>
  <li><strong>Type:</strong> Fat-tyre, step-through commuter</li>
  <li><strong>Motor:</strong> Bafang rear hub</li>
  <li><strong>Rated power:</strong> 250&nbsp;W</li>
  <li>Battery: 48 V 15 Ah</li>
  <li>Range: 60&ndash;80 km</li>
  <li>Top speed: 25km/h</li>
  <li>Weight: 31 kg (battery 4 kg)</li>
  <li>Max load: 150 kg</li>
  <li>Charging time: 5-7 hours</li>
  <li>Display: Colour LCD</li>
  <li>Warranty:</li>
  <li>Standard: EN 15194</li>
</ul>
<p>Ask us about test rides.</p>`;

test('reads the standard block', () => {
  const s = parseSpecBlock(block);
  assert.equal(s.found, true);
  assert.deepEqual(s.fields.type.tags, ['commuter', 'fat-tyre', 'step-through']);
  assert.equal(s.fields.motor.raw, 'Bafang rear hub');
  assert.deepEqual([s.fields.ratedPower.min, s.fields.ratedPower.max], [250, 250]);
  assert.deepEqual([s.fields.range.min, s.fields.range.max], [60, 80]);
  assert.equal(s.fields.topSpeed.min, 25);
  assert.deepEqual([s.fields.chargeTime.min, s.fields.chargeTime.max], [5, 7]);
  assert.equal(s.fields.standard.en15194, true);
});

test('never fills a gap: blank and absent fields are missing, calculated energy is labelled', () => {
  const s = parseSpecBlock(block);
  assert.ok(s.missing.includes('warranty'));
  assert.ok(s.missing.includes('peakPower'));
  assert.deepEqual(s.fields.battery.wattHours, []);
  assert.deepEqual(s.fields.battery.energy, { min: 720, max: 720, source: 'calculated' });
});

test('keeps an ambiguous value as written but out of comparisons', () => {
  const s = parseSpecBlock(block);
  assert.equal(s.fields.weight.raw, '31 kg (battery 4 kg)');
  assert.equal(s.fields.weight.min, null);
  assert.deepEqual(s.unparsed, ['weight']);
  assert.deepEqual(s.extra, [{ label: 'Display', raw: 'Colour LCD' }]);
});

test('stops at the first line that is not Label: value', () => {
  const s = parseSpecBlock(block);
  assert.equal(Object.values(s.fields).some(f => /test rides/.test(f.raw)), false);
});

test('no heading, no block', () => {
  const s = parseSpecBlock('<p>Motor: 250W</p><p>Range: 60 km</p>');
  assert.equal(s.found, false);
  assert.equal(s.missing.length, SPEC_FIELDS.length);
});

test('heading variants and line breaks', () => {
  const s = parseSpecBlock('<p><b>SPECIFICATIONS:</b><br>Rated power (W): 500<br>Weight - 26.5kg</p>');
  assert.equal(s.fields.ratedPower.min, 500);   // unit taken from the label
  assert.equal(s.fields.weight.min, 26.5);
});

test('quantities', () => {
  assert.deepEqual(readQuantity('250 W / 500 W / 1000 W', 'W'), { min: 250, max: 1000, values: [250, 500, 1000] });
  assert.deepEqual(readQuantity('up to 80 km', 'km'), { min: 80, max: 80, upTo: true });
  assert.deepEqual(readQuantity('80+ km', 'km'), { min: 80, max: 80, plus: true });
  assert.deepEqual(readQuantity('1,000 W', 'W'), { min: 1000, max: 1000 });
  assert.equal(readQuantity('25 km/h', 'km'), null);          // km/h is not km
  assert.equal(readQuantity('750 Wh', 'W'), null);            // Wh is not W
  assert.equal(readQuantity('25 km/h, 32 km/h off-road', 'km/h'), null);
  assert.equal(readQuantity('26', 'kg'), null);               // no unit
  assert.equal(readQuantity('60-80 / 100 km', 'km'), null);   // mixed range and alternatives
});

test('stated watt-hours win and are marked stated', () => {
  const s = parseSpecBlock('Specifications\nBattery: 48V 20Ah (960Wh), Samsung cells');
  assert.deepEqual(s.fields.battery.energy, { min: 960, max: 960, source: 'stated' });
});

test('html to lines', () => {
  assert.deepEqual(htmlToLines('<p>a&amp;b</p><ul><li>x</li><li> y </li></ul>c<br/>d'), ['a&b', 'x', 'y', 'c', 'd']);
});

test('a figure in another unit makes the value unparsed, never converted', () => {
  assert.equal(readQuantity('80 KM / 50 Mile', 'km'), null);
  assert.equal(readQuantity('39.00 KG / 85.98 LB', 'kg'), null);
  assert.equal(readQuantity('82 lbs', 'kg'), null);
  assert.equal(readQuantity('3 speed limits on the handlebar', 'km/h'), null);
  assert.deepEqual(readQuantity('37.5 - 42 kg', 'kg'), { min: 37.5, max: 42 });
  assert.deepEqual(readQuantity('250 or 500 W', 'W'), { min: 250, max: 500, values: [250, 500] });
});

test('abbreviated labels', () => {
  assert.equal(parseSpecBlock('Specifications\nMax. Speed: 32 km/h').fields.topSpeed.min, 32);
});
