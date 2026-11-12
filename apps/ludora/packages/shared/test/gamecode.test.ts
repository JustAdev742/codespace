import { describe, expect, it } from 'vitest';
import { CODE_CATALOGUE, completeLine, describeBlueprint, fromCode, highlightLine, mergeCode, starterCode, STARTER_BLUEPRINTS, toCode, type Blueprint } from '../src/index.ts';

const ok = (code: string): Blueprint => {
  const r = fromCode(code);
  if (!r.ok) throw new Error(r.problems.map((p) => p.message).join(' / '));
  return r.blueprint;
};
const problems = (code: string) => {
  const r = fromCode(code);
  if (r.ok) throw new Error('expected problems');
  return r.problems;
};

describe('game code: reading every statement', () => {
  it('reads a whole game written by hand', () => {
    const bp = ok(`game "Meadow dash"
goal "Race to the flag."
how to play "Answer to move."
race to 30 steps
twist: shortcuts
questions: own pace, 40 each, 15 seconds each
right answer: move 2 steps
quick answer: up to 2 more
streak bonus: up to 1 more
wrong answer: lose 1 step
every 4 right answers: power-up (double, leap)
events: golden round, rally
wins: first to the goal
stops after 5 minutes
looks: 3D old town, loop track, night
camera: from above
props: lamps, flags
board: striped, colour blue, second colour 45
cover: rocket, colour pink`);
    expect(bp).toMatchObject({
      name: 'Meadow dash',
      goal: 'Race to the flag.',
      howTo: ['Answer to move.'],
      unit: 'steps',
      kind: { type: 'race', length: 30, twist: true },
      pacing: 'own-pace',
      answer: { rule: 'points', right: 2, wrong: 1, speed: 2, streak: 1 },
      extras: { powers: ['double', 'leap'], powerEvery: 4, events: ['golden', 'rally'] },
      end: { type: 'first', timeLimitSec: 300, questions: 40, questionTimeSec: 15 },
      look: { style: 'striped', hue: 210, accent: 45, dimension: '3d', scene: { place: 'old-town', shape: 'loop', time: 'night', camera: 'overview', props: ['lamps', 'flags'] } },
      cover: { glyph: 'rocket', hue: 320 },
    });
  });

  it('every kind of game reads from its own line', () => {
    expect(ok('climb to 24 metres').kind).toEqual({ type: 'climb', height: 24, twist: false });
    expect(ok('collect 20 gems').kind).toEqual({ type: 'collect', goal: 20, twist: false });
    expect(ok('build a tower of 60 bricks\nwins: everyone together').kind).toEqual({ type: 'build', target: 60, twist: false });
    expect(ok('claim a 6 by 6 map').kind).toEqual({ type: 'territory', grid: 6, twist: false });
    expect(ok('3 lives').kind).toEqual({ type: 'survive', lives: 3, twist: false });
    expect(ok('1 life').kind).toEqual({ type: 'survive', lives: 1, twist: false });
    expect(ok('tug of war to 15 pulls').kind).toEqual({ type: 'tug', rope: 15, twist: false });
    expect(ok('claim a 5 by 5 map').unit).toBe('squares');
    expect(ok('3 lives\npoints are called coins').unit).toBe('coins');
  });

  it('is forgiving about capitals, spacing, number words and comments', () => {
    const bp = ok(`# my first game
   GAME   "Big Race"     # the name
RACE TO thirty Coins
Questions:Together, ten questions, 12 seconds each
Right Answer:   MOVE 3
wrong answer: nothing   // no cost

stops after 2 minutes 30 seconds`);
    expect(bp).toMatchObject({ name: 'Big Race', unit: 'Coins', kind: { type: 'race', length: 30 }, pacing: 'rounds', end: { questions: 10, questionTimeSec: 12, timeLimitSec: 150 }, answer: { right: 3, wrong: 0 } });
  });

  it('a # inside quotes is part of the words, not a comment', () => {
    expect(ok('game "Race #1" # note').name).toBe('Race #1');
  });

  it('starts from a plain game when lines are left out', () => {
    const bp = ok('game "Tiny"');
    expect(bp).toMatchObject({ name: 'Tiny', kind: { type: 'race' }, pacing: 'rounds', answer: { rule: 'steady' } });
  });

  it('surprises: a right answer opens one, with the odds the maker set', () => {
    const bp = ok('claim a 6 by 6 map\nsurprise "Small": chance 3, gives 1\nsurprise "Big": chance 1, gives 4');
    expect(bp.answer).toMatchObject({ rule: 'chance', outcomes: [{ label: 'Small', weight: 3, amount: 1 }, { label: 'Big', weight: 1, amount: 4 }] });
    expect(describeBlueprint(bp).join(' ')).toContain('Small (75%');
  });

  it('numbers and rules: every trigger, condition and action reads', () => {
    const bp = ok(`3 lives
questions: together, 20 questions, 20 seconds each
stops after 10 minutes
each player has 0 coins, up to 50
each team has 0 flags
the game has 0 rounds
when the game starts: everyone gains 1
when a player answers right: add 1 coins
when a player answers wrong, if coins is at least 2: take 2 coins and get a shield
when a player answers quickly: gain 1
when a player gets 3 right in a row: get a double power-up
when a player gets 2 wrong in a row: say "Watch out!"
every 5 questions: golden round
when a player reaches 10 coins: gain a life and set coins to 0
when a player reaches a score of 20: double points
when a player runs out of coins, if a 50% chance: lose a life
when a player takes the lead: say "New leader!"
when a player uses a power-up, if on team 1: add 1 flags
when a round starts, if in the last 2 minutes: rally
when a round ends, if in last place: everyone behind gains 1 and add 1 rounds
when 1 minute is left: the leader loses 1 and freeze the leader`);
    expect(bp.vars).toEqual([
      { name: 'coins', scope: 'player', start: 0, max: 50 },
      { name: 'flags', scope: 'team', start: 0, max: 999 },
      { name: 'rounds', scope: 'game', start: 0, max: 999 },
    ]);
    expect(bp.rules!.map((r) => r.when.type)).toEqual(['start', 'right', 'wrong', 'quick', 'streak', 'miss-streak', 'every', 'reach', 'reach', 'runs-out', 'lead', 'power', 'round-start', 'round-end', 'minutes-left']);
    expect(bp.rules![2]).toEqual({ when: { type: 'wrong' }, if: [{ type: 'at-least', n: 2, var: 'coins' }], do: [{ type: 'take', n: 2, var: 'coins' }, { type: 'shield' }] });
    expect(bp.rules![9]!.if).toEqual([{ type: 'chance', n: 50 }]);
    expect(bp.rules![12]!.if).toEqual([{ type: 'minutes-left', n: 2 }]);
    // The rules in plain words follow what was written.
    const words = describeBlueprint(bp).join('\n');
    expect(words).toContain('When a player gets 3 right in a row: they get a double power-up.');
    expect(words).toContain('Each player has coins, starting at 0 (up to 50).');
  });

  it('a rule can win, end the game, swap and halve nothing it should not', () => {
    const bp = ok('race to 40 steps\nquestions: own pace, 30 each, 20 seconds each\nwhen a player gets halfway: say "Halfway there!"\nwhen a player gets 5 wrong in a row: swap with the leader\nwhen a player reaches a score of 35: win\nwhen 2 minutes are left: end the game');
    expect(bp.rules!.map((r) => r.do[0]!.type)).toEqual(['say', 'swap-leader', 'win', 'end']);
  });
});

