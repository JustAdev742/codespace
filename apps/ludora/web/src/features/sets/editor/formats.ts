/**
 * The import and export formats, written down once so the importer, the
 * exporter, the template file and the help text in the editor agree.
 * Pure data: no React, no DOM.
 */

/** CSV columns in the order the exporter and the template write them. */
export const CSV_COLUMNS = [
  'type',
  'prompt',
  'answer',
  'choices',
  'items',
  'correct',
  'explanation',
  'time_limit',
  'points',
  'difficulty',
  'tags',
  'tolerance',
  'unit',
  'case_sensitive',
  'fuzzy',
  'id',
] as const;
export type CsvColumn = (typeof CSV_COLUMNS)[number];

export const CSV_COLUMN_HELP: Record<CsvColumn, string> = {
  type: 'mcq, multi, truefalse, short, numeric, order, match or flashcard. Leave it empty and Ludora works it out: choices make multiple choice (select all that apply when several are correct), items make put in order (match pairs when they contain =), True or False makes true or false, a number makes a number question, and any other answer makes a typed answer.',
  prompt: 'The question, the statement, or the front of a flashcard. Required.',
  answer: 'True or false: True or False (yes and no work too). Typed answer: the answer, with other accepted answers separated by |. Number: the number. Flashcard: the back of the card. Multiple choice: the correct choice, if you leave correct empty.',
  choices: 'Multiple choice and select all: the choices, separated by |.',
  items: 'Put in order: the items in the correct order, separated by |. Match pairs: each pair as left = right, separated by |.',
  correct: 'The correct choice, by its text or its letter (A is the first choice). For select all, several separated by |.',
  explanation: 'Optional. Shown after the answer is revealed.',
  time_limit: 'Optional. Seconds to answer, from 5 to 300.',
  points: 'Optional. Points for a correct answer, from 0 to 10,000.',
  difficulty: 'Optional. easy, medium or hard.',
  tags: 'Optional. Separated by |.',
  tolerance: 'Optional, number questions. How far from the answer still counts, for example 0.5.',
  unit: 'Optional, number questions. Shown next to the answer box, for example cm.',
  case_sensitive: 'Optional, typed answers. yes to require the same capital letters.',
  fuzzy: 'Optional, typed answers. no to stop accepting small typos.',
  id: 'Optional. Filled in when you export. Keep it when you edit an exported file, and leave it empty for new questions.',
};

/** Header names people actually use, mapped to our columns. Keys are normalised (see normaliseHeader). */
export const CSV_HEADER_ALIASES: Record<string, CsvColumn> = {
  type: 'type',
  question_type: 'type',
  kind: 'type',
  prompt: 'prompt',
  question: 'prompt',
  question_text: 'prompt',
  front: 'prompt',
  statement: 'prompt',
  term: 'prompt',
  answer: 'answer',
  answers: 'answer',
  accepted: 'answer',
  accepted_answers: 'answer',
  back: 'answer',
  definition: 'answer',
  choices: 'choices',
  choice: 'choices',
  options: 'choices',
  items: 'items',
  item: 'items',
  pairs: 'items',
  correct: 'correct',
  correct_answer: 'correct',
  correct_answers: 'correct',
  correct_choice: 'correct',
  correct_choices: 'correct',
  right_answer: 'correct',
  explanation: 'explanation',
  feedback: 'explanation',
  time_limit: 'time_limit',
  timelimit: 'time_limit',
  time_limit_sec: 'time_limit',
  time_limit_seconds: 'time_limit',
  time: 'time_limit',
  seconds: 'time_limit',
  points: 'points',
  score: 'points',
  difficulty: 'difficulty',
  tags: 'tags',
  tag: 'tags',
  tolerance: 'tolerance',
  margin: 'tolerance',
  unit: 'unit',
  units: 'unit',
  case_sensitive: 'case_sensitive',
  casesensitive: 'case_sensitive',
  match_case: 'case_sensitive',
  fuzzy: 'fuzzy',
  allow_typos: 'fuzzy',
  typos: 'fuzzy',
  id: 'id',
  question_id: 'id',
};

/** "Time limit (seconds)" becomes "time_limit". */
export function normaliseHeader(raw: string): string {
  return raw
    .replace(/^﻿/, '')
    .replace(/\(.*?\)/g, ' ')
    .trim()
    .toLowerCase()
    .replace(/[\s\-./]+/g, '_')
    .replace(/[^a-z0-9_]/g, '')
    .replace(/_+/g, '_')
    .replace(/^_|_$/g, '');
}

/** Example rows for the downloadable template, one per question type. */
export const CSV_TEMPLATE_ROWS: Partial<Record<CsvColumn, string>>[] = [
  { type: 'mcq', prompt: 'Which planet is known as the Red Planet?', choices: 'Venus|Mars|Jupiter|Mercury', correct: 'Mars', explanation: 'Iron oxide (rust) in its soil makes Mars look red.', time_limit: '20', difficulty: 'easy', tags: 'space' },
  { type: 'multi', prompt: 'Which of these are mammals?', choices: 'Dolphin|Shark|Bat|Salmon', correct: 'Dolphin|Bat', difficulty: 'medium', tags: 'animals' },
  { type: 'truefalse', prompt: 'The Sun is a star.', answer: 'True', difficulty: 'easy' },
  { type: 'short', prompt: 'What is the capital of France?', answer: 'Paris' },
  { type: 'numeric', prompt: 'How many centimetres are in a metre?', answer: '100', unit: 'cm' },
  { type: 'order', prompt: 'Put these planets in order, starting nearest the Sun.', items: 'Mercury|Venus|Earth|Mars' },
  { type: 'match', prompt: 'Match each animal to its young.', items: 'Cat = kitten|Dog = puppy|Cow = calf' },
  { type: 'flashcard', prompt: 'le chien', answer: 'the dog' },
];

export const PASTE_RULES: string[] = [
  'Leave a blank line between questions.',
  'Multiple choice: write the question, then one choice per line. Start the correct choice with *. Star more than one to make a select all that apply question.',
  'True or false: give the choices True and False and star the right one.',
  'Typed answer: Q: the question A: the answer. Separate other accepted answers with |, for example A: colour | color.',
  'Number answer: a number after A: makes a number question. Add a unit after it, for example A: 30 cm, or a margin with ± (or +/-), for example A: 9.8 ± 0.1.',
  'Flashcard: front :: back, one card per line.',
];

export const PASTE_EXAMPLE = `Which planet is known as the Red Planet?
Venus
*Mars
Jupiter

Which of these are mammals?
*Dolphin
Shark
*Bat

The Sun is a star.
*True
False

Q: What is the capital of France? A: Paris
Q: How many legs does a spider have? A: 8

le chien :: the dog
le chat :: the cat`;

export const JSON_EXAMPLE = `[
  {
    "type": "mcq",
    "prompt": "Which planet is known as the Red Planet?",
    "choices": [{ "id": "a", "text": "Venus" }, { "id": "b", "text": "Mars" }],
    "correct": "b"
  },
  { "type": "truefalse", "prompt": "The Sun is a star.", "correct": true }
]`;

/** Marks a Ludora export so a later import knows what it is reading. */
export const EXPORT_FORMAT_ID = 'ludora-question-set';
export const EXPORT_FORMAT_VERSION = 1;
