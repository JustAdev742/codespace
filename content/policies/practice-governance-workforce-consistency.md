---
title: Practice Governance and Workforce Consistency Policy
slug: practice-governance-workforce-consistency
doc_type: policy
standards: [sil-3, core-2.6, core-3.4]
applies_if: "true"
version: 1.0
review_months: 12
---
{% set gov = intake.governance %}{% set wf = intake.workforce %}{% set sup = intake.supports %}
{% set director = gov.ceo_or_director | default('[TO CONFIRM]', true) %}{% set quality_lead = gov.quality_lead | default('[TO CONFIRM]', true) %}{% set rostering_manager = gov.rostering_manager | default('[TO CONFIRM]', true) %}{% set whs_officer = gov.whs_officer | default('[TO CONFIRM]', true) %}
{% set rostering_software = wf.rostering_software | default('[TO CONFIRM]', true) %}{% set notes_software = wf.notes_software | default('[TO CONFIRM]', true) %}
{% set roster_label = {'twenty_four_seven': '24-hour rostered support with an awake worker on duty overnight', 'sleepover': 'rostered day and evening support with a sleepover worker overnight', 'active_night': 'rostered day support with an awake (active night) worker overnight', 'drop_in': 'scheduled drop-in support with no worker on site overnight'} %}
# Practice Governance and Workforce Consistency Policy

## Purpose

SIL supplementary module outcome 3 requires that participants receive safe, consistent support no matter which worker is on shift, which day it is, or which home they live in. This policy describes the structures {{ org.name }} uses to govern practice across its {{ intake.homes | length }} home{% if intake.homes | length != 1 %}s{% endif %} and approximately {{ wf.headcount | default('[TO CONFIRM]', true) }} workers: practice leadership in every home, roster design, rules for sleepover and active night shifts, shift handover, house meetings, observation of practice and competency monitoring.

## Scope

This policy applies to all {{ org.name }} homes and every worker rostered to them, including agency and contract workers, and to {{ rostering_manager }} and {{ quality_lead }} in their practice governance roles. It works together with the Supervision and Performance Policy, the Induction, Training and Competency Policy and the Shift Handover and Progress Notes Procedure.

## Policy statement

- **A practice lead in every home.** Each home has a named house leader (a senior support worker or coordinator) who is the practice lead for that home, works regular shifts there, knows each participant's plan in detail, and is the first point of escalation for workers on shift. {{ rostering_manager }} is the practice lead across homes.
- **A core team per home.** {{ org.name }} rosters a stable core team to each home so that each participant is supported mainly by workers they know. The target is that at least 80% of shifts in each home each month are worked by the home's core team and no more than 10% by agency or one-off workers. {{ rostering_manager }} reports these figures monthly from {{ rostering_software }}.
- **Rosters follow the roster of care and participant preference.** Rosters are built in {{ rostering_software }} from each participant's funded roster of care and support plan, the participant's stated preferences (worker gender, language, culture, personality fit), and safe hours for workers. Participants are told in advance who is rostered and are consulted about changes.
- **One way of doing things.** For each participant, the support plan, communication profile, health plan{% if sup.mealtime_management %}, mealtime management plan{% endif %}{% if sup.medication_involvement != 'none' %}, medication chart{% endif %}{% if sup.behaviour_support_plans or sup.restrictive_practices != 'none' %}, behaviour support plan{% endif %} and routine guides in {{ notes_software }} are the single source of truth. Workers follow them on every shift; changes are made only through the support planning process, never by an individual worker's preference.
- **Overnight support is matched to need.** The overnight model for each home is set from participants' assessed overnight needs, is reviewed at least every 6 months and whenever needs change, and follows the sleepover and active night rules in this policy.
- **Practice is observed, not assumed.** House leaders and {{ quality_lead }} observe practice on shift and review notes so that variation between workers is found and corrected.
- **Learning flows across homes.** Incidents, complaints, audit findings and good practice from one home are shared at the monthly all-staff meeting and quarterly quality meeting so that all homes benefit.

