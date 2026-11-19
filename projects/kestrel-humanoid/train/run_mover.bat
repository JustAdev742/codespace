@echo off
rem The G1 moving however you tell it, without training (motion/live_mover.py), on Windows.
rem First run: makes a virtual environment, installs the packages, downloads the Bandai Namco motion dataset and
rem builds the G1 motion library (about 10 minutes in all). After that it starts in seconds.
rem Extra arguments go to live_mover (for example: run_mover.bat --claude   or   run_mover.bat --local qwen3:8b).
cd /d "%~dp0"
if not exist .venv-mover (
  py -3.12 -m venv .venv-mover 2>nul || py -3 -m venv .venv-mover || python -m venv .venv-mover
  .venv-mover\Scripts\python -m pip install --upgrade pip
  .venv-mover\Scripts\pip install torch --index-url https://download.pytorch.org/whl/cpu
  .venv-mover\Scripts\pip install mujoco numpy scipy quadprog pillow anthropic
)
if not exist runs\motion\bandai_library.npz (
  .venv-mover\Scripts\python -m motion.build_bandai
)
.venv-mover\Scripts\python -m motion.live_mover --library runs\motion\bandai_library.npz %*
