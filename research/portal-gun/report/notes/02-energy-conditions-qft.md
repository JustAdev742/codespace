# 02 - Energy conditions, negative energy in QFT, the Casimir effect, and modern traversable-wormhole constructions

Research notes for the "portal gun" (traversable wormhole) report. Compiled 2026-10-19.

**Method.** Full texts were obtained from arXiv as PDFs (curl), converted with `pdftotext -layout`,
and read directly; equations below are my transcriptions from those texts (pdftotext mangles
layout, so every transcription was checked against the surrounding text, and anything I could not
read unambiguously is flagged). Where only the arXiv version was read, the published version may
differ in minor ways; this is flagged per source. "Quote:" marks verbatim text (all under 25 words).
Nothing here is from memory unless explicitly labelled "[from memory - not verified]".

**Access-status vocabulary:** "full text read" = I read the paper's text (usually arXiv version);
"abstract only"; "bibliographic only".

**Source index (section: source - access):**
1 Ford-Roman 1995 PRD 51, 4277 - full text | 2 Ford-Roman 1997 PRD 55, 2082 - full text |
3 Ford-Roman 1996 PRD 53, 5496 - full text | 4 Fewster-Eveson 1998 PRD 58, 084010 - full text |
5 Fewster 2012 arXiv:1208.5399 - full text | 6 Kontou-Sanders 2020 CQG 37, 193001 - full text |
7 Graham-Olum 2007 PRD 76, 064001 - full text | 8 Kontou-Olum 2015 PRD 92, 124009 - full text (key parts) |
9 Faulkner-Leigh-Parrikar-Wang 2016 JHEP 09, 038 - intro/results | 10 Hartman-Kundu-Tajdini 2017 JHEP 07, 066 - intro |
11 Friedman-Schleich-Witt 1993 PRL 71, 1486 - full text (arXiv v2) | 12 Gao-Wald 2000 CQG 17, 4999 - full text |
13a Casimir 1948 - full text (KNAW reprint scan) | 13b Brown-Maclay 1969 Phys. Rev. 184, 1272 - bibliographic only (content via 3 secondary sources) |
13d Graham-Olum 2005 PRD 72, 025013 - full text | 13e Fewster-Olum-Pfenning 2007 PRD 75, 025007 - full text (key parts) |
14 Lamoreaux 1997 PRL 78, 5 - full text (erratum PRL 81, 5475 not read); Mohideen-Roy 1998 PRL 81, 4549 - full text; Bressi et al. 2002 PRL 88, 041804 - full text |
15 Visser-Kar-Dadhich 2003 PRL 90, 201102 - full text | 16 Fewster-Roman 2005 PRD 72, 044023 - full text |
17 Gao-Jafferis-Wall 2017 JHEP 12, 151 - full text | 18 Maldacena-Stanford-Yang 2017 Fortsch. Phys. 65, 1700034 - key sections |
19 Maldacena-Qi 2018 arXiv:1804.00491 (unpublished) - intro/conclusions | 20 Maldacena-Milekhin-Popov CQG 40, 155016 (2023) - full text |
21 Maldacena-Milekhin 2021 PRD 103, 066007 - full text | 22 Fu-Grado-White-Marolf 2019 CQG 36, 245018 - abstract/intro/discussion |
23 Butcher 2014 PRD 90, 024019 - full text | 24 Butcher 2015 PRD 91, 124031 - full text |
25 Barcelo-Visser 1999 PLB 466, 127 - full text; 2000 CQG 17, 3843 - abstract + key passages |
26 Garattini 2019 EPJC 79, 951 - full text | 27 Blazquez-Salcedo-Knoll-Radu 2021 PRL 126, 101102 - full text; Bolokhov et al. 2021 Grav. Cosmol. 27, 401 - full text; Danielson et al. 2021 PRD 104, 124055 - key parts; Konoplya-Zhidenko 2022 PRL 128, 091104 - full text |
28 Pfenning-Ford 1997 CQG 14, 1743 - full text | 29 Fewster-Roman 2003, Flanagan-Wald 1996, Olum 1998 - abstracts/openings; Wall 2013 - bibliographic |
30 summary table of numbers | 31 discrepancies and open questions.

---

## 1. Ford & Roman 1995 - "Averaged energy conditions and quantum inequalities"

- **Citation:** L. H. Ford and T. A. Roman, "Averaged energy conditions and quantum inequalities,"
  Phys. Rev. D **51**, 4277-4286 (1995).
- **DOI:** 10.1103/PhysRevD.51.4277 ; **arXiv:** gr-qc/9410043 (v1, 29 Oct 1994; preprint TUTP-94-16);
  URL: https://arxiv.org/abs/gr-qc/9410043
- **Access:** full text read (arXiv v1).
- **Units/conventions:** hbar = c = 1 (stated: "Units with hbar = c = 1 will be used").
- **Field:** free, massless, *minimally coupled* scalar field; 2D (incl. spatially compactified) and
  4D Minkowski spacetime **without boundaries**. Expectation values are renormalized (normal-ordered
  w.r.t. the Minkowski vacuum) in an *arbitrary* quantum state.

**Key result (Sec. 4, Eqs. 63-65).** The 4D energy-density QI is derived by a spherical-wave mode
expansion about r = 0:

$$\hat\rho \ge -\frac{1}{4\pi^2}\int_0^\infty d\omega\,\omega^3 e^{-2\omega t_0} = -\frac{3}{32\pi^2 t_0^4}\qquad(63),(64)$$

and then written covariantly for any inertial (timelike geodesic) observer with 4-velocity
$u^\mu$ and proper time $\tau$:

$$\hat\rho \equiv \frac{\tau_0}{\pi}\int_{-\infty}^{\infty}\frac{\langle T_{\mu\nu}u^\mu u^\nu\rangle\,d\tau}{\tau^2+\tau_0^2}\;\ge\;-\frac{3}{32\pi^2\tau_0^4}\qquad\text{for all }\tau_0 \qquad (65)$$

- The sampling function is the Lorentzian $\tau_0/[\pi(\tau^2+\tau_0^2)]$, unit integral, width $\tau_0$.
  **Coefficient confirmed: 3/(32 pi^2), with hbar = c = 1** (restoring units: the bound is
  $-3\hbar/(32\pi^2 c^3\tau_0^4)$ for an energy density; my unit restoration, not in the paper).
- Taking $\tau_0\to\infty$ yields AWEC, $\int\langle T_{\mu\nu}u^\mu u^\nu\rangle d\tau\ge 0$ (66), and ANEC (67) as
  the null limit (by a procedure from their ref. [36]).
- Earlier flux QIs (Ford 1991, PRD 43, 3972) quoted as Eqs. (5)-(7): with $\hat F$ the Lorentzian-sampled
  flux, $\hat F\ge -1/(16\pi t_0^2)$ in 2D and $\hat F\ge -3/(32\pi^2 t_0^4)$ in 4D.
- They note that a 4D *null*-geodesic QI of the analogous form with $\lambda_0^{-4}$ on the RHS "would
  not be invariant under rescaling of the affine parameter" - foreshadowing the later
  Fewster-Roman (2003) result that no null-geodesic QI exists in 4D (see Secs. 5 and 29 below).
- 2D compactified result: a "difference inequality" for $\langle\psi|T|\psi\rangle-\langle 0_C|T|0_C\rangle$
  (state minus Casimir vacuum) obeys QI/AWEC/ANEC-type bounds even though the Casimir vacuum alone
  violates them.
- Useful remark on experiment (Introduction). Quote: "(Although, strictly speaking, the energy
  density itself has not been measured.)" - said of the Casimir effect and squeezed light.
- **Caveat:** the bound is for free fields in flat spacetime without boundaries; the "for all
  $\tau_0$" statement fails in the Casimir geometry (constant negative energy), which is why the
  1996 paper restricts $\tau_0$.

## 2. Ford & Roman 1997 - "Restrictions on negative energy density in flat spacetime"

- **Citation:** L. H. Ford and T. A. Roman, "Restrictions on negative energy density in flat
  spacetime," Phys. Rev. D **55**, 2082-2089 (1997).
- **DOI:** 10.1103/PhysRevD.55.2082 ; **arXiv:** gr-qc/9607003 (v2, 24 Jan 1997; TUTP-96-2);
  URL: https://arxiv.org/abs/gr-qc/9607003
- **Access:** full text read (arXiv v2).
- **Conventions:** metric signature (-,+,+,+); hbar = c = 1 (implicit; equations dimensionless in these units).

**Claims supported:**
1. A much simpler plane-wave derivation of the Lorentzian-sampled QI, recovering the 4D massless
   scalar result (their Eq. 1 / 17):
   $$\hat\rho\equiv\frac{t_0}{\pi}\int_{-\infty}^\infty\frac{\langle T_{00}\rangle dt}{t^2+t_0^2}\ge-\frac{3}{32\pi^2t_0^4}$$
   "for all choices of the sampling time" in the frame of an arbitrary inertial observer.
2. **Massive scalar, 4D** (Eqs. 14-16):
   $$\hat\rho\ge-\frac{3}{32\pi^2t_0^4}\,G(y),\qquad y\equiv 2mt_0,\qquad G(y)\equiv\frac16\int_y^\infty dx\,\sqrt{x^2-y^2}\,x^2e^{-x}$$
   with $G(0)=1$ and $G\to0$ as $y\to\infty$: the bound gets *more* stringent with mass (must overcome
   positive rest-mass energy); negative energy of a massive field must be more localized.
3. **Massive scalar, 2D** (Eqs. 19-25): $\hat\rho\ge-F(y)/(8\pi t_0^2)$, $F(y)=\tfrac12y^2[K_0(y)+K_2(y)]$
   (my reading of Eq. 23 combined with $I=F/(4t_0^2)$), $F(0)=1$, giving the massless 2D QI
   $\hat\rho\ge -1/(8\pi t_0^2)$. A small bump with $F$ slightly >1 for $0\lesssim y\lesssim1.2$ is
   noted as probably a non-optimal-bound artifact of 2D.
4. **Electromagnetic field, 4D** (Eq. 48): $\hat\rho\ge-3/(16\pi^2t_0^4)$ - twice the scalar
   magnitude, attributed to two polarizations.
5. Restates the wormhole consequence of the 1996 paper (below): for a 1 m throat "the negative
   energy density must be concentrated in a band no thicker than about a millionth of a proton
   radius" (quote, 20 words), and for a galaxy-sized throat no thicker than about 10 proton radii.
6. Restates that evading the bound by many fields needs ~$10^{62}$ fields (from the 1996 paper).

- **Caveat:** still free fields, flat spacetime, inertial observers, Lorentzian sampling only. The
  general-sampling-function version is Fewster & Eveson 1998 (Sec. 4 below).

## 3. Ford & Roman 1996 - "Quantum field theory constrains traversable wormhole geometries"

- **Citation:** L. H. Ford and T. A. Roman, "Quantum field theory constrains traversable wormhole
  geometries," Phys. Rev. D **53**, 5496-5507 (1996).
- **DOI:** 10.1103/PhysRevD.53.5496 ; **arXiv:** gr-qc/9510071 (v1, 31 Oct 1995; TUTP-95-4);
  URL: https://arxiv.org/abs/gr-qc/9510071
- **Access:** full text read (arXiv v1, 26 pp.). The published PRD version was not compared; equation
  numbers below are the arXiv v1 numbers.
- **Units/conventions:** hbar = G = c = 1, sign conventions of Morris & Thorne (Am. J. Phys. 56, 395,
  1988). $l_p$ = Planck length.

**Assumptions (explicit in the paper):**
- Static, spherically symmetric Morris-Thorne wormholes, metric (13)
  $ds^2=-e^{2\Phi(r)}dt^2+\frac{dr^2}{1-b(r)/r}+r^2d\Omega^2$, throat at $b(r_0)=r_0$.
- No closed timelike curves (so QFT is well defined).
- The source is the renormalized expectation value of a (massless, minimally coupled, free) scalar
  field stress tensor in some quantum state; fluctuations of $\langle T_{\mu\nu}\rangle$ ignored.
- **Central premise (Sec. 2):** the flat-space QI (their Eq. 1 = FR95 Eq. 65)
  $$\frac{\tau_0}{\pi}\int_{-\infty}^\infty\frac{\langle T_{\mu\nu}u^\mu u^\nu\rangle d\tau}{\tau^2+\tau_0^2}\ge-\frac{3}{32\pi^2\tau_0^4}$$
  is applied in curved spacetime only for sampling times $\tau_0$ small compared with the smallest
  local proper radius of curvature $r_c$ and the proper distance to any boundary. Justification: the
  RHS comes from $(4\pi^2)^{-1}\int_0^\infty d\omega\,\omega^3e^{-2\omega\tau_0}$, dominated by modes with
  wavelength $\sim\tau_0$; long-wavelength modes distorted by curvature contribute little. They pick
  $\tau_0=f\,r_m$ with $f\ll1$ (typically $f\approx0.01$), where $r_m$ is the smallest of the length
  scales $\bar r_0=b$, $r_1=b/b'$, $R_2=1/|\Phi'|$, $r_3=\Phi'/\Phi''$ (Eqs. 34-36), and show $r_c\gtrsim r_m$ (41).
- Casimir check (Eqs. 3-9): for a massless scalar with periodicity $L$ in $z$, an observer moving at
  $v$ along $z$ sees $\langle T_{\mu\nu}u^\mu u^\nu\rangle=-\frac{\pi^2}{45L^4}(1+3v^2)\gamma^2$ (3), a constant [coefficient as printed;
  probably should be $\pi^2/90$ - see Sec. 31 item 13]. The QI
  then holds only if (5) $\tau_0\le\frac{3L}{2\pi}\left(\frac56\right)^{1/4}[(1+3v^2)\gamma^2]^{-1/4}$; for a static
  observer (6) $\tau_0\le\frac{3L}{2\pi}(5/6)^{1/4}\approx0.46L$; writing $\tau_0=fL/\gamma$ and minimizing over $v$
  (minimum at $v=1/\sqrt3$) gives $\tau_0<0.42\,l_1$ with $l_1=L/\gamma$ (9), where
  $0.42=\frac{3}{2\pi}(5/8)^{1/4}$. [I checked these closed forms algebraically against Eq. (3) and the
  quoted decimals; pdftotext garbled the typesetting.] So: the flat-space QI survives in a
  Casimir-type geometry provided the sampling time is below ~0.4 of the compactification/boundary scale.
- Throat stresses (Eqs. 23-25): $\rho_0=b_0'/(8\pi r_0^2)$, $p_0=-1/(8\pi r_0^2)$,
  $P_0=\frac{1-b_0'}{16\pi r_0}\left(\Phi_0'+\frac1{r_0}\right)$.

**Worked examples (Sec. 4) - the numbers the report needs:**

