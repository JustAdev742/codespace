import type { SeedSet } from '../types.ts';

/*
 * "Aviation Through the Ages", made by Leviticus1001 (@leviticus1001), who agreed to it being used
 * here. Two short rounds for the lesson template of the same name (server/src/modules/lessons/model.ts).
 * Every picture is a real photo or a scan, served from web/public/art/aviation (credits in CREDITS.md
 * there). The sets are unlisted: the lesson finds them by seedKey, and they do not crowd the library.
 */

const art = (name: string, alt: string) => ({ kind: 'image' as const, url: `/art/aviation/${name}.jpg`, alt });

export const AVIATION_CREDIT = 'Made by Leviticus1001 (@leviticus1001).';

export const aviationRound1: SeedSet = {
  seedKey: 'lesson-aviation-round-1',
  title: 'Aviation Through the Ages: Dreamers and the First Flight',
  description: `From the myth of Icarus to the Wright brothers. ${AVIATION_CREDIT}`,
  subject: 'history',
  gradeBand: 'Ages 8-12',
  tags: ['aviation', 'flight', 'Wright brothers', 'myths'],
  cover: { glyph: 'star', hue: 32, image: art('wright-flight', 'The Wright Flyer lifting off the sand at Kitty Hawk in 1903') },
  questions: [
    {
      id: 'q1',
      type: 'mcq',
      prompt: 'In the Greek myth, what did Daedalus make his wings from?',
      media: art('icarus', 'An old coloured engraving: Daedalus flies on feathered wings while Icarus falls towards the sea'),
      choices: [{ id: 'a', text: 'Feathers and wax' }, { id: 'b', text: 'Wood and string' }, { id: 'c', text: 'Paper and glue' }, { id: 'd', text: 'Leaves and vines' }],
      correct: 'a',
      explanation: 'Daedalus, an inventor, and his son Icarus were trapped on the island of Crete, so he built wings to escape.',
      difficulty: 'easy',
    },
    {
      id: 'q2',
      type: 'mcq',
      prompt: 'Why did Icarus fall into the sea?',
      media: art('icarus', 'An old coloured engraving: Daedalus flies on feathered wings while Icarus falls towards the sea'),
      choices: [{ id: 'a', text: 'A storm blew him away' }, { id: 'b', text: 'He flew too close to the sun and the wax melted' }, { id: 'c', text: 'He got tired of flapping' }, { id: 'd', text: 'A bird flew into him' }],
      correct: 'b',
      explanation: 'His father warned him not to fly too low (sea spray soaks the feathers) or too high (the sun melts the wax). The lesson: listen to good advice!',
      difficulty: 'easy',
    },
    {
      id: 'q3',
      type: 'mcq',
      prompt: 'Around 1505, Leonardo da Vinci filled a notebook about how what flies?',
      media: art('leonardo', 'A page of Leonardo da Vinci’s notebook with ink sketches of a flapping-wing machine and his mirror writing'),
      choices: [{ id: 'a', text: 'Bees' }, { id: 'b', text: 'Bats' }, { id: 'c', text: 'Birds' }, { id: 'd', text: 'Kites' }],
      correct: 'c',
      explanation: 'His Codex on the Flight of Birds studies how wings catch the air. His flying machines never left the ground, but the dream lived on.',
      difficulty: 'easy',
    },
    {
      id: 'q4',
      type: 'mcq',
      prompt: 'On 17 December 1903 the Wright brothers made the first powered flight. How long did it last?',
      media: art('wright-flight', 'The famous 1903 photo of the Wright Flyer lifting off the sand at Kitty Hawk, with Wilbur Wright running beside it'),
      choices: [{ id: 'a', text: '12 seconds' }, { id: 'b', text: '12 minutes' }, { id: 'c', text: '2 hours' }, { id: 'd', text: 'A whole day' }],
      correct: 'a',
      explanation: 'Orville flew 36.6 metres at Kitty Hawk, North Carolina. Later that day Wilbur flew for 59 seconds and 259.7 metres.',
      difficulty: 'medium',
    },
    {
      id: 'q5',
      type: 'mcq',
      prompt: 'Before building planes, what did Wilbur and Orville Wright run?',
      media: art('wright-brothers', 'Portraits of Wilbur Wright (left) and Orville Wright (right)'),
      choices: [{ id: 'a', text: 'A bakery' }, { id: 'b', text: 'A train station' }, { id: 'c', text: 'A toy factory' }, { id: 'd', text: 'A bicycle shop' }],
      correct: 'd',
      explanation: 'Fixing bikes in Dayton, Ohio taught them the skills they needed. By 1905 their Flyer III could fly for over 30 minutes.',
      difficulty: 'medium',
    },
  ],
};

