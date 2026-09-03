# Delivery runbook — Lodgement Sprint (Phase 1)

Target: 5 business days from intake interview. Owner does the interview and the review call; the rest is generated and reviewed here.

## Day 0 — payment received
1. Log: `tools/funnel.py paid --name "<Provider>" --amount 1990 --offer "Lodgement Sprint" --channel <email|phone|fb|partner> --ref <stripe id>`.
2. Send the intake link (`site/intake.html`) and the pre-interview checklist (below). Book the 90-minute interview.
3. Ask for existing policies, service agreements, org chart, and any prior audit reports.

Pre-interview checklist for the client: ABN and legal name; key personnel list; each home's address, participants, roster model and who holds the tenancy; software used for rostering, notes, incidents; whether workers administer or prompt medication; any restrictive practices and behaviour support plans; worker screening status; last 12 months' incidents/complaints; portal application started?

## Day 1 — intake interview (owner) → intake JSON
- Follow `content/intake.example.json` field by field. Ask the "why" behind each answer: how incidents are actually reported at 2am on a sleepover shift, who really approves a roster change, what happens when a participant refuses medication.
- Write answers into `data/clients/<slug>/intake.json`. Anything unknown stays empty (renders as [TO CONFIRM]).

## Days 2–4 — generate, review, tailor
1. `python3 engine/render.py --intake data/clients/<slug>/intake.json --out build/<slug> --html`
2. Fix any ERROR lines (template bugs) before anything else.
3. Read every document against the interview notes. The engine tailors structure; the reviewer tailors substance: add the client's specific examples (named homes, actual escalation contacts, real software steps), remove anything that does not apply, and resolve every [TO CONFIRM] with the client by email.
4. Verify the SIL self-assessment guide (`sil-self-assessment-guide`) responses read as the provider's own voice and each names the evidence document.
5. Produce `build/<slug>/INDEX.md` (auto) and the audit-folder structure: copy documents into folders named by outcome code.
6. Quality gate before release (all must be true): no [TO CONFIRM] left unanswered; legislation references spot-checked; every home appears in emergency plan and safe-environment docs; service agreement contains the tenancy-separation clause; medication and restrictive-practice documents match the intake; document control tables filled (version 1.0, approved by the client's named director, dates).

## Day 5 — review call (owner) and hand-over
- Walk through: evidence index, the 5 most important policies (incident, complaints, safeguarding, medication/restrictive practices, service agreement/tenancy), the self-assessment drafts, and the 60-day portal plan.
- Client actions: read and approve documents; adopt them (signed document control); brief staff; start/complete the portal application; obtain auditor quotes.
- Send the final ZIP + INDEX + portal plan. Offer Phase 2.
- Log any feedback in `docs/research/07-customer-feedback.md` (what confused them, what they valued, what they asked for that we don't offer).

## 30 days — support to lodgement
- Answer questions by email within one business day. Track lodgement date and outcome in `data/clients/<slug>/status.json`.

# Phase 2 — Audit-Ready (outline)
Populate registers from the client's real records; per-home emergency plans and hazard inspections walked through on site or by video; every participant's service agreement checked for the tenancy split; staff briefing pack (one page per policy: what you must do, where to record it); auditor quotes (Commission list of Approved Quality Auditors); Stage 1 desktop evidence pack; corrective-action drafting after Stage 2.
