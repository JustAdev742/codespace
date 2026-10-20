# Stage B: prior-art check on topology change, chronology, alternatives, modified gravity and 4D traversable wormholes

Written 2026-10-20. This file reports only what the published literature says on questions Q1–Q8
posed by the project lead. It does not evaluate the lead's Stage A results.

## Method and conventions

- arXiv papers were downloaded as PDFs (`arxiv.org/pdf/<id>`) and converted to text with
  `pdftotext`. Quotations are copied from that text. Mathematical notation is re-typed with
  Unicode, `^` and `_` because extraction flattens super- and subscripts. Wording is otherwise
  verbatim. `[...]` marks an omission and `[sic]` an error in the original.
- Pre-arXiv papers came from three places, each named below: scanned PDFs on institutional pages
  (read as page images), the free JETP archive, and Caltech's open repository.
- For paywalled papers that I could not open, the abstract is the publisher abstract reproduced
  by the INSPIRE-HEP API (`inspirehep.net/api/literature`). Journal references and DOIs were
  checked against INSPIRE and, where available, the arXiv API.
- Access status: **full text read** means the whole paper, or every section relevant to the
  question, was read (the sections are listed). **partial** means only the named sections were
  read. **abstract only** and **not accessed** mean what they say.
- **Note (ours)** marks arithmetic or substitutions done here. They are not claims of the cited
  authors.

---

## Q1. Topology change via Morse theory

### Sources

| Key | Citation | arXiv | DOI | Access |
|---|---|---|---|---|
| DS98 | F. Dowker & S. Surya, "Topology change and causal continuity", Phys. Rev. D **58**, 124019 (1998) | gr-qc/9711070 (v2) | 10.1103/PhysRevD.58.124019 | full text read |
| DGS00 | H.F. Dowker, R.S. Garcia & S. Surya, "Morse index and causal continuity. A criterion for topology change in quantum gravity", Class. Quantum Grav. **17**, 697–712 (2000) | gr-qc/9910034 | 10.1088/0264-9381/17/3/308 | full text read |
| BDGSS99 | A. Borde, H.F. Dowker, R.S. Garcia, R.D. Sorkin & S. Surya, "Causal continuity in degenerate spacetimes", Class. Quantum Grav. **16**, 3457–3481 (1999) | gr-qc/9901063 (v3) | 10.1088/0264-9381/16/11/303 | full text read |
| DG98 | H.F. Dowker & R.S. Garcia, "A handlebody calculus for topology change", Class. Quantum Grav. **15**, 1859–1879 (1998) | gr-qc/9711042 | 10.1088/0264-9381/15/7/005 | partial (§§1–3.2 read) |
| D02 | F. Dowker, "Topology change in quantum gravity". arXiv comment: "Contribution to the proceedings of the Stephen Hawking 60th birthday conference, Cambridge, January 2002". INSPIRE lists page 436; publisher and year not verified here. | gr-qc/0206020 | none found | partial (§§2–5 read) |
| S97 | R.D. Sorkin, "Forks in the road, on the way to quantum gravity", Int. J. Theor. Phys. **36**, 2759–2781 (1997) | gr-qc/9706002 | 10.1007/BF02435709 | partial (topology-change passage pp. 12–13, references) |
| BS | A. Borde & R.D. Sorkin, "Causal cobordism: topology change without causal anomalies" | none | none | **not accessed: never published.** DS98 ref. [21], DG98 ref. [20] and S97 ref. [53] cite it as "(in preparation)"; BDGSS99 ref. [14] cites "A. Borde and R.D. Sorkin. Unpublished." An INSPIRE search for author Borde AND author Sorkin returns only BDGSS99. |

### (a) The Borde–Sorkin conjecture and what DGS00 proved

Statements of the conjecture:

- DS98 §3: "Borde and Sorkin have conjectured that (M, g_ab) contains a causal discontinuity if
  and only if the Morse function f contains an index 1 or an index n − 1 Morse point [21]."
- DGS00 §1, Conjecture 1: "[Borde-Sorkin conjecture] Given a compact cobordism M and a Morse
  function f : M → ℝ with critical points {p_k}, then a Morse geometry (M, g) defined through f,
  is causally continuous if and only if none of the points p_k has Morse index 1 or n−1."
- The setting (DGS00 §1): the Morse metric is g_μν = (h^ρλ ∂_ρf ∂_λf) h_μν − ζ ∂_μf ∂_νf, with h
  Riemannian and ζ > 1. "This metric is Lorentzian everywhere, except at the critical points of
  f." Causal continuity is assessed on "the globally Lorentzian spacetime induced in
  M = M−{p_k}, the manifold that remains after excising the critical points".

What was proved:

- **BDGSS99** proves the conjecture only for neighbourhoods of a single critical point, with the
  auxiliary metric h Cartesian-flat in Morse coordinates. Abstract: "For these geometries, we
  verify Borde and Sorkin's conjecture that causal discontinuity occurs if and only if the Morse
  index is 1 or n − 1." The result is Proposition 3: "(i) If λ ≠ 1, n − 1, (N_ε, g) is causally
  continuous. (ii) If λ = 1 or λ = n − 1, (N_ε, g) is not causally continuous."
- **DGS00** proves a weaker form globally. Abstract: "We establish a weaker form of this
  conjecture. Namely, if a Morse function f on a compact cobordism has critical points of index
  1 or n−1, then all the Morse geometries associated with f are causally discontinuous, while if
  f has no critical points of index 1 or n−1, then there exist associated Morse geometries which
  are causally continuous."
  - Lemma 2 (§4), which holds for any Riemannian h: "A Morse geometry (M, g) with an index 1 or
    n − 1 Morse point p is causally discontinuous."
  - Proposition 1 (§6): "(i) if f has no critical points with Morse index 1 or n − 1, there exist
    Morse spacetimes (M, g) associated with M which are causally continuous; (ii) if f has
    critical points of index 1 or n−1, every Morse geometry (M, g) defined through f is causally
    discontinuous."
  - The existence half of the proof needs h Cartesian-flat near each critical point. From
    Corollary 2: "Let g be a Morse metric constructed from f and a Riemannian metric, h, which
    is Cartesian in a neighbourhood of the Morse point. Then (E, g) is causally continuous."
- **Still open in 2002.** D02 §5: "We can further show that, not just these special metrics, but
  any index 1 and n − 1 Morse metric is causally discontinuous. It is also true that any Morse
  metric on the yarmulke is causally continuous. It remains to be proved that any Morse metric
  on a λ ≠ 0, 1, n−1, n elementary cobordism is causally continuous."
- **The physics conjecture behind it is separate.** D02 §3: "The first conjecture is based on the
  idea that it is a certain property, called 'causal discontinuity', of the causal structure of
  the 1 + 1 trousers that is the origin of the bad behaviour of quantum fields on it. So the
  conjecture (Sorkin) is that quantum fields will be singular on causally discontinuous
  spacetimes but well-behaved on causally continuous spacetimes." D02 §5 adds: "A key
  investigation that needs to be done is of quantum field theory on a four dimensional spacetime
  with an index two point, which is conjectured to be regular."

### (b) Creating a wormhole handle, and whether index 2 suffices

**Yes. The papers discuss S³ → S² × S¹, and its non-compact form ℝ³ → ℝ³ with an S² × S¹
handle, and show that a cobordism with a single index-2 point exists.**

- DS98 §5 (black-hole pair-creation topology), using the half-instanton S² × B²: "The boundary of
  S² × B² is S² × S¹ so that S² × B² corresponds to the creation from nothing of an S² × S¹
  wormhole." After constructing f (their Eq. 16): "The existence of such a Morse function with
  two critical points, one of index 0 and the other of index 2, shows that the black hole pair
  production topology can support histories that are causally continuous. The index 0 point is
  the creation of an S³ from nothing and the index 2 point is the transition from S³ to S² × S¹."
- DS98 §5 contrasts this with the index-1 alternative: "It is also interesting that there is
  another simple cobordism for the transition from S³ to S² × S¹ which is B³ × S¹ with an
  embedded open four-ball deleted. This, however, by virtue of the Morse inequalities, admits no
  Morse function without an index 1 point and so is causally discontinuous. In some sense, this
  second causally discontinuous process is the way one might naturally imagine a wormhole
  forming: two distant regions of space coming 'close in hyperspace' and touching to form the
  wormhole. The index 2 cobordism for creation of a wormhole is harder to visualise."
- DG98 §3.2 gives the handlebody form and the non-compact (asymptotically flat) version. The
  topologies are "a spacelike hypersurface of Melvin, ℝ³, a post-tunnelling spacelike
  hypersurface containing a pair of black holes, S² × S¹ − {point} and the doubled instanton, or
  'bounce' topology, S² × S² − {point}." The decomposition is "M = S² × B² ≅ (S² × B¹) × B¹ ≅
  (B³ + B² × B¹) × B¹ = B⁴ + B² × B²", so "Thus there exists a Morse function on M which contains
  only a Morse point of index 2." They then decompactify: "Lemma 3 then shows that there is an
  asymptotically flat CCAL metric on the noncompact cobordism L = M − C ≅ S² × B² − Ḃ⁴ − B¹
  where C is an integral curve of a gradient-like vector field of the Morse function. L is
  diffeomorphic to the original cobordism –half of (S² × S² − {point})– up to the observation
  that the initial boundary in L is at some finite time in the past whereas in the original
  cobordism it is in the infinite past." (CCAL = causally continuous almost-Lorentzian.)
  - DG98 Lemma 3 hypothesis: "a triad (M, V₀, V₁) with a Morse function f : M → [0, 1] with no
    index n critical points".
  - In general dimension: "Thus the cobordism S^{n−1} → S^{n−2} × S¹ contains only an index (n−2)
    critical point, which respects causal continuity whenever n ≥ 4."
  - In 2+1 dimensions: "The equivalent process would be S² → S¹ × S¹, which is mediated by part
    of the handlebody B² × S¹ = B³ + B¹ × B², and hence contains an unwanted index 1 point."
- D02 §2 names the ℝ³ case: "For example, a topology change from ℝ³ to ℝ³ with a handle – an
  S² × S¹ – attached can be reduced to the compact case because infinity in both cases is
  topologically the same." D02 §4: "in 4 spacetime dimensions, the manifold of the instanton
  that is used to calculate the nonextremal black hole pair production rate [18] admits a Morse
  function with a single index 2 Morse point." Ref. [18] is Garfinkle & Strominger, "Semiclassical
  Wheeler wormhole production", Phys. Lett. B **256**, 146 (1991).
