import type { ModeMeta, ModeStatus, SettingField, VariantMeta } from '@ludora/shared';
import { CATALOG_DATA } from './modes/catalog-data.ts';
import type { ModeVariant } from './sdk/types.ts';

/** What the browser shows in the mode picker. No game logic is imported here. */
export interface CatalogMode {
  meta: ModeMeta;
  settings: readonly SettingField[];
  variants: readonly ModeVariant[];
}

export const CATALOG: readonly CatalogMode[] = CATALOG_DATA;

export function findCatalogMode(id: string): CatalogMode | undefined {
  return CATALOG.find((m) => m.meta.id === id);
}

export function findCatalogVariant(id: string): { mode: CatalogMode; variant: ModeVariant } | undefined {
  for (const mode of CATALOG) {
    const variant = mode.variants.find((v) => v.meta.id === id);
    if (variant) return { mode, variant };
  }
  return undefined;
}

/** Thumbnail for a variant: the mode's, with the variant's own overrides. */
export function variantThumbnail(mode: ModeMeta, v: VariantMeta) {
  return { ...mode.thumbnail, ...v.thumbnail };
}

export function catalogCounts() {
  const count = (s: ModeStatus) => ({
    modes: CATALOG.filter((m) => m.meta.status === s).length,
    variants: CATALOG.flatMap((m) => m.variants).filter((v) => v.meta.status === s).length,
  });
  return { playable: count('playable'), beta: count('beta'), planned: count('planned') };
}
