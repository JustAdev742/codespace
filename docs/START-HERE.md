# Start here — from zero to the first paid sprint in 48 hours

Everything below is prepared. Only you can do these steps; each is one sitting.

## Hour 0–1: make it possible to get paid and booked
1. Stripe: create the account and the four Payment Links listed in `docs/OWNER-ACTIONS.md`; set the after-payment redirect to the intake page; paste the four URLs into `site/config.js`.
2. Booking: create a free 20-minute "SIL registration call" appointment page (Calendly or Google Calendar) and paste it into `site/config.js` (`bookingUrl`).
3. Identity: fill `brand`, `legalName`, `abn`, `phone`, `email` in `site/config.js`. Commit and push (or edit on GitHub).
4. GitHub Pages: Settings → Pages → Source: GitHub Actions; then Actions → re-run the "Deploy site to GitHub Pages" workflow. Confirm the site loads at the Pages URL.

## Hour 1–3: build the first prospect list (target 60 names)
5. Follow `outreach/prospecting-playbook.md`: Google Maps searches per metro + MyCareSpace; put name, phone, website, suburb, state into a CSV; `python3 tools/prospects.py add yourfile.csv`.
6. Verify each on the NDIS Commission Provider Register; mark status with `tools/prospects.py mark`. Only `unregistered` providers delivering SIL get the Phase 1 pitch.

## Hour 3–8: sell
7. Calls first (`outreach/phone-script.md`): 20 calls. Every call is logged with `tools/funnel.py lead|stage`.
8. Emails (`outreach/emails-sil-providers.md`): 30 personalised emails from your own mailbox, with the unsubscribe line.
9. Partners (`outreach/emails-partners.md`): 10 plan managers / support coordinators / SDA providers.
10. Post the value post from `outreach/posts.md` in two NDIS provider Facebook groups and on LinkedIn.

## When someone says yes
11. Send the Stripe link; on payment run `tools/funnel.py paid ...` and send `outreach/client-welcome.md`.
12. Run the intake interview with `docs/INTERVIEW-GUIDE.md`; save `data/clients/<slug>/intake.json`.
13. Hand the intake JSON to me: I render, review and tailor the set (`docs/DELIVERY-RUNBOOK.md`), you do the Day 5 review call.

## Every day until 1 October
20 calls · 30 emails · 10 partner emails · review the funnel in `docs/DASHBOARD.md` · if fewer than 3 conversations per 100 contacts after two days, tell me and we change the opener; if no sale by 20 September we switch the primary offer per `docs/DECISION.md`.
