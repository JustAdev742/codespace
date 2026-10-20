"""Constraint-based feasibility framework for portal architectures.

Design rules (from the brief, and to avoid a meaningless score):
  * A requirement's status is categorical.  Numbers appear only where a ratio of required to
    available is defined by a calculation in this package; unproven conditions get no number.
  * Statuses are ordered by how firmly they exclude:
        THEOREM   excluded by a theorem, within the stated assumptions
        ROBUST    excluded in every explicit model examined, with a scaling argument
        NEWPHYS   requires matter or physics that no established theory provides
        OPEN_NEG  unresolved, with strong evidence against (a conjecture, absence of mechanism)
        OPEN      unresolved, no applicable result either way
        ENG       allowed by known physics; limited by engineering (quantified)
        OK        satisfied
  * Requirements are evaluated in dependency order (creation -> holding open -> stability ->
    traversal -> endpoint control -> device).  The first decisive blocker is the first
    requirement whose status is THEOREM, ROBUST or NEWPHYS; everything after it is conditional.
"""
from dataclasses import dataclass, field

import numpy as np

from .constants import c, G, g0, hbar, l_P, M_jup, atm, day, year

ORDER = ["THEOREM", "ROBUST", "NEWPHYS", "OPEN_NEG", "OPEN", "ENG", "OK"]
DECISIVE = {"THEOREM", "ROBUST", "NEWPHYS"}
STAGES = ["create", "hold", "stabilise", "traverse", "endpoints", "device"]


@dataclass
class Req:
    key: str
    stage: str
    text: str
    status: str
    basis: str                       # where the status comes from
    assumptions: str = ""
    log10_deficit: float = None      # log10(required / available), only when calculated
    na: bool = False                 # not applicable to this architecture

    def __post_init__(self):
        assert self.status in ORDER and self.stage in STAGES


@dataclass
class Architecture:
    key: str
    name: str
    description: str
    reqs: list = field(default_factory=list)
    meets_portal_definition: bool = True

    def ordered(self):
        return sorted([r for r in self.reqs if not r.na], key=lambda r: STAGES.index(r.stage))

    def first_decisive(self):
        for r in self.ordered():
            if r.status in DECISIVE:
                return r
        return None

    def worst(self):
        rs = [r for r in self.reqs if not r.na]
        return min(rs, key=lambda r: ORDER.index(r.status))


# ------------------------------------------------------------------ quantities used in the table

def numbers(r0=1.0, f=0.01):
    """Headline numbers for a throat of radius r0 (m), from the package's own formulas."""
    D_smooth = (4 * np.pi / 3) * f**4 * (r0 / l_P) ** 2
    a_band = (3 * r0 * l_P**2 / (32 * np.pi * f**4)) ** (1 / 3)        # D = 1 for the thin band
    rho_band = c**4 / G / (8 * a_band * r0)                            # J/m^3 (magnitude)
    casimir_1um = np.pi**2 * hbar * c / (720 * (1e-6) ** 4)
    gap_needed = (np.pi**2 * hbar * c / (720 * rho_band)) ** 0.25
    w_rim = np.sqrt(3 / (8 * np.pi)) * l_P / f**2
    s = 1.1819727 * c / r0
    return {
        "D_smooth": D_smooth,
        "log10_D_smooth": float(np.log10(D_smooth)),
        "a_band_m": a_band,
        "rho_band_J_m3": rho_band,
        "log10_band_vs_casimir_1um": float(np.log10(rho_band / casimir_1um)),
        "casimir_gap_for_band_m": gap_needed,
        "w_rim_m": w_rim,
        "tension_throat_Pa": c**4 / (8 * np.pi * G * r0**2),
        "misner_sharp_per_side_kg": -r0 * c**2 / (2 * G),
        "misner_sharp_per_side_MJ": -r0 * c**2 / (2 * G) / M_jup,
        "efold_s": 1 / s,
        "pd_delay_max_s": np.sqrt(2) / s,
        "pressure_force_N": atm * np.pi * r0**2,
        "vertical_pair_days": c / g0 / day,
        "pulsed_max_open_s": np.sqrt(l_P * r0) / c,
    }


