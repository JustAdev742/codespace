# Training the G1 on every motion dataset at once, in one day on 8 GPUs

Goal: one whole-body controller for the Unitree G1 that can track any everyday human motion, trained on AMASS,
Nymeria, the Bandai Namco motion dataset and the OpenBiomechanics Project together (about 350 hours), without
throwing data away, in about one day on a machine with 8x RTX 5090 and an 80-core CPU.

**One exception, by design:** striking motions (punches, kicks, bat swings, shoves) are excluded. The robot must
never learn to strike anyone; this is a safety rule of the project, not a data-size choice.

Status: plan. The pieces are built and tested at small scale here and on a home PC first; the rented machine only
runs code that has already worked.

## The idea: keep everything, spend compute where it teaches something

Most of 350 hours is the same few motions repeated (Nymeria alone is about 300 hours of everyday living). Training
cost grows with how *varied* the data is, not how long. So instead of trimming the data, the plan changes how it is
used.

### 1. Novelty-weighted sampling (nothing deleted)

A small motion encoder embeds every clip (windows of 2 s); the embeddings are clustered. Each window's sampling
weight is the inverse of its cluster's density, so a rare motion is drawn as often as the hundredth walking clip.
Every clip stays in the training set and is still seen; redundant ones are just seen less often.

### 2. Retarget in one batch on the GPUs, then make hard clips feasible instead of dropping them

* Retargeting all clips to the G1 is a batched, differentiable inverse-kinematics problem: joint angles that put the
  G1's key points (hips, knees, ankles, toes, shoulders, elbows, wrists, head) where the human's are, scaled by the
  actor's measurements, within the G1's joint ranges. Thousands of clips at once on 8 GPUs: minutes.
* A clip the G1 cannot physically do (wrong proportions, beyond joint limits, unbalanced) is not deleted. A short
  trajectory optimisation in the simulator moves it to the nearest motion the G1 *can* do: the same shape, lower or
  slower, feet on the ground where the human's were. Only clips that still fail after this are set aside, and they are
  logged, not silently dropped.

### 3. Eight specialists in parallel, distilled into one

The clusters are grouped into eight families (for example: walking and turning; running and stopping; stairs and
steps; crouching and reaching; sitting, kneeling and the floor; carrying and object handling; gestures and upper body;
transitions and everything else). Each GPU trains one specialist on its family, independently: an almost perfect
8x speed-up, with no gradient synchronisation between GPUs. Then all eight are distilled into one generalist
controller (student-teacher, DAgger-style), which also learns the transitions between families.

### 4. Warm start from the data itself

Before any reinforcement learning, inverse dynamics on the retargeted clips gives the PD targets that would produce
each motion; the controller is first trained to imitate those (behaviour cloning). It starts out roughly able to do
every motion, and reinforcement learning only has to fix balance and contact. This usually cuts the RL time several
times over.

### 5. Short windows, focus on failures

Training episodes are 2-4 s windows starting anywhere in any clip (reference-state initialisation), so the total
length of the data does not make each step more expensive. A window the controller fails on is drawn more often; one
it has mastered is rested (prioritised sampling on the failure rate).

### 6. A fast learner and a lean simulation

A massively parallel off-policy learner (the FastTD3 / PQN family, which has trained humanoid skills in hours on one
GPU), about 16 000 simulated robots per GPU, simplified collision shapes, no rendering, half-precision networks,
50 Hz control with 4 physics substeps. Checkpoints every hour, so an early stop still leaves the best model so far.

## The day on 8x RTX 5090

| Hours | Step |
|---|---|
| ~1 | batch retargeting of all datasets |
| ~2 | feasibility pass on the hard clips |
| ~1 | warm start (behaviour cloning) |
| ~10-12 | 8 specialists, one per GPU |
| ~4-6 | distillation into one controller |
| ~1 | evaluation on held-out clips |
| **~20-23** | **total** |

This is a new combination of known methods, so the timing is a target, not a promise; the feasibility pass and the
distillation are the riskiest steps. Before renting: every step runs end to end at small scale (a few hundred clips)
here and on the home PC, and data preparation (format conversion, actor scaling, clustering) is done at home.

## Data needed

* **AMASS**: SMPL+H G for every subset except BMLhandball, DanceDB, MOYO, PosePrior and TCDHands, plus the Extended
  SMPL+H body model (mano.is.tue.mpg.de). The licence is non-commercial research and is the user's to accept.
* **Nymeria**: the body-motion (XSens) files only, not the video; access requested from Meta's Project Aria site.
* **Bandai Namco Research Motiondataset**: BVH from GitHub, CC BY-NC 4.0.
* **OpenBiomechanics Project**: pitching only; batting is a striking motion and is excluded.

Combat clips inside the general datasets (boxing, kicking, martial arts) are filtered out by label and by a motion
check (fast end-effector strikes toward a target).
