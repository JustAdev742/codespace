---
title: Conflicts of Interest Policy, Procedure and Register
slug: conflicts-of-interest
doc_type: policy
standards: [core-2.1, sil-4]
applies_if: "true"
version: 1.0
review_months: 12
---
{% set gov = intake.governance %}{% set sup = intake.supports %}
{% set director = gov.ceo_or_director | default('[TO CONFIRM]', true) %}{% set quality_lead = gov.quality_lead | default('[TO CONFIRM]', true) %}{% set complaints_officer = gov.complaints_officer | default('[TO CONFIRM]', true) %}{% set rostering_manager = gov.rostering_manager | default('[TO CONFIRM]', true) %}
{% set governing_body = 'the Board' if gov.has_board else 'the Director' %}
{% set ns = namespace(provider_landlord=false, sda=false) %}{% for home in intake.homes %}{% if home.tenancy_holder == 'provider' %}{% set ns.provider_landlord = true %}{% endif %}{% if home.sda or home.tenancy_holder == 'sda_provider' %}{% set ns.sda = true %}{% endif %}{% endfor %}
# Conflicts of Interest Policy, Procedure and Register

## Purpose
A conflict of interest exists when a personal, financial or organisational interest could improperly influence, or appear to influence, a decision made for a participant or for {{ org.name }}. This document explains how {{ org.name }} identifies, declares, manages and records conflicts, with particular attention to the conflict that arises in Supported Independent Living when the support provider also controls, or is connected to, the participant's housing. It evidences NDIS Practice Standards Core Module outcome 2.1 (conflicts of interest actively managed and documented) and the SIL supplementary module housing and support security outcome.

## Scope
This document applies to {{ governing_body }}, key personnel, all workers, contractors, agency staff and volunteers, and to {{ org.name }} itself in its dealings with landlords, SDA providers, plan managers, support coordinators, suppliers and related entities, in every home and for every participant.

## Policy statement

### Types of conflict
- **Housing and support.** Where {{ org.name }} or a related party is the landlord, head tenant or SDA provider, the participant's freedom to change support provider without losing their home is at risk and must be protected.
- **Financial and related-party interests.** Ownership, directorships, employment or financial interests of key personnel, workers or their families in a landlord, SDA provider, plan manager, support coordinator, pharmacy, supplier or another provider dealing with {{ org.name }} or its participants.
- **Dual roles and personal relationships.** Delivering more than one type of NDIS support to the same participant; a worker also being a participant's family member, guardian, nominee or private carer; relationships beyond the professional role; recruiting relatives; secondary employment with another provider supporting the same participants.
- **Gifts, benefits and bequests.** Workers do not accept cash, loans, gifts above a nominal value (about $50) or hospitality from participants, families or suppliers, and never accept appointment as a participant's attorney, guardian, administrator or beneficiary.

### Principles
- Every actual, potential or perceived conflict is declared as soon as it is known and recorded in the Conflicts of Interest Register.
- Affected participants are told in writing, in a format they understand, what the conflict is and how they are protected, and are offered independent advice or advocacy.
- The person with the conflict does not make, or take part in, the decision affected by it; where a conflict cannot be managed so that the participant's choice and control are protected, it is removed.
- Undue influence on a participant's choice of provider, complaint or decision breaches the NDIS Code of Conduct and is treated under the Incident Management Policy and the Grievance and Disciplinary Policy.

### Housing-related conflicts in {{ org.name }}'s homes

The housing arrangement in each of {{ org.name }}'s {{ intake.homes | length }} home{% if intake.homes | length != 1 %}s{% endif %} has been assessed:

