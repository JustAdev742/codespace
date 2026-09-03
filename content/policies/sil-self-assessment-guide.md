---
title: SIL Self-Assessment Guide
slug: sil-self-assessment-guide
doc_type: statement
standards: [core-1.1, core-2.1, core-3.1, core-4.1, sil-1, sil-2, sil-3, sil-4]
applies_if: "true"
version: 1.0
review_months: 3
---
{% set gov = intake.governance %}{% set wf = intake.workforce %}{% set sup = intake.supports %}{% set hist = intake.history %}{% set reg = intake.registration %}
{% set director = gov.ceo_or_director | default('[TO CONFIRM]', true) %}{% set quality_lead = gov.quality_lead | default('[TO CONFIRM]', true) %}{% set complaints_officer = gov.complaints_officer | default('[TO CONFIRM]', true) %}{% set incident_officer = gov.incident_officer | default('[TO CONFIRM]', true) %}{% set privacy_officer = gov.privacy_officer | default('[TO CONFIRM]', true) %}{% set whs_officer = gov.whs_officer | default('[TO CONFIRM]', true) %}{% set rostering_manager = gov.rostering_manager | default('[TO CONFIRM]', true) %}
{% set rostering_software = wf.rostering_software | default('[TO CONFIRM]', true) %}{% set notes_software = wf.notes_software | default('[TO CONFIRM]', true) %}{% set incident_software = wf.incident_software | default('[TO CONFIRM]', true) %}{% set training_platform = wf.training_platform | default('[TO CONFIRM]', true) %}
{% set roster_label = {'twenty_four_seven': '24/7 support with an awake worker overnight', 'sleepover': 'day and evening support with a sleepover worker', 'active_night': 'day support with an active night worker', 'drop_in': 'drop-in support with no worker overnight'} %}
{% set holder_label = {'provider': 'held by us', 'sda_provider': 'held with an SDA provider', 'private_landlord': 'held with a private landlord', 'participant': 'held by the participant'} %}
{% set ns = namespace(provider_landlord=false, sda=false, shared=false) %}{% for home in intake.homes %}{% if home.tenancy_holder == 'provider' %}{% set ns.provider_landlord = true %}{% endif %}{% if home.sda or home.tenancy_holder == 'sda_provider' %}{% set ns.sda = true %}{% endif %}{% if home.co_tenants %}{% set ns.shared = true %}{% endif %}{% endfor %}
{% set n_homes = intake.homes | length %}
# SIL Self-Assessment Guide

## Purpose

To lodge a valid registration application for registration group 0138 (Supported Independent Living) in the NDIS Commission Applications Portal, {{ org.name }} must complete a self-assessment against the NDIS Practice Standards Core Module (four outcome groups) and the SIL supplementary module (four outcomes), with a written response and attached evidence for each. This guide gives {{ org.name }} a tailored first draft of each "How we meet this" response, written in {{ org.name }}'s own voice from the facts gathered at intake, followed by the evidence documents to attach. Target lodgement date: {{ reg.target_lodgement_date | date }}. Application started: {% if reg.application_started %}yes{% else %}not yet{% endif %}. Auditor chosen: {{ reg.auditor_chosen | default('[TO CONFIRM]', true) }}.

## Scope

This guide covers registration groups {{ reg.groups | join(', ') }}, {{ n_homes }} home{% if n_homes != 1 %}s{% endif %} ({% for home in intake.homes %}{{ home.name }}, {{ home.state }}{% if not loop.last %}; {% endif %}{% endfor %}) and approximately {{ wf.headcount | default('[TO CONFIRM]', true) }} workers. It is a working document for {{ director }} and {{ quality_lead }}; it is not itself submitted.

## Roles and responsibilities

| Role | Responsibilities |
|---|---|
| {{ director }} | Reads, edits and approves every response; is the applicant's key personnel contact; submits the application. |
| {{ quality_lead }} | Adapts each draft to actual practice; assembles the evidence; checks each attachment exists, is approved and is in use. |
| Other key personnel ({% for p in intake.key_personnel %}{{ p.name }}, {{ p.role }}{% if not loop.last %}; {% endif %}{% endfor %}) | Confirm the responses that describe their responsibilities are accurate. |

## Draft self-assessment responses

### Core Module — Rights and responsibilities (outcomes 1.1 to 1.5)

