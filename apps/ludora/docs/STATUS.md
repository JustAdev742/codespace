# Ludora status

Live status of the build. Updated with each milestone commit. Everything marked
**verified** was checked by an automated test or by driving the real app in a
browser; anything else says what it is.

Last updated: 2026-10-29.

## Milestones

| Milestone | State | Notes |
|---|---|---|
| M0 Audit and plan | Done | Findings and plan in the first report; decisions in [DECISIONS.md](DECISIONS.md). |
| M1 Foundation | Done | Monorepo, Postgres + Drizzle migrations, auth (accounts, guests, recovery codes), design system, app shell. |
| M2 Engine and first loop | Done | Deterministic engine, 8 question types, Classic played host + player in the browser. |
| M3 Multiplayer and modes | Done | 20 playable modes and 100 variants (120 in all), every variant a rule change, all passing the conformance suite. |
| M4 Economy and progression | Done | Shop, Lanterns with disclosed odds, collections, locker, quests, achievements, levels, streaks. |
| M5 Staff tools | Done | Staff API and all 14 staff sections in the web app. An end-to-end test opens every section as a super administrator at phone and desktop widths. |
| M6 Content, social, classes, analytics | Done | Friends, blocks, profiles, my stats, leaderboards, classes, assignments and their reports, hosted games, game reports, the set editor with image uploads, and AI question drafts. |
| Chaos (D47) | Done | The secret cheat menu: 1,005 cheats and 10 combos, each tested in a real game; the unlock sequence; the private menu. See [CHAOS.md](CHAOS.md). |
| M7-8 Polish, CI, deployment | In progress | Production build, Docker image, compose file, CI workflow, docs and end-to-end tests (run in CI) are in. The whole app is restyled for players aged 8 to 17 (D46), and automated accessibility checks pass on every page, game screen and staff section. A design review of the whole app was done and its findings fixed. A playable demo builds for GitHub Pages. 2026-10-29: account download and deletion, a privacy policy and terms, data retention, a measured load test, a deployment kit tested in Docker, a machine screen-reader audit, and WebKit and Firefox runs in CI. Remaining: a person's screen-reader pass, legal review of the policy, and a real deployment, which needs the operator's server and domain. |

## What works today (verified)

- **Accounts**: register, sign in, guest play, claim a guest account, recovery
  codes, password change, lockout after repeated failures, privacy defaults for
  under-13s. Sessions are HttpOnly cookies storing only a hash server-side. A
  student who loses their recovery code gets a new one from their teacher
  (Sign-in help on the class page) or from support; no email is involved (D38).
- **Rooms**: 6-digit join codes, lobby, reconnection with a reconnect token,
  host controls (start, pause, resume, skip, end, kick, lock, practice bots,
  teams), late joining, solo rooms, per-socket rate limits, join limits per IP.
  "Your open games" on the Host and home pages lets a host rejoin or close a
  game they left; only games in the lobby, running or paused count toward the
  six a host may have open (D40). Leaving mid-game asks first, and says what
  happens: a player starts again from zero; players see a host-paced game
  paused until the host is back, and the game ends after 10 minutes away.
  Someone who joins during a question may still answer it; a missed one is
  not held against them (D39). Players see their own answer when locked in
  and on the reveal, and answering is held while the connection is down.
  Solo games end with Play again.
- **Modes (20)**: Classic, Comet Dash, Quick Draw, Lantern Out, Confidence,
  Glimgo, Lantern Match, Word Scramble, Time Attack, Survival Run, Flashcard
  Study, Sky Lanterns, Gloom Giant, Tug of War, Night Market, Lantern Guard,
  Glim Duels, Lantern Trail, Lantern Lands, Festival Workshop.
  - Every one plays to the end with 1, 4 and 12 bots (conformance suite).
  - Every one survives players leaving and pausing, and works with
    flashcard-only sets and teams.
  - Every one is deterministic for a seed and never leaks answers into a view.
  - The first 14 were also started, played and ended through the real web
    app. The six newest were played to their results in the static demo,
    which runs the same room code with no server.
