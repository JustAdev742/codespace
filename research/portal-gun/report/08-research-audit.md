# Project Portal: research audit and log

*Deliverable 8 of 8. What was actually done, how it was checked, what was corrected, what remains
uncertain, and where this study falls short of the brief.*

## 1. What was asked, and what was delivered

| Brief section | Delivered in | Status |
|---|---|---|
| §1 Portal lifecycle | Report 02, section 3 | Complete, with explicit models and numbers at each of 13 stages |
| §2 Theories | Report 02, section 2 | Complete: 14 subsections, each with proposal, equations, evidence, demonstrated, hypothetical, plausibility |
| §3 Reverse-engineering (A/B/C) | Report 02, section 4 | Complete: 27 canonical behaviours with evidence; interpretations; 10 required breakthroughs |
| §4 Mathematics (10-step method) | Appendix 03, part A | 13 worked calculations |
| §5 Computational models | Appendix 03, part B; `models/` | 9 modules, 70 tests, 12 figures |
| §6 Experiments | Report 02, section 5 | 7 experiments; the 2 computational ones were run, the 5 physical ones were designed only |
| §7A Prop tutorial | Tutorial 04; `prop/` | Firmware compiled and host-tested; enclosure generated and fit-checked; **not physically built** |
| §7B Simulator tutorial | Tutorial 05; `simulator/` | Built, tested, published |
| §7C Real-portal engineering study | Study 06 | Complete |
| §8 Failure modes and safety | Report 02, section 6 | Complete, split into demonstrated, model-dependent and speculative |
| §9 Verification pass and research log | This document | Complete |
| §11 Deliverables 1–8 | `report/01` … `report/08` | Complete |

## 2. How the work was done

1. **Literature.** Seven research agents worked in parallel, one per topic, each reading primary sources
   (arXiv and publisher PDFs, scanned papers rendered as images, standards, retailer pages, the show's wiki
   through its API) and recording for every source whether the full text, the abstract or only the
   bibliographic record was accessed. Their notes are in [`notes/`](notes/), unedited.
2. **Symbolic and numerical models,** written by me, in `models/portalphys/`, each tested against
   published results or closed-form solutions.
3. **The simulator,** built and tested in Node and in headless Chromium, then published as an artifact.
4. **The prop:** firmware with a hardware-independent core, host tests, a compile for the real board, and a
   parametric enclosure with fit tests.
5. **Writing,** from the notes and the model outputs.
6. **Verification** (section 4), including two independent fact-checking passes by fresh agents that had
   not written any of the material.

## 3. Research log

Built from timestamps that the container recorded (session transcript, file modification times and git
commits, all UTC, 2026-10-19 unless stated), not reconstructed from memory.

| Time | Event | Evidence |
|---|---|---|
| 07:17 | Brief received | Session transcript |
| 07:24–07:30 | Workspace and Python environment created; three.js 0.186.1 package fetched for API inspection | Directory times |
| ~07:30–08:08 | Seven literature agents at work; notes completed between 07:55 and 08:08 | Note file times |
| 07:59 | Physics models, symbolic GR checks, tests and figures committed | Commit `3fea5e1` |
| 08:32 | Simulator with unit and browser tests committed | Commit `8f3e92f` |
| 08:44 | Prop firmware, host tests and enclosure committed | Commit `52187b9` |
| 08:49–08:55 | Figures regenerated; browser checks re-run (14/14) | File times; `browser-results.json` |
| 08:57 | Grid-convergence check of the Newtonian model | `results/grid_convergence.log` |
| ~09:00–09:40 | Report written; half-pressure bug found and fixed; firmware recompiled; DOIs resolved against Crossref; fact-check passes | File times; commits `91b8081`, `afb784a` |
| ~09:40–20:18 | Session paused (usage limit reached) | Session transcript |
| 20:18–20:30 | Resumed: firmware no-flash rework, stricter Python tests, prop tutorial rewritten, figures and browser checks re-run | Commit `072b6a6` |
| 2026-10-20 07:08–09:45 | Phase II (separate audit: [phase2/report/D8](../phase2/report/D8-integrity-audit.md)), including its literature comparison and an adversarial review; in parallel, the remaining fact-check fixes to reports 01, 02, 03 and 05, and this reference list | Commits from `8109bcf` on |

**About the time spent.** The brief asked for research at a depth of 5–15 hours. Measured by the clock, the
first pass took about two and a half hours of wall-clock time, with up to seven agents working in parallel
during the literature phase, and the corrections after the fact-check about another hour across the two
days. I make no claim to have spent 5–15 hours. Whether the depth is adequate should
be judged from the content: the notes record over a hundred sources with their access status, and every
quantitative claim in the report traces to a source or to tested code.

## 4. Verification

### 4.1 What was checked, and how

