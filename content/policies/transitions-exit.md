---
title: Transitions and Exit Policy and Procedure
slug: transitions-exit
doc_type: policy
standards: [core-3.5, sil-4]
applies_if: "true"
version: 1.0
review_months: 12
---
{% set gov = intake.governance %}{% set wf = intake.workforce %}{% set sup = intake.supports %}
{% set director = gov.ceo_or_director | default('[TO CONFIRM]', true) %}{% set quality_lead = gov.quality_lead | default('[TO CONFIRM]', true) %}{% set rostering_manager = gov.rostering_manager | default('[TO CONFIRM]', true) %}{% set privacy_officer = gov.privacy_officer | default('[TO CONFIRM]', true) %}{% set complaints_officer = gov.complaints_officer | default('[TO CONFIRM]', true) %}
{% set notes_software = wf.notes_software | default('[TO CONFIRM]', true) %}{% set rostering_software = wf.rostering_software | default('[TO CONFIRM]', true) %}
{% set tenancy_act = {'NSW': 'Residential Tenancies Act 2010 (NSW)', 'VIC': 'Residential Tenancies Act 1997 (Vic)', 'QLD': 'Residential Tenancies and Rooming Accommodation Act 2008 (Qld)', 'WA': 'Residential Tenancies Act 1987 (WA)', 'SA': 'Residential Tenancies Act 1995 (SA)', 'TAS': 'Residential Tenancy Act 1997 (Tas)', 'ACT': 'Residential Tenancies Act 1997 (ACT)', 'NT': 'Residential Tenancies Act 1999 (NT)'} %}
{% set ns = namespace(co_tenants=false) %}{% for home in intake.homes %}{% if home.co_tenants %}{% set ns.co_tenants = true %}{% endif %}{% endfor %}
# Transitions and Exit Policy and Procedure

## Purpose

Core Module outcome 3.5 requires planned and coordinated transitions to or from {{ org.name }}, and SIL supplementary module outcome 4 requires that ending SIL supports never puts a participant's housing at risk. This document sets out how {{ org.name }} manages every transition across its {{ intake.homes | length }} home{% if intake.homes | length != 1 %}s{% endif %} — moving in, moving out, changing provider, returning from hospital, or {{ org.name }} ending supports — and includes the Transition Plan and Handover Summary templates.

## Scope

This document applies to all participants, all workers ({{ wf.employment_types | join(', ') }}), key personnel and agency or contract workers of {{ org.name }}, and to every home:
{% for home in intake.homes %}
- {{ home.name }}, {{ home.address }} ({{ home.participants }} participant{% if home.participants != 1 %}s{% endif %}; tenancy held by {{ home.tenancy_holder | replace('_', ' ') }}{% if home.co_tenants %}; shared home{% endif %})
{% endfor %}

## Policy statement

- **Transitions are planned with the participant.** Every transition has a written Transition Plan agreed with the participant and the people they choose to involve, using supported decision-making.
- **Housing is protected.** A participant who leaves {{ org.name }} keeps their home unless they choose to move. {{ org.name }} never links ending supports to ending housing, never issues or requests a notice to vacate because supports are ending, and never holds keys, belongings or tenancy papers as leverage.
- **Support continues without a gap.** Funded supports continue until the agreed transition date and the roster in {{ rostering_software }} stays filled; staffing is never reduced because a participant is leaving.
- **Information follows the participant, with consent.** A Handover Summary is prepared for every exit and released to the incoming provider only with written consent, under the Privacy and Confidentiality Policy.
- **Notice periods are honoured.** Under the SIL Service Agreement a participant can end supports with 14 days' notice (or less by agreement); {{ org.name }} can end supports only with 28 days' notice and a Transition Plan, or sooner only where there is a serious and immediate safety risk that cannot be managed.
- **Participants are not exited for being hard to support.** Changes in behaviour, health, funding or relationships are first addressed through support planning, behaviour support and a roster-of-care or plan review; ending supports is a last resort approved by {{ director }}.
- **Co-tenants are considered.** {% if ns.co_tenants %}When a participant leaves or joins a shared home, the other participants are consulted beforehand and the consultation is recorded in the Household Meeting Record.{% else %}No current home is shared; if one becomes shared, every participant is consulted before any change.{% endif %} One participant's change of provider never affects another's housing.