- **Variants (100)**: each changes a rule, never just a number (for example a
  wrong-answer penalty, a streak multiplier, a knockout, co-op wins, comeback
  bonuses, questions that come back at the end). New rules default to off, and
  173 recorded bot games of the base modes replay identically. Every variant
  plays to the end with its mode's minimum players, survives players leaving
  and replays from a seed; each new rule has its own test. Fading Lights and
  Kindling were also played to the end in the real app.
- **Night Market, Lantern Guard and Glim Duels** (D44), three modes built to
  play like games rather than quizzes with a skin:
  - **Night Market**: right answers pick one of three mystery lanterns. They
    hold coins, a gamble, a trick on another player (swipe, swap or toll) or
    a charm.
  - **Lantern Guard**: the class builds and upgrades towers against waves of
    gloomlings and Gloom Lords, and can fill the Great Lantern for a flare.
  - **Glim Duels**: head-to-head duels on the class's questions, with
    shields, power strikes and mends, and a Shadow Glim for the odd player out.

  Every random outcome has its odds shown to players. Checked:
  - rules tests: 28, 38 and 47;
  - the conformance suite for all three and their 15 variants;
  - bot simulations, used to tune balance (the numbers are in each mode's
    commit);
  - play-throughs in the static demo: phone at 390x844 and 360x640, big
    screen at 1366x768 and 1920x1080, axe with no violations, no console
    errors.

  Two Lantern Guard variants were retuned after the first simulations:
  - Frost and Fire went from 17%, 70% and 100% wins (1, 4 and 12 players) to
    80%, 80% and 73%. Everyone now starts with enough gold for a Firework,
    and toughness grows with the room.
  - Endless Night: 12 players went from never reaching dawn to 40%, with 1
    and 4 players unchanged.

  Glim Duels has not been seen in a browser with more than 10 duels at once.
- **Lantern Trail** (D44), a festival board game. Right answers roll the
  dice and walk your Glim around a 32-space town loop: coin spaces, chance
  cards, ferries, puddles and a shortcut. Players race to the Golden Lantern
  stall, which moves each time someone buys. Rooms of 10 or more get a
  second stall. Checked:
  - 52 rules tests and the conformance suite for the mode and its 5
    variants;
  - simulations at classroom pace: the first lantern is bought in 25 to 90
    seconds, depending on room size, and at most 2% of players end without
    one;
  - play-throughs in the static demo at phone and projector sizes, including
    a 20-player room, with axe and no console errors.
- **Lantern Lands** (D44), a team mode on a shared hexagon map. Right
  answers give energy to claim, fortify or raid lands. Shrines between the
  teams are worth more. Each team scores its lands every 10 seconds, double
  in the final glow.
  - Fairness: maps, homes and shrines are symmetric for 2 to 6 teams. Teams
    behind on lands or short of players fill a bonus meter for extra energy.
  - Phones: every action is also a plain button list, so nobody has to tap a
    small hexagon.

  Checked:
  - 45 rules tests and the conformance suite for its 5 variants;
  - views under 8 KB with 40 players on the big map;
  - 96-game simulations of seat fairness for each team count;
  - play-throughs in the static demo at phone and projector sizes, with axe
    and no console errors.

  Open:
  - Teams one player larger still win more often between equal bots (14 of
    24 games at 4 against 3).
  - With five teams, the team placed between two rivals is the weakest seat.
- **Festival Workshop** (D44), a festival tycoon. Right answers bring
  paydays; coins build, upgrade and replace stations that earn every second.
  - One market for the whole class: goods everyone makes go cheap, so market
    readers beat copycats in simulations.
  - Parade orders, room events, a Grand finale, and Festival Favours (one of
    them a prank on a rival).

  Checked:
  - 40 rules tests and the conformance suite for its 5 variants;
  - balance simulations with the real engine;
  - two play-throughs in the static demo, one a full 7-minute game, with axe
    and no console errors.

  Open:
  - Fast answerers pull far ahead, because paydays grow with income. In a
    demo against bots a slow player trails a long way.
  - Long names are cut short in the projector's two-column board.
