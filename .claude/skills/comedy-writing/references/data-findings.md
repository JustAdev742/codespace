# Data findings behind the comedy-writing skill

Two datasets, analysed November 2026.

## StandUp4AI (EMNLP 2025 Findings)

github.com/Standup4AI/dataset: 3,617 Comedy Central and Montreux stand-up
videos in seven languages, with laughter detected and validated word by word.
The repository ships the code, the channel URL lists (11,873 videos) and four
fully labelled sample sets. The full transcripts require downloading the videos.

Laugh density in the four labelled samples:

| Sample | Language | Words | Laugh points | Minutes | Laughs a minute |
|---|---|---|---|---|---|
| 1xvwYZwm8Ig | Czech | 811 | 46 | 5.9 | 7.9 |
| -1FrUOEswOk | French | 1,052 | 58 | 7.8 | 7.4 |
| 6JQzl2LlXbQ | Spanish | 286 | 11 | 1.9 | 5.9 |
| 0g7nezWZyfY | English | 1,054 | 32 | 5.9 | 5.4 |

So there is roughly one laugh every 8 to 11 seconds, and 18 to 33 words of
setup per laugh.

## funny_bench

huggingface.co/datasets/fchaubard/funny_bench: 24,438 TikTok stand-up clips
(10k+ likes each), transcribed with laughter and audience turns marked, and
ranked by engagement rate (likes divided by views). The SFT split's 23,216
training clips were analysed in four tiers: LEGENDARY (top 5%), KILLER, SOLID
and WARMING_UP (bottom 50%).

Medians and means by tier (WARMING_UP → LEGENDARY):

| Feature | WARMING_UP | SOLID | KILLER | LEGENDARY | Rank correlation with engagement* |
|---|---|---|---|---|---|
| Detected laughs a minute (median) | 0.61 | 0.67 | 0.67 | 0.79 | +0.03 |
| Words a minute (median) | 141 | 146 | 150 | 154 | +0.10 |
| Words before the first marked laugh (median) | 141 | 147 | 151 | 135 | +0.09 |
| Act-out markers per 100 words (mean) | 0.39 | 0.44 | 0.48 | 0.49 | +0.07 |
| "I" per 100 words (mean) | 4.46 | 4.66 | 4.95 | 4.81 | +0.06 |
| "You" per 100 words (mean) | 4.27 | 4.35 | 4.05 | 3.60 | −0.03 |
| Capitalised names per 100 words (mean) | 6.05 | 5.57 | 5.24 | 4.71 | −0.08 |
| Words per sentence (mean) | 10.3 | 10.3 | 10.6 | 11.8 | +0.06 |

\* Spearman correlation, averaged over five duration buckets to control for
clip length. `scripts/analyze_funny_bench.py` prints exactly these figures.

The first-laugh row disagrees with itself. LEGENDARY clips reach their first
marked laugh sooner on median, but within each length bucket a longer
run-up correlates slightly with *higher* engagement. Treat "laugh early" as a
craft convention, not a finding.

Words most over-represented in the top two tiers (weighted log-odds): *like,
was, gay, my, because, parents, mom, weird, literally, actually, trans, dating,
school, therapist, kid, men, honestly, dad, therapy*.

Most over-represented in the bottom tier: *you, fucking, ain't, your, wife,
sir, motherfucker, money, name, what's, mate, man, food, shit, chinese, tour,
chicken, business, cash*. These cluster around crowd work, generic profanity,
stereotype bits, and famous-comedian clips whose huge view counts depress
their engagement rate.

## Caveats

- The correlations are weak (|ρ| ≤ 0.11). They are tendencies, not laws.
- Engagement isn't the same as funny: relatability and controversy also
  drive likes.
- funny_bench's laughter markers are sparse. A third of clips have none,
  because the speaker-separation step misses much of the laughter. Use
  StandUp4AI for laugh density, not funny_bench.
- These are stand-up clips. The craft rules in SKILL.md carry them over to
  sketch writing. That carry-over is a judgement, not something either
  dataset tested.
