# Actions that need the owner (Scott) — nothing here has been done yet

Everything below is an external action, account, spend or binding agreement. I prepare it; you approve or do it. Status column is updated only when you confirm.

| # | Action | Why it is needed | Cost | Status |
|---|---|---|---|---|
| 1 | Create a Stripe account (sole trader/ABN or company) and create 4 Payment Links, then paste the URLs into `site/config.js` | Only way to take card payments | Free; 1.7% + A$0.30 per domestic card payment | not started |
| 2 | Enable GitHub Pages on this repo (Settings → Pages → Source: GitHub Actions) | Free hosting for the sales site from this repo | Free | not started |
| 3 | Buy a domain (optional at launch; a github.io URL works) | Trust; email sending identity | ~A$15–25/yr | not started |
| 4 | Choose the sending identity for outreach (your Gmail, or a Google Workspace mailbox on the domain) and connect it to the outreach tool I prepare | I cannot send email as you; Spam Act requires a real sender identity and working unsubscribe | Free (Gmail) or ~A$10/mo (Workspace) | not started |
| 5 | Confirm business identity for documents: trading name, ABN, contact phone, postal address | Required on service agreements, invoices and Spam Act sender identification | Free | not started |
| 6 | Approve the service agreement/terms and the disclaimers before the first sale | Binding agreement with customers | Free | not started |
| 7 | Join the target Facebook/LinkedIn groups and approve each post I draft | Community posting must come from a real person | Free | not started |
| 8 | Take sales calls (I will provide the call script, objection handling and a booking page link) | Customers of a A$2k+ service want to hear a human | Free | not started |
| 9 | (Optional, later) Professional indemnity insurance quote | Prudent for advisory/compliance work; not legally required | est. A$50–100/mo | not started |

Approval principle: no money is spent, no message is sent, no agreement is signed by me. I prepare everything to the point of one click or one signature.

## Stripe products to create (Payment Links, AUD, GST added as 10% tax rate, collect customer name, email, phone and business name)
| Product name | Price (ex GST) | config.js key |
|---|---|---|
| SIL Lodgement Sprint (Phase 1) | A$1,990 | stripeSprint |
| SIL Audit-Ready (Phase 2) | A$1,990 | stripeAuditReady |
| SIL Registration Bundle (Phases 1+2) | A$3,490 | stripeBundle |
| SIL Module Gap Analysis | A$1,490 | stripeGap |
Set each link's after-payment redirect to `https://<your-pages-url>/intake.html`.

## Site deployment
The workflow `.github/workflows/pages.yml` deploys the `site/` folder to GitHub Pages on push. It has already run and **failed at the `configure-pages` step because Pages is not enabled** — the Actions token cannot enable it. Once you enable Pages (Settings → Pages → Build and deployment → Source: GitHub Actions), re-run the latest workflow from the Actions tab or push any change to `site/`. The URL will be `https://justadev742.github.io/codespace/` until a custom domain is added. Until then, open `site/index.html` from the repo to preview.

## Booking and intake form
- Booking: create a free Calendly (or Google Calendar appointment schedule) with a 20-minute "SIL registration call" and paste the URL into `site/config.js` (`bookingUrl`).
- Intake form: create a free Formspree (or Tally/Getform) endpoint that accepts JSON POST and paste it into `formEndpoint`. Until then the form downloads `intake.json` and asks the client to email it — that still works.