- Index-1 handle creation is causally discontinuous. DS98 §2: "In (n−1)+1 dimensions, the higher
  dimensional trousers [...] has an index 1 point and is the trace of a type 1 surgery in which an
  S⁰ × D^{n−2}, i.e., two balls, are removed and an S^{n−2} × B¹, or wormhole, added. In these
  processes, parts of the universe which were spatially far apart suddenly become close [...]. An
  index n − 1 point is the time reverse of this and corresponds to a type n − 1 surgery in which a
  wormhole is removed (or cut) and the ends 'capped off' with two balls, so that neighbouring parts
  of the universe suddenly become distant." DS98 §3: "Furthermore in the cases of index λ ≠ 1,
  n−1, the spheres that are created and destroyed are all connected and so it seems that
  neighbouring parts of the universe remain close and distant ones remain far part [sic]."
- **No causal obstruction to any 3+1 transition (assuming the conjecture).** DS98 §4 invokes the
  Lickorish–Wallace theorem, that any 3-manifold V₁ can be obtained from any other V₀ "by
  performing a series of type 2 surgeries on V₀ [12]. Thus, by Theorem 1 there exists an
  interpolating cobordism M which is the trace of this sequence of surgeries and which therefore
  admits a Morse function with only index 2 points, so that M admits a causally continuous metric."
  Also: "in 4 dimensions, elementary cobordisms with index 1 or 3 critical points correspond to
  causally discontinuous histories while those of index 2 are causally continuous."
- **A particular cobordism can still be bad.** DS98 §6, on the "U-tube" for pair creation of
  primes, ℝ³ → ℝ³ # P # P*: "any spacetime (M, g_ab) where M is a generic U-tube cobordism in which
  an arbitrary prime P is pair-produced will have causal discontinuities." DS98 states this for
  "an arbitrary prime P" and does not single out P = S² × S¹. D02 §4: "Bad topology changes
  include spacetime wormholes where an S³ baby universe is born by branching off a parent
  universe, the epitome of a trousers cobordism."

### (c) Timelike gradient curves and the "causal locality" of topology change

**No sentence was found asserting, in these words, that topology change is causally local
because the regions joined by the handle lie in the causal past of the critical point.** The
closest statements, all of which are explicit, are below.

1. **The gradient field is timelike and f is a time function.**
   - DGS00 §1: "The vector field h^μν ∂_ν f is time-like with respect to the metric g, so that we
     can think of f as a time-function on (M, g)."
   - DGS00 §2: "Any Morse geometry (M, g) is stably causal, since the Morse function f on M is a
     global time function."
   - BDGSS99 §1: "We note that a Morse spacetime is partially ordered by the causality relation,
     since the Morse function is a global time function and precludes CTCs."
   - BDGSS99 §2: "The time orientation is given by the timelike vector field normal to the level
     surfaces of the Morse function f."
   - D02 §2: "roughly the Morse function is used as a time function as you'd expect."
2. **The descending ("ingoing") disc is swept by timelike curves ending at p, and its
   chronological past is the past of p.**
   - DGS00 §3: "In (N, g) the basins of ξ are replaced by the two punctured disks, N^λ = N^λ − p
     and N^{n−λ} = N^{n−λ} − p, which are swept out by congruences of timelike curves, that
     respectively 'end' and 'begin' at p. Let us define the past set, P ≡ I⁻(N^λ, N) and the future
     set F ≡ I⁺(N^{n−λ}, N) from these punctured discs. Clearly, P lies in the subcritical region of
     N and F in the supercritical region. We now show that every point in P is to the past of
     every other point in F." §3 opens by saying this construction generalises, to arbitrary h,
     the sets P and F of their earlier Cartesian-metric paper [4], "which could be interpreted as
     the chronological past and future of the critical point." Claim 2: "Any pair of points
     s, q with s ∈ P and q ∈ F satisfy s ∈ I⁻(q, N)."
   - BDGSS99 §5.3 ("The 'chronos' of the Morse point"): "one is inclined to regard these lines as
     the null cone of the critical point p, with F constituting its chronological future and P
     its chronological past. Although this is indeed the case in some scheme where the critical
     point is retained, we have excised it for present purposes". BDGSS99 §7: "the causal past and
     future of p are taken to be the closure of the union of respectively the TIPs and TIFs
     associated with p. For our neighbourhood spacetimes, then J⁻(p) would be P, and J⁺(p) = F,
     where the closure is taken in the unpunctured disc."
3. **For index 1, the two pieces that get joined are both in P, one on each side.**
   - DGS00 Lemma 2 proof: "Π comprises two disconnected components, Π₁ and Π₂ [...] The ingoing
     basin is a 1-disc N¹ which itself is divided in two by N^{n−1} so that it stretches into Π₁
     and Π₂ across the critical point", and "P splits into P₁ ∐ P₂, where P_i = P ∩ Π_i."
   - BDGSS99 §5.3: "In the causally discontinuous (1 + 1) trousers both P and F consist of two
     disconnected components. Moreover F 'separates' P, in the sense that any curve joining the
     two disconnected components of P necessarily traverses F." Claim 1(i): "If q ∈ F, then
     P ⊂ I⁻(q)."
   - D02 §5: "it seems intuitive that the causal past of p should contain two separate parts, one
     down each 'leg' of the trousers."
4. **Causal curves near p stay near p.** DGS00 Claim 3: "First we show that no causal curve that
   begins and ends close enough to p can stray too far from it." Formally: "there is a
   neighbourhood U′ ⊂ U of p such that any causal curve γ between two points x, y in U′ must be
   contained in U."
5. **The change is located at the degenerate point.** S97, pp. 12–13: "With respect to such a
   metric, one can view the topology change as 'happening' at the points of degeneration, and one
   might accordingly hope for simple dynamical rules to describe what takes place at such points."
6. **"Localised" in these papers means spatially localised**, i.e. compact support with infinity
   unchanged, not causal locality. DG98 §3.1 ("Localised topology change"): "with the assumption
   that the topology change is localised in space, we can reduce the questions to the closed case
   by, roughly speaking, closing off space." DS98 §4, on Kaluza–Klein monopole pair creation:
   "the topology change involved is not local but changes the boundary conditions at infinity".

---

## Q2. Classical theorems

### Sources

| Key | Citation | arXiv | DOI | Access |
|---|---|---|---|---|
| G67 | R.P. Geroch, "Topology in general relativity", J. Math. Phys. **8**, 782–786 (1967) | none | 10.1063/1.1705276 | **abstract only** (AIP abstract via INSPIRE and pubs.aip.org); full text not accessed (AIP returned 403 to a direct download) |
| T77 | F.J. Tipler, "Singularities and causality violation", Ann. Phys. (N.Y.) **108**, 1–36 (1977) | none | 10.1016/0003-4916(77)90348-7 | **abstract only** (Elsevier abstract via INSPIRE; ScienceDirect returned 403) |
| T76 | F.J. Tipler, "Causality violation in asymptotically flat space-times", Phys. Rev. Lett. **37**, 879–882 (1976) | none | 10.1103/PhysRevLett.37.879 | abstract only |
| B94 | A. Borde, "Topology change in classical general relativity", preprint (1994). No journal reference on arXiv or INSPIRE. | gr-qc/9406053 | none | full text read (§§I–V, VII, IX; §VI in part) |
| GH92 | G.W. Gibbons & S.W. Hawking, "Selection rules for topology change", Commun. Math. Phys. **148**, 345–352 (1992) | none | 10.1007/BF02100864 | **full text read** from a scanned copy (webhomes.maths.ed.ac.uk/~v1ranick/papers/gibhaw2.pdf). The OCR text dropped several displayed formulas. |
| GH92b | G.W. Gibbons & S.W. Hawking, "Kinks and topology change", Phys. Rev. Lett. **69**, 1719–1721 (1992) | none | 10.1103/PhysRevLett.69.1719 | abstract only |
| H91 | G.T. Horowitz, "Topology change in classical and quantum gravity", Class. Quantum Grav. **8**, 587–602 (1991); report UCSBTH-90-51 | none | 10.1088/0264-9381/8/4/007 | **abstract only** |
| Si98 | M. Siino, "Topology of event horizon", Phys. Rev. D **58**, 104016 (1998). Used only for its restatement of Geroch's theorem. | gr-qc/9701003 | 10.1103/PhysRevD.58.104016 | partial (§II.B) |

### Geroch (1967)

- **Exact statement not verified from the original**, because only the abstract was accessible.
  Abstract (AIP): "A number of theorems and definitions which are useful in the global analysis
  of relativistic world models are presented. It is shown in particular that, under certain
  conditions, changes in the topology of spacelike sections can occur if and only if the model is
  acausal. Two new covering manifolds, embodying certain properties of the universal covering
  manifold, are defined, and their application to general relativity is discussed."
- **Secondary restatements:**
  - Si98 §II.B: "Theorem II.3 Geroch 1967 Let M be a C^r (r ≥ 1) n-dimensional compact spacetime
    manifold whose boundary is the disjoint union of two compact spacelike (n − 1)-manifolds, Σ₁
    and Σ₂. Suppose M is isochronous, and has no closed timelike curve. Then Σ₁ and Σ₂ are
    C^{r−1}-diffeomorphic, and M is topologically Σ₁ × [0, 1]." Its footnote 3: "Originally he
    assumed a C^∞-differentiable spacetime."
  - MTY88 footnote 5 cites the result as "Theorem 2 of R. P. Geroch, J. Math. Phys. 8, 782
    (1967)". So secondary sources number it differently, and I could not check the numbering.
  - DS98 §1: "The theorem of Geroch [8], extended to n-spacetime dimensions, tells us that if a
    time oriented Lorentzian metric exists on a topology changing topological cobordism M then
    that metric must contain closed timelike curves."
  - Hawking 1992 §V: "If there is a timelike tube T connecting surfaces S and S′ of different
    topology, then the region M_T contains closed timelike curves. This is a modification of a
    theorem of Geroch [14]."
