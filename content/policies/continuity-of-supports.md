---
title: Continuity of Supports Policy
slug: continuity-of-supports
doc_type: policy
standards: [core-2.7]
applies_if: "true"
version: 1.0
review_months: 12
---
{% set gov = intake.governance %}{% set wf = intake.workforce %}{% set sup = intake.supports %}
{% set director = gov.ceo_or_director | default('[TO CONFIRM]', true) %}{% set quality_lead = gov.quality_lead | default('[TO CONFIRM]', true) %}{% set rostering_manager = gov.rostering_manager | default('[TO CONFIRM]', true) %}{% set whs_officer = gov.whs_officer | default('[TO CONFIRM]', true) %}{% set incident_officer = gov.incident_officer | default('[TO CONFIRM]', true) %}
{% set rostering_software = wf.rostering_software | default('[TO CONFIRM]', true) %}{% set notes_software = wf.notes_software | default('[TO CONFIRM]', true) %}{% set incident_software = wf.incident_software | default('[TO CONFIRM]', true) %}
{% set governing_body = 'the Board' if gov.has_board else 'the Director' %}
# Continuity of Supports Policy

## Purpose

Participants in Supported Independent Living depend on {{ org.name }} for support every day, including overnight. This policy sets out how {{ org.name }} makes sure that the supports in each participant's plan continue without interruption when a shift cannot be filled, workers are absent, illness spreads through a home, a home cannot be used, key people or systems are unavailable, or {{ org.name }} itself stops delivering supports. It evidences the NDIS Practice Standards Core Module continuity of supports outcome (core-2.7).

## Scope

This policy applies to all {{ org.name }} homes, all workers ({{ wf.employment_types | join(', ') }}; approximately {{ wf.headcount | default('[TO CONFIRM]', true) }} in total), agency staff, key personnel and the systems {{ org.name }} relies on ({{ rostering_software }}, {{ notes_software }}, {{ incident_software }}). It works with the Emergency and Disaster Management Plan, which covers the immediate response to an emergency, and the Transitions and Exit Policy, which covers planned changes of provider.

## Policy statement

- **No participant is left without agreed support.** The roster of care in each participant's SIL Service Agreement is the minimum {{ org.name }} delivers. A shift is never simply dropped; it is filled, covered by a manager, or replaced by an agreed alternative that the participant accepts and that keeps them safe.
- **Consistency is protected in a crisis.** Relief is drawn first from the home's core team, then from other {{ org.name }} homes, then from a pre-approved agency, so that participants are supported by people who know them wherever possible.
- **Participants and families are told.** Any change to who is coming, when, or where supports are delivered is explained to the participant in their communication method as soon as it is known, and to family, guardians or nominees as their plan directs.
- **Plans are written before they are needed.** Each home has an alternative accommodation list, a minimum safe staffing level and a call tree; each participant has a personal emergency profile; and {{ org.name }} keeps an exit plan so supports would continue if it ceased operating.
- **Contingency capacity is funded.** {{ governing_body }} maintains a cash reserve and an agency agreement so that continuity does not depend on unpaid goodwill.

## Roles and responsibilities

| Role | Responsibilities under this document |
|---|---|
| {{ governing_body }} | Approves this policy, the cash reserve and the agency agreement; receives quarterly continuity reports; approves any provider exit plan. |
| Director — {{ director }} | Accountable for continuity; approves use of alternative accommodation, unbudgeted agency use and manager cover; notifies the NDIS Commission of events affecting {{ org.name }}'s ability to deliver supports; leads any provider exit. |
| Rostering Manager — {{ rostering_manager }} | Owns this policy; maintains the on-call roster, call tree, relief pool and agency arrangements in {{ rostering_software }}; fills gaps within the escalation times below; reports unfilled and late-filled shifts monthly. |
| WHS Officer — {{ whs_officer }} | Owns outbreak and premises loss responses; keeps PPE and supplies; liaises with public health units and landlords or SDA providers. |
| Quality Lead — {{ quality_lead }} | Maintains the documented exit plan and system outage procedures; reviews continuity events for improvements. |
| Incident Officer — {{ incident_officer }} | Records any shift delivered below minimum safe staffing as an incident. |
| House leaders | First point of escalation for a gap on shift; know the home's minimum safe staffing and alternative accommodation list; keep paper backups of the current roster and each participant's key information. |
| Workers | Give the notice required for absences; accept reasonable relief shifts; follow outage procedures. |

