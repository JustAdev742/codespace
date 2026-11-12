"""What the Ludora presentation says: every slide, and the words to say with it.

One list, read by build_deck.py (the PowerPoint) and build_cards.py (the paper cue cards), so the
slides and the script can never drift apart. Facts come from docs/features and docs/STATUS.md.
"""

SITE = 'ludora-yja3.onrender.com'

MODES_2D = [
    'Classic', 'Quick Draw', 'Survival Run', 'Time Attack', 'Confidence', 'Tug of War', 'Lantern Out', 'Word Scramble', 'Flashcard Study', 'Glimgo',
    'Lantern Match', 'Comet Dash', 'Gloom Giant', 'Sky Lanterns', 'Night Market', 'Lantern Guard', 'Glim Duels', 'Festival Workshop', 'Lantern Trail', 'Lantern Lands',
]
MODES_3D = ['Gold Rush', 'Glow Tag Royale', 'Big Catch', 'Code Breakers', 'Corner Shop', 'Summit Scramble', 'Spot Kick', 'Lantern Rally', 'Tower Together', 'Glim Garden']
QUESTION_TYPES = ['Multiple choice', 'Select all', 'True or false', 'Short answer', 'Number', 'Ordering', 'Matching', 'Flashcards', 'Poll', 'Fill in the blanks', 'Sort into groups']

