import { describe, expect, it } from 'vitest';
import { TAG } from '@ludora/engine/glow-tag';
import { directionWords, parkWords } from './glow-tag-words.ts';

// Heading 0 faces +z. Turning left (A) raises the heading, so after a quarter turn left you face +x.
const facingZ = { x: 0, z: 0, h: 0 };

describe('Glow Tag in words', () => {
  it('says which way a point lies from where you face', () => {
    expect(directionWords(facingZ, 0, 10)).toBe('straight ahead');
    expect(directionWords(facingZ, 10, 0)).toBe('on your left');
    expect(directionWords(facingZ, -10, 0)).toBe('on your right');
    expect(directionWords(facingZ, 6, 6)).toBe('ahead on your left');
    expect(directionWords(facingZ, -6, -6)).toBe('behind you on your right');
    expect(directionWords(facingZ, 0, -10)).toBe('behind you');
    // Turned a quarter left, the point that was on your left is now ahead.
    expect(directionWords({ x: 0, z: 0, h: Math.PI / 2 }, 10, 0)).toBe('straight ahead');
  });

  it('names the nearest rival, which way and how far, and where you are against the ring', () => {
    const rivals = [
      { name: 'Far Fox', x: 0, z: 40 },
      { name: 'Near Newt', x: -5, z: 5 },
    ];
    expect(parkWords({ me: facingZ, rivals, ring: { x: 0, z: 0, r: 50 }, size: 100, lightsOut: false, teams: false })).toBe(
      '2 other players are glowing. Nearest: Near Newt, ahead on your right, in tagging range. You are inside the ring.',
    );
    expect(parkWords({ me: facingZ, rivals: [{ name: 'Mid Mole', x: 0, z: TAG.range + 4 }], ring: null, size: 100, lightsOut: false, teams: true })).toBe(
      '1 rival is glowing. Nearest: Mid Mole, straight ahead, near.',
    );
  });

  it('points the way back into the ring from outside it, and warns near an edge the walls do not hide', () => {
    expect(parkWords({ me: facingZ, rivals: [], ring: { x: 0, z: -30, r: 10 }, size: 100, lightsOut: false, teams: false })).toBe(
      'No other players are glowing. You are outside the ring. The way back in is behind you.',
    );
    expect(parkWords({ me: { x: 0, z: 4, h: 0 }, rivals: [], ring: { x: 0, z: 0, r: 8 }, size: 100, lightsOut: false, teams: false })).toBe(
      'No other players are glowing. You are inside the ring, near its edge.',
    );
    // The first ring reaches past the park's corners: its edge is beyond the walls, so no warning.
    expect(parkWords({ me: { x: 18, z: 18, h: 0 }, rivals: [], ring: { x: 0, z: 0, r: 30 }, size: 40, lightsOut: false, teams: false })).toBe(
      'No other players are glowing. You are inside the ring.',
    );
  });

  it('counts only who you can see in Lights Out, and only the count when you are not in the park', () => {
    expect(parkWords({ me: facingZ, rivals: [], ring: null, size: 100, lightsOut: true, teams: false })).toBe('Nobody is close enough to see.');
    expect(parkWords({ me: null, rivals: [{ name: 'Near Newt', x: 1, z: 1 }], ring: { x: 0, z: 0, r: 1 }, size: 100, lightsOut: true, teams: false })).toBe(
      '1 other player is close enough to see.',
    );
  });
});
