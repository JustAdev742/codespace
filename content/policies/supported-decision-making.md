---
title: Supported Decision-Making Policy and Procedure
slug: supported-decision-making
doc_type: policy
standards: [sil-1, core-1.4]
applies_if: "true"
version: 1.0
review_months: 12
---
{% set director = intake.governance.ceo_or_director | default('[TO CONFIRM]', true) %}
{% set quality_lead = intake.governance.quality_lead | default('[TO CONFIRM]', true) %}
{% set rostering_manager = intake.governance.rostering_manager | default('[TO CONFIRM]', true) %}
{% set complaints_officer = intake.governance.complaints_officer | default('[TO CONFIRM]', true) %}
{% set notes_software = intake.workforce.notes_software | default('[TO CONFIRM]', true) %}
{% set training_platform = intake.workforce.training_platform | default('[TO CONFIRM]', true) %}

# Supported Decision-Making Policy and Procedure

## Purpose

This document sets out how {{ org.name }} makes sure that decisions about a participant's life and home are made by the participant, with whatever support they need to make and communicate them, and not by workers, family members or {{ org.name }} on their behalf. It evidences the first outcome of the NDIS Practice Standards SIL supplementary module (supported decision-making, registration group 0138) and Core Module outcome 1.4 (Independence and informed choice).

## Scope

This document applies to every decision a participant makes while receiving Supported Independent Living from {{ org.name }} — from everyday choices (what to wear, when to get up, what to eat, who to phone) to significant decisions (who they live with, who supports them, relationships, money, health treatment, moving home) — in each of {{ org.name }}'s {{ intake.homes | length }} home{% if intake.homes | length != 1 %}s{% endif %}:
{% for home in intake.homes %}
- {{ home.name }}, {{ home.address }} — {{ home.participants }} participant{% if home.participants != 1 %}s{% endif %}{% if home.co_tenants %}, shared home where household decisions also involve co-residents{% else %}, single-occupancy home{% endif %}
{% endfor %}

It binds all workers, key personnel and agency staff, and it governs how {{ org.name }} deals with families, guardians, administrators, NDIS nominees, support coordinators and other services on decisions that belong to the participant.

## Policy statement

### Principles

- **Decisions are made by the participant.** {{ org.name }}'s job is to support the participant's own decision-making, not to decide for them. Every participant is presumed to have the ability to make decisions when given the right support.
- **Ability to decide is decision-specific and changes over time.** A participant may need more support for a complex financial decision than for a daily one; a bad day, a medication change or unfamiliar surroundings can affect it. Support is matched to the decision and the moment, and no participant is labelled as "unable to decide" in general.
- **Will and preferences come first.** Support is directed to what the participant wants, values and would choose, not to what a worker or family member thinks is best for them. Where a participant's wishes cannot be determined, decisions are based on the best interpretation of their will and preferences from what is known about them.
- **Support means information, time, communication and trusted people.** Participants choose who helps them decide, including family, friends, peers, advocates or workers they trust.
- **Choice is ongoing, not a one-off consent.** Participants keep choosing, every day, about their routines, their relationships and their home; a decision made at intake does not settle these matters for the length of a service agreement.
- **Dignity of risk.** Participants can make decisions others consider risky or unwise; {{ org.name }} responds under the Autonomy and Dignity of Risk Policy, not by removing the decision.
- **Substitute decision-making is the exception, and lawful only.** Someone else decides for a participant only where a court, tribunal or the NDIA has lawfully appointed them for that type of decision, and only where the participant cannot be supported to make it themselves. Even then, the participant is involved and their preferences are recorded.

### Decisions participants make about their home and life

{{ org.name }} actively supports each participant to decide, and to keep deciding, about:

- daily routines — waking and sleeping times, meals and snacks, showering, activities, downtime, and how support is given for each;
- relationships — friends, family contact, intimate relationships, visitors (including overnight visitors, subject to household agreements in shared homes), and who they spend time with;
- the home — who they live with, how their room is set up and decorated, shared spaces, pets, household rules and chores, and whether to stay or move;
- supports — which workers support them, worker gender and language, how personal care is done, and changes to their support plan;
- money — how their own money is spent, within any administration order;
- health — treatment, medication, appointments, diet and lifestyle, subject to state medical consent law;
- community — work, study, faith, culture, transport and going out alone.

### Communication support

