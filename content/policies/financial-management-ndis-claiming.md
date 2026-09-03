---
title: Financial Management, NDIS Billing and Claiming, and Fraud and Corruption Prevention Policy
slug: financial-management-ndis-claiming
doc_type: policy
standards: [core-2.5, core-2.1]
applies_if: "true"
version: 1.0
review_months: 12
---
{% set gov = intake.governance %}{% set wf = intake.workforce %}{% set sup = intake.supports %}
{% set director = gov.ceo_or_director | default('[TO CONFIRM]', true) %}{% set quality_lead = gov.quality_lead | default('[TO CONFIRM]', true) %}{% set rostering_manager = gov.rostering_manager | default('[TO CONFIRM]', true) %}{% set incident_officer = gov.incident_officer | default('[TO CONFIRM]', true) %}
{% set rostering_software = wf.rostering_software | default('[TO CONFIRM]', true) %}{% set notes_software = wf.notes_software | default('[TO CONFIRM]', true) %}
{% set governing_body = 'the Board' if gov.has_board else 'the Director' %}
# Financial Management, NDIS Billing and Claiming, and Fraud and Corruption Prevention Policy

## Purpose
This policy sets out how {{ org.name }} manages its finances so that it stays solvent, claims NDIS funding only for supports actually delivered and at or below the applicable price limits, keeps participants' money separate from its own, and prevents, detects and responds to fraud and corruption. It evidences the financial management requirements of NDIS Practice Standards Core Module outcome 2.1 (Governance and operational management) and the financial elements of outcome 2.5.

## Scope
This policy applies to {{ governing_body }}, key personnel and every worker or contractor who prepares rosters, records shifts, raises invoices, lodges payment requests, approves expenditure or handles money, across all {{ intake.homes | length }} home{% if intake.homes | length != 1 %}s{% endif %}, for NDIA-managed, plan-managed and self-managed participants and {{ org.name }}'s own finances. Participants' personal money is covered by the Participant Money and Property Policy{% if not sup.participant_money_handling %} (which records that {{ org.name }} does not currently handle participant money){% endif %}.