- **Chaos, the secret cheat menu** (D47, [CHAOS.md](CHAOS.md)). Any player can
  unlock it by finding the lantern's secret: a knock on the About panel, a
  riddle, a ritual of reactions in a live game, and a lantern to hold. Every
  stage is checked on the server. Unlocked players cast cheats from a
  searchable menu that the server sends only to them.
  - 1,005 cheats and 10 combos (counted from the registry): 209 work in any mode and 796
    belong to one of 25 modes (all five 3D modes included). Seven categories: score,
    advantage, troll, round, economy, visual and random. No cheat is a copy of another;
    ideas that only changed a number or a target were turned down.
  - Each cheat was cast into one of two identical bot games, in every mode
    it supports, and the two games differed afterwards. Screen cheats had to
    show on the target's screen.
  - Energy, cooldowns, shields, conflicts, combos, undo, the host's Calm the
    room and repeated requests have their own tests. Chaos is off in
    assignments, and casters earn no rewards from that game.
  - An end-to-end test does the whole sequence in real browsers, casts Upside
    Down on another player and sees it on their screen. The menu and cheat
    list answer 404 for locked accounts, and CI fails if a cheat turns up in
    the public files.
  - Not done: effects on one part of the screen (a name, a score) work only
    where screens use the shared leaderboard, answer tiles and question card.
    Sequence progress resets when the server restarts.
- **Accessibility**: an axe-core audit (WCAG 2.2 A and AA rules) of every
  player page, the sign-in pages and every staff section, in both themes at
  phone and desktop widths, finds no violations; the layout end-to-end test now
  runs the same checks on thirteen pages, so CI catches regressions. The live
  game was scanned the same way while being played, host on a projector-sized
  screen and player on a phone, from the lobby to the results, in all 14 modes
  (Classic in both themes): 120 scans, no violations after one fix (Lantern
  Match card names now contain every word on the card). For screen reader
  users the game announces each change once through a single polite live
  region: the start, each question with its number, the result with the right
  answer, a five-second warning, the player's place, pauses and the end. When
  the answer button that had focus disappears, focus moves to the new question.
  This was checked by recording the accessibility tree and every live-region
  message through a whole game, and the end-to-end game test asserts the focus
  and the messages. Buttons
  whose visible text is terse (Buy 150, collection cards) take their accessible
  names from their content, so speech users can say what they see. A machine
  screen-reader audit on 2026-10-29 covered seven modes, the 3D ones included
  ([SCREEN_READER_AUDIT.md](SCREEN_READER_AUDIT.md)). It led to two fixes:
  focus stays on the question after answering, and a missed question says
  "Time's up". Automated checks cover only part of WCAG; a person with a
  screen reader has not played it yet.
- **Look and feel** (D30, D46; docs/DESIGN.md): "game night, live", for
  players aged 8 to 17.
  - A midnight stage under a floodlight, with faint arena glows and no
    pattern, behind the landing hero, sign-in, the join flow, the home
    greeting, pack opening and the whole live game.
  - Barlow Condensed for headings and numbers.
  - Solid pressable pieces with a darker bottom edge, and a slanted plate
    for big moments.
  - Glims only where a collectible belongs.
  - Straight-talk copy.
  - Rarity shows like a trading card: a coloured frame, then foil and a
    sheen from epic up, and always in words.
  - The shop lists items as trading cards, with odds on every Lantern.
  - Opening a Lantern takes 1 to 1.7 seconds, can be skipped, shows the card
    straight away under reduced motion, and keeps the odds on screen.

  Checked after the restyle, in Chromium:
  - 27 pages, signed out and signed in (staff pages included), in both
    themes at 390x844, 360x640, 1366x768 and 1920x1080: 216 screenshots;
    axe (WCAG 2.2 A and AA rules) on each page at phone and laptop size in
    both themes, with no violations; no sideways scroll at 360; no console
    errors.
  - A long display name steps the home greeting down a size on phones
    instead of breaking mid-word.
