---
title: Waste Management and Infection Control Policy
slug: waste-management-infection-control
doc_type: policy
standards: [core-4.5]
applies_if: "true"
version: 1.0
review_months: 12
---
{% set gov = intake.governance %}{% set wf = intake.workforce %}{% set sup = intake.supports %}
{% set director = gov.ceo_or_director | default('[TO CONFIRM]', true) %}{% set quality_lead = gov.quality_lead | default('[TO CONFIRM]', true) %}{% set whs_officer = gov.whs_officer | default('[TO CONFIRM]', true) %}{% set rostering_manager = gov.rostering_manager | default('[TO CONFIRM]', true) %}{% set incident_officer = gov.incident_officer | default('[TO CONFIRM]', true) %}
{% set incident_software = wf.incident_software | default('[TO CONFIRM]', true) %}{% set notes_software = wf.notes_software | default('[TO CONFIRM]', true) %}{% set training_platform = wf.training_platform | default('[TO CONFIRM]', true) %}
{% set whs_act = {'NSW': 'Work Health and Safety Act 2011 (NSW)', 'VIC': 'Occupational Health and Safety Act 2004 (Vic)', 'QLD': 'Work Health and Safety Act 2011 (Qld)', 'SA': 'Work Health and Safety Act 2012 (SA)', 'TAS': 'Work Health and Safety Act 2012 (Tas)', 'ACT': 'Work Health and Safety Act 2011 (ACT)', 'NT': 'Work Health and Safety (National Uniform Legislation) Act 2011 (NT)', 'WA': 'Work Health and Safety Act 2020 (WA)'} %}
{% set ph_act = {'NSW': 'Public Health Act 2010 (NSW)', 'VIC': 'Public Health and Wellbeing Act 2008 (Vic)', 'QLD': 'Public Health Act 2005 (Qld)', 'SA': 'South Australian Public Health Act 2011 (SA)', 'WA': 'Public Health Act 2016 (WA)', 'TAS': 'Public Health Act 1997 (Tas)', 'ACT': 'Public Health Act 1997 (ACT)', 'NT': 'Public and Environmental Health Act 2011 (NT)'} %}
{% set env_act = {'NSW': 'Protection of the Environment Operations Act 1997 (NSW)', 'VIC': 'Environment Protection Act 2017 (Vic)', 'QLD': 'Environmental Protection Act 1994 (Qld)', 'SA': 'Environment Protection Act 1993 (SA)', 'WA': 'Environmental Protection Act 1986 (WA)', 'TAS': 'Environmental Management and Pollution Control Act 1994 (Tas)', 'ACT': 'Environment Protection Act 1997 (ACT)', 'NT': 'Waste Management and Pollution Control Act 1998 (NT)'} %}
# Waste Management and Infection Control Policy

## Purpose

Core Module outcome 4.5 requires that each participant, each worker and every other person in the service environment is protected from harm from exposure to waste, infectious or hazardous substances. In a SIL home this means household rubbish handled hygienically, continence and clinical waste contained, sharps never loose, chemicals stored safely, and infection prevented from spreading between people who share a home. This policy sets out how {{ org.name }} manages general, clinical and hazardous waste and sharps, how workers apply standard infection prevention precautions every day, and how an outbreak of an infectious illness in a home is managed.

## Scope

This policy applies to every worker ({{ wf.employment_types | join(', ') }}), key personnel, agency worker, contractor and visitor of {{ org.name }} in every home ({% for home in intake.homes %}{{ home.name }}{% if not loop.last %}, {% endif %}{% endfor %}){% if sup.transport %}, in vehicles{% endif %} and in the community. It covers general waste and recycling, continence and sanitary waste, clinical and related waste, sharps, pharmaceutical waste, cleaning chemicals and other hazardous substances, laundry, food handling, and infectious illness.

## Policy statement

