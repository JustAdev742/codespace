# R3 — Cells, BMS, disconnects, DC-DC, connectors (research notes)

Collected November 2026. Each row carries its source. "NOT VERIFIED" = could not confirm on a
manufacturer/retailer page during research; treat as open action. My own arithmetic is labelled.

## A. Cells

| Cell | Capacity | Max cont. | Pulse | DCIR | Mass | Max charge | Cycle life | Source |
|---|---|---|---|---|---|---|---|---|
| **Molicel P45B** 21700 | 4.5 Ah typ | 45 A | 184 W 10 s @90 % SOC | ≤13.8 mΩ | ≤70 g (retailer) | 13.5 A | 500+ @80 % (high rate) | molicel.com/inr-21700-p45b/ |
| **Molicel P50B** 21700 | 5.0 / 4.85 Ah | 60 A (80 °C cutoff) | 397 W 10 s @100 % SOC, 25 °C | AC 6.5 mΩ, DC 12.8 mΩ | 71 g max | 5 A std / 25 A max | 700–1400 @+1C/−100 W | Molicel TDS V1.1 (fsaeonline.com mirror), molicel.com/inr-21700-p50b/ |
| Molicel P60B | 6.0 Ah | "90 A" | — | 12.8 mΩ | — | 5C | — | press release 24 Jun 2025 (datasheet not found) |
| Molicel P42A | 4.2 / 4.0 Ah | 45 A | — | AC 10, DC 16 mΩ | 70 g | 4.2 A | — | Molicel datasheet V4 |
| Samsung 50S | 5.0 Ah | 30 A (45 A temp-limited) retailer | — | — | 72 g | 6 A | — | akkuteile.de (SDI sheet not retrieved) |
| Samsung 40T | 4.0 Ah | 35 A | — | — | 66.8 g | — | — | fpvfaster.com.au (AU$19.99) |
| Samsung 50E / 50G | ≈4.75 / 4.9 Ah | 9.8 / 14.7 A | — | — | 69–71 g | 4.9 A | ≥80 % @500 | SDI specs — **energy cells, not suitable** |
| EVE 40PL | 4.0 Ah | 70 A w/ cutoff | — | AC ≤5 mΩ | 67 g | 8 A | ≥60 % @400 (weak) | EVE spec Rev B |
| LG M50LT | 4.8 Ah | 14.4 A | — | — | 68 g | 3.4 A | — | LG spec — **energy cell** |

Third-party (Battery Mooch): Samsung 50S 20 A cont / 35 A <80 °C; Molicel P45B 35 A cont / 45 A temp-limited
(forum.esk8.news, e-cigarette-forum.com Mooch threads).

Prices / AU availability: 18650batterystore (US) P50B US$11.99 → US$8.25 @200+ (verified); P45B US$9.99 (sold out);
FPV Faster AU Samsung 40T AU$19.99 (verified); Master Instruments (AU distributor) lists P45B, 40T, 50G (site 403);
Batteries Direct AU P45B AU$37 (snippet). **No AU seller found for P50B** → import from authorised distributor.

Counterfeit control: buy from authorised distributors with lot-numbered invoices; on arrival weigh every cell,
measure 1 kHz IR and OCV; reject outliers (UL "Be Safe Buy Real"; 18650batterystore fake-cell guide).

Arithmetic (cells only): 13S10P P45B = 2.11 kWh, 9.1 kg, pack DCIR ≈ 18 mΩ, prospective short circuit ≈ 3 kA.
13S8P P50B = 1.87 kWh, 7.4 kg, pack DCIR ≈ 21 mΩ.

## B. BMS

| Option | Cells | Balancing | Temp inputs | Comms | Current path | Price | Source |
|---|---|---|---|---|---|---|---|
| **Orion Jr 2** | 1–16S, 60 V max | 150 mA passive | 3 (+exp.) | CAN 2.0B opt., RS-232 | external contactor/FET; Hall 200–1000 A; 0.21 kg | US$405 / US$440 w/ CAN | orionbms.com/downloads/documents/orionjr2_specifications.pdf |
| Orion BMS 2 | 4–180S | 200 mA | 8 | 2× CAN | external | 24-cell US$820 | orionbms.com |
| REC 2Q 16S | 4–16S | ≈1 A resistor | — | CAN | external shunt | AU$933 kit | solar4rvs.com.au |
| Batrium K9 | 3–16S | ≈500 mA | 4 | — | shunt 400/500 A | — | oldsupport.batrium.com |
| JK / Daly | — | — | — | — | internal MOSFETs | cheap | **rejected** — counterfeit-MOSFET failures documented (endless-sphere teardown) |
| **TI BQ76952** (custom) | 3–16S | ext. FETs supported | 9 ext. thermistors | I²C/SPI/HDQ | high-side NFET drive w/ charge pump; CC ±200 mV | — | ti.com/product/bq76952 |
| TI BQ77216 secondary | 3–16S | — | NTC OT | — | OVP 3.55–5.1 V ±10 mV | — | ti.com/product/BQ77216 |
| TIDA-010208 ref. | 10–16S | — | — | — | high-side NFET (CSD19536KTT), BQ77216, MSP430 | — | ti.com/tool/TIDA-010208 |

