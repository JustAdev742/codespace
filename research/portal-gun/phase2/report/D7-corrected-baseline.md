# Corrected and annotated baseline

*Project Portal, phase II, deliverable 7. A line-by-line audit of the phase I engineering study
([report/06](../../report/06-real-portal-engineering-study.md)), plus two numbers from the phase I verdict that it
relies on. Every number was recomputed by the phase II code by a route independent of phase I
([`audit.py`](../code/portal2/audit.py) → [results/audit_ledger.json](../results/audit_ledger.json)).*

## Verdicts

| Verdict | Meaning | Count |
|---|---|---|
| **VERIFIED** | Reproduced; the statement is accurate as written | 4 |
| **QUALIFIED** | Number reproduced, but the statement needs its assumptions or scope | 7 |
| **CORRECTED** | Wrong or overstated as written | 2 |
| **EXTENDED** | Reproduced, and phase II adds a stronger or more general result | 7 |

**No headline number in the baseline was wrong.** The corrections are about scope: what a number
assumes, what kind of claim it is, and in two places a statement stronger than the evidence.

## The corrected baseline (claims that survive, at the stated confidence)

| # | Claim (corrected form) | Type | Confidence |
|---|---|---|---|
| 1 | At the throat of any smooth, static, spherically symmetric wormhole, the radial tension is $c^4/8\pi Gr_0^2$ = 4.8×10⁴² Pa for $r_0$ = 1 m, exceeding the energy density there, whatever the shape and redshift functions | Exact within the model class | High |
| 2 | Each static spherical mouth satisfies $\int 4\pi r^2\rho\,dr = M - r_0c^2/2G$. A mouth lighter than 0.35 Jupiter masses per metre of throat radius must contain that much negative energy; a heavier one may have none, but still violates the NEC | Theorem (spherical; Visser, Kar & Dadhich 2003). For any shape, on time-symmetric or maximal slices, negative density somewhere follows from the Riemannian Penrose inequality (D2 §4.4) | High |
| 3 | Integrated negative energy density of specific models: Ellis and flat-face rim −(π/2)$r_0c^2/G$ (−1.1 $M_J$ per metre), thin shell −2$r_0c^2/G$ (−1.4 $M_J$). These have **zero** active gravitational mass | Model results | High |
| 4 | Free-field quantum inequalities (Ford–Roman method, f = 0.01) exclude every smooth static throat larger than ~10⁻³¹ m. For a 1 m throat the deficit is 1.6×10⁶² **for any flare-out**, including $b'(r_0) = 1$. The only static walk-in escape is an exotic band ≲ 9×10⁻²² m thick at ~−1.6×10⁶⁴ J/m³, and only under Ford & Roman's window; under the curvature-only window (Krasnikov 2003) the band must be sub-Planckian | Method-dependent bound (flat-space QI in curved space) | High within the method |
| 5 | The Ellis–Bronnikov throat has one unstable radial mode, e-folding in 0.846 $r_0/c$ (2.8 ns for 1 m). Delayed feedback can hold it only with loop delay < 1.196 $r_0/c$ (4.0 ns for 1 m) and actuators that supply NEC-violating stress. Periodic driving did not stabilise it | Model result (linear; agrees with González, Guzmán & Sarbach 2009); control-theory result. Charge slows the mode only by making the mouth a near-extremal black-hole exterior (D2 §6.7) | High (linear) |
| 6 | Thin-shell wormholes are linearly stable only for equations of state with $\beta^2 < -1/2$ (massless shells), $\beta^2 \ge 3/2 + \sqrt3$ (shells inside 3M), or below a negative bound (outside 3M) | Model result (Poisson & Visser 1995, reproduced) | High |
| 7 | A slow traveller through a 1 m Ellis throat keeps tides ≤ 1 g at ≤ 2.2 m/s (2 m body); flat faces have no tides away from the rim | Calculation | High |
| 8 | Holding 1 atm across a 1 m-radius aperture takes 3.2×10⁵ N (32 tonnes-force) | Calculation | High |
| 9 | Linked mouths drift into closed causal curves: vertical pairs after $c/g$ = 354 days at any height; other configurations from 54 days (orbit) to millennia (planets); networks can form closed curves when no single pair does (Roman ring) | Weak-field calculation; graph criterion | High |
| 10 | In classical topology change, new handles form at a single event, joining regions in its causal past, so a far mouth must be carried to its destination at ≤ c, unless closed timelike curves are allowed. Quantum nucleation can create mouths a finite distance apart, but in every known construction only along a background already in place (Horowitz et al. 2019) | Lemma for Morse topology change (a corollary of Borde et al. 1999 and Dowker, Garcia & Surya 2000); Geroch's theorem otherwise; an observation for quantum nucleation | High within assumptions |
| 11 | Every causal, shortcut-providing architecture is first blocked at "hold a throat open"; direct remote creation is blocked earlier, at creation | Framework result (D4) | Medium–high (depends on 4 and 10) |

