"""KESTREL K1 articulation for Isaac Lab 3.0 (legs actuated, upper body rigid, as in the CPU trainer).

Gains, effort limits, speed limits and armature are the values the CPU trainer uses (train/model.py):
effort limits are the joint-side peaks of the sized actuator family (docs/generated/actuator_family.md),
armature is rotor inertia x ratio^2.

Set KESTREL_K1_USD to the USD converted from kestrel_k1.xml, or put kestrel_k1.usd next to this file.
"""

import os

import isaaclab.sim as sim_utils
from isaaclab.actuators import ImplicitActuatorCfg
from isaaclab.assets.articulation import ArticulationCfg

USD_PATH = os.environ.get("KESTREL_K1_USD", os.path.join(os.path.dirname(__file__), "kestrel_k1.usd"))

STIFFNESS = {".*_hip_yaw": 150.0, ".*_hip_roll": 250.0, ".*_hip_pitch": 300.0, ".*_knee": 300.0,
             ".*_ankle_pitch": 80.0, ".*_ankle_roll": 50.0}
DAMPING = {".*_hip_yaw": 5.0, ".*_hip_roll": 7.0, ".*_hip_pitch": 8.0, ".*_knee": 8.0,
           ".*_ankle_pitch": 2.5, ".*_ankle_roll": 2.0}
EFFORT = {".*_hip_yaw": 105.8, ".*_hip_roll": 275.9, ".*_hip_pitch": 398.8, ".*_knee": 332.7,
          ".*_ankle_pitch": 206.3, ".*_ankle_roll": 66.7}               # N*m, joint side
VELOCITY = {".*_hip_yaw": 15.97, ".*_hip_roll": 5.90, ".*_hip_pitch": 10.33, ".*_knee": 13.08,
            ".*_ankle_pitch": 12.29, ".*_ankle_roll": 17.75}           # rad/s, no-load at 52 V
ARMATURE = {".*_hip_yaw": 0.0448, ".*_hip_roll": 0.1408, ".*_hip_pitch": 0.2104, ".*_knee": 0.2367,
            ".*_ankle_pitch": 0.0448, ".*_ankle_roll": 0.0448}          # kg*m^2

KESTREL_K1_CFG = ArticulationCfg(
    spawn=sim_utils.UsdFileCfg(usd_path=USD_PATH, activate_contact_sensors=True),
    init_state=ArticulationCfg.InitialStateCfg(
        pos=(0.0, 0.0, 0.90),
        joint_pos={".*_hip_yaw": 0.0, ".*_hip_roll": 0.0, ".*_hip_pitch": -0.28, ".*_knee": 0.56,
                   ".*_ankle_pitch": -0.28, ".*_ankle_roll": 0.0},
        joint_vel={".*": 0.0},
    ),
    soft_joint_pos_limit_factor=0.9,
    actuators={
        "legs": ImplicitActuatorCfg(
            joint_names_expr=[".*_hip_yaw", ".*_hip_roll", ".*_hip_pitch", ".*_knee", ".*_ankle_pitch", ".*_ankle_roll"],
            joint_effort_limit=EFFORT,
            joint_velocity_limit=VELOCITY,
            stiffness=STIFFNESS,
            damping=DAMPING,
            armature=ARMATURE,
        ),
    },
)
