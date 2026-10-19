# Project Portal: engineering study of a hypothetical real portal gun

*Deliverable 6 of 8. If someone set out to engineer a real portal gun from the physics as it stands today,
what would it consist of, what is the status of each part, and what would have to be discovered first?*

**Bottom line.** It cannot be built with known physics. The first parts that fail are not engineering
problems but open (and probably negative) physics questions: creating a handle in space, and holding it open
with matter that violates the averaged null energy condition on macroscopic scales. Everything downstream is
conditional on those.

## 1. Classification used

| Class | Meaning |
|---|---|
| **Established** | Demonstrated technology or measured physics |
| **Extrapolation** | Established physics pushed to new scales; no new principle needed |
| **Investigated, unproven** | Worked out in the theoretical literature for explicit models; never realised or observed |
| **New physics** | Requires something current theory forbids, or that no known theory provides |
| **Unknown** | No theory addresses it well enough to say |

## 2. Requirements

**From the show** (report section 4): handheld; one shot gives a linked pair; the far end at a chosen remote
place without line of sight, including "other dimensions"; door-sized; open for seconds; two-way traffic of
people and liquids; closes on its own; consumable "fluid"; destination history.

**Added by physics** (report sections 2–3), for a 1 m aperture:

| Requirement | Value | Source |
|---|---|---|
| Throat tension, exceeding the energy density | $4.8\times10^{42}$ Pa | MT88 eq. 51 |
| Negative mass-energy present | ~$-2\times10^{27}$ kg (about $-1$ Jupiter mass) | Ellis, flat-face and thin-shell models |
| Negative-energy band thickness, if supplied by free quantum fields | $\lesssim10^{-21}$ m | Ford & Roman 1996 |
| Stabilisation bandwidth | Faster than the 2.8 ns e-folding time | Gonzalez, Guzmán & Sarbach 2009 |
| Crossing speed for ≤ 1 g tides (Ellis) | ≤ 2.2 m/s | MT88 tolerance |
| Pressure seal | Must hold 1 atm across the aperture (32 tonnes-force) | Orifice model |
| Chronology management | Cancel drift of $\Delta\Phi/c^2$; vertical pairs reach closed timelike curves in 354 days | Weak-field GR |
| Far-mouth placement | At or below light speed | Causal structure of GR |

## 3. Three concepts

