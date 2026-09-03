---
title: Work Health and Safety Policy
slug: whs-work-health-safety
doc_type: policy
standards: [core-4.1, sil-3]
applies_if: "true"
version: 1.0
review_months: 12
---
{% set gov = intake.governance %}{% set wf = intake.workforce %}{% set sup = intake.supports %}
{% set director = gov.ceo_or_director | default('[TO CONFIRM]', true) %}{% set quality_lead = gov.quality_lead | default('[TO CONFIRM]', true) %}{% set whs_officer = gov.whs_officer | default('[TO CONFIRM]', true) %}{% set rostering_manager = gov.rostering_manager | default('[TO CONFIRM]', true) %}{% set incident_officer = gov.incident_officer | default('[TO CONFIRM]', true) %}
{% set incident_software = wf.incident_software | default('[TO CONFIRM]', true) %}{% set rostering_software = wf.rostering_software | default('[TO CONFIRM]', true) %}{% set training_platform = wf.training_platform | default('[TO CONFIRM]', true) %}
{% set whs_act = {'NSW': 'Work Health and Safety Act 2011 (NSW)', 'VIC': 'Occupational Health and Safety Act 2004 (Vic)', 'QLD': 'Work Health and Safety Act 2011 (Qld)', 'SA': 'Work Health and Safety Act 2012 (SA)', 'TAS': 'Work Health and Safety Act 2012 (Tas)', 'ACT': 'Work Health and Safety Act 2011 (ACT)', 'NT': 'Work Health and Safety (National Uniform Legislation) Act 2011 (NT)', 'WA': 'Work Health and Safety Act 2020 (WA)'} %}
{% set whs_reg = {'NSW': 'Work Health and Safety Regulation 2017 (NSW)', 'VIC': 'Occupational Health and Safety Regulations 2017 (Vic)', 'QLD': 'Work Health and Safety Regulation 2011 (Qld)', 'SA': 'Work Health and Safety Regulations 2012 (SA)', 'TAS': 'Work Health and Safety Regulations 2022 (Tas)', 'ACT': 'Work Health and Safety Regulation 2011 (ACT)', 'NT': 'Work Health and Safety (National Uniform Legislation) Regulations 2011 (NT)', 'WA': 'Work Health and Safety (General) Regulations 2022 (WA)'} %}
{% set regulator = {'NSW': 'SafeWork NSW (13 10 50)', 'VIC': 'WorkSafe Victoria (13 23 60)', 'QLD': 'Workplace Health and Safety Queensland (1300 362 128)', 'SA': 'SafeWork SA (1300 365 255)', 'TAS': 'WorkSafe Tasmania (1300 366 322)', 'ACT': 'WorkSafe ACT (13 22 81)', 'NT': 'NT WorkSafe (1800 019 115)', 'WA': 'WorkSafe WA (1300 307 877)'} %}
{% set comp_act = {'NSW': 'Workers Compensation Act 1987 (NSW) and Workplace Injury Management and Workers Compensation Act 1998 (NSW)', 'VIC': 'Workplace Injury Rehabilitation and Compensation Act 2013 (Vic)', 'QLD': "Workers' Compensation and Rehabilitation Act 2003 (Qld)", 'SA': 'Return to Work Act 2014 (SA)', 'TAS': 'Workers Rehabilitation and Compensation Act 1988 (Tas)', 'ACT': 'Workers Compensation Act 1951 (ACT)', 'NT': 'Return to Work Act 1986 (NT)', 'WA': 'Workers Compensation and Injury Management Act 2023 (WA)'} %}
{% set ns = namespace(vic=false, sleepover=false, overnight=false, dropin=false) %}{% for state in org.states %}{% if state | upper == 'VIC' %}{% set ns.vic = true %}{% endif %}{% endfor %}{% for home in intake.homes %}{% if home.roster_model == 'sleepover' %}{% set ns.sleepover = true %}{% endif %}{% if home.roster_model in ['twenty_four_seven', 'active_night'] %}{% set ns.overnight = true %}{% endif %}{% if home.roster_model == 'drop_in' %}{% set ns.dropin = true %}{% endif %}{% endfor %}
# Work Health and Safety Policy

