---
title: Information Management and Records Policy (including Records Retention Schedule, Document Control and IT Security)
slug: information-management-records
doc_type: policy
standards: [core-2.4]
applies_if: "true"
version: 1.0
review_months: 12
---
{% set gov = intake.governance %}{% set wf = intake.workforce %}{% set sup = intake.supports %}
{% set director = gov.ceo_or_director | default('[TO CONFIRM]', true) %}{% set quality_lead = gov.quality_lead | default('[TO CONFIRM]', true) %}{% set privacy_officer = gov.privacy_officer | default('[TO CONFIRM]', true) %}{% set rostering_manager = gov.rostering_manager | default('[TO CONFIRM]', true) %}
{% set notes_software = wf.notes_software | default('[TO CONFIRM]', true) %}{% set rostering_software = wf.rostering_software | default('[TO CONFIRM]', true) %}{% set incident_software = wf.incident_software | default('[TO CONFIRM]', true) %}{% set training_platform = wf.training_platform | default('[TO CONFIRM]', true) %}
{% set governing_body = 'the Board' if gov.has_board else 'the Director' %}
# Information Management and Records Policy (including Records Retention Schedule, Document Control and IT Security)

## Purpose

This policy sets out how {{ org.name }} creates, stores, controls, protects, retains and disposes of the information it holds about participants, workers and its own operations, so that records are accurate, complete, available to the people who need them, and protected from loss or misuse. It evidences NDIS Practice Standards Core Module outcome 2.4 (Information management), and works with the Privacy and Confidentiality Policy, which governs consent, use and disclosure.

## Scope

This policy applies to every record {{ org.name }} holds, in any format: participant records in {{ notes_software }}, rosters and shift records in {{ rostering_software }}, incident and complaint records in {{ incident_software }}, training records in {{ training_platform }}, financial and NDIS claiming records, governance records, and paper records kept at {{ org.address }} and in each of its {{ intake.homes | length }} home{% if intake.homes | length != 1 %}s{% endif %}. It binds all workers ({{ wf.employment_types | join(', ') }}), key personnel, contractors and agency staff.

## Policy statement

- **Records are accurate, timely and attributable.** Every record states who made it and when; progress notes are written during or immediately after the shift; entries are factual, respectful and in the participant's own words where possible; corrections are made by a dated addendum, never by deleting or overwriting.
- **One system of record.** {{ notes_software }} is the system of record for participant information and {{ rostering_software }} for rosters and shift attendance. Paper records are used only where a system is unavailable or a signature is needed, and are scanned into the system within 2 business days.
- **Participants can see their records.** A participant may see and obtain a copy of their own records, ask for corrections, and choose who else may see them, under the Privacy and Confidentiality Policy. Records are written in the knowledge that the participant may read them.
- **Access is limited to need.** Workers can see only the participants and homes they support; managers' access reflects their role; access is removed on the day a person leaves.
- **Information is secure.** Electronic records are protected by the IT security controls in this policy; paper records are kept in locked storage; no participant information is kept on personal devices, personal email or messaging apps.
- **Documents are controlled.** Only the current approved version of a policy, procedure or template is in use, and it can be identified by its version and approval date.
- **Retention follows the schedule.** Records are kept for at least the periods in the Records Retention Schedule and then securely destroyed or de-identified, unless a legal hold applies.

## Roles and responsibilities

| Role | Responsibilities under this document |
|---|---|
| Director — {{ director }} | Accountable for information management; approves systems, vendors and this policy; approves destruction of records at end of retention; declares legal holds. |
| Privacy Officer — {{ privacy_officer }} | Owns this policy; manages access requests and corrections; leads privacy breach response; approves user access levels; reviews access logs quarterly. |
| Quality Lead — {{ quality_lead }} | Maintains the Policy Register and document control; audits record quality; keeps the Records Retention Schedule current. |
| Rostering Manager — {{ rostering_manager }} | Administers user accounts in {{ rostering_software }} and {{ notes_software }}; ensures same-day removal of access for departing workers; checks that shift records match claims. |
| House leaders | Keep paper records in each home secure; ensure whiteboards and notices show no personal information; supervise note quality. |
| All workers | Record accurately and on time; use only approved systems; protect passwords and devices; report lost devices, suspicious emails or breaches immediately. |

## Document control procedure

