/*
 * The Cyberbikes specification block: one standard list at the end of every bike's Square description.
 * The spec panel, the comparison and the bike finder all read it, so a bike's facts live in one place
 * that the owner already edits.
 *
 *   Specifications
 *   Type: Fat-tyre, step-through
 *   Motor: Bafang rear hub
 *   Rated power: 250 W
 *   Battery: 48 V 15 Ah (720 Wh)
 *   Range: 60–80 km
 *   ...
 *
 * One "Label: value" per line, under a line that says only "Specifications". A bulleted list,
 * separate paragraphs or line breaks all work, and bold labels are fine.
 *
 * Leave a field out when the manufacturer does not state it. The parser never fills a gap: a missing
 * field is reported as missing, and a value it cannot read cleanly (two different weights, a number
 * without its unit) is kept exactly as written for display but left out of comparisons and filters
 * rather than guessed at.
 *
 * No dependencies and no DOM: the same file runs in the storefront, in the components and in Node.
 */

export const SPEC_FIELDS = [
  { key: 'type', label: 'Type', kind: 'type', aliases: ['bike type', 'category', 'style'] },
  { key: 'motor', label: 'Motor', kind: 'text', aliases: ['motor type', 'hub motor', 'drive'] },
  { key: 'ratedPower', label: 'Rated power', kind: 'quantity', unit: 'W',
    aliases: ['motor power', 'nominal power', 'continuous power', 'power'] },
  { key: 'peakPower', label: 'Peak power', kind: 'quantity', unit: 'W', aliases: ['max power', 'maximum power'] },
  { key: 'battery', label: 'Battery', kind: 'battery', aliases: ['battery capacity', 'battery pack'] },
  { key: 'cells', label: 'Battery cells', kind: 'text', aliases: ['cells', 'cell brand'] },
  { key: 'range', label: 'Range', kind: 'quantity', unit: 'km',
    aliases: ['claimed range', 'max range', 'maximum range', 'riding range'] },
  { key: 'topSpeed', label: 'Top speed', kind: 'quantity', unit: 'km/h',
    aliases: ['max speed', 'maximum speed', 'assist limit', 'assisted speed', 'top assisted speed', 'max assisted speed'] },
  { key: 'weight', label: 'Weight', kind: 'quantity', unit: 'kg', aliases: ['bike weight', 'net weight', 'total weight'] },
  { key: 'maxLoad', label: 'Max load', kind: 'quantity', unit: 'kg',
    aliases: ['maximum load', 'max payload', 'payload', 'total payload capacity', 'load capacity', 'maximum load capacity',
      'carrying capacity'] },
  { key: 'frame', label: 'Frame', kind: 'text', aliases: ['frame type', 'frame style', 'frame material'] },
  { key: 'wheels', label: 'Wheels', kind: 'text', aliases: ['wheel size', 'tyres', 'tires', 'tyre size', 'tire size'] },
  { key: 'brakes', label: 'Brakes', kind: 'text', aliases: ['brake', 'braking'] },
  { key: 'suspension', label: 'Suspension', kind: 'text', aliases: ['fork', 'suspension fork'] },
  { key: 'gears', label: 'Gears', kind: 'text', aliases: ['gearing', 'drivetrain', 'transmission', 'derailleur'] },
  { key: 'chargeTime', label: 'Charging time', kind: 'quantity', unit: 'h', aliases: ['charge time', 'battery charging time'] },
  { key: 'warranty', label: 'Warranty', kind: 'text', aliases: [] },
  { key: 'standard', label: 'Standard', kind: 'standard', aliases: ['standards', 'compliance', 'certification'] },
  { key: 'roadUse', label: 'Road use', kind: 'roadUse', aliases: ['road legal', 'legal status', 'use'] },
];

// The words a Type value is filtered on. Anything else in the value is shown but not filterable.
export const TYPE_TAGS = {
  commuter: /\b(commut\w*|city|urban)\b/i,
  'fat-tyre': /\bfat[- ]?(?:ty|ti)res?\b/i,
  'step-through': /\bstep[- ]?thr(?:ough|u)\b/i,
  folding: /\bfold(?:ing|able)\b/i,
  cargo: /\bcargo\b/i,
  trike: /\btrikes?\b|\btricycle\b|\b3[- ]wheel/i,
  mountain: /\b(mtb|mountain)\b/i,
  'off-road': /\boff[- ]?road\b/i,
  cruiser: /\bcruiser\b/i,
  kids: /\bkids?\b|\bchildren'?s?\b|\byouth\b/i,
  motorbike: /\bmotor(?:bike|cycle)\b/i,
};

