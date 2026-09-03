---
title: Assessment and Support Planning Procedure
slug: assessment-support-planning
doc_type: procedure
standards: [core-3.2, core-1.4, core-1.1, sil-1]
applies_if: "true"
version: 1.0
review_months: 12
---
{% set gov = intake.governance %}{% set wf = intake.workforce %}{% set sup = intake.supports %}
{% set director = gov.ceo_or_director | default('[TO CONFIRM]', true) %}{% set quality_lead = gov.quality_lead | default('[TO CONFIRM]', true) %}{% set rostering_manager = gov.rostering_manager | default('[TO CONFIRM]', true) %}
{% set notes_software = wf.notes_software | default('[TO CONFIRM]', true) %}
# Assessment and Support Planning Procedure

## Purpose

This procedure describes how {{ org.name }} works with each participant to assess their strengths, needs and risks and to develop, implement and review a support plan that is written in the participant's own words, directed by the participant, and used by every worker on every shift. It gives effect to Core Module outcome 3.2 (support planning), outcomes 1.1 and 1.4 (person-centred supports, independence, informed choice and dignity of risk), and SIL supplementary module outcome 1 (supported decision-making).

## Scope

This procedure applies to every participant receiving SIL supports from {{ org.name }} in any of its homes, from acceptance under the Access and Intake Procedure until exit. Support plans are stored in {{ notes_software }} and are the primary reference for workers. Behaviour support plans are developed by an NDIS behaviour support practitioner and are attached to, not replaced by, the support plan.

## Roles and responsibilities

| Role | Responsibilities |
|---|---|
| {{ director }} | Approves this procedure; approves any support that carries a significant risk after a dignity-of-risk discussion. |
| {{ quality_lead }} | Owns this procedure; audits support plans quarterly for currency, participant voice and use on shift. |
| {{ rostering_manager }} | Leads initial assessment and planning meetings; ensures rosters reflect the plan; schedules reviews. |
| House leaders | Coordinate day-to-day implementation; update routine guides; run plan check-ins with the participant; brief all workers on changes. |
| All workers | Support in accordance with the plan; record progress toward goals in notes; raise changes in needs or preferences. |
| Participant | Directs their plan, chooses who is involved, decides the goals and how they want support delivered. |
| Decision-making supporters (family, friends, guardian, nominee, advocate) | Support the participant to understand, decide and communicate, in the way the participant chooses. |

## Procedure

### Part A — Initial assessment (before or within the first 2 weeks of support)

1. {{ rostering_manager }} arranges assessment conversations with the participant at times and places the participant chooses, with the supporters the participant wants present and with any communication support (interpreter, Auslan, AAC device, Easy Read materials) arranged in advance.
2. Assessment starts with the participant's strengths, interests, relationships, culture, faith and what a good life looks like to them, and only then covers support needs. Information is gathered from the participant first, then (with consent) from previous plans, allied health reports, the behaviour support plan, health and medication records and family.
3. Assessment covers: daily routines and preferred times; personal care preferences and the gender of workers; communication (how the participant expresses yes, no, pain, distress and happiness); decision-making (which decisions the participant makes alone, which they want help with, and who they want to help); health and medication{% if sup.mealtime_management %}; eating, drinking and swallowing{% endif %}; mobility and manual handling; community, work, learning and relationships; money and property handling preferences; sensory needs; and risks the participant chooses to take.
4. Risk is assessed with the participant using {{ org.name }}'s Risk Assessment Template. Where the participant chooses an activity that carries risk (for example going out alone, cooking, alcohol, relationships), the dignity-of-risk discussion records the risk, what the participant understands about it, the supports that reduce it, and the participant's decision. {{ org.name }} does not refuse a choice because it is risky unless there is a legal basis to do so, and never uses a restrictive practice as a risk control outside a behaviour support plan.
5. Where the participant has a guardian, nominee or administrator, their legal role is confirmed from the order or appointment, recorded, and limited to the decisions the order covers. All other decisions stay with the participant.

### Part B — Developing the support plan (within 4 weeks of starting support)

1. The participant and the people they choose meet {{ rostering_manager }} and the house leader to write the plan using the Support Plan Template. Goals are written in the participant's own words. If the participant does not use words, goals are recorded from what the participant shows through their behaviour, choices and communication method, and the plan says how this was interpreted and by whom.
2. The plan states, for each routine and goal, exactly what workers do, what the participant does, and what "good support" looks like to the participant, so that every worker does it the same way.
3. The plan is checked against the participant's NDIS plan and roster of care by {{ rostering_manager }}, and against any behaviour support plan{% if sup.restrictive_practices != 'none' %}, restrictive practice authorisation{% endif %}, mealtime plan or health plan by the relevant practitioner, so that there are no contradictions.
4. The plan is produced in the participant's preferred format (Easy Read, pictures, audio) as well as the full version. The participant signs or otherwise confirms agreement; if they do not agree, the plan records what is in dispute and how it will be resolved.
5. The house leader briefs all workers rostered to the participant on the plan at a house meeting and in {{ notes_software }} before it takes effect; agency workers receive the plan summary at handover.

