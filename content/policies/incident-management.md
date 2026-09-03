---
title: Incident Management Policy and Procedure (including Reportable Incidents)
slug: incident-management
doc_type: policy
standards: [core-1.5, core-2.1, sil-2]
applies_if: "true"
version: 1.0
review_months: 12
---
{% set director = intake.governance.ceo_or_director | default('[TO CONFIRM]', true) %}
{% set quality_lead = intake.governance.quality_lead | default('[TO CONFIRM]', true) %}
{% set incident_officer = intake.governance.incident_officer | default('[TO CONFIRM]', true) %}
{% set complaints_officer = intake.governance.complaints_officer | default('[TO CONFIRM]', true) %}
{% set whs_officer = intake.governance.whs_officer | default('[TO CONFIRM]', true) %}
{% set rostering_manager = intake.governance.rostering_manager | default('[TO CONFIRM]', true) %}
{% set incident_software = intake.workforce.incident_software | default('[TO CONFIRM]', true) %}
{% set notes_software = intake.workforce.notes_software | default('[TO CONFIRM]', true) %}

# Incident Management Policy and Procedure (including Reportable Incidents)

## Purpose

This document sets out how {{ org.name }} identifies, records, responds to, reports, investigates and learns from incidents that occur in connection with the Supported Independent Living (SIL) supports it delivers, and how it meets its obligations to notify reportable incidents to the NDIS Quality and Safeguards Commission. It is {{ org.name }}'s incident management system for the purposes of the NDIS Act 2013 and the NDIS (Incident Management and Reportable Incidents) Rules 2018, and it evidences NDIS Practice Standards Core Module outcomes 1.5 (Violence, abuse, neglect, exploitation and discrimination), 2.1 (Governance and operational management) and the incident management outcome, and the SIL supplementary module safeguarding outcome.

## Scope

This document applies to all workers ({{ intake.workforce.employment_types | join(', ') }}), key personnel, agency staff, contractors and volunteers of {{ org.name }}, in every home it supports, in the community and in vehicles:
{% for home in intake.homes %}
- {{ home.name }}, {{ home.address }} ({{ home.participants }} participant{% if home.participants != 1 %}s{% endif %}; {% if home.roster_model == 'twenty_four_seven' %}24/7 staffing{% elif home.roster_model == 'sleepover' %}sleepover roster{% elif home.roster_model == 'active_night' %}active night roster{% elif home.roster_model == 'drop_in' %}drop-in roster{% else %}[TO CONFIRM roster]{% endif %})
{% endfor %}

It covers incidents affecting participants, workers, visitors and property. In the 12 months before this document was drafted {{ org.name }} recorded {{ intake.history.incidents_last_12m | default('[TO CONFIRM]', true) }} incident{% if intake.history.incidents_last_12m != 1 %}s{% endif %}, of which {{ intake.history.reportable_incidents_last_12m | default('[TO CONFIRM]', true) }} {% if intake.history.reportable_incidents_last_12m == 1 %}was{% else %}were{% endif %} reportable to the Commission; those records have been transferred to, or remain accessible through, {{ incident_software }} and the Incident Register.

## Policy statement

### What is an incident

{{ org.name }} records every incident, not only those that must be reported to the Commission. An incident is any of the following that occurs in connection with the supports {{ org.name }} provides:

- an act, omission, event or circumstance that has caused, or could have caused, harm to a participant (including near misses);
- an act by a participant that has caused, or risked, serious harm to another person (a co-resident, worker, visitor or member of the public);
- a reportable incident (defined below), whether or not the alleged perpetrator is a worker;
- a medication error{% if intake.supports.medication_involvement == 'administer' %} of any kind, including wrong person, dose, time, route or omission, and refused doses not reported to the prescriber{% endif %};
- a participant missing or absent without their support plan anticipating it;
- an injury to a worker, a dangerous occurrence, a vehicle accident, a fire, a significant property damage event or a breach of security at a home (also managed under WHS law);
- a privacy breach (also managed under the Privacy and Confidentiality Policy).

### Reportable incidents

A reportable incident is an incident of the following kinds that occurs, or is alleged to have occurred, in connection with the provision of supports by {{ org.name }}:

