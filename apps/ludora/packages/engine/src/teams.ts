import type { EngineTeam } from './sdk/types.ts';

export const TEAM_NAMES = ['Comets', 'Lanterns', 'Fireflies', 'Moonbeams', 'Embers', 'Tides'] as const;
export const TEAM_HUES = [42, 200, 145, 280, 8, 175] as const;

export function makeTeams(count: number): EngineTeam[] {
  return Array.from({ length: Math.min(count, TEAM_NAMES.length) }, (_, i) => ({ id: `t${i + 1}`, name: TEAM_NAMES[i]!, hue: TEAM_HUES[i]! }));
}
