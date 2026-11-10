/**
 * A light maths notation for question text, written between dollar signs:
 * $3/4$ is a fraction, $x^2$ a power, $H_2O$ a subscript, $sqrt(16)$ a square
 * root, and braces group: $x^{n+1}$, ${a+b}/{2}$. Text outside the dollar
 * signs is left alone, and a lone dollar sign ($5 for a book) stays a dollar.
 * Pure: no React, no DOM.
 */

export type MathNode =
  | { t: 'text'; v: string }
  | { t: 'sup'; base: MathNode[]; exp: MathNode[] }
  | { t: 'sub'; base: MathNode[]; sub: MathNode[] }
  | { t: 'frac'; num: MathNode[]; den: MathNode[] }
  | { t: 'sqrt'; x: MathNode[] };

export type Segment = { math: false; text: string } | { math: true; text: string; nodes: MathNode[] };

/** Splits text into plain and maths parts. A $...$ part counts only if it holds a maths mark (^ _ / or sqrt). */
export function splitMath(text: string): Segment[] {
  const out: Segment[] = [];
  const re = /\$([^$\n]{1,120})\$/g;
  let last = 0;
  for (const m of text.matchAll(re)) {
    const inner = m[1]!;
    if (!/[\^_/]|sqrt\(/.test(inner)) continue;
    if (m.index! > last) out.push({ math: false, text: text.slice(last, m.index) });
    out.push({ math: true, text: inner, nodes: parseMath(inner) });
    last = m.index! + m[0].length;
  }
  if (last < text.length) out.push({ math: false, text: text.slice(last) });
  return out;
}

export function hasMath(text: string): boolean {
  return splitMath(text).some((s) => s.math);
}

export function parseMath(src: string): MathNode[] {
  let i = 0;
  const peek = () => src[i];

  /** One unit: a number, a letter, sqrt(...), a braced or bracketed group, or any other character. */
  function atom(): MathNode[] | null {
    const c = peek();
    if (c === undefined) return null;
    if (src.startsWith('sqrt(', i)) {
      i += 5;
      const x = until(')');
      i++;
      return [{ t: 'sqrt', x }];
    }
    if (c === '{') {
      i++;
      const g = until('}');
      i++;
      return g;
    }
    if (c === '(') {
      i++;
      const g = until(')');
      i++;
      return [{ t: 'text', v: '(' }, ...g, { t: 'text', v: ')' }];
    }
    const num = /^[0-9]+(?:\.[0-9]+)?/.exec(src.slice(i));
    if (num) {
      i += num[0].length;
      return [{ t: 'text', v: num[0] }];
    }
    i++;
    return [{ t: 'text', v: c }];
  }

  /** A unit with any powers and subscripts after it. */
  function scripted(): MathNode[] | null {
    let base = atom();
    if (!base) return null;
    for (;;) {
      const c = peek();
      if (c === '^' || c === '_') {
        i++;
        const arg = atom() ?? [];
        base = [c === '^' ? { t: 'sup', base, exp: arg } : { t: 'sub', base, sub: arg }];
      } else return base;
    }
  }

  function until(close: string): MathNode[] {
    const items: MathNode[] = [];
    while (i < src.length && peek() !== close) {
      // Spaces stay as they are, and end a fraction's numerator or denominator.
      if (peek() === ' ') {
        items.push({ t: 'text', v: ' ' });
        i++;
        continue;
      }
      const left = scripted();
      if (!left) break;
      if (peek() === '/') {
        i++;
        const right = scripted() ?? [];
        items.push({ t: 'frac', num: left, den: right });
      } else items.push(...left);
    }
    return merge(items);
  }

  return until('\u0000');
}

/** Neighbouring text runs joined, so "12x" is one piece. */
function merge(nodes: MathNode[]): MathNode[] {
  const out: MathNode[] = [];
  for (const n of nodes) {
    const prev = out[out.length - 1];
    if (n.t === 'text' && prev?.t === 'text') prev.v += n.v;
    else out.push(n);
  }
  return out;
}

const words = (nodes: MathNode[]): string => nodes.map(spoken).join('').replace(/\s+/g, ' ').trim();

/** How a screen reader should say a piece: "3 over 4", "x squared", "H sub 2 O", "the square root of 16". */
export function spoken(n: MathNode): string {
  switch (n.t) {
    case 'text':
      return n.v.replace(/-/g, ' minus ').replace(/\+/g, ' plus ').replace(/=/g, ' equals ').replace(/[×*]/g, ' times ');
    case 'sup': {
      const e = words(n.exp);
      return `${words(n.base)} ${e === '2' ? 'squared' : e === '3' ? 'cubed' : `to the power ${e}`} `;
    }
    case 'sub':
      return `${words(n.base)} sub ${words(n.sub)} `;
    case 'frac':
      return ` ${words(n.num)} over ${words(n.den)} `;
    case 'sqrt':
      return ` the square root of ${words(n.x)} `;
  }
}

/** Plain words for the whole text, for screen readers, announcements and anywhere maths cannot be drawn. */
export function mathToWords(text: string): string {
  return splitMath(text)
    .map((s) => (s.math ? words(s.nodes) : s.text))
    .join('');
}

/** Plain text with the dollar signs and marks drawn in the simplest way (3/4, x²), for places that only take a string. */
export function mathToPlain(text: string): string {
  const SUP: Record<string, string> = { '0': '⁰', '1': '¹', '2': '²', '3': '³', '4': '⁴', '5': '⁵', '6': '⁶', '7': '⁷', '8': '⁸', '9': '⁹', n: 'ⁿ', '-': '⁻', '+': '⁺' };
  const SUB: Record<string, string> = { '0': '₀', '1': '₁', '2': '₂', '3': '₃', '4': '₄', '5': '₅', '6': '₆', '7': '₇', '8': '₈', '9': '₉' };
  const flat = (nodes: MathNode[]): string =>
    nodes
      .map((n) => {
        switch (n.t) {
          case 'text':
            return n.v;
          case 'sup': {
            const e = flat(n.exp);
            return flat(n.base) + ([...e].every((c) => SUP[c]) ? [...e].map((c) => SUP[c]).join('') : `^(${e})`);
          }
          case 'sub': {
            const s = flat(n.sub);
            return flat(n.base) + ([...s].every((c) => SUB[c]) ? [...s].map((c) => SUB[c]).join('') : `_(${s})`);
          }
          case 'frac':
            return `${flat(n.num)}/${flat(n.den)}`;
          case 'sqrt':
            return `√(${flat(n.x)})`;
        }
      })
      .join('');
  return splitMath(text)
    .map((s) => (s.math ? flat(s.nodes) : s.text))
    .join('');
}
