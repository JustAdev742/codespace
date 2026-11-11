/*
 * The rules of houses, cups, tournaments and class challenges, with no database: the routes and
 * the services call these, and the unit tests check them directly.
 */

/** The school's calendar day ("2027-03-01") for a moment, in its time zone. */
export function schoolDay(at: Date, timeZone: string): string {
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(at);
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? '';
  return `${get('year')}-${get('month')}-${get('day')}`;
}

/** 1 Monday to 7 Sunday, in the school's time zone. */
export function schoolWeekday(at: Date, timeZone: string): number {
  const name = new Intl.DateTimeFormat('en-GB', { timeZone, weekday: 'short' }).format(at);
  return ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].indexOf(name) + 1;
}

export function addDays(day: string, n: number): string {
  const d = new Date(`${day}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

/** Monday of the school week that holds `day`. */
export function weekStartDay(day: string): string {
  const wd = new Date(`${day}T00:00:00Z`).getUTCDay() || 7;
  return addDays(day, 1 - wd);
}

/**
 * House points a player may still earn from a game today: their right answers times the points
 * each is worth, but never past the school's daily cap.
 */
export function cappedPoints(correct: number, perCorrect: number, earnedToday: number, cap: number): number {
  const want = Math.max(0, Math.floor(correct)) * perCorrect;
  return Math.max(0, Math.min(want, cap - earnedToday));
}

export interface Total {
  id: string;
  points: number;
}

/** Totals highest first, with ranks that ties share (1, 1, 3). Equal points sort by the order given. */
export function rankTotals<T extends Total>(totals: readonly T[]): (T & { rank: number })[] {
  const sorted = [...totals].map((t, i) => ({ t, i })).sort((a, b) => b.t.points - a.t.points || a.i - b.i);
  let rank = 0;
  let last = Number.NaN;
  return sorted.map(({ t }, i) => {
    if (t.points !== last) rank = i + 1;
    last = t.points;
    return { ...t, rank };
  });
}

/** The winners of a cup: every house sharing the top total, or none when nobody scored. */
export function cupWinners<T extends Total>(totals: readonly T[]): T[] {
  const top = Math.max(0, ...totals.map((t) => t.points));
  return top > 0 ? totals.filter((t) => t.points === top) : [];
}

/** "Ash", "Ash and Oak", "Ash, Oak and Elm". */
export function joinNames(names: readonly string[]): string {
  if (names.length <= 1) return names[0] ?? '';
  return `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`;
}

/* ------------------------------- tournaments ------------------------------- */

export interface MatchSlot {
  round: number;
  slot: number;
  a: number | null;
  b: number | null;
  winner: number | null;
}

/**
 * The first round of a knockout for `n` entrants, padded to a power of two with byes. Seeds are
 * spread the usual way (1 meets the lowest) so byes go to the top seeds, never two byes together.
 * A bye's winner is filled in at once; later rounds start empty.
 */
export function knockoutBracket(n: number): MatchSlot[] {
  let size = 2;
  while (size < n) size *= 2;
  let order = [0];
  while (order.length < size) order = order.flatMap((s) => [s, order.length * 2 - 1 - s]);
  const rounds = Math.log2(size);
  const out: MatchSlot[] = [];
  for (let s = 0; s < size / 2; s++) {
    const a = order[s * 2]! < n ? order[s * 2]! : null;
    const b = order[s * 2 + 1]! < n ? order[s * 2 + 1]! : null;
    out.push({ round: 1, slot: s, a, b, winner: a !== null && b === null ? a : b !== null && a === null ? b : null });
  }
  for (let r = 2; r <= rounds; r++) for (let s = 0; s < size / 2 ** r; s++) out.push({ round: r, slot: s, a: null, b: null, winner: null });
  return advanceKnockout(out);
}

/** Carry every decided winner into its next match. Idempotent. */
export function advanceKnockout(matches: readonly MatchSlot[]): MatchSlot[] {
  const out = matches.map((m) => ({ ...m }));
  const at = (r: number, s: number) => out.find((m) => m.round === r && m.slot === s);
  const rounds = Math.max(...out.map((m) => m.round));
  for (let r = 1; r < rounds; r++) {
    for (const m of out.filter((x) => x.round === r)) {
      const next = at(r + 1, Math.floor(m.slot / 2));
      if (!next) continue;
      const side = m.slot % 2 === 0 ? 'a' : 'b';
      if (m.winner !== null && next[side] !== m.winner) next[side] = m.winner;
    }
  }
  return out;
}

/** Every pairing once, in rounds where nobody plays twice (the circle method). */
export function roundRobin(n: number): MatchSlot[] {
  const ids: (number | null)[] = Array.from({ length: n }, (_, i) => i);
  if (n % 2) ids.push(null);
  const m = ids.length;
  const out: MatchSlot[] = [];
  let arr = [...ids];
  for (let r = 0; r < m - 1; r++) {
    let slot = 0;
    for (let i = 0; i < m / 2; i++) {
      const a = arr[i]!;
      const b = arr[m - 1 - i]!;
      if (a !== null && b !== null) out.push({ round: r + 1, slot: slot++, a: Math.min(a, b), b: Math.max(a, b), winner: null });
    }
    arr = [arr[0]!, arr[m - 1]!, ...arr.slice(1, m - 1)];
  }
  return out;
}

/** Round robin table: 3 points a win, 1 a draw (winner -1 means a draw). */
export function roundRobinTable(n: number, matches: readonly MatchSlot[]): { entrant: number; played: number; won: number; drawn: number; lost: number; points: number }[] {
  const rows = Array.from({ length: n }, (_, entrant) => ({ entrant, played: 0, won: 0, drawn: 0, lost: 0, points: 0 }));
  for (const m of matches) {
    if (m.winner === null || m.a === null || m.b === null) continue;
    const a = rows[m.a]!;
    const b = rows[m.b]!;
    a.played++;
    b.played++;
    if (m.winner === -1) {
      a.drawn++;
      b.drawn++;
      a.points++;
      b.points++;
    } else {
      const [w, l] = m.winner === m.a ? [a, b] : [b, a];
      w.won++;
      w.points += 3;
      l.lost++;
    }
  }
  return rows.sort((x, y) => y.points - x.points || y.won - x.won || x.entrant - y.entrant);
}

/** The tournament's winner once every match is decided, or null. Round robin ties at the top have no single winner. */
export function tournamentWinner(format: 'knockout' | 'round_robin', n: number, matches: readonly MatchSlot[]): number[] | null {
  if (matches.some((m) => m.winner === null && m.a !== null && m.b !== null)) return null;
  if (format === 'knockout') {
    const final = matches.reduce((best, m) => (m.round > best.round ? m : best), matches[0]!);
    return final.winner !== null && final.winner >= 0 ? [final.winner] : null;
  }
  const table = roundRobinTable(n, matches);
  const top = table[0]!;
  return table.filter((r) => r.points === top.points && r.won === top.won).map((r) => r.entrant);
}

/* ---------------------------- class challenges ---------------------------- */

/**
 * A class's score in a challenge: the mean of each student's best accuracy, so a class of 12 and a
 * class of 30 compare fairly and one student playing many times does not count more.
 */
export function classAccuracy(plays: readonly { userId: string; correct: number; answered: number }[]): { students: number; accuracy: number | null } {
  const best = new Map<string, number>();
  for (const p of plays) {
    if (p.answered <= 0) continue;
    const acc = p.correct / p.answered;
    if (acc > (best.get(p.userId) ?? -1)) best.set(p.userId, acc);
  }
  if (!best.size) return { students: 0, accuracy: null };
  const sum = [...best.values()].reduce((a, b) => a + b, 0);
  return { students: best.size, accuracy: sum / best.size };
}
