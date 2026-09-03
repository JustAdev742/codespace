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

Core Module outcome 4.1 requires that each participant lives in, and each worker works in, a safe environment. SIL supplementary module outcome 2 requires safeguarding arrangements for each home. This policy sets out how {{ org.name }} keeps each of its {{ intake.homes | length }} home{% if intake.homes | length != 1 %}s{% endif %} safe, accessible and well maintained: who is responsible for what in each home, how hazards are found and fixed, how maintenance is requested and tracked, and how safety is balanced with the fact that each home is first and foremost the participants' home. It includes the Hazard Inspection Checklist and Maintenance Log templates.

## Scope

This policy applies to every home where {{ org.name }} delivers SIL supports, to the vehicles{% if sup.transport %} {{ org.name }} uses to transport participants{% endif %} and equipment it provides, and to every worker, key personnel, contractor and visitor. Workplace duties under work health and safety law are covered in detail in the Work Health and Safety Policy; this policy covers the home environment itself.

## Policy statement

- **A home first, a workplace second.** Each home is the participants' private home. Safety measures are chosen with the participants, respect their decisions about how they live, and never become restrictions on their access to their own home or belongings. Any measure that restricts a participant's free access to any part of the home (locked kitchens, fridges, doors or gates) is an environmental restraint and is managed under the Restrictive Practices and Behaviour Support Policy, not this policy.
- **Responsibilities depend on who holds the tenancy.** Structural repairs, fixed appliances, smoke alarms, electrical safety and compliance with the tenancy law of the state are the tenancy holder's or landlord's obligations. {{ org.name }} is responsible for the equipment it supplies, the way its workers use the home, prompt reporting of defects, and following up until they are fixed.
- **Every home is inspected.** The house leader completes the Hazard Inspection Checklist for each home every month, and {{ whs_officer }} completes an independent inspection every 6 months. Findings are entered on the Maintenance Log or, where a hazard has caused or could cause harm, reported in {{ incident_software }}.
- **Fix it fast.** Urgent hazards (gas, electrical, fire, security, no hot water, no heating or cooling in extreme weather, sewerage, a participant unable to move safely) are made safe immediately and reported to the tenancy holder and {{ whs_officer }} the same day. Non-urgent items are logged and followed up until closed.
- **Fire and emergency readiness.** Every home has working smoke alarms, an evacuation diagram, a fire blanket and extinguisher where the risk assessment requires, clear exit paths, and a per-home emergency plan under the Emergency and Disaster Management Plan; drills are run at least every 6 months.
- **Equipment is safe.** Hoists, beds, shower chairs, wheelchairs and other equipment are used only as trained, checked before use, serviced as the manufacturer requires, and tagged out when faulty. Portable electrical equipment supplied by {{ org.name }} is tested and tagged.
- **Hot water, chemicals and food.** Hot water at bathing outlets is kept at a temperature that is safe for each participant's assessed needs; cleaning chemicals are stored safely with safety data sheets available; food is stored and prepared hygienically under the Waste Management and Infection Control Policy{% if sup.mealtime_management %} and the Mealtime Management Policy{% endif %}.
- **Security and privacy.** Keys are controlled by the house leader, key holders are recorded, locks are changed when a key is lost or a worker leaves without returning one, and participants control who enters their bedroom.
- **Accessibility.** Modifications and accessibility needs are identified in each participant's support plan and pursued with the participant, their occupational therapist, the tenancy holder and the NDIA.

## Homes covered by this policy

| Home | Address | State and WHS law | Tenancy holder (structural repairs) | SDA | Overnight model | Shared |
|---|---|---|---|---|---|---|
{% for home in intake.homes %}| {{ home.name | default('[TO CONFIRM]', true) }} | {{ home.address | default('[TO CONFIRM]', true) }} | {{ home.state | default('[TO CONFIRM]', true) }} — {{ whs_act[home.state | upper] | default('WHS legislation [TO CONFIRM]') }} | {{ holder_label[home.tenancy_holder] | default('[TO CONFIRM]') }} | {% if home.sda %}Yes — SDA provider's design category and maintenance obligations apply{% else %}No{% endif %} | {{ roster_label[home.roster_model] | default('[TO CONFIRM]') }} | {% if home.co_tenants %}Yes ({{ home.participants }} participants){% else %}No ({{ home.participants }} participant{% if home.participants != 1 %}s{% endif %}){% endif %} |
{% endfor %}

