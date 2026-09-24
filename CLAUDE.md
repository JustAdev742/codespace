# Repository guide

This repo is a Claude Code toolkit: 70 vendored agent skills plus the subagent,
slash commands, MCP servers and scripts that make them work.

## Layout

| Path | What it is |
|---|---|
| `.claude/skills/` | 70 skills, one directory each. See `.claude/skills/README.md` for provenance. |
| `.claude/agents/design-review.md` | `design-review` subagent — drives a real browser, WCAG 2.1 AA. |
| `.claude/commands/` | `/design-plan` and `/design-review`. |
| `.claude/plugins/emotion-statusline/` | Vendored, **not active**. See below. |
| `.mcp.json` | 4 MCP servers: `accesslint`, `playwright`, `chrome-devtools`, `shadcn`. |
| `scripts/design-audit.mjs` | Headless heuristic design/a11y audit. `npm run audit`. |
| `scripts/setup.sh` | Installs every runtime dependency. `npm run setup`. |
| `scripts/install-toolkit.sh` | Installs the whole toolkit at user level (`~/.claude`) so any repo, branch or session has it. `scripts/session-start-hook.sh` is the hook other repos copy to run it. |
| `requirements.txt` | Python deps, annotated with the skill that needs each. |
| `apps/ghost-typer/` | Ghost Typer, a desktop app built with these skills. `.github/workflows/build.yml` packages it for Windows, macOS and Linux. |

## Setup

Skills **load** with no setup. Dependencies are only needed to run their scripts.

```bash
npm run setup      # python deps + node deps + playwright browsers
```

Python deps should go in a virtualenv — this image ships some packages via apt
that pip cannot replace (PyJWT), so a bare `pip install -r requirements.txt`
against system Python fails:

```bash
python3 -m venv .venv && . .venv/bin/activate && pip install -r requirements.txt
```

Three skills also want system packages: `poppler-utils` (anthropics-pdf),
`ffmpeg` (slack-gif-creator), `jq` (emotion-statusline).

## Use the toolkit in any repository

Project skills only exist on the branch that carries them. `scripts/install-toolkit.sh`
installs the toolkit at **user level** instead (`~/.claude`): the skills (plus `shared/`),
the `design-review` subagent, `/design-plan` and `/design-review`, the four MCP servers at
user scope, and the permission allow-list. It is idempotent and touches nothing else under
`~/.claude` - your own skills, claude.ai synced skills, sessions and credentials stay put.

Three ways to get it into a session that is not this repository:

- **The environment's setup script** - every repository, every branch, every session. In a
  session's title bar open the cloud environment menu, Edit, Setup script, and add:

  ```bash
  git clone --depth 1 https://github.com/JustAdev742/codespace /tmp/claude-toolkit && bash /tmp/claude-toolkit/scripts/install-toolkit.sh
  ```

- **A SessionStart hook in the other repository** - that repository, on any branch that
  carries the two files. Copy `scripts/session-start-hook.sh` to
  `.claude/hooks/session-start.sh` there and register it in its `.claude/settings.json`:

  ```json
  { "hooks": { "SessionStart": [ { "hooks": [ { "type": "command",
      "command": "$CLAUDE_PROJECT_DIR/.claude/hooks/session-start.sh" } ] } ] } }
  ```

  The hook runs synchronously in web sessions only, so the skills exist before the first
  turn; if the toolkit cannot be fetched it says so and lets the session start anyway.
  Once merged into that repository's default branch every new session there has the toolkit.

- **By hand** - `bash scripts/install-toolkit.sh` from a checkout.

After a user-level install the skill scripts live next to their skill, e.g.
`python3 ~/.claude/skills/ui-ux-pro-max/scripts/search.py ...`; the installer leaves a note
saying so in `~/.claude/CLAUDE.md`.

## MCP servers

`.mcp.json` declares the four servers; `.claude/settings.json` pre-approves them
(`enableAllProjectMcpServers`) along with the four Bash commands the skills and
commands run. Both are committed, so a fresh clone works without prompting.

Note what that means: `.claude/settings.json` grants command execution to anyone
who opens this repo in Claude Code. Review it the way you would review a CI
config. Narrow or delete the `permissions.allow` entries you do not want, and
Claude Code falls back to asking per call.

`.claude/settings.local.json` is personal per-machine state and is gitignored.

Which skills need which server:

- `accesslint` → the five `accessibility-*` skills. Without it they cannot scan.
- `playwright`, `chrome-devtools` → `design-review` subagent, `webapp-testing`.
- `shadcn` → `ui-styling`, `uiux-design`.

## emotion-statusline is vendored but inactive

`.claude/plugins/emotion-statusline/` ships a `Stop` hook that reads your
transcript and spawns `claude --print` after **every turn** to classify a mood
for the statusline. That costs tokens on each turn and reads conversation
content, so it is not wired up. Its `hooks/hooks.json` is inert where it sits.
To enable it, install it as a plugin and add its statusline command yourself.

## Skill paths

Skill scripts resolve relative to their own directory, not the project root.
From the repo root:

```bash
python3 .claude/skills/ui-ux-pro-max/scripts/search.py "fintech dashboard" --design-system -p "Project"
```

## Local changes to vendored skills

Everything under `.claude/skills/` is vendored upstream — pinned commits are in
`.claude/skills/README.md`. Deliberate deviations:

- 9 skills renamed to avoid shadowing Claude Code built-ins (`anthropics-*`, `uiux-design`).
- 5 directories renamed to match the `name:` their own frontmatter declared.
- `relationship-design` had a prose title where its name slug belonged.
- `design-audit` and `ui-typography`: reference files moved into `references/`,
  which is where their own SKILL.md says they live. Upstream has them at the
  skill root, so those skills cannot find their own references as shipped.
- `anthropics-claude-api`: description trimmed 1068 → under 1024 chars (spec max).
- `vercel-react-view-transitions`: angle brackets removed from its description
  (the spec disallows them).

Re-vendoring from upstream will undo these; re-apply them.
