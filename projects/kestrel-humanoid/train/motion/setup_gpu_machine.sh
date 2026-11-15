#!/usr/bin/env bash
# Set up a rented GPU machine (Linux, NVIDIA) for the motion training, then prove it works with a 2-minute smoke
# test on synthetic clips. Run from anywhere:
#     bash projects/kestrel-humanoid/train/motion/setup_gpu_machine.sh
# RTX 50-series (Blackwell) GPUs need PyTorch built for CUDA 12.8, which this installs.
set -euo pipefail
cd "$(dirname "$0")/.."                       # train/
python3 -m venv .venv-motion
. .venv-motion/bin/activate
pip install --upgrade pip
pip install torch --index-url https://download.pytorch.org/whl/cu128
pip install "mujoco>=3.2" numpy scipy
python - <<'EOF'
import torch, mujoco
print("torch", torch.__version__, "| CUDA available:", torch.cuda.is_available(), "| GPUs:", torch.cuda.device_count())
for i in range(torch.cuda.device_count()):
    print("  ", i, torch.cuda.get_device_name(i))
print("mujoco", mujoco.__version__)
EOF
python -m motion.make_test_data --out /tmp/motion_smoke_data
python -m motion.train_all --data /tmp/motion_smoke_data --out /tmp/motion_smoke_run --smoke --cpus 8
echo
echo "Setup works. Start the real run with (inside this venv: . train/.venv-motion/bin/activate):"
echo "  cd $(pwd) && python -m motion.train_all --data /data/AMASS /data/bandai /data/nymeria --smplh /data/smplh --out runs/motion --hours 22"