def architectures(r0=1.0, f=0.01):
    n = numbers(r0, f)
    A = Architecture("A", "Direct creation (the show's gun)",
                     "The handheld device makes a new connection between here and a chosen remote place.")
    A.reqs = [
        Req("A1", "create", "Create a connection to a distant region on demand", "THEOREM",
            "Local-creation lemma (D2 sec. 5): in Morse topology change the regions a new handle "
            "joins lie in the causal past of one event, so both mouths start at one place; "
            "Lorentzian (non-degenerate) topology change needs closed timelike curves (Geroch 1967).",
            "Classical or semiclassical spacetime; topology change either Lorentzian or through "
            "isolated Morse degeneracies; no closed timelike curves."),
        Req("A2", "hold", "Hold a macroscopic shortcut throat open", "NEWPHYS",
            f"QI audit: smooth throats excluded by 10^{n['log10_D_smooth']:.0f}; the thin-band "
            f"escape needs |rho| = {n['rho_band_J_m3']:.1e} J/m^3 (no known matter).",
            "Flat-space QIs applied with f = 0.01; free fields."),
        Req("A3", "stabilise", "Keep it stable", "ROBUST", "All explicit models unstable (D2 sec. 6).", ""),
        Req("A4", "endpoints", "Reach 'other dimensions'", "OPEN_NEG", "No theory supplies a mechanism.", ""),
    ]
    B = Architecture("B", "Pre-existing connection (network terminal)",
                     "Linked mouths already exist; the device opens and steers a local mouth.")
    B.reqs = [
        Req("B1", "create", "A macroscopic traversable shortcut exists already (natural or built)",
            "OPEN_NEG", "No natural mechanism; none detected (lensing searches give upper limits); "
            "a shortcut violates the achronal ANEC, conjectured to hold self-consistently.", ""),
        Req("B2", "hold", "It stays open with available matter", "NEWPHYS", "As A2.", ""),
        Req("B3", "stabilise", "Stable against traffic and environment", "ROBUST",
            f"Ellis e-folds in {n['efold_s']*1e9:.2f} ns; feedback needs loop delay < "
            f"{n['pd_delay_max_s']*1e9:.2f} ns and NEC-violating actuation.", ""),
        Req("B4", "traverse", "Survivable crossing", "OK",
            "Tidal impulse ~ v w / r0 ~ 1 m/s at walking speed through smooth or thin-band throats.", ""),
        Req("B5", "endpoints", "Chronology management", "ENG",
            f"Vertical pairs reach closed causal curves in {n['vertical_pair_days']:.0f} days; "
            "the network checker gives days to millennia; manageable by schedule.", ""),
        Req("B6", "device", "Handheld (light) mouth", "NEWPHYS",
            f"Misner-Sharp sum rule (a theorem for static spherical mouths): a mouth lighter than "
            f"r0 c^2/2G = {abs(n['misner_sharp_per_side_MJ']):.2f} Jupiter masses must contain negative "
            "energy of that size; otherwise it weighs as much as a black hole of the throat's size.",
            "Static, spherically symmetric mouth."),
    ]
    C = Architecture("C", "Distributed system",
                     "A facility creates throats locally, keeps them, and carries mouths at <= c; the "
                     "handheld unit is a terminal.")
    C.reqs = [
        Req("C1", "create", "Create a throat locally", "OPEN_NEG",
            "Classical: needs CTCs (Geroch) or degenerate metrics; quantum nucleation proposed "
            "(Horowitz et al. 2019) without controllable rates.", ""),
        Req("C2", "hold", "Hold it open", "NEWPHYS", "As A2.", ""),
        Req("C3", "stabilise", "Stability", "ROBUST", "As B3.", ""),
        Req("C4", "traverse", "Survivable crossing", "OK", "As B4.", ""),
        Req("C5", "endpoints", "Transport mouths and manage drift", "ENG",
            "A launched mouth keeps margin 1 - (1 - 1/gamma)/beta; drift rates U/c^2 - v^2/2c^2.", ""),
        Req("C6", "device", "Handheld terminal", "NEWPHYS", "As B6.", ""),
    ]
    D1 = Architecture("D1", "Mouth launcher (the video-game gun)",
                      "The device holds one mouth of a locally made pair and fires the other at a "
                      "surface in line of sight.")
    D1.reqs = [
        Req("D1a", "create", "Create a throat at the device", "OPEN_NEG", "As C1.", ""),
        Req("D1b", "hold", "Hold it open", "NEWPHYS", "As A2.", ""),
        Req("D1c", "stabilise", "Stability during launch", "ROBUST", "As B3, plus acceleration loads.", ""),
        Req("D1d", "endpoints", "Fire a mouth to the target", "OPEN",
            "Accelerating a mouth means pushing its exotic structure; its inertia is its ADM mass, "
            "zero for a massless mouth: no established dynamics.", ""),
        Req("D1e", "endpoints", "Causality of the shot", "OK",
            "Launch at beta leaves margin fraction 1 - (1 - sqrt(1-beta^2))/beta > 0.", ""),
        Req("D1f", "device", "Handheld", "NEWPHYS", "As B6.", ""),
    ]
    D2 = Architecture("D2", "Polygonal flat-face portal",
                      "Visser's cut-and-paste portal: flat faces, exotic matter only on straight "
                      "rim strings; the best-behaved geometry for travellers.")
    D2.reqs = [
        Req("D2a", "create", "Create the cut-and-paste topology", "OPEN_NEG", "As C1.", ""),
        Req("D2b", "hold", "Rim strings with tension -c^4/4G", "NEWPHYS",
            f"QI forces rim core radius <= {n['w_rim_m']:.1e} m (Planck scale): quantum-gravity regime.",
            "Smoothed conical defect; flat-space QI."),
        Req("D2c", "stabilise", "Rim and corner dynamics", "OPEN",
            "Thin curved loops are not consistent sources in GR (to be checked: Unruh et al. 1989); "
            "straight edges need corner supports; no stability analysis exists.", ""),
        Req("D2d", "traverse", "Survivable crossing", "OK", "Flat faces: no tides away from the rim.", ""),
        Req("D2e", "device", "Handheld", "OPEN", "Rim mass-energy -1.1 M_J per metre radius with "
            "zero Komar mass: what a hand would feel is not established.", ""),
    ]
    D3 = Architecture("D3", "Information portal",
                      "Scan, transmit at light speed, rebuild; plus a live two-way window.",
                      meets_portal_definition=False)
    D3.reqs = [
        Req("D3a", "traverse", "Move the same matter through a shortcut", "THEOREM",
            "Nothing moves; signals take at least the light time. Fails the portal definition by design.", ""),
        Req("D3b", "device", "Live window and delivery", "ENG", "Telepresence exists; delivery is ordinary transport.", ""),
    ]
    D4 = Architecture("D4", "Krasnikov tube / warp corridor",
                      "A corridor of modified spacetime laid at <= c, then fast for later travellers.")
    D4.reqs = [
        Req("D4a", "create", "Lay the corridor", "ENG", "Built at <= c along the route (Krasnikov 1998).", ""),
        Req("D4b", "hold", "NEC-violating walls", "NEWPHYS",
            "QI constraints make the walls Planck-thin with huge negative energy (Everett & Roman 1997; to be checked).", ""),
        Req("D4c", "endpoints", "Chronology with two corridors", "OPEN_NEG", "Two tubes can form closed timelike curves.", ""),
    ]
    D5 = Architecture("D5", "Long wormhole (QFT-supported)",
                      "Traversable wormholes supported by quantum fields, longer than the outside path.",
                      meets_portal_definition=False)
    D5.reqs = [
        Req("D5a", "traverse", "Be a shortcut", "THEOREM",
            "Fails by definition: these constructions are computed to be slower than the outside route "
            "(Gao-Jafferis-Wall; Maldacena-Milekhin-Popov), which is what lets them respect the achronal "
            "ANEC; a shortcut version would need the AANEC violation of milestone M1.", ""),
        Req("D5b", "create", "Make one", "OPEN", "Requires magnetically charged near-extremal black holes or a dark sector.", ""),
    ]
    return [A, B, C, D1, D2, D3, D4, D5]