const UNIT = {
  W: String.raw`w(?:atts?)?`,
  'km/h': String.raw`km\s*\/\s*h|kmh|kph|km per hour`,
  km: String.raw`kms?(?!\s*\/?\s*h)|kilomet(?:er|re)s?`,
  kg: String.raw`kgs?|kilo(?:gram)?s?`,
  h: String.raw`hours?|hrs?|h`,
};
const NUMBER = String.raw`\d{1,3}(?:,\d{3})+(?:\.\d+)?|\d+(?:\.\d+)?`;
const BLANK = /^(?:|-+|–|—|n\/?a|tbc|tba|unknown|not (?:stated|listed|known)|\?+)$/i;
const HEADING = /^(?:(?:key|tech(?:nical)?|full)\s+)?spec(?:ification)?s?\s*:?$/i;

/** True for the line that opens a Specifications block. */
export const isSpecHeading = text => HEADING.test(String(text).trim());
const ENTITIES = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', ndash: '–', mdash: '—', times: '×',
  deg: '°', rsquo: '’', lsquo: '‘', rdquo: '”', ldquo: '“', hellip: '…', prime: '′', Prime: '″', middot: '·', bull: '•' };

const LABELS = new Map();
for (const f of SPEC_FIELDS) for (const name of [f.label, ...f.aliases]) LABELS.set(name.toLowerCase(), f);

function decodeEntities(s) {
  return s.replace(/&(#x[\da-f]+|#\d+|[a-z]+);/gi, (m, e) => {
    if (e[0] === '#') return String.fromCodePoint(e[1] === 'x' || e[1] === 'X' ? parseInt(e.slice(2), 16) : +e.slice(1));
    return ENTITIES[e] ?? m;
  });
}

/** Description HTML (or plain text) as trimmed, non-empty lines, one per paragraph, list item or line break. */
export function htmlToLines(input) {
  const text = String(input ?? '')
    .replace(/<(script|style)\b[\s\S]*?<\/\1>/gi, '')
    .replace(/<\/(?:p|li|h[1-6]|div|tr|ul|ol|table|blockquote)>|<br\s*\/?>/gi, '\n')
    .replace(/<\/t[dh]>/gi, '\t')
    .replace(/<[^>]*>/g, '');
  return decodeEntities(text).split('\n')
    .map(line => line.replace(/[    ]+/g, ' ').trim())
    .filter(Boolean);
}

// "Rated power (W)" -> { name: 'rated power', unitHint: 'w' }
function readLabel(raw) {
  const unitHint = raw.match(/\(([^)]*)\)\s*$/)?.[1].trim().toLowerCase() ?? null;
  const name = raw.replace(/\([^)]*\)\s*$/, '').replace(/&/g, 'and').replace(/\./g, '').replace(/\s+/g, ' ').trim().toLowerCase();
  return { name, unitHint };
}

function splitLine(line) {
  const m = line.match(/^(?:[•·*\-–—]\s*)?([^:\t]{1,48}?)\s*(?::|\t|\s[–—-]\s)\s*(.*)$/);
  return m ? { label: m[1], value: m[2].trim() } : null;
}

/**
 * A number with its unit: "26 kg", "60–80 km", "250 W / 500 W", "up to 80 km", "80+ km".
 * Returns { min, max, values?, upTo?, plus? } or null when the value is not a single clean quantity,
 * such as a second figure in the same unit ("25 km/h, 32 km/h off-road") or no unit at all.
 */
export function readQuantity(value, unit, unitOptional = false) {
  const unitRe = new RegExp(String.raw`^\s*(?:${UNIT[unit]})(?![a-z])`, 'i');
  let s = value.trim();
  const prefix = s.match(/^(up\s+to|approx(?:\.|imately)?|about|around|~|≈)\s*/i);
  if (prefix) s = s.slice(prefix[0].length);
  const nums = [];
  let joiner = null, sawUnit = false, plus = false;
  for (;;) {
    const n = s.match(new RegExp(`^(?:${NUMBER})`));
    if (!n) break;
    nums.push(Number(n[0].replace(/,/g, '')));
    s = s.slice(n[0].length);
    if (/^\s*\+/.test(s)) { plus = true; s = s.replace(/^\s*\+/, ''); }
    const u = s.match(unitRe);
    if (u) { sawUnit = true; s = s.slice(u[0].length); }
    const j = s.match(/^\s*(–|—|-|~|to|\/|or)\s*(?=\d)/i);
    if (!j && !u && /^\s*[a-z]/i.test(s)) return null;  // "50 mile", "85 lb": a figure in some other unit
    if (!j) break;
    const kind = /^(?:\/|or)$/i.test(j[1]) ? 'alternatives' : 'range';
    if (joiner && joiner !== kind) return null;
    joiner = kind;
    s = s.slice(j[0].length);
  }
  if (!nums.length || (!sawUnit && !unitOptional)) return null;
  if (joiner === 'range' && nums.length !== 2) return null;
  if (new RegExp(String.raw`\d\s*(?:${UNIT[unit]})(?![a-z])`, 'i').test(s)) return null;
  const q = { min: Math.min(...nums), max: Math.max(...nums) };
  if (joiner === 'alternatives') q.values = nums;
  if (prefix && /up/i.test(prefix[1])) q.upTo = true;
  if (plus) q.plus = true;
  return q;
}

