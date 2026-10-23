#!/usr/bin/env bash
# Runs every time the dev container starts, and by hand to restart: runs the production
# build of Ludora on port 8787 in the background. On start the server applies database
# migrations and adds the built-in content (question sets, Glims, shop).
set -euo pipefail
app="$(cd "$(dirname "$0")/../apps/ludora" && pwd)"
state="$HOME/.ludora"
mkdir -p "$state/uploads"

# The production build comes from setup.sh, which runs once while the container is created.
if [ ! -s "$app/server/dist/index.js" ] || [ ! -s "$app/web/dist/index.html" ]; then
  echo "Ludora is not built yet. If the Codespace is still being created, wait for it to finish." >&2
  echo "Otherwise build it and start it: bash .devcontainer/setup.sh && bash .devcontainer/start.sh" >&2
  exit 1
fi

# The address people open. The server also accepts pages at whatever address reaches it
# (server/src/http/origins.ts), so VS Code's forwarded localhost port works as well.
if [ -n "${CODESPACE_NAME:-}" ]; then
  origin="https://${CODESPACE_NAME}-8787.${GITHUB_CODESPACES_PORT_FORWARDING_DOMAIN:-app.github.dev}"
  secure=true
else
  origin="http://localhost:8787"
  secure=false
fi

# IP addresses are stored only as keyed hashes: make a random key once and keep it.
if [ ! -s "$state/ip-hash-key" ]; then
  (umask 077 && node -e "process.stdout.write(require('node:crypto').randomBytes(24).toString('hex'))" > "$state/ip-hash-key")
fi

# Postgres starts alongside this container; wait for it.
for _ in $(seq 1 60); do
  if (exec 3<>/dev/tcp/127.0.0.1/5432) 2>/dev/null; then break; fi
  sleep 1
done

answering() {
  node -e "fetch('http://127.0.0.1:8787/api/health').then((r) => process.exit(r.ok ? 0 : 1)).catch(() => process.exit(1))" 2>/dev/null
}

# Stop the copy this script started last time, if it is still running. The pid is checked
# against the process's command line, so a stale pid file never stops anything else.
if [ -s "$state/server.pid" ]; then
  pid="$(cat "$state/server.pid")"
  if tr '\0' ' ' < "/proc/$pid/cmdline" 2>/dev/null | grep -q "dist/index.js"; then
    kill "$pid" 2>/dev/null || true
    for _ in $(seq 1 20); do kill -0 "$pid" 2>/dev/null || break; sleep 0.5; done
  fi
fi

# Anything still answering on the port now is not ours, and a new copy could not use it.
if answering; then
  echo "Something else is already running on port 8787. Stop it, then run: bash .devcontainer/start.sh" >&2
  exit 1
fi

cd "$app/server"
DATABASE_URL="${DATABASE_URL:-postgres://postgres:postgres@localhost:5432/ludora}" \
  APP_ENV=production PUBLIC_ORIGIN="$origin" IP_HASH_KEY="$(cat "$state/ip-hash-key")" \
  TRUST_PROXY=true COOKIE_SECURE="$secure" HOST=0.0.0.0 PORT=8787 UPLOAD_DIR="$state/uploads" \
  setsid nohup node --enable-source-maps dist/index.js > "$state/server.log" 2>&1 < /dev/null &
pid=$!
echo "$pid" > "$state/server.pid"

# The port was free, so the first answer comes from this copy. It applies migrations and
# adds content before it listens, which takes a few seconds the first time.
for _ in $(seq 1 90); do
  if ! kill -0 "$pid" 2>/dev/null; then
    echo "Ludora stopped while starting. The log is at $state/server.log:" >&2
    tail -n 30 "$state/server.log" >&2
    exit 1
  fi
  if answering; then
    echo "Ludora is running. Open port 8787 from the Ports tab, or go to $origin"
    exit 0
  fi
  sleep 1
done
echo "Ludora did not start within 90 seconds. The log is at $state/server.log:" >&2
tail -n 30 "$state/server.log" >&2
exit 1