# kind: which layout build_deck.py draws. say: the script. do: what to do with your hands. secs: about how long.
SLIDES = [
    {
        'kind': 'title', 'title': 'Ludora', 'sub': 'Turn any lesson into game night.', 'image': 'film:crowd',
        'say': "Hi everyone. This is Ludora. It turns any lesson into a live game that the whole class plays together, on the devices they already have. I'm going to show you a one minute trailer, then walk you through how it works, everything that's in it, and what I'd like to do next.",
        'do': 'Play the trailer first. Then come back to this slide.', 'secs': 30,
    },
    {
        'kind': 'idea', 'title': 'Everyone answers. Every question.',
        'points': [
            ('The whole class is in it', 'Not just the three hands that always go up. Every student answers every question on their own device.'),
            ('They know straight away', 'Right or wrong, on their own screen, with the answer explained.'),
            ('The teacher sees the gaps', 'Which questions the class got wrong, and which wrong answer they shared.'),
        ],
        'image': 'host-question', 'phone': 'phone-question',
        'say': "Here's the idea. In a normal quiz, a few students answer and everyone else waits. In Ludora every student answers every question on their own screen, and they find out straight away if they were right. And while they play, the teacher is collecting something useful: which questions the class actually got wrong.",
        'do': 'Point at the big screen, then the phone.', 'secs': 30,
    },
    {
        'kind': 'steps', 'title': 'Three steps from a lesson to a game',
        'steps': [
            ('1', 'Pick your questions', 'Use one of 20 ready-made sets, write your own, or paste your notes.', 'library'),
            ('2', 'Pick a game', '30 game modes. Ludora suggests the ones that suit your questions best.', 'modes'),
            ('3', 'Share the code', 'Students type a 6-digit code or scan the QR code. No sign-up, no email.', 'host-lobby'),
        ],
        'say': "It takes three steps. One, pick your questions. There are twenty ready-made sets, or you can write your own. Two, pick a game. Three, put the code on the board. Students go to the site, type six digits, pick a name, and they're in. They don't need an account and they never need an email address.",
        'do': 'Count the three steps on your fingers.', 'secs': 30,
    },
    {
        'kind': 'grid4', 'title': 'What a live game looks like',
        'images': [('host-lobby', 'The lobby: a code and a QR code'), ('host-question', 'The question, on the big screen'), ('host-leaderboard', 'The leaderboard after each one'), ('host-results', 'The podium at the end')],
        'points': ['The big screen runs the room; every device answers', 'Late joiners catch up; a dropped connection reconnects', 'The teacher can pause, skip, add time or lock the room', 'Names go through a filter before they reach the screen', 'Works on phones, tablets, laptops and Chromebooks'],
        'say': "This is a real game. The lobby shows the code. The question goes up on the big screen and on every device at once. After each question there's a leaderboard, and at the end a podium. The teacher stays in charge the whole time: pause, skip, add time, lock the room, or remove someone who's being silly.",
        'do': 'Point at each of the four pictures in order.', 'secs': 35,
    },
    {
        'kind': 'modes', 'title': '30 game modes, and every one plays differently',
        'image': 'modes',
        'say': "There are thirty game modes, and they're properly different games, not thirty skins of one quiz. Some are races. Some are team games where the class wins or loses together. There's bingo, tug of war, a boss fight, and a memory game. So the same set of questions can feel new every lesson.",
        'do': 'Let them read a few names. Pick one you like and say why.', 'secs': 30,
    },
    {
        'kind': 'grid6', 'title': 'Ten of them are in full 3D',
        'images': [('frame:3d-summit:60', 'Summit Scramble'), ('frame:3d-rally:60', 'Lantern Rally'), ('frame:3d-spotkick:40', 'Spot Kick'), ('frame:3d-catch:60', 'Big Catch'), ('frame:3d-city:60', 'Code Breakers'), ('frame:3d-garden:60', 'Glim Garden')],
        'foot': 'Also in 3D: Gold Rush, Glow Tag Royale, Corner Shop and Tower Together. Every 3D game has a drawn 2D screen for older devices.',
        'say': "Ten of the thirty are in full 3D. You climb a mountain, race karts, take penalties, go fishing. Right answers are what move you: an answer is a foothold, or fuel, or a football. And if a device is too old for 3D, the same game plays on a drawn 2D screen, so nobody is left out.",
        'do': 'Point at two or three of the pictures.', 'secs': 30,
    },
    {
        'kind': 'questions', 'title': 'Eleven kinds of question, and a proper editor',
        'image': 'set-editor',
        'points': ['Quick add: type a whole set in one box', 'Templates for maths drills, vocabulary and timelines', 'Import from a spreadsheet; print as a worksheet', 'Pictures, maths notation and sound in a question', 'A health check that finds weak questions', 'Version history, a 30-day bin, folders and co-editors'],
        'say': "Questions aren't only multiple choice. There are eleven types: ordering, matching, fill in the blanks, sort into groups, polls and more. The editor is built for teachers. You can type a whole set in one box, import a spreadsheet, add pictures and sound, and it checks your set for weak questions before you use it.",
        'do': 'Point at the list of types.', 'secs': 30,
    },
    {
        'kind': 'flow3', 'title': 'From your notes to a game in a minute',
        'images': [('make-notes-typed', 'Paste your notes'), ('make-questions', 'Keep the questions you like'), ('make-play', 'Play the best-fitting game')],
        'foot': 'This part needs no AI. It reads word lists, definitions, number facts, tables and sentences.',
        'say': "This is my favourite part for a busy teacher. You paste your notes, or a word list, or a table. Ludora turns them into questions. You keep the ones you like and fix anything that's off. Then it suggests the three games that suit those questions best. Notes to a playable game in about a minute, and this part doesn't use AI at all.",
        'do': 'Trace the three pictures left to right.', 'secs': 30,
    },
    {
        'kind': 'feature2', 'title': 'Game Maker: write your own game mode',
        'images': ['gamemaker-home', 'gamemaker-builder'],
        'points': ['Simple code that reads like sentences', 'A test game runs beside you and follows every line', 'Your own numbers (coins, health, keys) and "when ... do ..." rules', 'Nine starting points to read, change and learn from', 'Mistakes are explained, with a fix to press', 'It comes out looking like a finished Ludora game'],
        'foot': 'A made game is checked data, never a program that runs. Words are filtered, and every game is guaranteed to end.',
        'say': "And if thirty games isn't enough, students and teachers can make their own. In Game Maker you write the rules in very simple code that reads like sentences, and a test game runs right next to you, changing as you type. What comes out looks like a real Ludora game, and you can host it for a class.",
        'do': 'Read one line of the code out loud.', 'secs': 35,
    },
    {
        'kind': 'feature2', 'title': 'Glims: collect, wear, design your own',
        'images': ['film:glims', 'designs-new'],
        'points': ['Over 120 Glims to collect, with new ones each month', 'Earned by playing. Nothing costs real money', 'Lanterns show their odds before you open one', 'My designs: shape, colour and paint your own Glim', 'Your Glim shows in lobbies, games and 3D scenes'],
        'say': "Glims are the little characters students play as. There are over a hundred and twenty to collect, and you earn them by playing, never by paying. Nothing in Ludora costs real money. Students can also design their own Glim, paint it, and see it turn up in every game they play.",
        'do': 'Point at a favourite Glim.', 'secs': 25,
    },
    {
        'kind': 'tiles', 'title': 'The teacher runs the room', 'cols': 4,
        'tiles': [
            ('QR code and link', 'Scan to join, or share a link'), ('Teams', 'Set in the lobby, balanced for you'), ('Waiting room', 'Let students in one by one'), ('Lock the room', 'No late surprises'),
            ('Add time', 'Ten more seconds, one press'), ('Brain break', 'A pause with a timer'), ('Names hidden', 'Scores without the names'), ('Quiet room', 'No sound, captions instead'),
            ('Phone as a remote', 'Run the game from the back'), ('Awards', 'Not only for first place'), ('Class summary', 'What the room got wrong'), ('Exit ticket', 'One last question, saved'),
        ],
        'foot': 'Plus a start countdown, a ready check, keyboard shortcuts, backdrops, rename or remove a player, and "How to play" for every game.',
        'say': "While a game runs, the teacher has real classroom controls. Teams, a waiting room, a lock. You can add time, take a brain break, or hide names on the board so nobody is embarrassed. You can even use your phone as a remote from the back of the room. At the end there's an exit ticket and a summary of what the class got wrong.",
        'do': 'Pick two tiles and say them out loud.', 'secs': 35,
    },
    {
        'kind': 'feature', 'title': 'Lessons: a whole period in one room',
        'image': 'lesson-editor', 'side': 'left',
        'points': ['Games, slides, discussion steps and classroom tools, in order', 'Templates: starter, main and exit ticket; revision', 'Learning goals and an estimated length', 'Stop and carry on next time', 'Schedule it for a class', 'One report for the whole lesson'],
        'say': "A lesson strings it all together. A starter game, a slide, a discussion question, the main game, an exit ticket, all in one room with one code. Students join once. You can stop halfway and carry on next lesson, and you get a single report for the whole thing.",
        'do': 'Trace down the steps of the lesson.', 'secs': 25,
    },
    {
        'kind': 'feature', 'title': 'Classes and homework, with no student emails',
        'image': 'class', 'side': 'right',
        'points': ['Class logins: students join with a class code', 'Homework: a game played alone, with a report', 'Gradebook and a mastery grid', 'Groups, co-teachers and a noticeboard', 'A class goal, a calendar and certificates', 'Roster import and class data export'],
        'say': "Teachers can set up classes. Students join with a class code, and again, no email address is ever needed. Homework is just a game a student plays on their own, and the results land in a gradebook and a mastery grid that shows who has got which topic.",
        'do': 'Point at the class page.', 'secs': 25,
    },
    {
        'kind': 'feature', 'title': 'Reports that say what to teach next',
        'image': 'report-game', 'side': 'left',
        'points': ['The questions the class got wrong, first', 'The wrong answer most of them shared', 'Who answered few questions or may be guessing', 'One student, or one set, across all your games', 'Reteach: the missed questions become a new set', 'A term overview, printing and downloads'],
        'say': "After a game the teacher gets a report, and it's built around one question: what should I teach next? It shows the questions the class got wrong, and the wrong answer most of them chose, which tells you the misunderstanding. One press turns the missed questions into a new set for next lesson.",
        'do': 'Point at the hardest question on the report.', 'secs': 30,
    },
    {
        'kind': 'feature', 'title': 'Classroom tools and the teacher\'s day',
        'image': 'tools', 'side': 'right',
        'points': ['A fair random picker that remembers who has had a turn', 'Team maker from the class\'s own groups', 'Countdown and stopwatch', 'A traffic-light check-in: got it, nearly, stuck', 'A scoreboard for anything', '"Your day": lessons, homework due and what to follow up', 'Bulk actions for sets, classes and homework'],
        'say': "Not everything in a lesson is a game, so there are tools for the board. A fair picker that remembers who's already had a turn. A team maker, timers, a quick check-in to see who's stuck, and a scoreboard. And a page called Your day that shows what's due and who needs following up.",
        'do': 'Point at the picker.', 'secs': 25,
    },
    {
        'kind': 'feature', 'title': 'Playing alone: practice that feels like a game',
        'image': 'solo', 'side': 'left',
        'points': ['Solo play in three stages: questions, game, your settings', 'Practice bots with personalities and five levels', 'My mistakes: the questions you got wrong, to try again', 'A daily challenge, quests, streaks and a weekly goal', 'Personal bests for every mode', 'Challenge a friend'],
        'say': "Students can play alone too. They pick questions, pick a game, choose their settings, and play against practice bots. The bots behave like classmates: they hesitate, they make human mistakes, and one level matches itself to you. Ludora also remembers every question you got wrong so you can practise exactly those.",
        'do': 'Point at the three stages.', 'secs': 30,
    },
    {
        'kind': 'tiles', 'title': 'Built so everyone can play', 'cols': 3,
        'tiles': [
            ('Read aloud', 'Questions and answers spoken'), ('Extra time', 'On one player\'s own clock'), ('Keyboard answers', 'Letters instead of tapping'),
            ('Colour-safe tiles', 'Shapes as well as colours'), ('Calm mode', 'Less motion, fewer effects'), ('Easier-to-read typeface', 'And a highest-contrast look'),
            ('Screen readers', 'Labels, roles and live updates'), ('Shows sounds', 'Captions for every sound'), ('Any device', 'Installs as an app; data saver'),
        ],
        'foot': 'Each one is off until someone turns it on. Every page and game screen is checked automatically for accessibility.',
        'say': "I wanted every student to be able to play. Questions can be read aloud. A student can have extra time on their own clock without anyone else knowing. Answers have shapes as well as colours. There's a calm mode with less movement, and it works with screen readers and a keyboard.",
        'do': 'Pick the one that matters most to this audience.', 'secs': 30,
    },
    {
        'kind': 'tiles', 'title': 'A school can make it its own', 'cols': 3,
        'tiles': [
            ('Houses and house points', 'Every game can count'), ('The house cup', 'Standings by house and by year'), ('Tournaments', 'Class against class, live or over a week'),
            ('Assembly mode', 'One game for the whole hall'), ('Sport days and merits', 'And a hall of fame'), ('The school\'s own look', 'Colours, crest and uniforms'),
        ],
        'foot': 'School staff run their school\'s houses, events and notices from their own pages, with no access to anything else.',
        'say': "A school can have its own copy. Houses and house points, a house cup, tournaments between classes, and an assembly mode for the whole hall. It can even wear the school's colours, with the Glims in uniform.",
        'do': 'Mention your own school\'s houses if it has them.', 'secs': 20,
    },
    {
        'kind': 'safety', 'title': 'Safe by design',
        'big': ['No student emails.', 'No ads.', 'Nothing to buy.'],
        'points': ['Students join with a code and a name; names are filtered', 'No free chat between students, anywhere', 'Anything a student makes can be reported and hidden', 'Scores and rewards are decided by the server, not the device', 'Staff roles with only the access each needs, and an audit log', 'A privacy policy and terms inside the app'],
        'say': "Safety first. Students never give an email address. There are no ads, and nothing to buy. There's no free chat between students anywhere in Ludora. Names are filtered, anything a student creates can be reported and hidden by staff, and the server decides every score, so nobody can cheat by fiddling with their device.",
        'do': 'Slow down for the three big lines.', 'secs': 30,
    },
    {
        'kind': 'tiles', 'title': 'AI helpers, if the school wants them', 'cols': 3,
        'tiles': [
            ('Draft questions', 'From a topic or your own text'), ('Improve wording', 'Or make it easier or harder'), ('Wrong answers', 'Believable ones, for multiple choice'),
            ('A lesson outline', 'Built from your own sets'), ('A game for this set', 'Checked against the real catalogue'), ('Describe a game or a Glim', 'A draft to read and change'),
        ],
        'foot': 'Off by default. Nothing is written into your work until you accept it. Each account gets 20 requests every 5 hours. Guests never get them.',
        'say': "There are optional AI helpers. They can draft questions, suggest wrong answers, or outline a lesson. They're switched off until the school decides to turn them on, every suggestion has to be accepted by a person before it's used, and each account has a limit. Everything I showed before this slide works without any AI.",
        'do': 'Say clearly that it is optional and off by default.', 'secs': 25,
    },
    {
        'kind': 'tiles', 'title': 'How it is built and checked', 'cols': 3,
        'tiles': [
            ('9,400+ automated tests', 'Run on every change'), ('Every mode played out', 'To the end, by test players'), ('Three browsers', 'Chrome, Firefox and Safari\'s engine'),
            ('Accessibility checks', 'Automatic, on every page and game screen'), ('The server is the referee', 'Every score, reward and purchase'), ('Runs in any browser', 'Nothing to install at school'),
        ],
        'foot': 'What has not happened yet: a full class playing it on school devices in a real lesson. That is the next step.',
        'say': "A word on quality. Ludora has over nine thousand automated tests that run on every change, in three browsers. Every game mode is played to the end by test players. What it hasn't had yet is a real class using it in a real lesson on school devices, and that's exactly what I'd like to do next.",
        'do': 'Be honest about the last line. It makes the rest believable.', 'secs': 30,
    },
    {
        'kind': 'numbers', 'title': 'Ludora in numbers',
        'stats': [('30', 'game modes'), ('10', 'in full 3D'), ('11', 'question types'), ('120+', 'Glims to collect'), ('300+', 'features'), ('9,400+', 'automated tests')],
        'say': "So, in numbers. Thirty game modes. Ten in 3D. Eleven question types. More than a hundred and twenty Glims. Over three hundred features. And more than nine thousand tests behind it.",
        'do': 'Read the numbers. Leave a pause after the last one.', 'secs': 20,
    },
    {
        'kind': 'steps', 'title': 'What I would like to do next',
        'steps': [
            ('1', 'One class, one lesson', 'A teacher runs a single revision game with a real class.', None),
            ('2', 'Listen', 'What confused people? What did they ask for? What broke?', None),
            ('3', 'Fix and widen', 'Fix what we find, then offer it to more classes.', None),
        ],
        'foot': 'What it needs: one teacher, one period, and the devices students already have.',
        'say': "Here's what I'm asking for. One class, one lesson. A teacher runs a single revision game, I watch what happens, and I listen. What confused people, what they asked for, what broke. Then I fix it and we try it with more classes. All it needs is one teacher and one period.",
        'do': 'Look at the person who can say yes.', 'secs': 30,
    },
    {
        'kind': 'join', 'title': 'Try it now', 'url': f'{SITE}/play',
        'say': "Let's play one now. Take out a phone or open a laptop. Go to the address on the screen, type the six digit code, and pick a name. I'll start when everyone's in. Thank you. I'd love your questions afterwards.",
        'do': 'Open Ludora in another tab, host a Classic game, and read the code out loud.', 'secs': 40,
    },
]

BEFORE = [
    'Open the trailer and check the sound is on.',
    f'Open {SITE} in a second tab and sign in.',
    'Have a question set ready to host (Space explorers works well).',
    'The site sleeps when nobody uses it: open it five minutes early so it is awake.',
    'Put these cards in order. The number is in the corner of each one.',
]

QUESTIONS = [
    ('What does it cost?', 'Nothing. There is nothing to buy in it and no ads. Right now it runs on free hosting.'),
    ('What do students need?', 'Any device with a browser. No app, no account and no email. A six digit code and a name.'),
    ('Where does the data go?', 'Into one database that we control. Students give a name, not an email. There is a privacy policy inside the app.'),
    ('Can students misbehave in it?', 'Names are filtered, there is no chat, and a teacher can remove or lock anyone out. Staff can hide anything a student makes.'),
    ('Does it need AI?', 'No. Everything works without it. The AI helpers are optional and switched off until the school turns them on.'),
    ('Has it been used in a class?', 'Not a full class in a real lesson yet. It has been tested very heavily by machine. A first class is what I am asking for.'),
    ('Who made it?', 'Answer in your own words.'),
]
