"""KESTREL K1 velocity-tracking locomotion for Isaac Lab 3.0.

Copy this directory to source/isaaclab_tasks/isaaclab_tasks/core/velocity/config/kestrel_k1 in an
Isaac Lab v3.0.0 checkout; isaaclab_tasks imports every config package, which registers these tasks.
"""

import gymnasium as gym

from . import agents

gym.register(
    id="Isaac-Velocity-Rough-Kestrel-K1",
    entry_point="isaaclab.envs:ManagerBasedRLEnv",
    disable_env_checker=True,
    kwargs={
        "env_cfg_entry_point": f"{__name__}.rough_env_cfg:KestrelK1RoughEnvCfg",
        "rsl_rl_cfg_entry_point": f"{agents.__name__}.rsl_rl_ppo_cfg:KestrelK1RoughPPORunnerCfg",
        "default_agent": "rsl_rl",
    },
)
