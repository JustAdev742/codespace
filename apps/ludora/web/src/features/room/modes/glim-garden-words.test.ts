import { describe, expect, it } from 'vitest';
import type { PlotView } from '@ludora/engine/glim-garden';
import { dropsToGo, eventLine, hostPicture, jarLine, plantLine, playerPicture, stackNames, stageOf } from './glim-garden-words.ts';

const plot = (o: Partial<PlotView>): PlotView => ({ id: 'p', k: null, g: 0, r: [0, 0, 0], j: 0, s: 0, e: null, ...o });

describe('Glim Garden words', () => {
  it('names each stage of a plant', () => {
    expect(stageOf(plot({}))).toBe('bare');
    expect(stageOf(plot({ k: 'bush', g: 0 }))).toBe('seed');
    expect(stageOf(plot({ k: 'bush', g: 1 }))).toBe('sprout');
    expect(stageOf(plot({ k: 'bush', g: 2 }))).toBe('growing');
    expect(stageOf(plot({ k: 'bush', g: 3 }))).toBe('bud');
    expect(stageOf(plot({ k: 'bush', g: 4, b: 1 }))).toBe('bloom');
    expect(dropsToGo(plot({ k: 'tree', g: 2 }))).toBe(4);
    expect(dropsToGo(plot({ k: 'tree', g: 6, b: 1 }))).toBe(0);
  });

  it('says what a plot holds in a few plain words', () => {
    expect(plantLine(plot({}))).toBe('bare earth');
    expect(plantLine(plot({ k: 'flower', g: 0 }))).toBe('a flower seed, 2 drops to go');
    expect(plantLine(plot({ k: 'bush', g: 3, d: 1 }))).toBe('a bush, nearly open, 1 drop to go, drooping');
    expect(plantLine(plot({ k: 'flower', g: 1, l: 1 }), true)).toBe('a flower, nearly open, 1 drop to go, asleep until night, in lantern light');
    expect(plantLine(plot({ k: 'tree', g: 6, b: 1 }))).toBe('a lantern tree in bloom');
    expect(jarLine(plot({ j: 2 }), 6)).toBe('2 of 6 fireflies');
    expect(jarLine(plot({ j: 7 }), 6)).toBe('glowing, 7 fireflies');
  });

  it('describes the player’s picture: their plot, each neighbour and the garden', () => {
    const text = playerPicture({ mine: plot({ k: 'bush', g: 1, j: 1 }), neighbours: [{ name: 'Ava', plot: plot({ id: 'a', k: 'flower', g: 1 }) }], need: 6, glowing: 3, goal: 8, asleep: false, dark: null });
    expect(text).toBe('Your plot: a bush, 3 drops to go. 1 of 6 fireflies. Next to you: Ava, a flower, nearly open, 1 drop to go. The garden: 3 of 8 plots glowing.');
    expect(playerPicture({ mine: plot({}), neighbours: [], need: 4, glowing: 0, goal: 1, asleep: false, dark: false })).toMatch(/No plots next to yours\. .* It is day\.$/);
  });

  it('describes the big screen and what just happened', () => {
    expect(hostPicture({ plots: 30, glowing: 5, goal: 24, fireflies: 40, blooming: 9, teams: null, dark: null })).toBe('The class garden at night: 30 plots, 9 in bloom, 5 of 24 glowing. 40 fireflies.');
    expect(eventLine(plot({ k: 'bush', g: 2, e: 'gift' }), 'Ben', 'Ava', false)).toBe('Ava gave Ben’s bush a drop.');
    expect(eventLine(plot({ k: 'flower', g: 2, b: 1, e: 'bloom' }), 'Ben', null, true)).toBe('Your flower opened!');
  });

  it('stacks crowded names, five at most', () => {
    expect(stackNames(['Zed', 'Ava'])).toBe('Ava\nZed');
    expect(stackNames(['a', 'b', 'c', 'd', 'e', 'f', 'g']).split('\n')).toEqual(['a', 'b', 'c', 'd', 'and 3 more']);
  });
});
