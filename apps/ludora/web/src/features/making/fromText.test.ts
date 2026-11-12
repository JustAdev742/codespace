import { describe, expect, it } from 'vitest';
import { questionSchema, type Question } from '@ludora/shared';
import { editSuggestion, keyWord, mainAnswer, sentences, suggestFromText } from './fromText.ts';

let seed = 11;
const random = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
const allValid = (qs: Question[]) => qs.every((q) => questionSchema.safeParse(q).success);
const types = (text: string) => suggestFromText(text, random).suggestions.map((s) => s.question.type);

describe('notes to questions', () => {
  it('reads a vocabulary list with mixed separators into choice questions and matching', () => {
    const r = suggestFromText('French greetings\n\nbonjour - hello\nau revoir – goodbye\nmerci: thank you\ns\'il vous plaît — please\nbonne nuit - good night', random);
    expect(r.title).toBe('French greetings');
    const mcq = r.suggestions.filter((s) => s.question.type === 'mcq');
    expect(mcq).toHaveLength(5);
    expect(r.suggestions.filter((s) => s.question.type === 'match').map((s) => (s.question as Extract<Question, { type: 'match' }>).pairs.length)).toEqual([5]);
    const first = mcq[0]!.question as Extract<Question, { type: 'mcq' }>;
    expect(first.prompt).toBe('What does “bonjour” mean?');
    expect(first.choices.find((c) => c.id === first.correct)?.text).toBe('hello');
    expect(allValid(r.suggestions.map((s) => s.question))).toBe(true);
  });

  it('turns definitions in prose into questions whose choices are the words', () => {
    const r = suggestFromText(
      'Photosynthesis is the process plants use to make food from light. Osmosis is the movement of water across a membrane. Diffusion is the spreading of particles from high to low concentration. A cell is the smallest unit of life that can live on its own.',
      random,
    );
    const mcq = r.suggestions.filter((s) => s.kind === 'definition' && s.question.type === 'mcq');
    expect(mcq).toHaveLength(4);
    const q = mcq[0]!.question as Extract<Question, { type: 'mcq' }>;
    expect(q.prompt).toMatch(/^Which word is this\? the process plants use/);
    expect(q.choices.find((c) => c.id === q.correct)?.text).toBe('Photosynthesis');
  });

  it('makes number facts into numeric questions, preferring the year, and keeps big numbers with commas', () => {
    const r = suggestFromText('The Battle of Hastings was fought in 1066 by 2 armies.\nMount Everest is 8,849 metres high.\nWater boils at 100 °C at sea level.', random);
    const nums = r.suggestions.filter((s) => s.question.type === 'numeric').map((s) => s.question as Extract<Question, { type: 'numeric' }>);
    expect(nums.map((n) => n.answer)).toEqual([1066, 8849, 100]);
    expect(nums[0]!.prompt).toBe('The Battle of Hastings was fought in ___ by 2 armies.');
    expect(nums[2]!.prompt).toBe('Water boils at ___ °C at sea level.');
  });

  it('does not take numbers glued to words or times as the answer', () => {
    const r = suggestFromText('The COVID-19 pandemic changed how many schools worked.', random);
    expect(r.suggestions.every((s) => s.question.type !== 'numeric')).toBe(true);
  });

  it('turns ordinary sentences into gaps, with a word bank from the other sentences', () => {
    const r = suggestFromText('The river Nile flows north into the Mediterranean sea. Rainforests grow near the equator where it is hot and wet. Glaciers carve deep valleys into mountains over thousands of years.', random);
    const blanks = r.suggestions.filter((s) => s.question.type === 'blanks').map((s) => s.question as Extract<Question, { type: 'blanks' }>);
    expect(blanks).toHaveLength(3);
    expect(blanks[0]!.text).toContain('[Mediterranean]');
    expect(blanks[0]!.bank).toBe(true);
    expect(blanks[0]!.distractors!.length).toBeGreaterThanOrEqual(2);
  });

  it('reads a list in order and a numbered list', () => {
    const r = suggestFromText('Stages of mitosis in order:\n- prophase\n- metaphase\n- anaphase\n- telophase\n\n1. Preheat the oven\n2. Mix the flour and eggs\n3. Bake for twenty minutes', random);
    const order = r.suggestions.filter((s) => s.question.type === 'order').map((s) => s.question as Extract<Question, { type: 'order' }>);
    expect(order).toHaveLength(2);
    expect(order[0]!.prompt).toBe('Put these in order: Stages of mitosis');
    expect(order[0]!.items.map((i) => i.text)).toEqual(['prophase', 'metaphase', 'anaphase', 'telophase']);
    expect(order[1]!.items[0]!.text).toBe('Preheat the oven');
  });

  it('splits a long list into ordering questions of eight', () => {
    const list = Array.from({ length: 11 }, (_, i) => `${i + 1}. Step ${String.fromCharCode(65 + i)}`).join('\n');
    expect(types(list)).toEqual(['order', 'order']);
  });

  it('makes groups into one sorting question', () => {
    const r = suggestFromText('Mammals: whale, bat, dog, horse, mouse\nFish: shark, cod, salmon', random);
    expect(r.suggestions).toHaveLength(1);
    const q = r.suggestions[0]!.question as Extract<Question, { type: 'sort' }>;
    expect(q.type).toBe('sort');
    expect(q.groups.map((g) => g.label)).toEqual(['Mammals', 'Fish']);
    expect(q.items.length).toBeLessThanOrEqual(8);
    expect(q.items.length).toBeGreaterThanOrEqual(4);
  });

  it('reads a table pasted from a spreadsheet, skipping its header', () => {
    const r = suggestFromText('Country\tCapital\nFrance\tParis\nSpain\tMadrid\nItaly\tRome\nPortugal\tLisbon', random);
    expect(r.suggestions.filter((s) => s.kind === 'table' && s.question.type === 'mcq')).toHaveLength(4);
    expect(r.suggestions.some((s) => s.from.includes('Country'))).toBe(false);
  });

  it('reads a markdown table and a comma table with number answers', () => {
    expect(types('| Word | Meaning |\n|---|---|\n| big | large |\n| tiny | very small |')).toEqual(['short', 'short']);
    const r = suggestFromText('7 x 8, 56\n9 x 6, 54\n12 x 12, 144', random);
    expect(r.suggestions.map((s) => (s.question as Extract<Question, { type: 'numeric' }>).answer)).toEqual([56, 54, 144]);
  });

  it('reads Q and A lines and the quick add grammar', () => {
    const r = suggestFromText('Q: What is the chemical symbol for gold?\nA: Au\nQ1. How many legs has a spider?\nA1. 8\nThe Sun is a star. = true\nPlants need [sunlight] and [water].', random);
    expect(r.suggestions.map((s) => s.question.type)).toEqual(['short', 'numeric', 'truefalse', 'blanks']);
    expect(r.suggestions[0]!.kind).toBe('qa');
  });

  it('copes with empty, odd and very long input without inventing questions', () => {
    expect(suggestFromText('', random).suggestions).toEqual([]);
    expect(suggestFromText('   \n\n\t \n', random).suggestions).toEqual([]);
    const odd = suggestFromText('ok\n!!!\n———\nhi there', random);
    expect(odd.suggestions).toEqual([]);
    expect(odd.unread.length).toBeGreaterThan(0);
    const long = suggestFromText(`${'Lorem ipsum dolor sit amet consectetur elit. '.repeat(2000)}`, random);
    expect(long.suggestions.length).toBeLessThanOrEqual(250);
    expect(allValid(long.suggestions.map((s) => s.question))).toBe(true);
  });

  it('handles Windows line endings, bullets and smart punctuation', () => {
    const r = suggestFromText('• noun – a naming word\r\n• verb – a doing word\r\n• adjective – a describing word\r\n', random);
    expect(r.suggestions.filter((s) => s.question.type === 'mcq')).toHaveLength(3);
  });

  it('gives every suggestion a unique id', () => {
    const r = suggestFromText('bonjour - hello\nmerci - thanks\noui - yes\nnon - no\nThe Thames flows through London to the North Sea.\nThe year was 1666 when London burned.', random);
    const ids = r.suggestions.map((s) => s.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});

describe('names in definitions', () => {
  it('keeps the article and capital on a name', () => {
    const r = suggestFromText('The Nile is the longest river in Africa. Photosynthesis is how plants make their own food. A noun is a naming word for things.', random);
    const prompts = r.suggestions.map((s) => s.question.prompt);
    expect(prompts).toContain('What is the Nile?');
    expect(prompts).toContain('What is photosynthesis?');
  });
});

describe('pieces', () => {
  it('splits sentences without breaking abbreviations or decimals', () => {
    expect(sentences('Dr. Smith measured 3.5 cm. Then e.g. this one! Is it? Yes')).toEqual(['Dr. Smith measured 3.5 cm.', 'Then e.g. this one!', 'Is it?', 'Yes']);
  });
  it('picks a name, else the longest word that carries meaning', () => {
    expect(keyWord('The capital city of France is Paris.')).toBe('France');
    expect(keyWord('plants need sunlight and water to grow')).toBe('sunlight');
    expect(keyWord('it is')).toBeNull();
  });
});

describe('changing a suggestion', () => {
  const base = suggestFromText('Q: Capital of Peru?\nA: Lima\nQ: Sides on a hexagon?\nA: 6', random).suggestions.map((s) => s.question);
  it('changes the prompt and the answer', () => {
    const q = editSuggestion(base[0]!, 'What is the capital of Peru?', 'Lima, Peru') as Question;
    expect(q.prompt).toBe('What is the capital of Peru?');
    expect(mainAnswer(q)).toBe('Lima, Peru');
  });
  it('says what is wrong instead of saving a bad answer', () => {
    expect(editSuggestion(base[1]!, 'Sides?', 'six')).toMatch(/Type a number/);
    expect(editSuggestion(base[0]!, '   ', 'Lima')).toMatch(/Write the question/);
    expect(editSuggestion(base[0]!, 'Capital?', '')).toMatch(/cannot be empty/);
  });
});
