---
title: Restrictive Practices and Behaviour Support Policy and Procedure
slug: restrictive-practices-behaviour-support
doc_type: policy
standards: [core-1.4, sil-2]
applies_if: "true"
version: 1.0
review_months: 12
---
{% set gov = intake.governance %}{% set wf = intake.workforce %}{% set sup = intake.supports %}
{% set director = gov.ceo_or_director | default('[TO CONFIRM]', true) %}{% set quality_lead = gov.quality_lead | default('[TO CONFIRM]', true) %}{% set incident_officer = gov.incident_officer | default('[TO CONFIRM]', true) %}{% set rostering_manager = gov.rostering_manager | default('[TO CONFIRM]', true) %}
{% set notes_software = wf.notes_software | default('[TO CONFIRM]', true) %}{% set incident_software = wf.incident_software | default('[TO CONFIRM]', true) %}{% set training_platform = wf.training_platform | default('[TO CONFIRM]', true) %}
{% set rp = sup.restrictive_practices | default('none', true) %}{% set bsp = sup.behaviour_support_plans %}
{% set rp_auth = {'NSW': 'NSW Restrictive Practices Authorisation (RPA) Policy and RPA System administered by the Department of Communities and Justice — authorisation by an RPA Panel', 'VIC': 'Disability Act 2006 (Vic) — Victorian Senior Practitioner; approval by an Authorised Program Officer', 'QLD': 'Disability Services Act 2006 (Qld) — Queensland restrictive practices authorisation framework (including the Public Guardian and QCAT for containment and seclusion)', 'SA': 'Disability Inclusion Act 2018 (SA) — South Australian Restrictive Practices Authorisation Scheme (Senior Authorising Officer)', 'WA': 'Authorisation of Restrictive Practices in Funded Disability Services Policy (WA Department of Communities)', 'TAS': 'Tasmanian Senior Practitioner (Department of Health) [TO CONFIRM current Tasmanian legislation]', 'ACT': 'Senior Practitioner Act 2018 (ACT) — ACT Senior Practitioner', 'NT': 'Northern Territory Office of the Senior Practitioner under the Disability Services Act 1993 (NT) [TO CONFIRM]'} %}
# Restrictive Practices and Behaviour Support Policy and Procedure

## Purpose

Core Module outcome 1.4 requires that each participant is supported to make informed choices and to exercise control over their life, and SIL supplementary module outcome 2 requires robust governance of restrictive practices in every home. This document sets out how {{ org.name }} complies with the NDIS (Restrictive Practices and Behaviour Support) Rules 2018: what the five regulated restrictive practices are, that they may only be used in accordance with a behaviour support plan prepared by an NDIS behaviour support practitioner and authorised under the law of the state, how every use is recorded and reported to the NDIS Commission, and how {{ org.name }} works to reduce and eliminate them. {{ org.name }}'s current position is: **{% if rp == 'none' %}no regulated restrictive practice is used in any of its homes{% elif rp == 'authorised' %}regulated restrictive practices are used only where authorised and included in a behaviour support plan{% elif rp == 'in_use_unauthorised' %}one or more practices are in use without full authorisation or a current behaviour support plan, and the immediate actions in Part C apply{% else %}[TO CONFIRM]{% endif %}**.

## Scope

This document applies to every worker ({{ wf.employment_types | join(', ') }}), key personnel, agency worker and contractor of {{ org.name }}, to every participant, and to every home ({% for home in intake.homes %}{{ home.name }} ({{ home.state }}){% if not loop.last %}, {% endif %}{% endfor %}), the community{% if sup.transport %} and vehicles{% endif %}. It applies whether a practice is deliberate, routine, "for safety", or so embedded in a household routine that nobody has noticed it.

## Policy statement

### The five regulated restrictive practices

| Practice | Definition under the NDIS (Restrictive Practices and Behaviour Support) Rules 2018 | Everyday examples in a SIL home |
|---|---|---|
| Seclusion | The sole confinement of a person with disability in a room or physical space at any hour of the day or night where voluntary exit is prevented, not facilitated, or it is implied that voluntary exit is not permitted | Sending a participant to their room and holding the door; locking a participant in a yard |
| Chemical restraint | The use of medication or a chemical substance for the primary purpose of influencing a person's behaviour; it does not include medication prescribed to treat a diagnosed mental disorder, physical illness or physical condition | PRN sedation given because a participant is "escalating" rather than for a diagnosed condition |
| Mechanical restraint | The use of a device to prevent, restrict or subdue a person's movement for the primary purpose of influencing behaviour; it does not include devices used for therapeutic or non-behavioural purposes | Lap belts, mittens or bed rails used to stop behaviour rather than for a clinical or safety purpose prescribed by a health practitioner |
| Physical restraint | The use or action of physical force to prevent, restrict or subdue movement of a person's body, or part of their body, for the primary purpose of influencing behaviour; it does not include a hands-on technique used in a reflexive way to guide or redirect a person away from potential harm or injury, consistent with reasonable care | Holding a participant's arms; blocking a participant with the body |
| Environmental restraint | A practice that restricts a person's free access to all parts of their environment, including items or activities | Locked fridge, pantry, kitchen, medication other than for storage safety, front door, gate, phone, television or cigarettes |

