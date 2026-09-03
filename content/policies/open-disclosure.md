---
title: Open Disclosure Procedure
slug: open-disclosure
doc_type: procedure
standards: [core-1.5]
applies_if: "true"
version: 1.0
review_months: 12
---
{% set director = intake.governance.ceo_or_director | default('[TO CONFIRM]', true) %}
{% set quality_lead = intake.governance.quality_lead | default('[TO CONFIRM]', true) %}
{% set incident_officer = intake.governance.incident_officer | default('[TO CONFIRM]', true) %}
{% set complaints_officer = intake.governance.complaints_officer | default('[TO CONFIRM]', true) %}
{% set incident_software = intake.workforce.incident_software | default('[TO CONFIRM]', true) %}

# Open Disclosure Procedure

## Purpose

This procedure sets out how {{ org.name }} tells participants, and the people they choose, what happened when something goes wrong in their supports, apologises, explains what is being done about it and keeps them informed. Open disclosure is part of how {{ org.name }} responds to incidents under NDIS Practice Standards Core Module outcome 1.5 and the incident management outcome, and it reflects the NDIS Code of Conduct obligation to act with integrity, honesty and transparency.

## Scope

This procedure applies whenever a participant is harmed, distressed or disadvantaged by something {{ org.name }} did or failed to do, or by an incident in any home {{ org.name }} supports or vehicle, including:

- injury, illness or death connected with supports;
- abuse, neglect, exploitation or discrimination by a worker, co-resident, contractor or visitor;
- medication errors{% if intake.supports.medication_involvement == 'administer' %} (including wrong dose, wrong time, missed dose or wrong person, which are foreseeable in a service that administers medication){% elif intake.supports.medication_involvement == 'prompt' %} (including missed or incorrect prompting){% endif %};
- use of a restrictive practice outside a behaviour support plan or authorisation;
- privacy breaches;
- failures of service such as a missed or unfilled shift, a participant left without support, a missed appointment or lost property;
- near misses the participant is aware of or that could recur.

It applies to all workers and key personnel of {{ org.name }} across all its homes. It does not replace reportable incident notification, police reporting or complaints handling, which run alongside it.

## Policy statement

{{ org.name }} will be honest with participants when things go wrong. Participants will be told promptly and in a way they understand; they will receive a sincere apology; they will be told what is being done to put things right and to stop it happening again; and they will be kept informed until the matter is closed. Workers are supported to take part in open disclosure and are not punished for reporting honestly. An apology, including an expression of regret for what happened, is not treated by {{ org.name }} as an admission of liability{% if 'NSW' in org.states %}, consistent with section 69 of the Civil Liability Act 2002 (NSW){% endif %}, and workers are never told to avoid apologising.

## Roles and responsibilities

| Role | Responsibilities under this procedure |
|---|---|
| Director — {{ director }} | Leads open disclosure for serious incidents (death, serious injury, abuse, sexual misconduct) and for any incident involving the Incident Officer; approves written disclosure statements; ensures insurers are informed where required without delaying disclosure. |
| Incident Officer — {{ incident_officer }} | Leads open disclosure for other incidents; decides who should be told and when; plans and records disclosure meetings; keeps the participant informed of investigation progress and outcome. |
| Quality Lead — {{ quality_lead }} | Arranges advocacy, interpreter and communication support; ensures disclosure is done in the participant's communication method; captures learning in the Continuous Improvement Register. |
| Complaints Officer — {{ complaints_officer }} | Links open disclosure with any related complaint, so the participant deals with one contact person. |
| Support workers | Give an immediate, honest acknowledgement at the time; do not speculate or blame; report to the Incident Officer; take part in disclosure meetings when asked; support the participant afterwards. |

## Procedure

