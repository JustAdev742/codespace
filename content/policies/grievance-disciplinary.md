---
title: Grievance and Disciplinary Policy
slug: grievance-disciplinary
doc_type: policy
standards: [core-2.6]
applies_if: "true"
version: 1.0
review_months: 12
---
{% set gov = intake.governance %}{% set wf = intake.workforce %}
{% set director = gov.ceo_or_director | default('[TO CONFIRM]', true) %}{% set quality_lead = gov.quality_lead | default('[TO CONFIRM]', true) %}{% set rostering_manager = gov.rostering_manager | default('[TO CONFIRM]', true) %}{% set incident_officer = gov.incident_officer | default('[TO CONFIRM]', true) %}{% set complaints_officer = gov.complaints_officer | default('[TO CONFIRM]', true) %}
# Grievance and Disciplinary Policy

## Purpose

This policy sets out how {{ org.name }} handles workplace grievances raised by workers and how it responds to alleged misconduct or serious underperformance by workers. It ensures that concerns are dealt with fairly, promptly and confidentially, that workers are protected when they raise concerns about participant safety, and that participants are protected while an allegation is being investigated.

## Scope

This policy applies to all workers of {{ org.name }} ({{ wf.employment_types | join(', ') | default('[TO CONFIRM]', true) }}) and key personnel. Agency and contract workers are covered for the purpose of removing them from {{ org.name }} homes and reporting conduct to their agency; their employment consequences are managed by the agency. Complaints from participants and their supporters are handled under the Complaints and Feedback Policy; incidents are handled under the Incident Management Policy. Where a worker's grievance or alleged misconduct also involves a participant, both policies apply and {{ incident_officer }} coordinates.

## Policy statement

- Any worker may raise a grievance about their work, conditions, treatment, roster, safety or the conduct of another person without fear of victimisation. Raising a concern about participant safety or quality of support is an obligation under the NDIS Code of Conduct, not a grievance, and is always protected.
- {{ org.name }} resolves grievances at the lowest appropriate level, as quickly as possible and, wherever possible, within 20 business days.
- Disciplinary action follows procedural fairness: the worker is told the allegation in enough detail to respond, is given a reasonable opportunity to respond (with a support person), the decision-maker is impartial, and the response is genuinely considered before any decision.
- Where an allegation involves harm or risk of harm to a participant, {{ org.name }} acts first to protect the participant, which may include standing the worker down on full pay, changing rosters or supervising the worker, before and during the investigation.
- Disciplinary outcomes are proportionate: coaching, a written warning, a final written warning, demotion, or termination of employment. Serious misconduct (for example abuse, neglect or exploitation of a participant, sexual misconduct, theft, violence, working under the influence of alcohol or drugs, breach of a restrictive practice authorisation, falsifying records) may result in summary dismissal.
- Reportable incidents arising from worker conduct are notified to the NDIS Quality and Safeguards Commission within the timeframes in the Incident Management Policy (24 hours for death, serious injury, abuse or neglect, unlawful sexual or physical contact or assault, or sexual misconduct; 5 business days for the unauthorised use of a restrictive practice), regardless of the stage of any internal process. Relevant matters are also reported to the police and the worker screening unit as required.
- Records of grievances and disciplinary matters are confidential, kept separately on the personnel file, and used only for lawful purposes.
- Nothing in this policy limits a worker's rights under the Fair Work Act 2009 (Cth), including protection from unfair dismissal, general protections and the right to be represented.

## Roles and responsibilities

| Role | Responsibilities |
|---|---|
| {{ director }} | Decision-maker for disciplinary outcomes above a written warning and for grievances involving senior staff; ensures external reporting where required; approves this policy. |
| {{ quality_lead }} | Owns this policy; keeps the Grievance and Disciplinary Register; monitors timeframes; reports de-identified themes to the quality meeting. |
| {{ rostering_manager }} | First point of contact for roster, hours and pay grievances; arranges cover when a worker is stood down. |
| {{ incident_officer }} | Coordinates any matter that is also an incident; manages notifications to the NDIS Commission and other authorities. |
| {{ complaints_officer }} | Coordinates where a worker matter arises from a participant complaint. |
| House leaders | Resolve informal grievances at the home level; record outcomes; escalate. |
| All workers | Raise concerns early and honestly; participate in processes in good faith; maintain confidentiality. |

## Grievance process

