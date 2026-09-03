---
title: Complaints and Feedback Register
slug: complaints-register
doc_type: register
standards: [core-2.5]
applies_if: "true"
version: 1.0
review_months: 12
---
{% set director = intake.governance.ceo_or_director | default('[TO CONFIRM]', true) %}
{% set quality_lead = intake.governance.quality_lead | default('[TO CONFIRM]', true) %}
{% set complaints_officer = intake.governance.complaints_officer | default('[TO CONFIRM]', true) %}
{% set incident_officer = intake.governance.incident_officer | default('[TO CONFIRM]', true) %}

# Complaints and Feedback Register

## Purpose

The Complaints and Feedback Register is {{ org.name }}'s record of every complaint, compliment and item of feedback it receives, how each was handled, how long it took and what changed as a result. It shows that {{ org.name }} meets the record-keeping requirements of the NDIS (Complaints Management and Resolution) Rules 2018 and evidences NDIS Practice Standards Core Module outcome 2.5.

## Scope

The register covers complaints and feedback about any home ({{ intake.homes | map(attribute='name') | join('; ') }}), any worker or key personnel, any support, and the handling of earlier complaints, from any person, including anonymous complaints and complaints referred by the NDIS Quality and Safeguards Commission. It is maintained by {{ complaints_officer }} in a spreadsheet or {{ intake.workforce.notes_software | default('[TO CONFIRM]', true) }} (if the platform has a complaints module) held in the secure administration drive, with the detailed complaint file held separately.

## Policy statement

Every complaint is entered on the day it is received, whether it is spoken, written, anonymous or raised through behaviour, and whether or not it is upheld. Feedback and compliments are entered so that {{ org.name }} sees the whole picture. The register records the participant affected by participant ID, and the complainant's identity is visible only to the Complaints Officer and the Director. Entries are not deleted; corrections are made as a new line. The register is kept for at least 7 years and made available to the Commission and to approved quality auditors on request.

## Roles and responsibilities

| Role | Responsibilities |
|---|---|
| Complaints Officer — {{ complaints_officer }} | Maintains the register; enters complaints on the day received; updates each step and date; records outcomes, root causes and actions; produces the monthly summary. |
| Director — {{ director }} | Reviews the register monthly, and quarterly for trends; records escalation reviews; is the entry point for complaints about the Complaints Officer. |
| Quality Lead — {{ quality_lead }} | Transfers systemic actions to the Continuous Improvement Register; audits the register quarterly for completeness and timeliness against the standards in the Complaints and Feedback Policy. |
| Incident Officer — {{ incident_officer }} | Records the incident number against any complaint that disclosed an incident. |
| Support workers | Pass on complaints and feedback the same day so they can be registered. |

## Procedure

1. Assign the next number (CMP-YYYY-NNN for complaints; FBK-YYYY-NNN for feedback and compliments) and create the entry on the day received.
2. Complete the columns in the register structure below; write "anonymous" where the complainant did not give their name and "n/a" where a column does not apply.
3. Record the date of each step (acknowledged, plan agreed, updates given, outcome given, closed) so that timeliness can be measured against the 2-day, 5-day, 21-day and 45-day standards.
4. Record whether the complaint was referred to the Incident Officer, the Privacy Officer or the Director, and any Commission reference.
5. Record the outcome (upheld, partly upheld, not upheld, withdrawn, resolved by agreement), the remedy and the root cause.
6. Record systemic actions with a Continuous Improvement Register reference.
7. Each month {{ complaints_officer }} completes the monthly summary and reports it to the quality and safety review; each quarter the Director reviews trends and signs the summary.

## Register structure

