/** The start and end of a day in this device's time, `offset` days from `now`, for asking the server about one day. Pure. */
export function dayBounds(now: Date, offset = 0): { from: Date; to: Date; key: string } {
  const from = new Date(now.getFullYear(), now.getMonth(), now.getDate() + offset);
  const to = new Date(now.getFullYear(), now.getMonth(), now.getDate() + offset + 1);
  const key = `${from.getFullYear()}-${String(from.getMonth() + 1).padStart(2, '0')}-${String(from.getDate()).padStart(2, '0')}`;
  return { from, to, key };
}