(BQ7718 is 2–5S only — not applicable.)

## C. Disconnect / protection

| Part | Rating | Fit | Source |
|---|---|---|---|
| TE EV200 | 500 A, 900 V | fits, heavy; listed not currently available | te.com 1618002-7 |
| TE LEV100 | 100 A cont | **no** (< 150 A) | masterelectronics.com |
| Gigavac GX11 | 150+ A, 12–800 V, 0.46 kg | marginal | eccoconnectors.com |
| Albright SW80B | 96 V variant (SW80 std is 48 V max — **no**) | ok for 100 A | Albright SW80P datasheet |
| **TI TPS4811-Q1 / TPS48111** | 3.5–80 V (100 V abs); back-to-back NFET driver, 2-level OC, 1.2 µs SC response, precharge driver (48111), IMON ±2 % | **best fit** | ti.com/product/TPS4811-Q1 |
| TI LM5069 | 9–80 V single-FET hot-swap | not bidirectional | ti.com/product/LM5069 |
| TI LM5060 | 75 V abs | thin margin | ti.com/product/LM5060 |
| TI TPS1210 | 45 V abs | **no** | ti.com/product/TPS1210-Q1 |

Fuses/breakers (Littelfuse, Bussmann, Mersen, E-T-A, Blue Sea): NOT VERIFIED — selection rule ≥58 V DC (prefer 80 V)
and breaking capacity > 3 kA prospective fault. Regen: Orion Jr 2 provides a 0–5 V charge-current-limit (CCL) output
and CAN → feed to drives to cap regen.

## D. DC-DC (Mean Well verified)

| Model | Input | Output | Eff. | Size, mass |
|---|---|---|---|---|
| RSD-300C-12/-24 | 33.6–62.4 V | 12 V 25 A / 24 V 12.5 A | 91 % | 216×96.5×40 mm, 1.19 kg |
| DDR-240C-24 | 33.6–67.2 V | 24 V 10 A | 91 % | 40×125×114 mm, 0.76 kg |
| SD-350C-12/-24 | 36–72 V | 12 V 27.5 A | 81 % | 215×115×50 mm, 1.1 kg |

meanwell.com spec PDFs. Too heavy for the robot (≈1 kg each); acceptable on the test bench. Board-level converters
(Vicor DCM/BCM, TDK i7A/i6A, RECOM) NOT VERIFIED → see docs/05 for the selected brick and its open-action status.

## E. Connectors / wire

Amphenol SurLok Plus: 3.6 mm 50–70 A, 5.7 mm 100–120 A, 8 mm 120–250 A, IP67 versions, ≥100 cycles
(amphenol-industrial.com/surlok-plus). igus chainflex CFROBOT: torsion ±180°/m @5 M cycles (igus.com/product/CFROBOT).
Others (Amass, Anderson, Harwin, Hirose, Molex, JST, LEMO/ODU, LAPP) NOT VERIFIED in this pass.

## F. Standards

IEC 62133-2 scope is portable batteries; for a ~2 kWh robot pack UL 2271 / IEC 62619 are the closer references
(researcher's assessment, not verified). Aspen PyroThin: OEM-only cell barrier (aerogel.com). UN38.3, UL 2271/2580,
AU state rules: NOT VERIFIED in this pass.

## Researcher recommendation

Cell: Molicel P45B 13S10P (≈2.1 kWh) — AU-distributed, well tested; P50B as step-up if genuine supply secured.
BMS: Orion Jr 2 + CAN for first build (CCL/DCL to drives), 500 A Hall, EV200-class contactor or TPS48111 back-to-back
MOSFET disconnect. Later: custom BQ76952 + BQ77216 + BQ34Z100 (TIDA-010208 base). Avoid Daly/JK.
