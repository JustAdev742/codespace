#!/usr/bin/env bash
# The G1 moving however you tell it, without training (motion/live_mover.py), on Linux or macOS.
# First run: venv, packages, the Bandai Namco dataset and the G1 motion library (about 10 minutes). Extra arguments go
# to live_mover (e.g. ./run_mover.sh --claude, ./run_mover.sh --local qwen3:8b).
set -e
cd "$(dirname "$0")"
if [ ! -d .venv-mover ]; then
  python3 -m venv .venv-mover
  .venv-mover/bin/pip install --upgrade pip
  .venv-mover/bin/pip install torch --index-url https://download.pytorch.org/whl/cpu
  .venv-mover/bin/pip install mujoco numpy scipy quadprog pillow anthropic
fi
[ -f runs/motion/bandai_library.npz ] || .venv-mover/bin/python -m motion.build_bandai
# macOS: the MuJoCo viewer needs mjpython (it comes with the mujoco package)
PY=.venv-mover/bin/python; [ "$(uname)" = Darwin ] && PY=.venv-mover/bin/mjpython
exec "$PY" -m motion.live_mover --library runs/motion/bandai_library.npz "$@"