- **B94 on scope:**
  - Connectedness is not needed: "Geroch's result is sometimes quoted as having assumed that S₁
    and S₂ are connected. In fact, the proof works even if they are not, as long as M is
    connected."
  - The asymptotically flat case is covered via "externally Lorentzian" spacetimes: "Then, in 4
    dimensions, in exact analogy with the compact case, any two externally Euclidean spaces can be
    connected by an interpolating externally Lorentzian spacetime [6]".
  - It is purely kinematical: "Neither Geroch's original theorem, nor its mild generalization in
    section IV, assume anything about the energy-momentum tensor, or indeed about a field
    equation – the results are purely kinematical."

### Tipler (1977): assumptions

- Abstract (Elsevier): "A number of important theorems in General Relativity have required a
  causality assumption; for example, the Geroch topology change theorem, and most of the
  Hawking-Penrose-Geroch singularity theorems. It is shown in this paper that the causality
  condition can be replaced by weaker causality conditions, and in some cases removed altogether.
  In particular, (a) it is shown that if the Einstein equations (and the weak energy condition)
  hold on the 'topology-changing' space-time considered by Geroch, then topology change cannot
  occur. No causality assumption is needed in the proof. Furthermore, it is shown that if topology
  change occurs within a finite region, then this change of topology must be accompanied by
  singularities. (b) [...]"
- B94's account of Tipler's further assumptions. I did not verify these against Tipler's text.
  - Generic condition on all geodesics: "It might seem that to extract information we must require
    that every geodesic in M have a point at which F_abcd ≠ 0, even if the geodesic has endpoints
    on ∂M. Such a condition was imposed in Tipler's theorem [7, 8]."
  - Compactness: "This result, but with slightly stronger assumptions, was obtained previously by
    Tipler [7, 8] for the closed universe and externally Lorentzian cases."
  - Non-compact case (§IX): "there is the theorem of Tipler (ref. [8], Theorem 5) [...] this result
    shows (in the closed universe case) that if topology change occurs via a non-compact
    interpolating spacetime, then it contains (under some mild additional assumptions) a
    singularity (in the sense of an incomplete timelike geodesic) or a point at infinity. That it
    is a singularity that must occur may be inferred only under the significant additional
    assumption that there is an upper bound on the lengths of certain timelike curves in the region
    of interest."
  - B94 refs [7, 8] are Tipler's Ph.D. dissertation and Ann. Phys. 108, 1 (1977).
- MTY88 footnote 6 cites "F. J. Tipler, Phys. Rev. Lett. 37, 879 (1976); Sec. 5 of F. J. Tipler,
  Ann. Phys. (N.Y.) 108, 1 (1977)" for the claim that wormhole creation requires violating the
  weak energy condition. T76 abstract: "It is shown that a region containing closed timelike lines
  cannot evolve from regular initial data in a singularity-free asymptotically flat space-time."

### Borde (1994): assumptions

- Definition (§III): "A spacetime M is called causally compact if for any p ∈ M, I(p) [the
  closure of I(p)] is compact."
- Theorem 1 (§IV): "Let M be a (time-oriented) causally compact spacetime that interpolates
  between an initial surface S₁ and a final surface S₂. Suppose that M has no closed timelike
  curves. Then, M is diffeomorphic to S₁ × [0, 1] (and, in particular, S₁ is diffeomorphic to
  S₂)."
- Corollary: the same conclusion holds if M "can be foliated by spacelike surfaces, with S₁ as the
  first surface in the foliation and S₂ as the last".
- Theorem 3 (§V): "Let M be a (time-oriented) causally compact interpolating spacetime of
  dimension ≥ 3 with initial surface S₁ and final surface S₂. Suppose that i) every full (i.e., no
  endpoint on S₁ or on S₂) null geodesic has a point on it at which
  F_abcd ≡ U_[a R_b]ef[c U_d] U^e U^f ≠ 0, where U^a is the tangent to the geodesic; and ii) for
  any point u₀ on a past-complete, affinely parametrized null geodesic λ(u), the half-integral
  null convergence condition (explained below) holds along λ to the past of u₀. Then M is
  diffeomorphic to S₁ × [0, 1], and S₁ and S₂ are connected."
- Theorem 3 is not a singularity theorem: "this result is not a 'singularity theorem,' at least of
  the standard type, i.e., it makes no assumptions about geodesic completeness."
- §VI: the null convergence condition follows if T_ab is bounded below, including the weak energy
  condition (K = 0) or the vacuum.
- §VII: the conclusions survive dropping time-orientability. B94 makes no assumption about
  spacetime dimension except for Theorem 3, which needs ≥ 3.

### Gibbons & Hawking (1992): pairs of wormholes and spinor structure

- **Yes, handles must be created in pairs, under these assumptions.**
- Abstract: "It is shown that there are restrictions on the possible changes of topology of space
  sections of the universe if this topology change takes place in a compact region which has a
  Lorentzian metric and spinor structure. In particular, it is impossible to create a single
  wormhole or attach a single handle to a spacetime but it is kinematically possible to create
  such wormholes in pairs. Another way of saying this is that there is a ℤ₂ invariant for a closed
  oriented 3-manifold Σ which determines whether Σ can be the spacelike boundary of a compact
  manifold M which admits a Lorentzian metric and a spinor structure. We evaluate this invariant
  in terms of the homology groups of Σ and find that it is the mod 2 Kervaire
  semi-characteristic."
- The assumptions, stated in the text:
  - Compactness, regularity and orientation: "it would have to occur in a compact region of
    spacetime without singularities [...] the 4-dimensional spacetime manifold M, which we assume
    to be smooth and connected, is compact with boundary ∂M = Σ consisting of 2 connected
    components, one of which has topology S³ and the other of which has topology S¹ × S²".
  - Spinor structure: "If a Lorentzian spacetime admits an SL(2, ℂ) spinor structure it must be
    both orientable and time-orientable and in addition admit a Spin(4) structure [9, 10]."
  - Non-compact space: "We can extend these results to cases where the space sections of the
    universe may be non-compact but the topology change takes place in a compact region bounded by
    a timelike tube."
