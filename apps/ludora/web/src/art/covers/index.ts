import type { ComponentType } from 'react';
import type { Palette } from './kit.tsx';

/*
 * The cover of every mode, one module each in ./modes, named by mode id. They
 * load on demand, a few kilobytes each, with the pages that show them; the
 * shared pieces (kit.tsx) load once.
 */
export type CoverComponent = ComponentType<{ p: Palette }>;

const FILES = import.meta.glob<{ default: CoverComponent }>('./modes/*.tsx');

/** Loaders by mode id. */
export const COVER_LOADERS: Record<string, () => Promise<{ default: CoverComponent }>> = Object.fromEntries(
  Object.entries(FILES).map(([path, load]) => [path.slice('./modes/'.length, -'.tsx'.length), load]),
);

export function hasCover(modeId: string): boolean {
  return modeId in COVER_LOADERS;
}

const loaded = new Map<string, CoverComponent>();
const loading = new Map<string, Promise<CoverComponent | null>>();

/** The cover if it has loaded already, so a page that has shown it once draws it at once. */
export function loadedCover(modeId: string): CoverComponent | undefined {
  return loaded.get(modeId);
}

export function loadCover(modeId: string): Promise<CoverComponent | null> {
  const ready = loaded.get(modeId);
  if (ready) return Promise.resolve(ready);
  const load = COVER_LOADERS[modeId];
  if (!load) return Promise.resolve(null);
  let p = loading.get(modeId);
  if (!p) {
    p = load().then(
      (m) => {
        loaded.set(modeId, m.default);
        return m.default;
      },
      () => {
        // A chunk that failed to load (a new deploy, a dropped connection) is tried again next time.
        loading.delete(modeId);
        return null;
      },
    );
    loading.set(modeId, p);
  }
  return p;
}
