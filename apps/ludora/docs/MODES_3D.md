# The 3D modes

Nine modes drawn with Ludora's 3D engine (`web/src/three/`). They are games, not lessons. As in
every other mode, the learning comes from the class's own question set: a right answer is what
powers everything you do. The setting (a goldfield, a jetty, a data city, a shop, a park at night, a mountain, a floodlit stadium, a lantern-lit circuit, a hill at night)
is just where the game happens, and none of them is tied to one subject.

| Mode | id | What you do |
|---|---|---|
| Gold Rush | `gold-rush` | Dig down a mine shaft, push your luck, bank your gold before a cave-in. |
| Glow Tag Royale | `glow-tag` | Run around a glowing park arena tagging other players with light beams while the safe ring shrinks. |
| Big Catch | `big-catch` | Cast, wait for the bite, reel in fish big and rare. |
| Code Breakers | `code-breakers` | Mine bits, guess rivals' passwords to hack them, defend with firewalls and 2FA. |
| Corner Shop | `corner-shop` | Stock shelves, serve a queue of customers, grow your shop. |
| Summit Scramble | `summit-scramble` | Climb a mountain at night with the whole class: climb or leap ledge by ledge, reach the camps first, throw ropes to the climbers below. |
| Spot Kick | `spot-kick` | Take penalties under floodlights: pick a place and a strength, and beat a keeper who learns your habits. |
| Lantern Rally | `lantern-rally` | Race karts round a lantern-lit circuit at night: right answers are boost charges; steer for lanterns and round puddles and cones. |
| Tower Together | `tower-together` | The whole class builds one lantern tower before dawn, steadying it against announced gusts: win or lose together. |

Names, art and words are Ludora's own (D30): no other product's names, characters, layouts or
copy. "Inspired by" a genre is fine; copying a product is not.

## Rules every 3D mode follows

- **Engine side first.** The rules are a normal mode (`docs/GAME_MODE_SDK.md`): pure functions,
  `ctx.now()`, `ctx.rng`, self-paced question streams (`mechanics/selfPaced.ts`), bots, and the
  conformance suite with 1, 4 and 12 players, teams, a flashcard-only set, pause, churn and a seed
  replay. `meta.stage = '3d'`.
- **The server decides everything.** Positions, hits, catches, finds and hacks are worked out in
  the mode. A screen only asks.
- **Quiet moves.** Frequent small moves (walking in Glow Tag) return `{ quiet: true }` and the
  mode's `pulse()` gives every screen compact positions ten times a second. Everything else is a
  normal action.
- **Odds are shown.** Every random outcome has its chances in the view, with any event applied,
  and the screen shows them one tap away, as Night Market does.
- **Playable without 3D.** Every action is an ordinary button. If WebGL is missing or the player
  picks Low graphics with 3D off, the mode still plays: the scene is a picture, not the controls.
- **School friendly.** No weapons or violence words: Glow Tag has beams, tags and players who are
  "dimmed", never shot or killed. Nobody loses rewards or items for real; everything is inside
  the game.
- **Games, not lessons.** No mode teaches a topic of its own; the questions are the learning.
  Flavour text is fine, facts to learn are not.
- **Views stay small.** Under 8 KB for a player with 40 in the room; static map data is fine,
  per-frame data goes in the pulse.

## Gold Rush (`gold-rush`)

Push your luck down a mine shaft on a cheerful goldfield.

- **Digs.** Each right answer gives 1 dig. Every third right answer in a row gives a bonus dig.
- **Dig** spends a dig: your shaft goes one level deeper and you find something, drawn from that
  depth's table: gold dust, a nugget, a quartz vein (your next find is doubled), a lucky relic (a
  little gold and a bonus dig), water (nothing), or a **cave-in**. Deeper levels pay more
  and cave in more often. The chance of each, at your depth, with your gear and the current
  event, is always on screen.
- **Your cart** holds what you have found on this trip. A cave-in loses the cart and puts you
  back at the top.
- **Bank** climbs out: the cart goes into the bank, which nothing can touch, and your shaft
  starts again from the top. Banking is free but costs the depth you had reached.
