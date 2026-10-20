# Breakthrough hypotheses and test plans

*Project Portal, phase II, deliverable 5. These are the most promising ideas that came out of the phase II
calculations, written as research proposals. None is established. Ranking is explained in words; no
confidence percentages are given, because none of these has a defensible probability.*

## How the ranking works

Each hypothesis is judged on four axes:

- **Plausibility:** does it agree with every established result we know, and is the evidence we produced for
  it, as opposed to merely consistent with it, strong?
- **Tractability:** could a small team make decisive progress in months with existing methods?
- **Research value:** would the answer matter beyond portals?
- **Portal relevance:** would a positive answer move a decisive blocker of [D4](D4-competing-architectures.md)?

## Ranked list

| Rank | Hypothesis | Plausibility | Tractability | Value | Portal relevance |
|---|---|---|---|---|---|
| 1 | H1: The boost-optimised QI bound holds for every static throat without a small length scale | High | Medium | Medium | High (closes a class of loopholes) |
| 2 | H5: Periodic driving cannot stabilise the Ellis throat in the full field theory | Medium | High | Medium | Medium |
| 3 | H7: "Heavy or negative" holds for every traversable mouth, not only time-symmetric ones | High | Medium | High | High (handheld devices) |
| 4 | H2: A QI scale-hierarchy relation $\ell^4 \lesssim \ell_P^2L_1L_2$ holds in curved spacetime | Medium–high | Low–medium | High | High |
| 5 | H3: No state of known fields reaches the thin-band density | High | Medium | Medium | High (the last static door) |
| 6 | H6: Index-2 handle creation has finite particle production | Medium | Low–medium | High | Medium |
| 7 | H8: Chronology control has a computable semiclassical safety margin | High | Medium | Low–medium | Medium |
| 8 | H4: Dynamical negative-tension strings exist | Low | Low | High | High (flat-face door) |

**Why this order.**

- **H1 and H5 come first** because we already have strong partial evidence and the next step is mostly
  computation.
- **H7 next:** it rests on a well-tested conjecture (the spacetime Penrose inequality) and a theorem in the
  time-symmetric case.
- **H2** is the most valuable to physics but needs curved-space QI technology.
- **H3** would close the only remaining static door, but is likely true and so changes little.
- **H6** is deep but hard.
- **H8** is mostly engineering.
- **H4 is last on plausibility:** negative-tension objects in known theories are not dynamical (§H4), yet it
  would be the biggest change if true.

---

## H1. A shape-independent QI bound for static throats

- **Hypothesis.** For any static throat, of any symmetry, whose geometry contains no length scale much
  shorter than its minimal radius $r_0$, the Ford–Roman deficit over geodesic observers is at least
  $c\,f^4(r_0/\ell_P)^2$ for a universal $c = O(1)$.
- **Formulation.** At a minimal surface $\Sigma$ of a static slice, take the null congruence orthogonal to
  $\Sigma$. Flare-out means its expansion changes sign across $\Sigma$, so $R_{ab}k^ak^b < 0$ there. Along the
  boost direction normal to $\Sigma$, the observer with $\gamma^2 \sim 1/(\text{local flare-out})$ sees
  $\rho' \sim -1/(8\pi r_0^2)$. The theorem of D2 §5.2 is the spherical case.
- **Predicted consequences.**
  - Axisymmetric, prolate, oblate and rotating static throats all give deficits within an O(1) factor of the
    spherical value.
  - Any escape requires a small length scale (as in D2 §5.3).
- **Prior-art check.** Ford & Roman (1996) treat spherical static throats with fixed or limited observer
  speeds (stage B notes). No general shape-independent statement was found; see D2 §10.
- **Falsification.**
  - A static throat with all curvature and variation lengths ≥ $r_0/10$ and a deficit below $10^{-3}$ of the
    spherical value.
  - An error in the boost argument for non-umbilic minimal surfaces (where the shape operator has unequal
    eigenvalues).
- **Next investigation.** Extend `qi.py` to the orthonormal curvature of static axisymmetric metrics, and
  audit prolate and oblate throats and the Kerr-like rotating wormholes of the literature.

## H2. A scale-hierarchy relation for QI-compatible NEC violation

- **Hypothesis.** In a region whose curvature radii are $L_1, L_2$ and whose smallest length scale (curvature
  or variation, after optimising the observer) is $\ell$, QI-compatible NEC violation requires
  $\ell^4 \lesssim \ell_P^2L_1L_2$.
- **Formulation.** Combine a curved-space QI with explicit remainder terms (milestone M0) with the Einstein
  equations, in the worst observer frame.
