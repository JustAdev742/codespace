# Stage B: Penrose inequality, positive mass and wormholes (prior art and verification)

Written 2026-10-20. Scope: Q1 (exact statements of Huisken–Ilmanen 2001 and Bray 2001; the
time-symmetric constraint R = 16πρ), Q2 (has anyone applied the Riemannian Penrose inequality or the
positive mass theorem to wormholes?), Q3 (topology of the region outside the outermost minimal surface).
Quotes are verbatim from the text I read. TeX ligatures are normalised and maths is transcribed in plain
text (sqrt, ≥, Σ). Where a radical sign was lost in text extraction I checked the rendered page image
(marked "page image checked"). Units: G = c = 1 unless stated.

Access status legend: **FULL** = full text read (or searched end to end, with the relevant sections read);
**ABS** = abstract only; **NOT** = not accessed.

---

## Q1. The Riemannian Penrose inequality: statements and hypotheses

### Huisken & Ilmanen, "The inverse mean curvature flow and the Riemannian Penrose Inequality"
J. Differential Geom. 59 (2001) 353–437, DOI 10.4310/jdg/1090349447. **FULL**: the published JDG PDF
from the EMIS mirror, https://www.maths.tcd.ie/EMIS/journals/NYJM/jdg/p/2001/59-3-1.pdf (85 pp.; Project
Euclid's own PDF was blocked by bot protection). I read §0 and §4 and searched the rest. Page image of
p. 356 checked.

- Abstract: "Let M be an asymptotically flat 3-manifold of nonnegative scalar curvature. The Riemannian
  Penrose Inequality states that the area of an outermost minimal surface N in M is bounded by the ADM
  mass m according to the formula |N| ≤ 16πm². We develop a theory of weak solutions of the inverse mean
  curvature flow, and employ it to prove this inequality for each connected component of N using Geroch's
  monotonicity formula for the ADM mass."
- Asymptotic flatness (p. 355): (0.1) |g_ij − δ_ij| ≤ C/|x|, |g_ij,k| ≤ C/|x|², and "(0.2) Rc ≥ −Cg/|x|²".
  The ADM mass is (0.3), the usual flux integral.
- **Main Theorem** (p. 356): "Let M be a complete, connected 3-manifold. Suppose that: (i) M has nonnegative
  scalar curvature. (ii) M is asymptotically flat satisfying (0.1) and (0.2), with ADM mass m. (iii) The
  boundary of M is compact and consists of minimal surfaces, and M contains no other compact minimal
  surfaces. Then (0.4) m ≥ sqrt(|N|/16π), where |N| is the area of any connected component of ∂M. Equality
  holds if and only if M is isometric to one-half of the spatial Schwarzschild manifold."
- Definition of outermost (p. 353): "A minimal surface is called outermost if it is not separated from
  infinity by any other compact minimal surface."
- On connectedness (p. 357): "Our result allows ∂M to be disconnected, but only applies to each connected
  component of ∂M. This limitation seems to be fundamental, due to the use of the Gauss-Bonnet formula in
  deriving the Geroch Monotonicity formula."
- **Shielding caveat** (p. 357): "Condition (iii) ensures that ∂M is not shielded from spacelike infinity
  by a smaller minimal surface further out. It is easy to construct a rotationally symmetric example of
  positive scalar curvature in which the inequality holds for the "outermost" minimal surface, but fails
  for arbitrarily large minimal surfaces hidden beyond the outermost one. (See Figure 1.)"
- Physical reading (pp. 357–358): "The positive scalar curvature of M corresponds to the physical
  hypothesis of nonnegative energy density on L, expressed by the so-called weak energy condition ([43,
  107]), provided that M is a maximal hypersurface in L (see [4]). If M is totally geodesic in L (at least
  along N), then the minimal surface N corresponds to a so-called closed trapped surface that presages the
  formation of a space-time singularity and ultimately a black hole [44, 43, 107]." Penrose's slice is
  described as "the momentarily static (i.e., totally geodesic) initial slice".
- Footnote 1 (p. 357), on Bray: "Bray [12] has recently proven the most general form of the Riemannian
  Penrose Inequality, namely 16πm² ≥ |∂M| with no connectedness requirement on ∂M."
