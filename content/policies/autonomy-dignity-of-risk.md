---
title: Autonomy, Independence and Dignity of Risk Policy
slug: autonomy-dignity-of-risk
doc_type: policy
standards: [core-1.4, sil-1]
applies_if: "true"
version: 1.0
review_months: 12
---
{% set director = intake.governance.ceo_or_director | default('[TO CONFIRM]', true) %}
{% set quality_lead = intake.governance.quality_lead | default('[TO CONFIRM]', true) %}
{% set incident_officer = intake.governance.incident_officer | default('[TO CONFIRM]', true) %}
{% set rostering_manager = intake.governance.rostering_manager | default('[TO CONFIRM]', true) %}
{% set notes_software = intake.workforce.notes_software | default('[TO CONFIRM]', true) %}

# Autonomy, Independence and Dignity of Risk Policy

## Purpose

This policy sets out how {{ org.name }} supports participants to make informed choices, exercise control over their own lives and take reasonable risks in pursuit of their goals, while meeting its duty of care. It evidences NDIS Practice Standards Core Module outcome 1.4 (Independence and informed choice) and the SIL supplementary module outcome on supported decision-making and dignity of risk, and it works alongside the Supported Decision-Making Policy and Procedure and the Risk Management Policy.

## Scope

This policy applies to every participant supported by {{ org.name }} in its {{ intake.homes | length }} home{% if intake.homes | length != 1 %}s{% endif %} and in the community, to all workers and key personnel, and to every everyday and significant choice a participant makes: what to eat and drink, smoking and alcohol, how to spend money, when to go out and whether to go alone, use of public transport, relationships and sexual expression, health treatment and medication, employment and study, who visits, and how the home is run. It also applies to decisions with a safety dimension in shared homes, where one participant's choice affects co-residents.

## Policy statement

{{ org.name }} holds that the right to make choices includes the right to make choices that others think are unwise, and that being protected from every risk is itself a harm: it removes independence, learning and dignity. Its duty of care is a duty to support participants safely in the life they choose, not a duty to prevent them living it.

### Principles

- **Presumption of capacity.** Every adult participant is presumed able to make their own decisions with the right support and information. A disability, a diagnosis, a guardianship order over some decisions, or a history of "poor" choices does not remove this presumption for other decisions.
- **Informed choice.** A choice is informed when the participant has the information they need, in a form they understand, about the options, the likely benefits and the likely risks, and time to consider it. Workers give information; they do not withhold options to steer an outcome.
- **Dignity of risk.** Participants are supported to take reasonable risks in pursuit of their goals, as the NDIS Act principles require. Risk is managed with the participant, by building skills, planning and safeguards, rather than by prohibition.
- **Least restrictive response.** Where a real risk of serious harm exists, {{ org.name }} looks first for the least restrictive way to reduce it. Locking cupboards, fridges or doors, confiscating items, withholding money, cigarettes or food, restricting movement or contact, or "just saying no" are not used as everyday risk controls. Any practice that restricts a participant's rights or freedom of movement is a restrictive practice and is handled only under the Restrictive Practices Policy{% if intake.supports.restrictive_practices == 'none' %}; {{ org.name }} does not currently use any restrictive practice and would need to obtain a behaviour support plan and the required authorisation before any such practice could be used{% elif intake.supports.restrictive_practices == 'authorised' %}, in accordance with the participant's behaviour support plan and the state or territory authorisation{% else %}; any current use that is not in accordance with an authorisation and a behaviour support plan is a reportable incident and must be raised with {{ incident_officer }} immediately{% endif %}.
- **Independence is built, not assumed away.** Support plans record what each participant does for themselves, what they are learning, and the skill-building support {{ org.name }} gives, so that the level of assistance reduces over time where the participant wants that.
- **Risk to others is different from risk to self.** A participant's right to accept risk applies to risk to themselves. Where a choice creates a serious risk to a co-resident, a worker or the public, {{ org.name }} intervenes proportionately, records the intervention, and reviews it with the participant.
- **Substitute decision-makers are involved only where the law requires.** A guardian, administrator or NDIS nominee is consulted about the decisions their appointment covers, and even then the participant's own will and preferences are sought and recorded first. Family members and workers do not veto a participant's choices because they disagree with them.

### Everyday examples of how {{ org.name }} applies this

- A participant who wants to walk to the shops alone is supported with a travel-training plan, a phone with key contacts, a check-in arrangement and a gradual increase in independence, rather than being told they must always be accompanied.
- A participant who chooses to eat food outside a dietitian's recommendation is given clear information about the consequences, offered alternatives, and their choice is respected and recorded{% if intake.supports.mealtime_management %}; where a mealtime management plan addresses choking or aspiration risk, the participant, speech pathologist and worker plan together how the participant's food preferences can be met as safely as possible{% endif %}.
- A participant who wants an intimate relationship is supported with privacy, information about consent and sexual health, and safety planning, not with prohibition.
- A participant who chooses to decline a medication dose has that refusal respected, recorded and reported under the Medication Management Policy so the prescriber can review.

## Roles and responsibilities