## Roles and responsibilities

| Role | Responsibilities |
|---|---|
| {{ director }} | Approves roster models and staffing levels for each home; approves changes to overnight models; approves this policy. |
| {{ quality_lead }} | Owns this policy; runs the quarterly quality meeting; conducts practice audits across homes; monitors consistency indicators. |
| {{ rostering_manager }} | Builds and maintains rosters in {{ rostering_software }}; manages agency use; supervises house leaders; reports consistency metrics monthly. |
| {{ whs_officer }} | Reviews rosters for fatigue, lone work and sleepover safety; approves sleepover facilities. |
| House leaders (practice leads) | Chair weekly house meetings; run shift handovers when on shift; observe practice; update routine guides; escalate practice concerns. |
| All workers | Follow plans and routine guides; complete handover and notes; attend house meetings; raise practice concerns. |

## Practice governance arrangements

### Homes and roster models

| Home | Address | State | Participants | Roster model | Overnight arrangement |
|---|---|---|---|---|---|
{% for home in intake.homes %}| {{ home.name | default('[TO CONFIRM]', true) }} | {{ home.address | default('[TO CONFIRM]', true) }} | {{ home.state | default('[TO CONFIRM]', true) }} | {{ home.participants | default('[TO CONFIRM]', true) }} | {{ roster_label[home.roster_model] | default('[TO CONFIRM roster model]') }} | {% if home.roster_model == 'sleepover' %}Sleepover worker; sleepover rules apply{% elif home.roster_model in ['twenty_four_seven', 'active_night'] %}Awake worker overnight; active night rules apply{% elif home.roster_model == 'drop_in' %}No worker overnight; on-call contact and participant emergency plan apply{% else %}[TO CONFIRM]{% endif %} |
{% endfor %}

### Roster design rules