- The invariant u is 0 iff Σ "(1) bounds a smooth connected compact Lorentz 4-manifold M which
  admits an SL(2,ℂ) spinor structure; (2) is spacelike with respect to the Lorentz metric". The
  paper states "u(S³) = 1, and u(S¹ × S²) = 0. The result that one cannot create a single wormhole
  then follows immediately from the formula for disjoint unions while the fact that one can create
  pairs of wormholes follows from the formula for connected sums." It also gives
  u = dim_ℤ₂(H₀(Σ; ℤ₂) ⊕ H₁(Σ; ℤ₂)) mod 2. On pairs: "there is no difficulty in imagining an
  advanced civilization constructing a pair of wormholes, i.e. that the final boundary is the
  connected sum of 2 copies of S¹ × S², S¹ × S² # S¹ × S². Thus one may interpret our results as
  providing a new topological conservation law for wormholes, they must be conserved modulo 2."
  - Note (ours): the connected-sum formula is not legible in the scan. Applying their stated
    formula for u gives u(S¹×S² # S¹×S²) = 1 + 2 = 1 (mod 2). The transition S³ → S¹×S² then has
    total boundary u = 1 (forbidden), and S³ → S¹×S² # S¹×S² has total boundary u = 0 (allowed).
- CTCs remain. GH92 introduction: "Spacetimes of this type have previously been thought to be of
  no physical interest because a theorem of Geroch [4] states that they must contain closed
  timelike curves. [...] even if causality violations are allowed, there is an even greater
  obstacle [...] it does not admit an SL(2,ℂ) spinor structure". For their explicit S¹ × B³
  spin-Lorentz cobordism: "the resulting spacetime will, in general, be incomplete and have closed
  timelike curves but it is a valid spin-Lorentz-cobordism."
- Ways around the rule:
  - Degenerate metrics: "a selection rule of this type derived in this paper occurs only if one
    insists on an everywhere non-singular Lorentzian metric. If one gives up the Lorentzian metric
    and passes to a Riemannian metric or if one adopts a 'first order formalism' in which one
    treats the vierbein field as the primary variable and allows the legs of the vierbein to become
    linearly dependent at some points in spacetime then our selection rule would not necessarily
    apply."
  - Spin^c: generalised spinors via Spin^c "at the cost of introducing an extra and as yet
    unobserved U(1) gauge field".
- Hawking 1992 (Q4) p. 604 restates the result: "one can show the requirement that M_T have a
  Lorentz metric and a spin structure imply that wormholes cannot be created singly, but only in
  multiples of 2 [8]."
- GH92b abstract: "This result gives a generalization of a previous selection rule: The number of
  wormholes plus the number of kinks created during a topology change is conserved modulo 2."

### Horowitz (1991): degenerate metrics

- Abstract (IOP): "In a first-order formulation, the equations of general relativity remain well
  defined even in the limit that the metric becomes degenerate. It is shown that there exist
  smooth solutions to these equations on manifolds in which the topology of space changes. The
  metric becomes degenerate on a set of measure zero, but the curvature remains bounded. Thus if
  degenerate metrics play any role in quantum gravity, topology change is unavoidable."
- Full text not accessed, so I cannot quote the construction.

---

## Q3. Visser's Roman ring, and wormhole networks as a graph problem

### Sources

| Key | Citation | arXiv | DOI | Access |
|---|---|---|---|---|
| V97 | M. Visser, "Traversable wormholes: the Roman ring", Phys. Rev. D **55**, 5212 (1997) | gr-qc/9702043 | 10.1103/PhysRevD.55.5212 | full text read |
| V94 | M. Visser, "van Vleck determinants: traversable wormhole spacetimes", Phys. Rev. D **49**, 3963 (1994) | gr-qc/9311026 | 10.1103/PhysRevD.49.3963 | partial (§VI, §VII) |
| V02 | M. Visser, "The quantum physics of chronology protection". Preprint header: "To appear in: The future of theoretical physics and cosmology; Proceedings of the conference held in honour of Stephen Hawking on the occasion of his 60'th birthday. (Cambridge, 7–10 January 2002.)" INSPIRE lists page 161. | gr-qc/0204022 | none found | partial (the ring passage, p. 10) |
| ER97 | Everett & Roman (1997); see Q5 | gr-qc/9702049 | 10.1103/PhysRevD.56.2100 | full text read |
| FKZ23 | V.P. Frolov, P. Krtouš & A. Zelnikov, "Ring wormholes and time machines", Phys. Rev. D **108**, 024034 (2023) | 2305.03887 | 10.1103/PhysRevD.108.024034 | partial (§§I, III, VI, VII) |
| UVa558 | Universidad de Valladolid Online Judge problem 558, "Wormholes" (programming-contest problem, not physics literature) | none | none | full statement read (onlinejudge.org/external/5/558.pdf) |
| USACO06 | USACO 2006 December Gold, "Wormholes" (mirrored as POJ 3259 and ECNU 3196; programming-contest problem) | none | none | statement read via WebFetch of acm.ecnu.edu.cn/problem/3196 (quoted fragments only) |

### Configuration and conclusion of the Roman ring (V97)

- **Wormholes.** "Start by taking N identical wormholes in otherwise flat Minkowski spacetime.
  [...] For simplicity assume that all wormhole mouths are at rest with respect to each other; so
  each wormhole is characterized by a spatial jump L and timeshift T with T ≪ L."
- **Arrangement.** "Now arrange the N wormholes in a big symmetric polygon, so that the exit mouth
  of one wormhole is a normal-space distance of ℓ from the entrance mouth of the next wormhole.
  (We will want ℓ ≪ L, so that the normal space distance travelled to get from one wormhole to the
  next is less than the distance then 'jumped' by going through the wormhole.)" Fig. 2 shows four
  wormholes. The van Vleck estimate also assumes "ℓ ≫ R", where R is the mouth radius.
- **No subset is close to chronology violation.** For one wormhole, "s₁² = L² − T² ≫ 0".
- **Loop interval, Eq. (2).** "s_γ² = (Nℓ)² − (NT)² = N²(ℓ² − T²). Because it is the normal-space
  distance between the wormhole mouths that enters here (ℓ; not the spatial jump L) we can easily
  make this geodesic timelike."
- **Van Vleck factor and stress tensor.**
  - Eq. (6): Δ_γ = [N / U_{N−1}(1 + ℓ/R)]², with U_N a Chebyshev polynomial of the second kind.
  - Eq. (7): Δ_γ ≈ N² (R/2ℓ)^{2(N−1)}.
  - Eq. (9), at fixed T and ℓ: ⟨T^μν⟩ ≈ ħ [1/(N²(ℓ² − T²)²)] (R/2ℓ)^{2(N−1)} [η^μν − 4(T,0,0,ℓ)^μ(T,0,0,ℓ)^ν/(ℓ² − T²)].
    "In particular ⟨T^μν⟩ → 0 as N → ∞."
  - "The time shift T, and spatial jump L quietly cancel out of the calculation for the van Vleck
    determinant."
- **Approach to chronology violation.** "Now suppose the whole system is adiabatically shrunk,
  keeping T fixed but letting ℓ → T⁺. The 'reliability horizon' [...] will be located at
  √(ℓ² − T²) = ℓ_Planck." The result is Eq. (10).
- **Conclusion (abstract).** "I show that (with enough wormholes in the ring) the gravitational
  vacuum polarization [...] can be made arbitrarily small. In particular the back-reaction can be
  kept arbitrarily small all the way to the 'reliability horizon'—so that semi-classical quantum
  gravity becomes unreliable before the gravitational back reaction becomes large." §III: "it is
  impossible to come up with chronology protection theorem that is physically reliable within the
  context of semi-classical quantum gravity." V02 restates this on p. 10.

### Chronology for wormhole networks as a graph problem

**Not found in the physics literature.** I searched:

- INSPIRE: all 36 papers citing V97. None formulates a network or graph chronology condition. The
  two Konstantinov causality papers among them, gr-qc/9710120 and gr-qc/9802040, are about
  matching conditions.
- Web searches for "wormhole network closed timelike curves graph", negative cycle/Bellman–Ford
  plus wormholes, and Roman-ring generalisations.

Closest physics statements:

- **Two-wormhole loop sum (V94 §VI).** Each wormhole is modelled by identifying world lines
  "(t, 0, 0, 0) ≡ (t + T₁, 0, 0, ℓ)" (Eq. 121) and "(t, ζ, 0, ℓ) ≡ (t + T₂, ζ, 0, 0)" (Eq. 122). For
  the null loop (Eq. 123): "This future–pointing null trajectory has returned to its spatial
  starting point in a total time ΔT = T₁ + T₂ + 2ζ. This total time shift can easily be arranged
  to be negative. [...] a necessary condition for this compound 'Roman configuration' to form a
  time machine is ℓ > ζ."
- **Networks of Krasnikov tubes (ER97 §4).** "if Krasnikov tubes could be constructed, one could,
  at least in principle, establish a network of such tubes forming a sort of interstellar subway
  system [...] A necessary corollary of the existence of such a network is the possibility of
  backward time travel and the consequent existence of CTCs. CTCs could be avoided only if, for
  some reason, there existed a preferred axis such that all the Krasnikov tubes were oriented so
  that the velocity components along that axis of objects in superluminal motion were always
  positive, implying that no object could return to the same point in time and space."
- **Continuum analogue of a potential on the mouths (FKZ23 §III.B).** The static observers'
  acceleration 1-form "may be non-potential. Such w_α corresponds to a nontrivial element of the
  first cohomology group." §VII: "In such a case there exists a growing time gap for clocks
  synchronized along specially chosen non-contractible closed paths."

Outside physics, the negative-cycle/Bellman–Ford formulation exists as a standard
programming-contest exercise:

- **UVa 558.** "All wormholes have a constant time difference between their end points. For
  example, a specific wormhole may cause the person travelling through it to end up 15 years in
  the future. Another wormhole may cause the person to end up 42 years in the past. [...] The
  scientist wants to reach a cycle of wormholes somewhere in the universe that causes her to end
  up in the past." This is the standard Bellman–Ford negative-cycle problem. Here "it is not
  possible for her to travel from one star system to another one directly", so there are no
  ordinary-travel edges.
- **USACO 2006 December Gold.** This version adds bidirectional "paths" with positive traversal
  times and one-way wormholes that deliver "you to its destination at a time that is BEFORE you
  entered the wormhole". The task is whether one can "return to the starting field a time before
  his initial departure".

Neither exercise has a relativistic causal structure (light cones, Lorentz invariance) or a stated
"time function on mouths". No source was found that defines one.

---

## Q4. Gravitational time shift of wormhole mouths; vacuum polarisation near the chronology horizon

### Sources

| Key | Citation | arXiv | DOI | Access |
|---|---|---|---|---|
| FN90 | V.P. Frolov & I.D. Novikov, "Physical effects in wormholes and time machines", Phys. Rev. D **42**, 1057–1065 (1990); report TPI-MINN-90-1-T | none | 10.1103/PhysRevD.42.1057 | **abstract only** |
| F91 | V.P. Frolov, "Vacuum polarization in a locally static multiply connected spacetime and a time machine problem", Phys. Rev. D **43**, 3878–3894 (1991) | none | 10.1103/PhysRevD.43.3878 | abstract only |
| MTY88 | M.S. Morris, K.S. Thorne & U. Yurtsever, "Wormholes, time machines, and the weak energy condition", Phys. Rev. Lett. **61**, 1446–1449 (1988) | none | 10.1103/PhysRevLett.61.1446 | **full text read** (Caltech scan, authors.library.caltech.edu record m644f-tbz27) |
| KT91 | S.-W. Kim & K.S. Thorne, "Do vacuum fluctuations prevent the creation of closed timelike curves?", Phys. Rev. D **43**, 3929–3947 (1991) | none | 10.1103/PhysRevD.43.3929 | **partial**: pp. 3929–3937 (§§I–II, start of §III) and refs p. 3947 (Caltech scan, record r7x78-rnb75) |
| H92 | S.W. Hawking, "Chronology protection conjecture", Phys. Rev. D **46**, 603–611 (1992); report DAMTP-R-91-15 | none | 10.1103/PhysRevD.46.603 | **partial**: pp. 603–604 and 608–611 (§§I–II start, IV–VI) from a scan at lweb.cfa.harvard.edu/~loeb/Hawking_C.pdf |
| V93 | M. Visser, "From wormhole to time machine: Comments on Hawking's chronology protection conjecture", Phys. Rev. D **47**, 554 (1993) | hep-th/9202090 | 10.1103/PhysRevD.47.554 | partial (§II) |
| N89 | I.D. Novikov, "An analysis of the operation of a time machine", Sov. Phys. JETP **68**(3), 439 (1989) [ZhETF 95, 769] | none | none found | full text accessed (JETP archive); pp. 439–441 read |
| L07 | F.S.N. Lobo, "Exotic solutions in General Relativity: Traversable wormholes and 'warp drive' spacetimes", review, arXiv (2007) | 0710.4474 | none | partial (time-machine section) |
| FKZ23 | see Q3 | 2305.03887 | 10.1103/PhysRevD.108.024034 | partial (§§III, VI) |

### Frolov & Novikov (1990): drift rate for mouths at different potentials

- **The full text was not accessed, so I cannot report their formula.** Abstract (APS): "Physical
  effects in a spacetime with a traversable wormhole are considered. It is shown that the
  interaction of a wormhole with the surrounding matter and with the external gravitational field
  almost inevitably transforms it into a time machine."
- Descriptions in accessible sources:
  - KT91 §I: "Elsewhere, Frolov⁹ computes the full details for locally static spacetimes in which
    the CTC's are produced by a difference in the gravitational redshifts at two wormhole mouths."
    Ref. 9 is F91. F91 abstract: "It is shown that the vacuum-polarization effect in a spacetime
    with a nonpotential gravitational field results in divergences of the renormalized
    stress-energy tensor for a quantum field near the Cauchy horizon."
  - V93 §II.B.3, citing FN90 as [12]: "one may instead rely on the general relativistic time
    dilation engendered by the gravitational redshift [12]. One merely places one of the wormhole
    mouths in a gravitational potential for a suitable amount of time to induce a time–shift:
    T = ∫_i^f (√g₀₀ − 1) dt." (unnumbered equation)
  - V93 §II.C: "A time machine forms once the physical distance between the wormhole mouths ℓ is
    less than the time–shift T. [...] As an alternative to moving the mouths of the wormhole
    closer together one could of course arrange for the time–shift to continue growing while
    keeping the distance between the mouths fixed".
  - L07: "Another interesting manner to induce a time shift between both mouths is simply to place
    one of the mouths in a strong external gravitational field, so that times slows down in the
    respective mouth. The time shift will be given by T = ∫_i^f (√g_tt(x_A) − √g_tt(x_A)) dt [2,
    136]." As printed, both terms have argument x_A. Ref. [136] is FN90 and ref. [2] is Visser's
    book.
  - N89 p. 441, for the moving-mouth case: "The difference in the time-rate of the two clocks is
    related only to different values of g₀₀ at their sites, i.e., to the different potentials of
    the gravitational inertial force." Also: "if the clock at B remains behind the ΔT₁ due to its
    motion (from the viewpoint of observers in external space), the two openings turn out to be
    at a distance ΔZ₁, smaller than ΔT₁c (c is the speed of light), then there appear closed
    light-like lines."
  - FKZ23 §VI (Frolov is FN90's first author), for a ring wormhole with one mouth inside a massive
    shell. The potential mismatch is "ΔU = I_C > 0" and the gap grows linearly: "Δt = −(e^{I_C} −
    1) t₂ < 0" (Eq. 6.1). Then: "In the weak field approximation adopted in this paper I_C is small
    and B ≈ ℓ. Then formation of the time machine happens after time T ≈ ℓ/I_C." (Eq. 6.7, c = 1,
    ℓ the mouth separation). With dimensions restored: "T ≈ RLc/(GM)" (Eq. 6.9), "the
    characteristic time of closed timelike curves formation in the initially traversable ring
    wormhole surrounded by a massive thin shell of radius R and mass M. L is the distance between
    mouths."