### Principles

- **Rights first.** Any regulated restrictive practice limits a participant's rights. {{ org.name }} uses one only as a last resort, in response to a risk of harm, in the least restrictive way, for the shortest time, in proportion to the risk, and only where it is in a behaviour support plan and authorised as required in the state where the participant lives.
- **A plan and an authorisation, always.** A regulated restrictive practice may be used only where it is in a current behaviour support plan prepared by an NDIS behaviour support practitioner (a practitioner the NDIS Commissioner considers suitable), lodged with the NDIS Commission, and authorised in accordance with the law of the state or territory: {% for state in org.states %}{{ state }} — {{ rp_auth[state | upper] | default('[TO CONFIRM authorisation process]') }}{% if not loop.last %}; {% endif %}{% endfor %}.
- **Unauthorised use is a reportable incident.** Any use of a regulated restrictive practice that is not in accordance with a behaviour support plan, or not authorised as required, is a reportable incident that {{ incident_officer }} notifies to the NDIS Commission within 5 business days of any key personnel becoming aware (or within 24 hours if it also involves serious injury, abuse or another 24-hour category), under the NDIS (Incident Management and Reportable Incidents) Rules 2018.
- **Every use is recorded and reported.** Every use of an authorised regulated restrictive practice is recorded at the time in the participant's Restrictive Practice Record, and {{ org.name }} reports use to the NDIS Commission monthly through the NDIS Commission Portal, as required of implementing providers.
- **Reduce and eliminate.** Every behaviour support plan contains strategies to reduce and eliminate the practice, with fade-out plans and review dates, and {{ org.name }} reports progress at every plan review.
- **Positive behaviour support.** {{ org.name }} understands behaviour as communication and responds with proactive, person-centred, evidence-informed strategies, environmental changes, communication support and skill building{% if bsp %}. Participants with a behaviour support plan are supported by workers trained in that plan{% endif %}.
- **No hidden practices.** {{ quality_lead }} audits each home at least twice a year for practices that have become routine (locked cupboards, curfews, restricted visitors, withheld belongings, "consequences") and treats any regulated practice found as an incident.

## Roles and responsibilities

| Role | Responsibilities |
|---|---|
| {{ director }} | Accountable for compliance with the Rules; approves the engagement of behaviour support practitioners; signs authorisation applications where {{ org.name }} is the applicant; approves this document. |
| {{ quality_lead }} | Owns this document; maintains the Restrictive Practices Register; audits homes for hidden practices; ensures plans and authorisations are current; lodges monthly reports to the NDIS Commission. |
| {{ incident_officer }} | Assesses and notifies unauthorised use as a reportable incident within 5 business days; investigates every use outside a plan. |
| {{ rostering_manager }} | Rosters only workers trained in a participant's behaviour support plan; coordinates with practitioners, guardians and authorising bodies. |
| House leaders | Ensure each shift knows each plan; check Restrictive Practice Records daily; report any use outside a plan immediately. |
| Support workers | Use proactive strategies first; use a regulated practice only as the plan describes; record every use at the time; report anything that looks like a restrictive practice. |

## Procedure

{% if rp == 'none' %}
### Part A — Documented non-use

1. {{ org.name }} does not use seclusion, chemical, mechanical, physical or environmental restraint in any of its homes. {{ director }} signs a Statement of Non-Use each year, kept on the Restrictive Practices Register with the date of each home audit.
2. {{ quality_lead }} audits every home at least twice a year using the hidden-practices checklist above and records the result on the Register. Household rules made under the Household Decision-Making Policy are checked to confirm they are chosen by participants and do not restrict any individual's access to their home or belongings.
3. Every worker completes restrictive practices awareness training on {{ training_platform }} at induction and annually so they can recognise a regulated practice.

### Part B — If a restrictive practice emerges

