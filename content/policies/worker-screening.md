---
title: Worker Screening Policy and Procedure
slug: worker-screening
doc_type: policy
standards: [core-2.6, sil-3]
applies_if: "true"
version: 1.0
review_months: 12
---
{% set gov = intake.governance %}{% set wf = intake.workforce %}
{% set director = gov.ceo_or_director | default('[TO CONFIRM]', true) %}{% set quality_lead = gov.quality_lead | default('[TO CONFIRM]', true) %}{% set rostering_manager = gov.rostering_manager | default('[TO CONFIRM]', true) %}{% set incident_officer = gov.incident_officer | default('[TO CONFIRM]', true) %}
{% set rostering_software = wf.rostering_software | default('[TO CONFIRM]', true) %}
{% set screening_unit = {
'NSW': "NDIS Worker Check (NDISWC), administered by the NSW Office of the Children's Guardian and applied for through Service NSW",
'VIC': "NDIS Worker Screening Check, administered by the Victorian Worker Screening Unit",
'QLD': "NDIS worker screening clearance, administered by the Queensland Government disability worker screening unit",
'WA': "NDIS Worker Screening Check, administered by the NDIS Worker Screening Unit in the WA Department of Communities",
'SA': "NDIS Worker Check, administered by the SA Department of Human Services Screening Unit",
'TAS': "Registration to Work with Vulnerable People with NDIS endorsement, administered by Consumer, Building and Occupational Services (CBOS)",
'ACT': "Working with Vulnerable People registration with NDIS worker screening, administered by Access Canberra",
'NT': "NDIS Worker Screening Clearance, administered by SAFE NT (the NT worker screening unit)"
} %}
# Worker Screening Policy and Procedure

## Purpose

This policy sets out how {{ org.name }} meets its obligations under the NDIS (Practice Standards—Worker Screening) Rules 2018 so that no person works in a risk assessed role in any of its {{ intake.homes | length }} SIL home{% if intake.homes | length != 1 %}s{% endif %} without a current NDIS Worker Screening clearance, and so that clearances are verified, monitored and acted on for the whole time a worker is engaged.

## Scope

This policy applies to all key personnel of {{ org.name }} and to every employee, casual, contractor, agency worker, student and volunteer whose role is a risk assessed role. It applies in every state in which {{ org.name }} operates ({{ org.states | join(', ') }}). It does not replace the state or territory worker screening law, which continues to apply to the individual worker.

## Policy statement

- {{ org.name }} identifies every risk assessed role in the organisation and records it in the Worker Screening Register. A risk assessed role is: a key personnel role; a role whose normal duties include the direct delivery of specified supports or services to a person with disability; or a role whose normal duties are likely to require more than incidental contact with a person with disability. All SIL support worker, house leader, coordinator and rostering roles at {{ org.name }} are risk assessed roles.
- No worker starts in a risk assessed role until {{ rostering_manager }} has verified a current NDIS Worker Screening clearance in the NDIS Worker Screening Database and linked the worker to {{ org.name }}.
- {{ org.name }} does not rely on a police check, a Working with Children Check alone, or a clearance that cannot be verified in the NDIS Worker Screening Database.
- A worker whose application is pending may only commence in a risk assessed role where the worker screening law of the relevant state or territory permits this and the conditions in the Worker Screening Rules are met, including that {{ org.name }} has assessed and documented the risk, the worker is supervised as required, and the arrangement ends immediately if the application is withdrawn, refused or an interim bar is imposed.
- A worker who is subject to an interim bar, exclusion, suspension or cancellation is removed from all risk assessed roles immediately on notification and does not return until a valid clearance is confirmed.
- {{ org.name }} checks clearance expiry monthly and requires renewal applications to be lodged at least 3 months before expiry. Clearances are valid for 5 years.
- Agency and contractor workers are held to the identical standard and are recorded in the same register.
- Records showing which roles are risk assessed, and the screening records of each worker, are kept for at least 7 years.
{% if wf.screening_all_current %}- At the date of this policy, {{ org.name }} confirms that all current workers in risk assessed roles hold a verified clearance.{% else %}- At the date of this policy, not every current worker has a verified clearance. {{ rostering_manager }} maintains a remediation list; any worker without a verifiable clearance is rostered only in accordance with the pending-application conditions above or is stood down from risk assessed duties until cleared. [TO CONFIRM remediation status before lodgement]{% endif %}

