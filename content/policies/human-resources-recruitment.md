---
title: Human Resources and Recruitment Policy and Procedure
slug: human-resources-recruitment
doc_type: policy
standards: [core-2.6, sil-3]
applies_if: "true"
version: 1.0
review_months: 12
---
{% set gov = intake.governance %}{% set wf = intake.workforce %}{% set sup = intake.supports %}
{% set director = gov.ceo_or_director | default('[TO CONFIRM]', true) %}{% set quality_lead = gov.quality_lead | default('[TO CONFIRM]', true) %}{% set rostering_manager = gov.rostering_manager | default('[TO CONFIRM]', true) %}{% set whs_officer = gov.whs_officer | default('[TO CONFIRM]', true) %}
{% set rostering_software = wf.rostering_software | default('[TO CONFIRM]', true) %}{% set training_platform = wf.training_platform | default('[TO CONFIRM]', true) %}
# Human Resources and Recruitment Policy and Procedure

## Purpose

This policy sets out how {{ org.name }} recruits, engages and manages the people who deliver Supported Independent Living (SIL) supports in its {{ intake.homes | length }} home{% if intake.homes | length != 1 %}s{% endif %}. It exists so that every participant is supported by workers who are safe, competent, properly screened and matched to the participant's needs, and so that {{ org.name }} can show an auditor a complete, lawful employment record for every worker from first contact to separation.

## Scope

This policy applies to every person who performs work for {{ org.name }} in any capacity: {{ wf.employment_types | join(', ') | default('[TO CONFIRM employment types]', true) }} workers, key personnel, students on placement, volunteers and any person engaged through a labour hire agency or as an independent contractor. It covers workforce planning, position descriptions, recruitment and selection, pre-employment checks, engagement, probation, changes of role and separation. Worker screening, induction, supervision and grievance and disciplinary matters are dealt with in the related documents listed below and are only summarised here.

## Policy statement

{{ org.name }} will:

- Recruit on merit, using documented selection criteria drawn from a current position description for every role.
- Complete every pre-employment check listed in this policy before a worker performs any risk assessed role, including an NDIS Worker Screening clearance verified through the NDIS Worker Screening Database, identity, right to work, qualifications, referee checks and, where the role involves driving participants, a licence and vehicle check.
- Apply exactly the same verification standard to agency and contractor workers as to employees. No agency or contract worker starts a shift in any {{ org.name }} home until {{ rostering_manager }} has verified and recorded the same checks.
- Employ workers under the Fair Work Act 2009 (Cth), the National Employment Standards and the Social, Community, Home Care and Disability Services Industry Award 2010 (SCHADS Award), or under a lawful enterprise agreement, and pay correctly for shift work, sleepovers, active nights, broken shifts and overtime.
- Plan the workforce for each home around the roster of care so that participants have consistent workers. {{ org.name }} currently engages approximately {{ wf.headcount | default('[TO CONFIRM]', true) }} workers across its homes.
- Not discriminate on any ground protected by the Disability Discrimination Act 1992 (Cth), the Age Discrimination Act 2004 (Cth), the Sex Discrimination Act 1984 (Cth), the Racial Discrimination Act 1975 (Cth) or state anti-discrimination law, and actively welcome applicants with lived experience of disability and applicants from Aboriginal and Torres Strait Islander and culturally and linguistically diverse backgrounds.
- Involve participants in recruitment where they choose to be involved, for example by contributing questions, sitting on an interview panel or meeting a shortlisted candidate before an offer.
- Keep a complete personnel file for every worker for at least 7 years after the worker leaves.
- Require every worker to read, sign and comply with the NDIS Code of Conduct as a condition of engagement.

## Roles and responsibilities

| Role | Responsibilities |
|---|---|
| {{ director }} | Approves vacancies, position descriptions, employment contracts and remuneration; signs off that all pre-employment checks are complete before any offer becomes unconditional. |
| {{ quality_lead }} | Owns this policy; audits personnel files twice a year; ensures position descriptions reflect the NDIS Practice Standards and the SIL supplementary module. |
| {{ rostering_manager }} | Runs recruitment campaigns; conducts and records pre-employment checks; sets up new workers in {{ rostering_software }}; verifies agency and contractor workers before their first shift. |
| {{ whs_officer }} | Confirms that role-specific health and safety requirements (manual handling, working alone, sleepovers) are included in position descriptions and pre-employment information. |
| House leaders / senior support workers | Participate in interview panels; identify participant preferences for worker attributes; provide input to probation reviews. |
| All workers | Provide accurate information during recruitment; notify {{ rostering_manager }} immediately of any change affecting their clearance, right to work, licence or ability to perform the role. |

## Procedure

### Part A — Workforce planning and position descriptions

