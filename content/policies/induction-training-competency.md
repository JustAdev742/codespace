---
title: Induction, Training and Competency Policy
slug: induction-training-competency
doc_type: policy
standards: [core-2.6, sil-3]
applies_if: "true"
version: 1.0
review_months: 12
---
{% set gov = intake.governance %}{% set wf = intake.workforce %}{% set sup = intake.supports %}
{% set director = gov.ceo_or_director | default('[TO CONFIRM]', true) %}{% set quality_lead = gov.quality_lead | default('[TO CONFIRM]', true) %}{% set rostering_manager = gov.rostering_manager | default('[TO CONFIRM]', true) %}{% set whs_officer = gov.whs_officer | default('[TO CONFIRM]', true) %}
{% set rostering_software = wf.rostering_software | default('[TO CONFIRM]', true) %}{% set notes_software = wf.notes_software | default('[TO CONFIRM]', true) %}{% set incident_software = wf.incident_software | default('[TO CONFIRM]', true) %}{% set training_platform = wf.training_platform | default('[TO CONFIRM]', true) %}
# Induction, Training and Competency Policy

## Purpose

This policy describes how {{ org.name }} inducts every new worker, orients them to each participant and home before they work alone, trains them for the supports they deliver, assesses their competency and keeps that competency current. It gives effect to Core Module outcome 2.6 (human resource management) and SIL supplementary module outcome 3 (a competent workforce that delivers consistent practice across shifts and homes).

## Scope

This policy applies to every worker of {{ org.name }} — {{ wf.employment_types | join(', ') | default('[TO CONFIRM employment types]', true) }} — including key personnel, agency and contract workers, students and volunteers, across all {{ intake.homes | length }} home{% if intake.homes | length != 1 %}s{% endif %}: {% for home in intake.homes %}{{ home.name }} ({{ home.address | default('[TO CONFIRM address]', true) }}){% if not loop.last %}; {% endif %}{% endfor %}.

## Policy statement

- Every worker completes organisational induction before their first shift and participant-specific orientation for each participant and home before working alone with that participant.
- Mandatory training before working unsupervised: the NDIS Worker Orientation Module "Quality, Safety and You"; the NDIS Code of Conduct; {{ org.name }} induction covering rights, privacy, incident and complaints reporting, restrictive practices awareness, infection control, manual handling and emergency procedures for each home; and infection control.
- First aid: {% if wf.first_aid_all %}every worker holds a current HLTAID011 Provide First Aid certificate (including CPR refreshed annually) as a condition of engagement{% else %}{{ org.name }} rosters at least one worker holding a current HLTAID011 Provide First Aid certificate on every shift in every home, and the CPR component is refreshed annually. New workers obtain HLTAID011 within 3 months of starting. [TO CONFIRM: whether {{ org.name }} will move to first aid for all workers]{% endif %}.
- Medication: {% if sup.medication_involvement == 'administer' %}workers who administer medication complete HLTHPS006 Assist clients with medication or equivalent, then a supervised practical assessment against the Medication Competency Checklist before they administer medication alone, reassessed annually{% elif sup.medication_involvement == 'prompt' %}workers who prompt or remind participants about self-administered medication complete {{ org.name }}'s medication awareness module and are assessed against the prompting section of the Medication Competency Checklist; they do not administer medication{% else %}{{ org.name }} does not currently provide medication support. If a participant's needs change, workers are trained and assessed under the Medication Management Policy before any involvement begins{% endif %}.
{% if sup.mealtime_management %}- Mealtime management: workers supporting participants with a mealtime management plan complete the NDIS Commission module "Supporting safe and enjoyable meals", are trained in the participant's plan by the practitioner or a trained senior worker, and are observed preparing texture-modified food and supporting a meal before working alone.
{% endif %}{% if sup.restrictive_practices != 'none' or sup.behaviour_support_plans %}- Behaviour support: workers supporting a participant who has a behaviour support plan are trained in that plan by the behaviour support practitioner or a trained senior worker, including any regulated restrictive practice, before implementing it, and complete the NDIS Commission restrictive practices eLearning.
{% endif %}{% if sup.high_intensity %}- High intensity supports: workers delivering high intensity daily personal activities are trained and assessed against the NDIS Commission High Intensity Support Skills Descriptors by a suitably qualified health practitioner before delivering that support.
{% endif %}{% if sup.transport %}- Transport: workers who drive participants complete a vehicle and safe transport induction, including wheelchair restraint use where relevant.
{% endif %}- Refresher cycle: Code of Conduct, incident reporting, safeguarding and manual handling annually; first aid every 3 years with CPR annually; medication competency annually; emergency drills per home at least every 6 months; NDIS Commission modules "Supporting effective communication" and "Supporting safe and enjoyable meals" on commencement and when updated.
- Competency is assessed by observation of practice, not only by certificates. A worker who is not yet competent in a task is not rostered to perform it alone.
- Training is recorded in the Training Register maintained through {{ training_platform }}{% if training_platform != rostering_software %} and mirrored in {{ rostering_software }} so that expiry blocks rostering{% endif %}.

