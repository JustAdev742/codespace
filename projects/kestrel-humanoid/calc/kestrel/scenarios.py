"""Design-case scenarios -> joint torque / speed / power time series.

Each scenario returns a dict with the inverse-dynamics output plus metadata. The set is
chosen to envelope what KESTREL K1 is required to do (docs/01-concept.md, capability
targets) - not just walking. All cases are run at DESIGN mass (estimate x 1.10).

  W1  walk 0.8 m/s (nominal, used for thermal duty and energy)
  W2  walk 1.2 m/s (fast, 0.45 m steps at 2.67 Hz)
  ST  stair ascent, 0.18 m rise / 0.28 m tread, 0.9 s per step
  SQ  squat to thighs-near-horizontal and rise, holding a 20 kg box at chest
  DS  deep squat (knee ~125 deg) and rise, no load
  SU  single-leg step-up onto a 0.30 m platform (knee ~95 deg -> straight) in 1.2 s
  SD  unplanned drop 0.10 m (missed step), single leg, absorbed over 0.12 m  [momentary class]
  SX  drop 0.15 m absorbed over 0.10 m  [structural / overload case only, not actuator sizing]
  SL  single-leg stance, free leg lifted (static)
  AH  both arms straight forward holding 5 kg per hand (static)
  AL  lift 5 kg per hand from hanging to forward-horizontal in 0.8 s
  AF  fast unloaded arm raise 0 -> 2.0 rad (shoulder) in 0.70 s, elbow 0 -> 1.6 rad
  AS  side raise to 90 deg holding 3 kg per hand in 0.8 s
  TB  torso bend 60 deg forward holding 5 kg per hand (slow, 1.5 s)
  NK  neck nod 0.8 rad in 0.3 s and yaw 1.2 rad in 0.4 s
"""
from __future__ import annotations

import numpy as np

from . import dynamics as D
from . import gait
from . import params as P

DT = 0.005


def mj(t0, t1, t):
    return gait.minjerk((t - t0) / (t1 - t0))


def _feet_flat(w=None):
    w = P.DIM["hip_half_width"] if w is None else w
    return {"l": (np.array([0.0, w, 0.0]), np.eye(3)), "r": (np.array([0.0, -w, 0.0]), np.eye(3))}


def _result(name, desc, R, Q, wl, cut=None, extra=None):
    out = R.inverse_dynamics(Q, dt=DT, wL=wl)
    n = len(Q)
    cut = cut or slice(int(0.05 / DT), n - int(0.05 / DT))
    feas = D.cop_feasible(out["cop_l"][cut]) & D.cop_feasible(out["cop_r"][cut])
    res = dict(name=name, desc=desc, out=out, cut=cut, cop_ok=float(feas.mean()), mass=R.total_mass, dt=DT)
    if extra:
        res.update(extra)
    return res


# ---------------------------------------------------------------------------- walking
BOX_ARMS = {"l_shoulder_pitch": -0.35, "r_shoulder_pitch": -0.35, "l_elbow": -1.25, "r_elbow": -1.25}


def _box(kg):
    return {"l_hand": [(kg / 2, (0.0, 0.0, -0.09))], "r_hand": [(kg / 2, (0.0, 0.0, -0.09))]} if kg > 0 else {}


def walk(name, desc, step, t_ss, t_ds, hip_h, rise=0.0, n_steps=8, clearance=0.05, box_kg=0.0):
    R = D.Robot(payloads=_box(box_kg))
    plan = gait.plan_walk(n_steps=n_steps, step_len=step, t_ss=t_ss, t_ds=t_ds, rise=rise,
                          clearance=clearance if rise == 0 else 0.07)
    if box_kg > 0:      # carrying: forearms forward, box against the chest, no arm swing
        Q, info = gait.walk_trajectory(R, plan, hip_h=hip_h, arm_swing=0.0, filter_passes=3, arm_pose=dict(BOX_ARMS))
    else:
        Q, info = gait.walk_trajectory(R, plan, hip_h=hip_h, arm_swing=0.3, filter_passes=3)
    n = len(Q)
    cut = slice(int(1.8 / DT), n - int(1.2 / DT))
    return _result(name, desc, R, Q, plan["wl"], cut,
                   dict(speed=step / (t_ss + t_ds), plan=plan, info=info, Q=Q))