1. **Throat generator (the show's gun).** The device creates a throat pair on demand and projects the far
   mouth to the target. Needs every "new physics" item below, plus faster-than-light placement. **Ruled
   out** by the causal structure of GR, independently of everything else.
2. **Network terminal.** Mouth pairs are made together (somewhere), carried to destinations at or below
   light speed, and parked. The "gun" opens and steers a local mouth that is already linked. This is the
   only concept consistent with causality. It still needs macroscopic, stable, traversable wormholes.
3. **Known-physics stand-in.** A telepresence window plus physical delivery (vehicles, drones), and quantum
   teleportation for quantum states. **Buildable today**, but it moves nothing through a shortcut: images
   are delayed by at least the light time, objects travel the long way, and teleportation needs a classical
   message.

The subsystem table below is for Concept 2.

## 4. Subsystems and their status

| # | Subsystem | Function | Physics basis | Class |
|---|---|---|---|---|
| 1 | Housing, controls, display, logging | User interface, destination history | Ordinary electronics (the prop in tutorial 04 is this layer) | **Established** |
| 2 | Electronics power | Run the control system | Batteries | **Established** |
| 3 | Ranging and aiming | Measure where a local mouth would go | Time-of-flight sensors, lidar | **Established** |
| 4 | Security, registration, authentication | Control who can open which link | Cryptography, access control | **Established** |
| 5 | Straddle detection and closure interlock | Refuse to close on a body | Sensors and logic (in the simulator) | **Established** |
| 6 | Clock-offset monitoring | Measure drift between mouths | Optical clocks resolve $gh/c^2$ over 1 mm (Bothwell et al. 2022) | **Established** (the measurement) |
| 7 | Drift compensation | Move mouths to cancel accumulated offset | Weak-field GR; mouth kinematics (Morris, Thorne & Yurtsever 1988) | **Investigated, unproven** |
| 8 | Mouth transport | Carry far mouths to destinations at ≤ c | Moving a mouth as a massive body; its mass ranges from zero (massless Ellis) to ~$10^4$ solar masses (Maldacena–Milekhin) | **Investigated, unproven** |
| 9 | Tidal shaping | Keep tides below ~1 g | Choice of geometry (MT88; Visser's flat face) | **Investigated, unproven** |
| 10 | Radiation management | Avoid lethal blueshift of infalling radiation | Near-horizon analyses (Ford & Roman 1996; Maldacena & Milekhin 2021) | **Investigated, unproven** |
| 11 | Mass and charge ledger | Rebalance mouths after traffic | Gauss-law bookkeeping (Susskind 2005; contested by Gratus et al. 2019) | **Investigated, unproven** (weakly) |
| 12 | Long-wormhole physics | A traversable throat with standard-model matter | Maldacena, Milekhin & Popov (microscopic); Maldacena & Milekhin (hypothetical dark sector, astronomical size) | **Investigated, unproven** |
| 13 | Exotic stress-energy source | Supply ~$10^{42}$ Pa of tension with negative averaged null energy | Forbidden in bulk by quantum inequalities for free fields; interacting fields not settled | **New physics** |
| 14 | Negative-tension rim strings | Hold a flat-face aperture open | "No natural mechanism ... is currently known" (Visser 1989) | **New physics** |
| 15 | Throat creation (topology change) | Make the handle | Forbidden classically without closed timelike curves (Geroch) or outright (Tipler, Borde); quantum nucleation proposals unquantified | **New physics** |
| 16 | Throat stabilisation | Suppress nanosecond instabilities and traveller-induced collapse | Unstable in all explicit models; no controller can coordinate faster than light crosses the throat | **Unknown** |
| 17 | Environmental membrane | Hold pressure and stop gas while passing people | Nothing known could span a throat; its interaction with the exotic matter is unknown | **Unknown** |
| 18 | Closure | Remove the handle safely | Topology change again; known throats close by collapsing | **New physics** |
| 19 | Reaching "other dimensions" | Link to separate universes | No mechanism in any theory | **Unknown** |

Twelve of the nineteen items are established or at least worked out on paper. The seven that need new physics
or are unknown (13–19) are exactly the ones that make it a portal rather than a remote control.

## 5. Research milestones

The programme is a dependency chain. Each milestone states the question, the current status, and what
result would allow the next step (go) or end the programme (stop).

| # | Milestone | Status today | Go if | Stop if |
|---|---|---|---|---|
| R1 | Decide whether quantum fields coupled to gravity allow sustained, macroscopic violation of the achronal ANEC | Proven in flat-space QFT (Faulkner et al. 2016; Hartman et al. 2017); conjectured to hold self-consistently (Graham & Olum 2007) | A self-consistent semiclassical solution with a macroscopic throat is found | AANEC is proven in curved spacetime |
| R2 | A physical account of topology change with computable rates | Instanton nucleation proposed (Horowitz, Marolf, Santos & Wang 2019); no rates for controlled creation | A process that creates adjacent mouths with non-negligible probability | Topology change is shown to need Planck-scale conditions with vanishing rates |
| R3 | A traversable solution stable against generic perturbations, including traffic | None known; Ellis unstable, thin shells need an exotic equation of state | A solution whose stability survives realistic matter and traversal | General instability theorem |
| R4 | Measure a negative energy density directly, and test quantum inequalities | Only Casimir forces measured (0.1–6 µm) | Measured negative energy densities beyond QI bounds | QIs confirmed in the regimes that matter |
| R5 | Detect a natural wormhole | Upper limits only (SDSS lens search; EHT on Sgr A*) | A detection, which would give a sample to study | Not a stopping criterion: absence proves little |
| R6 | Make a microscopic traversable wormhole | Requires magnetically charged near-extremal black holes (Maldacena, Milekhin & Popov); no route | Any laboratory or astrophysical route | — |
| R7 | Enlarge one to macroscopic size | Modelled with phantom radiation (Hayward & Koyama 2004), which requires R1 | R1 succeeds with a usable source | R1 fails |
| R8 | Stabilise and control at nanosecond scales | No concept | A stabilisation scheme consistent with causality | Instability grows faster than any causal control |
| R9 | Build a network: transport mouths, manage drift | Physics of drift understood | R3, R6, R7 succeed | — |
| R10 | Make the terminal handheld | Depends on the mouth's mass: zero for a massless Ellis throat, ~$10^4$ solar masses for the Maldacena–Milekhin design | A light, massless-mouth design is stable | Mouths are necessarily astronomical |

**Where it most likely stops.** R1 and R2. Every independent line of evidence in section 2 of the report
points the same way: the averaged energy conditions that a throat must violate are the ones quantum field
theory protects, and topology change has no known controllable mechanism.

## 6. What a team could usefully do today

- **Theory.** Work on the open questions themselves: curved-spacetime quantum energy inequalities,
  achronal ANEC, topology change in quantum gravity. These are active research areas whose answers matter
  well beyond portals.
- **Simulation.** Holographic quantum simulations of traversable-wormhole protocols (as in Jafferis et al.
  2022) at larger sizes, with the controls the critics asked for. These test ideas about quantum gravity;
  they move no matter.
- **Analogues.** Analogue-gravity experiments (water waves, Bose–Einstein condensates) test how waves behave
  in effective geometries, not what geometry matter can produce.
- **Engineering that is real.** Subsystems 1–6 above exist. A prop or a telepresence "portal" that is honest
  about being one is the deliverable that can actually ship.
