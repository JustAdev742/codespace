/*
 * What the browser needs from Lantern Rally: the circuits, the numbers and the
 * odds, no game logic. Imported by the mode's screens through `@ludora/engine/lantern-rally`.
 */
export { BOOST, COUGH, GLOW, GRID_MS, HAZARD, LANE_MS, MAX_CHARGES, POINTS, PRIZE_INFO, SLIP, SPEED, STEADY_MS, WHISTLE_MS, type ItemKind, type Prize } from './meta.ts';
export { CIRCUITS, CIRCUIT_IDS, LANES, LANE_WIDTH, laneOffset, lapLength, lapPos, pointAt, trackBounds, trackPath, type Circuit, type CircuitId, type TrackPath, type TrackPoint } from './track.ts';
export { prizeOdds } from './odds.ts';
