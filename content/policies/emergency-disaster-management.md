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
This plan sets out how {{ org.name }} prepares for, responds to and recovers from emergencies and disasters so that participants stay safe and their supports continue. It evidences the NDIS Practice Standards Core Module emergency and disaster management outcome (core-2.8) — planning developed with participants, reflecting individual needs, ensuring continuity, communicated to workers and periodically tested — and the SIL supplementary module safeguarding outcome, which requires an emergency plan for each home.

## Scope
This plan applies to every home {{ org.name }} supports, community and transport settings, the office at {{ org.address }}, and all workers ({{ wf.employment_types | join(', ') }}), key personnel, agency staff and contractors. It covers fire, medical emergency, severe weather and natural disaster, utility failure, pandemic or outbreak, violence or intruder, missing participant, and any event that makes a home uninhabitable.

## Policy statement
- **Life safety first, then continuity.** Workers protect life, call 000 and follow the per-home plan; supports are restored under the Continuity of Supports Policy once people are safe.
- **Every home has its own plan**, reflecting its layout, roster model, residents' needs and local hazards, displayed in the home and rehearsed with participants.
- **Every participant has a personal emergency profile** in {{ notes_software }}: evacuation assistance, communication method, medication and equipment that must travel with them, health conditions, sensory and behavioural needs, and contacts.
- **Workers are ready.** Procedures are covered at induction and refreshed annually; drills are held at least every 6 months in each home, including one on an overnight shift; {% if wf.first_aid_all %}all workers hold current first aid and CPR certificates{% else %}at least one worker with a current first aid and CPR certificate is on every shift{% endif %}.
- **Plans are tested and improved.** Every drill and real event is debriefed, recorded and used to update the plan.

## Roles and responsibilities
| Role | Responsibilities under this plan |
|---|---|
| Director — {{ director }} | Emergency Coordinator: declares an emergency, approves evacuation to alternative accommodation and emergency spending, liaises with emergency services and the NDIS Commission, speaks publicly. |
| WHS Officer — {{ whs_officer }} | Deputy Emergency Coordinator; owns this plan and the per-home plans, equipment checks, drills and training; liaises with the SDA provider or landlord on fire safety. |
| Rostering Manager — {{ rostering_manager }} | Runs the call tree; re-rosters workers in {{ rostering_software }}; arranges transport and relief. |
| Incident Officer — {{ incident_officer }}; Quality Lead — {{ quality_lead }} | Record events in {{ incident_software }} and assess reportable incidents and WHS notifications; lead debriefs; check profiles at each plan review. |
| House leaders | Chief warden for their home; keep the plan, kit and contacts current; run drills; brief new workers on their first shift. |
| Workers on shift | Warden for the shift; follow the plan; account for every participant; communicate with the Emergency Coordinator; support participants emotionally. |

## Organisational plan

### Preparedness
1. {{ whs_officer }} confirms for each home that smoke alarms are interconnected and tested monthly, fire blankets and extinguishers are in date, exits are clear, the plan is displayed, and an emergency kit (torch, first aid kit, battery radio, charger, copies of profiles and medication lists, water and food for 3 days) is stocked.
2. Each participant's personal emergency profile is completed at intake with the participant and reviewed at each plan review and after any change in health or mobility.
3. {{ rostering_manager }} keeps a current call tree and, for each home, an alternative accommodation list agreed with participants in advance.
4. Workers are trained at induction; drills are run at least every 6 months in each home; before bushfire, storm and heatwave seasons {{ whs_officer }} briefs each home and checks supplies.

### Response levels
| Level | Example | Who leads | Notifications |
|---|---|---|---|
| 1 — Local | Minor first aid; brief power outage; small contained fire | Worker on shift and house leader | {{ rostering_manager }} the same shift; {{ incident_software }} record |
| 2 — Home | Evacuation of one home; ambulance; severe weather or outbreak in one home | House leader with {{ whs_officer }} | {{ director }} within 1 hour; families or guardians per profile; landlord or SDA provider for damage |
| 3 — Organisation | Disaster affecting several homes; pandemic restrictions; loss of a home; loss of {{ notes_software }} for over 24 hours | {{ director }} as Emergency Coordinator | NDIS Commission where supports are disrupted or a reportable incident occurs; emergency services; insurers |

### Response and recovery
1. The worker on shift makes people safe, calls 000 where needed, follows the per-home plan and accounts for every participant at the assembly point or safe location.
2. The worker phones the house leader and {{ rostering_manager }}; for level 2 or 3, {{ director }} is phoned immediately and takes coordination.
3. Participants are supported in their communication method, given their medication and equipment and kept informed; families, guardians and nominees are contacted per the profile.
4. If the home cannot be reoccupied, {{ director }} activates the alternative accommodation list and the Continuity of Supports Policy, and {{ rostering_manager }} re-rosters workers to the new location.
5. The event is recorded in {{ incident_software }} and reportable incidents and WHS notifications are made within the Incident Management Policy timeframes. Recovery covers repairs, replacing medication and equipment, restoring records, debriefing participants and workers, and updating the plan within 30 days.

## Per-home emergency plans
{% for home in intake.homes %}
### {{ home.name }} — {{ home.address }}