1. Every policy, procedure, register and template carries a title, version number, owner, approval date and next review date in its document control table and is listed in the Policy Register.
2. Drafts are marked as drafts. A document becomes controlled only when approved under the Governance and Operational Management Framework.
3. The current version is published in one location (the policy folder in {{ incident_software }} or the shared drive) and superseded versions are moved to an archive folder with the date of supersession; printed copies are marked uncontrolled.
4. {{ quality_lead }} briefs affected workers on changes within 30 days and records the briefing in {{ training_platform }}.
5. Forms and templates in use in homes are checked at the monthly house self-check to confirm they are the current version.

## Policy Register template

| Document | Slug | Owner | Version | Approved by | Approval date | Next review | Location |
|---|---|---|---|---|---|---|---|
| Incident Management Policy and Procedure (example — delete) | incident-management | {{ gov.incident_officer | default('[TO CONFIRM]', true) }} | 1.0 | {{ director }} | [date] | [date + 12 months] | Policy folder |

## IT security controls

- **Accounts.** Each user has an individual login to {{ notes_software }}, {{ rostering_software }} and {{ incident_software }}; shared logins are prohibited; multi-factor authentication is switched on wherever the platform supports it; passwords are unique, at least 12 characters, and stored only in an approved password manager.
- **Access control.** Role-based access is set by {{ privacy_officer }}; new accounts are created only after worker screening is verified; access is removed on the day a worker leaves or is stood down, and {{ rostering_manager }} confirms this on the separation checklist.
- **Devices.** Organisation-owned phones, tablets and computers are encrypted, locked with a passcode, kept updated, and can be remotely wiped; workers may use personal devices for {{ notes_software }} only through the vendor's app with a passcode, without downloading records, and must report loss or theft immediately.
- **Email and messaging.** Participant information is not sent by SMS or consumer messaging apps; email attachments containing personal information are sent only to verified addresses, and health or financial details are password-protected or sent through the system.
- **Hosting and backups.** {{ notes_software }}, {{ rostering_software }} and {{ incident_software }} are cloud-hosted by their vendors; data location, backup frequency, export rights on termination and the vendor's security certifications are [TO CONFIRM and record in the Vendor Register]. Local files are backed up at least weekly to an encrypted location, and restore is tested annually.
- **Threat awareness.** Workers complete cyber safety training at induction and annually covering phishing, safe passwords and device care; suspicious messages are reported to {{ privacy_officer }}.
- **Incidents.** Lost devices, unauthorised access, ransomware or misdirected information are handled under the Privacy Breach Response Procedure in the Privacy and Confidentiality Policy, including assessment under the Notifiable Data Breaches scheme.
- **Guidance.** Controls are reviewed annually against the Australian Cyber Security Centre's Essential Eight as a benchmark for a small organisation.

## Records Retention Schedule

| Record type | Minimum retention | Basis |
|---|---|---|
| Participant records: support plans, assessments, progress notes, service agreements, consents, health plans{% if sup.medication_involvement != 'none' %}, medication charts{% endif %}{% if sup.mealtime_management %}, mealtime plans{% endif %} | 7 years after the last service; where the participant was under 18, until they turn 25; where a record relates to an allegation of child abuse, 45 years | NDIS Practice Standards record-keeping; Royal Commission into Institutional Responses to Child Sexual Abuse recommendation on records |
| Incident records, including reportable incident notifications and investigations | 7 years from the day the record is made | NDIS (Incident Management and Reportable Incidents) Rules 2018 |
| Complaints records | 7 years from the day the record is made | NDIS (Complaints Management and Resolution) Rules 2018 |
| Restrictive practice records: behaviour support plans, authorisations, usage records, monthly reports | 7 years | NDIS (Restrictive Practices and Behaviour Support) Rules 2018; Practice Standards |
| Worker screening and risk assessed role records | 7 years | NDIS (Practice Standards—Worker Screening) Rules 2018 |
| Employee records: pay, hours, leave, superannuation, engagement | 7 years after the record is made | Fair Work Act 2009 (Cth) section 535 and Fair Work Regulations 2009 |
| Training, competency, supervision and performance records | Duration of engagement plus 7 years | Practice Standards workforce outcomes |
| Recruitment records of unsuccessful applicants | 12 months | {{ org.name }} policy |
| WHS notifiable incident records | 5 years | Work health and safety legislation of {{ org.states | join(' and ') }} |
| Financial records, NDIS claims and the roster and shift evidence supporting claims | 7 years | Corporations Act 2001 (Cth) section 286; taxation law; NDIS Pricing Arrangements record-keeping |
| Governance records: constitution, minutes, registers, Commission correspondence | Permanent (minutes and constitution); 7 years after closure for registers | {{ org.name }} policy |
| Superseded policies and procedures | 7 years after supersession | {{ org.name }} policy |
| Conflict of interest, tenancy and housing disclosures | 7 years after the arrangement ends | {{ org.name }} policy |
| Emergency plans, drill and inspection records | 7 years | {{ org.name }} policy |
| Privacy breach records and access request records | 7 years | Privacy Act 1988 (Cth) |

