# Integrity audit

*Project Portal, phase II, deliverable 8. How the work was done, what was and was not executed, what was
corrected along the way, and what no one has checked. Times are UTC on 2026-10-20 unless stated. Commit
times come from git; other times come from the session record and file timestamps.*

## 1. Scope of this audit

- **Executed work is traceable.** Every claim that something was computed points to a file in
  [`../results/`](../results/) and to the code that writes it.
- **Literature claims are traceable.** Every claim about the literature points to the stage B notes in
  [`../notes/`](../notes/), which record each source's access status.

This audit lists:

- the exceptions to both rules;
- the corrections made during the work;
- the checks that were and were not performed.

## 2. Research log

| Time | Event | Record |
|---|---|---|
| 2026-10-19, 07:59–20:30 | Phase I: models, simulator, prop, reports | commits `3fea5e1` … `072b6a6` |
| 07:08 | Phase II directories created | file timestamps |
| 07:08–07:47 | **Stage A**: symbolic derivations, QI audit, energy, stability, chronology, framework drafts | `code/portal2/`, `code/derivations/` |
| 07:30 | Thin-shell and delayed-feedback first pass (53 s). The coarse optimisation put the PD boundary between $s\tau$ = 1.3 and 1.4; corrected later (§5, item 11) | session record |
| 07:32 | First parametric-drive PDE test (3 s) | session record |
| 07:33 | Parametric-drive scan: 5 profiles × 3 frequencies × 16 amplitudes, $T = 25$, fit for $t > 12$ (55 s) | `results/kapitza_scan.json` |
| 07:34 | Extended scan: 5 configurations × 14 amplitudes, $\Omega$ = 40–80 $s$, N = 6000–10 000 (2 min 6 s) | `results/kapitza_scan_extreme.json` |
| 07:36 | Refinement near the threshold: 3 configurations × 10 amplitudes, $T = 40$, two fit windows (3 min 7 s) | `results/kapitza_refine.json` |
| 07:42 | Resolution test at $a/a_K$ = 1.09 and 1.3: late growth 0.086 → 0.063 → 0.165 (N = 10 000 → 20 000 → CFL halved), so not converged (1 min 26 s) | session record; D3 E8 |
| 07:47 | **Stage A committed**, with ten predictions about the literature | commit `8109bcf`, [stage-A-record.md](../notes/stage-A-record.md) |
| ~07:48 | **Stage B**: four literature agents launched in parallel | session record |
| 08:09 | Pipeline, design search, framework, draft deliverables | commit `8c32833` |
| 08:16 | Phase I fact-check fixes, reference list, simulator tutorial | commit `42e4892` |
| 08:21 | D5 and D7 drafts | commit `89ee095` |
| 08:21–08:28 | Stage B notes completed (stability 08:21, topology 08:23, Penrose 08:25, QI and energy 08:28) | `notes/stageB-*.md` |
| 08:33 | Stage B notes committed | commit `1a38c25` |
| 08:42–08:44 | Code extended from stage B (window conventions, $b'(r_0) = 1$, charged wormholes); pipeline rerun (111 s); 45 tests pass | commit `aef4c8a` (08:48) |
| ~08:50 | Adversarial review agent launched (§7) | session record |
| 08:50–09:10 | D2 §10, D3–D7 updated; D1 and D8 written | later commits |

## 3. Executed and not executed

**Executed** (all in this session, with the library versions listed in D3):

| Computation | Result file | Tested |
|---|---|---|
| E1 smooth-throat QI bound; E1b $b'(r_0) = 1$ | `qi_results.json` | yes |
| E2 thin exotic region; E2b the two window conventions | `qi_results.json` | yes |
| E3 redshift structures and the 400-design search | `qi_results.json`, `design_search.json` | partly (the tidal module) |
| E4 energy bookkeeping and the ANEC identity | `energy_results.json` | yes |
| E5 Ellis instability, four methods | `stability_results.json` | yes |
| E6 thin shells; E7 delayed feedback | `stability_results.json` | yes |
| E8 parametric driving (single mode and PDE) | `stability_results.json`, `kapitza_*.json` | single mode only |
| E8b charged wormholes near extremality | `charged_results.json` | yes |
| E9 chronology network | `chronology_results.json` | yes |
| E10 framework and baseline audit | `feasibility.json`, `milestones.mmd`, `audit_ledger.json` | structure only |
| Symbolic perturbation derivation | `code/derivations/ellis_perturbations.py` | yes |

**Not executed**, though mentioned:

- **`run_phase2.py --full`** was never run as a whole. Its loop is the 07:33 command-line scan. An earlier
  draft of D3 gave it a runtime ("~8 min") that was never measured; corrected.
- **Proposed only** (D3, "Proposed but not executed"):
  - non-radial and nonlinear Ellis perturbations;
  - a converged Floquet analysis of the full operator;
  - a QI audit of non-spherical throats;
  - particle production on an index-2 Morse spacetime;
  - a recomputation of the charged modes;
  - a curved-space QI with controlled remainders.
- **Hypotheses H1–H8 are proposals.** No test plan in D5 has been run.

## 4. How independent was stage A?

- **What was separated.** Stage A was done and committed before the specific papers were consulted in this
  session, and its record lists ten predictions about what the literature would show. All ten were borne
  out (D2 §10.1).
- **What was not.** Stage A was **not** done in ignorance of the field:
  - Phase I's literature notes were in hand, and the baseline already quoted some numbers (the 0.846 e-folding
    time, Ford & Roman's band).
  - The model doing the work has training knowledge of much of this literature.
- **What "independent derivation" means here.** Derived from the field equations by our own route and our
  own code, not copied from a paper. It does not mean the result was unknown to the author.
- **Consequence.** The many reproductions are evidence that the derivations and code are right. They are
  not evidence of discovery.

## 5. Corrections made during phase II

Found by tests, by checks against closed forms, by the literature comparison, or by re-reading. None was
hidden; each is fixed in the files.

| # | What was wrong | How it was found | Fix |
|---|---|---|---|
| 1 | Sympy left a $\theta$-dependence in a curvature component | the derivation's own check | `trigsimp(expand_trig)` plus an assertion |
| 2 | The QI window fixed-point iteration oscillated | non-convergence | bisection |
| 3 | First QI version used only the curvature length | review of Ford & Roman's prescription | variation lengths $d/\gamma$ and $d_t$ added |
| 4 | Speeds lost precision at walking pace | inconsistent tidal impulses | `expm1`-based formula |
| 5 | Chebyshev method gave a spurious $s = 1.0$ | disagreement with the other methods | even basis in $z = x^2$ |
| 6 | Back-and-forth crossings flagged as time machines | a test case | separate external-edge matrix |
| 7 | A test expected $+2M/r^3$ for Schwarzschild | failed test | MTW sign: $-2M/r^3$ |
| 8 | Twin-paradox test tolerance too tight | failed test | relative $10^{-5}$ (trapezoid at a velocity jump) |
| 9 | Shell backticks blanked two link labels in report 07 | re-reading | fixed |
| 10 | Gao–Wald described as an ANEC theorem | literature check | it assumes the NEC and a genericity condition |
| 11 | Delayed-PD boundary first placed between 1.3 and 1.4 | refined optimisation with two starts | 1.414 ($\sqrt2$) |
| 12 | Parametric late instability first reported as a rate | resolution test | reported as unconverged |
| 13 | Stage A record: 0.34 Jupiter masses; band density 1.5×10⁶⁴ J/m³ | stage B arithmetic check | 0.355; 1.6×10⁶⁴ (the reports were right) |
| 14 | Stage A: the Ellis tail "grows as $r^4$" | later runs with the variation length | true only for the curvature-only window; with Ford & Roman's it saturates (D2 §5.7) |
| 15 | Quantum-interest delay from the 2D formula ($10^{-53}$ s) | stage B (Ford & Roman 1999) | 4D bound, $2\times10^{-24}$ s; Fewster & Teo 2000 |
| 16 | "Mouths are born together" stated as general | stage B (Horowitz et al. 2019) | restricted to Morse topology change; remote creation THEOREM → ROBUST |
| 17 | The index-2 route presented as possibly new | stage B | credited to Dowker & Surya 1998 and Dowker & Garcia 1998 |
| 18 | The Borde–Sorkin conjecture described as settled for index 2 | stage B | proven in one direction only |
| 19 | The thin band presented as the one open door | stage B (Krasnikov 2003) | door depends on the window convention |
| 20 | Rims restricted to straight edges "because curved loops may be inconsistent" | stage B | static circular rims are exact solutions (Gibbons & Volkov 2017) |
| 21 | H7 stated with the weak energy condition | stage B (Jaracz 2023) | dominant energy condition |
| 22 | `charged.py` searched a fixed interval; the throat sat on its edge at $Q_e/r_T$ = 0.9999 | an implausible jump in the table | search in $\sinh^{-1}(r/r_0)$; caught before any result was used |
| 23 | An edit script turned "\times" into a tab in one D2 line | control-character scan | fixed; edit scripts use raw strings since |
| 24 | `--full` runtime claim never measured (§3) | this audit | corrected in D3 and the code docstring |
| 25 | Literature placeholders ("stage B") left in the framework and ledger | re-reading | filled; a test now fails if any remain |
| 26 | The charged-throat redshift written as $4.5(1 - Q_e/r_T)^2$ | re-deriving the coefficient from the results | $\tfrac49(1 - Q_e/r_T)^2$; the $\gamma \approx 1.5/(1 - Q_e/r_T)$ that follows was right |

## 6. Checks performed, and checks not performed

**Performed.**

- 45 automated tests:
  - symbolic curvature against Schwarzschild, Ellis and Morris–Thorne;
  - boosted components against a full tensor transformation;
  - the QI theorem, analytic and numeric;
  - the $a^3$ law and the two windows;
  - energy closed forms;
  - four-method agreement on the Ellis rate;
  - thin-shell and delay boundaries;
  - chronology closed forms and a Roman ring;
  - charged closed forms and limits;
  - the framework's first blockers;
  - the absence of literature placeholders.
- Results regenerated from scratch by the pipeline after the last code change.
- The stage B literature comparison, with every source's access status recorded.
- An adversarial review of D2 and the new code by a separate AI agent (§7).

**Not performed.**

- Review by an independent human expert.
- Reading of several key sources in full: Morris & Thorne 1988, Visser 1995, Geroch 1967, Tipler 1977 and
  Frolov & Novikov 1990 were not accessed, and several others were read in part (see the notes).
- Replication on another machine, or with independent code.
- Any experiment.

## 7. Adversarial review

*Filled in after the review completes; see the next commit.*

## 8. Citation integrity

- **Where citations come from.** Every citation in D1–D7 comes from the stage B notes or the phase I
  reference list ([report 07](../../report/07-references.md)). No citation was invented.
- **How quotations were copied.** Quotations are copied from the notes, which copy them from extracted
  text, so typography (fractions, ligatures) can differ from the original.
- **Secondary only.** These are cited from abstracts or from later papers' descriptions, not from their
  full text: Geroch 1967, Tipler 1977, Frolov & Novikov 1990, Morris & Thorne 1988, Visser 1995, Unruh et al.
  1989, Geroch & Traschen 1987, Fewster & Teo 2000, Jaracz 2023 and Gibbons 1972. Statements about them are
  limited to what those sources support.
- **Recent preprints.** Weinbaum 2026 is an arXiv preprint (INSPIRE lists a journal reference, not checked).
  Blázquez-Salcedo et al. 2026 was read from the arXiv PDF.
- **Our arithmetic is marked.** Where a number in our text is our arithmetic on a published formula (for
  example "10⁴ solar masses per mouth" from Maldacena & Milekhin's eq. 2.5), the text says so.

## 9. Limitations of the process

- **AI throughout.** The literature search, the comparison and the adversarial review were done by AI agents.
  They can misread a paper or miss one. "Not found" is weak evidence.
- **Short duration.** Phase II took about two hours of wall-clock time. Depth was traded for breadth in
  places, which the "proposed but not executed" list records.
- **Method-dependent results.** The QI results inherit every assumption of the flat-space Ford–Roman method,
  and the thin-band result depends on a convention that is not settled (D2 §5.3).