## Roles and responsibilities

| Role | Responsibilities |
|---|---|
| {{ director }} | Approves the annual training plan and budget; approves this policy. |
| {{ quality_lead }} | Owns this policy; designs the induction program; reviews the Training Register monthly; reports overdue training to {{ director }}. |
| {{ rostering_manager }} | Books induction; ensures workers are not rostered alone until sign-off; sets expiry alerts in {{ rostering_software }}; verifies agency worker training before the first shift. |
| {{ whs_officer }} | Delivers or arranges manual handling, emergency and infection control training and per-home emergency drills. |
| House leaders / senior support workers | Deliver participant-specific orientation; complete buddy shifts; sign competency observations; escalate skill gaps. |
| Behaviour support practitioners, nurses, speech pathologists and other clinicians | Train workers in participant-specific plans and sign the participant-specific orientation record. |
| All workers | Complete required training on time; participate in observation; keep certificates current; ask for training when unsure. |

## Procedure

### Part A — Organisational induction (before first shift)

1. {{ rostering_manager }} enrols the worker in {{ training_platform }} and sends the induction pack: this policy, the NDIS Code of Conduct, the Participant Rights Statement, the Privacy and Confidentiality Policy, the Incident Management Policy and the Work Health and Safety Policy.
2. The worker completes the NDIS Worker Orientation Module and uploads the certificate.
3. {{ quality_lead }} or a delegate delivers a face-to-face or video induction session covering the Induction Checklist items and the software used at {{ org.name }} ({{ rostering_software }} for rostering{% if notes_software != rostering_software %}, {{ notes_software }} for progress notes{% endif %}{% if incident_software != rostering_software and incident_software != notes_software %}, {{ incident_software }} for incidents{% endif %}).
4. The worker signs the Induction Checklist. {{ rostering_manager }} files it and updates the Training Register.

### Part B — Participant-specific and home-specific orientation (before working alone)