{% for home in intake.homes %}
**{{ home.name }}.** {% if home.tenancy_holder == 'provider' %}{{ org.name }} holds the tenancy, so it carries the landlord's or head tenant's maintenance duties under the {{ tenancy_act[home.state | upper] | default('residential tenancies legislation [TO CONFIRM]') }} as well as its duties as support provider; {{ director }} keeps the two roles separate as set out in the Tenancy, Housing and Support Separation Policy.{% elif home.tenancy_holder == 'sda_provider' %}The SDA provider is responsible for the dwelling, fixed equipment and the features of its SDA design category; {{ org.name }} reports defects to the SDA provider's nominated contact and records the response time on the Maintenance Log.{% elif home.tenancy_holder == 'private_landlord' %}The participant's landlord or agent is responsible for repairs under the {{ tenancy_act[home.state | upper] | default('residential tenancies legislation [TO CONFIRM]') }}; {{ org.name }} supports the participant to request repairs and, with consent, contacts the agent on their behalf.{% elif home.tenancy_holder == 'participant' %}The participant owns or holds the lease for this home; {{ org.name }} supports the participant to arrange repairs and does not carry out works without their agreement.{% else %}Responsibility for repairs is [TO CONFIRM].{% endif %} {% if home.roster_model == 'drop_in' %}No worker is on site overnight, so the participant's emergency plan and on-call arrangements are checked at every inspection.{% elif home.roster_model == 'sleepover' %}The sleepover room, bedding and the worker's means of summoning help are included in every inspection.{% else %}Overnight worker facilities and lighting are included in every inspection.{% endif %}
{% endfor %}

## Roles and responsibilities

| Role | Responsibilities |
|---|---|
| {{ director }} | Approves spending on safety and maintenance; escalates unresolved landlord or SDA provider defects; approves this policy. |
| {{ whs_officer }} | Owns this policy; completes 6-monthly independent inspections; reviews the Maintenance Log monthly; arranges test-and-tag, equipment servicing and fire equipment checks; reports safety trends to {{ quality_lead }}. |
| {{ quality_lead }} | Includes environment findings in the quarterly quality meeting; audits inspection completion across homes. |
| {{ rostering_manager }} | Ensures each home has a house leader and that inspection duties are rostered; coordinates access for tradespeople with participants. |
| {{ incident_officer }} | Records hazard-related incidents and near misses in {{ incident_software }}. |
| House leaders | Complete monthly inspections; keep the Maintenance Log for their home; control keys; brief workers on hazards; involve participants in inspections and decisions. |
| Support workers | Check the home at the start of each shift; make hazards safe; report every hazard, breakage or near miss the same shift; use equipment as trained. |

## Procedure

1. At the start of every shift, the worker walks through shared areas, checks exits are clear, and records any hazard in {{ notes_software }} and, if it needs a repair, on the Maintenance Log.
2. Each month the house leader and at least one participant who wishes to take part complete the Hazard Inspection Checklist for the home. Every "No" answer becomes a Maintenance Log entry or an incident report.
3. The house leader rates each Maintenance Log entry: urgent (make safe now, report same day, target repair within 24 hours), priority (target 7 days) or routine (target 30 days), and sends the request to the tenancy holder or arranges the repair where it is {{ org.name }}'s responsibility.
4. {{ whs_officer }} reviews the Maintenance Log for every home each month, chases overdue items with the tenancy holder, and escalates to {{ director }} any urgent item not fixed within 24 hours or any routine item open for more than 30 days.
5. Where a landlord or SDA provider does not act, {{ director }} supports the participant to use their rights under the tenancy law of the state, including tenancy advice services and the relevant tribunal, and records the steps taken.
6. Every 6 months {{ whs_officer }} completes an independent inspection of each home, checks smoke alarms, fire equipment, test-and-tag currency, equipment service records and the evacuation diagram, and runs or reviews the emergency drill.
7. Any hazard that has caused harm, or a near miss, is reported in {{ incident_software }} under the Incident Management Policy and, where it is a notifiable incident, to the WHS regulator under the Work Health and Safety Policy.
8. {{ quality_lead }} reports open hazards, overdue repairs and hazard-related incidents by home at the quarterly quality meeting.

