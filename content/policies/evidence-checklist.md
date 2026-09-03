---
title: Evidence Checklist — Core Module and SIL Module
slug: evidence-checklist
doc_type: statement
standards: [core-2.1, core-2.3]
applies_if: "true"
version: 1.0
review_months: 3
---
# Evidence Checklist — Core Module and SIL Module

## Purpose
This checklist lists, for each NDIS Practice Standards outcome that applies to {{ org.name }}, the policy documents and the operational records an Approved Quality Auditor will expect to see. Policies show intent; records show practice. Both are required.

## Scope
Registration groups {{ intake.registration.groups | join(', ') }}; {{ intake.homes | length }} SIL home(s); {{ intake.workforce.headcount | default('[TO CONFIRM]', true) }} workers.

## Roles and responsibilities
| Role | Responsibilities |
|---|---|
| {{ intake.governance.quality_lead | default('[TO CONFIRM]', true) }} | Maintains this checklist; assembles the audit folder; confirms each record exists and is current. |
| {{ intake.governance.ceo_or_director | default('[TO CONFIRM]', true) }} | Approves policies; signs off readiness before Stage 1. |

## Checklist
| Outcome | Policy documents | Operational records to have ready | Status |
|---|---|---|---|
| Core 1.1 Person-centred supports | Person-Centred Supports Policy; Assessment and Support Planning Procedure | Current support plan for every participant (reviewed within 12 months), signed; evidence of participant involvement in reviews | ☐ |
| Core 1.2 Individual values and beliefs | Diversity and Cultural Safety Policy | Support plans recording culture, language, faith; interpreter use; cultural safety training records | ☐ |
| Core 1.3 Privacy and dignity | Privacy and Confidentiality Policy | Signed consent forms; privacy breach register; access controls in {{ intake.workforce.notes_software | default('[TO CONFIRM]', true) }} | ☐ |
| Core 1.4 Independence and informed choice | Autonomy and Dignity of Risk Policy; Supported Decision-Making Policy | Documented risk-enablement decisions; decision-support records | ☐ |
| Core 1.5 Violence, abuse, neglect, exploitation, discrimination | Safeguarding (VANED) Policy; Incident Management Policy; Open Disclosure Procedure; Whistleblower Policy | Incident register (all incidents, last 12 months: {{ intake.history.incidents_last_12m | default('[TO CONFIRM]', true) }} recorded); reportable incident notifications ({{ intake.history.reportable_incidents_last_12m | default('[TO CONFIRM]', true) }}); VANED training records | ☐ |
| Core 2.1 Governance and operational management | Governance Framework; Conflicts of Interest Policy; Information Management Policy | Policy register with versions and approvals; conflicts of interest register; management meeting minutes showing compliance review; key personnel records | ☐ |
| Core 2.2 Risk management | Risk Management Policy | Risk register (organisational, per-home, per-participant); business continuity plan | ☐ |
| Core 2.3 Quality management | Quality and Continuous Improvement Policy | Continuous improvement register; internal audit/self-assessment records; participant and staff feedback results | ☐ |
| Core 2.4 Information management | Information Management and Records Policy | Document control evidence; records retention schedule; IT security settings | ☐ |
| Core 2.5 Feedback and complaints | Complaints and Feedback Policy | Complaints register (last 12 months: {{ intake.history.complaints_last_12m | default('[TO CONFIRM]', true) }}); accessible complaints information given to participants | ☐ |
| Core 2.6 Human resource management | HR and Recruitment Policy; Worker Screening Policy; Induction, Training and Competency Policy; Supervision Policy; Grievance and Disciplinary Policy | Worker screening register (all risk-assessed roles verified in the NDIS Worker Screening Database); induction checklists; training register; supervision records; position descriptions | ☐ |
| Core 2.7 Continuity of supports | Continuity of Supports Policy | Roster contingency records; on-call arrangements | ☐ |
| Core 2.8 Emergency and disaster management | Emergency and Disaster Management Plan | Per-home emergency plans for {% for h in intake.homes %}{{ h.name }}{% if not loop.last %}, {% endif %}{% endfor %}; drill/evacuation records; participant-specific emergency needs | ☐ |
| Core 3.1 Access to supports | Access and Intake Procedure | Intake records; decisions to accept/decline with reasons | ☐ |
| Core 3.2 Support planning | Assessment and Support Planning Procedure | Assessments and plans; review dates | ☐ |
| Core 3.3 Service agreements | SIL Service Agreement template; Tenancy, Housing and Support Separation Policy | Signed service agreement for every participant, separate from tenancy/occupancy agreement | ☐ |
| Core 3.4 Responsive support provision | Shift Handover and Progress Notes Procedure; Health and Wellbeing Policy | Progress notes in {{ intake.workforce.notes_software | default('[TO CONFIRM]', true) }}; handover records; health plans | ☐ |
| Core 3.5 Transitions | Transitions and Exit Policy | Transition plans and handover summaries where applicable | ☐ |
| Core 4.1 Safe environment | Safe Environment and Property Policy; WHS Policy | Hazard inspections and maintenance logs per home; WHS incident records | ☐ |
{% if intake.supports.participant_money_handling %}| Core 4.2 Participant money and property | Participant Money and Property Policy | Transaction records with receipts; reconciliations | ☐ |
{% endif %}{% if intake.supports.medication_involvement != 'none' %}| Core 4.3 Management of medication | Medication Management Policy | Medication administration records; competency assessments; medication incident records | ☐ |
{% endif %}{% if intake.supports.mealtime_management %}| Core 4.4 Mealtime management | Mealtime Management Policy | Mealtime management plans; training records | ☐ |
{% endif %}| Core 4.5 Management of waste | Waste Management and Infection Control Policy | Waste handling records where applicable | ☐ |
| SIL-1 Supported decision-making | Supported Decision-Making Policy; Household Decision-Making Policy | Records of decisions and support given; house meeting records; communication profiles | ☐ |
| SIL-2 Safeguarding in the home | Incident, Complaints, Risk, Emergency, Restrictive Practices policies | House-level incident and risk records; per-home emergency plans; {% if intake.supports.restrictive_practices != 'none' %}behaviour support plans, authorisations and monthly restrictive practice reports{% else %}documented statement that no restrictive practices are used{% endif %} | ☐ |
| SIL-3 Practice governance and workforce consistency | Practice Governance and Workforce Consistency Policy | Roster records in {{ intake.workforce.rostering_software | default('[TO CONFIRM]', true) }}; shift handover records; competency monitoring; house meeting minutes | ☐ |
| SIL-4 Tenancy, housing and support agreements | Tenancy, Housing and Support Separation Policy; SIL Service Agreement; Conflicts of Interest Policy; Participant Rights Statement | Tenancy/occupancy agreements held separately for each home ({% for h in intake.homes %}{{ h.name }}: tenancy held by {{ h.tenancy_holder | replace('_', ' ') }}{% if not loop.last %}; {% endif %}{% endfor %}); conflict-of-interest disclosures where the provider or a related party is the landlord; participant rights statement given to each participant | ☐ |

## Records kept
This checklist, signed off by {{ intake.governance.ceo_or_director | default('[TO CONFIRM]', true) }} before Stage 1, is filed in the audit folder.

## Related documents
Evidence Index (generated); 60-Day Portal Lodgement Plan; SIL Self-Assessment Guide.

## Legislation and standards references
NDIS Practice Standards Core Module; NDIS Practice Standards SIL supplementary module (2026); NDIS (Provider Registration and Practice Standards) Rules 2018.

## Review
Every 3 months and before every audit, by {{ intake.governance.quality_lead | default('[TO CONFIRM]', true) }}.

## Document control
| Version | Approved by | Approval date | Next review |
|---|---|---|---|
| 1.0 | {{ intake.governance.ceo_or_director | default('[TO CONFIRM]', true) }} | {{ intake.meta.generated_on | date }} | Before Stage 1 audit |
