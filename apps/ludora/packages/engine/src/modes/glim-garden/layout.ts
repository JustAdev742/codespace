/*
 * Where each plot sits in a garden, and who its neighbours are. Shared by the
 * mode (gifts go to neighbours, a lantern tree lights them), the 3D scenes
 * and the 2D drawing, so every screen agrees. Browser-safe.
 *
 * A garden is a grid of plots, filled row by row from the front: a few
 * columns for a small class, up to twelve for a big one. Neighbours are the
 * plots beside, in front of and behind a plot (up to four).
 */

/** Columns for a garden of `n` plots. */
export function columnsFor(n: number): number {
  if (n <= 1) return 1;
  if (n <= 3) return n;
  return Math.max(2, Math.min(12, Math.ceil(Math.sqrt(n * 1.6))));
}

export function rowsFor(n: number): number {
  return Math.max(1, Math.ceil(n / columnsFor(n)));
}

/** Column and row of plot `i` (row 0 is the front). The last row is centred when it is short. */
export function cellOf(i: number, n: number): { col: number; row: number } {
  const cols = columnsFor(n);
  const row = Math.floor(i / cols);
  const inRow = Math.min(cols, n - row * cols);
  const shift = (cols - inRow) / 2;
  return { col: (i % cols) + shift, row };
}

/** The plots next to plot `i`: beside it in its row, and the nearest in the rows in front and behind. */
export function neighboursOf(i: number, n: number): number[] {
  if (n <= 1) return [];
  const cols = columnsFor(n);
  const me = cellOf(i, n);
  const out: number[] = [];
  const row = Math.floor(i / cols);
  if (i - 1 >= row * cols) out.push(i - 1);
  if (i + 1 < Math.min(n, (row + 1) * cols)) out.push(i + 1);
  // In the rows in front and behind: any plot less than a column away (a centred short row
  // touches two). Worked out the same way from both sides, so neighbours always go both ways.
  for (const r of [row - 1, row + 1]) {
    if (r < 0 || r * cols >= n) continue;
    for (let j = r * cols; j < Math.min(n, (r + 1) * cols); j++) if (Math.abs(cellOf(j, n).col - me.col) < 0.75) out.push(j);
  }
  return out.sort((a, b) => a - b);
}

/** Plot spacing in metres, for the scenes and the 2D drawing. */
export const PLOT_GAP = 3.2;

/** Where plot `i` stands, in metres, with the garden centred on x = 0 and the front row at z = 0 (rows go back, -z). */
export function plotPosition(i: number, n: number): { x: number; z: number } {
  const cols = columnsFor(n);
  const { col, row } = cellOf(i, n);
  return { x: (col - (cols - 1) / 2) * PLOT_GAP, z: -row * PLOT_GAP };
}

/** The garden's size in metres (plots only, edge to edge). */
export function gardenSize(n: number): { width: number; depth: number } {
  return { width: columnsFor(n) * PLOT_GAP, depth: rowsFor(n) * PLOT_GAP };
}
