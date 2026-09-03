---
title: Governance and Operational Management Framework
slug: governance-framework
doc_type: policy
standards: [core-2.1, sil-3]
applies_if: "true"
version: 1.0
review_months: 12
---
{% set gov = intake.governance %}{% set wf = intake.workforce %}{% set sup = intake.supports %}{% set reg = intake.registration %}
{% set director = gov.ceo_or_director | default('[TO CONFIRM]', true) %}{% set quality_lead = gov.quality_lead | default('[TO CONFIRM]', true) %}{% set complaints_officer = gov.complaints_officer | default('[TO CONFIRM]', true) %}{% set incident_officer = gov.incident_officer | default('[TO CONFIRM]', true) %}{% set privacy_officer = gov.privacy_officer | default('[TO CONFIRM]', true) %}{% set whs_officer = gov.whs_officer | default('[TO CONFIRM]', true) %}{% set rostering_manager = gov.rostering_manager | default('[TO CONFIRM]', true) %}
{% set rostering_software = wf.rostering_software | default('[TO CONFIRM]', true) %}{% set incident_software = wf.incident_software | default('[TO CONFIRM]', true) %}
{% set governing_body = 'the Board' if gov.has_board else 'the Director' %}
# Governance and Operational Management Framework

## Purpose

This framework describes how {{ org.name }} is governed and managed so that it delivers safe, quality Supported Independent Living (SIL) supports, complies with its conditions of NDIS registration, and can show an auditor who decides what, who is accountable, and how compliance is overseen. It evidences NDIS Practice Standards Core Module outcome 2.1 (Governance and operational management) and the SIL supplementary module practice governance outcome, and is the parent document for every other {{ org.name }} policy.

## Scope

This framework applies to {{ governing_body }}, all key personnel, managers, house leaders and workers of {{ org.name }} ({{ org.entity_type | replace('_', ' ') }}, ABN {{ org.abn | default('[TO CONFIRM]', true) }}), operating in {{ org.states | join(', ') }} across {{ intake.homes | length }} SIL home{% if intake.homes | length != 1 %}s{% endif %} with approximately {{ wf.headcount | default('[TO CONFIRM]', true) }} workers. {{ org.name }} {% if reg.application_started %}has started{% else %}is preparing{% endif %} its application for NDIS registration in groups {{ reg.groups | join(', ') }}, with a target lodgement date of {{ reg.target_lodgement_date | date }} and an Approved Quality Auditor of {{ reg.auditor_chosen | default('[TO CONFIRM]', true) }}.

## Policy statement

- **Accountability is clear.** {{ governing_body }} is accountable for {{ org.name }}'s compliance, finances, quality and safety. Every operational responsibility is delegated in writing to a named role, and every delegate reports back through the meeting cadence in this framework.
- **Participants come first.** Governance decisions are tested against their effect on participants' rights, safety, choice and control, and participants' feedback is a standing item at every governance meeting.
- **Key personnel are suitable and known.** {{ org.name }} maintains a current list of its key personnel, verifies their suitability before appointment and annually, and tells the NDIS Quality and Safeguards Commission when they change.
- **Policies are controlled.** Every policy is approved by {{ governing_body }}, has a named owner and a review date, is available to workers, and is reviewed after any incident, complaint, audit finding or legal change that shows it is not working.
- **Compliance is monitored, not assumed.** Conditions of registration, the NDIS Practice Standards, the NDIS Code of Conduct and the legal obligations in each policy are tracked on a compliance calendar and reported monthly.
- **Risk and conflicts are managed.** The Risk Management Policy and Framework and the Conflicts of Interest Policy, Procedure and Register form part of this framework.
- **Practice is governed across homes.** The Practice Governance and Workforce Consistency Policy sets how practice is led in every home so participants receive consistent support whoever is on shift.

## Roles and responsibilities

