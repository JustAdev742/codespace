# Stage B: wormhole stability and control (prior-art and verification check)

Written 2026-10-20. This is a literature check, done after the Stage A results were committed. It
reports only what published sources say, and it does not assess the Stage A derivations.

How I worked and how to read this:

- I downloaded arXiv PDFs and extracted their text with `pdftotext`. Where formulas did not extract
  (scanned pages, equation images), I rendered the pages and read them directly. Bibliographic data
  were checked against INSPIRE-HEP or Crossref.
- Quotes are verbatim from the arXiv versions. Mathematical symbols inside quotes have been
  re-typeset (sub- and superscripts, Greek letters), but no words were changed. Equation numbers
  follow the arXiv versions.
- Access status means one of the following:
  - **full text read**: I read the whole extracted text.
  - **full text accessed, sections read**: I read the sections listed.
  - **abstract only**.
  - **not accessed**.
- Text marked **[reviewer note]** is my own arithmetic or reading. It is not a claim of the cited
  paper.
- Units are G = c = 1 unless stated. The throat areal radius is called b (GGS), a (Shinkai &
  Hayward), r0 or r_T (Kunz group).

---

## Q1. González, Guzmán & Sarbach (GGS) 2009: the unstable Ellis(-Bronnikov) mode

### Sources

1. J. A. González, F. S. Guzmán, O. Sarbach, "Instability of wormholes supported by a ghost scalar
   field. I. Linear stability analysis", *Class. Quantum Grav.* **26**, 015010 (2009).
   arXiv:0806.0608 (v2). DOI 10.1088/0264-9381/26/1/015010. **Full text read.**
2. J. A. González, F. S. Guzmán, O. Sarbach, "Instability of wormholes supported by a ghost scalar
   field. II. Nonlinear evolution", *Class. Quantum Grav.* **26**, 015011 (2009). arXiv:0806.1370.
   DOI 10.1088/0264-9381/26/1/015011. **Full text read.**
3. J. A. González, F. S. Guzmán, O. Sarbach, "On the instability of charged wormholes supported by a
   ghost scalar field", *Phys. Rev. D* **80**, 024023 (2009). arXiv:0906.0420.
   DOI 10.1103/PhysRevD.80.024023. **Full text accessed, sections read**: abstract, Sec. I, the
   parameter definitions in Sec. II, Sec. IV C–D, Sec. V. The published title begins "On the
   instability…".

Later papers that recompute the same mode independently:

4. J. L. Blázquez-Salcedo, X. Y. Chew, J. Kunz, "Scalar and axial quasinormal modes of massive static
   phantom wormholes", *Phys. Rev. D* **98**, 044035 (2018). arXiv:1806.03282.
   DOI 10.1103/PhysRevD.98.044035. **Full text accessed, sections read**: Secs. III C, IV A, V A.
5. B. Azad, J. L. Blázquez-Salcedo, F. S. Khoo, J. Kunz, "Are slowly rotating Ellis-Bronnikov
   wormholes stable?", *Phys. Lett. B* **848**, 138349 (2024). arXiv:2301.05243.
   DOI 10.1016/j.physletb.2023.138349. **Full text accessed, sections read**: Secs. 2, 4, 5, 6.
6. J. L. Blázquez-Salcedo, L. M. González-Romero, F. S. Khoo, J. Kunz, P. Navarro Moreno, "Radial
   perturbations of charged wormholes", *Phys. Lett. B* **875**, 140335 (2026). arXiv:2510.11406.
   DOI 10.1016/j.physletb.2026.140335. **Full text accessed, sections read**: introduction,
   framework, results, conclusions.

### (a) Growth rate and e-folding time

GGS I, abstract: "We prove that all these solutions are unstable with respect to linear
fluctuations and possess precisely one unstable, exponentially in time growing mode. The associated
time scale is shown to be of the order of the wormhole throat divided by the speed of light."

GGS I define their units in Sec. IV: "we show the associated time scale in terms of proper time at
the throat of the background solution, τ = e^{γ1 arctan(γ1)} t, and units of the areal radius of the
throat, r_throat = b √(1+γ1²) e^{−γ1 arctan(γ1)}. This time scale is given by
τ_unstable = e^{2γ1 arctan(γ1)} r_throat / (√(1+γ1²) β) = r_throat / (√(1+γ1²) β̄)."

GGS I, Table I gives "the dimensionless time scale T := τ_unstable/r_throat for different values of γ1":

| γ1 | 0 | 0.1 | 0.2 | 0.5 | 1.0 | 1.4 | 2.0 | 3.0 | 5.0 | 10.0 |
|---|---|---|---|---|---|---|---|---|---|---|
| T | **0.846** | 0.841 | 0.826 | 0.758 | 0.675 | 0.642 | 0.618 | 0.602 | 0.594 | 0.590 |

- γ1 = 0 is the massless (symmetric) Ellis wormhole: "The particular case γ1 = 0 yields a zero mass
  wormhole, m∞ = m−∞ = 0". There r_throat = b and the throat proper time equals t. The e-folding
  time is therefore **0.846 b/c**. **[reviewer note]** That is a growth rate β = 1/0.846 ≈ 1.18 c/b,
  with E0 = −β² ≈ −1.40/b².
- GGS bracket the eigenvalue variationally (γ1 = 0, b = 1): "Since the minimum of W is −3 we obtain
  the estimate −3 ≤ E0 ≤ −11/8 = −1.375 for the ground state energy." The value 0.846 itself comes
  from a shooting computation (Sec. IV).
- Large-γ1 limit: "the time scale converges to a value of 0.590 r_throat for large values of γ1". The
  asymptotic analysis "yields 1/β̂ = 0.588".
- Physical scale (GGS I, Sec. I): "a wormhole whose throat has an areal radius smaller than 1km, say,
  decays in a few µs."

The same number appears in later, independent work:

- Blázquez-Salcedo, Chew & Kunz (2018), Sec. V A, with r0 = 1 and perturbations ∝ e^{iωt}, so that
  an unstable mode has ωI < 0: "The figure shows that the smallest value of ωI is obtained for the
  massless wormhole, where ωI = −1.182. On the other hand, ωI approaches zero with increasing mass,
  decaying as ωI ∼ 1/M. In fact, extrapolating the numerical data yields lim_{M→∞} ωI M ≈ −0.23003."
- Azad et al. (2024), Table 1, with r0 = 1: for C = 0 (the symmetric case), the static mode is
  ω_I^(0) = −1.182, and the second-order spin correction is Δω_I^(2) = 16.358. The text says "We
  reproduce the results from [32]", where [32] is the 2018 paper above.
- Blázquez-Salcedo et al. (2026) define "the characteristic time of the instability as τ0 = 1/ωI".
  They give: "a critical wormhole with rT = 10 km. In the uncharged case, this is simply the massless
  EB solution with an extremely short characteristic time, τ0 = 28 µs." **[reviewer note]**
  10 km/(1.182 c) = 28.2 µs, and 0.846 × 10 km/c = 28.2 µs, so the numbers are consistent.

Nonlinear evolution (GGS II) gives about 0.836–0.85 in the small-amplitude limit; see (d).

### (b) Gauge, master variable and master equation

- **Background.** The metric ansatz is Eq. (3), g = −e^{2d}dt² + e^{2a}dx² + e^{2c}(dϑ² + sin²ϑ dϕ²).
  The static solutions are found in the gauge d = −a: "we adopt a gauge where d = −a". The massless
  solution is Eq. (13) with γ1 = 0: r² = e^{2c} = x² + b², d = a = 0 up to rescaling.
- **Master variable.** Eq. (17) is Ψ := e^c (δΦ − (Φ_x/c_x) δc), "which is invariant with respect to
  infinitesimal coordinate transformations on M̃". The equation is derived in the δr = 0 (δc = 0)
  gauge: "For simplicity, we choose a gauge in which δc = 0 that is allowed since we are only
  considering points away from the throat."
- **Master equation.** Eq. (23) is Ψ_tt − e^{d−a} ∂_x(e^{d−a} Ψ_x) + V(x) Ψ = Q(x). The potential is
  Eq. (24), V(x) = e^{2(d−c)} − e^{2(d−a)} c_x² − κ e^{2(d−c)} (Φ_x/c_x)². The forcing term is
  Eq. (25), Q(x) = −2σ (Φ_x/c_x²) e^{d+a−3c}. Here σ = δ(Bγ1) is a static change of the mass
  product, which GGS set to zero.
- **Massless case.** "the potential for the zero mass wormhole simplifies to
  V(x) = (b/x)²(3x² + 2b²)/(x² + b²)² and is positive away from the throat … the two asymptotic
  regions are separated from each other by the infinite potential wall at x = 0 which acts like a
  two-sided mirror." Footnote 1 adds: "The positivity of V led to the claim in [9] that there are no
  unstable, radial modes" ([9] is Armendáriz-Picón 2002).
