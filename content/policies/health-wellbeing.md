---
title: Health and Wellbeing Policy
slug: health-wellbeing
doc_type: policy
standards: [core-3.4, sil-2]
applies_if: "true"
version: 1.0
review_months: 12
---
{% set gov = intake.governance %}{% set wf = intake.workforce %}{% set sup = intake.supports %}
{% set director = gov.ceo_or_director | default('[TO CONFIRM]', true) %}{% set quality_lead = gov.quality_lead | default('[TO CONFIRM]', true) %}{% set incident_officer = gov.incident_officer | default('[TO CONFIRM]', true) %}{% set rostering_manager = gov.rostering_manager | default('[TO CONFIRM]', true) %}{% set privacy_officer = gov.privacy_officer | default('[TO CONFIRM]', true) %}
{% set notes_software = wf.notes_software | default('[TO CONFIRM]', true) %}{% set incident_software = wf.incident_software | default('[TO CONFIRM]', true) %}
{% set mh_line = {'NSW': 'NSW Mental Health Line 1800 011 511', 'QLD': '1300 MH CALL (1300 642 255)', 'SA': 'SA Mental Health Triage 13 14 65', 'VIC': 'the local Area Mental Health and Wellbeing Service triage line [TO CONFIRM number]', 'WA': 'Mental Health Emergency Response Line 1300 555 788 [TO CONFIRM for the local region]', 'TAS': 'Mental Health Services Helpline 1800 332 388 [TO CONFIRM]', 'ACT': 'Access Mental Health 1800 629 354 [TO CONFIRM]', 'NT': 'NT Mental Health Line 1800 682 288 [TO CONFIRM]'} %}
# Health and Wellbeing Policy

## Purpose

Core Module outcome 3.4 requires responsive, timely and competent support, including for health needs, and SIL supplementary module outcome 2 requires that risks to each participant in the home are identified and managed. This policy sets out how {{ org.name }} supports each participant's physical, oral and mental health through an Individual Health Plan for everyone, routine monitoring, escalation of deterioration, safe hospital transfers and clarity about NDIS and health system responsibilities.

## Scope

This policy applies to every participant and every worker ({{ wf.employment_types | join(', ') }}), key personnel, agency worker and contractor of {{ org.name }} in every home ({% for home in intake.homes %}{{ home.name }}{% if not loop.last %}, {% endif %}{% endfor %}) and in the community.

## Policy statement

- **Health decisions belong to the participant.** Participants choose their own GP, dentist and clinicians and consent to or refuse treatment, with support. Where a guardian has health-care powers, {{ org.name }} records it and still involves the participant. Health information is shared only with consent or as the law requires.
- **Every participant has an Individual Health Plan.** Within 4 weeks of starting support, each participant has a plan (reviewed at least annually and after any hospital admission or significant change) recording diagnoses, clinicians, medication{% if sup.medication_involvement == 'none' %} (self-managed){% endif %}, allergies, monitoring, goals, risks, baseline and early signs of illness.
- **Prevention and routine care.** {{ org.name }} supports each participant to have an annual comprehensive health assessment with their GP, annual dental checks, recommended immunisations and screening, vision and hearing checks, and allied health reviews funded in their NDIS plan.
- **Deterioration is recognised and escalated.** Every worker knows each participant's baseline and escalates using the table below; nobody waits for the next shift when a participant may be deteriorating, and precautionary 000 calls are never criticised.
- **Oral and mental health.** Daily oral care is part of each routine and recorded in {{ notes_software }}; oral pain, refusal to eat or bleeding gums are health concerns. Emotional wellbeing is discussed at every plan review; workers know each participant's history, early warning signs, what helps and their crisis contacts, and escalate changes in mood, sleep, appetite, withdrawal, self-harm talk or psychotic symptoms the same day. Medication is never used to manage behaviour outside the Restrictive Practices and Behaviour Support Policy.
- **NDIS and Medicare interface.** The NDIS funds disability-related health supports that are part of daily living (a worker attending appointments, allied health in the plan, continence and dysphagia supports, clinician training of workers); Medicare and the state health system fund diagnosis, treatment, GP, specialist and hospital care, PBS medication and acute mental health care. {{ org.name }} never refuses to support access to health care because it is "not NDIS" and raises funding gaps with the support coordinator and NDIA.

