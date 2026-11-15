# Motion training: every dataset at once, one whole-body G1 controller

This folder is the program for `../MOTION_PLAN.md`: it reads AMASS, Bandai Namco, Nymeria and other mocap,
retargets it all onto the Unitree G1 (all 29 joints), and trains one controller that can copy those motions, using the
plan's six ideas. Striking motions (punches, kicks, bat swings, shoves) are always excluded: the robot must never
learn to strike anyone.

| Idea | Where |
|---|---|
| 1. Keep every clip, sample by novelty | `cluster.py` (window features, k-means, inverse-density weights) |
| 2. Retarget in one batch; make hard clips feasible instead of dropping them | `retarget.py` (differentiable IK in PyTorch), `feasible.py` (speed time-stretch, ground contact, smoothing, difficulty) |
| 3. Specialists in parallel, distilled into one | `trainers.py specialist` (one per motion family, one per GPU) and `trainers.py distill` (DAgger) |
| 4. Warm start from the data | `trainers.py warmstart` (behaviour cloning of feed-forward targets on reference states) |
| 5. Short windows, focus on failures | `track_env.py` (3 s episodes starting anywhere, reference-state start) and the failure-weighted sampling in `trainers.py` |
| 6. Lean simulation, massively parallel | `g1.py` (feet-only contact, no meshes, 50 Hz control), `vec.py` (simulation on every CPU core, learning on the GPUs) |

What it has been tested on: synthetic clips (`make_test_data.py`) and a synthetic AMASS-format clip with a stand-in
body model. Every stage runs end to end without errors (`train_all.py --smoke`), resumes after a stop, and the combat
filter catches a disguised punch while letting harmless motions through. It has **not** yet been trained at full
scale; the first real run will be the test of how well the methods work together.

## On the GPU machine

1. Get the code: download https://github.com/JustAdev742/codespace/archive/refs/heads/claude/dreamy-carson-f16476.zip
   (or `git clone -b claude/dreamy-carson-f16476 https://github.com/JustAdev742/codespace`). Once downloaded, it
   runs without internet; only the datasets have to be fetched.
2. `bash projects/kestrel-humanoid/train/motion/setup_gpu_machine.sh` installs PyTorch (CUDA 12.8, for RTX 50-series),
   MuJoCo and NumPy, prints the GPUs it sees, and runs the 2-minute smoke test.
3. Put the datasets on the machine, for example:
   * `/data/AMASS/<subset>/...` (SMPL+H G `.npz` files, unpacked) and `/data/smplh/{male,female,neutral}/model.npz`
     (the Extended SMPL+H model from mano.is.tue.mpg.de);
   * `/data/bandai/...` (`.bvh` from the Bandai Namco Research Motiondataset);
   * `/data/nymeria/...` (body motion as `.mvnx`; another format needs one more reader in `formats.py`).
4. Run, inside the venv (`. projects/kestrel-humanoid/train/.venv-motion/bin/activate`):

   ```bash
   cd projects/kestrel-humanoid/train
   python -m motion.train_all --data /data/AMASS /data/bandai /data/nymeria --smplh /data/smplh --out runs/motion --hours 22
   ```

   It uses every visible GPU (one specialist each) and every CPU core but two for the simulation. Running the same
   command again resumes where it stopped. Progress: `runs/motion/spec*/log.csv` and `train.log`, `runs/motion/distill.log`.
   Results: `runs/motion/final/policy.pt` (the controller) and `runs/motion/eval.json` (success on held-out clips).

To check a long run before paying for it: `--smoke` runs every stage for a few iterations on whatever data is given.
Preparing the library alone (`python -m motion.library --data ... --smplh ... --out runs/motion/library.npz`) is CPU work
and can be done at home first; copy `library.npz` to the GPU machine and `train_all.py` skips that stage.

## Files

`formats.py` readers -> `safety.py` combat filter -> `retarget.py` -> `feasible.py` -> `cluster.py` -> `library.py`
(the training library) -> `track_env.py` + `vec.py` (simulation) -> `trainers.py` (warm start, specialists,
distillation, evaluation) -> `train_all.py` (all stages, one command).
