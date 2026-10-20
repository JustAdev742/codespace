# Project Portal: executive scientific verdict

*Deliverable 1 of 8. Written 2026-10-19.*

## The answer

**A real portal gun is not achievable with known physics.** General relativity allows the *shape* of a
portal, but every step of its life — creating it, holding it open, putting the far end somewhere,
using it, and keeping it — runs into a theorem, a quantitative bound or an instability. Some of these are
proven results; the rest are the consensus of the literature, with the open questions listed below.

## Why, in six findings

| # | Finding | Key number (1 m portal) | Strength |
|---|---|---|---|
| 1 | **Nothing known can create one.** Opening a portal changes the topology of space. In classical GR that requires closed timelike curves (Geroch 1967) or is forbidden outright (Tipler 1977; Borde 1994), and handles can only be made two at a time (Gibbons & Hawking 1992). Quantum proposals give at best small, adjacent mouths with unknown probability. | — | Theorems (classical); open (quantum) |
| 2 | **It needs matter that pulls harder than it weighs.** The throat must sustain a tension greater than its energy density, violating the null energy condition (Hochberg & Visser 1997–98). | $4.8\times10^{42}$ Pa of tension; about $-1$ Jupiter mass of negative mass-energy | Theorem + calculation |
| 3 | **Quantum theory supplies far too little of it.** The Casimir effect, whose forces are measured and whose negative energy density is inferred from theory, is $10^{46}$ times too weak at micron gaps. Quantum inequalities confine the needed negative energy to a band about $10^{-21}$ m thick (Ford & Roman 1996). | Casimir plates $3\times10^{-18}$ m apart | Proven for free fields in flat space; argued in curved space |
| 4 | **It cannot be aimed at a distant place.** The geometry anywhere depends only on its causal past, so the far mouth must be carried there at or below light speed. A consistent "portal gun" is a terminal for a pre-built network. | — | Theorem for globally hyperbolic spacetimes, plus argument (phase II: a lemma for topology change) |
| 5 | **It would not stay open, or stay safe.** Every explicit model is unstable on nanosecond scales or needs an exotic equation of state; a traveller's own mass collapses the simplest one into a black hole. | Ellis throat e-folds every 2.8 ns; a free rim collapses in 5.2 ns | Calculations in the literature and here |
| 6 | **Linked mouths drift into time machines.** Clocks at the mouths tick at different rates in gravity; the offset accumulates. | A vertically stacked pair reaches closed timelike curves in 354 days | Calculation; consequence contested (chronology protection) |

The best-controlled traversable wormholes in modern physics (Gao–Jafferis–Wall 2016; Maldacena–Milekhin–Popov
2018/2023; Maldacena–Milekhin 2021) are always *slower* than going around through ordinary space, and are
either microscopic or astronomically large, with no known way to make them. They are the opposite of a
shortcut. The 2022 "wormhole on a quantum processor" was a quantum simulation; its authors' institution states
it "has not created an actual wormhole".

## What the show gets right and wrong

- **Physically apt:** a closing portal severing what straddles it (closing a throat is a collapse, which is
  worse); falling out of high exits; liquids flowing both ways; the flat, tide-free look (Visser's flat-face
  wormholes, if negative-tension matter existed).
- **Not physical:** opaque portals with nothing in the aperture; instant remote exits; "other dimensions";
  air and pressure, which the show never addresses (a 1 m portal onto vacuum would halve the pressure in a
  50 m³ room in 0.05 s);
  the game-style infinite fall, which in a self-consistent gravitational field disappears (my static model
  of a floor/ceiling pair) and which, if forced, is arguably the same physics as the time-machine drift.

## What this study produced

| Deliverable | What it is | Verified how |
|---|---|---|
| Physics models | Python package, 12 figures, symbolic re-derivation of the Morris–Thorne equations | 70 tests, checked against published results and closed forms |
| Simulator | Interactive browser lab of portal transforms, rendering and momentum rules: https://claude.ai/artifact/EAyCZ9tn96UE9q7bbkfhHH | 19 unit tests + 14 end-to-end browser checks |
| Prop | Firmware, host tests, printable enclosure and a priced parts list (Variant A \$119.89, prices verified 2026-10-19) | Compiles for the real board; 170 host checks; 7 fit checks. **Not physically built** |
| Experiments | Seven safe experiments, each labelled illusion, virtual portal or model | The two computational ones were run; the five physical ones were designed, not performed |

## What would change the verdict

Any one of these would reopen the question: a self-consistent semiclassical solution with a macroscopic
throat (overturning the expected validity of the achronal averaged null energy condition); a physical
mechanism for topology change with computable, non-negligible rates; a traversable solution stable against
generic perturbations including traffic; or the detection of a natural wormhole. None is in sight.

## Phase II

A second phase re-derived these results from the field equations, tested them numerically and went
further: [phase II research summary](../phase2/report/D1-original-research-summary.md).

## Documents

[Technical report](02-technical-report.md) · [Maths and computation](03-math-computational-appendix.md) ·
[Prop tutorial](04-prop-tutorial.md) · [Simulator tutorial](05-simulator-tutorial.md) ·
[Engineering study](06-real-portal-engineering-study.md) · [References](07-references.md) ·
[Research audit](08-research-audit.md)
