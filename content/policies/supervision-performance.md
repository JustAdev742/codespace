---
title: Supervision and Performance Policy
slug: supervision-performance
doc_type: policy
standards: [core-2.6, sil-3]
applies_if: "true"
version: 1.0
review_months: 12
---
{% set gov = intake.governance %}{% set wf = intake.workforce %}{% set sup = intake.supports %}
{% set director = gov.ceo_or_director | default('[TO CONFIRM]', true) %}{% set quality_lead = gov.quality_lead | default('[TO CONFIRM]', true) %}{% set rostering_manager = gov.rostering_manager | default('[TO CONFIRM]', true) %}
{% set rostering_software = wf.rostering_software | default('[TO CONFIRM]', true) %}{% set notes_software = wf.notes_software | default('[TO CONFIRM]', true) %}
# Supervision and Performance Policy

## Purpose

This policy sets out how {{ org.name }} supervises and supports its workers, monitors their performance and practice, and addresses performance concerns, so that participants in each of its {{ intake.homes | length }} home{% if intake.homes | length != 1 %}s{% endif %} receive support that is safe, consistent and in line with their plans. Regular supervision is the main way {{ org.name }} finds out how practice is actually being delivered on shift and is a key control for SIL supplementary module outcome 3.

## Scope

This policy applies to all {{ org.name }} workers ({{ wf.employment_types | join(', ') | default('[TO CONFIRM]', true) }}), house leaders, coordinators and key personnel. Agency and contract workers receive shift-level supervision and feedback under this policy; formal performance management of agency workers is conducted through their agency.

## Policy statement

- Every worker has a named supervisor. Support workers are supervised by the house leader of their primary home; house leaders are supervised by {{ rostering_manager }}; {{ rostering_manager }} and {{ quality_lead }} are supervised by {{ director }}.
- Formal, recorded one-to-one supervision occurs at least every 8 weeks for permanent and part-time workers and at least every 12 weeks for casual workers who have worked in the period, in addition to probation reviews at 3 and 6 months. Supervision is more frequent during probation, after an incident or complaint involving the worker, or where a performance plan is in place.
- Supervision covers: the worker's wellbeing and workload; reflection on practice with each participant; supported decision-making and the participant's goals; progress note quality; incidents, complaints and near misses; medication and other competencies; training due; and any concerns the worker wants to raise, including concerns about the conduct of others.
- Supervision includes direct observation of practice on shift at least twice a year for each worker, recorded on the Supervision Record, so that consistency across workers, shifts and homes can be checked and coached.
- Annual performance reviews are held for all employees against the position description and the NDIS Code of Conduct, and identify development goals and training.
- Performance concerns are raised early, honestly and privately, with clear expectations, support and a reasonable time to improve. Serious misconduct is dealt with under the Grievance and Disciplinary Policy and, where relevant, the Incident Management Policy.
- Workers on sleepover and overnight shifts, who often work alone, receive the same frequency of supervision and are included in house meetings by rotation or by written contribution.
- Supervision is confidential except where a disclosure raises a safeguarding, legal or reportable matter, which is explained to workers at induction.

## Roles and responsibilities

| Role | Responsibilities |
|---|---|
| {{ director }} | Supervises senior staff; approves performance improvement plans and any outcome affecting employment; approves this policy. |
| {{ quality_lead }} | Owns this policy; maintains the supervision schedule; audits Supervision Records quarterly for completion and quality; reports themes to the quality meeting. |
| {{ rostering_manager }} | Supervises house leaders; ensures supervision time is rostered and paid in {{ rostering_software }}; tracks completion. |
| House leaders | Deliver supervision and observation of practice to support workers; record it; escalate concerns. |
| All workers | Attend and prepare for supervision; complete agreed actions; raise concerns early. |

## Supervision and performance practice

1. {{ quality_lead }} publishes a 12-month supervision schedule for every worker in {{ rostering_software }} and reviews completion monthly.
2. Before supervision the supervisor reviews the worker's recent progress notes in {{ notes_software }}, any incidents, complaints or feedback, training due dates and the previous Supervision Record.
3. Supervision is held privately, away from participants, for at least 45 minutes, and recorded on the Supervision Record within 2 business days. The worker receives a copy and may add comments.
4. Observation of practice: the supervisor attends part of a shift, observes support delivery against the participant's plan (including communication, choice and control, medication or mealtime support where applicable, manual handling and note writing), gives feedback on the day and records it on the Supervision Record.
5. Actions agreed in supervision are followed up at the next session; unresolved actions are escalated to {{ rostering_manager }}.
6. Where a performance concern is identified: the supervisor discusses it with the worker within 5 business days; states the expected standard and the support offered; sets a review date; and records it. If the concern continues, a written performance improvement plan of 4 to 12 weeks is approved by {{ director }}, with fortnightly review meetings.
7. Annual performance reviews use the position description, supervision records, participant and co-worker feedback and training records, and result in a written development plan.
8. Group supervision or debriefing is offered within 72 hours after a critical incident, and workers are told how to access the employee assistance program or other support [TO CONFIRM EAP arrangements].

## Templates

### Supervision record template

| Field | Content |
|---|---|
| Worker / role / home(s) | A. Example, support worker, {{ intake.homes[0].name | default('[home]') }} (example — delete) |
| Supervisor | House leader name |
| Date and type | 01/08/2026 — scheduled one-to-one / observation of practice / probation review / incident debrief |
| Wellbeing and workload | Worker's own account; sleepover and overnight impacts |
| Practice reflection by participant | Participant A: what is working, what the participant has said they want changed, supported decision-making examples |
| Progress notes and handover quality | Sample of 5 notes reviewed; feedback given |
| Incidents, complaints, near misses since last session | Reference numbers; learning |
| Competencies and training | Medication competency due 30/09/2026; first aid current |
| Concerns raised by worker | Including concerns about others' conduct (worker told of whistleblower protections) |
| Observation of practice summary (if applicable) | Tasks observed; strengths; coaching points |
| Agreed actions | Action, owner, due date |
| Follow-up from last session | Completed / outstanding |
| Signatures | Worker / supervisor / date |

## Records kept

- Supervision schedule and completion report from {{ rostering_software }}.
- Supervision Records (including observation of practice) on personnel files, kept 7 years after separation.
- Probation reviews, annual performance reviews and development plans.
- Performance improvement plans and related correspondence.
- Quarterly supervision audit and quality meeting minutes.

## Related documents

- human-resources-recruitment
- induction-training-competency
- grievance-disciplinary
- practice-governance-workforce-consistency
- shift-handover-progress-notes
- incident-management
- whistleblower

## Legislation and standards references

- National Disability Insurance Scheme Act 2013 (Cth)
- NDIS (Provider Registration and Practice Standards) Rules 2018 — Core Module outcome 2.6; SIL supplementary module outcome 3
- NDIS Code of Conduct
- Fair Work Act 2009 (Cth); Social, Community, Home Care and Disability Services Industry Award 2010
- Privacy Act 1988 (Cth) and the Australian Privacy Principles (worker records)
{% for state in org.states %}- Work health and safety legislation of {{ state }} (psychosocial hazards and consultation) as cited in the Work Health and Safety Policy
{% endfor %}

## Review

This policy is reviewed every 12 months. Review owner: {{ quality_lead }}. Approval: {{ director }}.

## Document control

| Version | Approved by | Approval date | Next review |
|---|---|---|---|
| 1.0 | {{ director }} | [TO CONFIRM] | [TO CONFIRM — 12 months after approval] |
