---
title: Safe Environment and Property Maintenance Policy
slug: safe-environment-property
doc_type: policy
standards: [core-4.1, sil-2]
applies_if: "true"
version: 1.0
review_months: 12
---
{% set gov = intake.governance %}{% set wf = intake.workforce %}{% set sup = intake.supports %}
{% set director = gov.ceo_or_director | default('[TO CONFIRM]', true) %}{% set quality_lead = gov.quality_lead | default('[TO CONFIRM]', true) %}{% set whs_officer = gov.whs_officer | default('[TO CONFIRM]', true) %}{% set rostering_manager = gov.rostering_manager | default('[TO CONFIRM]', true) %}{% set incident_officer = gov.incident_officer | default('[TO CONFIRM]', true) %}
{% set incident_software = wf.incident_software | default('[TO CONFIRM]', true) %}{% set notes_software = wf.notes_software | default('[TO CONFIRM]', true) %}
{% set whs_act = {'NSW': 'Work Health and Safety Act 2011 (NSW)', 'VIC': 'Occupational Health and Safety Act 2004 (Vic)', 'QLD': 'Work Health and Safety Act 2011 (Qld)', 'SA': 'Work Health and Safety Act 2012 (SA)', 'TAS': 'Work Health and Safety Act 2012 (Tas)', 'ACT': 'Work Health and Safety Act 2011 (ACT)', 'NT': 'Work Health and Safety (National Uniform Legislation) Act 2011 (NT)', 'WA': 'Work Health and Safety Act 2020 (WA)'} %}
{% set tenancy_act = {'NSW': 'Residential Tenancies Act 2010 (NSW)', 'VIC': 'Residential Tenancies Act 1997 (Vic)', 'QLD': 'Residential Tenancies and Rooming Accommodation Act 2008 (Qld)', 'WA': 'Residential Tenancies Act 1987 (WA)', 'SA': 'Residential Tenancies Act 1995 (SA)', 'TAS': 'Residential Tenancy Act 1997 (Tas)', 'ACT': 'Residential Tenancies Act 1997 (ACT)', 'NT': 'Residential Tenancies Act 1999 (NT)'} %}
{% set roster_label = {'twenty_four_seven': '24/7 awake staff', 'sleepover': 'sleepover overnight', 'active_night': 'active night overnight', 'drop_in': 'drop-in, no staff overnight'} %}
{% set holder_label = {'provider': org.name ~ ' (provider is tenancy holder)', 'sda_provider': 'SDA provider', 'private_landlord': 'private landlord or agent', 'participant': 'participant (owns or holds the lease)'} %}
# Safe Environment and Property Maintenance Policy

## Purpose

Core Module outcome 4.1 requires that each participant lives in, and each worker works in, a safe environment, and SIL supplementary module outcome 2 requires safeguarding arrangements for each home. This policy sets out how {{ org.name }} keeps each of its {{ intake.homes | length }} home{% if intake.homes | length != 1 %}s{% endif %} safe, accessible and maintained: who is responsible for what, how hazards are found and fixed, how maintenance is tracked, and how safety is balanced with the fact that each home is first the participants' home. It includes the Hazard Inspection Checklist and Maintenance Log templates.

## Scope

This policy applies to every home where {{ org.name }} delivers SIL supports, to the equipment{% if sup.transport %} and vehicles{% endif %} it provides, and to every worker, key personnel, contractor and visitor. Workplace duties are covered in the Work Health and Safety Policy; infection control in the Waste Management and Infection Control Policy.

## Policy statement

- **A home first, a workplace second.** Safety measures are chosen with the participants, respect how they choose to live, and never restrict their access to their own home or belongings. Any measure that restricts a participant's free access to any part of the home (locked kitchens, fridges, doors or gates) is an environmental restraint managed under the Restrictive Practices and Behaviour Support Policy.
- **Responsibilities depend on who holds the tenancy.** Structural repairs, fixed appliances, smoke alarms, electrical safety and compliance with the tenancy law of the state belong to the tenancy holder or landlord. {{ org.name }} is responsible for the equipment it supplies, how its workers use the home, prompt reporting of defects, and following up until they are fixed.
- **Every home is inspected.** The house leader completes the Hazard Inspection Checklist monthly and {{ whs_officer }} completes an independent inspection every 6 months. Findings go on the Maintenance Log or, where harm has occurred or could occur, into {{ incident_software }}.
- **Fix it fast.** Urgent hazards (gas, electrical, fire, security, no hot water, no heating or cooling in extreme weather, sewerage, a participant unable to move safely) are made safe immediately and reported to the tenancy holder and {{ whs_officer }} the same day; non-urgent items are logged and followed until closed.
- **Fire and emergency readiness.** Every home has working smoke alarms, an evacuation diagram, a fire blanket and any extinguisher the risk assessment requires, clear exits and a per-home emergency plan under the Emergency and Disaster Management Plan; drills run at least every 6 months.
- **Equipment, hot water, chemicals and security.** Hoists, beds, shower chairs and wheelchairs are checked before use, serviced as the manufacturer requires and tagged out when faulty; portable electrical equipment supplied by {{ org.name }} is tested and tagged. Hot water at bathing outlets is kept at a temperature safe for each participant's assessed needs. Chemicals are stored safely with safety data sheets. Keys are controlled by the house leader, key holders are recorded, and locks are changed when a key is lost.
- **Accessibility.** Modifications are identified in each participant's support plan and pursued with the participant, their occupational therapist, the tenancy holder and the NDIA.

