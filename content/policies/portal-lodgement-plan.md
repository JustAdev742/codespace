---
title: 60-Day Portal Lodgement Plan
slug: portal-lodgement-plan
doc_type: plan
standards: [core-2.1]
applies_if: "true"
version: 1.0
review_months: 1
---
# 60-Day Portal Lodgement Plan

## Purpose
This plan sets out how {{ org.name }} will lodge a valid application for registration under registration group 0138 (Assistance with supported independent living){% if intake.registration.groups | length > 1 %} and {{ intake.registration.groups | reject('equalto', '0138') | join(', ') }}{% endif %} in the NDIS Commission Applications Portal, and progress to a certification audit. Target lodgement date: **{{ intake.registration.target_lodgement_date | date }}**. An application must be completed within 60 days of being started in the portal.

## Scope
Applies to {{ intake.governance.ceo_or_director | default('[TO CONFIRM]', true) }} as the applicant's authorised person and to {{ intake.governance.quality_lead | default('[TO CONFIRM]', true) }} as the application coordinator. It covers {{ intake.homes | length }} SIL home(s): {% for h in intake.homes %}{{ h.name }} ({{ h.state }}){% if not loop.last %}, {% endif %}{% endfor %}.

## Roles and responsibilities
| Role | Responsibilities |
|---|---|
| {{ intake.governance.ceo_or_director | default('[TO CONFIRM]', true) }} | Holds the PRODA account linked to the organisation; approves and submits the application; signs key personnel declarations; approves each policy in this set. |
| {{ intake.governance.quality_lead | default('[TO CONFIRM]', true) }} | Coordinates the self-assessment responses, uploads evidence, tracks portal deadlines, liaises with the auditor. |
| Key personnel ({% for k in intake.key_personnel %}{{ k.name }}, {{ k.role }}{% if not loop.last %}; {% endif %}{% endfor %}) | Complete suitability declarations and provide identity information within 5 business days of request. |

## Procedure
1. **Days 1–2 — Access.** Confirm PRODA accounts for {{ intake.governance.ceo_or_director | default('[TO CONFIRM]', true) }} and {{ intake.governance.quality_lead | default('[TO CONFIRM]', true) }}; link the organisation (ABN {{ org.abn }}) in the NDIS Commission Applications Portal; confirm myID/RAM access is in place before 30 September 2026 when PRODA is removed from the Commission portal.
2. **Day 3 — Start the application.** Select "New application to be registered as an NDIS provider"; enter organisation details, contact details and key personnel; select registration groups {{ intake.registration.groups | join(', ') }}. Record the portal start date here: [DATE]. The 60-day completion clock starts now.
3. **Days 3–7 — Self-assessment.** For each applicable outcome of the Core Module and the SIL supplementary module, paste and adapt the draft responses in the SIL Self-Assessment Guide, attach the evidence documents named for that outcome, and answer honestly where a system is still being implemented (state the implementation date rather than claiming completion).
4. **Days 7–10 — Key personnel suitability.** Each key person completes the suitability questions; {{ intake.governance.ceo_or_director | default('[TO CONFIRM]', true) }} reviews for accuracy. False or misleading statements attract civil and criminal penalties.
5. **Day 10 — Internal review.** {{ intake.governance.quality_lead | default('[TO CONFIRM]', true) }} and {{ intake.governance.ceo_or_director | default('[TO CONFIRM]', true) }} read every response and every attachment against the policy set. Every [TO CONFIRM] must be resolved before submission.
6. **By {{ intake.registration.target_lodgement_date | date }} — Submit.** Submit the application; save the confirmation and application ID to the registration folder; diarise the Commission's initial scope of audit.
7. **Within 5 business days of the scope of audit — Auditor.** Request quotes from at least two Approved Quality Auditors from the Commission's list{% if intake.registration.auditor_chosen %} (preferred: {{ intake.registration.auditor_chosen }}){% endif %}; accept a quote; agree Stage 1 (desktop) and Stage 2 (on-site) dates. Auditors are currently booked 6–8 weeks ahead.
8. **Before Stage 1.** Populate registers with real data for the last 12 months; brief all workers using the Staff Briefing Pack; confirm each home's emergency plan and hazard inspection is current; confirm every participant has a service agreement separate from any tenancy agreement.
9. **Stage 2 and after.** Support participant and worker interviews; receive the audit report; draft corrective actions for any non-conformities within the auditor's timeframe; respond to any Commission requests for information.

## Records kept
- Portal start date, application ID, submission confirmation (registration folder).
- Auditor quotes, engagement letter and audit dates.
- This plan, updated weekly by {{ intake.governance.quality_lead | default('[TO CONFIRM]', true) }} until registration is decided.

## Related documents
SIL Self-Assessment Guide · Evidence Checklist and Index · Governance Framework · Staff Briefing Pack.

## Legislation and standards references
NDIS Act 2013; NDIS (Provider Registration and Practice Standards) Rules 2018 (as amended 2026, registration group 0138); NDIS Practice Standards Core Module and SIL supplementary module; NDIS Commission transitional arrangements for SIL providers (application to be lodged by 1 October 2026).

## Review
Reviewed weekly by {{ intake.governance.quality_lead | default('[TO CONFIRM]', true) }} until the registration decision, then retired to the registration folder.

## Document control
| Version | Approved by | Approval date | Next review |
|---|---|---|---|
| 1.0 | {{ intake.governance.ceo_or_director | default('[TO CONFIRM]', true) }} | {{ intake.meta.generated_on | date }} | Weekly |
