# Stage B: what the literature says on quantum inequalities, wormhole energy and related questions

Compiled 2026-10-20 as the literature side of the Stage B comparison (the Stage A record is
`stage-A-record.md`). This file only reports what the sources say. It does not grade the Stage A
results.

**How this was done.** I downloaded PDFs from arxiv.org and extracted the text with `pdftotext`.
Metadata and abstracts came from the arXiv API, INSPIRE-HEP and Crossref. Text in quotation marks
is copied from the extracted text. Displayed equations are re-typed by me from that text:
`pdftotext` flattens fractions, so the typography differs from the originals, but the equation
numbers are the papers' own. Anything I computed or converted myself is marked **[my note]**.

**Versions.** I read the arXiv versions, which can differ from the journal versions. Two cases
matter here: Ford & Roman 1996 exists on arXiv only as v1 (1995). Kuhfittig's PRD 66 (2002)
paper went onto arXiv only in January 2004 (v2), after it was published.

**Access status labels.** FULL = whole text read. SECTIONS = whole text retrieved and the relevant
sections read (found by keyword search). ABSTRACT = abstract only. NOT ACCESSED = neither text nor
abstract read.

Units follow each paper: mostly hbar = G = c = 1, and Ford & Roman write l_p for the Planck length.

---

## Source register

| Tag | Citation | arXiv | DOI | Access |
|---|---|---|---|---|
| FR96 | L.H. Ford & T.A. Roman (1996), "Quantum field theory constrains traversable wormhole geometries", Phys. Rev. D 53, 5496–5507 | gr-qc/9510071 (v1 only) | 10.1103/PhysRevD.53.5496 | FULL |
| FR95 | L.H. Ford & T.A. Roman (1995), "Averaged energy conditions and quantum inequalities", Phys. Rev. D 51, 4277 | gr-qc/9410043 | not retrieved | SECTIONS (searched for wormhole/warp remarks) |
| K99 | P.K.F. Kuhfittig (1999), "A wormhole with a special shape function", Am. J. Phys. 67, 125–126 | none | 10.1119/1.19206 (Crossref) | NOT ACCESSED (described in FR05 §7.1) |
| K02 | P.K.F. Kuhfittig (2002), "Static and dynamic traversable wormhole geometries satisfying the Ford-Roman constraints", Phys. Rev. D 66, 024015 | gr-qc/0401023 (v2, Jan 2004) | 10.1103/PhysRevD.66.024015 | FULL (arXiv v2) |
| K03 | P.K.F. Kuhfittig (2003), "Can a wormhole supported by only small amounts of exotic matter really be traversable?", Phys. Rev. D 68, 067502 | gr-qc/0401048 | 10.1103/PhysRevD.68.067502 | FULL |
| K05 | P.K.F. Kuhfittig (2005), "Wormholes supported by small amounts of exotic matter: some corrections", preprint (arXiv lists no journal) | gr-qc/0508060 | none | FULL |
| K06 | P.K.F. Kuhfittig (2006), "More on wormholes supported by small amounts of exotic matter", Phys. Rev. D 73, 084014 | gr-qc/0512027 (v2) | 10.1103/PhysRevD.73.084014 | FULL |
| K08 | P.K.F. Kuhfittig (2008), "Viable models of traversable wormholes supported by small amounts of exotic matter", Int. J. Pure Appl. Math. 44, 467–482 | 0806.1194 | not found | FULL |
| K11 | P.K.F. Kuhfittig (2011), "On the feasibility of charged wormholes", Cent. Eur. J. Phys. 9, 1144 | 1104.4662 | 10.2478/s11534-011-0043-2 | ABSTRACT |
| K12 | P.K.F. Kuhfittig (2012), "The compatibility of thin-shell wormholes with quantum field theory", Bull. Calcutta Math. Soc. 104, 415 | 1202.0762 (v4) | not found | SECTIONS |
| FR05 | C.J. Fewster & T.A. Roman (2005), "On wormholes with arbitrarily small quantities of exotic matter", Phys. Rev. D 72, 044023 | gr-qc/0507013 | 10.1103/PhysRevD.72.044023 | FULL |
| FR05b | C.J. Fewster & T.A. Roman (2005), "Problems with wormholes which involve arbitrarily small amounts of exotic matter", contribution to Proc. EPS-13 (Bern 2005) | gr-qc/0510079 | none | FULL |
| VKD03 | M. Visser, S. Kar & N. Dadhich (2003), "Traversable wormholes with arbitrarily small energy condition violations", Phys. Rev. Lett. 90, 201102 | gr-qc/0301003 (v2) | 10.1103/PhysRevLett.90.201102 | FULL |
| KDV04 | S. Kar, N. Dadhich & M. Visser (2004), "Quantifying energy condition violations in traversable wormholes", Pramana 63, 859–864 | gr-qc/0405103 | 10.1007/BF02705207 | FULL |
| Kar22 | S. Kar (2022), "A curious variant of Bronnikov-Ellis spacetime", Phys. Rev. D 105, 024013 | 2112.05440 (v3) | 10.1103/PhysRevD.105.024013 | SECTIONS (§II, ANEC) |
| DAK20 | P. Dutta Roy, S. Aneesh & S. Kar (2020), "Revisiting a family of wormholes: geometry, matter, scalar quasinormal modes and echoes", Eur. Phys. J. C (arXiv: "To appear in EPJC") | 1910.08746 (v3) | not verified | SECTIONS (ANEC section) |
| Ch26 | S. Chakrabarti (2026), "Global Integrated Null Energy Contribution: Classification of Traversable Wormholes", preprint | 2609.39468 | none | SECTIONS |
| HV97 | D. Hochberg & M. Visser (1997), "Geometric structure of the generic static traversable wormhole throat", Phys. Rev. D 56, 4745–4755 | gr-qc/9704082 | 10.1103/PhysRevD.56.4745 | SECTIONS |
| HV98 | D. Hochberg & M. Visser (1998), "Dynamic wormholes, anti-trapped surfaces, and energy conditions", Phys. Rev. D 58, 044021 | gr-qc/9802046 | 10.1103/PhysRevD.58.044021 | SECTIONS (Vaidya-type example) |
| HV98b | D. Hochberg & M. Visser (1998), "The null energy condition in dynamic wormholes", Phys. Rev. Lett. 81, 746 | gr-qc/9802048 | 10.1103/PhysRevLett.81.746 | SECTIONS (searched for "mass": nothing relevant) |
| Hay99 | S.A. Hayward (1999), "Dynamic wormholes", Int. J. Mod. Phys. D 8, 373–382 | gr-qc/9805019 (v3) | 10.1142/S0218271899000286 | FULL |
| Hay09 | S.A. Hayward (2009), "Wormhole dynamics in spherical symmetry", Phys. Rev. D 79, 124001 | 0903.5438 | not retrieved | SECTIONS (§§II–V) |
| IH99 | D. Ida & S.A. Hayward (1999), "How much negative energy does a wormhole need?", Phys. Lett. A 260, 175–181 | gr-qc/9905033 (v2) | not retrieved | SECTIONS |
| AA15 | M. Azreg-Aïnou (2015), "Confined-exotic-matter wormholes with no gluing effects – Imaging supermassive wormholes and black holes", JCAP 07 (2015) 037 | 1412.8282 (v2) | 10.1088/1475-7516/2015/07/037 | SECTIONS (abstract, §II) |
| Lobo08 | F.S.N. Lobo (2008), "Exotic solutions in General Relativity: Traversable wormholes and 'warp drive' spacetimes", in *Classical and Quantum Gravity Research* (Nova, 2008) 1–78 | 0710.4474 | none | SECTIONS |
| FSW93 | J.L. Friedman, K. Schleich & D.M. Witt (1993), "Topological censorship", Phys. Rev. Lett. 71, 1486; Erratum 75, 1872 (1995) | gr-qc/9305017 (v2) | 10.1103/PhysRevLett.75.1872 (erratum DOI as listed on arXiv) | SECTIONS (short paper, searched) |
| MT88 | M.S. Morris & K.S. Thorne (1988), Am. J. Phys. 56, 395–412 | none | not retrieved | NOT ACCESSED (paywalled) |
| MTY88 | M.S. Morris, K.S. Thorne & U. Yurtsever (1988), Phys. Rev. Lett. 61, 1446 | none | not retrieved | NOT ACCESSED |
| V95 | M. Visser (1995), *Lorentzian Wormholes: From Einstein to Hawking* (AIP Press) | none | none | NOT ACCESSED (only cited pages quoted by others) |
| UHIM89 | W.G. Unruh, G. Hayward, W. Israel & D. McManus (1989), "Cosmic-string loops are straight", Phys. Rev. Lett. 62, 2897–2900 | none | 10.1103/PhysRevLett.62.2897 | ABSTRACT (the APS abstract as served by INSPIRE; APS page returned 403) |
| GT87 | R.P. Geroch & J.H. Traschen (1987), "Strings and other distributional sources in general relativity", Phys. Rev. D 36, 1017 | none | 10.1103/PhysRevD.36.1017 | ABSTRACT (INSPIRE) |
| BCL97 | B. Boisseau, C. Charmousis & B. Linet (1997), "Dynamics of a self-gravitating thin cosmic string", Phys. Rev. D 55, 616 | gr-qc/9607029 (v2) | not retrieved | SECTIONS (abstract, introduction) |
| V89 | M. Visser (1989), "Traversable wormholes: Some simple examples", Phys. Rev. D 39, 3182–3184 | 0809.0907 (1989 text re-posted 2008) | 10.1103/PhysRevD.39.3182 | FULL |
| C95 | J.G. Cramer, R.L. Forward, M.S. Morris, M. Visser, G. Benford & G.A. Landis (1995), "Natural wormholes as gravitational lenses", Phys. Rev. D 51, 3117–3120 | astro-ph/9409051 | 10.1103/PhysRevD.51.3117 | SECTIONS (introduction) |
| Kr03 | S. Krasnikov (2003), "The quantum inequalities do not forbid spacetime shortcuts", Phys. Rev. D 67, 104013 | gr-qc/0207057 (v3) | 10.1103/PhysRevD.67.104013 | SECTIONS (§§II–III) |
| GV17 | G.W. Gibbons & M.S. Volkov (2017), "Zero mass limit of Kerr spacetime is a wormhole", Phys. Rev. D 96, 024053 | 1705.07787 (v2) | 10.1103/PhysRevD.96.024053 | SECTIONS |
| FLM21 | J.C. Feng, J.P.S. Lemos & R.A. Matzner (2021), "Self-collision of a portal wormhole", Phys. Rev. D 103, 124037 | 2105.03433 (v2) | 10.1103/PhysRevD.103.124037 | SECTIONS (abstract, introduction, §V) |
| Rom04 | T.A. Roman (2004), "Some thoughts on energy conditions and wormholes", Proc. 10th Marcel Grossmann Meeting (World Scientific, 2005) | gr-qc/0409090 | 10.1142/9789812704030_0236 | SECTIONS (§3.1) |
| FR99 | L.H. Ford & T.A. Roman (1999), "The quantum interest conjecture", Phys. Rev. D 60, 104018 | gr-qc/9901074 | 10.1103/PhysRevD.60.104018 | FULL |
| FT00 | C.J. Fewster & E. Teo (2000), "Quantum inequalities and 'quantum interest' as eigenvalue problems", Phys. Rev. D 61, 084012 | gr-qc/9908073 | 10.1103/PhysRevD.61.084012 | ABSTRACT |
| AV09 | G. Abreu & M. Visser (2009), "Quantum interest in (3+1) dimensional Minkowski space", Phys. Rev. D 79, 065004 | 0808.1931 | 10.1103/PhysRevD.79.065004 | ABSTRACT |
| PF97 | M.J. Pfenning & L.H. Ford (1997), "The unphysical nature of 'Warp Drive'", Class. Quantum Grav. 14, 1743–1751 | gr-qc/9702026 (v3) | 10.1088/0264-9381/14/7/011 | FULL |
| ER97 | A.E. Everett & T.A. Roman (1997), "A superluminal subway: the Krasnikov tube", Phys. Rev. D 56, 2100 | gr-qc/9702049 | 10.1103/PhysRevD.56.2100 | SECTIONS (abstract, §§5–7) |
| FLB09 | S. Finazzi, S. Liberati & C. Barceló (2009), "Semiclassical instability of dynamical warp drives", Phys. Rev. D 79, 124017 | 0904.0141 (v2) | 10.1103/PhysRevD.79.124017 | SECTIONS (abstract, introduction, §§IV–V) |
| FGNR20 | B. Freivogel, D.A. Galante, D. Nikolakopoulou & A. Rotundo (2020), "Traversable wormholes in AdS and bounds on information transfer", JHEP 01 (2020) 050 | 1907.13140 | 10.1007/JHEP01(2020)050 | SECTIONS (abstract, introduction, §2) |
| Kon24 | E.-A. Kontou (2024), "Wormhole restrictions from quantum energy inequalities", Universe 10, 291 | 2405.05963 (v2) | 10.3390/universe10070291 | SECTIONS (§§4–5) |