## Homes covered by this policy

| Home | Address | State and WHS law | Tenancy holder (structural repairs) | SDA | Overnight model | Shared |
|---|---|---|---|---|---|---|
{% for home in intake.homes %}| {{ home.name | default('[TO CONFIRM]', true) }} | {{ home.address | default('[TO CONFIRM]', true) }} | {{ home.state | default('[TO CONFIRM]', true) }} — {{ whs_act[home.state | upper] | default('WHS legislation [TO CONFIRM]') }} | {{ holder_label[home.tenancy_holder] | default('[TO CONFIRM]') }} | {% if home.sda %}Yes{% else %}No{% endif %} | {{ roster_label[home.roster_model] | default('[TO CONFIRM]') }} | {% if home.co_tenants %}Yes ({{ home.participants }} participants){% else %}No ({{ home.participants }} participant{% if home.participants != 1 %}s{% endif %}){% endif %} |
{% endfor %}

{% for home in intake.homes %}
**{{ home.name }}.** {% if home.tenancy_holder == 'provider' %}{{ org.name }} holds the tenancy and so carries the landlord's or head tenant's maintenance duties under the {{ tenancy_act[home.state | upper] | default('residential tenancies legislation [TO CONFIRM]') }} as well as its support duties; {{ director }} keeps the two roles separate under the Tenancy, Housing and Support Separation Policy.{% elif home.tenancy_holder == 'sda_provider' %}The SDA provider is responsible for the dwelling, fixed equipment and its SDA design category features; {{ org.name }} reports defects to the SDA provider's nominated contact and records response times on the Maintenance Log.{% elif home.tenancy_holder == 'private_landlord' %}The participant's landlord or agent is responsible for repairs under the {{ tenancy_act[home.state | upper] | default('residential tenancies legislation [TO CONFIRM]') }}; {{ org.name }} supports the participant to request repairs and, with consent, contacts the agent for them.{% elif home.tenancy_holder == 'participant' %}The participant owns or holds the lease; {{ org.name }} supports them to arrange repairs and does no works without their agreement.{% else %}Responsibility for repairs is [TO CONFIRM].{% endif %} Every inspection also covers {% if home.roster_model == 'drop_in' %}the participant's emergency plan and on-call arrangements, as no worker is on site overnight{% elif home.roster_model == 'sleepover' %}the sleepover room, bedding and the worker's means of summoning help{% else %}overnight worker facilities and lighting{% endif %}.

{% endfor %}
## Roles and responsibilities

| Role | Responsibilities |
|---|---|
| {{ director }} | Approves safety and maintenance spending; escalates unresolved landlord or SDA provider defects; approves this policy. |
| {{ whs_officer }} | Owns this policy; completes 6-monthly inspections; reviews the Maintenance Log monthly; arranges test-and-tag, equipment servicing and fire equipment checks. |
| {{ quality_lead }} | Reports environment findings at the quarterly quality meeting; audits inspection completion across homes. |
| {{ rostering_manager }} | Ensures each home has a house leader; coordinates tradesperson access with participants. |
| {{ incident_officer }} | Records hazard-related incidents and near misses in {{ incident_software }}. |
| House leaders | Complete monthly inspections; keep the Maintenance Log and key register; brief workers on hazards; involve participants. |
| Support workers | Check the home each shift; make hazards safe; report every hazard, breakage or near miss the same shift; use equipment as trained. |

## Procedure

