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
REACH_SPEED = 0.6                  # m/s: how fast a hand target moves
REACH_LO = np.array([0.0, -0.45, 0.45])     # hand target box (m, from the floor between the feet, x fwd, y left)
REACH_HI = np.array([0.55, 0.45, 1.40])
SETTLE = 0.6                       # s standing still before whole-body actions and posture layers start
QD_MAX = 6.0                       # rad/s: largest target joint speed taken from the human motion
# the walking envelope the soak tests found reliable (random intents for hours: 0.3-0.5 m/s fell often, and turning
# faster than 0.3 rad/s while changing commands caused most of the remaining falls)
LIMITS = dict(vx=(-0.15, 0.35), vy=(-0.1, 0.1), wz=(-0.3, 0.3))


def limit_command(vx, vy, wz):
    """Clamp each part, then share one effort budget: going forward, sideways and turning at full rate all at once is
    scaled down (an ellipsoid, as most legged robots do)."""
    vx = float(np.clip(vx, *LIMITS["vx"]))
    vy = float(np.clip(vy, *LIMITS["vy"]))
    wz = float(np.clip(wz, *LIMITS["wz"]))
    e = (vx / (LIMITS["vx"][1] if vx >= 0 else -LIMITS["vx"][0])) ** 2 + (vy / LIMITS["vy"][1]) ** 2 + \
        (wz / LIMITS["wz"][1]) ** 2
    if e > 1.0:
        k = 1.0 / math.sqrt(e)
        vx, vy, wz = vx * k, vy * k, wz * k
    return vx, vy, wz


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
        self.q_h_prev = self.human["q"].copy()
        self.qd_h = np.zeros(len(self.names))
        self.q_up, self.qd_up = self.q_nom.copy(), np.zeros_like(self.q_nom)
        self.t = 0.0
        self.k = 0
        self.intent = ("stand", 0.0, 0.0, 0.0, None)
        self.blend = 0.0                    # 0 = upper body at the nominal pose, 1 = following the human motion
        self.falls = 0
        self.waist_yaw = self.names.index("waist_yaw_joint")
        self.waist_roll = self.names.index("waist_roll_joint")
        self.gain_walk = np.ones(len(self.names))      # how much of the human motion each joint gets while stepping
        self.gain_walk[self.waist_yaw], self.gain_walk[self.waist_roll] = 0.4, 0.6
        self.use_qd_ref = True
        self.match_robot = True               # match against the robot's own feet (in step with the legs)
        # layers on top of the main motion (see set_intent): a gesture for the arms only, hand targets, crouch, lean,
        # look direction
        self.arm = np.array([("shoulder" in n or "elbow" in n or "wrist" in n) for n in self.names])
        self.side_arm = {s: self.arm & np.array([n.startswith(s) for n in self.names]) for s in ("left", "right")}
        self.waist_pitch = self.names.index("waist_pitch_joint")
        self.arms_matcher = Matcher(self.db)
        self.q_a = self.q_a_prev = self.q_nom.copy()
        self.arms_action, self.arms_blend = None, 0.0
        self.reach, self.reach_f = {}, {}
        self.crouch = self.lean = self.look = 0.0
        self.f_crouch = self.f_lean = self.f_look = 0.0
        self.pending_cmd = None
        self.stand_time = 0.0

    def set_intent(self, action="stand", vx=0.0, vy=0.0, wz=0.0, style=None, arms=None, reach=None, crouch=0.0,
                   lean=0.0, look=0.0):
        """action: "stand", "walk" (with vx, vy m/s and wz rad/s) or any action in the library, done in place;
        style: any style in the library. Layers, all optional and combinable:
        arms   - an action from the library played by the arms only (wave while walking, guide while turning, ...)
        reach  - {"left"/"right": (x, y, z)}: put that hand there; metres, from the floor between the feet, x forward,
                 y left, z up (point at something, reach a shelf, hold out a hand)
        crouch - lower the body by this much (m, up to 0.2; while standing)
        lean   - bend the torso forward (rad, + forward, -0.3..0.5)
        look   - turn the torso to look left (+) or right (-) (rad, up to 0.6)"""
        self.arms_action = arms if arms and arms != action else None
        if self.arms_action:
            self.arms_matcher.set_intent(self.arms_action, 0.0, 0.0, 0.0, None)
        # hand targets inside what the arm can reach without pulling the body over (the soak tests found the edge)
        self.reach = {k: np.clip(np.asarray(v, float), REACH_LO, REACH_HI) for k, v in (reach or {}).items()
                      if k in ("left", "right")}
        self.crouch = float(np.clip(crouch, 0.0, 0.2))
        self.lean = float(np.clip(lean, -0.3, 0.5))
        self.look = float(np.clip(look, -0.6, 0.6))
        vx, vy, wz = limit_command(vx, vy, wz)
        self.intent = (action, vx, vy, wz, style)
        walking = action == "walk" and (abs(vx) + abs(vy) + abs(wz)) > 1e-3
        # walking starts once the body is upright again (from a crouch, lean or turned torso): see step()
        self.pending_cmd = (vx, vy, wz) if walking else None
        self.walker.set_command(0, 0, 0)
        if walking and self.posed() < 0.03:
            self.walker.set_command(vx, vy, wz)
            self.pending_cmd = None
        if walking:                         # human walking clips for the arms and style, at a walking pace
            self.matcher.set_intent(self.walk_family(vx, vy, wz), max(abs(vx), 0.6) * (1 if vx >= 0 else -1),
                                    vy * 3, wz, style)
        elif action in ("stand", "walk"):
            self.matcher.set_intent("walk", 0.0, 0.0, 0.0, style)
        else:
            self.matcher.set_intent(action, 0.0, 0.0, 0.0, style)

    def posed(self):
        """How far the body is from upright: crouch (m) and lean / look (rad, scaled), whichever is largest."""
        return max(self.f_crouch, 0.25 * abs(self.f_lean), 0.25 * abs(self.f_look))

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
            self.q_h_prev = self.human["q"].copy()
            self.human = self.matcher.step(self._robot_now() if self.match_robot else None)
            # joint speeds of the human motion, from frame to frame (capped: a clip switch must not jerk a joint)
            self.qd_h = np.clip((self.human["q"] - self.q_h_prev) / MATCH_DT, -QD_MAX, QD_MAX)
            if self.arms_action:
                self.q_a_prev = self.q_a
                self.q_a = self.arms_matcher.step()["q"]
        # settled: standing still on both feet for a moment (after the last step the body is still swaying over
        # to the middle). Whole-body actions and posture layers start only then, as a person stops, then waves.
        self.stand_time = self.stand_time + DT if self.walker.standing else 0.0
        settled = self.stand_time > SETTLE and self.pending_cmd is None
        action = self.intent[0]
        gesture = action not in ("walk", "stand")
        if gesture:
            follow = 1.0 if settled else 0.0
        else:
            follow = 1.0 if action == "walk" and not self.walker.standing else 0.0
        self.blend += (follow - self.blend) * min(1.0, DT / 0.4)
        # the human pose between its 50 Hz frames: interpolated, so the targets move smoothly every 2 ms
        frac = (self.k % int(MATCH_DT / DT)) / (MATCH_DT / DT)
        q_h = self.q_h_prev + (self.human["q"] - self.q_h_prev) * frac
        q_ref = self.q_nom.copy()
        up = ~self.leg
        q_ref[up] = (1 - self.blend) * self.q_nom[up] + self.blend * q_h[up]
        if not (gesture and self.walker.standing):
            # while stepping, the torso twist and sideways lean of the human clip are toned down: on one foot the
            # robot cannot resist the spin they cause (its sole grips less than a shoe on a person). Forward lean
            # (a tired or proud posture) stays at full strength.
            q_ref[up] = self.q_nom[up] + self.gain_walk[up] * (q_ref[up] - self.q_nom[up])
        standing = settled and all(self.plan["stance"].values())
        if gesture and standing:            # whole-body gestures: the legs follow the human motion too (balance first)
            q_ref[self.leg] = (1 - self.blend) * self.q_nom[self.leg] + self.blend * q_h[self.leg]
            w_post = np.where(self.leg, self.w_leg_gesture, self.w_upper)
        else:
            w_post = np.where(self.leg, self.w_leg_walk, self.w_upper)
        # target speeds: the speed of the targets themselves (after blending and toning down), not the raw clip's
        gain = self.gain_walk if not (gesture and self.walker.standing) else np.ones_like(q_ref)
        qd_ref = np.where(up, self.blend * gain * self.qd_h, 0.0) if self.use_qd_ref else np.zeros_like(q_ref)
        # ---- layers
        a = DT / 0.4
        self.arms_blend += ((1.0 if self.arms_action else 0.0) - self.arms_blend) * a
        if self.arms_blend > 1e-3:          # an action for the arms only, over whatever the rest is doing
            q_a = self.q_a_prev + (self.q_a - self.q_a_prev) * frac
            qd_a = np.clip((self.q_a - self.q_a_prev) / MATCH_DT, -QD_MAX, QD_MAX)
            b = self.arms_blend
            q_ref[self.arm] = (1 - b) * q_ref[self.arm] + b * q_a[self.arm]
            qd_ref[self.arm] = (1 - b) * qd_ref[self.arm] + b * qd_a[self.arm]
        # posture layers only with both feet planted: leaning, looking or crouching while stepping twisted or dropped
        # the body over a single foot (soak tests); walking waits until they have eased back
        planted = settled
        self.f_lean += ((self.lean if planted else 0.0) - self.f_lean) * DT / 0.5
        self.f_look += ((self.look if planted else 0.0) - self.f_look) * DT / 0.5
        if self.pending_cmd is not None and self.posed() < 0.03:
            self.walker.set_command(*self.pending_cmd)
            self.pending_cmd = None
        q_ref[self.waist_pitch] += self.f_lean
        q_ref[self.waist_yaw] += self.f_look
        self.f_crouch += ((self.crouch if planted else 0.0) - self.f_crouch) * DT / 0.6
        hands = {}
        if self.reach:
            yaw = self.plan["pelvis_yaw"]
            fl, fr = self.walker.feet["left"][0], self.walker.feet["right"][0]
            o = np.array([(fl[0] + fr[0]) / 2, (fl[1] + fr[1]) / 2, 0.0])
            c, s_ = math.cos(yaw), math.sin(yaw)
            for side, r in self.reach.items():
                goal = o + np.array([c * r[0] - s_ * r[1], s_ * r[0] + c * r[1], r[2]])
                if side not in self.reach_f:
                    b_ = self.wbc.hands[side]
                    self.reach_f[side] = d.xpos[b_] + d.xmat[b_].reshape(3, 3) @ self.wbc.palm
                step_ = goal - self.reach_f[side]
                n_ = np.linalg.norm(step_)
                v = step_ / n_ * min(n_ / DT, REACH_SPEED) if n_ > 1e-9 else np.zeros(3)
                self.reach_f[side] = self.reach_f[side] + v * DT
                hands[side] = (self.reach_f[side].copy(), v)
                w_post = np.where(self.side_arm[side], 0.02, w_post)
        for side in list(self.reach_f):
            if side not in self.reach:
                del self.reach_f[side]
        # pelvis: the walker's heading; while standing for a gesture, the human pelvis tilt (bowing, leaning) too
        pel_q = quat_yaw(self.plan["pelvis_yaw"])
        if gesture and standing and self.blend > 0.01:
            rq = self.human["root_quat"]
            tilt = qmul(quat_yaw(-yaw_of(rq)), rq)
            tilt = np.array([1.0, 0, 0, 0]) * (1 - self.blend) + tilt * self.blend
            pel_q = qmul(pel_q, tilt / np.linalg.norm(tilt))
        swing = {s: (p, v, quat_yaw(y)) for s, (p, v, y) in self.plan["swing"].items()}
        ref = dict(q=q_ref, qd=qd_ref, qdd=np.zeros_like(q_ref), pelvis_quat=pel_q, pelvis_angvel=np.zeros(3),
                   com=self.plan["com"] - np.array([0.0, 0.0, self.f_crouch]), com_vel=self.plan["com_vel"],
                   com_acc=self.plan["com_acc"], swing=swing, w_posture=w_post, hands=hands)
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
