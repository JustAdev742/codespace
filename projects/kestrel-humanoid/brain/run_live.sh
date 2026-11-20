#!/usr/bin/env bash
# KESTREL live on macOS or Linux: sets up a virtual environment the first time, then starts the house and opens
# your browser at http://localhost:8765. Extra arguments go to live.py (for example: ./run_live.sh --claude).
set -e
cd "$(dirname "$0")"
if [ ! -d .venv ]; then
  python3 -m venv .venv
  .venv/bin/pip install --upgrade pip
  .venv/bin/pip install torch --index-url https://download.pytorch.org/whl/cpu
  .venv/bin/pip install -r requirements-live.txt
fi
# the real furniture, surfaces and lighting (once, about 110 MB; the house works with plain shapes without them)
[ -f data/real/models/sofa_02/meta.json ] || .venv/bin/python real_assets.py || echo "(real models not fetched: plain shapes)"
( sleep 20; (command -v open >/dev/null && open http://localhost:8765) || (command -v xdg-open >/dev/null && xdg-open http://localhost:8765) ) >/dev/null 2>&1 &
exec .venv/bin/python live.py "$@"
