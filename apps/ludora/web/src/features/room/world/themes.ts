/*
 * The worlds a game can be played in (D63). Every one is the same stage in a different place: a
 * festival field at night, a rock adrift among comets, a night market, a wood where something big is
 * watching. A world is its light, its colours and what stands behind its stage; BoardWorld.ts builds
 * the rest. A school's copy plays in its own place, in its own colours (D60).
 */

import { AdditiveBlending, BoxGeometry, ConeGeometry, CylinderGeometry, Mesh, MeshBasicMaterial, PlaneGeometry, SphereGeometry, TorusGeometry, type Scene } from 'three';
import type { Lighting } from '../../../three/World.ts';
import { toon } from '../../../three/toon.ts';
import * as props from '../../../three/props.ts';
import { skyGlow } from './BoardWorld.ts';

export interface WorldTheme {
  id: 'festival' | 'cosmos' | 'market' | 'gloom' | 'hills';
  /** For the sentence a screen reader hears, and for the docs. */
  name: string;
  seed: number;
  light: Lighting;
  ground: string;
  star: string;
  moon: { color: string; glow: string; size: number; at: [number, number, number] };
  /** Three rows of hills, nearest first. */
  hills: { color: string; at: number; width: number; height: number }[];
  trees: props.TreeKind | null;
  treeHue?: number;
  stage: { top: string; side: string; rim: string; ring: string; pool: string; step: string };
  /** Hues of the lamps on the posts, the bulbs on the strings and the lanterns in the sky. */
  lamps: number[];
  bulbs: number[];
  lanternHues: number[];
  /** How many lanterns drift up, as a share of the festival's. */
  lanterns: number;
  flags: string[];
  beams: [string, string, string];
  motes: string;
  confetti: string[];
  /** What this world keeps behind its stage. */
  dress: (scene: Scene, r: () => number) => void;
}

const FLAGS = ['#ff4d6a', '#ffc233', '#1fd38f', '#3d9bff', '#c86bff'];

/** A row of festival tents either side, lit from inside. */
function tents(colors: string[]) {
  return (scene: Scene, r: () => number) => {
    for (let i = 0; i < 8; i++) {
      const side = i % 2 ? 1 : -1;
      const tent = props.tent({ color: colors[i % colors.length]!, scale: 2.4 + r() * 1.3 });
      tent.position.set(side * (11 + Math.floor(i / 2) * 5.5 + r() * 1.5), 0, -6 - Math.floor(i / 2) * 4.5 - r() * 2);
      tent.rotation.y = -side * 0.5;
      scene.add(tent);
    }
  };
}

const festival: WorldTheme = {
  id: 'festival',
  name: 'the lantern festival',
  seed: 7,
  light: { skyTop: '#04061f', horizon: '#2a2f8c', ground: '#161d5e', sun: '#c9d6ff', sunIntensity: 1.5, fill: 1.25, sunFrom: [3, 9, 8], fogNear: 34, fogFar: 170 },
  ground: '#0c1240',
  star: '#dfe8ff',
  moon: { color: '#fff4d6', glow: '#8fa8ff', size: 13, at: [70, 78, -230] },
  hills: [
    { color: '#141d63', at: 44, width: 15, height: 9 },
    { color: '#10185a', at: 72, width: 22, height: 15 },
    { color: '#0c134a', at: 108, width: 30, height: 22 },
  ],
  trees: 'pine',
  treeHue: 232,
  stage: { top: '#27379c', side: '#161d63', rim: '#ffc233', ring: '#8fb0ff', pool: '#4d7dff', step: '#10174f' },
  lamps: [44, 32],
  bulbs: [44, 350, 150, 200, 280],
  lanternHues: [38, 44, 28, 350, 20],
  lanterns: 1,
  flags: FLAGS,
  beams: ['#9db7ff', '#ffd9a0', '#b99bff'],
  motes: '#c4d4ff',
  confetti: ['#ffc233', '#1fd38f', '#3d9bff', '#ff4d6a', '#ffffff'],
  dress: tents(['#ffe7a8', '#ffb38a', '#b9d4ff', '#ffd1e0']),
};

