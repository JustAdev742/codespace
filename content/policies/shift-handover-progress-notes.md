---
title: Shift Handover and Progress Notes Procedure
slug: shift-handover-progress-notes
doc_type: procedure
standards: [core-3.4, sil-3, core-2.4]
applies_if: "true"
version: 1.0
review_months: 12
---
{% set gov = intake.governance %}{% set wf = intake.workforce %}{% set sup = intake.supports %}
{% set director = gov.ceo_or_director | default('[TO CONFIRM]', true) %}{% set quality_lead = gov.quality_lead | default('[TO CONFIRM]', true) %}{% set rostering_manager = gov.rostering_manager | default('[TO CONFIRM]', true) %}{% set privacy_officer = gov.privacy_officer | default('[TO CONFIRM]', true) %}
{% set rostering_software = wf.rostering_software | default('[TO CONFIRM]', true) %}{% set notes_software = wf.notes_software | default('[TO CONFIRM]', true) %}{% set incident_software = wf.incident_software | default('[TO CONFIRM]', true) %}
# Shift Handover and Progress Notes Procedure

## Purpose

This procedure sets the standard for how {{ org.name }} workers record each participant's support in progress notes and hand over between shifts, so that support is responsive and continuous (Core Module outcome 3.4), consistent across workers and homes (SIL supplementary module outcome 3), and recorded in a way that respects the participant's voice and privacy.

## Scope

This procedure applies to every worker on every shift in every {{ org.name }} home ({% for home in intake.homes %}{{ home.name }}{% if not loop.last %}, {% endif %}{% endfor %}), including sleepover, active night, drop-in and agency workers. Progress notes are recorded in {{ notes_software }}. Incidents are recorded separately in {{ incident_software }} and referenced in the note.

## Roles and responsibilities

| Role | Responsibilities |
|---|---|
| {{ director }} | Approves this procedure; ensures {{ notes_software }} access controls and retention meet the Information Management Policy. |
| {{ quality_lead }} | Owns this procedure; audits notes and handovers quarterly; provides feedback and training on note quality. |
| {{ rostering_manager }} | Rosters handover overlap; ensures every worker has {{ notes_software }} access before their first shift and loses it on their last. |
| {{ privacy_officer }} | Advises on what may be recorded and shared; handles participant requests to access or correct their notes. |
| House leaders | Read notes for their home daily; run handovers when on shift; correct note quality issues in supervision. |
| All workers | Write notes to this standard during the shift; complete and receive handover; report anything urgent immediately rather than leaving it for the notes. |

## Procedure

### Part A — Progress note standards

1. **One note per participant per shift**, written in {{ notes_software }} against the correct participant, shift and worker. Notes for a home with several participants are written separately; another participant is never identifiable in a participant's note (use "a housemate").
2. **Contemporaneous.** Notes are written during the shift and completed before the worker leaves. A note written later is marked "late entry", with the actual time written and the reason. Notes are never pre-written.
3. **Objective and factual.** Record what was seen, heard and done: times, what support was offered, what the participant chose, what happened, and any follow-up needed. Do not record opinions, labels or diagnoses ("was manipulative", "had a meltdown"); describe behaviour and context instead ("at 6:10 pm, when told the bus was late, R raised his voice and left the room; he returned at 6:25 pm and chose to eat in his room").
4. **Participant voice.** Record what the participant said or communicated in their own words or communication method, in quotation marks where possible, especially about choices, complaints, goals and how they feel about the support. Record when a participant was offered a choice and what they decided.
5. **Linked to the plan.** Refer to the participant's goals and routines from the support plan (for example "Goal 2: cooking — J chose and prepared the pasta with verbal prompts").
6. **Health, medication and safety.** Record{% if sup.medication_involvement == 'administer' %} that medication was administered as per the Medication Administration Record (the MAR itself is the record of administration), any refusal, missed dose, PRN given and effect, and any error{% elif sup.medication_involvement == 'prompt' %} that the participant was prompted for their own medication and their response{% else %} any medication matter the participant raised (workers do not handle medication){% endif %}; observations of health or deterioration; meals and fluids where a mealtime or health plan requires; sleep; and any hazard.
7. **Restrictive practices.** {% if sup.restrictive_practices == 'none' %}{{ org.name }} does not use restrictive practices. If any practice that restricts the participant is used for any reason, record the full circumstances and report it immediately under the Incident Management Policy.{% else %}Every use of a regulated restrictive practice is recorded in the participant's restrictive practice record and referenced in the note, with the time, duration, reason, what was tried first and the participant's response; any use outside the behaviour support plan or authorisation is reported as an incident immediately.{% endif %}
8. **Incidents and complaints.** An incident or complaint is recorded in {{ incident_software }} and the note records only the reference number and the support given to the participant.
9. **Language.** Plain English, no abbreviations except those on the approved list in {{ notes_software }}, respectful, present tense, no slang.
10. **Corrections.** Errors are corrected by a new dated entry; nothing is deleted or overwritten. {{ notes_software }} audit trails are not disabled.
11. **Privacy.** Notes are written and read only in private, only by workers rostered to that participant, and never on personal devices except through {{ notes_software }} with the security settings in the Information Management Policy. Participants can read their own notes and ask for corrections through {{ privacy_officer }}.

