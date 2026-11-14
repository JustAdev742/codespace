---
name: comedy-writing
description: Write or punch up comedy - sketches, scripts, stand-up bits, comedic dialogue, funny video or animation - against data-backed targets taken from labelled stand-up sets (StandUp4AI) and 23k engagement-ranked stand-up transcripts (funny_bench). Gives a laugh-density target, a beat-by-beat laugh map to fill in, and the craft moves that raise density - the game, heightening by kind, absurd specificity, ending on the funny word, tags, status reversals, plant and payoff. Use when asked to make something funny or funnier, to write a sketch or a joke, or to review why a comic piece is not landing.
license: MIT
metadata:
  author: codespace
  version: "1.0.0"
---

# Comedy Writing

Comedy is the one kind of writing with a measurable outcome: people laugh or they
don't. So start from the numbers, then the craft. `references/data-findings.md`
has the analysis behind every target here, with its caveats.

## 1. The target: a laugh every 8 to 11 seconds

Professionally recorded stand-up in StandUp4AI, with laughter labelled word by
word, gets **5.4 to 7.9 laughs a minute**. Use that as the bar for anything
meant to be funny all the way through, not just stand-up.

- **Five minutes needs 30 or more laugh beats.** Count them before writing.
- **No gap longer than about 20 seconds** without one. Setup with no payoff in
  sight is where an audience leaves.
- **Land the first laugh early, ideally in the first 15 seconds.** This is a
  craft convention. funny_bench's laughter markers are too sparse to settle
  it either way (see the findings).

## 2. What the funniest material does more of

Across 23k stand-up clips ranked by engagement rate (funny_bench), the top tier
differs from the bottom in consistent, if modest, ways:

| More of this at the top | More of this at the bottom |
|---|---|
| Act-outs: playing the other person ("she goes...", "I'm like...") | Generic profanity as the punchline |
| First-person, confessional, specific | Crowd work ("sir", "where you from") |
| Family, parents, dating, therapy, identity | Stereotype bits (food, accents, nationalities) |
| Faster delivery (more words per minute) | Name-dropping, catchphrases |

In scripted work, act-outs are just scenes: show the person, don't describe
them. Speed means cutting dead air, so pause only where a reaction is visible
and worth watching.

## 3. The craft moves that produce laugh beats

1. **Find the game and state it in the first 30 seconds.** One absurd rule,
   played straight. "A 'bless you' is a contract, and he didn't pay."
2. **Heighten by changing kind, not volume.** Each escalation reframes the game
   in a new arena: repetition, then justification, bureaucracy, a retail upsell,
   a supervisor, and finally a reversal. Louder is not funnier. Different is.
3. **Rule of three, with the third bent.** Two set the pattern, the third
   breaks it: "Standard. Premium. Imported. *And our regional option...*"
4. **Absurd specificity beats general wit.** "I blessed a horse once. He
   nodded." is funnier than any clever line about manners.
5. **End every joke line on the funny word.** "Comes with God." "Germans."
   "It's an insult." Nothing after the turn.
6. **Tag your laughs.** After a laugh, add one or two more on the same premise
   with no new setup. Tags are the cheapest way to raise density.
7. **Reverse status with a deadpan reveal.** The silent bystander turns out to
   be the boss. Underplay it: "Mm-hm."
8. **Plant and pay off.** Define a phrase early so the last line lands twice.
   "'Bless your heart'... it's an insult" sets up the final "Bless his heart."
9. **Call back a gesture, not just a line.** The one-finger "one sec" in the
   first minute becomes the revenge in the last.
10. **A straight man who stays straight.** One character takes the absurd rule
    completely seriously. The other is the audience's outrage. Don't let both
    be funny at the same time.

## 4. Process

1. Write the premise as one sentence: the game.
2. Write the **laugh map**: one line per beat, marking each intended laugh and
   its device (game, heighten, specificity, tag, reversal, callback).
3. Count laughs per minute from realistic timing (about 150 spoken words a
   minute plus pauses). Fill every gap longer than 20 seconds.
4. Draft the dialogue. Then cut 20 percent of words that aren't setup or punch.
5. Punch up: put the funny word last, swap a generic detail for a specific
   one, add a tag after each big laugh.
6. Check the ending pays off something planted. If the last line would work
   in any sketch, it isn't the ending yet.
7. Review against: no explained jokes, no repeated device three times running,
   no profanity doing a punchline's job, no stereotype standing in for a
   character.

## Worked example

`films/un-bless-you/` in this repository was rewritten with this process. It
went from about 15 intended laugh beats in five minutes to about 40, which is
roughly 3 a minute to 8. These are counts from the laugh map, not measured
audience laughs. Its `script.mjs` is the beat list. Compare it with the first
cut in git history.

## Reproduce the numbers

`scripts/analyze_funny_bench.py` recomputes the funny_bench contrasts from the
dataset's parquet files (download from huggingface.co/datasets/fchaubard/funny_bench).