- Note: the theorem is stated for the *exterior region* M, a manifold with boundary. R ≥ 0 is assumed only
  on M, so nothing is assumed inside the outermost minimal surface.

### Bray, "Proof of the Riemannian Penrose inequality using the positive mass theorem"
J. Differential Geom. 59 (2001) 177–267, DOI 10.4310/jdg/1090349428. **FULL**: the published JDG PDF
from EMIS, https://www.maths.tcd.ie/EMIS/journals/NYJM/jdg/p/2001/59-2-1.pdf ("Received December 6,
1999"), and arXiv math/9911173v1 (titled "...Riemannian Penrose *Conjecture*...", marked "Preliminary
version"; only v1 exists). I read §§1–3 and searched the rest. Page images of pp. 180 and 185 checked.

- Abstract (JDG): "if we consider a Riemannian 3-manifold as a totally geodesic submanifold of a space-time
  in the context of general relativity, then outermost minimal spheres with total area A correspond to
  apparent horizons of black holes contributing a mass sqrt(A/16π), scalar curvature corresponds to local
  energy density at each point, and the rate at which the metric becomes flat at infinity corresponds to
  total mass (also called the ADM mass)."
- Asymptotic flatness (p. 180): "outside a compact set, is the disjoint union of one or more regions (called
  ends) diffeomorphic to (R³\B1(0), δ) ... The Positive Mass Theorem and the Penrose Conjecture are both
  statements which refer to a particular chosen end of (M³, g)."
- Riemannian PMT (p. 181): "Let (M³, g) be a complete, smooth, asymptotically flat 3-manifold with
  nonnegative scalar curvature and total mass m. Then (5) m ≥ 0, with equality if and only if (M³, g) is
  isometric to R³ with the standard flat metric."
- Outermost (p. 181): "An outermost minimal surface is a minimal surface which is not contained entirely
  inside another minimal surface. Again, there is a chosen end of M³ ... it follows from a stability argument
  [43] that outermost minimal surfaces are always spheres."
- The Riemannian Penrose Conjecture (p. 182): "Let (M³, g) be a complete, smooth, asymptotically flat
  3-manifold with nonnegative scalar curvature and total mass m whose outermost minimal spheres have total
  surface area A. Then (6) m ≥ sqrt(A/16π), with equality if and only if (M³, g) is isometric to the
  Schwarzschild metric (R³\{0}, s) of mass m outside their respective horizons."
- **Theorem 1** (main result, p. 185): "Let (M³, g) be a complete, smooth, asymptotically flat 3-manifold
  with nonnegative scalar curvature, total mass m, and an outer minimizing horizon (with one or more
  components) of total area A. Then (11) m ≥ sqrt(A/16π) with equality if and only if (M³, g) is isometric
  to a Schwarzschild manifold outside their respective outermost horizons." Bray adds that "outermost
  horizons are always strictly outer minimizing", which makes Theorem 1 "a slight generalization of the
  Riemannian Penrose Conjecture".
- Relevant to wormholes (Definition 4 ff., p. 185): "A horizon of (M³, g) is any zero mean curvature
  surface in S. ... by minimizing area over surfaces in S, a horizon is guaranteed to exist when M³ has more
  than one end."
- As stated, Theorem 1 assumes R ≥ 0 on the whole complete M³. In his worked Schwarzschild example
  (p. 249) Bray writes: "Since the flow does not change the metric inside the horizon, we will define this
  metric to have its horizon as a boundary, which is always allowable."

### Check of the caller's summary
| Claim | Verdict |
|---|---|
| AF complete 3-manifold | Yes. HI: complete, connected, with compact minimal boundary (the exterior region), AF in the sense of (0.1) and (0.2). Bray: complete, smooth, AF, one or more ends, with a chosen end. |
| R ≥ 0 | Yes. HI need it only on the exterior region. Bray's theorem statement assumes it on all of M³. |
| Outermost minimal surface, connected for HI, possibly disconnected for Bray | Needs refining. HI allow ∂M to be disconnected, but the bound uses the area of **any one connected component**. Bray uses the **total** area of all components of an outer-minimizing horizon. |
| M_ADM ≥ sqrt(A/16π) | Yes, in both papers. Equality holds only for (half) spatial Schwarzschild. |