---

## Q1. Ford & Roman 1996 (FR96): full text read

### (a) Which QI, with which field, sampling function and coefficient

- **Field and state** (§2): "Let ⟨Tµν⟩ be the renormalized expectation value of the stress tensor for a
  free, massless, minimally coupled scalar field in an arbitrary quantum state." The bound comes
  from their Ref. [13] = Ford & Roman, Phys. Rev. D 51, 4277 (1995), and holds in four-dimensional
  Minkowski spacetime without boundaries, along an inertial observer's worldline.
- **The bound** (Eq. (1), re-typed):
  (τ0/π) ∫_{−∞}^{∞} ⟨T_µν u^µ u^ν⟩ dτ / (τ² + τ0²) ≥ −3/(32π² τ0⁴), "for all τ0, where τ is the
  observer's proper time". Later they write c ≡ 3/(32π²) (text after Eq. (50)).
- **Sampling function**: "The Lorentzian function which appears in the integrand is a convenient
  choice for a sampling function, which samples the energy density in an interval of characteristic
  duration τ0 centered around an arbitrary point on the observer's worldline."
- **Use in practice**: in every wormhole application the energy density is treated as constant over
  the sampling time, so the left side becomes ρ (static observers, e.g. Eq. (50)) or ρ′ (boosted
  observers: "Since the energy density does not change much over this timescale", Eq. (58); also
  Eq. (93)).
- **Other fields** (end of §2): "It should be straightforward to generalize the arguments of Ref. [13]
  to the case of other massless fields, such as the electromagnetic field. Although this has not yet
  been done, it is unlikely that the result will be significantly different." On N fields (§6):
  "to get r0 ≈ 1 m, we would need either 10^62 fields or a few fields for which the constant c is
  many orders of magnitude larger than 3/(32 π²)."
- Later context, from FR99 §4.1: "C = 3/(32 π²) in the earlier version of Ref. [20], and
  C = 27/(2048 π²) in the improved version of FE [31]". FE is Fewster & Eveson; its Lorentzian-sampled
  constant is 9/64 of FR's.

### (b) Which observers, and is the speed optimised?

Every wormhole application in FR96 places the observer **at the throat r = r0**. No observer away
from the throat is analysed.

- **Static observer at the throat**, used when ρ0 < 0 (§§4.1, 4.3, 4.5, 5.1). §3: "Note for future
  reference that from Eq. (17), a static observer at the throat of any wormhole is a geodesic
  observer."
- **Radially moving ("boosted") geodesic observer at the throat**, used when the static-frame energy
  density is zero or non-negative (§§4.2, 4.4, 5.2), with ρ′ = γ²(ρ + v² p_r) (Eq. (53)). §4.2:
  "Since the energy density is zero in the static frame, to obtain a bound we boost to the frame of a
  radially moving geodesic observer."
- **Optimisation over v**:
  - Specific examples, optimised. §4.2 (Φ = 0, b = r0): "any non-zero v gives us a bound, but we can
    find the optimum bound by minimizing γ/v, a procedure which yields v = 1/γ = 1/√2 and r0 ≲ lp/f²"
    (Eq. (60)).
  - §4.4 (proximal Schwarzschild), case √(2ǫ) < r0/γ: "By making v arbitrarily close to 1, we can
    make the right-hand side of the bound arbitrarily small" and "our bound must hold for any boosted
    observer". Case √(2ǫ) > r0/γ: "We get the optimum bound by minimizing γ/v", giving
    r0 ≲ lp/(2f²) (Eq. (84)).
  - General case 2 (§5.2), **not optimised**: "The quantity b′0 is fixed by the wormhole geometry,
    whereas our choice of v² is arbitrary, subject to b′0 < v² < 1." The worked numbers use chosen
    speeds (v² = 1 − 10⁻⁹ when b′0 = 1 − 10⁻⁸; v² ≈ 3/4 when b′0 ≈ 1/2). The paper never minimises
    Eq. (95) over v.
  - Casimir illustration (§2): an observer moving at v; the worst case of g(v) is at v = 1/√3, where
    g ≈ 0.42. "Note that the constraint obtained by considering arbitrary v differs only slightly from
    that for static observers, Eq. (6)."

### (c) How the sampling time is chosen, and the value of f

- **Prescription.** Abstract: "the bound should hold in regions small compared to the minimum local
  characteristic radius of curvature or the distance to any boundaries". §2: "we can apply the
  inequality in a curved spacetime so long as τ0 is restricted to be small compared to the local
  proper radii of curvature and the proper distance to any boundaries in the spacetime."
- **Length scales.** Eqs. (34)–(36): r̄0 = b, r1 = b/b′, r2 = Φ/Φ′, r3 = Φ′/Φ″,
  R2 = r2/|Φ| = 1/|Φ′|, and rm ≡ min(r̄0, r1, R2, r3). Eq. (41): rc ≈ 1/√Rmax ≳ rm. At the throat
  r1 = r0/b′0 (Eq. (42)). "We wish to work in a small spacetime volume around the throat of the
  wormhole such that all dimensions of this volume are much smaller than rc, the smallest proper
  radius of curvature anywhere in the region."
- **Static observers: τ0 = f rm.** §4.1: "Choose our sampling time to be: τ0 = f rm = f r0 ≪ rc, with
  f ≪ 1". §5.1 is the same. Absurdly benign wormhole: τ0 = f a0 when a0 < r0, and τ0 = f r0 when
  r0 < a0/2.