| Home | Tenancy holder | SDA-enrolled | Conflict position | Disclosure and controls |
|---|---|---|---|---|
{% for home in intake.homes %}
| {{ home.name }}, {{ home.address }} ({{ home.participants }} participant{% if home.participants != 1 %}s{% endif %}) | {% if home.tenancy_holder == 'provider' %}{{ org.name }} (landlord or head tenant){% elif home.tenancy_holder == 'sda_provider' %}SDA provider{% elif home.tenancy_holder == 'private_landlord' %}Private landlord or community housing provider{% elif home.tenancy_holder == 'participant' %}Participant (owner or lease holder){% else %}[TO CONFIRM]{% endif %} | {% if home.sda %}Yes{% else %}No{% endif %} | {% if home.tenancy_holder == 'provider' %}Actual conflict: {{ org.name }} is both housing provider and support provider{% elif home.tenancy_holder == 'sda_provider' %}Potential conflict if {{ org.name }} has any ownership, directorship, referral or commission relationship with the SDA provider [TO CONFIRM relationship]{% elif home.tenancy_holder == 'private_landlord' %}Low, unless a related party of {{ org.name }} owns the property or receives payments [TO CONFIRM]{% elif home.tenancy_holder == 'participant' %}None: housing is controlled by the participant{% else %}[TO CONFIRM]{% endif %} | {% if home.tenancy_holder == 'provider' %}Written disclosure signed before either agreement; independent tenancy advice offered; separate agreements and invoices; tenancy decisions made only by {{ director }} on tenancy-law grounds and reviewed by {{ quality_lead }}; annual register review{% elif home.tenancy_holder == 'sda_provider' %}Any relationship with the SDA provider recorded on the register and disclosed to participants in writing; SDA provider holds its own agreement with each participant; choice of SIL provider never a condition of the SDA tenancy; no referral payments{% elif home.tenancy_holder == 'private_landlord' %}Key personnel declare property interests annually; {{ org.name }} acts as agent with the landlord only at the participant's written request; workers never collect rent{% elif home.tenancy_holder == 'participant' %}{{ org.name }} holds no tenancy documents or keys without written consent; supports the participant's household decisions{% else %}[TO CONFIRM]{% endif %}{% if home.co_tenants %}; vacancies in this shared home are filled on compatibility and participant choice, never for {{ org.name }}'s financial benefit{% endif %} |
{% else %}
| [TO CONFIRM home] | [TO CONFIRM] | [TO CONFIRM] | [TO CONFIRM] | [TO CONFIRM] |
{% endfor %}

{% if ns.provider_landlord %}Because {{ org.name }} holds the tenancy for at least one home, {{ director }} signs a standing entry in the Conflicts of Interest Register for that arrangement, and the controls in the Tenancy, Housing and Support Separation Policy apply before any participant moves in.{% else %}{{ org.name }} does not currently own or hold the tenancy of any home it supports. If that changes, the provider-as-landlord controls in the Tenancy, Housing and Support Separation Policy apply before any participant moves in.{% endif %}{% if ns.sda %} Where a home is SDA-enrolled, {{ org.name }} confirms that the SDA provider's agreement with each participant does not require the participant to receive supports from {{ org.name }}, and that the SDA provider observes the conflict of interest requirements of the NDIS Practice Standards SDA module.{% endif %}

## Roles and responsibilities
| Role | Responsibilities under this document |
|---|---|
| {{ governing_body }} | Approves this policy; decides how conflicts involving the Director are managed; reviews the register annually. |
| Director — {{ director }} | Declares own interests; approves management plans; signs housing conflict disclosures; approves or declines related-party arrangements; refers matters involving the Director to {% if gov.has_board %}the Board{% else %}an independent adviser [TO CONFIRM]{% endif %}. |
| Quality Lead — {{ quality_lead }} | Owns this document; maintains the register; collects annual declarations; audits participant files for disclosures; reports quarterly. |
| Rostering Manager — {{ rostering_manager }} | Avoids rostering workers to participants with whom they have a declared personal relationship; checks secondary employment declarations. |
| Complaints Officer — {{ complaints_officer }} | Treats any complaint about housing pressure or undue influence as a priority complaint and reports it to {{ director }} within 1 business day. |
| Managers, workers and contractors | Prompt and make declarations on engagement, annually and as they arise; decline gifts and benefits; report suspected undeclared conflicts. |

## Procedure

### Part A — Declaring and managing any conflict
1. On engagement, on appointment to a key personnel role and every 12 months, each person completes a Conflict of Interest Declaration (including nil declarations) for {{ quality_lead }}; a new conflict is declared within 5 business days, or immediately if a decision is pending.
2. {{ quality_lead }} records the conflict in the register and, with {{ director }}, assesses its risk to participants' choice and control, safety and finances and to {{ org.name }}.
3. A management plan is agreed and recorded: for example the person steps out of the decision, is not rostered to the participant, the arrangement is declined, or the interest is disclosed to the participant with independent advice offered. Affected participants are told in writing in their preferred format and the disclosure is filed.
4. {{ quality_lead }} reviews each open entry at least annually and closes it when the conflict no longer exists. Failure to declare a known conflict is managed under the Grievance and Disciplinary Policy.