- **Waste is separated and contained.** Each home has labelled general waste and recycling bins that follow the local council's collection rules, a lidded bin with liners for continence and sanitary waste, and, where any participant uses needles, lancets or other sharps, an approved rigid sharps container (meeting the Australian Standard for non-reusable sharps containers) kept out of the reach of others.
- **Clinical and related waste.** Waste contaminated with blood or body fluids in a way that could transmit infection, dressings from infected wounds, and any waste a health practitioner or public health unit says must be treated as clinical waste is double-bagged, kept separate, and disposed of through a licensed clinical waste service arranged by {{ whs_officer }}. Continence aids and small quantities of soiled items from a participant who is not infectious are bagged and placed in general waste, as the local council and state guidelines allow.
- **Sharps are never handled loose.** Only the person using a sharp (or a health practitioner) handles it; it goes straight into the sharps container without recapping; a full container is sealed and disposed of through the participant's pharmacy, a community sharps disposal service or the council's program. A needlestick injury is a WHS incident with immediate first aid and medical review.
- **Pharmaceutical waste** (expired, ceased or refused medication) is returned to the pharmacy under the Medication Management Policy and is never put in bins or drains.
- **Hazardous substances.** Cleaning products and other chemicals are stored in their original labelled containers in a locked or secured cupboard, with a safety data sheet available in the home, and are never decanted into food or drink containers. Where a participant's safety requires a chemical to be locked away, the arrangement is recorded and reviewed so that it does not become an environmental restraint.
- **Standard precautions, every person, every time.** Workers practise hand hygiene (the five moments: before touching a participant, before a procedure, after body fluid exposure risk, after touching a participant, and after touching their surroundings), use gloves, aprons and eye protection where there is a risk of contact with blood or body fluids, cover cuts, handle soiled linen without shaking it, clean and disinfect surfaces, and follow cough etiquette.
- **Cleaning and laundry.** Each home has a cleaning schedule for bathrooms, kitchens, high-touch surfaces and equipment; participants take part in household tasks as they choose under their support plans. Soiled laundry is washed separately on the hottest cycle the item allows.
- **Food safety.** Food is stored at safe temperatures, prepared with clean hands and equipment, kept separate when raw and cooked, dated when opened, and discarded when expired{% if sup.mealtime_management %}; texture-modified foods and thickened fluids are prepared fresh and stored as the Mealtime Management Policy requires{% endif %}.
- **Worker health.** Workers do not work while they have vomiting, diarrhoea, fever or an infectious rash, and do not return until symptom-free for the period public health guidance requires (48 hours after the last gastroenteritis symptom). {{ org.name }} encourages and records annual influenza vaccination and other vaccinations recommended for disability workers, and provides information about hepatitis B vaccination where a worker may be exposed to blood.
- **Outbreaks are managed early.** Two or more people in a home with similar infectious symptoms (for example vomiting or diarrhoea, or an influenza-like or COVID-like illness) within a short period is treated as a suspected outbreak, and the outbreak procedure below begins immediately.

## Roles and responsibilities

| Role | Responsibilities |
|---|---|
| {{ director }} | Approves waste and clinical waste contracts and outbreak resources; approves this policy. |
| {{ whs_officer }} | Owns this policy; arranges clinical waste and sharps disposal services; keeps safety data sheets; leads outbreak management; liaises with the public health unit; reports to {{ director }}. |
| {{ quality_lead }} | Audits infection control practice and cleaning schedules in each home twice a year; reviews infection-related incidents for learning; ensures training on {{ training_platform }} is current. |
| {{ rostering_manager }} | Adjusts rosters during an outbreak so that workers are, where possible, dedicated to one home; excludes unwell workers. |
| {{ incident_officer }} | Records needlestick injuries, exposures and outbreak-related incidents in {{ incident_software }}. |
| House leaders | Keep bins, sharps containers, PPE and cleaning supplies stocked; run the cleaning schedule; report a suspected outbreak the same day; support participants' hygiene routines. |
| Support workers | Apply standard precautions; handle waste as this policy states; report exposures, needlestick injuries and symptoms in participants or themselves; do not attend work while infectious. |

## Procedure

### Part A — Daily waste handling