- **Boosted observers: τ0 = f rm/γ.** §5.2: "in the boosted frame the curvature component with the
  largest magnitude, R′max, can be no larger than about γ²/rm²", so "let us take our sampling time to
  be: τ0 = f rm/γ ≪ r′c". §4.2 uses τ0 = f r0/γ. §4.4 uses τ0 = f rc ≈ 2f√ǫ, or f r′c with
  r′c ≈ √2 r0/γ.
- **Boundaries.** MTY (flat region between Casimir plates): "Take τ0 = f s", where s is the plate
  separation, following the Casimir analysis of §2. That analysis showed τ0 < 0.42 l1 suffices, where
  l1 = L/γ is the Lorentz-contracted period; it also named a second scale, "the proper time required to
  traverse this distance, l2 = L/(vγ)", and noted that "l1 is the smaller of the two".
- **Values of f.** "A reasonable choice of f is f ≈ 0.01" (§4.3); f ≈ 0.01 is also used in §§4.1, 5.1
  and 5.2. For MTY: "A reasonable choice of f in this case would seem to be f ≈ 0.1".
- **FR's own caveat** (§5.2): "The bound Eq. (95) is a 'safe' bound, but in specific cases it may not
  be the optimal bound, due to our rather conservative condition on R′max, i.e., R′max ≲ γ²/rm², and
  hence on τ0."
- **Related later remark (Kr03, §II).** For the absurdly benign wormhole Krasnikov uses the static-frame
  curvature component R_r̂φ̂r̂φ̂ ≈ 1/(δ r0) to set the scale. He writes that QI then "requires that
  ̺¯χ ≳ −(δr0)^{−2} (as we shall see in a moment, this is a vastly more restrictive condition than
  ̺¯χ ≳ −δ^{−4}, which is considered in [14])", where [14] is FR96. He concludes δ ≲ 1/r0 in Planck
  units, i.e. "of the order of 10^{−35} lPl" for r0 = 1 m. FR96's own Eq. (65) gives
  R_r̂θ̂r̂θ̂|r0 = −1/(a0 r0) − 1/(2r0²).

### (d) The general bound for a Morris–Thorne wormhole, and whether it depends on b′(r0)

§5 analyses an arbitrary static, spherically symmetric MT wormhole near the throat in two subcases,
"1) b′0 < 0, and 2) b′0 ≥ 0". Both bounds depend explicitly on b′0.

- **Case 1, b′0 < 0** (static observer at the throat; Eq. (89): b′0/(8π r0²) ≳ −c/τ0⁴, with τ0 = f rm):
  - Eq. (90): rm ≲ (8πc/|b′0|)^{1/4} √r0 / f
  - Eq. (91), using |b′0| = r0/r1 and 8πc ≈ 1/4: rm ≲ (r0 r1)^{1/4}/f
  - Eq. (92): rm/r0 ≲ (1/f) (r1 lp²/r0³)^{1/4}
  - Numbers: "if r1 ≈ 1 m and for f ≈ 0.01, then r0/r1 ≲ 10^{−21}"; "for r0 ≈ 1 m and f ≈ 0.01,
    r1/r0 ≲ 10^{−21}"; "When rm = r0 = r1: r0 ≲ lp/f²; for f ≈ 0.01, r0 ≲ 10^4 lp ∼ 10^{−31} m."
- **Case 2, b′0 ≥ 0** (boosted observer at the throat):
  - Eq. (94): ρ′0 = γ²(ρ0 + v² p0) = γ² (b′0 − v²)/(8π r0²); "In order for ρ′0 < 0, we must require
    v² > b′0."
  - **Eq. (95): rm/r0 ≲ [1/(v² − b′0)]^{1/4} (√γ / f) (lp/r0)^{1/2}.**
  - "Our bound, Eq. (95), is weakest when b′0 is extremely close to 1. However, this would seem to be a
    highly special case, b′0 = 1 corresponding to the maximum possible positive energy density at the
    throat and to ρ0 + p0 = 0, i.e., the null energy condition Tµν K^µ K^ν ≥ 0, applied to radial null
    vectors is barely satisfied at the throat. The latter implies that such a wormhole 'flares outward'
    very slowly from the throat".
  - Numbers: "Let b′0 = 1 − 10^{−8}, v² = 1 − 10^{−9}, and f ≈ 0.01. For r0 ≈ 1m ≈ 10^35 lp, we find
    that rm ≲ 10^{−11} m. Even for r0 ≈ 1A.U. ≈ 10^46 lp, we obtain rm ≲ 10^{−6} m." For b′0 ≈ 1/2 and
    v² ≈ 3/4: "rm/r0 ≲ 100 (lp/r0)^{1/2}".
  - The allowed range: "For b′0 ≥ 0, 0 ≤ b′0 ≤ 1, since b′0 ≤ 1, which follows from the fact that at
    the throat we must have ρ0 + p0 ≤ 0 [25]."
- **Overall conclusion** (§6): "These discrepancies are typically of order (lp/r0)^n, where r0 is the
  throat radius and n ≲ 1. They imply that generically the exotic matter is confined to an extremely
  thin band, and/or that the wormhole geometry involves large redshifts (or blueshifts)."

### (e) Thickness of the negative-energy band for a 1 m throat

- **Model** (§4.3): the MT "absurdly benign" wormhole. "Classically, one can design a wormhole so
  that the exotic matter is confined to an arbitrarily small region around the throat. MT call this
  an 'absurdly benign' wormhole." It has Φ = 0 and b(r) = r0[1 − (r − r0)/a0]² for
  r0 ≤ r ≤ r0 + a0, and b = 0 for r ≥ r0 + a0 (Eq. (61)). The static observer at the throat sees
  ρ0 = −1/(4π a0 r0) (Eq. (68)). With τ0 = f a0 (case a0 < r0), Eq. (69) gives
  **a0 ≲ (r0/(8 f⁴ lp))^{1/3} lp.**
- **Numbers, f ≈ 0.01**: "For a small 'human sized' wormhole with r0 ≈ 1 m, our bound gives
  a0 ≲ 10^14 lp ≈ 10^{−21} m ≈ 10^{−6} fermi, or approximately a millionth of the proton radius."
  "For r0 ≈ 1 light year, a0 ≲ 2 × 10^19 lp ≈ 0.2 fermi. With r0 ≈ 10^5 light years,
  a0 ≲ 10^21 lp ≈ 10^{−14} m. So even with a throat radius the size of a galaxy, the negative energy
  must be distributed in a band no thicker than about 10 proton radii."
- **Proper versus coordinate thickness**: "In fact, a detailed calculation shows that a0 is the proper
  thickness in this case, to within factors of order unity."
- The reverse case, r0 < a0/2 (Eq. (70)): r0 ≲ (a0/(8f⁴ lp))^{1/3} lp, "i.e., a0 and r0 are simply
  interchanged".

### (f) Exotic matter extending to infinity (Ellis type): not found

I searched the whole text for "infinit", "extend", "Ellis", "everywhere" and "asymptot", and found no
discussion of exotic matter that extends to infinity, nor any claim that such wormholes are more
strongly constrained. The only Ellis-type case is §4.1: "Φ = 0, b = r0²/r Wormholes", "discussed in
Box 2 and the bottom left-hand column of p. 400 of Ref. [1]". There ρ = p_r = −P = −r0²/(8π r⁴)
(Eq. (48)). It is treated only with a static observer at the throat, giving r0 ≲ lp/(2f²) (Eq. (51)),
and "for f ≈ 0.01, r0 ≲ 10^4 lp = 10^{−31} m". The only remark about position is: "Note from Eqs. (48)
and (49) that if we choose our spacetime region to be such that l ≪ r0, then the curvature and
stress-tensor components do not change very much."

### (g) Visser's flat-face / polyhedral wormholes and their rim strings: mentioned only in passing

- §6, on thin shells: "It might seem that our conclusions imply that the most physically reasonable
  wormholes are the 'thin-shell' type [28]. … Physically one does not really expect infinitely thin
  layers of energy density and curvature in nature [29]. … Our results can be construed as placing
  upper bounds on the actual allowed thicknesses of such layers of negative energy density."
- Footnote [29]: "If negative energy density cosmic strings were to exist then they might provide a
  means of localizing negative energy in very small regions. This might allow one to create Visser's
  'cubical wormholes'. [M. Visser, Phys. Rev. D 39, 3182 (1989); see also Sect. 15.1.2 of Ref.[3]]."
- FR96 applies no QI to the rim strings.

---

## Q2. Kuhfittig on satisfying the Ford–Roman constraints

Papers found: K99 (not accessed), K02, K03, K05, K06, K08 (all read in full), K11 (abstract) and K12
(sections). Criticisms of them appear in FR05 and FR05b (see Q3).

### What is claimed, and under what conditions

- **K02 (PRD 66, 024015)**
  - Metric with e^{2α(r)} as g_rr, so b = r(1 − e^{−2α}). The redshift is γ(r) = −κ/r, or γ = −α.
  - §2.3: "This equation shows that ρc² − τ < 0 near the throat (but not necessarily at the throat).
    Moreover, if α(r − r0) is steep enough (i.e., if |α′(r − r0)| decreases fast enough), then the
    interval containing exotic matter can be made as small as necessary to satisfy the quantum
    inequality of Ford and Roman [8]."
  - Condition: "choose α(r − r0) so that |α′(r − r0)| ≤ κ/r² outside the interval [r0, r1] for some
    r1."
  - "With these assumptions, b′(r) is close to unity near the throat, causing the embedding function
    to flare out very slowly, also in agreement with [8]."
  - §3.1: "since b′(r) is likely to be close to unity near the throat, the wormhole will flare out very
    slowly. Consequently, r0 is going to be relatively small; so we may assume that r0 ≈ 0." Example:
    κ = 0.00025 [light years], b = r(1 − e^{−0.0005/r}), a trip of about 80 days.
  - Conclusion: "We have shown that for wormholes to meet the quantum inequality constraints due to
    Ford and Roman [8], the shape function can have the generic form b = r(1 − e^{−2α(r)}), but the
    slope of α is subject to some restrictions."
  - No QI is evaluated for any observer. The only energy-condition quantity is the static-frame radial
    null combination ρc² − τ (Eqs. (12)–(13)).
