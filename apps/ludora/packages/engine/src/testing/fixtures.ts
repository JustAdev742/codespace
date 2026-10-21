import type { Question } from '@ludora/shared';

/** A small set that uses every question type, for engine and server tests. */
export const MIXED_SET: Question[] = [
  { id: 'q1', type: 'mcq', prompt: 'Which planet is closest to the Sun?', choices: [{ id: 'a', text: 'Mercury' }, { id: 'b', text: 'Venus' }, { id: 'c', text: 'Mars' }, { id: 'd', text: 'Earth' }], correct: 'a', explanation: 'Mercury orbits closest, at about 58 million km.' },
  { id: 'q2', type: 'truefalse', prompt: 'Water boils at 100 °C at sea level.', correct: true },
  { id: 'q3', type: 'short', prompt: 'What is the capital of France?', accepted: ['Paris'] },
  { id: 'q4', type: 'numeric', prompt: 'What is 7 × 8?', answer: 56 },
  { id: 'q5', type: 'order', prompt: 'Put these in order from smallest to largest.', items: [{ id: 'atom', text: 'Atom' }, { id: 'cell', text: 'Cell' }, { id: 'mouse', text: 'Mouse' }, { id: 'elephant', text: 'Elephant' }] },
  { id: 'q6', type: 'match', prompt: 'Match each country to its capital.', pairs: [{ id: 'jp', left: 'Japan', right: 'Tokyo' }, { id: 'ke', left: 'Kenya', right: 'Nairobi' }, { id: 'pe', left: 'Peru', right: 'Lima' }] },
  { id: 'q7', type: 'multi', prompt: 'Which of these are mammals?', choices: [{ id: 'a', text: 'Dolphin' }, { id: 'b', text: 'Shark' }, { id: 'c', text: 'Bat' }, { id: 'd', text: 'Penguin' }], correct: ['a', 'c'] },
  { id: 'q8', type: 'flashcard', prompt: 'Photosynthesis', back: 'How plants turn light into food' },
  { id: 'q9', type: 'mcq', prompt: 'What gas do plants take in from the air?', choices: [{ id: 'a', text: 'Oxygen' }, { id: 'b', text: 'Carbon dioxide' }, { id: 'c', text: 'Nitrogen' }, { id: 'd', text: 'Helium' }], correct: 'b' },
  { id: 'q10', type: 'mcq', prompt: 'How many sides does a hexagon have?', choices: [{ id: 'a', text: '5' }, { id: 'b', text: '6' }, { id: 'c', text: '7' }, { id: 'd', text: '8' }], correct: 'b' },
  { id: 'q11', type: 'truefalse', prompt: 'The Pacific is the smallest ocean.', correct: false },
  { id: 'q12', type: 'short', prompt: 'What is the largest planet in our solar system?', accepted: ['Jupiter'] },
  { id: 'q13', type: 'numeric', prompt: 'How many minutes are in two hours?', answer: 120 },
  { id: 'q14', type: 'mcq', prompt: 'Which word is a verb?', choices: [{ id: 'a', text: 'Quickly' }, { id: 'b', text: 'Jump' }, { id: 'c', text: 'Blue' }, { id: 'd', text: 'Happiness' }], correct: 'b' },
  { id: 'q15', type: 'flashcard', prompt: 'Evaporation', back: 'Liquid turning into gas' },
  { id: 'q16', type: 'flashcard', prompt: 'Condensation', back: 'Gas turning into liquid' },
  { id: 'q17', type: 'mcq', prompt: 'What is 3/4 as a percentage?', choices: [{ id: 'a', text: '34%' }, { id: 'b', text: '43%' }, { id: 'c', text: '75%' }, { id: 'd', text: '80%' }], correct: 'c' },
  { id: 'q18', type: 'short', prompt: 'Which animal is known as the king of the jungle?', accepted: ['Lion'] },
  { id: 'q19', type: 'mcq', prompt: 'Which continent is Egypt in?', choices: [{ id: 'a', text: 'Asia' }, { id: 'b', text: 'Africa' }, { id: 'c', text: 'Europe' }, { id: 'd', text: 'Oceania' }], correct: 'b' },
  { id: 'q20', type: 'truefalse', prompt: 'A triangle has three sides.', correct: true },
];

/** Term-and-definition style set, as flashcards. */
export const FLASHCARD_SET: Question[] = [
  ['Herbivore', 'An animal that eats only plants'],
  ['Carnivore', 'An animal that eats only meat'],
  ['Omnivore', 'An animal that eats plants and meat'],
  ['Habitat', 'The natural home of a living thing'],
  ['Predator', 'An animal that hunts other animals'],
  ['Prey', 'An animal hunted for food'],
  ['Producer', 'A living thing that makes its own food'],
  ['Decomposer', 'A living thing that breaks down dead matter'],
].map(([front, back], i) => ({ id: `f${i + 1}`, type: 'flashcard' as const, prompt: front!, back: back! }));