- **"A vertically separated pair becomes a time machine after a time c/g, independent of height":
  not found** in any source accessed (FN90 abstract, V93, L07, N89, KT91, H92, FKZ23) or by web
  search.
  - Note (ours): FKZ23's Eq. (6.7) is written for a general potential difference I_C. With
    I_C = gh/c² and ℓ = h it evaluates to T ≈ c/g. FKZ23 do not consider a uniform field with both
    mouths in it; this substitution is ours.

### Morris, Thorne & Yurtsever (1988): the moving-mouth time machine

- p. 1447: "At T = 0, the wormhole's mouths are at rest near each other. Subsequently, the left
  mouth remains at rest while the right mouth accelerates to near-light speed, then reverses its
  motion and returns to its original location. The advanced beings can produce this motion by
  pulling on the right mouth gravitationally or electrically. This motion causes the right mouth
  to 'age' less than the left as seen from the exterior. Consequently, at late times by
  traversing the wormhole from right mouth to left, one can travel backward in time (i.e., one can
  traverse a closed timelike curve) and thereby, perhaps, violate causality."
- On creating wormholes, p. 1446: "Wormhole creation, with such mild spacetime curvature that
  classical general relativity is everywhere valid, must be accompanied by closed timelike curves
  and/or a noncontinuous choice of the future light cone,⁵ and also by a violation of the 'weak
  energy condition.'⁶" Footnotes 5 and 6 are quoted under Q2.
- On the Cauchy horizon, p. 1448: "There H possesses precisely one closed null generator [...]
  the wormhole's AWEC violation causes the throat to act like a diverging lens with focal length
  f ≃ r₀/2. [...] If the advanced beings arrange that (f/D)B < 1, the reduction in amplitude will
  dominate over the boost in frequency [...] leaving the Cauchy horizon immune to this
  instability." This is a statement about classical waves.

### How fast the renormalised stress-energy grows near closed null geodesics

- **KT91**, massless conformally coupled scalar, order of magnitude (§II.D):
  - Eq. (8): T^μν ~ (b/D)^{N or (N−1)} · 1/(D(Δt)³). "Here the power is N if the point x is far
    from either mouth of the wormhole, and N − 1 if it is close to a mouth." Here b is the throat
    radius, D the length of the closed null geodesic, and Δt the observer's proper time to the
    N-th "polarized hypersurface".
  - Eq. (9c): δL/L ≃ δg^VP_μν ~ (b/D)^{N or (N−1)} (l_P/D)(l_P/Δt).
  - "The divergence will be far weaker than this as the observer approaches the Cauchy horizon
    H₋ [...] except at the CNG C from which the horizon generators spring: because all the H_N
    are tangent to H₋ at C, the dominant divergence at C will have the form (9) with N = 1."
  - Why it diverges, §I: "at any event in spacetime which can be joined to itself by a closed null
    geodesic (CNG), the vacuum fluctuations of a massless scalar field should produce a divergent
    renormalized stress-energy tensor".
  - Cutoff at Δt ~ l_P, Eq. (14): T^00_max ~ (l_P/D)(m_P/l_P³), "is l_P/D ~ 10⁻³⁵ of the Planck
    density m_P/l_P³; i.e., it is T^00_max ~ 10⁴⁹ g/cm³" for D ~ 1 m. Maximum strain, Eq. (13):
    (δL/L)_max ~ (b/D)^{N or (N−1)}(l_P/D).
- **H92**:
  - Misner space, conformally invariant field (§IV): "⟨T_ab⟩₀ = diag(K, 3K, −K, −K), K = B/t⁴, in
    an orthonormal basis along the (t, x, y, z) axes. The coefficient B will depend on the quantum
    state and spin of the field." Hiscock and Konkowski "found that B is negative".
  - General case: "one would still expect the same Bt⁻⁴ behavior, where the value of t at a point
    is now defined to be the least upper bound of the lengths of timelike curves from the point to
    the closed null geodesic γ."
  - §VI: "On dimensional grounds one would expect the eigenvalues of the energy-momentum tensor to
    diverge as Bt⁻⁴, where B is a constant that depends on the quantum state and t is the distance
    function to the horizon. However, because of boost and other factors, the energy density
    measured by an observer who crosses the Cauchy horizon on a timelike geodesic will go as
    Bd⁻¹s⁻³, where s is proper distance along the observer's world line until the horizon and d is
    some typical length in the problem. [...] Thus the metric perturbation will diverge as
    GBd⁻¹s⁻¹."
  - On the cutoff: "If there is a cutoff, one would expect it to occur when the invariant distance
    t from the Cauchy horizon was of order the Planck length. But t² is of order ds. So a cutoff
    in t at the Planck length would give a metric perturbation of order 1."
  - Against KT91's frame-dependent cutoff: "This Planck distance should be measured in an
    invariant way, not the frame-dependent way that Kim and Thorne adopt."

---

## Q5. Alternatives: Krasnikov tube and warp drives

### Sources

| Key | Citation | arXiv | DOI | Access |
|---|---|---|---|---|
| K98 | S.V. Krasnikov, "Hyperfast travel in general relativity", Phys. Rev. D **57**, 4760–4766 (1998). The arXiv v6 title is "Hyperfast interstellar travel in general relativity". | gr-qc/9511068 (v6) | 10.1103/PhysRevD.57.4760 | full text read |
| ER97 | A.E. Everett & T.A. Roman, "A superluminal subway: the Krasnikov tube", Phys. Rev. D **56**, 2100 (1997) | gr-qc/9702049 | 10.1103/PhysRevD.56.2100 | full text read (§§1–4 and 6–7 in full; §5 in part) |
| SSV22 | J. Santiago, S. Schuster & M. Visser, "Generic warp drives violate the null energy condition", Phys. Rev. D **105**, 064038 (2022) | 2105.03079 (v2) | 10.1103/PhysRevD.105.064038 | partial (abstract, §§1–2, 7.4, 8) |

### Krasnikov (1998)

The question is whether a traveller who can change the geometry can beat light. Proposition 1 says
that in globally hyperbolic spacetimes the one-way arrival cannot be hastened: "If M_i are globally
hyperbolic spacetimes diverging by S, then F₁ ⋆ F₂". Abstract: "the traveller cannot hasten
reaching the destination. Nevertheless, it is perhaps possible for him to make an arbitrarily long
round-trip within an arbitrarily short (from the point of view of a terrestrial observer) time."

For Alcubierre's drive (Example 4) he concludes "to achieve T < D the astronaut has to use
tachyons". His Example 5 ("The warp drive") is the 2D metric ds² = −(dt − dx)(dt + k(t, x)dx) with
k ≡ 1 − (2 − δ)θ_ε(t−x)[θ_ε(x) − θ_ε(x + ε − D)]. The factor θ_ε(t − x) confines the change to the
causal future of the departure event. The astronaut "moves with a near light speed and the way to
Deneb takes the (proper) time Δτ_a ≪ 1600 yr for him. On the way he carries out some manipulations
with the ballast or with the passing matter." He "reaches Deneb at 3600 only. However, on his way
back he finds that the metric has changed and he moves 'backward in time,' that is, t decreases as
he approaches the Earth (though his trajectory, of course, is future-directed). As a result, he
returns to the Earth in 2002." In short: "an arbitrarily distant journey can be made in an
arbitrarily short time!"

He calls such devices "square roots" of time machines: applying the procedure on two paths gives a
CTC. He states that compactly generated versions require weak-energy-condition violation (citing
H92), and that with a quantum inequality "it was shown in [6] [ER97] that to create a
four-dimensional analog of our Example 5 one needs huge amounts (e. g. 10³² M_galaxy) of 'negative
energy'". Example 6 does the same with a wormhole mouth carried outbound: "the mouth only moves away
from the Earth. So causality is preserved".

### Everett & Roman (1997)

In 4D the tube is laid down along the outbound path: "In four dimensions the modification of the
metric begins along the path of the spaceship [...] occurring at position x at time t ≈ x". The
ship travels "at a speed which for simplicity we take to be only infinitesimally less than the
speed of light, so that it arrives at t ≈ D". The metric is Eqs. (12)–(13). The return time is
t_E = Dδ ("can be made arbitrarily small"). A single tube has no CTCs, but "a time machine can be
constructed with a system of two non-overlapping tubes" (§4).

WEC violation is shown generally: T_tt < 0 near the tube axis (Eq. 14 and the argument after it).
Quantum-inequality constraints, with sampling time τ₀ = σε (σ ≪ 1):

- Wall thickness, Eqs. (44)–(45): ε ≲ l_P/σ², so ε ≲ 10⁴ l_P ≈ 10⁻³¹ m for σ ≈ 0.01.
- Thick tubes, Eq. (46): ρ_max ≲ l_P/σ².
- Total negative energy, Eq. (51): E ≈ −α ρ_max D/ε. With D = ρ_max = 1 m and ε = 100 l_P,
  Eq. (52) gives E ≈ −α 10⁶⁸ m_Planck = −α 10⁶³ g = −α 10¹⁸ M_galaxy. "even if we take α to be very
  small, say 0.01, one requires negative energies of the order of 10¹⁶ galactic masses just to make
  a Krasnikov tube 1 meter long and 1 meter wide. For a tube that stretches from here to the
  nearest star, i. e. D ≈ 4 × 10¹⁶ m, we need E ≈ −10³² M_galaxy."
