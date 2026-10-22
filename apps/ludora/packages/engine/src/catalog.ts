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

/**
 * Whether a mode or variant is always played in teams. The engine puts players into
 * teams for these whatever the host picks (see resolveGameConfig), and one player
 * cannot make up teams.
 */
export function teamsOnly(mode: CatalogMode, variant?: ModeVariant | null): boolean {
  return mode.meta.teams === 'required' || Boolean(variant?.common?.teamCount);
}

/**
 * Why a mode or variant cannot be played by one person on their own (a solo room or a
 * class assignment), or null if it can. Solo rooms have no host screen, so a host-paced
 * game must move on by itself, and team games need several players. `settings` are the
 * host's choices, which locked variant settings override.
 */
export function soloBlocker(modeId: string, variantId: string | null, settings: Readonly<Record<string, unknown>> = {}): string | null {
  const found = variantId ? findCatalogVariant(variantId) : undefined;
  const mode = found?.mode ?? findCatalogMode(modeId);
  if (!mode) return 'That game mode does not exist.';
  const variant = found?.variant;
  const title = variant?.meta.title ?? mode.meta.title;
  if (mode.meta.players.min > 1) return `${title} needs several players at once. Pick a mode that works solo.`;
  if (teamsOnly(mode, variant)) return `${title} is played in teams, so it needs several players at once. Pick a mode that works solo.`;
  const field = mode.settings.find((f) => f.key === 'autoAdvance');
  if (mode.meta.pacing === 'host' && field) {
    const chosen = variant?.locked?.includes('autoAdvance') ? variant.settings?.autoAdvance : (settings.autoAdvance ?? variant?.settings?.autoAdvance);
    if ((chosen ?? field.default) === false) return `${title} waits for a host to move on to each question, so it cannot be played alone.`;
  }
  return null;
}
