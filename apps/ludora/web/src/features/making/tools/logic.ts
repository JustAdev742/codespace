/*
 * The classroom tools' arithmetic, kept apart from the screens so it can be tested. Pure.
 */

export type Light = 'green' | 'amber' | 'red';
export const LIGHTS: Light[] = ['green', 'amber', 'red'];
export const LIGHT_LABEL: Record<Light, string> = { green: 'Got it', amber: 'Nearly', red: 'Stuck' };

/** Shares of a check-in, as whole percentages that add up to 100 (largest remainders). */
export function lightShares(counts: Record<Light, number>): Record<Light, number> {
  const total = LIGHTS.reduce((n, l) => n + Math.max(0, counts[l]), 0);
  if (!total) return { green: 0, amber: 0, red: 0 };
  const raw = LIGHTS.map((l) => (Math.max(0, counts[l]) / total) * 100);
  const floors = raw.map(Math.floor);
  let left = 100 - floors.reduce((a, b) => a + b, 0);
  const order = raw.map((r, i) => ({ i, rem: r - floors[i]! })).sort((a, b) => b.rem - a.rem);
  for (const o of order) {
    if (left <= 0) break;
    floors[o.i]!++;
    left--;
  }
  return { green: floors[0]!, amber: floors[1]!, red: floors[2]! };
}

/** One line on what a check-in says, for the teacher and a screen reader. */
export function checkInSummary(counts: Record<Light, number>): string {
  const total = LIGHTS.reduce((n, l) => n + counts[l], 0);
  if (!total) return 'No one counted yet.';
  const s = lightShares(counts);
  if (counts.red / total >= 0.3) return `${s.red}% are stuck: worth going over it again.`;
  if (counts.green / total >= 0.7) return `${s.green}% have got it: ready to move on.`;
  return `${s.green}% got it, ${s.amber}% nearly, ${s.red}% stuck.`;
}

export interface Score {
  id: string;
  label: string;
  points: number;
}

export const SCORE_LIMITS = { rows: 12, label: 40, points: 9999 } as const;

export function addScore(scores: readonly Score[], label: string, id: string): Score[] {
  const name = label.trim().slice(0, SCORE_LIMITS.label);
  if (!name || scores.length >= SCORE_LIMITS.rows) return [...scores];
  return [...scores, { id, label: name, points: 0 }];
}

export function bump(scores: readonly Score[], id: string, by: number): Score[] {
  return scores.map((s) => (s.id === id ? { ...s, points: Math.max(-SCORE_LIMITS.points, Math.min(SCORE_LIMITS.points, s.points + by)) } : s));
}

/** Rows best first, with a shared place for a tie ("1st, 1st, 3rd"). */
export function ranked(scores: readonly Score[]): (Score & { place: number })[] {
  const sorted = [...scores].sort((a, b) => b.points - a.points || a.label.localeCompare(b.label));
  return sorted.map((s) => ({ ...s, place: sorted.findIndex((x) => x.points === s.points) + 1 }));
}

/** Minutes, seconds and tenths for a stopwatch: "1:05.3", or "1:02:05" past an hour. */
export function stopwatchText(ms: number): string {
  const t = Math.max(0, Math.floor(ms / 100));
  const tenths = t % 10;
  const s = Math.floor(t / 10) % 60;
  const m = Math.floor(t / 600) % 60;
  const h = Math.floor(t / 36000);
  if (h) return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  return `${m}:${String(s).padStart(2, '0')}.${tenths}`;
}

/** The picker's pool from what it remembers: everyone not picked yet this round. */
export function poolFrom(everyone: readonly string[], picked: readonly string[]): string[] {
  const done = new Set(picked);
  const left = everyone.filter((id) => !done.has(id));
  return left.length ? left : [];
}