1. At the start of every shift the worker walks through shared areas, checks exits are clear, and records any hazard in {{ notes_software }} and, if a repair is needed, on the Maintenance Log.
2. Each month the house leader, with any participant who wishes to take part, completes the Hazard Inspection Checklist; every "No" becomes a Maintenance Log entry or an incident report.
3. The house leader rates each entry urgent (make safe now, report same day, repair within 24 hours), priority (7 days) or routine (30 days), and sends it to the tenancy holder or arranges the repair where it is {{ org.name }}'s responsibility.
4. {{ whs_officer }} reviews every home's Maintenance Log monthly, chases overdue items, and escalates to {{ director }} any urgent item open beyond 24 hours or routine item open beyond 30 days.
5. Where a landlord or SDA provider does not act, {{ director }} supports the participant to use their rights under the tenancy law of the state, including tenancy advice services and the relevant tribunal, and records the steps taken.
6. Every 6 months {{ whs_officer }} inspects each home independently, checks smoke alarms, fire equipment, test-and-tag currency, equipment service records and the evacuation diagram, and runs or reviews the emergency drill.
7. Any hazard that causes harm, or a near miss, is reported in {{ incident_software }} under the Incident Management Policy and, where notifiable, to the WHS regulator under the Work Health and Safety Policy.
8. {{ quality_lead }} reports open hazards, overdue repairs and hazard-related incidents by home at the quarterly quality meeting.

## Hazard inspection checklist template

| Area | Check | Yes / No | Action and Maintenance Log reference |
|---|---|---|---|
| Entry and exits | Exit paths clear; doors open freely from inside; external lighting works; paths and steps sound | (example — delete) Yes | — |
| Fire safety | Smoke alarms tested and in date; fire blanket and extinguisher present; evacuation diagram current; drill within 6 months | | |
| Electrical | No damaged cords or overloaded boards; test-and-tag current; safety switch tested | | |
| Kitchen and bathrooms | Hot water safe; appliances working; food stored safely; non-slip surfaces; grab rails secure; shower equipment sound | | |
| Bedrooms | Bed and equipment safe; call or alert system works; privacy respected | | |
| Equipment | Hoists, slings, wheelchairs and beds serviced; faulty items tagged out | | |
| Chemicals and medication storage | Cleaning products secured with safety data sheets{% if sup.medication_involvement != 'none' %}; medication stored as the Medication Management Policy requires{% endif %} | | |
| Outdoors and security | Fences, gates and paths sound; keys accounted for; locks and windows secure; no unauthorised environmental restrictions | | |
| Worker facilities and emergency information | Overnight facilities safe and private where used; on-call number, emergency plan and participant emergency needs displayed | | |
| Completed by, participant involved, date | | | |

## Maintenance log template

| Log no. | Date raised | Home | Item and location | Reported by | Priority | Responsible | Reported to and date | Target date | Date fixed | Verified by |
|---|---|---|---|---|---|---|---|---|---|---|
| ML-001 (example — delete) | 01/08/2026 | {% if intake.homes | length > 0 %}{{ intake.homes[0].name }}{% else %}[home]{% endif %} | Rear step loose | J. Worker | Urgent | Tenancy holder | Agent, 01/08/2026 | 02/08/2026 | 02/08/2026 | House leader |

## Records kept

- Monthly Hazard Inspection Checklists and 6-monthly inspection reports for each home.
- Maintenance Log for each home, including correspondence with tenancy holders.
- Test-and-tag, equipment service, smoke alarm and fire equipment records; key register; drill records.
- Hazard-related incident and near-miss reports in {{ incident_software }}.

## Related documents

- whs-work-health-safety
- restrictive-practices-behaviour-support
- emergency-disaster-management
- risk-management
- incident-management
- waste-management-infection-control
- tenancy-housing-support-separation
- medication-management

## Legislation and standards references

- National Disability Insurance Scheme Act 2013 (Cth)
- NDIS (Provider Registration and Practice Standards) Rules 2018 — Core Module outcome 4.1 (safe environment); SIL supplementary module outcome 2 (safeguarding)
- NDIS (Restrictive Practices and Behaviour Support) Rules 2018 (environmental restraint)
- NDIS (Specialist Disability Accommodation) Rules 2020
- NDIS Code of Conduct (NDIS (Code of Conduct) Rules 2018)
{% for state in org.states %}- {{ whs_act[state | upper] | default('Work health and safety legislation of ' ~ state ~ ' [TO CONFIRM]') }}
- {{ tenancy_act[state | upper] | default('Residential tenancies legislation of ' ~ state ~ ' [TO CONFIRM]') }} (landlord repair and smoke alarm obligations)
{% endfor %}

## Review

This policy is reviewed every 12 months, after any hazard-related injury, and whenever {{ org.name }} starts supporting a new home. Review owner: {{ whs_officer }}. Approval: {{ director }}.

## Document control

| Version | Approved by | Approval date | Next review |
|---|---|---|---|
| 1.0 | {{ director }} | [TO CONFIRM] | [TO CONFIRM — 12 months after approval] |
