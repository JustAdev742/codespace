---
title: Medication Management Policy and Procedure
slug: medication-management
doc_type: policy
standards: [core-4.3, sil-2]
applies_if: "intake.supports.medication_involvement != 'none'"
version: 1.0
review_months: 12
---
{% set gov = intake.governance %}{% set wf = intake.workforce %}{% set sup = intake.supports %}
{% set director = gov.ceo_or_director | default('[TO CONFIRM]', true) %}{% set quality_lead = gov.quality_lead | default('[TO CONFIRM]', true) %}{% set incident_officer = gov.incident_officer | default('[TO CONFIRM]', true) %}{% set rostering_manager = gov.rostering_manager | default('[TO CONFIRM]', true) %}
{% set notes_software = wf.notes_software | default('[TO CONFIRM]', true) %}{% set incident_software = wf.incident_software | default('[TO CONFIRM]', true) %}{% set training_platform = wf.training_platform | default('[TO CONFIRM]', true) %}
{% set med = sup.medication_involvement | default('none', true) %}
{% set poisons_act = {'NSW': 'Poisons and Therapeutic Goods Act 1966 (NSW) and Poisons and Therapeutic Goods Regulation 2008 (NSW)', 'VIC': 'Drugs, Poisons and Controlled Substances Act 1981 (Vic)', 'QLD': 'Medicines and Poisons Act 2019 (Qld)', 'SA': 'Controlled Substances Act 1984 (SA)', 'WA': 'Medicines and Poisons Act 2014 (WA)', 'TAS': 'Poisons Act 1971 (Tas)', 'ACT': 'Medicines, Poisons and Therapeutic Goods Act 2008 (ACT)', 'NT': 'Medicines, Poisons and Therapeutic Goods Act 2012 (NT)'} %}
# Medication Management Policy and Procedure

## Purpose

Core Module outcome 4.3 requires that each participant who needs help with medication has confidence that it is managed safely: that records show exactly what is prescribed and how, that workers understand the medication they handle and what to do when something goes wrong, that workers are trained and assessed as competent, that medication is stored and administered safely, and that every medication incident is reported. This document sets out how {{ org.name }} meets those requirements at its current level of involvement, which is: **{% if med == 'administer' %}administering medication{% elif med == 'prompt' %}prompting and reminding participants who self-administer{% else %}no medication involvement{% endif %}**. It includes the Medication Administration Record (MAR) and the Medication Competency Checklist.

## Scope

This document applies to every worker ({{ wf.employment_types | join(', ') }}), key personnel, agency worker and contractor of {{ org.name }} in every home ({% for home in intake.homes %}{{ home.name }}{% if not loop.last %}, {% endif %}{% endfor %}), in the community{% if sup.transport %} and during transport{% endif %}. It covers prescribed medication, over-the-counter and complementary medicines, PRN (as needed) medication, dose administration aids (blister packs or sachets) prepared by a pharmacy, and medication brought into the home by participants, families or visitors.

## Policy statement

- **The participant comes first.** Participants are supported to understand their medication, to be as independent with it as they safely can, and to consent to or refuse each dose. A participant's refusal is respected, recorded and reported to the prescriber where it could affect their health.
- **Prescriber instructions only.** {{ org.name }} handles medication only as directed by a current, signed medication chart or pharmacy label from a prescriber or pharmacist. Workers never change a dose, crush or alter a medication, or give a medication for a purpose other than the one prescribed, without written instruction.
- **Chemical restraint is a restrictive practice.** Any medication given for the primary purpose of influencing a participant's behaviour, rather than to treat a diagnosed condition, is chemical restraint under the NDIS (Restrictive Practices and Behaviour Support) Rules 2018. It may only be given where it is in the participant's behaviour support plan and authorised under the law of the state, and every use is recorded and reported under the Restrictive Practices and Behaviour Support Policy{% if sup.restrictive_practices == 'none' %} — {{ org.name }} does not currently use any chemical restraint{% endif %}.
- **Trained and competent workers only.** No worker handles medication until they have completed the training set out below and been assessed as competent using the Medication Competency Checklist; competency is reassessed annually and after any medication error.
- **Safe storage.** Medication is stored in a locked cupboard or container in the home, at the temperature the label requires, separately for each participant, and in the original pharmacy packaging or dose administration aid. Keys are controlled by the house leader. Participants who self-manage keep their own medication as agreed in their support plan.
- **Every incident is reported.** Any wrong person, dose, medication, time or route, any missed or unrecorded dose, any lost medication and any adverse reaction is a medication incident, reported in {{ incident_software }} under the Incident Management Policy. Where a participant may be harmed, the worker calls 000 or the Poisons Information Centre (13 11 26) first.
- **Swallowing safety.** {% if sup.mealtime_management %}Where a participant has a mealtime management plan, medication is given in the form and with the fluids the plan and the pharmacist specify.{% else %}Any difficulty swallowing medication is reported to the house leader and the participant's GP, and a speech pathology review is sought under the Health and Wellbeing Policy.{% endif %}

