# Original research summary

*Project Portal, phase II, deliverable 1. A short account of what phase II found, sorted by how new it is.
The full argument is in [D2](D2-research-paper.md), the computations in [D3](D3-computational-notebook.md),
the literature comparison in D2 §10, and the record of how the work was done in
[D8](D8-integrity-audit.md).*

## The answer first

**Was anything novel established?** Nothing that changes the physics. Phase II found no mechanism for a
portal, and no result here moves the verdict: a portal gun is not possible under known physics. Most of what
phase II derived turned out, on comparison with the literature, to be known. It was derived again here by
independent routes, which shows the code and derivations are right but is not discovery.

A handful of results were **not found in the literature we searched**. Each is modest, each sharpens an
existing obstacle rather than opening a door, and none has been reviewed by an independent expert:

1. **A quantum-inequality bound that ignores how gently a throat flares.** At any smooth, reflection-symmetric
   static throat, an observer moving at $\gamma = \sqrt{2/\varepsilon}$ sees the full deficit
   $D = \tfrac{4\pi}{3}f^4(r_0/\ell_P)^2$ ($1.6\times10^{62}$ for 1 m) whatever the flare-out
   $\varepsilon = 1 - b'(r_0)$. Even at $b'(r_0) = 1$, where nothing at the throat itself is negative, the
   deficit returns just beside it. This refutes a strategy published several times (Kuhfittig 2003–2012),
   that a gentle enough flare makes Ford & Roman's constraint "trivially satisfied". It is the most useful of
   the new results.
2. **"A light mouth needs negative energy", for any shape.** On time-symmetric or maximal slices, a mouth
   lighter than a black hole of the throat's area must contain negative energy density somewhere outside the
   throat. This is a one-line corollary of the Riemannian Penrose inequality (Huisken & Ilmanen 2001). The
   spherical version is published; we did not find the general one written for wormholes.
3. **What charge stabilisation costs a portal.** Charge makes the known instability of the Ellis wormhole
   arbitrarily slow (Blázquez-Salcedo et al. 2026), but only by making the mouth a near-extremal black-hole
   exterior. For a 1 m throat that means:
   - about 0.7 Jupiter masses;
   - a field $8\times10^8$ times the Schwinger field (or $10^{34}$ Dirac monopoles for the magnetic version);
   - a gravitational well that delivers a traveller at $\gamma \sim 10^4$.
4. **Feedback and periodic driving of a wormhole throat.** Delayed feedback can hold the Ellis mode only if
   the whole loop is faster than $\sqrt2/s$, 4 ns per metre of throat. That bound is known control theory
   (Stépán); applying it to wormholes was not found. Kapitza-type driving never stabilised the full field
   equation in any run, a negative result with no precedent we could find.
5. **Chronology of wormhole networks as a graph problem.** A network of short throats has no closed causal
   curve if and only if a time function exists on its mouths, which is a negative-cycle test. The algorithm
   is textbook; its use for relativistic wormhole networks, with drift-dependent time shifts and a single
   "chronology margin", was not found. It reproduces Visser's Roman ring.
6. **Two smaller items:** a walk-in constraint on redshift structures ($|\Delta\Phi| \lesssim 10^{-16}$), and a
   scaling estimate for pulsed throats ($\lesssim 10^{-26}$ s open for 1 m).

## 1. Reproduced (known results, rederived independently)

