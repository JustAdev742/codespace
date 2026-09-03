---
title: SIL Service Agreement Template
slug: sil-service-agreement
doc_type: agreement
standards: [core-3.3, sil-4, sil-1]
applies_if: "true"
version: 1.0
review_months: 12
---
{% set gov = intake.governance %}{% set wf = intake.workforce %}{% set sup = intake.supports %}
{% set director = gov.ceo_or_director | default('[TO CONFIRM]', true) %}{% set quality_lead = gov.quality_lead | default('[TO CONFIRM]', true) %}{% set rostering_manager = gov.rostering_manager | default('[TO CONFIRM]', true) %}{% set complaints_officer = gov.complaints_officer | default('[TO CONFIRM]', true) %}{% set privacy_officer = gov.privacy_officer | default('[TO CONFIRM]', true) %}
{% set tenancy_act = {'NSW': 'Residential Tenancies Act 2010 (NSW)', 'VIC': 'Residential Tenancies Act 1997 (Vic)', 'QLD': 'Residential Tenancies and Rooming Accommodation Act 2008 (Qld)', 'WA': 'Residential Tenancies Act 1987 (WA)', 'SA': 'Residential Tenancies Act 1995 (SA)', 'TAS': 'Residential Tenancy Act 1997 (Tas)', 'ACT': 'Residential Tenancies Act 1997 (ACT)', 'NT': 'Residential Tenancies Act 1999 (NT)'} %}
# SIL Service Agreement Template

## Purpose

This template is the written agreement {{ org.name }} enters into with each participant (or the person legally authorised to act for them) for Supported Independent Living supports. It records what supports will be provided, when, by whom and at what price, each party's responsibilities, how the agreement can be changed or ended, how to complain, and — because SIL is delivered in the participant's home — that this agreement is about support only and is separate from the participant's right to live in their home. It gives effect to Core Module outcome 3.3 (service agreements with participants) and SIL supplementary module outcome 4.

## Scope

This template is used for every participant receiving SIL supports from {{ org.name }} in any of its homes. It is explained to the participant in the format they choose (Easy Read, pictures, interpreter, Auslan, audio) before signing, and a copy in that format is given to the participant. Housing and tenancy terms are never included in this agreement; they belong in the participant's separate tenancy, occupancy or SDA agreement with the tenancy holder for their home.

## Roles and responsibilities

| Role | Responsibilities |
|---|---|
| {{ director }} | Signs agreements on behalf of {{ org.name }}; approves any variation to standard terms. |
| {{ rostering_manager }} | Prepares the schedule of supports and roster from the participant's NDIS plan and support plan; walks the participant through the agreement; arranges accessible formats and interpreters. |
| {{ quality_lead }} | Keeps this template current with the NDIS Pricing Arrangements and Price Limits and the NDIS Practice Standards; audits signed agreements annually. |
| {{ complaints_officer }} | Named contact for complaints in the agreement. |
| {{ privacy_officer }} | Named contact for privacy and access to records. |
| Participant and their supporters | Read and ask about the agreement; decide whether to sign; tell {{ org.name }} of changes. |

## Agreement template

### SIL Service Agreement

**Between:** {{ org.name }}{% if org.trading_name and org.trading_name != org.name %} (trading as {{ org.trading_name }}){% endif %}, ABN {{ org.abn | default('[TO CONFIRM]', true) }}, of {{ org.address | default('[TO CONFIRM]', true) }}, phone {{ org.phone | default('[TO CONFIRM]', true) }}, email {{ org.email | default('[TO CONFIRM]', true) }} ("we", "us", "the provider")

**And:** [Participant name], NDIS number [number], of [home address] ("you", "the participant")

**Signed on your behalf by (if applicable):** [Name], [relationship and legal authority, e.g. plan nominee, guardian under order dated] — this person signs only for the decisions their authority covers.

**Agreement start date:** [date]  **Agreement end date:** [date of NDIS plan end, or as agreed]

