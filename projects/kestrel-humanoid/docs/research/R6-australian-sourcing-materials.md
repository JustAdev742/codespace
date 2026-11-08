# R6 — Australian suppliers, material properties, fabrication costs, regulation (research notes)

Collected November 2026. Many AU retail sites blocked automated access, so stock/prices there are unverified.
"(snippet)" = search summary only; "(unverified)" = not checked this session.

## A. Australian suppliers

### Motion / robotics
| Need | Supplier (confirmed facts) | URL |
|---|---|---|
| maxon | **maxon motor Australia**, Unit 1, 12-14 Beaumont Rd, Mt Kuring-Gai NSW; also sells a 55–62 mm strain-wave gearhead (≤37 N·m); RS AU stocks maxon motors | maxongroup.com/en-au |
| igus | **Treotham Automation** (exclusive distributor; Syd/Mel/Bri/Per, 1300 65 75 64); igus opened an AU branch April 2026 | treotham.com.au; press.igus.eu |
| Harmonic Drive | **No AU distributor found** — contact Harmonic Drive SE (info@harmonicdrive.de) | harmonicdrive.de |
| Leaderdrive | no AU supplier — buy direct (China) | leaderdrive.com |
| THK | **Statewide Bearings** (Kewdale WA) authorised; RS AU sells THK rails | statewidebearings.com.au/products/brand/thk |
| Hiwin | DREMC (Brisbane) cuts rails locally | store.dremc.com.au/collections/hiwin |
| NSK / NTN / SKF | **CBC Australia** / **BSC** (Motion Asia Pacific); SKF full range since May 2025 | conbear.com.au; bsc.com.au |
| Misumi | served from Misumi South East Asia (Singapore) | sg.misumi-ec.com |
| Faulhaber | **Erntec** (exclusive ANZ) | erntec.com.au |
| FUTEK, MicroStrain, VectorNav | **Metromatics** | metromatics.com.au |
| Rigol test gear | **Emona Instruments** (exclusive ANZ) | emona.com.au |

Electronics distributors (exist; stock not verifiable by automation): element14 AU, RS AU, Mouser AU, DigiKey AU,
Core Electronics, Altronics, Jaycar.

### Metals
| Material | Supplier | URL |
|---|---|---|
| 6061 / 7075 small qty | **Maker Supplies** (100 mm steps); **All Aluminium** (Hallam VIC, 2011/5083/6061/7075 offcuts); **Shape Aluminium** (7075 rounds) | makersupplies.com.au; store.allaluminium.com.au; shapealuminium.net.au |
| Al mill stock | Ullrich (now vulcan.co), Capral | vulcan.co |
| Ti-6Al-4V (Gr5) | **Titanium Suppliers Australia** (NSW); **Specialty Metals** (Welshpool WA, 4.76–254 mm bar, ASTM B348/AMS 4928); Austral Wright Metals; Kormax (snippet) | titaniumsuppliersaustralia.com.au; specialtymetals.com.au |
| 17-4PH, 4140, 316 | **Atlas Steels** (8 service centres; 630 and 4140 datasheets) | atlassteels.com.au |

### Fasteners, composites, fabrication
- Socket screws 12.9: **AIMS Industrial** (Bremick/Hobson/Inox, ASTM A574) — aimsindustrial.com.au; RS PRO DIN 912 on RS AU.
- Carbon tube: **Enhanced Composites** (roll-wrapped 6–82.5 mm, e.g. 38×36×1000 mm A$61.05) — enhancedcomposites.com.au;
  CST Composites (Sydney filament winding); Easy Composites UK ships to AU; Rock West (US, UPS).
- PCB: JLCPCB (AU duty threshold A$1000, buyer pays GST/duty); PCBWay; Circuitwise (Bella Vista NSW, assembly + X-ray);
  Lintek (Queanbeyan, RF boards).
- CNC: **PCBWay CNC** (7075-T6, Ti Gr5, Type III hard anodise; ±0.125 mm general, ±0.01 mm if called out);
  **JLCCNC** (7075, hard anodise, ±0.05 mm general, 3 business days; no Ti / 17-4PH).
