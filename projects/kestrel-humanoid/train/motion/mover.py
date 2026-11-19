"""The G1 moving however it wants, smoothly, without training: the brain's intent in, physical motion out.

Three parts, all running live on a CPU:

* motion matching (matching.py) picks and blends real human motion from the datasets for the intent - which
  gesture, which walking style - ten times a second, with inertialized (pop-free) transitions;
* the walker (walker.py) plans footsteps and a balanced centre-of-mass path (ZMP preview control) whenever the
  intent moves the robot somewhere;
* the whole-body controller (wbc.py) turns both into joint torques every 2 ms, balance first.

While walking, the legs follow the walker and the arms, waist and style follow the human motion. For gestures
(waving, bowing, guiding, calling), the whole body follows the human motion and the balance controller keeps the
weight over the feet. Intents: walk (with vx, vy, turn), any action in the library (wave-right-hand, bow, guide,
call, raise-up-both-hands, byebye, ...), an optional style (normal, active, tired, proud, old, youthful, ...), stand.
"""
from __future__ import annotations

import math

import numpy as np

from . import g1 as G
from .matching import Database, Matcher, robot_features, yaw_of
from .player import place_on_floor, qmul, quat_yaw
from .walker import Walker
from .wbc import WBC

DT = 0.002                         # physics and balance control: 500 Hz
PLAN_DT = 0.01                     # footsteps and centre of mass: 100 Hz
MATCH_DT = 0.02                    # human motion: 50 Hz
LIMITS = dict(vx=(-0.15, 0.5), vy=(-0.1, 0.1), wz=(-0.5, 0.5))


def nominal_pose(names):
    q = np.zeros(len(names))
    for i, n in enumerate(names):
        if "hip_pitch" in n:
            q[i] = -0.25
        elif "knee" in n:
            q[i] = 0.55
        elif "ankle_pitch" in n:
            q[i] = -0.30
        elif "elbow" in n:
            q[i] = 1.2
        elif n == "left_shoulder_roll_joint":
            q[i] = 0.2
        elif n == "right_shoulder_roll_joint":
            q[i] = -0.2
    return q