#### 1. What this agreement is about

1.1 This agreement is about the Supported Independent Living (SIL) supports we provide to you in your home. SIL means help or supervision with daily tasks so you can live as independently as possible in your home.

1.2 This agreement is made under the National Disability Insurance Scheme Act 2013 (Cth) and follows the NDIS Practice Standards and the NDIS Code of Conduct. Under the NDIS rules, you are the decision-maker about your supports and we must support you to make your own decisions.

1.3 This agreement is not a tenancy, lease, occupancy or accommodation agreement. Clause 9 explains this.

#### 2. The supports we will provide

2.1 Schedule 1 lists the supports, the times of day they are provided, the roster of care (how many workers support the household and when, including the overnight arrangement), and how much of that support is for you personally and how much is shared with your housemates.

2.2 We will deliver the supports in the way described in your support plan, which you direct and which we review with you at least every 6 months.

2.3 We will provide supports that are safe and competent, with workers who hold an NDIS Worker Screening clearance, have been inducted to your home and your plan, and are trained for what you need, including{% if sup.medication_involvement == 'administer' %} medication administration{% elif sup.medication_involvement == 'prompt' %} medication prompting{% endif %}{% if sup.mealtime_management %}, mealtime management{% endif %}{% if sup.restrictive_practices != 'none' or sup.behaviour_support_plans %}, positive behaviour support{% endif %}{% if sup.transport %}, and transport{% endif %} where your plan includes them.

2.4 We will tell you in advance who is rostered to support you, respect your preferences about workers, and tell you as early as we can if a regular worker is leaving.

#### 3. Price and payment

3.1 The price for your SIL supports is set out in Schedule 2. We charge no more than the price limits in the NDIS Pricing Arrangements and Price Limits in force at the time the support is delivered, using the SIL support items that match the roster of care in Schedule 1. Prices change when the NDIA updates the Pricing Arrangements (normally on 1 July); we will tell you in writing before a new price applies.

3.2 We claim payment for supports we have delivered from your NDIS plan funding in the way your plan is managed: [NDIA-managed / plan-managed by (name of plan manager) / self-managed]. If you are self-managed or plan-managed, we will send an invoice [weekly/fortnightly] showing the dates, support items and amounts.

3.3 Supports provided under this agreement are GST-free where section 38-38 of the A New Tax System (Goods and Services Tax) Act 1999 (Cth) applies.

3.4 If you are away from your home (for example in hospital or on holiday), we will only claim for supports as permitted by the NDIS Pricing Arrangements and Price Limits, and we will explain to you what that means for your funding before or as soon as possible after the absence starts.

3.5 We will not ask you to pay for anything that is not in this agreement, and we will not ask you or your family for money, gifts or benefits outside this agreement.

3.6 We will not charge you rent, board, utilities or other housing costs under this agreement. If you and your housemates choose to share household costs (such as food), Schedule 3 records the arrangement, your share, and that you can change your mind, and it is not a condition of receiving support.

#### 4. Your responsibilities

4.1 You (or your supporter) agree to: tell us about anything that affects your supports, including changes to your NDIS plan, health, medication or who supports you to make decisions; treat workers with respect and let us know if there is a problem with a worker; let us know as early as you can if you will be away from home; and work with us and your housemates on the household arrangements you have agreed.

#### 5. Our responsibilities