## Policy statement
- **Solvency.** {{ governing_body }} approves an annual budget and cash-flow forecast, receives monthly financial reports, and keeps a cash reserve of at least [TO CONFIRM] weeks of wages so supports continue if NDIS payments are delayed.
- **Separation of duties.** No single person can create a payee, approve a payment and release it, or roster a shift, record it as delivered and claim it; where size limits separation, {{ director }} performs the second check and the external accountant reviews transactions quarterly.
- **Claim only what was delivered,** in the quantity and at the ratio delivered, using the support items and price limits in the NDIS Pricing Arrangements and Price Limits in force on the date of delivery and in accordance with the participant's SIL Service Agreement.
- **Participants' money is separate.** Rent, board, food, utilities and other living costs are not funded through SIL and are never invoiced as NDIS supports. Any participant money {{ org.name }} handles is kept in the participant's name, separate from organisational accounts, with two-person checks and receipts.
- **Transparency.** Every participant (or their plan manager or nominee) receives a plain-language statement of what has been claimed against their plan at least monthly or with each invoice.
- **Zero tolerance of fraud and corruption.** Over-claiming, claiming for supports not delivered, falsifying shift records, secret commissions, misuse of participant money or NDIS funds, and bribery are reported to the NDIA, the NDIS Commission and the police, and the money is recovered.
- **Insurance, tax and wages.** {{ org.name }} holds the insurance required as a condition of registration (public liability, professional indemnity, workers compensation); meets withholding, superannuation guarantee and GST obligations (NDIS supports are GST-free where the GST law's conditions are met); and pays workers under the SCHADS Award or an applicable enterprise agreement.

## Roles and responsibilities
| Role | Responsibilities under this document |
|---|---|
| {{ governing_body }} | Approves budget, delegations and this policy; reviews monthly financial reports and claiming reconciliations; receives fraud reports. |
| Director — {{ director }} | Accountable for financial management; second approver on payments and weekly claims; signs bank, tax, insurance and NDIA documents; decides fraud responses. |
| Rostering Manager — {{ rostering_manager }} | Builds rosters in {{ rostering_software }} from each roster of care; confirms shifts worked; prepares the weekly claim file; reconciles remittances. |
| Quality Lead — {{ quality_lead }} | Keeps service agreements and price schedules current; audits a sample of claims monthly against {{ notes_software }} notes and shift records. |
| Incident Officer — {{ incident_officer }}; external accountant | Records financial abuse of a participant as an incident; maintains the ledger, payroll and BAS, reviews transactions quarterly and prepares annual financial statements. |
| House leaders and workers | Clock on and off accurately; record supports delivered; never claim, invoice or handle participant money outside policy; report suspected fraud. |

## Financial delegations
| Transaction | Prepared by | Approved by | Limit or condition |
|---|---|---|---|
| Annual budget and cash-flow forecast | {{ director }} with the external accountant | {{ governing_body }} | Before 1 July |
| Operating payments within budget | {{ rostering_manager }} or {{ quality_lead }} | {{ director }} | Up to $[TO CONFIRM] per transaction; two approvers above |
| Payments outside budget, capital items, leases and contracts | {{ director }} | {{ governing_body }} | Any amount |
| Payroll | {{ rostering_manager }} confirms hours against {{ rostering_software }} | {{ director }} | Fortnightly; award compliance checked |
| New payee or change of bank details | {{ rostering_manager }} | {{ director }} after phone verification with the payee | Every time |
| NDIS payment requests and invoices | {{ rostering_manager }} | {{ director }} or {{ quality_lead }} as second person | Weekly; only after shift reconciliation |
| Credits, refunds, repayments and write-offs | {{ rostering_manager }} | {{ director }} (write-offs: {{ governing_body }}) | Within 10 business days of finding an error |
| Household petty cash | House leader | {{ rostering_manager }} | Float up to $[TO CONFIRM]; receipts; reconciled weekly |
| Participant money and property | Per the Participant Money and Property Policy | Two-person control | Never mixed with organisational funds |

## Procedure

### Part A — NDIS billing and claiming for SIL supports
1. Before supports begin, {{ quality_lead }} confirms the participant's SIL funding, the roster of care in the plan, how the plan is managed, and that Schedules 1 and 2 of the SIL Service Agreement (supports, roster of care and prices) match the current Pricing Arrangements; for participants on the NDIA's PACE system, {{ org.name }} confirms it is recorded as one of the participant's providers.
2. {{ rostering_manager }} builds the roster in {{ rostering_software }} to deliver the roster of care, including shared-support ratios and the overnight arrangement; workers clock on and off each shift and record supports delivered in {{ notes_software }}. A shift without a clock-on and a progress note is not claimable until verified.
3. Each week {{ rostering_manager }} reconciles shifts worked against each participant's roster of care, records variations (absence, hospital admission, additional one-to-one support, cancellations) and applies the Pricing Arrangements rules for absences, cancellations and irregular SIL supports.
4. The claim file lists, per participant and day, the support item, quantity or hours, ratio and unit price (never above the price limit), and is checked line by line by {{ director }} or {{ quality_lead }}.
5. Claims are lodged in the myplace provider portal for NDIA-managed participants; itemised invoices with the same detail go to the plan manager or the self-managed participant at the frequency in their service agreement.
6. {{ rostering_manager }} reconciles remittances within 5 business days, corrects and resubmits rejected lines, and escalates items unresolved after 30 days to {{ director }}. Where a claim was made in error, {{ org.name }} tells the participant or plan manager, submits the correction or repayment within 10 business days, and records the error and cause in the Claims Error Log; repeated or deliberate errors go to Part B.
7. Monthly, {{ quality_lead }} audits a sample of claims against shift records and progress notes and {{ director }} reviews plan utilisation, unclaimed supports and aged receivables. On each Pricing Arrangements release (normally 1 July) {{ quality_lead }} updates price schedules and tells every participant in writing before new prices apply. Claiming evidence is kept for 7 years.

### Part B — Fraud and corruption prevention and response
1. **Prevention.** Fraud risks are assessed annually in the Risk Register; separation of duties and the delegations above apply; system access follows the Information Management and Records Policy; workers are trained at induction and annually on this policy, the NDIS Code of Conduct and the Whistleblower Protection Policy; gifts are declared under the Conflicts of Interest Policy; no worker is rewarded by reference to the value of claims.
2. **Detection.** Monthly claim audits; comparison of claims with rosters and clock-on data and of payroll with rosters; participant statements; analysis of unusual patterns (claims on hospital days, ratios that do not match the home, duplicate lines).
3. **Reporting and preservation.** Suspected fraud or corruption is reported to {{ director }} or under the Whistleblower Protection Policy (where the Director is implicated, to {% if gov.has_board %}the Chair of the Board{% else %}the external accountant or directly to the NDIA{% endif %}); {{ director }} secures records and logs and restricts the access of any person under suspicion.
4. **Assessment and external reporting.** Within 5 business days {{ director }} decides whether the matter is an error, a policy breach or suspected fraud and appoints an investigator. Suspected fraud against the NDIS is reported to the NDIA's fraud reporting service, harm to a participant to the NDIS Commission under the Incident Management Policy, and criminal conduct to the police.
5. **Recovery and learning.** Overpayments are repaid, losses recovered where possible, the participant supported under the Open Disclosure Procedure, and control weaknesses recorded in the Continuous Improvement Register.

## Records kept
- Approved budgets, monthly financial reports and {{ governing_body }} minutes
- Rosters, clock-on data and shift reconciliations in {{ rostering_software }}; progress notes in {{ notes_software }}
- Weekly claim files, portal submissions, invoices, remittances and reconciliations; Claims Error Log; monthly claim audits; price schedules by edition
- Payroll, superannuation, BAS and insurance records; annual financial statements
- Fraud risk assessments, reports, investigation files and referrals

## Related documents

- SIL Service Agreement Template (Schedules 1 and 2)
- Participant Money and Property Policy
- Governance and Operational Management Framework (delegations)
- Conflicts of Interest Policy, Procedure and Register
- Whistleblower Protection Policy
- Information Management and Records Policy
- Shift Handover and Progress Notes Procedure
- Human Resources and Recruitment Policy and Procedure

## Legislation and standards references
- National Disability Insurance Scheme Act 2013 (Cth)
- NDIS (Provider Registration and Practice Standards) Rules 2018 — NDIS Practice Standards, Core Module outcome 2.1 (financial management) and conditions of registration
- NDIS Pricing Arrangements and Price Limits (current edition) — SIL support items, roster of care, absences and cancellations, record-keeping
- NDIS (Code of Conduct) Rules 2018; Criminal Code Act 1995 (Cth), Part 7.3 (fraudulent conduct)
- A New Tax System (Goods and Services Tax) Act 1999 (Cth), section 38-38 (GST-free NDIS supports)
- Superannuation Guarantee (Administration) Act 1992 (Cth); Fair Work Act 2009 (Cth); Social, Community, Home Care and Disability Services Industry Award 2010
{% if org.entity_type == 'company' %}
- Corporations Act 2001 (Cth), sections 180 to 184 (directors' duties), 286 (financial records) and 588G (insolvent trading)
{% endif %}
- Competition and Consumer Act 2010 (Cth), Schedule 2 (Australian Consumer Law)

## Review

Reviewed every 12 months by the Director ({{ director }}) with the external accountant and approved by {{ governing_body }}; reviewed earlier on each release of the NDIS Pricing Arrangements and Price Limits, after any claiming error requiring repayment, and after any fraud investigation.

## Document control

| Version | Drafted | Approved by | Approval date | Next review |
|---|---|---|---|---|
| 1.0 | {{ intake.meta.generated_on | date }} | {{ director }} | [TO CONFIRM on adoption] | 12 months after approval |