| Role | Responsibilities under this framework |
|---|---|
| {{ governing_body }}{% if gov.has_board %} (chaired by [TO CONFIRM]){% endif %} | Sets strategy and risk appetite; approves the budget, policies and delegations; appoints and reviews the Director; receives compliance, quality and safety reports; ensures key personnel remain suitable. |
| Director — {{ director }} | Chief executive and accountable officer; holds all delegations not assigned elsewhere; signs Commission applications, notifications and declarations; approves reportable incident notifications; chairs the monthly management and compliance meeting. |
| Quality Lead — {{ quality_lead }} | Owns this framework and the Policy Register; runs the internal audit program and quality meeting; maintains the compliance calendar and Continuous Improvement Register; coordinates the registration audit. |
| Rostering Manager — {{ rostering_manager }} | Operational management of homes and rosters in {{ rostering_software }}; supervises house leaders; reports workforce and continuity metrics. |
| Incident Officer — {{ incident_officer }}; Complaints Officer — {{ complaints_officer }}; Privacy Officer — {{ privacy_officer }}; WHS Officer — {{ whs_officer }} | Each owns the named policy, keeps its register, and reports monthly. |
| House leaders | Lead practice in one home; hold house meetings; escalate risks, incidents and complaints; implement decisions. |
| All workers | Follow policies; complete training; report incidents, complaints, hazards and conflicts of interest. |

## Governance arrangements

### Legal entity and governing body

{% if org.entity_type == 'company' %}{{ org.name }} is a company registered under the Corporations Act 2001 (Cth). {% if gov.has_board %}Its Board of directors is the governing body and meets at least quarterly.{% else %}It does not have a separate board; the Director, {{ director }}, is the governing body and holds the duties of a company director, including the duties of care and diligence and good faith.{% endif %}{% elif org.entity_type == 'incorporated_association' %}{{ org.name }} is an incorporated association governed by its constitution and the associations incorporation legislation of {{ org.states[0] | default('[TO CONFIRM]', true) }}. Its management committee is the governing body and meets at least quarterly.{% elif org.entity_type == 'sole_trader' %}{{ org.name }} is operated by a sole trader, {{ director }}, who is the governing body and is personally responsible for every obligation in this framework.{% elif org.entity_type == 'partnership' %}{{ org.name }} is a partnership; the partners jointly form the governing body and meet at least quarterly.{% else %}{{ org.name }}'s legal structure is {{ gov.structure | default('[TO CONFIRM]', true) }}; its governing body is [TO CONFIRM].{% endif %} {% if org.entity_type in ['sole_trader', 'partnership'] or not gov.has_board %}Because there is no independent board, {{ org.name }} obtains independent challenge through its external accountant, the Approved Quality Auditor, participant feedback and an annual external review of this framework.{% endif %}

### Key personnel

Key personnel are the people with authority over {{ org.name }}'s management, and over the delivery of its supports, within the meaning of section 11A of the NDIS Act 2013. {{ org.name }}'s key personnel are:

| Name | Role | Contact | Suitability checks held |
|---|---|---|---|
{% for kp in intake.key_personnel %}
| {{ kp.name | default('[TO CONFIRM]', true) }} | {{ kp.role | default('[TO CONFIRM]', true) }} | {{ kp.email | default('[TO CONFIRM]', true) }}; {{ kp.phone | default('[TO CONFIRM]', true) }} | NDIS Worker Screening clearance; annual suitability declaration; [TO CONFIRM dates] |
{% else %}
| [TO CONFIRM] | [TO CONFIRM] | [TO CONFIRM] | [TO CONFIRM] |
{% endfor %}

### Key personnel suitability

1. Before a person is appointed to a key personnel role, and every 12 months after, {{ director }} (or {{ governing_body }} for the Director) obtains a signed suitability declaration covering the matters the Commissioner considers when deciding whether a provider and its key personnel are suitable: criminal history, bankruptcy or insolvency involvement, banning orders, disqualification from managing corporations, adverse findings by a regulator or professional body, and previous refusal, suspension or revocation of NDIS or other registration.
2. Every key personnel role is a risk assessed role under the NDIS (Practice Standards—Worker Screening) Rules 2018; each holds a current NDIS Worker Screening clearance recorded in the Worker Screening Register.
3. Key personnel declare conflicts of interest on appointment and annually under the Conflicts of Interest Policy.
4. Any change in a key personnel member's suitability is reported to {{ director }} immediately and to the Commission as set out below.

### Delegations of authority