# ---------------------------------------------------------------------------- squats
def squat(name, desc, z_low, waist_pitch, box_kg=0.0, t_down=1.5, t_hold=0.6, t_up=1.2):
    pay = {}
    arm = {}
    if box_kg > 0:
        pay = _box(box_kg)
        arm = dict(BOX_ARMS)        # forearms forward and horizontal, box against the chest
    R = D.Robot(payloads=pay)
    feet = _feet_flat()
    T = np.arange(0, 0.3 + t_down + t_hold + t_up + 0.3, DT)
    z_hi = 0.86
    Q = []
    q = R.q0()
    for t in T:
        s = mj(0.3, 0.3 + t_down, t) - mj(0.3 + t_down + t_hold, 0.3 + t_down + t_hold + t_up, t)
        q[2] = z_hi + (z_low - z_hi) * s
        R.set_joints(q, {**arm, "waist_pitch": waist_pitch * s})
        R.place_pelvis_for_com(q, np.array([0.04, 0.0]), feet)
        Q.append(q.copy())
    Q = np.array(Q)
    return _result(name, desc, R, Q, np.full(len(Q), 0.5), extra=dict(Q=Q))


# ---------------------------------------------------------------------------- single leg
def step_up(name, desc, height=0.30, t_rise=1.2):
    """Left foot on a platform; robot rises on the left leg only."""
    R = D.Robot()
    # platform foot 35 mm outboard of the hip (a natural step-up stance): keeps hip adduction inside the shell-limited
    # -11 deg (cad/check_clearance.py, docs/02 sec. 8) and the tucked foot clear of the stance calf
    fl = (np.array([0.0, P.DIM["hip_half_width"] + 0.035, height]), np.eye(3))
    tuck = {"r_hip_pitch": -0.5, "r_knee": 1.0, "r_ankle_pitch": -0.3}
    T = np.arange(0, 0.3 + t_rise + 0.4, DT)
    z0, z1 = height + 0.55, height + 0.82
    Q = []
    q = R.q0()
    for t in T:
        s = mj(0.3, 0.3 + t_rise, t)
        q[2] = z0 + (z1 - z0) * s
        R.set_joints(q, {**tuck, "waist_pitch": 0.35 * (1 - s)})
        R.place_pelvis_for_com(q, fl[0][:2] + np.array([0.04, 0.0]), {"l": fl})
        Q.append(q.copy())
    Q = np.array(Q)
    return _result(name, desc, R, Q, np.ones(len(Q)), extra=dict(Q=Q))


def step_down(name, desc, drop=0.15, stroke=0.10):
    """Single-leg landing: touchdown at v0 = sqrt(2 g drop), absorbed over `stroke` of pelvis travel."""
    R = D.Robot()
    g = 9.81
    v0 = np.sqrt(2 * g * drop)
    a = v0**2 / (2 * stroke)
    t_abs = v0 / a
    fl = (np.array([0.0, P.DIM["hip_half_width"], 0.0]), np.eye(3))
    tuck = {"r_hip_pitch": -0.6, "r_knee": 0.9, "r_ankle_pitch": -0.2}
    z_td = 0.84
    T = np.arange(-0.04, t_abs + 0.25, DT)
    Q = []
    q = R.q0()
    for t in T:
        if t < 0:
            z = z_td - v0 * t - 0.5 * g * t**2  # free fall just before touchdown (foot follows)
        elif t < t_abs:
            z = z_td - v0 * t + 0.5 * a * t**2
        else:
            z = z_td - stroke
        q[2] = z
        R.set_joints(q, tuck)
        foot = (fl[0] + np.array([0, 0, max(0.0, z - z_td)]), fl[1])
        R.place_pelvis_for_com(q, fl[0][:2] + np.array([0.03, 0.0]), {"l": foot}, iters=3)
        Q.append(q.copy())
    Q = np.array(Q)
    # smooth the acceleration step slightly (sole compliance ~ 10 ms)
    from scipy.ndimage import gaussian_filter1d
    Q[:, 7:] = gaussian_filter1d(Q[:, 7:], 0.006 / DT, axis=0, mode="nearest")
    Q[:, 0:3] = gaussian_filter1d(Q[:, 0:3], 0.006 / DT, axis=0, mode="nearest")
    i0 = int(0.04 / DT)
    return _result(name, desc, R, Q, np.ones(len(Q)), cut=slice(i0, len(Q) - 5),
                   extra=dict(Q=Q, v0=v0, decel=a))