function readBattery(value) {
  const all = unit => [...new Set([...value.matchAll(new RegExp(String.raw`(\d+(?:\.\d+)?)\s*${unit}(?![a-z])`, 'gi'))]
    .map(m => Number(m[1])))];
  const volts = all(String.raw`v(?:olts?)?`), ampHours = all('ah'), wattHours = all('wh');
  const out = { volts, ampHours, wattHours, energy: null };
  if (wattHours.length) {
    out.energy = { min: Math.min(...wattHours), max: Math.max(...wattHours), source: 'stated' };
  } else if (volts.length === 1 && ampHours.length) {
    // Nominal energy is volts × amp-hours. Labelled as calculated wherever it is shown.
    const wh = ampHours.map(ah => Math.round(volts[0] * ah));
    out.energy = { min: Math.min(...wh), max: Math.max(...wh), source: 'calculated' };
  }
  return out;
}

function readField(field, value, unitHint) {
  const out = { label: field.label, raw: value };
  switch (field.kind) {
    case 'quantity': {
      const unitOptional = unitHint != null && new RegExp(`^(?:${UNIT[field.unit]})$`, 'i').test(unitHint);
      const q = readQuantity(value, field.unit, unitOptional);
      return q ? { ...out, unit: field.unit, ...q } : { ...out, unit: field.unit, min: null, max: null, unparsed: true };
    }
    case 'battery': return { ...out, ...readBattery(value) };
    case 'type': return { ...out, tags: Object.keys(TYPE_TAGS).filter(t => TYPE_TAGS[t].test(value)) };
    case 'standard': return { ...out, en15194: /\bEN\s*15194\b/i.test(value) };
    case 'roadUse': return { ...out, offRoad: /\boff[- ]?road\b|\bprivate (?:land|property)\b/i.test(value) };
    default: return out;
  }
}

function readBlock(lines) {
  const fields = {}, extra = [];
  for (const line of lines) {
    const pair = splitLine(line);
    if (!pair) break;  // the block ends at the first line that is not "Label: value"
    const { name, unitHint } = readLabel(pair.label);
    const field = LABELS.get(name);
    if (!field) {
      if (!BLANK.test(pair.value)) extra.push({ label: pair.label.trim(), raw: pair.value });
    } else if (!fields[field.key] && !BLANK.test(pair.value)) {
      fields[field.key] = readField(field, pair.value, unitHint);
    }
  }
  return { fields, extra };
}

/**
 * Read the Specifications block out of a product description (HTML or plain text).
 *
 * Returns { found, fields, missing, unparsed, extra }:
 *   fields   — by key, each { label, raw, ... } plus what the kind adds: quantities get min/max/unit,
 *              the battery gets volts/ampHours/wattHours and energy { min, max, source }.
 *   missing  — keys of SPEC_FIELDS the block does not state, in display order.
 *   unparsed — keys whose value is shown as written but cannot be compared or filtered.
 *   extra    — "Label: value" lines in the block that are not standard fields, kept in order.
 */
export function parseSpecBlock(description) {
  const lines = htmlToLines(description);
  let best = null;
  lines.forEach((line, i) => {
    if (!HEADING.test(line)) return;
    const block = readBlock(lines.slice(i + 1));
    if (!best || Object.keys(block.fields).length > Object.keys(best.fields).length) best = block;
  });
  const fields = best?.fields ?? {};
  return {
    found: Boolean(best && Object.keys(fields).length),
    fields,
    missing: SPEC_FIELDS.map(f => f.key).filter(k => !fields[k]),
    unparsed: Object.keys(fields).filter(k => fields[k].unparsed),
    extra: best?.extra ?? [],
  };
}
