---
title: Diversity and Cultural Safety Policy
slug: diversity-cultural-safety
doc_type: policy
standards: [core-1.2]
applies_if: "true"
version: 1.0
review_months: 12
---
{% set director = intake.governance.ceo_or_director | default('[TO CONFIRM]', true) %}
{% set quality_lead = intake.governance.quality_lead | default('[TO CONFIRM]', true) %}
{% set rostering_manager = intake.governance.rostering_manager | default('[TO CONFIRM]', true) %}
{% set complaints_officer = intake.governance.complaints_officer | default('[TO CONFIRM]', true) %}
{% set notes_software = intake.workforce.notes_software | default('[TO CONFIRM]', true) %}
{% set training_platform = intake.workforce.training_platform | default('[TO CONFIRM]', true) %}

# Diversity and Cultural Safety Policy

## Purpose

This policy sets out how {{ org.name }} respects and responds to each participant's culture, language, faith, gender, sexuality, age, disability and personal values in the way it plans and delivers Supported Independent Living (SIL) supports. It evidences NDIS Practice Standards Core Module outcome 1.2 (Individual values and beliefs): each participant accesses supports that respect their culture, diversity, values and beliefs.

## Scope

This policy applies to all participants supported by {{ org.name }} in its {{ intake.homes | length }} home{% if intake.homes | length != 1 %}s{% endif %} in {{ org.states | join(', ') }}, to their families and chosen supporters, and to all {{ intake.workforce.headcount | default('[TO CONFIRM]', true) }} workers, key personnel, agency workers and contractors. It covers support planning, day-to-day support, rostering, food and household routines, religious and cultural observance, relationships and sexuality, and the way {{ org.name }} recruits and trains its workforce.

## Policy statement

{{ org.name }} will:

- treat each participant's identity, culture, language, religion, gender identity, sexual orientation, family structure, age and life history as central to who they are and how they want to be supported, not as an add-on to the support plan;
- ask, listen and record rather than assume — a participant's own description of their culture and values is recorded in their About Me profile in {{ notes_software }} and reviewed at every support plan review;
- provide supports in a way that is culturally safe, meaning the participant, not the worker, decides whether the support respects their culture;
- recognise the distinct position of Aboriginal and Torres Strait Islander participants, including connection to Country, family and community, the effect of past institutional practices on trust, and the participant's right to culturally appropriate supports and, where wanted, Aboriginal Community Controlled services;
- support participants from culturally and linguistically diverse backgrounds to communicate in their preferred language, using accredited interpreters (Translating and Interpreting Service, 131 450) for important decisions, service agreements, complaints and health matters — family members and co-residents are not used as interpreters for these matters unless the participant specifically chooses that and the matter is not sensitive;
- respect the participant's faith and cultural practices in the home, including prayer, dietary laws, fasting, dress, festivals, mourning practices and end-of-life wishes, and plan the roster and household routines so these can be observed;
- support participants who are LGBTQIA+ to live openly and safely in their home, use their chosen name and pronouns in all records and conversations, and choose who is told about their identity;
- respect the participant's preferences about the gender, cultural background and language of the workers who support them, particularly for personal care, and record where a preference cannot always be met and what alternative was agreed;
- make sure shared households accommodate diversity: in {{ org.name }}'s shared homes, meal planning, use of shared spaces, television and music, visitors and celebrations are negotiated so that no participant's culture or beliefs are marginalised by the majority or by workers' habits;
- take prompt action, under the Safeguarding and Complaints policies, on any discrimination, vilification, exclusion or harassment of a participant by a worker, another resident, a visitor or a contractor;
- recruit, induct and train a workforce that reflects and understands the communities it supports, including mandatory cultural safety and diversity training via {{ training_platform }} at induction and refreshed at least every two years.

### What this looks like in practice

- Food: the weekly menu in each home is built from participants' preferences and dietary requirements (religious, cultural, ethical{% if intake.supports.mealtime_management %} and any mealtime management plan{% endif %}), and workers do not substitute their own preferences.
- Communication: information about supports, rights, complaints and service agreements is available in Easy Read and, where a participant needs it, in translated or audio form; workers use the participant's communication aids and preferred language on every shift.
- Relationships and sexuality: participants have the right to relationships, intimacy and sexual expression consistent with their values; workers support privacy and safety without moralising.
- Celebrations and observance: participants are supported to attend places of worship, cultural events and community gatherings, and to celebrate significant days at home.
- Records: names, pronouns, preferred language, cultural and religious identity, and any cultural considerations for personal care, health treatment or death are recorded on the About Me profile with the participant's consent.

## Roles and responsibilities