- **K03 (PRD 68, 067502)**
  - "Proposals to restrict the exotic matter to an arbitrarily thin region are discussed by Kuhfittig
    [6, 7] under the condition that b′(r) be close to unity near the throat."
  - "One of the general bounds for wormhole geometries discussed in Ref. [5], Sec. V, is shown to be
    weakest when b′(r) is close to unity near the throat. Accordingly, we assume that the graph of
    α = α(r) is steep enough near r = r0 to meet this condition." Here [5] is FR96.
  - Choices: α = K^n/(r − r0)^n with n ≥ 1 ("The condition n ≥ 1 ensures that b′(r) ≈ 1 near the
    throat"), and γ = −L^n/(r − r2)^n with 0 < r2 < r0.
  - "To satisfy the Ford-Roman constraints, the WEC must be satisfied outside the interval [r0, r1]
    for some r1." "observe that the Ford-Roman constraints are trivially satisfied" (in the
    approximation γ = −α).
  - "Simple calculator trials show that for any reasonable choice of r1 (and hence of c),
    ∫_Shell (ρ − τ)dV ≪ 10^{−100}, even for n = 1. In fact, this extreme inequality holds even if L^n is
    much larger than K^n and r1 many orders of magnitude larger than the value allowed by the
    Ford-Roman constraints."
  - Conclusion: "The model also accommodates the Ford-Roman constraints—without introducing an event
    horizon at the throat."
  - Numbers: K = 5.0 × 10⁻⁹ light years; space station at r ≈ 6.6 × 10⁸ km; about 6 days to the throat.
- **K05 (gr-qc/0508060, corrections after FR05)**
  - "It was found that two of the Kuhfittig models are seriously flawed by not taking into account the
    proper distances in estimating the size of certain wormholes."
  - New forms: α1 = ln[K/(r − r0)^a] with 0 < a < 1, and γ1 = −ln[L/(r − r2)^b].
  - "since r1 can be arbitrarily chosen, it seems as though the exotic region can be made arbitrarily
    small. Unfortunately, besides producing wormholes with some rather undesirable features [7], a
    small enough region would result in a value of r2 that is too close to r0, resulting, in turn, in a
    large time dilation".
- **K06 (PRD 73, 084014)**
  - Quotes FR96 Eq. (95) as its Eq. (9). With A > 1/2, b′(r0) = 1.
  - "For the right-hand side of inequality (9) to be defined and real, we must have v² > b′0. Since
    b′0 = 1 and v ≤ 1, the inequality is trivially satisfied, thereby removing any concerns about the
    size r0 of the radius of the throat. Of course, the quantum inequality (9) cannot simply be
    circumvented in this manner — there exist other constraints which may be equally severe: (i) as
    noted in Ref. [1], a wormhole for which b′0 = 1 may be unstable and (ii) the exponent B in γ1(r) is
    subject to severe fine-tuning resulting in part from the tidal constraints (MT [7])."
  - Numbers: A = 1/2, r1 − r0 = 10⁻⁶ m, r3 − r0 = 10 m give B = (2 − 1.09 × 10^{−20})^{−1} and a proper
    thickness ℓ(r1) ≈ 1 cm.
  - Summary: "since the derivative of the shape function is unity at the throat, the quantum
    inequalities are trivially satisfied."
- **K08 (Int. J. Pure Appl. Math. 44, 467)**
  - "The quantum inequalities are generalized to be valid, not only at the throat, but in the entire
    exotic region."
  - Quotes FR96 (95) as its Eq. (12): "Inequality (12) is trivially satisfied whenever b′(r0) ≈ 1.
    Accordingly, we will impose this condition to help satisfy the tidal constraints and to obtain
    some of the numerical estimates. The fact remains, however, that according to Ref. [2], since the
    WEC is violated arbitrarily close to the throat, the analysis should be extended". Ref. [2] is FR05.
  - §8 derives Eq. (42) for a boosted observer at radius r near r0, with τ0 = f rm/γ and
    rm ≡ min(b, b/b′, 1/|γ′|, γ′/γ″) (Eq. (40)). Re-typed, with γ′ the redshift derivative and γ the
    Lorentz factor:
    rm/r ≤ [v² b/r − b′ − 2v² r γ′ (1 − b/r)]^{−1/4} (√γ/f) (lp/r)^{1/2}.
    "At the throat, where b(r0) = r0, inequality (42) reduces to inequality (12)."
  - "It is understood that in inequality (42), r is close to r0, so that b′(r) is close to unity. But
    since b′(r) < 1, inequality (12) is not necessarily satisfied for r > r0. Inequality (42), however,
    γ′(r) can be fine-tuned so that the condition is satisfied in the interval [r0, r1]."
  - Results: "approximately 0.1 mm for the proper thickness of the exotic region, corresponding
    roughly to a distance of 100 000 km to the space station". Table 1 (A = 0.5, r1 − r0 = 10⁻⁶ m,
    r3 − r0 = 1 mm) gives ℓ(r1) from 0.0146 cm at n = 0.60 to 0.0114 cm at n = 0.85.
  - Fine-tuning condition (Eq. (22)): 1/2 < A < [1 + √(1 + 8ℓ(r1)²/10^16)]/4. "By decreasing the
    coordinate distance, it is theoretically possible to decrease the thickness of the exotic region
    indefinitely. … the concomitant increase in the degree of fine-tuning would eventually exceed any
    practical limit."
- **K12 (thin-shell paper)**
  - "At the throat, this inequality is trivially satisfied whenever b′(r0) = 1."
  - A second, static-observer form without v (Eq. (20)/(26)): "according to Ref. [2], the boosted
    frame can be replaced by a static observer." Re-typed:
    ℓm/r ≤ [b/r − b′ − 2rΦ′(1 − b/r)]^{−1/4} (1/f)(lp/r)^{1/2}.
  - "So inequality (26) can be satisfied in the neighborhood of the throat, provided that b′(r) remains
    close to 1 (while gradually declining). … The thin-shell wormhole is therefore compatible with
    quantum field theory under fairly general conditions."
  - Also: "According to Ford and Roman [5], the exotic matter must be confined to an extremely thin
    band around the throat. This constraint is amply satisfied for a thin-shell wormhole where the
    throat surface is theoretically infinitely thin."
- **K11 (abstract)**: "This paper modifies the charged wormhole model of Kim and Lee with the aim of
  satisfying an extended version of a quantum inequality due to Ford and Roman."

### Answers to the specific sub-questions

- **Does b′(r0) close to 1 help satisfy the FR constraints?** Yes, that is Kuhfittig's stated
  strategy, explicitly from K03 onward. It rests on FR96's own remark that Eq. (95) "is weakest when
  b′0 is extremely close to 1". K06, K08 and K12 go further: b′(r0) = 1 makes FR96 (95) "trivially
  satisfied" at the throat.
- **Can the exotic region be made thin?** Claimed in K02 ("as small as necessary") and K03
  (arbitrarily small total amount). From K05 on, after FR05 pointed out that proper and coordinate
  distances had been confused, the claim is qualified: about 1 cm (K06) and about 0.1 mm (K08) of
  proper thickness, with increasing fine-tuning.
- **Is the observer's speed chosen to maximise the negative energy seen?** No, in none of the six
  papers read. K02 and K03 use only static-frame quantities. K06 uses FR96 (95) at the throat only.
  K08's Eq. (42) leaves v free and handles the region off the throat by fine-tuning γ′. K12 uses a
  static observer.

---

## Q3. Fewster & Roman 2005, and Visser, Kar & Dadhich 2003

### FR05 (PRD 72, 044023; full text read) and FR05b (proceedings; full text read)

- **QI used** (§4): the null-contracted QI of Fewster & Roman, PRD 67, 044003 (2003), for a massless
  scalar in 4D Minkowski spacetime, averaged along an inertial worldline with a constant null vector k.
  Eq. (35), re-typed: ∫dτ ⟨T_ab k^a k^b⟩_ω g(τ)² ≥ −[(k_a u^a)²/(12π²)] ∫dτ g″(τ)², "for all Hadamard
  states ω and any smooth g which is compactly supported in R". Optimising over g supported in
  (0, τ0) gives "E ≥ −C(ka ua)²/τ0⁴, where C ≈ 4.23" (Eq. (38)). FR05b quotes C ∼ 5.
- **Curved-spacetime assumption**: "τ0 = f ℓmin, where f ≪ 1 and ℓmin is the smallest proper radius
  of curvature or the smallest proper distance to any boundary of the spacetime" (§2.2). They take
  f = 0.01, "which is quite a generous interpretation of τ0 ≪ ℓmin".
