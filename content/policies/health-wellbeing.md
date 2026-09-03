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

Core Module outcome 3.4 requires that each participant receives responsive, timely and competent support that meets their needs and preferences, including their health needs, and SIL supplementary module outcome 2 requires that risks to each participant in the home are identified and managed. People with disability living in supported accommodation have higher rates of preventable illness and early death, often because deterioration is missed or health care is fragmented. This policy sets out how {{ org.name }} supports each participant's physical, oral and mental health: an Individual Health Plan for every participant, routine health monitoring, recognising and escalating deterioration, safe hospital transfers using a Hospital Transfer Pack, and clarity about what the NDIS funds and what the health system funds.

## Scope

This policy applies to every participant and every worker ({{ wf.employment_types | join(', ') }}), key personnel, agency worker and contractor of {{ org.name }} in every home ({% for home in intake.homes %}{{ home.name }}{% if not loop.last %}, {% endif %}{% endfor %}) and in the community. It works with the Medication Management Policy{% if sup.mealtime_management %}, the Mealtime Management Policy{% endif %} and the Emergency and Disaster Management Plan.

## Policy statement

- **Health is the participant's.** Participants make their own health decisions with support, choose their own GP, dentist and clinicians, and consent to (or refuse) treatment. Where a participant has a guardian with health-care powers, {{ org.name }} records it and still involves the participant. Health information is handled under the Privacy and Confidentiality Policy and shared only with consent or as the law requires.
- **Every participant has an Individual Health Plan.** Within 4 weeks of starting support, and reviewed at least annually and after any hospital admission or significant change, each participant has a plan that records their diagnoses, clinicians, medication{% if sup.medication_involvement == 'none' %} (self-managed){% endif %}, allergies, routine monitoring, health goals, known risks, what is normal for them, and the early signs that they are unwell.
- **Prevention and routine care.** {{ org.name }} supports each participant to have an annual comprehensive health assessment with their GP, dental checks at least annually, recommended immunisations and screening, vision and hearing checks, and reviews by allied health practitioners in their NDIS plan.
- **Deterioration is recognised and escalated.** Every worker knows each participant's baseline, watches for the signs in the Individual Health Plan, and escalates using the escalation table in this policy. Nobody waits for the next shift, the next day or a "review" when a participant may be deteriorating. Workers call 000 whenever they think an emergency is possible; a wrong call to 000 is never criticised.
- **Hospital transfers are safe.** Every participant has a Hospital Transfer Pack ready in the home. A worker accompanies the participant to hospital where their plan requires it and stays until the hospital has what it needs; {{ org.name }} plans the return home with the discharge team.
- **Oral health.** Daily oral care is part of each participant's routine, recorded in {{ notes_software }}, with dentures, brushing aids and a dentist recorded in the health plan. Pain, refusal to eat, bleeding gums or broken teeth are treated as health concerns.
- **Mental health.** Emotional wellbeing is discussed at every plan review. Workers know the participant's history, early warning signs, what helps, and the crisis contacts in the health plan. Changes in mood, sleep, appetite, withdrawal, self-harm talk or psychotic symptoms are escalated the same day. Mental health treatment decisions belong to the participant and their clinicians; medication is never used to manage behaviour outside the Restrictive Practices and Behaviour Support Policy.
- **NDIS and Medicare interface.** The NDIS funds disability-related health supports that are part of daily living (for example a support worker attending appointments, allied health in the participant's plan, continence and dysphagia supports, training of workers by clinicians). Medicare and the state health system fund diagnosis, treatment, GP and specialist care, hospital care, PBS medication and acute mental health care. {{ org.name }} does not bill the NDIS for health services, does not refuse to support a participant to access health care because it is "not NDIS", and raises funding gaps with the support coordinator and the NDIA.

## Roles and responsibilities

| Role | Responsibilities |
|---|---|
| {{ director }} | Ensures clinical advice is available when needed; reviews health-related incidents and hospital admissions quarterly; approves this policy. |
| {{ quality_lead }} | Owns this policy; audits Individual Health Plans annually; reviews every health-related incident for learning; ensures deterioration training is current. |
| {{ rostering_manager }} | Ensures each participant has a health plan, a GP and a Hospital Transfer Pack; rosters workers with the training a participant's health needs require; liaises with support coordinators and the NDIA on health-related funding. |
| {{ incident_officer }} | Records and investigates health-related incidents in {{ incident_software }}, including missed escalations. |
| {{ privacy_officer }} | Manages consent for sharing health information with clinicians and hospitals. |
| House leaders | Keep each health plan and Hospital Transfer Pack current; book and track appointments in the Appointment Log; brief workers on health changes at handover. |
| Support workers | Know each participant's baseline; observe and record health each shift; escalate deterioration immediately; support appointments and follow clinicians' instructions. |

## Procedure

1. **Establish the health plan.** Within 4 weeks of intake the house leader and participant (and, with consent, family and clinicians) complete the Individual Health Plan and file it in {{ notes_software }}, with copies of current clinical letters, care plans and consent for information sharing.
2. **Monitor.** Workers record on each shift, as the plan requires, the participant's general wellbeing, intake, bowel and bladder function, sleep, pain, skin, seizures, mood and any monitoring the plan specifies (for example weight, blood glucose, bowel chart). Anything outside the participant's baseline is reported to the house leader the same shift.
3. **Book and track care.** The house leader books the appointments the plan requires, records them in the Appointment Log, supports the participant to attend with their questions prepared, records the outcome and any new instructions, and updates the health plan and the Medication Administration Record where instructions change.
4. **Escalate deterioration** using the table below. The worker records the observations, the time, who was called and the advice given in {{ notes_software }} and, where the event is an incident, in {{ incident_software }}.
5. **Hospital transfer.** The worker calls 000 (or arranges transport as the clinician advises), sends the Hospital Transfer Pack with the participant, accompanies them where the plan requires, phones the house leader, and the house leader tells {{ rostering_manager }} and, with consent, the participant's family and support coordinator the same day.
6. **Return home.** Before discharge, the house leader obtains the discharge summary, new medication list and any care instructions, updates the health plan, arranges any equipment, training or roster changes, and briefs workers. A participant is not brought home until the home can meet their changed needs safely.
7. **Review.** The house leader reviews the health plan with the participant at least annually, after every hospital admission, after every health-related incident and when clinicians change instructions. {{ quality_lead }} audits plans annually.

## Deterioration escalation table

| What the worker observes | Action |
|---|---|
| Unresponsive, not breathing normally, severe difficulty breathing, chest pain, seizure longer than the participant's plan allows or with no plan, severe bleeding, signs of stroke, choking not resolved, anaphylaxis, suspected overdose | Call 000 immediately; give first aid; follow the participant's emergency plan; then phone the house leader or on-call manager |
| New or worsening symptoms that concern the worker: fever, vomiting, breathlessness, unusual drowsiness or confusion, severe pain, no urine output, a fall with injury, a new rash, no bowel motion beyond the plan's limit | Phone the house leader or on-call manager during the shift; contact the GP or the after-hours GP service; call healthdirect on 1800 022 222 for advice; call 000 if in doubt |
| Changes from baseline that are not urgent: reduced appetite, weight change, sleep changes, mood changes, minor injury, oral pain | Record in {{ notes_software }}; tell the house leader by the end of the shift; house leader arranges a GP review within 2 business days |
| Mental health crisis: talk of suicide or self-harm, acute distress, psychosis, risk to self or others | Stay with the participant; call 000 if there is immediate danger; otherwise call {% for state in org.states %}{{ mh_line[state | upper] | default('the state mental health line [TO CONFIRM]') }}{% if not loop.last %} or {% endif %}{% endfor %}, or Lifeline 13 11 14; phone the house leader; record and report as an incident |

## Individual health plan template

| Field | Entry |
|---|---|
| Participant, date of birth, Medicare number, NDIS number | (example — delete) J. Example |
| Health decision-maker and consent for information sharing | Participant decides; sister may be contacted with consent (signed 01/08/2026) |
| Diagnoses and conditions | Cerebral palsy; epilepsy; gastro-oesophageal reflux |
| Allergies and adverse reactions | Penicillin — rash |
| GP, pharmacy, dentist, specialists and allied health (name, phone) | Dr A. GP, Example Medical Centre, 02 9000 0000 |
| Medication | See current medication chart{% if sup.medication_involvement == 'administer' %} and MAR{% elif sup.medication_involvement == 'prompt' %}; self-administers with prompting{% else %}; self-managed{% endif %} |
| What is normal for this participant (baseline) | Sleeps 10 pm – 7 am; bowel motion daily; walks with frame; talks in short sentences |
| Early signs this participant is unwell and what to do | Quiet and refuses breakfast — check temperature, call GP the same day |
| Routine monitoring (what, how often, where recorded) | Weight monthly; bowel chart daily; seizure record each event |
| Health-related plans in place | Epilepsy management plan (dated){% if sup.mealtime_management %}; mealtime management plan (IDDSI 6 / 2){% endif %}; continence plan |
| Health goals and preventive care due | Annual GP health assessment (due March); dental check (due June); flu vaccine (April) |
| Mental health and wellbeing | History; early warning signs; what helps; crisis contacts |
| Oral health routine | Brush twice daily with electric toothbrush; dentist annually |
| NDIS-funded health-related supports and gaps raised | Speech pathology and OT in plan; dietitian requested at plan review |
| Hospital Transfer Pack checked (date) and location | 01/08/2026; top drawer, participant's bedroom |
| Plan date, review date, prepared by | 01/08/2026; 01/08/2027; house leader with participant |

## Appointment log template

| Date and time | Participant | Clinician and purpose | Supported by | Transport | Outcome and new instructions | Health plan or MAR updated (Y/N) | Follow-up due |
|---|---|---|---|---|---|---|---|
| 05/08/2026 10:00 (example — delete) | J. Example | Dr A. GP — annual health assessment | A. Worker | {% if sup.transport %}{{ org.name }} vehicle{% else %}Taxi (participant's transport funding){% endif %} | Blood tests ordered; reflux medication increased | Y | Pathology 08/08/2026 |

## Hospital transfer pack (kept ready for each participant)

- Health summary: diagnoses, allergies, baseline, communication and how the participant shows pain or distress.
- Current medication chart and the time of the last doses given.
- Copies of relevant plans: epilepsy{% if sup.mealtime_management %}, mealtime management (IDDSI levels){% endif %}{% if sup.behaviour_support_plans or sup.restrictive_practices != 'none' %}, behaviour support{% endif %}, continence, communication.
- Medicare card, concession cards, NDIS number, and health decision-maker or guardian details.
- {{ org.name }} contact details ({{ org.phone | default('[TO CONFIRM]', true) }}) and the on-call number; family contacts with consent.
- The participant's communication aids, glasses, hearing aids, mobility aids and comfort items.
- A note asking the hospital to contact {{ org.name }} before discharge and the NDIA Health Liaison Officer where available.

## Records kept

- Individual Health Plans and clinical documents in {{ notes_software }}; consent records.
- Shift health observations, monitoring charts and oral care records in {{ notes_software }}.
- Appointment Logs and outcomes.
- Hospital transfer and discharge records.
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
- supported-decision-making

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