describe('game code: problems a child can fix', () => {
  it('names the line, says what is wrong, and offers the nearest thing that works', () => {
    const p = problems('game "My race"\nrase to 30 steps');
    expect(p[0]).toMatchObject({ line: 2, message: 'Line 2: I do not know “rase”. Did you mean “race”?', fix: { text: 'race to 30 steps', label: 'Use “race”' } });
  });

  it('a misspelt power-up, place, prop, colour, cover or event', () => {
    expect(problems('every 4 right answers: power-up (dubble)')[0]).toMatchObject({ message: 'Line 1: I do not know “dubble”. Did you mean “double”?', fix: { text: 'every 4 right answers: power-up (double)' } });
    expect(problems('race to 30\nlooks: 3D medow')[0]!.message).toBe('Line 2: I do not know “medow”. Did you mean “meadow”?');
    expect(problems('props: tress')[0]!.message).toBe('Line 1: I do not know “tress”. Did you mean “trees”?');
    expect(problems('board: bold, colour bleu')[0]!.message).toBe('Line 1: I do not know “bleu”. Did you mean “blue”?');
    expect(problems('cover: rockett')[0]!.message).toBe('Line 1: I do not know “rockett”. Did you mean “rocket”?');
    expect(problems('events: goldn round')[0]!.message).toBe('Line 1: I do not know “goldn”. Did you mean “golden”?');
  });

  it('the wrong twist for the kind', () => {
    expect(problems('race to 30\ntwist: ledges')[0]).toMatchObject({ message: 'Line 2: Ledges is the twist for a climb. A race’s twist is shortcuts.', fix: { text: 'twist: shortcuts' } });
  });

  it('a line said twice', () => {
    expect(problems('game "One"\ngame "Two"')[0]!.message).toBe('Line 2: The name is already set on line 1. Keep one of the two lines.');
  });

  it('numbers out of range come from the check, on their line', () => {
    expect(problems('game "Big"\nrace to 500 steps')[0]!.message).toBe('Line 2: Track length must be at most 60.');
    expect(problems('3 lives\nwins: first to the goal')[0]!.message).toMatch(/^Line 2: A lives game cannot end with “first to the goal”/);
    expect(problems('game "Okay"\nstops after 30 minutes')[0]!.message).toBe('Line 2: The time limit must be at most 900.');
  });

  it('rules: unknown numbers, missing colons, unknown triggers and actions, messages of your own', () => {
    expect(problems('when a player answers right: add 1 coins')[0]!.message).toBe('Line 1: The game has no number called “coins”. Add it with a line such as “each player has 0 coins”.');
    expect(problems('each player has 0 coins\nwhen a player answers right: add 1 coinz')[0]).toMatchObject({ message: 'Line 2: The game has no number called “coinz”. Did you mean “coins”?', fix: { text: 'when a player answers right: add 1 coins' } });
    expect(problems('when a player answers right gain 1')[0]).toMatchObject({ line: 1, fix: { text: 'when a player answers right gain 1: gain 1' } });
    expect(problems('when a player answers rihgt: gain 1')[0]!.message).toBe('Line 1: I do not understand “when a player answers rihgt”. Did you mean “when a player answers right”?');
    expect(problems('when a player answers right: jump 2')[0]!.message).toMatch(/^Line 1: I do not know how to “jump 2”/);
    expect(problems('when a player answers right: say "You are the best"')[0]!.message).toMatch(/only say one of Ludora’s messages/);
    expect(problems('questions: own pace, 20 each, 20 seconds each\nwhen a round starts: gain 1')[0]!.message).toMatch(/^Line 2: Rounds start and end only when everyone answers together/);
    expect(problems('stops after 3 minutes\nwhen 5 minutes are left: rally')[0]!.message).toMatch(/^Line 2: The game lasts 3 minutes/);
    expect(problems('race to 30\nwhen a player answers right: gain a life')[0]!.message).toMatch(/^Line 2: Only a lives game has lives/);
    expect(problems('build a tower of 60 bricks\nwins: everyone together\nwhen a player answers right: the leader loses 1')[0]!.message).toMatch(/^Line 3: “The leader loses” works against other players/);
    expect(problems('when the game starts: win')[0]!.message).toMatch(/^Line 1: “Win” needs one player to win/);
    expect(problems('when a player answers right: gain 50')[0]!.message).toBe('Line 1: “Gain” takes a number from 1 to 10.');
  });

  it('a surprise with a bonus, a number with a reserved name, and a line it cannot read', () => {
    expect(problems('surprise "A": chance 1, gives 1\nsurprise "B": chance 1, gives 2\nquick answer: up to 2 more')[0]!.message).toBe('Line 3: a game with surprises has no quick-answer bonus. Take one of them out.');
    expect(problems('each player has 0 score')[0]!.message).toMatch(/^Line 1: That word already means something/);
    expect(problems('hello there')[0]).toMatchObject({ message: 'Line 1: I do not know “hello”. Open “What you can write” to see every kind of line, or put # in front to make it a note.', fix: { text: '# hello there' } });
  });

  it('every problem is a sentence', () => {
    for (const code of ['rase to 3', 'when x: y', 'twist: banana', 'questions: sometimes', 'wrong answer: maybe', 'stops after soon', 'camera: under', 'wins: nobody']) {
      for (const p of problems(code)) expect(p.message, code).toMatch(/^Line \d+: .+[.?]$/);
    }
  });
});