- **Live game screens**: joining shows the game's name on a gold plate and a
  large code entry. The host lobby shows the join code huge on a white card
  while players arrive as cards (the crowd resizes so 30 players with full
  names fit a 1366 by 768 projector, measured before the restyle). Questions
  use solid answer tiles, each with a shape, a letter and a colour, two-up and
  thumb-sized on phones; a chosen tile is held down with a check; the result
  says "Correct" with the points, or "Incorrect" with the answer; reveals show
  how many picked each answer; leaderboard rows slide to their new rank; results raise a podium,
  third place first, with the winner cheering on top (co-op games get a team
  photo). Question pictures display at a fixed height on every screen size.
  All 20 modes use the same stage, every player's Glim shows its real rarity
  finish (D36), and a host can run a game from a phone. Measured after the
  design review: every host screen fits a 1366 by 768 and a 1920 by 1080
  projector without scrolling with 5, 12, 21 and 30 players (long lists show
  their top rows and count the rest), and on phones every single-answer
  question and its action fit at 390 by 844, 375 by 667 and 360 by 640.
  Matching, ordering and select-all questions still need a scroll below 390
  by 844. Select-all keeps its button in view once it can be pressed; ordering
  and matching put theirs below the list, where it never covers the move and
  match controls. Variant
  intros name the variant and state each rule switched on. Every mode was played
  to its results in a real browser with a host, a player and bots, at 390
  pixels and at projector size; eight variants were played to check their new
  screen text; with reduced motion nothing moves and nothing waits to appear.
  After the restyle (D46), checked in Chromium:
  - All 20 modes, played against bots in the demo through to their results,
    at 390x844, 360x640, 1366x768 and 1920x1080: no axe violations on the
    phone, big-screen and results views, no sideways scroll, no console
    errors.
  - A Classic game hosted on the real server with two phones: lobby,
    question, reveal and results pass axe with no console errors, and the
    results fit a 1366x768 and a 1920x1080 projector without scrolling.
  - Modes whose big screen lists the room's news show no news toasts over
    it.
- **Sound and music** (D41, D43; rebuilt 2026-10-29). The music and effects are files rendered
  offline from Ludora's own scores by `tools/audio`. Some instruments are from the MIT MuseScore
  General soundfont (via FluidSynth); others are Ludora's own synthesiser and drum kit, written in
  numpy. Mixing and mastering are in Python. Seven loops play on the host's screen and in solo
  games, never on players' phones:
  - the lobby;
  - a track for each kind of game (`MODE_MUSIC`): game, calm, market or battle;
  - a final-stretch track for the last 30 seconds or the last questions;
  - the results music after the fanfare (a gentler track after a lost co-op game).

  Each track is 32 to 40 bars with real sections: a theme, its answer, a contrasting part, a
  breakdown and a build, with fills, risers and impacts between them. The loops run 55 to
  91 seconds, up from 27 to 46. Music changes land on the bar line, and big moments turn the
  music down for a moment.

  Sixty effects cover answering, results, the clock, joins, reactions, purchases and Lantern
  reveals by rarity, plus coins, steals, shields, hits, dice and events for the new modes.
  - Each is layered: a transient, a tonal body, air or sparkle, stereo width and mono lows.
  - The 18 heard most often (taps, coins, hits, reactions and others) have two or three takes
    and a small pitch spread. The player never plays the same take twice in a row, so a sound
    heard all game never repeats exactly.
  - Each effect plays a synthesised version until its file has loaded. That version follows
    the recording's notes and sits within 3.3 dB of its level.

  A speaker button in the game header mutes everything on that device and is remembered;
  Settings turns effects and music off for the account.

  Checked on 2026-10-29 with `tools/audio/analyze.py`, against the old files:
  - Music:
    - On loudness target (-15.5 to -18 LUFS), with the true peak at or under -1.2 dBTP measured
      on the MP3s.
    - Seams at about -130 dB.
    - Low mids down from up to 65% of the energy to about 20 to 28%, and a real bottom end
      (sub plus low 36 to 50%).
    - Loudness range up from 1.3 to 1.9 LU to 3.2 to 5.2.
    - Stereo width above 300 Hz up from 6 to 10% to 14 to 24%.
    - game's lows, previously not mono, are now mono.
  - Effects: the analysis flags fell from 7 to none.
    - Bare single-band tones from 23 to 0, and mono effects from 27 to 0.
    - Phasey effects from 4 to 0.
    - `hit` and `hurt` now lose under 2 dB on a laptop speaker, against 14 dB before.
    - Long tails only on the 3 big moments.
    - 1,320 KB for 85 files.
  - The web tests, all browser tests in Chromium, and the game and shop tests in Firefox and
    WebKit pass on the new files.
  - Rebuilding with no changes gives byte-identical files.

  **Not yet judged by ear.** Everything was tuned by measurement and spectrograms. Nobody has
  listened to it through speakers, which is the next useful check, particularly:
  - game's quiet vibraphone under questions;
  - the very high lead in Final Stretch;
  - the balance of the steel drums in market.