## Purpose

{{ org.name }} must ensure, so far as is reasonably practicable, the health and safety of its workers and of others, including participants and visitors, affected by its work. This policy sets out how {{ org.name }} meets that duty under {% for state in org.states %}the {{ whs_act[state | upper] | default('work health and safety legislation of ' ~ state ~ ' [TO CONFIRM]') }}{% if not loop.last %} and {% endif %}{% endfor %} across its {{ intake.homes | length }} home{% if intake.homes | length != 1 %}s{% endif %} and approximately {{ wf.headcount | default('[TO CONFIRM]', true) }} workers, covering duties, consultation, hazard reporting, manual handling, violence and aggression, working alone and sleepovers, fatigue, psychosocial hazards and notifiable incidents. It evidences Core Module outcome 4.1 and SIL supplementary module outcome 3.

## Scope

This policy applies to every worker ({{ wf.employment_types | join(', ') }}), key personnel, contractor, agency worker, student and volunteer of {{ org.name }}, in every home, in the community, in vehicles and at any other work location. The home environment is covered in the Safe Environment and Property Maintenance Policy and infection control in the Waste Management and Infection Control Policy.

## Policy statement

- **Duties.** {{ org.name }} (as the {% if ns.vic %}employer{% else %}person conducting a business or undertaking{% endif %}) provides a safe working environment, safe systems of work, information, training and supervision, and monitors workers' health and workplace conditions. {{ director }} and other officers exercise due diligence by keeping up to date with WHS matters, understanding the hazards of SIL work, and ensuring and verifying that resources and processes are in place. Every worker takes reasonable care for their own and others' safety, follows reasonable instructions and reports hazards and incidents.
- **Consultation.** Workers are consulted on WHS matters that affect them at every house meeting and monthly all-staff meeting, before rosters, equipment or procedures change, and when risks are assessed. Workers may elect a health and safety representative, with the election and training the legislation provides for.
- **Risk management.** Hazards are identified, assessed and controlled using the hierarchy of controls (eliminate; substitute, isolate, engineer; administrative controls; personal protective equipment last) and recorded on the Risk Register and each home's risk assessment under the Risk Management Policy.
- **Hazard reporting.** Every worker reports every hazard, near miss and injury the same shift in {{ incident_software }}; no report is discouraged or penalised.
- **Manual handling.** Hazardous manual tasks (transfers, repositioning, showering, pushing wheelchairs, carrying shopping) are assessed for each participant, with an occupational therapist or physiotherapist where needed, and the safe method recorded in the support plan; workers use hoists, slide sheets and other equipment as trained, never lift a participant's full weight manually, and are trained at induction and annually.
- **Violence and aggression.** Behaviours of concern and aggression from any person are physical and psychosocial hazards. Each participant's support plan{% if sup.behaviour_support_plans or sup.restrictive_practices != 'none' %} and behaviour support plan{% endif %} records triggers, early signs, de-escalation strategies and what to do if a worker is at risk. Workers may withdraw to safety and call the on-call manager or 000, are never required to use a restrictive practice outside the Restrictive Practices and Behaviour Support Policy, and are offered debriefing and employee assistance after any assault or threat.
- **Working alone and overnight.** Many shifts are worked by one worker. Every home has an on-call manager available 24 hours, the on-call number is displayed, workers carry a charged phone, and welfare checks follow the home's risk assessment. {% if ns.sleepover %}Sleepover workers ({% for home in intake.homes %}{% if home.roster_model == 'sleepover' %}{{ home.name }}{% if not loop.last %}, {% endif %}{% endif %}{% endfor %}) have a private, lockable room, bedding, bathroom access and a means to summon help, and record every interruption so the overnight model can be reviewed under the Practice Governance and Workforce Consistency Policy. {% endif %}{% if ns.overnight %}Awake overnight workers ({% for home in intake.homes %}{% if home.roster_model in ['twenty_four_seven', 'active_night'] %}{{ home.name }}{% if not loop.last %}, {% endif %}{% endif %}{% endfor %}) have adequate lighting, a means to summon help and a documented check-in with the on-call manager. {% endif %}{% if ns.dropin %}Drop-in workers ({% for home in intake.homes %}{% if home.roster_model == 'drop_in' %}{{ home.name }}{% if not loop.last %}, {% endif %}{% endif %}{% endfor %}) confirm arrival and departure with the on-call manager or in {{ rostering_software }}. {% endif %}Check-in steps are in Part C.
- **Fatigue.** Rosters in {{ rostering_software }} follow the Practice Governance and Workforce Consistency Policy: no more than 12 hours of active work, at least 10 hours between shifts, sleepovers rostered in line with the Social, Community, Home Care and Disability Services Industry Award 2010, and limits on consecutive days. Workers who report fatigue are not rostered for additional shifts; {{ rostering_manager }} monitors overtime and interrupted sleepovers monthly.
- **Psychosocial hazards.** Workload, exposure to distressing events, bullying, poor support and lone or remote work are managed as psychosocial hazards under the WHS regulations, with supervision, debriefing after incidents and the Grievance and Disciplinary Policy.
- **First aid, PPE, vehicles and injury.** {% if wf.first_aid_all %}All workers hold a current first aid certificate.{% else %}At least one first-aid-qualified worker is rostered on every shift in every home until all workers are certified.{% endif %} Each home has a stocked first aid kit and the personal protective equipment identified in its risk assessments. {% if sup.transport %}Workers transporting participants hold a current licence, use registered, insured, serviced vehicles fitted with the restraints the participant needs, do not use a phone while driving, and report every vehicle incident.{% else %}{{ org.name }} does not currently transport participants in vehicles; vehicle controls are added to this policy before any transport begins.{% endif %} Injured workers receive first aid and medical care, workers compensation claims are lodged under the state scheme, and {{ org.name }} supports return to work.

