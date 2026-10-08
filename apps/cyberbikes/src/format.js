// Display formatting shared by every component. Australian English, AUD, metric.

const NBSP = ' ';
const numberFormat = new Intl.NumberFormat('en-AU', { maximumFractionDigits: 1 });

/** "$2,799", or "$75.50" when there are cents. */
export function price(amount) {
  if (amount == null || Number.isNaN(Number(amount))) return '';
  const cents = Math.round(Number(amount) * 100) % 100 !== 0;
  return new Intl.NumberFormat('en-AU', {
    style: 'currency', currency: 'AUD', minimumFractionDigits: cents ? 2 : 0, maximumFractionDigits: cents ? 2 : 0,
  }).format(amount);
}

export const number = n => numberFormat.format(n);

/** A parsed quantity from specs.js as text: "250 W", "60–80 km", "250 / 500 W", "up to 80 km". */
export function quantity(q) {
  if (!q || q.min == null) return q?.raw ? typeset(q.raw) : '';
  const unit = NBSP + q.unit;
  if (q.values) return q.values.map(number).join(' / ') + unit;
  const text = q.min === q.max ? number(q.min) : `${number(q.min)}–${number(q.max)}`;
  return (q.upTo ? 'up to ' : '') + text + (q.plus ? '+' : '') + unit;
}

/** Battery as one line: "48 V 15 Ah · 720 Wh". Energy worked out from V × Ah says so. */
export function battery(b) {
  if (!b) return '';
  const parts = [];
  if (b.volts.length) parts.push(b.volts.map(number).join(' / ') + NBSP + 'V');
  if (b.ampHours.length) parts.push(b.ampHours.map(number).join(' / ') + NBSP + 'Ah');
  const pack = parts.join(' ');
  if (!b.energy) return pack || typeset(b.raw);
  const e = b.energy.min === b.energy.max ? number(b.energy.min) : `${number(b.energy.min)}–${number(b.energy.max)}`;
  return [pack, `${e}${NBSP}Wh${b.energy.source === 'calculated' ? ' (calculated)' : ''}`].filter(Boolean).join(' · ');
}

/**
 * Typographic clean-up of text the owner typed: en dashes in number ranges, no break between a
 * number and its unit. Inch marks stay straight on purpose.
 */
export function typeset(text) {
  return String(text ?? '')
    .replace(/(\d)\s*-\s*(?=\d)/g, '$1–')
    .replace(/(\d)\s+(?=(?:W|Wh|V|Ah|km\/h|km|kg|h|mm|cm|in|N·?m)\b)/g, '$1' + NBSP);
}

/** "+61 491 794 668" -> "0491 794 668" for display; the tel: link keeps the international form. */
export function phoneDisplay(international) {
  const digits = String(international).replace(/[^\d+]/g, '');
  const m = digits.match(/^\+61(\d)(\d{2,3})(\d{3})(\d{3})$/);
  return m ? `0${m[1]}${m[2]} ${m[3]} ${m[4]}` : international;
}
