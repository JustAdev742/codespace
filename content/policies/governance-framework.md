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
This framework describes how {{ org.name }} is governed and managed so that it delivers safe, quality Supported Independent Living (SIL) supports, complies with its conditions of NDIS registration, and can show an auditor who decides what, who is accountable and how compliance is overseen. It evidences NDIS Practice Standards Core Module outcome 2.1 (Governance and operational management) and the SIL supplementary module practice governance outcome.

## Scope
This framework applies to {{ governing_body }}, all key personnel, managers, house leaders and workers of {{ org.name }} ({{ org.entity_type | replace('_', ' ') }}, ABN {{ org.abn | default('[TO CONFIRM]', true) }}), operating in {{ org.states | join(', ') }} across {{ intake.homes | length }} SIL home{% if intake.homes | length != 1 %}s{% endif %} with approximately {{ wf.headcount | default('[TO CONFIRM]', true) }} workers. {{ org.name }} {% if reg.application_started %}has started{% else %}is preparing{% endif %} its application for registration in groups {{ reg.groups | join(', ') }}, targeting lodgement by {{ reg.target_lodgement_date | date }}; Approved Quality Auditor: {{ reg.auditor_chosen | default('[TO CONFIRM]', true) }}.

## Policy statement
- **Accountability is clear.** {{ governing_body }} is accountable for {{ org.name }}'s compliance, finances, quality and safety; every operational responsibility is delegated in writing to a named role that reports back through the meetings below.
- **Participants come first.** Governance decisions are tested against their effect on participants' rights, safety, choice and control; participant feedback is a standing agenda item.
- **Key personnel are suitable and known.** {{ org.name }} verifies key personnel suitability before appointment and annually, and tells the NDIS Quality and Safeguards Commission when they change.
- **Policies are controlled and compliance is monitored.** Every policy has an approver, owner and review date, is reviewed when an incident, complaint, audit or legal change shows it is not working, and every obligation is tracked on a compliance calendar reported monthly.
- **Risk, conflicts and practice are governed** through the Risk Management Policy and Framework, the Conflicts of Interest Policy and the Practice Governance and Workforce Consistency Policy, which form part of this framework.

## Roles and responsibilities
| Role | Responsibilities under this framework |
|---|---|
| {{ governing_body }}{% if gov.has_board %} (chaired by [TO CONFIRM]){% endif %} | Sets strategy and risk appetite; approves budget, policies and delegations; appoints and reviews the Director; receives compliance, quality and safety reports. |
| Director — {{ director }} | Accountable officer; holds all delegations not assigned elsewhere; signs Commission applications, notifications and declarations; chairs the monthly management meeting. |
| Quality Lead — {{ quality_lead }} | Owns this framework and the Policy Register; runs internal audits and the quality meeting; keeps the compliance calendar; coordinates the registration audit. |
| Rostering Manager — {{ rostering_manager }} | Operational management of homes and rosters in {{ rostering_software }}; supervises house leaders; reports workforce metrics. |
| Incident Officer — {{ incident_officer }}; Complaints Officer — {{ complaints_officer }}; Privacy Officer — {{ privacy_officer }}; WHS Officer — {{ whs_officer }} | Each owns the named policy, keeps its register and reports monthly. |
| House leaders and workers | Lead practice in each home; hold house meetings; follow policies; report incidents, complaints, hazards and conflicts of interest. |

## Governance arrangements

### Legal entity and governing body
{% if org.entity_type == 'company' %}{{ org.name }} is a company registered under the Corporations Act 2001 (Cth). {% if gov.has_board %}Its Board of directors is the governing body and meets at least quarterly.{% else %}It has no separate board: the Director, {{ director }}, is the governing body and holds the duties of a company director.{% endif %}{% elif org.entity_type == 'incorporated_association' %}{{ org.name }} is an incorporated association governed by its constitution and the associations legislation of {{ org.states[0] | default('[TO CONFIRM]', true) }}; its management committee is the governing body and meets at least quarterly.{% elif org.entity_type == 'sole_trader' %}{{ org.name }} is operated by a sole trader, {{ director }}, who is the governing body and personally responsible for every obligation in this framework.{% elif org.entity_type == 'partnership' %}{{ org.name }} is a partnership; the partners jointly form the governing body and meet at least quarterly.{% else %}{{ org.name }}'s legal structure is {{ gov.structure | default('[TO CONFIRM]', true) }}; its governing body is [TO CONFIRM].{% endif %} {% if not gov.has_board %}With no independent board, {{ org.name }} obtains independent challenge from its external accountant, its Approved Quality Auditor, participant feedback and an annual external review of this framework.{% endif %}

