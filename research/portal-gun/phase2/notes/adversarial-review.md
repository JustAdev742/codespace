# Adversarial review of D2 (phase II research paper)

Reviewer: AI referee (Claude), 2026-10-20. Scope: items 1–9 of the review brief. Nothing under
`research/portal-gun/` was edited except this file. Scratch scripts (not in the repo):
`/tmp/claude-0/-home-user-codespace/67b85544-8303-5389-9e70-b9a5f9a1746d/scratchpad/review/`
(`check_qi_theorem.py`, `check_theorem_hypothesis.py`, `check_thin_band.py`, `check_charged.py`,
`check_charged_resid.py`, `check_chronology_misc.py`, `sampled_ratio.py`). The web was not consulted;
every literature statement below is checked against `notes/stageB-*.md` only.

**Test suite (item 9):** `cd code && .venv/bin/python -m pytest -q tests` → **45 passed in 43.6 s.**

## Findings at a glance

| # | Severity | Location | Issue |
|---|---|---|---|
| F1 | error | §6.7 "≈ 4.5(1 − Q_e/r_T)²" | Coefficient is 4/9 ≈ 0.44, not 4.5 (paper's own table is off by 10× from it) |
| F2 | overstatement | Abstract 1; §5.2 *Setting*, numerics | Scope of the theorem misdescribed: it needs every variation scale (including the redshift) ≳ r0√(2/ε), not "no scale below r0" |
| F3 | error (O(1)) | Abstract 2; §5.3; §5.4 | Thin-band `a` mixes Morris–Thorne coordinate width and proper width; ρ_band = 1.6e64 J/m³ is really 1.05e64 |
| F4 | error (×2) | §5.4 "≈ v w_b/r0 … ~0.5 m/s at a = 10⁻²¹ m" | Impulse is 2 v w_b/r0 ≈ 1.0 m/s at every a |
| F5 | unclear / gap | §4.4 *Beyond spherical symmetry*; Abstract 3 | Huisken–Ilmanen corollary is per asymptotic end; a one-universe portal pair has one end, so only the total mass is bounded |
| F6 | error (boundary) | §8.1 Proposition, "Equivalently …" | Non-strict difference constraints are feasible at cycle weight exactly 0, where a closed null curve exists |
| F7 | overstatement | §10.4, §10.2, Abstract 2 "new comparison" | Krasnikov 2003 already made the window comparison and derived the sub-Planckian band |
| F8 | understates prior art | §6.7 "We did not find this cost analysis" | Maldacena–Milekhin(–Popov) already give heavy mouth, large γ and the monopole count (exactly 1.06e34) |
| F9 | unsupported | §6.7 "The paper itself warns that nonlinear instabilities may still appear" | Not in the notes |
| F10 | unsupported | §4.3 "(Graham & Olum 2007)" | Not in any notes file |
| F11 | quote not in notes | §4.1 "small exotic regions" (VKD 2003) | Not VKD's wording per the notes |
| F12 | misattribution | §10.2 row 9.2 "Ford & Roman 1996 ('large discrepancies in length scales')" | Notes have this phrase from Roman 2004 only |
| F13 | minor (quotes) | §7.3, §5.3, §4.4, §8.1, §4.3 | Paraphrases in quotation marks; one phrase attributed to the wrong Dowker paper |
| F14 | understates prior art | §5.2 "optimise the observer's speed in one example" | FR96 optimise in two examples (§4.2 and §4.4) |
| F15 | understates prior art | §5.2 / §10.2 b′(r0) = 1 row, "left this case open" | FR05 and K08 both pointed to the off-throat region |
| F16 | understates prior art | §6.6 "Prior art: none found" | Notes record an on-topic Kapitza screen for wormhole throats (GitHub PR) and stochastic-Kapitza gravity work |
| F17 | understates prior art | §4.4, §9.1 rim mass; §4.4 NF claim | GV17/V95 give the Jupiter-mass rim; Ida–Hayward 1999 give m_H = √(A/16π) at the throat |
| F18 | unclear | §6.5 quantum interest; §10.3 item 4 | Regime of A = 1 m²; FR99 vs FT00 tension; 10⁻⁵³ vs 10⁻⁵⁴ |
| F19 | minor | §5.7 "1/256 of the throat value" | It is 1/256 of D_ref, i.e. 1/64 of the Ellis throat value |
| F20 | minor | §10.1 "All ten Stage A predictions were borne out" | Nine are listed; the tenth (curved rims) was narrowed |
| F21 | minor | §6.7 rotation and BLNS rows | Uncited 5D source; omitted condition |
| F22 | nits | various | Listed at the end |

---

## F1 — error — §6.7: "−g_tt at the throat falls as ≈ 4.5(1 − Q_e/r_T)²"

- **What is wrong.** The coefficient is 4/9 ≈ 0.444, not 4.5. The sentence contradicts the paper's own table:
  at q = 0.99, 4.5 × 10⁻⁴ ≠ 4.5 × 10⁻⁵.
- **Evidence, numerical.** From `charged_results.json` and my independent re-solve, G_throat/(1−q)² =
  0.4726, 0.4581, 0.4471, 0.4447 and 0.4445 at q = 0.9, 0.95, 0.99, 0.999 and 0.9999.
- **Evidence, analytic.** Put y = π/2 − δ.
  - The throat condition tan y (1 − g1 y) = g1 gives δ³ ≈ 3σ/g1.
  - Then r_T ≈ M + (3/2) r0/δ, and √G_th ≈ σ/(g1 δ).
  - Hence 1 − q ≈ (3/2)√G_th, so G_th ≈ (4/9)(1−q)² and γ = G_th^{−1/2} ≈ 1.5/(1−q).
- **Not affected.** The γ formula, the table and every SI number are right.
- **Fix.** Replace the coefficient: "falls as ≈ (4/9)(1 − Q_e/r_T)²".

## F2 — overstatement — Abstract item 1 ("with no length scale shorter than r0 … for every flare-out"); §5.2 *Setting* and numerics

- **The algebra is correct.** See "Checked and found correct". With the window not cut, D_max = D_ref at γ² = 2/ε.
- **The problem is the scope.** At the optimum the observer has γ* = √(2/ε). Its window L0 = f r0 is
  uncut only if every static-frame variation scale of ρ′ and of the curvature, divided by γ*, is ≥ r0.
  That includes the proper-time scale along the worldline.
  - **Shape.** Variation lengths must be ≳ r0√(2/ε), which for small ε is far longer than r0.
  - **Redshift.** Because γe^Φ is constant, x = εγ² varies along the path as x(1 − Φ″l²). This
    requires |Φ″(0)| r0² ≲ ε/4, which is much stronger than the stated |Φ″(0)| r0² ≤ 1.
- **Evidence: redshift added to the paper's own throat.** I used two_scale(ε = 0.01, L = 400), added
  Φ = φ_a e^{−l²/w²}, and ran the repo's `qi.local_deficit` with the fr96 window at the throat:

  | Φ″(0) r0² | D_max/D_ref at ε = 0.01 | D_max/D_ref at ε = 0.2 |
  |---|---|---|
  | 0 | 1.000 | 1.000 |
  | 0.0025 | 0.29 | 1.000 |
  | 0.01 | 0.024 | 1.000 |
  | 0.1 | 3e-4 | 0.092 |
  | 0.5 | < 1e-4 | 0.005 |
  | 1.0 | < 1e-4 | 0.001 |

  - The results are the same for w = 1, 3 and 14 r0, so they depend only on Φ″(0).
  - The window is cut by the temporal scale d_t: 0.31 r0 at Φ″(0) r0² = 0.01, ε = 0.01.
  - Φ″ = 0.01 with w = 1 is a dip of depth only 0.005, and it lowers the throat deficit 40×.
- **Evidence: the paper's own numerics.**
  - Ellis (ε = 2, no scale below r0) gives 0.25: the code's variation length is d = 0.71 r0.
  - Two-scale ε = 0.5, L = 20 gives 0.20 although d = 1.37 r0 > r0. The cut is d/γ = 0.58 r0.
  - So "where the geometry varies on a scale shorter than r0" (§5.2 numerics) is the wrong explanation
    for the ε = 0.5 case.
  - Also: "γ within 0.3% of √(2/ε)" is 0.35% at ε = 0.01 (14.192 against 14.142).
- **What this does not change.** For a walk-in portal, C7 forces |ΔΦ| ≲ 10⁻¹⁶, so the redshift
  condition holds automatically. The physics verdict (10⁶²) stands; only the stated generality is off.
- **Fix.**
  - Abstract: replace "no length scale shorter than r0" with "no structure, in shape or redshift,
    varying faster than r0√(2/ε)".
  - §5.2: state the hypothesis as d ≥ γ*·ℓ_curv = r0√(2/ε) for ρ′ and the curvature along the optimal
    worldline, and add the implied |Φ″(0)| r0² ≲ ε/4. Drop or justify the |Φ″| r0² ≤ 1 clause.
  - Re-explain the 0.20 case, and change 0.3% to 0.4%.

## F3 — error (factor π/2) — Abstract item 2, §5.3, §5.4: thin-band width

- **The formulas use Morris–Thorne's coordinate width.** The code's `ThinBand(r0, a0)` and
  `run_phase2.py` (`D_fr96_analytic`, `D_curvature_analytic`, `a_band`) all use MT's coordinate
  parameter a0 (b = r0(1 − (r − r0)/a0)²). These formulas hold in a0:
  - D ≈ (32π/3) f⁴a³/(r0ℓ_P²) and D ≈ (8π/3) f⁴ a r0/ℓ_P²;
  - curvature radius √(a r0);
  - a* = 9.2e-22 m and 3.1e-63 m.
- **The proper width is larger by π/2.** My quadrature of ∫dr/√(1 − b/r) over the band gives
  1.5687 a0, 1.5706 a0 and 1.5708 a0 at a0 = 10⁻², 10⁻³ and 10⁻⁶.
- **Inconsistency 1, the width.** The abstract calls a "proper width" with D = 1 at a ≈ 9e-22 m. In
  proper width the value is (π/2) × 9.2e-22 = 1.45e-21 m. The compact family (proper half-width a)
  extrapolates with the measured a³ law to the same 1.45e-21 m (from D/D_ref = 2.03e-6 at a = 0.01).
- **Inconsistency 2, the density.** §5.4 "|ρ| ≈ c⁴/(8Gar0) = 1.6e64 J/m³" applies the proper-width
  formula to the coordinate value. The actual throat density of the a0 = 9.2e-22 m band is
  |ρ| = c⁴/(4πG a0 r0) = **1.05e64 J/m³**.
  - Downstream, "10^67.6 × Casimir(1 μm)" becomes 10^67.4.
  - The Casimir gap becomes 1.43e-23 m (not 1.27e-23 m).
  - The abstract's and §4.5's "−1.6e64 J/m³" becomes −1.0e64.
- **Fix.** Either state a* as the proper width 1.4e-21 m (and ρ = 1.0e64 J/m³), or say "MT coordinate
  width a0" in §5.3–5.4 and the abstract and use ρ = c⁴/(4πG a r0). FR96 itself only claims a0 is the
  proper thickness "to within factors of order unity".

## F4 — error (×2) — §5.4: "Δv ≈ v w_b∫|B|dl ≈ v w_b/r0 … the same law gives ~0.5 m/s at a = 10⁻²¹ m"

- **What is wrong.** Over the crossing, ∫|B| dl = ∫r″/r dl ≈ [r′]/r0 = 2/r0, because r′ runs from −1 to +1.
  So Δv ≈ 2v w_b/r0 = 1.0 m/s.
- **Evidence.** That is what `tides.crossing` computes: 0.962 m/s at a = 0.3 rising to 0.9986 m/s at
  a = 0.01 (`qi_results.json` thin_region), approaching 1.0 as a → 0.
- **Why it matters.** "~0.5 m/s" contradicts the a-independence asserted in the same sentence, and the
  "~1 m/s kick" of the abstract and §9.1.
- **Fix.** Write "≈ 2 v w_b/r0 ≈ 1 m/s, independent of a".

## F5 — gap — §4.4 *Beyond spherical symmetry* (and Abstract item 3)

- **What is right** (checked against `stageB-penrose.md`):
  - R = 16πρ on K = 0 slices (Bray eq. 2; HV97 eq. 14).
  - The sign of the maximal-slice constraint, R = 16πρ + K_ijK^ij.
  - HI's hypotheses as quoted: per connected component, R ≥ 0 only outside, and the shielding caveat.
  - t = const slices of circular stationary axisymmetric metrics are maximal. With shift β = −ω∂_φ,
    tr K = D_iβ^i/N = (N√γ)^{−1}∂_φ(√γ β^φ) = 0. This is true, but neither the notes nor D2 cite or prove
    it; add the one-line proof.
- **Gap: the portal pair.** The paper's object (§2.1) is a pair of mouths in **one** universe: one AF
  end and a non-separating throat sphere. HI's theorem is a statement about an asymptotic end.
  - Cutting along the throat gives an exterior with one end and two minimal boundary copies.
  - HI then gives only M_tot ≥ √(A/16π) for the **total** ADM mass of the universe. Bray, with both
    copies, gives M_tot ≥ √(2A/16π).
  - So for two well-separated mouths of mass m each, the corollary forces ρ < 0 only if
    m < 0.5√(A/16π) (HI) or m < 0.71√(A/16π) (Bray).
  - Mouths between those values and √(A/16π) are not covered. "That end's infinity" is shared, and a
    single mouth's mass is only quasi-local.
- **Other cautions to state.**
  - The abstract drops "outermost".
  - HI need completeness and AF decay (0.1)–(0.2), including Rc ≥ −Cg/|x|².
  - Outermost minimal surfaces are spheres (HI Lemma 4.1), so "any shape" means any geometry whose throat
    is an outermost minimal sphere. Toroidal or distributional (rim) throats are outside it.
- **Fix.** State the corollary for two-ended wormholes per end. Add the one-universe portal version
  explicitly in terms of the total mass. Restore "outermost" in the abstract.

## F6 — error at the boundary — §8.1 Proposition ("Equivalently, the difference constraints … T_j − T_i ≤ d_ij/c have no solution")

- **What is wrong.** With non-strict ≤, the system is feasible exactly when there is no **negative**
  cycle (the Bellman–Ford duality cited in the proof). The first clause, however, uses weight ≤ 0.
- **Evidence.** Two mouths, d = 10 m, L = 0, Δ = d/c exactly:
  - `chronology.margin` = 0, so the code (correctly) reports a closed causal (null) curve;
  - `bellman_ford_has_negative_cycle` = False;
  - the constraints T1 − T0 = Δ, |T1 − T0| ≤ d/c are satisfied.
- **A second gap.** The graph clause also needs "a cycle of weight ≤ 0 **containing an external edge**".
  With L_k = 0 every link is a weight-0 two-cycle. `margin()` implements this correctly; the statement
  (and the `chronology.py` docstring) does not.
- **Fix.** Use T_j − T_i < d_ij/c on external edges. Feasibility then holds iff there is no cycle with
  weight < 0 and no weight-0 cycle containing an external edge. Alternatively, restrict the
  "equivalently" to closed timelike curves.
- **Correct as is.** The treatment of back-and-forth crossings: for L > 0 the two-cycle weighs 2L/c > 0.

## F7 — overstatement of novelty — §10.4 "the comparison of the two QI window conventions for thin bands"; §10.2 row "K, C"; Abstract item 2 "(known, with a new comparison)"

- **What the notes record** (`stageB-qi-energy.md` Q1(c), Kr03 §II):
  - Krasnikov made the comparison himself: the curvature-window condition is "a vastly more restrictive
    condition than ̺¯χ ≳ −δ^{−4}, which is considered in [14] [= FR96]".
  - He derived the result: δ ≲ 1/r0 in Planck units, "of the order of 10^{−35} lPl" for r0 = 1 m (f = 1).
- **Check.** D2's 1.9e-28 ℓ_P is Krasnikov's ℓ_P/r0 times 3/(8πf⁴) = 1.19e7.
- **Fix.** Credit the sub-Planckian conclusion and the comparison to Krasnikov (class K). D2's addition is
  the f-dependence and the self-consistent numerical window.

## F8 — understates prior art — §6.7 "We did not find this cost analysis in the literature"

- **What the notes record** (`stageB-topology-chronology.md` Q7). Maldacena–Milekhin(–Popov)'s
  near-extremal charged wormholes already show the same costs:
  - mouth mass M_e = r_e/G ("resemble intermediate mass charged black holes", MM eq. 2.5);
  - a traveller boost γ = ℓ/r_e ≫ 1, "the boost factor that a particle that starts non-relativistic
    outside would acquire at the center of the wormhole" (MM eq. 2.14);
  - magnetic charge from r_e² = πq²l_p²/g² (MMP eq. 2.3).
- **Check.** MMP eq. 2.3 with g² = 4πα and r_e = 1 m gives q = **1.057e34**, which is D2's Dirac-monopole
  count to four digits.
- **Fix.** Cite MM/MMP as the same physics in another model, and use MMP 2.3 as a cross-check. Keep "not
  found" only for the costs of the Blázquez-Salcedo et al. family specifically.

## F9 — unsupported attribution — §6.7 "The paper itself warns that nonlinear instabilities may still appear."

- The stage B notes on Blázquez-Salcedo et al. 2026 (intro, framework, results, conclusions read) record
  no such warning.
- **Fix.** Add the quote to the notes, or delete the sentence.

## F10 — unsupported attribution — §4.3 "… conjectured to hold self-consistently (Graham & Olum 2007)"

- Graham & Olum appear in no stage B notes file.
- **Fix.** Add the source and quote to the notes, or drop the citation.

## F11 — quotation not supported — §4.1 'the mechanism behind "small exotic regions" (Visser, Kar & Dadhich 2003)'

- The notes record VKD's wording as "arbitrarily small energy condition violations" (title) and
  "infinitesimal weak energy condition [WEC] violations". The phrase "small exotic regions" does not
  appear.
- **Fix.** Use VKD's words, or remove the quotation marks.

## F12 — misattribution — §10.2 row "Length-scale hierarchy": "Ford & Roman 1996 ('large discrepancies in length scales') and Roman 2004"

- In the notes this phrase is Roman 2004's ("with the requisite large discrepancies in length scales
  implied by the QIs"). FR96's recorded wording is "These discrepancies are typically of order (lp/r0)^n".
- **Fix.** Attribute the phrase to Roman 2004, or add the FR96 sentence to the notes if it is in FR96's
  abstract.

## F13 — minor quotation issues

- §7.3: "ℝ³ with a handle" is placed as Dowker & Surya 1998 / Dowker & Garcia 1998. The notes have it
  from Dowker 2002 §2.
- §5.3: Ford & Roman's "distance to a boundary" is a paraphrase. FR96 says "the distance to any
  boundaries" and "the proper distance to any boundaries".
- §4.4: "Penrose inequality reversed ⇔ ∫r²ρ < 0" is a paraphrase in quotation marks. HK25 Cor. 3.2 also
  covers |J| = 0 MOTS data, which is more general than "time-symmetric".
- §8.1: "wormholes into the past" is not a quotation from UVa 558 or USACO 2006 per the notes.
- §4.3: Horowitz et al. attribute the argument to "these papers" (MMP etc.) and qualify boundary
  causality "(when there is a field theory dual)". D2 omits both.

## F14 — understates prior art — §5.2 "Ford & Roman (1996) optimise the observer's speed in one example"

- The notes record two optimised examples:
  - §4.2 (Φ = 0, b = r0): v = 1/√2;
  - §4.4 (proximal Schwarzschild): "We get the optimum bound by minimizing γ/v", eq. 84.
- **Fix.** Write "in two examples".

## F15 — understates prior art — §5.2 / §10.2 row "b′(r0) = 1 does not evade the QI" (NF; "Fewster & Roman 2005 left this case open")

- FR05 already pointed to the remedy: "one could modify the analysis by considering static trajectories
  with r > r0 where NEC is violated".
- K08 says "since the WEC is violated arbitrarily close to the throat, the analysis should be extended",
  and its eq. 42 extends the QI off the throat.
- What was not found is the quantitative, boost-optimised result.
- **Fix.** Say exactly that; change "left this case open" to "identified the off-throat region but did
  not pursue it".

## F16 — understates prior art — §6.6 "Prior art: none found"

- `stageB-stability-control.md` Q8 records a public GitHub PR, "S0-2026-10-15b: Kapitza
  dynamic-stabilisation screen for wormhole throats (derived, toy); paused"
  (github.com/DD-Ching/jwst-anomaly-research PR #255; not accessed).
- It also records stochastic-Kapitza stabilisation of an unstable gravitational degree of freedom
  (Lozano & Mazzitelli 2021, the scale factor).
- Neither is peer-reviewed wormhole literature. The PR is, however, a directly on-topic attempt five days
  earlier.
- **Fix.** Disclose both in one sentence.

## F17 — understates prior art (minor)

- **Rim mass.** §4.4 and §9.1 give −(π/2)Rc²/G = −1.11 M_J per metre with no credit. GV17 ("a negative
  energy equivalent to the mass of Jupiter" for a 1 m ring) and V95 (via FLM21) already state it. Cite them.
- **General-shape corollary.** For the not-found claim, Ida & Hayward 1999 are the nearest prior art:
  "The Hawking energy is actually positive on a wormhole horizon with spherical topology, taking the value
  √(A/16π)". That is the starting point of the Geroch-monotonicity proof of HI. Cite them next to "not found".

## F18 — unclear — §6.5 quantum interest; §10.3 item 4

- **The conversion is right.** 0.338 = (π/16)^{2/3} (FR99 eq. 29) in ħ = c = 1, so
  T = 0.338(Aħc/|ΔE|)^{1/3}/c = **1.93e-24 s** for 70 kg and A = 1 m².
- **Regime.** FR99 footnote 34 flags the causal-contact condition A < T². Here (cT)² = 3.3e-31 m², about
  31 orders below A, so A = 1 m² is far outside that regime.
- **Necessary, not sufficient.** FT00 (abstract only) says that in 4D a positive δ-pulse can never
  compensate a negative one. FR99's δ-pulse T_max is therefore a necessary condition only, and quoting
  "that delay is … 2e-24 s" and then citing FT00 is internally inconsistent.
- **Inconsistent figure.** §10.3 says the first draft gave "10⁻⁵³ s"; §6.5 and `qi_results.json` give
  2.2e-54 s.
- **Fix.** Present 2e-24 s as FR99's necessary bound, note FT00's stronger statement, and correct
  10⁻⁵³ to 10⁻⁵⁴.

## F19 — minor — §5.7 "D saturates at 1/256 of the throat value"

- The tail value is 0.0039 D_ref = D_ref/256. The Ellis throat under the same window is 0.25 D_ref, so
  the tail is 1/64 of the Ellis throat value. The 6e59 figure is right.
- **Fix.** Write "1/256 of D_ref".

## F20 — minor — §10.1 "All ten Stage A predictions were borne out"

- The list that follows names nine.
- Prediction 10 ("Cosmic-string loops are straight", thin-loop consistency of curved rims) was narrowed by
  stage B: static circular rims are exact solutions (§5.5, §10.3 item 5).

## F21 — minor — §6.7 rotation and stability rows

- The 5D critical value |J|/A = 0.10063 is uncited in the text (Dzhunushaliev, Folomeev, Kleihaus, Kunz &
  Radu 2013, per the notes).
- The Bronnikov–Lipatova–Novikov–Shatskiy 2013 row omits a condition: radial stability needs the
  equation-of-state function h(x) to vanish at the throat.

## F22 — nits

- §4.1: "By §4.3 it costs a deep gravitational well" should point to §5.4 (and VKD's near-horizon limit).
- §6.6: "Ω ∼ 10¹¹ rad/s". Ω = 80–160 s = 2.8e10–5.7e10 rad/s.
- §5.3: "agree … to 1–6%". `window_comparison` gives 0.1–6%.
- §6.2: the Richardson value from N = 1000/2000 is 1.1819730 per `stability_results.json`; the text says
  1.181972.
- §9.1: "≤ 2.2 m/s for 1 g" uses MT's 2 m body width. The paper's own traveller is 0.5 m wide, giving
  4.4 m/s (audit B05 notes this).
- Abstract item 4: "γ ∼ 10⁴" holds at Q/r_T = 0.9999 (the 58-minute case). At 0.95 (13 μs) it is 30.
  Also, "does so only by …" generalises from the critical family studied.

---

## Checked and found correct

### Item 1 — §5.2

- **Curvature and stress.** I re-derived these in sympy from the metric (MTW convention), without the repo
  code:
  - R_tltl = Φ″ + Φ′², R_tθtθ = Φ′r′/r, R_lθlθ = −r″/r, R_θφθφ = (1 − r′²)/r²;
  - 8πρ, 8πp_l and 8πp_t as in §3.
- **Boost.** A radial boost gives γ²(A + β²B), γ²(B + β²A) and γ²β(A + B), with R_tltl and C invariant,
  and ρ′ = γ²(ρ + β²p_l). All are exact.
- **Throat values.** At the throat ρ′ = (1 − εγ²)/8πr0², and the largest component is
  max(x/2, 1, |Φ″|r0²)/r0².
- **D(x).** dD/dx = −4(x − 2)/x³ for x ≥ 2; the maximum is 1 at x = 2; the ε > 2 branch is 4(ε − 1)/ε².
- **FR96 eq. 95 optimised over v.** The optimum is v² = 1 − ε/2, i.e. γ² = 2/ε, and
  r_m/r0 ≲ √(2/ε) f⁻¹(ℓ_P/r0)^{1/2} exactly as claimed. FR's own τ0 = f r_m/γ gives D_FR = D_ref·ε²/4 at
  that optimum, which is the source of the weakening.
- **Quotes.** The FR96 quotes "a 'safe' bound … due to our rather conservative condition on R′_max" and
  "is weakest when b′0 is extremely close to 1" are verbatim, modulo the ellipsis. FR05's √(1 − b′0)
  weakening and "nongeneric" are accurate. The Kuhfittig quotes "trivially satisfied" and "cannot simply
  be circumvented in this manner" are verbatim (K06, K08, K12).
- **Numbers.**
  - r0 ≤ 0.489 ℓ_P/f² = 7.90e-32 m.
  - D/D_ref = 1.0000 (two-scale ε ≤ 0.2).
  - Sampled/local = 0.995–0.996, so "within 0.5%" holds.
  - The b′(r0) = 1 rows: 0.157, 0.437, 1.096 at l = −0.88, −1.68, −3.31.

### Item 2 — §5.3

- With a = a0, D_curv = (8π/3) f⁴ a0 r0/ℓ_P² at the MT throat. Exact/approximate = 0.990 (a0 = 0.01) and
  0.999999 (a0 = 1e-6).
- a* = 3.118e-63 m = 1.93e-28 ℓ_P.
- The fr96 formula follows from the code's d = √2 a0. The ratio to FR eq. 69 is 1.612.
- The curvature radius is √(a0 r0) (0.99975 at a0 = 1e-3).

### Item 4 — charged wormholes

- **Exact solutions.** Both metric families satisfy the Einstein–Maxwell–phantom equations: sympy residual
  ~1e-16, with Ψ_r = qG r0/(r² + r0²) and phantom normalisation k² = (1 + c1)/4π.
- **Charge.** Gauss's law gives |Q| = g1 r0/σ = M (critical) and μ r0/σ = μ r_T (symmetric).
- **Mass.** M from the asymptotics, G ≈ 1 − 2g1r0/(σR), matches. M = μ sin(μπ/2) r_T, equal to the
  code's μ tan(μπ/2) r0.
- **Throat.** The symmetric family has a single throat at r = 0, since d/dy ln(cos μy/cos y) > 0.
- **Field at the throat.** The static-frame field is Q/r_T².
- **Table.** Every entry matches the JSON and my re-solve.
- **SI conversions.**
  - E = 1.0429e27 V/m; E_S = 1.3233e18 V/m; ratio 7.88e8; r_T(E = E_S) = 7.88e8 m.
  - Q = 1.160e17 C, i.e. 1.057e34 Dirac charges.
  - r_T c²/G = 1.3466e27 kg = 0.709 M_J.
  - τ0 at 1 m: 13 μs and 57.9 min.

### Item 5 — §8.1 network model

- The rest of the proof logic holds.
- The Roman-ring test is valid: pair margin 989 m/c = 3.30 μs; ring cycle 4(−10 + 1 m)/c < 0.
- Drift times recomputed: 353.82 d, 32.31 yr, 193.7 yr and 3.37 yr. The launched-mouth fractions are
  0.950, 0.373 and 0.132.

### Item 6 — quantum interest

- See F18. The arithmetic is right.

### Item 7 — numbers (more than 60 checked)

- **§3–§4.4.**
  - 4.815e42 Pa; −1.513e43 J/m²; Ellis ANEC −1/(8r0), with the identity re-derived by integration by parts.
  - 6.733e26 kg = 0.3547 M_J.
  - Ellis ∫ρdV = −πr0/2 → 2.115e27 kg = 1.114 M_J; shell 1.419 M_J; two-scale +74.58 r0c²/G.
  - The Komar total derivative and the §4.1 global NEC form were re-derived.
- **§5.**
  - D_ref = 1.6035e62, log 62.205.
  - 0.93c/4e16 g, 0.9988c/3e18 g, 0.141c, 0.991c; 1.09e-16; 7.9e-40 m.
  - Design search: 400 designs, 120 feasible, all with φ_a = 0; best a = 1.03 mm, D = 3.66e53;
    slopes 2.52 and 2.98.
  - 10^67.58 (but see F3).
  - Rim: 5.584e-32 m; μ = −3.366e26 kg/m.
  - Pulsed: 1.341e-26 s.
  - 6.26e59; 54.5; 9.2e-18 m.
- **§6.**
  - Shooting 1.1819727; Chebyshev 1.1819735; FD 1.182028; time-domain 1.18215; 0.846043; 2.822 ns.
  - 164.3 ns; 67.8 r0/c ≈ 226 ns.
  - Thin-shell minimum 3/2 + √3 at (3 + √3)M/2. I re-derived V″(a0) and it matches PV eq. 27 per the notes;
    the M = 0 condition β² < −1/2 and the → −1/2 limit also check.
  - √2/s = 1.1965 → 3.991 ns; boundary roots −1.07e-4 and +2.88e-3.
  - Kapitza thresholds within 0.4–5.4%; drive 10^2.24–10^2.54.
  - 1e-26 J/m³ (τ = 3–4 ns gives 1.5–4.8e-26); 6.3e18 J.
- **§8.2 table.** All eight rows agree with `chronology_results.json`; I recomputed four by hand.

### Item 8 — quotations confirmed against the notes

Everything not listed in F9–F15 checks out:

- VKD eqs. 7, 8, 10 and "a simple generalization of the ordinary mass formula for relativistic stars".
- Kar22 one-side value. AA15 M ≥ r0/2. HK25. Weinbaum 2026. Schoen–Yau (two-ended slices have positive
  mass). Jaracz 2023.
- MMP "traversable short wormholes … achronal average null energy condition" and πℓ > d. MM "no solar-mass
  figure".
- SSV22 null convergence condition. R16b/EM18 Horndeski no-go. MRV23 "'slow' tachyonic instabilities
  remain unconstrained".
- GGS 0.846, W = −3/(1 + x²)², §III D δφ = 0. BCK18 and Azad24 −1.182. Shinkai–Hayward "continual
  adjustments" and the 0.85 cross-check (labelled as the notes'). HKL02.
- Stépán and Insperger τ < √(2/a). Breda et al. Floquet SYK. Azad 30–50%. 5D 0.10063. BLNS 2013.
  2026: 0.13 s and 1.1 yr.
- Geroch (abstract plus restatements), Tipler (WEC), Borde (Theorem 3), Gibbons–Hawking "kinematically
  possible", Horowitz 1991.
- DGS00 "could be interpreted as the chronological past and future of the critical point". DS98 "parts of
  the universe … suddenly become close", "two distant regions", "harder to visualise". Lickorish–Wallace.
  D02 "remains to be proved". HMSW19 (finite separation, Γ = |K|e^{−2ΔS}, AdS, traversability argued).
- V94 ΔT = T1 + T2 + 2ζ. V97 N²(ℓ² − T²). ER97 "a preferred axis". FKZ23 (cohomology, T ≈ ℓ/I_C).
  UVa 558 and USACO 2006. KT91 eq. 8 and the ℓ_P/D cutoff; H92 invariant cutoff → order 1.
- Krasnikov's hoops (Planck-thin, 10⁻² M_⊙). GV17 −c⁴/4G. FLM21 portals. V89 −φ/4πG. GT87. UHIM89/BCL97.
- PF97 and ER97 wall thicknesses; FLB09 ≲ 10² t_P; FGNR20 Planckian.
- FR99 eq. 29 and FT00 (abstract). The 46-source count of the QI notes.
