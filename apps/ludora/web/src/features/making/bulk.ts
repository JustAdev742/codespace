import { ApiError } from '../../lib/api.ts';

/*
 * One request per item, a few at a time, and an honest account of each: done, or not done with
 * the server's reason. Used for the bulk actions on the Make pages, which are the ordinary
 * requests made many times, so the server checks every one as it always does.
 */

export interface EachResult {
  id: string;
  label: string;
  ok: boolean;
  message: string;
}

export async function runEach<T extends { id: string; label: string }>(items: readonly T[], act: (item: T) => Promise<unknown>, atOnce = 3): Promise<EachResult[]> {
  const out: EachResult[] = Array.from({ length: items.length });
  let next = 0;
  const worker = async () => {
    while (next < items.length) {
      const i = next++;
      const item = items[i]!;
      try {
        await act(item);
        out[i] = { id: item.id, label: item.label, ok: true, message: '' };
      } catch (err) {
        out[i] = { id: item.id, label: item.label, ok: false, message: err instanceof ApiError ? err.message : 'It could not be reached. Check your connection and try again.' };
      }
    }
  };
  await Promise.all(Array.from({ length: Math.min(atOnce, items.length) }, worker));
  return out;
}