- **Boosted observers: no, deliberately.** The observer is "the worldline of a static observer at the
  throat", with k = e_t̂ + e_r̂, k_a u^a = 1 and E = (b′0 − 1)/(8π r0² lp²) (Eq. (39)). Quote: "In the
  case of wormholes with ρ ≥ 0 for static observers, it was necessary in Ref. [22] to consider the
  usual QIs applied in the frame of a boosted observer passing through the throat in order to get a
  bound on energy density. The greater the boost, however, the shorter the proper time the observer
  will spend near the throat, and one should also consider the transit-time across the region of
  exotic matter as a relevant timescale in the analysis. This problem is absent from the present
  approach, because we use a null-contracted stress tensor averaged over the timelike worldline of a
  static observer at the throat. Hence we do not have to worry about the observer leaving the region
  of exotic matter." Ref. [22] is FR96.
- **Main bound**: Eq. (40): (1 − b′0)/(8π r0² lp²) ≤ C/τ0⁴. Eq. (41): (ℓmin²/r0)√(1 − b′0) ≤
  f^{−2}√(8πC) lp. With √(8πC) ≈ 10.3 and f = 0.01, Eq. (42): **(ℓmin²/r0)√(1 − b′0) ≲ 10⁵ lp.**
  Cases, using the three throat curvature radii r0, r0(1 − b′0)^{−1/2} and
  (r0/(|Φ′0|[1 − b′0]))^{1/2}:
  - ℓmin = r0 (Eq. (43)): r0 ≲ 10⁵ lp/√(1 − b′0). "even to approach a throat radius of 10^20 Planck
    lengths (10^20 lp ≈ 10^{−15} m ≈ 1 fermi ≈ 1 proton radius) one needs 1 − b′0 ≤ 10^{−30}."
  - ℓmin = r0(1 − b′0)^{−1/2} (Eq. (44)): r0 ≲ 10⁵ lp √(1 − b′0).
  - ℓmin from Φ′0, combined with the radial tidal constraint for human travellers (Eqs. (45)–(50)):
    r0 ≳ 10^46 (1 − b′0)^{1/2} m. "Thus we conclude that either r0 is enormous, e.g., if
    1 − b′0 ∼ 10^{−10} we have r0 ≳ 10^41 m = 10^25 light years, or b′0 is incredibly fine-tuned, e.g.,
    1 − b′0 < 10^{−72} for r0 = 10^10 m".
- **The case b′0 = 1 is set aside** (end of §5): "Since the NEC is not violated at the throat, the
  above analysis does not apply. However, we have already seen that the NEC is violated arbitrarily
  close to the throat, and one could modify the analysis by considering static trajectories with r > r0
  where NEC is violated. To do so would require more information about the shape and red-shift
  functions, and we do not pursue this direction further. It seems to us that the b′0 = 1 case is
  nongeneric … One would not expect this nongeneric feature to be stable against small fluctuations in
  the metric". Footnote [48] adds that the NEC is violated arbitrarily close to the throat, but not
  necessarily throughout an interval, correcting a claim in V95 §11.4.
- **Conclusions on the VKD models** (§6): spatially Schwarzschild wormholes give r0 ≲ 10⁵ lp when
  Rmax = 1/r0² (Eq. (67)). When R_t̂r̂t̂r̂ dominates, human traversability requires r0 ≳ 10^46 m: "about
  10^20 times the radius of the visible universe!" Piecewise R = 0: "r0 ≲ 10⁵ lp, and so macroscopic
  piecewise R = 0 wormholes are ruled out."
- **Conclusions on Kuhfittig's models** (§7):
  - KI (K99): r0 ≲ 10⁵ lp/√(1 − k); for a 1 m throat this needs 1 − k ≲ 10^{−60}. "[We note that
    Kuhfittig acknowledges that k might need to be taken close to 1, although he does not give
    estimates.]"
  - KII (K02): "the particular choices employed in Sec. III.A of KII, namely α(r) = κ/r, r0 = 0,
    κ = 0.00025 light years, lead to an infinite proper distance from any point r1 > 0 to the throat".
  - KIII (K03): infinite proper distance, infinite proper time for infalling observers, and "ingoing
    radial null geodesics do not arrive at the throat at finite affine parameter. Hence even light rays
    cannot traverse the wormhole."
- **Summary sentence** (§9): "One lesson to be drawn from our results is that simply concentrating the
  exotic matter, in a classical analysis, to an arbitrarily small region around the wormhole throat
  is, by itself, not sufficient to guarantee both traversability and consistency with (or evasion of)
  the quantum inequality bounds."
- **Sufficiency argument** (§8): for static spacetimes, ⟨T_ab k^a k^b⟩_ω ≥ ⟨T_ab k^a k^b⟩_ω0, the
  ground-state value (Eq. (110)). With |K0| ∼ 10^{−2}, the resulting bound "is stronger than that of
  Eq. (42) by five orders of magnitude".
- **FR05b on K05**: "points at radius r = 2r0 − r2 lie in the NEC-violating region for all possible
  values of the parameters", and the radial tidal constraint gives a proper distance to that radius
  "ℓ = K(r0 − r2)^{(1−a)}/(1 − a) ≥ 10^8 m !" "So this model, as it stands, involves an extensive
  region of NEC-violation, if it is to respect the radial tidal constraint necessary for human
  traversal."

### VKD03 (PRL 90, 201102; full text read), with KDV04 (Pramana; full text read)

- **Volume integral quantifier.** Measure: "∮dV = 2∫_{r0}^∞ 4πr² dr" (Eq. (9)), "a very natural
  integration measure in Schwarzschild coordinates". Key result, Eq. (13), re-typed:
  ∮[ρ + p_r] dV = −∫_{r0}^∞ (1 − b′) ln[e^{2φ}/(1 − b/r)] dr. "We emphasise that it is pr that is
  guaranteed to be associated with ANEC violations, whereas inequalities associated with pt generically
  represent 'normal' matter."
- **Construction 1, "Spatial Schwarzschild"**: "the spatial metric is exactly Schwarzschild, that is
  b(r) → 2m = r0. Then ρ = 0 throughout the spacetime". The metric "only deviates from Schwarzschild in
  the region from the throat out to radius a". "If we now choose geometries such that φmax and φmin
  are not excessively divergent, [no worse than (a − 2m)^{−δ} with δ < 1], we can take the limit
  a → 2m to obtain ∮pr dV → 0." Meanwhile the ANEC integral satisfies I < −1/(2πa) (Eq. (17)): "(With
  the ANEC line integral nevertheless remaining finite and negative.)" KDV04 adds: "We emphasize here
  that the ANEC integral does not go to zero as a → 2m+."
- **Construction 2, "Piecewise R = 0 wormhole"**: for r ∈ (r0 = 2m, a), exp[φ] = ǫ + λ√(1 − 2m/r);
  for r > a, exp[φ] = √(1 − 2m/r); λ = 1 − ǫ/√(1 − 2m/a). There is "a thin shell of quasi-normal
  matter at r = a". "Note that at the throat (r = 2m) pr = −(1/8π)(1/(2m)²) = −pt/2, both of which are
  finite for all a and ǫ." Eq. (35) gives ∮pr dV in closed form, and "The point is that ∮pr dV can be
  made arbitrarily small by suitably choosing ǫ and a. For example, take ǫ/ǫs fixed, and let ǫ → 0."
- **Is the throat near a Schwarzschild horizon?**
  - In both constructions the throat sits at r0 = 2m, the Schwarzschild radius of the exterior
    Schwarzschild geometry (b ≡ 2m). In construction 2 the redshift factor at the throat is
    e^{φ(r0)} = ǫ, and the limits that make the volume integrals vanish (ǫ → 0, or a → 2m with
    divergent φ allowed) send g_tt at the throat towards zero.
  - VKD03 itself never uses the word "horizon" (text searched).
  - Others describe it so. K03: "the integral representing the total amount of exotic matter is shown
    to be arbitrarily small, provided that e^{γ(r0)} → 0 … (If e^{γ(r)} → 0 as r → r0 for a specific
    wormhole, we would be dealing with an event horizon.)" FR05 §6.2: "The smaller the amount of exotic
    matter used in these wormholes, the closer they are to being vacuum Schwarzschild wormholes", with
    longer external traversal times and "enormously blueshifted" infalling matter.

---

## Q4. The ANEC integral along the radial null geodesic (closed form; Ellis value)

**The general closed form is in the literature (VKD03 Eq. (7); KDV04 Eq. (6)).**

- VKD03 (their integrand (ρ + pr)e^{−2φ} corresponds to a null vector with k^t̂ = k^r̂ = e^{−φ}
  **[my note]**): "The ANEC integral along a radial null
  geodesic is I = ∮[ρ + pr] exp[−2φ] dλ = ∮[ρ + pr] exp[−φ] dη. (6) An integration by parts yields
  (see pp. 133-134 of [4]) I = −(1/4π) ∮ (1/r²) e^{−φ} √(1 − b/r) dr < 0. (7)" Here [4] is V95, which I
  did not access. VKD continue: "Unfortunately this is a line integral, with dimensions (mass)/(area),
  not a volume integral".
- The ∮ covers both sides of the throat. This is shown by Eq. (17), where for the spatial-Schwarzschild
  exterior I < −(1/4π)∫_a^∞ 2/r² dr = −1/(2πa).
