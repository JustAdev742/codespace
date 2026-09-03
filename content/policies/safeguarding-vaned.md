---
title: Safeguarding Policy — Violence, Abuse, Neglect, Exploitation and Discrimination
slug: safeguarding-vaned
doc_type: policy
standards: [core-1.5, sil-2]
applies_if: "true"
version: 1.0
review_months: 12
---
{% set director = intake.governance.ceo_or_director | default('[TO CONFIRM]', true) %}
{% set quality_lead = intake.governance.quality_lead | default('[TO CONFIRM]', true) %}
{% set incident_officer = intake.governance.incident_officer | default('[TO CONFIRM]', true) %}
{% set complaints_officer = intake.governance.complaints_officer | default('[TO CONFIRM]', true) %}
{% set rostering_manager = intake.governance.rostering_manager | default('[TO CONFIRM]', true) %}
{% set incident_software = intake.workforce.incident_software | default('[TO CONFIRM]', true) %}
{% set notes_software = intake.workforce.notes_software | default('[TO CONFIRM]', true) %}
{% set training_platform = intake.workforce.training_platform | default('[TO CONFIRM]', true) %}

# Safeguarding Policy — Violence, Abuse, Neglect, Exploitation and Discrimination

## Purpose

This policy states {{ org.name }}'s zero tolerance of violence, abuse, neglect, exploitation and discrimination against participants, and sets out how {{ org.name }} prevents, recognises, responds to and reports it in the homes it supports. It evidences NDIS Practice Standards Core Module outcome 1.5 (Violence, abuse, neglect, exploitation and discrimination) and the SIL supplementary module outcome on safeguarding in the home, and it is implemented with the Incident Management Policy and Procedure and the Complaints and Feedback Policy.

## Scope

This policy applies to every participant supported by {{ org.name }}, in the home, in the community and in any {{ org.name }} vehicle; to conduct by workers, key personnel, agency staff, contractors, visitors, family members, other residents and members of the public; and to conduct that occurs outside {{ org.name }}'s supports that workers become aware of. {{ org.name }} currently supports {% set total = namespace(n=0) %}{% for home in intake.homes %}{% set total.n = total.n + home.participants %}{% endfor %}{{ total.n }} participants across {{ intake.homes | length }} home{% if intake.homes | length != 1 %}s{% endif %}, {% if intake.homes | selectattr('co_tenants') | list | length > 0 %}including shared homes where participants live with people they did not choose to live with, which is itself a safeguarding risk this policy addresses{% else %}each single-occupancy{% endif %}.{% if intake.history.reportable_incidents_last_12m is defined %} In the last 12 months {{ org.name }} recorded {{ intake.history.reportable_incidents_last_12m }} reportable incident{% if intake.history.reportable_incidents_last_12m != 1 %}s{% endif %}; the lessons from any such incidents are reflected in this policy.{% endif %}

## Policy statement

### Zero tolerance

{{ org.name }} does not tolerate any form of violence, abuse, neglect, exploitation or discrimination against a participant, by anyone. Every worker has a personal obligation under the NDIS Code of Conduct to take all reasonable steps to prevent and respond to all forms of violence, exploitation, neglect and abuse and to sexual misconduct, and to promptly raise concerns about matters that may affect the quality and safety of supports. Failing to report is itself a breach of this policy.

### What {{ org.name }} means by these terms

- **Violence and physical abuse**: hitting, pushing, rough handling, force-feeding, over- or under-medicating, unauthorised physical restraint, or threats of any of these.
- **Sexual abuse and misconduct**: any sexual contact without free and informed consent, sexual comments, exposure, grooming, sharing intimate images, or a worker having a sexual relationship with a participant (which is never consensual in the eyes of this policy because of the power imbalance).
- **Psychological and emotional abuse**: humiliation, shouting, threats, intimidation, ignoring, treating an adult like a child, withholding affection or contact as punishment, or controlling behaviour.
- **Neglect**: failing to provide food, fluids, medication, hygiene, medical care, supervision, warmth, safe equipment or the supports in the participant's plan; leaving a participant unattended contrary to their support plan; ignoring a mealtime, health or behaviour support plan.
- **Financial exploitation**: misusing a participant's money, cards, NDIS funding or property; borrowing from a participant; charging for supports not delivered; using a participant's vehicle, food or home for a worker's benefit; pressuring a participant to buy things or to give gifts.
- **Restrictive practice misuse**: any seclusion, or chemical, mechanical, physical or environmental restraint, that is not in accordance with a behaviour support plan and the required state or territory authorisation.
- **Discrimination**: treating a participant less favourably or excluding them because of disability, race, culture, religion, gender, sexuality, age or any other attribute, including by co-residents.
- **Systemic abuse**: routines, rosters or household rules that exist for staff convenience and restrict participants' rights (locked kitchens, set bedtimes, no visitors, "everyone goes out together").

