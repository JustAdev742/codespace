# Stage A record: independent derivations and results before the literature comparison

Written 2026-10-20, before consulting any paper for the specific results listed here. Phase I
notes (`../../report/notes/`) were already in hand and are the source of the baseline claims;
what this file records is what I derived or computed myself in Phase II, and what I expect the
literature comparison (Stage B) to show. Every numerical value below was produced by code in
`../code/portal2/` and is re-checked by `../code/tests/`.

Units: geometric (G = c = 1) unless stated; l_P = 1.616e-35 m; r0 = throat radius.

## A1. Curvature and stress-energy of static, spherically symmetric metrics (curvature.py)

Derived by sympy from ds² = −e^{2Φ(l)}dt² + dl² + r(l)²dΩ²:
R_tltl = Φ″ + Φ′², R_tθtθ = Φ′r′/r, R_lθlθ = −r″/r, R_θφθφ = (1 − r′²)/r²;
8πρ = (1 − r′² − 2rr″)/r², 8πp_l = (r′² − 1 + 2Φ′rr′)/r², 8πp_t = (r″ + Φ′r′ + r(Φ″ + Φ′²))/r,
ρ + p_l = (Φ′r′ − r″)/(4πr), ρ + p_l + 2p_t = (2Φ′r′ + r(Φ′² + Φ″))/(4πr).
Checks: Schwarzschild vacuum; Ellis is a phantom-scalar solution (ρ = p_l = −p_t = −r0²/(8πr⁴));
Morris–Thorne's ρ = b′/(8πr²) recovered. Radial boosts: R_tltl and R_θφθφ invariant;
R_t′θt′θ = γ²(A + β²B), R_l′θl′θ = γ²(B + β²A), R_t′θl′θ = γ²β(A + B) (A = R_tθtθ, B = R_lθlθ),
verified against a full tensor transformation.

## A2. Quantum-inequality audit (qi.py)

Method: Ford & Roman's (1996) prescription (flat-space massless-scalar QI with Lorentzian sampling,
applied along geodesics with t0 = f × smallest local length scale, f = 0.01) generalised: the
observer's speed is optimised, every orthonormal curvature component in the observer's frame is
used, and the variation length is included (static-frame proper distance over which the geometry
changes, Lorentz-contracted by γ; and the proper-time scale along the worldline).
Deficit D = |ρ′| / (3 l_P² / 32π² L0⁴).

**Result A2.1 (analytic, smooth throat).** At a reflection-symmetric throat with flare-out
ε = 1 − b′(r0) = 2 r0 r″(0) and |Φ″(0)| r0² ≤ 1, an observer with x = εγ² sees
ρ′ = (1 − x)/(8πr0²) and curvature max(x/2, 1)/r0². Maximising over x gives, for every ε ≤ 2,

  D_max = (4π/3) f⁴ (r0/l_P)²   at x = 2 (γ = √(2/ε)),

independent of ε. So a gentler flare-out (b′(r0) → 1) does not weaken the bound: the observer
needed to see it simply moves faster. For r0 = 1 m, f = 0.01: D = 1.6 × 10⁶²; QI-compatibility
needs r0 ≤ 0.49 l_P/f² = 7.9 × 10⁻³² m. For ε > 2 the factor is 4(ε − 1)/ε² (static observer).

**Result A2.2 (numerical).** Throat families with ε = 0.2, 0.01, 0.001 (two_scale, long gentle
region) give D/D_ref = 1.000 ± 0.001 at γ = √(2/ε); the sampled-integral version agrees within
0.5 %. Ellis: 0.25 at the throat (variation length 0.71 r0), and D grows ∝ r⁴ in its
negative-energy tail (exotic matter extending to infinity is excluded more strongly).