We are {{ org.name }} ({{ org.entity_type | replace('_', ' ') }}, ABN {{ org.abn | default('[TO CONFIRM]', true) }}), delivering SIL to {% for home in intake.homes %}{{ home.participants }} participant{% if home.participants != 1 %}s{% endif %} at {{ home.name }}{% if not loop.last %} and {% endif %}{% endfor %}. Each participant has a support plan written in their own words, reviewed with them at least annually, that records their goals, culture, language, faith, communication method and the decisions they want support with. Our Person-Centred Supports, Diversity and Cultural Safety and Supported Decision-Making policies set out how workers respect each person's values and privacy; workers sign the NDIS Code of Conduct at induction. Dignity of risk is documented: where a participant chooses an activity that carries risk, the discussion and the participant's decision are recorded in {{ notes_software }}. Our Safeguarding (VANED) Policy and Incident Management Policy set out how we recognise and respond to violence, abuse, neglect, exploitation and discrimination, including 24-hour notification of reportable incidents to the NDIS Commission by {{ incident_officer }}; in the last 12 months we recorded {{ hist.incidents_last_12m | default('[TO CONFIRM]', true) }} incidents and {{ hist.reportable_incidents_last_12m | default('[TO CONFIRM]', true) }} reportable incidents. Our restrictive practice position is: {% if sup.restrictive_practices == 'none' %}we use no regulated restrictive practices, and {{ quality_lead }} audits each home twice a year for hidden practices{% elif sup.restrictive_practices == 'authorised' %}regulated restrictive practices are used only where in a lodged behaviour support plan and authorised in {{ org.states | join(' and ') }}{% else %}we have identified practices in use without full authorisation and are implementing the immediate actions in our Restrictive Practices Policy{% endif %}.

Evidence documents:

- Person-Centred Supports Policy
- Diversity and Cultural Safety Policy
- Privacy and Confidentiality Policy
- Autonomy and Dignity of Risk Policy
- Supported Decision-Making Policy
- Safeguarding (VANED) Policy
- Incident Management Policy and Procedure; Incident Register
- Open Disclosure Procedure
- Restrictive Practices and Behaviour Support Policy and Procedure
- Participant Rights Statement

### Core Module — Governance and operational management (outcomes 2.1 to 2.8)

{{ org.name }}'s legal structure is: {{ gov.structure | default('[TO CONFIRM]', true) }}. It is {% if gov.has_board %}governed by a board{% else %}governed by {{ director }} without a separate board{% endif %} and has operated for {{ hist.years_operating | default('[TO CONFIRM]', true) }} year{% if hist.years_operating != 1 %}s{% endif %}. {{ director }} is accountable for compliance; {{ quality_lead }} leads quality and risk; {{ complaints_officer }} manages complaints ({{ hist.complaints_last_12m | default('[TO CONFIRM]', true) }} in the last 12 months); {{ incident_officer }} manages incidents; {{ privacy_officer }} is privacy officer; {{ whs_officer }} leads work health and safety; and {{ rostering_manager }} manages rostering. Our Governance Framework, Delegations of Authority and Conflicts of Interest Register define who decides what. Risk is managed through a Risk Register with organisational, per-home and per-participant risk assessments, a Business Continuity Plan and an Emergency and Disaster Management Plan with an evacuation plan for each home. Quality is managed through a Continuous Improvement Register, internal audits and a quarterly quality meeting. Records are kept in {{ notes_software }} (progress notes), {{ rostering_software }} (rosters) and {{ incident_software }} (incidents), with access controls and a retention schedule. Our workforce of {{ wf.headcount | default('[TO CONFIRM]', true) }} ({{ wf.employment_types | join(', ') }}) is recruited, screened{% if wf.screening_all_current %} (all risk-assessed roles hold current NDIS worker screening clearances){% else %} ([TO CONFIRM] — worker screening currency to be verified){% endif %}, inducted, trained through {{ training_platform }} and supervised under our HR policies.{% if hist.previous_audit %} We have been audited previously and have used those findings.{% else %} This is our first NDIS audit; {% if hist.existing_policies %}our existing policies have been reviewed and reissued{% else %}our policy set has been developed for this application{% endif %}.{% endif %} These arrangements are reviewed at every quarterly quality meeting.

Evidence documents:

- Governance Framework; Delegations of Authority
- Conflicts of Interest Policy and Register
- Risk Management Policy and Risk Register
- Business Continuity Plan; Emergency and Disaster Management Plan (per-home evacuation plans)
- Quality and Continuous Improvement Policy; Continuous Improvement Register
- Information Management Policy; Records Retention Schedule
- Financial Management Policy
- Complaints and Feedback Policy; Complaints Register
- Human Resources and Recruitment Policy; Worker Screening Policy and Register; Induction, Training and Competency Policy; Supervision and Performance Policy; Grievance and Disciplinary Policy
- Evidence Checklist — Core Module and SIL Module

