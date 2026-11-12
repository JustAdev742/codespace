// Where things happen inside the filmed clips (frame numbers), set after looking at the footage.
export const MARK = {
  /** q1: the frame the hero's thumb lands on Mars. */
  tap: 150,
  /** q1: the frame the leaderboard opens on the big screen. */
  lead: 300,
  /** podium: the frame the host presses Next for the results. */
  pod: 8,
  /** make-notes: first frame worth showing. */
  notes: 10,
};
/** Crops of the tall designs footage (left, top, right, bottom as fractions): the Glim, and the painter. */
export const CROP = {
  designGlim: [0.19, 0.10, 0.60, 0.33] as [number, number, number, number],
  designPaint: [0.58, 0.60, 1.0, 0.95] as [number, number, number, number],
  /** An app page without its side menu and top bar. */
  page: [0.195, 0.062, 1.0, 1.0] as [number, number, number, number],
};
