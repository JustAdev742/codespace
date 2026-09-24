#!/usr/bin/env bash
# Install this toolkit at USER level, so every repository, branch and session has it:
#
#   ~/.claude/skills/<skill>/   the 70 skills (plus shared/, which the accessibility-* skills read)
#   ~/.claude/agents/           the design-review subagent
#   ~/.claude/commands/         /design-plan and /design-review
#   user-scope MCP servers      accesslint, playwright, chrome-devtools, shadcn
#   ~/.claude/settings.json     permission allow-list for those servers and the skill scripts
#   ~/.claude/CLAUDE.md         a note on where the skill scripts live once they are not in the project
#
# Idempotent: running it again refreshes everything from this checkout and touches nothing
# else under ~/.claude (your own skills, claude.ai synced skills, sessions, credentials).
#
#   bash scripts/install-toolkit.sh                                    from a checkout
#   git clone --depth 1 https://github.com/JustAdev742/codespace /tmp/claude-toolkit \
#     && bash /tmp/claude-toolkit/scripts/install-toolkit.sh          from anywhere: setup scripts, hooks
#
# Skills load with no dependencies. Their scripts and the MCP servers need node/npx and python3
# at run time; `npm run setup` in this repo installs the heavier extras (browsers, python deps).
#
# Knobs: CLAUDE_CONFIG_DIR (default ~/.claude), TOOLKIT_USE_CLI=0 to write the MCP config
# directly instead of through `claude mcp add`. Works on Linux, macOS and Windows (Git Bash).
set -u
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
# python3 on Linux and macOS; on Windows it is usually `python` or the `py` launcher
if command -v python3 >/dev/null 2>&1; then PY=python3
elif command -v python >/dev/null 2>&1; then PY=python
else PY="py -3"; fi
DEST="${CLAUDE_CONFIG_DIR:-$HOME/.claude}"
mkdir -p "$DEST/skills" "$DEST/agents" "$DEST/commands"

# ---- skills, agents, commands: replace by name, leave everything else alone
n=0
for src in "$HERE"/.claude/skills/*/; do
  name="$(basename "$src")"
  rm -rf "${DEST:?}/skills/$name"
  cp -R "$src" "$DEST/skills/$name"
  n=$((n + 1))
done
for src in "$HERE"/.claude/agents/*.md "$HERE"/.claude/commands/*.md; do
  [ -f "$src" ] || continue
  case "$src" in */agents/*) sub=agents ;; *) sub=commands ;; esac
  cp "$src" "$DEST/$sub/$(basename "$src")"
done

# ---- MCP servers at user scope: the CLI is the supported way; fall back to the file it writes
$PY - "$HERE/.mcp.json" "$HOME/.claude.json" <<'PY'
import json, os, shutil, subprocess, sys
want = json.load(open(sys.argv[1]))["mcpServers"]
cfg_path = sys.argv[2]
load = lambda: json.load(open(cfg_path)) if os.path.exists(cfg_path) else {}
missing = {k: v for k, v in want.items() if k not in (load().get("mcpServers") or {})}
if not missing:
    print(f"mcp: all {len(want)} user-scope servers already registered"); sys.exit(0)
# On Windows npx is a .cmd file, which a stdio server cannot spawn directly: go through cmd /c.
win = sys.platform == "win32"
launch = lambda spec: (["cmd", "/c", spec["command"], *spec.get("args", [])] if win else [spec["command"], *spec.get("args", [])])
cli = shutil.which("claude") if os.environ.get("TOOLKIT_USE_CLI", "1") != "0" else None
done = 0
if cli:
    for name, spec in missing.items():
        r = subprocess.run([cli, "mcp", "add", "--scope", "user", name, "--", *launch(spec)],
                           capture_output=True, text=True, timeout=60)
        if r.returncode == 0: done += 1
        else: print(f"mcp: `claude mcp add {name}` failed ({r.stderr.strip()[:100]}), writing the config directly")
if done < len(missing):
    cfg = load(); have = cfg.setdefault("mcpServers", {})
    for k, v in want.items():
        if k not in have:
            cmd, *args = launch(v); have[k] = {"type": "stdio", "command": cmd, "args": args}
    tmp = cfg_path + ".tmp"
    with open(tmp, "w") as f: json.dump(cfg, f, indent=2)
    os.replace(tmp, cfg_path)
print(f"mcp: registered {len(missing)} user-scope server(s): {', '.join(missing)}")
PY

# ---- permissions: merge the allow-list into the user settings
$PY - "$HERE/.claude/settings.json" "$DEST/settings.json" "$DEST" <<'PY'
import json, os, sys
src = json.load(open(sys.argv[1])); dst_path, dest = sys.argv[2], sys.argv[3]
dst = json.load(open(dst_path)) if os.path.exists(dst_path) else {}
allow = list((dst.get("permissions") or {}).get("allow") or [])
search = "skills/ui-ux-pro-max/scripts/search.py"
wanted = [a for a in src["permissions"]["allow"] if not a.startswith("Bash(")] + [
    f"Bash(python3 {dest}/{search}:*)", f"Bash(python3 ~/.claude/{search}:*)"]
added = [a for a in wanted if a not in allow]
if added:
    dst.setdefault("permissions", {})["allow"] = allow + added
    tmp = dst_path + ".tmp"
    with open(tmp, "w") as f: json.dump(dst, f, indent=2); f.write("\n")
    os.replace(tmp, dst_path)
print(f"permissions: {len(added)} allow entries added, {len(allow)} kept")
PY

# ---- a note in the user CLAUDE.md so the skill scripts are found at their new path
$PY - "$DEST/CLAUDE.md" "$DEST" <<'PY'
import os, re, sys
path, dest = sys.argv[1], sys.argv[2]
start, end = "<!-- toolkit:start -->", "<!-- toolkit:end -->"
block = f"""{start}
# Design toolkit (installed by JustAdev742/codespace, scripts/install-toolkit.sh)

The skills under `{dest}/skills/` come from the toolkit; `design-pipeline` routes the seven
design skills that conflict when loaded together. Skill scripts live next to their skill,
not in the project, for example:

```bash
python3 {dest}/skills/ui-ux-pro-max/scripts/search.py "fintech dashboard" --design-system -p "Project"
```

The MCP servers accesslint, playwright, chrome-devtools and shadcn are registered at user scope.
{end}"""
text = open(path).read() if os.path.exists(path) else ""
if start in text and end in text:
    text = re.sub(re.escape(start) + r".*?" + re.escape(end), lambda m: block, text, flags=re.S)
else:
    text = (text.rstrip() + "\n\n" if text.strip() else "") + block + "\n"
with open(path, "w") as f: f.write(text)
print("CLAUDE.md: toolkit note in place")
PY

echo "skills: $n installed to $DEST/skills, agents and commands alongside"
