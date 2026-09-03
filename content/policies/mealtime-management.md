---
title: Mealtime Management Policy
slug: mealtime-management
doc_type: policy
standards: [core-4.4]
applies_if: "intake.supports.mealtime_management"
version: 1.0
review_months: 12
---
{% set gov = intake.governance %}{% set wf = intake.workforce %}{% set sup = intake.supports %}
{% set director = gov.ceo_or_director | default('[TO CONFIRM]', true) %}{% set quality_lead = gov.quality_lead | default('[TO CONFIRM]', true) %}{% set incident_officer = gov.incident_officer | default('[TO CONFIRM]', true) %}{% set rostering_manager = gov.rostering_manager | default('[TO CONFIRM]', true) %}
{% set notes_software = wf.notes_software | default('[TO CONFIRM]', true) %}{% set incident_software = wf.incident_software | default('[TO CONFIRM]', true) %}{% set training_platform = wf.training_platform | default('[TO CONFIRM]', true) %}
# Mealtime Management Policy

## Purpose

Core Module outcome 4.4 requires that each participant who needs mealtime management receives meals that are nutritious, of a texture and consistency that are safe for them, and enjoyable, and that workers are trained to prepare food and support mealtimes safely. Choking, aspiration and dysphagia-related illness are leading causes of avoidable death for people with disability, which is why the NDIS Commission added this outcome. {{ org.name }} has confirmed that it supports participants who need mealtime management. This policy sets out how mealtime needs are assessed, how mealtime management plans from speech pathologists and dietitians are followed, how texture-modified foods and fluids are prepared using the IDDSI framework, how workers respond to choking, and how workers are trained.

## Scope

This policy applies to every worker ({{ wf.employment_types | join(', ') }}), key personnel, agency worker and contractor of {{ org.name }} in every home ({% for home in intake.homes %}{{ home.name }}{% if not loop.last %}, {% endif %}{% endfor %}) and wherever meals, drinks, snacks{% if sup.medication_involvement != 'none' %} or oral medication{% endif %} are provided, including outings{% if sup.transport %} and transport{% endif %}. It applies to every participant, not only those with a current mealtime management plan, because swallowing difficulties can be unrecognised.

## Policy statement

- **Every participant's mealtime needs are assessed.** At intake and at each support plan review, {{ rostering_manager }} records whether the participant has any swallowing, chewing, positioning, appetite, weight, reflux, choking or coughing-at-meals history, any food allergy or intolerance, and any dietary, cultural or religious requirement. Any indicator of dysphagia leads to a referral to a speech pathologist within 5 business days.
- **Mealtime management plans are followed exactly.** Where a speech pathologist (and, for nutrition, a dietitian) has written a mealtime management plan, {{ org.name }} treats it as a clinical instruction. It specifies the IDDSI food level (3 Liquidised, 4 Pureed, 5 Minced and Moist, 6 Soft and Bite-Sized, 7 Easy to Chew or 7 Regular) and drink level (0 Thin to 4 Extremely Thick), positioning, pace, utensils, supervision, foods to avoid and signs to watch for. Workers do not change a texture, thickness or food because a participant, family member or worker prefers it; changes are made only by the practitioner.
- **Plans are current and available.** The mealtime management plan is filed in {{ notes_software }}, a copy with a photo of each IDDSI level is kept in the kitchen where the participant agrees, and the plan is reviewed by the practitioner at least annually and after any choking event, chest infection, weight change or hospital admission.
- **Choice and enjoyment matter.** Participants choose what they eat within their plan, are offered variety, and eat with others where they wish. Texture modification is done in a way that keeps food appetising, and cultural and religious food practices are respected under the Diversity and Cultural Safety Policy.
- **Workers are trained before they support a meal.** No worker prepares texture-modified food or supports a participant with a mealtime management plan until they have completed the training set out in the Induction, Training and Competency Policy and been observed by the practitioner or a trained senior worker.
- **Choking is an emergency.** Every worker holds a current first aid certificate that includes choking response{% if not wf.first_aid_all %} — {{ org.name }} has identified that not all workers currently hold first aid, and {{ rostering_manager }} ensures at least one first-aid-qualified worker is rostered on every shift in every home until all workers are certified{% endif %}. Every choking, coughing or aspiration event is treated as an incident.
- **Food safety.** Food is stored, prepared and served hygienically under the Waste Management and Infection Control Policy, and thickened fluids and modified foods are prepared fresh, labelled and stored as the plan and product instructions require.

## Roles and responsibilities

| Role | Responsibilities |
|---|---|
| {{ director }} | Approves practitioner engagement and equipment; reviews mealtime incident trends quarterly; approves this policy. |
| {{ quality_lead }} | Owns this policy; ensures plans are current and training is complete; audits mealtime practice on shift twice a year in each home; reviews every mealtime incident for learning. |
| {{ rostering_manager }} | Screens mealtime needs at intake and review; arranges speech pathology and dietitian referrals; rosters only trained workers to shifts involving meal support. |
| {{ incident_officer }} | Records and investigates choking, aspiration and mealtime incidents in {{ incident_software }}. |
| House leaders | Keep the kitchen copy of each plan and the IDDSI reference current; check food preparation on shift; report weight, appetite or swallowing changes; arrange plan reviews. |
| Support workers | Follow each participant's plan at every meal and drink; prepare and test textures correctly; watch for warning signs; respond to choking; record meals and concerns in {{ notes_software }}. |

