---
title: Quality and Continuous Improvement Policy, Internal Audit Procedure and Continuous Improvement Register
slug: quality-continuous-improvement
doc_type: policy
standards: [core-2.3, sil-3]
applies_if: "true"
version: 1.0
review_months: 12
---
{% set gov = intake.governance %}{% set wf = intake.workforce %}{% set sup = intake.supports %}{% set reg = intake.registration %}{% set hist = intake.history %}
{% set director = gov.ceo_or_director | default('[TO CONFIRM]', true) %}{% set quality_lead = gov.quality_lead | default('[TO CONFIRM]', true) %}{% set complaints_officer = gov.complaints_officer | default('[TO CONFIRM]', true) %}{% set incident_officer = gov.incident_officer | default('[TO CONFIRM]', true) %}{% set rostering_manager = gov.rostering_manager | default('[TO CONFIRM]', true) %}{% set whs_officer = gov.whs_officer | default('[TO CONFIRM]', true) %}
{% set notes_software = wf.notes_software | default('[TO CONFIRM]', true) %}{% set incident_software = wf.incident_software | default('[TO CONFIRM]', true) %}{% set rostering_software = wf.rostering_software | default('[TO CONFIRM]', true) %}{% set training_platform = wf.training_platform | default('[TO CONFIRM]', true) %}
{% set governing_body = 'the Board' if gov.has_board else 'the Director' %}
# Quality and Continuous Improvement Policy, Internal Audit Procedure and Continuous Improvement Register

## Purpose

This document describes {{ org.name }}'s quality management system: how it checks that supports are delivered as its policies and participants' plans say they will be, how it finds and fixes problems, and how it uses what participants, workers, incidents, complaints and audits tell it to improve. It evidences NDIS Practice Standards Core Module outcome 2.3 (Quality management) and the SIL supplementary module practice governance outcome.

## Scope

This document applies to all {{ org.name }} services, homes, systems and workers, and to {{ governing_body }} in its oversight role. It covers internal audits, self-assessment against the NDIS Practice Standards, external certification audits (the initial registration audit, the mid-term audit and renewal audits conducted by an Approved Quality Auditor), and the Continuous Improvement Register. {{ org.name }} has been operating for {{ hist.years_operating | default('[TO CONFIRM]', true) }} year{% if hist.years_operating != 1 %}s{% endif %}, {% if hist.previous_audit %}has been audited before{% else %}has not previously undergone an NDIS certification audit{% endif %}, and {% if hist.existing_policies %}is replacing or updating its existing policies with this document set{% else %}is establishing its first documented quality system{% endif %}.

## Policy statement

- **Plan, do, check, act.** Every policy says what {{ org.name }} will do; records show what it did; audits check the two match; improvements close the gap. The cycle runs continuously, not only before an external audit.
- **Participants define quality.** The measure of quality is whether each participant is safe, receives the supports in their plan in the way they want, and would say so. Participant feedback is sought at every plan review, through house meetings and an annual survey, and is reported alongside audit results.
- **Workers are part of the system.** Workers are asked what gets in the way of good support, and improvement actions are shared at all-staff meetings so people see that raising issues leads to change.
- **Evidence-based.** Improvement priorities come from data: incidents in {{ incident_software }}, complaints, restrictive practice records, audit findings, roster consistency in {{ rostering_software }}, training currency in {{ training_platform }}, and participant outcomes in {{ notes_software }}.
- **Non-conformities are closed, not filed.** Every audit finding, complaint outcome and incident recommendation becomes an entry in the Continuous Improvement Register with an owner, a due date and a check that the action worked.
- **External audit readiness is continuous.** {{ org.name }} keeps its evidence organised against each Practice Standards outcome so that the Approved Quality Auditor ({{ reg.auditor_chosen | default('[TO CONFIRM]', true) }}) can be shown current policies and records at any time.

## Roles and responsibilities

| Role | Responsibilities under this document |
|---|---|
| {{ governing_body }} | Approves the annual internal audit program; reviews quarterly quality reports; ensures improvement actions are resourced. |
| Director — {{ director }} | Accountable for the quality system; approves corrective actions with cost or policy implications; signs off audit readiness before Stage 1 and Stage 2 of certification; approves closure of major non-conformities. |
| Quality Lead — {{ quality_lead }} | Owns this document; runs the internal audit program; maintains the Continuous Improvement Register; prepares the self-assessment; coordinates the external audit; reports quarterly. |
| Rostering Manager — {{ rostering_manager }} | Implements improvements in homes and rosters; supplies roster consistency data; supports house audits. |
| Incident Officer — {{ incident_officer }}; Complaints Officer — {{ complaints_officer }}; WHS Officer — {{ whs_officer }} | Refer systemic findings from their registers to the Continuous Improvement Register; provide trend reports. |
| House leaders | Complete monthly house self-checks; implement actions; collect participant feedback. |
| All workers | Follow procedures; suggest improvements; take part in audits and surveys. |

## Procedure

### Part A — Internal audit

1. Each year {{ quality_lead }} prepares an internal audit program covering every applicable outcome of the Core Module and the SIL supplementary module at least once, weighted toward areas with recent incidents ({{ hist.incidents_last_12m | default('[TO CONFIRM]', true) }} in the last 12 months), complaints ({{ hist.complaints_last_12m | default('[TO CONFIRM]', true) }}) and high-rated risks. {{ governing_body }} approves the program.
2. Audits are conducted by a person who does not manage the area audited; where {{ org.name }}'s size makes that impossible, {{ director }} audits {{ quality_lead }}'s areas or an external consultant is engaged.
3. Each audit uses a checklist drawn from the relevant quality indicators, samples records (participant files, {{ notes_software }} notes, {{ incident_software }} reports, rosters, training and screening registers), observes practice in the home, and interviews at least one participant and one worker.
4. Findings are classified as conforming, observation, minor non-conformity or major non-conformity, using the same definitions an Approved Quality Auditor applies.
5. The audit report is given to the area owner within 5 business days; every non-conformity is entered in the Continuous Improvement Register with a corrective action, owner and due date (major within 30 days, minor within 90 days).
6. {{ quality_lead }} verifies that each action has been completed and has worked before closing the entry, and reports results to the quarterly quality and safety review.
7. Before lodging the registration application (target {{ reg.target_lodgement_date | date }}) and again before each external audit, {{ quality_lead }} completes a full self-assessment against every applicable outcome in the NDIS Commission Applications Portal format, attaching evidence, and {{ director }} signs it off.

