---
title: Complaints and Feedback Policy and Procedure
slug: complaints-feedback
doc_type: policy
standards: [core-2.5, sil-2]
applies_if: "true"
version: 1.0
review_months: 12
---
{% set director = intake.governance.ceo_or_director | default('[TO CONFIRM]', true) %}
{% set quality_lead = intake.governance.quality_lead | default('[TO CONFIRM]', true) %}
{% set complaints_officer = intake.governance.complaints_officer | default('[TO CONFIRM]', true) %}
{% set incident_officer = intake.governance.incident_officer | default('[TO CONFIRM]', true) %}
{% set privacy_officer = intake.governance.privacy_officer | default('[TO CONFIRM]', true) %}
{% set notes_software = intake.workforce.notes_software | default('[TO CONFIRM]', true) %}

# Complaints and Feedback Policy and Procedure

## Purpose

This document sets out how {{ org.name }} welcomes, receives, acknowledges, assesses, resolves and learns from complaints and feedback about its Supported Independent Living supports. It is {{ org.name }}'s complaints management and resolution system for the purposes of the NDIS Act 2013 and the NDIS (Complaints Management and Resolution) Rules 2018, and it evidences NDIS Practice Standards Core Module outcome 2.5 (Feedback and complaints management) and the SIL supplementary module safeguarding outcome.

## Scope

This document applies to complaints and feedback from participants, their families, guardians, nominees, advocates, friends, co-residents, workers, support coordinators, other providers, neighbours and members of the public, about any aspect of {{ org.name }}'s supports, its workers, its homes ({{ intake.homes | map(attribute='name') | join('; ') }}) or the way an earlier complaint was handled. It covers complaints made directly to {{ org.name }} and complaints about {{ org.name }} made to the NDIS Quality and Safeguards Commission. In the 12 months before this document was drafted {{ org.name }} received {{ intake.history.complaints_last_12m | default('[TO CONFIRM]', true) }} complaint{% if intake.history.complaints_last_12m != 1 %}s{% endif %}; those records are held in the Complaints Register.

## Policy statement

- **Complaints are welcome.** {{ org.name }} treats every complaint as information it needs. Participants are told at intake, in the Participant Rights Statement and at every support plan review that they can complain, how, and that nothing bad will happen to them if they do.
- **Anyone can complain, in any way, including anonymously.** Complaints can be made in person to any worker, by phone to {{ org.phone | default('[TO CONFIRM]', true) }}, by email to {{ org.email | default('[TO CONFIRM]', true) }}, through the website {{ org.website | default('[TO CONFIRM]', true) }}, by letter to {{ org.address | default('[TO CONFIRM]', true) }}, through an advocate or support coordinator, in a household meeting, on the Easy Read feedback form kept in every home, or anonymously. Interpreters (Translating and Interpreting Service, 131 450), Auslan interpreters, the National Relay Service and communication aids are arranged at {{ org.name }}'s cost, and a worker will help a participant write down a complaint about anyone, including that worker's colleagues.
- **No adverse treatment.** No participant, worker or other person will be disadvantaged, treated differently, threatened or have supports reduced because they made or helped with a complaint. Any suggestion of retaliation is a serious conduct matter and, where it affects a participant, an incident.
- **Complaints are handled fairly, promptly and with the participant.** The participant affected by the issue is involved in how it is resolved, is kept informed, and can have an advocate or support person at any stage. Workers who are the subject of a complaint are told about it and given a chance to respond (procedural fairness).
- **The Commission is always an option.** Anyone may complain to the NDIS Quality and Safeguards Commission at any time, whether or not they have complained to {{ org.name }} first, by phone on 1800 035 544, through the National Relay Service, or via the complaint form at ndiscommission.gov.au. {{ org.name }} cooperates fully with the Commission's handling of complaints.
- **Complaints improve supports.** Complaints, compliments and feedback are analysed for patterns and used to change practice, training, rosters and policies through the Continuous Improvement Register.
- **Records are kept and privacy protected.** Complaint records are kept for at least 7 years, and the identity of a complainant is shared only with those who need it to resolve the complaint, or with the complainant's consent.

### Timeframes {{ org.name }} sets for itself

| Step | Standard |
|---|---|
| Acknowledge the complaint | Within 2 business days (immediately if made in person) |
| Contact the complainant to agree how it will be handled | Within 5 business days |
| Resolve a straightforward complaint | Within 21 calendar days |
| Resolve a complex complaint (investigation, several parties) | Within 45 calendar days, with an update at least every 10 business days |
| Escalation to the Director if unresolved or the complainant is dissatisfied | Within 5 business days of the request |
| Written outcome to the complainant | On resolution, in the complainant's preferred format |

### Feedback other than complaints

{{ org.name }} also gathers compliments, suggestions and satisfaction feedback through: an annual participant and family survey in accessible format; monthly household meetings in shared homes; support plan reviews; exit feedback when a participant leaves; worker feedback in supervision and team meetings; and the feedback form in each home. Feedback is recorded in the Complaints Register (as feedback) and reviewed with complaints.

## Roles and responsibilities

