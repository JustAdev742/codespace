# 03: Topology change, causality and chronology protection, wormhole-mouth dynamics, quantum gravity / ER=EPR, and the 2022 "wormhole on a quantum processor"

Compiled 2026-10-19 for the "portal gun" feasibility report.

## How these notes were produced, and how to read them

- **Retrieval methods.** arXiv PDFs were downloaded and converted with `pdftotext`. Scanned PDFs (CaltechAUTHORS copies of Thorne-group papers, and a scanned copy of Hawking 1992) were rendered to images and read page by page. Equations and numbers marked "verified on page image" were checked against a high-resolution crop. Bibliographic data and abstracts were cross-checked against the INSPIRE-HEP API and, for one item, Crossref.
- **Access status legend.**
  - **FULL TEXT READ**: I read the paper itself, either completely or the stated sections.
  - **ABSTRACT ONLY**: I saw only the publisher or INSPIRE abstract.
  - **BIBLIOGRAPHIC ONLY**: I could confirm only that the work exists and its citation.
- **Quotes.** Quotes are verbatim, under 25 words, and set in "double quotes" with the label *(quote)*. Everything else is my paraphrase.
- **Equations.** All equations are my own transcriptions. Units follow the source; geometrized units ($G=c=1$) are used unless stated otherwise.
- **Derived numbers.** Results I calculated myself are labelled **[DERIVED, not from source]**.
- **Scratch-file collision warning.** Another process wrote files into `scratchpad/dl/mty88/` while I was working. All PDFs I relied on were re-downloaded into my own directory, `scratchpad/dl3/`. I did not rely on any file I did not download myself.

---

## A. Topology change: can a wormhole be created?

### A1. Geroch (1967), "Topology in general relativity"
- **Citation:** R. P. Geroch, *J. Math. Phys.* **8**(4), 782–786 (1967). DOI 10.1063/1.1705276. INSPIRE recid 51664.
- **Access:** ABSTRACT ONLY (AIP abstract via INSPIRE). The original text was not accessible. The theorem statement below is taken from three secondary sources, two of them read in full.
- **Abstract content (paraphrased):** Under certain conditions, the topology of spacelike sections can change if and only if the model is acausal. The paper also introduces two new covering manifolds.
- **Theorem as restated in secondary sources:**
  - **Chamblin**, gr-qc/9509046 (full text read; INSPIRE lists it as *Fields Inst. Commun.* **15**, 185):
    - Let $(M,g_L)$ be a **compact, time-orientable** spacetime with a **globally non-singular** Lorentz metric.
    - Let $\partial M = \Sigma_1 \sqcup \Sigma_2$, where both pieces are compact spacelike 3-manifolds.
    - If $(M,g_L)$ has **no closed timelike curves (CTCs)**, then $\Sigma_1 \cong \Sigma_2$ (diffeomorphic) and $M \cong \Sigma_1\times[0,1]$.
    - Contrapositive: if the topology changes, then the region contains CTCs.
  - **Dowker 2002** (full text read) gives the time-non-orientable alternative. Quote: "Geroch proved that if a Lorentzian metric exists on a topology changing cobordism then it must contain CTC's or be time non-orientable." *(quote)*
  - **Morris, Thorne & Yurtsever 1988, footnote 5** (verified on page image) cite the result as "Theorem 2 of R. P. Geroch, J. Math. Phys. 8, 782 (1967)", together with Geroch's 1967 Princeton PhD thesis.
- **Key features:**
  - The result is **purely kinematical**: it uses no field equations and no energy conditions. Borde 1994 (§IX) stresses this.
  - It uses **compactness of the interpolating region**, not of all of spacetime.
  - The proof idea, as given by Hawking 1992 §V (full text) and Borde 1994: a timelike vector field flows from $S_1$ to $S_2$. If it does not map $S_1$ onto $S_2$, some integral curve stays trapped in the compact region and accumulates. That accumulation lets you build a closed timelike curve.
  - Chamblin notes that the theorem fails if the metric is allowed to be singular or degenerate. See A6 and A9.
- **Caveat:** The numbering ("Theorem 2") and exact wording of the original were not verified. Other secondary sources label the result with their own section numbers.

### A2. Tipler (1976), *Phys. Rev. Lett.* "Causality violation in asymptotically flat space-times"
- **Citation:** F. J. Tipler, *Phys. Rev. Lett.* **37**, 879–882 (1976). DOI 10.1103/PhysRevLett.37.879.
- **Access:** ABSTRACT ONLY (APS via INSPIRE).
- **Correction to expectations:** This paper is about **creating CTCs**, not about topology change as such. Quote: "a region containing closed timelike lines cannot evolve from regular initial data in a singularity-free asymptotically flat space-time" *(quote)*.
- It also justifies the causality assumption in black-hole uniqueness proofs: no physically realistic nonsingular black hole can have a causality-violating exterior.
- The energy conditions used are not stated in the abstract. MTY 1988 cite it, together with §5 of Tipler 1977, as the authority that wormhole creation requires violating the weak energy condition (WEC).