## Hazard inspection checklist template

| Area | Check | Yes / No | Action and Maintenance Log reference |
|---|---|---|---|
| Entry and exits | Exit paths clear; doors open freely from inside; external lighting works; paths and steps sound | (example — delete) Yes | — |
| Fire safety | Smoke alarms tested and in date; fire blanket and extinguisher present and in date; evacuation diagram current; drill within last 6 months | | |
| Electrical | No damaged cords or overloaded boards; test-and-tag current on {{ org.name }} equipment; safety switch tested | | |
| Kitchen | Hot water safe; stove, oven and appliances working; sharp items stored as agreed with participants; food stored safely | | |
| Bathrooms | Non-slip surfaces; grab rails secure; hot water temperature checked; shower chair and equipment sound | | |
| Bedrooms | Bed and any bed equipment safe; call or alert system works; participant's privacy respected; smoke alarm in or near bedroom | | |
| Equipment | Hoists, slings, wheelchairs and beds serviced and checked; faulty items tagged out | | |
| Chemicals and medication storage | Cleaning products stored safely with safety data sheets{% if sup.medication_involvement != 'none' %}; medication stored securely as per the Medication Management Policy{% endif %} | | |
| Outdoors | Fences, gates and paths sound; no trip hazards; pool or water hazard controls if any | | |
| Security | Keys accounted for; locks working; windows secure; no unauthorised environmental restrictions | | |
| Worker facilities | {% if intake.homes | length > 0 %}Sleepover or overnight facilities (where used) safe and private; on-call number displayed{% else %}[TO CONFIRM]{% endif %} | | |
| Emergency information | Emergency plan, contacts and participant emergency needs displayed and current | | |
| Completed by, participant involved, date | | | |

## Maintenance log template

| Log no. | Date raised | Home | Item and location | Reported by | Priority (urgent / priority / routine) | Responsible (tenancy holder / {{ org.name }}) | Reported to and date | Target date | Date fixed | Verified by |
|---|---|---|---|---|---|---|---|---|---|---|
| ML-001 (example — delete) | 01/08/2026 | {% if intake.homes | length > 0 %}{{ intake.homes[0].name }}{% else %}[home]{% endif %} | Rear step loose | J. Worker | Urgent | Tenancy holder | Agent, 01/08/2026 | 02/08/2026 | 02/08/2026 | House leader |

## Records kept

- Monthly Hazard Inspection Checklists and 6-monthly independent inspection reports for each home.
- Maintenance Log for each home, including correspondence with tenancy holders.
- Test-and-tag records, equipment service records, smoke alarm and fire equipment checks.
- Key register for each home.
- Emergency drill records.
- Hazard-related incident and near-miss reports in {{ incident_software }}.

## Related documents

- whs-work-health-safety
- restrictive-practices-behaviour-support
- emergency-disaster-management
- risk-management
- incident-management
- waste-management-infection-control
- tenancy-housing-support-separation
- household-decision-making
- medication-management

## Legislation and standards references

- National Disability Insurance Scheme Act 2013 (Cth)
- NDIS (Provider Registration and Practice Standards) Rules 2018 — Core Module outcome 4.1 (safe environment); SIL supplementary module outcome 2 (safeguarding)
- NDIS (Restrictive Practices and Behaviour Support) Rules 2018 (environmental restraint)
- NDIS (Specialist Disability Accommodation) Rules 2020 (SDA dwellings)
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
