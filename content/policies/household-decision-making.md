---
title: Household Decision-Making and Household Rules Policy (with House Meeting Record)
slug: household-decision-making
doc_type: policy
standards: [sil-1, sil-2]
applies_if: "true"
version: 1.0
review_months: 12
---
{% set gov = intake.governance %}{% set wf = intake.workforce %}{% set sup = intake.supports %}
{% set director = gov.ceo_or_director | default('[TO CONFIRM]', true) %}{% set quality_lead = gov.quality_lead | default('[TO CONFIRM]', true) %}{% set rostering_manager = gov.rostering_manager | default('[TO CONFIRM]', true) %}{% set complaints_officer = gov.complaints_officer | default('[TO CONFIRM]', true) %}
{% set notes_software = wf.notes_software | default('[TO CONFIRM]', true) %}
{% set governing_body = 'the Board' if gov.has_board else 'the Director' %}
{% set ns = namespace(shared=0) %}{% for home in intake.homes %}{% if home.co_tenants %}{% set ns.shared = ns.shared + 1 %}{% endif %}{% endfor %}
# Household Decision-Making and Household Rules Policy (with House Meeting Record)

## Purpose

A participant's home belongs to them, not to {{ org.name }}. This policy sets out how participants control the everyday running of their household — routines, meals, visitors, décor, pets, shared spaces, who they live with — and how disagreements between people who share a home are resolved. It evidences the SIL supplementary module supported decision-making outcome (sil-1) and safeguarding outcome (sil-2), and supports Core Module outcomes 1.1 and 1.4.

## Scope
This policy applies in every home {{ org.name }} supports and to every worker, house leader and manager. {{ org.name }} currently supports {{ intake.homes | length }} home{% if intake.homes | length != 1 %}s{% endif %}, of which {{ ns.shared }} {% if ns.shared == 1 %}is shared{% else %}are shared{% endif %} with co-residents. It applies whether the tenancy is held by the participant, an SDA provider, a private landlord or {{ org.name }}.

## Policy statement
- **Participants decide.** Decisions about the household are made by the people who live there. Workers support and carry out those decisions; they do not make household decisions for their own convenience or because "that is how it has always been done".
- **Routines belong to each person.** Each participant decides when they get up and go to bed, when and what they eat, how they spend their day, when they shower, what they wear, and how support is given for each. Routines are recorded in the support plan in {{ notes_software }} and changed only by the participant.
- **Meals.** Participants choose what they eat and take part in menu planning, shopping and cooking as much as they want. Cultural, religious and dietary needs{% if sup.mealtime_management %} and mealtime management plans{% endif %} are respected. Food is not locked away, restricted or used as a reward or consequence{% if sup.restrictive_practices != 'none' %} unless a specific restriction is part of an authorised behaviour support plan{% endif %}.
- **Visitors and relationships.** Participants may have visitors, including overnight visitors and partners, at times they choose, subject in a shared home only to the household agreement the residents make about shared spaces and noise. Workers do not approve or refuse visitors and never restrict contact with family, friends or advocates.
- **Décor, personal space and how the home feels.** Each participant decorates and arranges their own room; shared spaces, pets, music, television, gardening, religious observance and celebrations are decided by residents. Workers knock and wait for permission before entering a participant's room except in an emergency; staff areas are kept minimal so the house looks like a home.
- **Household agreements, not house rules.** {{ org.name }} does not impose house rules. People who share a home make a household agreement together about shared spaces, chores, noise, visitors and privacy, written in a format everyone understands, reviewed at least every 6 months and changeable by the residents at any time.
- **No restriction by the back door.** A routine or agreement is never used to limit a participant's free movement, food, belongings, money, phone, visitors or activities. Any practice that would do so is an environmental or other restrictive practice, prohibited unless authorised and in a behaviour support plan, and otherwise reportable{% if sup.restrictive_practices == 'none' %}; {{ org.name }} currently uses no restrictive practices{% endif %}.
- **Co-residents are chosen, not allocated.** No one moves into a shared home without the current and prospective residents agreeing after a proper getting-to-know process; vacancies are never filled for {{ org.name }}'s financial benefit against residents' wishes.

## Roles and responsibilities

| Role | Responsibilities under this document |
|---|---|
| {{ governing_body }} | Approves this policy; receives reports on household disputes and co-tenant changes. |
| Director — {{ director }} | Approves any co-tenant move-in or move-out; decides escalated household disputes; ensures vacancy decisions are free of financial pressure. |
| Quality Lead — {{ quality_lead }} | Owns this policy; audits house meeting records and household agreements; checks no household practice amounts to an unauthorised restrictive practice. |
| Rostering Manager — {{ rostering_manager }} | Adjusts rosters to residents' chosen routines; leads co-tenant matching; supports house leaders in conflict resolution. |
| Complaints Officer — {{ complaints_officer }} | Receives complaints about household matters and offers independent advocacy. |
| House leaders | Chair house meetings (or support a resident to chair); keep the House Meeting Record; ensure agreed decisions are carried out on every shift. |
| Workers | Ask, listen and act on residents' decisions every shift; record routine changes; raise disagreements early. |

## Procedure