| Result | Prior art |
|---|---|
| Radial tension $c^4/8\pi Gr_0^2$ = 4.8×10⁴² Pa at any smooth throat | Morris & Thorne 1988 |
| NEC violation at every throat; ANEC integral $-\tfrac{c^4}{4\pi G}\int e^{-\Phi}(r'/r)^2dl < 0$ | Morris & Thorne 1988; Visser, Kar & Dadhich 2003 (citing Visser 1995) |
| Misner–Sharp sum rule $\int 4\pi r^2\rho\,dr = M - r_0c^2/2G$: heavy (0.35 Jupiter masses for 1 m) or negative | Visser, Kar & Dadhich 2003; Azreg-Aïnou 2015; Hafemann & Kontou 2025 |
| A shortcut needs an achronal-ANEC violation; long wormholes avoid it | Standard; Maldacena, Milekhin & Popov |
| Thin exotic band $\lesssim 10^{-21}$ m for a 1 m throat | Ford & Roman 1996 |
| Planck-thin rims for flat-face portals | Krasnikov 2003 (our bound is explicit: $5.6\times10^{-32}$ m) |
| Ellis instability, e-folding $0.846\,b/c$ (2.8 ns for 1 m) | González, Guzmán & Sarbach 2009; Blázquez-Salcedo et al. 2018 |
| Thin-shell stability regions | Poisson & Visser 1995 |
| Critical delay $\sqrt2/s$ for delayed PD control | Stépán 1989, 1994 |
| Roman ring as a time machine | Visser 1997 |
| Index-2 creation of a wormhole handle is causally continuous | Dowker & Surya 1998; Dowker & Garcia 1998 |
| New handles are born at one event in Morse topology change | A corollary of Borde et al. 1999 and Dowker, Garcia & Surya 2000 |

## 2. New derivations

- **The flare-out-independent QI bound** (item 1 above; D2 §5.2), with its proof, its numerical confirmation
  (1.000 ± 0.001 for flare-outs 0.2 to 0.001), and the $b'(r_0) = 1$ calculation.
- **The general-shape mass corollary** (item 2; D2 §4.4), including the observation that the $t$ = const
  slices of circular rotating spacetimes are maximal, so rotating mouths are covered.
- **A single second-order master equation** for the Ellis perturbation in the $\delta\phi = 0$ gauge
  (D2 §6.1). The gauge is known and the equation is equivalent to published ones; this form was not found.
- **The walk-in constraint and the pulsed-throat estimate** (D2 §5.4, §5.6).

## 3. New methods

- **A generalised Ford–Roman audit** (`qi.py`). It optimises over the observer's speed, uses every curvature
  component in the observer's frame, offers two window conventions, and has a sampled version along real
  geodesics.
- **The chronology checker** (`chronology.py`): weak-field drift, link time shifts, Floyd–Warshall margins and
  a Bellman–Ford check, validated on closed forms and a Roman ring.
- **A categorical feasibility framework** (`feasibility.py`). Each requirement gets a status (THEOREM, ROBUST,
  NEWPHYS, OPEN_NEG, OPEN, ENG, OK) with its basis and assumptions, and a first decisive blocker per
  architecture. Unproven conditions get no number.

## 4. New models

- Two-scale throats with adjustable flare-out; compact throats with optional redshift wells or hills
  (`families.py`).
- A model parametric drive for the Ellis master equation (`stability.py`). It is a model term, not a
  self-consistent oscillating background.
- The charged-wormhole cost table, built on the published background metric (`charged.py`).

## 5. Hypotheses (not established; ranked in D5)

H1 (shape-independent QI bound), H5 (driving cannot stabilise), H7 (heavy or DEC-violating, for every mouth),
H2 (a length-scale hierarchy for QI-compatible NEC violation), H3 (no known field reaches the thin-band
density), H6 (finite particle production for index-2 creation; an open problem named by Dowker 2002), H8 (a
computable chronology safety margin), H4 (dynamical negative-tension strings). Each has a test plan in
[D5](D5-breakthrough-hypotheses.md).

## 6. Contradictions found

**With the baseline** (phase I, [report 06](../../report/06-real-portal-engineering-study.md)):

- "Ruled out by the causal structure of GR, independently of everything else": overstated. Remote creation
  is excluded under stated assumptions.
- "Unstable in all explicit models": too strong.
- The "−1 Jupiter mass" figure is model-specific and has zero active mass.

The full audit is in [D7](D7-corrected-baseline.md): 20 claims, none with a wrong headline number.

**With the literature:**

- Kuhfittig's "trivially satisfied" (item 1).
- The thin-band "door" exists only under Ford & Roman's sampling window. Krasnikov's (2003) curvature-only
  window closes it (band below $3\times10^{-63}$ m). We do not resolve which is right.

**With our own first drafts** (see D8 §5 for the full list):

- The locality lemma does not cover quantum nucleation. Horowitz et al. (2019) create mouths a finite
  distance apart, so remote creation is ROBUST, not THEOREM.
- The quantum-interest delay was computed with a 2D formula.
- The index-2 route was not ours.

## 7. Needs verification

- Everything in the "not found" list, by an expert in the field. Our search was done by AI agents and is not
  exhaustive.
- The window convention for thin bands. This needs a curved-space QI with controlled remainders
  (milestone M0).
- The parametric late instability, which is unconverged (D3, E8).
- The charged-wormhole growth rates, which are the published ones scaled by size; we did not recompute them.

## 8. Unresolved

- Whether quantum fields can violate the achronal ANEC macroscopically (M1).
- Whether topology change happens at all, and at what rate (M2).
- Whether any traversable geometry is stable with physical matter (M5).
- How a mouth moves (M6).
- Whether "heavy or negative" holds for dynamical mouths (M10).

The milestone programme is [D6](D6-milestone-programme.md). Every route examined relocates the obstacle to
an extreme length scale or to unknown matter; none removes it (D2 §9.2).
