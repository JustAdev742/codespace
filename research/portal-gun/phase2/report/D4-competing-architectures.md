# Competing portal architectures

*Project Portal, phase II, deliverable 4. Each architecture is assessed with the constraint framework of
[`code/portal2/feasibility.py`](../code/portal2/feasibility.py) (output:
[results/feasibility.json](../results/feasibility.json)). Statuses are categorical:*

| Status | Meaning |
|---|---|
| THEOREM | excluded by a theorem within the stated assumptions |
| ROBUST | excluded in every explicit model examined, with a scaling argument |
| NEWPHYS | requires matter or physics no established theory provides |
| OPEN_NEG | unresolved, with strong evidence against |
| OPEN | unresolved |
| ENG | allowed, engineering-limited |
| OK | satisfied |

*Numbers appear only where a calculation defines them. The **first decisive blocker** is the first
requirement, in the order create → hold → stabilise → traverse → endpoints → device, whose status is THEOREM,
ROBUST or NEWPHYS. Everything after it is conditional on solving it.*

## Summary

| | Architecture | Is it a portal? | First decisive blocker | Most severe item |
|---|---|---|---|---|
| A | Direct creation (the show's gun) | yes | Create a connection to a chosen distant region on demand **[ROBUST]** | same |
| B | Pre-existing connection (network terminal) | yes | Hold a shortcut throat open with available matter **[NEWPHYS]** | B1 existence [OPEN_NEG]; B6 handheld [NEWPHYS] |
| C | Distributed system (create locally, transport) | yes | Hold it open **[NEWPHYS]** | C1 local creation [OPEN_NEG] |
| D1 | Mouth launcher (the video-game gun) | yes | Hold it open **[NEWPHYS]** | D1d moving a mouth [OPEN] |
| D2 | Flat-face portal (polygonal or circular rim) | yes | Rim strings with tension −c⁴/4G **[NEWPHYS]** (Planck-scale) | same |
| D3 | Information portal (scan, send, rebuild) | **no** | Moving the same matter through a shortcut **[THEOREM]** | — |
| D4 | Krasnikov tube or warp corridor | partly (one-way, after building) | NEC-violating walls **[NEWPHYS]** | two corridors can form a time machine [OPEN_NEG] |
| D5 | Long, QFT-supported wormhole | **no** (slower than going around) | Being a shortcut **[THEOREM]** | making one at all [OPEN] |

**The finding.** Holding a throat open is the earliest decisive blocker for every architecture that is both
causal and a genuine shortcut (B, C, D1, D2, D4). Only direct creation (A) fails earlier, at creation. That
failure is a theorem for classical spacetime and holds in every known quantum construction, but it is not
proven in general (hence ROBUST, not THEOREM; see A below). The two architectures that pass the physics (D3,
D5) do so by not being portals.

## A. Direct creation

**Governing assumptions.** A device at event $p$ produces, on command, a handle whose other mouth opens at
a chosen remote place $q$ (spacelike-separated from $p$, possibly "another dimension").

**Causal analysis.**

- **The local-creation lemma** ([D2 §7.2](D2-research-paper.md)): in Morse topology change, the regions a
  handle joins lie in the causal past of the single event where it forms, and both mouths start there. The
  lemma is a corollary of the constructions of Borde et al. (1999) and Dowker, Garcia & Surya (2000).
  Connecting $p$ to a spacelike-separated $q$ is impossible without either closed timelike curves (Geroch's
  alternative for non-degenerate metrics) or a process with no classical spacetime description.
- **Quantum nucleation is the exception that is not a way out.** Horowitz, Marolf, Santos & Wang (2019)
  construct instantons, in anti-de Sitter space, that create a wormhole with its mouths a finite distance
  apart. The separation is set by a background that already spans it (a cosmic string). The rate is
  $e^{-2\Delta S}$, which vanishes in the exactly static limit. Traversability is argued, not computed. In
  every such construction known, choosing where the far mouth appears requires having reached that place
  first. That is an observation about known examples, not a theorem, so A1 is ROBUST rather than THEOREM.
- **"Other dimensions"** have no mechanism in any theory considered.

**Energy and stability.** Moot, but if granted, the same as C.

**First decisive blocker.** A1 [ROBUST]. A theorem under these assumptions: classical or semiclassical
spacetime; topology change either Lorentzian (then CTCs) or through isolated Morse degeneracies; no CTCs.
Beyond them, the observation about quantum nucleation above.

**Missing physics.** A quantum-gravity process that places a mouth where the device has had no prior
causal reach. That would also be a violation of causality as currently understood.

## B. Pre-existing connection (network terminal)

**Governing assumptions.** Macroscopic traversable shortcut wormholes already exist (natural, primordial,
or built earlier); the handheld device opens, closes and steers access to a local mouth.

**Causal analysis.** Consistent if the network's chronology margin stays positive. The checker gives drift
budgets from 54 days (ground to orbit) and 354 days (stacked pair) to millennia (D2 §8).

**Energy requirements.**

- The radial tension at any smooth throat is 4.8×10⁴² Pa for 1 m.
- The QI audit excludes smooth throats by 10⁶² for any flare-out, including $b'(r_0) = 1$.
- The only escape a walking traveller survives is a band thinner than 10⁻²¹ m carrying −1.6×10⁶⁴ J/m³. That
  holds under Ford & Roman's sampling window; under the curvature-only window (Krasnikov 2003) the band must
  be thinner than 10⁻⁶² m.
- Each light mouth must hold −0.35 Jupiter masses of negative Misner–Sharp energy; otherwise it is as heavy
  as a black hole of its size (Visser, Kar & Dadhich 2003). For mouths of any shape, the Riemannian Penrose
  inequality still requires negative energy density somewhere outside a light mouth (D2 §4.4).

**Stability.**

- **Uncontrolled:** the Ellis throat e-folds every 2.8 ns per metre (González, Guzmán & Sarbach 2009;
  reproduced).
- **Feedback:** needs a loop faster than 3.99 ns per metre, with actuators delivering NEC-violating stress.
- **Parametric driving:** not demonstrated.
- **Charge:** slows the instability near extremality, but by making the mouth a near-extremal black-hole
  exterior. For 1 m that means about 0.7 Jupiter masses, $8\times10^8$ times the Schwinger field, and a
  traveller arriving at $\gamma \sim 10^4$ (D2 §6.7).

**First decisive blocker.** B2 hold open [NEWPHYS]. Preceded by B1 existence [OPEN_NEG]: no natural
mechanism, no detection, and a shortcut must violate the achronal ANEC (conjectured to hold).

**Missing physics.** A macroscopic AANEC-violating source (milestone M1), or the thin-band matter (M3).

## C. Distributed system

**Governing assumptions.** A facility creates throats locally (local creation), keeps them open and stable,
and carries mouths to destinations at ≤ c. The handheld unit is a terminal.

**Causal analysis.** Local creation is consistent with the lemma. Transport at speed $\beta c$ leaves a
chronology margin fraction $1 - (1 - \sqrt{1-\beta^2})/\beta$ (0.95 at 0.1 c, 0.13 at 0.99 c), never zero.
Afterwards the network obeys the drift budgets of B.

**Energy requirements.** As B, plus whatever creation costs (unknown).

**Stability.** As B, plus transport loads.

**First decisive blocker.** C2 hold open [NEWPHYS]. C1 local creation is [OPEN_NEG]. Classically it needs
degenerate metrics. Quantum nucleation has one explicit construction (Horowitz et al. 2019, in anti-de Sitter
space) and no controllable rate. If topology change occurs at all, the causally continuous route is a single
index-2 point, as Dowker & Surya (1998) and Dowker & Garcia (1998) showed; it is also the topology of
black-hole pair creation.

**What it removes, and what it does not.** It removes the remote-creation theorem by turning it into
transport. It does not remove holding open, stability or chronology.

## D1. Mouth launcher (the video-game gun)

**Governing assumptions.** The device makes a pair locally, keeps one mouth, and fires the other at a
surface in line of sight. This is the physically closest reading of a portal-gun "shot": the projectile is
a wormhole mouth.

**Causal analysis.** A shot at $\beta c$ over distance $d$ leaves margin $(d/c)[1 - (1-\sqrt{1-\beta^2})/\beta]$.
It is causal for all $\beta < 1$ and practically indistinguishable from $d/c$ at any speed a gun could reach.

**Energy and stability.** As C, plus the launch.

**Missing physics.** How to accelerate a mouth (D1d, OPEN). Its inertia is its ADM mass, which for a "light"
mouth is near zero while it carries −0.35 Jupiter masses of negative Misner–Sharp energy per side. No
established dynamics says what pushing such an object does.

**First decisive blocker.** D1b hold open [NEWPHYS].

## D2. Flat-face portal

**Governing assumptions.** Visser's cut-and-paste construction: two flat discs identified crosswise, with flat
space everywhere except on the rims. The rims form one closed string with a conical excess of 2π (total angle
4π), requiring line tension $\mu = -c^2/4G$ (−3.4×10²⁶ kg/m). Visser (1989) treated polygons with straight
edges. A circular rim is also allowed: the zero-mass limit of Kerr is exactly such a ring wormhole (Gibbons &
Volkov 2017), and Feng, Lemos & Matzner (2021) construct smoothed versions.

**Why it is the strongest classical candidate.** A traveller crossing a face feels nothing: no tides, no
exotic matter on the path. The QI audit (D2 §5.5) does not exclude it, provided every rim is thinner than
5.6×10⁻³² m. Krasnikov (2003) reached the same Planck-thickness conclusion for a smoothed portal.

**Energy requirements.** Rim mass-energy is −(π/2)Rc²/G (−1.1 Jupiter masses per metre of rim radius for a
circle; Gibbons & Volkov give "the mass of Jupiter" for 1 m), with zero active gravitational mass because
tension cancels it. The corners of a polygon need their own supports.

**Stability.** No analysis exists. A free circular Nambu–Goto loop collapses in πR/2c (5.2 ns for 1 m), but
$|G\mu/c^2| = 1/4$ is far outside the probe regime where that estimate holds. Dynamics need a finite core:
zero-thickness strings are not distributional sources in GR (Geroch & Traschen 1987), and idealised conical
worldsheets must be totally geodesic (Unruh et al. 1989; Boisseau, Charmousis & Linet 1997).

**First decisive blocker.** D2b rim strings [NEWPHYS]: Planck-scale, Planck-tension negative-energy
strings. Then D2c rim and corner dynamics [OPEN], and creation [OPEN_NEG].

**Missing physics.** Dynamical negative-tension codimension-2 objects (milestone M4).

## D3. Information portal

**Governing assumptions.** Nothing traverses. A two-way window (cameras and displays, light-speed links),
plus scanning, transmission and reconstruction of objects. Quantum states can be teleported only with a
classical message, and the original's state is destroyed (no-cloning).

**Causal analysis.** Signals travel at most at $c$. There is no shortcut, so no chronology problem.

**Status.** Physically allowed, engineering-limited for windows (D3b, ENG). It fails the portal definition
by construction (D3a): the same matter does not pass through a shortcut. Destructive scanning and
rebuilding of a person raises questions that physics does not settle and this study does not address.

**First decisive blocker.** D3a [THEOREM]: special relativity forbids the shortcut. It is the honest
"buildable portal".

## D4. Krasnikov tube or warp corridor

**Governing assumptions.** A corridor of modified spacetime laid along a route at ≤ c on the way out,
which then lets a returning traveller arrive soon after leaving (Krasnikov 1998). Krasnikov proves that in
globally hyperbolic spacetimes the one-way arrival cannot be hastened: "the traveller cannot hasten reaching
the destination". Only the round trip, as timed from Earth, gets shorter.

**Causal analysis.** One tube is causal. Two non-overlapping tubes can form a time machine (Everett & Roman
1997); Krasnikov calls such devices "square roots" of time machines. A network of tubes avoids closed
timelike curves only if all are aligned with "a preferred axis" (Everett & Roman), which is the time-function
condition of D2 §8.1.

**Energy requirements.**

- **Walls.** The walls must violate the WEC. Quantum inequalities make them no thicker than about $10^4$
  Planck lengths for a sampling fraction 0.01.
- **Total negative energy.** A tube 1 m long and 1 m wide needs about $10^{16}$ galaxy masses of it, and a
  tube to the nearest star about $10^{32}$ (Everett & Roman 1997, eqs. 44–52, with their $\alpha = 0.01$).
- **Warp drives generally.** Every warp drive of Natário's class violates the WEC, SEC and DEC, and, under
  plausible conditions, the NEC (Santiago, Schuster & Visser 2022). In modified gravity they still violate
  the null convergence condition.

**First decisive blocker.** D4b walls [NEWPHYS].

## D5. Long, QFT-supported wormhole

**Governing assumptions.** Traversable wormholes supported by quantum fields (Casimir-like effects of
charged fields in long throats, or a non-local boundary coupling), as in Gao–Jafferis–Wall and
Maldacena–Milekhin–Popov.

**Causal analysis.** By construction slower than the external route. That is what allows them to respect
the achronal ANEC (D2 §4.3).

**Status.** Consistent with known physics in specific settings, but not a shortcut. D5a fails by definition:
these constructions are computed to be slower than the outside route, which is what lets them respect the
achronal ANEC. A shortcut version would need the AANEC violation of milestone M1. (For comparison, Gao &
Wald (2000) prove that the fastest paths are not shortened by the bulk, but under the pointwise null energy
condition and a genericity condition, which these wormholes violate, so that theorem is not the reason
here.) Making one is [OPEN]: it needs magnetically charged near-extremal black holes or a dark sector.

**How long, in numbers.** Maldacena, Milekhin & Popov find the outside travel time $\pi\ell > d$ in every
case, growing with separation $d$ with a coefficient of about 2.35. The humanly traversable version of
Maldacena & Milekhin (2021, Randall–Sundrum) has:

- a throat radius $r_e \approx 1.5\times10^7$ m, set by tides;
- about $10^4$ solar masses per mouth, from their $M = r_ec^2/G$ (our arithmetic; the paper states no solar
  mass);
- a throat about $3\times10^3$ light years long;
- a crossing that takes under a second for the traveller and, for an outside observer, $\pi\ell \approx 10^4$
  years (the paper says "tens of thousands of years").

## Cases that failed, and why that matters

- **Rick's gun (remote, instantaneous, any destination)** fails at A1 under explicit assumptions, not just
  by "causality". Granting the creation step does not help, because everything downstream (C2 onward) is
  also blocked.
- **The "zero-mass mouth" idea** fails as stated: a mouth lighter than $r_0c^2/2G$ must carry that much
  negative energy (Misner–Sharp). "Zero mass" hides the requirement.
- **"Gentle throats need little exotic matter"** fails against quantum inequalities: fast observers see the
  full deficit (D2 §5.2).
- **"Stabilise it with fast electronics"** fails twice. Feedback must act within 4 ns per metre through
  NEC-violating actuators, and periodic driving did not stabilise the full field equation in any run.
- **"Charge it and it lasts"** works only by turning the mouth into a near-extremal black-hole exterior: heavy,
  beyond the Schwinger limit, and a gravitational well no one can walk through (D2 §6.7).
- **"Flare it so gently that the QI is satisfied"** (b′(r₀) → 1) fails: the deficit returns beside the
  throat (D2 §5.2).