- **Predicted consequences.** Reproduces every computed case (D2 §9.2):
  - smooth throats: $r_0 \lesssim \ell_P$;
  - thin bands: $a^3 \lesssim \ell_P^2r_0$;
  - rims: $w \lesssim \ell_P$;
  - pulsed throats: $c\tau \lesssim \sqrt{\ell_Pr_0}$.

  It predicts the same for warp-bubble walls and Krasnikov tubes.
- **Prior-art check.** Ford & Roman's "large discrepancies in length scales" (1996) and Pfenning & Ford's
  warp-wall bound are instances. No general statement was found.
- **Falsification.**
  - A curved-space QI whose remainder grows faster than the flat-space term at $f \sim 0.1$.
  - An explicit QFT state violating the relation in a computable background (for example Casimir
    configurations in curved space).
- **Next investigation.** Test against known exact results: Casimir energy between curved plates, the
  conformal anomaly in 2D, and the 1+1 trousers. Then attempt a proof for conformal fields, where
  curved-space QIs are best developed.

## H3. The thin band cannot be made of known fields

- **Hypothesis.** No state of Standard-Model fields produces a negative energy density of order
  $c^4/(8Gar_0)$ in a layer $a \lesssim (r_0\ell_P^2/f^4)^{1/3}$, which is $10^{64}$ J/m³ in $10^{-21}$ m for
  $r_0 = 1$ m.
- **Formulation.** Maximise the negative energy density over states of $N$ free fields, plus the known
  interacting-field bounds, at the band's scale. The band thickness, $10^{-21}$ m, is about 800 times
  shorter than the electroweak length $\hbar c/(246\text{ GeV}) \approx 8\times10^{-19}$ m. At that scale every
  Standard-Model field is effectively massless, so all of their degrees of freedom count.
- **Predicted consequences.** The maximum achievable density falls short by a large factor even counting all
  Standard-Model degrees of freedom ($N \sim 10^2$ moves $a_*$ by $N^{1/3} \approx 5$).
- **Prior-art check.** Ford & Roman (1996) noted the band's absurdity; stage B notes.
- **Falsification.** An explicit multi-field state reaching the density within a factor 10.
- **Next investigation.** Count degrees of freedom above 1 TeV, and include gravitons and any
  beyond-Standard-Model sector. This is the cheapest of the hypotheses to settle.

## H4. Dynamical negative-tension strings

- **Hypothesis.** Some consistent theory contains movable codimension-2 objects with tension $\mu = -c^4/4G$
  (in force units), which could form the rims of flat-face portals.
- **Formulation.** The flat-face portal needs a closed string with conical excess $2\pi$, core thinner than
  $\sim10^{-31}$ m (QI), straight edges, and corner supports.
- **Predicted consequences.** If such objects exist, a flat-face portal has no exotic matter on the
  traveller's path and passes the tidal and QI tests (D2 §5.5).
- **Prior-art check.** Negative-tension objects appear in string theory as orientifold planes, which are
  non-dynamical (fixed by the orientifold projection). Whether any dynamical analogue exists was not
  established in stage B.
- **Falsification.** A theorem that negative-tension defects are always fixed, or always carry ghosts, in
  consistent theories.
- **Next investigation.** A literature-level survey of defects with negative tension in string and brane
  constructions, and of their dynamics.
- **Ranking basis.** Low plausibility, because the known examples are not dynamical. High relevance, because
  this is the only door that keeps exotic matter off the traveller's path.

## H5. Periodic driving cannot stabilise a phantom-supported throat

- **Hypothesis.** For the Ellis–Bronnikov wormhole, no time-periodic modulation of the supporting stress
  gives a stable linearised system. The single-mode Kapitza mechanism is always undone by parametric
  excitation of other modes.
- **Formulation.** The Floquet spectrum of $\partial_t^2 - L - a\cos(\Omega t)U(x)$ on the half-line with outgoing
  boundary conditions, over drive profiles $U$.
- **Predicted consequences.**
  - The late instability seen in D2 §6.6 persists under converged numerics.
  - Its rate grows with $a$ above the single-mode threshold.
- **Prior-art check.** We found no prior study of parametric stabilisation of wormholes; stage B searched for
  one.
- **Falsification.** A converged run, or a Floquet spectrum, with all multipliers inside the unit circle for
  some $(U, a, \Omega)$.
- **Next investigation.**
  - Spectral discretisation in space; complex-scaled absorbing layer; direct monodromy of the discretised
    operator.
  - Optimise $U(x)$ by adjoint methods.
  - Then repeat with a self-consistent oscillating background (two scalar fields) rather than a model drive.