## Line-by-line audit

Each entry gives the original claim, the issue, the revised result, and the derivation or evidence behind it.

### B01. Throat tension (§2 table): VERIFIED

- **Original.** "Throat tension, exceeding the energy density: 4.8×10⁴² Pa (MT88 eq. 51)."
- **Check.** From the sympy-derived $p_l$ at $r' = 0$: $\tau_0 = c^4/(8\pi Gr_0^2)$ = 4.815×10⁴² Pa,
  independent of shape and redshift (with $\Phi'$ finite). The energy density there is $b'(r_0)\tau_0 < \tau_0$.
- **Note.** A model-class result. Thin shells carry surface stresses and flat-face portals line stresses
  instead.

### B02. Negative mass-energy (§2 table): QUALIFIED

- **Original.** "Negative mass-energy present: ~−2×10²⁷ kg (about −1 Jupiter mass). Ellis, flat-face and thin-shell models."
- **Issues.**
  1. **The figure conflates measures.** Proper-volume integrals of the energy density give −2.1×10²⁷ kg
     (Ellis, flat-face) and −2.7×10²⁷ kg (thin shell).
  2. **It is not a general requirement.** The Misner–Sharp sum rule (D2 §4.4) shows a mouth heavier than
     $r_0c^2/2G$ can have positive energy density everywhere. A light mouth needs −6.7×10²⁶ kg (−0.35 $M_J$)
     per side in the Misner–Sharp measure. The time-symmetric version for any shape follows from the
     Riemannian Penrose inequality.
  3. **"Mass-energy" suggests weight.** All these configurations have zero Komar (active) mass, because
     tension cancels the energy density in the source of gravity. They do not weigh −1 $M_J$.
- **Revised.** "Light mouths require negative energy of order $r_0c^2/2G$ per side (0.35 $M_J$ for 1 m) in the
  Misner–Sharp measure. Specific models carry −1.1 to −1.4 $M_J$ of integrated negative energy density, with
  zero active gravitational mass."
- **Evidence.** `energy.py`; tests `test_tolman_mass_vanishes_for_massless_mouths`,
  `test_thin_region_tends_to_thin_shell_energy`, `test_ellis_closed_forms`.

### B03. Band thickness (§2 table): EXTENDED

- **Original.** "≲ 10⁻²¹ m (Ford & Roman 1996)."
- **Check.** Reproduced: 9.2×10⁻²² m for the Morris–Thorne thin band ($f$ = 0.01, massless scalar). The
  measured law $D \propto a^3$ matches.
- **Extension.**
  - The band is **necessary**, not one option among several. Smooth throats are excluded by 1.6×10⁶² whatever
    the flare-out (D2 §5.2), and redshift designs are untraversable on foot (§5.4).
  - The band needs ~−1.6×10⁶⁴ J/m³, which is 10^67.6 times the Casimir density at 1 μm.
  - Slow travellers cross it with a ~1 m/s tidal impulse.
  - The 10⁻²¹ m figure assumes Ford & Roman's sampling window, capped at the band width. Krasnikov (2003)
    argues the window should be set by the curvature radius, which makes the band thinner than 3×10⁻⁶³ m
    (D2 §5.3).

### B04. Stabilisation bandwidth (§2 table): EXTENDED

- **Original.** "Faster than the 2.8 ns e-folding time (GGS 2009)."
- **Check.** Independent derivation (δφ = 0 gauge) and four numerical methods: $s$ = 1.181973 $c/b$, e-folding
  0.846043 $b/c$ = 2.822 ns for 1 m. This agrees with González, Guzmán & Sarbach (2009, Table I: 0.846) and with
  $\omega_I = -1.182/r_0$ (Blázquez-Salcedo, Chew & Kunz 2018; Azad et al. 2024).
- **Extension.** "Faster than the e-folding time" is not the operative criterion:
  - Delayed PD feedback stabilises only for loop delay < $\sqrt2/s$ = 3.99 ns per metre.
  - Proportional control alone never does.
  - Actuation must supply NEC-violating stress.
  - Periodic driving did not stabilise the full field equation.

### B05. Crossing speed (§2 table): VERIFIED

- **Original.** "≤ 2.2 m/s for ≤ 1 g tides (Ellis), MT88 tolerance."
- **Check.** $v \le r_0\sqrt{g/w}$ = 2.214 m/s (2 m body), and 2.21 m/s by direct scan of the tidal module.
- **Note.** For a 0.5 m-wide body the limit is 4.4 m/s.

### B06. Pressure seal (§2 table): VERIFIED

- **Original.** "1 atm across the aperture (32 tonnes-force)."
- **Check.** 101 325 Pa × π × (1 m)² = 3.18×10⁵ N = 32.5 tonnes-force.
- **Note.** "Aperture" means 1 m radius.

### B07. Chronology (§2 table): EXTENDED

- **Original.** "Cancel drift of ΔΦ/c²; vertical pairs reach closed timelike curves in 354 days."
- **Check.** Network checker: 353.85 days for $h$ = 2.5 m and 100 m (analytic $c/g$ = 353.82 d).
- **Extension.**
  - The graph criterion for networks: a closed causal curve exists iff a cycle has weight ≤ 0, equivalently iff
    no time function exists on the mouths.
  - Validated on a Roman ring.
  - Drift budgets from 54 days to 1.3×10⁹ years (D2 §8.2).
- **Literature.** "$c/g$ for any height" was not found stated; it follows from Frolov, Krtouš & Zelnikov's
  (2023) $T \approx \ell/I_C$ for a uniform field. No graph formulation of network chronology was found in the
  physics literature.

### B08. Far-mouth placement (§2 table): QUALIFIED

- **Original.** "At or below light speed: causal structure of GR."
- **Issue.** True under assumptions not stated: a classical or semiclassical spacetime, no closed timelike
  curves, and topology change either Lorentzian (which then needs CTCs, by Geroch) or through isolated
  degeneracies.
- **Revised.** The local-creation lemma (D2 §7.2) shows that, under those assumptions, both mouths of a new
  handle start at one event, so the far mouth must be carried there. Beyond them, the one explicit quantum
  nucleation of a wormhole (Horowitz et al. 2019) creates its mouths a finite distance apart, at a separation
  set by a background that already spans it.

### B09. Concept 1 "ruled out ... independently of everything else" (§3): CORRECTED

- **Original.** "Throat generator ... Ruled out by the causal structure of GR, independently of everything else."
- **Issue.** Overstated. It is excluded under the assumptions of B08. Dropping them means accepting a time
  machine or a non-classical spacetime, which is a different claim from "ruled out".
- **Revised.** "Excluded unless the device creates closed timelike curves or operates outside classical
  spacetime (local-creation lemma; Geroch 1967). Outside classical spacetime, every known nucleation process
  sets the far mouth's position by a background already in place."

### B10. Concept 2 "the only concept consistent with causality" (§3): QUALIFIED

- **Issue.** A mouth launcher (D4, D1) and Krasnikov-type corridors are also causal.
- **Revised.** "Concepts consistent with causality all create or obtain throats locally and transport mouths at
  ≤ c; the network terminal is the cleanest."

### B11. Mouth mass range (§4 item 8): QUALIFIED

- **Original.** "From zero (massless Ellis) to ~10⁴ solar masses (Maldacena–Milekhin)."
- **Issue.** "Zero mass" hides the requirement of B02: a massless mouth carries −0.35 $M_J$ per metre of
  Misner–Sharp negative energy per side.
- **Literature.** Maldacena & Milekhin (2021) state no solar-mass figure. Their eq. (2.5), $M = r_ec^2/G$
  with $r_e \approx 1.5\times10^7$ m, gives 1.0×10⁴ solar masses per mouth, so the figure is right but is a
  derived number, not a quotation.

### B12. Exotic stress-energy source (§4 item 13): EXTENDED

- **Original.** "Supply ~10⁴² Pa of tension with negative averaged null energy. Forbidden in bulk by quantum
  inequalities for free fields; interacting fields not settled."
- **Extension.** Quantified:
  - smooth throats, deficit 1.6×10⁶² for any flare-out;
  - ANEC along the radial null geodesic $-c^4/(8Gr_0)$ = −1.5×10⁴³ J/m² (Ellis), and negative for every
    static spherical wormhole by the defocusing identity;
  - the one static walk-in escape is the thin band (B03).

### B13. Negative-tension rim strings (§4 item 14): EXTENDED

- **Original.** "'No natural mechanism ... is currently known' (Visser 1989)."
- **Extension.** The QI forces the rim core to be ≤ 5.6×10⁻³² m: a Planck-scale string with tension $c^4/4G$.
- **Literature.** Krasnikov (2003) reaches the same Planck-thickness estimate for a smoothed portal. Circular
  rims are consistent statically: the zero-mass limit of Kerr is a ring wormhole with tension $-c^4/4G$
  (Gibbons & Volkov 2017). Dynamics need a finite core, since zero-thickness strings are not distributional
  sources (Geroch & Traschen 1987). Polygonal rims also need corner supports.

### B14. Topology change theorems (§4 item 15): QUALIFIED

- **Original.** "Forbidden classically without CTCs (Geroch) or outright (Tipler, Borde)."
- **Issue.** Tipler's and Borde's results assume energy and further conditions (generic or compactness).
  Geroch assumes a non-degenerate, time-oriented metric. Degenerate (Morse) metrics evade them, which is the
  framework where the local-creation lemma applies.
- **Literature.** Borde's 1994 paper is an unpublished preprint. Gibbons & Hawking (1992) add that, with a
  spinor structure, handles come in pairs. Horowitz (1991) shows first-order gravity allows smooth topology
  change through degenerate metrics.

### B15. Stabilisation (§4 item 16): CORRECTED

- **Original.** "Unstable in all explicit models; no controller can coordinate faster than light crosses the throat."
- **Issues.**
  1. "All explicit models" is too strong. Thin shells are stable with exotic equations of state (D2 §6.4).
     Other examples are claimed stable, at least in part:
     - phantom dust with a radial field, for radial and axial modes (Bronnikov et al. 2013);
     - five-dimensional rotating Ellis wormholes above a critical angular momentum, for
       symmetry-preserving modes;
     - beyond-Horndeski examples, for high-energy modes (Mironov, Rubakov & Volkova 2023).

     Charge makes the Ellis instability arbitrarily slow without removing it (Blázquez-Salcedo et al.
     2026).
  2. A distributed controller needs no global coordination. The binding limits are the loop delay (< 1.2 $r_0/c$)
     and NEC-violating actuation.
- **Revised.** "Unstable in the explicit models with physically motivated matter; stable only with exotic
  equations of state. Feedback needs loop delay below 1.2 $r_0/c$ and actuators supplying NEC-violating stress."

### B16. "Twelve of the nineteen" (§4): VERIFIED

Items 1–6 established, 7–12 investigated: 12.

### B17. R1 "proven in flat-space QFT" (§5): QUALIFIED

- **Issue.** The proofs cited are of the **ANEC** in flat space, for specified classes of theory (Faulkner et
  al.: states built from local operators; Hartman et al.: interacting theories with a UV fixed point in
  $d > 2$). What a shortcut must violate is the **achronal ANEC in curved spacetime**, which is conjectured
  (Graham & Olum 2007).

### B18. R8 stop criterion (§5): EXTENDED

- **Original.** "Stop if instability grows faster than any causal control."
- **Revised.** Quantitative: stop if no actuator can close the loop in under $\sqrt2/s$ (4.0 ns per metre of
  throat radius) with NEC-violating stress.

### B19. Rim collapse, 5.2 ns (phase I verdict, finding 5): QUALIFIED

- **Check.** $\pi R/2c$ = 5.24 ns for a Nambu–Goto loop in flat space.
- **Issue.** This is a probe-string estimate. With $|G\mu/c^2|$ = 1/4, self-gravity is not small. Static
  circular rims exist as exact solutions, but no rim dynamics has been computed.
- **Revised.** "Of order the light-crossing time (~5 ns for 1 m); the actual rim dynamics are unknown."

### B20. Bottom line (§0): EXTENDED

- **Original.** "The first parts that fail ... creating a handle in space, and holding it open with matter that
  violates the averaged null energy condition on macroscopic scales."
- **Revised.** Holding open is the earliest decisive blocker for every causal shortcut architecture. Local
  creation is open rather than excluded; only remote creation is excluded (under the assumptions of B08).

## What the audit checked for, and found

| Check requested in the brief | Finding |
|---|---|
| Mass vs mass-energy vs energy density vs total energy confused | Yes, in B02: integrated energy density was presented as negative mass. Corrected |
| Incorrect or ambiguous units | "Aperture" (radius vs diameter) ambiguous in B06; clarified. No unit errors |
| Missing geometric factors | None in the baseline. Phase I's MTY Casimir figure differed from the paper's formula by $3^{1/4}$; already documented |
| Incorrect scaling with aperture size | None. The phase II scalings are tension ∝ $r_0^{-2}$, QI deficit ∝ $r_0^2$, band thickness ∝ $r_0^{1/3}$, mass ∝ $r_0$, time scales ∝ $r_0$ |
| Misapplied quantum inequalities | Not misapplied, but incomplete: the fixed-speed form understates the bound for gentle throats. Phase II's boost optimisation closes that. The band-thickness figure also depends on a window convention that the baseline does not mention (B03) |
| Microscopic effects extrapolated to macroscopic systems | The Casimir comparison is presented as a scale comparison, not an extrapolation; acceptable |
| Model-specific instability confused with a general theorem | Yes, in B15. Corrected |
| Classical theorem treated as settling quantum gravity | Yes, in B09. Corrected |
| Unresolved question treated as established impossibility | B09 (remote creation). B17 conflated the proven flat-space ANEC with the conjectured curved-space AANEC |
| Absence of a mechanism treated as proof of impossibility | Items 13–19 are correctly labelled "new physics" or "unknown", not "impossible" |
| A cited source that does not support the exact statement | B17 (wording). B11: the ~10⁴ solar masses is not stated by Maldacena & Milekhin, though it follows from their eq. 2.5. B13: Visser 1989 supports the statement |