| Decision or authority | Held by | Conditions and limits | Reported to |
|---|---|---|---|
| Approve, amend or withdraw policies and procedures | {{ governing_body }} | After review by {{ quality_lead }}; recorded in the Policy Register | Quarterly quality meeting |
| Accept or decline a referral; sign SIL Service Agreements | {{ director }} | Access and Intake Procedure; declined referrals recorded with reasons | Monthly management meeting |
| Enter, vary or end any lease, head-tenancy or SDA arrangement | {{ director }} | Conflicts of Interest Policy; never linked to a participant's choice of provider | {{ governing_body }} |
| Approve rosters, agency use and roster changes | {{ rostering_manager }} | Within budget and the Practice Governance Policy; overnight model changes approved by {{ director }} | Monthly management meeting |
| Financial approvals and payments | As set out in the Financial Management Policy delegations table | Two-person control for NDIS claims and new payees | Monthly management meeting |
| Engage, stand down or dismiss workers | {{ director }} | Worker screening verified before engagement; Grievance and Disciplinary Policy | Monthly management meeting |
| Approve reportable incident notifications | {{ director }} (Reportable Incident Approver); {{ incident_officer }} lodges as Notifier | Within 24 hours or 5 business days per the Incident Management Policy | {{ governing_body }} |
| Escalated complaints and Commission complaints | {{ director }} | Complaints and Feedback Policy | Quarterly quality meeting |
| Restrictive practice use in accordance with a behaviour support plan | {{ director }} with {{ quality_lead }} | Only with state authorisation and a lodged plan; monthly reporting to the Commission | Monthly management meeting |
| Notify the Commission of changes and events; sign applications | {{ director }} | This framework | {{ governing_body }} |
| Declare an emergency; activate the Continuity of Supports Policy | {{ director }}; in their absence {{ whs_officer }} | Emergency and Disaster Management Plan | {{ governing_body }} |
| Notify eligible data breaches to the OAIC | {{ privacy_officer }} with {{ director }} | Privacy and Confidentiality Policy | Monthly management meeting |
| Media and public statements | {{ director }} only | Participant privacy protected | {{ governing_body }} |

Delegations may be exercised only by the named role or by a person {{ director }} appoints in writing to act during leave. Records of acting appointments are kept in the Policy Register.

### Policy approval and review

1. {{ quality_lead }} drafts or reviews the policy, consulting workers, participants and any relevant specialist, and checks it against the current Practice Standards, Rules and legislation.
2. {{ governing_body }} approves the policy; the version, approver and approval date are recorded in the document control table and the Policy Register.
3. The policy is published to workers through {{ incident_software }} or the shared drive, superseded versions are archived, and affected workers are briefed within 30 days.
4. Each policy is reviewed by its owner at the interval in its front matter (12 months unless stated), and earlier after a serious incident, complaint, audit finding, legal change or change to a home, roster model or support type.

### Meeting cadence

| Meeting | Frequency | Chair | Standing agenda | Record |
|---|---|---|---|---|
{% if gov.has_board %}
| Board meeting | Quarterly | Chair of the Board | Strategy, finance, risk register, compliance report, key personnel, policy approvals | Minutes |
{% endif %}
| Management and compliance meeting | Monthly | {{ director }} | Incidents and reportable incidents, complaints, restrictive practices, risk register, WHS, workforce and screening, finance and claims, Commission correspondence, compliance calendar | Minutes and action log |
| Quality and safety review | Quarterly | {{ quality_lead }} | Internal audit results, trends, Continuous Improvement Register, policy reviews, participant and worker feedback | Minutes |
| All-staff meeting | Monthly | {{ rostering_manager }} | Practice updates from each home, training, policy briefings | Minutes |
| House meeting (each home) | Fortnightly; weekly where a home has 3 or more participants or an active behaviour support plan | House leader | Participants' decisions and feedback, plans, health, incidents, hazards, roster | House Meeting Record |

### Compliance oversight

- {{ quality_lead }} keeps a compliance calendar listing every recurring obligation: worker screening expiries, training renewals, insurance renewals, monthly restrictive practice reporting, NDIS pricing updates on 1 July, policy reviews, the mid-term audit and registration renewal, and state WHS and tenancy requirements.
- The monthly compliance report to {{ director }} covers incidents ({{ intake.history.incidents_last_12m | default('[TO CONFIRM]', true) }} recorded in the last 12 months), reportable incidents ({{ intake.history.reportable_incidents_last_12m | default('[TO CONFIRM]', true) }}), complaints ({{ intake.history.complaints_last_12m | default('[TO CONFIRM]', true) }}), worker screening currency ({% if wf.screening_all_current %}all current at the date of this framework{% else %}gaps identified and being closed{% endif %}), training currency, roster consistency, financial position and any breach of a condition of registration.
- {{ director }} certifies compliance to {{ governing_body }} quarterly, and {{ org.name }} completes a full self-assessment against the Core Module and SIL supplementary module annually and before every audit.