### Key personnel

Key personnel are the people with authority over {{ org.name }}'s management and the delivery of its supports, within the meaning of section 11A of the NDIS Act 2013:

| Name | Role | Contact | Suitability checks held |
|---|---|---|---|
{% for kp in intake.key_personnel %}
| {{ kp.name | default('[TO CONFIRM]', true) }} | {{ kp.role | default('[TO CONFIRM]', true) }} | {{ kp.email | default('[TO CONFIRM]', true) }}; {{ kp.phone | default('[TO CONFIRM]', true) }} | Worker Screening clearance and annual declaration [TO CONFIRM dates] |
{% else %}
| [TO CONFIRM] | [TO CONFIRM] | [TO CONFIRM] | [TO CONFIRM] |
{% endfor %}

### Key personnel suitability
1. Before appointment and every 12 months, {{ director }} (or {{ governing_body }} for the Director) obtains a signed suitability declaration covering the matters the Commissioner considers: criminal history, bankruptcy or insolvency involvement, banning orders, disqualification from managing corporations, adverse regulatory findings, and any previous refusal, suspension or revocation of registration.
2. Every key personnel role is a risk assessed role under the NDIS (Practice Standards—Worker Screening) Rules 2018; each holds a current NDIS Worker Screening clearance and declares conflicts of interest on appointment and annually.
3. Any change in suitability is reported to {{ director }} immediately and to the Commission as set out below.