def comparison_table(archs):
    rows = []
    for a in archs:
        fd = a.first_decisive()
        rows.append({
            "key": a.key, "name": a.name, "portal": a.meets_portal_definition,
            "first_decisive": f"{fd.key}: {fd.text} [{fd.status}]" if fd else "none",
            "worst": f"{a.worst().key} [{a.worst().status}]",
            "conditional_after": [r.key for r in a.ordered()[a.ordered().index(fd) + 1:]] if fd else [],
        })
    return rows


# ------------------------------------------------------------------ milestone dependency graph

@dataclass
class Milestone:
    key: str
    question: str
    result_needed: str
    counts_if: str
    method: str
    progress: str
    terminates: str
    unlocks: str
    still_unsolved: str
    needs: list = field(default_factory=list)


def milestones():
    M = [
        Milestone("M0", "Do quantum inequalities hold in curved spacetime with controlled error terms?",
                  "QIs for curved backgrounds with explicit remainders in terms of curvature and sampling time.",
                  "Bounds valid for sampling times up to a fixed fraction of the curvature radius.",
                  "Point-splitting and Hadamard-parametrix methods; null-smeared and worldline QIs.",
                  "Remainder terms small at f ~ 0.01-0.1 for the geometries of D2 sec. 5.",
                  "Explicit states violating flat-space-type bounds at those scales.",
                  "Turns the phase II QI audit from a method into theorems (M1, M3, M4 depend on it).",
                  "Everything physical."),
        Milestone("M1", "Can quantum fields coupled to gravity violate the achronal ANEC on macroscopic scales?",
                  "A self-consistent semiclassical (or quantum-gravity) solution containing a macroscopic achronal ANEC violation, or a proof that none exists.",
                  "Solution with throat >> l_P satisfying the semiclassical Einstein equation and known QIs.",
                  "Curved-space QI/ANEC proofs (null-projected and smeared QIs), holographic constructions, lattice QFT on curved backgrounds.",
                  "Any controlled example of AANEC violation over a region larger than the curvature scale.",
                  "Proof of AANEC (or of a QI with Planck-suppressed loopholes) in curved spacetime.",
                  "Holding open any shortcut throat (M3, M4).", "Topology, stability, control.",
                  needs=["M0"]),
        Milestone("M2", "Is there a physical, computable mechanism for topology change?",
                  "Rates for handle nucleation in a theory of quantum gravity, and their dependence on controllable fields.",
                  "Non-negligible rate for macroscopic or growable handles.",
                  "Euclidean instantons (Horowitz-Marolf-Santos-Wang type), causal-set or spin-foam sums with Morse-index weighting.",
                  "A causally continuous (index-2) creation route with finite particle production and non-zero amplitude.",
                  "Topology change shown to require Planck curvature with exponentially small rates for any macroscopic seed.",
                  "Local creation (C1, D1a, D2a).", "Transport, holding open."),
        Milestone("M3", "Is there NEC-violating matter that can be concentrated into a 10^-21 m band at 10^64 J/m^3?",
                  "A state of known fields reaching the thin-band requirement while obeying all QIs.",
                  "Explicit state (e.g. squeezed or Casimir-type) with the required density and support.",
                  "QI optimisation over states; search for interacting-field QI violations.",
                  "Any negative energy density above the free-field QI at the needed scale.",
                  "QIs proven for interacting fields at those densities.",
                  "Thin-band throats (the only QI-compatible smooth-family escape).", "Stability, creation.",
                  needs=["M0"]),
        Milestone("M4", "Do negative-tension codimension-2 objects (|mu| = c^2/4G) exist as dynamical objects?",
                  "A consistent theory with movable negative-tension strings at Planck thickness.",
                  "Dynamical defects whose tension can be set and whose ends/corners can be supported.",
                  "String-theory defects, effective field theories of defects, QI analysis of conical excess.",
                  "Candidate objects with controllable positions.",
                  "Proof that negative-tension defects are always non-dynamical or ghost-like.",
                  "Flat-face portals (D2).", "Creation of the cut-and-paste topology.", needs=["M0"]),
        Milestone("M5", "Is any traversable geometry stable against generic perturbations and traffic?",
                  "A solution with no growing modes for all perturbations, including infalling matter.",
                  "Spectral and nonlinear stability with physical matter.",
                  "Master equations (as in D2 sec. 6), time evolution, energy methods; parametric and feedback schemes.",
                  "Stable example with matter satisfying QIs (or the matter of M3/M4).",
                  "General instability theorem for NEC-violating throats.",
                  "Usable throats.", "Creation, endpoints.", needs=["M3"]),
        Milestone("M6", "Can a mouth be moved and steered with known forces?",
                  "Equations of motion of a mouth under applied stress-energy, including its exotic support.",
                  "A mouth accelerated to v without destroying the throat.",
                  "Matched asymptotics / effective point-particle description of mouths; numerical relativity.",
                  "Controlled transport in a model.",
                  "Inconsistency of mouth transport with QIs or stability.",
                  "Networks (B, C, D1).", "Chronology management (engineering).", needs=["M5"]),
        Milestone("M7", "Can chronology be managed operationally?",
                  "Control laws keeping every cycle weight of the network positive with a safety margin.",
                  "Schedules that bound all time shifts below the light-time margins.",
                  "The chronology checker (D3) plus vacuum-polarisation estimates near the margin.",
                  "Demonstrated policies for realistic networks.",
                  "Semiclassical instability at margins far larger than any achievable control.",
                  "Persistent networks.", "None at this level.", needs=["M6"]),
        Milestone("M8", "Can a device-scale mouth be light?",
                  "A mouth with ADM mass << r0 c^2/2G and its negative Misner-Sharp energy confined.",
                  "Lightweight mouth satisfying M3/M4.",
                  "Misner-Sharp bookkeeping (D2 sec. 4) beyond spherical symmetry.",
                  "Non-spherical designs with smaller requirements.",
                  "A general theorem extending the sum rule.",
                  "Handheld devices.", "Everything upstream.", needs=["M3", "M10"]),
        Milestone("M9", "Do natural traversable wormholes exist?",
                  "A detection (lensing by negative-mass-like objects, shadows, echoes) or a mechanism that creates and keeps them.",
                  "A confirmed object with a throat and no horizon.",
                  "Microlensing and strong-lensing searches; event-horizon imaging; gravitational-wave echoes.",
                  "Any robust candidate.",
                  "Not a stopping criterion: absence proves little.",
                  "Route B without topology creation.", "Holding open is still needed if it must be enlarged."),
        Milestone("M10", "Does the 'heavy or negative' mass rule extend beyond time symmetry?",
                  "A Penrose-type inequality for traversable throats in stationary or dynamical data.",
                  "Bound M >= sqrt(A/16 pi) unless the energy density is negative for some observer.",
                  "Spacetime Penrose inequality methods; marginally outer trapped surfaces.",
                  "Proof for stationary rotating mouths.",
                  "A counterexample: a light, positive-energy traversable mouth.",
                  "Settles whether a handheld mouth must carry negative energy (M8).", "None upstream."),
    ]
    return M


