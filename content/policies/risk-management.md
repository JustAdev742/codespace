---
title: Risk Management Policy and Framework
slug: risk-management
doc_type: policy
standards: [core-2.2, sil-2]
applies_if: "true"
version: 1.0
review_months: 12
---
{% set gov = intake.governance %}{% set wf = intake.workforce %}{% set sup = intake.supports %}
{% set director = gov.ceo_or_director | default('[TO CONFIRM]', true) %}{% set quality_lead = gov.quality_lead | default('[TO CONFIRM]', true) %}{% set incident_officer = gov.incident_officer | default('[TO CONFIRM]', true) %}{% set whs_officer = gov.whs_officer | default('[TO CONFIRM]', true) %}{% set rostering_manager = gov.rostering_manager | default('[TO CONFIRM]', true) %}
{% set notes_software = wf.notes_software | default('[TO CONFIRM]', true) %}{% set incident_software = wf.incident_software | default('[TO CONFIRM]', true) %}
{% set governing_body = 'the Board' if gov.has_board else 'the Director' %}
# Risk Management Policy and Framework

## Purpose
This document sets out how {{ org.name }} identifies, assesses, controls, monitors and reports risk at three levels: the organisation, each home and each participant. It evidences NDIS Practice Standards Core Module outcome 2.2 (Risk management) and the SIL supplementary module safeguarding outcome, which requires risks in each home, including those between co-residents, to be actively managed.

## Scope

This framework applies to {{ governing_body }}, key personnel, house leaders and all workers of {{ org.name }} across its {{ intake.homes | length }} home{% if intake.homes | length != 1 %}s{% endif %}, community supports{% if sup.transport %}, transport in vehicles{% endif %} and administration. It covers risks to participants' safety, rights and wellbeing; work health and safety risks to workers, including psychosocial hazards; and financial, compliance, information, housing and reputational risks to {{ org.name }}.

## Policy statement
- **Risk management is everyone's job.** Workers identify and report hazards and risks on every shift; house leaders and managers assess and control them; {{ governing_body }} sets the risk appetite and reviews the Risk Register.
- **Dignity of risk is respected.** Risk assessment for a participant is done with the participant, supports their choices and looks for the least restrictive way to keep them safe. Risk is never a reason to override a participant's decision without lawful authority, and household rules are never used as an unauthorised restrictive practice.
- **One method, three levels.** The same likelihood and consequence matrix is used for organisational, house-level and participant-level risks so ratings are comparable.
- **Controls follow the hierarchy.** Safety hazards are eliminated where possible and otherwise substituted, isolated, engineered, administered and finally managed with personal protective equipment, consistent with the WHS legislation of {{ org.states | join(' and ') }}.
- **Reviews are triggered, not only scheduled.** Every incident, complaint, near miss, audit finding, plan change, change of co-resident, roster model change or new home triggers a review of the relevant risk assessment.
- **Risk appetite.** {{ org.name }} has no appetite for abuse, neglect, unauthorised restrictive practice, unscreened workers or false NDIS claims; accepts moderate operational and financial risk with controls in place; and supports participants to take informed personal risks.

## Roles and responsibilities
| Role | Responsibilities under this document |
|---|---|
| {{ governing_body }} | Approves the risk appetite and this framework; reviews the Risk Register quarterly; resources controls. |
| Director — {{ director }} | Owns the organisational Risk Register; accepts or escalates extreme and high risks; approves treatment budgets; ensures adequate insurance. |
| Quality Lead — {{ quality_lead }} | Owns this framework; facilitates the annual risk review; maintains the Risk Register; links risks to incidents, complaints and the Continuous Improvement Register. |
| WHS Officer — {{ whs_officer }} | Leads WHS hazard identification and control in each home; keeps the Hazard Inspection Register; consults workers. |
| Rostering Manager — {{ rostering_manager }}; Incident Officer — {{ incident_officer }} | Owns house-level risk assessments and co-resident compatibility risks and ensures rosters reflect assessed risks; feeds incident trends from {{ incident_software }} into reviews. |
| House leaders and workers | Complete and update house risk assessments and participant safety plans; run monthly hazard inspections; follow safety plans; report hazards, near misses and changed needs the same shift. |

## Risk management framework

### Process
1. **Identify** — from incidents, complaints, hazard inspections, support planning, health and behaviour assessments, feedback, audit findings, and changes in law, funding or housing.
2. **Analyse** — describe the risk (what could happen, to whom, why), list existing controls, and rate likelihood and consequence using the scales below.
3. **Evaluate and treat** — apply the matrix and action standard; decide additional controls with an owner and due date; record the residual rating.
4. **Monitor, review and communicate** — track actions to completion; review at the interval for the rating and on every trigger; brief workers through the support plan, house risk assessment and handover; report monthly to the management meeting and quarterly to {{ governing_body }}.