1. A worker who uses, sees, or is asked to use anything that could be a regulated restrictive practice (including a reflexive hold that was more than redirecting a participant from harm) stops the practice as soon as it is safe, ensures everyone's safety, and phones the house leader during the shift.
2. The worker records the full circumstances in {{ incident_software }} the same shift. {{ incident_officer }} assesses whether a regulated practice was used; if so, it is an unauthorised restrictive practice and is notified to the NDIS Commission within 5 business days (24 hours if it also caused serious injury or involved abuse).
3. {{ rostering_manager }} arranges a support plan review with the participant within 5 business days and, where a pattern of behaviour of concern is identified, engages an NDIS behaviour support practitioner. Under the Rules the practitioner is expected to provide an interim behaviour support plan within 1 month of engagement and a comprehensive plan within 6 months.
4. If the practitioner recommends that a regulated practice is needed, {{ director }} decides whether {{ org.name }} will implement it. If so, authorisation is sought in the state where the participant lives before any planned use, workers are trained in the plan, and this document is revised to the "authorised" procedure below before implementation.
5. {{ quality_lead }} records the event, the practitioner's involvement and the outcome on the Restrictive Practices Register and reports it at the quarterly quality meeting.
{% elif rp == 'authorised' %}
### Part A — Before any regulated restrictive practice is used

1. {{ rostering_manager }} confirms that the participant has a current behaviour support plan prepared by an NDIS behaviour support practitioner, that it has been lodged with the NDIS Commission, that it describes the practice, the circumstances, the least restrictive alternatives, the maximum duration and the fade-out strategy, and that the required authorisation for the state has been obtained and is in date. Copies are filed in {{ notes_software }} and recorded on the Restrictive Practices Register with expiry dates.
2. The practitioner or a trained senior worker trains every worker rostered to the participant in the plan, including the proactive strategies, the exact way the practice is to be used, and the record-keeping. Training is recorded on the Training Register. Workers not trained in the plan are not rostered to that participant.
3. The participant and their supporters are told, in a way they understand, what the plan says and how to complain.

### Part B — Using and recording a practice

1. The worker uses the proactive and de-escalation strategies in the plan first and uses the regulated practice only in the circumstances the plan describes, in the way it describes, for no longer than the plan allows.
2. Immediately afterwards the worker checks the participant's wellbeing, offers support, and records the use in the participant's Restrictive Practice Record: date, start and finish time, what happened before, strategies tried, the practice used, the participant's response, any injury, and who was told. The house leader reviews the record on the next shift.
3. Any use that departs from the plan or the authorisation — a different practice, longer than allowed, in different circumstances, by an untrained worker, or after an authorisation has lapsed — is reported in {{ incident_software }} the same shift and notified to the NDIS Commission by {{ incident_officer }} within 5 business days as an unauthorised restrictive practice (24 hours if it also involves serious injury or abuse).
4. {{ quality_lead }} lodges the monthly use report for each participant through the NDIS Commission Portal by the Commission's due date, and records nil use where applicable.

### Part C — Review, reduction and elimination

1. The house leader reviews each participant's Restrictive Practice Record monthly and sends a summary to the practitioner.
2. The practitioner reviews the plan at least every 12 months and after any change in the participant's circumstances, injury or increase in use; {{ rostering_manager }} makes sure the review happens and that the fade-out strategy is being implemented.
3. {{ quality_lead }} reports use, trends and reduction progress for every home at the quarterly quality meeting, and {{ director }} reviews whether each practice is still needed.
4. Authorisation renewals are applied for at least 6 weeks before expiry; a practice whose authorisation lapses is not used until renewed.
{% elif rp == 'in_use_unauthorised' %}
### Part A — Immediate actions (from the date this document is adopted)

1. {{ director }} records on the Restrictive Practices Register every practice currently in use in any home that is a regulated restrictive practice, the participant, the home, and whether a behaviour support plan and authorisation exist.
2. For each practice, {{ director }} and the house leader decide whether it can stop safely now. Any practice that can stop safely stops immediately and its removal is recorded.
3. Each use of a practice that continues because stopping would create a serious and immediate risk of harm is recorded in the participant's Restrictive Practice Record and reported in {{ incident_software }}; {{ incident_officer }} notifies each use to the NDIS Commission as a reportable incident within 5 business days of key personnel becoming aware (24 hours where serious injury or abuse is involved), using the Commission's reportable incident process, and tells the Commission what {{ org.name }} is doing to obtain a plan and authorisation.
4. Within 5 business days {{ rostering_manager }} engages an NDIS behaviour support practitioner for each affected participant and requests an interim behaviour support plan (expected under the Rules within 1 month of engagement) and a comprehensive plan (within 6 months), and starts the authorisation process in the participant's state ({% for state in org.states %}{{ state }}: {{ rp_auth[state | upper] | default('[TO CONFIRM]') }}{% if not loop.last %}; {% endif %}{% endfor %}).
5. The participant, their guardian or supporters and their support coordinator are told what is happening and how to complain, and the participant is offered an independent advocate.
6. Every worker in the affected homes is briefed on this document within 5 business days and completes restrictive practices training on {{ training_platform }} within 30 days.
7. {{ quality_lead }} reports progress to {{ director }} weekly until every practice in use is either eliminated or covered by a lodged plan and a current authorisation. {{ director }} then reissues this document with the "authorised" procedure, and {{ org.name }} begins monthly use reporting through the NDIS Commission Portal.

