# Pages polish: bugs found and fixed, and a better look

Scope: every page outside a live game (landing, sign in, sign up and recovery, home for each
kind of user, Join and Host, Game modes, Game Maker, question sets and the editor, Collection,
Shop, Locker, Quests, Friends, Classes, Leaderboards, profiles, Settings, legal pages, reports,
not found, and a staff smoke check).

## How the bugs were found

A throwaway Playwright crawler (not committed) signed in as nine kinds of account: signed out,
guest, a new player, student and teacher with nothing done, and a player, student and teacher who
had played a game, owned Glims and Sparks, wrote sets, ran a class with two students and an
assignment and had a friend, plus a super administrator. It visited every page each could reach at
390x844 and 1366x768, in day and night themes, and recorded screenshots, console and page errors,
failed and 4xx/5xx requests, sideways overflow, axe results (WCAG 2.2 A and AA tags) and the tab
order: about 500 page visits in all. Flow scripts then exercised the forms (empty, wrong, too long,
double submits), deep links opened signed out, an ended session, slow and failing API routes
(delayed by 2.5 s, then answered with a 500), the back button, reloading mid-edit, and long unbroken
names, titles and descriptions. The screenshots were then read by eye.

## Bugs fixed

| What was wrong | What a person sees now | Where | How it was verified |
|---|---|---|---|
| The server's default validator wording reached people: an empty recovery form said "Too small: expected string to have >=1 characters"; an over-long set title said "Too big: expected string to have <=80 characters". | Plain words everywhere: "Enter your username.", "Enter the recovery code you saved. It looks like ABCD-EFGH-JKLM-NPQR.", "Use at most 80 characters.", "This cannot be empty." A schema's own message is kept. The set editor still turns these into its own per-field messages. | `server/src/lib/validate.ts` (`plainMessage`), `server/src/modules/auth/routes.ts`, `web/src/features/sets/editor/validation.ts` | `server/test/validate.test.ts`, new case in `server/test/auth.test.ts`, new case in `web/src/features/sets/editor/editor.test.ts`; full server suite 197/197 |
| Sign up: the Create account button stayed disabled with no reason until both fields were filled; after a refused submit, focus stayed on the button and nothing was announced. A refusal for a field with no input on the form (such as account type) showed nothing at all. | The button always works. Missing fields say "Choose a username." / "Choose a password." under the field, and focus moves to the first field with an error, which is read out with it. Any other refusal is shown above the button. | `web/src/features/auth/SignUp.tsx`, `focusFirstInvalid` in `web/src/ui/primitives.tsx` | `e2e/pages.spec.ts` "sign-up and recovery errors..." |
| Recovery: an empty submit showed raw validator text, and focus was not moved to the problem. | Each empty field says what to enter, and focus goes to the first one. | `web/src/features/auth/Recover.tsx` | `e2e/pages.spec.ts` (same test) |
| Sign in from the header always went back to home, and "Create a free account" on the sign-in page dropped the page you came from; sign up ignored `next` entirely. | Signing in or up from any page comes back to that page. | `web/src/app/Shell.tsx`, `SignIn.tsx`, `SignUp.tsx` | `e2e/pages.spec.ts` "signing in from a page comes back to it..." |
| A signed-in player could open /signin or /signup and make a second account, which signed them out of the first. | Signed-in accounts are sent on to where they were going. Guests can still sign in or save their progress. | `SignIn.tsx`, `SignUp.tsx` | `e2e/pages.spec.ts` (same test) |
| `?next=//example.com` passed the check, so after signing in the app could be sent to another site. | Only a path on this site is followed; anything else goes home. | `web/src/features/auth/next.ts` | `web/src/features/auth/next.test.ts`; `e2e/pages.spec.ts` |
| When a session ended (signed out on another device, expired, signed out by staff), pages kept the old balance and name in the header and showed "That did not load" with a Try again that could never work. | The app checks who is signed in, says "You have been signed out. Sign in again to carry on." once, and every page switches to its signed-out view with Sign in and Create account. | `web/src/app/sessionExpiry.ts`, `web/src/app/App.tsx` | `e2e/pages.spec.ts` "a session that ends..." |
| Game Maker failed axe with a critical error: its tabs pointed at a panel that did not exist (`aria-valid-attr-value`). Creator Studio had the same pattern. | The list is the tab's panel; axe is clean. | `web/src/features/games/Games.tsx`, `web/src/features/studio/Studio.tsx` | crawler axe (night and day, 1366 and 390); `e2e/pages.spec.ts` "Game Maker tabs..." |
| Host, signed out, was a dead end: it said a guest account was fine but offered only Sign in. | Host as a guest (one tap), Sign in, or Create a free account, each coming back to Host. The same for Play solo. | `web/src/features/host/HostSetup.tsx` (`SignedOutHost`) | `e2e/pages.spec.ts` "a signed-out visitor can host straight away as a guest" |
| A teacher could set an assignment from a set with too few questions for its mode (for example a one-question set in Classic). It saved, but every student who pressed Play got an error. | The assignment is refused when it is made: "Classic needs at least 3 questions it can show. This set has 1. Choose another set or game mode." | `server/src/modules/classes/routes.ts` | new case in `server/test/social.test.ts` |
| On a phone, a class's student list was a five-column table in a sideways scroller; Sign-in help and Remove sat off the right edge with nothing to show they were there. | On phones each student is a card with their level, when they joined and were last seen, and the two buttons in reach. Wider screens keep the table. | `web/src/features/classes/ClassDetail.tsx` | `e2e/pages.spec.ts` "on a phone a teacher reaches sign-in help..." (button inside 360px) |
| A set description that was one long word pushed the set page 658px sideways on a phone. The same could happen with any typed name or title. | Long words break inside headings, paragraphs, list items, table cells and labels on every page. | `web/src/styles/app.css` (base `overflow-wrap`), `web/src/features/sets/SetDetail.tsx` | `e2e/pages.spec.ts` (four pages at 360px with 170-letter words); crawler overflow check |
| Question sets lost their filters when you opened a set and pressed Back (always page 1 of Everything); every keystroke in search sent a request; guests were offered "My sets" and "Make your first set", which they cannot use. | Scope, subject, search and page live in the address, so Back returns to the same list; search waits for a pause in typing; guests see only what they can use. An empty search offers "Clear the search". | `web/src/features/sets/Library.tsx` | `e2e/pages.spec.ts` "the library keeps its filters..." |
| When the home overview failed to load, the quests and Sparks cards kept pulsing placeholders for ever under the error. | One error notice, and each card says it will fill in once the overview loads. | `web/src/features/home/Dashboard.tsx` | `e2e/pages.spec.ts` "when the home overview cannot load..." |
| The featured Lantern in the Shop did not stretch to its row, so its Buy button floated halfway up next to taller cards. | Every card in a row is the same height, with Buy along the bottom. | `web/src/features/shop/Shop.tsx` | screenshot at 1366x768, before and after |
| Settings: the Change name and Change password buttons and the password fields sat at different heights (lined up with the hints rather than the fields). | Fields and their buttons line up. | `web/src/features/settings/Settings.tsx` | screenshot at 1366x768 |
| The New assignment dialog is long (sets, modes, details) and its buttons were only at the very end, below the fold on every screen. | Cancel and Create assignment stay at the foot of the dialog while it scrolls, as in the other dialogs. | `web/src/features/classes/AssignmentDialog.tsx` | screenshot at 390x844 |
| The set editor's Save button stayed gold while the bar said "All changes saved". | Gold while there is something to save, quiet once saved. | `web/src/features/sets/editor/Editor.tsx` | screenshot; `e2e/editor.spec.ts` and `e2e/ai-drafts.spec.ts` pass |
| Locker, signed out: a heading and a button with no explanation. Collection, Shop and Quests, signed out: Sign in only. | Each says what the page is for and offers Sign in or Create a free account, coming back to the page. | `Locker.tsx`, `Collection.tsx`, `Shop.tsx`, `Quests.tsx` | crawler screenshots and axe |