**Result A2.3 (escape channels).** D can fall below the smooth-throat value only through a length
scale much smaller than r0 inside the exotic region:
- thin exotic region of proper thickness a (Compact family, and MT's thin band): D ∝ a³
  (fitted slope 3.0), D/D_ref ≈ 8 (a/r0)³; D = 1 at a ≈ 9 × 10⁻²² m for r0 = 1 m (Ford & Roman's
  ~10⁻²¹ m reproduced); slow travellers receive a tidal impulse ≈ v w_b / r0 (≈ 1 m/s), so this
  channel is tidally survivable; the band's energy density is ≈ −c⁴/(8 G a r0) ≈ −1.5 × 10⁶⁴ J/m³;
- narrow redshift structure (large boost-invariant R_tltl): lowers D only where it acts; any
  redshift hill or well large enough to matter makes the traveller cross at 0.93–0.999 c or turn
  back, with 10¹⁶–10¹⁸ g tides in the cases computed. In the analytic throat model the redshift
  channel requires |R_tltl| ≥ (8π/3) f⁴/l_P², independent of r0 (Planckian).

**Result A2.4 (flat-face rims, analytic).** A smoothed rim of core radius w with excess angle 2π
has ρ ≈ −1/(4πw²) over a region of curvature radius w: D = (8π/3) f⁴ (w/l_P)², so w ≤ 0.35 l_P/f²
(≈ 6 × 10⁻³² m for f = 0.01). The rim must be a Planck-scale negative-tension string; travellers
crossing the flat face away from it feel nothing.

**Result A2.5 (pulsed operation, analytic).** A portal held open for a time τ with stresses
~c⁴/(G r0²): D ~ (cτ)⁴ / (l_P² r0²) ≤ 1 needs τ ≲ √(l_P r0)/c ≈ 10⁻²⁶ s for r0 = 1 m, shorter than
the throat's light-crossing time.

Expectation for Stage B: A2.1's ε-independence is the point most likely to differ from the
literature, if anyone has claimed that b′(r0) → 1 satisfies the Ford–Roman constraints.

## A3. Energy bookkeeping (energy.py)

- Tolman/Komar integrand is a total derivative: (ρ + p_l + 2p_t)4πr²e^Φ = d/dl(r²Φ′e^Φ); for Φ = const
  it vanishes pointwise. Numerically ~10⁻¹⁵ for all families with zero ADM mass.
- **Misner–Sharp sum rule (per mouth):** ∫_{r0}^{∞} 4πr²ρ dr = M_ADM − r0/2. A mouth either has
  mass ≥ r0c²/2G (a black hole of the throat's size: 0.34 Jupiter masses for r0 = 1 m) or contains
  negative energy density with Misner–Sharp content M − r0/2. Static energy density need not be
  negative anywhere if the mouth is heavy; only the NEC must fail.
- Proper-volume integrals ∫ρ dV (both sides): Ellis −(π/2)r0 (−1.11 M_J for 1 m), thin shell / thin
  band −2 r0 (−1.42 M_J), flat-face rim −(π/2)R (−1.11 M_J); all with zero active (Komar) mass. A
  two-scale throat with zero ADM mass has ∫ρ dV = +74.6 r0 (positive).
- **ANEC along the radial null geodesic** (k^t = 1 at infinity): ∫T_kk dλ = ∫e^{−Φ}(ρ + p_l)dl =
  −(1/4π)∫e^{−Φ}(r′/r)²dl < 0 for every static spherically symmetric wormhole (the Raychaudhuri
  defocusing identity written out). Ellis: −1/(8r0) → −1.5 × 10⁴³ J/m² for 1 m. Verified to the
  integration tail.

## A4. Stability (stability.py)

**Result A4.1.** Linearising Einstein–phantom-scalar about Ellis in the gauge δφ = 0 (regular,
since φ0′ ≠ 0), the constraints give δc = δR′/R0′, δa = δc − 2δR/R0 and

  δR_tt = δR_xx − (2/x) δR_x + (2x² + b²)/(x² + b²)² δR.

δR = R0 (a change of b with the compensating x-shift) is an exact static solution, which checks
the equation. The single even unstable mode has s = 1.181973 c/b (e-folding time 0.846043 b/c =
2.822 ns for b = 1 m), found by four independent methods: shooting with Wronskian matching
(1.1819727), finite-difference matrix (1.182028 at N = 4000, second-order convergence, Richardson
1.181972), Chebyshev collocation in z = x² (1.1819735 at N = 220) and time-domain evolution
(1.18215 at N = 3000).
Expectation: matches the 0.846 b/c quoted in phase I from Gonzalez, Guzmán & Sarbach (2009).

**Result A4.2 (thin shells).** Rederived V″(a0) for Schwarzschild thin-shell wormholes: massless
(M = 0) shells are stable only for β² < −1/2 at any radius; for M > 0 the condition is β² > ~3.5
near a0 → 2M, switching at a0 = 3M to β² < −3.2 … −0.65 (a0 = 3.5M … 10M).

**Result A4.3 (delayed feedback).** For a mode q̈ = s²q under delayed PD control, the
pseudospectral root computation gives stabilisability iff sτ < √2 (boundary found at 1.414, with
the optimal gains degenerating there), i.e. τ < 1.196 b/c ≈ 4.0 ns for the 1 m Ellis throat.
Pure proportional control cannot stabilise a second-order mode at all.

**Result A4.4 (parametric/Kapitza driving, new computational experiment).** Single-mode theory
(Mathieu) and the averaged operator both predict stabilisation for drive amplitude a ≥ √2 s Ω
(single-mode threshold within 0.4–5 % of that). The full linear field equation does not follow:
over 5 drive profiles × 3–5 frequencies × 14–16 amplitudes, no run was stable; the best
(broad drive, Ω = 80–160 s, a ≈ 1.1 × √2 s Ω) suppresses the original mode but leaves a late
instability whose rate (0.06–0.9 c/b) depends on resolution, so its value is not converged.
Cost even at the best point: oscillating exotic stress ≈ 10² × the static support at ~5–9 GHz
for a 1 m throat. Recorded as: stabilisation not demonstrated; leading-order averaging misleading.

Traveller-triggered collapse (estimate): a perturbation of fractional size δ grows to O(1) in
t ≈ (1/s) ln(1/δ); δ = Gm/(r0c²) for m = 70 kg, r0 = 1 m gives ≈ 160 ns; Planck-scale seeds
(δ = l_P/r0) give an upper bound on an uncontrolled lifetime of ≈ 68 r0/c (≈ 230 ns for 1 m).

## A5. Chronology (chronology.py)

Formulation: a network of short-throat links is a directed graph (external edges d_ij/c; link
edges Δ_k + L/c and −Δ_k + L/c); closed causal curves exist iff a cycle has weight ≤ 0;
equivalently iff no "time function" T on the mouths satisfies T_b − T_a = Δ_k and
T_j − T_i ≤ d_ij/c. Drift: Δ_k(t) = C_k + τ_a(t) − τ_b(t), dτ/dt − 1 = U/c² − v²/2c².
Validated: vertical pair c/g = 353.8 d (any height); 10 m / 0.3 m horizontal pair 32.3 yr;
Floyd–Warshall vs Bellman–Ford 300/300; a Roman-ring configuration (four links, each with a
positive single-pair margin of 3.3 μs) is a time machine as a whole.
Launched mouth (speed βc, then at rest): remaining margin fraction 1 − (1 − √(1 − β²))/β
(0.95 at 0.1c, 0.37 at 0.9c, 0.13 at 0.99c): never a time machine by itself, but close to one
when fast.

## A6. Topology change (no code)

**Lemma (local creation), within Morse topology change.** In a Morse spacetime (Lorentzian metric
g = |∇f|²h − ζ df⊗df, ζ > 1, degenerate only at critical points of f), the gradient flow lines of
f are timelike. The attaching sphere of an index-λ critical point p (the boundary of its
descending disc) is swept out by flow lines that end at p, so every point of it lies in the causal
past of p. Hence a handle created at p joins regions that were all in p's past light cone, and
both mouths emerge at p. A topology change cannot connect two regions that are not both in the
causal past of a single event; a connection between distant places must be built by creating it
locally and transporting a mouth. Corollary: in this framework "direct creation" reduces to
"create locally + transport"; outside it, classical topology change needs closed timelike curves
(Geroch 1967) or degenerate metrics.
Note: the S²×S¹ handle can be built either with a 1-handle (index 1, "causally discontinuous" in
the Borde–Sorkin–Dowker classification) or with a 2-handle on an unknot (index 2, causally
continuous). Expectation for Stage B: the classification is in Dowker & Surya (1998) and Dowker,
Garcia & Surya (2000); the local-creation lemma is likely implicit there.

## A7. Predictions to be checked in Stage B
1. GGS 2009 eigenvalue ↔ 1.18197 c/b.  2. Poisson–Visser stability regions ↔ A4.2.
3. Ford–Roman 1996 band thickness and whether a boost-optimised, ε-independent throat bound
   appears there.  4. Kuhfittig-type claims that b′(r0) → 1 evades the FR constraints.
5. Visser 1997 Roman ring ↔ A5.  6. Stépán's √2 critical delay.  7. Prior work on parametric
   stabilisation of wormholes (expect none).  8. Dowker–Surya index classification of handle
   creation.  9. Misner–Sharp mouth-mass statement (expect known in some form).
   10. "Cosmic-string loops are straight" (thin-loop consistency of curved rims).