| Role | Responsibilities under this document |
|---|---|
| Complaints Officer — {{ complaints_officer }} | Owns this document; receives and acknowledges complaints; assesses and plans handling; resolves or assigns complaints; keeps the complainant informed; maintains the Complaints Register; reports monthly to the quality and safety review; refers incidents to the Incident Officer and privacy complaints to the Privacy Officer. |
| Director — {{ director }} | Handles escalated complaints and complaints about the Complaints Officer; approves outcomes involving disciplinary action, refunds or service changes; reviews complaint trends quarterly; is the contact for the Commission. |
| Quality Lead — {{ quality_lead }} | Ensures accessible complaint information is in every home and in service agreements; runs the annual survey; transfers systemic actions to the Continuous Improvement Register; trains workers in receiving complaints. |
| Incident Officer — {{ incident_officer }} | Manages any complaint that discloses an incident, including reportable incidents, under the Incident Management Policy, in parallel with the complaint. |
| Privacy Officer — {{ privacy_officer }} | Handles complaints about privacy under the Privacy and Confidentiality Policy. |
| Support workers | Accept complaints from anyone at any time without argument; help participants make a complaint; record and pass on complaints the same day; never discourage a complaint or treat anyone differently for complaining. |

## Procedure

1. **Receive.** A worker who receives a complaint (spoken, written, through behaviour, or from a third party) thanks the person, records what they say in their words, and sends it to {{ complaints_officer }} the same day through {{ notes_software }} or by phone. A complaint does not need to use the word "complaint".
2. **Register.** {{ complaints_officer }} enters the complaint in the Complaints Register with a unique number (CMP-YYYY-NNN), the date received, the complainant (or "anonymous"), the participant affected, and the issues.
3. **Acknowledge.** Within 2 business days {{ complaints_officer }} acknowledges the complaint in the complainant's preferred format, names the contact person, explains the process and timeframes, and gives information about advocacy and about complaining to the Commission.
4. **Assess.** {{ complaints_officer }} assesses whether the complaint discloses an incident (refer to {{ incident_officer }} the same day), a reportable incident (24-hour or 5-business-day notification), a privacy breach, a risk to anyone's safety, or a conflict of interest for the Complaints Officer (refer to the Director), and rates its complexity.
5. **Plan with the complainant.** Within 5 business days {{ complaints_officer }} contacts the complainant (and the participant affected, if different) to agree what outcome they want, who will be involved, what support they need (interpreter, advocate, Easy Read) and how they will be kept informed.
6. **Resolve.** For straightforward complaints, {{ complaints_officer }} resolves the matter directly with the people involved (for example a roster change, an apology, a repair, a change of worker). For complex complaints, {{ complaints_officer }} or the Director gathers information from records, workers and witnesses, gives any worker complained about the chance to respond with a support person, and reaches a finding on the balance of probabilities.
7. **Decide and inform.** The outcome, the reasons, any actions taken and any remedy are given to the complainant in their preferred format, with information on how to escalate to the Director and to the Commission if they are dissatisfied. Any disciplinary outcome is described only in general terms.
8. **Escalate.** If the complainant is dissatisfied, the Director reviews the complaint within 5 business days, may seek an independent review or mediation, and confirms the final outcome in writing with the Commission's contact details.
9. **Learn.** {{ complaints_officer }} records the root cause and any systemic action in the Complaints Register and the Continuous Improvement Register; {{ quality_lead }} reports complaint trends (by home, issue, worker, outcome and timeliness) to the monthly quality and safety review and the Director's quarterly review.
10. **Close.** The complaint is closed when the complainant has been told the outcome and all actions are complete; the record is retained for at least 7 years.

### Complaints made to the NDIS Commission about {{ org.name }}

1. The Director is the contact for the Commission and responds to requests for information within the time the Commission sets.
2. {{ org.name }} takes part in any conciliation or resolution process, implements any outcomes, and records the complaint in the Complaints Register with the Commission reference.
3. The participant affected continues to receive their supports without change or adverse treatment while the Commission's process runs.

## Records kept

- Complaints Register (complaints, feedback and compliments), retained at least 7 years
- Complaint files: original complaint, acknowledgement, assessment, correspondence, statements, findings, outcome letter
- Annual survey results and household meeting records
- Accessible complaint information (Easy Read feedback form, Participant Rights Statement, service agreement clause)
- Continuous Improvement Register entries arising from complaints
- Worker training records on complaints handling

## Related documents

- Complaints Register template
- Participant Rights Statement (accessible)
- SIL Service Agreement template (complaints clause)
- Incident Management Policy and Procedure
- Open Disclosure Procedure
- Privacy and Confidentiality Policy
- Whistleblower Protection Policy
- Grievance and Disciplinary Policy (worker grievances)
- Quality and Continuous Improvement Policy and Continuous Improvement Register

## Legislation and standards references

- National Disability Insurance Scheme Act 2013 (Cth)
- NDIS (Complaints Management and Resolution) Rules 2018
- NDIS (Incident Management and Reportable Incidents) Rules 2018 (where a complaint discloses an incident)
- NDIS (Code of Conduct) Rules 2018 — the NDIS Code of Conduct
- NDIS (Provider Registration and Practice Standards) Rules 2018 — NDIS Practice Standards, Core Module outcome 2.5 Feedback and complaints management
- NDIS Practice Standards, SIL supplementary module (registration group 0138, 2026), safeguarding outcome
- Privacy Act 1988 (Cth)
- Australian Standard AS 10002:2022 Guidelines for complaint management in organizations, used as guidance
{% if 'NSW' in org.states %}
- Ageing and Disability Commissioner Act 2019 (NSW) (referral of abuse or neglect concerns)
{% endif %}

## Review

Reviewed every 12 months by the Complaints Officer ({{ complaints_officer }}) and approved by the Director ({{ director }}), with participant and worker feedback on how complaints were handled; reviewed earlier if the Commission raises concerns about complaint handling or the Complaints Rules change.

## Document control

| Version | Drafted | Approved by | Approval date | Next review |
|---|---|---|---|---|
| 1.0 | {{ intake.meta.generated_on | date }} | {{ director }} | [TO CONFIRM on adoption] | 12 months after approval |