1. {{ rostering_manager }} reviews the roster of care for each home at least quarterly and whenever a participant enters or leaves, and identifies vacancies, skill gaps (for example medication competency{% if sup.mealtime_management %}, mealtime management{% endif %}{% if sup.high_intensity %}, high intensity supports{% endif %}) and worker attributes requested by participants (gender, language, cultural background, interests).
2. Every role has a written position description using the template in this policy. {{ quality_lead }} reviews position descriptions annually and whenever the NDIS Practice Standards or the participant group changes.
3. {{ director }} approves each vacancy and the employment type (permanent, part-time, casual, fixed term, agency or contractor) before advertising.

### Part B — Recruitment and selection

1. {{ rostering_manager }} prepares an advertisement based on the position description that states the mandatory requirements: NDIS Worker Screening clearance (or willingness to apply before commencement), NDIS Worker Orientation Module, first aid, relevant qualification or experience, and any driver licence requirement.
2. Applications are shortlisted against the selection criteria by at least two people, one of whom is {{ rostering_manager }} or {{ quality_lead }}.
3. Interviews use a structured question set that includes values-based and scenario questions on the NDIS Code of Conduct, supported decision-making, responding to an incident, privacy, and safe practice on sleepovers or overnight shifts. Participants who wish to take part are supported to contribute questions or join the panel.
4. Interview notes and scores are recorded for every candidate and kept on the recruitment file.
5. {{ rostering_manager }} contacts at least two referees for the preferred candidate, at least one of whom is a recent direct supervisor. Reference checks ask specifically about conduct toward people with disability, reliability and any disciplinary history. Notes are kept on file.
6. Before any offer is made, the pre-employment checks in Part C are completed and recorded on the Pre-employment Checklist.
7. {{ director }} approves a written offer and contract that states the employment type, classification under the SCHADS Award or enterprise agreement, ordinary hours, the homes the worker may be rostered to, probation period, and the requirement to comply with {{ org.name }} policies and the NDIS Code of Conduct.
8. On acceptance, {{ rostering_manager }} creates the worker in {{ rostering_software }}, records clearance and training expiry dates, and books induction under the Induction, Training and Competency Policy.
9. Probation is 6 months for permanent and part-time workers. {{ rostering_manager }} or the house leader completes a probation review at 3 months and 6 months using the Supervision Record; {{ director }} confirms the outcome in writing.

### Part C — Pre-employment checks (mandatory before first shift)

1. **Identity**: 100 points of identification sighted; copies kept.
2. **Right to work**: Australian or New Zealand citizenship, permanent residency, or a visa with work rights confirmed through the Department of Home Affairs Visa Entitlement Verification Online (VEVO) service; visa expiry recorded and tracked.
3. **NDIS Worker Screening clearance**: current clearance verified in the NDIS Worker Screening Database and the worker linked to {{ org.name }}, in accordance with the Worker Screening Policy and Procedure. A worker with a pending application may only commence where the Worker Screening Policy permits.
4. **Working with Children Check**: required where the role involves supports to a participant under 18 or the home includes a child; recorded with expiry date.
5. **Qualifications**: certificates sighted and verified (for example Certificate III in Individual Support CHC33021, Certificate IV in Disability Support CHC43121, HLTAID011 Provide First Aid, HLTHPS006 Assist clients with medication where applicable).
6. **NDIS Worker Orientation Module** ("Quality, Safety and You") certificate sighted or completed during induction before the first unsupervised shift.
7. **Driver licence and vehicle** ({% if sup.transport %}applies — {{ org.name }} provides transport to participants{% else %}only where the role involves driving participants{% endif %}): licence class and expiry, driving history where the role is primarily driving, and evidence of registration and comprehensive insurance for any private vehicle used.
8. **Health and capacity**: the worker confirms in writing that they can perform the inherent requirements of the role as stated in the position description, including manual handling and overnight work where rostered; reasonable adjustments are discussed and recorded.
9. **Declarations**: signed NDIS Code of Conduct acknowledgment, conflict of interest declaration, confidentiality undertaking and consent to ongoing screening monitoring.

### Part D — Agency and contractor workers (parity requirement)

1. {{ org.name }} only engages agency workers from agencies that have signed a written agreement confirming they complete the Part C checks and will provide evidence on request.
2. Before the first shift, {{ rostering_manager }} obtains and records the worker's name, NDIS Worker Screening clearance number and expiry (verified in the NDIS Worker Screening Database), first aid status, Worker Orientation Module completion and any medication competency, and enters the worker in the Worker Screening Register marked "agency" or "contractor".
3. Independent contractors must hold their own clearance, provide an ABN, insurance certificates and evidence of the same qualifications required of employees, and sign the NDIS Code of Conduct acknowledgment. Contractors do not perform risk assessed roles without a clearance verified by {{ org.name }}.
4. Agency and contractor workers receive the participant-specific orientation and shift handover required by the Induction, Training and Competency Policy before working alone with a participant.
5. Agency and contractor workers are subject to the same supervision, incident reporting, complaints and disciplinary requirements as employees; conduct concerns are raised with the agency in writing and recorded.

### Part E — Changes of role and separation