## Roles and responsibilities

| Role | Responsibilities |
|---|---|
| {{ director }} | Ensures clinical advice is available; reviews health-related incidents and hospital admissions quarterly; approves this policy. |
| {{ quality_lead }} | Owns this policy; audits Individual Health Plans annually; reviews health-related incidents for learning; keeps deterioration training current. |
| {{ rostering_manager }} | Ensures each participant has a health plan, a GP and a Hospital Transfer Pack; rosters appropriately trained workers; raises health-related funding with support coordinators and the NDIA. |
| {{ incident_officer }} and {{ privacy_officer }} | Record and investigate health-related incidents in {{ incident_software }}; manage consent for sharing health information. |
| House leaders | Keep health plans and Hospital Transfer Packs current; book and track appointments in the Appointment Log; brief workers on health changes at handover. |
| Support workers | Know each participant's baseline; observe and record health each shift; escalate deterioration immediately; support appointments and follow clinicians' instructions. |

## Procedure

1. **Establish the plan.** Within 4 weeks of intake the house leader and participant (with family and clinicians, by consent) complete the Individual Health Plan and file it in {{ notes_software }} with clinical letters, care plans and consent for information sharing.
2. **Monitor.** Each shift, workers record wellbeing, intake, bowel and bladder function, sleep, pain, skin, seizures, mood and any monitoring the plan specifies; anything outside baseline is reported to the house leader the same shift.
3. **Book and track care.** The house leader books the appointments the plan requires, records them in the Appointment Log, supports the participant to attend with their questions prepared, records the outcome, and updates the health plan and Medication Administration Record when instructions change.
4. **Escalate deterioration** using the table below, recording observations, time, who was called and the advice given in {{ notes_software }} and, where the event is an incident, in {{ incident_software }}.
5. **Hospital transfer and return.** The worker calls 000 (or arranges transport as the clinician advises), sends the Hospital Transfer Pack, accompanies the participant where the plan requires, and phones the house leader, who tells {{ rostering_manager }} and, with consent, family and the support coordinator. Before discharge the house leader obtains the discharge summary, medication list and care instructions, updates the health plan, arranges equipment, training or roster changes, and briefs workers; the participant comes home only when the home can meet their changed needs safely.
6. **Review.** The house leader reviews the plan with the participant at least annually, after every hospital admission or health-related incident, and when clinicians change instructions; {{ quality_lead }} audits plans annually.

## Deterioration escalation table

| What the worker observes | Action |
|---|---|
| Unresponsive; not breathing normally; severe breathing difficulty; chest pain; seizure longer than the plan allows; severe bleeding; signs of stroke; unresolved choking; anaphylaxis; suspected overdose | Call 000 immediately; give first aid; follow the participant's emergency plan; then phone the house leader or on-call manager |
| New or worsening symptoms: fever, vomiting, breathlessness, unusual drowsiness or confusion, severe pain, no urine output, a fall with injury, new rash, no bowel motion beyond the plan's limit | Phone the house leader or on-call manager during the shift; contact the GP or after-hours GP service; call healthdirect on 1800 022 222; call 000 if in doubt |
| Non-urgent changes from baseline: reduced appetite, weight change, sleep or mood changes, minor injury, oral pain | Record in {{ notes_software }}; tell the house leader by the end of the shift; GP review within 2 business days |
| Mental health crisis: talk of suicide or self-harm, acute distress, psychosis, risk to self or others | Stay with the participant; call 000 if there is immediate danger; otherwise call {% for state in org.states %}{{ mh_line[state | upper] | default('the state mental health line [TO CONFIRM]') }}{% if not loop.last %} or {% endif %}{% endfor %}, or Lifeline 13 11 14; phone the house leader; record and report as an incident |

## Individual health plan template

