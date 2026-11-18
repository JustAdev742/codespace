import { describe, expect, it } from 'vitest';
import { decideMenuView, type MenuFacts } from './capability.ts';

const facts = (f: Partial<MenuFacts> = {}): MenuFacts => ({ choice: null, graphics: 'auto', webgl: true, software: false, dataSaver: false, ...f });

describe('the home menu: 3D or flat', () => {
  it('is 3D on a device with a graphics chip and nothing turned off', () => {
    expect(decideMenuView(facts())).toEqual({ view: '3d', canSwitch: true, asked: false });
  });

  it('is flat with no WebGL, and offers no switch to a 3D it cannot show', () => {
    expect(decideMenuView(facts({ webgl: false, choice: 'on' }))).toMatchObject({ view: 'flat', reason: 'no-webgl', canSwitch: false });
  });

  it('is flat when 3D is off in the graphics menu, whatever was chosen here', () => {
    expect(decideMenuView(facts({ graphics: 'off', choice: 'on' }))).toMatchObject({ view: 'flat', reason: 'graphics-off', canSwitch: false });
  });

  it('is flat by default where WebGL is drawn by the processor (a weak Chromebook)', () => {
    expect(decideMenuView(facts({ software: true }))).toMatchObject({ view: 'flat', reason: 'software', canSwitch: true });
  });

  it('is flat with data saver on, and after an earlier visit ran slowly', () => {
    expect(decideMenuView(facts({ dataSaver: true }))).toMatchObject({ view: 'flat', reason: 'data-saver' });
    expect(decideMenuView(facts({ choice: 'slow' }))).toMatchObject({ view: 'flat', reason: 'slow', canSwitch: true });
  });

  it('follows the player: off stays off, and on is kept even when slow', () => {
    expect(decideMenuView(facts({ choice: 'off' }))).toMatchObject({ view: 'flat', reason: 'chosen', canSwitch: true });
    expect(decideMenuView(facts({ choice: 'on', software: true, dataSaver: true }))).toEqual({ view: '3d', canSwitch: true, asked: true });
  });

  it('treats a graphics tier picked by hand as asking for 3D', () => {
    expect(decideMenuView(facts({ graphics: 'high', software: true }))).toEqual({ view: '3d', canSwitch: true, asked: true });
  });
});