## Minimum safe staffing by home

| Home | Roster model | Minimum safe staffing | Escalation trigger |
|---|---|---|---|
{% for home in intake.homes %}
| {{ home.name }} ({{ home.participants }} participant{% if home.participants != 1 %}s{% endif %}) | {% if home.roster_model == 'twenty_four_seven' %}24/7 with awake overnight worker{% elif home.roster_model == 'sleepover' %}Day and evening support with sleepover overnight{% elif home.roster_model == 'active_night' %}Day support with awake (active night) worker overnight{% elif home.roster_model == 'drop_in' %}Scheduled drop-in support{% else %}[TO CONFIRM]{% endif %} | {% if home.roster_model == 'drop_in' %}Every scheduled visit delivered within 1 hour of its rostered time; no participant left without a way to call for help{% else %}At least one worker on site at all times; the ratio in the roster of care at the times personal care{% if sup.medication_involvement != 'none' %}, medication{% endif %}{% if sup.mealtime_management %} and meals{% endif %} are delivered [TO CONFIRM per home]{% endif %} | Any shift unfilled 4 hours before start, or any worker leaving mid-shift without relief |
{% else %}
| [TO CONFIRM home] | [TO CONFIRM] | [TO CONFIRM] | [TO CONFIRM] |
{% endfor %}

## Procedure

### Part A — Roster failure and worker absence

1. A worker who cannot attend a shift phones (not messages) the on-call manager as early as possible and at least 4 hours before the shift; a worker who becomes unwell on shift phones the on-call manager immediately and stays until relief arrives unless unsafe.
2. {{ rostering_manager }} (or the on-call manager after hours) offers the shift in {{ rostering_software }} to the home's core team, then to workers from other {{ org.name }} homes who have been inducted to that home, then to the casual relief pool, then to the agency, in that order, and records each step.
3. If the shift is still unfilled 2 hours before it starts, the on-call manager, house leader or {{ rostering_manager }} covers the shift in person, and {{ director }} is informed.
4. A shift delivered below minimum safe staffing, or a visit missed in a drop-in home, is recorded in {{ incident_software }} as an incident, the participant and their family or guardian are told what happened and what was done, and {{ incident_officer }} assesses whether it amounts to neglect and is reportable.
5. Agency workers receive the home's induction sheet, each participant's key information and emergency profile before the shift begins, and never work alone on their first shift in a home with an active behaviour support plan{% if sup.medication_involvement == 'administer' %} or administer medication unless their competency has been verified{% endif %}.
6. Planned leave is approved only where cover is confirmed in {{ rostering_software }}; {{ rostering_manager }} monitors unplanned absence rates and adjusts the relief pool and recruitment when fill rates fall below 95% of shifts filled by the core team and relief pool.

### Part B — Illness outbreaks

1. Where two or more people in a home have similar infectious symptoms, or one has a notifiable disease, the house leader tells {{ whs_officer }} and {{ rostering_manager }} the same day.
2. {{ whs_officer }} applies infection control measures (isolation where possible, PPE, hygiene, cleaning), notifies the public health unit where required, arranges medical review for unwell participants, and tells families and visitors.
3. {{ rostering_manager }} rosters a consistent team to the affected home, stops those workers moving between homes for the outbreak period, pays workers to stay home when unwell, and activates the relief pool and agency to replace them.
4. Where more than one third of the workforce is unavailable, {{ director }} prioritises personal care, medication, meals and safety supports over community activities, tells each participant what will change, and documents the reduced service in {{ notes_software }}; the full roster of care resumes as soon as staffing allows, and claims are made only for supports delivered.

### Part C — Loss of premises

1. If a home cannot be occupied (fire, flood, structural damage, utility failure beyond the period in the per-home emergency plan, or a tenancy ending), {{ director }} activates the alternative accommodation list for that home agreed with participants in advance.
2. Participants move with their medication, equipment, essential belongings and profiles, and {{ rostering_manager }} re-rosters the home's workers to the alternative location the same day so that familiar workers continue to provide support.
3. {{ director }} tells the landlord or SDA provider, the insurer, families and guardians, support coordinators and the NDIS Commission where supports are disrupted, and records the event.
4. Where the loss of premises is long-term, the Transitions and Exit Policy is used to plan the move to a new home with each participant, and their tenancy rights are protected under the Tenancy, Housing and Support Separation Policy.