def single_leg_stance(name, desc):
    R = D.Robot()
    q = R.q0()
    q[2] = 0.84
    R.set_joints(q, {"r_hip_pitch": -0.5, "r_knee": 1.0, "r_ankle_pitch": -0.4, "r_hip_roll": -0.1})
    fl = (np.array([0.0, P.DIM["hip_half_width"], 0.0]), np.eye(3))
    R.place_pelvis_for_com(q, fl[0][:2] + np.array([0.03, 0.0]), {"l": fl})
    Q = np.repeat(q[None], 60, axis=0)
    return _result(name, desc, R, Q, np.ones(len(Q)), cut=slice(0, 60), extra=dict(Q=Q))


# ---------------------------------------------------------------------------- arms / torso / neck
def arm_motion(name, desc, kg_per_hand, sp_from, sp_to, el_from, el_to, t_move, t_hold=0.6):
    pay = {"l_hand": [(kg_per_hand, (0.0, 0.0, -0.09))], "r_hand": [(kg_per_hand, (0.0, 0.0, -0.09))]} if kg_per_hand else {}
    R = D.Robot(payloads=pay)
    feet = _feet_flat()
    T = np.arange(0, 0.2 + t_move + t_hold, DT)
    Q = []
    q = R.q0()
    q[2] = 0.86
    for t in T:
        s = mj(0.2, 0.2 + t_move, t)
        sp = sp_from + (sp_to - sp_from) * s
        el = el_from + (el_to - el_from) * s
        R.set_joints(q, {"l_shoulder_pitch": sp, "r_shoulder_pitch": sp, "l_elbow": el, "r_elbow": el,
                         "l_wrist_pitch": 0.0, "r_wrist_pitch": 0.0})
        R.place_pelvis_for_com(q, np.array([0.04, 0.0]), feet, iters=4)
        Q.append(q.copy())
    Q = np.array(Q)
    return _result(name, desc, R, Q, np.full(len(Q), 0.5), extra=dict(Q=Q))


def arm_one(name, desc, kg, t_move=0.8, t_hold=0.8):
    """One-handed carry: left upper arm hanging, elbow bent to 90 deg (forearm forward), kg in the hand."""
    R = D.Robot(payloads={"l_hand": [(kg, (0.0, 0.0, -0.09))]})
    feet = _feet_flat()
    T = np.arange(0, 0.2 + t_move + t_hold, DT)
    Q = []
    q = R.q0()
    q[2] = 0.86
    for t in T:
        s_ = mj(0.2, 0.2 + t_move, t)
        R.set_joints(q, {"l_elbow": -np.pi / 2 * s_, "l_wrist_pitch": 0.0})
        R.place_pelvis_for_com(q, np.array([0.04, 0.0]), feet, iters=4)
        Q.append(q.copy())
    Q = np.array(Q)
    return _result(name, desc, R, Q, np.full(len(Q), 0.5), extra=dict(Q=Q))


def arm_side(name, desc, kg_per_hand, t_move=0.8, t_hold=0.6):
    pay = {"l_hand": [(kg_per_hand, (0.0, 0.0, -0.09))], "r_hand": [(kg_per_hand, (0.0, 0.0, -0.09))]}
    R = D.Robot(payloads=pay)
    feet = _feet_flat()
    T = np.arange(0, 0.2 + t_move + t_hold, DT)
    Q = []
    q = R.q0()
    q[2] = 0.86
    for t in T:
        s = mj(0.2, 0.2 + t_move, t)
        R.set_joints(q, {"l_shoulder_roll": np.pi / 2 * s, "r_shoulder_roll": -np.pi / 2 * s})
        R.place_pelvis_for_com(q, np.array([0.04, 0.0]), feet, iters=4)
        Q.append(q.copy())
    Q = np.array(Q)
    return _result(name, desc, R, Q, np.full(len(Q), 0.5), extra=dict(Q=Q))


def torso_bend(name, desc, angle=np.radians(60), kg_per_hand=5.0, t_move=1.5):
    pay = {"l_hand": [(kg_per_hand, (0.0, 0.0, -0.09))], "r_hand": [(kg_per_hand, (0.0, 0.0, -0.09))]}
    R = D.Robot(payloads=pay)
    feet = _feet_flat()
    T = np.arange(0, 0.2 + 2 * t_move + 0.5, DT)
    Q = []
    q = R.q0()
    q[2] = 0.86
    for t in T:
        s = mj(0.2, 0.2 + t_move, t) - mj(0.7 + t_move, 0.7 + 2 * t_move, t)
        R.set_joints(q, {"waist_pitch": angle * s})
        R.place_pelvis_for_com(q, np.array([0.04, 0.0]), feet, iters=4)
        Q.append(q.copy())
    Q = np.array(Q)
    return _result(name, desc, R, Q, np.full(len(Q), 0.5), extra=dict(Q=Q))