- **Ranking basis.** High tractability (all tools exist in `stability.py`). Moderate value: it bears on driven
  stabilisation of unstable solitons generally.

## H6. Causally continuous handle creation is not singular

- **Hypothesis.** Quantum fields on a 3+1 Morse spacetime with a single index-2 critical point (the 2-handle
  that makes $S^2\times S^1$) have finite particle production and finite energy. Index 1 and 3 do not, as in
  the 1+1 trousers.
- **Formulation.** Massless scalar on the degenerate metric $g = |\nabla f|^2h - \zeta\,df^2$ near the critical
  point. Compute the Bogoliubov coefficients between in- and out-regions, regularised by smoothing the
  degeneracy.
- **Predicted consequences.** If true, the index-2 route is the preferred creation channel (D2 §7.3), and by the
  local-creation lemma it still makes coincident mouths.
- **Prior-art check.** This is the content of the Borde–Sorkin conjecture and of the
  Dowker–Garcia–Surya analysis; see stage B notes for what is proven.
- **Falsification.** Divergent particle production at index 2, or divergent production at index 1 whose
  regularisation makes index 2 similarly singular.
- **Next investigation.** The calculation in 2+1 dimensions first, where index 1 is the only non-trivial
  surgery and index 0/2 are the "yarmulke" cases. Then 3+1.

## H7. Heavy or negative, for every mouth

- **Hypothesis.** Any traversable wormhole mouth whose throat (a marginally outer trapped or minimal surface)
  has area $A$, and whose ADM mass is below $\sqrt{A/16\pi}\,c^2/G$, contains matter that some observer sees
  with negative energy density. This holds stationary or dynamical, rotating or not.
- **Formulation.**
  - **Time-symmetric case:** the Riemannian Penrose inequality (Huisken & Ilmanen 2001; Bray 2001) gives
    $M \ge \sqrt{A/16\pi}$ when $R = 16\pi\rho \ge 0$, so a lighter mouth needs $\rho < 0$ somewhere. This is
    already a theorem, given that the throat is the outermost minimal surface from that end (stage B notes).
  - **General case:** needs the spacetime Penrose inequality, which is conjectured.
- **Predicted consequences.** A handheld portal mouth necessarily carries negative energy of order
  $\sqrt{A/16\pi}\,c^2/G - M$, about 0.35 Jupiter masses for 1 m. This extends the Misner–Sharp result of
  D2 §4.4 to any shape.
- **Prior-art check.** Pending (stage B notes, stageB-penrose.md).
- **Falsification.** A stationary traversable mouth with $M < \sqrt{A/16\pi}$ and the dominant energy
  condition everywhere. That would also be a counterexample to a form of the Penrose conjecture.
- **Next investigation.** Check the time-symmetric statement on rotating (non-time-symmetric) examples from
  the literature numerically; compute $M$, $A$ and the minimum energy density.

## H8. A semiclassical safety margin for chronology control

- **Hypothesis.** The renormalised stress-energy near a network's chronology margin $m$ (smallest cycle weight)
  grows as a computable power of $1/m$. This gives a minimum operational margin $m_*$ that depends on throat
  size and mouth separation.
- **Formulation.** Generalise the Kim–Thorne / Hawking analysis of a single wormhole time machine to the
  cycles found by the phase II checker.
- **Predicted consequences.** A design rule of the form "close or swap any pair before its margin falls below
  $m_*$". Combined with the drift budgets of D2 §8.2 (54 days to millennia), this gives maintenance schedules.
- **Prior-art check.** Kim & Thorne (1991), Hawking (1992), Visser (1997): stage B notes.
- **Falsification.** Growth too weak to matter before Planck-scale margins, which would remove the need for a
  margin beyond zero.
- **Next investigation.** Reproduce the single-wormhole result, then evaluate it for a Roman ring.

---

## Ideas tried and dropped during phase II

| Idea | Why it was dropped |
|---|---|
| A gentler flare-out evades the QI | Disproved (D2 §5.2) |
| A redshift structure evades the QI | Works only by making the mouth a gravitational well or hill that no one can walk through (D2 §5.4) |
| Pulsed portals evade the QI | Allowed open time $10^{-26}$ s (D2 §5.6) |
| Fast electronics can stabilise the throat | The binding limits are loop delay and NEC-violating actuation (D2 §6.5) |
| A "massless" mouth needs no negative energy | Contradicted by the Misner–Sharp sum rule (D2 §4.4) |
| A portal gun could create a remote connection directly | Contradicted by the local-creation lemma, unless closed timelike curves are allowed (D2 §7.2) |
