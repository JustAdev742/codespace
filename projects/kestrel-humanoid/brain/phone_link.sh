#!/usr/bin/env bash
# One command for opening KESTREL live on a phone from a GitHub Codespace:
#
#     bash projects/kestrel-humanoid/brain/phone_link.sh
#
# 1. makes sure the robot is running (starts it if not, and shows its log if it fails);
# 2. opens a public https link to it through a Cloudflare quick tunnel (no account needed). GitHub's own forwarded
#    address puts a sign-in check in front of the port, which iPhone Safari's tracking protection breaks (white page).
#
# Anyone with the printed link can open the page while this keeps running. Ctrl-C closes the link.
cd "$(dirname "$0")"

up() { curl -s -m 3 localhost:8765/state 2>/dev/null | grep -q room; }

if ! up; then
  echo "Starting the robot (the first time takes up to a minute)..."
  if ! python -c "import mujoco, torch, scipy, PIL" 2>/dev/null; then
    echo "Python packages are missing: installing them first (a few minutes)."
    bash codespace_setup.sh || { echo "Setup failed: see the messages above."; exit 1; }
  fi
  bash codespace_start.sh
  for i in $(seq 1 45); do up && break; sleep 2; done
fi
if ! up; then
  echo "The robot did not start. The last lines of its log (/tmp/kestrel-live.log):"
  tail -30 /tmp/kestrel-live.log
  exit 1
fi
echo "The robot is running: $(curl -s localhost:8765/state)"

CF=$(command -v cloudflared || echo /tmp/cloudflared)
if [ ! -x "$CF" ]; then
  echo "Downloading cloudflared (the tunnel program)..."
  curl -fsSL -o /tmp/cloudflared https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-linux-amd64 \
    && chmod +x /tmp/cloudflared || { echo "Could not download cloudflared."; exit 1; }
  CF=/tmp/cloudflared
fi
pkill -f "cloudflared tunnel" 2>/dev/null || true
"$CF" tunnel --no-autoupdate --url http://localhost:8765 > /tmp/kestrel-tunnel.log 2>&1 &
TUN=$!
for i in $(seq 1 30); do
  URL=$(grep -o 'https://[a-z0-9-]*\.trycloudflare\.com' /tmp/kestrel-tunnel.log | head -1)
  [ -n "$URL" ] && break
  sleep 1
done
if [ -z "$URL" ]; then
  echo "The tunnel did not open. Its log:"
  tail -20 /tmp/kestrel-tunnel.log
  kill $TUN 2>/dev/null
  exit 1
fi
echo
echo "================================================================"
echo "  Open this on your iPhone:  $URL"
echo "  (tap the page once so it can speak; keep this terminal open)"
echo "================================================================"
wait $TUN