| Check | Method | Result |
|---|---|---|
| Python models | `python -m pytest -q tests` | 70 passed |
| Simulator logic | `npm test` | 19 passed |
| Simulator end to end | `npm run test:browser` (headless Chromium, software WebGL) | 14 of 14 passed |
| Firmware logic | `make` in `prop/firmware/test` | 170 passed, 0 failed (including 17 lighting sessions checked for flashing) |
| Firmware build | `arduino-cli compile --fqbn rp2040:rp2040:adafruit_feather_prop_maker --warnings all --clean` | Builds; 96,516 bytes flash, 11,180 bytes RAM; 0 warnings from the project's own files (library headers produce some); see `prop/firmware/build-report.txt` |
| Enclosure | `python -m pytest -q` in `prop/enclosure` | 7 passed |
| Newtonian model convergence | Three grids and three paddings (`models/checks/grid_convergence.py`) | First-order convergence; mid-room field −0.415, −0.407, −0.403 g; padding effect < 0.2% |
| DOIs | Every DOI in the notes resolved against the Crossref API; then each entry of [07-references.md](07-references.md) with a DOI compared with Crossref's year, volume and first page | All 128 resolve. Of 125 entries compared: 121 match, 2 false alarms (zero-padded article numbers), 2 corrected (see 4.2, item 11) |
| Documents against sources | Two independent fact-checking agents, one for the physics documents (01, 02, 03, 06) and one for the tutorials (04, 05), checking quotes, numbers, access status and code behaviour | Results and fixes in section 4.2 |
| Numbers in the documents | Every headline number re-computed from the models (`summary.json`) while writing the appendix | Two errors found (4.2, items 1 and 2) |

### 4.2 Errors found and corrected during this study

1. **Blow-down times overstated by 5–10%** (my code). Fixed and tested; see appendix B.4.
2. **Experiment table overstated a browser check.** A draft said the energy-conserving ball's *maximum*
   speed was 7.7 m/s; the browser check records a snapshot at 5 s. The unit test is what checks the maximum.
   The report now says which is which.
3. **Sign convention in Morris–Thorne's eq. 47a** (my reading). Caught by comparing with the scanned page;
   the code now checks exact equality with the printed equation.
4. **Casimir plate gap differs from Morris–Thorne–Yurtsever by $3^{1/4}$.** Not an error on either side: they
   match the plates' tension, I matched the energy density. Both are now stated.
5. **The Morris–Thorne appendix speed limit** (60 m/s for a 10 m throat) uses their rounded tidal bound; with
   the exact bound it is 44 m/s. Both are reported.
6. **Count errors in drafts** (number of experiments; number of subsystems in each class) were corrected.
7. **Physics fact-check (reports 01, 02, 03, 06): 22 findings.** Among them:
   - an overclaim that the Casimir effect is "lab-confirmed negative energy" (its forces are measured; the
     negative energy density is inferred);
   - theorem scopes stated too broadly: global hyperbolicity for the causal-structure argument;
     Tipler's and Borde's extra assumptions; the classes of theories in the ANEC proofs; the class of
     ghost-scalar wormholes studied by Gonzalez, Guzmán and Sarbach;
   - a misattributed quote (Fewster, Olum and Pfenning only), and the Morris–Thorne–Yurtsever Casimir figure
     (printed ~10⁻¹⁰ cm, their formula 1.6×10⁻¹⁰ cm);
   - "months" for the chronology drift (it is days to millennia), and wrong values for the water-wave
     blocking current (0.16 m/s) and the mid-room field (0.41 g);
   - wrong wording or numbers in several tables.

   Fixed in 01, 02 and 03. Report 06 is kept as the audited baseline, with its corrections in
   [phase2/report/D7](../phase2/report/D7-corrected-baseline.md).
8. **Tutorial fact-check (04, 05): 34 findings.** The serious one was in the prop firmware: "Steady" mode
   could still flash (sequences up to 12 s), and the whole-ring flash limit was not enforced. The firmware was
   reworked, so Steady cannot flash and Show is held to 3 flashes per second in sequences under 5 s. 170 host
   checks now count flashes per pixel, per ring and over all pixels. Also fixed:
   - a battery-gauge pin that floated when unwired (now opt-in);
   - the lock chime;
   - enclosure side labels;
   - in the simulator tutorial: the meaning of the V key and of "obstructed", disclosure that the browser
     checks run with air drag on, the sub-stepping description, the player's collision shape, the
     render-pass counts, and the Playwright install step;
   - the portal swirl, softened to four low-contrast bands.

   Tutorial 04 was rewritten; 05 corrected.
9. **Tests that could not fail.** 44 relative-tolerance comparisons were vacuous for tiny quantities because
   of pytest's default absolute tolerance. Fixed with `abs=0`; all pass.
