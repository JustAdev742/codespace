import { describe, expect, it } from 'vitest';
import { COMMON_FIELDS } from '@ludora/shared';
import { CATALOG } from '../src/catalog.ts';
import { MODES, VARIANTS } from '../src/modes/index.ts';

/*
 * The host form is built from each mode's declared shared settings, so the
 * declaration has to match what the engine actually uses.
 */
describe('shared settings declarations', () => {
  it.each(MODES.map((m) => [m.meta.id, m] as const))('%s uses its declared defaults', (_id, mode) => {
    expect(mode.defaults).toBe(mode.meta.common.defaults);
    for (const f of mode.meta.common.fields) expect(COMMON_FIELDS).toContain(f);
    for (const k of Object.keys(mode.meta.common.help ?? {})) expect(mode.meta.common.fields).toContain(k);
  });

  it('every shared setting a variant fixes is one the host form shows', () => {
    for (const v of VARIANTS) {
      const mode = MODES.find((m) => m.meta.id === v.meta.modeId)!;
      for (const key of v.locked ?? []) {
        if ((COMMON_FIELDS as readonly string[]).includes(key)) expect(mode.meta.common.fields, `${v.meta.id} locks ${key}`).toContain(key);
      }
    }
  });

  it('the browser catalogue carries the same declarations', () => {
    for (const m of MODES) expect(CATALOG.find((c) => c.meta.id === m.meta.id)?.meta.common).toEqual(m.meta.common);
  });
});