| Category | Notify the Commission within |
|---|---|
| The death of a participant | 24 hours of any key personnel becoming aware |
| Serious injury of a participant | 24 hours |
| Abuse or neglect of a participant | 24 hours |
| Unlawful sexual or physical contact with, or assault of, a participant | 24 hours |
| Sexual misconduct committed against, or in the presence of, a participant, including grooming of the participant for sexual activity | 24 hours |
| Use of a restrictive practice in relation to a participant that is not in accordance with a required state or territory authorisation and/or not in accordance with a behaviour support plan for the participant | 5 business days of any key personnel becoming aware — unless the incident also falls in a 24-hour category (for example it caused serious injury), in which case 24 hours |

For each 24-hour category, a more detailed report must be given to the Commission within 5 business days after the initial notification, and a final or investigation report within any further time the Commission specifies. {{ org.name }} treats the timeframe as running from the moment any of its key personnel first becomes aware, and does not wait for an internal investigation, a police outcome or confirmation that an allegation is true before notifying.{% if intake.supports.restrictive_practices == 'in_use_unauthorised' %} {{ org.name }} has identified that restrictive practices are currently used without full authorisation and/or a behaviour support plan; each use is a reportable incident until authorisation and a plan are in place, and the Director has made obtaining them the organisation's first safeguarding priority.{% endif %}

### Principles

- Safety first: the person affected is made safe and given medical or emergency assistance before anything else.
- Participants are involved: the participant affected (and, with consent or lawful authority, their family, guardian or nominee) is told what happened and what {{ org.name }} is doing, is supported, and is offered an advocate, under the Open Disclosure Procedure.
- No blame for reporting: workers are expected to report every incident, including their own errors, and are supported when they do; concealment or late reporting is a disciplinary matter.
- Proportionate investigation: every incident is reviewed; the depth of investigation matches its severity and its potential to recur.
- Learning: incidents are analysed individually and in aggregate to find and fix systemic causes, and the incident management system itself is reviewed at least annually.

### Severity rating

| Rating | Meaning | Internal escalation |
|---|---|---|
| 1 — Minor | No or minimal harm; near miss; no external reporting | Recorded in {{ incident_software }} by end of shift; reviewed by {{ incident_officer }} within 3 business days |
| 2 — Moderate | First aid or minor treatment; distress; property damage; medication error without harm | Phone {{ incident_officer }} during the shift; reviewed within 1 business day |
| 3 — Major | Medical treatment or hospital; allegation of abuse, neglect, assault or sexual misconduct; missing participant; unauthorised restrictive practice; WHS notifiable incident | Phone {{ incident_officer }} immediately; Director notified the same day; reportable incident assessment same day |
| 4 — Critical | Death, life-threatening or permanent injury, serious assault, fire or evacuation, media or police involvement | Call 000; phone {{ incident_officer }} and the Director immediately; Commission notified within 24 hours |

## Roles and responsibilities

| Role | Responsibilities under this document |
|---|---|
| Director — {{ director }} | Accountable for the incident management system; approves reportable incident notifications (authorised Reportable Incident Approver in the NDIS Commission Portal) or delegates that role in writing; decides stand-downs; reviews all rating 3 and 4 incidents and quarterly trend reports; ensures the system is reviewed annually. |
| Incident Officer — {{ incident_officer }} | Owns this document; receives all incident reports; makes immediate management decisions; assesses reportability; lodges notifications and follow-up reports in the NDIS Commission Portal (authorised Reportable Incident Notifier); leads or assigns investigations; maintains the Incident Register; reports monthly to the quality and safety review. |
| Quality Lead — {{ quality_lead }} | Analyses incidents for systemic causes; records actions in the Continuous Improvement Register; delivers incident reporting training; audits incident records for completeness and timeliness. |
| WHS Officer — {{ whs_officer }} | Notifies the state work health and safety regulator of notifiable incidents (death, serious injury or illness, dangerous incident) and preserves the site; manages worker injury follow-up and workers compensation. |
| Complaints Officer — {{ complaints_officer }} | Identifies incidents disclosed through complaints and refers them the same day. |
| Rostering Manager — {{ rostering_manager }} | Removes stood-down workers from rosters; provides shift records to investigations; adjusts staffing where an incident shows a roster gap. |
| Support workers | Respond to keep people safe; report every incident during the shift in {{ incident_software }} and by phone where required; preserve evidence; cooperate with investigations; support the participant afterwards. |