10. **Round-off in the velocity time-dilation rate** at everyday speeds (appendix B.4, item 6).
11. **Bibliography.** One recorded DOI (Friedman & Higuchi 2006) pointed to a different article in the same
    issue; one entry (Zhang et al. 2023) lacked its title, year and volume. Both corrected from Crossref.


### 4.3 Corrections to claims commonly made about the sources

The literature notes found these, and the report follows the corrected versions:

- The Casimir plate-separation estimate for a wormhole is in Morris, Thorne and Yurtsever (PRL 1988), not in
  Morris and Thorne (AJP 1988), which only has a note pointing to it.
- MTY print the Planck length as $1.3\times10^{-33}$ cm; the correct value is $1.6\times10^{-33}$ cm.
- MT88's reference to Kruskal prints Phys. Rev. 116, 1743; the correct volume is 119.
- Shinkai and Hayward cite Ellis's paper at page 395; it starts on page 104.
- Butcher's 2015 no-go theorem is Phys. Rev. D 91, 124031.
- Maldacena, Milekhin and Popov was published in Class. Quantum Grav. 40, 155016 (2023); Maldacena and Qi
  (2018) has no journal publication.
- Tipler's 1976 PRL is about the formation of closed timelike curves, not topology change.
- "Crystal ball" does not appear in James et al. (2015).
- Friedman, Schleich and Witt's abstract says "null energy condition", but the theorem assumes the averaged
  condition.
- Fewster's 2012 lecture notes print a Casimir coefficient as $\pi^2/1140$; it is almost certainly $\pi^2/1440$.
- The 5% agreement claimed by Lamoreaux (1997) was later corrected and is disputed.
- The 2022 quantum-processor paper's supplement describes the model as both $N = 7$ and $N = 5$; a 2025
  author correction changed a figure caption.
- Earlier claims that the massless Ellis wormhole is stable (Armendariz-Picon 2002, repeated by Nandi et al.
  2006) were superseded by Gonzalez, Guzmán and Sarbach (2009).

## 5. Limitations

- **Access.** Several key papers were read only as abstracts, because they are paywalled and no legitimate
  free copy was found: Einstein and Rosen (1935), Fuller and Wheeler (1962), Ellis (1973), Geroch (1967),
  Tipler (1977), Frolov and Novikov (1990), the Nature main text of Jafferis et al. (2022), and others listed
  in the references with their status. Bronnikov (1973) and Brown and Maclay (1969) could not be accessed at
  all; their content comes from secondary sources that were read in full. Visser's 1995 monograph was not
  read.
- **Canon.** Episodes were not watched. The canon comes from fan transcripts, wiki summaries, about 40 frame
  grabs, journalism and interviews, with the confidence of each claim recorded.
- **Hardware.** The prop has not been built, printed, powered or measured. The compile and host tests check
  the logic, not the electronics.
- **Physical experiments.** The five physical experiments were designed but not performed; their "expected"
  results are predictions.
- **Simulator.** Tested only in software WebGL in a headless browser; real-device performance is unmeasured.
- **Prices** are a snapshot from 2026-10-19 and will change.
- **Models** are idealisations: static or spherical symmetry, weak fields where stated, free quantum fields
  for the quantum inequalities, a static Newtonian field for the floor/ceiling pair.
- **Review.** No external expert has reviewed this work. The fact-checking passes were done by AI agents
  working from the same notes, so they catch transcription and consistency errors, not shared
  misunderstandings of the physics.

## 6. What remains uncertain

1. **Which gravitational configuration a real portal pair would adopt** (report section 3.10): the
   single-valued static field of my model, or the "non-potential" field of Frolov–Novikov type that drifts
   into a time machine. My identification of the game's infinite fall with the time-machine drift is my own
   argument, not a published result.
2. **Mass, charge and momentum bookkeeping** for traversal in 3+1 dimensions: supported only by a heuristic
   (Susskind 2005) and disputed (Gratus et al. 2019).
3. **Quantum inequalities in curved spacetime and for interacting fields:** proven only in special cases.
4. **Topology change in quantum gravity:** no settled theory.
5. **Stability with other matter models,** and the dynamics of Visser's flat-face rims.
6. **Chronology protection:** a conjecture; semiclassical physics cannot settle it.

## 7. How to check this work yourself

```bash
cd research/portal-gun
python3 -m venv .venv && . .venv/bin/activate && pip install -r requirements.txt
(cd models && python -m pytest -q tests && python run_all.py && python checks/grid_convergence.py)
(cd simulator && npm install && npm test && npm run test:browser)
(cd prop/firmware/test && make)
(cd prop/enclosure && python make_enclosure.py && python -m pytest -q)
```

The firmware compile needs arduino-cli and the board package and libraries listed in tutorial 04.