| Model | QI result | Numerical example in paper |
|---|---|---|
| 4.1 $\Phi=0$, $b=r_0^2/r$ (MT Box 2) | $\rho=p_r=-P=-r_0^2/(8\pi r^4)$ (48); with $\tau_0=f r_0$: $r_0\lesssim l_p/(2f^2)$ (51) | $f\approx0.01$: $r_0\lesssim10^4l_p=10^{-31}$ m |
| 4.2 $\Phi=0$, $b=r_0$ ("zero density") | boosted observer, $\rho'=-\gamma^2v^2r_0/(8\pi r^3)$ (54); optimum ($v=1/\sqrt2$) $r_0\lesssim l_p/f^2$ (60) | essentially same as 4.1 |
| 4.3 "Absurdly benign" (MT): $\Phi=0$, $b=r_0[1-(r-r_0)/a_0]^2$ for $r_0\le r\le r_0+a_0$, Minkowski outside | $\rho_0=-1/(4\pi a_0r_0)$ (68); for $a_0<r_0$, $\tau_0=fa_0$: $a_0\lesssim(r_0/(8f^4l_p))^{1/3}\,l_p$ (69) [layout garbled by pdftotext; I re-derived it: $1/(4\pi a_0r_0)\le c/(f a_0)^4$ with $c=3/(32\pi^2)$ gives $a_0^3\le\frac{3}{8\pi}r_0l_p^2/f^4\approx r_0l_p^2/(8f^4)$, and it reproduces the paper's numbers] | $r_0\approx1$ m: $a_0\lesssim10^{14}l_p\approx10^{-21}$ m $\approx10^{-6}$ fermi, "approximately a millionth of the proton radius"; $r_0\approx1$ ly: $a_0\lesssim2\times10^{19}l_p\approx0.2$ fermi; $r_0\approx10^5$ ly: $a_0\lesssim10^{21}l_p\approx10^{-14}$ m, i.e. ~10 proton radii for a galaxy-sized throat. If instead $r_0<a_0/2$, roles swap (70): e.g. $a_0\approx1$ ly forces $r_0\lesssim0.2$ fermi. They note $a_0$ is the proper thickness to within O(1) factors. |
| 4.4 "Proximal Schwarzschild" ($b=r_0$, $g_{tt}=-(1-r_0/r+\epsilon/r^2)$) | proper band thickness $\Delta l\approx2\sqrt{r_0\sqrt\epsilon}$; bound (82) $\Delta l/r_0\lesssim[(1-v^2)/(v^2f^4)]^{1/8}(l_p/r_0)^{1/4}$, can be made arbitrarily small as $v\to1$; or (84) $r_0\lesssim l_p/(2f^2)$ | "proximal Schwarzschild wormholes with any finite value of $\Delta l$ would seem to be physically excluded" (case $\sqrt{2\epsilon}<r_0/\gamma$); huge redshifts, near-horizon |
| 4.5 Morris-Thorne-Yurtsever (extreme RN + spherical Casimir plates separated by $s$) | $\rho_0=-(24\pi r_0^2)^{-1}$; with $\tau_0=fs$: $r_0\gtrsim f^2s^2$ (88) - satisfied | $f\approx0.1$, $s\approx10^{-10}$ cm $\approx10^{23}l_p$: $r_0\gtrsim10^{44}l_p\sim0.01$ AU; MTY's own $r_0\approx1$ AU satisfies it. **But:** plates at $\delta\approx10^{-10}$ cm outside $r_0\approx M\approx1$ AU give blueshift $\omega_{local}\approx10^{23}\omega_\infty$; 3 K CMB photons arrive at ~$10^{23}$ K; 0.1 MeV gamma -> ~$10^{19}$ GeV ~ $E_p$; ~1 GeV cosmic rays -> ~$10^4E_p$; traveller must pass through "trapdoors" in the plates; likely unstable. |

**General bounds (Sec. 5):**
- Case $b_0'<0$ (negative $\rho$ at throat, static geodesic observer): $r_m\lesssim(r_0r_1)^{1/4}/f$ (91),
  i.e. $r_m/r_0\lesssim f^{-1}(r_1l_p^2/r_0^3)^{1/4}$ (92). Examples: $r_1\approx1$ m, $f\approx0.01$, $r_m=r_0$ gives
  $r_0/r_1\lesssim10^{-21}$; $r_0\approx1$ m with $r_m=r_1$ gives $r_1/r_0\lesssim10^{-21}$; $r_m=r_0=r_1$ gives
  $r_0\lesssim10^4l_p\sim10^{-31}$ m.
- Case $b_0'\ge0$ (boosted radial observer, $\rho_0'=\gamma^2(b_0'-v^2)/(8\pi r_0^2)$, need $v^2>b_0'$):
  $r_m/r_0\lesssim(v^2-b_0')^{-1/4}(\sqrt\gamma/f)(l_p/r_0)^{1/2}$ (95). Even with fine tuning
  $b_0'=1-10^{-8}$, $v^2=1-10^{-9}$, $f\approx0.01$: $r_0\approx1$ m ($\approx10^{35}l_p$) gives
  $r_m\lesssim10^{-11}$ m; $r_0\approx1$ AU gives $r_m\lesssim10^{-6}$ m. For "typical" $b_0'\approx1/2$:
  $r_m/r_0\lesssim100(l_p/r_0)^{1/2}$.
- **Conclusion:** either the throat is only slightly larger than $l_p$ or there are length-scale
  discrepancies "typically of order $(l_p/r_0)^n$" with $n\lesssim1$: the exotic matter sits in an
  extremely thin band and/or there are huge redshifts and abrupt tidal forces.

**Loopholes the paper itself lists (Sec. 6):**
- State-independent curvature terms ($H^{(1)}_{\mu\nu}$, $H^{(2)}_{\mu\nu}$ counterterm ambiguities) could
  source the exotic matter, but for a ~1 m throat their dimensionless coefficients would need to be
  $\gtrsim10^{70}$ (Sec. 2).
- $N$ fields: RHS becomes $-Nc/\tau_0^4$; for the $\Phi=0$, $b=$const case $r_0\lesssim\sqrt N\,10^4l_p$, so a
  1 m throat needs ~$10^{62}$ fields.
- Breakdown of semiclassical theory (stress-tensor fluctuations).
- Thin-shell (cut-and-paste) wormholes: they interpret the bound as an upper limit on how thick
  such shells can actually be.
- Bound is derived only for the massless minimally coupled scalar (EM/massive extensions came in
  FR97; interacting fields an "open question").
- Final sentence (quote): "it seems unlikely that quantum field theory allows macroscopic static
  traversable wormholes" - conditional on not accepting "fantastically large discrepancies" in scales.

**Caveats for the report:**
- The curved-space application is an *argument* (local flatness on scales $\ll r_c$), not a theorem;
  later work (Fewster, Kontou and others) made curved-space QEIs rigorous for some cases.
- Applies to static spherically symmetric MT wormholes sourced by free fields; says nothing about
  dynamical/rotating wormholes, interacting fields, or wormholes held open by non-QFT exotic sources.
- The numbers depend on the arbitrary small factor $f$ (0.01 or 0.1); results scale as powers of $f$.

Bibliographic cross-check for Secs. 1-3 (INSPIRE-HEP API, 2026-10-19): PRD 51, 4277-4286 (1995),
DOI 10.1103/PhysRevD.51.4277; PRD 55, 2082-2089 (1997), DOI 10.1103/PhysRevD.55.2082; PRD 53, 5496-5507
(1996), DOI 10.1103/PhysRevD.53.5496. All match.

## 4. Fewster & Eveson 1998 - general sampling functions

- **Citation:** C. J. Fewster and S. P. Eveson, "Bounds on negative energy densities in flat
  spacetime," Phys. Rev. D **58**, 084010 (1998).
- **DOI:** 10.1103/PhysRevD.58.084010 ; **arXiv:** gr-qc/9805024 (v2, 8 Jul 1998); URL:
  https://arxiv.org/abs/gr-qc/9805024 (INSPIRE confirms journal data).
- **Access:** full text read (arXiv v2).
- **Conventions:** signature (+,-,...,-) (note: opposite to Ford-Roman 1997); hbar = c = 1; Fourier
  transform $\hat f(\omega)=\int dt\,f(t)e^{-i\omega t}$.

**Claims supported:**
1. QIs hold for *any* smooth, even, non-negative sampling function $f$ of rapid decay, **including
   compactly supported ones**, for the free real scalar field of mass $m\ge0$ in $n+1\ge2$
   dimensions (inertial observer). This "removes any remaining doubt" that the Ford-Roman QIs rely on
   long Lorentzian tails cancelling local negative energy (paraphrase of their Conclusion).
2. General bound (1.7)/(4.7):
   $$\rho_{f,\psi}\equiv\int dt\,\langle T^{ren}_{00}(t,0)\rangle_\psi f(t)\;\ge\;-\frac{C_n}{2\pi(n+1)}\int_m^\infty du\,|\widehat{f^{1/2}}(u)|^2\,u^{n+1}\,Q_n(u/m)$$
   with $C_n=1/(2^{n-1}\pi^{n/2}\Gamma(n/2))$ and $Q_n(x)=(n+1)x^{-(n+1)}\int_1^x dy\,y^2(y^2-1)^{n/2-1}$, $Q_n\to1$ as $x\to\infty$.
3. **4D massless** (5.5):
   $$\rho_{f,\psi}\ge-\frac{1}{16\pi^3}\int_0^\infty du\,|\widehat{f^{1/2}}(u)|^2u^4=-\frac{1}{16\pi^2}\int_{-\infty}^\infty dt\,\big[(f^{1/2})''(t)\big]^2 .$$
   For the Lorentzian this gives (5.6) $\rho_L\ge-27/(2048\pi^2\tau^4)$, i.e. **9/64 of the Ford-Roman
   bound** (a tighter bound; "a slight tightening of the constraints on traversable wormholes").
   [Check: $\frac{3}{32}\cdot\frac{9}{64}=\frac{27}{2048}$.]
4. In 4D (indeed any dimension >= 3) adding mass cannot push the averaged energy density below the
   massless bound, since $0\le Q_3\le1$.
5. **2D massless** (5.2): $\rho\ge-\frac{1}{16\pi}\int (f')^2/f\,dt$; Flanagan's optimal 2D bound is
   $-\frac{1}{24\pi}\int(f')^2/f\,dt$ (Flanagan, PRD 56, 4922 (1997)); FE98 is weaker by 3/2.
6. **Sharp sampling fails:** for a characteristic (box) function the bound diverges, consistent with
   Garfinkle's result (quoted via Yurtsever) that $T_{00}$ integrated over sharply defined spacetime
   boxes can be unboundedly negative. Footnote: spatially averaged energy densities in 4D are not
   bounded below (Helfer, CQG 13, L129 (1996)).
- **Caveat:** derivation explicitly "somewhat formal"; rigorous versions came later (Fewster 2000
  general curved-spacetime QWEI; Fewster & Smith 2008 absolute QEIs - per Fewster 2012 & K&S 2020).

## 5. Fewster 2012 - "Lectures on quantum energy inequalities"

- **Citation:** C. J. Fewster, "Lectures on quantum energy inequalities," arXiv:1208.5399 [gr-qc]
  (2012), 50 pp., lectures at the Albert Einstein Institute, Golm (March 2012). No journal reference
  listed on arXiv. URL: https://arxiv.org/abs/1208.5399
- **Access:** full text read (arXiv v1; the PDF is stamped with a 2024 compile date).
- **Conventions:** hbar = c = G = 1; signature (+,-,-,-); Einstein eq. written $G_{ab}=-8\pi T_{ab}$ in his
  curvature convention.

**Claims supported:**
1. Definitions (Sec. 1.1): WEC $T_{ab}u^au^b\ge0$ all timelike $u$; NEC same for null; DEC
   $T_{ab}u^av^b\ge0$ for future-pointing timelike $u,v$; SEC $T_{ab}u^au^b-\frac12T\ge0$ for unit timelike $u$.
   Perfect fluid: WEC iff $\mu\ge0,\ \mu+p\ge0$; SEC iff $\mu+p\ge0,\ \mu+3p\ge0$; NEC iff $\mu+p\ge0$; DEC iff
   $\mu\ge|p|$. DEC => WEC => NEC, SEC => NEC, no implication between SEC and WEC/DEC.
2. Classical minimally coupled scalar obeys WEC/DEC (sum of squares) but can violate SEC if $m>0$;
   the *non-minimally* coupled classical scalar can violate even the NEC.
3. QFT violates positivity generically: Epstein-Glaser-Jaffe argument via Reeh-Schlieder - any local
   observable with zero vacuum expectation value is either zero or has negative spectrum; the
   energy density at a point is unbounded below over Hadamard states.
4. **Casimir stress tensor from symmetry** (after Brown & Maclay 1969): for ideal plates normal to $z$
   at separation $L$, $T_{\mu\nu}=\frac{C(z)}{L^4}\,\mathrm{diag}(-1,1,1,-3)$; conservation + tracelessness +
   limiting arguments give $C=0$ outside, $C_0>0$ between plates (attractive force => negative
   energy density $-C_0/L^4$); full QFT gives $C_0=\pi^2/720$. Inward pressure on each plate $3C_0/L^4$
   (= $\pi^2/(240L^4)$, the Casimir force per area). He stresses the tracelessness assumption
   "smuggles in" the absolute normalization (footnote 5).
5. Magnitudes: "the energy conditions are in various ways 'almost satisfied'" - violations are small,
   short-lived, or need disparate scales, highly non-inertial motion, or large positive energies
   elsewhere (paraphrase; the quoted phrase is his).
6. **4D massive scalar QEI** (his Eq. 1, from Fewster-Eveson): for smooth compactly supported $g$ and
   all Hadamard states, $\int\langle T_{00}\rangle_\omega|g(t)|^2dt\ge-\frac{1}{16\pi^3}\int_m^\infty|\hat g(u)|^2u^4Q_3(u/m)du$; massless
   version (3) $\int\langle T_{00}\rangle g^2dt\ge-\frac{1}{16\pi^2}\int|g''|^2dt$, valid for all $m\ge0$. The bound is
   "known not to be optimal"; requires $g\in W^{2,2}$; with sharp switching arbitrarily large negative
   energies can be trapped.
7. **Duration bound** (Eq. 4): if $\langle T_{00}\rangle<\rho$ throughout an interval of length $\tau$, then
   $\rho\ge-C/\tau^4$ with $C\approx3.17$ (minimum eigenvalue of $d^4/dt^4$ with clamped BCs).
8. **Quantum interest**: an isolated pulse obeys $\min\{\tau_1,\tau_2\}^3\int_{t_1}^{t_2}\rho\,dt\ge-3/(2\pi^2)$; a
   compactly supported $\rho$ must have non-negative integral; Ford-Roman's "borrow/repay with
   interest" picture.
9. **A priori Casimir bound:** for an inertial observer parallel to the plates at distance $\ell$ from
   the nearest plate, locality + QEI give $T_{00}\ge-C/(2\ell)^4\approx-0.20/\ell^4$; the actual massless
   minimally coupled scalar Casimir energy density, printed as
   $T_{00}=-\frac{\pi^2}{1140L^4}-\frac{\pi^2}{48L^4}\frac{3-2\cos^2(\pi z/L)}{\cos^4(\pi z/L)}$, is only 3-7% of the bound.
   [The "1140" is as printed (checked on the rendered PDF page 13). Almost certainly a misprint for
   1440: Milton et al. (J. Phys. A 41, 164052 (2008), Eq. 3; see Sec. 13b) give $u=-\pi^2/(1440a^4)$ for the
   scalar between Dirichlet plates, half the EM value. The 3-7% statement is insensitive to this (I
   checked: ~6.6% at the midpoint, ~3.2% near a plate).]
10. **No QEI along null curves in 4D** (Fewster & Roman, PRD 67, 044003 (2003)); no bounds for
    smearing over spacelike surfaces above 2D (Ford, Helfer & Roman, PRD 66, 124012 (2002)). QEIs exist for Dirac,
    EM, Rarita-Schwinger fields; for the non-minimally coupled scalar only *state-dependent* QEIs
    exist and sustained large negative energy densities are possible but cost disproportionately
    large positive total energy (Fewster & Osterbrink 2008).
11. **Interacting fields:** "One cannot expect state-independent QEIs to hold" (quote); the Casimir
    effect modelled within a full interacting theory (Olum & Graham, "Static negative energies near a
    domain wall," PLB 554, 175 (2003)) can keep negative energy near the midpoint. ANEC is proven for general 2D QFTs (Verch). In >=3D, Bostelmann & Fewster give
    state-dependent QI-type bounds for a wide class of theories.
12. QEIs strongly constrain wormholes/exotic geometries *if* the sources obey QEIs like the free
    fields (refs. Pfenning-Ford, Ford-Roman 1996, Fewster-Roman 2005).

## 6. Kontou & Sanders 2020 - review "Energy conditions in general relativity and quantum field theory"

- **Citation:** E.-A. Kontou and K. Sanders, "Energy conditions in general relativity and quantum
  field theory," Class. Quantum Grav. **37**, 193001 (2020) (issue 19; topical review).
- **DOI:** 10.1088/1361-6382/ab8fcf ; **arXiv:** 2003.01815 (v2, 5 Jun 2020); URL:
  https://arxiv.org/abs/2003.01815 (INSPIRE confirms CQG 37 (2020) 193001).
- **Access:** full text read (arXiv v2, 61 pp.).
- **Conventions:** Planck units $c=G=\hbar=1$; (-,+,+,+) "+++" convention of MTW; Einstein eq. $G_{ab}=8\pi T_{ab}$.

**Definitions (their Table 1 and Table 4; $t^a,\xi^b$ co-oriented timelike, $k^a$ null):**

| Condition | Physical form | Geometric form | Perfect fluid |
|---|---|---|---|
| WEC | $T_{ab}t^at^b\ge0$ | $G_{ab}t^at^b\ge0$ | $\rho\ge0$, $\rho+P\ge0$ |
| SEC | $(T_{ab}-\frac{T}{n-2}g_{ab})t^at^b\ge0$ | $R_{ab}t^at^b\ge0$ | $\rho+P\ge0$, $(n-3)\rho+(n-1)P\ge0$ |
| DEC | $T_{ab}t^a\xi^b\ge0$ | $G_{ab}t^a\xi^b\ge0$ | $\rho\ge\lvert P\rvert$ |
| NEC | $T_{ab}k^ak^b\ge0$ | $R_{ab}k^ak^b\ge0$ | $\rho+P\ge0$ |
| AWEC | $\int d\tau\,T_{ab}\dot\gamma^a\dot\gamma^b\ge0$ | complete timelike geodesics | |
| ASEC | $\int d\tau\,(T_{ab}-\frac{T}{n-2}g_{ab})\dot\gamma^a\dot\gamma^b\ge0$ | complete timelike geodesics | |
| ANEC | $\int d\lambda\,T_{ab}\dot\gamma^a\dot\gamma^b\ge0$ | complete (inextendible) null geodesics | |
| AANEC | same | complete **achronal** null geodesics (no two points timelike related) | |

(Integrals required to be absolutely convergent; alternative limiting definitions by Verch, Borde,
Wald-Yurtsever are discussed.) NEC is the weakest pointwise condition; Tipler-type argument shows a
negative lower bound is impossible for scale-invariant classes, which is why classical conditions
have bound zero.

**Claims supported:**
1. "all pointwise energy conditions are necessarily violated by essentially any quantum field
   theory" (EGJ theorem); classical non-minimally coupled scalars violate all four main conditions.
2. QEIs are lower bounds on smeared $\langle T\rangle$; they are theory-dependent; state-independent
   QEIs exist for free massless/massive minimally coupled scalars (QWEI, QNEI along timelike curves),
   Maxwell/Proca, Dirac, 2D CFTs, the 2D Ising model; for non-minimal coupling only state-dependent
   ones (their Table 3). QEIs neither assume nor prove a time-energy uncertainty relation.
3. Canonical 4D inertial QWEI (their Eq. 61): $\langle{:}\rho{:}\circ\gamma\rangle_\omega(f^2)\ge-\frac{1}{16\pi^2}\int|f''|^2dt$, all Hadamard
   states; scaled form $\frac1{t_0}\int\langle{:}\rho{:}\rangle|f(t/t_0)|^2dt\ge-C/t_0^4$, with $C=3/(32\pi^2)$ for the
   Lorentzian (Eq. 63). Uniformly accelerated observers: extra $2\alpha_0^2|f'|^2+\frac{11\alpha_0^4}{30}|f|^2$ terms (Eq. 64).
4. **No null-geodesic QEI in 4D** for the massless minimally coupled scalar (Fewster & Roman 2003,
   explicit counterexample with high-momentum vacuum+two-particle superpositions). Freivogel &
   Krommydas proposed a cutoff-dependent "smeared null energy condition"
   $\int d\lambda f\langle T_{kk}\rangle\ge-\frac{B}{G_N}\int d\lambda\,f'^2/f$ (their Eq. 75; conjecture).
5. **Casimir (their Eq. 101):** $T^{\mu\nu}=\frac{C(z)}{L^4}(\eta^{\mu\nu}-4\hat k^\mu\hat k^\nu)$ with $\hat k=(0,0,0,1)$ normal to the
   plates and $C=\pi^2/720$ between the plates. In (-,+,+,+) this is exactly
   $\frac{\pi^2}{720L^4}\mathrm{diag}(-1,1,1,-3)$ (hbar=c=1). It "violates all the pointwise energy conditions"
   and AWEC (static negative energy) but "has be[en] shown to obey the ANEC" [refs: Graham & Olum,
   PRD 72, 025013 (2005) "Plate with a hole obeys the averaged null energy condition"; Fewster, Olum &
   Pfenning, PRD 75, 025007 (2007)].
6. ANEC can be derived from a QNEI along timelike curves (Fewster-Olum-Pfenning 2007 for flat
   spacetime with boundaries, for geodesics staying a finite distance from the boundary; Kontou &
   Olum for small curvature). 
7. **AANEC** "has the best chance of being valid under all physically reasonable circumstances";
   known violations involve Planck-scale transverse sizes (Flanagan-Wald 1996 second-order
   perturbation analysis: ANEC averaged over a few Planck areas transversally is non-negative) or
   conformal tricks on test fields (Visser 1995 scale anomaly; Urban & Olum). Graham-Olum
   conjecture: AANEC holds for self-consistent semiclassical solutions.
8. Proofs of ANEC in Minkowski: 2D massive QFTs (Verch 1999), 2D CFTs (Fewster-Hollands); higher-D via
   holography (Kelly & Wall), causality (Hartman et al.), modular Hamiltonians (Faulkner et al.),
   generalized second law (Wall). The QNEC $\langle T_{kk}\rangle\ge S''$ is related.
9. **Topological censorship (their Thm 5.6, Friedman-Schleich-Witt 1993):** in a globally hyperbolic,
   asymptotically flat spacetime satisfying ANEC, every causal curve from past to future null
   infinity can be deformed to one in a simply connected neighbourhood of scri - i.e. observers
   cannot actively probe non-trivial topology.
10. **Graham-Olum theorem (their Thm 5.9):** asymptotically flat, globally hyperbolic spacetime with
    on-shell AANEC + generic condition cannot have a compactly generated Cauchy horizon (no time
    machine); by Olum (1998) it also excludes superluminal "warp drive"-type shortcuts.
11. Restrictions from QEIs: Krasnikov tube (Everett & Roman) - negative energy band no thicker than a
    few thousand Planck lengths and ~$10^{16}$ galactic masses of negative energy for a 1 m long, 1 m
    wide tube; Alcubierre bubble (Pfenning & Ford) - wall a few hundred Planck lengths thick,
    negative energy exceeding the mass of the visible universe for a macroscopic bubble.
12. **"Long" wormholes** - "it takes longer to go through the wormhole than through the ambient
    space" (quote) - lie outside the Graham-Olum theorem; Maldacena-Milekhin-Popov's 4D construction
    (charged massless fermions in Einstein-Maxwell) is the example: null geodesics through it are
    chronal, so AANEC need not be violated.
13. Bekenstein (their ref. [50]: "If vacuum energy can be negative, why is mass always positive? ...",
    PRD 88, 125005 (2013); bibliographic only) argued total Casimir energy including the plates is non-negative.

## 7. Graham & Olum 2007 - "Achronal averaged null energy condition"

- **Citation:** N. Graham and K. D. Olum, "Achronal averaged null energy condition," Phys. Rev. D
  **76**, 064001 (2007).
- **DOI:** 10.1103/PhysRevD.76.064001 ; **arXiv:** 0705.3193 (v2, 27 Aug 2007); URL:
  https://arxiv.org/abs/0705.3193 (INSPIRE confirms).
- **Access:** full text read (arXiv v2, 8 pp.).

**Claims supported:**
1. Proposes **"self-consistent achronal ANEC"** (Condition 1): "There is no self-consistent solution in
   semiclassical gravity in which ANEC is violated on a complete, achronal null geodesic" (quote, 19
   words) - conjectured to hold for all semiclassical systems, with curvature well below Planck scale.
2. Why "achronal": the two explicit ANEC violations known to them are (i) Minkowski space
   compactified in one spatial direction (Casimir-like; violated on any geodesic not at constant $z$,
   but such geodesics return infinitely often to the same spatial point, hence are chronal) and (ii)
   Schwarzschild in the Boulware vacuum (Visser 1996), where every complete null geodesic is
   chronal. Flanagan-Wald perturbative violations: at first order the relevant geodesics are almost all
   chronal; for mixed states undetermined.
3. Why "self-consistent": Visser's scale-anomaly ANEC violation requires a conformal rescaling of
   order $\Omega\sim\exp(2880\pi^2)$ (scalar anomaly coefficient $a=1/(2880\pi^2)$) - either sub-Planckian
   curvature radii or a quantum $T$ utterly negligible against $G_{ab}$; classical non-minimal-scalar
   violations require Planck-scale field values where effective $G$ diverges.
4. Flat-space positive results they cite: ANEC holds for a domain-wall background and **"a Casimir
   plate with a hole"** (Graham & Olum, PRD 72, 025013 (2005)), generalized to arbitrary Casimir
   systems "as long as the geodesic does not intersect or asymptotically approach the plates"
   (Fewster, Olum & Pfenning, PRD 75, 025007 (2007)).
5. **Lemma 1:** in a generic spacetime obeying Condition 1 there are no complete achronal null
   geodesics (null lines).
6. **Theorem 1 (topological censorship with Condition 1):** simply connected, asymptotically flat,
   globally hyperbolic + Condition 1 + generic condition => every causal curve from scri- to scri+
   deforms to one near infinity; rules out traversable wormholes **connecting different asymptotically
   flat regions**. Proof idea (Friedman-Higuchi): a "fastest" causal curve through the wormhole would be
   a complete achronal null geodesic.
7. **Explicit loophole (attributed to L. Ford):** a static spacetime with *one* asymptotic region and
   a wormhole connecting it to itself whose throat is **longer than the external distance between the
   mouths** - every causal path through the wormhole emerges in the future of where it entered, so
   fastest paths through it are chronal and the theorem does not apply. (This is exactly the
   "long wormhole" exploited by Maldacena-Milekhin-Popov 2018 and Maldacena-Milekhin 2020.)
8. **Theorems 2-3:** no time-machine construction (Tipler version; Hawking version: no compactly
   generated Cauchy horizon) under Condition 1 + generic condition; positive-mass theorem (Penrose-
   Sorkin-Woolgar) also goes through.
9. Half-geodesic ANEC fails even in flat space: minimally coupled scalar with Dirichlet plane $z=0$,
   null ray along $+z$ from $z_0$ has $T_{ab}k^ak^b=-1/(16\pi^2z^4)$, so the half-ANEC integral is
   arbitrarily negative as $z_0\to0$. Likewise "achronal partial-geodesic ANEC" fails (Casimir example in
   Olum 1998), so ruling out *superluminal travel* (Olum, PRL 81, 3567 (1998)) needs extra
   assumptions beyond self-consistent achronal ANEC.

## 8. Kontou & Olum 2015 - ANEC in curved background via null-projected QI

- **Citation:** E.-A. Kontou and K. D. Olum, "Proof of the averaged null energy condition in a
  classical curved spacetime using a null-projected quantum inequality," Phys. Rev. D **92**, 124009 (2015).
- **DOI:** 10.1103/PhysRevD.92.124009 ; **arXiv:** 1507.00297 (v2, 27 Oct 2015); URL:
  https://arxiv.org/abs/1507.00297 (INSPIRE confirms).
- **Access:** full text read for abstract, assumptions, theorem and conclusions (arXiv v2); the long
  technical middle sections skimmed, not checked line by line.
- **Conventions:** MTW (-,-,-) sign classification.

**Claims supported:**
1. Derives a null-projected QI (their Eq. 155) for a free, massless, minimally coupled scalar in curved
   spacetime **to first order in the Riemann tensor and its derivatives**, from the Fewster-Smith absolute
   QEI; it equals the flat-space Fewster-Roman null-projected QI plus corrections that vanish in the
   boosted-limit construction.
2. **Theorem 1:** for an achronal null geodesic $\gamma$ with a tubular neighbourhood $M'$ in which
   curvature (sourced by classical matter obeying NEC => null convergence condition
   $R_{ab}V^aV^b\ge0$) and its first three derivatives are bounded, and whose causal structure is
   unaffected by the exterior, the ANEC integral $A=\int d\lambda\,T_{ab}\ell^a\ell^b$ in any Hadamard state
   "cannot converge uniformly to negative values on all geodesics" in $M'$. Outside $M'$ the field may
   be interacting/non-minimal.
3. Interpretation (Conclusions): no NEC-obeying spacetime can be *perturbed* by a minimally coupled
   quantum scalar into one violating achronal ANEC, "Thus no such perturbation of a classical
   spacetime would allow wormholes, superluminal travel, or construction of time machines" (quote,
   18 words).
- **Caveats stated by the authors:** back-reaction ignored (valid for small perturbations); remaining
  routes: a quantum field that itself generates the NEC violation; a two-field "three-step" process;
  higher-spin fields not studied; **non-minimally coupled scalars** (classical ANEC violations need
  Planck-scale field values with negative effective $G$; whether self-consistent achronal ANEC holds
  for them "remains an open question"). Ori-type non-compactly-generated causality violation is
  outside ANEC theorems (footnote).

## 9. Faulkner, Leigh, Parrikar & Wang 2016 - ANEC from relative entropy

- **Citation:** T. Faulkner, R. G. Leigh, O. Parrikar and H. Wang, "Modular Hamiltonians for deformed
  half-spaces and the averaged null energy condition," JHEP **09** (2016) 038.
- **DOI:** 10.1007/JHEP09(2016)038 ; **arXiv:** 1605.08072 (v1, 25 May 2016); URL:
  https://arxiv.org/abs/1605.08072 (INSPIRE confirms).
- **Access:** full text read for abstract, introduction and summary of results (Secs. 1-1.1); the
  technical derivation not checked.

**Claims supported:**
1. For relativistic QFTs on Minkowski $\mathbb R^{1,d-1}$, the vacuum modular Hamiltonian of a deformed
   half-space acquires, at first order in the shape deformation, a term proportional to the null
   stress tensor integrated along the Rindler horizon (their Eq. 14).
2. Combined with monotonicity of relative entropy (positivity of $\hat K_{A_0}-\hat K_A$), this **proves
   ANEC in Minkowski spacetime**: $\int_{-\infty}^\infty dx^+\langle T_{++}(x^+,x^-=0,\vec x)\rangle_\psi\ge0$ (Eq. 3/16) for
   states created by (Euclidean-time-evolved) local operator insertions and combinations - in
   interacting theories, assuming continuum quantities are well defined.
3. Consequently proves the Hofman-Maldacena conformal collider bounds (e.g. $1/3\le a/c\le31/18$ in 4D CFTs).
4. ANEC is "known to be violated in general curved space-times"; result extends to static bifurcate
   Killing horizons but not to general curved spacetimes (they point to self-consistent achronal ANEC).
- **Caveat:** flat spacetime only (no gravity); not a statement about curved-space wormhole throats.

## 10. Hartman, Kundu & Tajdini 2017 - ANEC from causality

- **Citation:** T. Hartman, S. Kundu and A. Tajdini, "Averaged null energy condition from causality,"
  JHEP **07** (2017) 066.
- **DOI:** 10.1007/JHEP07(2017)066 ; **arXiv:** 1610.05308 (v1, 17 Oct 2016); URL:
  https://arxiv.org/abs/1610.05308 (INSPIRE confirms).
- **Access:** abstract and introduction read in full text (arXiv v1); sum-rule derivation not checked.

**Claims supported:**
1. Microcausality (commutators vanish at spacelike separation) in unitary, Lorentz-invariant QFTs
   implies $\int du\,T_{uu}\ge0$ for **interacting theories in d > 2**; more precisely "any unitary,
   Lorentz-invariant QFT with an interacting conformal fixed point in the UV must obey the ANEC"
   (paraphrase close to their wording).
2. Assumes no higher-spin symmetry at the UV fixed point, so it does not directly cover free or
   asymptotically free theories (free scalars checked separately by mode sum in an appendix).
3. Generalizes to an infinite family $\int du\,X_{uu\cdots u}\ge0$ for leading-Regge-trajectory operators.
4. ANEC "has no known counterexamples in consistent quantum field theories (assuming also that the
   null geodesic is achronal)" (paraphrase of Intro, citing Graham-Olum).
- **Caveat:** Minkowski space without gravity.

## 11. Friedman, Schleich & Witt 1993 - "Topological censorship" (brief)

- **Citation:** J. L. Friedman, K. Schleich and D. M. Witt, "Topological censorship," Phys. Rev. Lett.
  **71**, 1486-1489 (1993); **Erratum** Phys. Rev. Lett. **75**, 1872 (1995) (erratum listed by INSPIRE).
- **DOI:** 10.1103/PhysRevLett.71.1486 (erratum 10.1103/PhysRevLett.75.1872); **arXiv:** gr-qc/9305017
  (v2, 9 Jun 1995); URL: https://arxiv.org/abs/gr-qc/9305017
- **Access:** full text read (arXiv v2, which post-dates the erratum; I did not see the printed PRL).

**Claims supported:**
- **Theorem 1:** "If an asymptotically flat, globally hyperbolic spacetime satisfies the averaged
  null energy condition, then every causal curve from scri- to scri+ is deformable to $\gamma_0$" (a
  timelike curve in a simply connected neighbourhood of scri) - i.e. no observer can actively probe
  non-trivial topology: "any topological structure collapses too quickly to allow light to traverse it"
  (abstract quote, 13 words).
- ANEC there means $\int d\lambda\,T_{ab}k^ak^b\ge0$ along every inextendible null geodesic (not only achronal).
- **Note:** the arXiv v2 abstract says "satisfying the null energy condition", whereas Theorem 1 in the
  body assumes the (weaker) ANEC. Caveat on the Poincare conjecture (fake 3-spheres) - now moot.
- Relation to traversability: traversable wormholes connecting asymptotic regions therefore require
  ANEC violation (cf. Morris-Thorne-Yurtsever; Graham-Olum strengthen to achronal ANEC).

## 12. Gao & Wald 2000 - "Theorems on gravitational time delay and related issues"

- **Citation:** S. Gao and R. M. Wald, "Theorems on gravitational time delay and related issues,"
  Class. Quantum Grav. **17**, 4999-5008 (2000).
- **DOI:** 10.1088/0264-9381/17/24/305 ; **arXiv:** gr-qc/0007021 (v2, 28 Jul 2000); URL:
  https://arxiv.org/abs/gr-qc/0007021 (INSPIRE confirms).
- **Access:** full text read (arXiv v2).

**Claims supported (note: hypotheses are the *pointwise* NEC + null generic condition):**
1. **Theorem 1:** null geodesically complete spacetime + NEC ($R_{ab}k^ak^b\ge0$) + null generic condition
   $k_{[a}R_{b]cd[e}k_{f]}k^ck^d\ne0$: for any compact $K$ there is a compact $K'\supset K$ such that for $p,q\notin K'$
   with $q\in J^+(p)-I^+(p)$ ("fastest" null connection), every causal curve from $p$ to $q$ avoids $K$. I.e.
   the fastest null geodesics between far-apart points stay away from any given compact region -
   suggesting no "time advance"/shortcut through localized curved regions, though the authors caution
   it is "difficult to make a strong argument" since $K'$ may be much larger than $K$.
2. Footnote 1 (Galloway): Theorem 1's conclusion holds under the weaker hypothesis that spacetime has
   **no null line** (inextendible achronal null geodesic) - which is what achronal ANEC + generic
   condition delivers (Graham-Olum Lemma 1). [Connection to AANEC is my synthesis.]
3. Corollary 1: compact-Cauchy-surface, globally hyperbolic case - no particle horizons at late times.
4. **Theorem 2 (asymptotically AdS / timelike conformal boundary):** with NEC (footnote 3: or Borde's
   weaker averaged condition) + null generic condition + strong causality + compactness, any fastest
   causal curve between two boundary points lies entirely **in the boundary**: generic perturbations
   of AdS always produce a *time delay* relative to pure AdS - signals cannot go faster through the
   bulk than along the boundary. (Pure AdS is the marginal "tie".)
- Relevance: Maldacena-Milekhin-Popov cite it (with Galloway-Schleich-Witt-Woolgar and Graham-Olum)
  for the statement that short traversable wormholes are excluded by Einstein's equations + achronal
  ANEC; Fu-Grado-White-Marolf also cite it. GJW do not cite Gao-Wald but reach the same "no shortcut"
  conclusion via achronal ANEC / GSL (Wall 2013). In AdS/CFT, Theorem 2 is the statement that the bulk
  cannot provide a causal shortcut relative to the boundary.

## 13. The Casimir effect: Casimir 1948, Brown & Maclay 1969, and the energy-condition question

### 13a. Casimir 1948

- **Citation:** H. B. G. Casimir, "On the attraction between two perfectly conducting plates," Proc.
  K. Ned. Akad. Wet. **51**, 793-795 (1948) (communicated at the meeting of 29 May 1948; Natuurkundig
  Laboratorium der N.V. Philips' Gloeilampenfabrieken, Eindhoven). No DOI.
- **Access:** full text read - KNAW reprint in *Gems from a century of science 1898-1997* (1997),
  pp. 61-63, PDF at https://www.ph.nat.tum.de/fileadmin/w00bya/t75/pdf/Casimir1948.pdf (scanned page
  images read directly).
- **Method:** compares $\frac12\sum\hbar\omega$ for a conducting plate at distance $a$ vs. $L/2$ from a cavity wall,
  with a smooth cutoff $f(k/k_m)$ (physical justification: plates are transparent to very short waves,
  e.g. X-rays) and the Euler-Maclaurin formula.
- **Results (his displayed equations):**
  $$\frac{\delta E}{L^2}=-\hbar c\,\frac{\pi^2}{24\times30}\,\frac1{a^3}=-\frac{\pi^2\hbar c}{720\,a^3}\quad(\text{energy per unit area}),$$
  $$F=\hbar c\,\frac{\pi^2}{240}\frac1{a^4}=0.013\,\frac{1}{a_\mu^4}\ \text{dyne/cm}^2\quad(a_\mu\text{ in microns}),$$
  valid "as long as $ak_m\gg1$". [Check: $\pi^2\hbar c/240$ at $a=1\,\mu$m is $1.30\times10^{-3}$ Pa = 0.013 dyn/cm$^2$.]
  Dividing the energy per area by $a$ gives the (uniform) energy density $-\pi^2\hbar c/(720a^4)$; Casimir himself
  gives only the energy per area and the force.
- Conclusions (paraphrase): an attractive, material-independent force exists while the separation
  greatly exceeds the penetration depth; it "may be interpreted as a zero point pressure of
  electromagnetic waves" (quote); experimental confirmation "seems not unfeasable" (sic).

### 13b. Brown & Maclay 1969 - the full stress tensor

- **Citation:** L. S. Brown and G. J. Maclay, "Vacuum stress between conducting plates: an image
  solution," Phys. Rev. **184**, 1272-1279 (1969) (published 25 Aug 1969 per Crossref).
- **DOI:** 10.1103/PhysRev.184.1272. No arXiv.
- **Access:** **bibliographic only** (APS page returned HTTP 403; no abstract in Crossref). Content below
  is from three secondary sources that cite it and that I read in full: Fewster 2012 (Sec. 1.2),
  Kontou & Sanders 2020 (Eq. 101), Milton, Fulling, Parashar, Romeo, Shajesh & Wagner,
  "Gravitational and inertial mass of Casimir energy," J. Phys. A **41**, 164052 (2008),
  DOI 10.1088/1751-8113/41/16/164052, arXiv:0710.3841 (Eq. 1) - which also argues Casimir energy
  gravitates according to the equivalence principle (abstract).
- **Stress tensor between ideal plates** (z normal to the plates, separation $a$, EM field):
  $$\langle T^{\mu\nu}\rangle=\frac{\pi^2\hbar c}{720\,a^4}\,\mathrm{diag}(-1,\;1,\;1,\;-3),\qquad \langle T^{\mu\nu}\rangle=0\ \text{outside}.$$
  - Kontou-Sanders write it as $\frac{C}{L^4}(\eta^{\mu\nu}-4\hat k^\mu\hat k^\nu)$, $C=\pi^2/720$, signature (-,+,+,+) - identical.
  - Milton et al. write $\frac{E_c}{a}\mathrm{diag}(1,-1,-1,3)$ with $E_c=-\frac{\pi^2}{720a^3}\hbar c$ - identical.
  - Fewster writes $T_{\mu\nu}=\frac{C(z)}{L^4}\mathrm{diag}(-1,1,1,-3)$ in signature (+,-,-,-); the Cartesian
    components $T_{00},T_{ii}$ are signature-independent, so again identical.
  - **So the user's expectation is CONFIRMED**: $\rho=-\pi^2\hbar c/(720a^4)$; transverse pressures
    $p_x=p_y=+\pi^2\hbar c/(720a^4)=-\rho$; normal pressure $p_z=-3\pi^2\hbar c/(720a^4)=3\rho$ (a tension); traceless.
    The normal stress jump gives the attractive force per area $\pi^2\hbar c/(240a^4)$.
  - Scalar analogue (Milton et al. Eq. 3): conformally coupled scalar between Dirichlet plates has
    $u=-\pi^2/(1440a^4)$, "the electromagnetic case differs by a factor of two"; non-conformal coupling
    adds a position-dependent term $\propto(1-6\xi)g(z)$ diverging like $-1/(16\pi^2z^4)$ at a plate.
  - Lamoreaux 1997 also uses "Eq. (20a) of [Brown & Maclay]" for the finite-temperature correction.

### 13c. Which energy conditions the Casimir configuration violates (my algebra, checked against FOP 2007)

With $\rho_C\equiv\pi^2\hbar c/(720a^4)$ and null vector $k=(1,\hat n)$:
$T_{\mu\nu}k^\mu k^\nu=\rho+p_xn_x^2+p_yn_y^2+p_zn_z^2=-\rho_C(1-n_x^2-n_y^2+3n_z^2)=-4\rho_C\,n_z^2$.
- **NEC violated for every null direction with a component normal to the plates** ($n_z\ne0$), maximally
  for $k$ normal to the plates ($-4\rho_C$); **exactly zero (marginal) for null directions parallel to the
  plates**. Confirmed in words by Fewster-Olum-Pfenning 2007: for any point between the plates "and
  any vector V which is not parallel to the plates, $\langle T_{ab}V^aV^b\rangle$ will be negative in the
  ground state" (quote). WEC, SEC, DEC also violated (negative $\rho$); AWEC violated for static
  observers (constant negative $\rho$ forever) - Kontou-Sanders.
- **ANEC along complete geodesics:** NOT violated once the plates are included. Parallel geodesics
  give zero; any non-parallel complete null geodesic must cross plate material, which contributes a
  large positive amount (FOP 2007 Intro; Graham & Olum 2005). Idealized "perfect mirror" calculations
  cannot evaluate the integral inside the plates, so this was tested with holes (13d) and proved for
  geodesics a finite distance from the boundaries (FOP 2007, 13e). Kontou-Sanders: the Casimir effect
  "has be[en] shown to obey the ANEC" and "is not violated by the Casimir effect, unlike the AWEC".
- **Contrast:** the plate-less analogue (Minkowski with one compact dimension, period $L$) does violate
  ANEC along winding null geodesics, but those are chronal (not achronal), so AANEC is respected
  (FOP 2007 Sec. IV; Graham & Olum 2007). FOP Eq. (24): massless minimally coupled scalar ground state
  $\langle T_{ab}\rangle=\frac{\pi^2}{90L^4}\mathrm{diag}(-1,1,1,-3)$.
- Realistic (dispersive dielectric) plates: Sopova & Ford, PRD 66, 045026 (2002) (quant-ph/0204125;
  abstract only): between two dielectric half-spaces the energy density = a negative constant Casimir
  term + a positive position-dependent term (diverging at the interfaces, minimum at the centre);
  the negative term can still dominate in some physically realizable regions.
- Bekenstein (cited by Kontou-Sanders) argued the total energy including the plates is non-negative.

### 13d. Graham & Olum 2005 - "Plate with a hole obeys the averaged null energy condition"

- **Citation:** N. Graham and K. D. Olum, Phys. Rev. D **72**, 025013 (2005); arXiv:hep-th/0506136 (v2,
  7 Nov 2005); DOI 10.1103/PhysRevD.72.025013 (confirmed via INSPIRE).
- **Access:** full text read (arXiv v2).
- Claims: a null geodesic through a hole in a single plate (Dirichlet and Neumann, 2 and 3 space
  dimensions) obeys ANEC - for Dirichlet the positive hole correction "overwhelms" the negative
  infinite-plate contribution. Two plates with holes (estimated in limits, Eq. 54):
  $\int dx\,V^\lambda V^\nu T_{\lambda\nu}\approx2\Delta-\frac{\pi^2}{720\ell^3}$ with $\Delta=1.63\times10^{-3}/d^3$ (Dirichlet, hole radius $d$,
  separation $\ell$): positive whenever $\ell>1.6d$, "which surely includes its entire range of
  applicability"; for $\ell\ll d$ the pair acts like one plate and ANEC holds.

### 13e. Fewster, Olum & Pfenning 2007 - "Averaged null energy condition in spacetimes with boundaries"

- **Citation:** C. J. Fewster, K. D. Olum and M. J. Pfenning, Phys. Rev. D **75**, 025007 (2007);
  DOI 10.1103/PhysRevD.75.025007 (INSPIRE); arXiv:gr-qc/0609007 (v3, 10 Sep 2007).
- **Access:** full text read (arXiv v3) for abstract, introduction, Sec. IV example, discussion.
- Claim: ANEC cannot be violated by a quantized minimally coupled free scalar along a complete null
  geodesic surrounded by a flat tubular neighbourhood whose intrinsic causal structure coincides with
  that induced from the full spacetime; in particular "the ANEC holds in flat space with boundaries,
  as in the Casimir effect, for geodesics which stay a finite distance away from the boundary" (quote,
  abstract, 24 words). "Casimir plates would not seem to be useful to support a wormhole, as in
  [Morris-Thorne-Yurtsever], because of the need to get through the plate" (quote).