## {{ org.name }}'s level of medication involvement

{% if med == 'administer' %}
{{ org.name }} **administers medication** to participants who cannot self-administer. This means a trained, assessed worker selects the correct medication from the participant's dose administration aid or labelled container, gives it to the participant by the prescribed route (oral, topical, inhaled, eye or ear drops, or other routes only where a health practitioner has trained and signed off the worker for that participant), and records it on the MAR. Workers do not give injections, manage enteral (PEG) medication or perform other high-intensity daily personal activities unless {{ org.name }} has adopted the High Intensity Support Skills Descriptors, the worker has been trained and signed off by a health practitioner, and the participant's plan says so{% if sup.high_intensity %}; {{ org.name }} has identified that it delivers high intensity supports and maintains those additional training and sign-off records{% endif %}. Before administering, the worker checks the "rights" every time: right participant, right medication, right dose, right time, right route, and right documentation, and checks for allergies and for any recent PRN dose.
{% elif med == 'prompt' %}
{{ org.name }} **prompts and reminds** participants who self-administer their medication. This means a trained worker reminds the participant at the prescribed time, brings the participant's dose administration aid or container to them if asked, observes that the participant has taken the medication, and records the prompt and the participant's response on the MAR. Workers do not select, remove from packaging, give, apply or administer any medication, do not make decisions about PRN medication, and do not hold the participant's medication except to store it securely as agreed. If a participant's ability to self-administer changes, the worker reports it to the house leader, and {{ rostering_manager }} arranges a review with the participant, their GP and pharmacist before any change in the level of support. {{ org.name }} does not move to administering medication until this policy has been revised, workers have been trained and assessed for administration, and {{ director }} has approved the change.
{% else %}
{{ org.name }} has **no medication involvement**: participants manage their own medication, or medication is managed by a family member, nurse or other provider. Workers do not prompt, handle, store or record medication. If a participant asks for help, or a worker sees a risk (missed doses, confusion about medication, medication left unsecured), the worker records it in {{ notes_software }} and tells the house leader, and {{ rostering_manager }} arranges a review with the participant and their GP or pharmacist. Any change to prompting or administering requires this policy to be revised, workers to be trained and assessed, and {{ director }}'s approval before it begins.
{% endif %}

## Roles and responsibilities

| Role | Responsibilities |
|---|---|
| {{ director }} | Approves the level of medication involvement and any change to it; reviews medication incident trends quarterly; approves this document. |
| {{ quality_lead }} | Owns this document; ensures training and competency assessments are current; audits MARs for every participant monthly; reviews every medication incident for learning. |
| {{ rostering_manager }} | Rosters only medication-competent workers to shifts where medication support is due; obtains current medication charts and pharmacy dose administration aids at intake and each change. |
| {{ incident_officer }} | Records and investigates medication incidents in {{ incident_software }}; decides on reportability under the Incident Management Policy. |
| House leaders | Control medication storage and keys; check new medication into the home; complete monthly MAR reconciliation; arrange GP and pharmacy reviews. |
| Support workers | {% if med == 'administer' %}Administer medication only as trained and charted; complete the MAR at the time of each dose; report every incident, refusal and PRN use.{% elif med == 'prompt' %}Prompt and observe as trained; complete the MAR at the time of each prompt; report every missed dose, refusal or concern.{% else %}Report any medication concern to the house leader; do not handle medication.{% endif %} |

## Procedure