## Visual improvements

| What changed | What a person sees | Where | How it was verified |
|---|---|---|---|
| Landing page | After the hero, "A lesson in three steps" (pick questions and a game; students join with the 6-digit code, no accounts or email; play live, then the report), with homework through classes. The modes section now counts the modes from the server, links each kind of game (Quiz, Strategy, Arcade, Puzzle, Party, Study) to the catalogue already filtered, and shows eight modes chosen one of each kind first. A closing band: Host a game or Join a game. Every claim matches `docs/STATUS.md`; no numbers are invented (the mode count comes from the API). | `web/src/features/home/Landing.tsx` | screenshots at 390 and 1366, day, night and Hills Grammar; axe clean; `e2e/layout.spec.ts` |
| Home for teachers | "Your teaching": Host a game, Write a question set and Make a class (which opens the new-class form), the first three active classes with their join codes, and the last hosted game linking to its report. | `web/src/features/home/NextUp.tsx`, `Classes.tsx` (`?new=1`) | `e2e/pages.spec.ts` "home gives a teacher..." |
| Home for students | "From your teacher": assignments not yet played, soonest due first, each with Play; "You are all caught up" when there are none; and Join a class when they are not in one. | `web/src/features/home/NextUp.tsx` | `e2e/pages.spec.ts` (same test, axe clean, Play opens the game) |
| Empty states | A flat panel with the icon on a tile (or Glims where a collectible belongs, on the signed-out Collection), a larger heading, a sentence on what the thing is for, and the next step. No more dashed drop-zone outlines. Used by every empty state in the app. | `EmptyState` in `web/src/ui/primitives.tsx` | crawler screenshots, day and night; axe clean |
| Loading | Placeholders are now visible on white cards in the day theme; the mode catalogue and landing load with cards shaped like mode cards; home loads with the hero's stage and two cards instead of a lone spinner. | `web/src/styles/app.css` (`.skeleton`), `ModeCard.tsx` (`ModeCardSkeleton`), `Home.tsx` | slow-route screenshots (API delayed 2.5 s) |
| Game modes catalogue | A search box, the chosen kind in the address (`/modes?kind=party`, so Back keeps it and the landing can link to it), the kind's one-line description, and "No modes match" with a way back. | `web/src/features/modes/ModesPage.tsx` | `e2e/pages.spec.ts` "...the mode catalogue filters by kind and name" |

## Checked and left alone

- Focus is visible on every control (3px focus ring), and the tab order follows the page. The
  crawler's own ring detector gave false alarms; each was checked by hand.
- No console errors or failed requests on any page for any account, other than the expected 404
  for a private set opened by someone else and 403 for a student opening a teacher's report (both
  show a clear page).

## Not fixed

- The season garland (blossoms on a string) across the top of the home and landing heroes reads as
  the "string lights" `docs/DESIGN.md` rules out. It belongs to the season feature, not these pages,
  so it was left as it is.
- On a phone the header does not show your Sparks (it is hidden below 640px for room); the balance
  is on the home page and in the Shop.
- The assignment report's student table still scrolls sideways on a phone; it is a data table with
  many columns, and its rows have no actions.
- The New assignment dialog still lists sets that are too short for the chosen mode; the server now
  refuses them with a message that says why, but the list does not grey them out.