- **Regularised master equation** (Sec. III B; b = 1, γ0 = 0).
  - Definitions: A := ∂ − ∂Ψ0/Ψ0 and ∂ := e^{2γ1 arctan(x)} ∂_x. Ψ0 is the static zero mode of
    Eq. (28).
  - Eq. (29), (∂_t² + A†A) Ψ = 0, becomes Eq. (30), χ_tt − ∂²χ + W(x)χ = 0, with χ := AΨ.
  - "For γ1 = 0 the new potential reduces to the simple expression W(x) = −3(1 + x²)^{−2} which is
    strictly negative."
  - The unstable mode is "χ(t, x) = e^{βt} χ0(x), where χ0 is the ground state of the Schrödinger
    operator H := AA† = −∂² + W with negative energy E0 = −β²."
- **Regular metric perturbation** (Sec. III D) is built in the gauge δΦ = 0: "we choose the
  infinitesimal coordinates such that δΦ = 0. This is possible because Φ_x = Φ1/(1 + x²) ≠ 0". With
  that choice, Eq. (36) gives e^c δc as a first-order differential operator acting on χ, "which is
  regular everywhere and decays exponentially fast to zero as |x| → ∞". Eqs. (38)–(39) then give δa
  and δd.
- **Gauges used elsewhere.**
  - Blázquez-Salcedo et al. (2018): "The gauge freedom is fixed by the condition
    2F2 + F0 − F1 = δφ = 0". They integrate the first-order system, Eq. (28), directly rather than
    the singular master equation, Eqs. (29)–(30).
  - Blázquez-Salcedo et al. (2026): "To fix the gauge, we set F0 + F1 − 2F2 = 0".
  - Bronnikov et al. (2011): see Q3.

### (c) Is the unstable mode spherically symmetric and even, and does it change the throat radius?

- **Spherically symmetric: yes.** Only radial perturbations were analysed: "We analyze the stability
  of static, spherically symmetric wormhole geometries" (GGS I, Sec. I). From the conclusions: "both
  the massless and massive wormholes are linearly unstable for the more general class of spherically
  symmetric perturbations which do not necessarily vanish at the throat."
- **Throat-radius changing: yes.** GGS I say the earlier positive result "only shows stability of the
  zero mass wormholes for a restricted class of perturbations where the areal radius is unperturbed
  and the perturbed scalar field vanishes on the throat." GGS II, Sec. I: small perturbations "grow in
  time and eventually kick the wormhole throat away from its equilibrium configuration." Bronnikov,
  Fabris & Zhidenko (2011) summarise GGS: "they found an exponentially growing mode with nonzero
  perturbation of the throat radius".
- **Even (reflection-symmetric): GGS never use this word.** **[reviewer note]** For γ1 = 0, W is even
  and the ground state χ0 has no nodes, so χ0 is even. With γ1 = 0, F ≡ 1 and Eq. (36) reduces to
  e^c δc = (1/Φ1)[x χ_x − χ/(1+x²)]. That expression is even in x, and its value at the throat is
  δc(0) = −χ0(0)/Φ1 ≠ 0. Two further observations fit this reading:
  - GGS II recovered the linear time scale (0.836 against 0.846) using perturbations centred on the
    throat, which are reflection-symmetric.
  - Azad et al. (2024) Fig. 1 shows "a typical Gaussian profile of the function T(r)".
  - For γ1 ≠ 0 the background itself is not reflection-symmetric, so parity is not defined.

### (d) Part II (nonlinear evolution): outcomes and timescales

Abstract: "depending on the initial perturbation the wormholes either expand or decay to a
Schwarzschild black hole. We estimate the time scale of the expanding solutions and the ones
collapsing to a black hole and show that they are consistent in the regime of small perturbations
with those predicted from perturbation theory … In the expanding case, the wormholes seem to undergo
an exponential expansion, at least during the run time of our simulations."

Set-up:
- The perturbation is Eq. (19), c̄_pert = c̄_static + εc e^{−(x−xc)²/σc²}, with the metric function a
  left unperturbed and b = 1.
- Time scales come from fitting the throat radius against throat proper time: r(τ) = 1 − e^{−(τ−p1)/p2}
  for collapse and r(τ) = 1 + e^{(τ−p1)/p2} for expansion.

Results:
- **Collapse.** Fig. 3 caption: "the time scale for the smallest perturbation (εc = 0.001) shows the
  highest time scale of all cases, namely 0.836. This value is comparable to the one obtained using
  linear perturbation theory which is 0.846 … These plots indicate a decreasing monotonic behaviour of
  the time scale as rcut decreases, indicating that nonlinear terms tend to accelerate the collapse."
  - Fig. 2 caption: the throat radius "starts at rthroat = 1 and collapses to zero in finite
    coordinate and proper time".
  - **[reviewer note]** In the "typical" example of Fig. 3(a) (amplitude not restated in the
    caption), the plot shows r_throat ≈ 1 until τ ≈ 4 and r_throat = 0 at τ ≈ 7.3 b/c. These values
    are read off the figure and are approximate.
- **Expansion.** Sec. V A: "In the limit εc → 0 the time scale is estimated to be 0.85 which is in
  good agreement with the prediction from perturbation theory". Also: "for wormholes which are
  reflection symmetric we find that the areal radius at the point of reflection symmetry grows
  exponentially as a function of proper time."
- **Which way the throat goes**, for centred pulses with σc = 0.5 (Sec. VI):
  - "When the values of the amplitude are positive the system collapses into a black hole. We found
    that the radius of the black hole decreases from rAH = 0.51 for εc = 0.07 to rAH = 0.45 for
    εc = 0."
  - "In the interval εc = [−0.04, 0.00) the wormhole expands instead of collapsing and no apparent
    horizon is found."
  - "for values in the interval εc = [−0.09, −0.05] the system collapses again into a black hole. In
    this range, the radius of the black hole increases from rAH = 0.49 to rAH = 0.53."
  - Sec. IV C: "it seems that the final black hole mass is universal and given by mAH ≈ 0.22", in
    units of b, for small positive εc.
- **End state of collapse.** The scalars at the apparent horizon converge to Schwarzschild values.
  "Despite the rapid collapse, we find that it is possible for a photon to travel from one universe
  to the other and back without falling into the black hole."
- **Throat definition.** "the definition of the throat as the three-surface obtained by determining
  the global minimum of the areal radius in each time slice is problematic in the sense that it may
  depend on the time foliation."
- **Physical timescale** (conclusions): "the time scale associated to the collapse is of the order of
  the throat's areal radius divided by the speed of light, which is of the order of a few
  microseconds for a throat with areal radius of one kilometer."
- GGS II also state: "This confirms the results in [9] in the zero mass case", where [9] is Shinkai &
  Hayward (Q2).

### Charged version (GGS 2009, PRD 80, 024023): conclusion

- Abstract: "We prove that all subcritical and all critical solutions possess one exponentially in
  time growing mode. It follows that all subcritical and critical wormholes are linearly unstable. In
  the supercritical case we provide numerical evidence for the existence of a similar unstable mode."
- Sec. IV C, symmetric case γ1 = 0, with their dimensionless charge parameter ν from Sec. II: "there
  is a threshold of ν around ν* = 0.55 above which the exponential growth is modulated by a harmonic
  component. Also, we observe that the growth rate decreases to less than 1% of the rate in the
  uncharged case as ν increases from zero to 0.96."
- They leave open whether β reaches zero "for some value of ν lying between 0.965 and 1", saying this
  "lies beyond the scope of this paper."
- Conclusion: "The fact that this mechanism does not seem to be able to stabilize the wormholes raises
  some doubts about the success of other similar mechanisms, like adding angular momentum."
- **Follow-up** (Blázquez-Salcedo et al. 2026):
  - "We show that the instability remains in the presence of charge, but exhibits a very fast
    decrease to zero. … For so-called supercritical wormholes, two purely imaginary unstable modes
    merge and continue with degenerate imaginary parts and opposite real parts."
  - For a critical wormhole with rT = 10 km: "for Qe/rT = 0.95 the critical wormhole would have
    τ0 = 0.13 s and for Qe/rT = 0.9999 the characteristic time of the instability would be around 1.1
    years."
  - On the bifurcation: "This bifurcation is a novel result that has not been observed in [32]", where
    [32] is GGS 2009.

---

## Q2. Shinkai & Hayward 2002, "Fate of the first traversible wormhole"

**Source.** H. Shinkai, S. A. Hayward, "Fate of the first traversible wormhole: black-hole collapse or
inflationary expansion", *Phys. Rev. D* **66**, 044005 (2002). arXiv:gr-qc/0205041.
DOI 10.1103/PhysRevD.66.044005. **Full text read.**

