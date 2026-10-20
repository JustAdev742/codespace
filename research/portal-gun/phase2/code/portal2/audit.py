"""Independent recomputation of the phase I baseline (report/06-real-portal-engineering-study.md).

Each entry: the claim as written, where it is, the model behind it, an independent recomputation
by this package (a different route from phase I wherever possible), and a verdict:
    VERIFIED   reproduced, and the statement is accurate as written
    QUALIFIED  number reproduced, but the statement needs its assumptions or scope added
    CORRECTED  the statement is wrong or overstated as written
    EXTENDED   reproduced, and phase II adds a stronger or more general result
Literature-dependent items carry the stage B check in `literature`.
"""
import numpy as np

from . import families as fam, tides
from .constants import c, G, g0, atm, M_jup, day, l_P
from .feasibility import numbers
from .stability import growth_rate_shooting


def ledger(r0=1.0, f=0.01):
    n = numbers(r0, f)
    s = growth_rate_shooting()[0]
    # Ellis lateral tide at the throat for a slow traveller: a = v^2 w |B| with |B| = 1/r0^2
    v_max_2m = r0 * np.sqrt(g0 / 2.0)
    v_max_check = None
    for v in np.linspace(0.5, 5, 451):
        if tides.crossing(fam.ellis(r0), v, ell_b=2.0, w_b=2.0)["a_th_max"] > g0:
            v_max_check = v - 0.01
            break
    E_ellis = -np.pi / 2 * r0 * c**2 / G
    E_shell = -2 * r0 * c**2 / G
    L = []

    def add(**kw):
        L.append(kw)

    add(id="B01", where="sec. 2, table", claim="Throat tension, exceeding the energy density: 4.8e42 Pa (MT88 eq. 51)",
        model="Static, spherically symmetric, smooth throat (Morris-Thorne)",
        recomputed=f"tau(r0) = c^4/(8 pi G r0^2) = {n['tension_throat_Pa']:.3e} Pa from the sympy-derived "
                   "p_l at r' = 0; independent of the shape and redshift functions when Phi' is finite",
        verdict="VERIFIED",
        note="Applies to smooth throats. Thin shells carry surface stresses and flat-face portals carry "
             "the stress on line defects instead, so the number is model-class specific.")
    add(id="B02", where="sec. 2, table", claim="Negative mass-energy present: ~-2e27 kg (about -1 Jupiter mass); Ellis, flat-face and thin-shell models",
        model="Integrated static-frame energy density",
        recomputed=f"Ellis {E_ellis:.2e} kg ({E_ellis/M_jup:.2f} M_J); flat-face rim of radius 1 m {E_ellis:.2e} kg; "
                   f"thin shell {E_shell:.2e} kg ({E_shell/M_jup:.2f} M_J) (proper-volume integrals, both sides)",
        verdict="QUALIFIED",
        note="Model-specific, and not a requirement in general. The Misner-Sharp sum rule gives, per "
             f"mouth, Int 4 pi r^2 rho dr = M_ADM - r0 c^2/2G: a light mouth needs {n['misner_sharp_per_side_kg']:.2e} kg "
             f"({n['misner_sharp_per_side_MJ']:.2f} M_J) per side, while a mouth heavier than r0 c^2/2G can have "
             "positive energy density everywhere (the NEC still fails through tension > density). All these "
             "configurations have zero Komar mass: they do not weigh -1 M_J.")
    add(id="B03", where="sec. 2, table", claim="Negative-energy band thickness <~1e-21 m if supplied by free quantum fields (Ford & Roman 1996)",
        model="Morris-Thorne thin-band wormhole; flat-space massless-scalar QI, f = 0.01",
        recomputed=f"Generalised QI audit: thin exotic region of thickness a gives D ~ 8 (a/r0)^3 x 1.6e62; D = 1 at "
                   f"a = {n['a_band_m']:.2e} m (fitted slope 3.0)",
        verdict="EXTENDED",
        note="Reproduced. Phase II adds: (i) smooth throats are excluded by D = 1.6e62 for any flare-out "
             "(boost-optimised bound), so a thin band is necessary, not optional; (ii) the band needs "
             f"|rho| ~ {n['rho_band_J_m3']:.1e} J/m^3, 10^{n['log10_band_vs_casimir_1um']:.0f} times the "
             "Casimir density at 1 um; (iii) slow travellers cross it with a tidal impulse of ~1 m/s.")
    add(id="B04", where="sec. 2, table", claim="Stabilisation bandwidth faster than the 2.8 ns e-folding time (GGS 2009)",
        model="Massless Ellis-Bronnikov wormhole, linear radial perturbations",
        recomputed=f"Own derivation (delta-phi = 0 gauge), four methods: s = {s:.7f} c/b, e-folding "
                   f"{1/s:.6f} b/c = {n['efold_s']*1e9:.3f} ns for b = 1 m",
        verdict="EXTENDED",
        note=f"The control requirement is sharper than 'faster than the e-folding time': delayed PD feedback "
             f"stabilises only if the loop delay is below sqrt(2)/s = {n['pd_delay_max_s']*1e9:.2f} ns "
             "(proportional control alone never does), and the actuator must deliver NEC-violating stress. "
             "Parametric driving was tested and did not stabilise the full field equation.",
        literature="GGS value: see stage B")
    add(id="B05", where="sec. 2, table", claim="Crossing speed for <= 1 g tides (Ellis): <= 2.2 m/s (MT88 tolerance)",
        model="Lateral tide v^2 w |R_lthlth| at the throat; body size 2 m",
        recomputed=f"v <= r0 sqrt(g/w) = {v_max_2m:.3f} m/s; tidal module scan gives {v_max_check:.2f} m/s",
        verdict="VERIFIED",
        note="With MT's 2 m used for the body's width; for a 0.5 m wide body the limit is 4.4 m/s.")
    add(id="B06", where="sec. 2, table", claim="Pressure seal must hold 1 atm across the aperture (32 tonnes-force)",
        model="Force = Delta p x pi r0^2 with r0 = 1 m",
        recomputed=f"{n['pressure_force_N']:.4g} N = {n['pressure_force_N']/g0/1000:.1f} tonnes-force",
        verdict="VERIFIED", note="'Aperture' means a 1 m radius (2 m diameter) opening.")
    add(id="B07", where="sec. 2, table", claim="Vertical pairs reach closed timelike curves in 354 days",
        model="Weak-field drift Delta = -g h t / c^2 against the light-time h/c",
        recomputed="Network checker: 353.85 d for h = 2.5 m and 100 m (analytic c/g = 353.82 d)",
        verdict="EXTENDED",
        note="Independent of height. Phase II generalises to networks (cycle weights; Roman rings) and gives "
             "a schedule-level requirement: every cycle weight must stay positive.")
    add(id="B08", where="sec. 2, table", claim="Far-mouth placement at or below light speed (causal structure of GR)",
        model="Causal structure; topology change",
        recomputed="Local-creation lemma (Morse topology change): the regions joined by a new handle lie in "
                   "the causal past of the creation event, so both mouths start together",
        verdict="QUALIFIED",
        note="True within classical or semiclassical spacetime without closed timelike curves (Lorentzian "
             "topology change needs them: Geroch 1967). Not established in quantum gravity.")
    add(id="B09", where="sec. 3, concept 1", claim="Throat generator 'ruled out by the causal structure of GR, independently of everything else'",
        model="as B08", recomputed="as B08", verdict="CORRECTED",
        note="Overstated. It is excluded under stated assumptions (no closed timelike curves; topology "
             "change either Lorentzian or through isolated degeneracies). Dropping them means allowing a "
             "time machine or a non-classical spacetime, which is a different claim from 'ruled out'.")
    add(id="B10", where="sec. 3, concept 2", claim="Network terminal is 'the only concept consistent with causality'",
        model="Architecture comparison (D4)", recomputed="Mouth launcher (D1) and Krasnikov-type corridors are also causal",
        verdict="QUALIFIED", note="Other causal variants exist; all share the same first blocker (holding a throat open).")
    add(id="B11", where="sec. 4, item 8", claim="Mouth mass ranges from zero (massless Ellis) to ~1e4 solar masses (Maldacena-Milekhin)",
        model="Literature", recomputed="Misner-Sharp: zero-mass mouths need -0.35 M_J of negative energy per side",
        verdict="QUALIFIED", literature="MM mass: see stage B",
        note="'Zero mass' hides the negative-energy requirement.")
    add(id="B12", where="sec. 4, item 13", claim="~1e42 Pa of tension with negative averaged null energy; forbidden in bulk by QIs for free fields",
        model="QI audit", recomputed=f"Smooth throats: D = {n['D_smooth']:.2e}; Ellis ANEC = -c^4/(8 G r0) = {-c**4/(8*G*r0):.2e} J/m^2",
        verdict="EXTENDED", note="Quantified, and shown to be independent of the flare-out; the only static "
                                 "spherical escape is the thin band (B03).")
    add(id="B13", where="sec. 4, item 14", claim="Negative-tension rim strings: no natural mechanism known (Visser 1989)",
        model="Smoothed conical defect, excess 2 pi", recomputed=f"QI forces core radius <= {n['w_rim_m']:.1e} m; |mu| = c^2/4G = {c**2/(4*G):.2e} kg/m",
        verdict="EXTENDED", note="Rims must be Planck-scale objects; whether thin curved loops are consistent sources is a stage B check.")
    add(id="B14", where="sec. 4, item 15", claim="Topology change forbidden classically without CTCs (Geroch) or outright (Tipler, Borde)",
        model="Classical theorems", recomputed="(literature)", verdict="QUALIFIED",
        note="Tipler's and Borde's results need energy (and generic or compactness) conditions; "
             "Geroch's needs a non-degenerate time-oriented metric. Degenerate (Morse) metrics evade both, "
             "which is why the local-creation lemma matters.")
    add(id="B15", where="sec. 4, item 16", claim="Unstable in all explicit models; no controller can coordinate faster than light crosses the throat",
        model="Stability programme", recomputed="Ellis s = 1.182 c/b; thin shells stable only for beta^2 < -1/2 (M = 0) "
                                                "or > ~3.2 (a0 < 3M); PD delay limit sqrt(2)/s",
        verdict="CORRECTED",
        note="(i) Thin shells are stable for exotic equations of state, and stable examples are claimed in the "
             "literature (stage B), so 'all explicit models' is too strong; (ii) a distributed controller needs no "
             "global coordination; the binding limits are the loop delay (< 1.2 r0/c) and NEC-violating actuation.")
    add(id="B16", where="sec. 4, summary", claim="Twelve of the nineteen items are established or worked out on paper",
        model="Count", recomputed="Items 1-6 established, 7-12 investigated: 12", verdict="VERIFIED", note="")
    add(id="B17", where="sec. 5, R1", claim="ANEC 'proven in flat-space QFT (Faulkner et al. 2016; Hartman et al. 2017)'",
        model="Literature", recomputed="(literature)", verdict="QUALIFIED",
        note="Those proofs are of the ANEC in flat space (Faulkner et al. for states built from local operators; "
             "Hartman et al. for interacting theories with a UV fixed point in d > 2). The achronal ANEC in curved "
             "spacetime, which is what a shortcut must violate, remains a conjecture (Graham & Olum 2007).")
    add(id="B18", where="sec. 5, R8", claim="Stop if 'instability grows faster than any causal control'",
        model="Delay-differential stability", recomputed=f"Quantitative criterion: loop delay < sqrt(2)/s = {n['pd_delay_max_s']*1e9:.2f} ns for 1 m",
        verdict="EXTENDED", note="A testable stop criterion replaces a qualitative one.")
    add(id="B19", where="report 01, finding 5", claim="A free rim collapses in 5.2 ns",
        model="Nambu-Goto loop in flat space: R(t) = R0 cos(ct/R0)", recomputed=f"pi R/(2c) = {np.pi*r0/(2*c)*1e9:.2f} ns",
        verdict="QUALIFIED",
        note="A probe-string estimate; with |G mu/c^2| = 1/4 self-gravity is not small, and the consistency of thin "
             "curved loops is itself in question (stage B). Read it as 'the light-crossing time'.")
    add(id="B20", where="sec. bottom line", claim="First failures: creating a handle, and holding it open with matter violating the averaged NEC macroscopically",
        model="Feasibility framework", recomputed="First decisive blocker is 'hold open' for B, C, D1, D2, D4; 'create remotely' for A",
        verdict="EXTENDED", note="Agrees; adds that local creation is open (not excluded), so holding open is the earliest decisive blocker for every causal architecture.")
    return L