def neck(name, desc):
    R = D.Robot()
    feet = _feet_flat()
    T = np.arange(0, 1.4, DT)
    Q = []
    q = R.q0()
    q[2] = 0.86
    for t in T:
        pitch = 0.8 * (mj(0.1, 0.4, t) - mj(0.6, 0.9, t))
        yaw = 1.2 * (mj(0.5, 0.9, t) - mj(1.0, 1.35, t)) - 0.6 * mj(0.5, 0.9, t) * 0
        R.set_joints(q, {"neck_pitch": pitch, "neck_yaw": yaw})
        R.place_pelvis_for_com(q, np.array([0.04, 0.0]), feet, iters=2)
        Q.append(q.copy())
    Q = np.array(Q)
    return _result(name, desc, R, Q, np.full(len(Q), 0.5), extra=dict(Q=Q))


def all_scenarios():
    """The design-case set. P.WORKLOAD selects the load levels: "base" (K1 Mk I and S1) or "mk2" (K1 Mk II:
    30 kg sustained / 50 kg momentary payload, 10 kg per hand at reach, 15 kg one-handed - docs/research/R7)."""
    mk2 = getattr(P, "WORKLOAD", "base") == "mk2"
    box, hand = (30.0, 10.0) if mk2 else (20.0, 5.0)
    S = []
    S.append(walk("W1", "walk 0.8 m/s (nominal)", 0.40, 0.40, 0.10, 0.83))
    fw = getattr(P, "FAST_WALK", None)       # (step, t_ss, t_ds, hip_h); S1 walks fast at 1.0 m/s
    if fw:
        S.append(walk("W2", f"walk {fw[0] / (fw[1] + fw[2]):.1f} m/s (fast, {fw[0]:.2f} m steps)", *fw))
    else:
        S.append(walk("W2", "walk 1.2 m/s (fast, 0.45 m steps at 2.67 Hz)", 0.45, 0.30, 0.075, 0.79))
    S.append(walk("ST", "stairs up 0.18 m rise, 0.9 s/step", 0.28, 0.70, 0.20, 0.81, rise=0.18, n_steps=6))
    S.append(squat("SQ", f"squat + rise holding {box:.0f} kg box at chest", 0.56, 0.45, box_kg=box))
    S.append(squat("DS", "deep squat (knee ~125 deg) + rise, no load", 0.46, 0.55))
    S.append(step_up("SU", "single-leg step-up onto 0.30 m platform in 1.2 s"))
    S.append(step_down("SD", "unplanned single-leg drop 0.10 m (missed step), 0.12 m absorption", drop=0.10, stroke=0.12))
    S.append(step_down("SX", "STRUCTURAL CASE ONLY: drop 0.15 m, 0.10 m absorption", drop=0.15, stroke=0.10))
    S.append(single_leg_stance("SL", "single-leg stance, free leg lifted (static)"))
    S.append(arm_motion("AH", f"arms straight forward, {hand:.0f} kg per hand (static hold)", hand, -np.pi / 2, -np.pi / 2, 0, 0, 0.5))
    S.append(arm_motion("AL", f"lift {hand:.0f} kg per hand, hanging -> forward horizontal in 0.8 s", hand, 0.0, -np.pi / 2, 0, 0, 0.8))
    S.append(arm_motion("AF", "fast unloaded raise: shoulder 2.0 rad, elbow 1.6 rad in 0.70 s", 0.0, 0.0, -2.0, 0.0, -1.6, 0.70))
    S.append(arm_side("AS", "side raise to 90 deg holding 3 kg per hand in 0.8 s", 3.0))
    S.append(torso_bend("TB", "torso bend 60 deg forward, 5 kg per hand"))
    S.append(neck("NK", "neck nod 0.8 rad / 0.3 s, yaw 1.2 rad / 0.4 s"))
    if mk2:
        S.append(walk("CW", "walk 0.6 m/s carrying a 30 kg box at the chest", 0.33, 0.45, 0.10, 0.80, box_kg=30.0))
        S.append(arm_one("AO", "one-handed carry: elbow 90 deg, 15 kg in the hand (static)", 15.0))
        S.append(squat("LM", "MOMENTARY: squat-lift a 50 kg box from thigh height", 0.56, 0.45, box_kg=50.0))
    return [s for s in S if s["name"] not in P.SCENARIOS_SKIP]
