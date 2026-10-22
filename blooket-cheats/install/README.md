# Install

Three ways to get the cheats, easiest first. All of them ship the fixed,
self-contained scripts — nothing phones home to the (dead) old update server.

## 1. Install page (easiest)

Open [`index.html`](index.html) in your browser — double-click the file, or
serve the repo with GitHub Pages and visit `…/install/`. You get a searchable
grid of every GUI and cheat. Then either:

- **Bookmarklet:** show the bookmarks bar (Ctrl/Cmd+Shift+B) and **drag** a
  button onto it. Click it later while on Blooket to run.
- **Console:** click **Copy**, open Blooket, press F12 → Console, paste, Enter.

Start with a **Menu** (top of the page) for a full on-screen cheat list.

## 2. Bulk bookmark import

Import [`../cheats/Bookmarklets.html`](../cheats/Bookmarklets.html) with your
browser's "import bookmarks from HTML" feature to drop every cheat into a
"Blooket Cheats" folder at once. Per-browser steps with screenshots are in
[`../tutorial/`](../tutorial/readme.md).

## 3. Userscript (install once, use anytime)

Install a userscript manager (Tampermonkey or Violentmonkey), then add
[`blooket-cheats.user.js`](blooket-cheats.user.js). On any Blooket page press
**Alt+B**, or pick **Launch Blooket Cheats GUI** from the userscript menu, to
open the GUI. It does not run on its own — only when you ask.

---

These are client-side scripts for a classroom quiz game. They can't do anything
the server controls (token balances, owned blooks, daily limits), and no script
is "unpatchable" — Blooket can change its site and break any of them. If one
stops working, the resolver is built to degrade rather than error; see
[`../CHANGES.md`](../CHANGES.md). AGPL-3.0 — see [`../LICENSE`](../LICENSE).
