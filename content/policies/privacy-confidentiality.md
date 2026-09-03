---
title: Privacy and Confidentiality Policy, Consent Procedure and Privacy Breach Response Procedure
slug: privacy-confidentiality
doc_type: policy
standards: [core-1.3, core-2.4]
applies_if: "true"
version: 1.0
review_months: 12
---
{% set director = intake.governance.ceo_or_director | default('[TO CONFIRM]', true) %}
{% set quality_lead = intake.governance.quality_lead | default('[TO CONFIRM]', true) %}
{% set privacy_officer = intake.governance.privacy_officer | default('[TO CONFIRM]', true) %}
{% set complaints_officer = intake.governance.complaints_officer | default('[TO CONFIRM]', true) %}
{% set incident_officer = intake.governance.incident_officer | default('[TO CONFIRM]', true) %}
{% set notes_software = intake.workforce.notes_software | default('[TO CONFIRM]', true) %}
{% set rostering_software = intake.workforce.rostering_software | default('[TO CONFIRM]', true) %}
{% set incident_software = intake.workforce.incident_software | default('[TO CONFIRM]', true) %}

# Privacy and Confidentiality Policy, Consent Procedure and Privacy Breach Response Procedure

## Purpose

This document sets out how {{ org.name }} protects the privacy and dignity of participants in their own homes, and how it collects, stores, uses, discloses and disposes of personal and health information about participants, their families and workers. It contains the Privacy and Confidentiality Policy, the Consent Procedure and the Privacy Breach Response Procedure. It evidences NDIS Practice Standards Core Module outcome 1.3 (Privacy and dignity) and outcome 2.4 (Information management).

## Scope

This document applies to all personal information handled by {{ org.name }} in any form: records in {{ notes_software }} (progress notes and participant files), {{ rostering_software }} (rosters and worker details), {{ incident_software }} (incident reports), email, phone messages, paper files kept at the office at {{ org.address }} and in each home, photographs and video, and conversations. It binds every worker ({{ intake.workforce.employment_types | join(', ') }}), key personnel, contractors, students and agency staff, during and after their engagement. It covers participants in each home {{ org.name }} supports:
{% for home in intake.homes %}
- {{ home.name }}, {{ home.address }} ({{ home.participants }} participant{% if home.participants != 1 %}s{% endif %}{% if home.co_tenants %}, shared home{% endif %})
{% endfor %}

## Policy statement

Because {{ org.name }} holds health information and delivers supports that include health-related care, it treats itself as bound by the Privacy Act 1988 (Cth) and the Australian Privacy Principles (APPs) regardless of its annual turnover, and by the health records legislation of each state in which it operates.

### Privacy and dignity in the home

- A participant's bedroom is private space. Workers knock and wait for a response before entering, and enter without consent only where there is a genuine and immediate concern for safety, which is then recorded.
- Personal care, bathing, toileting, dressing and medical procedures are done in private, with doors closed, by a worker of the participant's preferred gender wherever the roster allows, and never in front of other residents or visitors.
- Participants control their own mail, phone, devices, social media, visitors and relationships. Workers do not open mail, read messages or monitor calls unless the participant asks for that support or a lawful order requires it.
- Personal information is not displayed in shared areas. Whiteboards, calendars and notices in shared homes do not show medical, behavioural, financial or other personal details. Medication charts, behaviour support plans and health plans are kept in the locked staff area or cabinet.
- Shift handover is done out of earshot of other residents and visitors. Workers do not discuss one participant in front of another, and do not discuss participants outside work.
- Workers use only {{ org.name }} systems and devices for participant records and photos. Personal phones are not used to photograph participants, and participant information is never posted to personal social media or shared through personal messaging apps.
- Surveillance or monitoring devices are not installed in any home without the written consent of every affected participant, a documented safety justification approved by the Director, and compliance with state surveillance devices law. Baby monitors, cameras or listening devices used for a participant's own health monitoring are recorded on the participant's support plan.

### Collection

{{ org.name }} collects only the information it needs to deliver safe, funded supports: identity and contact details; NDIS plan and funding information; health information including diagnoses, medications, allergies, mealtime and health plans; behaviour support plans and any restrictive practice authorisations; guardianship, administration or nominee orders; emergency contacts; cultural, language and communication needs; preferences; financial information where {{ org.name }} assists with participant money; and photographs or video only with consent. At or before collection each participant is given the Privacy Notice in accessible form explaining what is collected, why, who it may be shared with and how to access it.

