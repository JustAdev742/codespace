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
Participants in Supported Independent Living depend on {{ org.name }} for support every day, including overnight. This policy sets out how the supports in each participant's plan continue when a shift cannot be filled, workers are absent, illness spreads through a home, a home cannot be used, key people or systems are unavailable, or {{ org.name }} itself stops delivering supports. It evidences the NDIS Practice Standards Core Module continuity of supports outcome (core-2.7).

## Scope
This policy applies to all {{ org.name }} homes, all workers ({{ wf.employment_types | join(', ') }}; approximately {{ wf.headcount | default('[TO CONFIRM]', true) }}), agency staff, key personnel and the systems {{ org.name }} relies on ({{ rostering_software }}, {{ notes_software }}, {{ incident_software }}). It works with the Emergency and Disaster Management Plan (immediate response) and the Transitions and Exit Policy (planned changes of provider).

## Policy statement
- **No participant is left without agreed support.** The roster of care in each SIL Service Agreement is the minimum {{ org.name }} delivers. A shift is never simply dropped; it is filled, covered by a manager, or replaced by an agreed alternative the participant accepts and that keeps them safe.
- **Consistency is protected in a crisis.** Relief comes first from the home's core team, then other {{ org.name }} homes, then a pre-approved agency, so participants are supported by people who know them wherever possible.
- **Participants and families are told.** Any change to who is coming, when, or where supports are delivered is explained to the participant in their communication method as soon as it is known, and to family, guardians or nominees as their plan directs.
- **Plans exist before they are needed.** Each home has an alternative accommodation list, a minimum safe staffing level and a call tree; each participant has a personal emergency profile; {{ org.name }} keeps an exit plan; and {{ governing_body }} funds a cash reserve and an agency agreement.

## Roles and responsibilities
| Role | Responsibilities under this document |
|---|---|
| {{ governing_body }} | Approves this policy, the cash reserve and the agency agreement; receives quarterly continuity reports; approves any provider exit plan. |
| Director — {{ director }} | Accountable for continuity; approves alternative accommodation, unbudgeted agency use and manager cover; notifies the NDIS Commission of events affecting the ability to deliver supports; leads any provider exit. |
| Rostering Manager — {{ rostering_manager }} | Owns this policy; maintains the on-call roster, call tree, relief pool and agency arrangements in {{ rostering_software }}; fills gaps within the escalation times; reports unfilled and late-filled shifts monthly. |
| WHS Officer — {{ whs_officer }} | Owns outbreak and premises loss responses; keeps PPE and supplies; liaises with public health units, landlords and SDA providers. |
| Quality Lead — {{ quality_lead }}; Incident Officer — {{ incident_officer }} | Maintain the exit plan and outage procedures; record any shift below minimum safe staffing as an incident. |
| House leaders and workers | First escalation point for a gap on shift; keep paper backups of the roster and each participant's key information; give required notice of absences; accept reasonable relief shifts. |

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
1. A worker who cannot attend a shift phones (not messages) the on-call manager at least 4 hours before the shift; a worker who becomes unwell on shift phones immediately and stays until relief arrives unless unsafe.
2. {{ rostering_manager }} (or the on-call manager after hours) offers the shift in {{ rostering_software }} to the home's core team, then inducted workers from other homes, then the casual relief pool, then the agency, recording each step. If it is still unfilled 2 hours before it starts, the on-call manager, house leader or {{ rostering_manager }} covers it in person and {{ director }} is informed.
3. A shift delivered below minimum safe staffing, or a missed visit in a drop-in home, is recorded in {{ incident_software }}; the participant and their family or guardian are told, and {{ incident_officer }} assesses whether it amounts to neglect and is reportable.
4. Agency workers receive the home's induction sheet and each participant's key information and emergency profile before the shift, and never work alone on a first shift in a home with an active behaviour support plan{% if sup.medication_involvement == 'administer' %} or administer medication until their competency is verified{% endif %}.
5. Planned leave is approved only where cover is confirmed; {{ rostering_manager }} adjusts the relief pool and recruitment when fewer than 95% of shifts are filled by the core team and relief pool.