class Mover:
    def __init__(self, library, db=None, w_upper=0.3, w_leg_walk=0.05, w_leg_gesture=0.3, **wbc_kw):
        # balance outranks style: the centre of mass task weighs 10x the controller's default, the human motion of the
        # arms and waist 0.3 (with 1.0 the arm swing of turning clips pulled the robot over)
        wbc_kw.setdefault("w_com", (1000.0, 1000.0, 200.0))
        import mujoco
        self.mj = mujoco
        self.m = G.load_model(actuator="motor", timestep=DT)
        self.d = mujoco.MjData(self.m)
        self.names, self.qadr, self.vadr, self.rng, _ = G.joint_info(self.m)
        self.leg = np.array([("hip" in n or "knee" in n or "ankle" in n) for n in self.names])
        self.q_nom = nominal_pose(self.names)
        place_on_floor(self.m, self.d, self.q_nom, np.array([1.0, 0, 0, 0]))
        self.wbc = WBC(self.m, **wbc_kw)
        self.w_upper, self.w_leg_walk, self.w_leg_gesture = w_upper, w_leg_walk, w_leg_gesture
        d = self.d
        c0 = self.wbc.com(d)
        self.walker = Walker(zc=float(c0[2]) - 0.01, dt=PLAN_DT)
        self.walker.start(d.xpos[self.wbc.feet["left"]], 0.0, d.xpos[self.wbc.feet["right"]], 0.0, c0[:2])
        self.db = db or Database(library)
        self.matcher = Matcher(self.db)
        self.kp_feet = [self.m.site("kp_l_ankle").id, self.m.site("kp_r_ankle").id]
        self.prev_feet = [d.site_xpos[i].copy() for i in self.kp_feet]
        self.prev_root = d.qpos[0:3].copy()
        self.plan = self.walker.update()
        self.human = self.matcher.step()
        self.q_up, self.qd_up = self.q_nom.copy(), np.zeros_like(self.q_nom)
        self.t = 0.0
        self.k = 0
        self.intent = ("stand", 0.0, 0.0, 0.0, None)
        self.blend = 0.0                    # 0 = upper body at the nominal pose, 1 = following the human motion
        self.falls = 0
        self.waist_yaw = self.names.index("waist_yaw_joint")
        self.waist_roll = self.names.index("waist_roll_joint")
        self.twist, self.lean = 0.4, 0.6
        self.match_robot = True               # match against the robot's own feet (in step with the legs)

    def set_intent(self, action="stand", vx=0.0, vy=0.0, wz=0.0, style=None):
        vx = float(np.clip(vx, *LIMITS["vx"]))
        vy = float(np.clip(vy, *LIMITS["vy"]))
        wz = float(np.clip(wz, *LIMITS["wz"]))
        self.intent = (action, vx, vy, wz, style)
        walking = action == "walk" and (abs(vx) + abs(vy) + abs(wz)) > 1e-3
        self.walker.set_command(vx, vy, wz) if walking else self.walker.set_command(0, 0, 0)
        if walking:                         # human walking clips for the arms and style, at a walking pace
            self.matcher.set_intent(self.walk_family(vx, vy, wz), max(abs(vx), 0.6) * (1 if vx >= 0 else -1),
                                    vy * 3, wz, style)
        elif action in ("stand", "walk"):
            self.matcher.set_intent("walk", 0.0, 0.0, 0.0, style)
        else:
            self.matcher.set_intent(action, 0.0, 0.0, 0.0, style)

    @staticmethod
    def walk_family(vx, vy, wz):
        """Which human walking clips fit a command: only clips that move the same way (a straight walk matched to a
        sidestep clip, or a turning one, twists the torso against the legs)."""
        if vx < -0.05:
            return ("walk-back",)
        if abs(vx) <= 0.05 and abs(vy) > 0.05:
            return ("walk-left",) if vy > 0 else ("walk-right",)
        if abs(wz) >= 0.25:
            return ("walk", "walk-turn-left") if wz > 0 else ("walk", "walk-turn-right")
        return ("walk",)

    def step(self):
        """One 2 ms step. Returns False if the robot fell."""
        mj, d = self.mj, self.d
        if self.k % int(PLAN_DT / DT) == 0:
            cv, _ = self.wbc.com_vel(d)
            self.plan = self.walker.update(self.wbc.com(d), cv)
        if self.k % int(MATCH_DT / DT) == 0:
            prev = self.human
            self.human = self.matcher.step(self._robot_now() if self.match_robot else None)
            self.qd_h = (self.human["q"] - prev["q"]) / MATCH_DT
        action = self.intent[0]
        gesture = action not in ("walk", "stand")
        follow = 1.0 if (gesture or action == "walk") and not (action == "walk" and self.walker.standing) else 0.0
        if action == "stand":
            follow = 0.0
        self.blend += (follow - self.blend) * min(1.0, DT / 0.4)
        q_h = self.human["q"]
        q_ref = self.q_nom.copy()
        up = ~self.leg
        q_ref[up] = (1 - self.blend) * self.q_nom[up] + self.blend * q_h[up]
        if not (gesture and self.walker.standing):
            # while stepping, the torso twist and sideways lean of the human clip are toned down: on one foot the
            # robot cannot resist the spin they cause (its sole grips less than a shoe on a person). Forward lean
            # (a tired or proud posture) stays at full strength.
            for j, k in ((self.waist_yaw, self.twist), (self.waist_roll, self.lean)):
                q_ref[j] = self.q_nom[j] + k * (q_ref[j] - self.q_nom[j])
        standing = self.walker.standing and all(self.plan["stance"].values())
        if gesture and standing:            # whole-body gestures: the legs follow the human motion too (balance first)
            q_ref[self.leg] = (1 - self.blend) * self.q_nom[self.leg] + self.blend * q_h[self.leg]
            w_post = np.where(self.leg, self.w_leg_gesture, self.w_upper)
        else:
            w_post = np.where(self.leg, self.w_leg_walk, self.w_upper)
        qd_ref = np.where(up, self.blend * getattr(self, "qd_h", np.zeros_like(q_ref)), 0.0)
        # pelvis: the walker's heading; while standing for a gesture, the human pelvis tilt (bowing, leaning) too
        pel_q = quat_yaw(self.plan["pelvis_yaw"])
        if gesture and standing and self.blend > 0.01:
            rq = self.human["root_quat"]
            tilt = qmul(quat_yaw(-yaw_of(rq)), rq)
            tilt = np.array([1.0, 0, 0, 0]) * (1 - self.blend) + tilt * self.blend
            pel_q = qmul(pel_q, tilt / np.linalg.norm(tilt))
        swing = {s: (p, v, quat_yaw(y)) for s, (p, v, y) in self.plan["swing"].items()}
        ref = dict(q=q_ref, qd=qd_ref, qdd=np.zeros_like(q_ref), pelvis_quat=pel_q, pelvis_angvel=np.zeros(3),
                   com=self.plan["com"], com_vel=self.plan["com_vel"], com_acc=self.plan["com_acc"], swing=swing,
                   w_posture=w_post)
        tau, _ = self.wbc.step(d, ref, self.plan["stance"], DT)
        d.ctrl[:] = tau
        mj.mj_step(self.m, d)
        self.t += DT
        self.k += 1
        pel = self.wbc.pelvis
        if d.xmat[pel][8] < 0.5 or d.qpos[2] < 0.35:
            self.falls += 1
            return False
        return True

    def _robot_now(self):
        """The robot's own feet and root motion as motion-matching features, so the human motion stays in step."""
        d = self.d
        feet = [d.site_xpos[i].copy() for i in self.kp_feet]
        fv = [(a - b) / MATCH_DT for a, b in zip(feet, self.prev_feet)]
        rv = (d.qpos[0:3] - self.prev_root) / MATCH_DT
        self.prev_feet, self.prev_root = feet, d.qpos[0:3].copy()
        # human clips walk faster than the robot does: compare at the clip's pace
        vx = self.intent[1] if self.intent[0] == "walk" else 0.0
        k = min(3.0, 0.6 / abs(vx)) if abs(vx) > 0.05 else 1.0
        f = robot_features(d.qpos[0:3], yaw_of(d.qpos[3:7]), feet, [v * k for v in fv], rv * k)
        return f

    def playing(self):
        return str(self.db.names[self.db.clip_of[self.human["frame"]]])
