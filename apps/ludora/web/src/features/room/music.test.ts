import { describe, expect, it } from 'vitest';
import type { RoomView } from '@ludora/shared';
import { MODES } from '@ludora/engine';
import { MUSIC_ASSETS } from '../../lib/sound/assets.generated.ts';
import { MODE_MUSIC, STRETCH_MS, inFinalStretch, roomMusic } from './music.ts';

function room(status: RoomView['room']['status'], modeId = 'classic', results: RoomView['results'] = null) {
  return { room: { status, modeId }, results } as unknown as RoomView;
}

describe('room music', () => {
  it('gives every mode its own choice of a track that exists', () => {
    for (const { meta } of MODES) {
      expect(MODE_MUSIC[meta.id], `${meta.id} needs an entry in MODE_MUSIC`).toBeDefined();
      expect(MUSIC_ASSETS[MODE_MUSIC[meta.id]!]).toBeDefined();
    }
  });

  it('plays the lobby only on the host screen, and nothing on phones', () => {
    expect(roomMusic(room('lobby'), 'host', false)).toBe('lobby');
    expect(roomMusic(room('lobby'), 'player', false)).toBeNull();
    expect(roomMusic(room('running'), 'player', false)).toBeNull();
    expect(roomMusic(room('ended'), 'player', false)).toBeNull();
  });

  it("plays the mode's own track, then the final stretch", () => {
    expect(roomMusic(room('running', 'gloom-giant'), 'host', false)).toBe('battle');
    expect(roomMusic(room('running', 'word-scramble'), 'solo', false)).toBe('calm');
    expect(roomMusic(room('running', 'a-mode-from-later'), 'solo', false)).toBe('game');
    expect(roomMusic(room('running', 'classic'), 'host', true)).toBe('intense');
  });

  it('rests while paused, and celebrates at the end unless a co-op game was lost', () => {
    expect(roomMusic(room('paused'), 'host', false)).toBeNull();
    const results = (outcome: string) => ({ outcome }) as unknown as RoomView['results'];
    expect(roomMusic(room('ended', 'classic', results('competitive')), 'host', false)).toBe('results');
    expect(roomMusic(room('ended', 'gloom-giant', results('coop-loss')), 'solo', false)).toBe('calm');
  });
});

describe('the final stretch', () => {
  it('starts in the last half minute of a timed game', () => {
    expect(inFinalStretch('time-attack', { endsAt: 100_000 }, 100_000 - STRETCH_MS - 1)).toBe(false);
    expect(inFinalStretch('time-attack', { endsAt: 100_000 }, 100_000 - STRETCH_MS)).toBe(true);
    expect(inFinalStretch('time-attack', { endsAt: 100_000 }, 100_001)).toBe(false);
    expect(inFinalStretch('time-attack', { endsAt: null }, 0)).toBe(false);
  });

  it('starts on the last question, or the last two of a long game', () => {
    expect(inFinalStretch('classic', { sync: { round: 3, total: 5 } }, 0)).toBe(false);
    expect(inFinalStretch('classic', { sync: { round: 4, total: 5 } }, 0)).toBe(true);
    expect(inFinalStretch('confidence', { round: 7, total: 10 }, 0)).toBe(false);
    expect(inFinalStretch('confidence', { round: 8, total: 10 }, 0)).toBe(true);
    // Too short a game to have a stretch.
    expect(inFinalStretch('classic', { sync: { round: 1, total: 2 } }, 0)).toBe(false);
  });

  it('follows a mode that says so, and the Giant when it is enraged; never in study mode', () => {
    expect(inFinalStretch('night-market', { finalStretch: true, endsAt: 1e9 }, 0)).toBe(true);
    expect(inFinalStretch('night-market', { finalStretch: false, endsAt: 10 }, 0)).toBe(false);
    expect(inFinalStretch('gloom-giant', { enraged: true, endsAt: 1e9 }, 0)).toBe(true);
    expect(inFinalStretch('flashcard-study', { endsAt: 10_000 }, 5_000)).toBe(false);
    expect(inFinalStretch('classic', null, 0)).toBe(false);
  });
});
