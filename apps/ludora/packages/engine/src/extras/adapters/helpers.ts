import type { StreamState } from '../../mechanics/selfPaced.ts';
import type { SyncState } from '../../mechanics/syncRounds.ts';
import type { PlayerId } from '../../sdk/types.ts';
import type { ChaosAdapter, MeterDef } from '../types.ts';

/*
 * Building blocks for mode adapters: most meters are one number field on a
 * per-player record, and most question access goes through syncRounds or a
 * selfPaced stream.
 */

type Records<S> = (s: S) => Record<PlayerId, any> | undefined;

/** A per-player number stored at `records(s)[id][field]`. Missing records read as 0 and are never created. */
export function fieldMeter<S>(
  key: string,
  label: string,
  records: Records<S>,
  field: string,
  opts: Pick<MeterDef<S>, 'min' | 'max' | 'integer'> = {},
): MeterDef<S> {
  return {
    key,
    label,
    scope: 'player',
    get: (s, id) => Number(records(s)?.[id]?.[field] ?? 0),
    set: (s, id, v) => {
      const r = records(s)?.[id];
      if (r) r[field] = v;
    },
    ...opts,
  };
}

/** syncRounds scores, which most host-paced modes rank by. */
export function syncScoreMeter<S extends { sync: SyncState }>(label = 'Points', opts: Pick<MeterDef<S>, 'min' | 'max'> = {}): MeterDef<S> {
  return {
    key: 'score',
    label,
    scope: 'player',
    get: (s, id) => s.sync.scores[id] ?? 0,
    set: (s, id, v) => {
      if (id in s.sync.scores) s.sync.scores[id] = v;
    },
    ...opts,
  };
}

export function syncParts<S extends { sync: SyncState }>(): Pick<ChaosAdapter<S>, 'sync' | 'question'> {
  return {
    sync: (s) => s.sync,
    question: (s) => (s.sync.phase === 'question' ? s.sync.iid : null),
  };
}

export function streamParts<S>(stream: (s: S, id: PlayerId) => StreamState | null | undefined): Pick<ChaosAdapter<S>, 'stream' | 'question'> {
  return {
    stream: (s, id) => stream(s, id) ?? null,
    question: (s, id) => stream(s, id)?.iid ?? null,
  };
}