### Part B — Shift handover

1. Handover occurs at every change of shift, in person where shifts overlap ({{ rostering_manager }} rosters at least 15 minutes' paid overlap where two workers follow each other in a home) and otherwise in writing in {{ notes_software }} using the Shift Handover Template.
2. Handover takes place where participants cannot be overheard, unless a participant asks to take part in their own handover, which {{ org.name }} encourages.
3. The outgoing worker completes the Shift Handover Template before leaving. The incoming worker reads the last 24 hours of notes and the handover before starting support, checks the medication chart and the day's appointments, and signs the handover as received in {{ notes_software }}.
4. Sleepover and active night workers complete the overnight section (interruptions, welfare checks, sleep, health observations) before the morning worker starts.
5. Anything urgent — a participant unwell, an incident, a missing item, a broken lock, a medication error — is reported by phone to the house leader or on-call manager at the time, not left for handover.
6. Agency and casual workers receive a verbal handover from the house leader or outgoing worker plus the participant summaries before their first task.
7. Where a shift is unfilled and there is no outgoing worker, the house leader phones the incoming worker with a verbal handover and records it.

### Part C — Monitoring

1. House leaders read the notes and handovers for their home daily and follow up actions.
2. {{ quality_lead }} audits a sample of 20 notes and 10 handovers per home each quarter against the standards in Part A, using the Progress Note Audit Tool (score each standard met/not met), gives feedback in supervision and reports results to the quality meeting.
3. Participants are asked at house meetings whether the notes reflect what they say and whether workers arrive knowing what happened on the last shift.

## Templates

### Shift handover template

| Section | Content (example — delete) |
|---|---|
| Home / date / shift | {{ intake.homes[0].name | default('[home]') }} / 01/08/2026 / evening (2 pm to 10 pm) then sleepover |
| Outgoing worker / incoming worker | A. Example / B. Example |
| Participants present | Initials only; who is out and expected return time |
| Health and wellbeing by participant | J: complained of headache 4 pm, rested, ate dinner; observe overnight. R: well. |
| Medication | {% if sup.medication_involvement == 'administer' %}All evening doses given as per MAR; PRN paracetamol given to J at 4:10 pm, effective by 5 pm{% elif sup.medication_involvement == 'prompt' %}Both participants prompted for evening medication; taken{% else %}Not applicable — no medication involvement{% endif %} |
| Meals and fluids | J: soft and bite-sized as per mealtime plan, ate all; R: cooked stir-fry with prompts |
| Mood, behaviour and any restrictive practice | R settled; no restrictive practice used |
| Incidents, near misses, complaints | Nil / reference number from {{ incident_software }} |
| Appointments and tasks due next shift | R: GP 10 am tomorrow, take health plan; bin night |
| Visitors and community | J's sister visiting Saturday; R going to football Sunday |
| Money and property | R: $40 withdrawn for football, receipt and transaction record completed |
| Hazards, maintenance, property | Bathroom light flickering — logged in maintenance log |
| Participant requests and decisions | J asked for pancakes Sunday and to change bedroom colour — add to house meeting agenda |
| Overnight section (sleepover or active night) | Interruptions: 2:15 am J woke, water, back to sleep 2:25 am; welfare checks recorded |
| Handover received by / time | B. Example / 2:05 pm |

### Progress note audit tool

| Standard | Met (Y/N) | Comment |
|---|---|---|
| Contemporaneous and completed before end of shift | | |
| Objective, factual, no labels | | |
| Participant's own words or communication recorded | | |
| Linked to plan goals and routines | | |
| Health, medication and safety recorded correctly | | |
| Restrictive practice or incident correctly referenced | | |
| No other participant identifiable | | |
| Corrections made by new entry | | |

## Records kept

- Progress notes and shift handovers in {{ notes_software }}, retained in accordance with the Records Retention Schedule (minimum 7 years after the record is made, or longer where a participant is a child).
- Progress Note Audit Tool results and quality meeting minutes.
- Participant requests to access or correct notes.

## Related documents

- practice-governance-workforce-consistency
- assessment-support-planning
- incident-management
- privacy-confidentiality
- information-management
- medication-management
- restrictive-practices-behaviour-support
- health-wellbeing

## Legislation and standards references

- National Disability Insurance Scheme Act 2013 (Cth)
- NDIS (Provider Registration and Practice Standards) Rules 2018 — Core Module outcomes 2.4 (information management) and 3.4 (responsive support provision); SIL supplementary module outcome 3
- NDIS (Incident Management and Reportable Incidents) Rules 2018
- NDIS (Restrictive Practices and Behaviour Support) Rules 2018 (record-keeping for regulated restrictive practices)
- NDIS Code of Conduct
- Privacy Act 1988 (Cth) and the Australian Privacy Principles (APP 10 quality of personal information, APP 11 security, APP 12 access, APP 13 correction)

## Review

This procedure is reviewed every 12 months and after each quarterly note audit where systemic issues are found. Review owner: {{ quality_lead }}. Approval: {{ director }}.

## Document control

| Version | Approved by | Approval date | Next review |
|---|---|---|---|
| 1.0 | {{ director }} | [TO CONFIRM] | [TO CONFIRM — 12 months after approval] |