const cosmos: WorldTheme = {
  id: 'cosmos',
  name: 'a rock among the comets',
  seed: 23,
  light: { skyTop: '#020114', horizon: '#3a1c7a', ground: '#1b1147', sun: '#d9c9ff', sunIntensity: 1.5, fill: 1.2, sunFrom: [-3, 9, 8], fogNear: 40, fogFar: 200 },
  ground: '#120b36',
  star: '#ffffff',
  moon: { color: '#ffb37a', glow: '#ff7ab8', size: 30, at: [-90, 70, -240] },
  hills: [
    { color: '#1c1250', at: 46, width: 10, height: 6 },
    { color: '#150d42', at: 76, width: 14, height: 9 },
    { color: '#0f0934', at: 110, width: 20, height: 13 },
  ],
  trees: null,
  stage: { top: '#2a1f86', side: '#170f52', rim: '#22cfc3', ring: '#c8a4ff', pool: '#8c6bff', step: '#110a40' },
  lamps: [176, 280],
  bulbs: [176, 280, 320, 200, 50],
  lanternHues: [176, 190, 280, 310],
  lanterns: 0.45,
  flags: ['#22cfc3', '#c86bff', '#ffffff', '#ff7ab8', '#3d9bff'],
  beams: ['#7fe9ff', '#d7a8ff', '#ff9fd0'],
  motes: '#e2d4ff',
  confetti: ['#22cfc3', '#c86bff', '#ff7ab8', '#ffffff', '#ffc233'],
  dress: (scene, r) => {
    // The planet's ring, a nebula across the sky, and comets falling with their tails behind them.
    const ring = new Mesh(new TorusGeometry(46, 2.4, 2, 80), new MeshBasicMaterial({ color: '#ffd9b0', transparent: true, opacity: 0.55, fog: false }));
    ring.position.set(-90, 70, -240);
    ring.rotation.set(1.25, 0.2, 0.3);
    scene.add(ring);
    const nebula = skyGlow('#5a2bb0', 300, 0.16);
    nebula.rotation.z = 0.5;
    scene.add(nebula);
    for (let i = 0; i < 9; i++) {
      const tail = new Mesh(new PlaneGeometry(16 + r() * 22, 0.5 + r() * 0.5), new MeshBasicMaterial({ color: i % 2 ? '#9fe9ff' : '#ffd6f0', transparent: true, opacity: 0.5, blending: AdditiveBlending, depthWrite: false, fog: false }));
      tail.position.set((r() - 0.5) * 220, 40 + r() * 70, -150 - r() * 90);
      tail.rotation.z = -0.5 - r() * 0.3;
      scene.add(tail);
      const head = new Mesh(new SphereGeometry(0.9, 10, 8), new MeshBasicMaterial({ color: '#ffffff', fog: false }));
      head.position.copy(tail.position);
      head.position.x += Math.cos(tail.rotation.z) * (tail.geometry as PlaneGeometry).parameters.width * 0.5;
      head.position.y += Math.sin(tail.rotation.z) * (tail.geometry as PlaneGeometry).parameters.width * 0.5;
      scene.add(head);
    }
    // Rocks adrift near the stage.
    for (let i = 0; i < 10; i++) {
      const rock = props.rock({ scale: 1.5 + r() * 3.5, color: '#2a1d6b', seed: i + 3 });
      rock.position.set((r() - 0.5) * 60, 3 + r() * 16, -14 - r() * 40);
      scene.add(rock);
    }
  },
};