## Procedure

### Part A — Responding to and recording any incident

1. Ensure immediate safety: give first aid, call 000 for emergencies, remove hazards, separate people where there is a risk of further harm, and follow the participant's health, mealtime or behaviour support plan.
2. Phone {{ incident_officer }} according to the severity rating above (immediately for rating 3 or 4). If the Incident Officer cannot be reached within 15 minutes for a rating 3 or 4 incident, phone the Director {{ director }}. If the incident involves the Incident Officer, report directly to the Director.
3. Preserve evidence where a crime, serious injury or death may be involved: do not clean up or move items, keep any documents and devices, and note witnesses.
4. Tell the participant what has happened and what will happen next, in their communication method, and record their account in their words (Open Disclosure Procedure, step 2).
5. Record the incident in {{ incident_software }} before the end of the shift: who, what, when, where, witnesses, injuries, immediate actions, the participant's account, and the worker's name. Record facts, not opinions. A progress note in {{ notes_software }} cross-references the incident number.
6. {{ incident_officer }} reviews the report within the timeframe for its rating, confirms the rating, decides whether the incident is reportable (Part B), is WHS-notifiable, involves a suspected crime (report to police), involves a child (state child protection reporting), or involves a restrictive practice (Restrictive Practices Policy), and records those decisions.
7. {{ incident_officer }} arranges support for the participant: medical follow-up, counselling, a change of worker, a safety plan, advocacy, and informs family, guardian or nominee where consent or authority exists.
8. Where a worker is alleged to have harmed a participant, the Director stands the worker down from participant contact (with pay, pending investigation) and {{ rostering_manager }} amends the roster the same day.
9. {{ incident_officer }} enters the incident in the Incident Register with its rating, reportability and status.

### Part B — Reportable incident notification

1. As soon as any key personnel becomes aware of a possible reportable incident, {{ incident_officer }} records the date and time of awareness in the Incident Register; this starts the 24-hour or 5-business-day clock.
2. {{ incident_officer }} confirms with the Director that the incident falls within a reportable category (an allegation is enough; proof is not required). If unsure, {{ org.name }} notifies.
3. {{ incident_officer }} lodges the immediate notification in the NDIS Commission Portal within 24 hours (or within 5 business days for an unauthorised restrictive practice not involving harm in a 24-hour category), including the participant's details, what occurred, the impact on the participant, immediate actions, and the alleged perpetrator's details if known. The Director, as Reportable Incident Approver, approves the submission. If the Portal is unavailable, {{ incident_officer }} phones the Commission on 1800 035 544 and records the call.
4. Within 5 business days of the immediate notification, {{ incident_officer }} submits the 5-day report with further details, the support provided, the outcome of any assessment and the proposed investigation.
5. {{ org.name }} completes any investigation or further report the Commission requires within the timeframe the Commission sets, and provides any information the Commission requests.
6. The participant is kept informed under the Open Disclosure Procedure, and is told that the Commission has been notified and can be contacted directly.
7. Any WHS notifiable incident is also reported immediately to the state regulator by {{ whs_officer }}, and any suspected crime is reported to police; these reports do not replace notification to the Commission.

### Part C — Investigation, analysis and closure

1. {{ incident_officer }} assigns an investigator: for rating 1 and 2, the Incident Officer; for rating 3 and 4, the Director or an external investigator where independence is needed (for example an allegation against the Director, Incident Officer or a family member of key personnel).
2. The investigation establishes what happened and why, using {{ incident_software }} records, {{ notes_software }} progress notes, roster records, the participant's account, worker and witness statements, and any physical evidence. Workers who are the subject of an allegation are told the allegation, may respond and may bring a support person.
3. Root causes are identified (for example roster gaps, training, environment, plan not followed, communication breakdown, co-resident compatibility) and corrective actions with owners and due dates are recorded in the Incident Register and, where systemic, the Continuous Improvement Register.
4. Rating 1 incidents are closed within 10 business days, rating 2 within 20 business days, and rating 3 and 4 when the Director is satisfied the investigation is complete and the Commission has no outstanding requirements.
5. {{ quality_lead }} reviews the Incident Register monthly for trends by home, participant, worker, shift and time of day, and reports to the quality and safety review; the Director reviews trends quarterly and the whole system annually, including feedback from participants and workers on how incidents were handled.