export const aviationRound2: SeedSet = {
  seedKey: 'lesson-aviation-round-2',
  title: 'Aviation Through the Ages: Flying Today and Giant Planes',
  description: `Jets, airliners, safety and the biggest cargo planes. ${AVIATION_CREDIT}`,
  subject: 'history',
  gradeBand: 'Ages 8-12',
  tags: ['aviation', 'aeroplanes', 'cargo planes', 'jets'],
  cover: { glyph: 'star', hue: 205, image: art('beluga', 'The Airbus BelugaXL cargo plane in flight, painted with eyes and a smile') },
  questions: [
    {
      id: 'q1',
      type: 'mcq',
      prompt: 'The first jet plane, the Heinkel He 178, flew in which year?',
      media: art('he178', 'The Heinkel He 178, the first jet plane, on the ground in front of a hangar'),
      choices: [{ id: 'a', text: '1903' }, { id: 'b', text: '1939' }, { id: 'c', text: '1969' }, { id: 'd', text: '2001' }],
      correct: 'b',
      explanation: 'It flew in August 1939. Its jet engine was designed by Hans von Ohain.',
      difficulty: 'medium',
    },
    {
      id: 'q2',
      type: 'mcq',
      prompt: 'The Boeing 777X has such long wings that the tips can do what?',
      media: art('b777x', 'A blue and white Boeing 777X airliner in a huge hangar, with people standing around it'),
      choices: [{ id: 'a', text: 'Fold up to fit at the gate' }, { id: 'b', text: 'Flap like a bird' }, { id: 'c', text: 'Light up at night' }, { id: 'd', text: 'Come off after landing' }],
      correct: 'a',
      explanation: 'Folding wingtips let a plane with very long wings park at ordinary airport gates.',
      difficulty: 'medium',
    },
    {
      id: 'q3',
      type: 'mcq',
      prompt: 'From 2021 to 2025, there was about one fatal accident for every how many flights?',
      media: art('a380', 'A Qantas Airbus A380 climbing into a blue sky after take-off'),
      choices: [{ id: 'a', text: '560' }, { id: 'b', text: '5,600' }, { id: 'c', text: '56,000' }, { id: 'd', text: '5.6 million' }],
      correct: 'd',
      explanation: 'That is the average the airlines’ association, IATA, measured for 2021 to 2025. Flying is one of the safest ways to travel.',
      difficulty: 'medium',
    },
    {
      id: 'q4',
      type: 'mcq',
      prompt: 'This cargo plane is named after a sea animal. Which one?',
      media: art('beluga', 'The Airbus BelugaXL cargo plane in flight, painted with eyes and a smile'),
      choices: [{ id: 'a', text: 'A dolphin' }, { id: 'b', text: 'A beluga whale' }, { id: 'c', text: 'A shark' }, { id: 'd', text: 'A seal' }],
      correct: 'b',
      explanation: 'The Airbus BelugaXL started work in 2020. Its huge hold, about 2,200 cubic metres, carries whole aircraft wings between Airbus factories.',
      difficulty: 'easy',
    },
    {
      id: 'q5',
      type: 'mcq',
      prompt: 'The giant An-225 Mriya could carry 250 tonnes. What does “Mriya” mean?',
      media: art('an225', 'The Antonov An-225 Mriya flying low over a crowd who are waving and taking photos'),
      choices: [{ id: 'a', text: 'Giant' }, { id: 'b', text: 'Eagle' }, { id: 'c', text: 'Dream' }, { id: 'd', text: 'Thunder' }],
      correct: 'c',
      explanation: 'It means dream in Ukrainian. Only one was ever finished, and it was destroyed in its hangar near Kyiv on 27 February 2022. Ukraine wants to finish a second.',
      difficulty: 'hard',
    },
    {
      id: 'q6',
      type: 'mcq',
      prompt: 'Which part of a plane makes the lift that holds it up?',
      media: art('plane-parts', 'A diagram of a plane with its parts labelled, including the wings, jet engines, rudder, elevator, flaps and cockpit'),
      choices: [{ id: 'a', text: 'The rudder' }, { id: 'b', text: 'The wings' }, { id: 'c', text: 'The cockpit' }, { id: 'd', text: 'The wheels' }],
      correct: 'b',
      explanation: 'Wings make lift, the engines push the plane forward, and the rudder and elevator on the tail steer it.',
      difficulty: 'easy',
    },
  ],
};

/** The sets lesson templates use, seeded with the built-in library but unlisted. */
export const LESSON_SETS: SeedSet[] = [aviationRound1, aviationRound2];
