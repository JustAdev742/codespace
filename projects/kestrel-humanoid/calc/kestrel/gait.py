"""Walking / stair pattern generator: LIPM + ZMP preview control (Kajita et al., ICRA 2003).

Produces dynamically consistent whole-body trajectories (feet, pelvis, CoM) that the
inverse-dynamics module turns into joint torque / speed / power requirements.

This is deliberately the *conservative* gait: flat-footed ZMP walking with bent knees.
Human-like heel-strike/toe-off gaits (which a learned locomotion policy will produce)
run straighter legs and need *less* knee torque but *more* ankle power; the ankle is
therefore sized separately from its full-authority case (CoP at the toe).
"""
from __future__ import annotations

import numpy as np
from scipy.linalg import solve_discrete_are

from . import params as P

G = 9.81


def roty(a):
    c, s = np.cos(a), np.sin(a)
    return np.array([[c, 0, s], [0, 1, 0], [-s, 0, c]])


def minjerk(t):
    t = np.clip(t, 0.0, 1.0)
    return 10 * t**3 - 15 * t**4 + 6 * t**5


def preview_controller(zmp_ref, dt, zc, Qe=1.0, R=1e-6, preview_s=1.6):
    """Return CoM position/velocity/acceleration (n x 3 state per axis) tracking zmp_ref (n,)."""
    N = int(preview_s / dt)
    A = np.array([[1, dt, dt * dt / 2], [0, 1, dt], [0, 0, 1]])
    B = np.array([[dt**3 / 6], [dt * dt / 2], [dt]])
    C = np.array([[1, 0, -zc / G]])
    At = np.block([[np.eye(1), C @ A], [np.zeros((3, 1)), A]])
    Bt = np.vstack([C @ B, B])
    It = np.array([[1.0], [0], [0], [0]])
    Ft = np.vstack([C @ A, A])
    Q = np.zeros((4, 4))
    Q[0, 0] = Qe
    Pm = solve_discrete_are(At, Bt, Q, R * np.eye(1))
    S = np.linalg.inv(R + Bt.T @ Pm @ Bt)
    Gi = (S @ Bt.T @ Pm @ It)[0, 0]
    Gx = (S @ Bt.T @ Pm @ Ft)[0]
    Ac = At - Bt @ S @ Bt.T @ Pm @ At
    X = -Ac.T @ Pm @ It
    Gd = np.zeros(N)
    Gd[0] = -Gi
    for j in range(1, N):
        Gd[j] = (S @ Bt.T @ X)[0, 0]
        X = Ac.T @ X
    n = len(zmp_ref)
    pref = np.concatenate([zmp_ref, np.full(N + 1, zmp_ref[-1])])
    x = np.array([zmp_ref[0], 0.0, 0.0])
    esum = 0.0
    out = np.zeros((n, 3))
    zmp = np.zeros(n)
    for k in range(n):
        p = C @ x
        zmp[k] = p[0]
        esum += p[0] - pref[k]
        u = -Gi * esum - Gx @ x - Gd @ pref[k + 1:k + 1 + N]
        out[k] = x
        x = A @ x + B[:, 0] * u
    return out, zmp