- **Gear** (bought with banked gold): a sharper pick (bonus digs every 2 in a row), timber props
  (each level cuts the cave-in chance), and a gold pan (banking adds 10%).
- **Claim jumping** (setting, on by default): a rare map find lets you take a quarter of the cart
  of the player carrying the most unbanked gold. Banking keeps you safe from it.
- **Events** every 60 to 90 seconds: Gold Fever (finds doubled for 20 seconds), Steady Ground
  (no cave-ins for 15 seconds), Rich Lead (deep finds half as big again for 20 seconds).
- **Winning**: the most banked gold when time runs out, or the first to the goal if one is set.
  Teams pool their banks.
- **Variants**: Deep Lead (deeper levels, bigger nuggets, steeper cave-ins), Race to 1,000 (first
  to bank 1,000 wins), Creek Panning (no cave-ins, smaller finds: a calm game for younger
  players).
- **3D**: a cut-away view of your shaft through layers of soil, clay, gravel and quartz, with your
  Glim digging by lantern light, finds glinting as they come out, and a cart that runs up to the
  bank. The big screen shows the goldfield, every player's headframe and how deep they are.

## Glow Tag Royale (`glow-tag`)

A light-tag battle royale in a glowing park at night.

- **Moving.** Players walk with the keyboard (WASD or arrows) or an on-screen stick. Moves are
  quiet actions at up to 8 a second; the server limits speed, keeps players in the arena and out of
  cover pieces.
- **Charge.** Each right answer adds 2 beam charges (a bonus every third in a row), up to 8.
  Questions are always open in a panel while you play.
- **Tagging** spends a charge: the beam hits if the target is within 16 metres, inside a 40-degree
  cone in front of you, and nothing blocks the line between you. The server checks all three.
  The Tag button aims at the nearest player in your cone, so phones and switch users can play.
- **Glow.** Everyone has 3 glow. A tag takes 1, and the tagged player cannot be tagged again for
  1.5 seconds. At 0 a player is **dimmed**: they leave the arena and answer 2 questions right to
  relight at the edge.
- **The ring** shrinks at set times. Outside it you lose 1 glow every 3 seconds. In the final
  ring nobody relights; dimmed players keep answering for cheer points.
- **Crates** appear around the arena: walk into one for 3 charges, a shield (blocks one tag) or a
  speed boost.
- **Score**: 100 a tag, 50 more for dimming someone, 10 a right answer, and a survival bonus.
  The game ends at the time limit, or when one player (or team) is left in the final ring.
- **Teams**: no tagging teammates; the team with the highest total wins.
- **Pulse**: every player's position, heading, glow and whether they are in, plus the ring.
- **Variants**: Squads (teams of 2 to 4 locked on), One Glow (everyone has 1 glow and relights
  quickly: frantic), Lights Out (the arena is dark; you only see players near you or who just
  fired).
- **3D**: a park at night with glowing cover pieces (hedges, crates, play equipment), Glims in
  glow vests in their team colour, beams as streaks of light. Third-person camera on phones,
  overhead camera on the big screen.

## Big Catch (`big-catch`)

Fishing off a jetty.

- **Casts.** Each right answer gives 1 cast, plus a bonus every third in a row.
- **Cast** spends one. The server decides the catch at once, from the water's table and your
  lure, and the bite comes a few seconds later. Neither is in any view until it happens. Press
  **Reel** within 3 seconds of the bite to land it (within the first half second for a perfect
  reel: 10% heavier). Too early and the fish is scared off; too slow and it gets away.
- **Sell or tank.** Sell a catch for 10 points a kilogram, into the wallet that buys lures, or
  keep it in your tank of 6. Every 3 fish of one rarity in the tank earn a set bonus. Your score
  is your wallet plus your tank. An undecided catch is sold after 10 seconds.
- **Fish** have a rarity, a weight range and a one-line joke. Each water has a legend. Every
  chance is shown, with your lure and any event worked in.
- **Waters**: river, estuary and reef, chosen by the host or rotating every 2 minutes.
- **Lures** (bought from the wallet) shift the odds towards bigger, rarer fish.
- **Events**: Feeding Time (bites come twice as fast), Golden Hour (rarer fish), Passing School
  (common fish half as heavy again).
