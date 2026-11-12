import { describe, expect, it } from 'vitest';
import {
  actsOnOthers,
  blankBlueprint,
  describeBlueprint,
  outcomeOdds,
  parseBlueprint,
  singular,
  STARTER_BLUEPRINTS,
  withKind,
  type Blueprint,
} from '../src/index.ts';

const starter = (id: string): Blueprint => structuredClone(STARTER_BLUEPRINTS.find((s) => s.id === id)!.blueprint);

describe('blueprint validation', () => {
  it('accepts every starting point and the blank game', () => {
    expect(STARTER_BLUEPRINTS.length).toBeGreaterThanOrEqual(6);
    for (const s of STARTER_BLUEPRINTS) expect(parseBlueprint(s.blueprint), s.id).toMatchObject({ ok: true });
    expect(parseBlueprint(blankBlueprint())).toMatchObject({ ok: true });
  });

  it('says what is wrong, in words, with where to fix it', () => {
    const bp = starter('meadow-dash');
    const cases: [unknown, string, RegExp][] = [
      [{ ...bp, name: 'ab' }, 'name', /The name needs at least 3 characters\./],
      [{ ...bp, name: 'Crap race' }, 'name', /Reword the name: some of it is not allowed\./],
      [{ ...bp, kind: { type: 'race', length: 500, twist: false } }, 'kind.length', /Track length must be at most 60\./],
      [{ ...bp, end: { ...bp.end, timeLimitSec: 0 } }, 'end.timeLimitSec', /The time limit must be at least 60\./],
      [{ ...bp, end: { ...bp.end, type: 'last' } }, 'end.type', /A race cannot end with “last one standing”\. Choose “first to the goal” or “most when time runs out”\./],
      [{ ...bp, answer: { ...bp.answer, rule: 'chance', outcomes: [{ label: 'Gold', weight: 1, amount: 3 }] } }, 'answer.outcomes', /at least 2 outcomes/],
      [{ ...bp, rewards: { sparks: 500 } }, '', /cannot have “rewards”/],
      [{ ...bp, kind: { type: 'territory', grid: 5, twist: false }, end: { ...bp.end, type: 'most' } }, 'look.dimension', /Choose 2D for a territory game\./],
    ];
    for (const [input, path, message] of cases) {
      const r = parseBlueprint(input);
      expect(r.ok).toBe(false);
      if (r.ok) continue;
      expect(r.problems.some((p) => p.path === path && message.test(p.message)), JSON.stringify(r.problems)).toBe(true);
    }
  });

  it('keeps power-ups that act on others out of games played together', () => {
    const bp = starter('tower-team');
    const r = parseBlueprint({ ...bp, extras: { ...bp.extras, powers: ['gust'] } });
    expect(r).toMatchObject({ ok: false, problems: [{ path: 'extras.powers', message: 'Gust works against other players, which does not fit a game everyone plays together. Take it out.' }] });
  });

  it('cleans words (invisible characters, spaces) before checking them', () => {
    const r = parseBlueprint({ ...blankBlueprint(), name: '  Space​   race  ' });
    expect(r).toMatchObject({ ok: true, blueprint: { name: 'Space race' } });
  });

  it('changing the kind keeps the game valid', () => {
    let bp = starter('meadow-dash');
    for (const k of ['climb', 'collect', 'build', 'territory', 'survive', 'tug', 'race'] as const) {
      bp = withKind(bp, k);
      expect(parseBlueprint(bp), k).toMatchObject({ ok: true });
    }
  });
});

describe('the rules in plain words', () => {
  it('describes a race with speed points, a twist and power-ups', () => {
    const lines = describeBlueprint(starter('meadow-dash'));
    expect(lines[0]).toBe('First to 30 steps wins.');
    expect(lines[1]).toBe('A right answer moves you 2 steps, plus up to 2 more for a quick answer.');
    expect(lines).toContain('Shortcuts: some spaces are shortcuts: land on one and jump 3 spaces ahead.');
    expect(lines.some((l) => l.startsWith('Every 4 right answers earns a power-up, in turn: Double'))).toBe(true);
    expect(lines).toContain('Everyone answers at their own pace, up to 40 questions each.');
    expect(lines).toContain('The game lasts at most 5 minutes.');
  });

  it('updates as the maker changes things', () => {
    const bp = starter('meadow-dash');
    bp.kind = { type: 'race', length: 12, twist: false };
    bp.answer = { ...bp.answer, rule: 'steady', right: 1, wrong: 1 };
    bp.unit = 'hops';
    const lines = describeBlueprint(bp);
    expect(lines.slice(0, 3)).toEqual(['First to 12 hops wins.', 'A right answer moves you 1 hop.', 'A wrong answer costs 1 hop.']);
  });

  it('shows the odds of each surprise, adding up to 100', () => {
    const lines = describeBlueprint(starter('island-claim'));
    expect(lines[1]).toBe('A right answer opens a surprise: One square (60%, 1 square), Two squares (30%, 2 squares), Big claim (10%, 4 squares).');
    expect(outcomeOdds([{ weight: 1 }, { weight: 1 }, { weight: 1 }])).toEqual([34, 33, 33]);
  });

  it('describes a game played together, lives and a tug', () => {
    expect(describeBlueprint(starter('tower-team'))[0]).toBe('Everyone wins together by building to 60 bricks before time runs out.');
    expect(describeBlueprint(starter('three-lives')).slice(0, 3)).toEqual([
      'Everyone starts with 3 lives. The last player still in wins.',
      'A right answer scores 3 points, plus up to 2 more for a quick answer.',
      'A wrong answer costs a life.',
    ]);
    expect(describeBlueprint(starter('rope-pull'))[0]).toBe('The first team to pull the marker 15 pulls to their side wins.');
  });

  it('lists what acts on other players', () => {
    expect(actsOnOthers(starter('meadow-dash'))).toEqual([]);
    expect(actsOnOthers(starter('island-claim'))).toEqual(['Gust power-up: everyone ahead of you loses 1.', 'Steal: when the map is full, a claim takes a square from the leader.']);
  });

  it('makes a word singular for one', () => {
    expect(singular('steps')).toBe('step');
    expect(singular('berries')).toBe('berry');
    expect(singular('glass')).toBe('glass');
    expect(singular('metres')).toBe('metre');
  });
});