- A weak-tube loophole: the QI can be met with τ₀ = ε ≈ 1 cm "but only by taking
  η ≈ l_P² ε²/τ₀⁴ ≈ 10⁻⁶⁶", so a light ray would exceed c "by only one part in 10⁶⁶".

Conclusion: negative-energy layers "no thicker than a few thousand Planck lengths", and total
negative energies "unphysically large".

### Santiago, Schuster & Visser (2022)

The framework is Natário's generic warp drive, ds² = −dt² + δ_ij(dx^i − v^i dt)(dx^j − v^j dt): unit
lapse, flat spatial slices, a smooth bounded flow field of "C^{2−} at worst", asymptotic flatness,
and "gradients of the flow field tend to zero at spatial infinity". The authors say this covers
"well over 99% of the relevant literature".

Abstract: "within the framework adopted by those three papers all physically reasonable warp drives
will certainly violate the WEC, and both the strong and dominant energy conditions. Under plausible
subsidiary conditions the null energy condition is also violated."

- WEC (Eq. 7.17), using fall-off: ∫ρ d³x = −(1/32π)∫(ω·ω) d³x ≤ 0.
- SEC, from Raychaudhuri on the geodesic Eulerian congruence: "this argument for SEC violations does
  not require any asymptotic conditions on the flow field at spatial infinity".
- NEC, from Eqs. (7.30)–(7.34): "the violation of the NEC is a necessary condition for the spacetime
  to 'restore its asymptotics' after a warp drive passes through a particular point".

§8: "all members of the general class of warp drives defined by Natário [10] violate the NEC [...]
Because the NEC is violated then so are the WEC, SEC, and DEC." The listed escape routes are "(i)
modify the theory of gravity, (ii) modify the definition of warp drive, (iii) modify the energy
conditions, (iv) appeal to macroscopic quantum physics, (v) allow for singularities or CTCs". The
abstract adds that even in modified gravity warp drives "will still violate the purely geometrical
null convergence condition and the timelike convergence condition".

---

## Q6. Modified gravity: static wormholes without exotic matter in Horndeski and beyond

### Sources

| Key | Citation | arXiv | DOI | Access |
|---|---|---|---|---|
| DGNR06 | S. Dubovsky, T. Grégoire, A. Nicolis & R. Rattazzi, "Null energy condition and superluminal propagation", JHEP **0603**, 025 (2006) | hep-th/0512260 | 10.1088/1126-6708/2006/03/025 | partial (abstract, §1, §8 summary) |
| R14 | V.A. Rubakov, "The null energy condition and its violation", Phys. Usp. **57**, 128 (2014) [UFN 184, 137] | 1401.4024 | 10.3367/UFNe.0184.201402b.0137 | partial (§1, §2.1–2.2, §5) |
| R16a | V.A. Rubakov, "Can Galileons support Lorentzian wormholes?", Theor. Math. Phys. **187**, 743 (2016) [TMF 187, 338] | 1509.08808 | 10.1134/S004057791605010X | partial (abstract, §1 and the conclusions found by search) |
| R16b | V.A. Rubakov, "More about wormholes in generalized Galileon theories", Theor. Math. Phys. **188**, 1253 (2016) [TMF 188, 337] | 1601.06566 | 10.1134/S0040577916080080 | full text read |
| EM18 | O.A. Evseev & O.I. Melichev, "No static spherically symmetric wormholes in Horndeski theory", Phys. Rev. D **97**, 124040 (2018) | 1711.04152 | 10.1103/PhysRevD.97.124040 | full text read |
| MRV18 | S. Mironov, V. Rubakov & V. Volkova, "Towards wormhole beyond Horndeski", EPJ Web Conf. **191**, 07014 (2018) | 1811.05832 | 10.1051/epjconf/201819107014 | abstract and §1 |
| MRV19 | S. Mironov, V. Rubakov & V. Volkova, "More about stable wormholes in beyond Horndeski theory", Class. Quantum Grav. **36**, 135008 (2019) | 1812.07022 | 10.1088/1361-6382/ab2574 | abstract and conclusions |
| MRV23 | S. Mironov, V. Rubakov & V. Volkova, "In hot pursuit of a stable wormhole in beyond Horndeski theory", Phys. Rev. D **107**, 104061 (2023) | 2212.05969 | 10.1103/PhysRevD.107.104061 | abstract and conclusions |
| FHPST19 | G. Franciolini, L. Hui, R. Penco, L. Santoni & E. Trincherini, "Stable wormholes in scalar-tensor theories", JHEP **01** (2019) 221 | 1811.05481 | 10.1007/JHEP01(2019)221 | abstract only |

**Corrections to the titles in the question.**

- No Rubakov 2016 paper titled "Hamiltonian analysis of…" was found: an INSPIRE search for author
  Rubakov AND title "Hamiltonian" returns 0 records. His 2016 wormhole papers are R16a and R16b.
- The Evseev & Melichev 2018 paper is titled "No static spherically symmetric wormholes in
  Horndeski theory", not "Wormholes in beyond Horndeski theory".
- The beyond-Horndeski wormhole papers are MRV18, MRV19 and MRV23 (Mironov, Rubakov & Volkova).

### No-go results and their assumptions