- **Variants**: Trophy Hunt (every fish is sold; only your three heaviest count), Fishing Frenzy
  (an event is always on and bites come fast), Deep Sea (reef only, bigger fish, longer waits).
- **3D**: your Glim on a jetty over moving water, a cast arc, a bobber, a splash at the bite, the
  fish lifted up. The big screen shows the whole jetty, the biggest catch and a tank of the
  rarest fish caught.

## Code Breakers (`code-breakers`)

A hacking game. The guessing happens on a 2D terminal; the world is a 3D city of data towers.

- **Your password.** At the start each player picks one of 3 passphrases (made from word lists,
  like `Purple-Koala-Rides-42`). The other two, and a third generated one, are its decoys.
- **Bits.** Each right answer opens a choice of 3 data packets. Each shows its kind (bits, boost,
  hack, defence), never exactly what is inside. The chances are shown.
- **Hacking**: pick a player and guess their password from 4 options. Right: take 20% of their
  bits. Wrong: they are alerted and earn a few bits, and that option is crossed off for you.
  A **firewall** blocks one hack. **2FA** means a hacker must also answer one more question right
  before the guess counts. **Change password** gives you new decoys and wipes what hackers have
  learned.
- **Hack back**: someone who was hacked can try one free guess on the hacker within 30 seconds.
- **Room events** every 75 seconds: Data Storm (bits packets pay double), Bounty (hacking the
  leader takes twice as much) and System Glitch (everyone's decoys change and what hackers had
  learned is wiped).
- **Score**: bits.
- **Variants**: Team Ops (teams; hack only other teams; what one teammate learns, all know),
  Lockdown (everyone starts with 2FA; hacks are rarer and take more), Heist (a vault in the
  middle fills from everyone's packets; crack it to take the lot, and it locks again with a new
  password).
- **3D**: each player is a tower in a night-time data city, growing with their bits; hacks fly as
  packets between towers. Your Glim sits at a desk of screens. A 2D view works without 3D.

## Corner Shop (`corner-shop`)

Run a little shop. Questions bring the deliveries; customers bring the money.

- **Deliveries.** Each right answer offers 3 deliveries to choose from (12 apples, 4 cakes, a
  mystery crate with its odds shown), added to your shelves.
- **Customers** arrive by themselves, more often as your rating rises. Each wants 1 to 3 items
  and waits a while. **Serve** them if you have the stock: they pay, and tip more the less they
  waited. Someone who waits too long leaves and your rating drops.
- **Special customers**: VIPs want one or two of a single product and tip three times as much
  (but nothing if you can only serve part of their order); customers in a hurry wait half as
  long and tip double.
- **Upgrades** (bought with cash): more shelves, new product lines (bakery, fruit, books, plants),
  a faster till, cosy decor (customers wait longer), a sign (more customers). Spending lowers
  your cash, so an upgrade has to pay for itself.
- **Events**: Rush Hour (twice the customers), Sale Day (cheaper prices, more customers),
  Delivery Truck (free stock for everyone).
- **Score**: cash.
- **Variants**: Market Stall (fewer products, quicker customers), Big Spenders (baskets of 2 to 5
  items, double tips, more VIPs), Co-op (teams share one shop).
- **3D**: a cosy shop with your Glim behind the counter, shelves that fill and empty, and
  customers (other Glims) queueing at the till. The big screen shows a high street of every
  player's shopfront.

## Summit Scramble (`summit-scramble`)

Everyone climbs the same mountain at night, lanterns in hand. Right answers are how you climb.

- **Grip.** Each right answer gives 1 grip, with a bonus grip on every third right answer in a
  row; a climber holds up to 6. A wrong answer costs nothing but a 2-second pause before the next
  question while your Glim catches its balance (you can still spend grip meanwhile).
- **Climb** (1 grip) goes up one ledge and always works. **Leap** (2 grip) goes up four ledges
  7 times in 10; when it fails you slide back one ledge. The chance is drawn on the server from
  the game's seeded random source (`drawLeap`), from the same number the Leap button prints
  (`odds.ts`). Against two climbs (2 ledges for the same 2 grip), a leap averages 2.5 ledges in
  calm air (2.8 from a camp, where a slip costs nothing) and 1.5 in the wind, so reading the
  wind matters. The screen prints the average next to the odds.