## Roles and responsibilities

| Role | Responsibilities |
|---|---|
| {{ director }} | Holds the officer's due diligence duty; approves WHS resources; reviews WHS performance quarterly; approves this policy. |
| {{ whs_officer }} | Owns this policy; maintains the WHS Risk Register; leads consultation; notifies the regulator of notifiable incidents; manages workers compensation and return to work; arranges training on {{ training_platform }}; reports monthly to {{ director }}. |
| {{ quality_lead }} | Includes WHS in internal audits and the quarterly quality meeting; links WHS learning to the Continuous Improvement Register. |
| {{ rostering_manager }} | Builds safe rosters in {{ rostering_software }}; monitors fatigue and lone work; ensures on-call coverage every day. |
| {{ incident_officer }} | Records WHS incidents in {{ incident_software }}; investigates with {{ whs_officer }}. |
| House leaders | Complete home inspections; brief workers on hazards and participant-specific safe methods; run debriefs after incidents. |
| Workers | Take reasonable care; follow safe methods; use equipment and PPE; report hazards, incidents and fatigue; take part in consultation and training. |

## Procedure

### Part A — Hazard and incident reporting

1. Make the situation safe if this can be done without risk; give first aid; call 000 for any emergency.
2. Report the hazard, near miss or injury in {{ incident_software }} before the end of the shift, and phone the house leader or on-call manager during the shift for anything that caused or could cause injury.
3. The house leader adds hazards to the home's Maintenance Log or risk assessment and applies interim controls.
4. {{ whs_officer }} reviews every report within 2 business days, decides on controls using the hierarchy of controls, updates the Risk Register and assigns actions with due dates.
5. {{ incident_officer }} and {{ whs_officer }} investigate every injury and serious near miss under the Incident Management Policy and share the outcome at the next house meeting.

### Part B — Notifiable incidents

