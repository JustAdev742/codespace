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
| `requirements.txt` | Python deps, annotated with the skill that needs each. |

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