### The time-symmetric constraint R = 16πρ: confirmed
- Bray, JDG eq. (2) (p. 180; Einstein equation (1) is G = 8πT): "µ = (1/8π) G⁰⁰ = (1/16π) [R − Σ h^ij h_ij
  + (Σ h^i_i)²]", where "R is the scalar curvature of the metric g, µ is the local energy density". Then:
  "Thus we see that if we restrict our attention to 3-manifolds which have zero second fundamental form h
  in N³ [sic, N⁴], the constraint equations are equivalent to the condition that the Riemannian manifold
  (M³, g) has nonnegative scalar curvature everywhere." Setting h = 0 gives **R = 16πµ**.
- Hochberg & Visser 1997 (PRD 56, 4745; arXiv gr-qc/9704082; **FULL**), §2. For any static metric
  ds² = −exp(2φ)dt² + g_ij dx^i dx^j, they work "using an orthonormal basis attached to the fiducial
  observers (FIDOS)" and give eq. (14): "G_t̂t̂ = +½ (3)R". So ρ_static = G_t̂t̂/8π = R/16π.
- Hafemann & Kontou 2025 (arXiv 2504.19794v2; **FULL**), p. 6: µ = ½(R_g − |K|² + (tr K)²), and "µ/8π and
  J/8π represent the physical matter fields". Also: "The case K ≡ 0 is referred to as time-symmetric (or
  Riemannian) and the DEC (9) reduces to R_g ≥ 0." On their static examples they write "The constant
  t-slices are time-symmetric".