### Part A — Making and recording household decisions
1. Everyday decisions are made in the moment by the participant with the worker, using the participant's Decision-Making Support Profile and communication method, and recorded in {{ notes_software }} where they change a routine or plan.
2. Decisions that affect other residents (shared-space use, visitors in shared areas, noise, chores, joint purchases, pets) are raised at the house meeting, or sooner if they cannot wait.
3. Each home holds a house meeting at least fortnightly (weekly where a home has 3 or more participants or an active behaviour support plan). Residents choose the time, whether workers attend the whole meeting and whether family or advocates are invited; residents who prefer not to attend contribute beforehand.
4. The house leader (or a resident) records the meeting in the House Meeting Record in plain language or Easy Read, with actions, owners and dates, stored in {{ notes_software }} and available to residents in their preferred format. Household agreements are reviewed at least every 6 months and whenever a resident asks or someone moves in or out.
5. A worker who cannot carry out a resident's decision for a genuine safety or legal reason explains why, records it, and refers it to {{ rostering_manager }} the same day for a supported risk-taking discussion under the Autonomy, Independence and Dignity of Risk Policy.

### Part B — Co-tenant matching and moving in
1. When a vacancy arises, {{ rostering_manager }} asks the current residents what matters to them in a new housemate (age, gender, interests, routines, noise, support needs) and records it.
2. Prospective and current residents meet at least twice, including a meal or activity in the home and, where all agree, a short stay, with support to talk honestly about compatibility.
3. {{ rostering_manager }} completes a compatibility assessment covering each person's support plan, risk assessment{% if sup.behaviour_support_plans %}, any behaviour support plan{% endif %} and the risks residents may pose to each other, and discusses it with everyone involved.
4. The move goes ahead only if each current resident and the prospective resident (with their chosen supporters) agree; {{ director }} approves and records that the decision was made on compatibility, not on filling the vacancy. The household agreement is updated before the move and a review meeting is held within 4 weeks.

### Part C — Resolving conflict between co-residents
1. The worker on shift de-escalates, gives each person space and privacy, and keeps everyone safe; any harm or risk of harm is recorded under the Incident Management Policy.
2. Within 2 business days the house leader talks with each person separately, in their communication method, to understand what happened and what they want.
3. A facilitated conversation is offered, with an advocate, family member or interpreter if wanted; the aim is an agreement both people can live with, recorded in the House Meeting Record.
4. If conflict continues, {{ rostering_manager }} reviews the compatibility assessment, roster and environment (for example separate use of shared spaces at set times, more time out of the home) and may involve a behaviour support practitioner or mediator.
5. If a person no longer wants to live with a co-resident, {{ org.name }} supports them to explore options under the Transitions and Exit Policy; no one is moved against their will and nobody's tenancy is affected by a support decision. Abuse, exploitation or serious risk between residents is escalated to {{ director }} the same day under the Safeguarding Policy and the Risk Management Framework.

## House Meeting Record
| Home, date and time | Present (residents attending or contributing beforehand; workers; invited family or advocates) | Chair, recorder and format | How things are going | Household decisions (meals, routines, visitors, shared spaces, décor, pets, celebrations, chores) | Household agreement changes | Safety, home and roster (hazards, repairs, emergency reminders, worker feedback) | Actions (owner, due date, status) | Next meeting |
|---|---|---|---|---|---|---|---|---|
| {{ intake.homes[0].name if intake.homes else '[Home]' }}, 6 Aug 2026, 6 pm (example — delete) | 3 residents; house leader | Resident A; house leader; Easy Read | A happy with new evening worker; B wants quieter mornings | Friday takeaway night by rotation; visitors in lounge until 10 pm on weeknights | Chores swapped: A cooks Tuesday, B waters garden | Back light not working; fire drill reminder | Buy cushions chosen by B ({{ rostering_manager }}, 2 weeks); ask landlord to fix light (house leader, 1 week) | 20 Aug 2026, 6 pm |

## Records kept
- House Meeting Records and household agreements in {{ notes_software }}, in accessible formats; routine and preference records in each support plan
- Compatibility assessments, matching records and move-in approvals; conflict resolution records and linked incident or safeguarding records; Quality Lead audit results

## Related documents
- Supported Decision-Making Policy and Procedure; Autonomy, Independence and Dignity of Risk Policy
- Person-Centred Supports Policy; Diversity and Cultural Safety Policy
- Restrictive Practices Policy; Safeguarding Policy — Violence, Abuse, Neglect, Exploitation and Discrimination
- Tenancy, Housing and Support Separation Policy; Transitions and Exit Policy
- Practice Governance and Workforce Consistency Policy (house meetings); Participant Rights Statement

## Legislation and standards references

- National Disability Insurance Scheme Act 2013 (Cth), section 4 (general principles, including choice and control)
- NDIS Practice Standards, SIL supplementary module (registration group 0138, 2026), supported decision-making and safeguarding outcomes
- NDIS (Provider Registration and Practice Standards) Rules 2018 — NDIS Practice Standards, Core Module outcomes 1.1, 1.3 and 1.4
- NDIS (Restrictive Practices and Behaviour Support) Rules 2018 (environmental and other regulated restrictive practices)
- NDIS (Code of Conduct) Rules 2018 — the NDIS Code of Conduct
- United Nations Convention on the Rights of Persons with Disabilities, Articles 12, 19 and 22
{% for state in org.states %}
- Residential tenancies legislation of {{ state }} (a tenant's right to quiet enjoyment), as cited in the Tenancy, Housing and Support Separation Policy
{% endfor %}

## Review

Reviewed every 12 months by the Quality Lead ({{ quality_lead }}) with residents of each home and approved by {{ governing_body }}; reviewed earlier after any escalated co-tenant dispute, complaint about household control, or finding of an unauthorised restrictive practice.

## Document control

| Version | Drafted | Approved by | Approval date | Next review |
|---|---|---|---|---|
| 1.0 | {{ intake.meta.generated_on | date }} | {{ director }} | [TO CONFIRM on adoption] | 12 months after approval |