- KDV04 Eq. (6) prints the same final expression and calls the last step "an integration by parts".
  Its intermediate step, as extracted, reads −(1/4π)∮(2/r) d/dr[e^{−φ}√(1 − b(r)/r)] dr.
- **[my note]** On each side |dr/dη| = √(1 − b/r), so VKD's integrand (1/r²) e^{−φ} √(1 − b/r) dr
  equals e^{−φ} (r′/r)² dη. VKD's Eq. (7) is therefore identical to −(1/4π)∫e^{−Φ}(r′/r)² dl along the
  whole geodesic. This proper-length form is my change of variables; I did not see it printed in any
  source I read.

**The Ellis value.** I did not find "−1/(8 r0)" printed anywhere. The closest source is Kar22:

- Kar22 §II: "If g00 = −1 (i.e. a standard M = 0 BE wormhole) the ANEC integral would have a value
  equal to −π/(2κb0)." It uses T_ij = (1/κ) G_ij. His explicit ANEC integral for the variant metric
  (Eq. (10)) runs over r from b0 to ∞, which is one side of the throat. He cites V95 for the method.
- **[my note]** With κ = 8π (G = 1), Kar's value is −1/(16 b0) per side, which is −1/(8 b0) for the
  complete geodesic through both sides. I also checked that VKD's Eq. (7), evaluated for Φ = 0 and
  b = b0²/r over one side, gives −1/(16 b0).
- DAK20 computes the ANEC integral only for the "extra" non-phantom matter of a generalised
  Ellis–Bronnikov family (its Eq. (18)), and notes that this piece vanishes for Ellis–Bronnikov. It
  gives no Ellis value.
- Ch26 restates the VKD form of the ANEC integral and gives no Ellis value.

**Other sources the question named:**

