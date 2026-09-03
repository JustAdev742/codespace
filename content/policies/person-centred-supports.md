---
title: Person-Centred Supports Policy
slug: person-centred-supports
doc_type: policy
standards: [core-1.1, sil-1]
applies_if: "true"
version: 1.0
review_months: 12
---
{% set director = intake.governance.ceo_or_director | default('[TO CONFIRM]', true) %}
{% set quality_lead = intake.governance.quality_lead | default('[TO CONFIRM]', true) %}
{% set rostering_manager = intake.governance.rostering_manager | default('[TO CONFIRM]', true) %}
{% set complaints_officer = intake.governance.complaints_officer | default('[TO CONFIRM]', true) %}
{% set notes_software = intake.workforce.notes_software | default('[TO CONFIRM]', true) %}
{% set rostering_software = intake.workforce.rostering_software | default('[TO CONFIRM]', true) %}
{% macro roster(home) %}{% if home.roster_model == 'twenty_four_seven' %}workers on site 24 hours a day, 7 days a week{% elif home.roster_model == 'sleepover' %}rostered day and evening support with a sleepover worker overnight{% elif home.roster_model == 'active_night' %}rostered day and evening support with an awake overnight worker{% elif home.roster_model == 'drop_in' %}drop-in support at rostered times{% else %}[TO CONFIRM roster model]{% endif %}{% endmacro %}

# Person-Centred Supports Policy

## Purpose

This policy sets out how {{ org.name }}{% if org.trading_name and org.trading_name != org.name %} (trading as {{ org.trading_name }}){% endif %} makes sure that every participant living in a home it supports receives supports that are directed by the participant, respect the participant's legal and human rights, and are delivered in the way the participant wants. It evidences NDIS Practice Standards Core Module outcome 1.1 (Person-centred supports) and the first outcome of the SIL supplementary module (supported decision-making) for registration group 0138, and it is the foundation for the Supported Decision-Making, Autonomy and Dignity of Risk, and Diversity and Cultural Safety policies.

## Scope

This policy applies to:

- every participant who receives Supported Independent Living (SIL) supports from {{ org.name }}, currently across {{ intake.homes | length }} home{% if intake.homes | length != 1 %}s{% endif %}:
{% for home in intake.homes %}
- {{ home.name }}, {{ home.address }}: {{ home.participants }} participant{% if home.participants != 1 %}s{% endif %}, {% if home.co_tenants %}a shared home{% else %}a single-occupancy home{% endif %}, {{ roster(home) }};
{% endfor %}
- all {{ intake.workforce.headcount | default('[TO CONFIRM]', true) }} workers engaged by {{ org.name }} ({{ intake.workforce.employment_types | join(', ') }}), all key personnel, and any agency or subcontracted worker on shift in a {{ org.name }} home;
- every kind of support delivered under a participant's service agreement, including personal care, household tasks, health support, community access{% if intake.supports.transport %}, transport{% endif %}{% if intake.supports.mealtime_management %}, mealtime support{% endif %} and communication with families, guardians and other services.

## Policy statement

{{ org.name }} recognises that each home it supports is the participant's home, not a workplace in which participants happen to live. Supports are organised around each participant, not around the roster or the convenience of the household.

### What person-centred means at {{ org.name }}

- **The participant leads.** Each participant decides what a good life looks like for them. Their NDIS plan goals, their own words about what matters to them, and their day-to-day preferences drive how supports are planned and delivered.
- **Rights are the starting point.** Every participant has the same rights as any other adult in Australia, including the right to freedom of expression, self-determination, privacy, relationships, participation in community life and freedom from abuse, neglect and exploitation. {{ org.name }} does not trade these rights for convenience, efficiency or group routines.
- **Strengths, not deficits.** Support plans describe what the participant can do, wants to do and is learning to do, and the specific support each worker gives to make that happen.
- **Consistency across shifts and homes.** A participant should get the same quality and style of support whoever is on shift. Each participant has an About Me profile and a daily support plan in {{ notes_software }} that every worker reads before supporting that person for the first time and at the start of each shift.
- **Shared homes are still individual homes.** {% if intake.homes | selectattr('co_tenants') | list | length > 0 %}In {{ org.name }}'s shared homes, household routines (meals, cleaning, shared spaces, noise, visitors) are negotiated at household meetings and recorded, not imposed by workers. Where individual preferences conflict, workers help participants reach an arrangement that respects everyone, and escalate to {{ quality_lead }} if a lasting solution needs more than the household can agree.{% else %}{{ org.name }} currently supports participants in single-occupancy homes; if a shared home is opened, household decisions will be made using the Household Decision-Making procedure before anyone moves in.{% endif %}
- **Supports are explained, and choices are real.** Participants are told, in a way they understand, what {{ org.name }} will and will not do, what it costs their plan, who will support them and how to change any of that. The Participant Rights Statement is provided and explained at service commencement and revisited at each plan review.
- **Independent advocacy is welcomed.** Participants may involve an advocate, family member, friend or peer in any decision or meeting. {{ org.name }} gives participants information about independent advocacy organisations (through the Commonwealth Disability Advocacy Finder) and never discourages contact with an advocate or the NDIS Quality and Safeguards Commission.
- **Workers keep their own values to themselves.** Workers support the participant's choices and beliefs, comply with the NDIS Code of Conduct, and do not impose their own religious, political, dietary or lifestyle views.

### How this shapes rostering and worker matching