SHORT = {"M0": "Curved-space QIs with error terms", "M1": "Macroscopic AANEC violation?",
         "M2": "Computable topology change", "M3": "10^64 J/m3 thin-band matter",
         "M4": "Dynamical negative-tension strings", "M5": "A stable traversable geometry",
         "M6": "Moving a mouth", "M7": "Chronology control", "M8": "A light mouth",
         "M9": "A natural wormhole", "M10": "Penrose-type mass bound beyond time symmetry"}


def mermaid(ms):
    lines = ["flowchart TD"]
    for m in ms:
        label = m.key + ": " + SHORT.get(m.key, m.question.split("?")[0][:48])
        lines.append(f'  {m.key}["{label}"]')
    for m in ms:
        for p in m.needs:
            lines.append(f"  {p} --> {m.key}")
    lines += ['  M1 --> HOLD["Any shortcut throat held open"]', "  M3 --> HOLD", "  M4 --> HOLD",
              '  M2 --> CREATE["Local creation"]', '  M9 -.-> EXIST["Pre-existing throat (route B)"]',
              "  CREATE --> M6", "  EXIST --> M6", "  HOLD --> M5",
              '  M7 --> NET["Portal network"]', '  M8 --> HAND["Handheld terminal"]', "  NET --> HAND",
              '  REMOTE["Remote creation (route A)"]:::dead', "  REMOTE -. excluded by the local-creation lemma .-> CREATE",
              "  classDef dead fill:#f3e3e3,stroke:#b04040"]
    return "\n".join(lines)


def is_acyclic(ms):
    deps = {m.key: set(m.needs) for m in ms}
    seen, stack = set(), set()

    def visit(k):
        if k in stack:
            return False
        if k in seen:
            return True
        stack.add(k)
        ok = all(visit(p) for p in deps.get(k, ()))
        stack.discard(k)
        seen.add(k)
        return ok

    return all(visit(k) for k in deps)
