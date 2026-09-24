# codespace

A Claude Code toolkit: 70 agent skills vendored from 7 upstream repositories,
plus the subagent, slash commands, MCP servers and scripts that make them run.

```bash
npm run setup      # install runtime dependencies
npm run audit      # headless design + a11y audit
```

- **Skills** — `.claude/skills/` (70). Provenance and pinned commits in
  [`.claude/skills/README.md`](.claude/skills/README.md).
- **Subagent** — `design-review`, drives a real browser for WCAG 2.1 AA review.
- **Commands** — `/design-plan`, `/design-review`.
- **MCP servers** — `accesslint`, `playwright`, `chrome-devtools`, `shadcn`.

Setup, MCP enablement, and the list of local deviations from upstream are in
[`CLAUDE.md`](CLAUDE.md).

## Use it in any repository

The skills here are project skills: they exist only on branches of this repository. To have
them in every repository, branch and session, install them at user level instead:

```bash
git clone --depth 1 https://github.com/JustAdev742/codespace /tmp/claude-toolkit && bash /tmp/claude-toolkit/scripts/install-toolkit.sh
```

Put that line in your Claude Code environment's setup script (cloud environment menu in a
session's title bar → Edit → Setup script) and it runs before every session. For one
repository, copy `scripts/session-start-hook.sh` to its `.claude/hooks/session-start.sh` and
register it as a SessionStart hook; `CLAUDE.md` here has the snippet.