def plan_walk(n_steps=8, step_len=0.45, step_w=None, t_ss=0.36, t_ds=0.09, clearance=0.06,
              rise=0.0, dt=0.005, t_start=2.4, t_end=2.0, zmp_dx=0.03, first_side="l",
              swing_pitch=np.radians(18)):
    """Footstep timeline -> per-sample dict with foot targets, ZMP ref, support weights.

    rise > 0 makes a staircase (each step lands rise higher); step_len is then the tread.
    """
    d = P.DIM
    w = d["hip_half_width"] if step_w is None else step_w
    feet = {"l": np.array([0.0, w, 0.0]), "r": np.array([0.0, -w, 0.0])}
    # build phase list: (duration, kind, support side, swing side, swing from, swing to)
    phases = [(t_start, "ds_start", None, None)]
    swing = first_side
    pos = {k: v.copy() for k, v in feet.items()}
    for i in range(n_steps):
        other = "r" if swing == "l" else "l"
        last = i == n_steps - 1
        target = pos[swing].copy()
        if i == 0:
            target[0] = pos[other][0] + step_len
        elif last:
            target[0] = pos[other][0]  # bring feet together
        else:
            target[0] = pos[other][0] + step_len
        target[2] = pos[other][2] + rise if not last else pos[other][2]
        phases.append((t_ss, "ss", other, swing, pos[swing].copy(), target.copy()))
        pos[swing] = target
        phases.append((t_ds if not last else t_end, "ds", swing if not last else None, None))
        swing = other
    # sample
    t_total = sum(p[0] for p in phases)
    n = int(round(t_total / dt))
    T = np.arange(n) * dt
    foot_tr = {s: np.zeros((n, 3)) for s in "lr"}
    foot_pitch = {s: np.zeros(n) for s in "lr"}
    zx, zy, wl = np.zeros(n), np.zeros(n), np.zeros(n)
    ground = np.zeros(n)
    cur = {k: v.copy() for k, v in feet.items()}
    zmp_pt = lambda s: cur[s] + np.array([zmp_dx, 0, 0])  # noqa: E731
    centre = lambda: 0.5 * (cur["l"] + cur["r"]) + np.array([zmp_dx, 0, 0])  # noqa: E731
    k = 0
    prev_z = centre()
    prev_wl = 0.5
    landings = []
    for idx, ph in enumerate(phases):
        dur = ph[0]
        m = int(round(dur / dt))
        kind = ph[1]
        if kind == "ds_start":
            nxt = phases[idx + 1]
            target_z = zmp_pt(nxt[2])
            target_wl = 1.0 if nxt[2] == "l" else 0.0
            for j in range(m):
                # stand still for a full preview window, then shift weight over 0.6 s
                s = minjerk(max(0.0, (j * dt - (dur - 0.6)) / 0.6))
                zx[k], zy[k] = (prev_z + (target_z - prev_z) * s)[:2]
                wl[k] = prev_wl + (target_wl - prev_wl) * s
                for f in "lr":
                    foot_tr[f][k] = cur[f]
                k += 1
            prev_z, prev_wl = target_z, target_wl
        elif kind == "ss":
            sup, sw, p0, p1 = ph[2], ph[3], ph[4], ph[5]
            for j in range(m):
                tau = (j + 1) / m
                zx[k], zy[k] = zmp_pt(sup)[:2]
                wl[k] = 1.0 if sup == "l" else 0.0
                foot_tr[sup][k] = cur[sup]
                if rise > 0:
                    sz = minjerk(tau / 0.55)
                    sxy = minjerk((tau - 0.25) / 0.75)
                    bump = clearance * np.sin(np.pi * min(tau / 0.8, 1.0)) ** 2
                else:
                    sz = sxy = minjerk(tau)
                    bump = clearance * np.sin(np.pi * tau) ** 2
                pxy = p0[:2] + (p1[:2] - p0[:2]) * sxy
                pz = p0[2] + (p1[2] - p0[2]) * sz + bump
                foot_tr[sw][k] = [pxy[0], pxy[1], pz]
                foot_pitch[sw][k] = swing_pitch * np.sin(np.pi * tau) ** 2 * (1.0 - tau)
                k += 1
            landings.append((k, p1[2]))
            cur[sw] = p1.copy()
            prev_z = zmp_pt(sup)
            prev_wl = 1.0 if sup == "l" else 0.0
        else:  # ds
            nxt_sup = ph[2]
            target_z = zmp_pt(nxt_sup) if nxt_sup else centre()
            target_wl = (1.0 if nxt_sup == "l" else 0.0) if nxt_sup else 0.5
            for j in range(m):
                frac = min(1.0, (j + 1) * dt / (t_ds if nxt_sup else 0.5 * dur))
                s = minjerk(frac)
                zx[k], zy[k] = (prev_z + (target_z - prev_z) * s)[:2]
                wl[k] = prev_wl + (target_wl - prev_wl) * s
                for f in "lr":
                    foot_tr[f][k] = cur[f]
                k += 1
            prev_z, prev_wl = target_z, target_wl
    n = k
    # body rises over the double support + single support that follow each landing
    # (the leading leg extends), which is how stair ascent is actually executed
    step_n = int(round((t_ss + t_ds) / dt))
    g_prev = 0.0
    for kl, h in landings:
        if abs(h - g_prev) > 1e-9:
            idx = np.arange(kl, n)
            ground[idx] = g_prev + (h - g_prev) * minjerk((idx - kl) / step_n)
            g_prev = h
    return dict(T=T[:n], dt=dt, feet={s: foot_tr[s][:n] for s in "lr"},
                foot_pitch={s: foot_pitch[s][:n] for s in "lr"}, zmp=np.c_[zx[:n], zy[:n]],
                wl=np.clip(wl[:n], 0, 1), ground=ground[:n])


def reach_limited_height(pelvis_xy, plan, hip_target, reach=0.835, dt=0.005):
    """Pelvis height that keeps both hip-centre -> ankle distances <= reach, smoothed."""
    from scipy.ndimage import gaussian_filter1d, minimum_filter1d

    d = P.DIM
    z = np.array(hip_target, float).copy()
    for s, sy in (("l", 1), ("r", -1)):
        f = plan["feet"][s]
        dx = pelvis_xy[:, 0] - f[:, 0]
        dy = pelvis_xy[:, 1] + sy * d["hip_half_width"] - f[:, 1]
        h = np.sqrt(np.clip(reach**2 - dx**2 - dy**2, 0.05, None))
        z = np.minimum(z, f[:, 2] + d["ankle_h"] + h)
    w = max(3, int(0.20 / dt))
    z = minimum_filter1d(z, w)
    return gaussian_filter1d(z, 0.06 / dt, mode="nearest")


