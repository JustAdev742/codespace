/** What is next for a class: the first piece of work due from now, else the latest past its date with someone still to play. Pure. */
export function nextDue<T extends { dueAt: string | null; started: number; of: number }>(work: readonly T[], now: number): { item: T; late: boolean } | null {
  const dated = work.filter((w) => w.dueAt);
  const ahead = dated.filter((w) => Date.parse(w.dueAt!) >= now).sort((a, b) => Date.parse(a.dueAt!) - Date.parse(b.dueAt!));
  if (ahead.length) return { item: ahead[0]!, late: false };
  const behind = dated.filter((w) => Date.parse(w.dueAt!) < now && w.started < w.of).sort((a, b) => Date.parse(b.dueAt!) - Date.parse(a.dueAt!));
  return behind.length ? { item: behind[0]!, late: true } : null;
}
