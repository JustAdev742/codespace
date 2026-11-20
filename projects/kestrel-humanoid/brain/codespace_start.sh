#!/usr/bin/env bash
# Starts KESTREL live in the background whenever the codespace starts (port 8765; the page opens by itself).
# With an ANTHROPIC_API_KEY codespace secret, Claude is the robot's mind (--claude --agent); without one, the robot
# understands plain commands. Log: /tmp/kestrel-live.log. Stop it: pkill -f live.py. Start it again: bash this file.
cd "$(dirname "$0")"
pkill -f "live.py --host 0.0.0.0" 2>/dev/null || true
export MUJOCO_GL=osmesa
MODE=""
if [ -n "$ANTHROPIC_API_KEY" ]; then
  MODE="--claude --agent"
  echo "ANTHROPIC_API_KEY found: Claude is the robot's mind (it sees, works things out and learns)."
else
  echo "No ANTHROPIC_API_KEY secret: the robot understands plain commands (add the secret for Claude as its mind)."
fi
nohup python live.py --host 0.0.0.0 --phone $MODE > /tmp/kestrel-live.log 2>&1 &
for i in $(seq 1 120); do                       # wait until the page answers (a few seconds)
  if curl -s -m 2 localhost:8765/state > /dev/null 2>&1; then break; fi
  if ! pgrep -f "live.py --host 0.0.0.0" > /dev/null; then
    echo "KESTREL live stopped while starting. The end of its log:"; tail -20 /tmp/kestrel-live.log; exit 1
  fi
  sleep 1
done
if [ -n "$CODESPACE_NAME" ]; then
  echo "KESTREL live: https://${CODESPACE_NAME}-8765.${GITHUB_CODESPACES_PORT_FORWARDING_DOMAIN:-app.github.dev}"
else
  echo "KESTREL live: http://localhost:8765"
fi
echo "(the page shows the house being built for about a minute the first time; log: /tmp/kestrel-live.log)"