| Field | Entry |
|---|---|
| Participant, date of birth, Medicare number, NDIS number | (example — delete) J. Example |
| Health decision-maker and consent for information sharing | Participant decides; sister contactable with consent (signed 01/08/2026) |
| Diagnoses, conditions, allergies and adverse reactions | Cerebral palsy; epilepsy; reflux; penicillin — rash |
| GP, pharmacy, dentist, specialists and allied health (name, phone) | Dr A. GP, Example Medical Centre, 02 9000 0000 |
| Medication | See current medication chart{% if sup.medication_involvement == 'administer' %} and MAR{% elif sup.medication_involvement == 'prompt' %}; self-administers with prompting{% else %}; self-managed{% endif %} |
| Baseline, early signs of being unwell and what to do | Sleeps 10 pm – 7 am; bowel motion daily; walks with frame. Quiet and refuses breakfast — check temperature, call GP the same day |
| Routine monitoring (what, how often, where recorded) | Weight monthly; bowel chart daily; seizure record each event |
| Health-related plans and NDIS-funded health supports | Epilepsy management plan (dated){% if sup.mealtime_management %}; mealtime management plan (IDDSI 6 / 2){% endif %}; continence plan; speech pathology and OT in plan; dietitian requested at review |
| Health goals and preventive care due | Annual GP health assessment (March); dental check (June); flu vaccine (April) |
| Mental health and wellbeing; oral health routine | History; early warning signs; what helps; crisis contacts; brush twice daily; dentist annually |
| Hospital Transfer Pack location and check date; plan date, review date, prepared by | Top drawer, bedroom; 01/08/2026; review 01/08/2027; house leader with participant |

## Appointment log template

| Date and time | Participant | Clinician and purpose | Supported by | Transport | Outcome and new instructions | Health plan or MAR updated (Y/N) | Follow-up due |
|---|---|---|---|---|---|---|---|
| 05/08/2026 10:00 (example — delete) | J. Example | Dr A. GP — annual health assessment | A. Worker | {% if sup.transport %}{{ org.name }} vehicle{% else %}Taxi (participant's transport funding){% endif %} | Blood tests ordered; reflux medication increased | Y | Pathology 08/08/2026 |

## Hospital transfer pack (kept ready for each participant)

- Health summary: diagnoses, allergies, baseline, communication, and how the participant shows pain or distress.
- Current medication chart and the time of the last doses given; copies of relevant plans (epilepsy{% if sup.mealtime_management %}, mealtime management with IDDSI levels{% endif %}{% if sup.behaviour_support_plans or sup.restrictive_practices != 'none' %}, behaviour support{% endif %}, continence, communication).
- Medicare card, concession cards, NDIS number, health decision-maker or guardian details, {{ org.name }} contact details ({{ org.phone | default('[TO CONFIRM]', true) }}), the on-call number and family contacts with consent.
- Communication aids, glasses, hearing aids, mobility aids and comfort items, and a note asking the hospital to contact {{ org.name }} before discharge.

## Records kept

- Individual Health Plans, clinical documents and consent records in {{ notes_software }}.
- Shift observations, monitoring charts and oral care records in {{ notes_software }}; Appointment Logs; hospital transfer and discharge records.
- Health-related incident reports and investigations in {{ incident_software }}.
- Training records for deterioration recognition, first aid and participant-specific health training.

## Related documents

- medication-management
- mealtime-management
- incident-management
- emergency-disaster-management
- privacy-confidentiality
- assessment-support-planning
- shift-handover-progress-notes
- restrictive-practices-behaviour-support
- transitions-exit

## Legislation and standards references

- National Disability Insurance Scheme Act 2013 (Cth)
- NDIS (Provider Registration and Practice Standards) Rules 2018 — Core Module outcome 3.4 (responsive support provision); SIL supplementary module outcome 2 (safeguarding)
- NDIS (Incident Management and Reportable Incidents) Rules 2018 (death and serious injury of a participant)
- NDIS Code of Conduct (NDIS (Code of Conduct) Rules 2018)
- Privacy Act 1988 (Cth) and the Australian Privacy Principles (health information)
- NDIS Quality and Safeguards Commission practice alerts (including comprehensive health assessment, constipation, epilepsy, dysphagia and oral health)
- Applied Principles and Tables of Support to determine the responsibilities of the NDIS and other service systems (health)

## Review

This policy is reviewed every 12 months, after any participant death or serious health-related incident, and when Commission practice alerts change. Review owner: {{ quality_lead }}. Approval: {{ director }}.

## Document control

| Version | Approved by | Approval date | Next review |
|---|---|---|---|
| 1.0 | {{ director }} | [TO CONFIRM] | [TO CONFIRM — 12 months after approval] |