{% if med == 'administer' %}
1. **Intake.** {{ rostering_manager }} obtains a current medication chart signed by the prescriber (or a pharmacist-prepared medication profile), the participant's allergies, PRN instructions with the reason, dose, minimum interval and maximum daily dose for each PRN medication, and the participant's consent to {{ org.name }} administering medication. The chart is filed in {{ notes_software }} and a copy kept with the MAR in the home.
2. **Receiving medication.** The house leader checks every dose administration aid or container against the chart on arrival (name, medication, strength, dose, time, start and end dates), records it on the MAR, and stores it in the locked cupboard. Discrepancies are resolved with the pharmacist before any dose is given.
3. **Administering.** At each medication time the worker washes their hands, confirms the participant's identity and consent, checks the "rights" against the chart and MAR, checks for allergies and any recent PRN dose, gives the medication with the participant's preferred drink or food as the chart allows, watches that it is taken, and signs the MAR immediately. Doses are never signed in advance or for another worker.
4. **PRN medication.** Before giving a PRN medication the worker confirms the charted reason is present, the minimum interval has passed and the maximum daily dose has not been reached, records the reason, time and dose on the MAR, checks the participant within the time the chart specifies and records the effect. Any PRN medication prescribed for behaviour is managed under the Restrictive Practices and Behaviour Support Policy.
5. **Refusal, missed or vomited doses.** The worker records the event on the MAR with the reason, re-offers as the chart allows, does not force or hide medication, and calls the pharmacist or GP (or the after-hours line) for advice where a missed dose could affect the participant's health. A missed dose that is not identified and actioned is a medication incident.
6. **Schedule 8 and other controlled medication.** Schedule 8 medication (for example some strong pain relievers and stimulants) is stored in a separate locked container, counted at every shift handover on a dedicated count sheet signed by two workers, and any discrepancy is reported to {{ incident_officer }} and the pharmacist immediately.
7. **Monthly reconciliation.** The house leader reconciles each MAR against the chart and the remaining medication, checks expiry dates, returns unused or expired medication to the pharmacy, and files the completed MAR in {{ notes_software }}. {{ quality_lead }} audits the reconciliation.
8. **Medication reviews.** The house leader arranges a medication review with the GP or pharmacist at least annually, after any hospital admission, after any new medication, and whenever side effects, refusals or swallowing difficulties are observed.
9. **Incidents.** Any error, adverse reaction or lost medication is made safe first (call 000 or 13 11 26 where there is any risk of harm), reported to the house leader by phone during the shift, and reported in {{ incident_software }}. The participant is told (open disclosure), the prescriber is contacted, and the worker's competency is reassessed before they next administer medication.
{% elif med == 'prompt' %}
1. **Intake.** {{ rostering_manager }} obtains a copy of the participant's current medication list or chart, records in the support plan that the participant self-administers and what prompting they want, and records the participant's consent to prompting and to secure storage if they want it.
2. **Prompting.** At the prescribed time the worker reminds the participant, brings the dose administration aid or container to them if asked, observes the participant take the medication, and records the prompt and the participant's response on the MAR immediately. Workers do not select or remove medication from packaging.
3. **Refusal or missed dose.** The worker records it on the MAR, re-offers a reminder once as agreed in the support plan, and tells the house leader the same shift. Where a missed dose could affect the participant's health, the house leader contacts the GP or pharmacist for advice with the participant's agreement.
4. **Changes in ability.** If the participant appears confused about their medication, misses doses regularly, or a dose administration aid shows doses out of sequence, the worker records it and the house leader arranges a review with the participant, GP and pharmacist within 5 business days.
5. **Monthly check.** The house leader reviews the MAR with the participant monthly and files it in {{ notes_software }}.
6. **Incidents.** Any harm, lost medication or concern about another person interfering with the participant's medication is reported in {{ incident_software }} under the Incident Management Policy.
{% else %}
1. If a participant asks for help with medication, or a worker observes a medication risk, the worker records it in {{ notes_software }} and tells the house leader the same shift.
2. {{ rostering_manager }} arranges a review with the participant and their GP or pharmacist to decide what support is needed and who should provide it.
3. Any proposal for {{ org.name }} to begin prompting or administering is put to {{ director }} with a training and competency plan; this policy is revised and approved before any worker is involved with medication.
{% endif %}

## Training and competency