- **Verdict.** For K_ij = 0, R ≥ 0 at a point if and only if the energy density measured by the normal
  observer there is ≥ 0. On a t = const slice of a static spacetime the normal observers are the static
  observers (HV's FIDOs). Two limits on this. (a) It constrains only that one observer family: J = 0, so
  the DEC on the slice reduces to µ ≥ 0, and boosted observers are not covered. (b) For K ≠ 0 the
  equivalence fails. On a maximal slice (tr K = 0), R = 16πµ + |K|² ≥ 16πµ, so µ ≥ 0 still gives R ≥ 0
  (HI's "provided that M is a maximal hypersurface"). For general K the WEC alone is not enough: Jaracz,
  CQG 40 (2023) 025005 (arXiv 2206.12951; **ABS**) gives "a spherically symmetric asymptotically flat
  initial data set satisfying the weak energy condition which violates the 'usual' formulations of the
  Penrose conjecture" and also "a counter example to the positive mass theorem assuming the weak energy
  condition".

---

## Q2. Has the RPI or the PMT been applied to wormholes?

**Short answer.**
- **Not found:** any paper applying the general (non-spherical) Huisken–Ilmanen or Bray inequality to a
  traversable-wormhole throat to conclude negative energy density when M < sqrt(A/16π). I also found no
  use of the phrase "Riemannian topological censorship".
- **Found:** (1) the positive mass theorem explicitly extended to "wormholes in the initial-data set"
  (Schoen–Yau 1979); (2) several spherically symmetric versions of exactly the mass–throat statement,
  including one phrased as a Penrose inequality and applied to a wormhole throat; (3) throat-local energy
  theorems; (4) an initial-data version of topological censorship.

### Positive mass theorem with wormholes
- **Schoen & Yau**, "On the proof of the positive mass conjecture in general relativity", CMP 65 (1979)
  45–76 (scan in Yau's collected works,
  https://archive.ymsc.tsinghua.edu.cn/pacm_download/59/11027-Shing-Tung_Yau_7.pdf; **FULL**: abstract and
  §§0–1 read, p. 48 page image checked). Abstract: "We can generalize our result to admit wormholes in the
  initial-data set. In fact, we show that the total mass associated with each asymptotic regime is
  non-negative with equality only if the space-time is flat." Theorem 1: "Let ds² be an asymptotically flat
  metric on an oriented 3-manifold N. If R ≥ 0 on N, then the total mass of each end is nonnegative."
  Theorem 2: "Suppose for some end N_k, (1.2) is satisfied and the total mass of N_k is zero. If R ≥ 0 on
  N, then ds² is flat. In fact, N is isometric to R³ with the standard metric." Their AF definition allows
  boundary components of positive mean curvature.
- **Cramer, Forward, Morris, Visser, Benford & Landis**, PRD 51 (1995) 3117 (arXiv astro-ph/9409051;
  **FULL**): "in hypothesizing the existence of such a wormhole, one has to abandon the averaged null energy
  condition [1,2]. Therefore, the hypotheses underlying the positive mass theorem no longer apply and there
  is nothing, in principle, to prevent the occurrence of negative total mass [7]."
- **Misner**, "Wormhole initial conditions", Phys. Rev. 118 (1960) 1110 (**ABS** via INSPIRE): "Initial
  conditions for the source-free Einstein equations are exhibited which represent, in a singularity-free
  manner on a manifold with the topology of Wheeler's "wormhole," two neutral objects of equal positive
  masses instantaneously at rest."

### Spherically symmetric mass–throat relations (closest prior art)
- **Visser, Kar & Dadhich**, PRL 90 (2003) 201102 (arXiv gr-qc/0301003v2; **FULL**, p. 2 image checked).
  Eq. (8): "The basic volume-integral theorem relates the asymptotic mass to the throat radius r0 and the
  density by m∞ = r0/2 + ∫_{r0}^∞ 4π r² ρ(r) dr ... This is a simple generalization of the ordinary mass
  formula for relativistic stars to traversable wormholes." Eq. (10), both sides with dV = 4πr²dr:
  "∮ ρ dV = 2m∞ − r0". Eq. (7), radial ANEC integral: "I = −(1/4π) ∮ (1/r²) e^{−φ} sqrt(1 − b/r) dr < 0",
  credited to "pp. 133-134 of [4]" (Visser's book, **NOT** accessed). "Specialization 1: Spatial
  Schwarzschild ... b(r) → 2m = r0. Then ρ = 0 throughout the spacetime". Here the ANEC violation sits in
  p_r. Intro: "You cannot get large negative asymptotic mass from infinitesimal weak energy condition [WEC]
  violations."
- **Hafemann & Kontou**, "Penrose inequality for integral energy conditions", CQG 42 (2025) 195016 (arXiv
  2504.19794v2; **FULL**: §§2–4 read).
  - Corollary 3.2, spherical, |J| = 0, ∂M an outermost MOTS: "The S-DEC ... is violated, i.e.,
    ∫_{r0}^∞ r^{d−1} µ dr < 0, if and only if the Penrose inequality is reversed, m_ADM < ½ (A_min(∂M)/ω_{d−1})^{(d−2)/(d−1)}".
    For d = 3 the right side is sqrt(A/16π).
  - Corollary 3.3 gives the Riemannian version: "If ∂M is the outermost minimal surface and (M, g) has
    S-ADEI bounded below by K".
  - They apply it to a horizonless static metric (Beltrán-Palau, del Río & Navarro-Salas 2023): "The
    coordinate singularity r0 corresponds to a wormhole throat and is a minimal surface. Therefore, this
    surface is still suitable for our result and can be used to relate its area to the ADM mass. The
    constant t-slices are time-symmetric ... the scalar curvature is pointwise negative everywhere, so it
    violates the S-DEC and then the classical Penrose inequality".
  - Footnote 8, on VKD Specialization 1: "the t constant slices (K ≡ 0) satisfy µ = 0 but the ANEC is
    violated ... These examples confirm that the ANEC and the S-DEC are independent conditions."
  - Their proof's identity (37), with J = 0, is m(∞) − m(r0) = (1/(d−1)) ∫ r^{d−1} µ dr. This is the same
    sum rule as VKD (8).
- **Weinbaum**, "Obstructions to traversable wormholes in Einstein-Dirac theory", arXiv 2607.28738v1
  (**FULL** read of v1, §V.A; INSPIRE lists PRD 114, 084004 (2026), not checked). "Theorem V.1. All static,
  spherically symmetric, asymptotically flat traversable wormhole solutions to the Einstein-Dirac equations
  have ADM mass bounded below by half the (nearest) throat radius; in particular, the ADM mass is positive
  at each asymptotic end." The proof uses the Misner–Sharp mass, M(throat) = r/2 and T_t̂t̂ > 0. He states:
  "The usual positive mass theorem does not apply here, as it relies on the dominant energy condition".
- **Maeda**, CQG 39 (2022) 075027 (arXiv 2107.07052; **FULL**: §2 read). The Misner–Sharp mass "takes the
  positive maximum value m_MS(0) = l/(2G)" at the throat. Footnote 1: "even a wormhole with positive ADM
  masses evaluated at both spacelike infinities is possible with non-positive energy density everywhere.
  Such an example can be constructed by gluing two Schwarzschild spacetimes ... the negative energy density
  is localized only at the throat. Of course, these wormholes do not conflict with the positive mass
  theorem [30–33]".
- **Visser**, NPB 328 (1989) 203 (arXiv 0809.0927; **FULL**). Thin-shell Schwarzschild wormhole with throat
  a > 2M: "σ = −(1/2πa) sqrt(1 − 2M/a) ... Note that the energy density is negative." Conclusion:
  "(global) stability of the wormhole against collapse requires that the gravitational mass of the wormhole
  as seen by an observer at spatial infinity be non–positive." He does not invoke a mass–area inequality.

### Throat-local energy statements
- **Hochberg & Visser 1997** (above; **FULL**). They define the throat as "a 2–dimensional hypersurface of
  minimal area taken in one of the constant-time spatial slices". Also: "Wormhole throats with the topology
  of a sphere will, provided they are convex, at least have positive energy density, but we shall soon see
  that other energy conditions are typically violated." Toroidal throats need ∫ρ ≤ 0 (their eqs. 73–75).
  The paper never mentions ADM mass. Visser & Hochberg, "Geometric wormhole throats" (gr-qc/9710001):
  **FULL** text searched; no mass–area statement found.
- **Ida & Hayward**, PLA 260 (1999) 175 (arXiv gr-qc/9905033v2; **FULL**). Static wormholes are
  "compact orientable minimal surfaces embedded in the hypersurface orthogonal to the Killing vector field",
  with µ = G(u,u)/8π for u along the Killing vector. Strong flare-out gives U ≤ χ_e/4: "if H is a double
  torus or has higher genus then µ must be negative somewhere on H". In the discussion: "The Hawking energy
  is actually positive on a wormhole horizon with spherical topology, taking the value sqrt(A/16π). The
  asymptotic energies may also be positive in a wormhole spacetime." Also: "one could arrange for the
  negative energy density to be confined to a small region around the wormhole, surrounded by large
  quantities of positive energy yielding a positive total energy which is as large as one pleases."
  They do not connect this to Geroch monotonicity or the RPI.
- **Hayward**, PRD 79 (2009) 124001 (arXiv 0903.5438; **FULL**). A static mouth is "strictly minimal in the
  static hypersurface"; "The Morris-Thorne metric is singular at the wormhole throat r ≅ 2m"; "Negative
  energy density: the null energy condition is necessarily violated on a wormhole mouth." This is an NEC
  statement.

### Topological censorship (spacetime and initial data)
- **Friedman, Schleich & Witt**, PRL 71 (1993) 1486 (**ABS**, gr-qc/9305017): "All 3-manifolds are known to
  occur as Cauchy surfaces of asymptotically flat vacuum spacetimes and of spacetimes with positive-energy
  sources. We prove here the conjecture that general relativity does not allow an observer to probe the
  topology of spacetime: any topological structure collapses too quickly to allow light to traverse it."
- **Eichmair, Galloway & Pollack**, "Topological censorship from the initial data point of view",
  J. Differential Geom. 95 (2013) 389–405 (arXiv 1204.0278v2; **FULL**).
  - "We expect that nontrival [sic] topological structures such as throats joining different universes
    pinch off and form singularities."
  - Their sign convention gives θ± = tr_Σ K ± H, so when K = 0 a minimal surface is a MOTS.
  - Theorem 3.2: a MOTS together with the NEC, the generic condition and a non-compact Cauchy surface
    implies null incompleteness.
  - "For time-symmetric data, MOTSs are the same as minimal surfaces. In this special case, the conclusion
    of Theorem 4.1 follows from the work of Meeks-Simon-Yau".
  - Their example of an immersed MOTS is the RP³ geon.
  - Theorem 5.1 (see Q3) assumes no energy condition.
- **Andersson, Dahl, Galloway & Pollack**, Asian J. Math. 22 (2018) 863–881 (arXiv 1508.01896; **ABS**).
  The abstract presents the result as "an extension of the initial data topological censorship theorem,
  established in [EGP13] in dimension n=3, to higher dimensions", under the DEC.
- **Galloway, Schleich, Witt & Woolgar**, PLB 505 (2001) 255 (hep-th/9912119; **ABS**). This is the AdS
  setting: "V does not contain any wormholes or other compact, non-simply connected topological
  structures."
- **Gibbons**, "The time symmetric initial value problem for black holes", CMP 27 (1972) 87–102 (**ABS**
  via INSPIRE, Springer-sourced; full text blocked): "if a solution contains marginally trapped surfaces
  these correspond to minimal surfaces lying inside the black holes. Such minimal surfaces must have
  spherical topology. ... "Wormholes" are also briefly discussed." What the paper says about wormholes is
  unknown to me.
- Lead only: **Smirnov**, time-symmetric data for two mouths of a phantom-scalar wormhole (arXiv 2312.09622;
  INSPIRE lists Grav. Cosmol. 30 (2024) 289). Searched, not read in full. It states without proof in the
  part read: "if the ADM masses of such spacetimes are positive, then the end state of the evolution is a
  black hole, regardless of stability issues." Not used.
- **NOT** accessed: Visser, *Lorentzian Wormholes* (1995); Galloway, J. Phys. A 16 (1983) 1435 ("Minimal
  surfaces, spatial topology and singularities in space-time"; citation from a search snippet only, contents
  unknown).

### Search terms used
"Penrose inequality" wormhole throat minimal surface negative energy density · "positive mass theorem"
traversable wormhole time-symmetric initial data negative energy density throat · "topological censorship
from the initial data point of view" · "Riemannian topological censorship" · "wormhole" "Riemannian Penrose
inequality" ADM mass throat area scalar curvature · "positive mass theorem with arbitrary ends" wormhole ·
"inverse mean curvature flow" OR "Hawking mass" wormhole throat ADM mass · wormhole "ADM mass" "half the
throat radius" · "Penrose inequality" "Ellis wormhole" OR "Morris-Thorne" · wormhole initial data "positive
mass" "multiple ends" · Visser "Lorentzian Wormholes" "positive mass theorem" · Gibbons 1972 time symmetric
initial value problem. I also searched the full texts of Bray (both versions), HI, the Mars review
(arXiv 0906.5566) and the Bray–Chruściel review (gr-qc/0312047) for "wormhole", "throat" and
"Einstein–Rosen". HI's paper contains none of these terms. In Bray, Mars and Bray–Chruściel the only hits
were "neck" or a reference title (Isenberg–Mazzeo–Pollack, "Gluing and wormholes for the Einstein
constraint equations"), not a wormhole energy argument.

### What this means for the project (my inferences, not claims made by the sources)
1. **Stage A item A3 is prior art in spherical symmetry.**
   - The per-mouth Misner–Sharp sum rule ∫_{r0}^∞ 4πr²ρ dr = M_ADM − r0/2 is VKD 2003 eq. (8).
   - The two-sided r²dr form is VKD eq. (10).
   - The "iff" form "M < sqrt(A/16π) ⟺ ∫r²ρ < 0" is HK 2025 Cor. 3.2/3.3.
   - The contrapositive for T_t̂t̂ > 0 is Weinbaum Thm V.1.
   - The A3 radial ANEC identity is VKD eq. (7).
   - "Heavy mouth, ρ ≥ 0 everywhere, only the NEC fails" is VKD Specialization 1 (ρ = 0, M = r0/2). That
     case is the RPI equality case, consistent with Bray's and HI's rigidity statements.
2. **Non-spherical generalisation, which I did not find stated for wormholes:**
   - Setting: a K = 0 slice, a chosen end, and Σ the outermost minimal surface relative to that end.
   - If M_end < sqrt(|Σ_i|/16π) for some component Σ_i (HI), or M_end < sqrt(|Σ|/16π) (Bray), then
     R < 0 somewhere in that end's exterior region. So ρ_static < 0 somewhere between Σ and that end's
     infinity.
   - For a throat that is outermost relative to both ends and has both masses below sqrt(A/16π),
     negative static energy density must therefore occur on both sides.
   - This is only an existence statement. Unlike the spherical case, there is no integral identity.
   - "Outermost" matters: HI's Fig. 1 shows the inequality can fail for hidden larger minimal surfaces.
3. **Two-ended slices with R ≥ 0 have strictly positive mass at each end.** This follows from Schoen–Yau
   Thm 1–2: zero mass at an end satisfying (1.2) forces N = R³, which has a single end. So a zero-mass
   wormhole such as Ellis needs R < 0, i.e. ρ_static < 0, somewhere. Visser's 1989 thin shell
   (M < a/2, σ < 0) is consistent with item 2.
4. **Arithmetic slip in Stage A.** A3 gives r0c²/2G for r0 = 1 m as 0.34 Jupiter masses. It is 6.73e26 kg
   = **0.355 M_J** (CODATA G; M_J = 1.898e27 kg). A3's own −1.11 M_J (Ellis) and −1.42 M_J (thin shell)
   figures are consistent with 0.355.

---

## Q3. Topology of the region outside the outermost minimal surface

- **Huisken–Ilmanen 2001, §4, Lemma 4.1** (p. 392; **FULL**):
  - "(i) The topological boundary of the trapped set K consists of smooth, embedded minimal 2-spheres. The
    metric completion, M, of any connected component of M \ K is an "exterior region", that is, M is
    connected and asymptotically flat, has a compact, minimal boundary, and contains no other compact
    minimal surfaces (even immersed)."
  - "(ii) A 3-dimensional exterior region M is diffeomorphic to R³ minus a finite number of open 3-balls
    with disjoint closures. The boundary of M minimizes area in its homology class."
  - Followed by: "**Note that there is no curvature hypothesis.** ... The Lemma embodies various well-known
    theorems in the literature [76, 77, 28], but we sketch the proof for completeness." The references are
    [76] Meeks–Simon–Yau, Ann. of Math. 116 (1982) 621–659; [77] Meeks–Yau, Ann. of Math. 112 (1980)
    441–484; [28] Galloway, "On the topology of Black Holes", CMP 151 (1993) 53–66.
  - The proof of (ii) uses MSY: "any fake 3-cell in M would be surrounded by a least area sphere, which
    would contradict the exterior region hypothesis".
  - In the introduction (p. 357), "exterior region" is defined via (i)–(iii), which include R ≥ 0:
    "An exterior region has the topology of R³ minus a finite number of balls, and its boundary consists
    of area-minimizing 2-spheres. These facts, well known in the literature, are collected in Section 4."
- **Eichmair–Galloway–Pollack 2013** (**FULL**):
  - p. 7: "For time-symmetric data, MOTSs are the same as minimal surfaces. In this special case, the
    conclusion of Theorem 4.1 follows from the work of Meeks-Simon-Yau [32], who prove that an
    asymptotically flat 3-manifold that is not diffeomorphic to R³ contains a stable minimal sphere or
    projective plane."
  - Theorem 5.1: "Let (V, h, K) be a 3-dimensional asymptotically flat initial data set. Assume that every
    component of ∂V is a MOTS, either with respect to the unit normal pointing into V or the unit normal
    pointing out of V. If there are no immersed MOTSs in V \ ∂V, then V is diffeomorphic to R³ minus a
    finite number of open balls." No energy condition is assumed.
  - "In the proof of Theorem 4.1 we rely on the positive resolution of the Poincaré and Geometrization
    conjectures".
- **Meeks, Simon & Yau 1982**: JSTOR scan via
  https://archive.ymsc.tsinghua.edu.cn/pacm_download/59/11039-Shing-Tung_Yau_38.pdf. **FULL** text
  available. I read the introduction, §6 (Theorems 1′, 1″) and §7 (Lemma 4, Theorem 3); the OCR has
  dropped spaces. Introduction: "We also prove that there exists an embedded sphere of least area enclosing
  a fake cell, provided the complementary volume is not a standard ball, and provided there exists no
  embedded one-sided RP²." In the parts I read, MSY do not state a theorem about asymptotically flat
  manifolds. The AF formulations are HI's and EGP's readings of MSY, using MSY's extension to complete
  manifolds with mean-convex boundary (Theorem 1″).
- **Verdict.** The statement is confirmed, with one correction. The exterior region (outside the outermost
  minimal surface, containing no other compact minimal surfaces) of an AF 3-manifold is diffeomorphic to R³
  minus finitely many open balls, and its boundary components are area-minimising 2-spheres. **R ≥ 0 is not
  needed for this**: HI state it explicitly, and EGP's MOTS version also assumes no energy condition.
  R ≥ 0 is a hypothesis of the Penrose inequality, not of the topology. Cite HI 2001 Lemma 4.1, which
  collects MSY 1982, Meeks–Yau 1980 and Galloway 1993, and EGP 2013 Thm 5.1 for the initial-data/MOTS
  form. The modern proof uses the Poincaré conjecture; HI (1998) used MSY's fake-cell result instead.
  Bray (p. 185) gets the sphericity of outer-minimising horizon components "from the Gauss-Bonnet formula
  and a second variation argument".

---

## Source register
| Source | Identifier | Access |
|---|---|---|
| Huisken & Ilmanen 2001 | JDG 59, 353; EMIS PDF | FULL (§0, §4 read; rest searched) |
| Bray 2001 | JDG 59, 177; EMIS PDF; arXiv math/9911173v1 | FULL (§§1–3 read; rest searched) |
| Schoen & Yau 1979 | CMP 65, 45 | FULL (abstract, §§0–1, theorem page) |
| Meeks, Simon & Yau 1982 | Ann. Math. 116, 621 | FULL text available; intro, §6, §7 read |
| Eichmair, Galloway & Pollack 2013 | JDG 95, 389; arXiv 1204.0278 | FULL |
| Hafemann & Kontou 2025 | CQG 42, 195016; arXiv 2504.19794 | FULL (§§2–4) |
| Visser, Kar & Dadhich 2003 | PRL 90, 201102; gr-qc/0301003 | FULL |
| Weinbaum 2026 | arXiv 2607.28738v1 (INSPIRE: PRD 114, 084004) | FULL (§V.A read; v1) |
| Maeda 2022 | CQG 39, 075027; arXiv 2107.07052 | FULL (§2) |
| Visser 1989 | NPB 328, 203; arXiv 0809.0927 | FULL |
| Hochberg & Visser 1997 | PRD 56, 4745; gr-qc/9704082 | FULL |
| Visser & Hochberg 1997 | gr-qc/9710001 | FULL text searched only |
| Ida & Hayward 1999 | PLA 260, 175; gr-qc/9905033 | FULL |
| Hayward 2009 | PRD 79, 124001; arXiv 0903.5438 | FULL |
| Cramer et al. 1995 | PRD 51, 3117; astro-ph/9409051 | FULL |
| Smirnov 2023/24 | arXiv 2312.09622 | searched; partial |
| Mars 2009 review; Bray & Chruściel review | arXiv 0906.5566; gr-qc/0312047 | FULL text searched only |
| Friedman, Schleich & Witt 1993 | PRL 71, 1486 | ABS |
| Andersson, Dahl, Galloway & Pollack 2018 | Asian J. Math. 22, 863; arXiv 1508.01896 | ABS |
| Galloway, Schleich, Witt & Woolgar 2001 | PLB 505, 255; hep-th/9912119 | ABS |
| Gibbons 1972 | CMP 27, 87 | ABS |
| Misner 1960 | Phys. Rev. 118, 1110 | ABS |
| Jaracz 2023 | CQG 40, 025005; arXiv 2206.12951 | ABS |
| Meeks & Yau 1980; Galloway 1993 (CMP 151); Galloway 1983; Visser 1995 book | | NOT |
