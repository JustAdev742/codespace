/**
 * A small, forgiving CSV reader and writer (RFC 4180 plus the things people
 * actually paste: semicolons from European spreadsheets, tabs copied straight
 * out of a sheet, spaces before quotes, a byte order mark).
 * Pure: no React, no DOM.
 */

export interface CsvRecord {
  /** The line in the source text where this record starts (1-based). */
  line: number;
  cells: string[];
}

export interface CsvParseResult {
  records: CsvRecord[];
  delimiter: string;
  /** True when a quoted cell was still open at the end of the text. */
  unterminated: boolean;
}

/** Picks the delimiter that splits the first line (outside quotes) the most. Commas win ties. */
export function detectDelimiter(text: string): string {
  const counts: Record<string, number> = { ',': 0, ';': 0, '\t': 0 };
  let inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i]!;
    if (c === '"') inQuotes = !inQuotes;
    else if (!inQuotes && (c === '\n' || c === '\r')) break;
    else if (!inQuotes && c in counts) counts[c]!++;
  }
  let best = ',';
  for (const d of ['\t', ';']) if (counts[d]! > counts[best]!) best = d;
  return best;
}

export function parseCsv(input: string, delimiter?: string): CsvParseResult {
  const text = input.replace(/^﻿/, '').replace(/\r\n?/g, '\n');
  const d = delimiter ?? detectDelimiter(text);
  const records: CsvRecord[] = [];
  let cells: string[] = [];
  let field = '';
  /** The current field opened with a quote. */
  let quoted = false;
  let inQuotes = false;
  let line = 1;
  let recordLine = 1;

  const endField = () => {
    cells.push(field);
    field = '';
    quoted = false;
  };
  const endRecord = () => {
    endField();
    records.push({ line: recordLine, cells });
    cells = [];
  };

  for (let i = 0; i < text.length; i++) {
    const c = text[i]!;
    if (inQuotes) {
      if (c === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        if (c === '\n') line++;
        field += c;
      }
      continue;
    }
    if (c === '"' && !quoted && field.trim() === '') {
      // A quote opens a quoted field, even after stray spaces ("a, "b, c"").
      field = '';
      quoted = true;
      inQuotes = true;
      continue;
    }
    if (c === d) {
      endField();
      continue;
    }
    if (c === '\n') {
      endRecord();
      line++;
      recordLine = line;
      continue;
    }
    // Spaces after a closing quote are padding; anything else is kept as typed.
    if (quoted && c.trim() === '') continue;
    field += c;
  }
  if (field !== '' || quoted || cells.length > 0) endRecord();
  return { records, delimiter: d, unterminated: inQuotes };
}

function needsQuotes(cell: string, delimiter: string): boolean {
  return cell.includes(delimiter) || /["\r\n]/.test(cell) || /^\s|\s$/.test(cell);
}

/** Writes rows as CSV with CRLF line endings, quoting only where needed. */
export function toCsv(rows: string[][], delimiter = ','): string {
  return rows.map((row) => row.map((cell) => (needsQuotes(cell, delimiter) ? `"${cell.replace(/"/g, '""')}"` : cell)).join(delimiter)).join('\r\n') + '\r\n';
}

const FORMULA_START = /^[=+\-@\t\r]/;
const PLAIN_NUMBER = /^[-+]?(\d+(\.\d*)?|\.\d+)(e[-+]?\d+)?$/i;

/**
 * Spreadsheets run cells that start with = + - or @ as formulas. Exported
 * cells get a leading apostrophe so opening a file never runs one; plain
 * numbers such as -5 are left alone.
 */
export function guardCell(cell: string): string {
  return FORMULA_START.test(cell) && !PLAIN_NUMBER.test(cell) ? `'${cell}` : cell;
}

/** Undoes guardCell on import. */
export function unguardCell(cell: string): string {
  return cell.length > 1 && cell[0] === "'" && FORMULA_START.test(cell.slice(1)) ? cell.slice(1) : cell;
}

/**
 * Splits a list cell such as "Venus|Mars" on | (and on new lines inside a
 * cell). A backslash keeps a | in the text: "Fish \| chips". Empty parts are
 * dropped. With `raw`, escapes are left in place for a second split.
 */
export function splitList(cell: string, raw = false): string[] {
  const parts: string[] = [];
  let current = '';
  for (let i = 0; i < cell.length; i++) {
    const c = cell[i]!;
    if (c === '\\' && i + 1 < cell.length && /[\\|=*]/.test(cell[i + 1]!)) {
      current += raw ? c + cell[i + 1] : cell[i + 1];
      i++;
    } else if (c === '|' || c === '\n') {
      parts.push(current);
      current = '';
    } else {
      current += c;
    }
  }
  parts.push(current);
  return parts.map((p) => p.trim()).filter((p) => p !== '');
}

/** Removes the escapes splitList(…, true) kept. */
export function unescapeCell(text: string): string {
  return text.replace(/\\([\\|=*])/g, '$1');
}

/** Escapes text for a list cell so splitList gives it back unchanged. */
export function escapeListPart(text: string, extra = ''): string {
  const chars = new Set(['\\', '|', ...extra]);
  let out = '';
  for (const c of text) out += chars.has(c) ? `\\${c}` : c;
  return out;
}

/**
 * Splits "left = right" on the first = that is not escaped. Also accepts
 * -> and → for people who write pairs as arrows.
 */
export function splitPair(rawPart: string): [string, string] | null {
  for (let i = 0; i < rawPart.length; i++) {
    const c = rawPart[i]!;
    if (c === '\\') {
      i++;
      continue;
    }
    if (c === '=') return [unescapeCell(rawPart.slice(0, i)).trim(), unescapeCell(rawPart.slice(i + 1)).trim()];
  }
  for (const arrow of ['->', '→']) {
    const at = rawPart.indexOf(arrow);
    if (at >= 0) return [unescapeCell(rawPart.slice(0, at)).trim(), unescapeCell(rawPart.slice(at + arrow.length)).trim()];
  }
  return null;
}