### Use and disclosure

Information is used for the purpose it was collected for: planning and delivering the participant's supports, keeping them safe, claiming NDIS funding and meeting legal obligations. It is disclosed only:

- with the participant's consent (or the consent of a person lawfully authorised to give it for that decision, under the Supported Decision-Making Policy);
- to health professionals, hospitals and emergency services where needed for the participant's care or safety;
- to the NDIA, the NDIS Quality and Safeguards Commission, worker screening units, police, coroners, courts, state guardianship or safeguarding bodies and other regulators where the law requires or authorises it, including reportable incident notifications and complaint investigations;
- to a new provider at transition, with the participant's consent, so supports continue safely;
- where a permitted general situation under the Privacy Act applies, such as lessening or preventing a serious threat to the life, health or safety of any person.

Information about a participant is never disclosed to the families or supporters of other residents, to landlords or SDA providers beyond what the tenancy or dwelling arrangement lawfully requires, or to a family member the participant has asked {{ org.name }} not to inform.

### Storage, access and security

Electronic records are held in {{ notes_software }}, {{ rostering_software }} and {{ incident_software }} with individual logins, role-based access, multi-factor authentication where the platform supports it, and audit logs. Workers see only the participants they support. Access is removed on the day a worker leaves. Paper records at each home are kept in a locked cabinet in the staff area. Data hosting location for {{ notes_software }} and any overseas disclosure of personal information is [TO CONFIRM — check vendor hosting and update the Privacy Notice for APP 8]. Details of document control, IT security and record retention are in the Information Management and Records Policy.

### Access, correction and complaints

Participants may ask to see and correct their records at any time; requests are met within 30 days and refusals are given in writing with reasons. Privacy complaints are handled under the Complaints and Feedback Policy by {{ complaints_officer }}, with {{ privacy_officer }} as Privacy Officer. Anyone may also complain to the Office of the Australian Information Commissioner (oaic.gov.au) or the NDIS Quality and Safeguards Commission (1800 035 544).

## Roles and responsibilities

| Role | Responsibilities under this document |
|---|---|
| Privacy Officer — {{ privacy_officer }} | Owns this document; approves disclosures outside routine care; handles access and correction requests; leads privacy breach assessment and notification; keeps the Privacy Breach Log and Disclosure Register; keeps the Privacy Notice current. |
| Director — {{ director }} | Approves surveillance requests, overseas disclosure arrangements and notifications to the OAIC; ensures privacy obligations are met in contracts with software vendors, SDA providers and contractors. |
| Quality Lead — {{ quality_lead }} | Ensures consent records are current at each support plan review; audits records and homes for privacy practice; delivers privacy training at induction. |
| Incident Officer — {{ incident_officer }} | Records privacy breaches in {{ incident_software }} and assesses whether a breach is also a reportable incident. |
| Support workers | Follow the practices above on every shift; obtain consent before sharing information; report suspected breaches immediately; keep login details private; return keys, documents and devices on leaving. |

## Procedure

### Part A — Consent procedure

1. Identify the decision: what information, to whom, for what purpose and for how long (for example, sharing the health plan with a GP for 12 months; a photo for a family newsletter; a reference to a new provider).
2. Check who can consent. Start from the presumption that the participant can consent with support. Involve a guardian, administrator or NDIS nominee only where an order or appointment on the participant's file gives that person authority over this type of decision, and record the order details.
3. Explain, in the participant's preferred communication method and with an interpreter if needed, what will be shared, why, with whom, the benefits and risks, and that they can say no or change their mind at any time without affecting their supports.
4. Give the participant time and, if they wish, the chance to talk to a family member, friend or advocate.
5. Record the decision on the Consent Form in {{ notes_software }}: what was consented to, any limits, who gave consent and their authority, the date, how it was explained, and the worker who witnessed it. Photos, video and social media use require a separate, specific consent.
6. Act only within the consent given. If a new purpose arises, return to step 1.
7. Review all consents at each support plan review and at least every 12 months, and withdraw a consent immediately on the participant's request, recording the withdrawal.
8. Where information must be disclosed without consent (legal requirement or a serious threat to life, health or safety), the worker contacts {{ privacy_officer }} before disclosing if possible, or immediately afterwards in an emergency, and the disclosure is recorded in the Disclosure Register with the reason.

