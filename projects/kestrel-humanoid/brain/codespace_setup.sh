#!/usr/bin/env bash
# One-time setup in a GitHub Codespace (run by .devcontainer/kestrel-live/devcontainer.json): the software OpenGL the
# simulation renders with, and the Python packages. Takes a few minutes.
set -e
cd "$(dirname "$0")"
sudo apt-get update -y
sudo apt-get install -y --no-install-recommends libosmesa6 libgl1
pip install --upgrade pip
pip install torch --index-url https://download.pytorch.org/whl/cpu
pip install -r requirements-live.txt
echo "KESTREL live is set up."
