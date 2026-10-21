import type { ModeMeta, SettingField } from '@ludora/shared';
import type { ModeVariant } from '../sdk/types.ts';
import * as classic from './classic/meta.ts';
import * as cometDash from './comet-dash/meta.ts';

/**
 * Metadata only, no game logic, so the browser can import the catalogue
 * without bundling every mode. Keep in step with ./index.ts (a test checks).
 */
export const CATALOG_DATA: readonly { meta: ModeMeta; settings: readonly SettingField[]; variants: readonly ModeVariant[] }[] = [classic, cometDash];
