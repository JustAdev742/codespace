# Playtesting Ludora at The Hills Grammar School

A guide for running a first playtest with a class: getting the school's copy of Ludora running,
the lesson itself, what to watch, and the questions to ask afterwards.

The playtest copy runs in a GitHub Codespace and wears the school's look: the logo, Lato, the red
and green, and every Glim in the Hills Grammar uniform for its player's year. Players need a web
browser and nothing else: no app to install, no accounts, no email addresses.

## The day before (about 20 minutes)

1. **Start the playtest copy.** On GitHub, open the `JustAdev742/codespace` repository and choose
   **Code**, then **Codespaces**, then the **...** menu and **New with options**. Pick:
   - **Branch:** the one with the latest Ludora (`claude/jolly-darwin-3tr8hx` until it is merged);
   - **Dev container configuration:** **Ludora (Hills Grammar playtest)**;
   - **Machine type:** 4-core.

   The first start takes about five minutes. It is ready when the terminal says
   `Ludora is running in the hills-grammar look`.
2. **Let phones reach it.** In the **Ports** tab, right-click port **8787**, choose
   **Port visibility**, then **Public**. Copy the address beside it (it ends in `app.github.dev`).
3. **Try that address on a phone on the school Wi-Fi.** School web filters sometimes block
   `app.github.dev`. If it does not load, ask IT to allow `*.app.github.dev` for the day.
4. **Keep it awake.** A Codespace stops after a time without anyone using its editor, even while
   people are playing. At github.com/settings/codespaces, set **Default idle timeout** to 240
   minutes. Leave the Codespace tab open during the lesson.
5. **Make the teacher account.** Open the address, choose **Sign up**, and pick **Teacher**. The
   question library already has ready-made sets; a teacher can also make their own under
   **Question sets** or paste questions in.
6. **Run a practice game.** Host one, join it from your own phone, and add practice bots from
   the lobby to see a full room.

## In the lesson (about 40 minutes)

**The teacher** chooses **Host**, a question set and a game, then **Start**. Put the big screen on
the projector. Under **Room**:

- **Generated names only** gives everyone a random friendly name: good for younger classes.
- **Lantern tricks**: there is no switch for these any more. If a trick is played in your game, **Calm the room** appears in the host controls and ends them for that game (docs/CHAOS.md).
- **Lock room** in the lobby stops anyone else joining. A player's card in the lobby can remove
  them.

**Students** open the address, type the six-digit code from the big screen, type their first
name or a nickname, and choose their **school year** (and, from Year 3, their blazer and whether
it is a sport day). Their Glim then wears that year's uniform. The year stays on their device;
other players only ever see the uniform.

A plan that fits one lesson:

| Time | What | Why |
|---|---|---|
| 5 min | Join and choose years | Everyone in the lobby in uniform: a good first look on the big screen. |
| 10 min | **Classic** | The plain quiz: question on the big screen, answers on phones. |
| 10 min | **Tug of War** or **Gold Rush** | Teams, and more going on. |
| 5 min | **Lantern Match** or **Word Scramble** | A different kind of question. |
| 10 min | Feedback | The questions below. |

On school laptops, try **Glow Tag Royale** or **Gold Rush** in 3D as well. Phones can play them
too; if one struggles, the gear button in the corner of the 3D view has **3D off**.

## What to watch

- **Joining:** how long until everyone is in? Who got stuck, and where?
- **Reading:** can everyone read the big screen from the back, and their own screen?
- **Speed:** any lag on the school Wi-Fi? Does anyone drop out and come back?
- **Uniforms:** did each year group get the right one? Anything about the uniform that looks wrong?
- **Behaviour:** names, reactions, anything that needed the teacher.
- **Sound:** the big screen plays music and effects; phones play only effects.

Anyone can use the flag button in a game to report a problem. Reports go to the staff pages.

## Questions afterwards

For students (a show of hands works):

1. How much fun was it, from 1 to 5?
2. Was anything confusing?
3. Did your Glim's uniform look right for your year?
4. Which game did you like most, and why?
5. What would you change?

For teachers:

1. Did it fit the lesson? Which subjects would it suit?
2. Was setting up a game easy?
3. Would you use it again?
4. Did anything worry you: safety, screen time, noise, anything else?

## Safety and privacy

- Students join with a first name or nickname. No accounts, emails or passwords are needed.
- A guest's school year stays on their own device; the server sends other players only the
  uniform, never the year.
- Everything from the playtest lives in this Codespace's own database. Deleting the Codespace
  deletes all of it.
- The school's logo is used with the school's look only. Confirm the school is happy with that
  before students see it.
- The full policy is in the app, under Privacy and Terms.

## If something goes wrong

| Problem | What to do |
|---|---|
| The address does not load on phones | Check port 8787 is **Public**. If it still fails on the school Wi-Fi, the filter is blocking it: ask IT, or use a phone hotspot to show it works. |
| Everything stopped | The Codespace went to sleep. Open it again from github.com/codespaces: Ludora starts by itself. Games in progress are lost; start a new one and players join with the new code. |
| Ludora needs a restart | In the Codespace terminal: `bash .devcontainer/start.sh` |
| You need to see what happened | The server log is in `~/.ludora/server.log` in the Codespace. |

## Afterwards

- The results screen has **Download results (CSV)** for each game.
- Write down the answers to the questions above while they are fresh.
- When the playtest is over, delete the Codespace (github.com/codespaces). That deletes every
  account, game and result from the playtest.

## For a longer trial

A Codespace suits a playtest. For use in lessons every week, the school's copy needs a real
server with its own address: [DEPLOYMENT.md](DEPLOYMENT.md) explains how, and
[SCHOOL_LOOKS.md](SCHOOL_LOOKS.md) how the school's look is switched on.