- MJF: **KAD3D** (Reservoir VIC, HP PA12 from A$24.07 small part; 10 business days); **Formero** (Nunawading VIC);
  Xometry AU (snippet); 3D Print Bureau (PA11 only).
- Laser cutting: Metal Parts, Ferracut, JDL Innovations, Cut Fold Direct (instant quote).
- Anodising: **Absolute Anodising** (Landsdale WA) hard anodise from $20/dm², semi-hard $10/dm², min $50 order (ex GST).

## B. Design material properties

| Material | ρ g/cm³ | E GPa | σy MPa | UTS MPa | Fatigue MPa | k W/m·K | Source |
|---|---|---|---|---|---|---|---|
| 6061-T6 | 2.70 | 68.9 | 276 | 310 | 96.5 (5×10⁸) | 167 | ASM (aerospacemetals.com PDF) |
| **7075-T6/T651** | 2.81 | 71.7 | 503 | 572 | 159 (5×10⁸) | 130 | ASM |
| 7050-T7451 | 2.83 | 71.7 | 469 | 524 | — | 157 | ASM |
| 2024-T3 | 2.78 | 73.1 | 345 | 483 | 138 | 121 | ASM |
| **Ti-6Al-4V ann.** | 4.43 | 113.8 | 880 | 950 | 510 unnotched (10⁷); 240 notched Kt 3.3 | 6.7 | ASM |
| 17-4PH H900 | 7.75 | 196 | 1170 min | 1310 min | — | 18.4 | Atlas 630 sheet |
| 17-4PH H1025 | 7.75 | 196 | 1000 min | 1070 min | — | 18.4 | Atlas |
| 4140 Cond U | 7.85 | 190–210 | 740 min | 930–1080 | — | 42.6 | Atlas / AZoM |
| 316 ann. | 8.0 | 193 | 240 | 550 | — | 16.3 | ASM |
| PA12 MJF | 1.01 | 1.7 | — | 48 (20 % elong.) | — | — | Materialise datasheet |
| PA11 MJF | 1.05 | 1.7 | — | 54 (40 %) | — | — | Materialise |
| Onyx (PA-CF) | 1.2 | 2.4 | 40 | 37 | — | HDT 145 °C | Markforged composites datasheet |
| CFRP roll-wrapped tube (Rock West 45629) | — | axial 98, hoop 53.5 | — | ≈829 tens. / 1090 comp. (calc.) | — | — | rockwestcomposites.com/45629.html |
| PEEK 450G | 1.30 | 4.0 | 98 | — | — | 0.29 | Victrex TDS |

Raw cost (derived from Maker Supplies): 7075 Ø52 bar ≈ A$35/kg; 6061 flat ≈ A$25/kg; Ti Gr5 ≈ A$100+/kg (inferred).

## C. Indicative costs

No published price for a 100×100×50 mm 7075 part. AU CNC shop rates quoted A$70–180/h (low-confidence vendor
marketing). MJF small part ≈ A$24 (KAD3D). Hard anodise ≈ A$20/dm² (≈A$80 for a 100×100×50 block).

## D. Tools (partial; AU prices)

Rigol (Emona): DHO804 scope $834, DHO924 $1,428; DL3021 DC load (150 V/40 A/200 W) $917, DL3031 (60 A/350 W) $1,914.
No 60 V/20 A bench supply on Emona's first pages (SPS-606A 60 V 6 A $854). kWeld spot-welder kit (keenlab.de; needs
~1500 A source). FUTEK TRS600/605/705 inline torque sensors (no public prices). Hakko FX-951/FR-810B via HK Wentworth.

## E. Regulation / safety

- ACCC: no mandatory safety standard for Li-ion batteries/products; guidance only (productsafety.gov.au).
- Australia Post: Li-ion >100 Wh per battery **not accepted** → loose cells by dangerous-goods freight (UN3480) (unverified detail).
- ELV per AS/NZS 3000: ≤50 V AC or ≤120 V ripple-free DC; AS/ACIF S009 uses 60 V DC.
- ISO 10218-1/-2:2025 published Feb 2025 (replaces 2011); ISO/TS 15066:2016.
- Not verified: NSW e-bike battery rules, ISO 13482:2014 text, AS/NZS 4024.1, ISO 25785-1 (draft, legged robots).