### Core Module — Provision of supports (outcomes 3.1 to 3.5)

Our Access and Intake Procedure sets out how we decide, with the person, whether we can meet their needs before we accept a referral, and how we tell them if we cannot. Within four weeks of starting, each participant has a support plan built with them from an assessment of their needs, risks, health{% if sup.medication_involvement != 'none' %}, medication{% endif %}{% if sup.mealtime_management %}, mealtime{% endif %} and communication needs, and a separate SIL Service Agreement that describes supports, costs and rights in plain language and is signed by the participant or their nominee; tenancy is never part of that agreement. Support is delivered from rosters in {{ rostering_software }} built to each home's model ({% for home in intake.homes %}{{ home.name }}: {{ roster_label[home.roster_model] | default('[TO CONFIRM]') }}{% if not loop.last %}; {% endif %}{% endfor %}), with progress notes and shift handovers in {{ notes_software }} so that every worker knows the plan. Health is supported through an Individual Health Plan for every participant, with deterioration escalation and a Hospital Transfer Pack. Transitions in and out are managed under our Transitions and Exit Policy with a Transition Plan and Handover Summary, 28 days' notice from us, and written confirmation that housing is unaffected.

Evidence documents:

- Access and Intake Procedure
- Assessment and Support Planning Procedure (with Support Plan template)
- SIL Service Agreement template
- Shift Handover and Progress Notes Procedure
- Health and Wellbeing Policy (Individual Health Plan; Appointment Log)
- Transitions and Exit Policy and Procedure (Transition Plan; Handover Summary)
- Practice Governance and Workforce Consistency Policy

### Core Module — Support provision environment (outcomes 4.1 to 4.5)

Each of our {{ n_homes }} home{% if n_homes != 1 %}s{% endif %} is inspected monthly by its house leader using our Hazard Inspection Checklist and every six months by {{ whs_officer }}, with a Maintenance Log tracking repairs by the responsible party ({% for home in intake.homes %}{{ home.name }}: tenancy {{ holder_label[home.tenancy_holder] | default('[TO CONFIRM]') }}{% if not loop.last %}; {% endif %}{% endfor %}). Our Work Health and Safety Policy applies {% for state in org.states %}the WHS legislation of {{ state }}{% if not loop.last %} and {% endif %}{% endfor %} to manual handling, violence and aggression, lone and overnight work, fatigue and notifiable incidents. {% if sup.participant_money_handling %}Where workers help with participants' money, every transaction is receipted on a Transaction Record, cash is counted at handover and records are audited quarterly.{% else %}Our workers do not handle participant money; participants and their nominees manage their own finances.{% endif %} {% if sup.medication_involvement == 'administer' %}We administer medication: workers complete HLTHPS006 or equivalent and a practical competency assessment before administering, record every dose on a Medication Administration Record, and report every error as an incident.{% elif sup.medication_involvement == 'prompt' %}We prompt participants who self-administer medication; workers are trained and assessed for prompting only and record every prompt.{% else %}We have no medication involvement; participants manage their own medication or it is managed by others.{% endif %} {% if sup.mealtime_management %}Participants with swallowing needs have mealtime management plans from speech pathologists; workers are trained to prepare IDDSI textures and respond to choking.{% else %}We screen every participant for swallowing risk and refer for a mealtime management plan if any indicator appears.{% endif %} Waste, sharps, chemicals and infection control follow our Waste Management and Infection Control Policy, with outbreak procedures for each home.

Evidence documents:

- Safe Environment and Property Maintenance Policy (Hazard Inspection Checklist; Maintenance Log)
- Work Health and Safety Policy
{% if sup.participant_money_handling %}- Participant Money and Property Policy and Procedure (Transaction Record)
{% endif %}{% if sup.medication_involvement != 'none' %}- Medication Management Policy and Procedure (MAR; Medication Competency Checklist)
{% endif %}{% if sup.mealtime_management %}- Mealtime Management Policy
{% endif %}- Waste Management and Infection Control Policy
- Emergency and Disaster Management Plan

### SIL module outcome 1 — Supported decision-making