| Role | Responsibilities under this policy |
|---|---|
| Director — {{ director }} | Approves this policy; sets the expectation that discrimination or cultural disrespect by any worker is a serious conduct matter; ensures interpreter, translation and training costs are budgeted. |
| Quality Lead — {{ quality_lead }} | Owns this policy; ensures each About Me profile captures culture, language, faith and identity in the participant's words; arranges interpreters and translated materials; schedules cultural safety training; reviews complaints and incidents for discrimination themes. |
| Rostering Manager — {{ rostering_manager }} | Matches workers to participants' gender, language and cultural preferences wherever possible; records unmet preferences and alternatives; briefs agency and casual workers on each participant's cultural needs before a shift. |
| Complaints Officer — {{ complaints_officer }} | Handles complaints about discrimination, disrespect or exclusion under the Complaints and Feedback Procedure; ensures the complainant is not disadvantaged. |
| Support workers | Learn and respect each participant's culture and values; use chosen names and pronouns; follow dietary and religious requirements; never mock, exclude or pressure a participant about their identity or beliefs; report discrimination or disrespect they witness. |

## Procedure — building culture and values into supports

1. At intake, {{ quality_lead }} asks the participant (and, if the participant wishes, their family or supporters) about culture, language, faith, identity, important relationships, food, routines and any practices that must be respected, using an interpreter if needed, and records this on the About Me profile.
2. The participant's worker preferences (gender, language, cultural background) are recorded and passed to {{ rostering_manager }}.
3. The support plan and household routines are adjusted to accommodate observances (for example prayer times, fasting periods, dietary laws, days of significance) and shared with all workers through {{ notes_software }}.
4. Workers use the profile on every shift; anything new the participant shares is added to the profile with the participant's agreement.
5. At each support plan review the participant is asked whether their culture and values are being respected and what should change.
6. Any concern that a participant has been discriminated against or culturally disrespected is recorded as an incident or complaint on the day it is identified and managed under the relevant policy.

## Records kept

- About Me profile and support plan ({{ notes_software }}) including culture, language, faith, identity and worker preferences
- Interpreter and translation bookings and translated documents
- Roster notes on preference matching ({{ intake.workforce.rostering_software | default('[TO CONFIRM]', true) }})
- Training records for cultural safety and diversity training (Training Register)
- Complaints Register and Incident Register entries relating to discrimination

## Related documents

- Person-Centred Supports Policy
- Supported Decision-Making Policy and Procedure
- Safeguarding Policy (violence, abuse, neglect, exploitation and discrimination)
- Complaints and Feedback Policy and Procedure
- Human Resources Policy and Recruitment and Selection Procedure
- Induction Policy and Training Register
- Mealtime Management Policy

## Legislation and standards references

- National Disability Insurance Scheme Act 2013 (Cth), section 4 (general principles) 
- NDIS (Provider Registration and Practice Standards) Rules 2018 — NDIS Practice Standards, Core Module outcome 1.2 Individual values and beliefs
- NDIS Practice Standards, SIL supplementary module (registration group 0138, 2026)
- NDIS (Code of Conduct) Rules 2018 — the NDIS Code of Conduct
- Disability Discrimination Act 1992 (Cth); Racial Discrimination Act 1975 (Cth); Sex Discrimination Act 1984 (Cth); Age Discrimination Act 2004 (Cth); Australian Human Rights Commission Act 1986 (Cth)
- United Nations Convention on the Rights of Persons with Disabilities; United Nations Declaration on the Rights of Indigenous Peoples
{% if 'NSW' in org.states %}
- Anti-Discrimination Act 1977 (NSW)
{% endif %}
{% if 'VIC' in org.states %}
- Equal Opportunity Act 2010 (Vic); Charter of Human Rights and Responsibilities Act 2006 (Vic)
{% endif %}
{% if 'QLD' in org.states %}
- Anti-Discrimination Act 1991 (Qld); Human Rights Act 2019 (Qld)
{% endif %}
{% if 'SA' in org.states %}
- Equal Opportunity Act 1984 (SA)
{% endif %}
{% if 'WA' in org.states %}
- Equal Opportunity Act 1984 (WA)
{% endif %}
{% if 'TAS' in org.states %}
- Anti-Discrimination Act 1998 (Tas)
{% endif %}
{% if 'ACT' in org.states %}
- Discrimination Act 1991 (ACT); Human Rights Act 2004 (ACT)
{% endif %}
{% if 'NT' in org.states %}
- Anti-Discrimination Act 1992 (NT)
{% endif %}

## Review

Reviewed every 12 months by the Quality Lead ({{ quality_lead }}) and approved by the Director ({{ director }}), with participant input gathered through support plan reviews and household meetings. Reviewed earlier if a complaint, incident or audit finding relates to cultural safety or discrimination.

## Document control

| Version | Drafted | Approved by | Approval date | Next review |
|---|---|---|---|---|
| 1.0 | {{ intake.meta.generated_on | date }} | {{ director }} | [TO CONFIRM on adoption] | 12 months after approval |
