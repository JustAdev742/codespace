import { fieldMeter, streamParts } from './helpers.ts';
import type { ChaosAdapter } from '../types.ts';
import { BACKUP_MAX, DOUBLE, FIREWALL_MAX, SURGE } from '../../modes/code-breakers/meta.ts';

export const codeBreakersAdapter: ChaosAdapter = {
  modeId: 'code-breakers',
  meters: [
    // Bits are the score. Reaching "Bits to win" is announced by the mode, so cheats stop a bit short.
    fieldMeter('score', 'Bits', (s: any) => s.hackers, 'bits', {
      max: (s: any, _id, ctx) => (s.winner === null && Number(ctx.settings.goalBits) > 0 ? Number(ctx.settings.goalBits) - 1 : Number.MAX_SAFE_INTEGER),
    }),
    fieldMeter('firewall', 'Firewall charges', (s: any) => s.hackers, 'firewall', { max: () => FIREWALL_MAX }),
    fieldMeter('backup', 'Backups', (s: any) => s.hackers, 'backup', { max: () => BACKUP_MAX }),
    fieldMeter('surge', 'Surge charges', (s: any) => s.hackers, 'surge', { max: () => SURGE.max }),
    fieldMeter('double', 'Double charges', (s: any) => s.hackers, 'double', { max: () => DOUBLE.max }),
    {
      key: 'vault',
      label: 'Bits in the Vault',
      scope: 'global',
      get: (s: any) => s.vault?.bits ?? 0,
      set: (s: any, _id, v) => {
        if (s.vault) s.vault.bits = v;
      },
      // A cracked vault restarts from 100, so cheats never empty it below that.
      min: 100,
      max: () => 100_000,
      offered: (settings) => settings.heist === true,
    },
  ],
  ...streamParts((s: any, id) => s.hackers[id]?.stream),
  features: (settings) => [...(settings.events === false ? [] : ['events']), ...(settings.heist === true ? ['heist'] : [])],
};