- MT88 and MTY88: not accessed (paywalled), so I cannot report on them.
- V95: not accessed. VKD03 attributes the integration by parts to its pp. 133–134.
- FSW93 (topological censorship; text searched): ANEC appears only as a hypothesis of the theorem
  ("A spacetime satisfies ANEC if the integral of Tab k^a k^b is nonnegative along every inextendible
  null geodesic"). No wormhole ANEC closed form.
- HV97: averages the NEC over the throat surface ("transverse averaged null energy condition"), not
  along the radial geodesic. No closed form of the radial ANEC.

---

## Q5. The mass function and the throat: M versus r0/2

**The mass formula is stated explicitly.**

- VKD03 Eq. (8): "The basic volume-integral theorem relates the asymptotic mass to the throat radius
  r0 and the density by m∞ = r0/2 + ∫_{r0}^∞ 4π r² ρ(r) dr. This is a simple generalization of the
  ordinary mass formula for relativistic stars to traversable wormholes." Eq. (10): "including both
  asymptotic regions, we have ∮ρ dV = 2m∞ − r0." Footnote [13] adds a technical condition:
  g_tt g_rr → −1 + O(1/r²).
- Lobo08 Eqs. (33)–(34): m(r) = r0/2 + ∫_{r0}^r 4πρ r′² dr′, "which is the effective mass contained in
  the interior of a sphere of radius r … Moving out to spatial infinity, we have lim m(r) = r0/2 +
  ∫_{r0}^∞ 4πρ r′² dr′ = M."

**The positive-density corollary, M ≥ r0/2, is stated explicitly in AA15** (§II, Eqs. (8)–(9)):

- "If the mass is finite … and ρ ≥ 0, Eqs. (3) and (5) along with the first line (6) yield
  2M − r0 = 8π ∫_{r0}^∞ r² ρ dr ≥ 0 (for ρ ≥ 0). This implies M ≥ r0/2, for wormholes with finite mass
  and positive or null energy density. The saturation is attained only for ρ = 0: M = r0/2. This sets a
  lower limit for the mass of wormholes whose energy density is everywhere positive or null."
- AA15 also gives "x ≡ 8πr0² ρ0 ≤ 1" and "x ≡ 8πr0² ρ0 = (2M − r0)/r0" for its models.
- Its ρ ≥ 0 models still violate the NEC (abstract): "It is observed that the radial pressure is
  negative, and the null energy condition is violated, only inside a narrow layer, adjacent to the
  throat".
- **[my note]** The contrapositive (M < r0/2 implies ρ < 0 somewhere) is not written out in any source
  I read. It follows in one line from AA15's Eq. (8) and VKD's Eq. (8).

**Explicit examples with M = r0/2, ρ ≡ 0 and the NEC still violated:**

- FR96 §4.2: "Φ = 0, b = r0 = const … therefore ρ = 0. This is a special case of the 'zero density'
  wormholes [23]. Here gtt is the same as for Minkowski spacetime, while the spatial sections are the
  same as those of Schwarzschild", with p_r = −r0/(8πr³) (Eq. (52)).
- VKD03 "spatial Schwarzschild": "b(r) → 2m = r0. Then ρ = 0 throughout the spacetime", with
  ∮pr dV < 0.

**The Misner–Sharp mass equals r/2 at the throat:**

- Hay09 §II: "the active gravitational mass m [19]: 1 − 2m/r = g^{−1}(dr, dr) … Evidently r > 2m,
  r = 2m or r < 2m respectively on untrapped, marginal or trapped spheres." [19] is Misner & Sharp,
  Phys. Rev. 136, B571 (1964).
- Hay09 §IV, on the MT metric: "They introduced new jargon … namely 'shape function' for 2m and
  'redshift function' for ϕ. … This and the fact that m is active gravitational mass are useful in
  physically interpreting such metrics. The Morris-Thorne metric is singular at the wormhole throat
  r ≅ 2m". Also "κ ≅ 2πr(τ − ρ)" (Eq. (38)), "τ − ρ equalling surface gravity over circumference".
- HV98 (Vaidya-type example): "the only expansion which can have zeros is θ+ and θ+ = 0 ⟺
  2m(r, v) = r, so that r = r(v) gives the time-dependent radius of the extremal sphere."
- IH99: "The Hawking energy is actually positive on a wormhole horizon with spherical topology, taking
  the value √(A/16π). The asymptotic energies may also be positive in a wormhole spacetime. Rather, the
  sign of the energy density affects the derivative of the active energy".

**Hochberg & Visser 1997 (HV97)** bounds the throat energy density, not the ADM mass: "ρ ≤
(1/16πG) ⁽²⁾R … This is the generalization of the Morris–Thorne result that ρ = b′(r0)/(8πG r0²) ≤
1/(8πG r0²) at the throat of the special class of model wormholes they considered. (See [3, page
107].)" I found no statement relating the ADM mass to r0 in HV97, HV98 or HV98b (searched for "mass").

**MT88 and V95**: not accessed.

---

## Q6. Zero-thickness strings; flat-face (polyhedral, dihedral) wormholes

### Unruh, Hayward, Israel & McManus 1989 (abstract only)

The APS abstract, as served by INSPIRE: "It is shown that a loop of idealized cosmic string deforms
the background geometry in its vicinity so that its path and shape become geodesics of this
background. For angular deficits smaller than π, this deformation causes the background curvature to
grow without bound near an infinitely thin string. However, the rate of growth is so weak that the
tidal forces are not yet appreciable at the surface of a grand-unification string. Although equations
of motion for the string in a 'background' geometry cannot be defined in a clear-cut fashion, they are
not inconsistent with the conventional dynamics derived from the Nambu action." The "Hayward" here is
G. Hayward, not S.A. Hayward. I have not read the full text, so I cannot report its theorem statements
or conditions beyond this abstract.

Secondary characterisations:

- BCL97 (introduction), summarising its refs [4–7] (Vickers 1987; Frolov, Israel & Unruh 1989;
  UHIM89; Clarke, Ellis & Vickers 1990): "A two-dimensional timelike worldsheet whose points are
  conical singularities of the 4-geometry cannot be in general the dynamical evolution of a Nambu-Goto
  string of arbitrary initial shape. The conical singularity requires that the worldsheet is totally
  geodesic. This restraints the initial shape of the string as well as the evolution of each of its
  points to be a geodesic of the 4-geometry." BCL97's own result (abstract): with a thin smoothed cone
  and "a specific constraint on the model", the central line obeys Nambu–Goto; "If no constraint is
  added, then the worldsheet of the central line is a totally geodesic surface."
- GT87 abstract: "It is shown that shells of matter—but neither point particles nor strings—can be
  described by metrics in this class", where the class is metrics whose curvature is well defined as a
  distribution.

### Visser 1989, "Some simple examples" (full text read)

- **Construction**: two copies of Minkowski space with regions Ω × ℜ removed and identified along
  ∂Ω × ℜ. The time-independent cut makes it static by construction. Surface stresses, Eq. (2.4):
  σ = −(1/4πG)(1/ρ1 + 1/ρ2), ϑ1 = −(1/4πG)(1/ρ2), ϑ2 = −(1/4πG)(1/ρ1). "On that face the two principal
  radii of curvature are infinite and the stress energy is zero."
- **Cube edges**: "µ = T = −1/(8G) = −1.52 × 10^43 Joules/metre = −(1/8)·(Planck mass/Planck length)".
  The corner energies E = −r/(4G) "tend to zero as r → 0".
- **General polyhedron**: "As before the limit r → 0 is well behaved, in which case we obtain
  µ = T = −φ/(4πG)", where φ is the bending angle at the edge. "the deficit angle (ϕ) at each edge is
  given by ϕ = −2·φ. In terms of the deficit angle µ = T = ϕ/(8πG), which is the usual relationship for
  classical strings. … If an edge is convex the tension is negative."
- **Negative string tension**: "the stress energy present at the edges of the cube is identical to the
  stress energy tensor of a negative tension classical string … Note however, that field theoretic
  models of strings lead to positive string tensions. No natural mechanism for generating negative
  string tension is currently known."
- **Circular rim**: not treated. The paper covers "an arbitrary polyhedron", which has straight edges,
  and does not discuss curved edges or the dynamics of a curved rim. The stability of such wormholes is
  listed as an open question.

### Circular-rim ("portal", ring) cases in later work

- C95 (introduction): "one particularly simple configuration is a flat-space wormhole mouth framed by a
  single continuous loop of exotic cosmic string", and "the cosmic string framing Visser wormholes must
  have a negative string tension [3] of −1/4G". It refers to "stable Visser wormholes" but gives no
  stability analysis.
- GV17 (static exact solution): the zero-mass limit of Kerr is "a wormhole sourced by a negative
  tension ring" with "negative angle deficit of 2π − 4π = −2π". "a ring made of infinitely thin cosmic
  string with negative tension [1, 2] T = −c⁴/(4G). … To create a ring wormhole of one metre radius one
  needs a negative energy equivalent to the mass of Jupiter". The line element (2.4) is
  −dt² + (flat spatial metric), so it is static.
- FLM21: "Portals are wormholes supported by a single loop of negative mass cosmic string … Portals can
  be constructed so that the curvature is zero everywhere outside the cosmic string, with vanishing ADM
  mass." "The dihedral wormhole, the two-dimensional version of a polyhedral wormhole considered in
  [2], is an example of a portal (with corners)". It attributes to V95 the estimate that "a
  square-shaped dihedral wormhole [2] with a surface area of ∼ 1 m² requires a cosmic string on the
  wormhole boundary with a negative mass of the magnitude of the mass of Jupiter". §V constructs "a line
  element for static smoothed axisymmetric portals" (circular ∂w of radius a). FLM21 contains no QI
  analysis (text searched).
- Kr03 §III C 1, "'Portal'": a smooth version "which is, in fact, a globally hyperbolic analog of the
  'dihedral' wormhole [21]" ([21] is V95). "P is a globally hyperbolic and static wormhole." Fig. 4:
  "The radius of each is ρ0 and the thickness is ∼ ηε²". See the QI paragraph below.

### Has anyone applied QIs to Visser's flat-face wormholes, or argued the rim must be Planck-scale?

- **FR96** footnote [29] (quoted in Q1(g)) is speculative only.
- **Rom04** §3.1.1(3): "(−) energy cosmic strings? Cosmic strings concentrate large energy densities
  in very small regions of space. If (−) energy density cosmic strings can exist, then they might be
  used as sources for macroscopic wormholes [62] with the requisite large discrepancies in length
  scales implied by the QIs. Unfortunately, the models of cosmic strings derived to date all have (+)
  energy densities [63]." Ref. [62] is V95, Ch. 15.
- **Kr03** is the closest to an explicit QI argument for the smoothed rim.
  - Rough QI estimate, Eq. (7): |̺| ≳ 1 in Planck units ("It is this Planck-scale energy density that
    gives rise to the prohibitive figures").
  - For the portal: "Etot^− ∼ ρ0. So, to support a human-sized wormhole of this type it would suffice
    Etot^− ≈ 10^{−2} M⊙ of exotic matter. … QI, if it holds, does not change this estimate in any way.
    As with the absurdly benign wormhole (see section II B) it only requires that the hoops be thin
    (but not that thin in this case): ηε ∼ 1."
  - In his Planck units, ηε ∼ 1 makes the hoop thickness ∼ ηε² of order the Planck length, with Planck
    density.
  - Krasnikov's overall thesis is that QIs "do not forbid" such shortcuts.
- **K12** argues that thin-shell (cut-and-paste, spherical) wormholes are compatible with QFT under
  conditions on b′ and Φ (see Q2). It does not treat polyhedral rims.
- **Not found**: a dedicated QI derivation bounding the core width of Visser's polyhedral or dihedral
  rim strings, beyond Krasnikov's rough estimate. Kon24 also surveys QEI constraints on wormholes
  (sections read) and does not treat polyhedral wormholes.

---

## Q7. Ford & Roman 1999, "quantum interest" (full text read)

- **Abstract**: "These inequalities imply that a pulse of negative energy must not only be followed by
  a compensating pulse of positive energy, but that the temporal separation between the pulses is
  inversely proportional to their amplitude. … This conjecture (the quantum interest conjecture)
  states that a positive energy pulse must overcompensate the negative energy pulse by an amount which
  is a monotonically increasing function of the pulse separation. In the present paper we prove the
  conjecture for massless quantized scalar fields in two and four-dimensional flat spacetime, and show
  that it is implied by the quantum inequalities."
- **Domain of validity**: free massless scalar field; 2D and 4D Minkowski spacetime; δ-function pulse
  pairs ρ(t) = B[−δ(t) + (1 + ǫ)δ(t − T)] (Eq. (17)) seen by an inertial observer. B = |∆E| in 2D, and
  B = |∆E|/A in 4D, "where A is the (planar) collecting area of the flux". Footnote [34]: "sometimes it
  is useful to impose the condition that all parts of the absorbing system come into causal contact
  with one another before the arrival of the positive energy. This implies A < T²."
- **"How soon"**: the maximum pulse separation (§3, compactly supported sampling functions).
  - Eqs. (25)–(26): T ≤ C/(2C0|∆E|) in 2D, and T ≤ (1/2)[CA/(C0|∆E|)]^{1/3} in 4D. "Therefore, the
    larger the magnitude of the (−) energy pulse, the smaller is the allowed time separation between
    the pulses."
  - For the sampling function g = (1/t0)[1 + cos(2πt/t0)] (C0 = 2): Eq. (28), Tmax = π/(24|∆E|) ≈
    0.131/|∆E| in 2D (C = π/6); Eq. (29), Tmax = (π/16)^{2/3}(A/|∆E|)^{1/3} ≈ 0.338 (A/|∆E|)^{1/3} in
    4D (C = π²/16).
  - "At present, we do not know what the optimal value of this separation might be. In two dimensions,
    we do know that it must be no smaller than T = 1/(12 π|∆E|), so as to not rule out the moving
    mirror example."
- **The interest itself**: 4D, Lorentzian sampling, small ǫ (Eq. (39)): ǫ ≥ (4/27)[|∆E|T³/(CπA)]²,
  "i.e., ǫ grows as T⁶ for fixed |∆E| and A". In 2D at T ≈ Tmax: "our sampling function requires that
  ǫ ≥ ǫmin ≈ 40". Moving mirror (2D): |∆E|T < 1/(12π), and ǫ ≈ 24π|∆E|T + … (Eq. (16)).
- **Conclusion**: "The bound is nonzero even for arbitrarily small pulse separations. … In addition,
  there exists a maximum allowed pulse separation, which thereby limits the duration of the effects of
  the (−) energy."
- **Later results** (abstracts only):
  - FT00: "For various simple models in two and four dimensions we obtain the best possible bounds on
    the 'quantum interest rate' and on the maximum delay between a negative pulse and a compensating
    positive pulse. Perhaps surprisingly, we find that - in four dimensions - it is impossible for a
    positive delta-function pulse of any magnitude to compensate for a negative delta-function pulse,
    no matter how close together they occur."
  - AV09: "we shall provide a simple proof of one version of the Quantum Interest Conjecture in (3+1)
    dimensional Minkowski space."

---

## Q8. QIs applied to time-dependent ("pulsed") wormholes or warp bubbles

**Warp bubbles and Krasnikov tubes: QIs give wall thicknesses and total energies, not durations.**

- **PF97** (full text read; Alcubierre bubble at constant velocity). "If the time scale of the
  sampling is sufficiently small compared to the time scale over which the bubble's velocity is
  changing, then the warp bubble's velocity can be considered roughly constant".
  - Sampling time: t0 = α·2∆/(√3 vb), with 0 < α ≪ 1.
  - Eq. (22): ∆ ≤ (3/4)√(3vb/(πα²)). Eq. (23), α = 1/10: **∆ ≤ 10² vb L_Planck**.
  - Total energy for R = 100 m: **E ≤ −6.2 × 10^70 vb L_Planck ∼ −6.2 × 10^65 vb grams**, i.e.
    "E ≤ −3 × 10^20 M_galaxy vb", "roughly ten orders of magnitude greater than the total mass of the
    entire visible universe".
  - With ∆ = 1 m (a QI violation), about a quarter of a solar mass.
  - No maximum duration is derived.
- **ER97** (Krasnikov tube; sections read). The analysis is "long after the formation of the tube",
  with τ0 = σε.
  - Eq. (44): ε ≲ lP/σ²; with σ ≈ 0.01, **ε ≲ 10⁴ lP ≈ 10^{−31} m** (Eq. (45)).
  - For D = ρmax = 1 m and ε = 100 lP: **E ≈ −α 10^68 m_Planck = −α 10^63 g = −α 10^18 M_galaxy**
    (Eq. (52)). For a tube to the nearest star, E ≈ −10^32 M_galaxy.
  - No maximum duration.

**Dynamical warp drive, where a duration does appear (QI wall thickness plus semiclassical
back-reaction):**

- **FLB09** (sections read; a 1+1-dimensional calculation): "Indeed, if one trusted the QI [6, 8], the
  wall thickness for v0 ≈ c would be ∆ ≲ 10² LP, and the surface gravity κ ≳ 10^{−2} tP^{−1} … This means
  that the time scale over which the backreaction of the RSET would become important is
  τ ∼ 1/κ ≲ 10² tP. Indeed, even forgetting about the QI, in order to get even a time scale τ ∼ 1 s for
  the growing rate of the RSET, one would need a wall as large as 3×10^8 m. Therefore, most probably one
  would be able to maintain a superluminal speed for just a very short interval of time." [6] is PF97
  and [8] is Van Den Broeck 1999.
- FLB09 also gives the Hawking temperature T_H ∼ κ ≳ 10^{−2} T_P "(about 10^32 K)", and about 0.003 K
  for ∆ ∼ 1 m.

**Time-dependent traversable wormholes:**

- **FGNR20** (Gao–Jafferis–Wall wormhole in AdS; sections read). Not a QI derivation: an explicit
  calculation of the back-reacted geometry. "∆τ ≈ 8πGN hA ≲ GN, (2.27) … We conclude that the time
  window that the wormhole remains open is indeed Planckian, independent of the chosen frame." From the
  abstract: "the transmission of a signal through the wormhole can sometimes remain within the
  semiclassical regime". Kon24 summarises: "it has been shown [78] that the wormhole remains open only
  for a time scale shorter than the Planck time" ([78] is FGNR20).
- **FR99** gives the flat-spacetime δ-pulse separation bounds of Q7 (Tmax ≈ 0.338 (A/|∆E|)^{1/3} in
  4D), but does not apply them to wormholes. FR95 has only a qualitative warp-drive remark: "our QI
  suggests that compensating (+) energy will arrive before enough (−) energy is collected to
  significantly curve the space."
- **Hay99** (full text read) describes pulsed operation but derives no QI duration. "The above analysis
  reveals that an operating wormhole would be continually pulsating", "sandwiching the transported
  matter between bursts of negative energy". On QIs it only conjectures: "It is suggested that quantum
  inequalities constraining negative energy break down at such horizons", based on Pfenning & Ford's
  static-spacetime QIs depending "singularly on the norm of the static Killing vector".
- **K02 §4** treats time-dependent wormholes classically, without QIs: "a violation of the weak energy
  condition is not likely to be avoidable even temporarily."
- **Not found**: a QI-derived maximum open duration for a time-dependent ("pulsed") traversable
  wormhole of Morris–Thorne type. Searches (web, INSPIRE abstract search for "quantum inequalit*" with
  wormhole and "time-dependent", "dynamic wormhole" or "duration") returned nothing beyond the items
  above.

---

## Summary table

| Q | Finding (short) | Access |
|---|---|---|
| Q1a | Massless minimally coupled scalar field, 4D Minkowski; Lorentzian sampling; (τ0/π)∫⟨T uu⟩dτ/(τ²+τ0²) ≥ −3/(32π²τ0⁴) (Eq. 1); energy density taken as constant over τ0 | FR96 FULL |
| Q1b | Every observer is at the throat: static (geodesic there) if ρ0 < 0, radially boosted if ρ0 ≥ 0. Speed optimised (min γ/v, v = 1/√2) only in the §4.2 and §4.4 examples; in the general bound (95) v is free and chosen, not optimised | FR96 FULL |
| Q1c | τ0 = f·rm with rm = min(b, b/b′, 1/\|Φ′\|, Φ′/Φ″) ≲ smallest curvature radius, or the distance to a boundary; τ0 = f·rm/γ for boosted observers; f ≈ 0.01 (f ≈ 0.1 for MTY; τ0 < 0.42 l1 suffices in the Casimir example) | FR96 FULL |
| Q1d | b′0 < 0: rm ≲ (8πc/\|b′0\|)^{1/4}√r0/f. b′0 ≥ 0: rm/r0 ≲ (v²−b′0)^{−1/4}(√γ/f)(lp/r0)^{1/2} (Eq. 95). Depends on b′0; "weakest when b′0 is extremely close to 1" | FR96 FULL |
| Q1e | Absurdly benign, r0 ≈ 1 m, f ≈ 0.01: a0 ≲ 10^14 lp ≈ 10⁻²¹ m ≈ 10⁻⁶ fermi; a0 is the proper thickness to O(1) | FR96 FULL |
| Q1f | Not found. Ellis-type (b = r0²/r) treated only at the throat: r0 ≲ lp/(2f²) ≈ 10⁴ lp | FR96 FULL |
| Q1g | Only footnote [29] (negative-tension strings "might allow" cubical wormholes) and a remark that results bound thin-shell thicknesses; no QI analysis of rims | FR96 FULL |
| Q2 | Kuhfittig: b′(r0) → 1 makes FR (95) weak, then "trivially satisfied" when b′0 = 1 (K06, K08, K12); exotic region "as small as necessary" (K02), later ~1 cm (K06) and ~0.1 mm (K08) with fine-tuning; never chooses v to maximise the negative energy (K08's off-throat Eq. 42 leaves v free and fine-tunes γ′) | K02, K03, K05, K06, K08 FULL; K12 SECTIONS; K11 ABSTRACT; K99 NOT ACCESSED |
| Q3 | FR05: null-contracted QI at a static observer at the throat, boosted observers deliberately avoided; (ℓmin²/r0)√(1−b′0) ≲ 10⁵ lp; VKD macroscopic models ruled out or severely constrained; Kuhfittig KIII non-traversable; b′0 = 1 called nongeneric and not analysed. VKD03: ∮(ρ+pr)dV = −∫(1−b′)ln[e^{2φ}/(1−b/r)]dr; throat at r0 = 2m, ρ ≡ 0, volume integral → 0 as a → 2m or ǫ = e^{φ(r0)} → 0 (near-horizon limit; VKD never say "horizon") | FR05, FR05b, VKD03, KDV04 FULL |
| Q4 | Known: VKD03 Eq. (7), I = −(1/4π)∮ r⁻² e^{−φ}√(1−b/r) dr < 0, citing V95 pp. 133–134; equals −(1/4π)∫e^{−Φ}(r′/r)²dl by a change of variables [my note]. Ellis: Kar22 gives −π/(2κb0) over one side, i.e. −1/(8b0) for both sides with κ = 8π [my conversion]; "−1/(8r0)" itself not found in print | VKD03, KDV04 FULL; Kar22 SECTIONS; MT88, MTY88, V95 NOT ACCESSED; FSW93 SECTIONS (none there) |
| Q5 | Known: m∞ = r0/2 + ∫4πr²ρdr (VKD03 Eq. 8, Lobo08 Eq. 34); M ≥ r0/2 for ρ ≥ 0, equality only for ρ = 0 (AA15 Eq. 9), whose ρ ≥ 0 models still violate the NEC near the throat; ρ ≡ 0, M = r0/2 examples (FR96 §4.2, VKD03); Misner–Sharp m = r/2 at the throat (Hay09, HV98); the contrapositive (M < r0/2 ⇒ ρ < 0) is not written out but follows in one line | VKD03 FULL; AA15, Lobo08, Hay09, HV98, IH99, HV97 SECTIONS; MT88, V95 NOT ACCESSED |
| Q6 | UHIM89: idealised loops deform the background so their path is geodesic; curvature grows near the string for deficits < π (abstract only); conical-singularity worldsheets must be totally geodesic (per BCL97). V89: µ = T = −φ/(4πG) = ϕ/(8πG), cube edges −1/(8G) = −1.52×10⁴³ J/m; polyhedra only, static by construction. Circular-rim static solutions: GV17 (T = −c⁴/4G, Jupiter mass for 1 m), Kr03, FLM21. QI-and-rim: only Kr03 (hoops must be ~Planck-thin, E ≈ 10⁻² M⊙ for human size), FR96 fn. 29 and Rom04 (speculative); no dedicated bound found | V89 FULL; UHIM89, GT87 ABSTRACT; GV17, Kr03, FLM21, C95, Rom04, BCL97 SECTIONS |
| Q7 | Pulse separation T ≤ C/(2C0\|∆E\|) in 2D and ≤ ½[CA/(C0\|∆E\|)]^{1/3} in 4D; Tmax ≈ 0.131/\|∆E\| (2D) and ≈ 0.338(A/\|∆E\|)^{1/3} (4D) for the cos² sampling function; ǫ ≳ (4/27)(\|∆E\|T³/CπA)². Proven for free massless scalar fields, δ-pulses, 2D and 4D Minkowski, inertial observers. FT00: in 4D a positive δ-pulse can never compensate a negative one | FR99 FULL; FT00, AV09 ABSTRACT |
| Q8 | Warp bubble (PF97): ∆ ≤ 10² vb lP, E ≤ −6.2×10⁶⁵ vb g for R = 100 m. Krasnikov tube (ER97): ε ≲ 10⁴ lP, E ≈ −α10⁶³ g for a 1 m tube. Neither gives a duration. FLB09: with the QI wall, a superluminal bubble's back-reaction time is ≲ 10² tP. FGNR20: the GJW wormhole is open ≲ G_N (Planckian; not QI-derived). No QI-derived maximum open time for a pulsed MT wormhole found | PF97, FR99 FULL; ER97, FLB09, FGNR20, Kon24 SECTIONS |
