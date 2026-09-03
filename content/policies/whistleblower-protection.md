---
title: Whistleblower Protection Policy
slug: whistleblower-protection
doc_type: policy
standards: [core-1.5, core-2.1]
applies_if: "true"
version: 1.0
review_months: 12
---
{% set gov = intake.governance %}{% set wf = intake.workforce %}
{% set director = gov.ceo_or_director | default('[TO CONFIRM]', true) %}{% set quality_lead = gov.quality_lead | default('[TO CONFIRM]', true) %}{% set complaints_officer = gov.complaints_officer | default('[TO CONFIRM]', true) %}{% set incident_officer = gov.incident_officer | default('[TO CONFIRM]', true) %}{% set privacy_officer = gov.privacy_officer | default('[TO CONFIRM]', true) %}
{% set incident_software = wf.incident_software | default('[TO CONFIRM]', true) %}
# Whistleblower Protection Policy

## Purpose

{{ org.name }} depends on its workers, participants and others speaking up when something is wrong. This policy explains who can raise a concern about wrongdoing, what they can raise, how (including anonymously), and the protections {{ org.name }} gives anyone who does. It evidences NDIS Practice Standards Core Module outcomes 1.5 (Violence, abuse, neglect, exploitation and discrimination) and 2.1 (Governance and operational management), which require a culture in which abuse, neglect and misconduct are reported without fear of reprisal.

## Scope

This policy applies to current and former workers of {{ org.name }} ({{ wf.employment_types | join(', ') }}), key personnel, contractors, agency workers, volunteers, students, suppliers, and their relatives and dependants. Participants, their families, guardians, nominees and advocates are also protected when they raise a concern, and may use the Complaints and Feedback Policy at the same time. The policy covers wrongdoing in any of {{ org.name }}'s {{ intake.homes | length }} home{% if intake.homes | length != 1 %}s{% endif %}, in the community and in administration.

## Policy statement

### What can be reported

A person may report a concern if they have reasonable grounds to suspect any of the following in connection with {{ org.name }}:

- violence, abuse, neglect, exploitation or discrimination of a participant, or any other breach of the NDIS Code of Conduct;
- use of a restrictive practice without authorisation or outside a behaviour support plan;
- an incident, including a reportable incident, that has not been recorded in {{ incident_software }} or notified to the NDIS Quality and Safeguards Commission;
- fraud, false or inflated NDIS claims, misuse of participant money or property, bribery, theft or corruption;
- a worker without a current NDIS Worker Screening clearance, or falsified records;
- a serious danger to health and safety, or a breach of WHS or privacy law;
- pressure on a participant to keep {{ org.name }} as their provider in order to keep their home;
- any other serious breach of law or policy, or concealment or punishment of a report.

Personal work-related grievances (for example about a roster, pay or a performance review) are handled under the Grievance and Disciplinary Policy unless they also involve a matter listed above or detriment for having made a report.

### Who a report can be made to

A report may be made in person, by phone, by email or in writing to any of these eligible recipients:

- the Director, {{ director }};
- the Whistleblower Protection Officer, {{ quality_lead }};
- {% if gov.has_board %}the Chair of the Board or any other board member{% else %}[TO CONFIRM — an independent person nominated by the Director, such as the external accountant or lawyer, for concerns that involve the Director]{% endif %};
- {{ org.name }}'s external auditor or accountant, or a lawyer for the purpose of legal advice.

A report may also be made directly to the NDIS Quality and Safeguards Commission (1800 035 544), the police, the state work health and safety regulator, the Office of the Australian Information Commissioner{% if org.entity_type == 'company' %}, the Australian Securities and Investments Commission (ASIC){% endif %} or the Australian Taxation Office. Reporting internally first is not required.

### Anonymous reports

A report may be made anonymously or under a pseudonym and remains protected, through {{ incident_software }} where the platform allows it or by unsigned letter to {{ org.address }}. Anonymous reports are harder to investigate, so enough detail to allow inquiries is encouraged.

### Protections

Every person who reports on reasonable grounds receives these protections, whether or not the report is substantiated:

- **Confidentiality.** The person's identity, and information likely to reveal it, is not disclosed without their consent, except to a lawyer for advice, to a regulator or the police, or as required by law. Investigation records are kept separately from personnel files with access limited to the Whistleblower Protection Officer and the Director.
- **No detriment.** No person will be dismissed, demoted, disciplined, rostered off, harassed, intimidated or otherwise disadvantaged because they made, or are suspected of making, a report. A threat of detriment is itself a disciplinary matter.
- **Immunity from internal action.** {{ org.name }} does not discipline a person, or end their employment or contract, for making a report. This does not protect a person from the consequences of their own misconduct, although their cooperation is taken into account.
- **Support and remedies.** The person is offered a support person, roster or reporting-line adjustments on request, and regular updates. Where detriment occurs, {{ org.name }} restores the person's position and the Director considers any further remedy.

{% if org.entity_type == 'company' %}
Because {{ org.name }} is a company, the whistleblower protections in Part 9.4AAA of the Corporations Act 2001 (Cth) also apply to disclosures about misconduct or an improper state of affairs made to an officer or senior manager of {{ org.name }}, its auditor, ASIC or a lawyer: confidentiality of identity, protection from victimisation, and civil and criminal immunity. Causing detriment to a whistleblower or breaching their confidentiality may be an offence. This policy adds to, and never reduces, those rights.
{% else %}
{{ org.name }} is a {{ org.entity_type | replace('_', ' ') }} and the statutory whistleblower regime in the Corporations Act 2001 (Cth) may not apply to it directly. {{ org.name }} nevertheless adopts equivalent protections through this policy as a term of every engagement, and the Fair Work Act 2009 (Cth) prohibits adverse action against an employee for making a complaint or inquiry about their employment.
{% endif %}