1. Place general waste, recycling, and bagged continence or sanitary waste in the correct bins; tie bags; wash hands after handling.
2. Put any sharp straight into the sharps container; when the container reaches its fill line, seal it and give it to the house leader for disposal; record the disposal in {{ notes_software }}.
3. Double-bag and set aside any clinical waste; tell the house leader the same shift so that {{ whs_officer }} can arrange collection.
4. Return ceased or expired medication to the pharmacy through the house leader.
5. Clean up blood or body fluid spills promptly wearing gloves and apron: absorb, clean with detergent, disinfect with a suitable product, bag the waste, and wash hands.

### Part B — Exposure or needlestick injury

1. Wash the area with soap and running water (flush eyes or mouth with water); cover with a dressing.
2. Phone the house leader immediately and seek medical assessment the same day for post-exposure advice.
3. Report in {{ incident_software }}; {{ whs_officer }} manages follow-up and, where the exposure is a notifiable incident, notifies the regulator under the Work Health and Safety Policy.

### Part C — Suspected outbreak

1. The house leader phones {{ whs_officer }} and {{ rostering_manager }} the same day, records each affected person's symptoms and onset time in {{ notes_software }}, and arranges medical review of unwell participants; anyone with breathing difficulty, dehydration or other deterioration is escalated under the Health and Wellbeing Policy.
2. {{ whs_officer }} contacts the local public health unit for advice and notifies it where the disease or the outbreak is notifiable under the public health legislation of the state, and notifies the NDIS Commission where required by {{ org.name }}'s conditions of registration or a Commission direction.
3. Transmission-based precautions begin: unwell participants are supported to stay in their rooms where they agree and it is safe (never locked in), share bathrooms are allocated where possible, workers wear the PPE the public health unit advises, high-touch surfaces are cleaned at least twice daily, and visitors are asked to delay non-essential visits.
4. {{ rostering_manager }} dedicates workers to the affected home where possible, excludes symptomatic workers, and cancels non-essential group activities.
5. Participants' families, guardians and support coordinators are told with consent; participants are kept informed in a way they understand.
6. The outbreak is closed when the public health unit or the guidance it provides confirms the outbreak period has ended. {{ whs_officer }} records the outbreak on the incident register and {{ quality_lead }} reviews it for learning.

## Records kept

- Cleaning schedules and completion records for each home.
- Sharps and clinical waste disposal records; safety data sheets.
- Exposure and needlestick reports and follow-up in {{ incident_software }}.
- Outbreak logs, public health unit correspondence and closure records.
- Worker vaccination and exclusion records; Training Register entries for infection control and safe waste handling.
- {{ quality_lead }}'s twice-yearly infection control audits.

## Related documents

- whs-work-health-safety
- safe-environment-property
- health-wellbeing
- medication-management
- mealtime-management
- incident-management
- emergency-disaster-management
- induction-training-competency
- restrictive-practices-behaviour-support

## Legislation and standards references

- National Disability Insurance Scheme Act 2013 (Cth)
- NDIS (Provider Registration and Practice Standards) Rules 2018 — Core Module outcome 4.5 (management of waste)
- NDIS Code of Conduct (NDIS (Code of Conduct) Rules 2018)
- Australian Guidelines for the Prevention and Control of Infection in Healthcare (NHMRC, 2019)
- AS/NZS 3816:2018 Management of clinical and related wastes
{% for state in org.states %}- {{ whs_act[state | upper] | default('Work health and safety legislation of ' ~ state ~ ' [TO CONFIRM]') }} (hazardous substances, exposure and notifiable incidents)
- {{ ph_act[state | upper] | default('Public health legislation of ' ~ state ~ ' [TO CONFIRM]') }} (notifiable diseases and public health directions)
- {{ env_act[state | upper] | default('Environment protection and waste legislation of ' ~ state ~ ' [TO CONFIRM]') }} and local council waste rules
{% endfor %}

## Review

This policy is reviewed every 12 months, after any outbreak or exposure incident, and when public health guidance changes. Review owner: {{ whs_officer }}. Approval: {{ director }}.

## Document control

| Version | Approved by | Approval date | Next review |
|---|---|---|---|
| 1.0 | {{ director }} | [TO CONFIRM] | [TO CONFIRM — 12 months after approval] |
