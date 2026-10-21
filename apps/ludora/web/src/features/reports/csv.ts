/*
 * CSV files built in the browser from report data the page already has.
 * Every text cell is quoted, and text that a spreadsheet would run as a
 * formula (a player could be called "=SUM(A1)") is neutralised with a
 * leading apostrophe. A byte order mark makes Excel read accented names.
 */

export type CsvCell = string | number | null | undefined;

function cell(v: CsvCell): string {
  if (v === null || v === undefined) return '';
  if (typeof v === 'number') return Number.isFinite(v) ? String(v) : '';
  const s = /^[=+\-@\t\r]/.test(v) ? `'${v}` : v;
  return `"${s.replace(/"/g, '""')}"`;
}

export function toCsv(rows: CsvCell[][]): string {
  return rows.map((row) => row.map(cell).join(',')).join('\r\n');
}

export function downloadCsv(filename: string, rows: CsvCell[][]) {
  const blob = new Blob([`﻿${toCsv(rows)}\r\n`], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.append(a);
  a.click();
  a.remove();
  // Some browsers cancel the download if the address is revoked straight away.
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

/** A short, safe piece of a filename: "7B Science: Week 2" becomes "7b-science-week-2". */
export function slug(text: string, max = 40): string {
  const s = text
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, max)
    .replace(/-+$/g, '');
  return s || 'report';
}

const pad = (n: number) => String(n).padStart(2, '0');

/** Local date and time that sorts correctly in a spreadsheet: 2026-10-21 14:05. */
export function csvDateTime(iso: string | null | undefined): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/** Today's local date for filenames: 2026-10-21. */
export function fileDate(d = new Date()): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/** A 0-1 rate as a whole-number percentage for a spreadsheet column, or blank. */
export function csvPercent(rate: number | null | undefined): number | null {
  return rate === null || rate === undefined || !Number.isFinite(rate) ? null : Math.round(rate * 100);
}