1. A change of role, home or hours is approved by {{ director }} and recorded in {{ rostering_software }}; any new checks required by the new role are completed first.
2. On resignation, end of contract or termination, {{ rostering_manager }}: removes the worker's access to {{ rostering_software }}{% if wf.notes_software and wf.notes_software != wf.rostering_software %}, {{ wf.notes_software }}{% endif %}{% if wf.incident_software and wf.incident_software != wf.rostering_software and wf.incident_software != wf.notes_software %} and {{ wf.incident_software }}{% endif %} on the last day; collects keys, swipe cards, phones and participant records; delinks the worker in the NDIS Worker Screening Database; arranges final pay and entitlements; updates the Worker Screening Register and Training Register; and offers an exit interview.
3. Participants are told in advance, in a way they understand, when a regular worker is leaving and who will replace them, consistent with the Practice Governance and Workforce Consistency Policy.
4. Where a worker leaves during an investigation, the investigation is completed and the outcome recorded; where conduct meets the threshold, {{ director }} notifies the relevant worker screening unit and the NDIS Quality and Safeguards Commission.

## Templates

### Position description template

| Field | Content |
|---|---|
| Position title | Disability Support Worker — SIL (example — delete) |
| Reports to | House leader / {{ rostering_manager }} |
| Employment type and classification | Permanent part-time, SCHADS Award Social and Community Services Employee Level 2 (example — delete) |
| Homes | {% for home in intake.homes %}{{ home.name }}{% if not loop.last %}; {% endif %}{% endfor %} |
| Purpose of role | Deliver person-centred daily living support in the participant's home consistent with their support plan and the NDIS Practice Standards |
| Key responsibilities | Support daily routines chosen by participants; supported decision-making; medication support at the level authorised; progress notes and shift handover; incident and hazard reporting; household tasks with participants; community access |
| Inherent requirements | Manual handling; overnight sleepover or active night shifts as rostered; driving where required |
| Mandatory checks | NDIS Worker Screening clearance; NDIS Worker Orientation Module; HLTAID011 First Aid; right to work; 100 points ID |
| Desirable | CHC33021 Certificate III in Individual Support; HLTHPS006 Assist clients with medication; experience with positive behaviour support |
| Key performance indicators | Completion of induction and competency assessments; supervision attendance; participant feedback; note quality; incident reporting timeliness |
| Approved by / date | {{ director }} / [TO CONFIRM] |

### Pre-employment checklist template

| Check | Evidence sighted | Reference or expiry | Checked by | Date | Status |
|---|---|---|---|---|---|
| 100 points identity | Passport, driver licence (example — delete) | n/a | {{ rostering_manager }} | [date] | Complete |
| Right to work (VEVO where applicable) | | | | | |
| NDIS Worker Screening clearance verified in NWSD | | | | | |
| Working with Children Check (if required) | | | | | |
| Qualifications and first aid | | | | | |
| NDIS Worker Orientation Module | | | | | |
| Referee 1 / Referee 2 | | | | | |
| Driver licence and vehicle (if driving) | | | | | |
| Code of Conduct, confidentiality, conflict of interest signed | | | | | |

## Records kept

- Recruitment file for each vacancy: advertisement, applications, interview notes and scores, reference check notes (kept 2 years for unsuccessful candidates, then destroyed).
- Personnel file for each worker: position description, contract, Pre-employment Checklist and copies of evidence, declarations, probation reviews, changes of role, separation record (kept 7 years after separation).
- Worker Screening Register and Training Register (maintained under the related policies).
- Agency agreements and contractor engagement records.
- Worker profile and access history in {{ rostering_software }}.

## Related documents

- worker-screening
- induction-training-competency
- supervision-performance
- grievance-disciplinary
- practice-governance-workforce-consistency
- whs-work-health-safety
- privacy-confidentiality
- conflicts-of-interest
- incident-management

## Legislation and standards references

- National Disability Insurance Scheme Act 2013 (Cth)
- NDIS (Provider Registration and Practice Standards) Rules 2018 — Core Module outcome 2.6 Human resource management; SIL supplementary module outcome 3 (practice governance and workforce)
- NDIS (Practice Standards—Worker Screening) Rules 2018
- NDIS Code of Conduct (NDIS (Code of Conduct) Rules 2018)
- Fair Work Act 2009 (Cth) and the National Employment Standards; Social, Community, Home Care and Disability Services Industry Award 2010
- Privacy Act 1988 (Cth) and the Australian Privacy Principles
- Disability Discrimination Act 1992 (Cth) and other Commonwealth and state anti-discrimination legislation
- Migration Act 1958 (Cth) (right to work)
{% for state in org.states %}- Work health and safety legislation of {{ state }} as cited in the Work Health and Safety Policy
{% endfor %}

## Review

This policy is reviewed every 12 months, or earlier after a change in the NDIS Practice Standards, the SCHADS Award, a worker screening rule change, or a significant recruitment-related incident or complaint. Review owner: {{ quality_lead }}. Approval: {{ director }}.

## Document control

| Version | Approved by | Approval date | Next review |
|---|---|---|---|
| 1.0 | {{ director }} | [TO CONFIRM] | [TO CONFIRM — 12 months after approval] |
