# Prospecting playbook — finding unregistered SIL providers

Goal: 150–400 candidate providers in 3 days, verified to "unregistered" before any contact.

## Sources (all free)
1. **Provider Link** SIL category — already scraped into `data/sources/providerlink.csv` (20 reachable listings, 15 Tasmanian, mostly large registered organisations; low value, verify before use).
2. **MyCareSpace** provider search, service "Supported Independent Living" — lists registered and unregistered; JavaScript-rendered, so copy listings manually or use the browser's "save as CSV" extension.
3. **Google Maps**: search "SIL provider", "supported independent living", "disability accommodation support" per metro (Sydney, Melbourne, Brisbane, Perth, Adelaide, Gold Coast, Newcastle, Geelong, Canberra, Townsville, Cairns). Export name/phone/website with a free Maps scraper extension or by hand. Highest yield for small operators.
4. **Housing Hub / SIL vacancy boards**: providers advertising vacancies are actively recruiting participants — small/growing providers over-index here.
5. **Facebook**: pages posting "SIL vacancy" in NDIS groups; Marketplace-style SIL vacancy posts. Note the provider name and website.
6. **Referrals**: plan managers, support coordinators, SDA providers (see partner emails).

## Verification (mandatory before contact)
- NDIS Commission Provider Register (find-registered-provider): search the legal/trading name and ABN.
  - Registered with group **0138** → `registered_0138` → do not pitch the sprint; pitch Audit-Ready only if they mention an upcoming audit.
  - Registered but only **0115** → `registered_0115` → SIL Module Gap Analysis segment.
  - Not found → `unregistered` → primary segment. Confirm they deliver SIL (not just drop-in) from their website before calling.
- Log with `tools/prospects.py mark --name "…" --status …`.

## Daily rhythm (owner)
- Morning: 20 calls (segment 1), log outcomes with `tools/funnel.py`.
- Midday: 30 personalised emails (segment 1) + 10 partner emails (segment 2).
- Afternoon: replies, discovery calls, intake interviews.
- Track: leads → contacted → conversations → calls → proposals → paid. Review conversion every 2 days; if <3 conversations per 100 contacts, change the opener.
