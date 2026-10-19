// Test chamber: a 28 x 10 x 28 m room built from axis-aligned boxes (metres, y up).
// Walls are 1 m thick so anything straddling a portal is hidden inside solid geometry.

import { Vector3 } from 'three';

const v = (x, y, z) => new Vector3(x, y, z);

export const CONCRETE = 0xd9d6cf;
export const METAL = 0x3b3f46;
export const ACCENT = 0xb9c4d0;
// each wall gets its own tint so views through portals can be told apart (and tested)
export const TINT = { north: 0xe3cfa8, south: 0xb9cfe6, east: 0xc4dcc1, west: 0x9fb4e8, floor: 0xbdb8ae, ceiling: 0xe6e4df };

export function makeLevel() {
  const boxes = [
    { id: 'floor', min: v(-15, -1, -15), max: v(15, 0, 15), color: TINT.floor },
    { id: 'ceiling', min: v(-15, 10, -15), max: v(15, 11, 15), color: TINT.ceiling },
    { id: 'wall-north', name: 'north wall', min: v(-15, 0, -15), max: v(15, 10, -14), color: TINT.north },
    { id: 'wall-south', name: 'south wall', min: v(-15, 0, 14), max: v(15, 10, 15), color: TINT.south },
    { id: 'wall-west', name: 'west wall', min: v(-15, 0, -14), max: v(-14, 10, 14), color: TINT.west },
    { id: 'wall-east', name: 'east wall', min: v(14, 0, -14), max: v(15, 10, 14), color: TINT.east },
    // a metal panel that rejects portals (failure-state demo)
    { id: 'metal-panel', name: 'metal panel', min: v(13.6, 0, -4), max: v(14, 10, 4), color: METAL, portalable: false },
    // raised platform with two steps
    { id: 'platform', min: v(-14, 0, -14), max: v(-8, 3, -8), color: ACCENT },
    { id: 'step-1', min: v(-8, 0, -10.5), max: v(-6.5, 1, -8), color: ACCENT },
    { id: 'step-2', min: v(-8, 0, -12.5), max: v(-6.5, 2, -10.5), color: ACCENT },
    // a pillar too narrow for a portal (2 m < 2.2 m)
    { id: 'pillar', name: 'pillar', min: v(2, 0, -6), max: v(4, 10, -4), color: CONCRETE },
    // piston: portal-capable underside, slams to the floor and rises again
    { id: 'piston', name: 'piston', min: v(6, 6, 6), max: v(9.4, 7, 9.4), color: ACCENT,
      kinematic: { top: 6, bottom: 0.02, holdUp: 2.2, slam: 0.7475, holdDown: 0.6, rise: 3.0 } },
  ];
  return {
    boxes,
    spawn: { pos: v(0, 0, 9), yaw: 0, pitch: 0 },
  };
}
