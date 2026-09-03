---
title: Emergency and Disaster Management Plan (Organisational Plan and Per-Home Emergency Plans)
slug: emergency-disaster-management
doc_type: plan
standards: [core-2.8, sil-2]
applies_if: "true"
version: 1.0
review_months: 12
---
{% set gov = intake.governance %}{% set wf = intake.workforce %}{% set sup = intake.supports %}
{% set director = gov.ceo_or_director | default('[TO CONFIRM]', true) %}{% set quality_lead = gov.quality_lead | default('[TO CONFIRM]', true) %}{% set whs_officer = gov.whs_officer | default('[TO CONFIRM]', true) %}{% set rostering_manager = gov.rostering_manager | default('[TO CONFIRM]', true) %}{% set incident_officer = gov.incident_officer | default('[TO CONFIRM]', true) %}
{% set notes_software = wf.notes_software | default('[TO CONFIRM]', true) %}{% set rostering_software = wf.rostering_software | default('[TO CONFIRM]', true) %}{% set incident_software = wf.incident_software | default('[TO CONFIRM]', true) %}
{% set governing_body = 'the Board' if gov.has_board else 'the Director' %}
{% set em_act = {'NSW': 'State Emergency and Rescue Management Act 1989 (NSW)', 'VIC': 'Emergency Management Act 2013 (Vic)', 'QLD': 'Disaster Management Act 2003 (Qld)', 'SA': 'Emergency Management Act 2004 (SA)', 'WA': 'Emergency Management Act 2005 (WA)', 'TAS': 'Emergency Management Act 2006 (Tas)', 'ACT': 'Emergencies Act 2004 (ACT)', 'NT': 'Emergency Management Act 2013 (NT)'} %}
{% set ph_act = {'NSW': 'Public Health Act 2010 (NSW)', 'VIC': 'Public Health and Wellbeing Act 2008 (Vic)', 'QLD': 'Public Health Act 2005 (Qld)', 'SA': 'South Australian Public Health Act 2011 (SA)', 'WA': 'Public Health Act 2016 (WA)', 'TAS': 'Public Health Act 1997 (Tas)', 'ACT': 'Public Health Act 1997 (ACT)', 'NT': 'Public and Environmental Health Act 2011 (NT)'} %}
# Emergency and Disaster Management Plan (Organisational Plan and Per-Home Emergency Plans)

## Purpose

This plan sets out how {{ org.name }} prepares for, responds to and recovers from emergencies and disasters so that participants stay safe and their supports continue. It evidences the NDIS Practice Standards Core Module emergency and disaster management outcome (core-2.8), which requires planning that is developed with participants, considers their individual needs, ensures continuity of supports, is communicated to workers, and is periodically tested and reviewed, and the SIL supplementary module safeguarding outcome, which requires an emergency plan for each home.

## Scope

This plan applies to every home {{ org.name }} supports, to community and transport settings, to the office at {{ org.address }}, and to all workers ({{ wf.employment_types | join(', ') }}), key personnel, agency staff and contractors. Emergencies covered include fire, medical emergency, severe weather and natural disaster (storm, flood, bushfire, heatwave), utility failure (power, water, gas, telecommunications), pandemic or infectious disease outbreak, violence or intruder, missing participant, and any event that makes a home uninhabitable.

## Policy statement

- **Life safety first, then continuity.** Workers act to protect life, call 000, and follow the per-home plan before anything else; continuity of supports is restored under the Continuity of Supports Policy once people are safe.
- **Every home has its own plan.** Each home's emergency plan (below) reflects its layout, its roster model, its residents' needs and its local hazards, is displayed in the home, and is rehearsed with participants.
- **Every participant has a personal emergency profile.** The profile in {{ notes_software }} records mobility and evacuation assistance, communication method, medication and equipment that must travel with the participant, health conditions, sensory needs, behavioural triggers in an emergency, and who to contact.
- **Workers are ready.** Emergency procedures for each home are covered at induction and refreshed annually; drills are held at least every 6 months in each home, including at least one drill on an overnight shift; {% if wf.first_aid_all %}all workers hold current first aid and CPR certificates{% else %}at least one worker with a current first aid and CPR certificate is on every shift, and {{ org.name }} is working toward all workers holding one{% endif %}.
- **Plans are tested and improved.** Every drill and every real event is debriefed, recorded and used to update the plan.

## Roles and responsibilities