### Part B — Illness outbreaks
1. Where two or more people in a home have similar infectious symptoms, or one has a notifiable disease, the house leader tells {{ whs_officer }} and {{ rostering_manager }} the same day.
2. {{ whs_officer }} applies infection control (isolation where possible, PPE, hygiene, cleaning), notifies the public health unit where required, arranges medical review and tells families and visitors; {{ rostering_manager }} rosters a consistent team to the home, stops those workers moving between homes, pays unwell workers to stay home, and activates the relief pool and agency.
3. Where more than one third of the workforce is unavailable, {{ director }} prioritises personal care, medication, meals and safety over community activities, tells each participant what will change, and records the reduced service in {{ notes_software }}; the full roster of care resumes as soon as staffing allows, and claims are made only for supports delivered.

### Part C — Loss of premises
1. If a home cannot be occupied (fire, flood, structural damage, prolonged utility failure or a tenancy ending), {{ director }} activates the alternative accommodation list agreed with participants in advance; participants move with their medication, equipment, essential belongings and profiles, and {{ rostering_manager }} re-rosters the home's workers to the new location the same day.
2. {{ director }} tells the landlord or SDA provider, the insurer, families and guardians, support coordinators and the NDIS Commission where supports are disrupted, and records the event.
3. Where the loss is long-term, the Transitions and Exit Policy is used to plan a move to a new home with each participant, and their tenancy rights are protected under the Tenancy, Housing and Support Separation Policy.

### Part D — Loss of key personnel or systems
1. Each key personnel role has a named deputy ({{ quality_lead }} for {{ director }}; the senior house leader for {{ rostering_manager }}) with system access and knowledge of where records, passwords, bank authorities and contracts are held.
2. If {{ rostering_software }} or {{ notes_software }} is unavailable, house leaders use the printed roster and paper note and medication forms kept in each home, entered into the system by {{ quality_lead }} when it returns; an outage over 24 hours is a level 3 event under the Emergency and Disaster Management Plan. Loss of the bank, payroll or claiming function is escalated to {{ director }} and the external accountant the same day, and wages are prioritised from the cash reserve.

### Part E — Provider exit
1. If {{ org.name }} decides, or is required, to stop delivering SIL supports to a home or altogether, {{ director }} notifies the Commission as early as possible and gives every participant, their family or guardian, their support coordinator and the NDIA written notice of at least the period in their service agreement, and longer where possible.
2. {{ org.name }} continues the full roster of care until each participant's new provider has started, supports the participant to choose that provider, and hands over records with consent under the Transitions and Exit Policy.
3. Housing is never affected by {{ org.name }}'s exit: participants keep their tenancy or occupancy agreement and the new provider is given access to the home. Workers may transfer to the new provider where the participant wants them to.

## Records kept
- On-call roster, call tree, relief pool and agency agreement; shift fill and escalation records in {{ rostering_software }}; monthly unfilled shift report
- Incident records for shifts below minimum safe staffing; outbreak and reduced-service records; alternative accommodation lists; relocation, outage and deputy records; the exit plan; Commission notifications and participant communications

## Related documents
- Emergency and Disaster Management Plan; Practice Governance and Workforce Consistency Policy
- Transitions and Exit Policy; Tenancy, Housing and Support Separation Policy
- Incident Management Policy and Procedure; Financial Management, NDIS Billing and Claiming, and Fraud and Corruption Prevention Policy
- Information Management and Records Policy; Waste Management and Infection Control Policy

## Legislation and standards references
- National Disability Insurance Scheme Act 2013 (Cth)
- NDIS (Provider Registration and Practice Standards) Rules 2018 — NDIS Practice Standards, Core Module continuity of supports and transitions outcomes; conditions of registration, including notification of events affecting the ability to deliver supports; SIL supplementary module (registration group 0138, 2026)
- NDIS (Incident Management and Reportable Incidents) Rules 2018 (neglect arising from a failure to provide agreed supports); NDIS (Code of Conduct) Rules 2018
- NDIS Pricing Arrangements and Price Limits (current edition) (claims only for supports delivered)
- Fair Work Act 2009 (Cth); Social, Community, Home Care and Disability Services Industry Award 2010 (rostering, minimum engagement and overtime)
{% for state in org.states %}
- Work health and safety and public health legislation of {{ state }}, as cited in the Emergency and Disaster Management Plan
{% endfor %}

## Review

Reviewed every 12 months by the Rostering Manager ({{ rostering_manager }}) and approved by {{ governing_body }}; reviewed earlier after any shift below minimum safe staffing, outbreak or loss of premises, and any change to the number of homes or the workforce.

## Document control

| Version | Drafted | Approved by | Approval date | Next review |
|---|---|---|---|---|
| 1.0 | {{ intake.meta.generated_on | date }} | {{ director }} | [TO CONFIRM on adoption] | 12 months after approval |
