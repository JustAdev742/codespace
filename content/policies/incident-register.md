---
title: Incident Register
slug: incident-register
doc_type: register
standards: [core-1.5]
applies_if: "true"
version: 1.0
review_months: 12
---
{% set director = intake.governance.ceo_or_director | default('[TO CONFIRM]', true) %}
{% set quality_lead = intake.governance.quality_lead | default('[TO CONFIRM]', true) %}
{% set incident_officer = intake.governance.incident_officer | default('[TO CONFIRM]', true) %}
{% set whs_officer = intake.governance.whs_officer | default('[TO CONFIRM]', true) %}
{% set incident_software = intake.workforce.incident_software | default('[TO CONFIRM]', true) %}

# Incident Register

## Purpose

The Incident Register is {{ org.name }}'s single, complete record of every incident that occurs in connection with its supports, whether or not the incident is reportable to the NDIS Quality and Safeguards Commission. It lets {{ org.name }} show that every incident was recorded, assessed, reported where required, investigated and closed, and it is the data source for trend analysis under the Incident Management Policy and Procedure. It evidences NDIS Practice Standards Core Module outcome 1.5 and the incident management outcome.

## Scope

The register covers all homes supported by {{ org.name }} ({{ intake.homes | map(attribute='name') | join('; ') }}), community and transport settings, and incidents affecting participants, workers, visitors and property. Individual incident reports are completed in {{ incident_software }}; the register is maintained {% if incident_software != '[TO CONFIRM]' %}as the incident list in {{ incident_software }}, supplemented by the columns below where the platform does not capture them{% else %}in the format below{% endif %}, so that {{ incident_officer }} can see all incidents in one view.

## Policy statement

{{ org.name }} enters every incident in the register on the day it is reported, assigns a unique number, records the exact time key personnel became aware (because reportable incident timeframes run from that moment), and does not close an entry until corrective actions are complete. The register is kept for at least 7 years and is available to the Commission and to approved quality auditors on request. Identifying details of participants are recorded by participant ID, with names held in {{ incident_software }}, so that the register can be shared for analysis without disclosing identities.

## Roles and responsibilities

| Role | Responsibilities |
|---|---|
| Incident Officer — {{ incident_officer }} | Maintains the register; enters each incident on the day it is reported; records reportability decisions, Commission reference numbers and dates; assigns investigations; closes entries. |
| Director — {{ director }} | Reviews the register at least monthly and signs off closure of severity 3 and 4 incidents; reviews quarterly trend analysis. |
| Quality Lead — {{ quality_lead }} | Runs monthly trend analysis from the register; transfers systemic actions to the Continuous Improvement Register; audits register completeness quarterly. |
| WHS Officer — {{ whs_officer }} | Records WHS regulator notifications and worker injury follow-up against the relevant entries. |
| Support workers | Report incidents in {{ incident_software }} during the shift so the register is complete. |

## Procedure

1. On receiving an incident report, {{ incident_officer }} assigns the next incident number (format INC-YYYY-NNN) and creates the register entry.
2. Complete every column in the register structure below; enter "n/a" rather than leaving a cell blank so that gaps are visible.
3. Record the date and time key personnel became aware, the severity rating (1–4) under the Incident Management Policy, and whether the incident is reportable, WHS-notifiable or reported to police.
4. For reportable incidents, record the date and time of the immediate notification, the Commission reference number, the 5-business-day report date and any final report date.
5. Record the investigator, due date, findings, root cause and each corrective action with an owner and due date.
6. Update status (Open, Under investigation, Awaiting Commission, Actions in progress, Closed) at each change; the Director signs off closure of severity 3 and 4 entries.
7. Each month, {{ quality_lead }} completes the monthly summary table and reports it to the quality and safety review.

## Register structure

| Column | What is recorded |
|---|---|
| Incident number | INC-YYYY-NNN |
| Date and time of incident | When it occurred or was discovered |
| Date and time reported | When the worker reported it |
| Date and time key personnel aware | Start of the reportable incident timeframe |
| Home or location | Home name, community location, vehicle |
| Participant ID(s) affected | ID from {{ incident_software }}; "worker" or "visitor" if no participant |
| Other persons involved | Worker, co-resident, visitor, contractor, unknown |
| Incident type | Injury; illness; medication error; behaviour of concern; participant-to-participant; missing participant; alleged abuse, neglect or exploitation; sexual misconduct; restrictive practice; property or vehicle; fire or emergency; privacy breach; near miss; other |
| Description | Brief factual summary |
| Immediate actions | First aid, 000, separation, notifications made on the day |
| Injury or harm | None; first aid; medical treatment; hospital; serious injury; death; psychological distress |
| Severity rating | 1 Minor; 2 Moderate; 3 Major; 4 Critical |
| Reportable to Commission | Yes or No; category; 24-hour or 5-business-day |
| Commission notification | Date and time lodged; reference number; 5-day report date; final report date |
| WHS notifiable | Yes or No; regulator; date notified |
| Police notified | Yes or No; date; event number |
| Other notifications | Guardian, family, nominee, state safeguarding body, support coordinator, prescriber |
| Participant informed and supported | Date; by whom; open disclosure record reference |
| Worker stood down | Yes or No; date |
| Investigator and due date | Name; date |
| Findings and root cause | Summary |
| Corrective actions | Action; owner; due date; completed date |
| Continuous Improvement Register reference | CI-YYYY-NNN if systemic |
| Status | Open; Under investigation; Awaiting Commission; Actions in progress; Closed |
| Closed date and by whom | Date; name |