- **Camps.** Every tenth ledge is a camp. Nobody slides below the highest camp they have reached
  (leaping past a camp counts), and the first three climbers to each camp score 40, 25 and 15.
- **Wind** (setting, on by default) blows for 10 seconds about once a minute. Every screen is
  warned 5 seconds before it starts; while it blows, leaps work 5 times in 10 (two climbs are then
  the better bet), and the Leap button says so.
- **Ropes** (setting, on by default) hang on two ledges of every stretch between camps, visible
  from below. Land on one to pick up its rope (you hold one at a time); **Throw rope** pulls the
  nearest climber below you up two ledges (never past you). You score 15 for each of your first 5
  ropes, and they score the height.
- **The end.** The climb ends when time runs out (7 minutes by default) or when enough climbers
  reach the summit (3 by default, or everyone if fewer are climbing). The mountain is 30 ledges by
  default (20 to 60).
- **Points**: 10 a ledge of height, the camp bonuses, ropes thrown, and a summit bonus by
  finishing order: 400 for the last place that ends the climb and 300 more for each place
  earlier (with the default 3 finishers: 1,000, 700, 400). The step is bigger than everything
  else one climber can score beyond height (5 camps first at 40 and 5 ropes at 15: 275), and the
  climb ends once that many have finished, so a summiter always ranks above everyone still
  climbing and an earlier summiter above a later one. Below the summit the most points wins; on
  the live boards ties in points go to the higher climber, then to whoever reached that ledge
  first. The big screen's board moves at most every 2.5 seconds, so each reorder slides once
  and then reads in order.