## Records kept

- Incident reports and attachments ({{ incident_software }}); progress notes ({{ notes_software }})
- Incident Register (all incidents), including awareness time, reportability decision and Commission reference numbers
- NDIS Commission Portal notifications, 5-day reports, final reports and correspondence
- WHS regulator notifications and police reports
- Investigation files, statements, findings and corrective action records
- Open Disclosure Records
- Monthly trend analyses, quarterly reports to the Director and annual system review
- All incident records are kept for at least 7 years

## Related documents

- Incident Register template
- Open Disclosure Procedure
- Safeguarding Policy — Violence, Abuse, Neglect, Exploitation and Discrimination
- Restrictive Practices Policy
- Complaints and Feedback Policy and Procedure
- Privacy and Confidentiality Policy (privacy breach response)
- Medication Management Policy
- Risk Management Policy and Framework
- Emergency and Disaster Management Plan
- Whistleblower Protection Policy
- Human Resources Policy (stand-down and disciplinary process)

## Legislation and standards references

- National Disability Insurance Scheme Act 2013 (Cth), sections 73Y (incident management system) and 73Z (reportable incidents)
- NDIS (Incident Management and Reportable Incidents) Rules 2018
- NDIS (Restrictive Practices and Behaviour Support) Rules 2018
- NDIS (Code of Conduct) Rules 2018 — the NDIS Code of Conduct
- NDIS (Provider Registration and Practice Standards) Rules 2018 — NDIS Practice Standards, Core Module outcomes 1.5 and 2.1 and the incident management outcome
- NDIS Practice Standards, SIL supplementary module (registration group 0138, 2026), safeguarding outcome
- Privacy Act 1988 (Cth)
{% if 'NSW' in org.states %}
- Work Health and Safety Act 2011 (NSW) (notifiable incidents, Part 3); Ageing and Disability Commissioner Act 2019 (NSW); Children and Young Persons (Care and Protection) Act 1998 (NSW) if any participant is under 18
{% endif %}
{% if 'VIC' in org.states %}
- Occupational Health and Safety Act 2004 (Vic) (incident notification); Disability Act 2006 (Vic)
{% endif %}
{% if 'QLD' in org.states %}
- Work Health and Safety Act 2011 (Qld) (notifiable incidents, Part 3); Disability Services Act 2006 (Qld)
{% endif %}
{% if 'SA' in org.states %}
- Work Health and Safety Act 2012 (SA) (notifiable incidents, Part 3)
{% endif %}
{% if 'WA' in org.states %}
- Work Health and Safety Act 2020 (WA) (notifiable incidents)
{% endif %}
{% if 'TAS' in org.states %}
- Work Health and Safety Act 2012 (Tas) (notifiable incidents, Part 3)
{% endif %}
{% if 'ACT' in org.states %}
- Work Health and Safety Act 2011 (ACT) (notifiable incidents, Part 3); Senior Practitioner Act 2018 (ACT)
{% endif %}
{% if 'NT' in org.states %}
- Work Health and Safety (National Uniform Legislation) Act 2011 (NT) (notifiable incidents, Part 3)
{% endif %}

## Review

Reviewed every 12 months by the Incident Officer ({{ incident_officer }}) and approved by the Director ({{ director }}), with input from participants and workers; reviewed earlier after any rating 4 incident, any late notification to the Commission, or any change to the Incident Rules or the Commission's reportable incident guidance.

## Document control

| Version | Drafted | Approved by | Approval date | Next review |
|---|---|---|---|---|
| 1.0 | {{ intake.meta.generated_on | date }} | {{ director }} | [TO CONFIRM on adoption] | 12 months after approval |