A person who knowingly makes a false report is not protected and may face disciplinary action. A report that is honestly made but not substantiated remains protected.

## Roles and responsibilities

| Role | Responsibilities under this document |
|---|---|
| Director — {{ director }} | Accountable for this policy and a speak-up culture; receives reports; approves investigations, outcomes and remedies; ensures no detriment occurs; reports annually to {% if gov.has_board %}the Board{% else %}the quality and safety review{% endif %}. |
| Whistleblower Protection Officer — {{ quality_lead }} | Receives, registers and assesses reports; protects the discloser's identity and welfare; coordinates investigations; keeps the Whistleblower Report Register; monitors for detriment for 12 months. |
| Incident Officer — {{ incident_officer }} | Where a report discloses an incident, records it in {{ incident_software }} and manages any reportable incident notification within the Incident Management Policy timeframes. |
| Complaints Officer — {{ complaints_officer }} | Identifies complaints that are also whistleblower reports and refers them the same day. |
| Privacy Officer — {{ privacy_officer }} | Advises on lawful handling of personal information during an investigation. |
| Managers and house leaders | Pass reports to the Whistleblower Protection Officer within 1 business day; never try to identify an anonymous discloser; prevent and report detriment. |
| All workers | Report wrongdoing they reasonably suspect; cooperate with investigations; keep investigations confidential. |

## Procedure

1. Any eligible recipient who receives a report records the date, how it was received and what was disclosed, and passes it to the Whistleblower Protection Officer within 1 business day (or to the Director where the report concerns the Whistleblower Protection Officer, and to {% if gov.has_board %}the Chair of the Board{% else %}the independent person named above or the NDIS Commission{% endif %} where it concerns the Director).
2. The Whistleblower Protection Officer registers the report under a reference number rather than the person's name, acknowledges it within 2 business days where the person can be contacted, explains the protections, and agrees how the person will be kept informed.
3. Within 5 business days the Whistleblower Protection Officer and the Director assess whether the report discloses an incident or reportable incident (referred immediately under the Incident Management Policy), needs a police, WHS, privacy or Commission report, requires immediate protective action, or warrants a formal investigation.
4. The Director appoints an investigator with no involvement in the matter. Where the report concerns key personnel or a serious allegation of abuse, fraud or corruption, an external investigator is engaged.
5. The investigation is fair and prompt, normally completed within 30 business days. Anyone the report is about is told the substance of the allegation and may respond before findings are made, but is not told who made the report.
6. The Whistleblower Protection Officer checks with the discloser at least fortnightly about their welfare and any sign of detriment, and acts immediately on any concern.
7. The investigator reports findings to the Director, who decides on corrective action (disciplinary action, a participant safety plan, repayment of NDIS funds, or systemic changes recorded in the Continuous Improvement Register) and on any report to a regulator.
8. The discloser is told the outcome in general terms, subject to the privacy of others, and is invited to give feedback on how the matter was handled.
9. The register entry is closed and the file is retained for at least 7 years, separately from personnel records.

## Records kept

- Whistleblower Report Register (reference number, date, category, assessment, investigator, outcome, detriment monitoring, closure), held with restricted access
- Investigation files, statements, evidence and findings; records of protective actions and welfare checks
- Referrals to the Incident Register, {{ incident_software }}, the Complaints and Feedback Register and any regulator
- Annual report to {% if gov.has_board %}the Board{% else %}the Director's quality and safety review{% endif %} on reports received, outcomes and lessons
- Training records showing every worker is briefed on this policy at induction and annually

## Related documents

- Safeguarding Policy — Violence, Abuse, Neglect, Exploitation and Discrimination
- Incident Management Policy and Procedure (including Reportable Incidents)
- Complaints and Feedback Policy and Procedure
- Grievance and Disciplinary Policy
- Financial Management, NDIS Billing and Claiming, and Fraud and Corruption Prevention Policy
- Conflicts of Interest Policy, Procedure and Register
- Privacy and Confidentiality Policy
- Governance and Operational Management Framework

## Legislation and standards references

- National Disability Insurance Scheme Act 2013 (Cth)
- NDIS (Provider Registration and Practice Standards) Rules 2018 — NDIS Practice Standards, Core Module outcomes 1.5 and 2.1; SIL supplementary module (registration group 0138, 2026), safeguarding outcome
- NDIS (Code of Conduct) Rules 2018 — the NDIS Code of Conduct
- NDIS (Incident Management and Reportable Incidents) Rules 2018
- NDIS (Complaints Management and Resolution) Rules 2018 (a person who makes a complaint must not be adversely affected as a result)
{% if org.entity_type == 'company' %}
- Corporations Act 2001 (Cth), Part 9.4AAA (protection for whistleblowers)
- Taxation Administration Act 1953 (Cth), Part IVD (protection for tax whistleblowers)
{% endif %}
- Fair Work Act 2009 (Cth), Part 3-1 (general protections against adverse action for making a complaint or inquiry)
- Privacy Act 1988 (Cth) and the Australian Privacy Principles
{% for state in org.states %}
- Work health and safety legislation of {{ state }} (protection from discriminatory conduct for raising health and safety issues), as cited in the Work Health and Safety Policy
{% endfor %}

## Review

Reviewed every 12 months by the Whistleblower Protection Officer ({{ quality_lead }}) and approved by the Director ({{ director }}); reviewed earlier after any substantiated detriment to a discloser, any change to relevant law, or any audit finding about speak-up culture.

## Document control

| Version | Drafted | Approved by | Approval date | Next review |
|---|---|---|---|---|
| 1.0 | {{ intake.meta.generated_on | date }} | {{ director }} | [TO CONFIRM on adoption] | 12 months after approval |