def multibody_zmp(robot, out, Q):
    """Total centre of pressure (world xy) from the inverse-dynamics foot wrenches."""
    n = len(Q)
    z = np.zeros((n, 2))
    for k in range(n):
        robot.fk(Q[k])
        num = np.zeros(2)
        den = 0.0
        for s, W, cop in (("l", out["W_l"], out["cop_l"]), ("r", out["W_r"], out["cop_r"])):
            fz = W[k, 2]
            if fz > 1.0:
                num += fz * (robot.d.site_xpos[robot.sole[s]][:2] + cop[k])
                den += fz
        z[k] = num / max(den, 1e-6)
    return z


def _build(robot, plan, com_ref, hip_h, arm_swing, q_seed, iterations=3):
    dt = plan["dt"]
    n = len(plan["T"])
    offset = np.zeros((n, 2))
    Q = np.zeros((n, robot.m.nq))
    xl, xr = plan["feet"]["l"][:, 0], plan["feet"]["r"][:, 0]
    span = max(1e-6, np.abs(xr - xl).max())
    swing_sig = np.clip((xr - xl) / span, -1, 1)
    q = q_seed.copy()
    zp = hip_h + plan["ground"]
    for _ in range(iterations):
        q = Q[0].copy() if Q[0, 3] != 0 else q
        zp = reach_limited_height(com_ref - offset, plan, hip_h + plan["ground"], dt=dt)
        for k in range(n):
            q[0:2] = com_ref[k] - offset[k]
            q[2] = zp[k]
            q[3:7] = [1, 0, 0, 0]
            robot.set_joints(q, {"l_shoulder_pitch": -arm_swing * swing_sig[k],
                                 "r_shoulder_pitch": arm_swing * swing_sig[k]})
            for s in "lr":
                robot.ik_leg(q, s, plan["feet"][s][k], roty(plan["foot_pitch"][s][k]))
            c = robot.com(q)
            offset[k] = c[:2] - q[0:2]
            Q[k] = q
    return Q, zp


def walk_trajectory(robot, plan, hip_h=0.86, arm_swing=0.20, filter_passes=3):
    """Whole-body joint trajectory realising the plan. Returns (Q, info).

    Stage 1: LIPM preview control gives a CoM path whose *pendulum* ZMP tracks the plan.
    Stage 2 (Kajita's dynamics filter): the true multibody ZMP is computed by inverse
    dynamics and a second preview controller corrects the CoM path by the ZMP error, so
    swing-leg and pelvis momentum are accounted for. Repeated ``filter_passes`` times.
    """
    dt = plan["dt"]
    q = robot.q0()
    arm = {"l_shoulder_roll": 0.10, "r_shoulder_roll": -0.10, "l_elbow": -0.35, "r_elbow": -0.35}
    robot.set_joints(q, arm)
    q[2] = hip_h
    for s in "lr":
        robot.ik_leg(q, s, plan["feet"][s][0].copy(), np.eye(3))
    zc = robot.com(q)[2] - plan["ground"][0]
    cx, zmpx = preview_controller(plan["zmp"][:, 0], dt, zc)
    cy, zmpy = preview_controller(plan["zmp"][:, 1], dt, zc)
    com_ref = np.c_[cx[:, 0], cy[:, 0]]
    history = []
    for p in range(filter_passes + 1):
        Q, zp = _build(robot, plan, com_ref, hip_h, arm_swing, q)
        if p == filter_passes:
            break
        out = robot.inverse_dynamics(Q, dt=dt, wL=plan["wl"])
        zmp_mb = multibody_zmp(robot, out, Q)
        from scipy.ndimage import gaussian_filter1d
        err = gaussian_filter1d(zmp_mb - plan["zmp"], 0.02 / dt, axis=0, mode="nearest")
        history.append(float(np.abs(err[int(0.1 / dt):-int(0.1 / dt)]).max()))
        dcx, _ = preview_controller(-err[:, 0], dt, zc)
        dcy, _ = preview_controller(-err[:, 1], dt, zc)
        com_ref = com_ref + np.c_[dcx[:, 0], dcy[:, 0]]
    com_actual = np.array([robot.com(Q[k]) for k in range(len(Q))])
    info = dict(zc=zc, com_ref=com_ref, com=com_actual, zmp_lipm=np.c_[zmpx, zmpy], pelvis_z=zp,
                zmp_err_history=history)
    return Q, info