We support the people living at {% for home in intake.homes %}{{ home.name }}{% if not loop.last %} and {% endif %}{% endfor %} to make their own decisions about their daily routines, meals, activities, relationships, visitors and how their home is run. Our Supported Decision-Making Policy describes how workers find out how each person communicates and decides, offer information in the way the person understands, allow time, and record the decision and the support given in {{ notes_software }}. {% if ns.shared %}In shared homes, household decisions are made at regular household meetings recorded under our Household Decision-Making Policy, and household rules are chosen by the participants, not imposed by us.{% else %}Where a participant lives alone, we still record household decisions with them so that routines reflect their choices rather than worker convenience.{% endif %} Dignity of risk is respected: when a participant chooses something risky, we record what they understand, the supports that reduce the risk and their decision, and we never use a restrictive practice as a substitute for supported choice. Where a guardian or nominee is appointed, we record the scope of their authority and keep the participant involved. {{ rostering_manager }} checks at each plan review that decisions in the plan are the participant's own.

Evidence documents:

- Supported Decision-Making Policy
- Household Decision-Making and Household Rules Policy (Household Meeting Record)
- Autonomy and Dignity of Risk Policy
- Person-Centred Supports Policy
- Participant Rights Statement

### SIL module outcome 2 — Safeguarding in the home

Safeguarding is organised home by home. Each home has its own risk assessment, evacuation plan, emergency plan for each participant, Hazard Inspection Checklist and Maintenance Log, and incidents and complaints are analysed by home at our quarterly quality meeting. Workers report every incident in {{ incident_software }} during the shift; {{ incident_officer }} assesses reportability and notifies the NDIS Commission within 24 hours (or 5 business days for an unauthorised restrictive practice). {% if sup.restrictive_practices == 'none' %}We use no regulated restrictive practices; {{ director }} signs an annual Statement of Non-Use and {{ quality_lead }} audits every home for hidden practices.{% elif sup.restrictive_practices == 'authorised' %}Regulated restrictive practices are used only where in a behaviour support plan prepared by an NDIS behaviour support practitioner and authorised in the participant's state; every use is recorded and reported monthly to the Commission, and plans include reduction strategies.{% else %}We have identified practices in use without full authorisation; each use is being reported as a reportable incident, practitioners have been engaged and authorisation is being sought.{% endif %} {% if ns.shared %}Co-resident risk is assessed before anyone moves into a shared home and whenever behaviour or health changes.{% endif %} {% if sup.medication_involvement != 'none' %}Medication{% if sup.mealtime_management %} and mealtime{% endif %} risks are managed through trained, assessed workers and records that are audited monthly.{% elif sup.mealtime_management %}Mealtime risks are managed through practitioner plans and trained workers.{% endif %} Health deterioration is escalated under our Health and Wellbeing Policy.

Evidence documents:

- Incident Management Policy and Procedure; Incident Register
- Complaints and Feedback Policy; Complaints Register
- Risk Management Policy and Risk Register (per-home risk assessments)
- Emergency and Disaster Management Plan (per-home)
- Restrictive Practices and Behaviour Support Policy and Procedure{% if sup.restrictive_practices != 'none' %}; behaviour support plans, authorisations and monthly reports{% else %}; Statement of Non-Use{% endif %}
- Safeguarding (VANED) Policy
- Health and Wellbeing Policy
{% if sup.medication_involvement != 'none' %}- Medication Management Policy and Procedure
{% endif %}- Safe Environment and Property Maintenance Policy

### SIL module outcome 3 — Practice governance and workforce consistency

Our {{ wf.headcount | default('[TO CONFIRM]', true) }} workers ({{ wf.employment_types | join(', ') }}) are rostered in {{ rostering_software }} to a stable core team for each home so that participants are supported mainly by people they know; {{ rostering_manager }} reports core-team and agency percentages monthly. Each home has a named house leader who works shifts there and is the first point of escalation. Overnight models are matched to assessed need ({% for home in intake.homes %}{{ home.name }}: {{ roster_label[home.roster_model] | default('[TO CONFIRM]') }}{% if not loop.last %}; {% endif %}{% endfor %}) and reviewed every six months. Every worker completes induction, the NDIS Worker Orientation Module, Code of Conduct, safeguarding, manual handling, infection control and emergency training through {{ training_platform }}, plus participant-specific training in each plan before working alone; {% if wf.first_aid_all %}all workers hold first aid{% else %}first aid coverage is rostered on every shift while we complete certification for all workers{% endif %}. Practice is observed on shift by house leaders and {{ quality_lead }}, competency is reassessed annually, and supervision is recorded. Shift handovers and progress notes in {{ notes_software }} keep practice consistent across shifts and homes, and learning from incidents and complaints is shared at monthly all-staff meetings.