1. **Make the participant safe and meet immediate needs.** Give first aid, call 000 or a health professional as needed, and remove any ongoing danger. Nothing in this procedure delays care.
2. **Acknowledge at the time.** The worker present tells the participant, in their communication method, what has happened as far as it is known, says sorry, and explains what is going to happen next (for example, "I gave you the wrong tablet. I'm sorry. I'm calling the poisons line now and then my manager"). The worker does not guess at causes or blame others.
3. **Report.** The worker notifies {{ incident_officer }} by phone (immediately for serious incidents, otherwise before the end of the shift) and records the incident and the initial acknowledgement in {{ incident_software }}.
4. **Decide who leads and who is told.** {{ incident_officer }} (or the Director for serious incidents) confirms who will lead the disclosure. The participant is always told. With the participant's consent, or where a guardian or nominee has authority over the relevant matter, family or the appointed person are also told. The participant decides whether they want an advocate, family member or friend present.
5. **Plan the disclosure conversation.** For serious incidents, the conversation takes place within 2 business days of {{ org.name }} becoming aware; for other incidents, within 5 business days. {{ quality_lead }} arranges an interpreter (Translating and Interpreting Service, 131 450), Auslan interpreter, Easy Read material or communication support as needed. The participant chooses where and when (their home in private, or elsewhere).
6. **Hold the conversation.** The leader: explains the facts known so far, in plain language, without speculation; apologises sincerely for what happened and its effect; explains what {{ org.name }} has done immediately, what will be investigated and how long that will take; explains that the participant can complain to {{ org.name }} or the NDIS Quality and Safeguards Commission (1800 035 544) and can contact police or an advocate; asks the participant what they need now and what would put things right for them; and agrees how and when they will be updated.
7. **Record.** The leader completes the Open Disclosure Record in {{ incident_software }}, linked to the incident: date, attendees, what was disclosed, the apology, questions asked and answers given, the participant's wishes, agreed follow-up and next contact date.
8. **Keep the participant informed.** The leader updates the participant at each agreed point, and at least every 2 weeks while an investigation is open, including if the Commission or police are involved (within any limits they set).
9. **Close.** When the investigation is complete, the leader meets the participant again to explain the findings, what has changed as a result, and any remedy offered (for example replacement of property, a change of worker, a change to the support plan). The participant is asked whether they are satisfied; if not, the matter is escalated to the Director and handled as a complaint.
10. **Support workers.** Workers involved in an incident are debriefed by {{ incident_officer }} or {{ quality_lead }}, offered support (including the employee assistance arrangement, if any: [TO CONFIRM]), and given feedback on the outcome.
11. **Learn.** {{ quality_lead }} records systemic lessons in the Continuous Improvement Register and reports open disclosure activity at the monthly quality and safety review.

## Records kept

- Open Disclosure Record for each incident ({{ incident_software }}), linked to the Incident Register entry
- Progress notes recording the initial acknowledgement
- Correspondence with the participant, family, guardian or nominee
- Interpreter and advocate arrangements
- Continuous Improvement Register entries

## Related documents

- Incident Management Policy and Procedure (including reportable incidents)
- Safeguarding Policy — Violence, Abuse, Neglect, Exploitation and Discrimination
- Complaints and Feedback Policy and Procedure
- Privacy and Confidentiality Policy (consent to inform family)
- Supported Decision-Making Policy and Procedure (who has authority to be informed)
- Medication Management Policy
- Quality and Continuous Improvement Policy

## Legislation and standards references

- National Disability Insurance Scheme Act 2013 (Cth)
- NDIS (Incident Management and Reportable Incidents) Rules 2018 (support for, and involvement of, persons with disability affected by an incident)
- NDIS (Complaints Management and Resolution) Rules 2018
- NDIS (Code of Conduct) Rules 2018 — the NDIS Code of Conduct
- NDIS (Provider Registration and Practice Standards) Rules 2018 — NDIS Practice Standards, Core Module outcome 1.5 and the incident management outcome
- NDIS Practice Standards, SIL supplementary module (registration group 0138, 2026), safeguarding outcome
- Australian Open Disclosure Framework (Australian Commission on Safety and Quality in Health Care, 2013), used as guidance
{% if 'NSW' in org.states %}
- Civil Liability Act 2002 (NSW), Part 10 (apologies)
{% endif %}
{% if 'VIC' in org.states %}
- Wrongs Act 1958 (Vic), Part IIC (apologies)
{% endif %}
{% if 'QLD' in org.states %}
- Civil Liability Act 2003 (Qld) (expressions of regret)
{% endif %}

## Review

Reviewed every 12 months by the Incident Officer ({{ incident_officer }}) and approved by the Director ({{ director }}); reviewed earlier after any serious incident where disclosure was delayed or a participant reported not being kept informed.

## Document control

| Version | Drafted | Approved by | Approval date | Next review |
|---|---|---|---|---|
| 1.0 | {{ intake.meta.generated_on | date }} | {{ director }} | [TO CONFIRM on adoption] | 12 months after approval |