{{ org.name }} treats communication support as part of decision support. Each participant's About Me profile in {{ notes_software }} includes a Decision-Making Support Profile that records how the participant communicates (speech, gesture, sign, communication device, pictures, behaviour), how they show yes and no, how they show a preference or distress, the best time and setting for decisions, who they trust to help, what has helped before, and any speech pathology or behaviour support recommendations. Workers use Easy Read, visual supports, plain language, demonstration, trying options, interpreters (Translating and Interpreting Service, 131 450), Auslan interpreters and the National Relay Service as the participant needs. Workers are trained in supported decision-making at induction through {{ training_platform }} and in the specific communication approach of each participant they support.

### Supporting a decision compared with substituting for it

| Supporting a decision (what {{ org.name }} does) | Substituting a decision (what {{ org.name }} avoids) |
|---|---|
| Asking the participant what they want and why | Deciding what is "best" for them |
| Giving information in the participant's communication method and allowing time | Giving one option or presenting the preferred option as the only one |
| Helping the participant think through pros and cons and try options | Warning, persuading or withholding until the participant agrees |
| Involving supporters the participant chooses | Asking a family member or guardian first because it is quicker |
| Acting on the participant's decision and recording it | Acting on a decision the participant did not make |
| Recording the support given and who was involved | Recording "family agreed" or "participant complied" |

### Guardians, administrators and nominees

- A guardian or administrator appointed by a state or territory tribunal or court has authority only for the decisions named in the order (for example accommodation, health care, services, or financial matters) and for the period of the order. {{ org.name }} obtains a copy of every current order, records its scope and expiry on the participant's file, and involves the appointee only for decisions the order covers.
- An NDIS plan nominee or correspondence nominee appointed under the NDIS Act 2013 has authority in relation to the participant's NDIS plan and dealings with the NDIA, not over everyday living decisions.
- A family member with no order or appointment is a supporter if the participant wants them involved, and has no authority to decide for the participant. Where a family member insists on deciding, {{ quality_lead }} explains this policy, supports the participant to say what they want, and offers advocacy.
- Consent to medical treatment for a participant who cannot consent themselves follows the medical consent law of the state where the participant lives{% if 'NSW' in org.states %} (in NSW, the "person responsible" provisions of the Guardianship Act 1987){% endif %}{% if 'VIC' in org.states %} (in Victoria, the Medical Treatment Planning and Decisions Act 2016){% endif %}; workers do not consent to treatment on a participant's behalf.
- {{ org.name }} does not seek the appointment of a guardian or administrator as a convenience, and it supports participants who want an order reviewed or revoked to get advice and advocacy.

## Roles and responsibilities

| Role | Responsibilities under this document |
|---|---|
| Director — {{ director }} | Approves this document; is the escalation point where a worker, family member or external party is overriding a participant's decisions; ensures time and resources for decision support are built into rosters and support plans. |
| Quality Lead — {{ quality_lead }} | Owns this document; ensures every participant has a current Decision-Making Support Profile; convenes Decision Support Meetings for significant decisions; checks guardianship, administration and nominee orders and records their scope; audits Decision Support Records; arranges speech pathology or behaviour support input where communication support needs specialist planning. |
| Rostering Manager — {{ rostering_manager }} | Rosters familiar workers who know each participant's communication and gives new and agency workers the Decision-Making Support Profile before a shift. |
| Complaints Officer — {{ complaints_officer }} | Treats any report that a participant's decisions are being disregarded as a complaint, and links to advocacy. |
| Support workers | Use each participant's Decision-Making Support Profile; offer real choices on every shift; give information and time; record decisions and the support given; act on the participant's decision; never substitute their own or a family member's judgement; escalate concerns. |

## Procedure

### Everyday decisions (every shift)

1. Read the participant's Decision-Making Support Profile and current support plan before the shift.
2. At each choice point, offer real options in the participant's communication method (for example show two meals, use the picture board, sign, or ask an open question), and allow the participant's usual time to respond.
3. Read the participant's response using the profile; if unsure, try again or use another method; do not fill in the answer.
4. Act on the participant's decision. If it cannot be acted on immediately (roster, transport, money), tell the participant honestly, agree when it can happen, and record it.
5. Record in the progress note what was offered, what the participant decided and what support was given. Where a choice affects co-residents in a shared home, raise it at the next household meeting.

### Significant decisions (living arrangements, supports, relationships, money, health, moving)