Evidence documents:

- Practice Governance and Workforce Consistency Policy
- Induction, Training and Competency Policy (Induction Checklist; Training Register)
- Supervision and Performance Policy
- Shift Handover and Progress Notes Procedure (Shift Handover Template)
- Worker Screening Policy and Register
- Human Resources and Recruitment Policy; Position Descriptions
- Roster records from {{ rostering_software }}

### SIL module outcome 4 — Agreements about tenancy, housing and support

Every participant has two separate agreements: a SIL Service Agreement with us for supports, and a housing agreement with the tenancy holder for their home ({% for home in intake.homes %}{{ home.name }}: tenancy {{ holder_label[home.tenancy_holder] | default('[TO CONFIRM]') }}{% if home.sda %}, SDA-enrolled{% endif %}{% if not loop.last %}; {% endif %}{% endfor %}). Our Tenancy, Housing and Support Separation Policy states that a participant can change support provider and keep their home, that we never link ending supports to ending housing, and that workers never use access to the home, keys or landlord relationships to influence a participant's choices. {% if ns.provider_landlord %}Where we hold the tenancy, this conflict of interest is disclosed in writing before either agreement is signed, independent advice is offered, rent and support are invoiced separately, and any tenancy decision is made by {{ director }} on tenancy-law grounds only, reviewed by {{ quality_lead }}.{% else %}We do not hold the tenancy for any home; any relationship with a landlord or SDA provider is recorded on our Conflicts of Interest Register and disclosed to the participant.{% endif %} {% if ns.sda %}SDA providers hold their own agreements with participants under the NDIS (Specialist Disability Accommodation) Rules 2020.{% endif %} Participants receive an accessible Participant Rights Statement on housing security, and {{ rostering_manager }} confirms at every agreement review that each participant knows who holds their tenancy and that they can change provider and stay. Transitions follow our Transitions and Exit Policy.

Evidence documents:

- Tenancy, Housing and Support Separation Policy
- SIL Service Agreement template
- Conflicts of Interest Policy and Register; conflict-of-interest disclosures
- Participant Rights Statement
- Transitions and Exit Policy and Procedure
- Copies or records of housing agreements for each home

## How to use these drafts

- Every response above is a draft built from intake facts. Before it is entered in the Applications Portal, {{ director }} and {{ quality_lead }} must read each one, correct anything that does not describe what {{ org.name }} actually does, and add examples from real practice.
- The NDIS Commission expects applicants to be substantially involved in their own application. Responses that are identical to other providers' responses, or that describe policies staff cannot explain at interview, can lead to refusal or additional audit conditions. Workers will be interviewed by the auditor about these documents.
- Only attach evidence that exists, has been approved and is in use. Replace every [TO CONFIRM] before lodgement.
- A started application must be completed within 60 days, and SIL providers must have lodged a valid application by 1 October 2026 to keep delivering SIL supports.

## Records kept

- The final self-assessment responses and evidence list as lodged, exported from the Applications Portal and filed in the audit folder.
- {{ director }}'s sign-off that each response was reviewed and adapted.

## Related documents

- evidence-checklist
- portal-lodgement-plan
- practice-governance-workforce-consistency
- tenancy-housing-support-separation
- supported-decision-making
- incident-management
- restrictive-practices-behaviour-support
- safe-environment-property

## Legislation and standards references

- National Disability Insurance Scheme Act 2013 (Cth)
- NDIS (Provider Registration and Practice Standards) Rules 2018 — NDIS Practice Standards Core Module; SIL supplementary module (registration group 0138, 2026)
- NDIS (Quality Indicators) Guidelines 2018 as amended for SIL (2026)
- NDIS (Incident Management and Reportable Incidents) Rules 2018; NDIS (Complaints Management and Resolution) Rules 2018; NDIS (Restrictive Practices and Behaviour Support) Rules 2018; NDIS (Practice Standards—Worker Screening) Rules 2018
- NDIS Code of Conduct (NDIS (Code of Conduct) Rules 2018)

## Review

This guide is reviewed every 3 months until registration is granted, and before lodgement. Review owner: {{ quality_lead }}. Approval: {{ director }}.

## Document control

| Version | Approved by | Approval date | Next review |
|---|---|---|---|
| 1.0 | {{ director }} | {{ intake.meta.generated_on | date }} | Before lodgement |
