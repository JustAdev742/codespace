/*
 * What the browser needs from Glim Garden: the plant table, the numbers and the
 * garden layout, no game logic. Imported by the screens through `@ludora/engine/glim-garden`.
 */
export { DAY_SEC, DROOP_SEC, GIFT_FIREFLIES, GIFT_POINTS, GIFT_POINTS_TO, KINDS, LIGHT_SEC, MAX_DROPS, NIGHT_SEC, GOAL_SHARE, PLANTS, PLOT_FIREFLIES, goalFor, type GardenSize, type Kind, type PlantInfo } from './meta.ts';
export { PLOT_GAP, cellOf, columnsFor, gardenSize, neighboursOf, plotPosition, rowsFor } from './layout.ts';
export type { PlotEvent, PlotView } from './index.ts';