### Annual internal audit schedule

| Timing | Audit area | Method | Auditor |
|---|---|---|---|
| Monthly | Incident, complaint{% if sup.restrictive_practices != 'none' %}, restrictive practice{% endif %}{% if sup.medication_involvement != 'none' %} and medication chart{% endif %} records; worker screening and training currency | Register review; sample of records | {{ quality_lead }} |
| Monthly | House self-check: environment, hazards, emergency equipment, information display, participant feedback | Checklist in each home | House leader |
| Quarterly | Participant files: support plans, service agreements, consent, risk assessments, housing agreements held separately | Sample of files across homes | {{ quality_lead }} |
| Quarterly | Roster consistency, handover and progress note quality | {{ rostering_software }} and {{ notes_software }} reports; observation | {{ rostering_manager }} |
| Half-yearly | Rights outcomes (1.1 to 1.5) and SIL supported decision-making | Participant interviews; observation in each home | {{ quality_lead }} |
| Half-yearly | Governance, risk, information and financial management (2.1 to 2.5) | Document and register review | {{ director }} |
| Annually | Full self-assessment against Core and SIL modules; participant and worker surveys | Portal format self-assessment; surveys | {{ quality_lead }} |

### Part B — Continuous improvement

1. Improvement opportunities are captured from any source: audit findings, incident and complaint outcomes, participant and family feedback, house meetings, worker suggestions, supervision, WHS inspections, Commission guidance and changes in law.
2. {{ quality_lead }} enters each opportunity in the Continuous Improvement Register within 5 business days, identifies the root cause (using the five-whys or a similar method for significant items), and agrees the action, owner and due date with the relevant manager.
3. Actions that change a policy, procedure or template go through the policy approval process in the Governance and Operational Management Framework; actions that change a participant's supports go through the support planning process with the participant.
4. Owners report progress at the monthly management meeting; overdue actions are escalated to {{ director }}.
5. When an action is complete, {{ quality_lead }} checks its effectiveness (for example by re-auditing, reviewing incident trends or asking participants) before recording it as closed.
6. Trends across the register are analysed quarterly and reported to {{ governing_body }}, and a summary of improvements made is shared with participants and workers annually.

## Continuous Improvement Register

| Column | What is recorded |
|---|---|
| Reference | CI-YYYY-NNN |
| Date raised | Date |
| Source | Internal audit; external audit; incident; complaint; feedback; house meeting; worker suggestion; risk review; legal change |
| Source reference | Incident, complaint or audit number |
| Standard | Outcome code (for example core-2.3, sil-3) |
| Issue and root cause | Plain description |
| Action | What will change |
| Owner and due date | Named role; date |
| Status | Open; in progress; completed; verified and closed |
| Effectiveness check | How and when effectiveness was verified; result |
| Closed date | Date |

| Reference | Date raised | Source | Source ref | Standard | Issue and root cause | Action | Owner and due date | Status | Effectiveness check | Closed |
|---|---|---|---|---|---|---|---|---|---|---|
| CI-2026-001 (example — delete) | {{ intake.meta.generated_on | date }} | Internal audit | IA-2026-02 | core-3.2 | 2 of 6 sampled support plans overdue for review; no reminder set in {{ notes_software }} | Set review-date alerts in {{ notes_software }}; add plan currency to monthly compliance report | {{ rostering_manager }}; 30 days | In progress | Re-audit of all plans in 90 days | — |

## Records kept

- Annual internal audit program, audit checklists, reports and evidence samples
- Continuous Improvement Register (retained at least 7 years)
- Self-assessments and evidence submitted to the NDIS Commission Applications Portal
- External audit reports, corrective action plans and the certificate of registration
- Participant and worker survey results; quarterly quality reports and {{ governing_body }} minutes

## Related documents

- Governance and Operational Management Framework
- Risk Management Policy and Framework
- Incident Management Policy and Procedure; Complaints and Feedback Policy and Procedure
- Evidence Checklist — Core Module and SIL Module
- Practice Governance and Workforce Consistency Policy
- Information Management and Records Policy

## Legislation and standards references

- National Disability Insurance Scheme Act 2013 (Cth)
- NDIS (Provider Registration and Practice Standards) Rules 2018 — NDIS Practice Standards, Core Module outcome 2.3 Quality management
- NDIS Practice Standards, SIL supplementary module (registration group 0138, 2026), practice governance outcome
- NDIS (Quality Indicators) Guidelines 2018
- NDIS (Approved Quality Auditors Scheme) Guidelines 2018
- NDIS (Code of Conduct) Rules 2018 — the NDIS Code of Conduct

## Review

Reviewed every 12 months by the Quality Lead ({{ quality_lead }}) and approved by {{ governing_body }}; reviewed earlier after each external audit and whenever the Practice Standards or quality indicators change.

## Document control

| Version | Drafted | Approved by | Approval date | Next review |
|---|---|---|---|---|
| 1.0 | {{ intake.meta.generated_on | date }} | {{ director }} | [TO CONFIRM on adoption] | 12 months after approval |
