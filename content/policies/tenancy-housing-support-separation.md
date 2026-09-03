---
title: Tenancy, Housing and Support Separation Policy
slug: tenancy-housing-support-separation
doc_type: policy
standards: [sil-4, core-3.3, core-1.4]
applies_if: "true"
version: 1.0
review_months: 12
---
{% set gov = intake.governance %}{% set wf = intake.workforce %}{% set sup = intake.supports %}
{% set director = gov.ceo_or_director | default('[TO CONFIRM]', true) %}{% set quality_lead = gov.quality_lead | default('[TO CONFIRM]', true) %}{% set rostering_manager = gov.rostering_manager | default('[TO CONFIRM]', true) %}{% set complaints_officer = gov.complaints_officer | default('[TO CONFIRM]', true) %}
{% set tenancy_act = {'NSW': 'Residential Tenancies Act 2010 (NSW)', 'VIC': 'Residential Tenancies Act 1997 (Vic)', 'QLD': 'Residential Tenancies and Rooming Accommodation Act 2008 (Qld)', 'WA': 'Residential Tenancies Act 1987 (WA)', 'SA': 'Residential Tenancies Act 1995 (SA)', 'TAS': 'Residential Tenancy Act 1997 (Tas)', 'ACT': 'Residential Tenancies Act 1997 (ACT)', 'NT': 'Residential Tenancies Act 1999 (NT)'} %}
{% set ns = namespace(provider_landlord=false, sda=false) %}{% for home in intake.homes %}{% if home.tenancy_holder == 'provider' %}{% set ns.provider_landlord = true %}{% endif %}{% if home.sda or home.tenancy_holder == 'sda_provider' %}{% set ns.sda = true %}{% endif %}{% endfor %}
# Tenancy, Housing and Support Separation Policy

## Purpose

SIL supplementary module outcome 4 requires that a participant's housing and their SIL supports are governed by separate agreements, that a participant can change their support provider without losing their home, and that any conflict of interest where the provider also controls the housing is identified and managed. This policy sets out how {{ org.name }} keeps housing and support separate in each of its {{ intake.homes | length }} home{% if intake.homes | length != 1 %}s{% endif %}, avoids undue influence, and protects participants' housing during any change of provider.

## Scope

This policy applies to every {{ org.name }} home and every participant, worker and key personnel. It applies whether the home is SDA-enrolled, owned or leased by {{ org.name }}, rented by the participant from a private landlord or community housing provider, or owned by the participant.

## Policy statement

- **Two agreements, never one.** Every participant has a SIL Service Agreement with {{ org.name }} for supports, and a separate written housing agreement (tenancy, occupancy or SDA agreement) with the tenancy holder for their home. {{ org.name }} never combines them and never makes one conditional on the other.
- **Changing support provider does not end housing.** A participant who ends their agreement with {{ org.name }}, or whose agreement {{ org.name }} ends, keeps their housing rights under their housing agreement and the tenancy law of their state. {{ org.name }} will not, and will not allow anyone acting for it to, ask, pressure or advise a participant to leave their home because they change provider.
- **No undue influence.** Workers and key personnel do not use access to the home, keys, visitors, household money, information or relationships with the landlord to influence a participant's choice of provider, their complaints, or their decisions.
- **Conflict of interest where {{ org.name }} controls the housing.** {% if ns.provider_landlord %}{{ org.name }} is the tenancy holder for at least one home ({% for home in intake.homes %}{% if home.tenancy_holder == 'provider' %}{{ home.name }}{% if not loop.last %}, {% endif %}{% endif %}{% endfor %}). In those homes {{ org.name }} is both landlord (or head tenant) and support provider. This conflict is recorded on the Conflicts of Interest Register, disclosed in writing to every affected participant before they sign either agreement, and managed by the controls in this policy.{% else %}{{ org.name }} does not currently hold the tenancy or own any of its SIL homes. If it ever does, the controls in this policy for provider-as-landlord apply before any participant moves in.{% endif %}
- **SDA homes.** {% if ns.sda %}Where a home is SDA-enrolled ({% for home in intake.homes %}{% if home.sda or home.tenancy_holder == 'sda_provider' %}{{ home.name }}{% if not loop.last %}, {% endif %}{% endif %}{% endfor %}), the SDA provider must have its own written agreement with the participant that meets the NDIS (Specialist Disability Accommodation) Rules 2020, and the participant's choice of SIL provider must not be a condition of their SDA tenancy. {{ org.name }} discloses any relationship it has with the SDA provider (ownership, directors in common, referral or commission arrangements) and records it on the Conflicts of Interest Register.{% else %}None of {{ org.name }}'s current homes is SDA-enrolled. If a participant moves into SDA, the SDA provider's separate agreement and the NDIS (Specialist Disability Accommodation) Rules 2020 apply and any relationship with the SDA provider is disclosed.{% endif %}
- **Tenancy law applies.** The housing agreement for each home follows the residential tenancy law of that state: {% for home in intake.homes %}{{ home.name }} — {{ tenancy_act[home.state | upper] | default('[TO CONFIRM tenancy legislation]') }}{% if home.state | upper == 'VIC' and (home.sda or home.tenancy_holder == 'sda_provider') %} (Part 12A, SDA residency agreements){% endif %}{% if not loop.last %}; {% endif %}{% endfor %}. Nothing in any {{ org.name }} document reduces a participant's rights under that law.
- **Transition protections.** When a participant changes provider, {{ org.name }} follows the Transitions and Exit Policy so that support continues without a gap, information is handed over with consent, and the participant's home, belongings and routines are undisturbed.
- **Participants are told their rights.** Every participant receives the Participant Rights Statement, which explains housing security in plain language, and is reminded at every service agreement review.