1. **Informal resolution.** The worker raises the issue with the person concerned or their house leader. The house leader records the issue and the outcome on the Grievance and Disciplinary Register within 2 business days.
2. **Formal grievance.** If unresolved, the worker submits a written grievance (or asks a supervisor to write it down for them) to {{ quality_lead }} or, where the grievance is about {{ quality_lead }}, to {{ director }}.
3. **Acknowledgment.** The grievance is acknowledged in writing within 2 business days, and an impartial manager is appointed to handle it.
4. **Inquiry.** The manager meets the worker (with a support person if wanted), meets any other person involved, reviews relevant records in the rostering, notes and incident systems, and keeps notes.
5. **Outcome.** A written outcome is given within 20 business days, stating what was found, what will change and how the worker can escalate if dissatisfied. Extensions are explained in writing.
6. **Escalation.** The worker may ask {{ director }} to review the outcome, and retains the right to contact the Fair Work Ombudsman, the Fair Work Commission, the relevant work health and safety regulator or an anti-discrimination body.
7. **Protection.** Any victimisation of a worker for raising a grievance is itself misconduct.

## Disciplinary process

1. **Concern identified.** A concern about conduct or performance is reported to the worker's supervisor or {{ incident_officer }}. If a participant is or may be affected, the Incident Management Policy applies immediately, including protecting the participant, preserving evidence and notifying the NDIS Commission of any reportable incident.
2. **Initial assessment within 1 business day.** {{ director }} (or {{ quality_lead }} for less serious matters) decides whether the matter is minor performance (managed under the Supervision and Performance Policy), potential misconduct (this process), or serious misconduct requiring stand-down and external reporting.
3. **Stand-down.** Where required to protect participants, the worker is stood down on pay pending investigation, told in writing why, and removed from rosters by {{ rostering_manager }}.
4. **Investigation.** An investigator without prior involvement gathers the facts: statements, progress notes, roster data, CCTV or device logs where lawful, and medication or financial records where relevant. Interviews are recorded in writing. Participants are interviewed only with their consent and with the support they choose.
5. **Allegations put to the worker.** The worker receives the allegations and evidence summary in writing at least 2 business days before a meeting, may bring a support person, and may respond in writing.
6. **Decision.** The decision-maker considers the response and decides, on the balance of probabilities, whether the allegation is substantiated, and what outcome is proportionate. The decision and reasons are given in writing within 5 business days of the meeting.
7. **Outcome actions.** The outcome is recorded; training, supervision or roster changes are implemented; the participant and their supporters are informed of what has been done (open disclosure) at a level consistent with privacy; and any required notifications to the worker screening unit or NDIS Commission are completed.
8. **Appeal.** The worker may request a review by {{ director }} (or, where {{ director }} decided, by an independent person appointed by {{ director }}) within 7 days.
9. **Register.** {{ quality_lead }} closes the matter on the Grievance and Disciplinary Register and reviews whether a policy, training or system change is needed.

## Records kept

- Grievance and Disciplinary Register (matter number, date, type, parties, stand-down, timeframes met, outcome, appeal, notifications, systemic actions).
- Investigation files: allegations, evidence, interview notes, worker responses, decision letters, kept separately and securely for 7 years.
- Notifications to the NDIS Commission, police and worker screening units.
- Open disclosure records to participants.

## Related documents

- human-resources-recruitment
- supervision-performance
- worker-screening
- incident-management
- complaints-feedback
- whistleblower
- safeguarding
- open-disclosure
- privacy-confidentiality

## Legislation and standards references

- National Disability Insurance Scheme Act 2013 (Cth)
- NDIS (Provider Registration and Practice Standards) Rules 2018 — Core Module outcome 2.6
- NDIS Code of Conduct
- NDIS (Incident Management and Reportable Incidents) Rules 2018
- NDIS (Complaints Management and Resolution) Rules 2018
- NDIS (Practice Standards—Worker Screening) Rules 2018
- Fair Work Act 2009 (Cth) (unfair dismissal, general protections, Small Business Fair Dismissal Code where applicable)
- Privacy Act 1988 (Cth) and the Australian Privacy Principles
{% for state in org.states %}- Work health and safety legislation of {{ state }} (psychosocial hazards, bullying) as cited in the Work Health and Safety Policy
{% endfor %}

## Review

This policy is reviewed every 12 months, and after any matter that reveals a gap in the process. Review owner: {{ quality_lead }}. Approval: {{ director }}.

## Document control

| Version | Approved by | Approval date | Next review |
|---|---|---|---|
| 1.0 | {{ director }} | [TO CONFIRM] | [TO CONFIRM — 12 months after approval] |