### Part B — Privacy breach response procedure

1. Any worker who becomes aware of an actual or suspected privacy breach (lost or stolen device or paper file, email sent to the wrong recipient, unauthorised access to {{ notes_software }}, a participant's information disclosed without authority, a cyber incident) reports it immediately by phone to {{ privacy_officer }} and records it in {{ incident_software }} the same day.
2. Contain the breach: recover the file, remotely wipe or lock the device, recall the email, change passwords, suspend the account, or remove the information from where it should not be.
3. {{ privacy_officer }} leads an assessment, completed as quickly as possible and within 30 days at most, of what information was involved, who is affected, whether it is likely to result in serious harm to any person, and what remedial action reduces that risk. The assessment is recorded in the Privacy Breach Log.
4. If the breach is an eligible data breach under the Notifiable Data Breaches scheme (unauthorised access, disclosure or loss of personal information that is likely to result in serious harm and that remedial action has not prevented), {{ privacy_officer }} prepares a statement to the Office of the Australian Information Commissioner and, with the Director's approval, notifies the OAIC and the affected participants or other individuals as soon as practicable, in a way each person can understand.
5. If the breach also involves abuse, neglect, exploitation or another category of reportable incident (for example, information disclosed to enable financial exploitation), {{ incident_officer }} manages it under the Incident Management Policy and the reportable incident timeframes apply.
6. Affected participants are told what happened, what {{ org.name }} has done, what they can do, and are offered support, including access to an advocate.
7. {{ privacy_officer }} identifies the cause and records corrective actions (system changes, training, disciplinary action) in the Continuous Improvement Register; the Director reviews the breach at the next governance meeting.
8. The breach record is retained for at least 7 years.

## Records kept

- Privacy Notice (current version and accessible versions)
- Consent Forms for each participant ({{ notes_software }})
- Disclosure Register (disclosures outside routine care, including those made without consent)
- Access and correction request log
- Privacy Breach Log and related entries in {{ incident_software }} and the Incident Register
- Worker confidentiality agreements and induction training records
- System access lists and access-removal records for departing workers

## Related documents

- Information Management and Records Policy (document control, retention schedule, IT security)
- Supported Decision-Making Policy and Procedure
- Person-Centred Supports Policy
- Incident Management Policy and Procedure
- Complaints and Feedback Policy and Procedure
- Human Resources Policy and Staff Separation Procedure
- Participant Rights Statement

## Legislation and standards references

- Privacy Act 1988 (Cth), the Australian Privacy Principles (Schedule 1) and the Notifiable Data Breaches scheme (Part IIIC)
- National Disability Insurance Scheme Act 2013 (Cth)
- NDIS (Provider Registration and Practice Standards) Rules 2018 — NDIS Practice Standards, Core Module outcomes 1.3 Privacy and dignity and 2.4 Information management
- NDIS Practice Standards, SIL supplementary module (registration group 0138, 2026)
- NDIS (Code of Conduct) Rules 2018 — the NDIS Code of Conduct (respect the privacy of people with disability)
- NDIS (Incident Management and Reportable Incidents) Rules 2018 and NDIS (Complaints Management and Resolution) Rules 2018 (record-keeping and disclosure to the Commission)
{% if 'NSW' in org.states %}
- Health Records and Information Privacy Act 2002 (NSW); Surveillance Devices Act 2007 (NSW)
{% endif %}
{% if 'VIC' in org.states %}
- Health Records Act 2001 (Vic); Surveillance Devices Act 1999 (Vic)
{% endif %}
{% if 'ACT' in org.states %}
- Health Records (Privacy and Access) Act 1997 (ACT)
{% endif %}
{% if 'QLD' in org.states %}
- Invasion of Privacy Act 1971 (Qld) (listening devices)
{% endif %}

## Review

Reviewed every 12 months by the Privacy Officer ({{ privacy_officer }}) and approved by the Director ({{ director }}); reviewed earlier after any privacy breach, change to the Privacy Act or APPs, or change of software platform.

## Document control

| Version | Drafted | Approved by | Approval date | Next review |
|---|---|---|---|---|
| 1.0 | {{ intake.meta.generated_on | date }} | {{ director }} | [TO CONFIRM on adoption] | 12 months after approval |