- Training platform: {{ training_platform }}.
- {% if med == 'administer' %}Workers who administer medication complete HLTHPS006 Assist clients with medication (or an equivalent unit accepted by {{ quality_lead }}), the NDIS Commission's medication-related practice alerts, and a supervised practical assessment using the Medication Competency Checklist, before administering alone; reassessment is annual and after any medication error.{% elif med == 'prompt' %}Workers who prompt complete {{ org.name }}'s medication awareness module, read the NDIS Commission's medication-related practice alerts, and are assessed against the prompting section of the Medication Competency Checklist before prompting alone; reassessment is annual.{% else %}Workers complete medication awareness as part of induction so they can recognise and report risks.{% endif %}
- Participant-specific training (for example epilepsy emergency medication{% if sup.mealtime_management %} or medication with texture-modified foods{% endif %}) is delivered by the relevant health practitioner and recorded on the Training Register.

## Medication administration record (MAR) template

| Date | Participant | Medication and strength | Dose, route and charted time | Time given or prompted | Given / prompted / refused / withheld / PRN (with reason) | Worker initials | Second check or notes |
|---|---|---|---|---|---|---|---|
| 01/08/2026 (example — delete) | J. Example | Paracetamol 500 mg | 2 tablets oral, PRN up to 4 times daily, at least 4 hours apart | 4:10 pm | PRN — headache; effective by 5 pm | AW | Last PRN dose 9 am |

A separate MAR page is kept for each participant for each month, with the participant's allergies, GP, pharmacy and photo (with consent) on the header, and a signature key listing every worker's initials.

## Medication competency checklist

| Competency | Observed (Y/N) | Assessor comments | Date and assessor |
|---|---|---|---|
| Explains {{ org.name }}'s level of involvement ({{ med }}) and what workers must not do | (example — delete) Y | Clear | 01/08/2026, house leader |
| Locates and reads the medication chart, allergies and PRN instructions | | | |
| Identifies the participant and obtains consent; respects refusal | | | |
| Checks the six rights (participant, medication, dose, time, route, documentation) | | | |
| Handles a dose administration aid correctly and stores medication securely | | | |
| Completes the MAR accurately at the time of the dose or prompt | | | |
| Describes common side effects and what to do if the participant is unwell | | | |
| Explains PRN rules and chemical restraint restrictions | | | |
| Explains what to do for a missed dose, refusal, vomiting or error, including 000 and 13 11 26 | | | |
| Reports and records a medication incident correctly | | | |
| Assessment outcome (competent / not yet competent), reassessment due | | | |

## Records kept

- Current medication charts, pharmacy profiles and consent to medication support for each participant.
- Completed MARs (filed monthly in {{ notes_software }}, kept for 7 years){% if med == 'administer' %}, Schedule 8 count sheets and monthly reconciliations{% endif %}.
- Training Register entries and Medication Competency Checklists for every worker.
- Medication incident reports and investigations in {{ incident_software }}.
- Records of GP and pharmacist medication reviews.

## Related documents

- health-wellbeing
- restrictive-practices-behaviour-support
- mealtime-management
- incident-management
- induction-training-competency
- shift-handover-progress-notes
- safe-environment-property
- open-disclosure

## Legislation and standards references

- National Disability Insurance Scheme Act 2013 (Cth)
- NDIS (Provider Registration and Practice Standards) Rules 2018 — Core Module outcome 4.3 (management of medication); SIL supplementary module outcome 2 (safeguarding)
- NDIS (Restrictive Practices and Behaviour Support) Rules 2018 (chemical restraint)
- NDIS (Incident Management and Reportable Incidents) Rules 2018
- NDIS Code of Conduct (NDIS (Code of Conduct) Rules 2018)
- NDIS Quality and Safeguards Commission practice alerts on medication (including medicines associated with swallowing problems)
{% for state in org.states %}- {{ poisons_act[state | upper] | default('Medicines and poisons legislation of ' ~ state ~ ' [TO CONFIRM]') }}
{% endfor %}

## Review

This document is reviewed every 12 months, after any medication incident causing harm, and before any change in {{ org.name }}'s level of medication involvement. Review owner: {{ quality_lead }}. Approval: {{ director }}.

## Document control

| Version | Approved by | Approval date | Next review |
|---|---|---|---|
| 1.0 | {{ director }} | [TO CONFIRM] | [TO CONFIRM — 12 months after approval] |
