import type { SettingField, SettingValues } from '@ludora/shared';

/**
 * Turn whatever a host sent into valid settings: unknown keys are dropped,
 * numbers are clamped and stepped, unknown options fall back to defaults.
 */
export function parseSettings(fields: readonly SettingField[], input: Record<string, unknown> = {}): SettingValues {
  const out: SettingValues = {};
  for (const f of fields) {
    const raw = input[f.key];
    switch (f.kind) {
      case 'number': {
        let v = typeof raw === 'number' && Number.isFinite(raw) ? raw : f.default;
        v = Math.min(f.max, Math.max(f.min, v));
        if (f.step) v = Math.round((v - f.min) / f.step) * f.step + f.min;
        out[f.key] = Math.min(f.max, v);
        break;
      }
      case 'select':
        out[f.key] = typeof raw === 'string' && f.options.some((o) => o.value === raw) ? raw : f.default;
        break;
      case 'toggle':
        out[f.key] = typeof raw === 'boolean' ? raw : f.default;
        break;
    }
  }
  return out;
}

export function defaultSettings(fields: readonly SettingField[]): SettingValues {
  return parseSettings(fields, {});
}