1. For each home the worker will be rostered to, the house leader walks the worker through the home: emergency evacuation plan and assembly point, first aid kit, fire equipment, keys and security, medication storage, hazard log, kitchen and food safety, sleepover or overnight arrangements and the house routines chosen by participants.
2. For each participant, the house leader introduces the worker to the participant (with the participant's agreement), reviews the participant's support plan, communication profile, health plan, mealtime plan, behaviour support plan and any restrictive practice authorisation, and records the participant's preferences for how they like to be supported.
3. The worker completes at least 2 buddy shifts with an experienced worker per home (more where the house leader or participant asks), including at least one shift of the type they will be rostered to (for example a sleepover at a sleepover home).
4. The house leader observes the worker performing key tasks with the participant (personal care, meal support, medication, use of equipment, communication) and signs the participant-specific section of the Induction Checklist.
5. Only after sign-off does {{ rostering_manager }} release the worker for unsupervised shifts in {{ rostering_software }} for that home.
6. Agency and contract workers receive at minimum the home orientation, the participant summaries and a handover from the outgoing worker; they are paired with a {{ org.name }} worker wherever practicable and are not rostered alone on overnight shifts on their first shift in a home.

### Part C — Competency assessment and refresher training

1. {{ quality_lead }} maintains a training matrix listing each role, each mandatory and participant-specific competency and its refresher interval.
2. Competency observations are completed by a house leader or clinician using the relevant checklist (for example the Medication Competency Checklist) and filed against the worker.
3. {{ rostering_software }} expiry alerts are reviewed monthly by {{ rostering_manager }}; workers are notified 60 days before expiry; a worker whose mandatory training has lapsed is not rostered for that task until renewed.
4. Learning from incidents, complaints, audits and supervision is fed into the training plan at the quarterly quality meeting.

## Templates

### Induction checklist template

| Item | Completed (date) | Worker initials | Inducting person |
|---|---|---|---|
| NDIS Worker Orientation Module certificate uploaded | (example — delete) 01/07/2026 | AE | {{ quality_lead }} |
| NDIS Code of Conduct read and signed | | | |
| Participant Rights Statement, person-centred supports and supported decision-making | | | |
| Privacy, confidentiality and consent | | | |
| Incident management and reportable incidents (24 hours / 5 business days), using {{ incident_software }} | | | |
| Complaints and feedback, whistleblower protections | | | |
| Safeguarding: recognising and responding to violence, abuse, neglect, exploitation and discrimination | | | |
| Restrictive practices: the five regulated practices and what to do if one is used | | | |
| Work health and safety, hazard reporting, manual handling, working alone and overnight shifts | | | |
| Infection control and waste management | | | |
| Emergency and disaster procedures | | | |
| Progress notes and shift handover standards using {{ notes_software }} | | | |
| Rostering, timesheets and availability in {{ rostering_software }} | | | |
| Medication policy and level of involvement ({{ sup.medication_involvement | default('[TO CONFIRM]', true) }}) | | | |
| Participant money and property rules | | | |
| Home orientation completed — home: [name] | | | |
| Participant-specific orientation completed — participant: [initials] | | | |
| Buddy shifts completed (dates) | | | |
| Observed competent and released for unsupervised shifts | | | |

### Training register template

| Worker | Role | Home(s) | Training item | Provider / platform | Completed | Expires | Evidence held | Competency observed by | Observation date |
|---|---|---|---|---|---|---|---|---|---|
| A. Example (example — delete) | Support worker | {{ intake.homes[0].name | default('[home]') }} | HLTAID011 Provide First Aid | RTO name | 01/07/2026 | 01/07/2029 | Certificate | House leader | 15/07/2026 |

## Records kept

- Signed Induction Checklists (one per worker, plus participant-specific sections per home).
- Training Register in {{ training_platform }} with certificates attached.
- Competency observation records and Medication Competency Checklists.
- Annual training plan and training matrix.
- Emergency drill records per home.
- Agency worker orientation records.

## Related documents

- human-resources-recruitment
- worker-screening
- supervision-performance
- practice-governance-workforce-consistency
- medication-management
- mealtime-management
- restrictive-practices-behaviour-support
- whs-work-health-safety
- emergency-disaster-management
- shift-handover-progress-notes

## Legislation and standards references

- National Disability Insurance Scheme Act 2013 (Cth)
- NDIS (Provider Registration and Practice Standards) Rules 2018 — Core Module outcome 2.6; SIL supplementary module outcome 3
- NDIS Code of Conduct
- NDIS (Restrictive Practices and Behaviour Support) Rules 2018
- NDIS (Incident Management and Reportable Incidents) Rules 2018
- NDIS Commission High Intensity Support Skills Descriptors (where high intensity supports are delivered)
- NDIS Commission Worker Orientation Module "Quality, Safety and You" and eLearning modules "Supporting effective communication" and "Supporting safe and enjoyable meals"
{% for state in org.states %}- Work health and safety legislation of {{ state }} (training and instruction duties) as cited in the Work Health and Safety Policy
{% endfor %}

## Review

This policy is reviewed every 12 months and whenever a new support type, home or participant need requires new competencies. Review owner: {{ quality_lead }}. Approval: {{ director }}.

## Document control

| Version | Approved by | Approval date | Next review |
|---|---|---|---|
| 1.0 | {{ director }} | [TO CONFIRM] | [TO CONFIRM — 12 months after approval] |
