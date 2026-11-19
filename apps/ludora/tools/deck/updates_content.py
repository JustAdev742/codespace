"""What the "What's new" presentation says: every slide and the words to say with it.

Everything added to Ludora between 12 and 19 November 2026 (the last presentation was on the 12th).
Facts come from docs/DECISIONS.md (D56 to D60), docs/features/economy.md and docs/LUDORA-OS.md.
Pictures are from The Hills Grammar School's copy, shot by tools/film/capture/updates.mjs.

kind: which layout build_updates.py draws.  say: the script, in the slide's notes.
A picture is 'still:<name>' (a sharp still), 'frame:<name>' (a film frame) or 'phone:<name>' (a still in a phone).
"""

SITE = 'ludora-yja3.onrender.com'
DEMO = 'claude.ai/artifact/AG1R9LDDADxJ9jh1wN473k'

SLIDES = [
    {
        'kind': 'cover', 'title': 'What’s new in Ludora', 'sub': 'Everything added since 12 November, shown on The Hills Grammar School’s copy.',
        'image': 'frame:crowd',
        'say': "This is everything that has changed in Ludora since the last presentation on the twelfth of November. Every picture is from the Hills Grammar copy, with the Glims in the school's uniform. I'll play the trailer first, which is about a minute and a half, then go through each change. The changes to Ludora itself are on the live site today.",
    },
    {
        'kind': 'tiles', 'title': 'Six things are new',
        'tiles': [
            ('A 3D home', 'The home page is a place you can look round.', 'still:home-yard'),
            ('Calm play', 'One thing at a time, and how to play before every game.', 'still:host-lobby'),
            ('Clearer menus', 'Every button says what it does.', 'still:sidebar-tile'),
            ('An economy you can see', 'A Wallet, class rewards, sales, and someone to mind it.', 'still:rewards'),
            ('The school’s own copy', 'Its colours, logo and uniform on every screen.', 'still:landing-light'),
            ('Ludora OS', 'A server that guards itself, with a dashboard for staff.', 'still:dash-attack'),
        ],
        'say': "Six things. A new home page you can look around. Calm play, which came straight from your playtest. Menus that say what each button does. An economy that players and teachers can actually see. A proper finishing pass on the school's own copy. And Ludora OS, a server that looks after itself. I'll take them one at a time.",
    },
    {
        'kind': 'feature', 'title': 'Home is a place now',
        'lead': 'The signed-in home page is the yard: the player’s buddy on a stage, with the six places to go around it.',
        'points': [
            ('It answers the player', 'Point at a place and it lights up, and the buddy turns and points the way. Nothing moves by itself except breathing and lamplight.'),
            ('The real menu is still there', 'Six ordinary links and the join box sit over the scene. A keyboard or a screen reader uses those, in one order.'),
            ('It steps aside when it should', 'A flat menu on devices with no graphics chip, with data saver on, or if it runs slowly. One switch turns 3D off.'),
        ],
        'image': 'still:home-yard',
        'say': "The home page used to be flat cards. Now it's a place we call the yard. The player's own buddy stands in the middle, and around it are the six places you can go. When you point at one it lights up and the buddy points to it. Nothing moves on its own, because you told us the games were over-stimulating. The real menu is still there underneath, so a keyboard or a screen reader works exactly as before. And on a Chromebook with no graphics chip, players simply get the flat menu.",
    },
    {
        'kind': 'feature', 'title': 'Every button says what it does',
        'lead': 'A new student could not tell Make from Game Maker, or Collection from Locker. Now each section has a short line under its name.',
        'points': [
            ('Plain words', '“Host a game: Put a code on the board.” “Locker: Dress up your buddy.”'),
            ('In groups', 'Play, Make things, Glims and rewards, With others.'),
            ('It fits a school laptop', 'A student’s whole menu shows on a 1366 by 768 screen without scrolling. The phone menu has the same lines.'),
        ],
        'image': 'still:sidebar-crop', 'phone': 'still:phone-menu', 'tall': True,
        'say': "This one is small but it matters on day one. Every section in the menu now has a short line under it, in words a nine year old knows. They're grouped under plain headings. Two were renamed to match their pages: Host is now Host a game, and Studio is Creator Studio. We also fixed a bug on the way: students were being shown Lessons, which is for teachers.",
    },
    {
        'kind': 'split', 'title': 'Calm play: one thing at a time',
        'lead': 'Your playtest found the games over-stimulating. Calm play is the teacher’s choice for a room, and on a school’s copy it is on unless the teacher turns it off.',
        'left': ('The room is turned down', ['No reactions, confetti or flashing, on the board as well', 'Still backdrops, and 3D scenes with no camera swoops', 'Quieter sound and no countdown ticks', 'The timer counts down and does nothing more']),
        'right': ('One thing at a time', ['Four games asked players to steer while answering', 'In calm play the question and the steering take turns', 'Lantern Rally, Glow Tag, Big Catch and Corner Shop', 'The game’s rules enforce it, so no device can get round it']),
        'image': 'still:host-lobby', 'phone': 'still:phone-lobby',
        'say': "Calm play came from your playtest. The feedback was that the games were over-stimulating, and that some of them asked players to drive a car while answering a question. Calm play does two things. It turns the whole room down: no flashing, no confetti, quieter sound, and the countdown ticks are silent. And it makes the four busiest games take turns, so there is a question, then a moment to steer, never both at once. The teacher chooses it before the game, and on your copy it's on by default. The phone tells each player: your teacher chose calm play.",
    },
    {
        'kind': 'phones', 'title': 'How to play, before every game',
        'lead': 'Every game opens with a short walkthrough, with a picture for each step. Players say when they are ready, or skip it if they know the game.',
        'phones': ['still:phone-walk-1', 'still:phone-walk-2', 'still:phone-walk-last'],
        'image': 'still:host-walk',
        'caption': 'The board shows how many are ready. The teacher can start whenever they like, or switch the walkthrough off for a room.',
        'say': "The playtest also said there was no tutorial. Now every game opens with a short how to play, a few steps with a picture each. Each player presses I'm ready, or skips it if they know the game. The board counts who is ready, and the teacher can press Start now at any time. In calm play it also explains what calm play changes for that game.",
    },
    {
        'kind': 'feature', 'title': 'A Wallet for every player',
        'lead': 'One page for what a player has, where it came from, and what they are saving for.',
        'points': [
            ('What you have', 'Sparks, Moonstones and Glow Dust, and today’s game Sparks against the daily limit.'),
            ('A goal to save for', 'Chosen from the player’s own wishlist, with how far there is to go.'),
            ('Every Spark in and out', 'Newest first, with the teacher’s name and reason on a reward, and the item’s name on anything bought.'),
        ],
        'foot': 'Everything is earned by playing. None of it is real money, and nothing can be bought with real money.',
        'phone': 'still:wallet-top', 'image': 'still:wallet-list',
        'say': "Players earn Sparks by playing, and until now they couldn't see where they went. The Wallet shows what you have, how many game Sparks you've earned today against the daily limit, a goal you're saving for from your own wishlist, and every Spark in and out. It says at the top: none of this is real money. That hasn't changed and it won't.",
    },
    {
        'kind': 'numbers', 'title': 'Teachers can say well done',
        'lead': 'A Rewards tab on each class. A teacher gives Sparks to one student or the whole class, with a reason the student sees in their Wallet.',
        'numbers': [('500', 'Sparks a week for each class'), ('25', 'at most to one student at a time'), ('100', 'at most for one student in a week, across all their classes')],
        'foot': 'Students cannot send Sparks to each other. The weekly limit per student is what stops a made-up class being used to pass Sparks to a friend. An economy manager can change all three numbers.',
        'image': 'still:rewards',
        'say': "Teachers asked for a way to say well done. On each class there's now a Rewards tab. Pick one student or the whole class, pick a reason, like great teamwork or kind to others, and give a few Sparks. The student sees who gave it and why. There's a weekly budget for each class, and a limit on how much any one student can be given in a week. Students can't send Sparks to each other at all. Those numbers are our starting guesses and you can change them.",
    },
    {
        'kind': 'feature', 'title': 'Sales that end on a day, not a countdown',
        'lead': 'Shop items can go on sale between two dates. Players see “On sale until Sunday” and the usual price. There is no ticking clock anywhere.',
        'points': [
            ('Calm end dates', 'Until today, until tomorrow, until Friday, until 3 December.'),
            ('Sparks boosts', 'For a special day, game Sparks can be multiplied, by up to three for up to fourteen days. The daily limit stays the same.'),
            ('Refunds', 'Staff can refund a purchase: the price goes back and the item comes off, once, and it is recorded.'),
        ],
        'image': 'still:shop-sale', 'narrow': True,
        'say': "The shop can now run sales. What matters is how they look to a child. A sale says on sale until Sunday. It never shows a countdown, because countdowns are there to pressure people. There are also Sparks boosts for special days, which multiply what a game pays but never raise the daily limit, so nobody is pushed to play longer.",
    },
    {
        'kind': 'split', 'title': 'An economy manager, and nothing more',
        'lead': 'A new staff role for one job. Only an administrator can give it to someone.',
        'left': ('They can', ['Read the whole economy: health, ledger, purchases', 'Change the earning rules, with a preview first and an undo after', 'Run sales and economy events, set prices', 'Grant or remove currency, and refund purchases']),
        'right': ('They cannot', ['Open player records, moderate, or assign roles', 'Grant to their own account or refund their own purchases', 'Go past a daily grant total (20,000 Sparks by default)', 'Change that total: only an administrator can']),
        'foot': 'Every change needs a reason and is written to the audit log in the same step.',
        'image': 'still:econ-health',
        'say': "Someone has to look after the economy, and we didn't want that to mean giving them the keys to everything. The economy manager can see and tune the economy and nothing else. They can't open a child's record. They can't grant currency to themselves. And they have a daily limit that only an administrator can change. Every change needs a reason and is recorded.",
    },
    {
        'kind': 'gallery', 'title': 'The economy room',
        'shots': [
            ('still:econ-health', 'Health', 'Earned and spent each day, where it comes from and goes, and how balances are spread. Counts only, never a list of children.'),
            ('still:econ-rules', 'Rules', 'Change a rule and see what a game would pay before saving: “earns 108 Sparks instead of 92”. One step back if it was wrong.'),
            ('still:econ-sales', 'Shop and sales', 'Prices, featured items and sales, with every listing’s sales beside it.'),
            ('still:econ-grant', 'Grants', 'Currency to one account or a whole class, counted against the daily limit. Purchases are refunded here too.'),
        ],
        'say': "This is their room. Health shows what was earned and spent each day and how balances are spread across players, in bands, never as a ranking of children. Rules lets you change what a game pays, and shows you a worked example before you save it. Then sales, grants and refunds, the full ledger which can be downloaded, and a history of every change.",
    },
    {
        'kind': 'gallery', 'title': 'The school’s copy, finished properly',
        'shots': [
            ('still:landing-light', 'The front page', '“Quiz games for your class.” Sign in comes first, because students arrive with a login card.'),
            ('still:class-logins', 'Login cards', 'For students with no email: a username and three easy words, printed with the crest and the school’s name.'),
            ('still:host-lobby', 'The class board', 'The school’s whole logo in the game bar, and a stage lit cream and green instead of blue.'),
            ('frame:uniforms', 'The uniform', 'Set once in Settings or when joining. Every Glim wears it, on the board, on phones and in 3D.'),
        ],
        'foot': 'Also: dark mode is the school’s green instead of Ludora’s navy, the browser bar is the school’s green, and an installed copy is called “Ludora at The Hills Grammar School”.',
        'say': "Your copy already had your colours and uniform. This week it had a proper finishing pass. We went through every screen, on a laptop, a phone and a classroom board, and fixed what looked unfinished: dark mode, the board's game bar, a phone bar that cut the game's name short, and the front page, which said answer fast, climb the board on a copy that plays calmly. It now says quiz games for your class.",
    },
    {
        'kind': 'section', 'title': 'Ludora OS', 'sub': 'For a school that wants to run Ludora on its own machine: a server that guards itself.',
        'image': 'still:dash-attack',
        'say': "The last part is different. If the school wants to run Ludora on its own server, inside its own network, that server has to be safe without a full time expert watching it. Ludora OS is that server: a hardened Rocky Linux system built to run Ludora and nothing else. The pictures here are from its staff dashboard, running against a pretend server.",
    },
    {
        'kind': 'dark', 'title': 'It guards itself',
        'points': [
            ('Closed unless opened', 'The firewall refuses everything it does not know. SSH is off unless you open time-limited support access.'),
            ('Decoy ports', 'Eleven ports that nothing real uses, and the SSH port while it is shut. Touch one and that device is banned.'),
            ('Bans by itself', 'Probing, password guessing and floods are banned for 15 minutes, and longer each time. Staff addresses are never banned.'),
            ('The shield', 'When several devices misbehave at once it cuts every limit to a quarter, then lowers it again when they stop.'),
            ('Lockdown', 'One switch closes Ludora to everyone outside the staff addresses.'),
        ],
        'image': 'still:dash-security',
        'say': "It starts closed. The firewall refuses anything it doesn't recognise. It has decoy ports, which are doors that nothing real ever uses, so anything that touches one is up to no good and is banned. A part called the sentinel watches for probing, password guessing and floods, and bans those devices by itself, for longer each time. If several misbehave at once it raises the shield, which tightens every limit. And there is one switch, lockdown, that closes the site to everyone except staff.",
    },
    {
        'kind': 'dark', 'title': 'It tells the right people, in plain words',
        'points': [
            ('Free alerts', 'By email, a push to a phone, or Telegram. Different lists for attacks, upkeep and fair play.'),
            ('Read by fixed rules', 'Every alert says what it was, how serious it is, and how many devices were at it together.'),
            ('Likely cheating', 'A live game reports a player answering faster than a person can, or one device playing as several.'),
            ('An AI second opinion, if wanted', 'A small model on the server adds one line. It decides nothing, and is off unless you switch it on: it scored 31 of 36 on our test and the pass mark is 33.'),
        ],
        'image': 'card:alert',
        'say': "When something happens it tells the right people, by email or a push to a phone, and it costs nothing. Every alert is read by fixed rules and says three things: what it was, how serious, and how many devices. A live game can also flag likely cheating. There's an optional AI model that adds a second opinion. I'll be straight about that one: on our own test it got thirty one out of thirty six, the pass mark is thirty three, so it's off by default and it never decides anything.",
    },
    {
        'kind': 'gallery', 'title': 'A dashboard for staff', 'dark': True,
        'shots': [
            ('still:dash-calm', 'Overview', 'The threat level, what needs attention, every service, and what the sentinel has seen.'),
            ('still:dash-locked', 'Security', 'Who is banned and for how long, the shield, lockdown, and the full list of events.'),
            ('still:dash-setup', 'Set-up', 'The site’s name, email and who is told, with a check at each step. A change that breaks the site is undone by itself.'),
            ('still:dash-health', 'Health', 'The self-check (31 checks on a real server), encrypted nightly backups and support access.'),
        ],
        'foot': f'Staff addresses only. It signs out after 15 idle minutes and pauses sign-in after five wrong tries. Try it: {DEMO}',
        'say': "Staff look after it from a web page, on the school network only. Overview shows the threat level and anything that needs attention. Security shows who is banned and has the shield and lockdown. Set up walks through the site's name, email and who gets told, and if a change breaks the site, the server undoes it by itself. Health runs the self check and shows the backups. There's a demo you can click through yourselves, and I'll share the link.",
    },
    {
        'kind': 'limits', 'title': 'What is not done yet',
        'items': [
            ('Ludora OS has not run on a real machine', 'It was installed, attacked and reviewed on Rocky Linux 10.3 in a container. The install image builds, but nobody has installed it on a school computer yet.'),
            ('Nobody has seen the school’s copy on a real projector', 'Or on a real Chromebook. Screens were checked in a browser at those sizes.'),
            ('No person has used it with a screen reader this week', 'Automated accessibility checks pass on every page tested.'),
            ('The economy numbers are our guesses', 'The class budget, the limit per student and the daily grant limits can all be changed.'),
            ('The AI second opinion is below its pass mark', '31 of 36 on our test, so it stays off unless the school chooses otherwise.'),
        ],
        'say': "I'd rather tell you what isn't done than have you find out. Ludora OS has been installed and attacked in a test environment, but not yet on a real school machine. Your copy hasn't been seen on a real projector. Nobody has sat with a screen reader this week, though the automated checks pass. The economy numbers are our first guesses. And the AI second opinion isn't good enough yet to be on by default.",
    },
    {
        'kind': 'asks', 'title': 'What we need from the school',
        'items': [
            ('Permission for the logo', 'On the browser bar, the installed app and the printed login cards.'),
            ('Your house names', 'And a motto or welcome line if you want one. We added none, because we would not make them up.'),
            ('A small square crest', 'If you want it as the tab icon.'),
            ('A class to try calm play', 'And to tell us whether it is calm enough.'),
        ],
        'image': 'still:class-logins',
        'say': "Four things from you. Permission to use the logo in the places it now appears. Your real house names, and a motto if you'd like one, because we haven't invented anything about the school. A small square version of the crest for the tab icon. And one class to try calm play and tell us honestly whether it's calm enough.",
    },
    {
        'kind': 'cover', 'title': 'Live today, in your colours', 'sub': SITE, 'image': 'frame:crowd2', 'closing': True,
        'say': "Everything you've seen in Ludora itself is live on the site now, in your colours. Ludora OS is ready to try on a machine of yours whenever you want to. Thank you. I'm happy to take questions, or to open the site and show any part of it.",
    },
]
