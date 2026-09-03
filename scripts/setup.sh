#!/usr/bin/env bash
# Install everything the vendored skills need to actually run.
# Skills LOAD without any of this; these are only needed to execute their scripts.
set -euo pipefail
cd "$(dirname "$0")/.."

echo "==> Python packages (requirements.txt)"
python3 -m pip install --quiet --disable-pip-version-check -r requirements.txt

echo "==> Node packages (design-audit.mjs)"
if [ -f package-lock.json ]; then npm ci --silent; else npm install --silent; fi

echo "==> Playwright browsers"
# Claude Code web sessions ship Chromium at $PLAYWRIGHT_BROWSERS_PATH already.
if [ -n "${PLAYWRIGHT_BROWSERS_PATH:-}" ] && [ -d "${PLAYWRIGHT_BROWSERS_PATH}" ]; then
  echo "    preinstalled at $PLAYWRIGHT_BROWSERS_PATH — skipping download"
else
  python3 -m playwright install chromium || npx playwright install chromium
fi

cat <<'NOTE'

==> System packages some skills also want (install via your OS package manager):
      poppler-utils   anthropics-pdf   (pdf2image)
      ffmpeg          slack-gif-creator (imageio-ffmpeg)
      jq              .claude/plugins/emotion-statusline

Done. MCP servers in .mcp.json are fetched on demand by npx.
NOTE