## Roles and responsibilities

| Role | Responsibilities |
|---|---|
| {{ director }} | Holds a clearance as key personnel; approves any pending-application commencement; ensures the NDIS Commission is notified of relevant changes to key personnel; is the escalation point for exclusions. |
| {{ quality_lead }} | Owns this policy; audits the Worker Screening Register quarterly against {{ rostering_software }}; reports screening compliance to {{ director }}. |
| {{ rostering_manager }} | Verifies and links clearances in the NDIS Worker Screening Database; maintains the Worker Screening Register; runs the monthly expiry check; blocks rostering in {{ rostering_software }} for any worker without a current clearance. |
| {{ incident_officer }} | Notifies the worker screening unit and the NDIS Commission where an incident involving a worker meets a notification threshold; reports to the Commission where required. |
| House leaders | Confirm that only rostered, cleared workers are on shift; escalate any unrostered worker immediately. |
| All workers | Apply for, maintain and renew their clearance; disclose within 24 hours any charge, conviction, disciplinary finding, interim bar or exclusion. |

## Procedure

### Part A — Identifying risk assessed roles

1. {{ quality_lead }} lists every role at {{ org.name }} in the Worker Screening Register and records whether it is a risk assessed role and why.
2. When a new role is created or an existing role changes, {{ quality_lead }} reassesses it before it is filled.
3. Any person in a role that is not risk assessed who is asked to perform work that would make it risk assessed (for example an administrative worker covering a shift) is not permitted to do so unless they hold a verified clearance.

### Part B — Verification before commencement

1. The candidate provides their clearance number or application number. In {{ org.states | join(' and ') }} the check is known as: {% for state in org.states %}{{ state }} — {{ screening_unit[state | upper] | default('[TO CONFIRM screening body for ' ~ state ~ ']') }}{% if not loop.last %}; {% endif %}{% endfor %}.
2. {{ rostering_manager }} logs into the NDIS Worker Screening Database (NDIS Commission Portal), searches for the worker, confirms the identity details match the worker's 100 points of identification, confirms the clearance status is "cleared" and the expiry date, and submits a request to link the worker to {{ org.name }}.
3. The verification date, clearance number, expiry and the name of the person who verified it are recorded in the Worker Screening Register and in the worker's profile in {{ rostering_software }}. A screenshot or PDF of the database result is saved to the personnel file.
4. Where the clearance cannot be verified, the worker is not rostered. {{ rostering_manager }} tells the worker in writing what is needed.
5. For agency workers, the agency's written confirmation is not sufficient on its own: {{ rostering_manager }} verifies the worker directly in the NDIS Worker Screening Database before the first shift.

### Part C — Workers with a pending application

1. A pending-application commencement is only considered where the state or territory law permits it and where {{ org.name }} has a genuine workforce need that cannot be met by cleared workers.
2. {{ rostering_manager }} confirms in the NDIS Worker Screening Database that a valid application has been lodged and is in progress, and records the application number.
3. {{ director }} approves the arrangement in writing after a documented risk assessment covering: the participants the worker will support, whether the worker will ever be the only worker on shift, overnight and personal care duties, and the supervision to be provided by a cleared worker.
4. The worker is rostered only in {{ rostering_software }} shifts flagged "pending clearance — supervised", never as the sole worker on a sleepover, active night or lone shift, and never for a participant whose plan identifies elevated safeguarding risk.
5. {{ rostering_manager }} checks the application status weekly. If the application is withdrawn, refused, or an interim bar is imposed, the worker is removed from all shifts immediately.
6. The arrangement ends when the clearance is granted (the worker is then linked in the normal way) or when the application is finalised without a clearance.

### Part D — Ongoing monitoring, expiry and renewal

1. On the first working day of each month {{ rostering_manager }} runs the expiry report from {{ rostering_software }} and reconciles it with the Worker Screening Register and the NDIS Worker Screening Database.
2. Workers with a clearance expiring within 3 months are notified in writing and must provide their renewal application number within 14 days.
3. A worker whose clearance expires without a renewal in progress is removed from the roster on the expiry date.
4. {{ rostering_manager }} checks the NDIS Worker Screening Database notifications at least weekly for any change of status affecting linked workers.

