# The 3D modes

Five modes drawn with Ludora's 3D engine (`web/src/three/`). They are games, not lessons. As in
every other mode, the learning comes from the class's own question set: a right answer is what
powers everything you do. The setting (a goldfield, a jetty, a data city, a shop, a park at night)
is just where the game happens, and none of them is tied to one subject.

| Mode | id | What you do |
|---|---|---|
| Gold Rush | `gold-rush` | Dig down a mine shaft, push your luck, bank your gold before a cave-in. |
| Glow Tag Royale | `glow-tag` | Run around a glowing park arena tagging other players with light beams while the safe ring shrinks. |
| Big Catch | `big-catch` | Cast, wait for the bite, reel in fish big and rare. |
| Code Breakers | `code-breakers` | Mine bits, guess rivals' passwords to hack them, defend with firewalls and 2FA. |
| Corner Shop | `corner-shop` | Stock shelves, serve a queue of customers, grow your shop. |

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
- **Room events** shake things up for a few seconds at a time (for example double bits, or a
  bounty on the leader).
- **Score**: bits.
- **Variants**: Team Ops (teams; hack only other teams), Lockdown (everyone starts with 2FA; hacks
  are rarer and pay more), and one more real rule change.
- **3D**: each player is a tower in a night-time data city, growing with their bits; hacks fly as
  packets between towers. Your Glim sits at a desk of screens. A 2D view works without 3D.

## Corner Shop (`corner-shop`)

Run a little shop. Questions bring the deliveries; customers bring the money.

- **Deliveries.** Each right answer offers 3 deliveries to choose from (12 apples, 4 cakes, a
  mystery crate with its odds shown), added to your shelves.
- **Customers** arrive by themselves, more often as your rating rises. Each wants 1 to 3 items
  and waits a while. **Serve** them if you have the stock: they pay, and tip more the less they
  waited. Someone who waits too long leaves and your rating drops.
- **Upgrades** (bought with cash): more shelves, new product lines (bakery, fruit, books, plants),
  a faster till, cosy decor (customers wait longer), a sign (more customers). Spending lowers
  your cash, so an upgrade has to pay for itself.
- **Events**: Rush Hour (twice the customers), Sale Day (cheaper prices, more customers),
  Delivery Truck (free stock for everyone).
- **Score**: cash.
- **Variants**: Market Stall (fewer products, quicker customers), Big Spenders (bigger orders and
  bigger tips), Co-op (teams share one shop).
- **3D**: a cosy shop with your Glim behind the counter, shelves that fill and empty, and
  customers (other Glims) queueing at the till. The big screen shows a high street of every
  player's shopfront.