### A3. Tipler (1977), "Singularities and causality violation"
- **Citation:** F. J. Tipler, *Ann. Phys. (N.Y.)* **108**, 1–36 (1977). DOI 10.1016/0003-4916(77)90348-7.
- **Access:** ABSTRACT ONLY (Elsevier abstract via INSPIRE). Details below come from Borde 1994, read in full.
- **Claims (abstract):**
  - **(a) Compact case.** If Einstein's equations and the WEC hold on Geroch's topology-changing spacetime, topology change cannot occur. No causality assumption is needed.
  - **(a') Finite region.** Quote: "if topology change occurs within a finite region, then this change of topology must be accompanied by singularities" *(quote)*.
  - **(b) CTCs and singularity theorems.** Causality violation cannot prevent the Hawking–Penrose–Geroch singularities unless the violation begins "at infinity".
- **Precise assumptions, per Borde 1994:**
  - Tipler's compact-case theorem uses slightly stronger assumptions than Borde's: a generic condition on **every** null geodesic in $M$, including those with endpoints on $\partial M$.
  - Tipler's **Theorem 5** covers the non-compact case. A non-compact topology-changing interpolating spacetime contains either an incomplete timelike geodesic or a "point at infinity".
  - Concluding that a genuine singularity must occur needs a "significant additional assumption": an upper bound on the lengths of certain timelike curves.
- **Assessment of the expectation:** "topology change requires singularities or energy-condition violation" is **roughly right but imprecise**. The sharper statement:
  - In a **compact** (or causally compact) region, Einstein's equations plus a positive-energy condition plus a generic condition forbid topology change **outright**. Allowing singularities does not help, because these theorems do not assume geodesic completeness.
  - Singularities enter in the **non-compact** case, and only under extra assumptions.

### A4. Borde (1994), "Topology change in classical general relativity"
- **Citation:** A. Borde, arXiv:gr-qc/9406053 (40 pp., 1994). INSPIRE lists no journal publication.
- **Access:** FULL TEXT READ.
- **Setting:**
  - An "interpolating spacetime" $M$ is connected, with $\partial M = S_1\cup S_2\cup T$, where $T$ is an optional compact timelike tube.
  - **Causal compactness** means that for every $p$, the set $\overline{I(p)}$ is compact.
- **Theorem 1 (generalised Geroch):**
  - Let $M$ be time-oriented and causally compact, interpolating between $S_1$ and $S_2$, with no CTCs.
  - Then $M\cong S_1\times[0,1]$, so $S_1\cong S_2$.
  - **Corollary:** if $M$ is causally compact and can be foliated by spacelike surfaces running from $S_1$ to $S_2$, there is no topology change.
- **Theorem 2:** If $M$ admits a smooth vector field every integral curve of which has an endpoint on $S_1$, then $S_1$ is connected.
  - Consequence: a CTC-free causally compact interpolating spacetime cannot have a disconnected initial or final surface, even with no change in topology.
- **Theorem 3 (generalised Tipler):** Let $M$ be time-oriented, causally compact, of dimension $\ge 3$, and assume:
  - **(i) Null generic condition** on every full (endpointless) null geodesic: $F_{abcd}\equiv U_{[a}R_{b]ef[c}U_{d]}U^eU^f\neq0$ somewhere on it.
  - **(ii) Half-integral null convergence condition** along past-complete null geodesics. Roughly, $\int_u^{u_0}R_{ab}U^aU^b\,du$ repeatedly comes close to non-negative values.
  - Then $M\cong S_1\times[0,1]$ and $S_1$, $S_2$ are connected.
  - Quote: "in dimensions ≥ 3 causally compact topology-changing spacetimes cannot satisfy Einstein's equation (with a reasonable source)" *(quote)*.
  - **Not a singularity theorem.** It makes no completeness assumption, so it rules out topology change even at the price of standard (incomplete-geodesic) singularities.
- **Kinematics (§III):**
  - Quote: "topology change is kinematically possible" *(quote)*. Non-singular Lorentzian topology change can be built when no field equation is imposed; Borde gives 2-D examples.
  - Existence of a Lorentzian cobordism (Reinhart; Sorkin):
    - If $\dim M = n$ is **even**, you need $\chi(M)=0$.
    - If $n$ is **odd**, you need $\chi(S_1)=\chi(S_2)$.
  - Any two closed 3-manifolds are cobordant. Borde (citing Misner and Geroch) therefore concludes there is "no barrier whatsoever" to four-dimensional topology change **at the kinematic level**, before the Gibbons–Hawking spinor rules (A8), Geroch's CTC result, and dynamics are imposed.
- **Non-time-orientable case (§VII):** a causally compact, CTC-free interpolating spacetime between non-empty $S_1$ and $S_2$ must be $\cong S_1\times[0,1]$, and hence time-orientable. So abandoning time-orientability avoids CTCs only when one boundary is empty.
- **Escape routes discussed (§IX):**
  - Dropping causal compactness (but then Tipler's Thm 5 applies).
  - Energy-condition violations large enough to break assumption (ii). Borde notes wormhole-creation proposals "based precisely on large violations of the energy condition".
  - Degenerate metrics (Sorkin, Horowitz). See A6.
- **Energy-condition detail:** a pointwise lower bound $T_{ab}V^aV^b\ge K$ (with $K$ possibly negative) for all unit timelike $V$ implies $R_{ab}U^aU^b\ge0$ for null $U$. Borde notes that quantum stress tensors appear to violate the WEC without a lower bound (Casimir, Hawking radiation), which is why he uses integral conditions.

### A5. Hawking (1992) on topology change. Full entry in C2.
- §I (full text): if a wormhole is created in a compact region $M_T$ bounded by a timelike tube $T$, then by a modification of Geroch's theorem $M_T$ contains CTCs. Quote: "you have to warp the light-cone structure of spacetime so much that closed timelike curves appear anyway" *(quote)*.
- Same page, citing Gibbons & Hawking: "wormholes cannot be created singly, but only in multiples of 2" *(quote)*.
- Hawking argues that $M_T$ should be taken compact. Otherwise, unpredictable information would enter from a singularity or from infinity.

### A6. Horowitz (1991), "Topology change in classical and quantum gravity"
- **Citation:** G. T. Horowitz, *Class. Quantum Grav.* **8**, 587–602 (1991). DOI 10.1088/0264-9381/8/4/007.
- **Access:** ABSTRACT ONLY (IOP via INSPIRE). Content also confirmed by Borde §IX C and Dowker 2002.
- **Claim:**
  - In first-order (tetrad/connection) GR, the field equations remain defined when the metric is degenerate.
  - There exist smooth solutions with spatial topology change. The metric degenerates on a set of measure zero and the curvature stays bounded.
  - Quote: "if degenerate metrics play any role in quantum gravity, topology change is unavoidable" *(quote)*.
- **Caveat:** This is a different theory in effect: first-order GR, which admits degenerate metrics. Dowker notes that the first-order and metric formalisms are "genuinely different theories of gravity". In the first-order theory, topology change is even allowed classically, which raises the puzzle of why we do not see it macroscopically.

### A7. Sorkin (1986), "On topology change and monopole creation"
- **Citation:** R. D. Sorkin, *Phys. Rev. D* **33**, 978–982 (1986). DOI 10.1103/PhysRevD.33.978.
- **Access:** ABSTRACT ONLY.
- **Claims:**
  - Considers Lorentzian cobordism as a mechanism for quantum topology change.
  - In odd spacetime dimension, a suitable metric exists iff $\chi(\text{initial})=\chi(\text{final})$.
  - Consequently, pair creation of Kaluza–Klein monopoles (5-D) cannot occur by this mechanism.
- **Relevance:** This is a selection rule. It is relevant to 4-D wormholes only indirectly; in 4-D the relevant constraint is $\chi(M)=0$, which can always be arranged (see A4).

### A8. Gibbons & Hawking (1992), "Selection rules for topology change" and "Kinks and topology change"
- **Citations:**
  - G. W. Gibbons & S. W. Hawking, *Commun. Math. Phys.* **148**, 345–352 (1992). DOI 10.1007/BF02100864.
  - *Phys. Rev. Lett.* **69**, 1719–1721 (1992). DOI 10.1103/PhysRevLett.69.1719.
- **Access:** ABSTRACT ONLY for both.
- **Claims (CMP):**
  - For topology change in a compact region with a Lorentzian metric **and a spinor structure**, it is "impossible to create a single wormhole or attach a single handle" *(quote)*.
  - It is "kinematically possible to create such wormholes in pairs" *(quote)*.
  - Formally: there is a $\mathbb Z_2$ invariant of a closed oriented 3-manifold, the mod-2 Kervaire semi-characteristic, that decides whether it bounds a compact Lorentzian manifold with spin structure.
- **Claims (PRL):** if the boundary is not everywhere spacelike, then (Kervaire semicharacteristic) + (kink number) must vanish mod 2. The kink number measures light-cone tipping on the boundary. Hence wormholes plus kinks created during topology change are conserved mod 2.
- **Relevance to a portal gun:** wormholes would have to be created in pairs, and the creation still involves CTCs (Geroch) and energy-condition violation (Tipler/Borde). "Wormhole" here means a handle $S^2\times S^1$ attached to space.

### A9. The Sorkin/Dowker "causal continuity" programme (quantum topology change with degenerate Morse metrics)
- **Dowker (2002), "Topology change in quantum gravity"**
  - **Citation:** arXiv:gr-qc/0206020. Published in *The Future of Theoretical Physics and Cosmology* (Hawking 60th-birthday proceedings, eds. G. W. Gibbons, E. P. S. Shellard et al.), Cambridge University Press 2003, pp. 436–452 (per INSPIRE).
  - **Access:** FULL TEXT READ.
  - **Framework:** sum over histories with "Morse metrics", which are Lorentzian except at isolated points where they vanish. This evades Geroch's theorem while keeping a meaningful causal order.
  - **Counter-evidence for topology change:** on the 1+1 "trousers", a quantum field's $\langle T_{\mu\nu}\rangle$ is singular on the future light cone of the crotch (Anderson–DeWitt; Manogue–Copeland–Dray).
  - **Conjectures:**
    - Sorkin: quantum fields are badly behaved only on **causally discontinuous** histories.
    - Borde–Sorkin: causal discontinuity occurs exactly for Morse index $\lambda=1$ or $n-1$.
  - **"Good" processes:** black-hole pair production; KK-monopole pair production; the universe created from nothing.
  - **"Bad" processes:** baby-universe branching (trousers); geon pair creation.
- **Dowker & Surya (1998), "Topology change and causal continuity"**
  - **Citation:** *Phys. Rev. D* **58**, 124019. arXiv:gr-qc/9711070.
  - **Access:** FULL TEXT READ (§§3, 5).
  - The black-hole pair-creation cobordism $S^2\times B^2$ creates an $S^2\times S^1$ wormhole from nothing. It admits a Morse function with indices 0 and 2 only, so it is **causally continuous**, hence "good".
  - The intuitive route via $B^3\times S^1$ minus a ball requires an index-1 point and is **causally discontinuous**. Quote: "the way one might naturally imagine a wormhole forming: two distant regions of space coming 'close in hyperspace' and touching" *(quote)*.
- **Dowker, Garcia & Surya (2000)**
  - **Citation:** *Class. Quantum Grav.* **17**, 697–712. arXiv:gr-qc/9910034.
  - **Access:** ABSTRACT ONLY.
  - Proves a weaker form of the Borde–Sorkin conjecture: any Morse function with index 1 or $n-1$ points gives only causally discontinuous Morse geometries.
- **Relevance:** This is speculative quantum gravity. If it is right, the "two distant points touch" picture of portal formation is the **suppressed** kind of transition.

### A10. Historical primary sources: Wheeler, Misner–Wheeler, Einstein–Rosen, Fuller–Wheeler
- **Wheeler (1955), "Geons"**
  - **Citation:** *Phys. Rev.* **97**, 511–536 (1955). DOI 10.1103/PhysRev.97.511.
  - **Access:** ABSTRACT ONLY.
  - Geons are self-gravitating electromagnetic entities giving a classical, divergence-free model of "body", for masses from about $10^{39}$ g to $10^{57}$ g.
  - The abstract lists a §7, "Electricity, Gauss's theorem, and gravitational field fluctuations".
  - **Not verified:** the claim, often repeated, that this paper contains the first wormhole ("doubly connected space") diagram. The abstract does not mention wormholes.
- **Misner & Wheeler (1957), "Classical physics as geometry"**
  - **Citation:** *Ann. Phys. (N.Y.)* **2**, 525–603 (1957). DOI 10.1016/0003-4916(57)90049-0.
  - **Access:** ABSTRACT ONLY.
  - **Charge without charge:** charge is interpreted as source-free Maxwell field lines "trapped in the worm holes of a space with a multiply-connected topology" *(quote)*.
  - Maxwell's equations are reduced to geometry via Rainich. Real particles are excluded as quantum.
- **Wheeler (1957), "On the nature of quantum geometrodynamics"**
  - **Citation:** *Ann. Phys. (N.Y.)* **2**, 604–614 (1957). DOI 10.1016/0003-4916(57)90050-7.
  - **Access:** ABSTRACT ONLY.
  - Gravitational field fluctuations have new consequences at $(\hbar G/c^3)^{1/2}=1.6\times10^{-33}$ cm.
  - Wheeler expects virtual creation and annihilation of charge pairs of order $(\hbar c)^{1/2}$, with energies of order $(\hbar c^5/G)^{1/2}=2.18\times10^{-5}\,\text{g}\,c^2=2.4\times10^{22}\,m_ec^2$.
  - Later papers (Hayward–Koyama; Friedman et al.) cite it as the origin of the spacetime-foam picture. **Not verified:** whether the word "foam" appears in this paper.
- **Einstein & Rosen (1935), "The particle problem in the general theory of relativity"**
  - **Citation:** *Phys. Rev.* **48**, 73–77. DOI 10.1103/PhysRev.48.73.
  - **Access:** ABSTRACT ONLY.
  - Introduces the "bridge" connecting two identical sheets as a particle model.
- **Fuller & Wheeler (1962), "Causality and multiply connected space-time"**
  - **Citation:** *Phys. Rev.* **128**, 919–929. DOI 10.1103/PhysRev.128.919.
  - **Access:** ABSTRACT ONLY.
  - The Schwarzschild throat "pinches off in a finite time", trapping any signal, so causality is preserved. This is the classic non-traversability result.

### A11. Horowitz, Marolf, Santos & Wang (2019), "Creating a traversable wormhole"
- **Citation:** *Class. Quantum Grav.* **36**, 205011 (2019). DOI 10.1088/1361-6382/ab436f. arXiv:1904.02187.
- **Access:** ABSTRACT ONLY.
- **Claims:**
  - The authors argue "one can nucleate a traversable wormhole via a nonperturbative process in quantum gravity" *(quote)*.
  - Instantons give finite probability for a test cosmic string to break with particles on its ends. Replacing the particles by small black holes gives black holes created with identified horizons.
  - Unlike earlier examples, the created black holes remain essentially at rest. This matters because wormholes are harder to make traversable when the mouths are widely separated, and Unruh radiation can destroy traversability.
  - Quantum back-reaction can then make the wormhole traversable.
- **Caveat:** This is a **tunnelling (instanton) process** with a finite but unquantified probability in the abstract, and the mouths are created **adjacent**. It is not a controllable creation of distant mouths.

### A12. Maldacena, Milekhin & Popov (2018/2023), "Traversable wormholes in four dimensions". Main entry in G4.
- On formation, §9.3 (full text) says: "we did not describe a simple procedure for taking the system to that solution" *(quote)*.
- Formation would involve topology change and disappearance of horizons. Such processes are known to occur by tunnelling "with exponentially small probabilities".

---

## B. Wormholes into time machines, and mouths in gravitational fields

### B1. Morris, Thorne & Yurtsever (1988), "Wormholes, time machines, and the weak energy condition"
- **Citation:** M. S. Morris, K. S. Thorne & U. Yurtsever, *Phys. Rev. Lett.* **61**, 1446–1449 (1988). DOI 10.1103/PhysRevLett.61.1446.
- **Access:** FULL TEXT READ (scanned PDF from CaltechAUTHORS, record m644f-tbz27; key passages checked on high-resolution page images).
- **Wormhole creation (p. 1446):**
  - Classical creation "must be accompanied by closed timelike curves and/or a noncontinuous choice of the future light cone" *(quote)*, citing Geroch Thm 2. It also requires WEC violation, citing Tipler.
  - Specific spacetimes with such creation are known (Yodzis 1972 construction). Friedman & Zhang gave an example of **two** wormholes created in a compact region (private communication).
  - Whether the required stress-energy tensors are allowed by QFT is unknown.
- **Quantum-foam extraction:**
  - Quote: "One can imagine an advanced civilization pulling a wormhole out of the quantum foam and enlarging it to classical size." *(quote)*
  - The foam scale is printed as the Planck–Wheeler length $(G\hbar/c^3)^{1/2}=1.3\times10^{-33}$ cm. **This is a numerical error in the original**: the correct value is $1.616\times10^{-33}$ cm. Verified on page image; see Discrepancies.
  - MTY suggest this "might be analyzable" with spontaneous-wormhole-production tunnelling techniques (refs 8, 9). This is a speculation, not a result.
- **Maintenance:**
  - A two-sphere around one mouth is an **outer trapped surface** as seen through the wormhole. Therefore (Hawking–Ellis Prop. 9.2.8 adapted, with the WEC replaced by the averaged WEC) the stress tensor must violate the averaged WEC (AWEC):
    $$\int_0^\infty T_{\alpha\beta}k^\alpha k^\beta\,d\zeta<0$$
    along some null geodesic through the wormhole.
  - Static metric: $ds^2=-e^{2\Phi}dt^2+dl^2+r^2(l)\,d\Omega^2$.
  - Far from the throat, as printed: $r\simeq|l|-M\ln(|l|/r_0)$ and $\Phi\simeq-2M/|l|$. **The factor 2 looks inconsistent** with $g_{tt}=-e^{2\Phi}$; see Discrepancies.
  - AWEC violation on radial null geodesics: $\int_{l_1}^{\infty}(\tau-\rho)e^{-\Phi}dl>0$ for all $l_1<0$, with $\rho=e^{2\Phi}T^{tt}$, $\tau=-T^{ll}$, $\zeta=\int e^\Phi dl$.
- **Casimir-supported toy wormhole:**
  - Two charged, perfectly conducting spherical plates at $l=\pm s/2$, with $s\ll r_0$.
  - Between the plates: $\tau=3p=-3\rho=(3\pi^2/720)(\hbar/s^4)\equiv\tau_C$.
  - Outside the plates: the Reissner–Nordström field $\tau=\rho=p=Q^2/8\pi r^4$.
  - Force balance: $Q=(8\pi r_0^4\tau_C)^{1/2}$.
  - Einstein equations: $\tau_C=(8\pi r_0^2)^{-1}$, hence $s=(\pi^3/30)^{1/4}(r_0\sqrt\hbar)^{1/2}$. For $r_0=1$ AU this gives $s\sim10^{-10}$ cm.
  - Charge and mass of the wormhole as seen from afar: $Q\simeq M\simeq r_0$.
  - AWEC requires $2\sigma<\tfrac43\tau_C s$, where $\sigma$ is the plate energy per unit area.
  - If plates must have mass-to-charge ratio above the electron's, then $s<[(\pi^3/270)e^2/\hbar]^{1/2}\hbar/m=0.029\,\hbar/m$. MTY say this "might well be forbidden".
  - **[DERIVED, not from source]** $s=(\pi^3/30)^{1/4}\sqrt{r_0\ell_P}\approx1.6\times10^{-10}$ cm for $r_0=1$ AU. This matches MTY. Also $M=r_0c^2/G\approx2.0\times10^{41}$ g $\approx1.0\times10^{8}M_\odot$: an AU-sized Casimir wormhole of this kind would weigh about $10^8$ solar masses.
- **Time-machine conversion:**
  - The mouths start at rest near each other. One mouth is accelerated to near light speed and returned. It then "ages" less than the other as seen from outside, so traversing from the moved mouth to the static one goes back in time.
  - Accelerating-wormhole metric:
    $$ds^2=-(1+glF\cos\theta)^2e^{2\Phi}dt^2+dl^2+r^2(d\theta^2+\sin^2\theta\,d\phi^2)$$
    where $F(l)$ vanishes for $l\le0$ and rises smoothly to 1 at the moving mouth, and $g=\gamma^2dv/dt$ is the mouth's acceleration in its own asymptotic rest frame.
  - Constraints: $g_{\max}S\ll1$ and $g_{\max}|dg/dt|^{-1}\gg S$, where $S$ is the distance through the wormhole.
- **Cauchy horizon:**
  - The CTC region is separated from the rest by a Cauchy horizon $H$. In 2-D Misner space $H$ is unstable: waves get a blue-shift factor $B=(1+v)^{1/2}/(1-v)^{1/2}$ per passage.
  - In the 4-D wormhole, $H$ has one closed null generator. The throat acts as a diverging lens with focal length $f\simeq r_0/2$, so amplitude falls by $f/D\simeq r_0/2D$ per round trip.
  - If $(f/D)B<1$, the horizon is stable against this classical instability. MTY "suspect" full stability, which would be a counterexample to strong cosmic censorship.
  - **This is a classical claim.** Quantum stability is treated in C2–C3.

### B2. Frolov & Novikov (1990), "Physical effects in wormholes and time machines"
- **Citation:** V. P. Frolov & I. D. Novikov, *Phys. Rev. D* **42**, 1057–1065 (1990). DOI 10.1103/PhysRevD.42.1057. Preprint TPI-MINN-90-1-T. OSTI 6357828.
- **Access:** ABSTRACT ONLY. The full text was not accessible: APS is paywalled, and there is no arXiv version or KEK scan.
- **Abstract claim:** the interaction of a wormhole "with the surrounding matter and with the external gravitational field almost inevitably transforms it into a time machine" *(quote)*.
- **Content via later sources (read in full):**
  - Schein, Aichelburg & Israel 1996 (B4) summarise it: for static wormhole spacetimes with **non-potential** gravitational fields, the clock-synchronisation time gap between the external path and the handle **grows with time**. A time machine forms once this gap exceeds the external light-travel time between the mouths.
  - Friedman et al. 1990 (§I, full text) cite it for "generic gravitational redshifts at the wormhole mouths due to generic external gravitational fields" producing CTCs.
- **Not verified:** the exact equations of Frolov & Novikov, and any statement in that paper about mouth masses or charges when matter passes. The abstract mentions "interaction ... with the surrounding matter" but gives no details.
- **Companion paper:** V. P. Frolov, *Phys. Rev. D* **43**, 3878–3894 (1991). DOI 10.1103/PhysRevD.43.3878. ABSTRACT ONLY. In a locally static, multiply connected spacetime with a **non-potential** gravitational field, the renormalised stress tensor diverges near the Cauchy horizon.

### B3. Visser (1993), "From wormhole to time machine: Comments on Hawking's chronology protection conjecture"
- **Citation:** M. Visser, *Phys. Rev. D* **47**, 554–565 (1993). DOI 10.1103/PhysRevD.47.554. arXiv:hep-th/9202090.
- **Access:** FULL TEXT READ (§§I–II, references).
- **Construction in three steps:**
  - (0) Acquire a traversable wormhole.
  - (1) Induce a time shift $T$.
  - (2) Bring the mouths together, which can be done arbitrarily slowly.
- **Time-shift mechanisms (eqs. 2.3, 2.4 and the unnumbered redshift formula):**
  - Relativity of simultaneity, with both mouths accelerated identically: $T=\gamma\beta\delta$, and mouth distance $\ell=\gamma\delta$.
  - Special-relativistic time dilation: $T=\int_i^f(\gamma-1)\,dt$.
  - **Gravitational redshift (credited to Frolov–Novikov):** place one mouth in a gravitational potential, giving
    $$T=\int_i^f\left(\sqrt{g_{00}}-1\right)dt .$$
    This form assumes the other mouth sits at unit lapse.
- **Time-machine condition:** quote: "A time machine forms once the physical distance between the wormhole mouths ℓ is less than the time–shift T." *(quote)* ($c=1$; throat length neglected.)
  - Closed "almost geodesics" through the throat have invariant length $\delta(t)=\sqrt{\ell(t)^2-T^2}$ (eq. 2.6).
- **Ex nihilo creation:** "topological constraints prevent the classical construction of wormholes ex nihilo" *(quote)*, citing Geroch and Tipler 1976/1977. Quantum creation may also be constrained by selection rules (Gibbons–Hawking; Giulini; Horowitz) or forbidden (Visser 1990).
- **Four logically possible responses:** Boring Physics, Chronology Protection, Novikov Consistency, Radical Rewrite. Visser argues that the problem lies in **bringing the mouths together**, not in inducing the time shift.
- **Abstract conclusion:** for the model problems, gravitational back-reaction becomes large before the Planck-scale cutoff, supporting Hawking.

### B4. Schein, Aichelburg & Israel (1996), "String supported wormhole spacetimes and causality violations"
- **Citation:** F. Schein, P. C. Aichelburg & W. Israel, *Phys. Rev. D* **54**, 3800–3805 (1996). DOI 10.1103/PhysRevD.54.3800. arXiv:gr-qc/9602053.
- **Access:** FULL TEXT READ (§§3, 5).
- **Setup:** a static axisymmetric wormhole between two Schwarzschild "particles" held apart by strings. Whenever the mouth masses differ, causality violation occurs. The spacetime is locally static, with no global timelike Killing field.
- **Time gap (eq. 34):** a constant-$T$ slice entering one mouth re-emerges at the other at $T'=CT$, so
  $$\Delta T_{\rm gap}=|(C-1)T| ,$$
  growing **linearly** in external time.
  - Comparison choice (eq. 19): $C=\sqrt{(1-2b_1/R)/(1-2b_2/R)}$, where $b_i$ are the mouth masses (geometrized) and $R$ is the mouth radius. In the weak field, $C-1\approx(b_2-b_1)/R$, which is the potential difference between the mouths. That reduction is my reading of eq. 19.
- **CTC condition (eq. 36):** the chronology horizon forms at $T_{CH}$ with $\Delta T_{NG}=(C-1)T_{CH}$, where $\Delta T_{NG}$ is the external null travel time between the mouths (eq. 35).

### B5. Frolov, Krtouš & Zelnikov (2023), "Ring wormholes and time machines"
- **Citation:** V. P. Frolov, P. Krtouš & A. Zelnikov, *Phys. Rev. D* **108**, 024034 (2023). DOI 10.1103/PhysRevD.108.024034. arXiv:2305.03887.
- **Access:** FULL TEXT READ (§VI, Discussion, Appendix).
- **Claims:**
  - In a Gibbons–Volkov ring wormhole, the locally static weak gravitational field of a massive shell around one mouth is **non-potential**: the potential is multivalued around loops through the wormhole.
  - The proper-time gap therefore grows linearly and CTCs form. Quote: "This process inevitably transforms such a traversable ring wormhole into a time machine." *(quote)*
- **Formulae (§VI):**
  - Time gap for a particle entering $D_-$ at $t_1$ and exiting $D_+$ at $t_2$: $\Delta t=-(e^{I_C}-1)\,t_2$ (eq. 6.1). Here $I_C$ is the potential difference around the non-contractible loop.
  - A null ray returns before emission once $t_2\ge T=B/(e^{I_C}-1)$ (eq. 6.6), with $B=\int e^{-2U}dz\approx\ell$.
  - Weak field: $T\approx\ell/I_C$ (6.7). With a thin shell of radius $r$ and mass $m$: $T\approx r\ell/m$ (6.8). Restoring units:
    $$T\approx\frac{RLc}{GM}\qquad(6.9)$$
    for a shell of radius $R$ and mass $M$ around one mouth, with mouths a distance $L$ apart.
  - The authors stress this is "a rather robust property" arising from any asymmetry of the mass distribution around the two mouths.

### B6. Check of the expected relation $d(\Delta T)/dt\sim gh/c^2$ and $T\sim(\text{separation})\,c/(gh)$
- **Verdict: CONFIRMED in the weak-field, short-throat, static-mouth idealisation, with refinements below.**
- **Rate of time-shift growth.** The rate is $\Delta\Phi/c^2$, where $\Delta\Phi$ is the Newtonian potential difference between the two mouths:
  - Visser: lapse difference $\sqrt{g_{00}}-1\approx\Phi/c^2$.
  - Schein et al.: $C-1$.
  - Frolov–Krtouš–Zelnikov: $e^{I_C}-1\approx I_C$.
  - For a uniform field, $\Delta\Phi=gh$, so $d(\Delta T)/dt\approx gh/c^2$.
- **Time to form a time machine.**
  - Short throat: $T_{\rm TM}\approx (L/c)\big/(\Delta\Phi/c^2)=Lc/\Delta\Phi$. This is FKZ eq. 6.9 with $\Delta\Phi=GM/R$. With a non-negligible internal throat length $\ell_{\rm int}$, use $L\to L+\ell_{\rm int}$.
  - **[DERIVED]** The $L+\ell_{\rm int}$ form follows from the round-trip condition $L/c+\ell_{\rm int}/c-\Delta T<0$. The sources take $\ell_{\rm int}\to0$.
- **Refinements to the expected relation:**
  - (i) The relevant quantity is the **potential difference between the mouths**. It equals $gh$ only in a uniform field.
  - (ii) "Separation" means the **external light-travel distance** between the mouths, plus throat transit time if that is not negligible.
  - (iii) The mouths must be held static, which needs supporting forces such as the strings in B4.
  - (iv) None of this includes quantum back-reaction near the chronology horizon (C2–C4).
  - (v) Frolov–Novikov's own formula was not accessed.
- **Numerical illustrations [DERIVED, not from source]:**
  - Earth surface, $g=9.807$ m s$^{-2}$, mouths stacked vertically with $L=h$: $T_{\rm TM}\approx c/g=3.06\times10^7$ s $\approx0.97$ yr, **independent of $h$** while $h\ll c^2/g$. The rate is $gh/c^2=1.09\times10^{-16}$ per metre of height.
  - One mouth on Earth's surface and the other far away: $GM_\oplus/(R_\oplus c^2)=6.96\times10^{-10}$, so $T_{\rm TM}\approx(L/c)/6.96\times10^{-10}$.
    - For $L=1$ AU: $T_{\rm TM}\approx7.2\times10^{11}$ s $\approx2.3\times10^4$ yr. This ignores the Sun's potential and orbital velocities.
  - Neutron-star-like compactness $GM/Rc^2=0.2$, using the exact lapse rate $1-\sqrt{1-0.4}=0.225$: $T_{\rm TM}\approx4.4\,L/c$.
- **Implication for a "portal gun":** any portal whose mouths sit at different gravitational potentials, or move relative to each other, generically accumulates a time shift. Unless that is actively compensated, it becomes a time machine on these timescales. This is the generic-instability point made by Frolov–Novikov, Friedman et al. §I, and Visser 1993.

### B7. Friedman, Morris, Novikov, Echeverria, Klinkhammer, Thorne & Yurtsever (1990), "Cauchy problem in spacetimes with closed timelike curves"
- **Citation:** *Phys. Rev. D* **42**, 1915–1930 (1990). DOI 10.1103/PhysRevD.42.1915.
- **Access:** FULL TEXT READ for pp. 1915–1917, 1924–1930: abstract, introduction, §II F, §II G–H, §IV and reference list. Source: scanned CaltechAUTHORS PDF, record aw0a8-ps286. §§II A–E and III were skimmed only.
- **Principle of self-consistency:** only globally self-consistent local solutions occur in the real Universe. It forbids "changing the past", at the cost of constraining Cauchy data.
- **Scalar field $\Box\Phi=0$:**
  - For traversable-wormhole spacetimes that evolve CTCs beyond a stable Cauchy horizon $\mathscr H$, self-consistency seems to place **no** constraints on data before $\mathscr H$. Data after $\mathscr H$ are constrained, but only mildly ("benign").
  - In flat, spatially and temporally closed 2-D spacetimes, benign ones are non-generic.
  - The authors conjecture that every 4-D asymptotically flat, stable spacetime of topology $\mathbb R\times(S-\text{pt})$ is benign. Wormholes are the case $S=S^1\times S^2$.
- **Billiard balls:**
  - Some initial data give two self-consistent classical histories (Fig. 7, Polchinski-type paradox).
  - In a sum-over-histories quantum treatment, there appears to be a unique self-consistent set of probabilities.
- **§II F, global conservation:**
  - $T_{\mu\nu}=\tfrac12(2\Phi_{;\mu}\Phi_{;\nu}-g_{\mu\nu}\Phi_{;\alpha}\Phi^{;\alpha})$ (eq. 8).
  - $S^\mu=-T^{\mu\nu}\xi_\nu$, $S^\mu{}_{;\mu}=0$ (9a), $\oint_{\partial\mathcal V}S^\mu d\Sigma_\mu=0$ (9b).
  - The conserved energy is
    $$E=\int_\Sigma T^{TT}dx\,dy\,dz+\int_{\mathcal B_*}T^{Tr}dA\,dT\qquad(12).$$
    The throat term counts energy that time-travels forward (positive) or backward (negative, crossing $\Sigma$ twice).
  - Quote: "The standard conservation laws remain valid globally, and in asymptotically flat, wormhole spacetimes they retain a natural, quasilocal interpretation." *(quote)*
  - **Caveat:** this is shown for **test fields on a fixed background with a timelike Killing field**, not for back-reacting matter changing the mouths' masses.
- **Footnote 5:** AWEC enforcement by QFT, "if it occurs at all, is spacetime dependent". Klinkhammer found AWEC holds for well-behaved states in Minkowski space but is violated in a toroidally identified Casimir-like state.

### B8. Echeverria, Klinkhammer & Thorne (1991), "Billiard balls in wormhole spacetimes with closed timelike curves: Classical theory"
- **Citation:** *Phys. Rev. D* **44**, 1077–1099 (1991). DOI 10.1103/PhysRevD.44.1077.
- **Access:** ABSTRACT ONLY. A scanned full text exists (CaltechAUTHORS x7s3m-f4d43) but was not read.
- **Claims:**
  - "Dangerous" initial trajectories, which would send the ball through the wormhole into a self-collision, generically have **infinite multiplicity** of self-consistent solutions, not zero. The Cauchy problem is thus ill-posed through "far too many solutions".
  - This holds for (ball radius) ≪ (wormhole radius) ≪ (mouth separation).
  - No zero-multiplicity initial data were found.
  - A promised paper II argues that quantum mechanics restores unique probabilities.

---

## C. Chronology protection

### C1. Tipler (1976). See A2: CTCs cannot evolve from regular initial data in singularity-free, asymptotically flat spacetimes.

### C2. Hawking (1992), "Chronology protection conjecture"
- **Citation:** S. W. Hawking, *Phys. Rev. D* **46**, 603–611 (1992). DOI 10.1103/PhysRevD.46.603.
- **Access:** FULL TEXT READ. Source: scanned copy of the published paper with OCR, hosted at https://lweb.cfa.harvard.edu/~loeb/Hawking_C.pdf. Numbers were verified on page images because the OCR dropped exponents.
- **Results:**
  - A CTC region created in a finite region without curvature singularities has a **compactly generated Cauchy horizon**, generally containing incomplete closed null geodesics.
  - If the causality violation develops from a **non-compact** initial surface, the **AWEC must be violated on the Cauchy horizon**. Hence finite cosmic strings cannot make CTCs.
  - The property of having a closed null generator is stable under metric perturbations.
- **Topology:** see A5. A Geroch-type theorem applies to a timelike tube between surfaces of different topology. With Gibbons–Hawking, wormholes come only in pairs.
- **Quantum argument (§VI, verified on page images, pp. 603–604 and 610):**
  - Near the horizon, the energy density seen by a geodesic observer scales as $Bd^{-1}s^{-3}$, where $s$ is the observer's proper distance to the horizon and $d$ is a typical length.
  - The metric perturbation therefore scales as $GBd^{-1}s^{-1}$.
  - With the Kim–Thorne cutoff at $s\sim t_P$: $\delta g\sim B\,\ell_P/d$, which is $\sim10^{-35}$ for $d\sim1$ m, versus about $10^{-19}$ detectable.
  - Hawking argues that the cutoff should instead be in the invariant distance $t$, with $t^2\sim d\,s$. A Planck-length cutoff in $t$ gives $\delta g\sim O(1)$, implying energy density near the Planck value of $10^{94}$ g/cc.
  - Even an "order 1" of $10^{-2}$ would be enormous compared with chemical binding energies of order $10^{-9}$–$10^{-10}$.
  - If $B<0$, vacuum polarisation is repulsive and resists horizon formation. If $B>0$, a singularity forms.
- **Conjecture:** "The laws of physics do not allow the appearance of closed timelike curves." *(quote)*
- **Observational argument (tongue in cheek):** "we have not been invaded by hordes of tourists from the future" *(quote)*.

### C3. Kim & Thorne (1991), "Do vacuum fluctuations prevent the creation of closed timelike curves?"
- **Citation:** S.-W. Kim & K. S. Thorne, *Phys. Rev. D* **43**, 3929–3947 (1991). DOI 10.1103/PhysRevD.43.3929.
- **Access:** ABSTRACT plus p. 3930 read (scanned, CaltechAUTHORS r7x78-rnb75). The detailed sections were not read.
- **Claims:**
  - For a massless conformally coupled scalar field, argued to hold to factors of order unity for other free fields, the renormalised stress tensor diverges at the Cauchy horizon of a wormhole time machine. Quote: "the divergence is extremely weak" *(quote)*.
  - Vacuum-polarisation metric distortion: $\delta g^{\rm VP}_{\mu\nu}\sim(\ell_P/D)(\ell_P/\Delta t)$, where $D$ is the mouth separation at horizon formation and $\Delta t$ the proper time to the horizon.
  - Quantum-gravity fluctuations: $\delta g^{\rm QG}\sim\ell_P/\Delta t\gg\delta g^{\rm VP}$.
  - Cutting off at $\Delta t\sim\ell_P$ gives $\delta g^{\rm VP}\sim\ell_P/D\sim10^{-35}$ for $D\sim1$ m. Kim & Thorne conjecture that CTCs form "without difficulty".
  - They note Hawking's counter-conjecture (cutoff at $D\Delta t\sim\ell_P^2$, giving $\delta g\sim1$) and say it is not obvious which, if either, is correct.
- **[DERIVED]** $\ell_P/1\,\text{m}=1.6\times10^{-35}$, consistent with their figure.

### C4. Kay, Radzikowski & Wald (1997), "Quantum field theory on spacetimes with a compactly generated Cauchy horizon"
- **Citation:** *Commun. Math. Phys.* **183**, 533–556 (1997). DOI 10.1007/s002200050042. arXiv:gr-qc/9603012.
- **Access:** ABSTRACT ONLY (arXiv abstract, which states both theorems). The body was not read.
- **Theorem 1:** at any **base point** of a compactly generated Cauchy horizon (a past terminal accumulation point of the generators), no extension of the field algebra from the initial globally hyperbolic region satisfies F-locality.
- **Theorem 2:** the two-point distribution of **any** Hadamard state on the initial region, extended as a bisolution, is singular at every base point. Its difference from a local Hadamard distribution is not bounded near $(x,x)$.
  - Hence $\langle\phi^2\rangle$ and the renormalised $\langle T_{\mu\nu}\rangle$ are ill-defined or singular at base points.
- **Interpretation (Visser 2003):** semiclassical gravity fails somewhere on any chronology horizon. Chronology protection therefore cannot be decided semiclassically.

### C5. Visser (2003), "The quantum physics of chronology protection"
- **Citation:** M. Visser, arXiv:gr-qc/0204022. In *The Future of Theoretical Physics and Cosmology* (Hawking 60th-birthday volume; Cambridge University Press 2003; INSPIRE lists eds. Gibbons & Shellard), pp. 161–176.
- **Access:** FULL TEXT READ.
- **Classical "fountain" argument:**
  - A photon on the closed null generator is boosted by $E\to e^hE$ per circuit, with $h=-2\oint\Re(\epsilon)\,dt$ (Newman–Penrose $\epsilon$).
  - The same geometry defocuses the wave packet. Which effect wins "depends", so no universal classical protection exists.
- **Semiclassical picture:**
  - Hadamard form $G(x,y)=\sum_\gamma\frac{\Delta_\gamma^{1/2}}{4\pi^2}\left[\frac1{\sigma_\gamma}+\nu_\gamma\ln|\sigma_\gamma|+\varpi_\gamma\right]$.
  - Non-trivial self-intersecting null geodesics give extra divergences: $\langle T_{\mu\nu}\rangle_R\sim\sum_{\gamma\ne\gamma_0}\Delta_\gamma^{1/2}\sigma_\gamma^{-2}t_{\mu\nu}$.
  - "Typically" back-reaction becomes large before metric fluctuations invalidate the manifold picture. **Exceptions** exist, such as the Roman-ring configuration and variants of the Grant and Misner spacetimes.
- **Bottom line:** the community faces "the daunting prospect of understanding full quantum gravity just to place notions of global causality on a firm footing" *(quote)*.
- Near the chronology horizon, short closed spacelike geodesics of length $\ell<L_P$ force trans-Planckian modes, $p\ell=n\hbar/\ell$.

---

## D. Topological censorship

### D1. Friedman, Schleich & Witt (1993), "Topological censorship", with erratum (1995)
- **Citation:** J. L. Friedman, K. Schleich & D. M. Witt.
  - *Phys. Rev. Lett.* **71**, 1486–1489 (1993). DOI 10.1103/PhysRevLett.71.1486.
  - Erratum: *Phys. Rev. Lett.* **75**, 1872 (1995). DOI 10.1103/PhysRevLett.75.1872.
  - arXiv:gr-qc/9305017 (v2, June 1995, incorporating the correction).
- **Access:** FULL TEXT READ (arXiv v2).
- **Theorem 1 (precise):**
  - If an asymptotically flat, globally hyperbolic spacetime satisfies the **averaged null energy condition** (ANEC: $\int d\lambda\,T_{ab}k^ak^b\ge0$ along every inextendible null geodesic), then every causal curve from $\mathscr I^-$ to $\mathscr I^+$ can be deformed to a curve $\gamma_0$ in a simply connected neighbourhood of $\mathscr I$, relative to $\mathscr I$.
  - Plain statement: "any topological structure collapses too quickly to allow light to traverse it" *(quote)*.
- **Proof:** a non-deformable curve lifts to the universal cover, where it must pass through an outer-trapped surface (ANEC focusing). That contradicts Lemma 2, a variant of Hawking–Ellis Prop. 9.2.8. The authors say this is similar to MTY's argument that 3-D wormholes are not traversable.
- **What the 1995 correction fixed:**
  - The earlier "Theorem 2" claimed passive censorship of $K(\pi,1)$ prime factors. It was false (Burnett's counterexample) because of a misreading of "apparent horizon".
  - The **active** censorship theorem stands.
  - The RP³ geon shows that topology can be **passively** observed via signals from a past singularity (white hole).
- **Weakening the energy condition:**
  - Any condition ensuring conjugate points for outer-trapped null congruences suffices. This suggests the theorem may survive in semiclassical gravity.
  - However, Wald–Yurtsever (1991) showed ANEC is violated by free-field renormalised stress tensors in generic spacetimes.
- **Discrepancy:** the arXiv abstract says "null energy condition", but Theorem 1 assumes the averaged NEC.
- **Implication:** a traversable wormhole connecting regions that can communicate with infinity requires violating ANEC, or of global hyperbolicity or asymptotic flatness.

### D2. Galloway, Schleich, Witt & Woolgar (1999), "Topological censorship and higher genus black holes"
- **Citation:** *Phys. Rev. D* **60**, 104039. arXiv:gr-qc/9902061.
- **Access:** ABSTRACT ONLY.
- **Claims:**
  - Extends the principle of topological censorship to timelike $\mathscr I$ (asymptotically AdS) under reasonable conditions.
  - Rephrased: every loop in the domain of outer communication is homotopic to a loop in $\mathscr I$.
  - Consequence: the sum of the horizon genera is bounded by the genus of the cut of infinity.

---

## E. Wormhole-mouth dynamics: mass, charge, momentum, and what traversal does

### E1. Charge without charge: Misner & Wheeler 1957 (A10)
Field lines threading the wormhole make the two mouths look oppositely charged. The arXiv-era sources below describe what happens when a charge actually traverses.

### E2. Susskind (2005), "Wormholes and time travel? Not likely", and Susskind (2005), "Rebuttal to a paper on wormholes"
- **Citations:** L. Susskind, arXiv:gr-qc/0503097 (v3) and arXiv:gr-qc/0504039. Not peer-reviewed (INSPIRE: no journal).
- **Access:** FULL TEXT READ (both).
- **Bookkeeping (gr-qc/0503097, §§2–3, in 2+1-D for visualisation):**
  - **Charge:** the flux lines of a charge passed from A to B "thread back through the wormhole". Seen from side B, "an opposite charge has formed on the wormhole mouth" *(quote)*. Seen from side A, the charge is unchanged but now resides on mouth A.
  - **Mass:** the conical deficit stays behind. On side A the deficit appears to come from mouth A. Mouth B "appears to have lost whatever mass is carried by the mass point that it spit out" *(quote)*.
  - Net effect: the entrance mouth gains the mass and charge; the exit mouth loses an equal amount. The total measured from each side is unchanged.
- **Susskind's original conclusion:** because ADM energy transfer through the wormhole is exactly zero, the energy–time uncertainty principle makes the transit time completely uncertain, $\langle(t_B-t_A)^2\rangle=\infty$, so the wormhole is useless.
- **Self-rebuttal (gr-qc/0504039):**
  - The original conclusion assumed mouths in energy (flux) eigenstates. With a well-defined conjugate variable (the Wilson-loop phase, or for energy the identification time shift $\tau$), coherence survives.
  - For charge, if a charge $n$ passes A→B, "the flux gets excited so that f = n" *(quote)*.
  - For mass, the energy of the pair is $M_1+M_2$, independent of the mass difference. So there is no kinetic term spreading $\tau$.
  - Susskind still states a personal "prejudice" that wormholes do not make sense.
- **Caveats:** a 2+1-D heuristic only, and not peer-reviewed. But the mass/charge bookkeeping is **not** retracted in the rebuttal; only the uncertainty conclusion is.

### E3. Gratus, Kinsler & McCall (2019), "Evaporating black-holes, wormholes, and vacuum polarisation: must they always conserve charge?"
- **Citation:** *Found. Phys.* **49**, 330–350 (2019). DOI 10.1007/s10701-019-00251-5. arXiv:1904.04103.
- **Access:** FULL TEXT READ (§V).
- **The standard view they describe:**
  - They call it "the accepted notion that a charge passing through a wormhole necessarily leads to an additional (effective) charge on the wormhole's mouth" *(quote)*, citing Visser's book, Susskind 2005 and Wheeler 1957.
  - On their Fig. 6 picture: after $+q$ goes from $M_I$ to $M_{II}$, the mouth in $M_I$ shows $+q$. In $M_{II}$ there is a dipole-like field between $-q$ on the mouth and the free $+q$.
  - Repeated transits ($n$ loops) give mouth charges $\pm nq$.
- **Their proposal (dissent):**
  - Allow gauge freedom in the excitation fields $\mathbf D,\mathbf H$ (topologically nontrivial spacetime).
  - Then the effective mouth charge depends on the charge's current distance from the throat: $Q_I=q\,\zeta(r_p)$ with $\zeta=\tfrac12+\delta r_p/[2(r_{th}^2+\delta r_p^2)^{1/2}]$. It does **not** depend on transit history.
- **Caveat:** this is a proposed modification of the treatment of Maxwell theory. It is not standard and has not been tested.

### E4. Krasnikov (2008), "Electrostatic interaction of a pointlike charge with a wormhole"
- **Citation:** *Class. Quantum Grav.* **25**, 245018. arXiv:0802.1358.
- **Access:** ABSTRACT ONLY.
- **Claims:**
  - The potential splits into a part fixed by the charge's value and location, and a source-free part.
  - All source-free potentials differ only in the **flux through the throat**. This lets the flux be read as the wormhole's "charge", in line with Wheeler's charge without charge.
  - A self-force acts on the charge, computed in the short-throat limit. The result disagrees with Khusnutdinov–Bakhmatov.

### E5. Mass and momentum: what is and is not established
- **Mass/energy.** The expected bookkeeping is: the entrance mouth's exterior mass rises by the traverser's energy, the exit mouth's falls by the same amount, and the total measured at infinity is conserved.
  - Support: Susskind 2005 (2+1-D heuristic, E2); Gratus et al. (who call it the standard view and cite Visser's book); and the global conservation results of Friedman et al. 1990 (B7), which hold for test fields.
  - **I found no peer-reviewed 3+1-D calculation of the mass shift that I could access.** Visser's *Lorentzian Wormholes* (AIP Press, 1995) is the usual citation and is **BIBLIOGRAPHIC ONLY**.
- **Momentum / recoil.**
  - **No 3+1-D primary source found.** Treating mouths as carrying the traverser's 4-momentum is an extrapolation of the same Gauss-law logic. **[INFERENCE, not verified]**
  - The closest verified analogue is Maldacena, Stanford & Yang 2017 (G3, §3, full text). In nearly-AdS₂ (Jackiw–Teitelboim) gravity, the SL(2) charges of the boundary trajectories are conserved.
    - Emitting, absorbing or reflecting a bulk particle gives the boundary trajectory a **kick**. In their words, two-dimensional energy-momentum is conserved at the vertex, and the kick is "towards the outside", pushing the boundaries apart.
    - In that setting the boundary ADM energy is **not** conserved, because energy is injected by operator insertions.
- **Gravity "leaking" through.** Dai & Stojkovic (2019, below) argue that fluxes, gravitational included, are not separately conserved on either side of a traversable wormhole. Objects near one mouth feel those near the other.
  - **Citation:** D.-C. Dai & D. Stojkovic, "Observing a wormhole", *Phys. Rev. D* **100**, 083513 (2019). arXiv:1910.00429. ABSTRACT ONLY.
  - Their example: a few-solar-mass star orbiting Sgr A* on the far side would perturb S2's orbit at the $10^{-6}$ m s$^{-2}$ level.

### E6. Dynamical response of the throat to traversal (stability)
- **Shinkai & Hayward (2002), "Fate of the first traversible wormhole: black-hole collapse or inflationary expansion"**
  - **Citation:** *Phys. Rev. D* **66**, 044005. arXiv:gr-qc/0205041.
  - **Access:** ABSTRACT ONLY.
  - Numerical study of the Ellis (ghost-scalar) wormhole. It is unstable against Gaussian pulses of either normal or exotic massless scalar field.
  - Net positive input energy collapses it to a black hole; net negative input energy makes it inflate.
  - Quote: "For normal matter, such as a traveller traversing the wormhole, collapse to a black hole always results." *(quote)*
  - Carefully balanced additional ghost radiation can maintain it "for a limited time".
  - The inflating branch gives a mechanism for inflating a Planck-size foam wormhole to macroscopic size.
- **Hayward (2009), "Wormhole dynamics in spherical symmetry"**
  - **Citation:** *Phys. Rev. D* **79**, 124001. arXiv:0903.5438.
  - **Access:** FULL TEXT READ (§§IV–V).
  - Mouths are defined as temporal outer trapping horizons. The **NEC is necessarily violated at a mouth** ($T_{++}<0$).
  - Laws of wormhole dynamics: a first law $m'\cong\kappa A'/8\pi+wV'$, and a second law of reversed sign.
  - Enlarging needs negative energy followed by positive energy; the reverse order shrinks the throat.
  - A traversable wormhole "can collapse to a black hole if its negative-energy source fails, or if enough positive-energy matter or radiation is pumped in" *(quote)*.
- **Gao, Jafferis & Wall (2016)** (G2, full text §5): in their AdS setting, a light-speed traveller contributes to $T_{VV}$ but not $T_{UU}$. At linear order it blocks traversal in the **opposite** direction but does not close the wormhole in its own direction. They presume a limit on how much can get through, since the far black hole cannot radiate more than its mass.
- **Maldacena, Milekhin & Popov** (G4): "If enough energy is sent through the wormhole mouth, a pair of horizons will develop." *(quote)*

### E7. Constructing and enlarging wormholes from black holes (Hayward–Koyama)
- **Hayward & Koyama (2004), "How to make a traversable wormhole from a Schwarzschild black hole"**
  - **Citation:** *Phys. Rev. D* **70**, 101502(R) (2004). DOI 10.1103/PhysRevD.70.101502. arXiv:gr-qc/0406080.
  - **Access:** FULL TEXT READ.
  - **Construction:**
    - Start from Schwarzschild with mass $M$, including part of the black-hole region.
    - Beam in symmetric impulsive **phantom** (negative-energy) null shells of energy $\mu<0$ from both sides, followed by constant-profile phantom radiation (Vaidya regions).
    - The region left between the receding impulses is a **static traversable wormhole** supported by two opposing phantom radiation streams.
  - **Key relations** (active mass $E=(1-g^{-1}(dr,dr))r/2$; jump formula $[E]_\pm=-\wp\cdot dr$):
    - Throat radius: $a/2=M+\mu$, which requires $|\mu|<M$. The throat is **smaller** than the original horizon, $a<2M$.
    - Timing: $V_0=-a_*=2(M+\mu)+2M\ln(-\mu/M)$.
  - **Enlargement:** beam in $\mu_1<0$ (while switching off the supporting radiation), then $\mu_2>0$. This gives $a_2-a_1=-2(\mu_1+\mu_2)$, so $|\mu_1|>\mu_2$. Reversing the order shrinks the throat. They describe it as a controllable, apparently stable process, not runaway inflation.
  - **Important caveats stated by the authors:**
    - The static phantom-radiation wormhole is **not asymptotically flat**.
    - The construction starts from the **eternal** (maximally extended) Schwarzschild solution, which already has the wormhole topology. Quote: "topology change is classically forbidden unless causal loops exist" *(quote)*.
    - Quote: "Black holes formed by gravitational collapse of supernova remnants would presumably not have the appropriate topology." *(quote)*
    - They speculate about Planck-size black holes from spacetime foam as starting points.
    - The phantom radiation is an **idealised exotic matter model**.
- **Koyama & Hayward (2004), "Construction and enlargement of traversable wormholes from Schwarzschild black holes"**
  - **Citation:** *Phys. Rev. D* **70**, 084001. arXiv:gr-qc/0406113.
  - **Access:** ABSTRACT ONLY. This is the long version, with the Barrabès–Israel matching.
- **Hayward (2002), "Black holes and traversible wormholes: a synthesis"**
  - **Citation:** arXiv:gr-qc/0203051. Unpublished per INSPIRE.
  - **Access:** ABSTRACT ONLY.
  - A 2-D dilaton-gravity model covering construction of wormholes from black holes, operation for transport including back-reaction, maintenance, and collapse.

---

## F. Can a portal be opened at a remote location instantly? Causal propagation limits

### F1. Hawking & Ellis (1973), *The Large Scale Structure of Space-Time*, Ch. 7 "The Cauchy problem in General Relativity", pp. 226–255
- **Citation:** Cambridge University Press 1973. Chapter DOI 10.1017/CBO9780511524646.008.
- **Access:** FULL TEXT READ of the chapter (Cambridge Core chapter PDF).
- **Chapter introduction, p. 226:**
  - Given suitable data on a spacelike 3-surface $\mathscr S$, there is a **unique maximal future Cauchy development** $D^+(\mathscr S)$.
  - The metric on a subset $\mathscr U\subset D^+(\mathscr S)$ **depends only on initial data on $J^-(\mathscr U)\cap\mathscr S$**, continuously if $\mathscr U$ has compact closure.
  - This shows the Einstein equations satisfy the causality postulate that "signals can only be sent between points that can be joined by a non-spacelike curve" *(quote)*.
- **Prop. 7.4.5 (linear second-order hyperbolic equations):** the solution on $\mathscr V\subset D^+(\mathscr H)$ is fixed by data on $\mathscr H\cap J^-(\mathscr V)$.
- **§7.6:** existence and uniqueness of the maximal development for $W^{4+\alpha}$ data in empty space, by an argument following Choquet-Bruhat & Geroch 1969. §7.7 extends this to matter obeying reasonable hyperbolic equations.
- **Implication:** in a globally hyperbolic spacetime, you cannot change the geometry at a distant location B (for example, open a mouth there) except through causal influences that reach B at or below light speed. Doing it "instantly" would need a pre-existing non-trivial causal structure, such as an existing wormhole.

### F2. Choquet-Bruhat & Geroch (1969), "Global aspects of the Cauchy problem in general relativity"
- **Citation:** *Commun. Math. Phys.* **14**, 329–335 (1969). DOI 10.1007/BF01645389.
- **Access:** ABSTRACT ONLY.
- **Claims:** any constraint-satisfying initial data have a **maximal development**, which extends every other development. Any solution with a Cauchy surface embeds in exactly one maximal development.

### F3. Wald (1984), *General Relativity*, Ch. 10
- **Access:** NOT ACCESSED. Section and theorem numbers could not be verified. Use Hawking & Ellis Ch. 7 (F1) instead.

### F4. Krasnikov (1998), "Hyperfast travel in general relativity"; Everett & Roman (1997), "A superluminal subway: the Krasnikov tube"
- **Krasnikov 1998**
  - **Citation:** *Phys. Rev. D* **57**, 4760–4766. arXiv:gr-qc/9511068.
  - **Access:** ABSTRACT ONLY.
  - Under reasonable assumptions, "in globally hyperbolic spacetimes the traveller cannot hasten reaching the destination" *(quote)*. Round trips can nevertheless be made arbitrarily short as seen from Earth.
- **Krasnikov 2003** (I1, full text) restates the time cost of building a shortcut, which assumes no tachyons: "a shortcut that would allow one to reach the star in 1 yr, cannot be built in less than 99 yr" *(quote)*, for a star 100 light-years away.
- **Everett & Roman 1997**
  - **Citation:** *Phys. Rev. D* **56**, 2100–2108. arXiv:gr-qc/9702049.
  - **Access:** ABSTRACT ONLY.
  - In the Alcubierre warp bubble, an observer at the centre is causally separated from the bubble wall: "such an observer can neither create a warp bubble on demand nor control one once it has been created" *(quote)*.
  - Two Krasnikov tubes can make a time machine. Tubes need thin layers of negative energy and large total negative energy.

### F5. Maldacena & Susskind (2013), §3.2 "No creation by LOCC". Full entry in G1.
- By analogy with entanglement: "there does not seem to be any way to create a bridge between them without preexisting bridges" *(quote)*.
- You can instead create a **neighbouring** black-hole pair connected by an Einstein–Rosen bridge and then **separate** them. Mouths must be made together and carried apart at or below light speed.

---

## G. Quantum gravity, ER=EPR and traversability

### G1. Maldacena & Susskind (2013), "Cool horizons for entangled black holes"
- **Citation:** J. Maldacena & L. Susskind, *Fortschr. Phys.* **61**, 781–811 (2013). DOI 10.1002/prop.201300020. arXiv:1306.0533.
- **Access:** FULL TEXT READ (§§1, 3).
- **Claims:**
  - The Einstein–Rosen bridge between two black holes is created by EPR-like correlations of their microstates (the thermofield-double state). Black-hole pair creation in a magnetic field naturally produces this state.
  - **Conjecture:** $\mathrm{ER}=\mathrm{EPR}$ (eq. 3.1) holds in general. Even a singlet pair may be joined by a Planckian, highly quantum "bridge" that "probably cannot be described by classical geometry".
- **Non-traversable by assumption:**
  - ER bridges do not allow signalling between exteriors when positive energy conditions hold.
  - Footnote 1: "We will assume that wormholes remain un-traversable in the quantum theory. If this were not true, the ER=EPR connection would be wrong." *(quote)*
  - §3.1: no superluminal signals, by analogy with no-signalling for entanglement.
- **Creation:** see F5 (no creation by LOCC). You may also merge many small entangled black-hole pairs on each side.
- **Status:** an explicitly stated conjecture. It concerns **non-traversable** bridges.

### G2. Gao, Jafferis & Wall (2017), "Traversable wormholes via a double trace deformation"
- **Citation:** P. Gao, D. L. Jafferis & A. C. Wall, *JHEP* **12** (2017) 151. DOI 10.1007/JHEP12(2017)151. arXiv:1608.05687 (2016).
- **Access:** FULL TEXT READ (§§1, 5).
- **Claims:**
  - A **direct coupling between the two boundaries** of an eternal BTZ black hole produces negative averaged null energy. Its back-reaction makes the ER bridge traversable.
  - No traversable state can exist under the decoupled Hamiltonian $H_L+H_R$; that would contradict AdS/CFT.
  - The wormhole "cannot be used to violate causality" *(quote)*. The coupling fixes the relative time between boundaries, which excludes CTCs.
  - For two black holes in the same space, traversability depends on a causal path through the ambient space. Quote: "traversable wormholes are like getting a bank loan: you can only get one if you are rich enough not to need it" *(quote)*.
  - It has a teleportation interpretation, but the channel must be quantum. Projective measurement would not open the wormhole.

### G3. Maldacena, Stanford & Yang (2017), "Diving into traversable wormholes"
- **Citation:** *Fortschr. Phys.* **65**, 1700034 (2017). DOI 10.1002/prop.201700034. arXiv:1704.05333.
- **Access:** FULL TEXT READ (§§2.5, 3, relevant parts).
- **Claims:**
  - **Information bound (§2.5):** "we cannot send more information through the wormhole than we transferred in order to set up the OO interaction" *(quote)*. The parametric bound is $N_{\rm send}\lesssim g\lesssim N_{\rm bits}$.
  - High-momentum signals close the wormhole.
  - The protocol is equivalent to teleportation; the traveller "feels nothing special".
  - The same formula holds for SYK.
  - SL(2)-charge "kicks" to the boundaries are covered in E5.

### G4. Maldacena, Milekhin & Popov (2018; published 2023), "Traversable wormholes in four dimensions"
- **Citation:** *Class. Quantum Grav.* **40**, 155016 (2023). DOI 10.1088/1361-6382/acde30. arXiv:1807.04726 (v3, 2020).
- **Access:** FULL TEXT READ (§§1, 5.5, 8, 9).
- **Setup:**
  - Einstein–Maxwell theory plus massless charged fermions.
  - The two mouths are near-extremal **magnetically charged** black holes of opposite charge. They are kept apart by mutual rotation and eventually merge through radiation.
  - Lowest-Landau-level fermions give $q$ 2-D fields. Their Casimir-like negative energy along closed field lines violates the ANEC along **non-achronal** null lines, so there is no conflict with achronal ANEC.
- **"Long" wormhole:** "it takes longer to go through the wormhole than through the ambient space" *(quote)*. Specifically $\pi\ell>d$ always; for $d\gg d_0\propto q^2\ell_P$, $\pi\ell$ grows linearly with coefficient about 2.35.
- **Why short wormholes are excluded:** short traversable wormholes between distant points (which would violate causality) are forbidden by Einstein's equations plus **achronal ANEC**. Achronal ANEC is proven in flat-space QFT (their refs 5, 6).
- **Standard Model embedding:**
  - The overall size (the mouth separation $d$) must be **below the electroweak scale** (about 1/TeV) so the fermions can be treated as massless.
  - The authors say it requires "no exotic matter": Standard Model matter suffices, with effective $N_f=54$.
- **Traversal time:** the proper time to traverse is of order $r_E\sim q$, while the time seen from outside is $\pi\ell\propto q^2$.
- **Fragility:** see E6.
- **Formation:** open; see A12.
- **Relevance:** this is the only fully controlled 4-D traversable wormhole found here. It is **microscopic, gives no shortcut, and has no known formation route**.

### G5. Horowitz, Marolf, Santos & Wang (2019). See A11 (quantum nucleation of a traversable wormhole).

---

## H. The 2022 "wormhole on a quantum processor" experiment and its critique

### H1. Jafferis, Zlokapa, Lykken, Kolchmeyer, Davis, Lauk, Neven & Spiropulu (2022), "Traversable wormhole dynamics on a quantum processor"
- **Citation:** *Nature* **612**, 51–55 (2022), issue 7938, published online 30 Nov 2022. DOI 10.1038/s41586-022-05424-3. No arXiv version (INSPIRE).
- **Access:**
  - Main text: **ABSTRACT ONLY**. Nature page metadata says `isAccessibleForFree: false`.
  - Supplementary Information: **FULL TEXT READ** (33 pp., from the CaltechAUTHORS record 35vq2-3j836).
  - Caltech press release: read in full, with quotes verified against the raw HTML.
- **What was done (abstract plus SI §V):**
  - Machine learning was used, in classical simulation, to construct a **sparsified SYK model**. The loss function was based on the asymmetric mutual-information signature of wormhole teleportation, plus a sparsity penalty.
  - "164 two-qubit gates on a nine-qubit circuit" *(quote, abstract)*, run on **Google Sycamore**.
  - SI §V.A: the sparsification reduced an $N=10$ SYK model to a sparse $N=7$ model.
    - 7 Majoranas per side require 7 qubits (two fermions per qubit).
    - A reference qubit and an injected qubit bring the total to **9 qubits**.
  - Jordan–Wigner encoding; **single first-order Trotter step** for $e^{-iHt}$ and $e^{i\mu V}$; **164 CZ gates**. The gate count is the same for all $t_0,t_1>0$ and $\mu\ne0$.
  - The thermofield-double state was prepared by a hardware-efficient VQE ansatz with **13 CZ gates**, giving >99% overlap in classical simulation.
  - Median XEB errors: phased-XZ $5.8\times10^{-4}$ [5.2, 7.2]; CZ $3.4\times10^{-3}$ [2.6, 4.2] (SI Table I).
  - Measurement: second-Rényi mutual information $I_{PT}$. Each run used 10,000 shots per Pauli basis (9 bases) × 15 values of $t$ × 2 signs of $\mu$. Positive and negative $\mu$ were interlaced to cancel drift; for example, 28 runs at $t_0=2.8$.
  - The **learned Hamiltonian** ("Model 1", as quoted by Kobrin et al. and the authors' reply) has 7 Majoranas and 5 mutually commuting quartic terms:
    $$H=-0.36\psi^1\psi^2\psi^4\psi^5+0.19\psi^1\psi^3\psi^4\psi^7-0.71\psi^1\psi^3\psi^5\psi^6+0.22\psi^2\psi^3\psi^4\psi^6+0.49\psi^2\psi^3\psi^5\psi^7 .$$
  - Total Hamiltonian: $H_{\rm tot}=H_L+H_R+\mu_{MQ}H_{\rm int}$, with $H_{\rm int}=i\sum_j\psi_L^j\psi_R^j$. The protocol equals one Trotter step of the Maldacena–Qi eternal traversable wormhole.
  - The signal asymmetry is between $\mu=-12$ ("negative energy shockwave", wormhole teleportation) and $\mu=+12$.
  - With $\mu=0$, $I_{PT}=0$ at all times: "the left and right sides cannot communicate information" (SI Fig. S35). **The direct L–R coupling is essential.**
- **What was claimed (abstract):** the sparsified model "preserves key properties of the traversable wormhole physics". These are listed as perfect size winding, coupling consistent with a negative-energy shockwave, a Shapiro time delay, causal time-ordering, and scrambling and thermalization. The work is "a step towards a program for studying quantum gravity in the laboratory".
- **What was not claimed (Caltech press release, 30 Nov 2022, verified in raw HTML):**
  - "The experiment has not created an actual wormhole (a rupture in space and time)" *(quote)*.
  - Spiropulu: it "does not substitute for direct probes of quantum gravity" *(quote)*.
  - The process was "equivalent, at least in some ways," to information traversing a wormhole.
  - Preskill: "a reasonable caricature of what the gravitation picture predicts" *(quote)*.
  - Spiropulu: with 50% higher error rates "the signal would have been entirely obscured".
- **SI caveats:**
  - Experimentally measured fidelity was already below half the noiseless fidelity (SI §IV).
  - The SI's outlook is towards $N=O(100)$ "mesoscopic" regimes. It does not claim a semiclassical bulk at $N=7$.
- **Internal inconsistency in the SI:** §V.A says the model is sparse $N=7$, but §IV (p. 13, verified on page image) refers to "the Hamiltonian of the main text ($N = 5$ with 5 terms)".

### H2. Author Correction (2025)
- **Citation:** *Nature* **640**, E32 (2025), published 4 Apr 2025, issue 24 Apr 2025. DOI 10.1038/s41586-025-08788-4.
- **Access:** FULL TEXT READ (short notice).
- **Content:** the caption of Fig. 3b was changed from "Two-point function (solid) and four-point function (dashed), indicating thermalization time..." to "...averaged over all fermions, indicating thermalization time..." in the HTML and PDF.
- **Link to the critique:** this matches Kobrin et al.'s criticism (i), that thermalization appears only after averaging. The correction notice itself does not cite the comment. **No Nature "Matters Arising" exchange was found.**

### H3. Kobrin, Schuster & Yao (2023), "Comment on 'Traversable wormhole dynamics on a quantum processor'"
- **Citation:** arXiv:2302.07897 (15 Feb 2023). Not journal-published per INSPIRE.
- **Access:** FULL TEXT READ.
- **Criticisms:**
  - **(i) No thermalization.** "the learned Hamiltonian does not exhibit thermalization" *(quote)*. Individual two-point functions $G_i(t)=\mathrm{Re}\langle\psi^i(t)\psi^i(0)\rangle_\beta$ show strong revivals. The decay in Fig. 3b of the original is an artifact of averaging over seven operators plus a $\psi^8$ that does not enter $H$. The same holds for four-point functions.
  - **(ii) Training bias.** The teleportation signal resembles SYK only for the trained operators $\psi^1,\psi^2$. Untrained pairs show large oscillations and multiple peaks.
  - **(iii) Size winding is generic.**
    - Perfect size winding is generic for small fully-commuting models. Model 1 with random coefficients, or with random commuting terms, or a random all-to-all Ising model with 4 spins, all show high phase alignment $\bar r$.
    - It decreases with system size and is absent in non-commuting models of equal size.
    - Phase-alignment ratio: $r_l=|\sum_{|P|=l}c_P^2|/\sum_{|P|=l}|c_P|^2$.
    - Counting: in fully-commuting models a time-evolved operator has at most $2^{\lfloor N/2\rfloor}$ strings, versus $2^{N-1}$ in non-commuting ones. That is 8 coefficients in Model 1, against 64 for $N=7$ SYK and 512 for $N=10$.
    - The SYK model at $N=10$ shows only "damped" winding, $r_l\sim0.75$.
- **Central tension:** small commuting models size-wind but do not thermalize; the reverse holds for larger or non-commuting models. None of the authors' models satisfies both.

### H4. Jafferis et al. (2023), "Comment on 'Comment on "Traversable wormhole dynamics on a quantum processor"'"
- **Citation:** arXiv:2303.15423 (27 Mar 2023). CaltechAUTHORS:20230316-190343094; FERMILAB-PUB-23-120-ETD.
- **Access:** FULL TEXT READ (§§I–IV).
- **Rebuttal:**
  - The comment agrees that size winding is the mechanism, and that the system thermalizes and scrambles **at the teleportation time** ($t\approx2.8$).
  - Quote: "The objections of Kobrin et al. [1] concern counterfactual scenarios outside of the experimentally implemented protocol." *(quote)*
  - (1) The coupled eternal-wormhole Hamiltonian $H_{\rm tot}$ thermalizes with no revivals. Adding a non-commuting term $H_1=0.3\psi^1\psi^2\psi^3\psi^5$ suppresses single-sided revivals and leaves teleportation at $t\approx2.8$ unchanged.
  - (2) All fermions size-wind, but at different times, $2\lesssim t\lesssim5$. They read this as different bulk masses: slower-thermalizing fermions are lighter and traverse later. Example: $\psi^4,\psi^7$ near $t\approx4$.
  - (3) Similar Hamiltonians having similar properties is "unsurprising". They concede "there always exists a non-bulk explanation of its behavior" *(quote)*.
- **Counting:** at $t=2.8$ each teleported fermion spreads onto 8 operators with maximum size 5, "36 operators" in an $N=7$ SYK model without commuting structure. Kobrin et al. said 64 for $N=7$ SYK. **Discrepancy in counting, unresolved here.**

### H5. Brown, Gharibyan, Leichenauer, Lin, Nezami, Salton, Susskind, Swingle & Walter (2023), "Quantum Gravity in the Lab. I: Teleportation by Size and Traversable Wormholes"; companion Nezami et al. (2023), Part II
- **Citations:**
  - Part I: *PRX Quantum* **4**, 010320 (2023). DOI 10.1103/PRXQuantum.4.010320. arXiv:1911.06314.
  - Part II: *PRX Quantum* **4**, 010321 (2023). arXiv:2102.01064.
- **Access:** Part I: abstract plus introduction read (full text downloaded; §I read). Part II: ABSTRACT ONLY.
- **Claims (Part I):**
  - Teleportation protocols with TFD states, scrambling, and a **weak coupling between the halves** reproduce GJW/MSY wormhole behaviour.
  - "Teleportation by size": transmission through a semiclassical wormhole corresponds to **size winding**. Imperfect size winding generalises this to systems without a clean geometry.
  - **Important caveat:** a form of signalling also works at high temperature and late times in generic chaotic systems, even though it "does not correspond to a signal going through a geometrical wormhole" *(quote, abstract)*. It is an interference effect instead.
  - Proposed platforms: Rydberg arrays and trapped ions.
  - The phenomenon "has as its most compact explanation a story involving emergent spacetime dimensions" *(quote)*.
- **Claims (Part II):** perfect size winding must hold for systems with a nearly-AdS₂ bulk. The paper studies SYK, random matrices and spin chains.
- **Status of the experiment:** all of this is **holographic simulation**. Information moves through a quantum circuit with an explicit L–R coupling. No spacetime shortcut is created, and nothing goes faster than light.

---

## I. A dissenting view on quantum-inequality limits: Krasnikov

### I1. Krasnikov (2003), "The quantum inequalities do not forbid spacetime shortcuts"
- **Citation:** S. Krasnikov, *Phys. Rev. D* **67**, 104013 (2003). DOI 10.1103/PhysRevD.67.104013. arXiv:gr-qc/0207057 (v3).
- **Access:** FULL TEXT READ (§§I–III, partly).
- **Definition:** a "shortcut" is a globally hyperbolic spacetime that is Minkowski outside a cylinder, yet causally connects some points that are spacelike-separated in Minkowski space.
- **Standard argument he contests (§II B):**
  - The quantum inequality is $\bar\varrho_\chi\ge-A\Delta^{-4}$, assumed valid for $\Delta\lesssim\ell=(\max|R_{\alpha\beta\gamma\delta}|)^{-1/2}$.
  - Combining it with the Einstein equations gives $|\varrho|\gtrsim1$ in Planck units, about $5\times10^{93}$ g/cm³.
  - That leads to $E^-_{\rm tot}\sim|\varrho S_i\delta|\approx10^{32}M_\odot$ for metre-scale shortcuts (eq. 9). The figure for a 100 m Alcubierre bubble is about $10^{67}$ g ≈ $10^{34}M_\odot$, citing Pfenning & Ford.
- **His counter-claims, by explicit examples:**
  - (1) The quantum inequality does not always imply large densities.
  - (2) Large densities need not give large $E^-_{\rm tot}$.
  - (3) Large $E^-_{\rm tot}$ may be physically meaningless.
  - He also notes that the quantum inequality "has never been proved" in non-Minkowskian spacetimes (as of 2003), and that Olum–Graham found violations for interacting fields.
- **The "portal" (§III C 1):**
  - A non-spherical, globally hyperbolic, static wormhole: two flat "hoops" of radius $\rho_0$ and thickness about $\eta_\varepsilon^2$. He calls it a globally hyperbolic analogue of Visser's dihedral wormhole.
  - Quote: "A traveler passing through one of the hoops instantly finds himself emerging from the other one" *(quote)*. The traveller stays in flat space throughout.
  - $E^-_{\rm tot}\sim\rho_0$ in Planck units, about $10^{-2}M_\odot$ for a human-sized portal. He compares this to the energy of a supernova.
  - Combined with a Van Den Broeck "pocket", a portal with $\rho_0\sim10\ell_P$ outside but roomy inside needs only about $-10^{-4}$ g plus about $-10^{-3}$ g for the pocket.
  - **Inconsistency:** the Fig. 5 caption says about $-10^{-5}$ g; see Discrepancies.
- **Caveats:**
  - These are **existence and energy-accounting arguments only**: "we are not concerned with 'technical details' such as: how to create a wormhole" *(quote)*.
  - The same paper restates that building a shortcut takes at least the light-travel time (F4).
- **Context (abstracts only):**
  - Ford & Roman, "Quantum field theory constrains traversable wormhole geometries", *Phys. Rev. D* **53**, 5496–5507 (1996), arXiv:gr-qc/9510071. Applying the quantum inequality to static wormholes, either the wormhole is barely larger than Planck size, or the negative energy is confined to a band many orders thinner than the throat. They judge macroscopic traversable wormholes "very improbable".
  - Fewster & Smith, "Absolute quantum energy inequalities in curved spacetime", *Ann. Henri Poincaré* **9**, 425–455 (2008), arXiv:gr-qc/0702056. They proved the first **absolute** quantum energy inequality for the massive Klein–Gordon field on 4-D globally hyperbolic spacetimes. This partly addresses Krasnikov's "never proved in curved spacetime" point for that field.

### I2. Krasnikov's earlier wormhole papers
- **"A traversable wormhole"**
  - **Citation:** *Phys. Rev. D* **62**, 084028 (2000); erratum *Phys. Rev. D* **76**, 109902 (2007); arXiv:gr-qc/9909016.
  - **Access:** ABSTRACT ONLY.
  - The arXiv abstract now reads, in effect, that the paper has been **withdrawn by the author due to a fatal error**.
  - The original claim was a static wormhole with arbitrarily wide throat supported by vacuum stress-energy of neutrino, electromagnetic or massless scalar fields.
- **"Toward a traversable wormhole"**
  - **Citation:** arXiv:gr-qc/0003092 (conference talk).
  - **Access:** ABSTRACT ONLY.
  - Presents the same class of wormholes, two-component sources with one component vacuum-polarisation-supported. **Treat as superseded by the withdrawal above.**

---

## J. Discrepancies and open questions

1. **MTY 1988 Planck length.** MTY print $(G\hbar/c^3)^{1/2}=1.3\times10^{-33}$ cm (verified on page image). The correct value is $1.616\times10^{-33}$ cm. Do not propagate 1.3.
2. **MTY 1988 asymptotic redshift function.** MTY print $\Phi\simeq-2M/|l|$. With their metric $g_{tt}=-e^{2\Phi}$, the Schwarzschild limit gives $\Phi\simeq-M/|l|$. This looks like a typo; it does not affect their conclusions.
3. **Geroch's theorem.**
   - The original was not accessed, so the statement here comes from secondary sources (Chamblin, Borde, Dowker, MTY, Hawking).
   - MTY call it "Theorem 2"; other papers use their own numbering.
   - The time-orientability hypothesis is not essential: Borde shows the non-time-orientable case still forces CTCs unless one boundary is empty.
4. **Tipler PRL 1976** is about **CTC formation**, not topology change. Topology change is in Ann. Phys. 1977. Tipler's compact-case result forbids topology change **outright**, so it is not "singularities or energy violation". The "singularity" branch applies only to non-compact interpolating regions under an extra assumption (Tipler Thm 5, as reported by Borde).
5. **Frolov–Novikov 1990 not accessed.**
   - The weak-field relation $d(\Delta T)/dt=\Delta\Phi/c^2$ and $T_{\rm TM}\approx Lc/\Delta\Phi$ is confirmed through Visser 1993, Schein–Aichelburg–Israel 1996 and Frolov–Krtouš–Zelnikov 2023 (which includes Frolov). It is not confirmed from Frolov–Novikov's own text.
   - The "$c/g\approx1$ yr" figure is my derivation.
   - **Open question:** whether mouths held at different potentials also allow energy extraction (lower mass externally, return it through the throat), and how the change in mouth masses (E5) balances this. No source on this was verified.
6. **Mouth mass/charge bookkeeping.**
   - Supported by Susskind 2005 (non-peer-reviewed, 2+1-D) and described as "accepted" by Gratus et al., who cite Visser 1995 (not accessed).
   - Gratus et al. propose an alternative in which mouths "forget" transits.
   - **No accessible peer-reviewed 3+1-D calculation of mass shifts, and none at all of momentum recoil.** The JT-gravity "kicks" of Maldacena–Stanford–Yang are the closest verified analogue, and there ADM energy is not conserved because of external insertions.
7. **Topological censorship abstract versus theorem.** The arXiv v2 abstract says "null energy condition", but Theorem 1 assumes the **averaged** NEC. The 1995 erratum concerned the passive-censorship "Theorem 2", not the main theorem.
8. **Jafferis et al. SI.**
   - "Sparse $N=7$" (§V.A) versus "($N=5$ with 5 terms)" (§IV, p. 13).
   - Operator counting: 36 (reply) versus 64 (Kobrin et al.) for $N=7$ SYK.
   - The main Nature text was not accessible, so the precise wording of claims in the body (beyond the abstract and SI) is unverified.
   - The 2025 Author Correction changes only the Fig. 3b caption, to say "averaged over all fermions".
9. **Kim–Thorne versus Hawking.** Where the quantum-gravity cutoff applies (frame-dependent proper time versus invariant distance) was unresolved in 1991–92. Kay–Radzikowski–Wald 1997 shows semiclassical gravity fails somewhere on any compactly generated Cauchy horizon. Per Visser 2003, chronology protection can only be settled by full quantum gravity. Counterexamples where back-reaction stays small exist (Roman ring; Grant and Misner variants).
10. **ER=EPR versus traversable wormholes.**
    - Maldacena–Susskind assumed un-traversability (2013). Gao–Jafferis–Wall later made bridges traversable with an explicit coupling (2016).
    - These are consistent because the coupling requires a causal channel. GJW: no causal paradox, and no faster-than-light shortcut over long distances. MMP: long wormholes only. MSY: you can send no more information than was used to open the wormhole.
11. **Wormhole creation remains open.**
    - Classical: CTCs (Geroch) and energy-condition violation (Tipler/Borde) are required, and wormholes come in pairs if fermions exist (Gibbons–Hawking).
    - Quantum: tunnelling or nucleation with exponentially small or unquantified probability (Horowitz–Marolf–Santos–Wang; MMP §9.3); degenerate metrics (Horowitz; Sorkin–Dowker).
    - Hayward–Koyama "construct" a wormhole only from an already two-sided eternal black hole.
    - In the Sorkin–Dowker programme, the "two regions touch" route (index 1) is conjecturally suppressed, while the index-2 route is allowed.
    - None of these gives a controllable way to create **distant** mouths. Causal-propagation results (Hawking & Ellis Ch. 7; Krasnikov 1998; Maldacena–Susskind "no creation by LOCC") imply mouths must be made together and moved apart at or below light speed.
12. **Krasnikov 2003 numbers.** The pocket figure is about $-10^{-3}$ g in the text but about $-10^{-5}$ g in the Fig. 5 caption. His wider-throat wormhole paper (*PRD* **62**, 084028) was withdrawn for a "fatal error".
13. **Not verified:**
    - Wald 1984 chapter and theorem numbers.
    - That Wheeler's 1955 "Geons" contains the first wormhole diagram.
    - That the word "foam" appears in Wheeler 1957.
    - Visser's *Lorentzian Wormholes* section numbers.
    - The editor list for the Hawking-60 proceedings (INSPIRE gives Gibbons & Shellard; Rankin may also be an editor).
14. **Throat stability under traversal.**
    - For the Ellis wormhole, a traveller always triggers collapse to a black hole unless ghost radiation compensates (Shinkai–Hayward).
    - In the AdS/GJW setting, a traveller does not close the wormhole in its own direction of travel at linear order, but blocks the reverse direction.
    - MMP: enough energy creates horizons.
    - **Open:** a general bound on throughput (mass or information per transit) for 4-D asymptotically flat traversable wormholes. MSY and GJW give AdS/JT bounds only.
