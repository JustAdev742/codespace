# 04 — What can actually be tested or demonstrated today

Research notes for the "portal gun physics" report. Scope: real experiments, laboratory analogues and demonstrations relevant to portal and wormhole physics, kept separate from illusions and telepresence that only look like portals.

Compiled 2026-10-19. Every number below was read in the source named, unless the entry says otherwise. Anything marked **[my calculation]** is arithmetic I did from verified inputs; it is not a quote. Quotes are verbatim, under 25 words, and in quotation marks.

**Access-status legend**
- **full text read**: I read the article text (publisher PDF, author-hosted PDF, or arXiv preprint; the version is stated).
- **abstract only**: I read only the abstract or a landing page.
- **bibliographic only**: I confirmed only that the work exists, and its citation details. Any content comes from secondary sources, which are named.

---

## 0. Classification at a glance

| Category | What it really is | Examples below | Does it connect two regions of spacetime? |
|---|---|---|---|
| A. Real spacetime effects, measured | Gravitational time dilation and redshift in Earth's field | Pound–Rebka, Hafele–Keating, Chou 2010, Takamoto 2020, Bothwell 2022 | No. They measure ordinary curved-spacetime effects. |
| B. Field-routing devices (metamaterials) | Materials whose ε/μ steer EM or magnetic fields as if space had a handle or tunnel | Greenleaf 2007 (theory), Prat-Camps 2015 (built, DC magnetic only), Pendry/Leonhardt/Schurig 2006 (cloaking) | No. The "topology change" applies only to how one field propagates in a medium. |
| C. Analogue gravity | Waves in a moving medium obey an effective metric (kinematics only) | Unruh 1981, Steinhauer 2016, Muñoz de Nova 2019, Euvé & Rousseaux 2017 (water-wave "wormhole") | No. The underlying spacetime is ordinary; Einstein's equations are not obeyed. |
| D. Vacuum-energy experiments | Casimir force; dynamical Casimir photon creation | Lamoreaux 1997, Mohideen & Roy 1998, Bressi 2002, Wilson 2011 | No. Relevant only because traversable wormholes need negative energy. |
| E. Quantum-state transfer | Teleportation of a quantum state, which needs a classical channel | Bennett 1993, Bouwmeester 1997, Ren 2017; Jafferis 2022 (holographic "wormhole" circuit) | No. No matter moves and nothing travels faster than light. |
| F. Illusions and telepresence | Camera, network and screen; reflections; head-tracked rendering | Vilnius–Lublin Portal 2021, NYC–Dublin 2024, Pepper's ghost, infinity mirror, Johnny Lee 2007, Project Starline | No. These are images only. |
| G. Astronomical searches | Lensing, shadow and orbit signatures of hypothetical natural wormholes | Cramer 1995, Torres 1998, Safonova 2002, Abe 2010, Takahashi & Asada 2013, EHT 2022, Dai & Stojkovic 2019, Bambi & Stojkovic 2021 | Unknown. So far the searches give upper limits or rule out specific models; there are no detections. |

---

## 1. Metamaterial and transformation-optics "wormholes"

### 1.1 Greenleaf, Kurylev, Lassas & Uhlmann (2007): electromagnetic wormholes (theory)
- **Citation:** A. Greenleaf, Y. Kurylev, M. Lassas, G. Uhlmann, "Electromagnetic wormholes and virtual magnetic monopoles from metamaterials," *Phys. Rev. Lett.* **99**, 183901 (2007). The arXiv title omits "from metamaterials".
- **DOI / arXiv:** 10.1103/PhysRevLett.99.183901 · arXiv:math-ph/0703059 (v1, 20 Mar 2007)
- **Access status:** full text read (arXiv v1, 4 pp.). The published PRL version was not accessed and may differ slightly.
- **What was done:** A purely mathematical and theoretical design, with ray-tracing simulations (Fig. 2). It specifies permittivity ε and permeability μ (singular, obtained by "blowing up" a curve through a singular coordinate map) for a coating around a tube-shaped obstacle. At the design frequency, EM waves propagate as if ℝ³ had a handlebody (S² × [0,1]) attached. The design also needs a "soft-and-hard" boundary condition on the obstacle surface. Nothing was built.
- **Key quotes (verbatim):**
  - "Such devices function as wormholes with respect to Maxwell's equations and effectively change the topology of space vis-a-vis EM wave propagation." (abstract, 21 words)
  - The paper's own definition: the concept "is familiar from cosmology", but "here we define a wormhole as an object obtained by stretching and gluing together pieces of Euclidian space."
  - "A wormhole device functions as an invisible optical tunnel or cable."
  - "At a noncloaking frequency, the resulting construction appears (roughly) as a solid cylinder with flared ends"
- **Frequency limitation:** The authors say the effect "should be considered as essentially monochromatic, or at least narrow-band" with current technology, because metamaterials are dispersive.
- **What it demonstrates for portal physics:** The mathematics of transformation optics can make light behave as if space had a tunnel between two openings, while the tunnel stays invisible from outside. It is a useful visual and optical model of a portal mouth. A magnetic dipole near one end would look like a monopole from outside.
- **What it does NOT demonstrate:** No spacetime curvature, no gravitational effect, no transport of matter. It works only for EM waves at the design frequency, and the device has an ordinary physical body (a "solid cylinder with flared ends"). It was never built as specified.

