# 05: Rick and Morty canon: Rick's portal gun (research notes)

Compiled 2026-10-19 as input to an engineering design-target report. These notes cover the TV series (Adult Swim) through Season 9, which aired 2026-05-24 to 2026-07-26 per the wiki's Season 9 page. Comics, games and other tie-ins are **not canon for this report**; where a wiki claim comes from them, it is flagged.

---

## 0. Method, source handling and legend

**How sources were reached.** I could not watch episodes. All Rick and Morty Fandom wiki content was read through the MediaWiki API (`https://rickandmorty.fandom.com/api.php?action=parse&page=<Title>&prop=wikitext`), because the normal HTML pages returned HTTP 402 or 403 (a Cloudflare challenge) to automated fetches. Revision IDs are recorded in section G. I viewed about 40 wiki-hosted frame grabs from the show directly. When I say "frame viewed", I am describing what is in the frame. The episode attribution then depends on the wiki's gallery or category placement. Journalism and interviews were fetched where possible. Several sites returned 403, and those are marked "search snippet only".

**Caveats on fan transcripts** (`<Episode>/Transcript` pages on the wiki):
- Dialogue lines are fan-transcribed, partly from closed captions. Wording is usually reliable, but minor errors are possible.
- Several Season 5–9 transcripts are caption dumps with **no speaker names and no stage directions**: S5E9, S6E6, S7E5, S7E10 and most of Season 8. Where this matters, the speaker is marked "(speaker unlabeled)".
- Stage directions are **a fan's description of the visuals**, not dialogue.
- Several Season 8 transcripts are stubs. In Season 9 only S9E1 (*There's Something About Morty*) and S9E5 (*Jer Bud*) have wiki transcripts. Those episodes rely on the wiki plot summary and on journalism.

**Evidence-type codes**
| Code | Meaning |
|---|---|
| DLG | On-screen dialogue (quoted from a fan transcript) |
| VIS-T | On-screen visual as described in a fan transcript's stage directions |
| VIS-S | On-screen visual that I checked in a wiki-hosted frame grab |
| CC | Closed-caption sound descriptor, as reproduced in a fan transcript |
| WIKI-P | Plot summary written by a wiki editor (describes on-screen events, but not verbatim) |
| WIKI-I | Interpretation or extrapolation by a wiki editor |
| JRN | Entertainment journalism (review, recap or article) |
| CRE | Statement in a creator or showrunner interview |

**Confidence:** **High** means verbatim dialogue, a checked frame, or two or more independent consistent sources. **Med** means a single fan stage direction, wiki plot summary or journalism source. **Low** means inference or a single weak source. **UNVERIFIED** means the claim exists somewhere but I found no primary support.

**Episode numbering** comes from the wiki infoboxes. Common slips to avoid:
- *Rickmancing the Stone* is **S3E2**.
- *The ABC's of Beth* is **S3E9**.
- *Morty's Mind Blowers* is S3E8.
- *Thanksploitation Spectacular* is **S5E6**.
- *Gotron Jerrysis Rickvangelion* is S5E7.

Short source keys (T-, E-, F-, J- and so on) are expanded with URLs in section G. Inline links are given for the most important rows.

---

## TOP-LINE (best-established canonical facts)

1. **Standard portals look like a green swirl and are opaque.** The dinosaurs' improved gun makes portals that are "see-through, not a green swirl, so now you can see where you're going" (S6E6, DLG). Frames show flat oval discs on walls and floors, and also free-standing ones.
2. **Portals can be placed on any surface or in mid-air**, including floors, ceilings, the empty space under falling people, and open space. Exits are often elevated, so travellers fall out.
3. **One shot produces a working entrance and exit.** The exit appears at the selected destination without line of sight (repeated visuals). The show never says how the far end is targeted.
4. **The gun is a handheld consumable-powered device.** The early-season wording is "charge" (S1E1, S2E5). From S3 on it is "portal fluid", which S5E9 also calls "quantum transport solution". The fluid sits in a top-mounted glass vial. It runs out, can be refilled, can be contaminated or hacked, is "dangerously toxic", and is manufactured (in "Portal Fluid Mines" under the Citadel; bootleg fluid exists).
5. **The gun keeps a destination history.** That history can be scanned (S1E10) and used to navigate back (S2E5). The gun can be hacked remotely (S1E10, S5E10), and its destination can be pre-locked as a trap (S3E7, S5E10).
6. **Portals pass solids and liquids in both directions while open.** The one explicit restriction in dialogue is "He's gaseous. He's not gonna make it through a portal" (S2E2).
7. **Opening a portal through a body bisects it** (S2E2). **A portal closing on someone severs them.** This is shown explicitly only in S9E6 *Erickerhead* (2026), where Rick's head is cut off.
8. **The gun is never shown travelling in time.** Rick says "that wasn't time travel" (S3E9) and "I don't do time travel" (S4E8).
9. **Portal travel can fail system-wide.** In S6E1 it is "broken", Rick says the "Portal Index" needs a reboot, and a fluid reset sends every traveller back to their "reality of origin". It is fixed in S6E6.
10. **Lots of portal tech other than Rick's gun exists**, but its mechanism is never explained. Examples: the Federation customs gate (blue, typed coordinates), the Citadel's teleport room ("buttons and dials"), the US government gate, purple Federation military portals, Evil Morty's gold gun, the dinosaurs' Portal Pistol, and Portal Gun Jr.

---

## A. CANONICAL ON-SCREEN BEHAVIOUR (with evidence)

### A1. Appearance of portals

| # | Claim | Evidence | Episode(s) | Source | Conf. |
|---|---|---|---|---|---|
| A1.1 | Rick's standard portals are **green with a swirling or spiral surface**. | DLG: dinosaurs contrast their portals with "a green swirl". VIS-T: "summon the green swirling portal". VIS-S: alley frame shows a green spiral oval. | S6E6; S1E1 | [T-S6E6](https://rickandmorty.fandom.com/wiki/JuRicksic_Mort/Transcript); [T-S1E1](https://rickandmorty.fandom.com/wiki/Pilot_%28Rick_and_Morty%29/Transcript); [F-alley](https://static.wikia.nocookie.net/rickandmorty/images/8/89/S1e1_back_alley_portal.png) | High |
| A1.2 | Standard portals are **opaque**: you cannot see the destination before entering. | DLG (S6E6): "The gateways are see-through, not a green swirl, so now you can see where you're going." This is offered as an upgrade, which implies Rick's portals are not see-through. Consistent with the Blender-Dimension trap logic (S3E7, S5E10). Every viewed frame shows a solid swirl. | S6E6 (+S3E7, S5E10) | T-S6E6; [Portal Pistol page](https://rickandmorty.fandom.com/wiki/Portal_Pistol) | High |
| A1.3 | **Shape:** a flat oval or ellipse when vertical on a wall; a round pool when horizontal. Viewed obliquely it foreshortens to a narrow ellipse with no visible thickness, which is consistent with a planar disc. | VIS-S (alley frame; S2E5 "portaled in" frame of an upright portal standing in a room; S3E7 Wishing Portal pool; S3E1 overhead portal) | S1E1, S2E5, S3E1, S3E7 | [F-S2E5](https://static.wikia.nocookie.net/rickandmorty/images/4/4b/S2e5_portaled_in.png); [F-wish](https://static.wikia.nocookie.net/rickandmorty/images/f/fb/S3e7_Wishing_portal.png) | Med–High |
| A1.4 | **Size varies.** Typically about person height. A "miniature" portal was used to hand over a gun. Fixed installations can be room-sized (the Citadel's garbage portal). | VIS-S (alley); VIS-T S3E7: "A miniature portal pops next to Rick J-22"; VIS-S Wishing Portal | S1E1, S3E7 | T-S3E7 | Med–High |
| A1.5 | **Opening visual:** the portal appears as a bright green ring that fills in. Morty's shot flares yellow-green on a door. | VIS-S (S1E10 "shoot portal"; S2E5 "morty portals") | S1E10, S2E5 | [F-S1E10](https://static.wikia.nocookie.net/rickandmorty/images/9/9a/S1e10_shoot_portal.png) | Med |
| A1.6 | **Sound:** captions describe portals as "[ Whooshing ]" / "[ Whoosh ]". One caption reads "[PORTAL GUN ZAPS]". | CC | S3E1 (x5), S3E9, S4E10 (x3), S4E6, S1E7 ("Whoosh! thud!"), S7E6 | T-S3E1, T-S3E9, T-S4E10, T-S7E6 | Med |
| A1.7 | **Other colours belong to other tech:** blue (customs gate S1E1; US government gate S3E10; the prototype in the S3E1 memory), purple diamond (Federation military, S5E8), gold (Evil Morty, S5E10), see-through with a pink rim (Portal Pistol, S6E6), black goo (Rick Prime's trap, S7E5). | VIS-S (frames for all listed) | as listed | Portal Technology page frames; section G | High (that they are depicted) |
| A1.8 | **Two-sidedness:** can a portal be entered from both faces? | Not found in any source | n/a | n/a | **UNVERIFIED / not established** |
| A1.9 | **Edge-on appearance** | No edge-on frame or description found. The oblique view in A1.3 is the closest. | n/a | n/a | **UNVERIFIED** |
| A1.10 | The portal surface "acts like jelly when touched". | WIKI-I only (Portal Gun page) | n/a | [Portal Gun page](https://rickandmorty.fandom.com/wiki/Portal_Gun) | **UNVERIFIED** |

### A2. Placement and projection

| # | Claim | Evidence | Episode(s) | Source | Conf. |
|---|---|---|---|---|---|
| A2.1 | The gun **projects (shoots) a portal onto a surface at a distance**: walls, floors, the ground ahead of a moving car, an asteroid, between a giant's buttocks. **Maximum range is never stated.** | VIS-T, repeated ("shoots a portal into the wall", "shoots a portal at the ground in front of him", "shoots a portal onto an asteroid"); VIS-S (S1E10 butt portal) | S1E10, S2E5, S3E2, S5E7 | [T-S1E10](https://rickandmorty.fandom.com/wiki/Close_Rick-Counters_of_the_Rick_Kind/Transcript); T-S3E2; T-S5E7 | High (placement); range UNVERIFIED |
| A2.2 | **Mid-air and free-standing portals.** Shot beneath characters who are falling. Opened "directly above the guards" at the far end. Placed in the path of people being sucked toward a hull breach. Floating in open space (Evil Morty's gold portal). Standing upright in a room. | VIS-T (S1E10: "As they fall, Rick C-137 shoots a portal beneath them"; S2E2: "A portal appears directly above the guards"); WIKI-P (S6E10); VIS-S (gold portal; S2E5 room) | S1E10, S2E2, S2E5, S5E10, S6E10 | T-S1E10; [T-S2E2](https://rickandmorty.fandom.com/wiki/Mortynight_Run/Transcript); E-S6E10; [F-gold](https://static.wikia.nocookie.net/rickandmorty/images/7/71/Golden_portal.png) | High |
| A2.3 | **Floor-to-ceiling pairs and ceiling exits are common**, so travellers drop out of the exit. | VIS-T S2E5: "makes a portal in the floor and drops through it. Another portal appears in the ceiling and Rick drops out of it". Also S3E2 (car nose "hanging from the ceiling of the garage"), S3E6 ("A portal appears on the ceiling and Jessica and Rick fall through it"), S3E1 (bomb drops from an overhead portal, VIS-S), S7E10 (WIKI-P) | S2E5, S3E1, S3E2, S3E6, S7E10 | [T-S2E5](https://rickandmorty.fandom.com/wiki/Get_Schwifty_%28episode%29/Transcript); T-S3E2; T-S3E6; [F-bomb](https://static.wikia.nocookie.net/rickandmorty/images/d/dd/S3e1_portal_bomb.png) | High |
| A2.4 | **One gun can hold several portals open at once.** Decoys were used in a chase. | VIS-T S1E10: "Rick C-137 shoots several portals into the wall, and enters the last one." | S1E10 | T-S1E10 | Med–High |
| A2.5 | **Spilled portal fluid creates portals on whatever it touches**, with no gun involved: Nick's thigh ("stash hole"), Morty's palm, a drop on a table with tentacles coming out. | DLG S5E9 (Nick: "I spilled that portal stuff on me"; Rick: "I don't want to teleport my lips."); WIKI-P S5E9, S9E2 | S5E9, S9E2 | [T-S5E9](https://rickandmorty.fandom.com/wiki/Forgetting_Sarick_Mortshall/Transcript); [E-S5E9](https://rickandmorty.fandom.com/wiki/Forgetting_Sarick_Mortshall); [E-S9E2](https://rickandmorty.fandom.com/wiki/Ricks_Days,_Seven_Nights) | Med–High |
| A2.6 | A **moving object can enter a static portal**: Rick's car drives into a ground portal. | VIS-T + VIS-S (car falling into a ground portal) | S3E2 | T-S3E2; [F-car](https://static.wikia.nocookie.net/rickandmorty/images/a/a6/S3e2_car_wreck.png) | High |
| A2.7 | A **portal attached to a moving object** (a portal that travels with a vehicle) | Not found | n/a | n/a | **UNVERIFIED** |
| A2.8 | **Opening a portal across a body bisects it.** | VIS-T S2E2: "A portal forms through the guard, bisecting him down the middle, and Rick walks out of it." | S2E2 | T-S2E2 | Med–High (one depiction) |

### A3. Pairing, destination selection and reach

| # | Claim | Evidence | Episode(s) | Source | Conf. |
|---|---|---|---|---|---|
| A3.1 | **One trigger pull gives a usable pair.** The user never places the exit with a separate shot, unlike the *Portal* video game. | VIS-T (S2E5 floor-to-ceiling, quoted in A2.3); every depicted trip | many | T-S2E5 | Med–High (consistent depiction, never stated) |
| A3.2 | The **far end can be placed precisely at a remote location** with no line of sight. For example, Rick, from the other side, drops water on guards and then drains them through a floor portal. | VIS-T S2E2: "A portal appears directly above the guards and water pours out of it. Another portal appears on the floor…"; VIS-S frame of the floor portal draining water | S2E2 | T-S2E2; [F-drain](https://static.wikia.nocookie.net/rickandmorty/images/d/d5/S2e2_smart_portal_use.png) | Med–High. **Mechanism never explained** |
| A3.3 | **Selection interface on the gun:** a black dial/knob plus a top display. Rick "hits a couple buttons" before a floor-to-ceiling trip. How the dial maps to destinations is **never shown**. | VIS-S (gun frames); VIS-T S2E5 | S1E1 on; S2E5 | F-gun frames; T-S2E5 | Med |
| A3.4 | The gun **logs where it has been**, and the log can be scanned or used to navigate. | DLG S1E10: "Scan his Portal Gun!" / "Don't look at another man's Portal Gun history. We-we all go to weird places." Council: "you alone have been going to the exact timelines and locations…". DLG S2E5, Birdperson: "I believe I can access the history of Rick's gun and help you get back to him." VIS-S: the history shown as a big holographic chart. | S1E10, S2E5 | T-S1E10; T-S2E5; [F-history](https://static.wikia.nocookie.net/rickandmorty/images/3/3d/S1e10_ricks_portal_gun_history.png) | High |
| A3.5 | **Destinations can be pre-set or locked by someone else (a trap).** | DLG S3E7 (Rick J-22): "A portal to the Blender Dimension?! That's the oldest trick in the book!" DLG S5E10: "did you refill this gun?" VIS-T S5E10: "the coordinates were locked to the Blender Dimension." | S3E7, S5E10 | [T-S3E7](https://rickandmorty.fandom.com/wiki/The_Ricklantis_Mixup/Transcript); [T-S5E10](https://rickandmorty.fandom.com/wiki/Rickmurai_Jack/Transcript) | High |
| A3.6 | **Fixed installations use typed coordinates or buttons and dials.** | DLG S1E1: "I need to type in the coordinates to our home world, Morty." DLG S3E1: the Citadel area is "for teleporting the entire Citadel to somewhere else using only buttons and dials." | S1E1, S3E1 | T-S1E1; [T-S3E1](https://rickandmorty.fandom.com/wiki/The_Rickshank_Rickdemption/Transcript) | High |
| A3.7 | **Voice or telepathic control** | Not depicted. "Telepathically controlled" is WIKI-I. | n/a | Portal Gun page | **UNVERIFIED** |
| A3.8 | **Reach: places on the same planet, other planets, other dimensions.** | DLG S1E1: "I got an errand to run in a whole different dimension." Plus many trips: to the White House (S3E10); to and from Unity's planet (S2E3); to Nibblenug (S5E7); to Beloi 6E (S9E2) | many | T-S1E1, T-S2E3, T-S3E10, T-S5E7, E-S9E2 | High |
| A3.9 | **Reality chosen by its properties.** Examples: a reality where they had both died "around this time" (S1E6), one where Daylight Saving was never invented (S3E9), one where Tony's wife is alive (S4E2). **How this is searched is never shown.** | DLG S1E6: "I just had to find one of those realities in which we also happen to both die around this time." DLG S3E9: "Arnaldo's isn't closed in the dimension where they didn't invent Daylight Savings!" WIKI-P S4E2 | S1E6, S3E9, S4E2 | [T-S1E6](https://rickandmorty.fandom.com/wiki/Rick_Potion_No._9/Transcript); [T-S3E9](https://rickandmorty.fandom.com/wiki/The_ABC's_of_Beth/Transcript); E-S4E2 | High (depiction); mechanism UNVERIFIED |
| A3.10 | **Time travel: never shown with the portal gun. Rick explicitly denies it.** | DLG S3E9: "By the way, that wasn't time travel." DLG S4E8: "I don't do time travel." / "I don't respect time travel." DLG S7E10 (inside the "Fear Hole"; speaker unlabeled): "Oh, Dad never touches time travel." The only "anytime" line is Rick Prime's sales pitch in S3E1: "Imagine going anywhere, anytime, with nobody able to stop you." | S3E9, S4E8, S7E10, S3E1 | T-S3E9; [T-S4E8](https://rickandmorty.fandom.com/wiki/The_Vat_of_Acid_Episode/Transcript); T-S7E10; T-S3E1 | High that it is not depicted. Whether the hardware *could* is **not established** |
| A3.11 | **Pilot time anomaly.** Rick says he "spent so much time" in a "future dimension" that the gun lost its charge, but he was away from Morty for only "a few seconds" (stage direction). This is **never explained**. | DLG + VIS-T | S1E1 | T-S1E1 | High (that the anomaly exists) |
| A3.12 | **Central Finite Curve:** "They built a wall around Infinity…" (Evil Morty). Breaking out took the Citadel's dimensional drive. Afterwards Evil Morty uses a gold gun. The idea that **ordinary guns can only reach dimensions inside the Curve is implied, not stated.** | DLG S5E10, S1E10 ("Of all the Ricks in the Central Finite Curve…"); VIS-T S5E10 | S1E10, S5E10, S7E5 | T-S5E10; [CFC page](https://rickandmorty.fandom.com/wiki/Central_Finite_Curve) | Med (implied) |
| A3.13 | **Untrained users** hop more or less at random. Jerry doesn't know how to use the gun. | VIS-T S2E5: "Morty steps through different portals to different worlds, ending up in Buttworld". WIKI-P S8E8 | S2E5, S8E8 | T-S2E5; [E-S8E8](https://rickandmorty.fandom.com/wiki/Nomortland) | Med |

### A4. Persistence, closure and severing

| # | Claim | Evidence | Episode(s) | Source | Conf. |
|---|---|---|---|---|---|
| A4.1 | **Portals close shortly after use.** No duration and no closing rule (automatic, timed or manual) is ever stated. | VIS-T S1E10: "the portal disappears". VIS-T S2E5: "Rick tries to grab him, but the portal closes". VIS-T S3E7: "exits through the portal, which disappears". VIS-T S5E10: "the portal closes behind him". DLG S7E1: "Your portal closed." DLG S7E5: "I took a heroic step toward the portal, but then it closed." | S1E10, S2E5, S3E7, S5E10, S7E1, S7E5 | T-S2E5; [T-S7E5](https://rickandmorty.fandom.com/wiki/Unmortricken/Transcript); T-S7E1 | High (they close); timing rule **UNVERIFIED** |
| A4.2 | Portals stay open long enough for **pursuers to follow** (seconds). | VIS-T S1E10 chase ("The Ricks and Mortys chasing them follow") | S1E10 | T-S1E10 | Med |
| A4.3 | **Persistent and fixed portals exist:** the Citadel's garbage "Wishing Portal", the Federation customs gate, and Rick's flask fed by a vodka silo through a portal. | VIS-S / VIS-T S3E7; S1E1; JRN S9E4 recap (search snippet) | S1E1, S3E7, S9E4 | T-S3E7; E-S9E4; J-tvobs-S9E4 | Med |
| A4.4 | **Partial insertion works while a portal is open.** An arm with a pistol is pushed through to shoot. An arm reaches through from the far side to grab Morty. | VIS-T S1E5: "Rick makes another portal back and sticks an energy pistol through it". VIS-T S3E6: "Rick's arm shoots through the portal and grabs Morty" | S1E5, S3E6 | [T-S1E5](https://rickandmorty.fandom.com/wiki/Meeseeks_and_Destroy/Transcript); T-S3E6 | High |
| A4.5 | **A portal closing on a straddling body severs it.** Rick sticks his head back out to argue, the portal closes, and his head is cut from his body. | WIKI-P: "The gate then closed, severing the upper and lower parts of Rick's head." JRN: "the portal closes on his head, violently separating it from his body" (FandomWire, 2026-06-28). JRN: "what happens if you don't pull your head out from a portal opening before it closes" (Bleeding Cool, 2026-06-28). JRN: "a misclick causes the portal to shut down, slicing Rick's neck" (Cinemaholic). | **S9E6 *Erickerhead*** (aired 2026-06-28) | [E-S9E6](https://rickandmorty.fandom.com/wiki/Erickerhead); [J-bc](https://bleedingcool.com/tv/rick-and-morty-s09e06-thoughts-ricks-not-so-sound-mind-and-body/); [J-fw](https://fandomwire.com/rick-and-morty-season-9-episode-6-recap/); [J-cin](https://thecinemaholic.com/rick-and-morty-season-9-episode-6-recap/) | **High** (four sources agree on the severing) |
| A4.6 | What happened to the **gun** in the S9E6 accident | Sources **conflict**. Wiki: the Portal Gun "had also been severed by the gate". Cinemaholic: slicing Rick's neck "and the remote with it". FandomWire: "The portal gun got fried". | S9E6 | as above | Low (conflict) |
| A4.7 | **What caused the S9E6 closure** | Cinemaholic only: "a misclick". This suggests closure is manual or user-triggered. | S9E6 | J-cin | Low (single source) |
| A4.8 | **S9E6 end tag:** Rick pokes his head out of a portal again. | Sources **conflict**. FandomWire: the portal "stops just short of cutting Rick's head off before fluctuating in size". Bleeding Cool: Rick "shows he fixed it". Wiki: he "was messing with him". | S9E6 | as above | Low |
| A4.9 | **Earlier straddling case:** a car stuck half-way through. The front hangs from the garage ceiling while "the back gets stuck in the other universe". Whether the car was then cut is **not described**. | VIS-T + VIS-S | S3E2 | T-S3E2 | Med (straddle); severing UNVERIFIED |
| A4.10 | **Collapse and severing with other portal tech (not Rick's gun):** a burlap-sack portal "tears and collapses in on itself" (S8E8). Sober Rick's flawed home-made portal explodes and bisects Good Summer (S9E10). Morty drops his severed hand, which carries a palm portal, into Nick's linked thigh portal, "creating a singularity that destroys him" (S5E9). | WIKI-P (all three) | S5E9, S8E8, S9E10 | E-S5E9, E-S8E8, [E-S9E10](https://rickandmorty.fandom.com/wiki/Field_of_Dreams) | Med |

### A5. Traversal physics

| # | Claim | Evidence | Episode(s) | Source | Conf. |
|---|---|---|---|---|---|
| A5.1 | **Destination gravity takes over at the exit.** Exits are often above the floor, and travellers fall or "land". | VIS-T Pilot: they "land on the table where Jessica and her friends are eating". VIS-T S1E10: they "fall through a portal onto a large butt mountain. They bounce off". Also S2E5, S3E2 ("fall out of a portal into the garage"), S3E6, S6E10 (WIKI-P "They fall through and land next to … Rick") | S1E1, S1E10, S2E5, S3E2, S3E6, S6E10 | T-S1E1; T-S1E10; [T-S3E2](https://rickandmorty.fandom.com/wiki/Rickmancing_the_Stone/Transcript); [E-S6E10](https://rickandmorty.fandom.com/wiki/Ricktional_Mortpoon's_Rickmas_Mortcation) | High (as depicted) |
| A5.2 | **Momentum and orientation:** the show **never states a rule**. The depictions are not consistent with strict momentum conservation. A car driving into a ground portal ends up hanging from a ceiling exit (S3E2). People being sucked toward a vacuum fall through and simply "land" (S6E10). | VIS-T / WIKI-P | S3E2, S6E10 | T-S3E2; E-S6E10 | Low (as a rule) |
| A5.3 | **Liquids pass through.** Water pours out of an overhead portal and drains into a floor portal. Blood "geysers" back out of the Blender-Dimension portal. | VIS-T + VIS-S (S2E2); VIS-T S3E7: "instantly blended with a geyser of blood"; VIS-T S5E10: "blood spurts out the portal" | S2E2, S3E7, S5E10 | T-S2E2; T-S3E7; T-S5E10 | High |
| A5.4 | **Gas:** the only explicit line is "He's gaseous. He's not gonna make it through a portal, Morty." It is about a gaseous *being* (Fart). Air flow through portals is **never addressed**. Fire and flamethrower blasts do come out of portals (S1E10 "set on fire"; S5E10 "incinerated by a flamethrower on the other end"), which sits in tension with any blanket "no gas" rule. | DLG S2E2; VIS-T S1E10, S5E10 | S2E2 (+S1E10, S5E10) | T-S2E2 | Med (for the line); Low (as a general rule) |
| A5.5 | **Two-way traffic while a portal is open.** Tentacles from the far side drag Ricks in. An arm reaches back through. Blood and flames come back out. | VIS-T S1E10: "dragged into the portals by tentacles". VIS-T S3E6; VIS-T S5E10 | S1E10, S3E6, S5E10 | T-S1E10; T-S3E6; T-S5E10 | High |
| A5.6 | **Atmosphere or pressure differences** between the two ends | Not addressed in any source found | n/a | n/a | **UNVERIFIED** |
| A5.7 | **Transit is effectively instantaneous** for the green portals. The wiki's claim that the S3E1 prototype apple test shows a delay and no momentum conservation is not in the transcript. | Depiction only; wiki claim is WIKI-I | S3E1 | [Portal Technology page](https://rickandmorty.fandom.com/wiki/Portal_Technology) | Med (instant); apple claim UNVERIFIED |

### A6. Power and consumables

| # | Claim | Evidence | Episode(s) | Source | Conf. |
|---|---|---|---|---|---|
| A6.1 | **Finite "charge" (Seasons 1–2 wording).** | DLG S1E1: "my interdimensional portal device it's got no charge left, Morty." DLG S2E5: "There's only so much charge left in this thing." and "…we're not gonna have enough charge left to get off-world." | S1E1, S2E5 | T-S1E1; T-S2E5 | High (that it is said) |
| A6.2 | **The S2E5 charge claim is undercut in the same scene.** Rick immediately portals out for snacks, and Morty says: "You lied! You lied about the charge! You were just being lazy!" | DLG + VIS-T | S2E5 | T-S2E5 | High (that it is contested) |
| A6.3 | **When the gun runs out, Rick and Morty are stranded** and have to use the Federation's "interdimensional customs" portal to get home. | DLG S1E1: "We're gonna have to go through interdimensional customs" | S1E1 | T-S1E1 | High |
| A6.4 | **Portal fluid is a consumable held in the top vial** (Season 3 onward). Rick marks the fluid level so he can tell whether Morty used the gun. It can run dry, be bought or traded, and be refilled. | DLG S3E7: "with enough fluid to take me off this goddamn prison!" DLG S5E9: "I saw you were marking the levels so I had to top it off." VIS-T S5E10: "There's no more fluid left in it." WIKI-P S8E3: "a tube of portal fluid as a fee". WIKI-P S9E2: "used up all the fluid for his Portal Gun". DLG S5E10: "did you refill this gun?" | S3E7, S5E9, S5E10, S8E3, S9E2 | T-S3E7; T-S5E9; T-S5E10; [E-S8E3](https://rickandmorty.fandom.com/wiki/The_Rick,_The_Mort_%26_The_Ugly); E-S9E2 | High |
| A6.5 | **Name and hazards.** Rick calls it "quantum transport solution". It is "dangerously toxic". Contact can teleport flesh. | DLG S5E9: "Is that Mountain Dew in my quantum transport solution?" / "Do you know how dangerously toxic this stuff is?" / "I don't want to teleport my lips." | S5E9 | T-S5E9 | High |
| A6.6 | **Contamination detection.** Morty tops the fluid up with Mountain Dew. A frame shows the gun's red top display reading **"WEIRD FLUID DETECTED"**. The wiki plot says the gun "seems to accept" the mixture anyway. | DLG S5E9; VIS-S (frame filed under "S5e9 images"); WIKI-P | S5E9 | [F-LED](https://static.wikia.nocookie.net/rickandmorty/images/e/ef/The_topside_LED_display..png); E-S5E9 | Med–High. The **audible alarm** in the wiki is UNVERIFIED |
| A6.7 | **Manufacturing.** "Portal Fluid Mines" under the Citadel: Rick guards oversee production, deformed Mortys work the mines, and all fluid is drained into one vat. Rick: "Hopefully we can snag some untainted fluid at the source". Large amounts burst out as waves "sweeping away everything in its path". | VIS-T + DLG | S5E10 | T-S5E10 | Med–High |
| A6.8 | **Bootleg fluid.** Wrongly made fluid is lethal: the user disintegrates on contact with his own portal. | DLG S3E7: "Bootleg portal fluid." / "Guess his math was off." VIS-T + VIS-S (green disintegration beside a portal) | S3E7 | T-S3E7; [F-bootleg](https://static.wikia.nocookie.net/rickandmorty/images/1/17/S3e7_bad_portal.png) | High |
| A6.9 | **Raw material: crystals (implied).** Someone was "skimming your crystal harvest and sending it to a spaceman named Rick Sanchez." Morty and Nick go there wanting "portal fluid". The wiki calls the place "Rick's portal fluid supplier". The **crystal-to-fluid link is implied, not stated**. "Rick buys illegally" is wiki wording; the dialogue says "Rick's been ripping these guys off for years". | DLG S5E9; WIKI-P | S5E9 | T-S5E9; E-S5E9 | Med (implied) |
| A6.10 | **The fluid reset draws heavy power**: "the portal gun draws all power in the house" during Rick's "hard reset on the fluid". | VIS-T + DLG | S6E1 | [T-S6E1](https://rickandmorty.fandom.com/wiki/Solaricks/Transcript) | Med |
| A6.11 | **Other fluids exist.** Rick Prime's black "goo" trap. Rick and Evil Morty escape using "The goo from the trap!". Evil Morty's gun has a gold vial and makes gold portals. | DLG S7E5 (speaker unlabeled); VIS-S | S5E10, S7E5 | T-S7E5; frames | Med |
| A6.12 | **Fluid as an attack vector.** Evil Morty "hacked the entire city's portal supply". Tainted fluid sends Citadel guns to deadly destinations. | DLG S5E10; VIS-T S5E10 | S5E10 | T-S5E10 | High |
| A6.13 | **Fluid quantity per trip**, plus any battery, recharge rate or capacity | Not stated anywhere | n/a | n/a | **UNVERIFIED** |

### A7. Control, security, safety and authorities

| # | Claim | Evidence | Episode(s) | Source | Conf. |
|---|---|---|---|---|---|
| A7.1 | **Remote hacking and signal tracing** | DLG S1E10: "My portal gun was hacked remotely Morty, obviously by the real killer to frame me. But I was able to trace the signal." DLG S5E10: "I only know one man that ever hacked my portal gun, and it turned out it was evil you." | S1E10, S5E10 | T-S1E10; T-S5E10 | High |
| A7.2 | **The Citadel detects a destroyed or compromised gun.** In S3E1 Jerry Prime smashes the C-131 Rick's gun and Citadel guards turn up. | DLG S3E1: "We detected a compromised Portal Gun. Where is your Rick?" | S3E1 | T-S3E1 | High. The wiki's claim that this is "opt-in" is WIKI-I |
| A7.3 | **Registration and traceability (Citadel)** | DLG S3E1 (charge): "Operating an unregistered portal gun". DLG S3E7: "I want a portal gun. Unregistered, untraceable, with enough fluid…" | S3E1, S3E7 | T-S3E1; T-S3E7 | High (that the concepts exist) |
| A7.4 | **The Federation regards the gun as contraband and wants its secret.** It extracted Rick's "portal gun formula" with a Brainalyzer, but Rick fed it a virus instead. | DLG S3E1: "Relinquish the illegal technology to the nearest Federation representative." DLG S3E1: "I'd like very much to visit the memory of you inventing your portal gun." DLG S4E10: "Secret to interdimensional travel? Ask your bosses." | S3E1, S4E10 | T-S3E1; [T-S4E10](https://rickandmorty.fandom.com/wiki/Star_Mort_Rickturn_of_the_Jerri/Transcript) | High |
| A7.5 | **Federation tracking of portal-gun travel** | Not found. The Council of Ricks did track C-137 to a restaurant in S1E10 ("we've tracked a pair of dangerous criminals"), but the method is not stated. | n/a | T-S1E10 | **UNVERIFIED** |
| A7.6 | **Booby-trap / self-destruct.** Rick flips a switch under a small hinged cover on the gun and slides it to the agents. A large green spherical vortex pulls agents in, and Tammy is temporarily deafened. The wiki's wording ("implode", "button in the handle") is its own. | VIS-S (frames: "rick sneakily turns switch", "rick slides it over", "portal trap", "sound deaf"); WIKI-P ("wires it to kill several Galactic Federation officers and explode") | S2E10 | [G-S2E10](https://rickandmorty.fandom.com/wiki/The_Wedding_Squanchers/Gallery); [F-switch](https://static.wikia.nocookie.net/rickandmorty/images/b/bb/S2e10_rick_sneakily_turns_switch.png); [F-trap](https://static.wikia.nocookie.net/rickandmorty/images/7/71/S2e10_portal_trap.png) | High (visual). The fan transcript omits the scene |
| A7.7 | **Anti-portal countermeasures exist:** a US military "anti-portal shimmer" (whether it works is not shown), a "Subether barrier" floated as an explanation, and Rick Prime's trap that collapses or disables portals. | DLG S5E6: "you are under arrest and surrounded by an anti- portal shimmer!" DLG S7E5 (speaker unlabeled): "Subether barrier blocking the portal fluid?" / "Can't be that. Mine would get through it." WIKI-P S7E5 | S5E6, S7E5 | [T-S5E6](https://rickandmorty.fandom.com/wiki/Rick_%26_Morty's_Thanksploitation_Spectacular/Transcript); T-S7E5; [E-S7E5](https://rickandmorty.fandom.com/wiki/Unmortricken); [Evil Morty's Portal Gun page](https://rickandmorty.fandom.com/wiki/Evil_Morty's_Portal_Gun) (WIKI-P: Prime's black fluid "collapse[d] Evil Morty's portal"; afterwards both guns would not work) | Med |
| A7.8 | **No user lock or authentication is depicted.** Morty, Summer, Birdperson, Nick, Mr. Poopybutthole and "Ted" all operate or tinker with a gun. | VIS-T / DLG / WIKI-P | S2E5, S3E1, S3E10, S5E9, S7E10, S9E2 | various | High (depiction) |
| A7.9 | **System-wide outage and the "Portal Index".** "Portal travel's broken." Rick: "They need to reboot the Portal Index immediately." What the Index is, and who "they" are, is **never explained**. Rick fixes portal travel in S6E6 ("I fixed portal travel."). | DLG S6E1, S6E3 ("don't hop through a portal. But, oh, wait, you can't."), S6E6 | S6E1–S6E6 | T-S6E1; [T-S6E3](https://rickandmorty.fandom.com/wiki/Bethic_Twinstinct/Transcript); T-S6E6 | High |
| A7.10 | **The reset sends every portal traveller back to their reality of origin.** This implies the system "knows" each traveller's origin (my inference). Citadel-born clones were returned to the Citadel's remains. | DLG S6E1: "Instead of resetting portal travel, I may have reset portal travellers." / "everyone from this reality returning to their reality of origin." DLG S8E3: "That portal reset sucked 'em all back." | S6E1, S8E3 | T-S6E1; T-S8E3 | High (the stated effect); implication = inference |
| A7.11 | **Fragility and physical failure.** Destroyed in a fight and field-repaired ("repair a p-portal gun with a bunch of sex-doll parts", S1E7). Smashed, with the vial cracked and green fluid spilled (S3E1 frame). Broken by a Space Christian (S8E4). Left in a bathroom, which strands Rick (S3E4). | DLG / VIS-S / WIKI-P | S1E7, S3E1, S3E4, S8E4 | [T-S1E7](https://rickandmorty.fandom.com/wiki/Raising_Gazorpazorp/Transcript); [F-wrecked](https://static.wikia.nocookie.net/rickandmorty/images/e/e5/S3e1_portal_gun_wrecked.png); [E-S8E4](https://rickandmorty.fandom.com/wiki/The_Last_Temptation_of_Jerry) | High |
| A7.12 | **Destinations are hazardous because the portal is opaque.** Hacked Citadel guns open onto blenders, flamethrowers and tentacles. | VIS-T S5E10 | S5E10 | T-S5E10 | High |
| A7.13 | **Theft and copying of the technology.** The Federation tries to extract the "Portal Gun formula" from Rick's brain; Rick uploads a virus instead (S3E1). Evil Morty takes "schematics for the Citadel's dimensional drive" from Rick's scanned brain (S5E10). The gun itself is taken by Morty (S2E5, S3E10), Nick with Morty (an empty prototype, S5E9) and Mr. Poopybutthole (S7E10 tag). Ted's friends steal much of Rick's tech (S9E2). Sober Rick tries to build one from blueprints and fails dangerously (S9E10). Prime: only two Ricks "actually invented portal travel" (S7E5), which implies the rest got it second-hand. | DLG S3E1: "wasn't actually my Portal Gun formula, it was a virus". DLG S5E10, S7E5; VIS-T; WIKI-P | S3E1, S5E9, S5E10, S7E5, S7E10, S9E2, S9E10 | T-S3E1; T-S5E10; T-S7E5; E-S5E9; E-S7E10; E-S9E2; E-S9E10 | High (the depictions) |

### A8. The device's physical form

| # | Claim | Evidence | Episode(s) | Source | Conf. |
|---|---|---|---|---|---|
| A8.1 | **Handheld with a pistol grip; pocketable.** In S1E10 a Council Rick "reaches into C-137's lab coat and retrieves his portal gun". | VIS-T + VIS-S | S1E10 and throughout | T-S1E10 | High |
| A8.2 | **Layout:** boxy grey/white body; a black round dial/knob on the side near the grip; a red rectangular display on top; a glass cylinder or dome on top holding glowing green swirling content; **three round green emitters on the front face**. | VIS-S ([F-gun](https://static.wikia.nocookie.net/rickandmorty/images/5/55/Portal_gun.png), [F-gunny](https://static.wikia.nocookie.net/rickandmorty/images/5/57/Portalgunny.png), S1E10 frame) | throughout | frames | High |
| A8.3 | **The top display can show text**, for example "WEIRD FLUID DETECTED". | VIS-S | S5E9 | F-LED | Med–High |
| A8.4 | **A hidden switch/button under a small flip cover** (used to arm the booby-trap) | VIS-S | S2E10 | F-switch | High |
| A8.5 | **A red display on the underside** appears in early episodes and is absent in some frames. Its function is unknown. | VIS-S ([F-bottom](https://static.wikia.nocookie.net/rickandmorty/images/6/6b/Bottom_of_gun.png)) + WIKI-I | S1–S2 | Portal Gun page | Med |
| A8.6 | **Interfaces:** can be "scanned" by the Council (A3.4) and plugged into a lever rig for the fluid reset (S6E1). The wiki's claim that it "interfaces with computers via the muzzle" is UNVERIFIED. | DLG / VIS-T | S1E10, S6E1 | T-S1E10, T-S6E1 | Med |
| A8.7 | **Variants and backups.** A bulky prototype with wires and a vial (S3E1 memory; a boxed "prototype" in S5E9, "the equivalent of an iPhone 3 and it's empty"). A cabinet of many backup guns (S7E9 frame). Evil Morty's gold-plated gun with a gold vial. Portal Gun Jr., a toy-like child's version (S9E10); the frame shows a round red button and two round lights on its front, and the face-like reading is my own. The wiki's guess that Portal Gun Jr. has "a limited number of uses" is speculation. | VIS-S / DLG / WIKI-P | S3E1, S5E9, S5E10, S7E9, S9E10 | [F-proto](https://static.wikia.nocookie.net/rickandmorty/images/e/e3/S3e1_portal_gun_1.0.png); [F-backups](https://static.wikia.nocookie.net/rickandmorty/images/c/c4/Mort_Ragnarick_portal_guns.png); [F-jr](https://static.wikia.nocookie.net/rickandmorty/images/8/80/PortalgunJrFron.png); [Portal Gun Jr. page](https://rickandmorty.fandom.com/wiki/Portal_Gun_Jr.) | High (shapes); Jr. limits UNVERIFIED |

### A9. Explicit "rules" or statements in dialogue (verbatim, chronological)

All are DLG from wiki fan transcripts (see section G).
- S1E1: "my interdimensional portal device it's got no charge left, Morty." / "It's as good as garbage, Morty."
- S1E1: "I need to type in the coordinates to our home world, Morty." (customs portal computer)
- S1E6: "There's an infinite number of realities, Morty" / "It's not like we can do this every week, anyways. We get three or four more of these, tops." (The limit on replacing themselves is **unexplained**.)
- S1E10: "Don't look at another man's Portal Gun history. We-we all go to weird places."
- S1E10: "My portal gun was hacked remotely Morty… But I was able to trace the signal."
- S2E2: "He's gaseous. He's not gonna make it through a portal, Morty."
- S2E5: "There's only so much charge left in this thing." / Morty: "You lied about the charge!"
- S3E1 (Rick Prime): "the first thing you learn is, you're the last guy to invent teleportation."
- S3E1: "We detected a compromised Portal Gun." / "Operating an unregistered portal gun"
- S3E1: "…for teleporting the entire Citadel to somewhere else using only buttons and dials."
- S3E1: "That's the three lines of math that separates my life as a man from my life as an unfeeling ghost." (Said inside a memory Rick calls fabricated. The S5E10 flashback shows Rick finished the gun later, so treat this as **unreliable**.)
- S3E7: "Unregistered, untraceable, with enough fluid to take me off this goddamn prison!" / "Guess his math was off."
- S3E9: "By the way, that wasn't time travel."
- S3E10: "your ghetto-ass off-brand deficit-tripling teleporter" (the US government's gate)
- S4E8: "I don't do time travel." / "I don't respect time travel."
- S5E9: "quantum transport solution" / "how dangerously toxic this stuff is" / "I don't want to teleport my lips."
- S5E10: "He hacked the entire city's portal supply." / "snag some untainted fluid at the source"
- S5E10 (Evil Morty): "They built a wall around Infinity" … "where he's the smartest man in the universe."
- S6E1: "Portal travel's broken." / "reboot the Portal Index immediately." / "a hard reset on the fluid."
- S6E6 (dinosaur): "We used portal travel eons ago" / "your gateway device is suboptimal" / "see-through, not a green swirl".
- S7E5 (Rick Prime): "The only two Ricks who actually invented portal travel."

### A10. Other portal and teleport technology in the show

| Device / phenomenon | What is shown | Episode(s) | Evidence | Conf. |
|---|---|---|---|---|
| Federation "interdimensional customs" gate | A fixed gate: a blue swirl inside a large mechanical ring frame. Coordinates are typed into a "portal computer". Rick uses it to reach home and exits in the school cafeteria. | S1E1 | DLG; VIS-S ([F-customs](https://static.wikia.nocookie.net/rickandmorty/images/1/14/S1e1_blue_transport.png)) | High |
| Citadel teleport room / "dimensional drive" | Teleports the whole Citadel ("buttons and dials"). In S5E10 it is overcharged to breach the Central Finite Curve. | S3E1, S5E10 | DLG / VIS-T | High |
| Citadel garbage portal ("Wishing Portal") | A large horizontal green pool; garbage is dumped in. | S3E7 | VIS-S / VIS-T / DLG ("Garbage dump. Stand *burp* back.") | High |
| US government teleporter | A framed blue rectangular gate. The military has to set it up at the destination first (wiki). | S3E10 | DLG; VIS-S ([F-usgov](https://static.wikia.nocookie.net/rickandmorty/images/5/56/US_gov_teleporter.png)); WIKI-I | High / Med |
| Federation military portals | Morty: "reprogram their military portals". A purple diamond portal generated by four ships appears in Birdperson's memory. | S3E1, S5E8 | DLG; VIS-S ([F-purple](https://static.wikia.nocookie.net/rickandmorty/images/e/ed/Blood_ridge_portal.png)) | High |
| Dinosaurs' "Portal Pistol" | See-through portals with a pink rim; worked while green portal travel was broken. Rick destroys it. | S6E6 | DLG; VIS-S ([F-clear](https://static.wikia.nocookie.net/rickandmorty/images/c/c1/Clearportal.png)) | High |
| Evil Morty's gold gun | Gold portals. Used after the Curve breach (S5E10), against Rick Prime (S7E5) and to reach Rick (S9E1). | S5E10, S7E5, S9E1 | VIS-S / WIKI-P | High |
| Rick Prime's black-fluid trap | A tentacled black goo that pulls Ricks into a closed "prison" universe. Its fluid was later used to track Prime. | S7E5 | WIKI-P; VIS-S | Med |
| Summer's "one-way blind-hop reset map beacon" and the Rift | Used to recover travellers after the S6E1 reset; Rick flies the cruiser through the Rift without coordinates. | S6E1 | DLG / VIS-T | High |
| Natural wormholes | Fart's wormhole (S2E2). A burlap-sack portal network and "Grand Central" used by Jerrys (S8E8). | S2E2, S8E8 | DLG / WIKI-P | Med |
| House-teleporting contraption | Teleports the whole house to a planet. | S1E11 | WIKI-P | Med |
| Portal-fed flask; "landline portal" | A flask filled through a portal from a vodka silo. Morty and Reese take a "landline portal". | S9E4 | JRN recaps (search snippets only); wiki cites Polygon | Low–Med |
| Sober Rick's home-built gun | Built from blueprints Morty brings. Repeated failures: a cat comes back inside-out, the portal goes "haywire", and a person is bisected. | S9E10 | WIKI-P | Med |
| Save-point device (not a portal) | "isolating a moment in time, splitting your probable selves" uses "time crystals". Rick says it is not time travel. | S4E8 | DLG | High |
| Magic portals (Draygon wizards) | Rick: "Who writes on a portal?" | S4E4 | DLG | Med |
| Interdimensional cable box | Receives TV from other realities only. A portal to one of those worlds is opened in the S1E8 tag. | S1E8 | WIKI-P | Med |

---

## B. FAN / WIKI INTERPRETATION versus what the show establishes

| Popular "rule" or claim | Where it comes from | What the show actually supports | Status |
|---|---|---|---|
| "The portal gun can't time travel." | Fan consensus; Time travel wiki page | Rick *chooses* not to time-travel and denies a trip was time travel (S3E9, S4E8). No hardware limit is ever stated. The S3E1 pitch mentions "anytime". | **Not established as a device limit** |
| "Only mass heavier than air can pass; gases can't." | Portal Gun page (WIKI-I) | One line about a gaseous being (S2E2). Air flow is never shown. Fire comes out of portals (S1E10, S5E10). | **Over-generalised; not established** |
| "Speed/momentum is not conserved, so portals break falls." | Portal Gun page (WIKI-I) | The show states no rule. Some depictions fit this (S3E2, S6E10), but they are comedic and inconsistent. | **Not established** |
| "Portals are two-way until they collapse." | Portal Gun page | Shown repeatedly (A5.5). | **Supported (visual)** |
| "Portals are opaque." | Portal Gun page | S6E6 dialogue contrast. | **Supported** |
| "A portal opening inside an object cuts it." | Portal Gun page | S2E2 bisection (VIS-T). | **Supported (single depiction)** |
| "A closing portal severs whatever straddles it." | Fan expectation | Explicit only in S9E6 (2026). Before that, no case of Rick's gun was clearly shown. | **Supported as of S9E6** |
| "Green = interdimensional, blue = interspatial, gold = outside the Curve." | Portal Technology page taxonomy | The colours are depicted, but no dialogue assigns these meanings. The wiki itself calls the scheme "not fully consistent". | **Wiki taxonomy, not canon** |
| "Portal guns only reach universes inside the Central Finite Curve." | CFC page | Implied by the S5E10 breach and gold gun; never stated as a gun limit. | **Implied only** |
| "The gun is telepathically controlled." | Portal Gun page | No evidence. | **Speculation** |
| "Citadel location pings are opt-in." | Portal Gun page | S3E1 shows detection only. | **Speculation** |
| "Portal fluid is made from rare green crystals that Rick buys illegally." | Portal Gun / Portal Fluid pages | S5E9 implies crystals are linked to his supply ("crystal harvest"; "Rick's been ripping these guys off"). Not stated. | **Implied only** |
| "Mixing fluid with soda as acidic as Mountain Dew makes it create unstable portals on contact." | Portal Gun page | Nick's portal comes from an earlier spill of ordinary fluid. Soda is never shown to cause anything except the "WEIRD FLUID" warning. | **Not established** |
| "A portal passing through its own paired end implodes both." | Portal Gun / Portal Technology pages | One event (S5E9: severed hand into the linked thigh portal, then a "singularity"). The general rule is the wiki's own extrapolation. | **Single event; rule = interpretation** |
| "LED and audible warning for foreign fluid." | Portal Gun page | The LED text is supported (frame). No audible warning was found. | **Partly supported** |
| "Self-destruct via a hidden button in the handle that makes the gun implode." | Portal Gun page | The S2E10 frames show a flip-cover switch and a green vortex pulling agents in. The details "handle" and "implode" are the wiki's wording. | **Mostly supported** |
| "The Citadel's dimensional drive is 'the source' of portal fluid." | Citadel page | The "source" line is spoken in the **Portal Fluid Mines** scene (S5E10), so it plausibly refers to the mines, not the drive. | **Probable misreading** |
| "Fluid is a nucleic acid"; "fluid in bulk makes weak black holes"; "fluid cuts when free-flowing" | Portal Gun page | No support found. | **Speculation / UNVERIFIED** |
| "Drinking portal fluid opens a portal inside you." | Portal Gun page, citing *Rick and Morty's Rushed Licensed Adventure* | That is a **licensed Flash game**, not the show. | **Non-canonical** |
| "The gun beeps before it self-destructs." | Pilot page, describing a **deleted/unaired "Dinosaur Scene"** (DVD extra) | Not aired. | **Non-canonical** |
| "Rick's ship has portal capability." | Space Cruiser page ("Possible Portal Gun") | No support. | **Speculation** |
| "Portal Gun Jr. has limited uses (the balls show uses left)." | Portal Gun Jr. page | No support. | **Speculation** |
| "The Federation never had interdimensional tech." | Portal Technology / customs pages | Contradicted by the Pilot's "interdimensional customs". See section C. | **In-show contradiction** |
| "Rick Prime created the portal gun and gave it to other Ricks." | Portal Gun page, citing a THR video (Harmon) | On screen: Prime already had interdimensional travel and offered it to C-137, who refused (S3E1). Prime: "The only two Ricks who actually invented portal travel" (S7E5). The "gifted it to others" part and the interview are **UNVERIFIED** (video not viewable; see section E). | **Partly supported** |
| "Portal fluid is also called 'Quantum Portal Solution'." | Portal Gun page (one section) | The dialogue is "quantum transport solution" (S5E9). | **Wiki typo** |

---

## C. Source conflicts and continuity problems

1. **Charge versus fluid.** Seasons 1–2 talk about "charge" (S1E1, S2E5). From Season 3 on, the talk is of a consumable "fluid". The show never reconciles the two; the wiki simply merges them.
2. **The S2E5 "limited charge" claim is contested in the same episode.** Morty: "You lied about the charge!"
3. **Federation capability.** The Pilot shows Federation-run "interdimensional customs" with a coordinate-typed portal. S3E1 and S4E10 have the Federation seeking Rick's secret of interdimensional travel. The wiki's own customs page flags this. Fan explanations (for example, "different dimension's Federation", or "Rick modified the portal to green") are **UNVERIFIED**.
4. **The Pilot's time anomaly.** Rick says he spent a long time away, yet he is gone for seconds. Inverse (2019) treats this as a time-dilation plot hole. The wiki's Time travel page calls it time travel. Harmon: "We never messed with time travel after the pilot" (see section E).
5. **The S3E1 origin memory.** Rick calls it "totally fabricated" within S3E1. The wiki says S5E10 shows most of it was real, except that the gun was finished later. So any "three lines of math" claim is unreliable.
6. **The S5E9 contaminated fluid.** A frame shows "WEIRD FLUID DETECTED", while the wiki plot says the gun "seems to accept" the mix. These are probably compatible (it warns but still works); this is UNVERIFIED.
7. **The S9E6 portal gun.** Accounts differ: "severed" (wiki), "the remote" sliced (Cinemaholic), or "fried" (FandomWire). The end tag is also reported three ways (section A4.8).
8. **Unclear speakers.** Several transcripts lack speaker labels (S5E9, S6E6, S7E5, S7E10). For example, I could not confirm who says "Mine would get through it" in S7E5; the wiki attributes it to Evil Morty.
9. **Wiki inconsistency.** The Portal Gun page says both "Quantum Transport Solution" (correct) and "Quantum Portal Solution" (incorrect).

---

## D. Official and licensed portal-gun toys and replicas

| Item | What it does | Source | Conf. |
|---|---|---|---|
| **Funko "Rick and Morty Portal Gun"** (2017) | About 8 in long and 1 lb. Pulling the trigger emits "a variety of lights and noises". Three front plastic emitters, a red display, a black dial and a green "plasma orb" on top. Lets you "shoot" a green portal onto a surface (projection). 3×AAA batteries included. US$14.99. Released November 2017. | [ToyTales, Todd Coopee, 2017-10-11](https://toytales.ca/rick-morty-portal-gun-funko/); Nerdist post 2017-06-15 (mirror: [goodreads](https://www.goodreads.com/author_blog_posts/15292128-funko-is-warping-in-a-cosplay-ready-rick-and-morty-portal-gun)) | Med–High |
| Same Funko item, retailer description | "Multi-lens green LED lights that project a mini portal hologram", "authentic portal sound effects", "dimension C-137 display". Battery spec **conflicts** across listings (1×"A", 3×AAA, or 2×AA). | [desertcart listing](https://www.desertcart.co/products/52544578) (search snippet); Walmart listing blocked | Low–Med |
| Funko POP! keychain portal gun | A keychain collectible. No lights or sound mentioned. | Portal Gun wiki page, merchandise gallery | Med |
| Paladone portal gun light / lamp (2019) | A licensed USB-powered lamp with 6 lighting options; wall-mountable. | Search snippets only: paladone.com page 404; [License Global](https://www.licenseglobal.com/home/paladone-lights-rick-and-morty-lamp) returned 403 | Low |
| Fan-made projector prop (not official) | A 3D-printed housing with a projector showing an animated portal (Dave Dalton / Hammerspace). | [Make:](https://makezine.com/article/craft/rick-morty-cosplay-prop/) (search snippet) | Low |

**Engineering-relevant takeaway.** The licensed toys implement **lights, sound and (at most) a projected portal image**. Their visual language matches the show's layout: a green top vial, a red display, a black dial and three front emitters.

---

## E. Creator and writer interviews (how the gun "works" in-universe)

| Who / where | What was said (short quotes) | Bearing on mechanics | Conf. |
|---|---|---|---|
| Scott Marder (showrunner), ComicBook.com, Nick Valdez, 2022-11-20; repeated by SlashFilm, Rafael Motamayor, 2022-11-21 | "We wanted to feel like there were major ramifications from what Evil Morty did"; "we didn't want them to magically easily be fixed"; without portals the family lost their "get out of jail free card". | **Narrative reasons only.** No mechanics given. Confirms the S6 outage was a deliberate limiter. | High (fetched) — [ComicBook](https://comicbook.com/anime/news/rick-and-morty-season-6-multiverse-no-portals-explained-interview); [SlashFilm](https://slashfilm.com/1112149/why-rick-and-morty-got-cut-off-from-the-multiverse-in-season-6) |
| Dan Harmon, SDCC 2019 panel, via Inverse (Corey Plante, 2019-07-20) | "We never messed with time travel after the pilot, but we do in Season 4." Inverse describes a "long-standing rule" against time travel. | Supports "no time travel" as a **writers' policy**, not a device rule. Inverse's claim that the gun "probably" can go backward in time is **journalist speculation**. | High (quote), Low (speculation) — [Inverse](https://inverse.com/article/57887-rick-and-morty-season-4-time-travel-sdcc-san-diego-comic-con-panel) |
| Dan Harmon, The Hollywood Reporter video "Dan Harmon Plays 'Rick and Morty' Rapid Fire, Gives Movie Update" | The wiki cites it for "The Portal Gun was first created by Rick Prime". | I confirmed the video exists (title from YouTube oEmbed) but **could not view it**. | **UNVERIFIED** — https://www.youtube.com/watch?v=u3VmYGev5lA |
| Harmon & Roiland: "won't use time travel" | Time travel wiki page trivia (uncited); a DVD Talk interview appears in search results (site returned 403). | Consistent with the Inverse report. | Low (secondary) |
| Looper, Mae Harrington O'Neill, 2022-05-12 | The article says Rick has "remained reticent" about the portal gun and that how it works "doesn't seem to add up". | Journalist view: the mechanism is deliberately unexplained. | Med — [Looper](https://looper.com/862083/why-the-portal-gun-in-rick-and-morty-doesnt-make-any-sense) |
| "Inside the Episode" videos (Adult Swim) for S5E9 and others | Listed on wiki episode pages; not viewable here. | Unknown | **UNVERIFIED** |

**Bottom line.** I found **no creator statement that explains the gun's physics**. The available interviews treat it as a story device and describe the S6 outage and the time-travel avoidance as storytelling choices.

---

## F. Explicitly not found (treat as UNVERIFIED or open in the design report)

- Maximum projection range, or portal spawn distance from the muzzle.
- Edge-on appearance; whether a free-standing portal can be entered from both faces.
- Closing time or duration rules; whether closure is automatic, timed or user-commanded (one S9E6 recap says "misclick").
- Air or pressure exchange between ends; behaviour between ends with different gravity or atmospheres.
- Any portal attached to a moving object.
- Per-trip fluid consumption, vial capacity, or any battery or recharge behaviour.
- How the dial or "Portal Index" encodes destinations; voice control.
- Federation tracking of Rick's portal-gun trips (only Citadel registration and compromise detection are shown).
- Any on-screen statement of the gun's maximum portal size.

---

## G. Source key (all accessed 2026-10-19)

**Wiki reference pages** (MediaWiki API wikitext; `rev` = revision ID read)
- Portal Gun: https://rickandmorty.fandom.com/wiki/Portal_Gun (rev 125785)
- Portal Fluid: https://rickandmorty.fandom.com/wiki/Portal_Fluid (rev 126908)
- Portal Technology: https://rickandmorty.fandom.com/wiki/Portal_Technology (rev 125855)
- Central Finite Curve: https://rickandmorty.fandom.com/wiki/Central_Finite_Curve (rev 126311)
- The Citadel (redirect from "Citadel of Ricks"): https://rickandmorty.fandom.com/wiki/The_Citadel (rev 127006)
- Council of Ricks: https://rickandmorty.fandom.com/wiki/Council_of_Ricks (rev 116511)
- Galactic Federation: https://rickandmorty.fandom.com/wiki/Galactic_Federation (rev 114247)
- Bootleg Portal Fluid (rev 111170)
- Portal Pistol (rev 126018)
- Evil Morty's Portal Gun (rev 126314)
- Portal Gun Jr. (rev 125771)
- Blender Dimension (rev 124534)
- Interdimensional Customs (rev 96789)
- Fart (rev 127371)
- Time travel (rev 95587)
- Space Cruiser (rev 127903)
- Rick and Morty's Rushed Licensed Adventure (rev 114420; a Flash game, non-canon)
- Season 9 (rev 127788)
- The page "Interdimensional Travel" does **not exist** on the wiki.

**Fan transcripts** (`https://rickandmorty.fandom.com/wiki/<Title>/Transcript`)
- T-S1E1: Pilot (Rick and Morty) (rev 120647)
- T-S1E5: Meeseeks and Destroy (112371)
- T-S1E6: Rick Potion No. 9 (107051)
- T-S1E7: Raising Gazorpazorp (107052)
- T-S1E10: Close Rick-Counters of the Rick Kind (107054)
- T-S2E2: Mortynight Run (110728)
- T-S2E3: Auto Erotic Assimilation (107057)
- T-S2E5: Get Schwifty (episode) (107058)
- T-S2E10: The Wedding Squanchers (117814; the gun scene is missing)
- T-S3E1: The Rickshank Rickdemption (125423)
- T-S3E2: Rickmancing the Stone (70650)
- T-S3E6: Rest and Ricklaxation (125251)
- T-S3E7: The Ricklantis Mixup (117426)
- T-S3E9: The ABC's of Beth (125248)
- T-S3E10: The Rickchurian Mortydate (125250)
- T-S4E5: Rattlestar Ricklactica (123999)
- T-S4E8: The Vat of Acid Episode (119846)
- T-S4E10: Star Mort Rickturn of the Jerri (107079)
- T-S5E6: Rick & Morty's Thanksploitation Spectacular (107102)
- T-S5E7: Gotron Jerrysis Rickvangelion (86000)
- T-S5E9: Forgetting Sarick Mortshall (125770)
- T-S5E10: Rickmurai Jack (107099)
- T-S6E1: Solaricks (122629)
- T-S6E3: Bethic Twinstinct (125259)
- T-S6E6: JuRicksic Mort (107035)
- T-S7E1: How Poopy Got His Poop Back (107048)
- T-S7E5: Unmortricken (127179)
- T-S7E6: Rickfending Your Mort (107041)
- T-S7E10: Fear No Mort (123906)
- T-S8E3: The Rick, The Mort & The Ugly (123905)

**Episode pages** (`https://rickandmorty.fandom.com/wiki/<Title>`, plot summaries)
- Pilot (Rick and Morty) (125378)
- The Wedding Squanchers (125377)
- The Rickshank Rickdemption (127777)
- The Ricklantis Mixup (126207)
- The Old Man and the Seat (125349)
- Forgetting Sarick Mortshall (125346)
- Rickmurai Jack (126186)
- Solaricks (125328)
- Ricktional Mortpoon's Rickmas Mortcation (126392)
- Unmortricken (127686)
- Mort: Ragnarick (127690)
- Fear No Mort (127691)
- The Rick, The Mort & The Ugly (127694)
- The Last Temptation of Jerry (127695)
- Nomortland (127699)
- There's Something About Morty (127703)
- Ricks Days, Seven Nights (127704)
- A Ricker Runs Through It (127706)
- Erickerhead (127708)
- Salute Your Morts (127711)
- Field of Dreams (127789)

**Galleries and frames** (static.wikia.nocookie.net; URLs inline in the tables above)
- The Wedding Squanchers/Gallery (rev 63866): frame sequence "drop the portal gun → rick sneakily turns switch → rick slides it over → agents approach portal → portal trap → sound deaf".
- Other frames I viewed: the Portal Gun, Portal Technology and episode galleries listed inline.

**Journalism and interviews**
- Bleeding Cool, Ray Flook, 2026-06-28 (S9E6)
- FandomWire, Callie Hanna, 2026-06-28 (S9E6)
- The Cinemaholic, S9E6 recap (author/date not captured)
- ComicBook.com, Nick Valdez, 2022-11-20
- SlashFilm, Rafael Motamayor, 2022-11-21
- Inverse, Corey Plante, 2019-07-20
- Looper, Mae Harrington O'Neill, 2022-05-12
- ToyTales, Todd Coopee, 2017-10-11
- Nerdist (via goodreads mirror), 2017-06-15
- S9E4 recaps, search snippet only: TV Obsessive https://tvobsessive.com/2026/07/10/rick-and-morty-s9e4-recap-a-ricker-runs-through-it-im-worried-about-rick/ and FandomWire https://fandomwire.com/rick-and-morty-season-9-episode-4-spoiler-recap-a-ricker-runs-through-it/
- Blocked or unreadable (403/404/Cloudflare): scrapsfromtheloft S9E6 transcript, MetaFilter FanFare S2E10, Entertainment Earth, License Global, Paladone, Walmart, DVD Talk, TV Obsessive S9E6.
