import { describe, expect, it } from 'vitest';
import { lookOf, shotFor, worldFor } from './gate.ts';

describe('which world a game is played in', () => {
  it('a mode with a world of its own plays there, and every other mode at the lantern festival', () => {
    expect(worldFor('classic', null)).toBe('festival');
    expect(worldFor('comet-dash', null)).toBe('cosmos');
    expect(worldFor('night-market', null)).toBe('market');
    expect(worldFor('gloom-giant', null)).toBe('gloom');
    expect(worldFor('a mode nobody has written yet', null)).toBe('festival');
  });

  it("a school's copy keeps to its own place, whatever the game", () => {
    expect(worldFor('classic', 'hills-grammar')).toBe('hills');
    expect(worldFor('comet-dash', 'hills-grammar')).toBe('hills');
  });
});

describe('where the camera is', () => {
  it('follows a game played in rounds from the lobby to the standings', () => {
    expect(shotFor({ status: 'lobby' })).toBe('lobby');
    expect(shotFor({ status: 'running', phase: 'intro' })).toBe('ready');
    expect(shotFor({ status: 'running', phase: 'question' })).toBe('question');
    expect(shotFor({ status: 'running', phase: 'reveal' })).toBe('reveal');
    expect(shotFor({ status: 'running', phase: 'leaderboard' })).toBe('standings');
    expect(shotFor({ status: 'paused', phase: 'question' })).toBe('question');
  });

  it('goes to the podium only when there are places to give', () => {
    expect(shotFor({ status: 'ended', outcome: 'competitive', standings: 3 })).toBe('podium');
    expect(shotFor({ status: 'ended', outcome: 'competitive', standings: 1 })).toBe('lobby');
    expect(shotFor({ status: 'ended', outcome: 'coop-win', standings: 12 })).toBe('lobby');
    expect(shotFor({ status: 'ended' })).toBe('lobby');
  });
});

describe('who stands on the stage', () => {
  const art = { kind: 'glim', body: 'blob', hue: 10, accentHue: 50, saturation: 65, eyes: 'dot', mouth: 'smile', pattern: 'none', topper: 'none', cheeks: true } as never;
  it("a player's own Glim, dressed as they dress it", () => {
    const look = lookOf({ art, rarity: 'rare' as never }, art);
    expect(look.art).toBe(art);
    expect(look.rarity).toBe('rare');
    expect(look.dress).toBeNull();
  });

  it('a stand-in for a player with none, always the same for them', () => {
    expect(lookOf(null, art)).toEqual({ art, dress: null });
    expect(lookOf(undefined, art)).toEqual({ art, dress: null });
  });
});
