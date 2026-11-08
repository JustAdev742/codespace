# KESTREL K1: lightweight locomotion training (CPU, no GPU, no Isaac Sim)

A console training package that teaches the K1 legs to walk on flat ground, rough ground and slopes, and up
and down stairs. It runs on a plain CPU. It is a compact copy of Isaac Lab's velocity-tracking locomotion
task (the H1/G1 rough-terrain setup):

* the physics is MuJoCo in C instead of a GPU simulator;
* there are 4 worker processes instead of 4096 GPU environments;
* the PPO is about 150 lines of PyTorch, in the rsl_rl style.

The robot is the K1 design model: 84.1 kg; masses, inertias and reflected motor inertia come from
`calc/kestrel`, and leg torque limits are the sized actuator peaks. It was trained on the VM described below.

RESULTS_PLACEHOLDER

## Why not Isaac Lab itself on this machine

| | |
|---|---|
| This VM | 4 vCPU Xeon @ 2.1 GHz, 15 GB RAM, no GPU (`/dev/nvidia*` and `/dev/dri` absent) |
| Isaac Sim (PhysX + RTX) | needs an NVIDIA RTX GPU: cannot run here |
| Isaac Lab 3.0 kit-less (Newton / MuJoCo-Warp) | runs without Isaac Sim and **without an RTX card**, but trains on CUDA only (Turing or newer, compute capability 7.5+) |
| MuJoCo-Warp on this CPU (measured) | 10.6k physics steps/s at 1024 worlds, vs 68k on one thread of C MuJoCo (both measured while training ran on all 4 cores) |

The "light Isaac Lab" here is therefore its task design, rebuilt on the fastest CPU simulator available. The
same task is also provided as an Isaac Lab 3.0 config for any CUDA GPU, RTX not required:
[`isaaclab/README.md`](isaaclab/README.md).

## Quick start

```bash
cd projects/kestrel-humanoid/train
python3 -m venv .venv && . .venv/bin/activate
pip install torch --index-url https://download.pytorch.org/whl/cpu
pip install -r requirements.txt

python train.py --name rough --hours 2                # train; Ctrl-C saves and exits
python train.py --name rough --hours 2 --resume       # continue (the curriculum levels are restored)
python play.py --run rough --table runs/rough/eval.md --gif runs/rough/demo.gif
python plot.py --run rough                            # runs/rough/curves.png
```

Console output, one line every 5 iterations:

```
  iter  Msteps    fps  return  len_s  fall  row stairsDn stairsUp   vloss      kl       lr   std
```

* `len_s`: mean episode length (20 s = time-out).
* `fall`: fraction of episodes ending in a fall.
* `row`: mean curriculum level (0–5).
* `stairsDn` / `stairsUp`: the curriculum level on the two stair terrains.

Every iteration is also logged to `runs/<name>/log.csv`.

Options:
* `--terrain flat|stairs|rough`: terrain set.
* `--workers`, `--envs`: workers default to one per core, with 96 environments each.
* `--delay 0.5`: adds 20 ms action latency to half the episodes, for sim-to-real robustness.
* `--no-randomize`: turns domain randomisation off.

## What is in it

