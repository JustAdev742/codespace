# Document template specification (engine input)

Every client document is a Markdown file in `content/policies/<slug>.md` rendered with Jinja2 against an intake JSON, then exported to DOCX/HTML by `engine/render.py`.

## Front matter (YAML, required)
```
---
title: Incident Management Policy and Procedure
slug: incident-management
doc_type: policy            # policy | procedure | register | template | plan | agreement | statement
standards: [core-1.5, core-2.1, sil-2]   # outcome codes this document evidences
applies_if: "true"          # Jinja expression; document is skipped when false, e.g. "intake.supports.medication_involvement != 'none'"
version: 1.0
review_months: 12
---
```

## Body rules
- Markdown only: `#` H1 (document title, once), `##`/`###` headings, paragraphs, `-` bullet lists, `1.` numbered lists, tables using `|` pipes, **bold**. No HTML.
- Use Jinja2 for tailoring: `{{ org.name }}`, `{% if ... %}...{% endif %}`, `{% for home in intake.homes %}...{% endfor %}`. Filters available: `default`, `join`, `length`, `upper`, `title`, `date` (formats an ISO date as 'D Month YYYY').
- Every document must contain, in this order: Purpose · Scope · Policy statement (for policies) · Roles and responsibilities (using the provider's actual named roles from `intake.governance`) · Procedure (numbered steps, for procedures) · Records kept (named registers/forms) · Related documents · Legislation and standards references · Review (frequency, owner) · Document control table (version, approved by, approval date, next review).
- Plain English, Australian spelling, present tense, second person avoided. Written as the provider's own policy ("{{ org.name }} will…"), not as advice.
- Tailoring is mandatory, not decorative: use intake facts wherever a real policy would differ (number and location of homes, roster model, who holds the tenancy, medication involvement, restrictive practices, software used, named responsible roles, states of operation and the corresponding state WHS/tenancy legislation).
- Legal references must be accurate and current: NDIS Act 2013; NDIS (Provider Registration and Practice Standards) Rules 2018; NDIS (Incident Management and Reportable Incidents) Rules 2018 (24-hour notification for death, serious injury, abuse/neglect, unlawful sexual or physical contact, sexual misconduct; 5 business days for unauthorised restrictive practice); NDIS (Complaints Management and Resolution) Rules 2018; NDIS (Restrictive Practices and Behaviour Support) Rules 2018; NDIS (Practice Standards—Worker Screening) Rules 2018; NDIS Code of Conduct; Privacy Act 1988 and the Australian Privacy Principles; the state/territory WHS Act and residential tenancies legislation for each state in `org.states`; NDIS Practice Standards Core Module and SIL supplementary module (2026, registration group 0138). If unsure of a citation, omit it rather than guess.
- Do not invent facts about the provider. If an intake field is empty, use `{{ field | default('[TO CONFIRM]') }}` so gaps are visible.
- Registers/templates: provide the table structure with column headings and one example row marked "(example — delete)".

## Intake JSON shape (available as `intake`; `org` is an alias for `intake.org`)
```
org: {name, trading_name, abn, entity_type (sole_trader|partnership|company|incorporated_association|other), address, phone, email, website, states: [NSW,...]}
key_personnel: [{name, role, email, phone}]
governance: {structure, has_board (bool), ceo_or_director, quality_lead, complaints_officer, incident_officer, privacy_officer, whs_officer, rostering_manager}
homes: [{name, address, state, participants (int), roster_model (twenty_four_seven|sleepover|active_night|drop_in), tenancy_holder (provider|sda_provider|private_landlord|participant), sda (bool), co_tenants (bool)}]
workforce: {headcount, employment_types: [permanent, casual, contractor, agency], screening_all_current (bool), rostering_software, notes_software, incident_software, training_platform, first_aid_all (bool)}
supports: {medication_involvement (none|prompt|administer), restrictive_practices (none|authorised|in_use_unauthorised), behaviour_support_plans (bool), high_intensity (bool), mealtime_management (bool), transport (bool), participant_money_handling (bool)}
history: {years_operating, incidents_last_12m, complaints_last_12m, reportable_incidents_last_12m, previous_audit (bool), existing_policies (bool)}
registration: {groups: ['0138', ...], auditor_chosen, target_lodgement_date (ISO), application_started (bool)}
meta: {generated_on (ISO), consultant_name}
```
Outcome codes: core-1.1 … core-1.5 (rights), core-2.1 … core-2.6 plus core-2.7 continuity, core-2.8 emergency (governance), core-3.1 access, core-3.2 support planning, core-3.3 service agreements, core-3.4 responsive support, core-3.5 transitions, core-4.1 safe environment, core-4.2 money & property, core-4.3 medication, core-4.4 mealtime, core-4.5 waste; sil-1 supported decision-making, sil-2 safeguarding, sil-3 practice governance/workforce, sil-4 tenancy-housing-support agreements.