### Part B — Housing conflict disclosure (provider, related party or connected SDA provider as landlord)
1. Before a participant signs a SIL Service Agreement for a home where {{ org.name }} or a related party holds the tenancy, owns the property or is the SDA provider, {{ director }} gives the participant a written Conflict of Interest Disclosure stating who controls the housing, {{ org.name }}'s relationship to them, that the participant may change support provider and keep their home, and that support and housing are governed by separate agreements.
2. {{ rostering_manager }} offers, and supports the participant to obtain, independent advice from a tenants' advice service, an advocate or a lawyer, and records the offer and outcome.
3. The participant (and any guardian or nominee) signs the disclosure; a copy is kept in the participant's file and the register, and it is revisited at every service agreement review and whenever the housing arrangement changes.
4. Any decision to end or vary a participant's tenancy in a home controlled by {{ org.name }} or a related party is made only on grounds available under the tenancy law, by {{ director }}, and is reviewed by {{ quality_lead }} to confirm it is unrelated to any complaint or change of provider.

## Conflicts of Interest Register
| Reference | Date declared | Person or entity | Category | Nature of interest | Participants or homes affected | Actual, potential or perceived | Risk rating | Management plan | Disclosure to participants and advice offered | Approved by | Review date and status |
|---|---|---|---|---|---|---|---|---|---|---|---|
| COI-2026-001 (example — delete) | {{ intake.meta.generated_on | date }} | {{ org.name }} | Housing | Support provider in a home where the tenancy is held by {{ intake.homes[0].tenancy_holder | replace('_', ' ') if intake.homes else '[TO CONFIRM]' }} | {{ intake.homes[0].name if intake.homes else '[Home]' }} | Potential | Medium | Written disclosure; separate agreements; no referral payments; annual review | Disclosed to all residents in writing with Easy Read version; advocacy offered | {{ director }} | 12 months; open |

Categories are housing; financial or related party; dual role; personal relationship; gift or benefit. Risk ratings use the Risk Management Framework.

## Records kept
- Conflicts of Interest Register (retained at least 7 years after the last entry closes); signed declarations, including nil declarations
- Conflict of Interest Disclosures to participants and records of independent advice offered; Gifts and Benefits Log; management plans and minutes recording decisions made without the conflicted person

## Related documents

- Tenancy, Housing and Support Separation Policy
- SIL Service Agreement Template
- Governance and Operational Management Framework
- Risk Management Policy and Framework
- Participant Money and Property Policy
- Grievance and Disciplinary Policy
- Complaints and Feedback Policy and Procedure
- Participant Rights Statement

## Legislation and standards references

- National Disability Insurance Scheme Act 2013 (Cth)
- NDIS (Provider Registration and Practice Standards) Rules 2018 — NDIS Practice Standards, Core Module outcome 2.1 (conflicts of interest actively managed and documented)
- NDIS Practice Standards, SIL supplementary module (registration group 0138, 2026), housing and support security outcome
- NDIS (Code of Conduct) Rules 2018 — the NDIS Code of Conduct (act with integrity, honesty and transparency)
- NDIS (Specialist Disability Accommodation) Rules 2020 and the NDIS Practice Standards SDA module (conflict of interest outcome), where a home is SDA-enrolled
{% if org.entity_type == 'company' %}
- Corporations Act 2001 (Cth), section 191 (disclosure of material personal interests by directors)
{% endif %}
{% if org.entity_type == 'incorporated_association' %}
- Associations incorporation legislation of {{ org.states | join(' and ') }} (committee members' duty to disclose interests)
{% endif %}
{% for state in org.states %}
- Residential tenancies legislation of {{ state }}, as cited in the Tenancy, Housing and Support Separation Policy
{% endfor %}

## Review

Reviewed every 12 months by the Quality Lead ({{ quality_lead }}) and approved by {{ governing_body }}; reviewed earlier when {{ org.name }} enters any new housing, SDA or related-party arrangement, or after any complaint or incident involving undue influence.

## Document control

| Version | Drafted | Approved by | Approval date | Next review |
|---|---|---|---|---|
| 1.0 | {{ intake.meta.generated_on | date }} | {{ director }} | [TO CONFIRM on adoption] | 12 months after approval |