### Notifying the NDIS Commission of changes

{{ org.name }}'s registration is subject to conditions in the NDIS (Provider Registration and Practice Standards) Rules 2018, including the condition to notify the Commissioner of certain changes and events. {{ director }} notifies the Commission, using the Commission's notification form, as soon as practicable after any of the following and within any timeframe the Commission specifies:

| Change or event | Action |
|---|---|
| A person becomes or ceases to be key personnel, or a key personnel member's suitability changes | Notify; update the key personnel table and Worker Screening Register |
| Change of legal name, trading name, ABN, address, contact details or legal structure | Notify and update all participant-facing documents |
| Change in scope: a new registration group, class of supports or state, or opening a new home | Apply to vary registration before delivering the new supports; new homes are notified and added to this framework |
| An event affecting the ability to deliver supports: insolvency or external administration, loss of insurance, loss of a home, serious workforce shortage | Notify; activate the Continuity of Supports Policy |
| Decision to cease providing SIL supports or to close | Notify as early as possible with a transition plan for every participant |

## Records kept

- Key personnel list, suitability declarations and Worker Screening Register entries
- Policy Register (every policy, owner, version, approval, next review) and archived versions
- Delegations and acting appointments
- Minutes and action logs of all governance meetings
- Compliance calendar and monthly compliance reports; quarterly certifications
- Commission applications, notifications and correspondence
- Annual self-assessment against the Core Module and SIL supplementary module

## Related documents

- Risk Management Policy and Framework
- Conflicts of Interest Policy, Procedure and Register
- Quality and Continuous Improvement Policy
- Information Management and Records Policy (document control)
- Financial Management, NDIS Billing and Claiming, and Fraud and Corruption Prevention Policy
- Practice Governance and Workforce Consistency Policy
- Worker Screening Policy and Procedure
- Continuity of Supports Policy
- Emergency and Disaster Management Plan

## Legislation and standards references

- National Disability Insurance Scheme Act 2013 (Cth), including section 11A (key personnel) and Chapter 4 Part 3A (registration of NDIS providers and conditions of registration)
- NDIS (Provider Registration and Practice Standards) Rules 2018 — conditions of registration, including the condition to notify the Commissioner of certain changes and events; NDIS Practice Standards, Core Module outcome 2.1
- NDIS Practice Standards, SIL supplementary module (registration group 0138, 2026), practice governance outcome
- NDIS (Practice Standards—Worker Screening) Rules 2018 (key personnel as risk assessed roles)
- NDIS (Code of Conduct) Rules 2018 — the NDIS Code of Conduct
- NDIS (Quality Indicators) Guidelines 2018
{% if org.entity_type == 'company' %}
- Corporations Act 2001 (Cth), including directors' duties in sections 180 to 184
{% endif %}
{% if org.entity_type == 'incorporated_association' %}
{% if 'NSW' in org.states %}- Associations Incorporation Act 2009 (NSW)
{% endif %}{% if 'VIC' in org.states %}- Associations Incorporation Reform Act 2012 (Vic)
{% endif %}{% if 'QLD' in org.states %}- Associations Incorporation Act 1981 (Qld)
{% endif %}{% if 'SA' in org.states %}- Associations Incorporation Act 1985 (SA)
{% endif %}{% if 'WA' in org.states %}- Associations Incorporation Act 2015 (WA)
{% endif %}{% if 'TAS' in org.states %}- Associations Incorporation Act 1964 (Tas)
{% endif %}{% if 'ACT' in org.states %}- Associations Incorporation Act 1991 (ACT)
{% endif %}{% if 'NT' in org.states %}- Associations Act 2003 (NT)
{% endif %}
{% endif %}
- Australian Charities and Not-for-profits Commission Act 2012 (Cth) governance standards, if {{ org.name }} is a registered charity

## Review

Reviewed every 12 months by the Quality Lead ({{ quality_lead }}) and approved by {{ governing_body }}; reviewed earlier when key personnel, legal structure, registration scope or the number of homes changes, or after any Commission compliance action.

## Document control

| Version | Drafted | Approved by | Approval date | Next review |
|---|---|---|---|---|
| 1.0 | {{ intake.meta.generated_on | date }} | {{ director }} | [TO CONFIRM on adoption] | 12 months after approval |