### Likelihood and consequence scales
| Level | Likelihood | Consequence — participant or worker | Consequence — compliance, finance and reputation |
|---|---|---|---|
| 5 | Almost certain: weekly or more often | Catastrophic: death or permanent harm; sustained abuse or neglect | Revocation or banning; insolvency; prosecution |
| 4 | Likely: monthly | Major: hospitalisation; serious injury or abuse; reportable incident | Breach of a condition of registration; Commission compliance action; major loss |
| 3 | Possible: once or twice a year | Moderate: medical treatment; significant distress; rights limited | Audit non-conformity; Commission complaint; moderate cost |
| 2 | Unlikely: once in several years | Minor: first aid; short-term distress; small property loss | Internal non-conformance; small cost; complaint resolved locally |
| 1 | Rare: exceptional circumstances only | Insignificant: no injury or distress | Minor procedural slip; negligible cost |

### Risk matrix (5 x 5)

| Likelihood / Consequence | 1 Insignificant | 2 Minor | 3 Moderate | 4 Major | 5 Catastrophic |
|---|---|---|---|---|---|
| 5 Almost certain | Medium | High | Extreme | Extreme | Extreme |
| 4 Likely | Medium | High | High | Extreme | Extreme |
| 3 Possible | Low | Medium | High | High | Extreme |
| 2 Unlikely | Low | Medium | Medium | High | High |
| 1 Rare | Low | Low | Medium | Medium | High |

### Action standard
| Rating | Required action | Accepted by | Review |
|---|---|---|---|
| Extreme | Stop or do not start the activity until controls reduce the risk; {{ director }} informed immediately; treatment plan within 24 hours | {{ director }}, reported to {{ governing_body }} | Monthly |
| High | Treatment plan within 5 business days; interim controls at once | {{ director }} | Quarterly |
| Medium | Treatment plan within 30 days | {{ quality_lead }} or {{ rostering_manager }} | Six-monthly |
| Low | Routine procedures; monitor | House leader | Annually |

### Organisational risk assessment
{{ quality_lead }} facilitates an organisational risk workshop with key personnel each year and before lodging the registration application, covering at least: loss of registration or audit failure; workforce shortage and screening lapses ({{ wf.headcount | default('[TO CONFIRM]', true) }} workers; screening {% if wf.screening_all_current %}all current{% else %}not all current — an extreme risk until closed{% endif %}); NDIS claiming errors and cash flow; loss of a home or a tenancy dispute; privacy breach or IT failure; emergency and disaster; fraud; dependence on key people; {% if sup.restrictive_practices != 'none' %}restrictive practice authorisation and reporting; {% endif %}{% if sup.medication_involvement == 'administer' %}medication administration errors; {% endif %}and reputational harm. Results are entered in the Risk Register.

### House-level risk assessment
Each home has a House Risk Assessment completed by the house leader and {{ rostering_manager }} before it opens, reviewed every 6 months and on any trigger, covering the physical environment (fire, electrical, hot water, slips and trips, hazardous substances, security), staffing and lone work, co-resident compatibility, visitors, vehicles and neighbourhood factors:

{% for home in intake.homes %}
- **{{ home.name }}** ({{ home.participants }} participant{% if home.participants != 1 %}s{% endif %}): {% if home.roster_model == 'twenty_four_seven' %}24/7 staffing; overnight risks are managed by an awake worker, with fatigue and handover risks assessed{% elif home.roster_model == 'sleepover' %}sleepover roster; the overnight worker is a lone worker who is asleep, so alarm audibility, overnight needs, wake-up triggers and lone-worker check-ins are assessed{% elif home.roster_model == 'active_night' %}active night roster; lone-worker and fatigue risks for the awake overnight worker are assessed{% elif home.roster_model == 'drop_in' %}drop-in roster; periods without a worker on site are assessed against each participant's capacity to be alone, alarm and phone access and emergency response{% else %}[TO CONFIRM roster model]{% endif %}. {% if home.co_tenants %}Shared home: compatibility, shared-space conflict and risks one resident may pose to another are reviewed at each house meeting.{% else %}Single-participant home: isolation, visitor and lone-worker risks are the focus.{% endif %}{% if home.sda %} SDA-enrolled: the SDA provider's maintenance, fire safety and design category obligations are confirmed.{% endif %}
{% else %}
- [TO CONFIRM homes]
{% endfor %}