- Self-supporting semiclassical wormholes (Hochberg-Popov-Sushkov 1997; Khusnutdinov-Sushkov 2002;
  Garattini 2005) "have consistently been shown to occur only on the order of the Planck scale"
  (paraphrase of their Discussion).

## 14. Casimir-force experiments

| Experiment | Geometry & method | Separations | Precision claimed | Notes |
|---|---|---|---|---|
| **Lamoreaux 1997**, PRL **78**, 5-8; DOI 10.1103/PhysRevLett.78.5; **Erratum** PRL **81**, 5475-5476 (1998), DOI 10.1103/PhysRevLett.81.5475 | Torsion pendulum; Au-on-Cu coated 2.54 cm quartz optical flat vs spherical lens (radius of curvature reported 11.3 +/- 0.1 cm, 4 cm diameter); proximity-force theorem $F=2\pi RE$; vacuum ~1e-4 torr | 0.6 to 6 micrometres (closest approach about 0.6 um) | Abstract: "Agreement with theory at the level of 5% is obtained"; fit parameter $\delta=0.01\pm0.05$ over 216 sweeps | Parallel plates abandoned: parallelism needed ~1e-5 rad for 1 cm plates. Contact potential 430 mV ("shockingly large"). **Access: full text read** of the PRL scan (https://www.mit.edu/~kardar/research/seminars/Casimir/PRL-Lamoreaux.pdf). **Erratum NOT read**; per the Bordag-Mohideen-Mostepanenko review (Phys. Rep. 353, 1 (2001), arXiv:quant-ph/0106045, read): Lamoreaux later reported (a) finite-conductivity corrections of 22% (Au) and 11% (Cu) at 0.6 um, and (b) the lens is aspheric with local radius 12.5 +/- 0.3 cm, raising the theoretical force by 10.6%; agreement then requires assuming Cu diffused through the Au. BMM also estimate an absolute error ~1e-11 N, i.e. ~700% relative error at 6 um. (BMM print the erratum's page as "4549(E)", which collides with Mohideen-Roy; INSPIRE gives 5475.) |
| **Mohideen & Roy 1998**, PRL **81**, 4549-4552; DOI 10.1103/PhysRevLett.81.4549; arXiv:physics/9805038 | Atomic force microscope; Al (+ <20 nm Au/Pd) coated polystyrene sphere, diameter 196 um, vs sapphire flat; $F=-\pi^3\hbar cR/(360d^3)$ plus conductivity, roughness, temperature corrections | 0.1 to 0.9 um | rms deviation 1.6 pN between theory and experiment = **1% at the smallest separation** (26 scans, 256 points) | Without corrections rms 6.3 pN (5%); conductivity and roughness corrections observed. **Access: full text read** (arXiv preprint). |
| **Bressi, Carugno, Onofrio & Ruoso 2002**, PRL **88**, 041804; DOI 10.1103/PhysRevLett.88.041804; arXiv:quant-ph/0203002 | **Parallel plates**: Cr-coated Si cantilever (1.9 cm x 1.2 mm x 47 um) facing a Cr-coated Si "source" beam; effective area 1.2 x 1.2 mm^2; frequency-shift detection; parallelism better than 30 nm over 1.2 mm (~3e-5 rad) | 0.5 to 3.0 um | Force coefficient measured $K_C=(1.22\pm0.18)\times10^{-27}$ N m$^2$ vs. predicted $\pi hc/480=1.3\times10^{-27}$ N m$^2$ - **15% precision** | First clear parallel-plate measurement (Sparnaay 1958 "do not contradict", with ~100% uncertainty). **Access: full text read** (arXiv v1). |

Takeaway for the report: the Casimir *force* (pressure) is measured to ~1% (sphere-plate) and ~15%
(parallel plates); the negative *energy density* itself has not been measured directly (Ford & Roman
1995 make this point), and the measured quantity is a force consistent with $-\pi^2\hbar c/(720a^4)$.
Scale: at $a=1\,\mu$m, $|\rho|=\pi^2\hbar c/(720a^4)\approx4.3\times10^{-4}$ J/m$^3$ (my arithmetic: $0.013708\times3.16\times10^{-26}$ J m $/10^{-24}$ m$^4$),
equivalent mass density ~$5\times10^{-21}$ kg/m$^3$.

## 15. Visser, Kar & Dadhich 2003 - "arbitrarily small" exotic matter

- **Citation:** M. Visser, S. Kar and N. Dadhich, "Traversable wormholes with arbitrarily small energy
  condition violations," Phys. Rev. Lett. **90**, 201102 (2003).
- **DOI:** 10.1103/PhysRevLett.90.201102 ; **arXiv:** gr-qc/0301003 (v2, 23 Apr 2003); URL:
  https://arxiv.org/abs/gr-qc/0301003 (INSPIRE confirms).
- **Access:** full text read (arXiv v2).
- **Units:** G = c = 1; Morris-Thorne metric $ds^2=-e^{2\phi}dt^2+dr^2/(1-b/r)+r^2d\Omega^2$.

**Claims supported:**
1. Traversable wormholes "necessarily require violations of the averaged null energy condition"
   (definition of exotic matter), but the theorems say nothing quantitative about the *total amount*.
2. ANEC line integral along a radial null geodesic is necessarily negative (Eq. 7):
   $I=-\frac1{4\pi}\oint\frac1{r^2}e^{-\phi}\sqrt{1-b/r}\,dr<0$ - but a line integral (mass/area) says nothing
   about the "amount".
3. Proposed **volume-integral quantifier** (Eq. 13, with $\oint dV=2\int_{r_0}^\infty4\pi r^2dr$ over both sides):
   $$\oint[\rho+p_r]\,dV=-\int_{r_0}^\infty(1-b')\ln\!\left[\frac{e^{2\phi}}{1-b/r}\right]dr .$$
4. Examples: "spatially Schwarzschild" ($b=2m=r_0$, $\rho\equiv0$) deviating from Schwarzschild only for
   $r<a$: $\oint p_r\,dV\to0$ as $a\to2m$, while the ANEC line integral stays $I<-1/(2\pi a)$ (Eq. 17) - finite and
   negative. Explicit "piecewise $R=0$" model: $e^{\phi}=\epsilon+\lambda\sqrt{1-2m/r}$ for $2m<r<a$, Schwarzschild outside,
   thin shell of "quasi-normal" matter at $r=a$ (violates DEC only); volume integrals of $p_r$ and $p_t$ can
   both $\to0$ ($\epsilon\to0$).
5. Conclusion: topological censorship is "more akin to the area increase theorem" - small (quantum)
   ANEC violations suffice in principle to evade it.
- **Caveats (stated or evident):** spherical symmetry; purely classical geometry - no check against
  quantum inequalities; the limit $\epsilon\to0$ makes $e^{\phi(r_0)}=\epsilon\to0$, i.e. a nearly horizon-like throat with
  enormous redshift (my observation; Fewster-Roman make the corresponding points below).

## 16. Fewster & Roman 2005 - "On wormholes with arbitrarily small quantities of exotic matter"

- **Citation:** C. J. Fewster and T. A. Roman, "On wormholes with arbitrarily small quantities of
  exotic matter," Phys. Rev. D **72**, 044023 (2005).
- **DOI:** 10.1103/PhysRevD.72.044023 ; **arXiv:** gr-qc/0507013 (v1, 4 Jul 2005); URL:
  https://arxiv.org/abs/gr-qc/0507013 (INSPIRE confirms).
- **Access:** full text read (arXiv v1) for Secs. 1-2, 4-6 and 9; Kuhfittig section skimmed.
- **Units:** hbar = c = 1, Planck length $l_p$ reinserted explicitly.

**Key tool - null-contracted QI along a timelike worldline** (from Fewster-Roman 2003, their Eq. 35):
for a massless scalar in 4D Minkowski, inertial worldline with 4-velocity $u$, constant null $k$, any
smooth compactly supported $g$ and all Hadamard states,
$$\int d\tau\,\langle T_{ab}k^ak^b\rangle_\omega\,g(\tau)^2\ \ge\ -\frac{(k_au^a)^2}{12\pi^2}\int d\tau\,g''(\tau)^2 .$$
Optimized over $g$ supported in an interval $\tau_0$: if $\langle T_{ab}k^ak^b\rangle\le E$ throughout, then
$E\ge-C(k_au^a)^2/\tau_0^4$ with $C\approx4.23$ (Eq. 38). (They also quote the energy-density version: for
$q=g^2$, $C=\int g''^2/(16\pi^2\int g^2)$, minimum ~5 for unit-length support; the Lorentzian gives $3/(32\pi^2)$.)
Assumption (as in Ford-Roman 1996): valid in curved spacetime for $\tau_0$ short compared with the
smallest geometric length scale; they argue static ground-state $|E_0|$ is typically ~2 orders of
magnitude below the bound.

**Results:**
1. General static MT wormhole, static observer at the throat, $k=e_{\hat t}+e_{\hat r}$:
   $E=T_{ab}k^ak^b=(b_0'-1)/(8\pi r_0^2l_p^2)<0$ (Eq. 39), giving with $\tau_0=f\ell_{min}$, $f=0.01$:
   $$\frac{\ell_{min}^2}{r_0}\sqrt{1-b_0'}\ \lesssim\ 10^5\,l_p\qquad(42).$$
   - If $\ell_{min}=r_0$: $r_0\lesssim10^5l_p/\sqrt{1-b_0'}$; reaching even $10^{20}l_p\approx10^{-15}$ m (1 fermi) needs
     $1-b_0'\le10^{-30}$.
   - With a finite $\Phi'_0$ curvature scale: $\ell_{min}\lesssim\sqrt{10^5l_pr_0}$; for $r_0\approx1$ m $\approx10^{35}l_p$,
     $\ell_{min}\lesssim10^{20}l_p\approx10^{-15}$ m. Human tidal constraint $|R_{\hat t\hat r\hat t\hat r}|\lesssim1/(10^8\,\mathrm m)^2$ then forces
     $r_0\gtrsim10^{46}(1-b_0')^{1/2}$ m: e.g. $1-b_0'\sim10^{-10}$ gives $r_0\gtrsim10^{41}$ m $=10^{25}$ ly; or extreme fine
     tuning $1-b_0'<10^{-72}$ for $r_0=10^{10}$ m.
2. **VKD "spatially Schwarzschild" wormholes:** $T_{ab}k^ak^b=-1/(8\pi r_0^2)$ at the throat; $\ell_{min}\lesssim\sqrt{10^5l_pr_0}$:
   $r_0\approx1$ m gives $\ell_{min}\sim10^{-15}$ m; $r_0\approx1$ AU gives ~$10^{-11}$ m; $r_0\approx1$ ly gives ~$10^{-7}$ m. Human
   traversability then needs $r_0\gtrsim10^{46}$ m $=10^{30}$ ly, "about $10^{20}$ times the radius of the visible
   universe" (their comparison). Otherwise $r_0\lesssim10^5l_p$. Piecewise $R=0$ VKD model: $r_0\lesssim10^5l_p$ -
   "macroscopic piecewise R = 0 wormholes are ruled out" (quote).
3. Practical problems of VKD-type models (their Sec. 6): the less exotic matter, the closer to a
   vacuum Schwarzschild wormhole, so the *longer* external clocks record for the transit; infalling
   positive energy is "enormously blueshifted" at the throat => instability.
4. Kuhfittig's "macroscopic, QI-consistent" model is non-traversable: infalling light/particles need
   infinite affine parameter to reach the throat (coordinate vs proper length confusion).
5. Lesson (Summary, paraphrase): concentrating exotic matter classically into an arbitrarily small
   region near the throat is not by itself enough for traversability and QI consistency.
- Barcelo-Visser classical non-minimal scalar wormholes would evade QIs (not quantum) but "have some
  problems of their own" (they cite Roman's review).

## 17. Gao, Jafferis & Wall 2017 - "Traversable wormholes via a double trace deformation"

- **Citation:** P. Gao, D. L. Jafferis and A. C. Wall, "Traversable wormholes via a double trace
  deformation," JHEP **12** (2017) 151.
- **DOI:** 10.1007/JHEP12(2017)151 ; **arXiv:** 1608.05687 (read v3, 24 Sep 2019 - later than the JHEP
  version); URL: https://arxiv.org/abs/1608.05687 (INSPIRE confirms).
- **Access:** full text read (Intro, Secs. 3-5, Appendix result).
- **Units:** c = hbar = 1, AdS radius set to 1 (BTZ: $ds^2=-(r^2-r_h^2)dt^2+dr^2/(r^2-r_h^2)+r^2d\phi^2$).

**What makes it traversable:**
- Start from the eternal (two-sided) BTZ black hole = thermofield double (TFD) of two CFTs. Turn on,
  after a time $t_0$, a relevant **double-trace coupling between the two boundaries**,
  $\delta S=\int dt\,d^{d-1}x\,h(t,x)\,\mathcal O_R(t,x)\mathcal O_L(-t,x)$ (Eq. 1.2), with $\Delta<d/2$ (alternative quantization).
- This modifies the bulk scalar's boundary conditions; the 1-loop (quantum) stress tensor on the
  horizon gives a closed-form $\int dU\,T_{UU}<0$ (Eq. 3.18) for all $0<\Delta<1$ with the appropriate sign of
  $h$: **ANEC is violated along the horizon generator**, the null rays defocus, and a light ray from one
  boundary reaches the other (linearized Einstein eq. 1.3-1.5: $V(+\infty)<0$).
- Without the coupling (decoupled $H_L+H_R$) **no state** can make it traversable - $\int dU\,T_{UU}$ vanishes
  in the TFD (symmetry argument, Eq. 1.6) and would contradict AdS/CFT. So the coupling is essential.

**Why the no-go theorems don't apply / no faster-than-outside travel:**
- With boundaries directly coupled, null geodesics through the wormhole are **no longer achronal**
  (signals can also go via the coupling), so achronal-ANEC topological censorship and GSL arguments
  don't apply. The negative energy is "similar to the Casimir effect" since the radial direction is
  effectively a compact circle.
- "it cannot be used to violate causality" (abstract quote). The coupling fixes the relative time of
  the two boundaries, excluding closed timelike curves via boosting a mouth.
- Discussion: because any infinite null geodesic that makes it through such a wormhole must be
  chronal, "such wormholes do not enable one to travel faster than light over long distances through
  space" (quote, 16 words). Memorable line (quote): "traversable wormholes are like getting a
  bank loan: you can only get one if you are rich enough not to need it."
- If the two black holes were in the same space, the boundary coupling could be supplied by ambient
  propagation "with a time delay"; no paradoxes because traversability depends on an existing causal
  path through the ambient space.
- **User expectation CONFIRMED:** no faster-than-outside travel.

**Size / duration / information:**
- Opening $\Delta V\sim hG_N/R^{D-2}$ (Eq. 5.1) - proportional to the coupling, i.e. a 1-loop (O($G_N$)) effect;
  open only for a short proper time in the interior; signals arrive "after a very long time delay if
  the gravitational effects of the coupling are small"; the TFD is "an extremely fine tuned state".
- Test astronaut: may pass before it closes; eikonal analysis valid if sent within
  $\Delta t\approx R\ln(R/hL_{planck})$ (order the scrambling time) before the coupling.
- **Information:** GJW do NOT compute an information bound - footnote 8: "Presumably there is some
  limit on how much information can get through" (quote), e.g. black hole energy or the Bousso bound;
  needs beyond-linear analysis. (Maldacena-Stanford-Yang supply a parametric bound - Sec. 18.)
- Interpretation: gravitational dual of quantum teleportation (ER=EPR); energy and boundary
  entanglement decrease at linear order in $h$.

## 18. Maldacena, Stanford & Yang 2017 - "Diving into traversable wormholes"

- **Citation:** J. Maldacena, D. Stanford and Z. Yang, "Diving into traversable wormholes,"
  Fortschr. Phys. **65**, 1700034 (2017).
- **DOI:** 10.1002/prop.201700034 ; **arXiv:** 1704.05333 (v1, 18 Apr 2017); URL:
  https://arxiv.org/abs/1704.05333 (INSPIRE confirms).
- **Access:** full text read for abstract, Intro, Sec. 2.1, Sec. 2.5 (information bounds), Conclusions.

**Claims supported:**
1. Opening framing (quote): "It is well known that traversable wormholes are forbidden in general
   relativity. This says that we cannot send a signal through the wormhole faster than we can send it
   through the outside." (two sentences of 12 and 20 words - cite as two separate quotes.)
2. Nearly-AdS2 gravity treatment of the GJW protocol with a coupling $e^{igV}$, $V=\frac1K\sum_j\mathcal O_L^j\mathcal O_R^j$ (large
   number $K$ of light fields). A probe sent from one side gets a *time advance* through the
   negative-null-energy region and emerges on the other side; it is a gravitational picture of
   quantum teleportation / Hayden-Preskill decoding; the "teleportee feels nothing special".
3. **Information bound (Sec. 2.5, parametric only):** setting up the coupling needs $g\lesssim N_{bits}$
   bits (Eq. 2.21); backreaction of the signal (shock shift $|a^+|\sim gG_Ne^t$, uncertainty principle)
   limits the number of quanta that can be sent to $N_{send}\lesssim g$ (Eq. 2.25) - so **you cannot send
   more information through the wormhole than the bits/qubits exchanged to set up the coupling**; in
   the late-time regime only O(1) bits. The protocol works near the scrambling time and fails for
   longer evolution (exploits non-random-unitary dynamics).
4. The same correlator formula holds for the SYK model; a classical chaotic analogue exists.
- **Caveat:** AdS2 / SYK toy settings; "we caution the adventurous reader" that if the TFD has other
  bulk interpretations, "the teleportation experience might not always be pleasant" (quote).

## 19. Maldacena & Qi 2018 - "Eternal traversable wormhole"

- **Citation:** J. Maldacena and X.-L. Qi, "Eternal traversable wormhole," arXiv:1804.00491 [hep-th]
  (v3, 15 Oct 2018). **No journal publication found**: INSPIRE lists no publication info (checked
  2026-10-19) - cite as an arXiv preprint.
- **Access:** full text read for abstract, Intro and Sec. 6 (Conclusions).

**Claims supported:**
1. A static (time-independent) nearly-AdS2 solution: an **eternal traversable wormhole** supported by
   negative null energy from (many) quantum fields under an external coupling between the two
   boundaries; dual description: two SYK models coupled by a bilinear (relevant) interaction; the
   ground state of the coupled system is close to the TFD of the decoupled ones. Hawking-Page-like
   transition at finite temperature (continuously connected in the microcanonical ensemble).
2. Causality: "This does not violate any causality constraint since we are adding direct
   interactions between the two sides" (quote, 17 words).
3. Proposed 4D realization (Fig. 23): two nearly extremal black holes close to each other; integrating
   out ambient field modes generates the coupling. Challenges listed: classical attraction stronger
   than the quantum effects; gravitational-wave emission; need for many fields; alternate boundary
   conditions. (This program is executed in MMP 2018.)

## 20. Maldacena, Milekhin & Popov - "Traversable wormholes in four dimensions"

- **Citation:** J. Maldacena, A. Milekhin and F. Popov, "Traversable wormholes in four dimensions,"
  **Class. Quantum Grav. 40, 155016 (2023)**; arXiv:1807.04726 (v3, 3 Nov 2020).
- **DOI:** 10.1088/1361-6382/acde30 (INSPIRE). URL: https://arxiv.org/abs/1807.04726
- **Access:** full text read (arXiv v3) - Secs. 1, 2, 4, 5, 6.1, 7, 8, 9.
- **Units:** $\hbar=c=1$, $l_p=\sqrt{G_N}$; $g$ = U(1) coupling.

**Construction:** Einstein-Maxwell + massless charged (Dirac/Weyl) fermions. Two magnetically
charged near-extremal black holes (charges $\pm q$, $q\gg1$) whose AdS2xS2 throats are joined into one
**global AdS2xS2** throat (no horizon). In the magnetic field, a 4D charged fermion has a lowest Landau
level of degeneracy $q$ -> $q$ massless 2D fermions moving along magnetic field lines, which close into
circles (through the wormhole and back through ambient space). Fermions on a circle have negative
Casimir energy: $E_{wormhole}=-q/(8\ell)$ (Eq. 5.26, after the 2D conformal-anomaly correction), stress
$\hat T_{tt}=\hat T_{xx}=-\frac{q}{8\pi\ell^2}\frac1{4\pi r_e^2}$ (Eq. 5.27). The ANEC-violating null lines wrap the circle
and "are not achronal". Extremal radius $r_e^2=\pi q^2l_p^2/g^2$ (Eq. 2.3).

**Key numbers (d << q^2 l_p regime; d = distance between mouths):**
- Wormhole "length" (time to go through, seen from outside, is $\pi\ell$):
  $\ell=16r_e^3/(G_Nq)=16\pi^{3/2}q^2l_p/g^3$ (Eq. 5.31); binding energy $E_{min}=-G_Nq^2/(256r_e^3)=-g^3/(256\pi^{3/2}ql_p)$.
- Energy gap $E_{gap}\sim1/\ell\sim1/(q^2l_p)$; binding energy ~$1/(ql_p)$.
- Validity: $\ell\ll q^3l_p$ (Eq. 5.43); $d\ll q^{5/2}l_p$ (Eq. 5.49); with rotation $q^{5/3}l_p\lesssim d$ (Eq. 6.52).
- For $d\gg d_0$: $\pi\ell\approx2.35\,d$ - **always $\pi\ell>d$**: "it takes longer to go through the wormhole than
  through the ambient space" (Fig. 7 caption: line $\pi\ell=d$ is "the causality bound").
- Proper traversal time ~ $r_e\propto q$, much less than the outside time $\pi\ell\propto q^2$ (Sec. 9.1).
- **Size / fragility:** sending energy above the binding energy (~$1/(ql_p)$) collapses it into black
  holes; "an object that has a Compton wavelength of order $r_e$ outside the throat will already have
  this energy!" (quote) - "these wormholes are not safe for human travelers" (quote); "traversable for
  waves, but not for very small and energetic objects. It is a fragile and delicate wormhole" (quote).
- Mouths must orbit each other (Kepler $\Omega=\sqrt{2r_e/d^3}$, need $\Omega\ell\ll1$); U(1) radiation dominates and
  limits lifetime $T_{lifetime}\propto d^3/(q^2l_p^2)$; for $d<q^3l_p$ the wormhole is only metastable
  (two separate black holes are thermodynamically preferred). Large $N_f$ flavours: $\ell\propto q^2l_p/N_f$.
- **Standard Model embedding (Sec. 8):** U(1) = weak hypercharge; requires mouth separation $d$ below
  the electroweak scale (~1/TeV) so fermions are effectively massless, and hence $r_e$ much smaller
  still; effective $N_f=54$; Higgs vanishes in the throat. Authors: "this wormhole does not require
  any exotic matter. In fact, the ordinary matter of the Standard Model is enough!" (quote, 19 words)
  - i.e. **microscopic** wormholes only (mouth separation below the electroweak length
  $\hbar c/\mathrm{TeV}\approx2\times10^{-19}$ m - my conversion); note that the "no exotic matter" claim
  still relies on quantum (Casimir) ANEC violation along chronal null lines.
- Open problems stated: no procedure to *form* it (topology change; would need many monopoles
  collapsed into two black holes, evaporated to near extremality and brought together).
- Footnote 2 (credited to A. Wall): long wormholes are classically forbidden too, because local
  classical equations allow passing to the covering space where the wormhole becomes "short";
  Casimir energy depends on the actual topology, which is why the quantum effect evades this.

## 21. Maldacena & Milekhin 2021 - "Humanly traversable wormholes"

- **Citation:** J. Maldacena and A. Milekhin, "Humanly traversable wormholes," Phys. Rev. D **103**,
  066007 (2021).
- **DOI:** 10.1103/PhysRevD.103.066007 ; **arXiv:** 2008.06618 (v2, 3 Nov 2020); URL:
  https://arxiv.org/abs/2008.06618 (INSPIRE confirms).
- **Access:** full text read (arXiv v2, complete).

**Setting:** they "engage in some 'science fiction'": a **dark sector** coupled to the Standard Model
only via gravity: a 4D CFT with a U(1) gauged by a dark photon, realized holographically by a
**Randall-Sundrum II** model (AdS5 with a Planck brane; SM on the brane; 5D U(1)). In a magnetic field
the 4D theory flows to a 2D CFT (AdS5 -> AdS3xR2) with central charge $c_2\propto q$ (Eq. 3.21); this
supplies a huge $c_2$. AdS radius taken at its experimental upper bound $R_5\approx50\,\mu$m (Lee et al.,
PRL 124, 101101 (2020)), giving $G_5^{-1/3}\sim$ TeV. Free-fermion version fails: would need $N_f>10^{52}$
vs. a Bekenstein-type limit $N_f<M_{pl}^2/\mathrm{TeV}^2\sim10^{32}$ (Eq. 2.16).

**General formulas (Sec. 2.3):** $\ell=16r_e^3/(G_4c_2)$ (2.12); $E_{bind}=-c_2/(16\ell)=-c_2^2G_4/(2^8r_e^3)$ (2.13);
outside transit time $\pi\ell$; proper transit time ~$\pi r_e$; boost factor $\gamma=\ell/r_e\gg1$ (2.14) - "the
ultimate roller coaster" (quote). Information: total quanta $\lesssim c_2$ per time $\ell$ - "we can not transfer
more information than can be carried by the CFT through outside the wormhole" (quote, 17 words).

**Humanly traversable numbers (Eq. 3.26-3.27):**
- Tidal requirement: $a\sim\mathrm{size}/r_e^2<20g$ with size 0.5 m -> $r_e>1.5\times10^7$ m ~ 0.05 light-seconds (throat
  radius ~ 15,000 km; my conversion). From outside they "resemble intermediate mass charged black
  holes" (extremal mass $M=r_ec^2/G\approx2\times10^{34}$ kg $\approx10^4M_\odot$ - my arithmetic).
- $r_e\sim0.05$ s, $c_2\sim7\times10^{72}$, $\ell\sim3\times10^3$ light years, $\gamma=\ell/r_e\sim2\times10^{12}$, $E_{bin}\sim-5\times10^9$ kg.
- **Proper traversal time ~ $\pi r_e\approx0.16$ s** ("less than a second" for the traveller); **outside time
  $\pi\ell\sim10^4$ years** ("tens of thousands of years for somebody looking from the outside"). Valid for
  mouth separations $d\lesssim\ell$; **it is never faster than travel through ordinary space for outside
  observers ($\pi\ell>d$)** - the "one catch" stated in the Intro, which also means they cannot be made into
  time machines (footnote a). From the traveller's own clock it is extremely fast because of the
  enormous boost $\gamma$ (comparable to relativistic travel, with gravity doing the acceleration "for free").
- Orbiting mouths need $d>0.5$ ly; U(1)-radiation lifetime ~$10^{16}$ yr (Appendix B, for $d\sim0.5$ ly).
- Tidal forces on the highly boosted traveller: AdS2 is boost invariant; non-boost-invariant
  perturbations are suppressed by ~$1/\gamma$, so net effect comparable to the mouth tidal forces.
- **What happens to the traveller / practical problems (Sec. 3.4):** any infalling particle (e.g. a CMB
  photon) is blueshifted by $\gamma\sim10^{12}$ and seen by the traveller with $\gamma^2$; the wormhole would need to
  be kept in a "refrigerator" and "very clean"; accumulated scattered energy would collapse it into a
  black hole; the dark sector must be colder than $1/\ell\sim10^{-26}$ eV, whereas stellar processes would
  heat it far above that; **no formation mechanism** (needs topology change). Conclusion: "We have not
  given any plausible mechanism for their formation" (quote); allowed by the equations only.
- Smaller variant: $r_e\sim R_5$, $M\sim10^{23}$ kg, mouths across the solar system - transit time comparable to
  their separation; usable only for "very secret signals or qubits".
- Topology note: in 5D the Casimir energy is classical (negative AdS3 energy), and topological
  censorship is respected because the 5D spatial topology has trivial $\pi_1$ (the null ray can be deformed
  through the fifth dimension).

## 22. (Additional, found while checking) Fu, Grado-White & Marolf 2019 - "short transit times"

- **Citation:** Z. Fu, B. Grado-White and D. Marolf, "Traversable asymptotically flat wormholes with
  short transit times," Class. Quantum Grav. **36**, 245018 (2019); DOI 10.1088/1361-6382/ab56e4;
  arXiv:1908.03273 (v2). **Access:** full text read for abstract, Intro, Discussion.
- 4D, NEC-respecting classical background (two oppositely charged black holes joined by a
  non-traversable wormhole, held apart by a cosmic string) + perturbative quantum back-reaction of a
  second cosmic string wrapping the wormhole cycle. Traversable only at early times; integrated
  null energy exponentially small for non-extremal backgrounds, so "exponentially fragile".
- Minimum transit time $t_{transit}^{min}=d+$logs; $t/d\to1$ as $d\to\infty$ (MMP: $t/d>2$) - approaches but does
  not beat the external light-travel time. They state general arguments (GSL; Wall 2013; GJW) forbid
  wormholes "from providing the fastest causal curves between distant points" (quote), but note
  (footnote 8) that in 4D asymptotically flat spacetimes the IR-log Shapiro delay makes it "difficult
  ... to rigorously bound wormhole transit times" with causal-curve arguments (quote fragment).

## 23. Butcher 2014 - "Casimir energy of a long wormhole throat"

- **Citation:** L. M. Butcher, "Casimir energy of a long wormhole throat," Phys. Rev. D **90**, 024019 (2014).
- **DOI:** 10.1103/PhysRevD.90.024019 ; **arXiv:** 1405.1283 (v1, 6 May 2014) (INSPIRE confirms).
- **Access:** full text read (abstract, Secs. I, III B-C, IV, V).
- **Conventions:** c = 1, $\kappa=8\pi G$, Wald signs (-,+,+,+); $l_p$ Planck length.

**Claims supported:**
1. Motivation: capping wormhole mouths with Casimir plates fails because the plates' positive mass
   "will outweigh the negative energy between the plates when averaged along a null geodesic that
   escapes to infinity" (quote fragment; under the assumption plates have mass/charge >= electron's
   and separation > electron Compton wavelength, citing MTY). So instead ask whether the wormhole's
   own topology/curvature can generate its negative Casimir energy.
2. Dimensional argument: long throat (length $2L$, radius $a$, $L\gg a$) needs exotic density ~$1/(La\kappa)$
   while Casimir gives ~$\hbar/a^4$, so $a^2\sim l_p^2(L/a)$ (Eq. 4): macroscopic $a$ possible if $L\gg a$.
3. Renormalized Casimir tensor of a massless **conformally coupled** scalar in the infinite $\mathbb R\times S^2$
   throat (Eq. 59): $T^{ren}_{\hat\mu\hat\nu}=\frac{1}{2880\pi^2a^4}[\,2\ln(a/a_0)\,\mathrm{diag}(-1,1,-1,-1)+\mathrm{diag}(0,0,1,1)]$, where
   $a_0$ is "a fixed length that can only be determined by experiment" (fixed by the $R^2$-counterterm
   renormalization choice $\sigma=0$). Energy density negative for $a>a_0$; for $a>a_0e^{1/4}$ it violates all four
   pointwise conditions; with $L\to\infty$ stabilization would require $a^2=l_p^2(L/a)\ln(a/a_0)/(360\pi)$ (Eq. 68).
4. **But it cannot stabilize the static wormhole:** by boost symmetry along the throat, null rays exactly
   parallel to the throat see zero energy, so ordinary matter would have to violate the NEC - "a
   contradiction" (paraphrase of Sec. IV A).
5. Partial support => **slow collapse**: $\ddot a=-1/L$ (Eq. 84); closure time grows without bound with $L$,
   optimally $t_{close}\sim(L^2l_p)^{1/3}[\frac1{135\pi}\ln\frac{Ll_p^2}{1080\pi a_0^3}]^{1/6}$ (Eq. 99); near the centre a light
   pulse can traverse before closure (unknown whether it escapes the wormhole completely).
6. Author's (2014) speculation: results "tentatively suggest" a macroscopic traversable wormhole might
   be self-sustained, "providing a mechanism for faster-than-light communication and closed causal
   curves" (quote fragment) - note: predates the GJW/MMP "long wormhole" understanding; not shown.
- **Caveats:** renormalization-scale dependence ($a_0$ undetermined - cf. Ford-Roman 1996's point about
  $H^{(1)},H^{(2)}$ coefficients); single conformal scalar; test-field/slow-collapse approximation; whether
  signals get all the way through not established.

## 24. Butcher 2015 - "Traversable wormholes and classical scalar fields"

- **Citation (CORRECTED):** L. M. Butcher, "Traversable wormholes and classical scalar fields,"
  **Phys. Rev. D 91, 124031 (2015)** - not CQG 32, 235011 as listed in the task brief.
- **DOI:** 10.1103/PhysRevD.91.124031 ; **arXiv:** 1503.04145 (v2, 10 Jun 2015) (INSPIRE confirms).
- **Access:** full text read (abstract, Intro, theorem statement and remarks, discussion).

**Claims supported:**
1. **Theorem:** GR admits no asymptotically well-behaved static spherically symmetric traversable
   wormholes supported by classical scalar fields (any curvature coupling $\xi$, any potential, any
   number of fields) plus non-exotic matter: if the effective gravitational coupling
   $\kappa_{eff}=(\kappa^{-1}-\xi\phi^2)^{-1}$ is positive and finite at both ends, the additional matter must violate
   the NEC over a region of nonzero volume.
2. Targets Barcelo-Visser: their wormholes have $\xi\phi^2>\kappa^{-1}$ (negative $\kappa_{eff}$, "anti-gravity") in one
   asymptotic region; their claim that thin shells of normal matter can fix this "is false" (quote).
3. Not covered: thin-shell (delta-function) cut-and-paste constructions strictly (though real shells
   have thickness), non-static/non-spherical cases.
4. Discussion: quantum fields violate ANEC easily but "it has proven extremely difficult to use this
   violation" to stabilize a wormhole (quote fragment), citing his own 2014 long-throat result; suggests
   some other, as-yet unformulated principle may be the real obstruction.

## 25. Barcelo & Visser 1999, 2000 - classical (non-minimally) coupled scalar wormholes

- **Citations:** C. Barcelo and M. Visser, "Traversable wormholes from massless conformally coupled
  scalar fields," Phys. Lett. B **466**, 127-134 (1999), DOI 10.1016/S0370-2693(99)01117-X, arXiv:gr-qc/9908029;
  and "Scalar fields, energy conditions, and traversable wormholes," Class. Quantum Grav. **17**,
  3843-3864 (2000), DOI 10.1088/0264-9381/17/18/318, arXiv:gr-qc/0003025 (INSPIRE confirms both).
- **Access:** full text read for the 1999 paper (abstract, Intro, Discussion); abstract and grep of key
  passages for the 2000 paper.

**Claims supported:**
1. The "new improved" (conformal, $\xi=1/6$) stress tensor of a classical massless scalar can violate the
   NEC classically; exact static spherically symmetric Einstein-conformal-scalar solutions (3-parameter
   family) include Schwarzschild, naked singularities and traversable wormholes - but in all wormholes
   **the effective Newton constant has opposite sign in the two asymptotic regions** (1999).
2. They suggested thin shells of normal matter could restore positive $G_{eff}$ on both sides (1999
   Discussion) - later shown false by Butcher 2015 (Sec. 24).
3. 2000: for any $\xi>0$ a classical non-minimal scalar can violate all standard energy conditions **including
   ANEC**; wormhole branch exists for every $\xi>0$, but "the scalar field must reach trans-Planckian values
   somewhere in the geometry" (abstract quote, 13 words). They argue compatibility with known
   experimental constraints.
- **Assessment by others (read):** Kontou-Sanders 2020 and Graham-Olum 2007: such ANEC violations need
  Planck-scale field values where $G_{eff}$ changes sign - outside semiclassical validity; Kontou-Olum 2015:
  whether self-consistent achronal ANEC holds for non-minimal scalars is "an open question";
  Fewster-Roman 2005: they evade QIs (classical) but "have some problems of their own".

## 26. Garattini 2019 - "Casimir wormholes"

- **Citation:** R. Garattini, "Casimir wormholes," Eur. Phys. J. C **79**, 951 (2019).
- **DOI:** 10.1140/epjc/s10052-019-7468-y ; **arXiv:** 1907.03623 (v1, 5 Jul 2019) (INSPIRE confirms).
- **Access:** full text read (abstract, Intro, Sec. II, Conclusions, appendix footnotes).
- **Units:** G, c, hbar explicit; $l_p$.

**Claims supported:**
1. Restates Casimir: $E^{Ren}=-\hbar c\pi^2S/(720a^3)$, pressure $P=-3\hbar c\pi^2/(720a^4)$, $\rho_C=-\hbar c\pi^2/(720a^4)$, i.e. an
   equation of state $P=\omega\rho$ with $\omega=3$ (consistent with Brown-Maclay $p_z=3\rho$). Also quotes Visser's
   plate model $T^{\mu\nu}_\sigma=\sigma\hat t^\mu\hat t^\nu[\delta(z)+\delta(z-a)]+\Theta(z)\Theta(a-z)\frac{\hbar c\pi^2}{720a^4}[\eta^{\mu\nu}-4\hat z^\mu\hat z^\nu]$ and Visser's
   conclusion that plate mass overcompensates the negative energy, "forbidding" a traversable wormhole
   (paraphrase); MTY's analysis needed plate separation below the electron Compton wavelength.
2. Heuristic: promote plate separation $a\to r$ and impose $p_r=\omega\rho$ in a Morris-Thorne metric; gives
   $b(r)=r_0-r_1^2/r_0+r_1^2/r$ with $r_1^2=\pi^3l_p^2/90$ (Eq. 26); traversable for $\omega=r_0^2/r_1^2$; for the Casimir value
   $\omega=3$, $r_0=\sqrt3\,r_1\approx1.0\,l_p$ (my arithmetic) - **a Planck-size throat**: "traversable in principle but not in
   practice" (abstract/conclusion wording). The transverse pressure does not match Casimir's
   (correspondence "not one to one").
3. Tidal constraint at that size allows only a traveller of size $\lesssim1.06\times10^{-86}$ m (footnote 9): "with a
   Planckian wormhole nothing can traverse it" (quote).
4. Conclusion: Casimir energy is a realizable exotic source "which, however, can contribute only at
   the Planck scale" (quote fragment).
- **Caveat:** $a\to r$ substitution is ad hoc (author notes possible non-conservation); later papers by the
  same author (Yukawa-Casimir 2021, Hot Casimir 2025, rotating 2025, charged rotating 2026) extend
  the idea - not reviewed here.

## 27. Einstein-Dirac-Maxwell wormholes and the critiques

### 27a. Blazquez-Salcedo, Knoll & Radu 2021

- **Citation:** J. L. Blazquez-Salcedo, C. Knoll and E. Radu, "Traversable wormholes in
  Einstein-Dirac-Maxwell theory," Phys. Rev. Lett. **126**, 101102 (2021); DOI 10.1103/PhysRevLett.126.101102;
  arXiv:2010.07317 (v2, 12 Mar 2021) (INSPIRE confirms). Longer follow-up: Eur. Phys. J. C **82**, 533
  (2022), arXiv:2108.12187 (bibliographic only).
- **Access:** full text read (arXiv v2).
- **Units:** G = c = hbar = 1.

**What they claim:**
- Static, spherically symmetric, asymptotically flat traversable wormholes in Einstein + Maxwell + **two
  massive charged Dirac fields in a singlet spinor state**, "without needing any form of exotic matter"
  (abstract quote, 8 words) - i.e. no phantom fields or modified gravity. The Dirac matter is "a quantum
  wave function rather than a quantum field" (their approach, semiclassical; one-particle normalization
  $Q_N=1$ per spinor imposed via a scaling symmetry).
- NEC **is** violated near the throat ($T^r_r-T^t_t<0$, their Fig. 2) - the claim is that a standard field
  (Dirac) supplies it, not that NEC holds.
- "Smooth" solutions require nonzero electric charge and $\mu>0$; all have $Q_e/M>1$ ("mass-charge ratio has to
  be smaller than one" for traversability); families interpolate between the **extremal Reissner-Nordstrom
  black hole** and a critical line where spinor localization is lost (some near-critical ones have negative
  ADM mass). Largest fermion masses found ~$10^2M_{Pl}$; their Fig. 3 inset is in Planck units (masses of
  order $M_{Pl}$) - i.e. **Planck-scale objects** under the one-particle normalization.
- The two sides' fermions are entangled (particle/antiparticle of opposite chirality) - an ER=EPR flavour.
- Caveat they state: quantum corrections to the stress tensor "may affect the properties of the solutions".

### 27b. Bolokhov, Bronnikov, Krasnikov & Skvortsova 2021 (comment)

- **Citation:** S. V. Bolokhov, K. A. Bronnikov, S. Krasnikov and M. V. Skvortsova, "A note on
  'Traversable wormholes in Einstein-Dirac-Maxwell theory'," Grav. Cosmol. **27**, 401-402 (2021);
  DOI 10.1134/S0202289321040034; arXiv:2104.10933 (v2, 3 Sep 2021). **User's guess confirmed.**
- **Access:** full text read.
- Objections: (1) throat curvature scalars are of order unity in Planck units (Ricci ~0.1, Kretschmann
  ~6), so vacuum-polarization corrections are as large as the Einstein tensor itself - the metric
  "generally does not solve the actual equations of motion" (quote); an n-particle generalization is
  impossible because of the **Pauli exclusion principle**; (2) $\nu'(0)\ne0$ need not imply a thin shell - only
  that the wormhole is not Z2-symmetric; (3) Z2 symmetry with sign-changing particle number/mass is
  puzzling; (5) "without needing any form of exotic matter" is "misleading" since NEC-violating matter is
  necessary at any throat; better: Dirac fields "become exotic matter under certain circumstances".
  Notes MMP 2018 used spinors earlier.

### 27c. Danielson, Satishchandran, Wald & Weinbaum 2021 (additional critique found)

- **Citation:** D. L. Danielson, G. Satishchandran, R. M. Wald and R. J. Weinbaum,
  "Blazquez-Salcedo-Knoll-Radu wormholes are not solutions to the Einstein-Dirac-Maxwell equations,"
  Phys. Rev. D **104**, 124055 (2021); DOI 10.1103/PhysRevD.104.124055; arXiv:2108.13361 (v2).
- **Access:** full text read (abstract, Secs. 1, 3 conclusion).
- Claim: the BKR metric fails to be $C^3$ at the throat; a genuine EDM solution glued across $r=0$ would be
  smooth in a suitable gauge; hence BKR's symmetric wormholes contain **a spurious charged shell** (Maxwell
  matching fails) and, "more significantly", **a spurious delta-function source for the Dirac field** at
  the throat. Combining charge $q$ for $r>0$ with charge $-q$ for $r<0$ "cannot in any sense be considered to be
  a classical solution to the Dirac equation" (quote fragment).

### 27d. Konoplya & Zhidenko 2022 - "Traversable wormholes in General Relativity"

- **Citation:** R. A. Konoplya and A. Zhidenko, "Traversable wormholes in General Relativity,"
  Phys. Rev. Lett. **128**, 091104 (2022); DOI 10.1103/PhysRevLett.128.091104; arXiv:2106.05034 (v4,
  4 Mar 2022; earlier arXiv title "...without exotic matter").
- **Access:** full text read (arXiv v4).
- Claims: BKR's normalizable symmetric solutions need a matter shell at the throat, non-smooth fields and
  particles/antiparticles meeting without annihilation - "Apparently this kind of configuration could
  not exist in nature" (quote). KZ find **asymmetric**, smooth (no shell) asymptotically flat solutions
  of Einstein + Maxwell + two Dirac fields with normalizable smooth matter fields; all have $Q_\pm>M_\pm$ and
  approach extremal RN as $b_i\to0$; with uncharged fermions too. They suggest such configurations "could
  also be supported in a realistic scenario" and, since neutrino Compton wavelengths "can be of the
  order of millimeters", the solutions "include traversable wormholes of the millimeter throat size"
  (quote fragments).
- **Numbers in their Table I** ($qr_0=0.03$, $\mu r_0=0.2$): $M/r_0\approx Q/r_0\approx0.9998$-0.9999 (near-extremal); lapse at
  the throat $n_i/\sigma_+\approx2.6\times10^{-4}$ to $3\times10^{-3}$, i.e. an enormous redshift (~$10^{-4}$-$10^{-3}$) between
  throat and infinity (my reading of the table) - echoing Ford-Roman's warning about near-horizon,
  large-redshift wormholes. Throat radius set by the fermion Compton wavelength ($r_0=0.2/\mu$).
- **Caveats/objections:** KZ measure everything in units of $r_0$ and do not impose the one-particle
  normalization (my reading); for a mm-size throat the Dirac field must then describe a macroscopic
  occupation of a single state, which BBKS argue Pauli exclusion forbids - so these are classical-spinor
  solutions whose physical (quantum) realizability is unestablished. Stability, formation and
  quantum back-reaction not addressed. Follow-up: Churilova, Konoplya, Stuchlik & Zhidenko, JCAP 10
  (2021) 010 (quasinormal modes, echoes, shadows) - bibliographic only.

## 28. Pfenning & Ford 1997 - "The unphysical nature of 'warp drive'"

- **Citation:** M. J. Pfenning and L. H. Ford, "The unphysical nature of 'warp drive'," Class. Quantum
  Grav. **14**, 1743-1751 (1997); DOI 10.1088/0264-9381/14/7/011; arXiv:gr-qc/9702026 (v3, 15 Mar 2001)
  (INSPIRE confirms).
- **Access:** full text read (abstract, Secs. 3-5).
- QI (massless scalar, Lorentzian, sampling time a fraction $\alpha$ of the local curvature radius) applied to
  Alcubierre's metric: bubble-wall thickness $\Delta\le\frac34\sqrt{\frac3\pi}\,\frac{v_b}{\alpha^2}$ (Eq. 22; checked on the rendered PDF page);
  with $\alpha=1/10$,
  $\Delta\le10^2v_b\,L_{Planck}$ (Eq. 23) - "a few hundred Planck lengths".
- Total negative energy for a 100 m bubble: $E\le-6.2\times10^{65}v_b$ grams $\approx-3\times10^{20}M_{galaxy}v_b$ (Eqs. 29-31),
  "roughly ten orders of magnitude greater than the total mass of the entire visible universe" (quote,
  15 words). If walls could be 1 m thick: about a quarter of a solar mass. A bubble the size of an
  electron Compton wavelength: ~$-400M_\odot$. EM field allows walls only $\sqrt2$ thicker; massive fields
  are more restrictive.
- Comparison: same structure as the wormhole result (Ford-Roman 1996) - negative energy confined to
  Planck-scale-thick layers with absurd total amounts. (Kontou-Sanders also quote Everett-Roman for the
  Krasnikov tube: band a few thousand Planck lengths thick; ~$10^{16}$ galactic masses for a 1 m tube.)

## 29. Related primary sources consulted while checking (brief)

- **Fewster & Roman 2003**, "Null energy conditions in quantum field theory," Phys. Rev. D **67**, 044003
  (2003); **Erratum** Phys. Rev. D **80**, 069903 (2009) (INSPIRE); DOI 10.1103/PhysRevD.67.044003;
  arXiv:gr-qc/0209036 (v2). Access: abstract read in full text. For the massless minimally coupled
  scalar in 4D Minkowski, null-geodesic averages of $T_{ab}\ell^a\ell^b$ are **unbounded below** over Hadamard
  states - "there are no quantum inequalities along null geodesics in four-dimensional Minkowski
  spacetime" (quote, 14 words) - unlike 2D; the states used still satisfy ANEC; but the null-contracted
  stress averaged over a *timelike* worldline does obey a QI in any globally hyperbolic spacetime (the
  tool used by Fewster-Roman 2005 and Kontou-Olum 2015).
- **Flanagan & Wald 1996**, "Does back reaction enforce the averaged null energy condition in
  semiclassical gravity?", Phys. Rev. D **54**, 6233-6283 (1996); DOI 10.1103/PhysRevD.54.6233;
  arXiv:gr-qc/9602052 (v2). Access: abstract read. Perturbation theory about flat space/vacuum for a
  free massless scalar (any coupling), length scales >> Planck: first order pure states give zero ANEC
  integral, mixed states can be negative, but **ANEC smeared transversely over a Planck-scale region is
  strictly positive** (except trivial case); similar at second order. Conclusion (quote): "if traversable
  wormholes do exist as self-consistent solutions of the semiclassical equations, they cannot be
  macroscopic but must be 'Planck scale'" (21 words) - agreeing with Ford-Roman.
- **Olum 1998**, "Superluminal travel requires negative energies," Phys. Rev. Lett. **81**, 3567-3570 (1998);
  DOI 10.1103/PhysRevLett.81.3567; arXiv:gr-qc/9805003 (v2). Access: abstract and opening read.
  Defines superluminal travel as a path reaching a destination surface earlier than any neighbouring
  path; with the generic condition, proves it **requires WEC violation**. Shows by example that a metric
  can look superluminal yet be flat space in odd coordinates (the destination moved).
- **Wall 2013**, "The generalized second law implies a quantum singularity theorem," Class. Quantum
  Grav. **30**, 165003 (2013) + Erratum CQG **30**, 199501 (2013); arXiv:1010.5513 - **bibliographic only**
  (cited by GJW and Fu-Grado-White-Marolf as the GSL argument that wormholes cannot provide the fastest
  causal curves / cannot connect disconnected regions).

---

## 30. Summary table of key bounds and numbers (all verified in the sources above)

| Quantity | Value | Source |
|---|---|---|
| 4D massless scalar QI, Lorentzian sampling | $\frac{\tau_0}{\pi}\int\frac{\langle T_{\mu\nu}u^\mu u^\nu\rangle d\tau}{\tau^2+\tau_0^2}\ge-\frac{3}{32\pi^2\tau_0^4}$ ($\hbar=c=1$), inertial observer, any state, flat space w/o boundaries | FR95 Eq. 65; FR97 Eq. 1/17 |
| Same, EM field | $\ge-3/(16\pi^2t_0^4)$ | FR97 Eq. 48 |
| Same, massive scalar | $\ge-\frac{3}{32\pi^2t_0^4}G(2mt_0)$, $G\le1$ | FR97 Eq. 16 |
| General sampling, 4D massless | $\int\langle T_{00}\rangle g^2dt\ge-\frac1{16\pi^2}\int(g'')^2dt$; Lorentzian gives $-27/(2048\pi^2\tau^4)$ = 9/64 of FR | FE98 Eqs. 5.5-5.6; Fewster 2012 Eq. 3 |
| Null-contracted QI on timelike worldline | $\int\langle T_{ab}k^ak^b\rangle g^2d\tau\ge-\frac{(k\cdot u)^2}{12\pi^2}\int g''^2$; $E\ge-4.23(k\cdot u)^2/\tau_0^4$ | Fewster-Roman 2003/2005 |
| Null-geodesic QI in 4D | does not exist | Fewster-Roman 2003 |
| Duration bound | $\rho\ge-3.17/\tau^4$ over any interval $\tau$ | Fewster 2012 Eq. 4 |
| 1 m throat, "absurdly benign" wormhole | negative-energy band $a_0\lesssim10^{14}l_p\approx10^{-21}$ m ~ $10^{-6}$ fm (f = 0.01) | FR96 Eq. 69 |
| Galaxy-size ($10^5$ ly) throat | band $\lesssim10^{21}l_p\approx10^{-14}$ m ~ 10 proton radii | FR96 |
| Simple wormholes ($b=r_0^2/r$; $b=r_0$) | $r_0\lesssim l_p/(2f^2)$ resp. $l_p/f^2$ ~ $10^4l_p$ ~ $10^{-31}$ m | FR96 Eqs. 51, 60 |
| Many-field loophole | ~$10^{62}$ fields for a 1 m throat | FR96 Sec. 6 |
| Curvature-counterterm loophole | coefficients $\gtrsim10^{70}$ for 1 m throat | FR96 Sec. 2 |
| VKD-type ("small exotic matter") human-traversable | $r_0\gtrsim10^{46}$ m $=10^{30}$ ly, else $r_0\lesssim10^5l_p$ | FR05 |
| Warp bubble | wall $\lesssim10^2v_bl_p$; $E\sim-3\times10^{20}M_{galaxy}v_b$ for R = 100 m | Pfenning-Ford 1997 |
| Casimir (ideal plates) | $T^{\mu\nu}=\frac{\pi^2\hbar c}{720a^4}\mathrm{diag}(-1,1,1,-3)$; $\rho=-4.3\times10^{-4}$ J/m$^3$ at 1 um; force $\pi^2\hbar c/(240a^4)$ = 1.3 mPa at 1 um | Casimir 1948; BM69 via Fewster/K&S/Milton |
| Casimir experiments | Lamoreaux 1997: 0.6-6 um, ~5% (contested; erratum); Mohideen-Roy 1998: 0.1-0.9 um, 1% at closest; Bressi et al. 2002: parallel plates 0.5-3 um, 15% | primary papers |
| GJW opening | $\Delta V\sim hG_N/R^{D-2}$ (1-loop, O($G_N$)); causal, not faster than outside | GJW Eq. 5.1 |
| MSY information | quanta sent $\lesssim g\lesssim$ bits exchanged to set up coupling | MSY Eqs. 2.21, 2.25 |
| MMP (4D, SM) | $\ell=16r_e^3/(G_Nq)\propto q^2l_p$; transit seen outside $\pi\ell>d$ ($\approx2.35d$ at large d); proper time ~$r_e$; mouths < electroweak length; "not safe for human travelers" | MMP Eqs. 5.31, Fig. 7, Sec. 8 |
| MM humanly traversable (RS2 dark sector) | $r_e\gtrsim1.5\times10^7$ m; $c_2\sim7\times10^{72}$; $\ell\sim3\times10^3$ ly; $\gamma\sim2\times10^{12}$; $E_{bin}\sim-5\times10^9$ kg; proper time ~0.16 s vs ~$10^4$ yr outside; dark sector colder than $10^{-26}$ eV; no formation mechanism | MM Eqs. 3.26-3.27 |

---

## 31. Discrepancies and open questions (vs. the task brief's expectations)

1. **QI coefficient and conditions - CONFIRMED with qualifications.** $\langle\rho\rangle\ge-3/(32\pi^2t_0^4)$ ($\hbar=c=1$) is exact
   for the *Lorentzian-weighted* average along an *inertial* worldline, *free massless minimally coupled*
   scalar, *4D Minkowski without boundaries*, any (Fock/Hadamard) state, for *all* $t_0$ (FR95 Eq. 65, which
   FR96 calls "Ref. [13]"). It is not a bound on a sharp (box) average - box averages are unbounded below
   (Fewster-Eveson 1998). Optimal-ish bounds for other weights differ (e.g. 9/64 of FR for the Lorentzian
   via FE98's method). EM: twice as negative; massive: tighter. The curved-space use in FR96 is an
   argument for $t_0\ll$ curvature radius, not a theorem (later partially made rigorous: Fewster-Smith 2008
   absolute QEIs; Kontou-Olum curved-space QIs).
2. **Casimir stress tensor - CONFIRMED** $T^{\mu\nu}=(\pi^2\hbar c/720a^4)\,\mathrm{diag}(-1,1,1,-3)$ in Cartesian components with $z$
   normal to the plates (same matrix in either signature). NEC is violated for **every null direction
   with a component normal to the plates** (value $-4\rho_Cn_z^2$), maximal for $k$ normal; it is
   **exactly zero** (not violated) for null directions parallel to the plates. ANEC along complete
   geodesics is **not** violated once the plates are included (Graham-Olum 2005 with holes; FOP 2007;
   Kontou-Sanders). Brown & Maclay 1969 itself was **not accessible** (APS 403); confirmation is from three
   secondary sources citing it.
3. **Casimir energy density "measured"?** No: experiments measure the force/pressure. Ford & Roman
   1995 explicitly note the energy density itself has not been measured.
4. **Lamoreaux 1997 precision.** The headline "5%" is disputed: the 1998 erratum (PRL 81, 5475) - per the
   Bordag-Mohideen-Mostepanenko review - corrected the lens radius (11.3 -> 12.5 cm, +10.6% in theory)
   and noted a 22% (Au) finite-conductivity correction; BMM estimate ~700% relative error at 6 um. I could
   not read the erratum itself. BMM's reference list prints the erratum page as "4549(E)", which is
   Mohideen-Roy's page; INSPIRE gives 5475-5476.
5. **Butcher 2015 citation in the brief is wrong:** it is **Phys. Rev. D 91, 124031 (2015)**, not CQG 32, 235011.
6. **MMP journal reference** (brief asked): **Class. Quantum Grav. 40, 155016 (2023)**, DOI 10.1088/1361-6382/acde30.
   **Maldacena & Qi 2018 has no journal publication** listed on INSPIRE (cite as arXiv:1804.00491).
7. **Bolokhov et al. 2021** is indeed Grav. Cosmol. 27, 401-402 (2021). An additional, more decisive
   critique exists: **Danielson, Satishchandran, Wald & Weinbaum, PRD 104, 124055 (2021)** - BKR's symmetric
   wormholes are not EDM solutions (spurious charged shell + spurious Dirac source at the throat).
   Konoplya-Zhidenko's asymmetric smooth solutions answer the junction objection, but remain classical
   Dirac-field, near-extremal configurations with throat redshift factors ~$10^{-4}$-$10^{-3}$, with Pauli/
   one-particle-normalization and quantum back-reaction issues unresolved.
8. **"No exotic matter" claims (MMP; BKR; KZ)** mean "no phantom/non-standard Lagrangian", NOT "no NEC
   violation". Every one of these throats violates the NEC/ANEC (quantum Casimir-type in MMP/GJW; Dirac
   stress in BKR/KZ). The brief should not read them as evading the energy-condition theorems; they evade
   them via **chronal (non-achronal) null geodesics** ("long" wormholes) or via quantum/fermionic sources.
9. **GJW "faster than outside?" - CONFIRMED NO.** Traversal requires the boundary coupling (or, in a
   single universe, an ambient causal path); null geodesics through it are chronal; no causality
   violation. MSY/MMP/MM say the same; MM: outside time $\pi\ell>d$ always. Nuance: Fu-Grado-White-Marolf
   2019 find well-timed transit times $t=d+$logs (ratio -> 1 at large d) for fragile non-extremal 4D
   wormholes - approaching but not beating the external light time; they also note that in 4D
   asymptotically flat spacetimes rigorous transit-time bounds from causal-curve arguments are hard
   (IR-log Shapiro delay). So "never faster" is well supported by the constructions and by AANEC/GSL
   arguments in AdS/higher-D, but not a fully general 4D theorem.
10. **Information through GJW:** GJW themselves give no bound (footnote: "presumably" limited); the
    parametric bound is from MSY ($N_{send}\lesssim g\lesssim N_{bits}$ exchanged), and MM give ~$c_2$ quanta per time $\ell$.
11. **Gao-Wald hypotheses:** their theorems assume the **pointwise NEC** (plus null generic condition),
    not ANEC; Theorem 2 (AdS) notes NEC can be replaced by Borde's averaged condition; Galloway's remark
    replaces the hypotheses of Theorem 1 by "no null lines" (which AANEC + generic gives). Theorem 1 is
    weaker than "fastest null geodesics are those far away" in a quantitative sense: the size of $K'$ is
    uncontrolled (authors' caveat).
12. **Topological censorship (FSW 1993):** body theorem uses **ANEC** (abstract says NEC); erratum PRL 75,
    1872 (1995). Graham-Olum 2007 extend to self-consistent achronal ANEC but **only for wormholes
    connecting different asymptotic regions** (simply connected case); intra-universe "long" wormholes are
    an explicit loophole.
13. **Minor numerical discrepancies found in sources:**
    - FR96 (arXiv v1) Eq. (3) gives the static energy density of a massless scalar with period $L$ as
      $-\pi^2/(45L^4)$; FOP 2007 Eq. (24) gives $\frac{\pi^2}{90L^4}\mathrm{diag}(-1,1,1,-3)$, and an independent check (Dirichlet-plate
      doubling of $-\pi^2/1440$; thermal-rotation argument) supports $\pi^2/90$ [my check]. If so, FR96's
      "$\tau_0\lesssim0.46L$" would become ~0.54L (immaterial). Published PRD version not checked.
    - Fewster 2012 lecture notes print the scalar Casimir constant term as $\pi^2/(1140L^4)$; almost certainly a
      misprint for $\pi^2/(1440L^4)$ (Milton et al. 2008 give $-\pi^2/1440a^4$). The "3-7% of the bound" statement
      is insensitive to this.
14. **Open questions flagged by the sources themselves:** interacting-field QEIs (state-independent ones
    generally impossible; Casimir-like sustained negative energy possible); non-minimally coupled scalars
    and self-consistent AANEC (open); AANEC in general curved spacetimes beyond first order in curvature
    (Kontou-Olum) and beyond Planck-smeared perturbation theory (Flanagan-Wald); Freivogel-Krommydas
    "smeared NEC" conjecture; formation mechanisms for MMP/MM wormholes (none known; topology change);
    stability of MMP (metastable, radiates, fragile against any energy above ~$1/(ql_p)$).
15. **Things I could NOT access:** Brown & Maclay 1969 (bibliographic only); Lamoreaux 1998 erratum
    (content only via a review); Wall 2013 (bibliographic only); published journal versions generally
    (arXiv versions read - for GJW the arXiv v3 postdates the JHEP publication; for FSW the arXiv v2
    postdates the erratum).