### Part D — Loss of key personnel or systems

1. Each key personnel role has a named deputy: for {{ director }}, {{ quality_lead }}; for {{ rostering_manager }}, the senior house leader; deputies have system access and know where records, passwords, bank authorities and contracts are held.
2. If {{ rostering_software }} or {{ notes_software }} is unavailable, house leaders use the printed roster and paper progress note and medication forms kept in each home, and {{ quality_lead }} enters the records in the system when it returns; an outage over 24 hours is a level 3 event under the Emergency and Disaster Management Plan.
3. Loss of the bank, payroll or claiming function is escalated to {{ director }} and the external accountant the same day, and wages are prioritised from the cash reserve.

### Part E — Provider exit

1. If {{ org.name }} decides, or is required, to stop delivering SIL supports to a home or altogether (including a decision by the NDIS Commission about its registration), {{ director }} notifies the Commission as early as possible, and gives every participant, their family or guardian, their support coordinator and the NDIA written notice of at least the period in their service agreement, and longer where possible.
2. {{ org.name }} continues the full roster of care until each participant's new provider has started, works with the participant to choose that provider, and hands over records with the participant's consent under the Transitions and Exit Policy.
3. Housing is never affected by {{ org.name }}'s exit: participants keep their tenancy or occupancy agreement, and {{ org.name }} gives the new provider access to the home.
4. Workers are supported to transfer to the new provider where the participant wants them to, and worker screening, training and supervision records are provided to the new provider with the worker's consent.

## Records kept

- On-call roster, call tree, relief pool and agency agreement
- Shift fill and escalation records in {{ rostering_software }}; monthly unfilled and late-filled shift report
- Incident records for shifts below minimum safe staffing ({{ incident_software }})
- Outbreak records, public health notifications and reduced-service records in {{ notes_software }}
- Alternative accommodation lists for each home; premises loss and relocation records
- Deputy and access arrangements; outage records; the documented exit plan
- Commission notifications; participant and family communications

## Related documents

- Emergency and Disaster Management Plan
- Practice Governance and Workforce Consistency Policy
- Transitions and Exit Policy; Tenancy, Housing and Support Separation Policy
- Incident Management Policy and Procedure (including Reportable Incidents)
- Financial Management, NDIS Billing and Claiming, and Fraud and Corruption Prevention Policy
- Information Management and Records Policy
- Waste Management and Infection Control Policy

## Legislation and standards references

- National Disability Insurance Scheme Act 2013 (Cth)
- NDIS (Provider Registration and Practice Standards) Rules 2018 — NDIS Practice Standards, Core Module continuity of supports outcome and transitions outcome; conditions of registration, including notification of events affecting the ability to deliver supports
- NDIS Practice Standards, SIL supplementary module (registration group 0138, 2026)
- NDIS (Incident Management and Reportable Incidents) Rules 2018 (neglect arising from a failure to provide agreed supports)
- NDIS (Code of Conduct) Rules 2018 — the NDIS Code of Conduct
- NDIS Pricing Arrangements and Price Limits (current edition) (claims only for supports delivered)
- Fair Work Act 2009 (Cth); Social, Community, Home Care and Disability Services Industry Award 2010 (rostering, minimum engagement and overtime)
{% for state in org.states %}
- Work health and safety and public health legislation of {{ state }}, as cited in the Emergency and Disaster Management Plan
{% endfor %}

## Review

Reviewed every 12 months by the Rostering Manager ({{ rostering_manager }}) and approved by {{ governing_body }}; reviewed earlier after any shift delivered below minimum safe staffing, any outbreak, any loss of premises, and any change to the number of homes or the workforce.

## Document control

| Version | Drafted | Approved by | Approval date | Next review |
|---|---|---|---|---|
| 1.0 | {{ intake.meta.generated_on | date }} | {{ director }} | [TO CONFIRM on adoption] | 12 months after approval |