| Role | Responsibilities under this plan |
|---|---|
| Director — {{ director }} | Emergency Coordinator: declares an emergency, approves evacuation to alternative accommodation, authorises emergency spending, liaises with emergency services and the NDIS Commission, and speaks for {{ org.name }} publicly. |
| WHS Officer — {{ whs_officer }} | Deputy Emergency Coordinator; owns this plan; maintains per-home plans, equipment checks, drills and training; liaises with the SDA provider or landlord on fire safety. |
| Rostering Manager — {{ rostering_manager }} | Runs the worker call tree; re-rosters workers in {{ rostering_software }}; arranges transport and relief; tracks worker availability during a pandemic. |
| Incident Officer — {{ incident_officer }} | Records every emergency in {{ incident_software }}; assesses reportable incidents and WHS notifications. |
| Quality Lead — {{ quality_lead }} | Leads debriefs; records improvements; checks personal emergency profiles are current at each plan review. |
| House leaders | Chief warden for their home; keep the plan, emergency kit and contact list current; run drills; brief new workers on their first shift. |
| Workers on shift | Act as warden on the shift; follow the plan; account for every participant; communicate with the Emergency Coordinator; support participants' emotional needs. |

## Organisational plan

### Preparedness

1. {{ whs_officer }} confirms for each home that smoke alarms are interconnected and tested monthly, fire blankets and extinguishers are in date, exits are unobstructed, an emergency kit (torch, first aid kit, battery radio, phone charger, copies of participants' profiles and medication lists, water and non-perishable food for 3 days) is stocked, and the plan is displayed.
2. Each participant's personal emergency profile is completed at intake with the participant, and reviewed at each support plan review and after any change in health or mobility.
3. {{ rostering_manager }} keeps a current call tree of all workers and key personnel and an alternative accommodation list for each home (family, respite, another {{ org.name }} home, short-term accommodation) agreed with participants in advance.
4. Workers are trained at induction, and drills are run and recorded at least every 6 months in each home.
5. Before seasonal risks (bushfire season, storm season, heatwaves) {{ whs_officer }} briefs each home and checks supplies, and monitors warnings from the Bureau of Meteorology and the state emergency service.

### Response levels

| Level | Example | Who leads | Notifications |
|---|---|---|---|
| 1 — Local | Minor first aid; brief power outage; small contained fire | Worker on shift and house leader | House leader informs {{ rostering_manager }} the same shift; recorded in {{ incident_software }} |
| 2 — Home | Evacuation of one home; medical emergency requiring ambulance; severe weather affecting one home; outbreak in one home | House leader with {{ whs_officer }} | {{ director }} within 1 hour; families or guardians per each participant's profile; landlord or SDA provider for damage |
| 3 — Organisation | Disaster affecting several homes; pandemic restrictions; loss of a home; loss of communications or {{ notes_software }} for more than 24 hours | {{ director }} as Emergency Coordinator | NDIS Commission where supports are disrupted or a reportable incident occurs; state emergency services; insurers |

### Response and recovery

1. The worker on shift makes people safe, calls 000 where needed, follows the per-home plan, and accounts for every participant at the assembly point or safe location.
2. The worker phones the house leader and {{ rostering_manager }}; for level 2 or 3, {{ director }} is phoned immediately and takes coordination.
3. Participants are supported in their communication method, given their medication and equipment, and kept informed; families, guardians and nominees are contacted per the profile.
4. If the home cannot be reoccupied, {{ director }} activates the alternative accommodation list and the Continuity of Supports Policy, and {{ rostering_manager }} re-rosters workers to the new location.
5. The event is recorded in {{ incident_software }}; reportable incidents and WHS notifications are made within the Incident Management Policy timeframes.
6. Recovery includes repairs with the landlord or SDA provider, replacing medication and equipment, restoring records, debriefing participants and workers, offering counselling, and updating the plan within 30 days.

## Per-home emergency plans

{% for home in intake.homes %}
### {{ home.name }} — {{ home.address }}

| Item | Detail |
|---|---|
| Residents and roster | {{ home.participants }} participant{% if home.participants != 1 %}s{% endif %}; {% if home.roster_model == 'twenty_four_seven' %}24/7 staffing with an awake worker overnight{% elif home.roster_model == 'sleepover' %}sleepover roster: the overnight worker sleeps on site and must be woken by an alarm audible in the sleepover room{% elif home.roster_model == 'active_night' %}active night roster with an awake worker overnight{% elif home.roster_model == 'drop_in' %}drop-in roster: periods with no worker on site, so each participant's profile states how they raise an alarm and who responds{% else %}[TO CONFIRM roster model]{% endif %}{% if home.co_tenants %}; shared home{% endif %} |
| Housing contact | {% if home.tenancy_holder == 'provider' %}{{ org.name }} holds the tenancy; repairs through {{ director }}{% elif home.tenancy_holder == 'sda_provider' %}SDA provider [TO CONFIRM name and after-hours number]; SDA provider responsible for building fire safety systems{% elif home.tenancy_holder == 'private_landlord' %}Landlord or agent [TO CONFIRM name and after-hours number]{% elif home.tenancy_holder == 'participant' %}Participant's own home; repairs arranged with the participant{% else %}[TO CONFIRM]{% endif %} |
| Evacuation | Exits: [TO CONFIRM]. Assembly point: [TO CONFIRM]. Worker checks every bedroom and bathroom, takes the emergency kit and participant profiles, accounts for everyone at the assembly point and phones 000, then the house leader. Participants needing physical assistance and the order of evacuation: [TO CONFIRM from profiles]. |
| Medical emergency | Call 000; start first aid and CPR; use the participant's health plan{% if sup.medication_involvement != 'none' %} and medication chart{% endif %}{% if sup.mealtime_management %}; follow the mealtime management plan for choking{% endif %}; send the profile and medication list with the ambulance; phone {{ rostering_manager }} and the family or guardian; arrange cover for the other resident{% if home.participants != 1 %}s{% endif %}. Nearest hospital: [TO CONFIRM]. |
| Fire | Alert everyone, evacuate by the nearest safe exit, close doors, call 000 from outside; fight only a small fire with the blanket or extinguisher if trained and safe; never re-enter. Smoke alarm and equipment check dates: [TO CONFIRM]. |
| Severe weather and natural disaster | Monitor Bureau of Meteorology and {{ home.state }} emergency service warnings; secure outdoor items; charge phones and devices; check medication and food supply for 3 days; follow official advice to shelter or leave early, using the alternative accommodation list. Local hazards (flood, bushfire, storm): [TO CONFIRM]. |
| Utility failure | Power: check the switchboard, report to the supplier, use torches, protect refrigerated medication, and move any participant who depends on powered equipment to the alternative accommodation if power is not restored within [TO CONFIRM] hours. Water or gas: report to the supplier; stop use; ventilate for gas and evacuate if a leak is suspected. Phone or internet: use mobile phones; record notes on paper and enter them in {{ notes_software }} later. Supplier numbers: [TO CONFIRM]. |
| Pandemic or outbreak | Isolate the unwell person where possible; use PPE and hand hygiene; notify {{ rostering_manager }} and the public health unit where required; limit visitors as advised; roster a consistent team to the home; maintain 2 weeks of PPE and essential supplies; follow the Continuity of Supports Policy for worker shortages. |
| Participant-specific needs | For each resident: evacuation assistance, communication method, medication and equipment to take, health conditions, likely reactions and calming strategies, emergency contacts, and any advance care directive — recorded in the personal emergency profile in {{ notes_software }} and summarised on the plan displayed in the home: [TO CONFIRM]. |
| Drill record | Last drill: [TO CONFIRM]; next drill due within 6 months; overnight drill: [TO CONFIRM]. |

{% else %}
[TO CONFIRM — no homes recorded in the intake; complete one per-home plan for each home.]
{% endfor %}

## Records kept

- This plan and each per-home plan, displayed in the home and stored in the policy folder
- Personal emergency profiles in {{ notes_software }}
- Equipment check and smoke alarm test records; emergency kit checklists
- Drill records, debrief notes and improvements in the Continuous Improvement Register
- Emergency event records in {{ incident_software }}; Commission, WHS regulator and insurer notifications
- Worker training records for emergency procedures and first aid; call tree and alternative accommodation list

## Related documents

- Continuity of Supports Policy
- Incident Management Policy and Procedure (including Reportable Incidents)
- Risk Management Policy and Framework (house-level risk assessment)
- Safe Environment and Property Policy; Work Health and Safety Policy
- Medication Management Policy; Health and Wellbeing Policy
- Waste Management and Infection Control Policy
- Practice Governance and Workforce Consistency Policy (sleepover and active night rules)

## Legislation and standards references

- National Disability Insurance Scheme Act 2013 (Cth)
- NDIS (Provider Registration and Practice Standards) Rules 2018 — NDIS Practice Standards, Core Module emergency and disaster management outcome
- NDIS Practice Standards, SIL supplementary module (registration group 0138, 2026), safeguarding outcome
- NDIS (Incident Management and Reportable Incidents) Rules 2018
- NDIS (Code of Conduct) Rules 2018 — the NDIS Code of Conduct
- AS 3745-2010 Planning for emergencies in facilities (used as guidance)
- Biosecurity Act 2015 (Cth) (human biosecurity emergencies)
{% for state in org.states %}
- {{ em_act[state | upper] | default('Emergency management legislation of ' ~ state ~ ' [TO CONFIRM]') }}; {{ ph_act[state | upper] | default('Public health legislation of ' ~ state ~ ' [TO CONFIRM]') }}; work health and safety legislation of {{ state }} as cited in the Work Health and Safety Policy; state fire safety and smoke alarm requirements for residential premises
{% endfor %}

## Review

Reviewed every 12 months by the WHS Officer ({{ whs_officer }}) and approved by {{ governing_body }}; each per-home plan is reviewed after every drill and real event, when a resident moves in or out, and when the roster model or housing arrangement changes.

## Document control

| Version | Drafted | Approved by | Approval date | Next review |
|---|---|---|---|---|
| 1.0 | {{ intake.meta.generated_on | date }} | {{ director }} | [TO CONFIRM on adoption] | 12 months after approval |
