---
title: Access and Intake Procedure
slug: access-intake
doc_type: procedure
standards: [core-3.1, sil-4, sil-1, core-1.1]
applies_if: "true"
version: 1.0
review_months: 12
---
{% set gov = intake.governance %}{% set wf = intake.workforce %}{% set sup = intake.supports %}
{% set director = gov.ceo_or_director | default('[TO CONFIRM]', true) %}{% set quality_lead = gov.quality_lead | default('[TO CONFIRM]', true) %}{% set rostering_manager = gov.rostering_manager | default('[TO CONFIRM]', true) %}{% set privacy_officer = gov.privacy_officer | default('[TO CONFIRM]', true) %}
{% set notes_software = wf.notes_software | default('[TO CONFIRM]', true) %}
{% set tenancy_label = {'provider': org.name ~ ' holds the lease or owns the dwelling', 'sda_provider': 'a Specialist Disability Accommodation (SDA) provider holds the dwelling', 'private_landlord': 'the participant rents from a private landlord', 'participant': 'the participant owns the home or holds the lease in their own name'} %}
# Access and Intake Procedure

## Purpose

This procedure describes how {{ org.name }} responds to enquiries about Supported Independent Living, decides fairly whether it can meet a person's needs, matches a person to a home and co-tenants, gives information in ways people understand, and explains its decision. It gives effect to Core Module outcome 3.1 (access to supports) and SIL supplementary module outcome 4 (the person understands what they are agreeing to for housing and for support, and that these are separate) and outcome 1 (decisions are made by the participant).

## Scope

This procedure applies to every enquiry and referral for SIL supports at {{ org.name }}, whether from a participant, family member, guardian, support coordinator, hospital, SDA provider, the NDIA or another provider, for any vacancy in {{ org.name }}'s homes ({% for home in intake.homes %}{{ home.name }} in {{ home.state | default('[state]', true) }}{% if not loop.last %}; {% endif %}{% endfor %}) or for a new home the participant already lives in or is moving to.

## Roles and responsibilities

| Role | Responsibilities |
|---|---|
| {{ director }} | Makes the final decision to accept or decline and signs the letter of decision; approves any new home or change to a home's participant numbers. |
| {{ quality_lead }} | Owns this procedure; ensures information is available in accessible formats; reviews declined enquiries for fairness quarterly. |
| {{ rostering_manager }} | Assesses whether the roster of care can be staffed safely; leads the intake assessment visits; confirms workforce capability for the person's needs. |
| {{ privacy_officer }} | Ensures consent is obtained before information is collected from others and that intake records are stored in {{ notes_software }} with correct access. |
| House leaders | Facilitate co-tenant meetings and visits; give honest feedback on compatibility from current participants. |
| Current participants of the home | Take part in deciding who moves into their home, with the support they choose. |

## Procedure

### Part A — Enquiry (within 2 business days)

