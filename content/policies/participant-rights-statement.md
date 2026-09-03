---
title: Participant Rights Statement (Easy-to-Read)
slug: participant-rights-statement
doc_type: statement
standards: [sil-4, core-1.1]
applies_if: "true"
version: 1.0
review_months: 12
---
{% set gov = intake.governance %}
{% set director = gov.ceo_or_director | default('[TO CONFIRM]', true) %}{% set quality_lead = gov.quality_lead | default('[TO CONFIRM]', true) %}{% set complaints_officer = gov.complaints_officer | default('[TO CONFIRM]', true) %}{% set rostering_manager = gov.rostering_manager | default('[TO CONFIRM]', true) %}
{% set governing_body = 'the Board' if gov.has_board else 'the Director' %}
{% set tenancy_service = {'NSW': 'Tenants\' Union of NSW and your local Tenants\' Advice and Advocacy Service', 'VIC': 'Tenants Victoria', 'QLD': 'Tenants Queensland', 'WA': 'Tenancy WA', 'SA': 'RentRight SA', 'TAS': 'Tenants\' Union of Tasmania', 'ACT': 'Tenants\' Union ACT', 'NT': 'Darwin Community Legal Service Tenants\' Advice Service'} %}
# Participant Rights Statement (Easy-to-Read)

## Purpose

This statement tells you about your rights when {{ org.name }} supports you in your home. We give it to you when you start with us. We go through it with you again every year. You can ask for it in Easy Read, large print, another language or Auslan.

## Scope

This statement is for every person {{ org.name }} supports. It is also for your family, friends, guardian or advocate if you want them to have it. It applies in your home, in the community and everywhere we support you.

## Policy statement

### Your rights

- You are in charge of your life. You make the decisions about your life. We help you decide. We do not decide for you.
- You choose your supports. You choose what support you get, when you get it and who gives it. You can say what kind of worker you want.
- You are treated with respect. Workers are kind and polite. They respect your culture, your beliefs, your gender and who you love.
- You have privacy. Workers knock before they come into your room. Your personal information is kept private. You can see what we write about you.
- You can take risks. You can try new things, even if there is some risk. We will talk with you about how to stay safe. We will not stop you just to make our job easier.
- You are safe from harm. No one is allowed to hurt you, scare you, take your things or treat you badly. If someone does, we will act quickly. We will tell the NDIS Commission when the law says we must.
- You control your money. Your money is yours. We only help with your money if you ask us to, and we write down everything we do with it.
- You can have visitors. Your family, friends and partner can visit you. Workers do not choose your visitors.
- You can say no. You can say no to a support, a worker or an activity. We will listen.
- You can have an advocate. An advocate is a person who speaks up for you. You can have one at any time. It is free.

### Your home is yours

- Your home belongs to you. You decide how your room looks. You and your housemates decide the routines in your home.
- We are your support provider. We are not your landlord{% for home in intake.homes %}{% if home.tenancy_holder == 'provider' %} — except at {{ home.name }}, where {{ org.name }} holds the lease. If you live there, we tell you this in writing and help you get free advice from someone who does not work for us{% endif %}{% endfor %}.
- Your housing has its own agreement. You have one agreement for your home and a different agreement with us for your supports. They are not joined together.
- Rent is separate. Rent, food and bills are not paid by your NDIS plan for supports. We tell you clearly what you pay and what your plan pays.

### If you want to change support provider

- You can change. You can stop using {{ org.name }} and choose another provider at any time. You do not need to give us a reason.
- You keep your home. Changing your support provider does not mean you have to move. Your home agreement stays the same.
- We will help you move to a new provider. We keep supporting you until your new provider starts. We give your new provider the information they need, if you say yes.
- No one can pressure you. No worker, manager or landlord may tell you that you must keep {{ org.name }} to keep your home. If anyone says this, tell us, your advocate or the NDIS Commission straight away.

### How to complain

- You can complain about anything. Complaining is safe. It will not change how we treat you or your home.
- Tell any worker, or tell {{ complaints_officer }}. You can call {{ org.phone | default('[TO CONFIRM]', true) }} or email {{ org.email | default('[TO CONFIRM]', true) }}.
- You can complain in any way. Talk to us, write to us, use pictures, or ask a friend, family member or advocate to complain for you.
- We will tell you we got your complaint within 2 days. We will work with you to fix the problem. We will tell you what we did.
- You can complain to the NDIS Commission instead. Phone 1800 035 544. Or go to ndiscommission.gov.au. You do not have to complain to us first.
- If you use a phone service, the National Relay Service is 133 677. For an interpreter, call 131 450.

### Who can help you

- An advocate. Find a free advocate through the Disability Advocacy Finder on the Department of Social Services website, or call the Disability Gateway on 1800 643 787.
- Tenancy advice. For help with your home agreement, contact {% for state in org.states %}{{ tenancy_service[state | upper] | default('the tenants\' advice service in ' ~ state) }}{% if not loop.last %} or {% endif %}{% endfor %}. Their advice is free.
- The NDIS Commission. Phone 1800 035 544 about your rights, complaints or if you are not safe.
- The police. Call 000 if you are in danger.

## Roles and responsibilities

| Who | What they do for you |
|---|---|
| Your workers | Support you the way you want. Listen to you. Tell a manager if something is wrong. |
| {{ rostering_manager }} | Makes sure your roster and workers suit you. Explains your home agreement and support agreement. |
| {{ complaints_officer }} | Takes your complaints. Helps you find an advocate. |
| {{ director }} | Is in charge of {{ org.name }}. Makes sure your rights are respected. Never links your home to your choice of provider. |
| {{ quality_lead }} | Checks that we are doing what this statement says. Asks you every year how we are going. |

## Records kept

- A note that you were given this statement, in what format, and that we went through it with you
- Your support agreement and a copy of your home agreement, if you want us to keep one
- Your complaints and what we did about them
- Notes of what you tell us each year about your rights and our supports

## Related documents

- SIL Service Agreement Template
- Tenancy, Housing and Support Separation Policy
- Complaints and Feedback Policy and Procedure
- Supported Decision-Making Policy and Procedure
- Person-Centred Supports Policy
- Household Decision-Making and Household Rules Policy
- Conflicts of Interest Policy, Procedure and Register
- Privacy and Confidentiality Policy

## Legislation and standards references

- National Disability Insurance Scheme Act 2013 (Cth), section 4 (general principles)
- NDIS (Code of Conduct) Rules 2018 — the NDIS Code of Conduct
- NDIS (Provider Registration and Practice Standards) Rules 2018 — NDIS Practice Standards, Core Module outcomes 1.1 to 1.5 and 2.5 (feedback and complaints)
- NDIS Practice Standards, SIL supplementary module (registration group 0138, 2026), supported decision-making and housing and support security outcomes
- NDIS (Complaints Management and Resolution) Rules 2018
- Privacy Act 1988 (Cth)
- United Nations Convention on the Rights of Persons with Disabilities
{% for state in org.states %}
- Residential tenancies legislation of {{ state }}, as cited in the Tenancy, Housing and Support Separation Policy
{% endfor %}

## Review

We check this statement every 12 months with the people we support. {{ quality_lead }} looks after it. {{ governing_body }} approves it. We update it sooner if the law or our homes change.

## Document control

| Version | Drafted | Approved by | Approval date | Next review |
|---|---|---|---|---|
| 1.0 | {{ intake.meta.generated_on | date }} | {{ director }} | [TO CONFIRM on adoption] | 12 months after approval |