5.1 We agree to: respect your privacy and only share your information with your consent or as the law requires; support you to make your own decisions and to take part in decisions about your home; keep accurate records that you can see; report incidents and respond to complaints as the NDIS rules require; tell you about any conflict of interest we have; give you at least [24 hours'] notice of any change to your roster except in an emergency; and never restrict you, your visitors or your choices as a way of controlling you (any restrictive practice can only be used if it is in your behaviour support plan and authorised{% if sup.restrictive_practices == 'none' %} — we do not use restrictive practices{% endif %}).

#### 6. Changes to this agreement

6.1 Either of us can ask for a change. Changes are agreed in writing (including in an accessible format) and signed by both of us. We will review this agreement with you when your NDIS plan changes, when your support plan is reviewed, and at least once a year.

#### 7. Ending this agreement

7.1 You can end this agreement by giving us 14 days' written notice (or shorter if we agree), or immediately if we have seriously breached it. You do not have to give a reason.

7.2 We can end this agreement by giving you 28 days' written notice, and only after we have worked with you, your supporters and your support coordinator on a transition plan under our Transitions and Exit Policy. We will not end the agreement because you made a complaint, changed your NDIS plan or asked for changes to your supports.

7.3 We may end the agreement with shorter notice only where continuing would create a serious and immediate risk to your safety or the safety of others that cannot be managed, and we will tell the NDIA and your support coordinator so that other supports can be arranged.

7.4 Ending this agreement ends only our supports. It does not end your right to live in your home (see clause 9).

#### 8. Complaints and feedback

8.1 You can complain to us at any time, in any way: to any worker, to {{ complaints_officer }} on {{ org.phone | default('[TO CONFIRM]', true) }} or {{ org.email | default('[TO CONFIRM]', true) }}, or using our feedback form. We will acknowledge your complaint, keep you informed and try to resolve it as quickly as we can, and you will not be treated differently because you complained.

8.2 You can also complain to the NDIS Quality and Safeguards Commission on 1800 035 544 or at ndiscommission.gov.au, and you can use an advocate at any time. We will help you contact an advocate if you want one.

#### 9. Your housing is separate from this agreement

9.1 This agreement covers support only. Your right to live in your home comes from a separate agreement with the person or organisation that owns or leases your home (the "tenancy holder"), not from us.

9.2 You can change your support provider and keep living in your home. If you end this agreement or choose another SIL provider, we will not ask you to leave, and we will cooperate with your new provider and the tenancy holder so that your supports continue without a gap.

9.3 We will not use your housing to influence your choices about supports. We will not tell you, or let anyone tell you, that you must use our supports to keep your home.

9.4 If we are also your landlord or hold the lease for your home, that is a conflict of interest. We will tell you about it in writing, give you a separate written housing agreement with its own rights and notice periods under the tenancy law of your state, and offer you independent advice (for example a tenants' advice service or an advocate) before you sign either agreement.

9.5 Home-specific arrangements (delete the rows that do not apply to you):

| Home | Who you have a housing agreement with | What that agreement is | Tenancy law that applies |
|---|---|---|---|
{% for home in intake.homes %}| {{ home.name | default('[TO CONFIRM]', true) }}, {{ home.address | default('[TO CONFIRM]', true) }} | {% if home.tenancy_holder == 'provider' %}{{ org.name }} (we are also the tenancy holder — see clause 9.4){% elif home.tenancy_holder == 'sda_provider' %}The Specialist Disability Accommodation (SDA) provider for this dwelling: [SDA provider name — TO CONFIRM]{% elif home.tenancy_holder == 'private_landlord' %}Your private landlord (or their agent): [name — TO CONFIRM]{% elif home.tenancy_holder == 'participant' %}Nobody else — you own this home or hold the lease in your own name{% else %}[TO CONFIRM]{% endif %} | {% if home.tenancy_holder == 'provider' %}A separate written tenancy or occupancy agreement with {{ org.name }}{% elif home.tenancy_holder == 'sda_provider' %}An SDA tenancy or occupancy agreement with the SDA provider, which must meet the NDIS (Specialist Disability Accommodation) Rules 2020{% if home.state | upper == 'VIC' %} and Part 12A of the Residential Tenancies Act 1997 (Vic) (SDA residency agreements){% endif %}{% elif home.tenancy_holder == 'private_landlord' %}A residential tenancy agreement in your name{% elif home.tenancy_holder == 'participant' %}Your own ownership or lease{% else %}[TO CONFIRM]{% endif %} | {{ tenancy_act[home.state | upper] | default('[TO CONFIRM tenancy legislation for ' ~ (home.state | default('this state', true)) ~ ']') }} |
{% endfor %}

#### 10. Privacy

10.1 We collect, use and store your personal and health information under the Privacy Act 1988 (Cth) and our Privacy and Confidentiality Policy. You can ask to see your records and ask us to correct them by contacting {{ privacy_officer }}.

#### 11. Signatures

| Party | Name | Signature | Date |
|---|---|---|---|
| Participant | | | |
| Person signing for the participant (authority) | | | |
| For {{ org.name }} | {{ director }} | | |
| Interpreter or communication supporter present (name, language or method) | | | |

**Format check:** This agreement was explained in [format] on [date] by {{ rostering_manager }}. The participant received a copy in [format].

### Schedule 1 — Supports and roster of care

| Support | Days and times | Shared with housemates (ratio) or individual | Support item reference (NDIS Pricing Arrangements) | Notes |
|---|---|---|---|---|
| Assistance with daily life — weekday daytime (example — delete) | Monday to Friday, 6 am to 10 pm | 1 worker : 3 participants | [item number from current Pricing Arrangements] | Includes personal care, meals, household tasks, community access |
| Overnight support | Every night | [sleepover / active night — 1 worker : household] | [item number] | Overnight arrangement as assessed |

### Schedule 2 — Price

| Item | Price (per NDIS Pricing Arrangements and Price Limits [edition]) | Weekly total | Annual total | Funding source in NDIS plan |
|---|---|---|---|---|
| (example — delete) Weekday daytime, shared 1:3 | $[rate] per hour | $ | $ | Core — Assistance with Daily Life |

### Schedule 3 — Shared household costs you have chosen (optional)

| Cost | Your share | How it is paid | You can change or stop this by | Agreed on |
|---|---|---|---|---|
| Groceries (example — delete) | 1/3 | Household account, receipts kept | Telling the house leader at any time | [date] |

## Records kept

- Signed agreements and accessible-format versions in {{ wf.notes_software | default('[TO CONFIRM]', true) }} and the participant's file, with the format check completed.
- Schedules 1 to 3 and each dated variation.
- Records of independent advice offered where {{ org.name }} is the tenancy holder.
- Notices to end and transition plans.
- Annual agreement audit by {{ quality_lead }}.

## Related documents

- tenancy-housing-support-separation
- access-intake
- assessment-support-planning
- transitions-exit
- participant-rights-statement
- complaints-feedback
- privacy-confidentiality
- financial-management
- conflicts-of-interest

## Legislation and standards references

- National Disability Insurance Scheme Act 2013 (Cth)
- NDIS (Provider Registration and Practice Standards) Rules 2018 — Core Module outcome 3.3; SIL supplementary module outcomes 1 and 4
- NDIS (Specialist Disability Accommodation) Rules 2020 (SDA-enrolled homes)
- NDIS Pricing Arrangements and Price Limits (current edition)
- NDIS Code of Conduct; NDIS (Complaints Management and Resolution) Rules 2018
- A New Tax System (Goods and Services Tax) Act 1999 (Cth), section 38-38
- Australian Consumer Law (Schedule 2 to the Competition and Consumer Act 2010 (Cth)) — unfair contract terms and consumer guarantees
- Privacy Act 1988 (Cth) and the Australian Privacy Principles
{% for state in org.states %}- {{ tenancy_act[state | upper] | default('Residential tenancies legislation of ' ~ state ~ ' [TO CONFIRM]') }}
{% endfor %}

## Review

This template is reviewed every 12 months, on each release of the NDIS Pricing Arrangements and Price Limits, and when the SIL Practice Standards change. Review owner: {{ quality_lead }}. Approval: {{ director }}.

## Document control

| Version | Approved by | Approval date | Next review |
|---|---|---|---|
| 1.0 | {{ director }} | [TO CONFIRM] | [TO CONFIRM — 12 months after approval] |