1. Every enquiry is recorded on the Enquiry and Intake Register in {{ notes_software }} with the date, source, the person's name and contact, the referrer, the person's NDIS plan status and whether SIL is funded, and the home or area of interest.
2. {{ rostering_manager }} contacts the person (and, with the person's agreement, their nominee, guardian or support coordinator) within 2 business days to explain what {{ org.name }} offers, the homes currently with vacancies, and the intake steps.
3. The person is offered the Participant Information Pack in the format they prefer: Easy Read, large print, audio, a language other than English through the Translating and Interpreting Service (131 450), Auslan through a booked interpreter, or a face-to-face explanation. The pack includes the Participant Rights Statement, an Easy Read summary of the SIL Service Agreement, information on complaints and advocacy, and a plain-language explanation that the support agreement and any housing agreement are separate.
4. If {{ org.name }} has no vacancy or cannot meet the request at all (for example the person needs supports {{ org.name }} does not provide{% if not sup.high_intensity %}, such as high intensity daily personal activities{% endif %}), this is explained immediately, recorded, and the person is given other options such as the NDIS Provider Finder, their support coordinator or the Local Area Coordinator.

### Part B — Eligibility and information gathering (within 10 business days)

1. With the person's written or documented verbal consent, {{ rostering_manager }} obtains: the NDIS plan (confirming SIL funding or a pending SIL request), current support plans, behaviour support plan and any restrictive practice authorisation, health information including medication, mealtime and allied health plans, a hospital discharge summary if relevant, and contact details for decision-making supporters.
2. {{ rostering_manager }} meets the person at least twice, at least once in a place the person chooses, to hear directly from the person what they want from their home and supports, what a good day looks like, their routines, relationships, culture, religion, communication, risks they accept, and any past experiences with SIL.
3. The person is invited to visit each home under consideration, meet the current participants and workers, see the bedroom, and spend time there (including a meal or an overnight stay where all parties agree).
4. {{ rostering_manager }} completes the Intake Assessment covering: support needs by time of day; overnight needs and whether the home's roster model ({{ intake.homes[0].roster_model | default('[TO CONFIRM]', true) }} at {{ intake.homes[0].name | default('[home]', true) }}, and as listed for other homes) is suitable; medication, mealtime, health and behaviour support requirements against {{ org.name }}'s current capability ({{ sup.medication_involvement | default('[TO CONFIRM]', true) }} medication involvement{% if sup.mealtime_management %}, mealtime management{% endif %}{% if sup.restrictive_practices != 'none' %}, authorised restrictive practices{% endif %}); workforce capacity and training needed; accessibility of the home; and any risks to or from co-tenants.

### Part C — Matching to a home and co-tenants

1. Compatibility is assessed with the current participants of the home, not for them. The house leader supports current participants to meet the person, discuss shared spaces, routines, noise, visitors and pets, and say whether they are comfortable. A participant's objection is a decisive factor unless it is discriminatory, in which case {{ director }} decides after taking advice.
2. {{ rostering_manager }} assesses co-tenant risk: history of violence or exploitation, safeguarding concerns, incompatible sleep or sensory needs, and whether any restrictive practice in place for one participant would affect another.
3. Housing is confirmed separately from support. For the relevant home, the housing arrangement is: {% for home in intake.homes %}{{ home.name }} — {{ tenancy_label[home.tenancy_holder] | default('[TO CONFIRM tenancy holder]') }}{% if home.sda %} (SDA-enrolled dwelling){% endif %}{% if not loop.last %}; {% endif %}{% endfor %}. The person is told who they will have a housing agreement with, what it costs, and that they can keep living there if they change support provider (see the Tenancy, Housing and Support Separation Policy). Where {{ org.name }} is also the landlord or head tenant, the conflict of interest is disclosed in writing and the person is offered independent advice.
4. {{ rostering_manager }} confirms the proposed roster of care can be staffed by trained workers within the person's funding, and whether any change to the home's roster model or the NDIA roster of care is needed.

### Part D — Decision to accept or decline (within 15 business days of complete information)

1. {{ rostering_manager }} presents the Intake Assessment, the compatibility outcome and workforce plan to {{ director }}.
2. {{ director }} decides to accept, accept with conditions (for example a transition period, training to be completed first, or a trial stay), or decline.
3. A decision to decline is made only for documented, non-discriminatory reasons: no vacancy; needs that {{ org.name }} cannot safely meet with its current capability; incompatibility identified by current participants or the risk assessment; or funding that does not cover the supports needed. Reasons are recorded on the Enquiry and Intake Register.
4. The decision is given to the person in writing and in their preferred format within 5 business days, with the reasons, alternative options, how to ask for a review by {{ director }} and how to complain to {{ org.name }} or the NDIS Quality and Safeguards Commission.
5. If accepted, {{ rostering_manager }} arranges the SIL Service Agreement meeting, the support planning process under the Assessment and Support Planning Procedure, and a transition plan under the Transitions and Exit Policy. The housing agreement is arranged with the relevant tenancy holder as a separate step.

## Templates

### Enquiry and intake register

| Enquiry no. | Date | Person (initials) | Referrer | SIL funded (Y/N/pending) | Home(s) considered | Information format provided | Visits and co-tenant meetings (dates) | Decision and date | Reasons (if declined or conditional) | Communicated by / format | Review requested |
|---|---|---|---|---|---|---|---|---|---|---|---|
| E-2026-001 (example — delete) | 01/07/2026 | K.L. | Support coordinator | Y | {{ intake.homes[0].name | default('[home]') }} | Easy Read + face-to-face | 08/07, 15/07 | Accepted 22/07/2026 | n/a | {{ rostering_manager }} / letter + Easy Read | N |

### Intake assessment summary

| Area | Findings | Can {{ org.name }} meet this now? | Actions needed |
|---|---|---|---|
| What the person wants from their home and supports (their words) | | | |
| Daily routine and support by time of day | | | |
| Overnight needs and roster model fit | | | |
| Communication and decision-making support | | | |
| Health, medication, mealtime | | | |
| Behaviour support and any restrictive practice authorisation | | | |
| Co-tenant compatibility and risk | | | |
| Housing arrangement and tenancy holder | | | |
| Workforce capability, training and preferences (gender, language, culture) | | | |
| Funding against proposed roster of care | | | |

## Records kept

- Enquiry and Intake Register and Intake Assessments in {{ notes_software }}.
- Consents to collect information; information received from referrers.
- Co-tenant meeting notes and current participants' feedback.
- Decision letters and any review requests.
- Records of information provided in accessible formats and interpreter bookings.

## Related documents

- assessment-support-planning
- sil-service-agreement
- tenancy-housing-support-separation
- transitions-exit
- household-decision-making
- participant-rights-statement
- privacy-confidentiality
- complaints-feedback

## Legislation and standards references

- National Disability Insurance Scheme Act 2013 (Cth)
- NDIS (Provider Registration and Practice Standards) Rules 2018 — Core Module outcomes 1.1 and 3.1; SIL supplementary module outcomes 1 and 4
- NDIS (Specialist Disability Accommodation) Rules 2020 (where a home is SDA-enrolled)
- NDIS Code of Conduct
- Privacy Act 1988 (Cth) and the Australian Privacy Principles (APP 3 and APP 5, collection and notification)
- Disability Discrimination Act 1992 (Cth)
{% for state in org.states %}- Residential tenancies legislation of {{ state }} as cited in the Tenancy, Housing and Support Separation Policy
{% endfor %}

## Review

This procedure is reviewed every 12 months and after any complaint or review request about an intake decision. Review owner: {{ quality_lead }}. Approval: {{ director }}.

## Document control

| Version | Approved by | Approval date | Next review |
|---|---|---|---|
| 1.0 | {{ director }} | [TO CONFIRM] | [TO CONFIRM — 12 months after approval] |