### Part E — Interim bars, exclusions and notifications

1. On receiving a notification of an interim bar, suspension, cancellation or exclusion for any linked worker, {{ rostering_manager }} immediately: removes the worker from all shifts in {{ rostering_software }}; arranges cover; tells the worker in writing; and informs {{ director }} and {{ quality_lead }}.
2. {{ director }} determines whether the worker can lawfully be given non-risk assessed duties. In most cases at {{ org.name }} there are no such duties and the worker is stood down.
3. Where {{ org.name }} becomes aware of conduct by a worker that may be relevant to their suitability (an allegation of abuse, neglect, violence, sexual misconduct, theft or serious breach of the NDIS Code of Conduct), {{ incident_officer }} manages the matter under the Incident Management Policy, notifies the NDIS Commission of any reportable incident within the required timeframe, and {{ director }} notifies the relevant worker screening unit as required by that state or territory's screening law.
4. An excluded person is never re-engaged in a risk assessed role. The register records the exclusion and the date.

### Part F — Separation

1. When a worker leaves, {{ rostering_manager }} delinks the worker in the NDIS Worker Screening Database within 5 business days and records the separation date in the Worker Screening Register.

## Templates

### Worker screening register template

| Worker name | Role | Risk assessed role (Y/N) | Employment type | State of clearance | Clearance or application number | Status (cleared / pending / interim bar / excluded) | Verified in NWSD on | Verified by | Linked to provider (Y/N) | Expiry date | Renewal lodged | Working with Children Check (if required) and expiry | Separation date / delinked |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| A. Example (example — delete) | Support worker | Y | Casual | {{ org.states[0] | default('NSW') }} | WSC-000000 | Cleared | 01/07/2026 | {{ rostering_manager }} | Y | 30/06/2031 | n/a | n/a | |

### Risk assessed roles schedule

| Role | Risk assessed (Y/N) | Reason | Assessed by | Date |
|---|---|---|---|---|
| {{ director }} | Y | Key personnel | {{ quality_lead }} | [TO CONFIRM] |
| Support worker (all homes) | Y | Direct delivery of SIL supports | {{ quality_lead }} | [TO CONFIRM] |
| Bookkeeper (no participant contact) (example — delete) | N | No more than incidental contact | {{ quality_lead }} | [TO CONFIRM] |

## Records kept

- Worker Screening Register (this document) — live, reviewed monthly.
- NDIS Worker Screening Database verification records (screenshots or PDF) on each personnel file.
- Pending-application risk assessments and {{ director }}'s written approvals.
- Notifications received from screening units and the NDIS Worker Screening Database, and the actions taken.
- Monthly expiry reports from {{ rostering_software }} and reconciliation notes.
- All records are kept for at least 7 years.

## Related documents

- human-resources-recruitment
- induction-training-competency
- incident-management
- safeguarding
- grievance-disciplinary
- practice-governance-workforce-consistency

## Legislation and standards references

- National Disability Insurance Scheme Act 2013 (Cth)
- NDIS (Practice Standards—Worker Screening) Rules 2018
- NDIS (Provider Registration and Practice Standards) Rules 2018 — Core Module outcome 2.6; SIL supplementary module outcome 3
- NDIS (Incident Management and Reportable Incidents) Rules 2018
- NDIS Code of Conduct
- Privacy Act 1988 (Cth) and the Australian Privacy Principles
{% for state in org.states %}- Worker screening law of {{ state }}: {{ screening_unit[state | upper] | default('[TO CONFIRM]') }}
{% endfor %}

## Review

This policy is reviewed every 12 months, immediately after any change to the Worker Screening Rules or a state screening scheme, and after any incident in which an unscreened person performed a risk assessed role. Review owner: {{ quality_lead }}. Approval: {{ director }}.

## Document control

| Version | Approved by | Approval date | Next review |
|---|---|---|---|
| 1.0 | {{ director }} | [TO CONFIRM] | [TO CONFIRM — 12 months after approval] |
