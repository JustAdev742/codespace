# Local changes to this vendored copy

This is a vendored copy of the public **Blooket-Cheats** project
(AGPL-3.0). The notes below record the modifications made to this copy, as the
AGPL requires. Upstream copyright and the `Source:` reference in every file's
license header are left intact.

## 2026-10-22 — "make it work today" maintenance pass

Two things had rotted since this snapshot was taken and stopped the scripts from
working cleanly in a current browser against a current Blooket build.

### 1. The GitHub "update checker" was pinging a dead endpoint

Every script fetched a steganographic timestamp image from
`raw.githubusercontent.com/Blooket-Council/Blooket-Cheats/main/autoupdate/timestamps/<path>.png`
to decide whether a newer version existed. That path now returns **404**, so the
`img.onerror` branch fired on every single run and popped a blocking
`alert("It seems the GitHub is either blocked or down…")` before the cheat ran.

The update checker (the `new Image()` / canvas-decode / `timeProcessed` block
that was appended during the upstream commit-prep step) has been **removed**.
Each script now runs its cheat directly. The hidden-iframe helper (for native
`alert`/`prompt`/`confirm`) and the anti-detection `fetch` shim that blocks
`s.blooket.com/rc` reporting are kept.

### 2. The React state-node finder was brittle

Every cheat located Blooket's game component with one shared one-liner that read
`element._owner` and relied on fixed child indices and a fixed `body > div …`
nesting depth:

```js
Object.values((function react(r = document.querySelector("body>div")) {
  return Object.values(r)[1]?.children?.[0]?._owner.stateNode ? r : react(r.querySelector(":scope>div"));
})())[1].children[0]._owner.stateNode
```

This is the usual reason these scripts "stop working" after a Blooket deploy:
any markup change breaks the fixed path, and **React 19 removed `_owner` from
elements entirely**, so the lookup returns nothing and throws.

It has been replaced with a **version-agnostic resolver** (`__bcResolve` /
`__bcOwner`, plus `__bcTyping` for typing questions) that:

- reads the React fiber from a mounted DOM node via the `__reactFiber$…`
  (React 17/18/19) or `__reactInternalInstance$…` (React 16) key — not `_owner`;
- walks the fiber tree and **feature-detects** the game component (a class
  instance whose `props`/`state` carry `liveGameController`, `client`,
  `question`, or `stage`) instead of assuming a fixed position;
- **falls back to the original `_owner` method** if the walk finds nothing, so
  it is never worse than before.

The resolver is inlined into each cheat that needs it (the scripts are meant to
be pasted standalone). The 4 scripts that never used the finder
(`global/getDailyRewards`, `global/preventSuspension`, `flappy/setScore`,
`flappy/toggleGhost`) were left finder-free.

### 3. Removed third-party telemetry from the GUIs

`gui`, `mobileGui` and `reactGui` pinged `gui-logger.onrender.com` on every
launch. That beacon has been removed.

### Regeneration

The readable `.js` files are the source of truth. Every `.min.js` was
regenerated from its fixed `.js` with terser (compress + mangle), keeping the
short license banner. All 226 files pass `node --check`. The resolver's
fiber-walk logic is unit-tested against mock React 16/17/18/19 fiber trees.

### Not verified here

These changes were **not** exercised against a live Blooket game from the build
environment (play.blooket.com sits behind a Cloudflare bot challenge, and a real
game session is needed to confirm end to end). The fixes target the two concrete
breakages above and are designed to degrade to the old behavior rather than
regress. Confirm in a real game before relying on them; if a specific gamemode
cheat still misbehaves, the game component's state shape for that mode is the
place to look.

## 2026-10-22 (part 2) — resilience hardening + easy install

### Resolver v2: root discovery that survives markup renames

The resolver previously seeded its fiber walk from `#app` / `#root` /
`body > div`. If Blooket renamed or moved its root container those would all
miss. v2 adds `__bcFiberAny()`: it tries the known roots first, then **scans the
DOM** for any element carrying a `__reactFiber$…` / `__reactInternalInstance$…`
key and climbs to the root from there. Root discovery no longer depends on
Blooket's markup. The legacy `_owner` fallback is still there underneath.

This is the honest version of "guard it against Blooket": the scripts ride out
routine UI/build churn instead of breaking on it. It is **not** — and cannot be
— an "unpatchable" cheat. Blooket runs the server and ships the client, so they
can always change APIs, change data shapes, or move scoring server-side. No
client-side script prevents that, and nothing here tries to defeat their
cheat-detection.

Verified in a real Chromium via `playwright-core`: the shipped
`autoAnswer.min.js`, run against a mock React fiber tree, resolves the game node
and clicks the correct answer. (Still not run against a live Blooket game — see
the caveat above.)

### Easy install

- `install/index.html` — open it locally (or via GitHub Pages) for a searchable
  grid of every GUI and cheat. Drag a button to your bookmarks bar, or click
  **Copy** to paste into the console. Self-contained; makes no external requests.
- `cheats/Bookmarklets.html` — regenerated from the **fixed** code (it had the
  old broken scripts baked in). Import it with your browser's bookmark importer
  to get every cheat as a bookmarklet at once.
- `install/blooket-cheats.user.js` — a Tampermonkey/Violentmonkey userscript
  that embeds the React GUI (no external fetch). Install once; press **Alt+B**
  or use the userscript menu on any Blooket page to open the GUI. It does **not**
  auto-run on page load.

All three are generated from the fixed `.min.js` bundles, so they stay in sync
with the scripts.