### Delegations of authority
| Decision or authority | Held by | Conditions | Reported to |
|---|---|---|---|
| Approve, amend or withdraw policies | {{ governing_body }} | After review by {{ quality_lead }}; Policy Register | Quarterly quality meeting |
| Accept or decline referrals; sign SIL Service Agreements; enter, vary or end any lease, head-tenancy or SDA arrangement | {{ director }} | Access and Intake Procedure; Conflicts of Interest Policy; housing never linked to choice of provider | {{ governing_body }} |
| Approve rosters, agency use and overnight models | {{ rostering_manager }} (overnight model changes: {{ director }}) | Within budget and the Practice Governance Policy | Monthly management meeting |
| Financial approvals, payments and NDIS claims; engage, stand down or dismiss workers | {{ director }} per the Financial Management Policy delegations | Two-person control for claims and new payees; screening verified before engagement | Monthly management meeting |
| Approve reportable incident notifications; escalated complaints; restrictive practice use under a behaviour support plan | {{ director }} ({{ incident_officer }} lodges as Notifier) | Incident Management and Complaints Policies; state authorisation and lodged plan | {{ governing_body }} |
| Notify the Commission; sign applications; declare an emergency; media statements | {{ director }} (emergency: {{ whs_officer }} in the Director's absence) | This framework; Emergency and Disaster Management Plan | {{ governing_body }} |
| Notify eligible data breaches to the OAIC | {{ privacy_officer }} with {{ director }} | Privacy and Confidentiality Policy | Monthly management meeting |

Delegations are exercised only by the named role or by a person {{ director }} appoints in writing to act during leave.

### Policy approval and review
1. {{ quality_lead }} drafts or reviews the policy, consults workers, participants and any specialist, and checks it against current Practice Standards, Rules and legislation.
2. {{ governing_body }} approves it; version, approver and date are recorded in the document control table and Policy Register; superseded versions are archived and affected workers are briefed within 30 days.
3. Each policy is reviewed at its stated interval (12 months unless stated) and earlier after a serious incident, complaint, audit finding, legal change, or change to a home, roster model or support type.

### Meeting cadence
| Meeting | Frequency | Chair | Standing agenda |
|---|---|---|---|
{% if gov.has_board %}
| Board meeting | Quarterly | Chair of the Board | Strategy, finance, risk, compliance report, key personnel, policy approvals |
{% endif %}
| Management and compliance meeting | Monthly | {{ director }} | Incidents, complaints, restrictive practices, risk register, WHS, workforce and screening, finance and claims, Commission correspondence, compliance calendar |
| Quality and safety review | Quarterly | {{ quality_lead }} | Audit results, trends, Continuous Improvement Register, policy reviews, participant and worker feedback |
| All-staff meeting; house meeting in each home | Monthly; fortnightly (weekly with 3 or more participants or an active behaviour support plan) | {{ rostering_manager }}; house leader | Practice updates and training; participants' decisions and feedback, plans, health, incidents, hazards, roster |

All meetings are minuted with an action log.

### Compliance oversight
- {{ quality_lead }} keeps a compliance calendar of every recurring obligation: screening and training expiries, insurance renewals, monthly restrictive practice reporting, NDIS pricing updates on 1 July, policy reviews, the mid-term audit and registration renewal, and state WHS and tenancy requirements.
- The monthly compliance report covers incidents ({{ intake.history.incidents_last_12m | default('[TO CONFIRM]', true) }} in the last 12 months), reportable incidents ({{ intake.history.reportable_incidents_last_12m | default('[TO CONFIRM]', true) }}), complaints ({{ intake.history.complaints_last_12m | default('[TO CONFIRM]', true) }}), worker screening ({% if wf.screening_all_current %}all current{% else %}gaps being closed{% endif %}), training, roster consistency, finances and any breach of a condition of registration. {{ director }} certifies compliance to {{ governing_body }} quarterly, and {{ org.name }} self-assesses against the Core and SIL modules annually and before every audit.

### Notifying the NDIS Commission of changes
Under the conditions of registration in the NDIS (Provider Registration and Practice Standards) Rules 2018, {{ director }} notifies the Commission, using its notification form, as soon as practicable and within any timeframe the Commission specifies, of:

| Change or event | Action |
|---|---|
| A person becomes or ceases to be key personnel, or their suitability changes | Notify; update the key personnel table and Worker Screening Register |
| Change of legal or trading name, ABN, address, contacts or legal structure | Notify; update participant-facing documents |
| Change in scope: new registration group, class of supports, state or home | Apply to vary registration before delivering the new supports |
| Event affecting the ability to deliver supports: insolvency, loss of insurance, loss of a home, serious workforce shortage | Notify; activate the Continuity of Supports Policy |
| Decision to cease providing SIL supports or to close | Notify as early as possible with a transition plan for every participant |

## Records kept
- Key personnel list, suitability declarations and Worker Screening Register entries
- Policy Register, archived versions, delegations and acting appointments
- Minutes and action logs of all governance meetings
- Compliance calendar, monthly compliance reports and quarterly certifications
- Commission applications, notifications and correspondence; annual self-assessments

## Related documents
- Risk Management Policy and Framework; Conflicts of Interest Policy, Procedure and Register; Quality and Continuous Improvement Policy
- Information Management and Records Policy; Financial Management, NDIS Billing and Claiming, and Fraud and Corruption Prevention Policy
- Practice Governance and Workforce Consistency Policy; Worker Screening Policy; Continuity of Supports Policy; Emergency and Disaster Management Plan

## Legislation and standards references
- National Disability Insurance Scheme Act 2013 (Cth), including section 11A (key personnel) and Chapter 4 Part 3A (registration of NDIS providers)
- NDIS (Provider Registration and Practice Standards) Rules 2018 — conditions of registration, including notification of certain changes and events; NDIS Practice Standards, Core Module outcome 2.1; SIL supplementary module (registration group 0138, 2026), practice governance outcome
- NDIS (Practice Standards—Worker Screening) Rules 2018; NDIS (Code of Conduct) Rules 2018; NDIS (Quality Indicators) Guidelines 2018
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
- Australian Charities and Not-for-profits Commission Act 2012 (Cth) governance standards, if registered as a charity

## Review

Reviewed every 12 months by the Quality Lead ({{ quality_lead }}) and approved by {{ governing_body }}; reviewed earlier when key personnel, legal structure, registration scope or the number of homes changes, or after any Commission compliance action.

## Document control

| Version | Drafted | Approved by | Approval date | Next review |
|---|---|---|---|---|
| 1.0 | {{ intake.meta.generated_on | date }} | {{ director }} | [TO CONFIRM on adoption] | 12 months after approval |