### Part C — Implementing and monitoring

1. Workers record progress toward goals and any change in needs or preferences in progress notes each shift.
2. The house leader holds a plan check-in with the participant at least monthly (recorded in {{ notes_software }}) asking what is working, what is not, and what they want changed. Changes the participant asks for are made unless they conflict with safety, funding or law, in which case the reason is explained and recorded.
3. Where a participant's needs change suddenly (hospital admission, deterioration, a new diagnosis, a change in behaviour, a new co-tenant), {{ rostering_manager }} convenes a plan review within 5 business days and updates the plan and roster.

### Part D — Review

1. The full support plan is reviewed with the participant at least every 6 months, before each NDIS plan reassessment, and after any significant change or incident.
2. The review covers goal progress, the participant's satisfaction, incidents and complaints, health and medication changes, risk, decision-making arrangements and whether the participant wants to change anything about their home, co-tenants or supports.
3. The reviewed plan is approved by the participant, dated, versioned in {{ notes_software }} and the old version archived. The house leader briefs workers on changes within 5 business days.
4. {{ quality_lead }} audits a sample of plans each quarter for: participant's own words; goals linked to routines and notes; current risk assessment; decision-making arrangements recorded; consistency with the behaviour support, mealtime and health plans; and evidence that workers use the plan.

## Templates

### Support plan template

| Section | Content |
|---|---|
| Participant name, preferred name, date of birth, home | J. Example, "Jay", {{ intake.homes[0].name | default('[home]') }} (example — delete) |
| Plan version, date, review due | v1, 01/08/2026, review 01/02/2027 |
| About me — strengths, interests, what matters to me, culture and faith | In my words: "I like footy, cooking Thai food and my sister visiting." |
| My goals (in my own words) | Goal 1: "Cook dinner for the house once a week." Goal 2: "Get to footy training on my own by bus." |
| How I communicate | How I say yes, no, pain, happy, upset; my communication aids; who understands me best |
| Decisions I make and how I want support to decide | Which decisions I make myself; who I want to help; how to give me information; my guardian or nominee and what they decide (from the order) |
| My daily routines and how I want support (morning, day, evening, overnight) | Step by step, what I do and what workers do; times I prefer |
| My health and medication | Conditions, health plan reference, medication support level ({{ sup.medication_involvement | default('[TO CONFIRM]', true) }}), allergies, signs I am unwell, who to call |
{% if sup.mealtime_management %}| Eating and drinking | Mealtime management plan reference; textures; positioning; supervision |
{% endif %}| Behaviour support | Behaviour support plan reference; what helps me stay calm; what to avoid{% if sup.restrictive_practices != 'none' %}; authorised restrictive practices and conditions{% endif %} |
| Risks I choose to take and how we manage them (dignity of risk) | Risk, what I understand, supports agreed, my decision, date discussed |
| Money and property | How I want help with money, if at all; who holds my cards; spending I decide alone |
| Community, work, learning, relationships | What I do, when, and what support I want |
| My home and housemates | House rules I agreed to; my room; visitors; what I want changed |
| Workers I prefer and do not want | Gender, language, attributes; any worker I have asked not to support me |
| People in my life and emergency contacts | Name, role, contact, what they can be told |
| Agreement | Participant signature or confirmation method; supporter; {{ rostering_manager }}; date |

## Records kept

- Assessment records, risk assessments and dignity-of-risk records in {{ notes_software }}.
- Support plans (all versions), accessible-format versions and participant agreement records.
- Monthly check-in records, 6-monthly reviews and change briefings to workers.
- Guardianship, nominee and administration orders on file.
- Quarterly support plan audit results.

## Related documents

- access-intake
- supported-decision-making
- autonomy-dignity-of-risk
- person-centred-supports
- household-decision-making
- health-wellbeing
- medication-management
- mealtime-management
- restrictive-practices-behaviour-support
- risk-management
- shift-handover-progress-notes

## Legislation and standards references

- National Disability Insurance Scheme Act 2013 (Cth), including the objects and principles in sections 3 and 4
- NDIS (Provider Registration and Practice Standards) Rules 2018 — Core Module outcomes 1.1, 1.4 and 3.2; SIL supplementary module outcome 1
- NDIS (Restrictive Practices and Behaviour Support) Rules 2018
- NDIS Code of Conduct
- Privacy Act 1988 (Cth) and the Australian Privacy Principles
- United Nations Convention on the Rights of Persons with Disabilities, Article 12 (equal recognition before the law) and Article 19 (living independently)
{% for state in org.states %}- Guardianship and administration legislation of {{ state }} [TO CONFIRM Act title for {{ state }}]
{% endfor %}

## Review

This procedure is reviewed every 12 months. Review owner: {{ quality_lead }}. Approval: {{ director }}.

## Document control

| Version | Approved by | Approval date | Next review |
|---|---|---|---|
| 1.0 | {{ director }} | [TO CONFIRM] | [TO CONFIRM — 12 months after approval] |