- **Playable demo** (D42): a static build for GitHub Pages
  (`npm run build:demo`) where a whole game runs in the browser against up to
  19 practice bots: every mode, the 20 built-in sets, the big-screen view with
  the host's controls, reactions, results with Play again, sound and music. It
  runs the server's own room code; nothing is saved and nothing calls a server.
  Checked:
  - four end-to-end tests (`npm run test:demo`, run in CI) serve the build
    under a sub-path with no server, as Pages does: a full Classic game from
    the start page to Play again, with an answer of whatever type comes up,
    the big screen showing the reveal without your answer, pause and resume,
    and no requests outside the demo and no console errors; one-player and
    team modes and set picking; a game address surviving a reload; and a
    360-pixel phone with no sideways scrolling. Axe passes on the start page,
    the game and the big screen. Repeated 8 times in a row: all passed;
  - all 14 modes started and drew both screens without errors in a browser.
  **Not checked yet**: the publish itself. The Pages workflow
  (`.github/workflows/pages.yml`) publishes from `main` once Pages is set to
  GitHub Actions in the repository settings; neither has happened yet.
- **Glims**: all 112 are original characters with faces, arms and feet and
  distinct silhouettes per collection. Restyled for 8 to 17 (D46):
  - no blush;
  - smaller eyes under lids set by the brows, so each has an expression;
  - a crisp dark contour and hard cel shading;
  - rarity as a finish (a glint from rare, two-tone from epic, a gold rim on
    legendary, an iridescent rim on mythic);
  - wave and cheer poses; they do not bob.

  Legible from 24 to 220 pixels in both themes. A development gallery at
  `/dev/glims.html` shows every collection, size, part, accessory, pose and
  finish.
- **Rewards**: Sparks, XP, quests and achievements after each game, with a daily
  Spark cap, a minimum number of answers, a solo multiplier, and counting that
  stops puzzle retries or self-graded flashcards from paying more than a quiz.
- **Economy**: idempotent purchases (ten parallel buys against a balance for
  three charge exactly three), ledger with balance after each change, CHECK
  constraints, daily and weekly shop rotations, Lanterns with odds computed from
  the same table the server rolls against, pity counter, recycle and craft,
  one-time collection rewards, Frost Festival event shop with event quests.
- **Staff API**: authorisation matrix over 7 roles and 54 endpoints; moderation
  (warn, mute, suspend, ban, reset name) with typed confirmation checked on the
  server; reports; role assignment with rank rules and the operator CLI;
  capped, audited grants; catalogue, Lantern, shop, event, flag, mode and room
  management; system health; audit log; test accounts, resets, QA scenarios and
  unlimited test currency with production restrictions.
- **Player safety**: report a room, a set or a profile; warnings and mutes
  reach the player as a notice; blocks; friend requests follow privacy settings
  and never reveal why they were refused; staff can switch friends off with a
  flag while blocks keep working; no free-text chat in rooms.
- **Friends and profiles**: add friends by code, accept, decline, cancel and
  remove; block and unblock; profiles that follow privacy settings; my stats by
  mode and subject with an accessible chart and a table view; leaderboards for
  friends, a class and everyone, this week or all time. Every action was driven
  in a real browser at phone and desktop widths, by keyboard as well.