1. Every roster in {{ rostering_software }} shows, for each shift, the home, the workers, the shift type (day, evening, sleepover, active night, drop-in) and the participants being supported.
2. Minimum staffing for each home is set by {{ director }} from the participants' rosters of care and is never reduced without a documented risk assessment. A home with 24-hour support is never left without a rostered worker while a participant who requires support is at home.
3. Shifts are no longer than 12 hours of active work (a sleepover attached to an evening or morning shift is rostered in line with the SCHADS Award), with at least 10 hours' break between shifts, and no worker is rostered for more than 6 consecutive days without {{ rostering_manager }}'s approval.
4. Where two or more workers are rostered together, at least one is an experienced member of that home's core team.
5. Participant preferences recorded in the support plan (for example a female worker for personal care, a worker who speaks the participant's language) are treated as roster requirements, not options.
6. Unfilled shifts are offered first to the home's core team, then to other {{ org.name }} workers who have completed that home's orientation, and only then to agency workers who have completed the agency orientation requirements in the Induction, Training and Competency Policy.
7. Rosters are published at least 2 weeks in advance and each home displays (in the format participants prefer) who is coming on each shift.

### Sleepover and active night rules

1. **Sleepover shifts** are used only where all participants in the home are assessed as not needing planned support overnight and are unlikely to need unplanned support more than occasionally. The worker is provided with a private bedroom, bedding, bathroom access and a means to summon help. Workers may be woken to provide support and record every interruption (time, participant, reason, duration) in {{ notes_software }}.
2. If the sleepover worker is woken more than twice on any night, or on more than 3 nights in any 2-week period, or a participant's health or behaviour support needs change, the house leader reports it to {{ rostering_manager }} within 1 business day. {{ rostering_manager }} reviews the overnight model with the participants, and {{ director }} decides whether to move to an active night model and to request a review of the roster of care with the NDIA.
3. **Active night shifts** are used where any participant needs planned overnight support (for example repositioning, continence care, seizure monitoring, epilepsy or behaviour support) or where the risk assessment requires an awake worker. The worker stays awake for the whole shift, completes the overnight tasks in each participant's plan, records welfare checks at the intervals set in the plan, and never sleeps on duty. Sleeping on an active night shift is misconduct.
4. **Sleepover and active night workers are not lone workers by default**: each has a documented way to reach the on-call manager, the on-call number is displayed in each home, and the Work Health and Safety Policy working-alone controls apply.
5. **Drop-in homes**: participants' plans state what happens between visits, who the participant can call, and how the on-call manager responds. Visit times are agreed with participants and recorded in {{ rostering_software }}.

### Shift handover and house meetings

1. Every change of shift includes a structured handover using the Shift Handover Template, with a paid overlap of at least 15 minutes where two workers are rostered consecutively. Where there is no overlap, the outgoing worker completes the written handover in {{ notes_software }} before leaving and the incoming worker reads it before starting support.
2. Each home holds a house meeting at least fortnightly (weekly where a home has 3 or more participants or any active behaviour support plan), chaired by the house leader, with a standing agenda: participants' feedback and household decisions (with participants present for that part where they choose), plan changes, health, incidents and near misses, hazards, roster and consistency, and practice questions. Minutes are stored in {{ notes_software }} and actions are tracked.
3. All-staff meetings are held monthly and include practice updates from each home.

### Observation of practice and competency monitoring

1. House leaders observe each core-team worker in their home at least twice a year and every agency worker on their first shift where practicable, recording the observation on the Supervision Record.
2. {{ quality_lead }} audits each home at least quarterly: one unannounced visit including a review of the last 20 progress notes, the medication records{% if sup.medication_involvement == 'none' %} (confirming no involvement){% endif %}, the hazard log, the handover records and a conversation with participants about whether workers support them the same way.
3. Consistency indicators reported quarterly: core-team shift percentage, agency percentage, unfilled shifts, sleepover interruptions, overdue training, note completion rate, participant feedback on consistency, and incidents by shift type.
4. Where variation in practice is found, the house leader updates the routine guide with the participant, briefs all workers at the next house meeting and in {{ notes_software }}, and confirms the change in the next observation.

## Records kept

- Rosters, shift types and consistency reports from {{ rostering_software }}.
- Overnight needs assessments and {{ director }}'s approvals of roster models for each home.
- Sleepover interruption logs and active night welfare check records in {{ notes_software }}.
- Shift handover records; house meeting minutes and action logs; all-staff meeting minutes.
- Observation of practice records; quarterly practice audit reports; quality meeting minutes.

## Related documents

- supervision-performance
- induction-training-competency
- shift-handover-progress-notes
- human-resources-recruitment
- whs-work-health-safety
- assessment-support-planning
- household-decision-making
- incident-management

## Legislation and standards references

- National Disability Insurance Scheme Act 2013 (Cth)
- NDIS (Provider Registration and Practice Standards) Rules 2018 — SIL supplementary module outcome 3; Core Module outcomes 2.6 and 3.4
- NDIS (Quality Indicators) Guidelines 2018 as amended for SIL in 2026
- NDIS Code of Conduct
- NDIS Pricing Arrangements and Price Limits (current edition) — SIL support items and roster of care
- Fair Work Act 2009 (Cth); Social, Community, Home Care and Disability Services Industry Award 2010 (sleepover, shiftwork and rostering provisions)
{% for state in org.states %}- Work health and safety legislation of {{ state }} (fatigue, lone work, psychosocial hazards) as cited in the Work Health and Safety Policy
{% endfor %}

## Review

This policy is reviewed every 12 months, when a home opens or closes, and when any home's roster model changes. Review owner: {{ quality_lead }}. Approval: {{ director }}.

## Document control

| Version | Approved by | Approval date | Next review |
|---|---|---|---|
| 1.0 | {{ director }} | [TO CONFIRM] | [TO CONFIRM — 12 months after approval] |