describe('game code: writing and help', () => {
  it('the starting points read like plain rules', () => {
    const code = starterCode('meadow-dash')!;
    expect(code).toContain('race to 30 steps');
    expect(code).toContain('right answer: move 2 steps');
    expect(code).toContain('every 4 right answers: power-up (double, leap)');
    expect(code).toContain('looks: 3D meadow, zigzag track, day');
    for (const s of STARTER_BLUEPRINTS) expect(fromCode(toCode(s.blueprint)).ok, s.id).toBe(true);
  });

  it('a form change keeps the person’s own words where they still mean the same', () => {
    const code = '# my game\ngame "Dash"\nrace to 30 steps   # long\nquestions: together, 20 questions, 20 seconds each\nright answer: move 2 steps\nwrong answer: nothing\nwins: most when time runs out\nstops after 5 minutes\nlooks: 2D\nboard: bold, colour blue, second colour yellow\ncover: spark, colour blue\n';
    const bp = ok(code);
    const merged = mergeCode(code, { ...bp, kind: { type: 'race', length: 40, twist: false } });
    expect(merged).toContain('# my game\ngame "Dash"\nrace to 40 steps # long\n');
    const withTwist = mergeCode(code, { ...bp, kind: { type: 'race', length: 30, twist: true } });
    expect(withTwist).toContain('race to 30 steps   # long\ntwist: shortcuts\n');
  });

  it('every example in the list of what you can write reads (in a game it fits)', () => {
    const fits: Record<string, string> = {
      'wins: last one standing': '3 lives\n',
      'wins: everyone together': 'build a tower of 60 bricks\n',
      'looks: 3D meadow, zigzag track, day': 'race to 30\n',
    };
    for (const e of CODE_CATALOGUE) {
      const rule = /^(when|every \d+ questions)/.test(e.code);
      const prefix = (fits[e.code] ?? '') + (rule && /coins|health/.test(e.code) ? 'each player has 5 coins\neach player has 3 health\n' : '') + (rule && /life/.test(e.code) ? '3 lives\n' : '') + (/round (starts|ends)/.test(e.code) ? 'questions: together, 20 questions, 20 seconds each\n' : '');
      const twist = /^twist: (.+)$/.exec(e.code)?.[1];
      const kindFor: Record<string, string> = { shortcuts: 'race to 30', ledges: 'climb to 30', traps: 'collect 20', wind: 'build a tower of 60\nwins: everyone together', steal: 'claim a 6 by 6 map', 'second chance': '3 lives', surge: 'tug of war to 15' };
      const code = `${twist ? `${kindFor[twist]}\n` : ''}${prefix}${e.code}\n${e.code.startsWith('surprise') ? 'surprise "Other": chance 2, gives 1\n' : ''}`;
      const r = fromCode(code);
      expect(r.ok, `${e.code}: ${r.ok ? '' : r.problems.map((p) => p.message).join(' / ')}`).toBe(true);
    }
  });

  it('completes the next word', () => {
    expect(completeLine('ra').map((c) => c.insert)).toContain('ce');
    expect(completeLine('looks: 3D ').some((c) => c.insert.trim() === 'meadow,')).toBe(true);
    expect(completeLine('when a player gets').map((c) => c.label)).toContain('when a player gets 3 right in a row:');
    expect(completeLine('when a player answers right: ').some((c) => c.insert === 'gain')).toBe(true);
    expect(completeLine('when a player answers right: ad', 'each player has 0 coins').map((c) => c.label)).toContain('add 1 coins');
    expect(completeLine('# a note')).toEqual([]);
  });

  it('colours the words of a line', () => {
    const t = highlightLine('race to 30 steps # long');
    expect(t.find((x) => x.text === 'race')?.kind).toBe('key');
    expect(t.find((x) => x.text === '30')?.kind).toBe('number');
    expect(t.find((x) => x.kind === 'comment')?.text).toBe('# long');
    expect(highlightLine('game "A # b"').find((x) => x.kind === 'string')?.text).toBe('"A # b"');
  });
});

describe('game code: ideas follow the numbers you typed', () => {
  it('a number you typed stands for the one in the example', () => {
    expect(completeLine('stops after 4 min').map((c) => c.insert)).toContain('utes');
    expect(completeLine('stops after 4 min')[0]!.label).toBe('stops after 4 minutes');
    expect(completeLine('race to 45').map((c) => c.insert)).toContain(' steps');
    expect(completeLine('when a player gets 7').map((c) => c.label)).toContain('when a player gets 7 right in a row:');
  });
});