- **Classes**: teacher accounts create classes with join codes, students join,
  assignments are played solo (even from a private set, without exposing its
  answers), teachers get per-student results and per-question first-try rates,
  with CSV downloads that cannot inject spreadsheet formulas. Teachers rename,
  archive and re-code classes and remove students; students see only their own
  results. Anyone can switch account type in Settings (D32). Hosts get a report
  for every game they ran. All of it was driven in a real browser at phone and
  desktop widths, with an axe check in both themes.
- **Staff area**: 14 sections (overview, players and player detail, reports,
  question sets, live rooms, game modes, economy, catalogue, shop, events, feature
  flags, testing, system health, audit log). Menus show only what a role may
  use, and every action is checked again by the API. Each section was driven in
  a real browser at phone and desktop widths, and the end-to-end suite opens
  every one of them at 390 and 1366 pixels.
- **Docker image**: CI builds it on every change, starts it against Postgres
  and checks that it answers.
- **Deployment kit** (DEPLOYMENT.md, 2026-10-29). `compose.https.yaml` puts Caddy in front
  for automatic HTTPS. `scripts/new-env.sh` writes `.env` with random secrets.
  `scripts/backup.sh` and `scripts/restore.sh` handle the database and images. Tested in
  Docker on the real image behind Caddy's local certificate:
  - HTTP redirects to HTTPS, and the app's port is not published.
  - A game played over WebSockets through the proxy.
  - Backup and restore brought data and an image back.
  - A failed backup left nothing half-written.
  A real Let's Encrypt certificate needs a public domain and has not been tested.
- **Capacity** (measured with `scripts/load-test.mjs`, DEPLOYMENT.md). One core ran:
  - Classic with 40 players and 20 bots at 3% CPU, with 6 ms answer round trips at p95;
  - 120 players in one room at 12% (50% peak);
  - four games at once, 160 participants, at 25%.
- **Your data and privacy** (2026-10-29). Settings → Your data downloads everything stored
  about the account as JSON (no password, recovery or session hashes) and deletes the
  account after the username and password are typed.
  - Deleting is refused for staff roles. It removes the wallet, collection, friends, classes
    taught, private sets and images only those sets used.
  - Game results stay under "Player", public sets lose their owner, and audit entries say
    "Deleted account". A player in a live game is taken out and the game still saves.
  - Sign-in records go a week after they end, and unreachable guest accounts once they are
    30 days old.
  - `/privacy` and `/terms` describe what the code actually stores, in plain words. They
    name the operator from `OPERATOR_NAME` and `OPERATOR_CONTACT`, and are linked from
    sign-up, Settings and every page's footer.
  - Tested by `server/test/account.test.ts` (8) and `e2e/account.spec.ts`.
- **Set editor**: all 8 question types, import from JSON, CSV or pasted text
  with a preview that names each bad row, export to JSON and CSV (formula-safe,
  round trips keep question ids), local drafts with restore, a leave warning,
  keyboard reordering, an error summary that links to each field, and a copy
  flow for other people's sets. 157 browser checks and an axe check in six
  states passed.
- **Question images**: authors upload PNG, JPEG, GIF or WebP up to 2 MB in the
  set editor, with a preview, a description for players who cannot see it,
  replace and remove. The server identifies the format from the file's bytes
  (an SVG or HTML file named .png is refused), caps dimensions at 4000 pixels,
  strips location and camera metadata, stores files under random names and
  serves them with a sandboxing policy. Sets may only use real, visible
  uploads; moderators can hide one. Upload, save and play were driven in a real
  browser; metadata stripping was checked by decoding the results in Chromium.