## Procedure

1. **Screen.** At intake and every review, {{ rostering_manager }} completes the mealtime screening questions in the support plan. Any positive answer, or any worker observation of coughing, wet or gurgly voice, food pocketing, prolonged meals, drooling, repeated chest infections or weight loss, triggers a speech pathology referral within 5 business days, and the participant is offered soft, moist foods and supervision in the meantime.
2. **Obtain the plan.** {{ rostering_manager }} obtains the written mealtime management plan from the speech pathologist (and a nutrition plan from a dietitian where needed), confirms the IDDSI levels, positioning, supervision and emergency instructions, and files it in {{ notes_software }}. The house leader places a copy in the kitchen and briefs all rostered workers.
3. **Train.** The practitioner or a trained senior worker trains every worker rostered to the participant, including preparing and testing each texture (fork, spoon-tilt and flow tests as IDDSI describes) and observes them supporting a meal. The observation is recorded on the Training Register.
4. **Prepare.** The worker prepares the participant's food and drink to the IDDSI level in the plan, tests it, uses the utensils and thickener the plan specifies, checks the temperature, and never leaves foods the plan lists as unsafe (for example hard, crumbly, stringy, mixed-consistency or small round foods where excluded) within the participant's reach.
5. **Support the meal.** The worker positions the participant as the plan states (usually upright, well supported), sits with them at eye level, offers small amounts at the plan's pace, checks the mouth is clear before the next mouthful, keeps distractions low, stays with the participant throughout the meal and for the time the plan requires afterwards, and records intake and any concern in {{ notes_software }}.
6. **Medication and snacks.** {% if sup.medication_involvement != 'none' %}Oral medication is given in the form and with the fluid the pharmacist and plan specify.{% endif %} Snacks, drinks from visitors and food on outings follow the plan; families and visitors are told about the plan with the participant's consent.
7. **Respond to choking.** The worker follows their first aid training: encourage coughing while the participant can breathe; if the airway is blocked, call 000 (or have another person call), deliver up to five back blows then up to five chest thrusts and repeat, and begin CPR if the participant becomes unresponsive. After any choking event, even if resolved, the participant is checked by a health practitioner the same day, the event is reported in {{ incident_software }}, and the plan is reviewed by the speech pathologist.
8. **Monitor.** The house leader records the participant's weight monthly (or as the dietitian directs), reviews meal records weekly, and reports any change to {{ rostering_manager }} for referral. {{ quality_lead }} observes mealtime practice in each home twice a year.
9. **Review.** The plan is reviewed by the practitioner at least annually and after any choking, aspiration, chest infection, hospital admission or change in ability.

## Records kept

- Mealtime screening in each participant's support plan; referrals to speech pathologists and dietitians.
- Current mealtime management plans and nutrition plans in {{ notes_software }} and in the kitchen.
- Meal, fluid and weight records in {{ notes_software }}.
- Training Register entries, including practitioner-delivered training and mealtime observations; first aid certificates.
- Choking, aspiration and mealtime incident reports and investigations in {{ incident_software }}.
- {{ quality_lead }}'s mealtime practice audits.

## Related documents

- health-wellbeing
- medication-management
- induction-training-competency
- waste-management-infection-control
- incident-management
- assessment-support-planning
- diversity-cultural-safety
- shift-handover-progress-notes
- supported-decision-making

## Legislation and standards references

- National Disability Insurance Scheme Act 2013 (Cth)
- NDIS (Provider Registration and Practice Standards) Rules 2018 — Core Module outcome 4.4 (mealtime management)
- NDIS (Incident Management and Reportable Incidents) Rules 2018
- NDIS Code of Conduct (NDIS (Code of Conduct) Rules 2018)
- NDIS Quality and Safeguards Commission practice alerts on dysphagia and safe swallowing, and on medicines associated with swallowing problems
- International Dysphagia Diet Standardisation Initiative (IDDSI) framework
- Australia New Zealand Food Standards Code (food safety in the home setting, as applicable)
{% for state in org.states %}- Work health and safety legislation of {{ state }} as cited in the Work Health and Safety Policy (safe systems of work for food preparation)
{% endfor %}

## Review

This policy is reviewed every 12 months, after any choking or aspiration incident, and whenever the IDDSI framework or a Commission practice alert is updated. Review owner: {{ quality_lead }}. Approval: {{ director }}.

## Document control

| Version | Approved by | Approval date | Next review |
|---|---|---|---|
| 1.0 | {{ director }} | [TO CONFIRM] | [TO CONFIRM — 12 months after approval] |