| Role | Responsibilities under this policy |
|---|---|
| Director — {{ director }} | Approves this policy; is the final decision-maker where a proposed risk control would restrict a participant's rights; ensures the organisation's risk appetite supports participant autonomy rather than defensive practice. |
| Quality Lead — {{ quality_lead }} | Owns this policy; leads supported risk-taking plans with participants; ensures support plans record independence goals and skill-building; audits for restrictive or paternalistic practice; arranges behaviour support and allied health input where a risk needs specialist planning. |
| Incident Officer — {{ incident_officer }} | Reviews incidents arising from chosen risks to distinguish poor outcomes from poor practice; identifies any unauthorised restrictive practice and manages it as a reportable incident. |
| Rostering Manager — {{ rostering_manager }} | Rosters so that support for chosen activities (community access, travel training, relationships) is actually available at the times participants want them. |
| Support workers | Offer options and information, respect choices, follow supported risk-taking plans, never impose restrictions for convenience, record choices and the support given, and escalate promptly where a choice creates a serious and immediate risk. |

## Procedure — supported risk-taking

1. Recognise the decision: when a participant expresses a choice that a worker believes carries a real risk, the worker supports the immediate choice where the risk is minor, and records it. Where the risk of serious harm is real, the worker tells the participant honestly what the concern is and refers the matter to {{ quality_lead }} within one business day.
2. {{ quality_lead }} meets the participant (with their chosen supporter or advocate if they wish, and an interpreter or communication support if needed) to understand what the participant wants and why it matters to them.
3. Together they identify the specific risks, how likely and how serious they are, who is affected, and what the participant already does to manage them.
4. They identify options that let the participant achieve their goal with reduced risk: skills training, equipment, technology, a different time or place, a check-in arrangement, involving a health professional, or a staged approach.
5. The participant chooses. If the participant's choice still carries risk, {{ org.name }} respects it unless the risk is of serious harm to others or the participant lacks capacity for this decision and a lawfully authorised substitute decision-maker decides otherwise.
6. The agreed approach is written in a Supported Risk-Taking Plan on the participant's file in {{ notes_software }}, stating the goal, the risks discussed, the participant's decision, the safeguards, the workers' role, and the review date. The participant confirms the plan in their preferred way.
7. All workers are briefed through {{ notes_software }} and shift handover; no worker may vary the plan by adding restrictions.
8. The plan is reviewed at the agreed date (no later than the next support plan review) or immediately after an incident, with the participant, and updated. Incidents connected to the plan are recorded in the Incident Register and reviewed for learning, not used as grounds for blanket restriction.

## Records kept

- Support plans with independence goals and skill-building strategies ({{ notes_software }})
- Supported Risk-Taking Plans and review records
- Progress notes recording choices offered, choices made and support given
- Incident Register entries linked to chosen risks, and the review outcome
- Guardianship, administration and nominee orders on file, with their scope
- Restrictive Practices records (or documented non-use)
- Household meeting records where a choice affects co-residents

## Related documents

- Supported Decision-Making Policy and Procedure
- Person-Centred Supports Policy
- Risk Management Policy and Framework (participant-level risk assessment)
- Restrictive Practices Policy
- Medication Management Policy
- Mealtime Management Policy
- Household Decision-Making and Household Rules Policy
- Incident Management Policy and Procedure
- Participant Rights Statement

## Legislation and standards references

- National Disability Insurance Scheme Act 2013 (Cth), section 4 general principles (including that people with disability should be supported to exercise choice, including in relation to taking reasonable risks, in the pursuit of their goals)
- NDIS (Provider Registration and Practice Standards) Rules 2018 — NDIS Practice Standards, Core Module outcome 1.4 Independence and informed choice
- NDIS Practice Standards, SIL supplementary module (registration group 0138, 2026), outcome 1 (supported decision-making and dignity of risk)
- NDIS (Restrictive Practices and Behaviour Support) Rules 2018
- NDIS (Code of Conduct) Rules 2018 — the NDIS Code of Conduct
- United Nations Convention on the Rights of Persons with Disabilities (Articles 12 and 19)
{% if 'NSW' in org.states %}
- Guardianship Act 1987 (NSW); Work Health and Safety Act 2011 (NSW)
{% endif %}
{% if 'VIC' in org.states %}
- Guardianship and Administration Act 2019 (Vic); Disability Act 2006 (Vic); Occupational Health and Safety Act 2004 (Vic)
{% endif %}
{% if 'QLD' in org.states %}
- Guardianship and Administration Act 2000 (Qld); Disability Services Act 2006 (Qld); Work Health and Safety Act 2011 (Qld)
{% endif %}
{% if 'SA' in org.states %}
- Guardianship and Administration Act 1993 (SA); Disability Inclusion Act 2018 (SA); Work Health and Safety Act 2012 (SA)
{% endif %}
{% if 'WA' in org.states %}
- Guardianship and Administration Act 1990 (WA); Work Health and Safety Act 2020 (WA)
{% endif %}
{% if 'TAS' in org.states %}
- Guardianship and Administration Act 1995 (Tas); Work Health and Safety Act 2012 (Tas)
{% endif %}
{% if 'ACT' in org.states %}
- Guardianship and Management of Property Act 1991 (ACT); Senior Practitioner Act 2018 (ACT); Work Health and Safety Act 2011 (ACT)
{% endif %}
{% if 'NT' in org.states %}
- Guardianship of Adults Act 2016 (NT); Work Health and Safety (National Uniform Legislation) Act 2011 (NT)
{% endif %}

## Review

Reviewed every 12 months by the Quality Lead ({{ quality_lead }}) and approved by the Director ({{ director }}), and earlier after any incident, complaint or audit finding involving restriction of a participant's choices or an unauthorised restrictive practice.

## Document control

| Version | Drafted | Approved by | Approval date | Next review |
|---|---|---|---|---|
| 1.0 | {{ intake.meta.generated_on | date }} | {{ director }} | [TO CONFIRM on adoption] | 12 months after approval |