### 1.2 Prat-Camps, Navau & Sanchez (2015): a magnetostatic "wormhole" that was actually built
- **Citation:** J. Prat-Camps, C. Navau, A. Sanchez, "A magnetic wormhole," *Sci. Rep.* **5**, 12488 (2015), published 20 Aug 2015. Universitat Autònoma de Barcelona.
- **DOI / stable URL:** 10.1038/srep12488 · PMC4542659 (https://pmc.ncbi.nlm.nih.gov/articles/PMC4542659). Supplementary Information: https://static-content.springer.com/esm/art%3A10.1038%2Fsrep12488/MediaObjects/41598_2015_BFsrep12488_MOESM1_ESM.pdf
- **Access status:** full text read (PMC main text and the Supplementary Information PDF with the Methods).
- **What was built (Supplementary Methods; all numbers verbatim from the SI):**
  - **Inner "magnetic hose":** mu-metal foil 0.2 mm thick, folded into a spiral of 8 turns separated by cardboard. Length 87 mm, exterior diameter 12 mm.
  - **Superconducting (SC) shell:** type-II SC strip 12 mm wide (SuperPower SF12050) on a 3D-printed PLA former of 79 mm external diameter, with 8 openings for liquid nitrogen and two traversing holes of radius 8 mm. Layup: 8 meridian strips, then 8 shorter strips, then 16 shorter pieces, fixed with small welding points.
  - **External ferromagnetic (FM) metasurface:** 155 pieces of 0.2 mm mu-metal in 6 different shapes, placed at a radial distance of 43 mm from the centre. The device is therefore roughly 86 mm across **[my calculation: 2 × 43 mm]**.
  - **Test rig:** Helmholtz coils of radius 150 mm separated by 150 mm. Source coil about 5 mm radius and 10 mm long, with a 2 mm gap to the wormhole end. Two Hall probes: "T" measured the transmitted field and "C" measured distortion. The SC and full-device runs were done with the device and probes submerged in liquid nitrogen. The paper says "liquid nitrogen", not a number in kelvin.
- **What was measured:** Field-distortion scans (reported in detail at z = 5 mm) for three cases: the SC shell alone, the FM shell alone, and the complete device. Only the complete device showed negligible distortion of the applied field. The transmitted field decayed roughly as 1/d^1.5, compared with 1/d³ for a dipole. The authors attribute this to the exit looking like a disk of monopoles. The paper gives no single "fraction of field transferred" figure.
- **Key quotes (verbatim):**
  - "Here we construct and experimentally demonstrate a magnetostatic wormhole." (abstract)
  - "the magnetic field from a source at one end of the wormhole appears at the other end as an isolated magnetic monopolar field" (abstract)
  - "Our magnetic wormhole thus creates an illusion of a magnetic field coming out of nowhere"
  - "our results have been experimentally confirmed only for dc fields"
  - "Both ends of the wormhole have been considered only in an approximate way"
- **What it transfers:** A **static (DC) magnetic field** from one end of an 87 mm tube to the other, while the sphere as a whole causes almost no measurable distortion of the applied field. This was tested with a uniform field (both Helmholtz coils) and a non-uniform field (one coil); the SI also gives an analytic solution for an external dipole.
- **What it does NOT demonstrate:** No light, no matter and no spacetime connection pass through. The device is a solid object you could hold, and it needs a cryogenic superconductor. The authors frame it as a magnetic illusion with possible MRI uses. They do not claim any spacetime effect.

### 1.3 Pendry, Schurig & Smith (2006): the transformation-optics design method
- **Citation:** J. B. Pendry, D. Schurig, D. R. Smith, "Controlling electromagnetic fields," *Science* **312**, 1780–1782 (2006).
- **DOI / URL:** 10.1126/science.1125907 · author-hosted copy: https://my.ece.utah.edu/~dschurig/Site/Recognition_files/1780.pdf
- **Access status:** full text read (scan of the published article).
- **What was done:** Theory and ray-tracing. A coordinate transformation is mapped onto ε and μ so that D, B and the Poynting vector are displaced "in a consistent manner". The worked example is a spherical cloak (R1 < r < R2) that excludes all fields from the inner region.
- **Key quotes (verbatim):**
  - "we show how electromagnetic fields can be redirected at will and propose a design strategy." (abstract)
  - "the cloaking parameters must disperse with frequency and therefore can only be fully effective at a single frequency."
- **Portal relevance:** This is the general recipe behind any metamaterial "portal" or "wormhole" (Greenleaf et al. use the same push-forward idea). Its hard limit is single-frequency operation, unless the device is embedded in a high-index medium (the authors note dispersion "may in principle be avoided" that way).
- **Does NOT:** It does not curve spacetime. The "transformation" is in the material parameters only.

### 1.4 Leonhardt (2006): optical conformal mapping
- **Citation:** U. Leonhardt, "Optical conformal mapping," *Science* **312**, 1777–1780 (2006). Preprint title: "Optical Conformal Mapping and Dielectric Invisibility Devices."
- **DOI / arXiv:** 10.1126/science.1126493 · arXiv:physics/0602092
- **Access status:** abstract only (arXiv), plus the final page of the published article, which appears in the same PDF as Pendry et al. at the Utah URL above. The body of the article was not read.
- **Key quotes (verbatim):**
  - "Ideal invisibility devices are impossible due to the wave nature of light." (arXiv abstract)
  - "perfect invisibility within the accuracy of geometrical optics" (arXiv abstract)
  - "One can never completely hide from waves, but can from rays." (published text, p. 1780)
- **Portal relevance:** Wave optics limits any optical "invisible tunnel" (reflections and time delays remain), although the imperfections can be made exponentially small for objects much larger than the wavelength.

### 1.5 Schurig et al. (2006): the first built metamaterial cloak (included for "what can be demonstrated")
- **Citation:** D. Schurig, J. J. Mock, B. J. Justice, S. A. Cummer, J. B. Pendry, A. F. Starr, D. R. Smith, "Metamaterial electromagnetic cloak at microwave frequencies," *Science* **314**, 977–980 (2006).
- **DOI / URL:** 10.1126/science.1133628 · https://my.ece.utah.edu/~dschurig/Site/Top_Cited_Publications_files/977.pdf
- **Access status:** full text read (scan of the published article).
- **What was done and measured:** A **two-dimensional** cloak of split-ring resonators in 10 concentric cylinders, with inner radius a = 27.1 mm and outer radius b = 58.9 mm, around a copper cylinder. It was designed for 8.5 GHz, and the measured optimum was "8.5 GHz, in near-exact agreement with the design target". The fields were mapped inside a parallel-plate waveguide with aluminium plates spaced 11 mm apart; the cloak was about 10 mm tall. Backscatter and shadow were reduced but not eliminated. Quote: the cloak works "over a narrow frequency band" (abstract).
- **Portal relevance:** This is roughly the state of the art that Greenleaf et al. pointed to for a physical approximation: centimetre-scale, 2D, one microwave band, and imperfect.

### 1.6 Zhu, Liu, Liang, Chen & Li (2018): elastic-wave wormhole analogue
- **Citation:** J. Zhu, Y. Liu, Z. Liang, T. Chen, J. Li, "Elastic waves in curved space: mimicking a wormhole," *Phys. Rev. Lett.* **121**, 234301 (2018).
- **DOI:** 10.1103/PhysRevLett.121.234301
- **Access status:** abstract only (HKUST research portal). I found no arXiv preprint.
- **Content (from the abstract):** Flexural waves on a geometrically curved plate replace the extreme refractive indices that a transformation-optics wormhole would need. The abstract says the authors "demonstrate a two-dimensional analog of a wormhole using homogeneous materials within a curved laboratory frame" and study geodesics, wave redirection, tunnelling and virtual caustics.
- **Caveat:** I could not confirm from the abstract what was physically fabricated or measured. Do not cite numbers from this paper.

**Search note for §1:** Searches for other fabricated wormhole devices (electric, thermal, acoustic, or Maxwell-wave) found nothing besides Prat-Camps et al. (magnetostatic) and the elastic analogue above. This was not an exhaustive literature review.

---

## 2. Analogue gravity

### 2.1 Barceló, Liberati & Visser: "Analogue Gravity" (Living Reviews in Relativity)
- **Citations:**
  - 2005: C. Barceló, S. Liberati, M. Visser, "Analogue Gravity," *Living Rev. Relativ.* **8**, 12 (2005). DOI 10.12942/lrr-2005-12. Accepted 7 Nov 2005, published 16 Dec 2005, 434 references.
  - 2011 update: *Living Rev. Relativ.* **14**, 3 (2011). DOI 10.12942/lrr-2011-3. Accepted 28 Feb 2011, published 11 May 2011, references increased to 702, with a new Section 6.
  - arXiv: gr-qc/0505065. The current **v4 (29 Nov 2024)** is a "Major revision, updated and expanded" and says it "is a revised version of https://doi.org/10.12942/lrr-2011-3."
- **Access status:** 2011: landing page and abstract (EMIS mirror, https://www.maths.tcd.ie/EMIS/journals/LRG/Articles/lrr-2011-3/). 2005: bibliographic only. **arXiv v4 (2024): full text searched and relevant passages read.** Quotes below are from v4 and may not appear word for word in the 2005 or 2011 versions.
- **Key content and quotes (v4, verbatim):**
  - What analogues capture: "the kinematic features that have to do with how fields (classical or quantum) are defined on curved spacetime"
  - Analogue Hawking and cosmological experiments: "these are purely kinematic experiments that do not probe the dynamics of the effective spacetime."
  - BEC caveat: "the BEC does not fulfil, at any regime, the Einstein equations."
  - Wormhole entries in the review's literature survey: "analogue wormholes were explored in Peloquin et al. (2016)", "A hydrodynamic wormhole was explored in Euvé and Rousseaux (2017)", "Acoustic wormholes were the subject of Jusufi and Övgün (2017)", "Analogue wormholes appeared in Churilov and Stepanyants (2021)", and Sabín (2020), "Entangling superconducting qubits through an analogue wormhole". Of these, Euvé & Rousseaux (2017) is the only one I verified as an experiment (see §2.5). Peloquin et al. (2016) is numerical (§2.6). I did not check the others individually.
- **Portal relevance:** This is the authoritative statement that analogue systems reproduce how waves move on a given effective geometry. They do not reproduce how geometry responds to matter, so they cannot test whether a wormhole can be created or held open.

### 2.2 Unruh (1981): the founding proposal
- **Citation:** W. G. Unruh, "Experimental black-hole evaporation?" *Phys. Rev. Lett.* **46**, 1351–1353 (1981), published 25 May 1981.
- **DOI / URL:** 10.1103/PhysRevLett.46.1351 · scan: https://personal.lse.ac.uk/robert49/teaching/partiii/2020-2021/pdf/Unruh1981a.pdf
- **Access status:** full text read (OCR scan; the exponent in the temperature estimate is garbled in the OCR).
- **Content:** Sound in a transsonic, convergent flow sees an effective metric with a sonic horizon, and should emit a thermal phonon spectrum. Abstract (verbatim): "a thermal spectrum of sound waves should be given out from the sonic horizon in transsonic fluid flow."
- **Number:** T ≈ 3 × 10⁻⁷ K × [c/(300 m/s)] × [1 mm/R]. The OCR shows "3x10 'K", so the exponent is illegible. The value 3 × 10⁻⁷ K matches the standard restatement, and T = ħ/(2πk_B)·(∂v/∂r) with ∂v/∂r = (300 m/s)/(1 mm) gives ≈ 3.6 × 10⁻⁷ K **[my calculation]**. Unruh called it "a rather low temperature, and is probably undetectable in the presence of turbulent instabilities".

### 2.3 Steinhauer (2016): spontaneous analogue Hawking radiation and entanglement
- **Citation:** J. Steinhauer, "Observation of quantum Hawking radiation and its entanglement in an analogue black hole," *Nature Phys.* **12**, 959 (2016).
- **DOI / arXiv:** 10.1038/nphys3863 · arXiv:1510.00621 (v3, 8 Aug 2017)
- **Access status:** full text read (arXiv v3).
- **What was done and measured:** A ⁸⁷Rb Bose–Einstein condensate in a narrow laser beam (3.6 µm waist, 812 nm; radial trap frequency 140 Hz). A sharp potential step (0.442 µm light) is swept at 0.18 mm s⁻¹. Outside the horizon v_out = 0.24 mm/s < c_out = 0.57 mm/s; inside v_in = 1.02 mm/s > c_in = 0.25 mm/s. Density–density correlations were computed from **4600 repetitions** of the experiment, "requiring 6 days of continuous measurement". Hawking temperature from the population: **1.2 nK**, below the measured 2.7 nK upper limit for quantum entanglement. High-energy pairs were entangled and low-energy pairs were not.
- **Quote (verbatim):** "We observe spontaneous Hawking radiation, stimulated by quantum vacuum fluctuations, emanating from an analogue black hole in an atomic Bose-Einstein condensate." (abstract, 20 words)
- **Does NOT:** It involves no gravity. The horizon is for phonons in a cloud a few micrometres wide.

### 2.4 Muñoz de Nova, Golubkov, Kolobov & Steinhauer (2019): thermality at the Hawking temperature
- **Citation:** J. R. Muñoz de Nova, K. Golubkov, V. I. Kolobov, J. Steinhauer, "Observation of thermal Hawking radiation and its temperature in an analogue black hole," *Nature* **569**, 688–691 (2019).
- **DOI / arXiv:** 10.1038/s41586-019-1241-0 · arXiv:1809.00913 (v2, 14 Sep 2018, titled "Observation of thermal Hawking radiation at the Hawking temperature in an analogue black hole")
- **Access status:** full text read (**arXiv v2 preprint**). The published Nature version was not accessed; its numbers may differ (see the caveat).
- **What was measured (preprint):** BEC of **8000 ⁸⁷Rb atoms** (812 nm beam, 3.9 µm waist, 130 Hz transverse trap frequency; 442 nm "waterfall" step). **7400 runs.** Predicted Hawking temperature from the measured surface gravity: **0.35 nK**. The correlation spectrum agreed with the thermal spectrum at that temperature. Fitted c_out = 0.52 mm/s, v_out = 0.23 mm/s, c_in = 0.31 mm/s, v_in = 0.90 mm/s.
- **Quote (verbatim, preprint abstract):** the spectrum was found "to be thermal at the Hawking temperature implied by the analogue surface gravity."
- **Caveats:** (1) Phys.org (May 2019) gives the temperature as "0.035 billionths of a kelvin", which conflicts with the preprint's 0.35 nK. I have not resolved this against the Nature text, so use the preprint figure with that attribution. (2) I could not verify a frequently repeated "97,000 repetitions / 124 days" figure for the Nature version, so do not use it. (3) Physics World notes that some physicists disagree about how far the experiment validates the assumptions behind Hawking's prediction.

### 2.5 Euvé & Rousseaux (2017): the only experimental analogue *wormhole* I found
- **Citation:** L.-P. Euvé, G. Rousseaux, "Classical analogue of an interstellar travel through a hydrodynamic wormhole," *Phys. Rev. D* **96**, 064042 (2017), published 25 Sep 2017. Institut Pprime, Poitiers.
- **DOI / URL:** 10.1103/PhysRevD.96.064042 · author copy: https://germain-rousseaux.cnrs.fr/wp-content/uploads/2020/05/PRD2017.pdf
- **Access status:** full text read (author-hosted copy of the published article, 15 pp.).
- **What was done and measured:** A water channel 6.5 m × 0.39 m × 0.6 m (L × W × H) with an obstacle 1.55 m long and 0.106 m high (Vancouver geometry). Flow rate 8.13 L s⁻¹, depth 205 mm, surface velocities 0.102–0.203 m s⁻¹. Incident waves had period T_I = 0.443 s and amplitude a₀ = 11.53 µm, against a countercurrent. Laser-induced fluorescence imaging used 3 cameras (2048 × 2048 px) over a field of about 1.1 m at 0.219 mm/pixel, with sub-pixel detection of amplitudes below 0.1 µm, recorded for about 2 hours (2¹⁷ images at 18.02 Hz). Long gravity waves blocked at an analogue white-hole horizon converted into short capillary waves (capillary wavelength ≈ 1.7 cm), which crossed the "tunnel" region and emerged on the other side. That is the analogue "wormhole travel".
- **Key quotes (verbatim):**
  - "Here we show experimentally that analogue traversable and bidirectional wormholes exist in hydrodynamics following a suggestion by Wheeler." (abstract, 17 words)
  - "Whereas our results do not apply to putative astrophysical wormholes per se" (abstract)
  - "this is the first experiment in the field of analogue gravity to demonstrate the existence of an analogue wormhole travel" (prefaced in the paper by "To the best of our knowledge")
  - On stability: "One can simply argue that Navier-Stokes equations are different from Einstein's equations"
- **What it demonstrates:** In a 1+1-dimensional effective metric, wave packets can pass between two analogue horizons through a region controlled by small-scale dispersion. It is a kinematic analogy for horizon-to-horizon traversal.
- **Does NOT:** No spacetime connection. The "wormhole" is a stretch of moving water above a bump, the travellers are surface ripples of micrometre amplitude, and there is no exotic matter. The authors note that the analogue metric is exact only without dispersion, yet their effect relies on dispersion.

### 2.6 Peloquin, Euvé, Philbin & Rousseaux (2016): numerical precursor
- **Citation:** C. Peloquin, L.-P. Euvé, T. Philbin, G. Rousseaux, "Analog wormholes and black hole laser effects in hydrodynamics," *Phys. Rev. D* **93**, 084032 (2016). arXiv:1512.03386. DOI 10.1103/PhysRevD.93.084032.
- **Access status:** abstract only (arXiv and Exeter repository, via search).
- **Content:** A numerical study of water waves against a varying current with surface tension. Some velocity profiles give traversable, bidirectional analogue wormholes. Negative energy can be trapped between six horizons, forming a "laser-like cavity".

### 2.7 Sabín (2018): optical analogue wormhole (proposal only)
- **Citation:** C. Sabín, "Light propagation through nanophotonics wormholes," *Universe* **4**, 137 (2018). arXiv:1807.07869. DOI 10.3390/universe4120137.
- **Access status:** abstract only.
- **Content:** Proposes a 3D nanophotonic structure shaped like a wormhole spacetime and predicts phase and group-velocity changes. Quote: "This experiment can be realized with state-of-the-art nanophotonics technology." It is a **proposal; no experiment is reported**.

**Search note for §2 (optical analogues):** I found **no experimental optical analogue wormhole**, only proposals: Sabín 2018, and Sabín's superconducting-qubit proposal cited in the 2024 review. The hydrodynamic experiment (§2.5) is the only lab "analogue wormhole" experiment I could verify.

---

## 3. Gravitational time dilation at small height differences

Why it matters for portals: if two portal mouths sat at different heights in Earth's gravity and stayed "connected", the clocks at the two mouths would drift apart at the fractional rate gh/c². Frolov & Novikov (1990) pointed out that a static wormhole whose mouths sit at different gravitational potentials can turn into a time machine (see §11). The experiments below are the real, measured version of the gh/c² rate.

### 3.1 Pound & Rebka (1960): first terrestrial gravitational redshift
- **Citation:** R. V. Pound, G. A. Rebka Jr., "Apparent weight of photons," *Phys. Rev. Lett.* **4**, 337–341 (1960), 1 April 1960.
- **DOI:** 10.1103/PhysRevLett.4.337
- **Access status:** **bibliographic only** for the PRL. APS returned 403 and the Temple University PDF copy returned 503 or failed TLS. Supporting sources:
  - **Pound's own review, full text read:** R. V. Pound, "On the weight of photons," *Sov. Phys. Usp.* **3**, 875–880 (1961) [transl. of *Usp. Fiz. Nauk* **72**, 673 (1960)], https://ufn.ru/ufn61/ufn61_6/ufn616f.pdf
  - **Secondary lecture notes:** J. Mester (Stanford), "Experimental Tests of General Relativity," IHP 2006 lectures, https://luth.obspm.fr/IHP06/lectures/mester-vinet/IHP-2GravRedshift.pdf
- **What was done:** Mössbauer spectroscopy of the 14.4 keV γ-ray of ⁵⁷Fe, sent up and down the enclosed tower of the Jefferson Physical Laboratory at Harvard. A helium-filled bag 40 cm in diameter cut absorption in air. Up and down runs were compared to cancel systematic shifts.
- **Numbers:**
  - Pound (1961): "The height h used is about 21 meters." Expected one-way shift "about 2.5 × 10⁻¹⁵". Prediction for the up–down difference: 4.67 × 10⁻¹⁵. Average of about six runs: **0.98 ± 0.04** of the predicted gh/c² (main channel), or 0.97 ± 0.05 relative to the monitor channel. He described this as agreement "at least within about 4 percent".
  - Mester (secondary): tower 22.5 m. The 1960 PRL result was 2Δ = **(5.13 ± 0.51) × 10⁻¹⁵**, "a result good to 10%". Pound & Snider later reached 1% (*PRL* **13**, 539 (1964); bibliographic only).
- **Caveats:** The commonly quoted ratio of 1.05 ± 0.10 for the 1960 PRL is consistent with 5.13/4.92 **[my calculation: 2gh/c² for 22.5 m = 4.91 × 10⁻¹⁵]**, but I did not read it in the PRL itself. The height differs by source: Pound gives "about 21 meters" as the h used, while secondary sources give the tower as 22.5 m.

### 3.2 Hafele & Keating (1972): clocks flown around the world
- **Citations:** J. C. Hafele, R. E. Keating, "Around-the-world atomic clocks: predicted relativistic time gains," *Science* **177**, 166–168 (1972), and "…: observed relativistic time gains," *Science* **177**, 168–170 (1972), 14 July 1972.
- **DOI:** 10.1126/science.177.4044.166 and 10.1126/science.177.4044.168 · scan: http://leapsecond.com/museum/HK50/1972-Science-177-HK.pdf (personal scan by T. Van Baak)
- **Access status:** full text read (OCR scan of both papers).
- **What was done:** Four cesium-beam clocks flew on commercial jets in October 1971, once eastward and once westward, and were compared with USNO MEAN(USNO). Over 5000 time differences were recorded during a 636-hour data period.
- **Numbers (verbatim from the tables):**
  - Predicted gravitational term: +144 ± 14 ns (east), +179 ± 18 ns (west). Kinematic term: −184 ± 18 ns (east), +96 ± 10 ns (west). Net: −40 ± 23 ns (east), +275 ± 21 ns (west).
  - **Observed: −59 ± 10 ns (east), +273 ± 7 ns (west).**
- **Quote (verbatim):** "These results provide an unambiguous empirical resolution of the famous clock "paradox" with macroscopic clocks." The scan reads "mrcroscopic", an OCR error.
- **Caveat:** Critics have disputed the clocks' stability and the data analysis (for example, cartesio-episteme.net). I did not evaluate those critiques. Modern clock experiments (§3.3–3.5) supersede this test in precision.

### 3.3 Chou, Hume, Rosenband & Wineland (2010): 33 cm and speeds under 10 m/s
- **Citation:** C. W. Chou, D. B. Hume, T. Rosenband, D. J. Wineland, "Optical clocks and relativity," *Science* **329**, 1630–1633 (2010), 24 Sep 2010.
- **DOI / URL:** 10.1126/science.1192720 · NIST-hosted copy: https://tsapps.nist.gov/publication/get_pdf.cfm?pub_id=905055. The NIST catalogue entry wrongly labels the journal as *Nature* and gives the title as "Relativity and Optical Clocks"; the PDF is the Science article.
- **Access status:** full text read.
- **What was done and measured:** Two ²⁷Al⁺ quantum-logic optical clocks (one using ⁹Be⁺ and one ²⁵Mg⁺ as the logic ion), in separate labs linked by **75 m** of phase-stabilized fibre. Q factor 4.2 × 10¹⁴. The Al-Mg clock started 17 cm lower than the Al-Be clock, then was raised by **33 cm**. Measured fractional frequency change **(4.1 ± 1.6) × 10⁻¹⁷**, which corresponds to a height change of 37 ± 15 cm against the known 33 cm. Data: about 100,000 s at the low height and 40,000 s at the high height. Expected sensitivity: about 1.1 × 10⁻¹⁶ per metre. Velocity time dilation was also seen at speeds below 10 m/s.
- **Quotes (verbatim):**
  - "We can now also detect time dilation due to a change in height near Earth's surface of less than 1 meter." (abstract)
  - "the higher clock emits about three more second-ticks than the lower one in a million years" (for 1 km of separation)

### 3.4 Takamoto et al. (2020): 450 m at Tokyo Skytree
- **Citation:** M. Takamoto, I. Ushijima, N. Ohmae, T. Yahagi, K. Kokado, H. Shinkai, H. Katori, "Test of general relativity by a pair of transportable optical lattice clocks," *Nature Photon.* **14**, 411–415 (2020).
- **DOI:** 10.1038/s41566-020-0619-8
- **Access status:** bibliographic only for the paper itself (University of Tokyo news page, 9 Jul 2020). Numbers are from the authors' later review, **full text read**: H. Shinkai, M. Takamoto, H. Katori, "Transportable optical lattice clocks and general relativity," arXiv:2502.06104 (Feb 2025).
- **Numbers (from the 2025 review):** Two transportable Sr optical lattice clocks, one on the ground floor and one on the observatory floor, linked by about 700 m of fibre. Measured frequency shift Δν ≈ 21.18 Hz at ν ≈ 429.228 THz. Laser ranging gave Δh = 452.596 ± 0.013 m and gΔh/c² = (49,337.1 ± 1.4) × 10⁻¹⁸. The test parameter for deviation from GR was **α = (1.4 ± 9.1) × 10⁻⁵**, described as "the best constraint on the gravitational redshift on the ground". The same review also cites satellite tests of α = (0.19 ± 2.48) × 10⁻⁵ and (4.5 ± 3.1) × 10⁻⁵ (its refs. 43 and 44, the Galileo satellites; not read by me).

### 3.5 Bothwell et al. (2022): redshift resolved across a millimetre
- **Citation:** T. Bothwell, C. J. Kennedy, A. Aeppli, D. Kedar, J. M. Robinson, E. Oelker, A. Staron, J. Ye, "Resolving the gravitational redshift across a millimetre-scale atomic sample," *Nature* **602**, 420–424 (2022).
- **DOI / arXiv:** 10.1038/s41586-021-04349-7 · arXiv:2109.12238 (v1, preprint titled "…within a millimeter atomic sample")
- **Access status:** full text read (arXiv v1). The published abstract (via RePEc) confirms the 7.6 × 10⁻²¹ headline figure.
- **What was done and measured:** About 100,000 ⁸⁷Sr atoms at about 100 nK in a shallow 1D optical lattice (in-vacuum cavity, finesse about 1300, 260 µm waist) oriented along gravity. The atoms were imaged in situ at 6 µm resolution, about 15 lattice sites. The predicted redshift gradient was **−1.09 × 10⁻¹⁹ per mm**. 14 measurements over 10 days (each 1–17 h) gave **−9.8(2.3) × 10⁻²⁰ /mm** after systematics. A synchronous comparison of two regions over 92 h gave fractional-frequency uncertainty **7.6 × 10⁻²¹** and a gradient of −1.28(27) × 10⁻¹⁹ /mm. Coherence time was 37 s.
- **Quote (verbatim):** "we measure a linear frequency gradient consistent with the gravitational redshift within a single millimeter scale sample of ultracold strontium." (arXiv abstract, 20 words)
- **Portal relevance:** Height differences of about a millimetre already produce a measurable clock-rate difference. A portal with mouths at different heights could not stay perfectly time-synchronized, even across a doorway.

### 3.6 Portal-relevant numbers: fractional rate gh/c² and the time offset it accumulates **[my calculation]**
Inputs: g = 9.80665 m s⁻², c = 299,792,458 m s⁻¹, 1 yr = 3.156 × 10⁷ s.

| Height difference h | gh/c² | Offset per day | Offset per year | Measured example |
|---|---|---|---|---|
| 1 mm | 1.09 × 10⁻¹⁹ | 9.4 fs | 3.4 ps | Bothwell 2022: gradient resolved, about 23% uncertainty |
| 33 cm | 3.6 × 10⁻¹⁷ | 3.1 ps | 1.1 ns | Chou 2010: (4.1 ± 1.6) × 10⁻¹⁷ |
| 1 m | 1.09 × 10⁻¹⁶ | 9.4 ps | 3.4 ns | Chou: about 1.1 × 10⁻¹⁶ m⁻¹ |
| ~21–22.5 m | (2.3–2.5) × 10⁻¹⁵ | ~0.2 ns | ~75 ns | Pound–Rebka / Pound 1961 |
| 450 m | 4.9 × 10⁻¹⁴ | 4.2 ns | 1.55 µs | Takamoto 2020 (gΔh/c² = 4.93 × 10⁻¹⁴ measured) |
| 1 km | 1.09 × 10⁻¹³ | 9.4 ns | 3.4 µs | Cross-check: 3.4 s per 10⁶ yr, matching Chou's "about three more second-ticks … in a million years" |

---

## 4. Casimir-effect measurements (short list; separations and precision only)

| Experiment | Geometry and method | Separation range | Precision or agreement | Access |
|---|---|---|---|---|
| **Lamoreaux 1997**, *PRL* **78**, 5 (DOI 10.1103/PhysRevLett.78.5) | Torsion pendulum; 2.54 cm quartz optical flat against a spherical lens (R = 11.3 ± 0.1 cm, 4 cm diameter), each coated with Cu, then Au on the facing surfaces (0.5 µm layers; the OCR shows "mm"); 216 up/down sweeps | 0.6–6 µm | "Agreement with theory at the level of 5% is obtained." (abstract) | full text read (MIT-hosted scan) |
| **Mohideen & Roy 1998**, *PRL* **81**, 4549 (DOI 10.1103/PhysRevLett.81.4549; arXiv:physics/9805038) | AFM; metallized sphere 196 µm in diameter against a flat plate | 0.1–0.9 µm | rms deviation 1.6 pN between theory and experiment, which "corresponds to a 1% deviation at the smallest separation" | abstract only |
| **Bressi, Carugno, Onofrio & Ruoso 2002**, *PRL* **88**, 041804 (DOI 10.1103/PhysRevLett.88.041804; arXiv:quant-ph/0203002) | **Parallel plates**: Cr-coated Si cantilever against a rigid surface, about 1.2 × 1.2 mm²; parallelism better than 30 nm over 1.2 mm; frequency-shift detection | 0.5–3.0 µm | Coefficient K_C = (1.22 ± 0.18) × 10⁻²⁷ N m² against the ideal-metal value 1.3 × 10⁻²⁷ N m², i.e. "the 15% precision level" | full text read (arXiv v1) |

- **Lamoreaux caveats:** A comment by Lambrecht & Reynaud (*PRL* **84**, 5672 (2000); arXiv:quant-ph/9912085, abstract read) disputes the theory comparison, noting the discrepancy reported in the erratum *PRL* **81**, 5475 (1998). Lamoreaux later proposed a systematic correction (arXiv:1007.4276, 2010, abstract read) that brings the data into agreement with the Drude model.
- **Scale of laboratory negative energy [my calculation, ideal plates]:** P = K_C/d⁴ and energy density u = −P/3, with K_C = π²ħc/240 = 1.30 × 10⁻²⁷ N m². At d = 1 µm, P ≈ 1.3 × 10⁻³ Pa and u ≈ −4.3 × 10⁻⁴ J m⁻³ (mass-equivalent ≈ −4.8 × 10⁻²¹ kg m⁻³). At d = 100 nm, P ≈ 13 Pa and u ≈ −4.3 J m⁻³.

### 4.1 Wilson et al. (2011): dynamical Casimir effect observed
- **Citation:** C. M. Wilson, G. Johansson, A. Pourkabirian, J. R. Johansson, T. Duty, F. Nori, P. Delsing (author list as on arXiv v1; the published Nature author list was not checked), "Observation of the dynamical Casimir effect in a superconducting circuit," *Nature* **479**, 376–379 (2011).
- **DOI / arXiv:** 10.1038/nature10561 · arXiv:1105.4714 (v1, 24 May 2011)
- **Access status:** full text read (arXiv v1).
- **What was done and measured:** A coplanar transmission line terminated by a SQUID. Modulating the SQUID inductance at about 11 GHz changes the line's electrical length, which acts as a mirror moving at an effective velocity "approaching v/c ∼ 0.05 for a 10% modulation". Light speed in the line is c₀ ≈ 0.4c. The sample was at 50 mK, where thermal occupation is n = 0.008 at 5 GHz. The experiment observed photon pairs at ω_d/2 and two-mode squeezing (cross-correlations of a few percent).
- **Comparison quoted in the paper:** a real mirror oscillating at 2 GHz with 1 nm amplitude gives v/c ~ 10⁻⁷, about 1 photon per day, and needs 100 MW of mechanical power.
- **Portal relevance:** It is real photon creation from vacuum by a moving boundary. The "mirror" is an electrical boundary condition, not a moving object, and no negative energy is stored in any usable way.

---

## 5. Quantum teleportation: why it is not matter transport

### 5.1 Bennett et al. (1993): the protocol
- **Citation:** C. H. Bennett, G. Brassard, C. Crépeau, R. Jozsa, A. Peres, W. K. Wootters, "Teleporting an unknown quantum state via dual classical and Einstein-Podolsky-Rosen channels," *Phys. Rev. Lett.* **70**, 1895–1899 (1993), 29 Mar 1993.
- **DOI / URL:** 10.1103/PhysRevLett.70.1895 · scan: https://people.disim.univaq.it/~serva/teaching/Bennet.1993.pdf
- **Access status:** full text read (OCR scan).
- **Content:** Alice makes a joint Bell measurement on the unknown particle and her half of an EPR pair, and sends Bob the classical result (2 bits for a two-state particle). Bob applies a matching rotation. The original state is destroyed, as the no-cloning theorem requires. Only the *state* ends up at Bob's location, on a particle that was already there.
- **Key quotes (verbatim):**
  - "It is known that instantaneous information transfer is definitely impossible"
  - "The classical message plays an essential role in teleportation."
  - "a full two bits of classical channel capacity are necessary." Anything less "would allow Bob to send superluminal messages".
  - Without the classical message, Bob's particle is "a maximally mixed state, giving no information about the input state".

### 5.2 Bouwmeester et al. (1997): first photonic demonstration
- **Citation:** D. Bouwmeester, J.-W. Pan, K. Mattle, M. Eibl, H. Weinfurter, A. Zeilinger, "Experimental quantum teleportation," *Nature* **390**, 575–579 (1997).
- **DOI / arXiv:** 10.1038/37539 · arXiv:1901.11004 (posted 2019, dated 11 Dec 1997)
- **Access status:** full text read (arXiv copy).
- **What was done and measured:** The polarization state of a photon was teleported onto another photon using parametric down-conversion (200 fs pulses, 788 nm; coherence time 520 fs). Only **one of the four Bell states** (|ψ⁻⟩) was identified, so success occurred in 25% of cases. Teleportation visibilities were 0.57–0.66 for ±45°, 0° and 90° and circular inputs, after subtracting spurious threefold coincidences (68 ± 1% of threefolds). Fourfold coincidences with no subtraction gave 70 ± 3%.
- **Quote (verbatim):** "teleportation is successfully achieved, albeit only in a quarter of the cases."
- **Note:** The distance in this table-top experiment is not given in the parts I read, so do not quote a distance.

### 5.3 Ren et al. (2017): ground-to-satellite teleportation, up to 1400 km
- **Citation:** J.-G. Ren et al. (incl. C.-Z. Peng, J.-Y. Wang, J.-W. Pan), "Ground-to-satellite quantum teleportation," *Nature* **549**, 70–73 (2017).
- **DOI / arXiv:** 10.1038/nature23675 · arXiv:1707.00934 (v1)
- **Access status:** full text read (arXiv v1).
- **What was done and measured:** Single-photon qubits were teleported from the Ngari ground station in Tibet (altitude 5100 m) to the Micius satellite (launched 16 Aug 2016, orbit about 500 km). Link distance was **500 km to 1400 km**, with channel loss about 41 dB to about 52 dB. **911 four-photon counts in 32 orbits** (350 s each). Average fidelity **0.80 ± 0.01** for six input states, above the classical limit of 2/3. The entanglement source ran at 1 × 10⁶ pairs/s with fidelity 0.933.
- **Quotes (verbatim):** teleportation transfers states "without physical travelling of the object itself"; the protocol "relies on using both a classical channel and a quantum channel".
- **Portal relevance:** Even the record-distance teleportation moves no mass. The receiving photon is already on the satellite, and the result cannot be read until classical information (here, the Bell-measurement outcome used in post-processing) arrives at light speed or slower.

---

## 6. The 2022 "holographic wormhole" quantum-processor experiment (one line, plus pointers)
- **Citation:** D. Jafferis, A. Zlokapa, J. D. Lykken, D. K. Kolchmeyer, S. I. Davis, N. Lauk, H. Neven, M. Spiropulu, "Traversable wormhole dynamics on a quantum processor," *Nature* **612**, 51–55 (2022). DOI 10.1038/s41586-022-05424-3. Access: **abstract only** (RePEc), plus the Caltech news release and the Google Research blog (30 Nov 2022).
- **One line:** A teleportation-protocol circuit on Google's Sycamore processor, running a machine-learned "sparsified SYK model" "with 164 two-qubit gates on a nine-qubit circuit" (abstract, verbatim). Its signals are *interpreted*, through holographic duality, as a traversable wormhole in a dual 2D gravity description. Caltech: "The experiment has not created an actual wormhole (a rupture in space and time)" (verbatim).
- **Critique (pointer only; covered in depth by another agent):** B. Kobrin, T. Schuster, N. Y. Yao, "Comment on 'Traversable wormhole dynamics on a quantum processor'," arXiv:2302.07897 (15 Feb 2023), abstract read. It argues that the learned Hamiltonian does not thermalize, and that "perfect size winding" appears generically in small commuting models.

---

## 7. Illusions and telepresence that look like portals

### 7.1 "Portal": Vilnius ↔ Lublin (2021)
- **Sources:**
  - LRT English, "Vilnius opens portal to other cities," 28 May 2021, https://www.lrt.lt/en/news-in-english/19/1420564/vilnius-opens-portal-to-other-cities. Access: full article read.
  - Official project site, https://www.portals.org/portal/vilnius. Access: page read.
  - Bird in Flight news item, https://birdinflight.com/en/news/vilnius-poland-portal.html. Access: via search snippet only.
- **What it is:** A round "door"-like public sculpture with a large screen and cameras, streaming live video between the two cities. LRT: installed "on May 26 in front of the Vilnius train station". The device "resembles a virtual circular door and has a large screen and cameras" (verbatim, LRT, citing a GoVilnius press release). Initiator: Benediktas Gylys. The Lublin unit was in Litewski Square, and the Lublin side opened 26 May 2021 according to a search snippet of an ecocnews item. Portals.org: "Unveiled in May 2021", now at Vilnius Town Hall Square, offering "a real-time, unfiltered livestream 24/7". Search snippets (Bird in Flight, ecocnews) say there was **no audio** by design and that the screen was engineered by VilniusTech's Creativity and Innovation Centre. These two details are secondary only.
- **Distance caveat:** Bird in Flight says "600 kilometers". The great-circle distance between the two sites is about **420 km [my calculation]**, so 600 km is probably road distance.

### 7.2 "Portal": New York ↔ Dublin (May 2024), and the expanding network
- **Sources:**
  - Dezeen, E. Eberhardt, "'Public technology sculpture' The Portal shut down after 'inappropriate behaviour'," 15 May 2024, https://www.dezeen.com/2024/05/15/the-portal-shut-down-poor-behaviour/. Access: article read.
  - Smithsonian, O. Osho-Williams, "New 'Portal' opens in Philadelphia…," 25 Oct 2024, https://www.smithsonianmag.com/smart-news/new-portal-opens-in-philadelphia-connecting-residents-to-cities-around-the-world-with-identical-installations-180985335/. Access: article read.
- **Facts:** Two circular screens with a 24/7 live feed, at Fifth Avenue & 23rd Street (Flatiron, New York) and O'Connell Street (Dublin). Opened **8 May 2024** as part of NYCxDesign. Both were shut down **14 May 2024** for "a few days" after misbehaviour on camera (Dezeen). Smithsonian adds: "a small camera above an eight-foot-tall screen"; the New York portal reopened with limited hours and officially closed on **2 September (2024)**; a Philadelphia portal in LOVE Park was unveiled **22 Oct 2024**, rotating every three minutes among Vilnius, Lublin and Dublin.
- **Physics note [my calculation]:** NYC to Dublin is about 5,110 km great-circle, so the light-time floor is about 17 ms in vacuum and about 25 ms in optical fibre (n ≈ 1.47) before any routing or codec delay. A video "portal" is always a delayed image of the far side.

### 7.3 Precedent: "Hole in Space" (1980)
- **Source:** K. Galloway & S. Rabinowitz, *Hole In Space: A Public Communication Sculpture*, Nov 1980. MoMA collection record https://www.moma.org/collection/works/120330 (returned 403). A MoMA 1982 press release lists only the 30-minute documentation tape.
- **Access status:** bibliographic only. Details come from search snippets of the MoMA record: life-size screens at Lincoln Center (New York) and Century City (Los Angeles), connected by a live two-way satellite link on 12–14 Nov 1980, without prior announcement. Verify before using.

### 7.4 Pepper's ghost: history and mechanism
- **Primary source:** J. H. Pepper, *The True History of the Ghost; and All About Metempsychosis* (London: Cassell, 1890). Project Gutenberg eBook #72672, https://www.gutenberg.org/ebooks/72672. Access: full text searched; relevant passages read. It reproduces the patent: Dircks & Pepper, "Apparatus for exhibiting dramatic and other performances," A.D. 1863 No. 326, dated 5 Feb 1863, sealed 25 Sep 1863.
- **Mechanism (patent text, verbatim fragments):** a second, hidden stage at a lower level "is to be strongly illuminated by artificial light". "A large glass screen is placed on the ordinary stage and in front of the hidden one." The spectators "will not observe the glass screen," but the glass reflects "an image of the actors on the hidden stage". The glass is set "at an inclination". The image disappears when the hidden stage is darkened.
- **History:** Pepper says he gave a private view "Just before Christmas Day in 1862" at the Royal Polytechnic, having adapted Henry Dircks's earlier model, which in Dircks's form needed an entirely new theatre. The first scene painted showed "the laboratory of 'The Haunted Man'" (Dickens), and that scene "ran for fifteen months".
- **Caveat:** Pepper's account is internally inconsistent: it also names Bulwer's "A Strange Story" for the private view. Secondary sources usually date the debut to 24 Dec 1862 with *The Haunted Man*. Treat exact dates and plays as uncertain.
- **Portal relevance:** A partially reflecting pane superimposes a lit hidden scene on the real one, so an object can seem to stand in a space where it is not. It is a classic "doorway to elsewhere" stage illusion.

### 7.5 Infinity mirrors: how the recursion works
- **Sources:**
  - University of Memphis, Dept. of Physics & Materials Science, "Infinity Mirror" demonstration page, https://www.memphis.edu/physics/demonstrations/infinity_mirror.php. Access: page read.
  - Texas A&M Physics & Astronomy, "Infinity Mirror," https://physics.tamu.edu/infinity-mirror. Access: page read.
- **Mechanism:** Lights sit between a full mirror and a partially reflecting ("one-way") mirror. Each round trip sends part of the light out through the partial mirror to the viewer. Each image appears farther back, as an "image bulb" behind the real one, and dimmer, because light is lost on every reflection. TAMU: the device is "nothing more than a normal mirror, a partial mirror, and LEDs," which "gives the illusion that the single strip of LEDs is an infinite tunnel." Neither page gives a per-reflection loss figure.
- **Portal relevance:** This is the physics behind "portal-looking" tunnels in props. The apparent depth is an optical stack of virtual images, and its true depth is the spacing between the two mirrors.

---

## 8. Window-like "portal" displays (head-tracked parallax and light fields)

### 8.1 Johnny Chung Lee (2007): head tracking with the Wii Remote
- **Source:** J. C. Lee, "Head Tracking for Desktop VR Displays using the Wii Remote," project page, http://johnnylee.net/projects/wii/. Access: page read via curl. Video and post date: Hackaday covered it on 21 Dec 2007 (https://hackaday.com/2007/12/21/), seen via search snippet. A mirror description exists on a Microsoft Applied Sciences project page.
- **How it works (verbatim):** Using the Wii Remote's infrared camera and "a head mounted sensor bar (two IR LEDs)", "you can accurately track the location of your head and render view dependent images on the screen." "This effectively transforms your display into a portal to a virtual environment." "The display properly reacts to head and body movement as if it were a real window". "The program only needs to know your display size and the size of your sensor bar." Hardware note from the same page: the Wii Remote has a "1024x768 infrared camera with built-in hardware blob tracking of up to 4 points at 100Hz."
- **Physics:** The screen is rendered as an off-axis (asymmetric-frustum) perspective from the tracked eye position, which reproduces motion parallax for **one tracked viewer**. Everyone else sees a distorted image. With no stereo, depth comes from parallax alone.

### 8.2 Ware, Arthur & Booth (1993): "Fish Tank Virtual Reality" (academic grounding)
- **Citation:** C. Ware, K. Arthur, K. S. Booth, "Fish tank virtual reality," *Proc. CHI '93*, 37–42 (ACM, 1993). DOI 10.1145/169059.169066.
- **Access status:** abstract only (UNH Scholars, https://scholars.unh.edu/ccom/178).
- **Content:** A stereo monitor image rendered with a perspective projection tied to the viewer's head position. Quote: "head coupling may be more important than stereo in yielding a strong impression of three dimensionality." Tree-tracing error rates: 22% (pictorial), 14.7% (stereo only), 3.2% (head coupling only), 1.3% (head-coupled stereo).

### 8.3 Lawrence et al. (2021): Google Project Starline, a state-of-the-art "window" telepresence booth
- **Citation:** J. Lawrence, D. B. Goldman, S. Achar, et al. (17 authors), "Project Starline: A high-fidelity telepresence system," *ACM Trans. Graph.* **40**(6), Art. 242 (Dec 2021).
- **DOI / URL:** 10.1145/3478513.3480490 · author copy: https://www.hhoppe.com/starline.pdf
- **Access status:** full text searched; abstract and key sections read.
- **Design:** "a head-tracked autostereoscopic display based on a 65-inch 8K panel with 33.1M full-color pixels updating at 60 Hz" (verbatim). It uses a lenticular display, four colour plus three depth capture streams, face tracking at 120 Hz, NIR stereo capture at 180 Hz, and spatial audio, with no glasses or headsets. The abstract claims it is "demonstrably better than 2D videoconferencing" on presence, recall and nonverbal behaviour.
- **Limits the authors discuss:** visual crosstalk, tracking latency, vergence–accommodation conflict (mitigated by putting the remote face near the display plane), and loss of stereo at the display edges, where hands and torso are clipped by the bezel.
- **Portal relevance:** This is the realistic engineering recipe for a convincing window-portal: track the viewer's eyes, render or capture the remote scene from those exact viewpoints, and deliver a separate image to each eye. It is still a display of transmitted images.

---

## 9. Gravitational lensing images (how a mass, or a wormhole mouth, distorts the view behind it)
- **Source:** ESA/Hubble, "Hubble finds double Einstein ring" (heic0803), 10 Jan 2008, https://sci.esa.int/web/hubble/-/42194-hubble-finds-double-einstein-ring-heic0803. Access: page read.
- **Content (verbatim fragments):** gravity bends light from a background galaxy "in much the same way as a magnifying glass would". With exact alignment, "the light forms a circle, called an Einstein ring, around the foreground galaxy." The system is SDSSJ0946+1006: "The foreground galaxy is 3 thousand million light-years away", and the two background galaxies lie at about 6 and 11 thousand million light-years.
- **Caveat:** A frequently repeated "1 in 10,000" alignment-odds figure is **not** on this page; the page only says the odds are "so small". Do not attribute that figure to ESA.
- **Link to wormholes:** Abe (2010) shows that an Ellis wormhole produces one image outside the Einstein ring and one inside, with light-curve "gutters" of about 4% (§10.4). Cramer et al. (1995) show that a negative-mass mouth gives sharp caustic spikes and can blank out the source entirely (§10.1).

---

## 10. Proposed and actual astronomical tests for wormholes (with any limits obtained)

### 10.1 Cramer, Forward, Morris, Visser, Benford & Landis (1995)
- **Citation:** "Natural wormholes as gravitational lenses," *Phys. Rev. D* **51**, 3117–3120 (1995). DOI 10.1103/PhysRevD.51.3117 · arXiv:astro-ph/9409051.
- **Access status:** full text read (arXiv).
- **Content:** A Visser-type wormhole mouth that accretes mass could leave the other mouth with net **negative mass**, a "gravitationally negative anomalous compact halo object (GNACHO)". Its microlensing light curve is "much sharper", shows "stronger but briefer light enhancements", and for small impact parameter has "a precipitous drop to zero intensity". Recommendation (verbatim): "We recommend that MACHO search data be analyzed for GNACHOs." **This is a proposal; no limit is derived.**

### 10.2 Torres, Romero & Anchordoqui (1998)
- **Citation:** "Might some gamma ray bursts be an observable signature of natural wormholes?" *Phys. Rev. D* **58**, 123001 (1998). DOI 10.1103/PhysRevD.58.123001 · arXiv:astro-ph/9802106.
- **Access status:** abstract only.
- **Result (abstract):** Using GRB satellite (BATSE) data, the authors give "an upper limit to the negative mass density -- O(10⁻³⁶) g cm⁻³ -- under the form of wormhole-like objects". Takahashi & Asada (2013) restate this as |Ω| ≲ 10⁻⁷ around |M| ~ 0.1 M☉.

### 10.3 Safonova, Torres & Romero (2002)
- **Citation:** "Microlensing by natural wormholes: theory and simulations," *Phys. Rev. D* **65**, 023001 (2002). DOI 10.1103/PhysRevD.65.023001 · arXiv:gr-qc/0105070.
- **Access status:** abstract only.
- **Content:** Negative-mass lensing gives a total or partial eclipse of the source in the "umbra" region, and the Shapiro time delay is replaced by an equivalent time *gain*. Simulated light curves are given. **This is theory and simulation only; no limit is derived.**

### 10.4 Abe (2010)
- **Citation:** F. Abe, "Gravitational microlensing by the Ellis wormhole," *Astrophys. J.* **725**, 787–793 (2010). DOI 10.1088/0004-637X/725/1/787 · arXiv:1009.6084.
- **Access status:** abstract read (from the arXiv PDF); the body was not examined.
- **Content:** The weak-field limit is valid for throat radii below 10¹¹ km. Light curves have "gutters of approximately 4% immediately outside the Einstein ring crossing times". Magnification is generally smaller than for Schwarzschild lensing. If wormholes have throat radii of 100–10⁷ km, are bound to the Galaxy and are about as common as stars, "detection can be achieved by reanalyzing past data"; if they are unbound, past data cannot detect them. **This is a proposal; no limit is derived.**

### 10.5 Takahashi & Asada (2013): an actual observational upper bound
- **Citation:** R. Takahashi, H. Asada, "Observational upper bound on the cosmic abundances of negative-mass compact objects and Ellis wormholes from the Sloan Digital Sky Survey quasar lens search," *Astrophys. J. Lett.* **768**, L16 (2013). DOI 10.1088/2041-8205/768/1/L16 · arXiv:1303.1301 (v2).
- **Access status:** full text read for the abstract and introduction (arXiv v2); the rest was skimmed.
- **Result:** No multiple images attributable to these lenses among about 50,000 SQLS quasars. Upper bounds:
  - **Ellis wormholes:** n < 10⁻⁴ h³ Mpc⁻³ for throat radius a = 10–10⁴ pc.
  - **Negative-mass compact objects:** n < 10⁻⁸ (10⁻⁴) h³ Mpc⁻³ for |M| > 10¹⁵ (10¹²) M☉, i.e. |Ω| < 10⁻⁴ over 10¹²–10¹⁵ M☉.
  - The paper also cites Yoo et al. (2013): n ≲ 10⁻⁹ AU⁻³ for a ≈ 1 cm, from femtolensing of GRBs (not read by me).

### 10.6 Dai & Stojkovic (2019): test via stellar orbits at Sgr A* (proposal, disputed)
- **Citation:** D.-C. Dai, D. Stojkovic, "Observing a wormhole," *Phys. Rev. D* **100**, 083513 (2019). arXiv:1910.00429 (v3).
- **Access status:** abstract only. The journal reference is confirmed by the NSF PAR copy and a university news page.
- **Content:** Gravitational flux through a traversable wormhole means a mass orbiting on the "other side" perturbs orbits on our side. Abstract: with "a near future acceleration precision of 10⁻⁶ m/s²", a star of a few solar masses on the far side at a few gravitational radii would leave a detectable imprint on S2's orbit.
- **Dispute:** S. Krasnikov, "Comment on 'Observing a wormhole'," arXiv:1910.07839, argues the effect is unobservable within the paper's approximation (bibliographic only). The authors reply in arXiv:1912.07793 (abstract read).

### 10.7 Event Horizon Telescope (2022): one specific wormhole model ruled out for Sgr A*
- **Citation:** Event Horizon Telescope Collaboration, "First Sagittarius A* Event Horizon Telescope Results. VI. Testing the black hole metric," *Astrophys. J. Lett.* **930**, L17 (2022). DOI 10.3847/2041-8213/ac6756 · arXiv:2311.09484.
- **Access status:** full text searched; abstract and wormhole passages read (arXiv v1).
- **Result:** The observed ring size of Sgr A* is "within ∼ 10% of the Kerr predictions" (abstract). For the simplest non-spinning Morris–Thorne wormhole with a single photon sphere (redshift function as in Bambi 2013), they find a shadow radius r_sh = eM ≈ 2.72 M (δ ≈ −0.48), "which is immediately ruled out by the present considerations" (verbatim, 7 words). The paper notes: "the spacetime must necessarily contain energy-condition-violating matter and lack event horizons" (verbatim).
- **Caveat (their footnote 11, verbatim):** "there exist wormhole spacetimes that could be particularly difficult to distinguish from a black hole". The exclusion is model-specific.

### 10.8 Bambi & Stojkovic (2021): review of astrophysical wormhole searches
- **Citation:** C. Bambi, D. Stojkovic, "Astrophysical wormholes," *Universe* **7**, 136 (2021). DOI 10.3390/universe7050136 · arXiv:2105.00881 (v2).
- **Access status:** full text read (arXiv v2).
- **Content:** The review covers lensing, orbiting stars (S2), imaging and shadows, accretion-disk and iron Kα spectroscopy, and gravitational waves (QNMs).
  - S2 numbers as quoted in the review: S2 mass 14 M☉, period 15.9 yr, semi-major axis 1031.69 AU, total acceleration about 1.5 m/s² measured to 4 × 10⁻⁴ m/s², possibly reaching 10⁻⁶ m/s² "within a decade".
  - Pulsar timing (σ_TOA ~ 0.1 µs) could improve perturber-mass limits by about 4 orders of magnitude around Sgr A*, and by more than 6 orders for a Hulse–Taylor-like pulsar around a 10 M☉ black hole.
  - GW: "The current gravitational wave data cannot test these models", because at least two QNMs must be measured precisely.
- **Key quotes (verbatim):**
  - "Strictly speaking, wormholes are not a prediction of general relativity or of other theories of gravity."
  - "In general relativity, traversable wormholes require exotic matter to keep the mouths open"
  - Conclusion: their existence "is an exotic but fascinating hypothesis that cannot be ruled out at the moment."

### 10.9 Summary of observational limits obtained (verified above)

| Search | Data | Limit | Applies to |
|---|---|---|---|
| Torres et al. 1998 | BATSE GRBs (lensing of AGN interpreted as GRB-like events) | negative-mass density ≲ O(10⁻³⁶) g cm⁻³ | wormhole-like negative-mass objects (abstract) |
| Takahashi & Asada 2013 | SDSS Quasar Lens Search, about 50,000 quasars | n < 10⁻⁴ h³ Mpc⁻³ | Ellis wormholes with throat radius 10–10⁴ pc |
| Takahashi & Asada 2013 | same | n < 10⁻⁸ h³ Mpc⁻³ (\|M\| > 10¹⁵ M☉); \|Ω\| < 10⁻⁴ | negative-mass compact objects |
| EHT 2022 (Sgr A*) | 2017 EHT image size | simplest non-spinning MT wormhole ruled out | that model only |
| (cited) Yoo et al. 2013 | GRB femtolensing | n ≲ 10⁻⁹ AU⁻³ | a ≈ 1 cm Ellis wormholes (not read) |

No source I read reports a detection of any natural wormhole.

---

## 11. What no experiment can currently test (with source support)

1. **Creating or holding open a macroscopic traversable wormhole.**
   - In GR the throat needs matter that violates the energy conditions: "the spacetime must necessarily contain energy-condition-violating matter" (EHT Paper VI); "traversable wormholes require exotic matter to keep the mouths open" (Bambi & Stojkovic 2021).
   - Quantum inequalities make this far worse. **Ford & Roman**, "Quantum field theory constrains traversable wormhole geometries," *Phys. Rev. D* **53**, 5496 (1996), DOI 10.1103/PhysRevD.53.5496, arXiv:gr-qc/9510071 (full text read). Their result: either the wormhole is "only a little larger than Planck size", or the negative energy sits in a band many orders of magnitude thinner than the throat. For a "human sized" throat of r₀ ≈ 1 m (with their sampling choice f ≈ 0.01), the band must be ≲ 10¹⁴ ℓ_p ≈ 10⁻²¹ m, "approximately a millionth of the proton radius". Even for a galaxy-sized throat, the band can be "no thicker than about 10 proton radii". Abstract: these results "would seem to make the existence of macroscopic traversable wormholes very improbable."
   - Laboratory negative energy is tiny by comparison: about −4 × 10⁻⁴ J m⁻³ between ideal plates 1 µm apart (§4, **[my calculation]**). Only static Casimir forces and the dynamical Casimir effect have been measured; nothing like a throat-supporting configuration has been.
2. **Topology change of real spacetime.**
   - Friedman & Higuchi, "Topological censorship and chronology protection," *Ann. Phys. (Berlin)* **15**, 109–128 (2006), DOI 10.1002/andp.200510172, arXiv:0801.0735 (relevant sections read). Quotes: "A theorem due to Geroch [19] shows that a spacetime whose boundary comprises two disjoint spacelike 3-manifolds always has closed timelike curves." "Tipler shows that topology-changing spacetimes violate the null energy condition". "it seems unlikely that one can create topological structures with a time evolution that is nearly classical."
   - **Topological censorship:** Friedman, Schleich & Witt, *PRL* **71**, 1486 (1993), arXiv:gr-qc/9305017 (abstract read). In their words, GR "does not allow an observer to probe the topology of spacetime: any topological structure collapses too quickly to allow light to traverse it". This holds under global hyperbolicity, asymptotic flatness and the null energy condition.
   - The metamaterial "topology change" (Greenleaf et al.) is explicitly only "vis-a-vis EM wave propagation".
3. **Spacetime dynamics in analogue systems.** Analogue experiments are kinematic only: "these are purely kinematic experiments that do not probe the dynamics of the effective spacetime" (Barceló, Liberati & Visser, arXiv v4). "the BEC does not fulfil, at any regime, the Einstein equations." The water-wave wormhole is stable for reasons unrelated to GR: "Navier-Stokes equations are different from Einstein's equations" (Euvé & Rousseaux 2017).
4. **Matter or signal transport faster than light.** Teleportation needs a classical channel: "The classical message plays an essential role in teleportation." "instantaneous information transfer is definitely impossible" (Bennett et al. 1993). The quantum-processor "wormhole" did not create a spacetime wormhole (Caltech release).
5. **Time-machine behaviour from mouths at different potentials.** Frolov & Novikov (1990), *Phys. Rev. D* **42**, 1057 (bibliographic only; APS returned 403). As described by Schein, Aichelburg & Israel, *Phys. Rev. D* **54**, 3800 (1996), arXiv:gr-qc/9602053 (introduction read): "even a static wormhole functions as a time-machine if the two mouths are at different gravitational potentials". Their example has one mouth held near a neutron star. Clock experiments (§3) confirm the gh/c² rate itself but cannot test any causality-violating consequence. Hawking's chronology protection conjecture (Hawking, *PRD* **46**, 603 (1992); bibliographic only) is summarized by Friedman & Higuchi as: "The laws of physics prevent closed timelike curves from appearing." It remains a conjecture, with no experimental test.
6. **Planck-scale or quantum-gravity wormholes ("spacetime foam").** No experiment reaches these scales. Ford & Roman's allowed alternative is a wormhole "only a little larger than Planck size". Bambi & Stojkovic say quantum-gravity-era configurations "will be microscopic"; they present inflation enlarging them only as a possibility ("might make them macroscopic").
7. **Natural astrophysical wormholes.** Not detected. There are only upper limits (Takahashi & Asada 2013; Torres et al. 1998) and model-specific exclusions (EHT 2022 for the simplest MT model). GW ring-down tests are "not yet" possible because the data cannot resolve two QNMs (Bambi & Stojkovic). The proposed S2 or pulsar tests are future work and are disputed (Krasnikov comment).
8. **Broadband or 3D "invisible tunnels" for light.** The metamaterial designs work at a single frequency in principle (Pendry et al.: "can only be fully effective at a single frequency"). The demonstrated cloak was 2D, centimetre-scale and narrow-band (Schurig 2006). Wave optics forbids perfect invisibility (Leonhardt: "One can never completely hide from waves, but can from rays.").

---

## 12. Items not verified or not accessed (do not cite these as verified)
- Pound & Rebka 1960 PRL full text (APS 403; Temple PDF 503 or TLS failure). The 1960 numbers come only from Mester's lecture notes; Pound's 1961 review was read.
- Published Nature texts of Muñoz de Nova 2019, Ren 2017 and Jafferis 2022, and the Science text of Leonhardt 2006 beyond its last page. Preprints and abstracts were used instead.
- The "97,000 repetitions / 124 days" figure for Muñoz de Nova 2019 was not verified; do not use it.
- Phys.org's "0.035 billionths of a kelvin" conflicts with the arXiv 0.35 nK figure and is unresolved.
- The "1 in 10,000" odds for the double Einstein ring are not on the ESA page.
- Zhu et al. 2018 (elastic wormhole): what was physically measured is unclear from the abstract.
- Hole in Space (1980): MoMA record inaccessible; details are from search snippets.
- Frolov & Novikov 1990, Hawking 1992, Morris & Thorne 1988 and Geroch 1967: bibliographic only, with content via the secondary sources named.
- Takamoto et al. 2020 itself: numbers come from the authors' 2025 review (arXiv:2502.06104), not from the 2020 paper.
- Barceló et al.: the 2024 arXiv v4 was read, not the 2005 or 2011 LRR full texts. Quotes may differ in those versions.
- Wilson et al. 2011 author list: arXiv v1 lists 7 authors; the published Nature author list was not checked.