- **DGNR06 (NEC violation and instability, matter sector only).** Assumptions: derivatively coupled
  scalar fields, which include relativistic solids and fluids; no gravitational backreaction ("We
  have not considered extra pathologies that may arise through the gravitational backreaction");
  and "all gapless scalar modes have a nondegenerate dispersion relation ω = vk with v ≠ 0, ∞".
  Result (§8): "we proved that for systems that are either isotropic or do not feature
  superluminality, a violation of the null energy condition always implies an unescapable
  instability." Counterexamples exist: "A necessary feature of all the counter-examples is the
  anisotropy of the background and, perhaps more importantly, the presence of superluminal modes."
  Footnote 1: "NEC prevents the existence of Lorentzian wormholes [4] and of flat bouncing
  cosmologies."
- **R14 (review).** For first-derivative theories L = F(X^IJ, π^I) with minimal coupling, "the
  stability of the background – positive definiteness of V_IJ, eq. (10) – is inconsistent with
  NEC-violation [59]". The ghost condensate is a fine-tuned loophole. Second-derivative theories
  (generalised Galileons/Horndeski) "admit solutions violating the Null Energy Condition and having
  no obvious pathologies" (abstract). In GR, "the NEC also forbids the existence [...] of throats
  in space, both static [19, 20, 21] and time-dependent [22]". Open issues (§5): "the danger of
  superluminality" (tied to UV completion) and "stability against the radiative corrections".
- **R16a.** Assumptions: GR plus generalised Galileon π, "Assuming that Minkowski space-time is
  obtained at ∂π = 0". Result: "there is tension between the properties of the energy-momentum
  tensor required to support a wormhole (violation of average null energy conditions) and
  stability of the Galileon perturbations about the putative solution (absence of ghosts and
  gradient instabilities). In 3-dimensional space-time, this tension is strong enough to rule out
  wormholes with above properties. In higher dimensions, including the most physically interesting
  case of 4-dimensional space-time, wormholes, if any, must have fairly contrived shapes."
- **R16b.** Theory: L = −R/(2κ) + F(π, X) + K(π, X)□π, i.e. minimal coupling to GR, in (d+2)
  dimensions with d ≥ 2. Result: "these theories do not admit stable, static, spherically
  symmetric, asymptotically flat and traversable Lorentzian wormholes." "Stability" means "the
  absence of ghosts and gradient instabilities in the Galileon perturbations". The background "is
  stable, provided that G^00 > 0, G^rr ≥ 0, G^Ω ≥ 0 for every r". The argument shows G^00 > 0 forces
  a singular Q(r). It is general: "no assumption on the behavior of π(r) at r → ±∞ is made".
  Adding NEC-respecting conventional matter "would not help".
- **EM18 (full Horndeski, 4D).** Abstract: "this theory does not admit stable, static, spherically
  symmetric, asymptotically flat, Lorentzian wormholes." Assumptions:
  - the Kobayashi–Motohashi–Suyama stability conditions, i.e. odd-parity F > 0 ("needed to avoid
    the gradient instability") and even-parity 2P₁ − F > 0 ("necessary for the absence of
    ghosts");
  - asymptotic flatness;
  - "General Relativity is restored away from the wormhole throat provided that G₄ → M_Pl²/2,
    G₅ → 0 at r → ±∞".

  The integral ∫(A/B)^{1/2}F dr then diverges and Q⁻¹ must cross zero, so the background is
  singular or unstable.
- **Beyond Horndeski: the no-go is evaded, with partial stability only.**
  - MRV18: "the ghost instabilities which are at the heart of the no-go theorem, can indeed be
    avoided. The wormhole solutions with the latter property are, however, strongly fine tuned,
    and hence it is likely that they are unstable."
  - MRV19: "the proof of the above no-go theorem does not go through beyond Horndeski. [...] We give
    an example of beyond Horndeski Lagrangian which admits a wormhole solution obeying our
    (incomplete set of) stability conditions." Not covered: "spherically symmetric parity even
    modes and parity even perturbations propagating in angular directions, as well as 'slow'
    tachyonic instabilities".
  - FHPST19 (abstract): "scalar-tensor theories of 'beyond Horndeski' type can have wormhole
    solutions that are free of ghost and gradient instabilities. Such solutions are instead
    forbidden within the more restrictive 'Horndeski' class of theories."
  - MRV23: stability conditions for "the absence of ghosts and both radial and angular gradient
    instabilities", completing "the stability analysis for high energy modes in both parity odd and
    parity even sectors, while 'slow' tachyonic instabilities remain unconstrained"; an example
    "complies with all stability constraints for the high energy modes". Conclusion: "It remains a
    challenging and intriguing question whether it is possible to have a completely stable wormhole
    in theories like generalised Horndeski family, let alone make it realistic and observationally
    traceable."

---

## Q7. Maldacena–Milekhin–Popov (2018/2023) and Maldacena–Milekhin (2021)

### Sources

| Key | Citation | arXiv | DOI | Access |
|---|---|---|---|---|
| MMP | J. Maldacena, A. Milekhin & F. Popov, "Traversable wormholes in four dimensions", Class. Quantum Grav. **40**, 155016 (2023) | 1807.04726 (v3, 2020) | 10.1088/1361-6382/acde30 | partial (§§1, 2.1, 5.1–5.5, 7, 8, 9.1) |
| MM | J. Maldacena & A. Milekhin, "Humanly traversable wormholes", Phys. Rev. D **103**, 066007 (2021) | 2008.06618 (v2) | 10.1103/PhysRevD.103.066007 | full text read (§§1–4; appendices skimmed) |

### (a) Throat size, length, mouth mass and travel time

**MMP gives parametric results only**, for Einstein–Maxwell theory with charged massless fermions
and magnetic charge q ≫ 1:

- Throat radius, Eq. (2.3): r_e² ≡ π q² l_p²/g².
- Length parameter, Eq. (5.31): ℓ = 16 r_e³/(G_N q) = 16π^{3/2} q² l_p/g³. Binding energy:
  E_min = −G_N q²/(256 r_e³) = −g³/(256 π^{3/2} q l_p).
- Travel time seen from outside, Eq. (5.20): πℓ. "if an outside observer sends a signal into one
  side at t = 0, he or she will see it emerge from the other side at time t = πℓ."
- Proper traversal time (§9.1): "the proper time that it takes for an observer to go through the
  wormhole is of order the light crossing time of the black hole, or r_E ∼ q. This is much smaller
  than the time it takes to go through the wormhole as seen from the outside, which is πℓ ∝ q²."
- Size limits: "these wormholes are not safe for human travelers, who will need r_e much larger
  than their Compton wavelength!" (§5.4). For the Standard Model embedding (§8), r_e and d must be
  "much smaller than the electroweak scale", and the SM gives "an effective number of flavors
  N_f = 54 of charge one" (or N_f = 9 with usual hypercharge and q a multiple of six).

**MM, free-fermion version (§2.4):**

- Eq. (2.15): ℓ/r_e = 16π q/(g₄² N_f) and E_bin r_e = 2⁻⁸ g₄² N_f².
- Tidal limit: "we need r_e > 10⁷ m". With a 10³ kg spaceship, Eq. (2.16) needs N_f > 10⁵², which
  "is too large if we want the UV cutoff [...] above the TeV scale, since we expect that
  N_f < M_pl²/(TeV)² ∼ 10³²".

**MM, Randall–Sundrum II version (§3.3):**

- Tidal limit, Eq. (3.26): 20g > size/r_e², so "r_e > 1.5×10⁷ m ∼ .05 s" for a 0.5 m traveller.
- In terms of r_e: c₂ = 4π R₅ r_e/(G₄ √log(r_e/R₅)), ℓ = (4/π)(r_e²/R₅)√log(r_e/R₅), and
  E_bin = −(π²/16) R₅²/(G₄ r_e log(r_e/R₅)).
- With R₅ = 50 µm, Eq. (3.27): "r_e ∼ .05 s, c₂ ∼ 7×10⁷², ℓ ∼ 3×10³ ly, γ = ℓ/r_e ∼ 2×10¹²,
  E_bin ∼ −5×10⁹ kg". The proper traversal time is πr_e.
- Introduction: "one could travel in less than a second between distant points in our galaxy. A
  second for the observer that goes through the wormhole. It would be tens of thousands of years
  for somebody looking from the outside." Note that π × 3×10³ yr ≈ 9×10³ yr.
- §3.3: "This time is basically unchanged as long as the distance, d, between the two mouths is
  smaller d ≲ ℓ."
- Mouth mass, Eq. (2.5): M_e = r_e/G₄ (extremal mass, c = 1). The conclusions say only "From the
  outside they resemble intermediate mass charged black holes." The smaller case r_e ∼ R₅
  "would correspond to a mass M ∼ 10²³ kg".

**On "mouths of order 10⁴ solar masses":** MM states no solar-mass figure.

- Note (ours): their Eq. (2.5) with r_e = 1.5×10⁷ m gives M_e = r_e c²/G ≈ 2.0×10³⁴ kg ≈
  1.0×10⁴ M_⊙ per mouth. The claim is therefore consistent with MM's numbers but is a derived
  figure, not a quotation.

### (b) Scaling of length with radius and number of fields

- MMP §7, with N_f flavours, Eq. (7.58): ℓ = 16 r_e³/(G_N q N_f) ∝ (q²/N_f) l_p, and
  E_min ∝ −(N_f²/q)(1/l_p), valid for qN_f ≫ 1. "In this case we can obtain wormholes which allow
  passage of objects smaller than r_e."
- MM Eq. (2.12), general 2D central charge c₂ (c₂ = N_f q for free fermions): ℓ = 16 r_e³/(G₄c₂).
  Eq. (2.15): ℓ/r_e = 16π q/(g₄² N_f). The RS2 version (§3.3) is ℓ = (4/π)(r_e²/R₅)√log(r_e/R₅).
  - Note (ours): substituting q = g₄ r_e/(√π l_p) from Eq. (2.5) into Eq. (2.15) gives
    ℓ = 16√π r_e²/(g₄ N_f l_p). This has the form "length ∝ r²/(N l_P)" with an extra 1/g₄. The
    papers do not write it in this form.
- MM Eq. (2.14): ℓ/r_e = γ ≫ 1, "the boost factor that a particle that starts non-relativistic
  outside would acquire at the center of the wormhole."

### (c) Is the wormhole shorter or longer than the external path?

**Longer.**

- MMP §1: "Traversable short wormholes that join very distant points in space, and would lead to
  causality violation, are not allowed by the Einstein equations combined with the achronal
  average null energy condition [1, 2, 3, 4]. However, long traversable wormholes are in principle
  allowed. By 'long' we mean that it takes longer to go through the wormhole than through the
  ambient space."
- MMP §5.5: "This ensures that in all cases πℓ > d, which is saying that it takes longer to go
  through the wormhole than through the ambient space." For d ≫ d₀ ∝ q²l_p, "πℓ grows linearly
  with d, with a coefficient which is greater than one, and numerically of order 2.35."
- MM §1: "the time it takes to go through the wormhole should be longer than the time it takes to
  travel between the two mouths on the outside". Footnote a: "This also implies that they can not
  be converted into time machines [4]."
- MM §2.3: "Even when we do not make that assumption we find that the time through the wormhole is
  always longer than through the outside, πℓ > d."
- HMSW19 footnote 1 (Q8) agrees: "In these examples, it takes longer to go through the wormhole
  than to go around. As these papers explain, one expects this will be true for all traversable
  wormholes since it is required by the generalized second law [7] and boundary causality (when
  there is a field theory dual)."

---

## Q8. Horowitz, Marolf, Santos & Wang (2019), "Creating a traversable wormhole"

### Source

G.T. Horowitz, D. Marolf, J.E. Santos & D. Wang, Class. Quantum Grav. **36**, 205011 (2019);
arXiv:1904.02187 (v2); DOI 10.1088/1361-6382/ab436f. **Partial**: §§1, 2, 4, 5 (to Eq. 5.7), 6.1
(Eqs. 6.14–6.18) and 7 read; §§3, 6.2–6.3 skimmed.

### What is created, and by what process

- Abstract: "We argue that one can nucleate a traversable wormhole via a nonperturbative process in
  quantum gravity. To support this, we construct spacetimes in which there are instantons giving a
  finite probability for a test cosmic string to break and produce two particles on its ends. One
  should be able to replace the particles with small black holes with only small changes to the
  spacetime away from the horizons. The black holes are then created with their horizons
  identified, so this is an example of nucleating a wormhole. Unlike previous examples where the
  created black holes accelerate apart, in our case they remain essentially at rest. [...] In our
  case, back-reaction from quantum fields can make the wormhole traversable."
- The process is quantum tunnelling described by Euclidean instantons with a sum over topologies
  (§1). The test string and particles neglect backreaction: "We will also neglect the backreaction
  of the cosmic string and created particles."
- All backgrounds are asymptotically AdS: an "AdS star" with a stated mass distribution (§5), and
  vacuum solutions with a deformed boundary metric (§6). "We will indeed find backgrounds that
  admit instantons with vanishingly small accelerations, though ours will be asymptotically anti-de
  Sitter."
- Traversability is argued from earlier work rather than computed (§7): "In the limiting case of
  zero acceleration and for instantons free of conical singularities, the path integral computing
  the wormhole's quantum state is precisely of the form studied in [6], so with appropriate
  boundary conditions the back-reaction of quantum fields will render the wormhole traversable in
  the semiclassical approximation. (We again remind the reader that some large parameter is
  generally required to render quantum fluctuations small [5].)"

### Probability and rate statements

- Eq. (2.1): "the decay rate is given by Γ = |K| e^{−2ΔS} where K is the contribution from small
  fluctuations about the instanton. This vanishes in the limit since the negative mode goes away."
- In the exactly static (degenerate-minima) limit "ΔS remains finite [...] but the decay
  probability goes to zero". The paper therefore "calculate[s] ΔS in the limit that the minima
  become degenerate and interpret[s] it as providing the leading semiclassical decay rate when the
  minima are slightly separate". They "expect K for such cases to be proportional to some positive
  power of the l_planck, and ΔS to diverge like an inverse power of l_planck, so the leading
  contribution to Γ as l_planck → 0 is indeed e^{−2ΔS}."
- Eq. (4.1a): "the production rate of such instantons is given by Γ = e^{−2ΔS}".
- AdS-star example: ΔS in closed form, Eq. (5.7a).
- Vacuum examples (deformation amplitude ε, multipole ℓ, particle mass m, AdS radius L):
  - Eq. (6.16): ΔS_ℓ = π m L + O(ε log ε).
  - Eq. (6.18): ΔS_{ℓ=2} = πLm{1 + (3/16)ε[1 + π/2 + 2 log(3πε/32)]} + O(ε² log ε).
- Caveat (§7): "instantons with conical singularities can sometimes yield higher pair-creation rates
  than smooth ones (see e.g. [19]). This seems likely to occur in our context". Hence "it may thus
  not suffice to simply wait for the first wormhole to appear on our static trajectory. One must
  also wait some additional time for one that is nearly extremal."
- Traversability criterion for the 4D wormholes of [5] (MMP), Eq. (1.1): a d ≪ l_planck/r₀, with a
  the acceleration and d the separation.

### Are the mouths created adjacent?

**No. They are created at a finite separation, essentially at rest, not at a point.**

- §1: "to achieve this we need to create the wormhole mouths a finite distance apart with
  arbitrarily small acceleration."
- §2: "We will also refer to the static separation as the 'separation between the created
  particles' with the understanding that this is the limiting case."
- AdS star, Eq. (5.4): the particles sit at radius r₁ = R(R/3M)^{1/6}, with r₁ < R.
- Vacuum examples, Eq. (6.14): r₁ = [2ℓ/(ℓ+1)] [Γ(ℓ/2)²/Γ((ℓ+1)/2)²] (L/ε) + O(ε⁰).
- Proper separation, Eq. (6.15): P_ℓ = 2L log(2r₁/L) + O(ε). Eq. (6.17), ℓ = 2:
  P = 2L log(32/(3πε)) + O(ε). The separation is a few AdS radii and grows logarithmically as
  ε → 0.
- In unperturbed global AdS "the E = 0 condition would require the particles to be created
  infinitely far apart" (§6).
- The contrast case (§1): in earlier black-hole pair creation, "the background fields cause the
  black holes to quickly accelerate away from one another [...] the black holes are separated by an
  acceleration horizon", and "If one tries to tune parameters to reduce the acceleration, the black
  holes are created farther and farther apart."

---

## Summary table

| Question | Finding | Access status |
|---|---|---|
| Q1(a) Borde–Sorkin conjecture | Causally continuous ⇔ no index 1 or n−1 point. Borde & Sorkin's own paper was never published ("in preparation"/"Unpublished"). BDGSS99 proved it for Cartesian-flat neighbourhoods. DGS00 proved: index 1 or n−1 ⇒ every Morse geometry from f discontinuous; none ⇒ some continuous geometries exist (h Cartesian near the critical points). D02: "It remains to be proved" that every λ ≠ 0, 1, n−1, n Morse metric is continuous. | DS98, DGS00, BDGSS99 full; D02 partial; Borde–Sorkin not accessed (unpublished) |
| Q1(b) Handle creation with index 2 | Yes. S³ → S²×S¹ (and ℝ³ → S²×S¹ − pt, "ℝ³ with a handle") via the black-hole pair-creation cobordism with a single index-2 point, which is causally continuous. The B³×S¹ − B⁴ alternative needs index 1 ("two distant regions ... touching") and is discontinuous. Generalisation: S^{n−1} → S^{n−2}×S¹ with one index (n−2) point, continuous for n ≥ 4. The U-tube for prime pairs is always discontinuous. Lickorish–Wallace: every 3+1 transition has an index-2-only cobordism. | DS98, DG98 §3.2, D02 |
| Q1(c) Timelike gradient / causal locality | Not stated in those words. Explicit: h^μν∂_νf is timelike and f a time function; P = I⁻(descending disc) and F = I⁺(ascending disc) are "the chronological past and future of the critical point" (J⁻(p) = P̄ in BDGSS99 §7); for index 1, P splits into two components on the two sides that are joined; causal curves near p stay near p (DGS00 Claim 3); Sorkin: topology change "happening" at the degenerate points. "Localised" in DG98/D02 means spatially compact. | DGS00, BDGSS99 full; D02, S97, DG98 partial |
| Q2 Geroch | Abstract: topology change "can occur if and only if the model is acausal" under certain conditions. Precise hypotheses known only from secondary restatements (Siino; DS98; H92; B94): compact, time-orientable, spacelike boundary, no CTC ⇒ product. Kinematical; no energy condition. Theorem numbering differs between secondary sources. | abstract only (+ secondary) |
| Q2 Tipler | Einstein equations + WEC on Geroch's compact topology-changing spacetime ⇒ no topology change, without a causality assumption; topology change in a finite region ⇒ singularities. B94 adds: a generic condition on all geodesics, including those ending on ∂M; closed/externally-Lorentzian cases; Theorem 5 non-compact ⇒ singularity or point at infinity. | abstract only (+ B94's account) |
| Q2 Borde 1994 | Causal compactness; Theorem 1 (no CTCs ⇒ product, no field equation); Theorem 3 (dimension ≥ 3, null generic condition on full null geodesics, half-integral null convergence ⇒ product, connected; no geodesic-completeness assumption). Unpublished preprint. | full text read |
| Q2 Gibbons–Hawking | Yes, pairs. Assumptions: compact region (or timelike tube), everywhere non-singular Lorentzian metric, SL(2,ℂ) spinor structure (orientable, time-orientable, Spin(4)). Invariant = mod-2 Kervaire semi-characteristic; u(S³) = 1, u(S¹×S²) = 0. Single handle forbidden, pairs "kinematically possible". CTCs still present (Geroch). Evaded by degenerate vierbeins/Riemannian metrics or Spin^c. GH92b: wormholes + kinks conserved mod 2. | full text (scan, some formulas illegible); GH92b abstract |
| Q2 Horowitz 1991 | First-order formulation: smooth solutions with topology change, metric degenerate on measure zero, curvature bounded; "if degenerate metrics play any role in quantum gravity, topology change is unavoidable." | abstract only |
| Q3 Roman ring | N identical wormholes (example N = 4), mouths mutually at rest, spatial jump L, time shift T ≪ L, polygon with normal-space gaps ℓ (R ≪ ℓ ≪ L). Loop interval N²(ℓ² − T²). ⟨T⟩ ∝ (R/2ℓ)^{2(N−1)}/N² → 0 as N → ∞, so back-reaction stays small down to the reliability horizon. Conclusion: no physically reliable semiclassical chronology protection theorem. | full text read |
| Q3 Network as graph / Bellman–Ford / time function | Not found in physics literature. Closest: V94 two-wormhole loop sum ΔT = T₁ + T₂ + 2ζ; ER97 tube networks need a "preferred axis" to avoid CTCs; FKZ23 non-potential acceleration as a first-cohomology class. Bellman–Ford negative-cycle versions exist only as programming-contest problems (UVa 558; USACO 2006 Dec Gold), with no relativistic causal structure. | V97 full; V94, V02, FKZ23 partial; contest statements read |
| Q4 Frolov–Novikov drift and "c/g" | FN90 full text not accessed; abstract only. Accessible formulas: V93 T = ∫(√g₀₀ − 1)dt with a time machine when T > ℓ; L07 √g_tt-difference integral; FKZ23 T ≈ ℓ/I_C (6.7), T ≈ RLc/(GM) (6.9). "c/g independent of height": not found. | FN90/F91 abstract only; V93, L07, FKZ23, N89 partial |
| Q4 MTY 1988 | One mouth accelerated to near-c and returned; it "ages" less; CTCs through the wormhole. Creating a wormhole needs CTCs and/or a discontinuous light-cone choice, plus WEC violation. | full text read |
| Q4 RSET growth | KT91: T^μν ~ (b/D)^{N or N−1}/(D Δt³), δg ~ (l_P/D)(l_P/Δt), dominant N = 1 at the closed null geodesic; cut off at Δt ~ l_P gives δg ~ l_P/D ~ 10⁻³⁵. H92: ⟨T⟩ ∝ Bt⁻⁴ (t = invariant distance to the CNG); observer-measured energy density Bd⁻¹s⁻³; metric perturbation GBd⁻¹s⁻¹; invariant Planck cutoff (t² ~ ds) gives perturbation of order 1. | KT91 partial (pp. 3929–37); H92 partial (pp. 603–4, 608–11) |
| Q5 Krasnikov 1998 | No faster one-way arrival in globally hyperbolic spacetimes (Prop. 1). A metric change made on the near-c outbound leg (inside the causal future of departure) allows an arbitrarily short round trip (Earth clock). A "square root" of a time machine; needs WEC violation; ~10³² M_galaxy via ER97. | full text read |
| Q5 Everett–Roman 1997 | 4D tube built along the outbound path at just under c. Two non-overlapping tubes make a time machine. QI: walls ε ≲ l_P/σ² ≈ 10⁴ l_P; E ≈ −α ρ_max D/ε, i.e. 10¹⁶ M_galaxy for a 1 m tube and 10³² M_galaxy to the nearest star; the weak-tube escape gives speed-up 10⁻⁶⁶. | full text read |
| Q5 SSV 2022 | Every Natário-class warp drive (unit lapse, flat slices, smooth, asymptotically flat flow gradients) violates the WEC, SEC and DEC, and the NEC under plausible subsidiary conditions. Modified gravity still violates the null and timelike convergence conditions. | partial |
| Q6 Horndeski / beyond | No-go: R16b (cubic generalised Galileons + GR, d ≥ 2) and EM18 (full Horndeski 4D; KMS stability conditions; GR restored at infinity): no stable static spherically symmetric asymptotically flat wormholes. DGNR06: stable NEC violation needs anisotropy and superluminal modes. Beyond Horndeski evades the no-go (MRV18/19, FHPST19); MRV23 example satisfies all high-energy stability conditions but slow tachyonic modes are unconstrained. Full stability is open. "Rubakov 2016 Hamiltonian analysis": no such paper found. | R16b, EM18 full; others partial or abstract |
| Q7 MMP / MM | Long wormholes: πℓ > d always, so not time machines. MMP: ℓ = 16 r_e³/(G_N q N_f) ∝ q² l_p/N_f, outside time πℓ, proper time ~ r_e. MM-RS2 example: r_e ≈ 1.5×10⁷ m (0.05 s), ℓ ≈ 3×10³ ly, γ ≈ 2×10¹², c₂ ≈ 7×10⁷², E_bin ≈ −5×10⁹ kg, R₅ = 50 µm. 10⁴ M_⊙ per mouth is not stated; it follows from M_e = r_e/G₄ (our arithmetic). Free fermions need N_f > 10⁵². | MM full; MMP partial |
| Q8 HMSW 2019 | In asymptotically AdS backgrounds, a test cosmic string breaks into two nearly static particles, to be replaced by small black holes with horizons identified, i.e. a wormhole. Traversability via quantum back-reaction is argued, not computed. Rate Γ = \|K\| e^{−2ΔS}, with ΔS = πmL + O(ε log ε) in vacuum examples; the rate → 0 in the exactly static limit. Mouths created a finite distance apart (r₁ ∝ L/ε, proper separation 2L log(2r₁/L)), not adjacent. | partial (most sections) |