1. A notifiable incident is the death of a person; a serious injury or illness (for example one needing immediate in-patient treatment, or immediate treatment for amputation, serious head or eye injury, serious burn, spinal injury, loss of a bodily function or serious laceration, or medical treatment within 48 hours of exposure to a substance); or a dangerous incident such as an uncontrolled fire, electric shock, gas leak or structural collapse. It covers workers, participants and anyone else affected by {{ org.name }}'s work.
2. The worker phones the house leader immediately; the house leader phones {{ whs_officer }} and {{ director }}.
3. {{ whs_officer }} notifies the regulator immediately after becoming aware, by phone: {% for state in org.states %}{{ state }} — {{ regulator[state | upper] | default('[TO CONFIRM regulator]') }}{% if not loop.last %}; {% endif %}{% endfor %}; then in writing if the regulator asks{% if ns.vic %} (in Victoria a written record is also given to WorkSafe within 48 hours){% endif %}.
4. The site is preserved until an inspector arrives or the regulator says it need not be, except to help an injured person, make the area safe or as police direct.
5. {{ whs_officer }} keeps a record of the notification for at least 5 years, filed against the incident in {{ incident_software }}.
6. Where the person harmed is a participant, the Incident Management Policy also applies: death or serious injury of a participant is notified to the NDIS Commission within 24 hours. Regulator notification never replaces Commission notification.

### Part C — Working alone check-ins

1. Before a lone or overnight shift the worker confirms the on-call number and that their phone is charged.
2. The worker follows the check-in schedule in the home's risk assessment and records each check-in in {{ rostering_software }} or {{ incident_software }} as the home's instructions state.
3. A missed check-in triggers a call from the on-call manager within 15 minutes and, if there is no response, a visit or a police welfare check.

## Records kept

- WHS Risk Register and per-home risk assessments; manual handling assessments in support plans.
- Hazard, near miss and injury reports and investigations in {{ incident_software }}.
- Regulator notifications; workers compensation and return to work records.
- Consultation records; health and safety representative election records if any.
- Training Register entries (manual handling, first aid, de-escalation, infection control, emergency drills).
- Roster, fatigue and sleepover interruption records in {{ rostering_software }}; lone-worker check-in records.

## Related documents

- safe-environment-property
- incident-management
- risk-management
- emergency-disaster-management
- practice-governance-workforce-consistency
- restrictive-practices-behaviour-support
- waste-management-infection-control
- induction-training-competency
- supervision-performance
- grievance-disciplinary

## Legislation and standards references

{% for state in org.states %}- {{ whs_act[state | upper] | default('Work health and safety legislation of ' ~ state ~ ' [TO CONFIRM]') }} — duties, consultation, incident notification and site preservation
- {{ whs_reg[state | upper] | default('Work health and safety regulations of ' ~ state ~ ' [TO CONFIRM]') }} — including hazardous manual tasks and psychosocial risks
- {{ comp_act[state | upper] | default('Workers compensation legislation of ' ~ state ~ ' [TO CONFIRM]') }}
{% endfor %}- National Disability Insurance Scheme Act 2013 (Cth)
- NDIS (Provider Registration and Practice Standards) Rules 2018 — Core Module outcome 4.1 (safe environment); SIL supplementary module outcome 3 (practice governance and workforce)
- NDIS (Incident Management and Reportable Incidents) Rules 2018
- NDIS (Restrictive Practices and Behaviour Support) Rules 2018
- Fair Work Act 2009 (Cth); Social, Community, Home Care and Disability Services Industry Award 2010 (sleepover and rostering provisions)
- Safe Work Australia model codes of practice, including How to manage work health and safety risks, Hazardous manual tasks, and Managing psychosocial hazards at work (as adopted in each state)

## Review

This policy is reviewed every 12 months, after any notifiable incident, and when WHS legislation or codes change in any state where {{ org.name }} operates. Review owner: {{ whs_officer }}. Approval: {{ director }}.

## Document control

| Version | Approved by | Approval date | Next review |
|---|---|---|---|
| 1.0 | {{ director }} | [TO CONFIRM] | [TO CONFIRM — 12 months after approval] |