- **AI question drafts** (D37): with an Anthropic API key and the
  `ai.question_drafts` flag on, teachers, creators and staff can describe a
  topic, age band, number and kinds of question, and get drafts back in the
  set editor to tick, add and edit before saving. The server checks who may
  draft, the daily allowances (30 per account, a site-wide cap) and one request
  at a time; it validates every draft against the question rules and records
  each request without its topic. Server tests run the drafter against a
  stand-in for the API client and the routes against a stand-in drafter; an
  end-to-end test drives the dialog with the AI endpoints answered in the
  browser and saves the drafted set through the real server, with axe checks
  on both steps. **Not yet done: a real call to the Claude API**, because this
  environment has no API key.
- **Seasons** (D48): the home pages hang the season's decorations across the
  top (lanterns and friendly ghosts for Spooky Week, fairy lights and bunting
  for Summer Christmas, falling leaves in autumn) with a line saying what is on,
  and every 3D scene gets a light drift of confetti, petals or glowing motes
  in the season's colours (none on Low graphics or with reduced motion). It
  turns over by itself at midnight in Sydney; `GET /api/season` serves it, and
  staff can move or drop a celebration for one year in Staff, Events, with a
  reason and an audit entry. `web/dev/seasons.html` previews every one.
- **Monthly Glims** (D49): a This month tab in the shop with the month's
  Lantern (seven exclusive Glims, odds shown) and accessory, also in Featured,
  both leaving at the end of the month in Sydney time. Six drops are in:
  Lantern Night (October 2026), Jacaranda, Tinsel, Seaside, Lucky Lantern and
  Harmony (March 2027). The book shows the current and past months, with a
  note saying whether the Lantern is still in the shop.
- **Creator Studio** (D50): accounts with the `designer` role (granted through
  the audited role system) get a Studio page: a Glim Maker with live 2D and
  3D previews and a Surprise me button, an item maker for accessories,
  frames, banners and titles, a Lantern maker that schedules a limited Lantern
  from Glim drafts with its odds shown, and a shared drafts board with Edit,
  Delete and Publish (optionally into the shop at a price inside the rarity's
  band). The server checks the role on every request, the house rules (names,
  unique looks, rarities, prices) and audits every publish. Checked in a
  browser: a player gets "page not found", a designer made Glims and a beret,
  scheduled a Lantern and put the beret in the shop.
- **Game Maker** (D51): anyone with an account can set up any mode, 2D or 3D,
  with their own question set and rules on the host page and press Save as a
  game; the Game Maker page lists their games and Community games with Host,
  Share (a link anyone can host from) and Delete. Hosting from a made game
  counts its plays. Checked in a browser: made, saved, listed and hosted a 3D
  Gold Rush game, which opened a real room.
- **3D modes**: all five are playable (out of beta) with their 3D screens and
  2D fallbacks: Gold Rush (the mine and the goldfield), Glow Tag Royale (a
  night park arena), Big Catch (the jetty), Code Breakers (desk, data city and
  skyline) and Corner Shop (the shop and the high street). Each was played in
  the demo with bots, on a phone and a desktop, on the big screen and with 3D
  off.
- **School events** (D52): a teacher can type their school's name on a class
  and schedule its own events (name, a line for students, dates, decorations);
  students see the one that is on across the top of their home page and the
  list on the class page. Checked in a browser: a teacher set The Hills
  Grammar School and an Athletics Carnival with bunting, and a student in the
  class saw it on their home page.
- **End-to-end tests** (`e2e/`, Playwright against the production build and a
  fresh database, locally and in CI): a host and a guest play Classic from join code to results;
  a teacher writes a set with a picture and players see it in a game; a teacher
  drafts questions with AI, keeps two and saves the set; a teacher makes a
  student a recovery code and the student gets back in with it; a new
  player buys and opens a Lantern; a staff warning reaches the player and the
  audit log; a player downloads their data and deletes their account; fifteen
  player pages and every staff section fit a phone, have one main heading and
  log no errors, and the player pages pass axe. Every Content-Security-Policy
  violation counts as an error. CI runs the suite in Chromium, WebKit and
  Firefox. Their first runs on 2026-10-29 turned up three problems, all fixed:
  - a CSP report on every form in Firefox;
  - an unhandled audio error when a page is left;
  - WebKit's wording for cut-off loads.
  All three engines pass all 10 tests (CI run 99). Later runs turned up three
  timing faults, also fixed:
  - WebKit now and then did not move focus to a new question (once in CI) or
    to the image description after an upload (once here). Focus now checks
    again on each frame for a second, and moves only if it is still adrift
    (`web/src/lib/focus.ts`).
  - The game test raced Classic's own timers. Its room now waits for the host.
  - The chaos test's knock lost its rhythm on a slow machine. Its taps are now
    timed in the page.