### Part B — While practices continue

1. Workers use proactive strategies first, use the practice only where there is a serious and immediate risk, for the shortest time, and record every use at the time.
2. The house leader reviews the Restrictive Practice Record daily and sends a weekly summary to {{ quality_lead }} and the practitioner.
3. Any injury, distress or escalation associated with a practice is an incident under the Incident Management Policy and is reviewed by the practitioner within 2 business days.
{% else %}
1. {{ org.name }}'s restrictive practice position is [TO CONFIRM]. {{ director }} completes the intake confirmation and the relevant procedure above is adopted before this document is approved.
{% endif %}

## Restrictive practice record (kept for each participant with a behaviour support plan)

| Date | Start and finish time | Home | Practice (seclusion / chemical / mechanical / physical / environmental) | What happened before and strategies tried | Participant's response and any injury | Within plan and authorisation? (Y/N) | Reported to (house leader, Commission reference) | Worker |
|---|---|---|---|---|---|---|---|---|
| 01/08/2026 (example — delete) | 3:05 pm – 3:12 pm | {% if intake.homes | length > 0 %}{{ intake.homes[0].name }}{% else %}[home]{% endif %} | Environmental — locked back gate | Participant attempted to leave onto main road; verbal redirection and offer of walk with worker tried first | Settled after 7 minutes; no injury | Y — plan section 4.2; authorisation expires 30/06/2027 | House leader 3:20 pm; monthly report | AW |

## Records kept

- Restrictive Practices Register (every practice, participant, home, plan status, authorisation and expiry dates){% if rp == 'none' %}; annual Statement of Non-Use{% endif %}.
- Behaviour support plans, lodgement confirmations and state authorisations in {{ notes_software }}.
- Restrictive Practice Records and monthly reports to the NDIS Commission.
- Incident reports and reportable incident notifications for any unauthorised use in {{ incident_software }}.
- Training Register entries for plan-specific and restrictive practices training.
- {{ quality_lead }}'s twice-yearly home audits and quarterly quality meeting reports.

## Related documents

- incident-management
- safeguarding-vaned
- autonomy-dignity-of-risk
- supported-decision-making
- household-decision-making
- medication-management
- safe-environment-property
- induction-training-competency
- complaints-feedback

## Legislation and standards references

- National Disability Insurance Scheme Act 2013 (Cth)
- NDIS (Restrictive Practices and Behaviour Support) Rules 2018 — definitions of regulated restrictive practices; conditions on implementing providers; behaviour support plans; reporting to the Commissioner
- NDIS (Incident Management and Reportable Incidents) Rules 2018 — unauthorised use of a restrictive practice (notification within 5 business days)
- NDIS (Provider Registration and Practice Standards) Rules 2018 — Core Module outcome 1.4; SIL supplementary module outcome 2{% if rp != 'none' %}; NDIS Practice Standards Module 2A (Implementing behaviour support plans){% endif %}
- NDIS Code of Conduct (NDIS (Code of Conduct) Rules 2018)
- NDIS Quality and Safeguards Commission Positive Behaviour Support Capability Framework
{% for state in org.states %}- {{ state }}: {{ rp_auth[state | upper] | default('Restrictive practices authorisation arrangements [TO CONFIRM]') }}
{% endfor %}

## Review

This document is reviewed every 12 months, after any unauthorised use, whenever a behaviour support plan or authorisation is issued or lapses, and whenever the Rules or the authorisation process in any state change. Review owner: {{ quality_lead }}. Approval: {{ director }}.

## Document control

| Version | Approved by | Approval date | Next review |
|---|---|---|---|
| 1.0 | {{ director }} | [TO CONFIRM] | [TO CONFIRM — 12 months after approval] |