## Roles and responsibilities

| Role | Responsibilities |
|---|---|
| {{ director }} | Approves every provider-initiated ending and any shorter-notice exit; signs those Transition Plans; approves this document. |
| {{ quality_lead }} | Owns this document; reviews each completed transition and records lessons on the Continuous Improvement Register; audits Transition Plans annually. |
| {{ rostering_manager }} | Transition coordinator; keeps the roster filled in {{ rostering_software }}; liaises with support coordinators, other providers and tenancy holders. |
| {{ privacy_officer }} and {{ complaints_officer }} | Confirm consent before any record is released; treat any complaint about pressure to leave or housing threats as a priority complaint. |
| House leaders and support workers | Prepare the practical handover; introduce new participants; follow the Transition Plan on every shift; record transition tasks and wellbeing in {{ notes_software }}. |

## Procedure

### Part A — A participant moving in

1. Once the Access and Intake Procedure confirms {{ org.name }} can meet the participant's needs, {{ rostering_manager }} opens a Transition Plan with the participant, their supporters and support coordinator, ideally 2 weeks before the move.
2. With consent, {{ rostering_manager }} obtains the participant's current plans (support, health{% if sup.medication_involvement != 'none' %}, medication{% endif %}{% if sup.mealtime_management %}, mealtime{% endif %}{% if sup.behaviour_support_plans or sup.restrictive_practices != 'none' %}, behaviour support and any restrictive practice authorisation{% endif %}) and communication profile from the outgoing provider, family or clinicians.
3. The participant visits the home and meets workers and any co-tenants as often as they want before moving in; the house leader records their preferences{% if ns.co_tenants %} and the compatibility discussion with existing participants{% endif %} in {{ notes_software }}.
4. {{ rostering_manager }} confirms the participant has a separate written housing agreement with the tenancy holder and that the SIL Service Agreement has been explained and signed; the two agreements are filed separately.
5. Before the first shift the house leader briefs all rostered workers on the participant's plans, then checks in with the participant weekly for 4 weeks; the Transition Plan is reviewed at weeks 2 and 4.

### Part B — A participant choosing to leave or change provider

1. A worker who hears that a participant wants to leave records it in {{ notes_software }} and tells the house leader the same day; nobody questions the decision or discusses the participant's housing.
2. Within 2 business days {{ rostering_manager }} confirms the decision with the participant, offers decision support, and opens a Transition Plan with the participant, their support coordinator and the incoming provider.
3. {{ rostering_manager }} confirms in writing that the participant's housing is unaffected, shares with the tenancy holder only what the participant agrees, and arranges reasonable access for the incoming provider where the participant is staying.
4. Supports continue at the agreed level through the notice period; any reduction requested by the participant is recorded.
5. The house leader prepares the Handover Summary; {{ privacy_officer }} confirms written consent and releases it to the incoming provider at least 5 business days before the transition date.
6. On the final day the house leader returns keys, cards, documents, medication{% if sup.participant_money_handling %}, money with a final reconciled Transaction Record{% endif %} and belongings against a signed receipt and closes the roster in {{ rostering_software }}; {{ quality_lead }} offers an exit conversation and reviews the transition within 2 weeks.

### Part C — {{ org.name }} ending supports

1. {{ rostering_manager }} prepares a proposal only after support plan review, clinical or behaviour support input and a request for plan or roster-of-care review have been tried and recorded.
2. {{ director }} decides, records the reasons, and confirms the decision is unrelated to any complaint, incident report, advocacy or plan change.
3. The participant, their supporters and support coordinator are told in a meeting, then in writing with 28 days' notice; the NDIA is informed so alternative supports can be arranged. A Transition Plan is opened immediately and Part B steps 3 to 6 apply.
4. Where continuing would create a serious and immediate risk that cannot be managed, {{ director }} may set a shorter period, records the risk assessment, and notifies the NDIA, the support coordinator and, for any reportable incident, the NDIS Commission.

### Part D — Unplanned transitions