| Column | What is recorded |
|---|---|
| Number | CMP-YYYY-NNN or FBK-YYYY-NNN |
| Type | Complaint; feedback; compliment; suggestion |
| Date received | Date |
| How received | In person; phone; email; website; letter; advocate; household meeting; feedback form; Commission referral; anonymous |
| Complainant | Name and relationship (participant, family, guardian, worker, other), or "anonymous" |
| Participant affected (ID) | Participant ID, or "none" |
| Home or service area | Home name, community, transport, administration |
| Summary of issues | Brief factual summary in the complainant's words where possible |
| Support needs | Interpreter, advocate, Easy Read, communication aid |
| Referred to | Incident Officer (incident number); Privacy Officer; Director; none |
| Reportable incident | Yes or No; Commission reference |
| Date acknowledged | Date and format |
| Date handling plan agreed | Date |
| Complexity | Straightforward; complex |
| Handled by | Name |
| Updates given | Dates |
| Date outcome given | Date and format |
| Outcome | Upheld; partly upheld; not upheld; resolved by agreement; withdrawn |
| Remedy and actions | Apology, roster change, repair, refund, training, disciplinary action (general terms), plan change |
| Escalated to Director | Yes or No; date; result |
| Referred to or received from NDIS Commission | Yes or No; reference; outcome |
| Root cause | Summary |
| Continuous Improvement Register reference | CI-YYYY-NNN |
| Days to resolve | Calendar days |
| Within standard | Yes or No |
| Status | Open; awaiting information; escalated; closed |
| Closed date | Date |

### Example entries (example — delete)

| Number | Type | Date received | How received | Complainant | Participant | Home | Summary | Referred to | Date acknowledged | Handled by | Date outcome | Outcome | Remedy and actions | Root cause | CI ref | Days | Within standard | Status |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| CMP-2026-001 (example — delete) | Complaint | 4 Aug 2026 | Phone (mother) | Parent | P-002 | {{ intake.homes[0].name if intake.homes else '[Home]' }} | Different worker every evening; participant unsettled | None | 5 Aug 2026 (phone) | {{ complaints_officer }} | 15 Aug 2026 (letter and phone) | Upheld | Apology; two regular evening workers rostered; roster reviewed monthly with participant | Casual pool used for evening shifts without continuity rule | CI-2026-004 | 11 | Yes | Closed 15 Aug 2026 |
| FBK-2026-003 (example — delete) | Compliment | 20 Aug 2026 | Household meeting | Participant | P-001 | {{ intake.homes[0].name if intake.homes else '[Home]' }} | Enjoyed cooking night; wants it weekly | None | n/a | {{ quality_lead }} | n/a | n/a | Weekly cooking night added to household plan | n/a | n/a | n/a | n/a | Closed |

### Monthly summary (completed by the Complaints Officer)

| Month | Complaints received | Feedback and compliments | By home | Top issues | Acknowledged within 2 days | Resolved within standard | Escalated | Referred to Commission | Open at month end | Trends and actions |
|---|---|---|---|---|---|---|---|---|---|---|
| Aug 2026 (example — delete) | 1 | 2 | {{ intake.homes[0].name if intake.homes else '[Home]' }}: 1 | Worker continuity | 1 of 1 | 1 of 1 | 0 | 0 | 0 | Continuity rule added to rostering procedure |

## Records kept

- The Complaints and Feedback Register (retained at least 7 years)
- Complaint files (correspondence, statements, findings, outcome letters)
- Monthly summaries and quarterly trend reviews signed by the Director
- Continuous Improvement Register entries

## Related documents

- Complaints and Feedback Policy and Procedure
- Incident Register
- Continuous Improvement Register
- Privacy and Confidentiality Policy
- Participant Rights Statement

## Legislation and standards references

- National Disability Insurance Scheme Act 2013 (Cth)
- NDIS (Complaints Management and Resolution) Rules 2018 (records of complaints)
- NDIS (Provider Registration and Practice Standards) Rules 2018 — NDIS Practice Standards, Core Module outcome 2.5
- NDIS Practice Standards, SIL supplementary module (registration group 0138, 2026)
- Privacy Act 1988 (Cth)

## Review

The register format is reviewed every 12 months by the Complaints Officer ({{ complaints_officer }}) with the Complaints and Feedback Policy and approved by the Director ({{ director }}). The register content is reviewed monthly (Complaints Officer) and quarterly (Director).

## Document control

| Version | Drafted | Approved by | Approval date | Next review |
|---|---|---|---|---|
| 1.0 | {{ intake.meta.generated_on | date }} | {{ director }} | [TO CONFIRM on adoption] | 12 months after approval |