**Model.** The static Ellis/Morris–Thorne wormhole ds² = (a² + l²)dS² + dl² − dt² (Eq. 2.25),
supported by a massless ghost Klein–Gordon field. They evolve it with a dual-null code, using
x± = (t ± l)/√2 (Eq. 2.26) and a = 1. Gaussian pulses are input from one side and hit the throat at
x⁺ = x⁻ = 3.

**Main result (abstract).** "We observe that the wormhole is unstable against Gaussian pulses in
either exotic or normal massless Klein-Gordon fields. The wormhole throat suffers a bifurcation of
horizons and either explodes to form an inflationary universe or collapses to a black hole, if the
total input energy is respectively negative or positive. As the perturbations become small in total
energy, there is evidence for critical solutions with a certain black-hole mass or Hubble constant.
The collapse time is related to the initial energy with an apparently universal critical exponent.
For normal matter, such as a traveller traversing the wormhole, collapse to a black hole always
results. However, carefully balanced additional ghost radiation can maintain the wormhole for a
limited time."

**Timescales and numbers.**
- Eq. (3.5), ghost-field pulses: e^{x_H⁻ − 3} ∝ E0^{−0.60}. Here x_H⁻ is the coordinate at which the
  outer trapping horizon becomes null, and E0 is the initial Bondi energy. For normal-field pulses:
  "We see again a logarithmic relation between the time and the initial energy of the perturbation,
  e^{x_H⁻ − 3} ∝ E0^{−0.61}, Fig.10(a). The critical exponent is consistent with that found for
  perturbations in the ghost field".
- Eq. (3.6): "as the perturbations become small, the black-hole mass seems to approach a non-zero
  constant, M ∼ 0.30a."
- Eq. (3.7): "the Hubble parameter H (or horizon mass 1/2H) also seems to have a limiting value for
  small perturbations … H ∼ 1.1/a."
- Table I (ghost pulses, c_b = 3):

  | c_a | E0/a | Outcome | Ha | x_H⁻/a | M/a |
  |---|---|---|---|---|---|
  | +10⁻¹ | −5.07×10⁻² | inflation | 1.56 | | |
  | +10⁻² | −4.45×10⁻³ | inflation | 1.19 | | |
  | +10⁻³ | −4.40×10⁻⁴ | inflation | 1.13 | | |
  | +10⁻⁴ | −4.39×10⁻⁵ | inflation | 1.12 | | |
  | −10⁻⁴ | +4.39×10⁻⁵ | black hole | | 8.42 | 0.296 |
  | −10⁻³ | +4.38×10⁻⁴ | black hole | | 6.98 | 0.310 |
  | −10⁻² | +4.32×10⁻³ | black hole | | 5.64 | 0.325 |
  | −10⁻¹ | +3.70×10⁻² | black hole | | 4.46 | 0.420 |

- **[reviewer note, not in the paper]** In Table I, E0 ∝ c_a for ghost pulses. In Table II, E0 ∝ c̃_a²
  for normal pulses, which is second order in c̃_a, as is the metric perturbation those pulses drive.
  With x⁻ = (t − l)/√2, a coefficient of 0.60 in x⁻ corresponds to 0.60·√2 ≈ 0.85 a in static time.
  That is close to GGS's linear T = 0.846. This is offered only as a cross-reference.
- On linear stability, which they accepted from earlier papers: "Accepting that the static wormhole is
  stable to linear perturbations [11, 12], we seem to have discovered a non-linear instability". GGS
  later showed that the earlier linear analyses were incomplete (Q1).

---

## Q3. Bronnikov, Fabris & Zhidenko 2011 and Bronnikov, Konoplya & Zhidenko 2012

### Sources

1. K. A. Bronnikov, J. C. Fabris, A. Zhidenko, "On the stability of scalar-vacuum space-times",
   *Eur. Phys. J. C* **71**, 1791 (2011). arXiv:1109.6576. DOI 10.1140/epjc/s10052-011-1791-2.
   **Full text read.**
2. K. A. Bronnikov, R. A. Konoplya, A. Zhidenko, "Instabilities of wormholes and regular black holes
   supported by a phantom scalar field", *Phys. Rev. D* **86**, 024028 (2012). arXiv:1205.2224.
   DOI 10.1103/PhysRevD.86.024028. **Full text read.**

### Findings

**Neither paper gives a numerical growth rate for the massless Ellis wormhole.**

- **BFZ 2011.** The wormhole is their "Branch C" of the anti-Fisher solution, Eq. (61). Of their
  static solutions (72)–(73): "The first of them coincides with the solution found by González et
  al. in [18]. As a result, we reproduce their regular potential", which is Eq. (74). Then: "A further
  investigation revealing an unstable mode of perturbations is described in detail in [18] (Fig. 4)",
  where [18] is GGS I.
  - Their Figs. 4 and 5 are for k = m = 1, a massive wormhole. They show growth with two different
    regularisations "at the same rate as in Fig. (4)", but give no number.
  - Numbers appear only for the other branches. Branch A: "the perturbations grow approximately as
    ψ ∝ e^{0.25t/m}". Branch B: "ψ ∝ e^{0.23t/m}".
  - Conclusion: "in almost all cases the characteristic time of perturbation growth is of the order of
    the time needed for a light signal to cover a distance equal to the throat radius."
  - **[reviewer note]** Comparing Eq. (61) with GGS Eq. (13) gives γ1 = m/k and b = k. Their
    k = m = 1 example is therefore GGS γ1 = 1, for which GGS Table I gives T = 0.675.
- **BFZ gauges.**
  - The master equation is derived in the gauge δβ ≡ 0, i.e. δr = 0 (Sec. 2.3, Eqs. 22–30). They note
    that "the assumption δβ = 0 leaves invariable the throat radius, while perturbation must in
    general admit its time dependence".
  - The gauge-invariant combination is ψ1 ≡ r′δφ − φ′δr (Eq. 36).
  - The throat pole is removed by S-deformation, W_reg = −W + 2S² with S = ψ_s,x/ψ_s (Eqs. 37–45).
  - Regular metric perturbations are obtained in the gauge δφ = 0 (Eq. 50).
  - They also say that the earlier harmonic-gauge analysis (δα = 2δβ + δγ) "does not lead to a pole
    in the effective potential, but … this analysis was also incomplete."
- **BKZ 2012.** They study M–AdS wormholes and "black universes", assume m ≠ 0, and set |3m| = 1: "In
  what follows, we will assume m ≠ 0 and use the mass m … as a natural length scale". The Ellis case
  (m = c = 0) is mentioned only as "the well-known Ellis wormhole, for which the stability results are
  already known [14–16]", where [14–16] are GGS I, Shinkai–Hayward and GGS II.
  - Gauge (Eq. 35): "δψ = δμ3 ≡ 0 ⟹ δR(r, t) = 0". The S-deformation is then done numerically
    (Eqs. 47–51).
  - Result: "all configurations under study are unstable under spherically symmetric perturbations,
    except for a special class of black universes where the event horizon coincides with the minimum
    of the area function."
- **A number to compare with GGS** does exist, but in later papers (Q1 sources 4 and 5): ωI = −1.182
  for r0 = 1, massless case.

---

## Q4. Poisson & Visser 1995, thin-shell wormholes; Eiroa & Romero 2004

### Sources

1. E. Poisson, M. Visser, "Thin-shell wormholes: Linearization stability", *Phys. Rev. D* **52**, 7318
   (1995). arXiv:gr-qc/9506083. DOI 10.1103/PhysRevD.52.7318. **Full text read.**
2. E. F. Eiroa, G. E. Romero, "Linearized stability of charged thin-shell wormholes", *Gen. Rel. Grav.*
   **36**, 651 (2004). arXiv:gr-qc/0303093. DOI 10.1023/B:GERG.0000016916.79221.24.
   **Full text accessed, sections read**: abstract, end of Sec. 3, Sec. 4.
3. Supplementary: N. Tsukamoto, T. Kokubu, "Relation between circular photon orbits and the stability
   of wormholes with the thin shell of a barotropic fluid", *Phys. Rev. D* **109**, 024047 (2024).
   arXiv:2305.07256. DOI 10.1103/PhysRevD.109.024047. **Abstract only.**

### (a) Potential and stability condition

The construction is two Schwarzschild exteriors r > a > 2M glued at r = a.

- Eq. (17): "ȧ² = −V(a); V(a) = 1 − 2M/a − [2πσ(a)a]²".
- Static solution, Eqs. (18)–(19): σ0 = −(1/(2πa0))√(1 − 2M/a0) and
  p0 = +(1/(4πa0))(1 − M/a0)/√(1 − 2M/a0).
