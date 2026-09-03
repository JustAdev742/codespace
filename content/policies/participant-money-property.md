---
title: Participant Money and Property Policy and Procedure
slug: participant-money-property
doc_type: policy
standards: [core-4.2]
applies_if: "intake.supports.participant_money_handling"
version: 1.0
review_months: 12
---
{% set gov = intake.governance %}{% set wf = intake.workforce %}{% set sup = intake.supports %}
{% set director = gov.ceo_or_director | default('[TO CONFIRM]', true) %}{% set quality_lead = gov.quality_lead | default('[TO CONFIRM]', true) %}{% set complaints_officer = gov.complaints_officer | default('[TO CONFIRM]', true) %}{% set incident_officer = gov.incident_officer | default('[TO CONFIRM]', true) %}{% set rostering_manager = gov.rostering_manager | default('[TO CONFIRM]', true) %}
{% set notes_software = wf.notes_software | default('[TO CONFIRM]', true) %}{% set incident_software = wf.incident_software | default('[TO CONFIRM]', true) %}
{% set guardianship_act = {'NSW': 'Guardianship Act 1987 (NSW); NSW Trustee and Guardian Act 2009 (NSW)', 'VIC': 'Guardianship and Administration Act 2019 (Vic)', 'QLD': 'Guardianship and Administration Act 2000 (Qld)', 'SA': 'Guardianship and Administration Act 1993 (SA)', 'WA': 'Guardianship and Administration Act 1990 (WA)', 'TAS': 'Guardianship and Administration Act 1995 (Tas)', 'ACT': 'Guardianship and Management of Property Act 1991 (ACT)', 'NT': 'Guardianship of Adults Act 2016 (NT)'} %}
# Participant Money and Property Policy and Procedure

## Purpose

Core Module outcome 4.2 requires that each participant's money and property are protected, that participants are supported to manage their own money where they choose, and that workers do not have unauthorised access to a participant's money, financial information or property. {{ org.name }} has confirmed that its workers do handle participant money in the course of SIL supports (for example shopping, outings, bills and household contributions). This document sets out the rules, the procedure and the Transaction Record that make every dollar traceable.

## Scope

This document applies to every worker ({{ wf.employment_types | join(', ') }}), key personnel, agency worker and contractor of {{ org.name }} in every home ({% for home in intake.homes %}{{ home.name }}{% if not loop.last %}, {% endif %}{% endfor %}), in the community{% if sup.transport %} and during transport{% endif %}. It covers cash, bank and debit cards, online accounts, Centrelink and NDIS funding information, gift cards, vouchers, household kitties, and personal property including phones, devices, jewellery, documents and vehicles.

## Policy statement

- **The participant's money is the participant's.** Participants decide how their money is spent. {{ org.name }} supports each participant to manage their own money to the fullest extent they choose, using supported decision-making, accessible budgets and their preferred banking tools, and only handles money where the participant's support plan says so and the participant (or their financial decision-maker) has agreed in writing.
- **Workers never benefit.** Workers do not borrow from, lend to, sell to, buy from, accept gifts of more than token value from, or receive money, bequests or benefits from participants. Workers do not use a participant's money, card, account, vehicle, food or belongings for themselves, for other participants or for {{ org.name }}.
- **No access to accounts.** Workers do not know a participant's PIN or online banking password, are not signatories to a participant's account, and do not hold a participant's card outside an agreed, recorded task. Where a participant needs help at an ATM or EFTPOS terminal, the participant enters their PIN.
- **Every transaction is recorded and receipted.** Any handling of participant money by a worker is entered on the Transaction Record with a receipt. Cash is counted and signed by two people at shift handover. Unexplained differences are reported the same shift.
- **Household money is transparent.** {% if intake.homes | length > 0 %}Where participants in a shared home choose to pool money for food or household items, the arrangement is agreed at a household meeting, recorded under the Household Decision-Making Policy, kept in a separate household Transaction Record, and any participant can withdraw from it at any time.{% endif %} Household contributions are never a condition of support and are never mixed with {{ org.name }}'s money.
- **Property is respected.** Participants' belongings are theirs to use, keep and give away. {{ org.name }} keeps an inventory of items of value at move-in and move-out, records any item it holds for safekeeping at the participant's request, and reports loss or damage as an incident.
- **Financial decision-makers.** Where a participant has a financial administrator, financial manager, attorney, or Centrelink or NDIS nominee, {{ org.name }} records who they are, what they can decide, and how the participant is still involved. {{ org.name }} does not itself act as a participant's financial decision-maker, nominee or payee.
- **Financial exploitation is abuse.** Any suspected theft, misuse, coercion or exploitation of a participant's money or property, by anyone, is managed under the Safeguarding (VANED) Policy and the Incident Management Policy, including notification to the NDIS Commission within 24 hours where it amounts to abuse or neglect, and reporting to police.

## Roles and responsibilities