### Example entry (example — delete)

| Incident number | Date/time incident | Date/time aware | Home | Participant ID | Type | Description | Immediate actions | Harm | Severity | Reportable | Commission notification | WHS | Police | Participant informed | Investigator | Root cause | Corrective actions | Status |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| INC-2026-001 (example — delete) | 12 Aug 2026 08:15 | 12 Aug 2026 08:40 | {{ intake.homes[0].name if intake.homes else '[Home]' }} | P-003 | Medication error | Evening dose omitted; discovered at morning handover | Prescriber phoned; participant monitored; family informed with consent | None | 2 | No | n/a | No | No | 12 Aug 2026, support worker; open disclosure record OD-2026-001 | {{ incident_officer }}, due 26 Aug 2026 | Sign-off step missed at 20:00 shift change | Handover checklist amended; medication competency refresher for two workers by 30 Aug 2026 | Closed 25 Aug 2026 |

### Monthly summary (completed by the Quality Lead)

| Month | Total incidents | By home | By type (top three) | Severity 3–4 | Reportable notified | Notified within timeframe | Open at month end | Trends and actions |
|---|---|---|---|---|---|---|---|---|
| Aug 2026 (example — delete) | 3 | {{ intake.homes[0].name if intake.homes else '[Home]' }}: 2; {{ intake.homes[1].name if intake.homes | length > 1 else '[Home]' }}: 1 | Medication error 1; behaviour of concern 1; near miss 1 | 0 | 0 | n/a | 1 | Two evening-shift events; review 20:00 handover |

## Records kept

- The Incident Register (this document, or its equivalent in {{ incident_software }})
- Individual incident reports and attachments in {{ incident_software }}
- Commission Portal submissions and correspondence
- Monthly summaries and quarterly trend reports
- Retained for at least 7 years

## Related documents

- Incident Management Policy and Procedure (including reportable incidents)
- Open Disclosure Procedure
- Safeguarding Policy — Violence, Abuse, Neglect, Exploitation and Discrimination
- Continuous Improvement Register
- Risk Register
- Restrictive Practices records

## Legislation and standards references

- National Disability Insurance Scheme Act 2013 (Cth), sections 73Y and 73Z
- NDIS (Incident Management and Reportable Incidents) Rules 2018 (record-keeping requirements for incidents)
- NDIS (Provider Registration and Practice Standards) Rules 2018 — NDIS Practice Standards, Core Module outcome 1.5 and the incident management outcome
- NDIS Practice Standards, SIL supplementary module (registration group 0138, 2026), safeguarding outcome
- Privacy Act 1988 (Cth)
{% if 'NSW' in org.states %}
- Work Health and Safety Act 2011 (NSW) (records of notifiable incidents kept at least 5 years)
{% endif %}
{% if 'QLD' in org.states %}
- Work Health and Safety Act 2011 (Qld)
{% endif %}
{% if 'VIC' in org.states %}
- Occupational Health and Safety Act 2004 (Vic)
{% endif %}
{% if 'SA' in org.states %}
- Work Health and Safety Act 2012 (SA)
{% endif %}
{% if 'WA' in org.states %}
- Work Health and Safety Act 2020 (WA)
{% endif %}
{% if 'TAS' in org.states %}
- Work Health and Safety Act 2012 (Tas)
{% endif %}
{% if 'ACT' in org.states %}
- Work Health and Safety Act 2011 (ACT)
{% endif %}
{% if 'NT' in org.states %}
- Work Health and Safety (National Uniform Legislation) Act 2011 (NT)
{% endif %}

## Review

The register format is reviewed every 12 months by the Incident Officer ({{ incident_officer }}) with the Incident Management Policy, and approved by the Director ({{ director }}). The register itself is reviewed monthly (Quality Lead) and quarterly (Director).

## Document control

| Version | Drafted | Approved by | Approval date | Next review |
|---|---|---|---|---|
| 1.0 | {{ intake.meta.generated_on | date }} | {{ director }} | [TO CONFIRM on adoption] | 12 months after approval |