### Recognising indicators in a group home

Workers are trained through {{ training_platform }} to notice and report the indicators below, which are often the only way abuse in a shared home comes to light:

- unexplained bruises, burns, fractures, pressure injuries, weight loss, dehydration, poor hygiene or untreated medical conditions;
- a participant who becomes withdrawn, fearful, tearful or agitated around a particular worker or co-resident, or who does not want to return home;
- changes in sleep, eating or behaviour; new or increased incidents of self-harm or behaviours of concern;
- missing money, cards, phones or possessions; unexplained purchases; a participant regularly "lending" to a worker or resident; NDIS statements that do not match delivered supports;
- a worker who discourages other workers or family from spending time alone with a participant, who is over-familiar, who gives gifts, or who insists on particular shifts with a particular participant;
- restricted access to phone, mail, friends, family or the community; a participant who is always "asleep" or "unwell" when visitors call;
- routines or rules in a home that do not appear in any participant's plan.

### Co-resident risks in shared homes

In shared homes, participants may be harmed by other residents. {{ org.name }} treats this as a foreseeable risk and manages it by:

- assessing compatibility with all current residents before anyone moves in, including known behaviours, vulnerabilities, sexual safety and communication;
- keeping a current house-level risk assessment and, where a participant has behaviours of concern, a behaviour support plan and individual safety plan that other residents' plans take into account;
- making sure rostered support levels reflect the actual mix of residents ({{ rostering_manager }} reviews staffing when a resident's needs change);
- giving each resident private space, a lockable door where they want one, and a way to call for help;
- treating resident-to-resident assault, sexual contact without consent, intimidation or theft as incidents (and where they meet the criteria, reportable incidents) and supporting both the person harmed and the person who caused harm;
- reviewing the living arrangement with the participants if the risk cannot be reduced, so that no participant is left living with someone who harms them.

### Prevention

- All workers hold a current NDIS Worker Screening clearance before working unsupervised{% if intake.workforce.screening_all_current %} (all current workers hold a clearance){% else %} ([TO CONFIRM: not all current workers hold a current clearance; the Director must resolve this before lodgement]){% endif %}, plus reference checks and induction covering this policy, the NDIS Code of Conduct and the participant rights statement.
- Supervision includes unannounced visits to homes, including evening and weekend shifts, by {{ quality_lead }} or {{ rostering_manager }}.
- Participants are told, in accessible ways, what abuse is, that they can say no, and how to complain to {{ org.name }} or directly to the NDIS Quality and Safeguards Commission, the police or an advocate.
- Participant money is handled under the Participant Money and Property Policy, with two-person checks and receipts.
- Restrictive practices are used only as described in the Restrictive Practices Policy{% if intake.supports.restrictive_practices == 'none' %}; none are currently used{% endif %}.

### Response

Any worker who witnesses, suspects or is told about violence, abuse, neglect, exploitation or discrimination must:

1. make the participant safe and give first aid or call 000 if there is injury, danger or a crime in progress;
2. not confront the alleged perpetrator or investigate themselves, and preserve any evidence;
3. tell {{ incident_officer }} (Incident Officer) by phone immediately, and the Director if the Incident Officer is unavailable or is the subject of the concern;
4. record the incident in {{ incident_software }} before the end of the shift, in the participant's words where possible;
5. continue to support the participant, including their right to contact police, an advocate or family.

{{ org.name }} then follows the Incident Management Policy and Procedure: the participant is supported and offered open disclosure, the Commission is notified within the reportable incident timeframes (24 hours for abuse, neglect, unlawful sexual or physical contact, sexual misconduct, serious injury or death; 5 business days for an unauthorised restrictive practice), police are informed of any suspected crime, an alleged perpetrator who is a worker is stood down from contact with participants pending investigation, and the participant is protected from any retaliation. Concerns about a participant's safety in the community or by family members are also reported to the relevant state safeguarding body{% if 'NSW' in org.states %} (in NSW, the Ageing and Disability Commissioner){% endif %} and, where the participant consents or the risk is serious, to police.

### Protection for people who report

No worker, participant, family member or other person will suffer any detriment for raising a concern in good faith. Concerns may be raised anonymously to the Director, the Commission or under the Whistleblower Protection Policy.

## Roles and responsibilities

| Role | Responsibilities under this policy |
|---|---|
| Director — {{ director }} | Sets the zero-tolerance standard; decides stand-downs and disciplinary action; is notified of every allegation against a worker; ensures the Commission is notified within the required timeframe; reviews safeguarding trends at governance meetings. |
| Incident Officer — {{ incident_officer }} | Receives all reports; makes immediate safety decisions; lodges reportable incident notifications; leads or commissions investigations; arranges participant support; maintains the Incident Register. |
| Quality Lead — {{ quality_lead }} | Owns this policy; delivers safeguarding training; conducts unannounced home visits; runs compatibility and house-level risk assessments; audits homes for systemic restrictive routines. |
| Complaints Officer — {{ complaints_officer }} | Recognises complaints that disclose abuse or neglect and passes them to the Incident Officer the same day. |
| Rostering Manager — {{ rostering_manager }} | Verifies worker screening before rostering; adjusts rosters to remove a stood-down worker; reviews staffing levels when co-resident risk changes. |
| Support workers | Prevent, recognise, respond and report as above; comply with the NDIS Code of Conduct; take part in training and supervision. |

## Records kept

- Incident reports ({{ incident_software }}) and the Incident Register, including reportable incident notifications and Commission correspondence
- Worker Screening Register and reference-check records
- Compatibility assessments and house-level risk assessments for each home
- Behaviour support plans, individual safety plans and restrictive practice records (or documented non-use)
- Training records for safeguarding, NDIS Code of Conduct and worker orientation modules
- Unannounced visit records and supervision notes
- Participant Money and Property records

## Related documents

- Incident Management Policy and Procedure (including reportable incidents)
- Open Disclosure Procedure
- Complaints and Feedback Policy and Procedure
- Whistleblower Protection Policy
- Restrictive Practices Policy
- Participant Money and Property Policy
- Human Resources Policy, Recruitment and Selection Procedure and Worker Screening Register
- Risk Management Policy and Framework (house-level and participant-level risk assessment)
- Participant Rights Statement

## Legislation and standards references

- National Disability Insurance Scheme Act 2013 (Cth), including sections 73Y (incident management system) and 73Z (reportable incidents)
- NDIS (Incident Management and Reportable Incidents) Rules 2018
- NDIS (Code of Conduct) Rules 2018 — the NDIS Code of Conduct
- NDIS (Provider Registration and Practice Standards) Rules 2018 — NDIS Practice Standards, Core Module outcome 1.5
- NDIS Practice Standards, SIL supplementary module (registration group 0138, 2026), safeguarding outcome
- NDIS (Restrictive Practices and Behaviour Support) Rules 2018
- NDIS (Practice Standards — Worker Screening) Rules 2018
- Disability Discrimination Act 1992 (Cth); Criminal Code Act 1995 (Cth)
{% if 'NSW' in org.states %}
- Crimes Act 1900 (NSW); Ageing and Disability Commissioner Act 2019 (NSW); Work Health and Safety Act 2011 (NSW)
{% endif %}
{% if 'VIC' in org.states %}
- Crimes Act 1958 (Vic); Disability Act 2006 (Vic); Occupational Health and Safety Act 2004 (Vic)
{% endif %}
{% if 'QLD' in org.states %}
- Criminal Code Act 1899 (Qld); Disability Services Act 2006 (Qld); Work Health and Safety Act 2011 (Qld)
{% endif %}
{% if 'SA' in org.states %}
- Criminal Law Consolidation Act 1935 (SA); Disability Inclusion Act 2018 (SA); Work Health and Safety Act 2012 (SA)
{% endif %}
{% if 'WA' in org.states %}
- Criminal Code Act Compilation Act 1913 (WA); Work Health and Safety Act 2020 (WA)
{% endif %}
{% if 'TAS' in org.states %}
- Criminal Code Act 1924 (Tas); Work Health and Safety Act 2012 (Tas)
{% endif %}
{% if 'ACT' in org.states %}
- Crimes Act 1900 (ACT); Senior Practitioner Act 2018 (ACT); Work Health and Safety Act 2011 (ACT)
{% endif %}
{% if 'NT' in org.states %}
- Criminal Code Act 1983 (NT); Work Health and Safety (National Uniform Legislation) Act 2011 (NT)
{% endif %}

## Review

Reviewed every 12 months by the Quality Lead ({{ quality_lead }}) and approved by the Director ({{ director }}); reviewed within one month after any reportable incident involving abuse, neglect, sexual misconduct or unlawful contact, and after any change to the NDIS Code of Conduct or the Incident Rules.

## Document control

| Version | Drafted | Approved by | Approval date | Next review |
|---|---|---|---|---|
| 1.0 | {{ intake.meta.generated_on | date }} | {{ director }} | [TO CONFIRM on adoption] | 12 months after approval |
