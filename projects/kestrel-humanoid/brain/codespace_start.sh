#!/usr/bin/env bash
# Starts KESTREL live in the background whenever the codespace starts (port 8765, phone-friendly video).
# Log: /tmp/kestrel-live.log. Stop it: pkill -f live.py. Start it again: bash this file.
cd "$(dirname "$0")"
pkill -f "live.py --host 0.0.0.0" 2>/dev/null || true
export MUJOCO_GL=osmesa
nohup python live.py --host 0.0.0.0 --phone > /tmp/kestrel-live.log 2>&1 &
echo "KESTREL live is starting on port 8765 (log: /tmp/kestrel-live.log)."