| Item | Detail |
|---|---|
| Residents, roster and drills | {{ home.participants }} participant{% if home.participants != 1 %}s{% endif %}; {% if home.roster_model == 'twenty_four_seven' %}24/7 staffing with an awake worker overnight{% elif home.roster_model == 'sleepover' %}sleepover roster: the overnight worker sleeps on site and must be woken by an alarm audible in the sleepover room{% elif home.roster_model == 'active_night' %}active night roster with an awake worker overnight{% elif home.roster_model == 'drop_in' %}drop-in roster: periods with no worker on site, so each profile states how the participant raises an alarm and who responds{% else %}[TO CONFIRM roster model]{% endif %}{% if home.co_tenants %}; shared home{% endif %}. Last drill: [TO CONFIRM]; next within 6 months, including one overnight. |
| Housing contact | {% if home.tenancy_holder == 'provider' %}{{ org.name }} holds the tenancy; repairs through {{ director }}{% elif home.tenancy_holder == 'sda_provider' %}SDA provider [TO CONFIRM name and after-hours number], responsible for building fire safety systems{% elif home.tenancy_holder == 'private_landlord' %}Landlord or agent [TO CONFIRM name and after-hours number]{% elif home.tenancy_holder == 'participant' %}Participant's own home; repairs arranged with the participant{% else %}[TO CONFIRM]{% endif %} |
| Evacuation and fire | Exits and assembly point: [TO CONFIRM]. Alert everyone, evacuate by the nearest safe exit, close doors, take the kit and profiles, account for everyone, call 000 from outside, then the house leader; fight only a small fire if trained and safe; never re-enter. Evacuation order and assistance: [TO CONFIRM from profiles]. |
| Medical emergency | Call 000; first aid and CPR; follow the health plan{% if sup.medication_involvement != 'none' %}, medication chart{% endif %}{% if sup.mealtime_management %} and mealtime management plan{% endif %}; send the profile and medication list with the ambulance; phone {{ rostering_manager }} and family or guardian; cover other residents. Nearest hospital: [TO CONFIRM]. |
| Severe weather and natural disaster | Monitor Bureau of Meteorology and {{ home.state }} emergency service warnings; secure outdoor items; charge devices; hold 3 days of medication and food; shelter or leave early as advised. Local hazards: [TO CONFIRM]. |
| Utility failure | Power: report, use torches, protect refrigerated medication, relocate anyone dependent on powered equipment if not restored within [TO CONFIRM] hours. Gas or water: report, stop use, evacuate for a suspected gas leak. Phone or internet: use mobiles and paper records. Supplier numbers: [TO CONFIRM]. |
| Pandemic or outbreak | Isolate where possible; PPE and hand hygiene; notify {{ rostering_manager }} and the public health unit where required; limit visitors as advised; consistent team; 2 weeks of PPE held. |
| Participant-specific needs | Per resident: evacuation assistance, communication, medication and equipment, health conditions, likely reactions and calming strategies, contacts and any advance care directive, from the profile in {{ notes_software }}: [TO CONFIRM]. |

{% else %}
[TO CONFIRM — no homes recorded in the intake; complete one per-home plan for each home.]
{% endfor %}

## Records kept
- This plan and each per-home plan (displayed in the home); personal emergency profiles in {{ notes_software }}; call tree and alternative accommodation lists
- Equipment and smoke alarm checks; kit checklists; drill and debrief records; emergency events in {{ incident_software }}; regulator and insurer notifications; training records

## Related documents
- Continuity of Supports Policy; Incident Management Policy and Procedure
- Risk Management Policy and Framework; Safe Environment and Property Policy; Work Health and Safety Policy
- Medication Management Policy; Health and Wellbeing Policy; Waste Management and Infection Control Policy
- Practice Governance and Workforce Consistency Policy (sleepover and active night rules)

## Legislation and standards references
- National Disability Insurance Scheme Act 2013 (Cth)
- NDIS (Provider Registration and Practice Standards) Rules 2018 — NDIS Practice Standards, Core Module emergency and disaster management outcome; SIL supplementary module (registration group 0138, 2026), safeguarding outcome
- NDIS (Incident Management and Reportable Incidents) Rules 2018; NDIS (Code of Conduct) Rules 2018
- AS 3745-2010 Planning for emergencies in facilities (used as guidance); Biosecurity Act 2015 (Cth)
{% for state in org.states %}
- {{ em_act[state | upper] | default('Emergency management legislation of ' ~ state ~ ' [TO CONFIRM]') }}; {{ ph_act[state | upper] | default('Public health legislation of ' ~ state ~ ' [TO CONFIRM]') }}; work health and safety legislation of {{ state }}; state smoke alarm requirements for residential premises
{% endfor %}

## Review

Reviewed every 12 months by the WHS Officer ({{ whs_officer }}) and approved by {{ governing_body }}; each per-home plan is reviewed after every drill and real event, when a resident moves in or out, and when the roster model or housing arrangement changes.

## Document control

| Version | Drafted | Approved by | Approval date | Next review |
|---|---|---|---|---|
| 1.0 | {{ intake.meta.generated_on | date }} | {{ director }} | [TO CONFIRM on adoption] | 12 months after approval |