1. For a hospital admission the Health and Wellbeing Policy applies; {{ rostering_manager }} keeps the participant's place and belongings, plans the return with the discharge team, and updates the support plan before the participant comes home.
2. If a participant dies, the Incident Management Policy applies (Commission notification within 24 hours); {{ director }} manages contact with family, the tenancy holder and co-tenants, and belongings are released only to the executor or legally entitled person against a signed receipt.
3. If {{ org.name }} must cease operating a home or the service, {{ director }} follows the Business Continuity Plan, gives participants and the NDIA at least 28 days' notice unless the home is unsafe, notifies the NDIS Commission as required, and opens a Transition Plan for every participant.

## Templates

### Transition plan template

| Field | Entry |
|---|---|
| Participant name and NDIS number | (example — delete) J. Example, 430 000 000 |
| Type of transition, participant's goals and key dates | Moving in / leaving / change of provider / return from hospital / provider-initiated; goals in the participant's words; decision; notice given; Handover Summary released; final support date; review dates |
| Transition coordinator; people involved and their roles | {{ rostering_manager }}; participant; nominated supporter; support coordinator; other provider |
| Housing status and tenancy holder | Staying at current home; housing agreement unaffected — confirmed in writing on [date] |
| Supports, risks and co-tenant consultation | Roster unchanged until [date]; familiar worker in final week; household meeting held [date] |
| Information to be shared and consent | Handover Summary; support plan; health plan — consent signed [date] |
| Items to return or transfer | Keys; cards; medication; records; belongings; money reconciled |
| Signatures | Participant or decision-maker; transition coordinator; {{ director }} for provider-initiated exits |

### Handover summary template

| Section | Content |
|---|---|
| Participant, date of birth, NDIS number, plan dates | (example — delete) |
| Communication and decision-making | How the participant communicates, understands and decides; aids used |
| Support needs, routines and risks | Daily routine; personal care; mobility; night support; risk assessment and safety plan |
| Health | Diagnoses; allergies; clinicians; Individual Health Plan{% if sup.medication_involvement != 'none' %}; medication chart and level of medication support{% endif %}{% if sup.mealtime_management %}; mealtime management plan and IDDSI levels{% endif %} |
| Behaviour support | {% if sup.behaviour_support_plans or sup.restrictive_practices != 'none' %}Current plan, practitioner contact, authorisations and expiry dates{% else %}No plan in place; any emerging needs{% endif %} |
| Money and property | {% if sup.participant_money_handling %}Final reconciled Transaction Record; items returned with receipt{% else %}Not applicable — {{ org.name }} does not handle participant money{% endif %} |
| Open matters; prepared by; consent reference | Appointments; open incidents or complaints; house leader; {{ privacy_officer }} consent check |

## Records kept

- Transition Plans and Handover Summaries in the participant record in {{ notes_software }}, with consent and receipts.
- Written housing confirmation to the participant; {{ director }}'s recorded decision for any provider-initiated ending.
- Roster records in {{ rostering_software }} showing supports continued through the notice period.
- Exit feedback, post-transition reviews and Continuous Improvement Register entries.

## Related documents

- sil-service-agreement
- tenancy-housing-support-separation
- access-intake
- assessment-support-planning
- supported-decision-making
- privacy-confidentiality
- health-wellbeing
- incident-management
- household-decision-making

## Legislation and standards references

- National Disability Insurance Scheme Act 2013 (Cth)
- NDIS (Provider Registration and Practice Standards) Rules 2018 — Core Module outcome 3.5 (transitions) and continuity of supports; SIL supplementary module outcome 4
- NDIS (Incident Management and Reportable Incidents) Rules 2018
- NDIS Code of Conduct (NDIS (Code of Conduct) Rules 2018)
- Privacy Act 1988 (Cth) and the Australian Privacy Principles
{% for state in org.states %}- {{ tenancy_act[state | upper] | default('Residential tenancies legislation of ' ~ state ~ ' [TO CONFIRM]') }}
{% endfor %}

## Review

This document is reviewed every 12 months, after every provider-initiated exit and after any complaint about a transition. Review owner: {{ quality_lead }}. Approval: {{ director }}.

## Document control

| Version | Approved by | Approval date | Next review |
|---|---|---|---|
| 1.0 | {{ director }} | [TO CONFIRM] | [TO CONFIRM — 12 months after approval] |