- Eq. (23): β²(σ) ≡ ∂p/∂σ.
- Eq. (27): V″(a0) = −(2/a0²)[2M/a0 + (M²/a0²)/(1 − 2M/a0) + (1 + 2β0²)(1 − 3M/a0)].
- "So for V″(a0) > 0 the wormhole is stable … Thus the wormhole is stable if and only if:
  2M/a0 + (M²/a0²)/(1 − 2M/a0) + (1 + 2β0²)(1 − 3M/a0) < 0. (29)"

### (b) Stability regions in the (a0/M, β0²) plane

- Eq. (30): β0²(1 − 3M/a0) < −[1 − 3M/a0 + 3(M/a0)²]/[2(1 − 2M/a0)].
- **The role of a0 = 3M:** "The RHS of this inequality is always negative, while the LHS flips sign at
  a0 = 3M." Hence:
  - Eq. (31): β0² < −[1 − 3M/a0 + 3(M/a0)²]/[2(1 − 2M/a0)(1 − 3M/a0)] for a0 > 3M.
  - Eq. (32): the same bound with ">" for a0 < 3M.
- **The value 3/2 + √3.** The stability boundary is the quadratic Eq. (33),
  3(1 + 4β0²)(M/a0)² − (3 + 10β0²)(M/a0) + 1 + 2β0² = 0, with roots
  a0± = 6(1 + 4β0²)M / [3 + 10β0² ∓ √(4β0⁴ − 12β0² − 3)] (Eq. 34). "The discriminant is real only for
  β0² ≥ 3/2 + √3 ≈ 3.23205, and for β0² ≤ 3/2 − √3 ≈ −0.23205. After a bit of fiddling … the regions
  of stability are given by":
  - "I: β0² ≥ 3/2 + √3, a0⁻ < a0 < a0⁺; (35)"
  - "II: β0² ≤ −1/2, a0 > a0⁻. (36)"
  - "For −1/2 < β0² < 3/2 + √3, the wormhole is unstable for all values of a0."
- Fig. 1 caption: "The higher dashed line is the curve β0² = 3/2 + √3; the lower dashed line is the
  curve β0² = −1/2." Also: "it is meaningless to ask what happens for a0 < 2M."
- Conclusions: "large traversable wormhole (a0 > 3M) are stable only for β0² < 0!" and "If we restrict
  the speed of sound to lie in this standard range [β0 ∈ (0, 1]] … spherically-symmetric thin-shell
  wormholes are always unstable to linearized radial perturbations." Also: "wormhole configurations
  with |β0²| > 1 should not be ruled out a priori."

**[reviewer note]** The paper does not spell out the limits below. I computed them from Eqs. (31),
(32) and (34) with a short script:

- **a0 → ∞:** the bound in (31) tends to −1/2. Stability needs β0² < −0.652 at a0 = 10M, β0² < −1.75 at
  4M, and the bound goes to −∞ as a0 → 3M⁺.
- **Region II's edge a0⁻:** it goes to ∞ as β0² → −1/2⁻ and to 3M as β0² → −∞. For example,
  β0² = −1 gives a0⁻ = 5.30M.
- **a0 → 2M⁺:** the bound in (32) goes to +∞. For example, a0 = 2.05M needs β0² > 11.08. The bound
  also goes to +∞ as a0 → 3M⁻.
- **The special value:** the minimum of the bound over 2M < a0 < 3M is exactly β0² = 3/2 + √3, at
  a0 = (3 + √3)M/2 ≈ 2.366M. This is where a0⁻ = a0⁺.
- **Region I:** a band inside (2M, 3M) that widens towards the whole interval as β0² → ∞. For
  example, β0² = 4 gives 2.19M–2.59M; β0² = 10 gives 2.06M–2.85M.
- **3M itself:** this is the Schwarzschild photon-sphere radius. Poisson & Visser do not say so.
  Tsukamoto & Kokubu (2024, abstract) state in general that "the stability of the thin-shell wormhole
  is characterized by a set of circular photon orbits called an (anti)photon sphere in the original
  spacetime if a momentum flux passing through a throat is prohibited."

### Eiroa & Romero 2004, in one line

"the presence of large charges (|Q|/M ≈ 1), significantly increases the possibility of obtaining
stable wormhole spacetimes, imposing less severe restrictions on the equation of state of the exotic
matter that must be present in the wormhole throat" (Sec. 4).

---

## Q5. Wormholes claimed to be stable

### 5.1 Bronnikov, Lipatova, Novikov & Shatskiy 2013

K. A. Bronnikov, L. N. Lipatova, I. D. Novikov, A. A. Shatskiy, "Example of a stable wormhole in
general relativity", *Grav. Cosmol.* **19**, 269 (2013). arXiv:1312.6929.
DOI 10.1134/S0202289313040038. **Full text read.**

- **Matter.** The metric is exactly the massless Ellis metric. The source is "a perfect fluid with
  negative density and a source-free radial electric or magnetic field". The static fluid is phantom
  dust, and pressure appears only in perturbations: Eqs. (6)–(7), 8πp = h(x) f, where f is the density
  perturbation.