{{ rostering_manager }} builds rosters in {{ rostering_software }} to reflect participant preferences about the gender, language, cultural background and personality of workers, preferred times for personal care and activities, and continuity of familiar workers. Where {{ org.name }} cannot meet a preference (for example, a gender preference on a sleepover shift in a home with a single worker), it tells the participant, records the reason and offers alternatives.

## Roles and responsibilities

| Role | Responsibilities under this policy |
|---|---|
| Director — {{ director }} | Accountable for person-centred practice across {{ org.name }}; approves this policy; makes sure resources (roster hours, training, environment) enable participant choice; reviews participant feedback and complaint trends at governance meetings. |
| Quality Lead — {{ quality_lead }} | Owns this policy; makes sure each participant has a current About Me profile and support plan; audits progress notes and support plans for evidence of participant direction; leads household meetings where household-level conflicts arise; delivers person-centred practice training at induction. |
| Rostering Manager — {{ rostering_manager }} | Matches workers to participant preferences; keeps worker continuity; records where a preference cannot be met and why; ensures agency and casual workers receive the participant's profile before the first shift. |
| Complaints Officer — {{ complaints_officer }} | Treats any concern that a participant's choices are being overridden as a complaint under the Complaints and Feedback Policy, and reports patterns to the Quality Lead. |
| Support workers | Read the participant's profile and support plan before each shift; offer choices in everyday matters; use the participant's preferred communication method; record what the participant chose, not just what the worker did; raise concerns where they see supports drifting to routine-driven or worker-driven practice. |
| Participants and their chosen supporters | Lead planning, tell {{ org.name }} what they want changed, and take part in household meetings and reviews. |

## Procedure — person-centred practice on every shift

1. Before the first shift with a participant, and at the start of every shift, the worker reads the participant's About Me profile, current support plan and the most recent handover in {{ notes_software }}.
2. The worker greets the participant, checks how they want the shift to go, and confirms plans for the day against the participant's own routine and any household agreement, adjusting to what the participant wants that day.
3. Personal care, meals, medication support and household tasks are done with the participant, using the level of support in their plan (prompt, partial assistance, full assistance) and no more than that.
4. At each decision point (what to eat, what to wear, whether to go out, who to call) the worker offers real options in the participant's communication method, allows time, and follows the participant's choice unless it presents a serious and immediate safety risk, in which case the Autonomy and Dignity of Risk Policy applies.
5. The worker records in the progress note what the participant chose and did, what support was given, and anything the participant said they want changed.
6. If a worker cannot deliver a support the way the participant wants (roster gap, no vehicle, safety concern), the worker tells the participant honestly, records the reason and reports it to {{ rostering_manager }} for follow-up.
7. Requests to change supports, workers or routines are passed to {{ quality_lead }} within one business day and answered with the participant within five business days; changes to the support plan are made with the participant and re-issued to all workers.
8. At every support plan review (at least every six months, and at each NDIS plan change), {{ quality_lead }} meets the participant and their chosen supporters, reviews goals in the participant's own words and updates the About Me profile.

## Records kept

- About Me profile and daily support plan for each participant ({{ notes_software }})
- Progress notes and shift handover records ({{ notes_software }})
- Support plan review records, signed or otherwise confirmed by the participant
- Household meeting records (shared homes)
- Worker preference and matching record ({{ rostering_software }} notes) including reasons where a preference could not be met
- Participant Rights Statement acknowledgement
- Feedback and complaints records relating to choice and control (Complaints Register)

## Related documents

- Supported Decision-Making Policy and Procedure
- Autonomy and Dignity of Risk Policy
- Diversity and Cultural Safety Policy
- Privacy and Confidentiality Policy
- Assessment and Support Planning Procedure and Support Plan template
- Household Decision-Making and Household Rules Policy
- SIL Service Agreement template
- Participant Rights Statement (accessible)
- Complaints and Feedback Policy and Procedure

## Legislation and standards references

- National Disability Insurance Scheme Act 2013 (Cth), including the objects and general principles in Part 2 of Chapter 1 (sections 3 and 4)
- NDIS (Provider Registration and Practice Standards) Rules 2018 — NDIS Practice Standards, Core Module outcome 1.1 Person-centred supports
- NDIS Practice Standards, SIL supplementary module (registration group 0138, 2026), outcome 1 (supported decision-making)
- NDIS (Code of Conduct) Rules 2018 — the NDIS Code of Conduct
- United Nations Convention on the Rights of Persons with Disabilities
- Disability Discrimination Act 1992 (Cth)
- Privacy Act 1988 (Cth) and the Australian Privacy Principles
{% if 'NSW' in org.states %}
- Disability Inclusion Act 2014 (NSW)
{% endif %}
{% if 'VIC' in org.states %}
- Disability Act 2006 (Vic) and the Charter of Human Rights and Responsibilities Act 2006 (Vic)
{% endif %}
{% if 'QLD' in org.states %}
- Human Rights Act 2019 (Qld)
{% endif %}
{% if 'ACT' in org.states %}
- Human Rights Act 2004 (ACT)
{% endif %}

## Review

This policy is reviewed every 12 months, and earlier if the NDIS Practice Standards, the SIL supplementary module or the NDIS Code of Conduct change, or if an incident, complaint or audit finding shows the policy is not working. Owner: Quality Lead ({{ quality_lead }}). Approver: Director ({{ director }}). Participants and workers are consulted at each review.

## Document control

| Version | Drafted | Approved by | Approval date | Next review |
|---|---|---|---|---|
| 1.0 | {{ intake.meta.generated_on | date }} | {{ director }} | [TO CONFIRM on adoption] | 12 months after approval |