- **A trailer for schools** (`tools/trailer/`): 88 seconds, cut from real games
  filmed with Playwright on a local server (projector and phones, a class of 16
  firing reactions at a reveal, Play again), with an illustrated classroom that
  cheers along, composed as an HTML page rendered frame by frame, and a
  synthesized synth-pop score, with real public-domain recordings for the cheering.
  Its README rebuilds it and lists where each claim in it comes from. The footage
  and the video stay out of git.

## Tests

Run `npm test` from `apps/ludora` (needs a local Postgres; each server test file
creates and drops its own database).

| Project | Files | Tests |
|---|---|---|
| content | 4 | 132: catalogue integrity, every built-in question set, the seasonal calendar (11) and the monthly drops (9) |
| engine | 53 | 8174, including the conformance suite for every mode and variant, and the chaos suite: every cheat in every mode it supports, the core rules and each mode's pack |
| server | 18 | 189: auth and rate limits, realtime, economy, staff, social and classes, preferences, open games, sign-in help, uploads, AI drafts, reward counting, origin checks, chaos, Creator Studio, Game Maker, school events, configuration (3), and account download, deletion and data retention (8) |
| web | 5 | 93: the set editor's checks, import and export (45); the synthesised music, in key and looping cleanly (16); the recorded sounds, every effect with a file and every loop a whole number of bars (16), and the takes and pitch spread they play with (5); which music plays when (7); Glow Tag's park in words for screen readers (4) |
| shared | 0 | no tests of its own; its schemas are exercised by the other projects |
| **Total** | **80** | **8588 passing** (8584 at the full run on 2026-10-29, plus the 4 Glow Tag tests added after it, run with the web suite) |

End-to-end: `npm run test:e2e` (needs Postgres; builds first, then runs 10
browser tests against a fresh `ludora_e2e` database). `E2E_BROWSER=webkit` or
`firefox` runs them in those engines, as CI does. On 2026-10-29, after the
timing fixes above, all 10 passed twice in WebKit and once each in Chromium and
Firefox.
`npm run test:demo` builds the playable demo and runs its 4 browser tests with
no server. All 4 pass.

`npm run typecheck` is clean. `npm run lint` reports 13 stylistic warnings and
no errors.

## Open items

Left out on purpose:
- **Email.** Accounts do not collect email addresses (D38): recovery codes,
  teachers and support cover sign-in help, which suits an audience of
  children. The unused outbox table and `SMTP_URL` setting remain in case an
  operator wants email later.

Not checked yet:
- **Real Safari on iPads and iPhones.** Every browser test passes in WebKit,
  Safari's engine, and in Firefox (CI run 99), but on Linux, not Apple
  hardware. Screenshots of the look are Chromium only.
- **A person's screen-reader pass.** The machine audit is in
  [SCREEN_READER_AUDIT.md](SCREEN_READER_AUDIT.md) (with the two fixes it led
  to), but nobody has played a game with NVDA, JAWS, VoiceOver or TalkBack.
  That document says what to ask of someone who uses one.
- **Legal review.** The privacy policy and terms describe what the software
  does, but a school should have them checked against the law that applies to
  it before real use.

Needs the operator:
- **A real deployment.** The kit is tested in Docker, but going live needs a
  server, a domain and the operator's settings (DEPLOYMENT.md, *From a blank
  server*).

## Running it

```bash
cd apps/ludora
npm install
npm run db:migrate && npm run db:seed   # needs Postgres; DATABASE_URL defaults to postgres://postgres:postgres@localhost:5432/ludora
npm run dev                             # API on :8787, web on :5173
npm run admin -- grant <username> superadmin --reason "first admin"
```
