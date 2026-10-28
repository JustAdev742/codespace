# Running a demo

How to show Ludora to a school from a GitHub Codespace, with a fallback that needs no phones.
Present in Chrome or Edge: the app has only been checked in Chromium-based browsers.

## Before the meeting (allow 15 minutes)

1. On GitHub, open the repository, switch to the branch `claude/jolly-darwin-3tr8hx`, then
   **Code → Codespaces → Create codespace on claude/jolly-darwin-3tr8hx**. The first build takes
   several minutes. It is ready when the creation log says Ludora is running.
   - Already have a Codespace from an older commit? In its terminal:
     `git pull && cd apps/ludora && npm run build && npm run build:demo && bash ../../.devcontainer/start.sh`
2. Open the **Ports** tab, right-click port **8787 → Port Visibility → Public**. Without this,
   students' phones cannot reach the game (a private port asks them to sign in to GitHub).
3. Open the forwarded address (it ends in `-8787.app.github.dev`) and check it loads.
4. **Create game** needs an account: choose **Sign up**, pick *Teacher*, and keep the password.
5. Do one practice run: host a game, join it from your own phone, start, answer a question, end.

If the school's Wi-Fi blocks `github.dev`, use a phone hotspot for the laptop and the phones.

## During the meeting

- **Host a game**: Host → pick a question set → pick a mode → Create game. The big screen shows
  the join address and a 6-digit code.
- **Students join** on any phone or laptop at the address on screen (or `/join/<code>`): a name
  and the code, no account needed.
- **Presenting alone?** In the lobby, **Add 3 practice bots** (as often as you like) fills the
  game, so the big screen shows a full class. Join from your own phone as well to show both screens.
- **3D modes** to show: Gold Rush, Glow Tag Royale, Big Catch, Code Breakers, Corner Shop.
- **Teacher features**: Classes (assignments and reports), Question sets (the editor, import),
  Game Maker (save a configured game), school events on a class.
- **Lantern tricks (party games)** in the host's Room options are **off by default**. Leave
  them off for a classroom demo; nobody can use chaos in a game unless the host turns this on.

## The season on screen

The site dresses itself for the Sydney calendar: in late October that is **Spooky Week**
(lanterns and friendly ghosts). If a school would rather not see it, a super administrator can
change or switch off the season under **Staff → Events → Seasonal calendar** (grant the role
first with `npm run admin -- grant <username> superadmin --reason "demo"` in `apps/ludora`).

## Fallback: one screen, no phones

Open `<the same address>/demo/`. A whole game runs in the browser against practice bots, with
no account, every mode included (3D too). Nothing is saved. Try
`/demo/#/play?set=official-general-knowledge&mode=gold-rush&bots=4`.

## Running it on your own computer instead

Needs Node 22 and Postgres 16 (see README.md):

```bash
cd apps/ludora
npm install
npm run db:migrate && npm run db:seed
npm run build && npm run build:demo
APP_ENV=production PUBLIC_ORIGIN=http://localhost:8787 COOKIE_SECURE=false \
  IP_HASH_KEY="$(openssl rand -hex 32)" npm start
```

Then open http://localhost:8787 (phones on the same network cannot use `localhost`; use the
Codespace for a demo with phones).