const market: WorldTheme = {
  id: 'market',
  name: 'the night market',
  seed: 41,
  light: { skyTop: '#12061f', horizon: '#8a3524', ground: '#3a1c2a', sun: '#ffd9a8', sunIntensity: 1.6, fill: 1.2, sunFrom: [2, 8, 8], fogNear: 30, fogFar: 150 },
  ground: '#1d0f22',
  star: '#ffe9d0',
  moon: { color: '#ffe2b0', glow: '#ff9a5a', size: 16, at: [-60, 46, -230] },
  hills: [
    { color: '#2a1230', at: 50, width: 14, height: 5 },
    { color: '#22102c', at: 78, width: 20, height: 8 },
    { color: '#190b24', at: 110, width: 28, height: 12 },
  ],
  trees: null,
  stage: { top: '#5a2440', side: '#34152a', rim: '#ffc233', ring: '#ffb37a', pool: '#ff8a3d', step: '#260f20' },
  lamps: [36, 22],
  bulbs: [36, 22, 48, 350, 12],
  lanternHues: [30, 22, 40, 12, 350],
  lanterns: 0.8,
  flags: ['#ffc233', '#ff8a3d', '#ff4d6a', '#ffe7a8', '#1fd38f'],
  beams: ['#ffd9a0', '#ffb37a', '#ffe9c0'],
  motes: '#ffe2b8',
  confetti: ['#ffc233', '#ff8a3d', '#ff4d6a', '#ffe7a8', '#1fd38f'],
  dress: (scene, r) => {
    // Stalls down both sides: a counter, a striped awning, a lamp under it.
    const awnings = ['#ff4d6a', '#ffc233', '#1fd38f', '#3d9bff', '#ff8a3d', '#c86bff'];
    for (let i = 0; i < 10; i++) {
      const side = i % 2 ? 1 : -1;
      const row = Math.floor(i / 2);
      const x = side * (10.5 + row * 1.2);
      const z = 1 - row * 5.2;
      const counter = new Mesh(new BoxGeometry(3.6, 1.1, 1.6).translate(0, 0.55, 0), toon('#4a2a30'));
      counter.position.set(x, 0, z);
      counter.rotation.y = -side * 1.1;
      scene.add(counter);
      const awning = new Mesh(new ConeGeometry(2.9, 1.3, 4, 1).rotateY(Math.PI / 4).translate(0, 3.4, 0), toon(awnings[i % awnings.length]!));
      awning.position.copy(counter.position);
      awning.rotation.y = counter.rotation.y;
      awning.scale.set(1, 1, 0.62);
      scene.add(awning);
      for (const dx of [-1.5, 1.5]) {
        const pole = new Mesh(new CylinderGeometry(0.06, 0.06, 2.9, 6).translate(0, 1.45, 0), toon('#2a1820'));
        pole.position.set(x + Math.cos(counter.rotation.y) * dx, 0, z - Math.sin(counter.rotation.y) * dx);
        scene.add(pole);
      }
      const lamp = props.lantern({ hue: 30 + (i % 3) * 8, scale: 0.9 });
      lamp.position.set(x, 2.2, z);
      scene.add(lamp);
      for (let k = 0; k < 3; k++) {
        const crate = props.crate({ size: 0.5 + r() * 0.3, color: k % 2 ? '#a8703a' : '#8a5a34' });
        crate.position.set(x + (r() - 0.5) * 2.4 - side * 1.6, 0, z + (r() - 0.5) * 2);
        scene.add(crate);
      }
    }
    // Roofs behind, a window lit here and there.
    for (let i = 0; i < 16; i++) {
      const w = 5 + r() * 7;
      const h = 5 + r() * 12;
      const house = new Mesh(new BoxGeometry(w, h, 5).translate(0, h / 2, 0), toon('#1c0c22'));
      house.position.set(-62 + i * 8.2 + r() * 2, 0, -40 - r() * 14);
      scene.add(house);
      for (let k = 0; k < 4; k++) {
        if (r() < 0.45) continue;
        const win = new Mesh(new PlaneGeometry(0.9, 1.2), new MeshBasicMaterial({ color: '#ffc46a' }));
        win.position.set(house.position.x + (r() - 0.5) * (w - 1.6), 1.5 + r() * (h - 3), house.position.z + 2.52);
        scene.add(win);
      }
    }
  },
};

