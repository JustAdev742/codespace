# KESTREL K1 on Isaac Lab 3.0 (when a CUDA GPU is available)

This folder is the GPU path. It defines the same velocity-tracking task as the CPU trainer, as an Isaac Lab
task. **It has not been run here.** This VM has no NVIDIA GPU, and Isaac Lab trains only on CUDA. Every
file follows the structure of the Unitree H1/G1 configs shipped in Isaac Lab **v3.0.0**, and every class
and field name was checked against that release's source. Still, expect to fix small details on the
first run.

## What runs where

| Setup | Needs | Notes |
|---|---|---|
| CPU trainer in `train/` | any x86-64 CPU | What this repo trained with. About 11k policy steps/s on 4 vCPUs. |
| Isaac Lab 3.0, Newton physics (MuJoCo-Warp), **kit-less** | a CUDA GPU, Turing or newer (compute capability 7.5+), driver ≥ 580.65 | No Isaac Sim, and **no RTX needed**: Isaac Lab's docs say headless Newton simulation does not require RTX hardware. A GTX 1650/1660, T4, A10 or a used RTX 20-series is enough. |
| Isaac Lab 3.0 + Isaac Sim (PhysX, RTX rendering) | an RTX GPU | Only for camera rendering and the Kit viewport. Locomotion training does not need it. |

Measured on this VM, with the CPU trainer running on all 4 cores at the same time: MuJoCo-Warp (the
Newton solver) on Warp's CPU device reached 6.3k / 8.7k / 10.6k physics steps/s at 64 / 256 / 1024
worlds. Plain C MuJoCo reached 68k physics steps/s on one thread. Isaac Lab also lists CPU training
as unsupported. On a CPU, the multi-process C MuJoCo trainer in `train/` is therefore the faster tool.

## Steps on a GPU machine (Ubuntu 22.04+, Python 3.12)

1. Install Isaac Lab v3.0.0 (Newton is the default backend, no Isaac Sim):

   ```bash
   curl -LsSf https://astral.sh/uv/install.sh | sh
   git clone --branch v3.0.0 https://github.com/isaac-sim/IsaacLab.git && cd IsaacLab
   uv run isaaclab train --rl_library rsl_rl --task Isaac-Cartpole-Direct physics=newton_mjwarp   # smoke test
   ```

2. Export the robot and convert it to USD once. `export_mjcf.py` runs in this repo's venv. The converter
   uses Isaac Sim's MJCF importer, or its standalone wheel:

   ```bash
   python projects/kestrel-humanoid/train/isaaclab/export_mjcf.py      # -> isaaclab/kestrel_k1/kestrel_k1.xml
   cd IsaacLab
   uv run --extra isaacsim python scripts/tools/convert_mjcf.py \
       /path/to/kestrel_k1/kestrel_k1.xml /path/to/kestrel_k1/kestrel_k1.usd
   ```

3. Register the task. Copy the folder into Isaac Lab; `isaaclab_tasks` imports every config package:

   ```bash
   cp -r /path/to/train/isaaclab/kestrel_k1 IsaacLab/source/isaaclab_tasks/isaaclab_tasks/core/velocity/config/
   ```

4. Train and play:

   ```bash
   uv run isaaclab train --rl_library rsl_rl --task Isaac-Velocity-Rough-Kestrel-K1 physics=newton_mjwarp --headless
   uv run isaaclab play --rl_library rsl_rl --task Isaac-Velocity-Rough-Kestrel-K1 --viz newton_gl
   ```

## How it maps to the CPU task

| Item | CPU trainer (`train/`) | Isaac Lab config (`kestrel_k1/`) |
|---|---|---|
| Robot | `model.py`: legs actuated, upper body rigid, 4 sphere contacts per foot, leg capsules | same MJCF via `export_mjcf.py` |
| Actuators | PD position servos, kp/kd and effort limits from the sized actuator family | `ImplicitActuatorCfg` with the same kp, kd, effort, speed and armature |
| Control | 50 Hz policy, 200 Hz physics, action × 0.25 rad | decimation 4, dt 0.005, `joint_pos.scale = 0.25` |
| Commands | vx −0.4…1.0, vy ±0.3, wz ±0.6 m/s, rad/s | same ranges |
| Terrain | 6 types × 6 difficulty rows; stairs 5–18 cm, tread 30 cm | `ROUGH_TERRAINS_CFG` with stairs capped at 18 cm |
| Rewards | velocity tracking, biped air time, slip, hip deviation, limits, torque, smoothness | the Isaac Lab terms of the same names (`K1Rewards`) |
| PPO | rsl_rl settings: 24-step rollouts, 5 epochs × 4 minibatches, adaptive LR at KL 0.01 | `KestrelK1RoughPPORunnerCfg`, same settings with the larger 512-256-128 networks |

The two tasks differ in the actor's inputs. Isaac Lab's default policy observation includes base linear
velocity. The CPU task keeps that only for the critic, because the robot has no direct sensor for it.
To match the CPU actor, remove `base_lin_vel` from `ObservationsCfg.PolicyCfg`.
