"""KESTREL K1 velocity tracking on rough terrain, Isaac Lab 3.0 (modelled on the shipped H1/G1 configs).

Mirrors the CPU task in train/env.py where Isaac Lab has a matching term: same command ranges, the same
biped air-time, slip, hip-deviation and limit terms, stair heights capped at the K1 requirement (0.18 m).
Play mode uses the base class play_mode() hook (Isaac Lab 3.0 has no separate _PLAY configs).
"""

import copy

from isaaclab.managers import RewardTermCfg as RewTerm
from isaaclab.managers import SceneEntityCfg
from isaaclab.utils import configclass, replace

from ... import mdp
from ...velocity_env_cfg import LocomotionVelocityRoughEnvCfg, RewardsCfg
from .asset import KESTREL_K1_CFG


@configclass
class K1Rewards(RewardsCfg):
    termination_penalty = RewTerm(func=mdp.is_terminated, weight=-200.0)
    track_lin_vel_xy_exp = RewTerm(func=mdp.track_lin_vel_xy_yaw_frame_exp, weight=1.0,
                                   params={"command_name": "base_velocity", "std": 0.5})
    track_ang_vel_z_exp = RewTerm(func=mdp.track_ang_vel_z_world_exp, weight=1.0,
                                  params={"command_name": "base_velocity", "std": 0.5})
    feet_air_time = RewTerm(
        func=mdp.feet_air_time_positive_biped, weight=0.25,
        params={"command_name": "base_velocity", "sensor_cfg": SceneEntityCfg("contact_forces", body_names=".*_foot"),
                "threshold": 0.4})
    feet_slide = RewTerm(
        func=mdp.feet_slide, weight=-0.2,
        params={"sensor_cfg": SceneEntityCfg("contact_forces", body_names=".*_foot"),
                "asset_cfg": SceneEntityCfg("robot", body_names=".*_foot")})
    dof_pos_limits = RewTerm(func=mdp.joint_pos_limits, weight=-1.0,
                             params={"asset_cfg": SceneEntityCfg("robot", joint_names=[".*_ankle_pitch", ".*_ankle_roll"])})
    joint_deviation_hip = RewTerm(func=mdp.joint_deviation_l1, weight=-0.2,
                                  params={"asset_cfg": SceneEntityCfg("robot", joint_names=[".*_hip_yaw", ".*_hip_roll"])})


@configclass
class KestrelK1RoughEnvCfg(LocomotionVelocityRoughEnvCfg):
    rewards: K1Rewards = K1Rewards()

    def __post_init__(self):
        super().__post_init__()
        # scene
        self.scene.robot = replace(KESTREL_K1_CFG, prim_path="{ENV_REGEX_NS}/Robot")
        self.scene.height_scanner.prim_path = "{ENV_REGEX_NS}/Robot/pelvis"
        gen = copy.deepcopy(self.scene.terrain.terrain_generator)
        for k in ("pyramid_stairs", "pyramid_stairs_inv"):
            gen.sub_terrains[k].step_height_range = (0.05, 0.18)     # K1 stair requirement
        self.scene.terrain.terrain_generator = gen
        # actions: joint position offsets x 0.25 rad, as in the CPU task (Isaac Lab default 0.5)
        self.actions.joint_pos.scale = 0.25
        # commands (same ranges as the CPU task)
        self.commands.base_velocity.marker_pos_offset = (0.0, 0.0, 0.9)
        self.commands.base_velocity.ranges.lin_vel_x = (-0.4, 1.0)
        self.commands.base_velocity.ranges.lin_vel_y = (-0.3, 0.3)
        self.commands.base_velocity.ranges.ang_vel_z = (-0.6, 0.6)
        # rewards
        self.rewards.lin_vel_z_l2.weight = -0.2
        self.rewards.undesired_contacts = None
        self.rewards.flat_orientation_l2.weight = -1.0
        self.rewards.action_rate_l2.weight = -0.01
        self.rewards.dof_acc_l2.weight = -2.5e-7
        self.rewards.dof_torques_l2.weight = -2.0e-6
        # terminations
        self.terminations.base_contact.params["sensor_cfg"].body_names = ["pelvis", "torso"]
        # events
        self.events.add_base_mass.params["asset_cfg"].body_names = "torso"
        self.events.base_com = None
        self.events.base_external_force_torque.params["asset_cfg"].body_names = "torso"
        self.events.reset_robot_joints.params["position_range"] = (1.0, 1.0)