At the end of the retention period {{ privacy_officer }} lists records due for destruction, {{ director }} approves, and records are shredded or securely deleted with a destruction certificate kept. Records subject to a complaint, investigation, litigation or Commission request are placed on legal hold and are not destroyed until {{ director }} lifts the hold.

## Records kept

- Policy Register and document archive
- User access register and quarterly access-log reviews
- Vendor Register (hosting, backup, security certification, export rights)
- Cyber safety training records in {{ training_platform }}
- Destruction certificates and legal hold records
- Access, correction and privacy breach records (Privacy and Confidentiality Policy)

## Related documents

- Privacy and Confidentiality Policy, Consent Procedure and Privacy Breach Response Procedure
- Governance and Operational Management Framework
- Shift Handover and Progress Notes Procedure
- Human Resources and Recruitment Policy and Procedure (separation checklist)
- Financial Management, NDIS Billing and Claiming, and Fraud and Corruption Prevention Policy
- Continuity of Supports Policy (IT outage)

## Legislation and standards references

- National Disability Insurance Scheme Act 2013 (Cth)
- NDIS (Provider Registration and Practice Standards) Rules 2018 — NDIS Practice Standards, Core Module outcome 2.4 Information management
- NDIS Practice Standards, SIL supplementary module (registration group 0138, 2026)
- NDIS (Incident Management and Reportable Incidents) Rules 2018; NDIS (Complaints Management and Resolution) Rules 2018; NDIS (Practice Standards—Worker Screening) Rules 2018; NDIS (Restrictive Practices and Behaviour Support) Rules 2018 (record-keeping)
- Privacy Act 1988 (Cth), the Australian Privacy Principles (in particular APP 11 security, APP 12 access and APP 13 correction) and the Notifiable Data Breaches scheme
- Fair Work Act 2009 (Cth), section 535; Fair Work Regulations 2009 (Cth)
{% if org.entity_type == 'company' %}
- Corporations Act 2001 (Cth), section 286 (financial records)
{% endif %}
{% if 'NSW' in org.states %}
- Health Records and Information Privacy Act 2002 (NSW); Work Health and Safety Act 2011 (NSW)
{% endif %}
{% if 'VIC' in org.states %}
- Health Records Act 2001 (Vic); Occupational Health and Safety Act 2004 (Vic)
{% endif %}
{% if 'ACT' in org.states %}
- Health Records (Privacy and Access) Act 1997 (ACT); Work Health and Safety Act 2011 (ACT)
{% endif %}
{% if 'QLD' in org.states %}
- Work Health and Safety Act 2011 (Qld)
{% endif %}
{% if 'SA' in org.states %}
- Work Health and Safety Act 2012 (SA)
{% endif %}
{% if 'WA' in org.states %}
- Work Health and Safety Act 2020 (WA)
{% endif %}
{% if 'TAS' in org.states %}
- Work Health and Safety Act 2012 (Tas)
{% endif %}
{% if 'NT' in org.states %}
- Work Health and Safety (National Uniform Legislation) Act 2011 (NT)
{% endif %}

## Review

Reviewed every 12 months by the Privacy Officer ({{ privacy_officer }}) and approved by {{ governing_body }}; reviewed earlier after any privacy breach, change of software vendor, or change to retention requirements.

## Document control

| Version | Drafted | Approved by | Approval date | Next review |
|---|---|---|---|---|
| 1.0 | {{ intake.meta.generated_on | date }} | {{ director }} | [TO CONFIRM on adoption] | 12 months after approval |