## Roles and responsibilities

| Role | Responsibilities |
|---|---|
| {{ director }} | Signs all disclosures of conflict; approves any arrangement in which {{ org.name }} holds a tenancy; ensures no notice to vacate is ever linked to a change of provider; approves this policy. |
| {{ quality_lead }} | Owns this policy; maintains the Conflicts of Interest Register; audits every participant file annually for two separate agreements and a signed disclosure where required. |
| {{ rostering_manager }} | Explains the separation at intake and at agreement reviews; arranges independent advice; coordinates with tenancy holders and incoming providers during transitions. |
| {{ complaints_officer }} | Handles complaints about housing pressure or undue influence as priority complaints; reports them to {{ director }} within 1 business day. |
| House leaders and workers | Never discuss a participant's housing security in connection with their support choices; report any pressure from any person to {{ complaints_officer }}. |

## Controls where {{ org.name }} is landlord or head tenant

1. Before a participant moves into a home where {{ org.name }} holds the tenancy, {{ director }} gives the participant a written Conflict of Interest Disclosure stating that {{ org.name }} is both landlord and support provider, what that means, and how the participant is protected.
2. The participant is offered, and supported to obtain, independent advice from a tenants' advice service, an independent advocate or a lawyer before signing either agreement, and the offer and outcome are recorded.
3. The housing agreement is a residential tenancy or occupancy agreement under the state tenancy law with market or NDIS-consistent rent, its own notice periods and the participant's full statutory rights. It contains no clause requiring the participant to receive supports from {{ org.name }}.
4. Rent and support are invoiced and recorded separately. Support workers do not collect rent.
5. Any proposal to end a participant's tenancy is decided by {{ director }} only on grounds available under the tenancy law, is never decided by anyone involved in the participant's support, and is reviewed by {{ quality_lead }} before any notice is issued to confirm it is unrelated to any complaint, change of provider or dispute about supports.
6. If the participant chooses another SIL provider, {{ org.name }} gives the new provider reasonable access to the home to deliver supports, subject only to reasonable, documented safety requirements agreed with the participant and any co-tenants.

## Controls in all homes

1. At intake, at each service agreement review and at each support plan review, {{ rostering_manager }} confirms and records that the participant knows who their tenancy holder is, has a copy of their housing agreement, and knows they can change provider and stay.
2. {{ org.name }} does not hold a participant's tenancy documents, keys or bond except with written consent and a record of why.
3. {{ org.name }} does not act as a participant's agent with a landlord or SDA provider unless the participant asks in writing and can withdraw the request at any time.
4. Where {{ org.name }} has any financial or personal relationship with a landlord or SDA provider (including referral fees, shared directors or family relationships), it is recorded on the Conflicts of Interest Register, disclosed to the participant in writing and reviewed annually.
5. Any worker who becomes aware that a participant has been told they must keep {{ org.name }} to keep their home, or has been threatened with losing their home, reports it immediately to {{ complaints_officer }}. {{ director }} treats it as a serious matter under the Grievance and Disciplinary Policy and considers whether it is a reportable incident or abuse under the Incident Management Policy.
6. When co-tenants share a home, one participant's decision to change provider does not affect the other participants' housing. {{ org.name }} works with the other provider on shared-space arrangements.

## Participant rights statement on housing (accessible version — give to every participant)

- Your home is your home. It does not belong to your support workers.
- You have two separate agreements: one for your home, one for your support.
- You can change your support provider and keep living in your home.
- Nobody can make you leave your home because you complained, or because you changed provider.
- If {{ org.name }} is also your landlord, we must tell you in writing and help you get free, independent advice.
- If anyone says you must keep {{ org.name }} to keep your home, tell {{ complaints_officer }} on {{ org.phone | default('[TO CONFIRM]', true) }}, or call the NDIS Commission on 1800 035 544.

## Records kept

- Conflicts of Interest Register entries for each home and relationship.
- Signed Conflict of Interest Disclosures and records of independent advice offered.
- Copies (with consent) of participants' housing agreements or a record of who holds them.
- Service agreement review records confirming the separation was explained.
- Complaints and incident records relating to housing pressure.
- Annual file audit by {{ quality_lead }}.

## Related documents

- sil-service-agreement
- transitions-exit
- access-intake
- participant-rights-statement
- conflicts-of-interest
- complaints-feedback
- incident-management
- household-decision-making

## Legislation and standards references

- National Disability Insurance Scheme Act 2013 (Cth)
- NDIS (Provider Registration and Practice Standards) Rules 2018 — SIL supplementary module outcome 4; Core Module outcomes 1.4 and 3.3
- NDIS (Specialist Disability Accommodation) Rules 2020
- NDIS Code of Conduct (acting with integrity, honesty and transparency; preventing exploitation)
- NDIS (Incident Management and Reportable Incidents) Rules 2018
- Australian Consumer Law — unfair contract terms
{% for state in org.states %}- {{ tenancy_act[state | upper] | default('Residential tenancies legislation of ' ~ state ~ ' [TO CONFIRM]') }}
{% endfor %}

## Review

This policy is reviewed every 12 months, whenever {{ org.name }} enters or ends any housing arrangement, and after any complaint about housing pressure. Review owner: {{ quality_lead }}. Approval: {{ director }}.

## Document control

| Version | Approved by | Approval date | Next review |
|---|---|---|---|
| 1.0 | {{ director }} | [TO CONFIRM] | [TO CONFIRM — 12 months after approval] |