### Participant-level risk assessment
Every participant has an individual risk assessment completed with them at intake and reviewed at each support plan review (at least annually) and on any trigger, recorded in {{ notes_software }}. It covers health{% if sup.medication_involvement != 'none' %} and medication{% endif %}{% if sup.mealtime_management %}, swallowing and mealtime{% endif %}{% if sup.behaviour_support_plans or sup.restrictive_practices != 'none' %}, behaviours of concern and the behaviour support plan{% endif %}{% if sup.high_intensity %}, high intensity daily personal activities{% endif %}, falls and manual handling, community access{% if sup.transport %} and transport{% endif %}{% if sup.participant_money_handling %}, money and financial exploitation{% endif %}, abuse and neglect indicators, relationships and visitors, and risks from or to co-residents. Where a participant chooses to take a risk, the assessment records the supported risk-taking decision under the Autonomy, Independence and Dignity of Risk Policy rather than removing the choice.

## Risk Register template

| Ref | Date | Level | Home or participant | Risk (what, who, why) | Existing controls | L | C | Rating | Additional controls (action, owner, due) | Residual L / C / rating | Review date | Status |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| R-2026-001 (example — delete) | {{ intake.meta.generated_on | date }} | House | {{ intake.homes[0].name if intake.homes else '[Home]' }} | Overnight fire not detected quickly because the worker is asleep or the alarm is inaudible in bedrooms | Interconnected smoke alarms tested monthly; evacuation plan; drill each 6 months | 2 | 5 | High | Add alarm in sleepover room; drill at night with participants; {{ whs_officer }}; 30 days | 1 / 5 / High | 3 months | Open |

## Records kept
- Risk Register (organisational, house-level and participant-level sections), retained at least 7 years
- House Risk Assessments and Hazard Inspection Register for each home; participant risk assessments and safety plans in {{ notes_software }}
- Annual risk workshop records; quarterly risk reports to {{ governing_body }}; treatment actions linked to the Continuous Improvement Register

## Related documents
- Governance and Operational Management Framework; Incident Management Policy and Procedure
- Emergency and Disaster Management Plan; Continuity of Supports Policy
- Safe Environment and Property Policy; Work Health and Safety Policy
- Autonomy, Independence and Dignity of Risk Policy; Household Decision-Making and Household Rules Policy
- Restrictive Practices Policy; Medication Management Policy; Mealtime Management Policy; Conflicts of Interest Policy

## Legislation and standards references

- National Disability Insurance Scheme Act 2013 (Cth)
- NDIS (Provider Registration and Practice Standards) Rules 2018 — NDIS Practice Standards, Core Module outcome 2.2 Risk management
- NDIS Practice Standards, SIL supplementary module (registration group 0138, 2026), safeguarding outcome
- NDIS (Incident Management and Reportable Incidents) Rules 2018; NDIS (Restrictive Practices and Behaviour Support) Rules 2018
- NDIS (Code of Conduct) Rules 2018 — the NDIS Code of Conduct
- AS ISO 31000:2018 Risk management — Guidelines (used as guidance)
{% if 'NSW' in org.states %}
- Work Health and Safety Act 2011 (NSW) and Work Health and Safety Regulation 2017 (NSW), Part 3.1 (managing risks)
{% endif %}
{% if 'VIC' in org.states %}
- Occupational Health and Safety Act 2004 (Vic) and Occupational Health and Safety Regulations 2017 (Vic)
{% endif %}
{% if 'QLD' in org.states %}
- Work Health and Safety Act 2011 (Qld) and Work Health and Safety Regulation 2011 (Qld), Part 3.1 (managing risks)
{% endif %}
{% if 'SA' in org.states %}
- Work Health and Safety Act 2012 (SA) and Work Health and Safety Regulations 2012 (SA), Part 3.1 (managing risks)
{% endif %}
{% if 'WA' in org.states %}
- Work Health and Safety Act 2020 (WA) and Work Health and Safety (General) Regulations 2022 (WA)
{% endif %}
{% if 'TAS' in org.states %}
- Work Health and Safety Act 2012 (Tas) and its regulations
{% endif %}
{% if 'ACT' in org.states %}
- Work Health and Safety Act 2011 (ACT) and Work Health and Safety Regulation 2011 (ACT)
{% endif %}
{% if 'NT' in org.states %}
- Work Health and Safety (National Uniform Legislation) Act 2011 (NT) and its regulations
{% endif %}

## Review

Reviewed every 12 months by the Quality Lead ({{ quality_lead }}) and approved by {{ governing_body }}; reviewed earlier after any extreme-rated risk event, rating 3 or 4 incident, new home, or change of roster model.

## Document control

| Version | Drafted | Approved by | Approval date | Next review |
|---|---|---|---|---|
| 1.0 | {{ intake.meta.generated_on | date }} | {{ director }} | [TO CONFIRM on adoption] | 12 months after approval |