| Role | Responsibilities |
|---|---|
| {{ director }} | Approves any arrangement in which {{ org.name }} holds a participant's money or property; reviews the quarterly reconciliation report; approves this document. |
| {{ quality_lead }} | Owns this document; audits Transaction Records for every participant quarterly; trains workers; reports findings to {{ director }}. |
| {{ rostering_manager }} | Confirms at intake and at each plan review what money support each participant wants and has agreed to; records financial decision-makers. |
| {{ incident_officer }} | Records and investigates every discrepancy, loss or suspected exploitation in {{ incident_software }}. |
| {{ complaints_officer }} | Handles complaints about money or property as priority complaints. |
| House leaders | Reconcile cash and Transaction Records at each handover they attend and at least weekly; keep the property inventory; store receipts. |
| Support workers | Follow this procedure on every transaction; obtain and attach receipts; count and sign cash at handover; report discrepancies immediately. |

## Procedure

1. **Agree the support.** At intake, {{ rostering_manager }} records in the support plan the money support the participant wants (none; help with shopping; managing a weekly cash float; help with bills), the maximum cash to be held for the participant in the home, who the participant's financial decision-maker is (if any), and the participant's written agreement. This is reviewed at every plan review.
2. **Receive money.** When a worker receives cash for a participant (from the participant, family, a nominee or a withdrawal the participant makes), the worker records the amount, source and date on the participant's Transaction Record, and a second person counts and signs where one is on shift.
3. **Store money.** Cash held for a participant is kept in a locked, labelled container in a locked cupboard in the home, separate from any other participant's money and from any {{ org.name }} money, with the key controlled by the house leader.
4. **Spend money.** Before spending, the worker confirms with the participant what is to be bought. The participant pays wherever possible. The worker obtains an itemised receipt for every purchase, records the amount, purpose and receipt reference on the Transaction Record, and returns the change and receipt to the container.
5. **Card and EFTPOS.** A participant's card is used only by the participant or, for an agreed single task, by a worker recorded on the Transaction Record with the card returned and the balance recorded. Workers never hold a PIN.
6. **Online purchases and bills.** Support with online payments is given on the participant's own device or account with the participant present; the worker records the transaction and does not save or record login details.
7. **Handover.** At each shift handover, the outgoing and incoming workers count the cash, compare it to the Transaction Record balance, and both sign. Any difference is reported by phone to the house leader before the outgoing worker leaves.
8. **Reconcile.** The house leader reconciles each participant's Transaction Record and receipts at least weekly; {{ quality_lead }} audits all records quarterly and reports to {{ director }}.
9. **Discrepancies.** Any missing money or property, any transaction without a receipt or a participant's agreement, or any suspicion of exploitation is reported in {{ incident_software }} the same shift. {{ incident_officer }} investigates under the Incident Management Policy, the participant is told and supported (open disclosure), the NDIS Commission is notified within 24 hours where the matter is abuse or neglect, police are informed of suspected theft, and any worker implicated is removed from contact with participant money pending investigation.
10. **Property.** At move-in, the house leader and participant list items of value on the property inventory. Items {{ org.name }} holds for safekeeping at the participant's request are receipted and returned on request. At move-out, the inventory is checked and signed by the participant or their representative.
11. **Gifts.** A worker offered a gift by a participant declines except for token items, records the offer in {{ notes_software }} and tells the house leader. Tips and cash gifts are never accepted.

## Transaction record template

| Date | Participant | Opening balance | Money in ($) and source | Money out ($) and purpose | Receipt attached (Y/N and reference) | Closing balance | Worker signature | Participant or second signature |
|---|---|---|---|---|---|---|---|---|
| 01/08/2026 (example — delete) | J. Example | 60.00 | — | 24.50 groceries | Y — R-0142 | 35.50 | A. Worker | J. Example |

## Records kept

- Signed money support agreement and financial decision-maker details in each participant's support plan.
- Transaction Record and receipts for each participant and each household kitty (kept for 7 years).
- Cash count and handover signatures; weekly reconciliations; quarterly audit reports.
- Property inventories and safekeeping receipts.
- Incident reports for discrepancies, loss or suspected exploitation in {{ incident_software }}.
- Gift declarations in {{ notes_software }}.

## Related documents

- safeguarding-vaned
- incident-management
- supported-decision-making
- household-decision-making
- shift-handover-progress-notes
- privacy-confidentiality
- complaints-feedback
- transitions-exit
- grievance-disciplinary

## Legislation and standards references

- National Disability Insurance Scheme Act 2013 (Cth)
- NDIS (Provider Registration and Practice Standards) Rules 2018 — Core Module outcome 4.2 (participant money and property)
- NDIS Code of Conduct (NDIS (Code of Conduct) Rules 2018) — acting with integrity, honesty and transparency; taking all reasonable steps to prevent and respond to exploitation
- NDIS (Incident Management and Reportable Incidents) Rules 2018
- Privacy Act 1988 (Cth) and the Australian Privacy Principles (financial information)
{% for state in org.states %}- {{ guardianship_act[state | upper] | default('Guardianship and financial administration legislation of ' ~ state ~ ' [TO CONFIRM]') }}
{% endfor %}

## Review

This document is reviewed every 12 months, after any incident involving participant money or property, and after each quarterly audit if findings require it. Review owner: {{ quality_lead }}. Approval: {{ director }}.

## Document control

| Version | Approved by | Approval date | Next review |
|---|---|---|---|
| 1.0 | {{ director }} | [TO CONFIRM] | [TO CONFIRM — 12 months after approval] |