- **Variants**: Roped Teams (teams of the class climb as one: every right answer adds to the
  team's grip, anyone can spend it, and the team shares one height and score), Night Climb
  (climbers see ropes only 3 ledges ahead, and the wind comes with no warning), Steady Climb (no
  leaps and no wind: right answers alone, for younger classes).
- **3D**: a broad mountain at night with a path of ledges in switchbacks up its front face, a
  camp with a tent, a flag and a lantern at every turn, two bands of cloud, snow above the second
  and falling near the top, distant ranges and a moon. Wind shows as streaks racing across the
  face, flags that flap harder and snow driven sideways. Every climber is their own Glim with a
  lantern: a hop for a climb, a crouch and a jump for a leap, a scramble back down and a dizzy face
  for a slip, a rope and a rise for a pull, a cheer and confetti at a camp, a celebration at the
  summit. Each player's device follows their own Glim; the big screen shows the whole mountain,
  every climber with their name (a crowd on one ledge shares one stacked list of names), the camps, the wind warning, the race for the next camp and the
  mountain news.
- **Without 3D**: `summit-side.tsx` draws the same mountain flat (both read `summit-layout.ts`):
  the path, ledges, camps, ropes and every climber, yourself in gold. The Stage3D label (and the
  side view's) says in words where you are, your last camp, the next camp, who is just above and
  below you, the next rope and the wind, and changes as you climb.
- **Budgets**: the mountain is one mesh; ledges, rocks, trees, cloud puffs and wind streaks are
  instanced, so the scene is a few dozen draw calls before the Glims. No point lights (lantern
  light is additive glow sprites); snow only above the low tier; shadows only on high. Under
  reduced motion the camera moves straight to its place without sweeping or drifting, snow and
  clouds hold still, and moves are drawn with small hops.

## Spot Kick (`spot-kick`)

A penalty shoot-out under floodlights. Right answers earn footballs; where you put them is up to you.

- **Footballs.** Each right answer earns one football; you hold up to 3. A wrong answer earns none.
  Questions are self-paced and always open beside the shooting.
- **A penalty** spends a football. Choose one of five places (the four corners or the middle) and a
  strength. A **placed** shot is always on target but easier to save; a **blasted** one is harder to
  save but can fly wide (top corners most often). The server draws the outcome, the keeper's dive
  and how a save or miss looked from the game's seeded random source, from exactly the chances on
  the buttons (`odds.ts` is shared by the mode and the screens).
- **The keeper learns.** Every shot at a place makes the keeper save it 8 in 100 more often there
  (up to 4 steps), and every other place one step less: mix your shots up and it forgets. What it has
  learned is on every button (the chances, and pips), and the 3D keeper stands a little towards it.
- **On fire.** Three goals in a row and your next goal counts double. A miss or a save puts the fire
  out.
- **Score**: goals are points; the most at the final whistle wins (6 minutes by default; the last ten
  seconds count down on every screen).
- **Variants**: House Match (two teams, goals add up for your team, the big screen shows the
  scoreline, and the keeper learns the whole team's habits), Keeper Duty (every shot is at a rival's
  goal, in turn; each player sets the two places their own keeper guards, and can change them at any
  time; a guarded place is saved 25 in 100 more often, and the rival's plan is on your buttons),
  Golden Goal (level at the top when time runs out: only the leaders can shoot, the first to score
  wins, and it ends level after 90 seconds).
- **Buttons, not the picture.** Two strength toggles and five place buttons laid out like a goal, each
  naming its place and chances ("Shoot top left, placed: 70% goal, saved 30%, wide 0%"). What
  happened to each shot is said through the screen reader announcer once the picture has shown it.
- **3D**: a small stadium at night: four floodlight pylons, a stand of Glims behind the goal (the
  class's own in the front row, instanced fans behind), glowing boards, a striped pitch, and a goal
  whose back net bulges. The keeper, Mitts, is Ludora's own: round, violet, with huge gold gloves.
  Your Glim runs up and strikes; placed shots curl, blasts fly flat; the keeper dives, catches,
  parries or tips it over; the crowd jumps; after a goal your Glim turns round to celebrate. On the
  big screen the same stadium plays a highlights reel of shots from around the class, from three
  broadcast cameras, with each kicker's Glim and name; a busy class skips to the newest shots, and
  the table and "Latest shots" hold each result back until its highlight has played.
- **2D**: with 3D off, a drawn goal mouth from behind the spot: the ball flies along its dashed path,
  the keeper dives, a plate says what happened, and the keeper's learned places glow.
- **Budgets**: on high about 165 draw calls and 62k triangles (fans' Glims use the low-tier body
  without outlines); low drops the beams, roof lamps and real Glims (about 80 draw calls). Reduced
  motion holds the cameras still and calms the crowd; resets and highlights run on the scene's own
  clock, so a slow laptop slows the picture rather than cutting shots short.

## Lantern Rally (`lantern-rally`)

A night rally round a circuit strung with lanterns. The karts drive themselves; right answers are the fuel.

- **Charges.** Each right answer gives a boost charge; a driver holds 3. A right answer while holding 3
  fires a boost at once, so none is wasted. A wrong answer makes the engine cough: 5 m/s slower for
  1.5 seconds, and the next question waits until it clears. Questions are self-paced and always open.
- **Boost** spends a charge: 8 m/s faster than the 10 m/s cruise for 3 seconds (a boost on a boost
  extends it, up to 6 seconds ahead). A guess is a fair gamble, as it should be: a boost is worth about
  24 metres and a cough costs about 7.5, so guessing between four choices is roughly even, between two
  it pays, and with no idea it does not (`rules-lantern-rally.test.ts` checks the sums).
- **Lanes.** Three lanes; Steer left and Steer right move one lane (at most every 0.22 s). Steering is
  a quiet action: the room sends the pulse instead of full views. Steering by hand turns auto-steer off.
- **The track.** Rows of puddles (5 m/s slower for 1.2 s), cones (6 m/s slower for 1.6 s) and lanterns
  lie round every lap, the same each lap of a race and never blocking all three lanes. Every kart
  collects each lantern once a lap (nobody takes one from anyone else); it gives a glow (4 m/s faster
  for 2 s) 60 times in 100, a shield (drive through the next puddle or cones untouched) 25, or a spare
  charge 15. The prize is drawn on the server from `odds.ts` (`drawPrize`), the same weights every
  screen prints. Going for a lantern is worth about 10 metres on average.
- **Slipstream.** A kart 2 to 14 metres ahead in your lane gives you 2.5 m/s.
- **Auto-steer** (a switch on each player's screen) steers round hazards it notices (8 in 10, decided
  once per hazard from the seeded random source, so it is as good as an average driver, not perfect),
  goes for some lanterns in the next lane, and spends charges on clear road. With it the race plays
  fully by keyboard, switch, screen reader or answers alone. Nobody else can tell: it is in no other
  player's view, the big screen or the pulse.
- **Server-owned race.** Devices send only intents (boost, steer, auto-steer). The race is a fixed-step
  simulation (50 ms steps) in the mode, advanced to the game clock by every hook; a 500 ms tick keeps
  every screen up to date while racing. Effects are windows of game time, so the same inputs replay to
  the same race.
- **Finishing.** A race is 1 to 6 laps (3 by default) of a circuit of about half a kilometre. It ends when
  everyone has finished, 30 seconds after the winner crosses the line, or when time runs out (5 minutes by
  default); the rest are placed where they are at the whistle.
- **Points**: 200 for every driver you beat (and once for yourself), 100 more for finishing, and 10 for
  each right answer (the first 15 in a race). One place is worth more than every answer point, so the
  finishing order (then the order at the whistle) decides the table: a finisher never ranks below someone
  still racing, an earlier finisher never below a later one (a seeded test drives late finishers who
  answer far more questions right). The big screen's table moves at most every 2 seconds.
- **Circuits**: Harbour Lights (the quay, moored boats, boat sheds and a lighthouse beyond the pier
  hairpin), Lantern Wood (winding bends through tall pines and fireflies) and Rooftop Run (square corners
  and chicanes across a city roof, towers with lit windows, water tanks and blinking masts).
  `track.ts` holds their shapes and is shared by the mode (lap lengths), the 3D scene and the 2D map.
- **Variants**: Team Relay (teams race the clock with no finish line; every metre a teammate drives adds
  to the team's distance, scaled up for smaller teams), Grand Prix (three one-lap races, one on each
  circuit, with a 12-second break between; points carry over, and each new grid starts in reverse order
  of the points so far), Time Trial (everyone drives alone, with no slipstreams, against a ghost of their
  own best lap; the best lap is the score).
- **3D**: toon karts of a few simple shapes in each driver's colour, the driver's own Glim at the wheel
  (wearing the school's uniform on a school's copy, with no special case) and a little lantern on a mast
  behind; a road with kerbs and dashed lanes, lantern strings on poles both sides, a start gantry whose
  five lights count down. Boosts leave a streak, puddles splash, cones knock sparks, a shield is a bubble,
  a glow a golden halo, a cough a puff of smoke; finishers celebrate. Each device has a chase camera
  behind its own kart (karts just behind you are hidden so they never block the view); the big screen
  shows the whole circuit from above and cuts to the trackside for the front of the race and each
  overtake or new leader, with a small map in the corner, the race order, race news and the fastest lap.
  Karts close together share one stacked name tag.
- **Without 3D**: `lantern-rally-map.tsx` draws the circuit from above: scenery, kerbs, lanes, lantern
  strings, items, every kart (yours in gold, with boost streaks and shields) and, in a time trial, your
  ghost. The Stage3D label (and the map's) says your place, lap and lane, who is just ahead and behind,
  and what lies ahead in each lane, in words (`lantern-rally-words.ts`, unit tested); a live region says
  each boost, lantern, hit, lap, place change and finish.
- **Budgets**: one mesh for the road, kerbs and lines; poles, lanterns, items, trees, towers, boats and
  crates are instanced and their glows are one Points cloud each. A player's device draws its own kart and
  the 15 nearest: about 50 to 110 draw calls (Gold Rush's shaft: 177 to 262). The big screen draws the top
  40 karts, 24 of them with Glims (without outlines there): about 430 draw calls at every tier (Gold
  Rush's goldfield: 1,100 to 1,300). Shadows only on high, no point lights, fewer lanterns and trees on
  low. Under reduced motion the cameras do not cut, drift or kick on a boost, lanterns stop bobbing, and
  karts do not wobble.
- **Checking it**: `/dev/three.html?scene=rally` and `?scene=rally-host` (`&circuit=harbour|forest|rooftops`,
  `&players=30`, `&trial=1`); `&manual=1` holds the clock so `window.__step(ms)` steps whole sequences.

## Tower Together (`tower-together`)

The whole class builds one lantern tower on a hill before dawn. The first 3D mode the class wins or
loses together (`coop-win` / `coop-loss`).

- **Pieces.** Each right answer earns a piece (hold up to 3). A wrong answer costs a 2-second pause
  and nothing else; nobody is knocked out. The builder picks the kind when placing it:
  **Timber** (2 floors, +18 sway), **Stone** (1 floor, −9 sway) or a **Lantern brace** (no height;
  nothing below it can ever fall). A piece's sway is divided by the crew size (`swayFor`), so the
  gauge moves at the same pace for 1 builder or 60.
- **Sway** (0 to 100) is the pieces' own sway plus **leverage**: the floors standing above the highest
  brace add 80 for a stretch as tall as the target. A brace takes leverage back to 0. At 100 no more
  timber fits. Every button prints what it would do ("Place Timber: +2 floors, sway +3.1 to 41.").
- **Braces** need a quarter of the target in new floors above the last brace (at least 4),
  so a fall always costs something and a brace has to be chosen.
- **Gusts** land on a fixed schedule (every 40 s from 40 s; Storm Night every 30 s), none in the last
  15 seconds. Each one's strength is drawn from the game's seeded random source when it is announced,
  8 seconds ahead, with the chances every screen prints (`odds.ts`: Breeze 50%, Strong gust 35%,
  Gale 15%; Storm Night 20/40/40). A breeze knocks down a tower swaying more than 70, a strong gust
  45, a gale 25: every floor above the highest brace falls, the brace's placer is credited with the
  floors it saved, and what is left settles to 40% of its pieces' sway.
- **Target**: 36 floors a builder, less 4 (32 alone, 176 for 5, 1,076 for 30, 2,156 for 60), scaled
  for the night's length, the host's Lower/Higher setting and Storm Night (90%); late joiners raise it by their share of
  the night left. Stars at the target, 125% and 150%. Measured by simulation (`scripts/tower-sim.ts`,
  `docs/features/tower.md`): a class that reads the gauge reaches it about 9 nights in 10, one that
  ignores it about 1 in 6, and no single piece played alone ever does.
- **Points** (the results table): 10 a piece placed, 5 a floor of yours standing at dawn (a brace
  counts 1), 3 a floor your braces saved. The headline is what the class built.
- **Variants**: Two Towers (each team its own tower, target and sway; the same gusts hit both; the team
  nearer its target wins), Storm Night (stronger, more frequent gusts, a 90% target: the hard one), Calm Build (no gusts and no
  falls; at full sway timber waits for stone).
- **3D**: a toon tower of planked timber, coursed blue-grey stone and glowing gold brace bands on a
  grassy hill, with lit windows on every braced floor and lantern glow at the braces. Glims stand on a
  scaffold round the top and throw each piece up; the tower leans and wobbles with the gauge, streaks
  of wind thicken as a gust nears, and toppled floors tumble off downwind and fade. The sky warms
  from night through blue to first light as time runs out. Each phone looks at the top from its own
  Glim's side; the big screen frames the whole tower (pulling back as it grows), with the target as a
  ring and, when out of frame, a marker ("Target 716: 571 floors to go"). Builders near one place share
  a stacked name tag (one per side on the big screen, one in all on a phone).
- **2D**: `tower-side.tsx` draws the same tower flat from the same view (`tower-layout.ts`): blocks,
  braces, the lean, target and star lines (or a marker above), builders, wind streaks and the dawn sky.
- **Words**: the Stage3D label and the 2D picture's say the height, the target, the sway, the highest
  brace and the coming gust; your own pieces and every gust's result are announced once drawn.
- **Budgets**: blocks are three instanced meshes (runs of thin pieces merge into timber and stone
  bands, so a 2,000-floor tower stays under 200 instances); windows are one instanced mesh; no point
  lights; shadows only on high. Reduced motion: no swaying, no camera drift, falls fade in place.