| File | Contents |
|---|---|
| `model.py` | Training MJCF built from the design model. Leg joints are PD position servos (kp/kd per joint; force limit = the joint-side actuator peak); arms, waist and neck are rigid. Each foot has 4 contact spheres (heel and toe corners); thighs and shanks have collision capsules; touch and foot pose/velocity sensors. `visual=True` keeps the design visuals for rendering. |
| `terrain.py` | 6 × 6 tiles of 6 m: flat, random rough, pyramid slope (down), inverted slope (up), pyramid stairs (**down**), inverted stairs (**up**). Rows grow from 5 to 18 cm steps (tread 30 cm), 4° to 15° slopes, and ±1 to ±5 cm roughness. Stairs are boxes, slopes are convex meshes, the ground is a plane; only the rough tiles are heightfields (see Performance). |
| `env.py` | `Envs`: M environments sharing one model. 50 Hz policy, 200 Hz physics. See the task description below. |
| `ppo.py` | Actor-critic (256-128-128 ELU, Isaac Lab's G1 size), running observation normalisation, GAE (γ 0.99, λ 0.95), clipped surrogate and value loss, entropy 0.005, 5 epochs × 4 minibatches, learning rate adapted on the analytic KL (target 0.01). |
| `train.py` | Process pool, 24-step rollouts, time-out bootstrapping, checkpoints, CSV log, resume, TorchScript export (`policy.pt`). |
| `play.py` | Evaluation per terrain and difficulty, plus an offscreen GIF through OSMesa (no display, no GPU). |
| `plot.py` | Training curves. |
| `isaaclab/` | The same task as an Isaac Lab 3.0 task, for a CUDA GPU. |

### The task (env.py)

* **Actor observation (124):**
  * base angular velocity and projected gravity (IMU);
  * velocity command;
  * gait clock (sin, cos; 0.8 s period);
  * 12 joint positions and velocities;
  * last action;
  * an 11 × 7 height scan from −0.4 to +0.8 m ahead, the K1 depth cameras' footprint.

  All of it carries Isaac-Lab-style uniform noise.
* **Critic (129):** the same, plus the true base velocity, foot friction and motor-strength scale (asymmetric actor-critic).
* **Commands:** forward −0.4…1.0 m/s, lateral ±0.3 m/s, turn ±0.6 rad/s, 10 % standing, resampled every 8 s.
* **Rewards** (× DT, as in Isaac Lab):

  | Group | Terms (weight) |
  |---|---|
  | Task | lin/ang velocity tracking `exp(−e²/0.25)` (1.0 / 0.5) |
  | Posture | vertical velocity (−0.2), roll/pitch rate (−0.05), tilt (−1) |
  | Effort and smoothness | torque² (−2e-6), joint acceleration² (−2.5e-7), action rate (−0.01) |
  | Gait | Isaac Lab's biped air time (0.25, 0.4 s); gait-clock foot contact (0.18 per foot); swing-foot clearance 0.10 m above the terrain under it (−20 × error²); foot slip (−0.2) |
  | Limits and posture | hip yaw/roll deviation (−0.2); joint-limit margin (−1); 90 % of actuator no-load speed (−0.02) |
  | Episode | alive (0.15); fall (−20) |

  The gait clock is the unitree_rl_gym / Humanoid-Gym device. Without it, the policy settled on standing
  still: in two runs it survived but did not walk.
* **Termination:** pelvis lower than 0.55 m above the terrain, or tilt over 60°; 20 s time-out.
* **Curriculum:** Isaac Lab's terrain-level rule. Move up a row after walking more than 2.4 m without
  falling; move down after covering less than 40 % of the commanded distance.
* **Randomisation:**
  * foot friction 0.4–1.25;
  * motor strength ±12 % (kp) and damping ±15 %;
  * pelvis payload −3…+6 kg;
  * pushes of ±0.5 m/s every 6–10 s;
  * optional 20 ms action latency.

  Physics parameters are re-drawn per worker every 4 iterations.

## Performance on this VM (measured)

| Stage | Cost |
|---|---|
| `mj_step` of the training model | 21–27 µs (heightfield-only terrain: 34 µs, of which 17 µs was heightfield collision) |
| One environment step (4 physics steps + rewards + observations) | 126 µs single process, ~190 µs with 4 processes sharing the 4 cores |
| 4 workers × 96 environments | 21k environment steps/s |
| Full loop with inference and PPO updates | 10–12k environment steps/s, about 40 M steps per hour |

These choices made it light:
* Primitive terrain instead of one big heightfield, which made physics 1.3× faster.
* Sphere feet instead of box soles, 3× faster on terrain.
* MuJoCo sensors for foot contact, pose and velocity, so per-environment Python is about 20 µs.
* One torch thread during rollouts and four during updates, which stops OpenMP spinning from stealing
  the workers' cores (+20 %).
* 256-128-128 networks, a third of the update compute of 512-256-128.

## Limits: read before using a policy on hardware

* Only the legs are trained; arms, waist and neck are rigid at the zero pose.
* The parallel ankle is modelled as two independent joints with conservative torque limits. The knee
  four-bar is modelled as a direct joint whose torque limit is the actuator peak at the linkage's lowest
  ratio. Neither is the real transmission.
* The PD gains are set for simulation, not identified on hardware, and there is no actuator network.
  Contact uses 4 spheres per foot.
* Before a trained policy goes near the real robot, it must pass the commissioning sequence in
  [`docs/11-testing-commissioning.md`](../docs/11-testing-commissioning.md): gantry first, torque limits
  reduced, safety monitor and e-stop live, nobody inside the test cell. Re-train with `--delay 0.5`, with
  identified gains, and with measured masses (after P12's final weigh-in) first.
