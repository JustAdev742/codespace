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