- **What was shown.** Stability under ℓ = 0 radial modes, including the throat-radius mode ("we have
  included a mode with a nonzero perturbation of the throat radius, the most 'dangerous' one"), and
  under all axial modes. Nonspherical polar modes were not done: "A full consideration of nonspherical
  polar perturbations … is postponed for the future". Abstract: "A similar behavior is predicted for
  polar nonspherical perturbations."
- **Condition.** The radial-stability proof needs the equation-of-state function to vanish at the
  throat: h(x) = a xⁿ/rⁿ, 0 < a < 1, n an even integer from 2 to 14 (Eq. 12). With h(0) = h0 ≠ 0,
  "a maximum is possible, hence an unstable mode of perturbations is also possible."
- **Disputed?** I found no published critique. INSPIRE lists 113 citing records; I checked the titles
  of the most recent 80. Searches with the terms in the "Search terms" appendix found none. The open
  item is the one the authors name themselves, the polar ℓ ≥ 1 modes.

### 5.2 Rotating Ellis wormholes

- **V. Dzhunushaliev, V. Folomeev, B. Kleihaus, J. Kunz, E. Radu**, "Rotating wormholes in five
  dimensions", *Phys. Rev. D* **88**, 124028 (2013). arXiv:1309.2448. DOI 10.1103/PhysRevD.88.124028.
  **Full text accessed, sections read**: abstract, Sec. I, Sec. V, conclusions.
  - Matter: a phantom scalar field in 5D with equal angular momenta, which makes the problem
    cohomogeneity-1 (ODEs).
  - Abstract: "A stability analysis shows that the unstable mode of the static wormholes solutions
    vanishes when the angular momentum exceeds some critical value."
  - Scope: perturbations that keep the cohomogeneity-1 symmetry and depend only on (l, t) (Eqs. 48–50).
    "Beyond Jcr we do not find any further unstable modes within the type of modes investigated."
    Critical values: "(|J|/A)cr = 0.10063" for symmetric wormholes and 0.1381 for |a−∞| = 1.
- **B. Kleihaus, J. Kunz**, "Rotating Ellis wormholes in four dimensions", *Phys. Rev. D* **90**,
  121503 (2014). arXiv:1409.1503. DOI 10.1103/PhysRevD.90.121503. **Full text accessed, sections
  read**: abstract and the closing stability paragraph.
  - No stability analysis: "Whether this will happen as well in four dimensions still needs to be
    shown."
- **X. Y. Chew, B. Kleihaus, J. Kunz**, "Geometry of spinning Ellis wormholes", *Phys. Rev. D* **94**,
  104031 (2016). arXiv:1608.05253. DOI 10.1103/PhysRevD.94.104031. **Full text accessed, sections
  read**: the stability paragraph in the conclusions.
  - "So far we have not addressed the important issue of the stability of these rotating wormhole
    solutions."
- **4D follow-ups** (slow rotation, perturbative, radial modes only):
  - Azad et al., *Phys. Lett. B* **848**, 138349 (2024), arXiv:2301.05243 (Q1 source 5): "We find
    indications that simple wormhole solutions such as Ellis-Bronnikov in General Relativity can be
    stabilized by rotation". In their quadratic approximation the static mode reaches zero at
    J_c/A ≈ 50 % of the extremal-Kerr limit (J/A → 1/(8π) ≈ 0.0397). Because a second unstable mode
    comes out of the static zero mode, they conjecture that "the radial instability will disappear at
    even smaller values of the angular momentum, around 30% of the limiting value."
  - B. Azad, J. L. Blázquez-Salcedo, F. S. Khoo, J. Kunz, "Radial perturbations of Ellis-Bronnikov
    wormholes in slow rotation up to second order", *Phys. Rev. D* **109**, 124051 (2024).
    arXiv:2403.08387. DOI 10.1103/PhysRevD.109.124051. **Abstract and part of the introduction
    read.** "This indicates that wormhole solutions may become linearly mode stable at sufficiently
    fast rotation."
  - B. Azad et al., "Quadrupole perturbations of slowly spinning Ellis–Bronnikov wormholes",
    *Universe* **11**, 325 (2025). arXiv:2509.22118. DOI 10.3390/universe11100325. **Abstract only.**
    It derives the ℓ = 2 equations and states that the calculation "may exhibit potential
    instabilities in the quadrupole sector".
- **Status.** No non-perturbative 4D stability result was found. The 5D result covers only
  symmetry-preserving modes. GGS (2009, charged paper) had expressed doubt that rotation would
  stabilise. The 2026 charged paper (Q1) argues by analogy for long, but finite, instability times
  near extremality.

### 5.3 Einstein–Dirac–Maxwell (EDM) wormholes

- **J. L. Blázquez-Salcedo, C. Knoll, E. Radu**, "Traversable wormholes in Einstein-Dirac-Maxwell
  theory", *Phys. Rev. Lett.* **126**, 101102 (2021). arXiv:2010.07317.
  DOI 10.1103/PhysRevLett.126.101102. **Full text read.**
  - Matter: two massive, charged Dirac fermions in a singlet spinor state, treated as quantum wave
    functions, plus a Maxwell field. The configurations are symmetric under r → −r.
  - **No stability claim or analysis.** The letter's claim is that the solutions exist "without
    needing any form of exotic matter". The letter also says that in general "the joining at r = 0 of
    these regions is not 'smooth' … This implies the presence of a thin mass shell structure at the
    throat … The condition for a 'smooth' geometry is ν′(0) = 0."
  - Companion paper: J. L. Blázquez-Salcedo, C. Knoll, E. Radu, *Eur. Phys. J. C* **82**, 533 (2022).
    arXiv:2108.12187. DOI 10.1140/epjc/s10052-022-10488-6. **Full text accessed; the closing
    discussion read.** It says: "it is well known that WHs generically possess dynamical
    instabilities, already at the level of spherically symmetric perturbations … Therefore it is
    possible that the EDM WH also possess similar instabilities."
- **Critiques:**
  - **S. Bolokhov, K. Bronnikov, S. Krasnikov, M. Skvortsova**, "A note on 'Traversable wormholes in
    Einstein–Dirac–Maxwell theory'", *Grav. Cosmol.* **27**, 401 (2021). arXiv:2104.10933.
    DOI 10.1134/S0202289321040034. **Full text read.**
    - Curvature at the throat is Planckian, so vacuum polarisation is not negligible.
    - A nonzero ν′(0) means asymmetry, not a thin shell.
    - Z2 symmetry causes problems with sign-changing particle number and mass.
    - "exotic matter … is quite necessary at a wormhole throat".
  - **D. L. Danielson, G. Satishchandran, R. M. Wald, R. J. Weinbaum**, "Blázquez-Salcedo–Knoll–Radu
    wormholes are not solutions to the Einstein-Dirac-Maxwell equations", *Phys. Rev. D* **104**,
    124055 (2021). arXiv:2108.13361. DOI 10.1103/PhysRevD.104.124055. **Abstract only.** "the BSKR
    metric fails to be C³ on the wormhole throat … Thus, the BSKR wormholes cannot be solutions to the
    EDM equations."
  - **R. A. Konoplya, A. Zhidenko**, "Traversable wormholes in General Relativity", *Phys. Rev. Lett.*
    **128**, 091104 (2022). arXiv:2106.05034. DOI 10.1103/PhysRevLett.128.091104. **Abstract and
    introduction read.** They construct asymmetric, smooth EDM wormholes that avoid the symmetric
    construction's problems. They make no stability claim.
  - **B. Kain**, "Are Einstein-Dirac-Maxwell wormholes traversable?", *Phys. Rev. D* **108**, 044019
    (2023). arXiv:2305.11217. DOI 10.1103/PhysRevD.108.044019. **Full text accessed, sections read**:
    abstract, Sec. I, end of Sec. V, Sec. VI. This is a nonlinear evolution of the asymmetric
    (Konoplya–Zhidenko) solutions: "In all cases considered, our simulations indicate that black holes
    form that are connected by the wormhole … We conclude that Einstein-Dirac-Maxwell wormholes are
    not traversable."
  - **B. Kain**, "Einstein-Dirac-Maxwell wormholes in quantum field theory", *Phys. Rev. D* **108**,
    084010 (2023). arXiv:2308.00049. **Abstract only.** A construction in QFT; no stability content.
- **Status.** EDM wormholes were not claimed to be stable by their authors. Their existence as smooth
  EDM solutions is disputed for the symmetric version (Bolokhov et al.; Danielson et al.). Nonlinear
  evolution of the asymmetric version forms black holes (Kain 2023).

---

## Q6. Control theory

### (a) Critical delay for delayed PD stabilisation of x″ = a x − K x(t−τ) − D x′(t−τ)

**Sources:**

1. G. Stépán, "Balancing with reflex delay", in *Proc. 12th Int. Symp. on Biomechanics in Sports*
   (ISBS 1994), pp. 379–382 (ISBS Conference Proceedings Archive, ojs.ub.uni-konstanz.de/cpa, article
   2599). **Full text read** from page images. The equations did not survive OCR, so I read them off
   the rendered pages.
2. T. Insperger, J. Milton, G. Stépán, "Acceleration feedback improves balancing against reflex
   delay", *J. R. Soc. Interface* **10**, 20120763 (2013). DOI 10.1098/rsif.2012.0763, PMC3565692.
   **Full text accessed, sections read**: Secs. 1, 3, 4.1–4.3, App. A.3. The equations are images and
   were read directly.
3. T. Insperger, J. Milton, G. Stépán, "Semi-discretization and the time-delayed PDA feedback control
   of human balance", *IFAC-PapersOnLine* **48**(12), 93–98 (2015). DOI 10.1016/j.ifacol.2015.09.359.
   **Full text accessed, sections read**: abstract, Sec. 3.2.
4. S.-I. Niculescu, I. Boussaada, X.-G. Li, G. Mazanti, C.-F. Méndez-Barrios, "Stability, delays and
   multiple characteristic roots in dynamical systems: a guided tour", *IFAC-PapersOnLine* **54**(18),
   222–239 (2021). arXiv:2111.08332. DOI 10.1016/j.ifacol.2021.11.143. **Full text accessed, sections
   read**: Remark 3.6, Sec. 7.1.

Not accessed:

- G. Stépán, *Retarded Dynamical Systems: Stability and Characteristic Functions*, Pitman Research
  Notes in Mathematics 210 (Longman Scientific & Technical, Harlow, 1989; ISBN 0-582-03932-0). **Not
  accessed.**
- G. Stépán, L. Kollár, "Balancing with reflex delay", *Math. Comput. Modelling* **31**(4–5), 199–205
  (2000). DOI 10.1016/S0895-7177(00)00039-X. **Not accessed** (publisher returned HTTP 403).
- G. Stépán, "Delay effects in the human sensory system during balancing", *Phil. Trans. R. Soc. A*
  **367**, 1195–1212 (2009). DOI 10.1098/rsta.2008.0278. **Abstract only** (PubMed 19218159). The
  abstract gives no formula.
- F. Schürer, "Zur Theorie des Balancierens", *Math. Nachr.* **1**, 295–331 (1948).
  DOI 10.1002/mana.19480010506. **Not accessed.** Insperger et al. (2013) cite it, together with
  Stépán (1989), for the critical-delay claim.

**Statements.**

- **Stépán (1994)**, from the page images:
  - Linearised equation (3) for a stick on a sliding base: φ̈(t) − (6g/l)φ(t) +
    (6/(ml))(Dφ̇(t−τ) + Pφ(t−τ)) = 0.
  - Theorem 2 gives the exact stability domain: for τ > 0 the trivial solution "is asymptotically
    stable if and only if mg = P_min < P < P_max(ω) = (mg + (ml/(6τ²))ω²) cos ω, (4) where ω is the
    only value satisfying Dω = Pτ tan ω in the interval (0, π/2)."
  - The critical delay: "Theorem 4.6. There always exist parameters P, D such that the trivial
    solution of (3) is asymptotically stable if τ < τ_cr, and the trivial solution is always unstable
    if τ > τ_cr, where the critical value is given by τ_cr = √(l/(3g)). (5) This simple result can be
    proved by checking the condition P_min < P_max(ω) for the existence of any stability domain for P
    in (4)."
  - The numbering 4.6 suggests a theorem quoted from Stépán (1989), which the paper cites. That is
    inference; I did not access the book.
  - **[reviewer note]** With a = 6g/l, √(l/(3g)) = √(2/a).
  - Example: "everybody is able to balance a stick of length l = 0.3 meters, when the critical delay
    is τ_cr ≈ 0.1 second."
  - "there is no stability if either D=0 or P=0 in (3)."
- **Insperger, Milton & Stépán (2013)**:
  - Eq. (1.1): "It is known that a PD controller cannot stabilize an unstable equilibrium if the
    feedback delay is larger than a critical value [7, 31]. For an inverted pendulum, the critical
    feedback delay can be given as τ_crit,PD = T_p/(π√2)". Here T_p is the period of small
    oscillations when the pendulum hangs downward; [7] is Stépán 1989 and [31] is Schürer 1948.
  - Eq. (3.6) is J_A φ̈ + b_t φ̇ + (k_t − m g ℓ_AC)φ = −K_p φ(t−τ) − K_d φ̇(t−τ) − K_a φ̈(t−τ).
    Rescaling t̃ = t/τ gives Eq. (3.7), φ̈ + bφ̇ − aφ = −k_p φ(t−1) − k_d φ̇(t−1) − k_a φ̈(t−1), with
    a = (m g ℓ_AC − k_t)τ²/J_A (Eq. 3.8).
  - Sec. 4.1: "If k_a = 0 then (3.7) is an RFDE. For this system, the criteria for the stabilizability
    are known in the literature [7, 31, 54]: if the dimensionless system parameter a is larger than a
    critical value given by a_crit,PD = 2 (4.1) then the system is unstable for any k_p and k_d."
    Eq. (4.2): τ_crit,PD = √(2J_A/(m g ℓ_AC − k_t)).
  - **[reviewer note]** With A = (m g ℓ_AC − k_t)/J_A, a = Aτ² < 2 is the same as τ < √(2/A). This is
    exactly the expected result for x″ = A x − K x(t−τ) − D x′(t−τ).
  - With acceleration feedback (PDA, |k_a| < 1): a_crit,PDA = 2 + 2k_a (App. A.3), "the critical delay
    for the PDA controller is larger by approximately 40 per cent than that of the PD controller."
- **IFAC 2015**, Eq. (25): τ_crit,cont = √(2k_a + 2)/ω_n, where ω_n² is the open-loop instability
  coefficient. "If the feedback delay is larger than τcrit,cont, then the system is unstable for any
  kp, kd and |ka| < 1." For k_a = 0 this is √2/ω_n.
- **Guided tour (2021)**:
  - Remark 3.6, for θ̈ − (g/l) sin θ = u with u(t) = −k_p θ(t−τ) − k_d θ̇(t−τ): "the delay margin τm
    guaranteeing the stability of closed-loop system for all τ ∈ [0, τm) is τm = √(2l/g)".
  - Sec. 7.1, for φ̈ + a0 φ = u with a0 < 0: "The critical delay of system (46) is given by
    τcrit = √(−2/a0), (48) that is, the closed-loop system (46) is asymptotically stable if and only
    if τ < τcrit". This is in the context of tuning the gains for a triple root.

### (b) Hayes 1950

- **Source.** N. D. Hayes, "Roots of the transcendental equation associated with a certain
  difference-differential equation", *J. London Math. Soc.* **s1-25**(3), 226–232 (1950).
  DOI 10.1112/jlms/s1-25.3.226. **Not accessed** (Wiley returned HTTP 403). The citation was confirmed
  in three independent reference lists and through the DOI.
- **The criterion, from secondary sources** (full text accessed):
  - D. C. De Souza, A. R. Humphries, "Dynamics of a mathematical hematopoietic stem-cell population
    model", *SIAM J. Appl. Dyn. Syst.* **18**, 808–852 (2019). arXiv:1712.08308.
    DOI 10.1137/18M1165086. For z′(t) = a z(t) + b z(t−τ) (Eq. 10):
    - "p(λ) := λ − a − b e^{−λτ} = 0, (13) first studied by Hayes."
    - "The steady state is unstable if b > −a with a characteristic value λ > 0, and it is
      asymptotically stable if a < −|b| < 0 … The interesting parameter region is for b ⩽ −|a| < 0,
      where the steady state is asymptotically stable for τ < τ1(a, b) := cos⁻¹(−a/b)/√(b² − a²) (14)
      and unstable if τ > τ1(a, b)."
    - "The curve C0 described by τ1(a, b) is contained in the region a ⩽ 1/τ and b ⩽ −1/τ and can be
      parameterised as C0 = (a, b) = (ω cot(ω)/τ, −ω csc(ω)/τ), ω ∈ [0, π)."
  - S. Bernard, F. Crauste, "Optimal linear stability condition for scalar differential equations with
    distributed delay", *Discrete Contin. Dyn. Syst. B* **20**, 1855–1876 (2015). arXiv:1405.7333.
    DOI 10.3934/dcdsb.2015.20.1855. Theorem 2.5, "originally due to Hayes", is the same criterion
    written for x′ = −a x − b x(t−E).
  - J. Nishiguchi, "Stability region and critical delay", arXiv:2109.10426. Section 5.3 restates
    Hayes's Lemma 2 in Lambert-W form.
- **[reviewer note]** For a > 0, stability needs b < −a and τ < τ1. Writing −a/b = cos θ with
  θ ∈ (0, π/2) gives aτ1 = θ cot θ < 1. So **aτ < 1 is necessary**, as expected, and the stability
  region pinches off at (aτ, bτ) → (1, −1). I did not see the exact "p < 1" wording of Hayes's paper
  or of Hale & Verduyn Lunel.

### (c) Breda, Maset & Vermiglio 2005

- **Citation confirmed (Crossref):** D. Breda, S. Maset, R. Vermiglio, "Pseudospectral differencing
  methods for characteristic roots of delay differential equations", *SIAM J. Sci. Comput.* **27**(2),
  482–495 (2005). DOI 10.1137/030601600. **Abstract only.**
- The abstract confirms it is the infinitesimal-generator approach. Earlier work had computed
  characteristic roots "by approximating the derivative in the infinitesimal generator of the solution
  operator semigroup by Runge–Kutta (RK) and linear multistep (LMS) methods … In this work the same
  approach is proposed in a new version based on pseudospectral differencing techniques. We prove the
  'spectral accuracy' convergence behavior typical of pseudospectral schemes".

---

## Q7. Active (feedback) stabilisation, operation and maintenance

### Sources

1. S. A. Hayward, S.-W. Kim, H. Lee, "Dilatonic wormholes: construction, operation, maintenance and
   collapse to black holes", *Phys. Rev. D* **65**, 064003 (2002). arXiv:gr-qc/0110080.
   DOI 10.1103/PhysRevD.65.064003. **Full text read.**
2. S. A. Hayward, "Wormhole dynamics in spherical symmetry", *Phys. Rev. D* **79**, 124001 (2009).
   arXiv:0903.5438. DOI 10.1103/PhysRevD.79.124001. **Full text read.**
3. Shinkai & Hayward 2002 (Q2). **Full text read.**
4. S. A. Hayward, "Recent progress in wormhole dynamics", arXiv:gr-qc/0306051. Workshop proceedings,
   INSPIRE conference C02-11-25. **Full text accessed, sections read**: Secs. 3–5.
5. S. A. Hayward, H. Koyama, "How to make a traversable wormhole from a Schwarzschild black hole",
   *Phys. Rev. D* **70**, 101502 (2004). arXiv:gr-qc/0406080. DOI 10.1103/PhysRevD.70.101502. **Full
   text accessed; abstract and closing remarks read.** Companion paper: H. Koyama, S. A. Hayward,
   *Phys. Rev. D* **70**, 084001 (2004), arXiv:gr-qc/0406113, DOI 10.1103/PhysRevD.70.084001,
   **abstract only**.
6. A. Doroshkevich, J. Hansen, I. Novikov, A. Shatskiy, "Passage of radiation through wormholes",
   *Int. J. Mod. Phys. D* **18**, 1665 (2009). arXiv:0812.0702. DOI 10.1142/S0218271809015230.
   **Abstract and introduction read.**

### Findings

**Compensating a traveller's positive energy.**

- **Hayward, Kim & Lee 2002.** This is 2D CGHS dilaton gravity with a ghost Klein–Gordon field, and
  it is exactly solvable.
  - *Operation:* a positive-energy pulse of energy ε makes the wormhole non-static. "If the pulse
    energy is small, ε ≪ a, the wormhole persists in an almost static state for a long time,
    t ∼ x0 a/ε. Nevertheless, even for an arbitrarily weak pulse, eventually a spatial r = 0
    singularity develops … Thus the static wormhole exhibits a type of neutral stability". They also
    require "ε < a/2 to avoid an r = 0 singularity … a one-metre wormhole could transport over a
    hundred Earth masses."
  - *Maintenance* (Sec. VII): "Keeping an operating wormhole viable indefinitely, defying its natural
    fate as a black hole, requires additional negative energy to balance the transported matter." The
    continuous version is Eq. (46), G± = ±√(4λ² + F±²): "the source terms in the constraints (14)
    cancel to the static wormhole values. Thus the wormhole remains static."
  - The pulsed version: a ghost pulse before the traveller with ε + ε′ = 0 (Eq. 52), and "the final
    state is identical to the initial state in this symmetric case."
  - On tuning: "The examples show that there is no practical problem of fine-tuning the ghost field to
    keep the wormhole static. An almost static wormhole is still traversible and can be adjusted at
    any time to bring it closer to staticity, or to change its size. This is essentially due to the
    neutral stability."
- **Shinkai & Hayward 2002** (4D Ellis, which is genuinely unstable). Sec. III D, Fig. 11:
  - Traveller pulse (c̃a, c̃b, c̃c) = (0.1, 6.0, 2.0).
  - Balancing ghost pulse (ca, cb, cc) = (0.02390, 6.0, 3.0) gives inflation (case B).
  - Balancing ghost pulse (0.02385, 6.0, 3.0) "keeps the static structure up to the end of the range"
    (case C, which ends at x⁻ = 10).
  - "to keep the throat as it was requires a fine-tuning of the parameters, and may not be realistic.
    However, it shows how the wormhole life may be extended. This indicates that the wormhole might be
    maintained by continual adjustments to the radiation level, though it would be a never-ending
    project."
- **Hayward 2009.** "a Morris-Thorne wormhole throat is a double trapping horizon, which will
  generally bifurcate under a dynamic perturbation, such as someone crossing it. This raises the
  issues of stability and, if stable, maintenance, i.e. returning a perturbed wormhole to a static
  state." Also: "a traversable wormhole can collapse to a black hole if its negative-energy source
  fails, or if enough positive-energy matter or radiation is pumped in". And: "For some matter models,
  this can be done in an apparently stable way …, while others are unstable, leading either to
  collapse to a black hole as above, or to inflationary expansion". The 2009 paper gives no new
  traveller computation.
- **Hayward 2003 review**, conclusions: "Traversible wormholes can be dynamically stable or unstable,
  depending on the exotic matter model. Linearization stability is not conclusive." and "Stable
  wormholes can be operated and maintained by balance of positive and negative energy". It restates
  the Shinkai–Hayward critical behaviour as "x − x0 = −0.60 ln E0 … M = 0.30a or Hubble constant
  H = 1.1/a".
- **Hayward & Koyama 2004** (4D, impulsive phantom radiation): "the enlargement is not a runaway
  inflation but an apparently stable process, whereby the amount of enlargement can be controlled by
  the energy or timing of the impulses." This is open-loop control by prescribed impulses.
- **Doroshkevich et al. 2009.** A radiation pulse passing through a zero-mass Ellis/Armendáriz-Picón
  wormhole leads to either "collapse of the wormhole into the black hole" or "the expanding wormhole".
  There is no compensation scheme.

**Closed-loop (feedback) control: not found.** No peer-reviewed paper I could find designs a feedback
law or controller for a wormhole throat, or applies delay-feedback stability theory such as
Stépán's or Hayes's results to wormholes. Every "maintenance" scheme found uses prescribed
(open-loop) compensating radiation. Shinkai & Hayward's "continual adjustments to the radiation level"
is the closest statement to feedback; they do not develop it.

One non-peer-reviewed item turned up. A. Obidowski, "OTSOW: Turning-point constraints and finite-time
controlled traversability of a phantom-supported wormhole in four-dimensional general relativity",
Zenodo preprint, 2026-08-17 (record 21984669). **Abstract (repository metadata) only.** It uses "a
separate positive-energy matter sector … to control the dynamical evolution" and says "The results
therefore do not describe an eternally stable wormhole". From the abstract it is a prescribed control
sector, not a feedback loop.

---

## Q8. Parametric (Kapitza, periodic driving, Floquet) stabilisation

**Result: not found.** No published work found studies Kapitza, parametric or Floquet stabilisation
of an unstable classical wormhole, or of any other unstable gravitational soliton such as a boson
star, Fisher/anti-Fisher solution or black-hole hair. The full list of search terms is in the
appendix.

**Closest related work** (none is stabilisation of a dynamically unstable classical wormhole):

- **M. Berenguer, A. Dey, J. Mas, J. Santos-Suárez, A. V. Ramallo**, "Floquet SYK wormholes", *JHEP*
  **06** (2024) 106. arXiv:2404.08394. DOI 10.1007/JHEP06(2024)106. **Full text accessed, sections
  read**: abstract, Sec. 1, start of Sec. 3.2, conclusions.
  - System: two coupled SYK models, "conjectured to be holographically dual to an eternal traversable
    wormhole in AdS2". They apply "different periodic drivings of the parameters of the system".
  - Results: "a series of resonant frequencies in which the energy absorption and heating are
    enhanced significantly and the transmission coefficients drop, signalling a closure of the
    wormhole … When driving the strength of the separate SYK terms we find that the transmission can
    be enhanced by suitably tuning the driving."
  - The "unstable" phase they probe is the canonically unstable "hot wormhole": "Being unstable in the
    canonical ensemble". That is a thermodynamic instability, not a growing dynamical mode.
  - The thesis M. Berenguer Mimó, arXiv:2510.17943 (2025), **abstract only**, adds: "evidence that the
    unstable region of the phase diagram can be dynamically accessed."
- **A. Biasi, P. Carracedo, J. Mas, D. Musso, A. Serantes**, "Floquet scalar dynamics in global AdS",
  *JHEP* **04** (2018) 137. arXiv:1712.07637. DOI 10.1007/JHEP04(2018)137. **Abstract only.**
  - Periodically driven scalar geometries ("Floquet condensates"): "We map the regions of stability
    in the solution space. In a significant portion of the unstable subspace … Collapse into a black
    hole occurs for one sign. For the opposite sign instead one attains a regular solution with
    periodic modulation."
  - Boson stars appear only as quasistatic-quench endpoints. Driving is not used to stabilise an
    unstable soliton.
- **M. Kurkov**, "Emergent spontaneous symmetry breaking and emergent symmetry restoration in rippling
  gravitational background", *Eur. Phys. J. C* **76**, 329 (2016). arXiv:1601.00622.
  DOI 10.1140/epjc/s10052-016-4178-6. **Abstract only.** A Kapitza-pendulum analogy for a scalar field
  under rapidly oscillating ripples of the scale factor, which change its effective potential. The
  object is a scalar field, not a soliton or wormhole.
- **E. Lozano, F. D. Mazzitelli**, "The role of noise in the early universe", *Int. J. Mod. Phys. D*
  **30**, 2150117 (2021). arXiv:2008.03331. DOI 10.1142/S0218271821501170. **Abstract only.** A
  stochastic-Kapitza argument for an unstable gravitational degree of freedom, the scale factor
  modelled as an inverted oscillator: "a positive vacuum energy density would not produce an
  exponentially expanding but an oscillating universe, in the same fashion that an inverted pendulum
  is stabilized by random oscillations of the suspension point (stochastic Kapitza pendulum)."
- **Not literature:** a public GitHub pull request, "S0-2026-10-15b: Kapitza dynamic-stabilisation
  screen for wormhole throats (derived, toy); paused" (github.com/DD-Ching/jwst-anomaly-research,
  PR #255). It surfaced in search results. **Not accessed**; it is an unreviewed working note.

---

## Appendix: search terms used (Q5, Q7, Q8)

- **Q5 (critiques of BLNS 2013):** web search for "stable wormhole" phantom dust magnetic field Ellis
  metric Bronnikov Lipatova Novikov Shatskiy equation of state h(x) criticism follow-up. INSPIRE
  query "refersto:recid:1266514" (113 records; titles of the most recent 80 checked).
- **Q7, web searches:**
  - wormhole "feedback control" OR "active stabilization" OR "active control" traversable wormhole
    stabilize throat
  - wormhole stabilization "control theory" OR "delayed feedback" OR "Pyragas" OR "feedback loop"
  - "wormhole maintenance" negative energy pulse traveller compensate back-reaction
- **Q8, web searches:**
  - "Kapitza" wormhole stabilization parametric oscillation throat
  - Floquet stability periodically driven wormhole OR "oscillating thin-shell wormhole" Mathieu
    equation parametric resonance throat
- **Q8, arXiv API abstract-field queries** (hit counts in brackets):
  - abs:Kapitza AND abs:wormhole [0]; abs:Kapitza AND abs:wormholes [0]
  - abs:Floquet AND abs:wormhole [2, both SYK]
  - abs:"parametric resonance" AND abs:wormhole [1, accretion-disk QPOs]
  - abs:"dynamical stabilization" AND abs:wormhole and abs:"dynamic stabilization" AND abs:wormhole
    [9 each; loose matches about ordinary stability, none involve driving]
  - abs:"periodically driven" AND abs:wormhole [1, SYK thesis]
  - abs:"parametric" AND abs:"stabilization" AND abs:wormhole [6, none involve driving]
  - abs:Kapitza AND cat:gr-qc [2: Kurkov 2016; Lozano & Mazzitelli]
  - abs:Kapitza AND abs:"boson star" [0]; abs:Floquet AND abs:"boson star" [1: Biasi et al. 2018]
  - abs:Kapitza AND abs:soliton AND abs:gravit [0]; abs:"Kapitza pendulum" AND abs:gravity [0]
  - abs:"thin-shell wormhole" AND abs:oscillat AND abs:periodic [0]; abs:"Mathieu" AND abs:wormhole [0]
  - abs:"Maldacena-Qi" AND abs:driven [1]; abs:"Maldacena-Qi" AND abs:Floquet [1]
  - abs:"traversable wormhole" AND abs:Floquet [2]; abs:"traversable wormhole" AND
    abs:"periodic driving" [1: Floquet SYK wormholes]
  - abs:Kapitza AND abs:"black hole" [0]
  - abs:Kapitza AND abs:cosmolog [1: axion potentials, arXiv:2509.11032, not relevant]
  - abs:"boson star" AND abs:periodic AND abs:stabiliz [0]
  - abs:"parametric stabilization" AND (gr-qc OR hep-th) [1: GW-detector arm locking, not relevant]
  - abs:"vibrational stabilization" [0]
  - abs:"dynamical stabilization" AND abs:Kapitza AND (gr-qc OR hep-th) [0]

## Appendix: reviewer's own consistency checks (not literature claims)

1. **GGS ground state.** Shooting on −χ″ − 3(1+x²)⁻²χ = −β²χ (b = 1, even ground state; numpy RK4)
   gives β = 1.18197 and E0 = −1.39705, so 1/β = 0.84605. This matches GGS Table I (0.846) and
   ωI = −1.182 in the 2018 and 2024 papers. It confirms how I read the paper's units; it says nothing
   about the Stage A results.
2. **Poisson–Visser boundaries.** These are evaluated from Eqs. (31), (32) and (34) and listed under
   Q4(b).
3. **Shinkai–Hayward coefficient.** The 0.60 → 0.85 conversion is described under Q2.

---

## Summary table

| Question | Finding | Access status |
|---|---|---|
| Q1(a) growth rate | Massless Ellis: e-folding time T = 0.846 b/c, so growth rate ≈ 1.18 c/b (GGS Table I; proper time at throat, units of throat areal radius). T falls to 0.590 for γ1 → ∞. Independent: ωI = −1.182/r0 (BCK 2018; Azad et al. 2024). τ0 = 28 µs for r_T = 10 km (2026). | GGS I full text read; BCK 2018 and Azad 2024 full text accessed, sections read |
| Q1(b) gauge and master equation | Gauge-invariant Ψ = e^c(δΦ − (Φ_x/c_x)δc), derived in δc = 0 gauge. Eq. (23) has a singular potential (infinite wall at throat). Darboux/S-deformation gives χ_tt − ∂²χ + Wχ = 0 with W = −3/(1+x²)² (γ1 = 0, b = 1). Regular δc is built in δΦ = 0 gauge, Eq. (36). | Full text read |
| Q1(c) symmetry and parity | Spherically symmetric only. The mode changes the throat radius (stated by GGS I, GGS II and BFZ). Evenness is not stated; it follows from the even W and the nodeless ground state [reviewer]. | Full text read |
| Q1(d) nonlinear (GGS II) | Collapse to a Schwarzschild BH (m_AH ≈ 0.22 b) or exponential expansion, depending on the sign of the perturbation; a second collapse window at εc ∈ [−0.09, −0.05]. Time scale 0.836 (collapse) and 0.85 (expansion) as εc → 0; nonlinear terms accelerate collapse; "a few microseconds" for 1 km. | Full text read |
| Q1 charged (PRD 80, 024023) | Sub- and supercritical charged wormholes unstable; charge reduces β by > 100× at ν = 0.96 and adds oscillation above ν* ≈ 0.55; stability for ν → 1 left open; "does not seem to be able to stabilize". 2026 follow-up: instability persists, τ0 can be made arbitrarily long near extremality. | Full text accessed, sections read (both) |
| Q2 Shinkai & Hayward | Unstable to tiny pulses: E0 < 0 gives inflation (H → 1.1/a), E0 > 0 gives BH (M → 0.30a); collapse coordinate x_H⁻ − 3 = −0.60 ln E0 + const; traveller always gives BH; balancing ghost pulse maintains it only for a limited time and needs fine tuning. | Full text read |
| Q3 BFZ 2011 and BKZ 2012 | No Ellis growth-rate number in either. BFZ: δr = 0 gauge plus S-deformation, reproduces GGS potential, defers to GGS; rates only for other branches (e^{0.25t/m}, e^{0.23t/m}). BKZ: m ≠ 0 only, δR = 0 gauge, numerical S-deformation. | Full text read (both) |
| Q4(a) Poisson–Visser V(a) | V(a) = 1 − 2M/a − (2πσa)²; stable iff 2M/a0 + (M²/a0²)/(1−2M/a0) + (1+2β0²)(1−3M/a0) < 0. | Full text read |
| Q4(b) PV regions | I: β0² ≥ 3/2+√3 with a0⁻ < a0 < a0⁺ (inside 2M–3M). II: β0² ≤ −1/2 with a0 > a0⁻. Unstable for −1/2 < β0² < 3/2+√3. The sign flip at a0 = 3M separates the two. Bound → −1/2 as a0 → ∞, → +∞ as a0 → 2M⁺, minimum 3/2+√3 at a0 = (3+√3)M/2 [reviewer]. | Full text read |
| Q4 Eiroa & Romero | Large charge (\|Q\|/M ≈ 1) widens the stability region. | Full text accessed, sections read |
| Q5 BLNS 2013 | Ellis metric with phantom dust/fluid plus radial magnetic or electric field; stable for ℓ = 0 (for h(x) = a xⁿ/rⁿ, vanishing at the throat) and all axial modes; polar ℓ ≥ 1 not done. No published critique found. | Full text read |
| Q5 rotating Ellis | 5D, equal angular momenta: unstable mode vanishes above (\|J\|/A)cr = 0.10063 (symmetry-preserving modes only). 4D Kleihaus–Kunz and Chew et al.: no stability analysis. 4D slow-rotation radial analysis (Azad 2024): indications of stabilisation near 30–50 % of the extremal limit. Non-perturbative 4D: open. | Partly full text, partly abstract (see Q5) |
| Q5 EDM wormholes | Two charged Dirac fermions plus Maxwell; no stability claim (the authors expect generic instability). Symmetric solutions disputed (thin shell; not C³; not EDM solutions). Asymmetric ones evolve into black holes (Kain 2023). | Varies (see Q5) |
| Q6(a) critical delay | Delayed PD stabilises x″ = a x + … iff τ < √(2/a): Stépán (1994 ISBS, "Theorem 4.6", τ_cr = √(l/3g) with a = 6g/l); Insperger, Milton & Stépán 2013 (a_crit,PD = 2 with a = Aτ²; cites Stépán 1989 and Schürer 1948); IFAC 2015 Eq. (25); guided tour 2021. PDA raises it by up to √2. | ISBS 1994 full text read (images); 2013, 2015, 2021 sections read; 1989 book, 2000 MCM and Schürer not accessed; 2009 Phil Trans abstract only |
| Q6(b) Hayes 1950 | x′ = a x + b x(t−τ): unstable if b > −a; stable for all τ if a < −\|b\|; for b ≤ −\|a\| stable iff τ < arccos(−a/b)/√(b²−a²); boundary lies in aτ ≤ 1, so a > 0 needs aτ < 1. | Hayes not accessed (403); secondary sources full text accessed |
| Q6(c) Breda, Maset, Vermiglio | SIAM J. Sci. Comput. 27(2):482–495 (2005), DOI 10.1137/030601600 confirmed; pseudospectral discretisation of the infinitesimal generator. | Abstract only |
| Q7 feedback and maintenance | HKL 2002 (2D): traveller gives neutral stability; exact compensation by extra ghost radiation (G² = 4λ² + F²) or pulses with ε + ε′ = 0 keeps or restores the static wormhole without fine-tuning problems. Shinkai–Hayward (4D Ellis): compensation needs fine tuning and lasts a limited time, "continual adjustments … never-ending project". No closed-loop or feedback controller found in the literature. | HKL 2002, Hayward 2009 and SH 2002 full text read; others see Q7 |
| Q8 parametric/Kapitza/Floquet | Not found for classical wormholes or gravitational solitons. Closest: Floquet-driven SYK (Maldacena–Qi) wormhole (JHEP 2024; resonances close it); driven AdS scalar condensates (JHEP 2018); Kapitza analogies for scalar fields and the scale factor (2016, 2021). | Floquet SYK sections read; others abstract only |