1. When a significant decision arises (raised by the participant, a worker, a family member, a support coordinator or an event such as a vacancy or plan review), the worker notifies {{ quality_lead }} within one business day.
2. {{ quality_lead }} checks the file for any guardianship, administration or nominee order and whether it covers this decision; if none does, the participant is the decision-maker.
3. {{ quality_lead }} asks the participant who they want involved, where and when they want to talk about it, and what communication support they need, and arranges an interpreter, advocate or communication specialist as needed.
4. Information about the options and their consequences is prepared in the participant's format (Easy Read, pictures, a visit to see a room, a trial period) and given to the participant in advance where possible.
5. A Decision Support Meeting is held on the participant's terms. The participant's questions are answered, options are explored and the participant is given time; the meeting may be adjourned so the participant can think or consult others.
6. The participant makes and communicates the decision. If the participant needs more time or more information, the decision waits; {{ org.name }} does not fill the gap with its own decision.
7. The outcome is recorded on a Decision Support Record in {{ notes_software }}: the decision, the options and information provided, the support given, who was involved and in what capacity (supporter, guardian for a covered decision, advocate, interpreter), the participant's stated reasons if they gave any, and the review date.
8. The decision is acted on, the support plan or service agreement is updated, and workers are briefed through {{ notes_software }} and handover.
9. If a lawfully appointed substitute decision-maker decides a matter within their authority, the participant's own will and preferences are still sought and recorded, the participant is told the outcome, and any disagreement is recorded and the participant offered advocacy and information about tribunal review.
10. The decision is reviewed at the recorded date, and whenever the participant indicates they want something different.

## Records kept

- Decision-Making Support Profile (in the About Me profile, {{ notes_software }})
- Decision Support Records for significant decisions
- Progress notes recording everyday choices offered and made
- Copies of guardianship, administration and NDIS nominee orders with scope and expiry noted
- Consent Forms (Privacy and Confidentiality Policy)
- Household meeting records (shared homes)
- Training records for supported decision-making and participant-specific communication training

## Related documents

- Person-Centred Supports Policy
- Autonomy, Independence and Dignity of Risk Policy
- Privacy and Confidentiality Policy, Consent Procedure
- Household Decision-Making and Household Rules Policy
- Assessment and Support Planning Procedure
- SIL Service Agreement template
- Transitions and Exit Policy
- Participant Rights Statement
- Complaints and Feedback Policy and Procedure

## Legislation and standards references

- National Disability Insurance Scheme Act 2013 (Cth), section 4 general principles, and Chapter 4 Part 5 (nominees)
- NDIS Practice Standards, SIL supplementary module (registration group 0138, 2026), outcome 1 supported decision-making
- NDIS (Provider Registration and Practice Standards) Rules 2018 — NDIS Practice Standards, Core Module outcomes 1.1 and 1.4
- NDIS (Code of Conduct) Rules 2018 — the NDIS Code of Conduct
- United Nations Convention on the Rights of Persons with Disabilities, Article 12 (equal recognition before the law)
{% if 'NSW' in org.states %}
- Guardianship Act 1987 (NSW); NSW Trustee and Guardian Act 2009 (NSW)
{% endif %}
{% if 'VIC' in org.states %}
- Guardianship and Administration Act 2019 (Vic); Medical Treatment Planning and Decisions Act 2016 (Vic)
{% endif %}
{% if 'QLD' in org.states %}
- Guardianship and Administration Act 2000 (Qld); Powers of Attorney Act 1998 (Qld)
{% endif %}
{% if 'SA' in org.states %}
- Guardianship and Administration Act 1993 (SA)
{% endif %}
{% if 'WA' in org.states %}
- Guardianship and Administration Act 1990 (WA)
{% endif %}
{% if 'TAS' in org.states %}
- Guardianship and Administration Act 1995 (Tas)
{% endif %}
{% if 'ACT' in org.states %}
- Guardianship and Management of Property Act 1991 (ACT)
{% endif %}
{% if 'NT' in org.states %}
- Guardianship of Adults Act 2016 (NT)
{% endif %}

## Review

Reviewed every 12 months by the Quality Lead ({{ quality_lead }}) and approved by the Director ({{ director }}); reviewed earlier if the SIL supplementary module wording changes, or if an audit, complaint or incident shows participants' decisions being substituted.

## Document control

| Version | Drafted | Approved by | Approval date | Next review |
|---|---|---|---|---|
| 1.0 | {{ intake.meta.generated_on | date }} | {{ director }} | [TO CONFIRM on adoption] | 12 months after approval |