const gloom: WorldTheme = {
  id: 'gloom',
  name: 'the wood where the giant waits',
  seed: 59,
  light: { skyTop: '#020d14', horizon: '#11574d', ground: '#0e2b2a', sun: '#b8ffe6', sunIntensity: 1.4, fill: 1.15, sunFrom: [3, 9, 8], fogNear: 22, fogFar: 120 },
  ground: '#081c1c',
  star: '#c9fff0',
  moon: { color: '#d8fff2', glow: '#2bd4a0', size: 11, at: [56, 84, -230] },
  hills: [
    { color: '#0d3330', at: 42, width: 14, height: 8 },
    { color: '#0a2826', at: 68, width: 20, height: 13 },
    { color: '#071d1d', at: 100, width: 28, height: 19 },
  ],
  trees: 'pine',
  treeHue: 168,
  stage: { top: '#12504a', side: '#0a2f2c', rim: '#2bd47e', ring: '#7dffd8', pool: '#22cfc3', step: '#072322' },
  lamps: [160, 176],
  bulbs: [160, 176, 140, 60, 190],
  lanternHues: [160, 150, 176, 60],
  lanterns: 0.6,
  flags: ['#2bd47e', '#22cfc3', '#ffe58a', '#7dffd8', '#1fd38f'],
  beams: ['#8fffe0', '#c9fff0', '#7dd8ff'],
  motes: '#b8ffe6',
  confetti: ['#2bd47e', '#22cfc3', '#ffe58a', '#ffffff', '#3d9bff'],
  dress: (scene) => {
    // The giant: a great dark shape behind the far trees, its two eyes the only light it gives.
    const body = new Mesh(new SphereGeometry(26, 24, 16), toon('#06201f'));
    body.scale.set(1.1, 1.25, 0.7);
    body.position.set(0, 4, -86);
    scene.add(body);
    const head = new Mesh(new SphereGeometry(13, 24, 16), toon('#07292a'));
    head.position.set(0, 40, -82);
    scene.add(head);
    for (const x of [-4.6, 4.6]) {
      const eye = new Mesh(new SphereGeometry(1.7, 14, 10), new MeshBasicMaterial({ color: '#d9ff7a', fog: false }));
      eye.position.set(x, 42, -70.5);
      eye.scale.set(1.25, 0.72, 1);
      scene.add(eye);
    }
    for (const x of [-30, 30]) {
      const arm = new Mesh(new SphereGeometry(8, 16, 12), toon('#06201f'));
      arm.scale.set(1, 2.4, 0.9);
      arm.position.set(x, 10, -84);
      arm.rotation.z = x < 0 ? -0.3 : 0.3;
      scene.add(arm);
    }
    scene.add(skyGlow('#1a8f78', 260, 0.1));
  },
};

/** The Hills Grammar School's own place: its greens at dusk, cream light, the hills it is named for (D60). */
const hills: WorldTheme = {
  id: 'hills',
  name: 'the hills at dusk',
  seed: 83,
  light: { skyTop: '#03140e', horizon: '#1f5a43', ground: '#123a2b', sun: '#fff2c9', sunIntensity: 1.5, fill: 1.2, sunFrom: [3, 9, 8], fogNear: 34, fogFar: 170 },
  ground: '#0a2a1e',
  star: '#f6ecd2',
  moon: { color: '#fbf3dc', glow: '#fae1a2', size: 13, at: [70, 78, -230] },
  hills: [
    { color: '#12402f', at: 44, width: 16, height: 9 },
    { color: '#0e3527', at: 72, width: 24, height: 14 },
    { color: '#0a2a1f', at: 108, width: 32, height: 20 },
  ],
  trees: 'gum',
  treeHue: 150,
  stage: { top: '#1b5a43', side: '#0c3325', rim: '#f6ecd2', ring: '#fae1a2', pool: '#00a766', step: '#092a1e' },
  lamps: [44, 48],
  bulbs: [46, 44, 150, 48, 40],
  lanternHues: [46, 44, 48, 40],
  lanterns: 0.9,
  flags: ['#f6ecd2', '#00a766', '#12402f', '#fae1a2', '#f04b65'],
  beams: ['#fae1a2', '#fbf0c8', '#bfe8cf'],
  motes: '#fbeabd',
  confetti: ['#f6ecd2', '#00a766', '#fae1a2', '#ffffff', '#f04b65'],
  dress: tents(['#f6ecd2', '#e8dcb8', '#cfe6d6', '#f6ecd2']),
};

export const THEMES = { festival, cosmos, market, gloom, hills } as const;

/** The modes that have a world of their own; every other mode plays at the lantern festival. */
const BY_MODE: Record<string, WorldTheme['id']> = {
  'comet-dash': 'cosmos',
  'sky-lanterns': 'cosmos',
  'summit-scramble': 'cosmos',
  'time-attack': 'cosmos',
  'night-market': 'market',
  'corner-shop': 'market',
  'festival-workshop': 'market',
  'gold-rush': 'market',
  'gloom-giant': 'gloom',
  'lantern-guard': 'gloom',
  'lantern-out': 'gloom',
  'glow-tag': 'gloom',
  'survival-run': 'gloom',
};

/** Which world a game is played in. A school's copy keeps to its own. */
export function themeFor(modeId: string, school: string | null): WorldTheme {
  if (school === 'hills-grammar') return THEMES.hills;
  return THEMES[BY_MODE[modeId] ?? 'festival'];
}
