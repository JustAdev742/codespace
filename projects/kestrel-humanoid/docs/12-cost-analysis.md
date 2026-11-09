# 12 — Cost analysis (K1 Mk II)

All figures are in AUD, November 2026, with the FX assumptions in docs/08. Source:
[generated/cost_summary.md](generated/cost_summary.md), generated from `data/bom.csv` by `calc/kestrel/bom.py`.

## 1. Headline

| | AUD |
|---|---|
| **Mk II baseline robot parts + robot-specific test rig** | **≈ 222,800** (A$222,781) |
| Mk I baseline (for comparison) | 196,004 |
| **Delta vs Mk I** | **+26,777 (+13.7 %)** |
| Contingency (**30 %**, raised from Mk I's 25 %): only 16 % of the baseline is a seen price; 21 % is quote-only, 63 % engineering estimate | ≈ 66,800 |
| **Planning budget (parts + rig + contingency)** | **≈ 290,000** |
| Workshop tools & instruments, if you do not already own them (§4) | 17,000 – 50,000 |
| Options: 6-axis F/T sensors (wrists + ankles) | ≈ 34,700 |
| Options: third hot-swap pack + off-board 2-bay charger | ≈ 3,400 |
| Option: KA-150X 20S package (rough, docs/05 §2.1) | ≈ 38,000 |

**Why the estimate share rose from 47 % to 63 %.** Mk II replaces bought or quoted parts with custom parts:
- the Elmo drives (Q) with the custom HC2 (E);
- the TQ motor kits (Q) with scratch KM motors (E) or CubeMars kits (V);
- the strain-wave sets (Q) with machined cycloids (E);
- the power path, BMS, dock and loop components, most of which are E.

The CubeMars RI115-PH / RI85-PH and maxon ECX FLAT 32 L prices were read on the manufacturers' pages on 2026-11-09
(URLs in the BOM). Koolance pump, radiator and coolant prices were read too, but those parts miss the docs/03 mass, power
or freeze spec, so they are listed as alternatives. The web-search budget for this revision ran out before the remaining
Mk II parts could be priced (spec pump and radiator, IP68 fans, Sensirion flow sensor, EPC9186HC2, fuses, pack
connector, charger, magnets, gear sets), so those lines are marked E. Getting quotes for the ten largest E lines is the single best way to tighten the
contingency.

**Mk II delta for the money:**
- knee peak 395 → 493 N·m and knee continuous 139 → 263 N·m (drive-limited);
- a wrist that meets its requirement;
- 30 kg sustained / 50 kg momentary payload;
- 13-DOA hands with palm cameras;
- 2.24 kWh hot-swap power with ≤ 1.5 h docked charging.

## 2. By subsystem (baseline)

| Subsystem | Mk II AUD | Share | Mk I AUD | Delta | Main drivers |
|---|---|---|---|---|---|
| Drives | 33,233 | 14.9 % | 29,083 | +4,150 | 22 × Everest S (~US$620 indicative); 5 × HC2 GaN 150 A drives (incl. spare) + EPC9186HC2 eval board + 2 PCB spins |
| Actuator gears | 23,374 | 10.5 % | 20,016 | +3,358 | KA-130 17:1 / 14:1 with an m1.5 stage 2; 10 KA-110/90 planetaries; 4 C25 + 4 C20 wire-EDM cycloids; 4 size-14 strain-wave |
| Actuator sensing | 18,272 | 8.2 % | 18,200 | +72 | 33 AksIM-2 encoders (≈ A$456 each incl. ring), torque flexures, NTCs, wrist-cross sensors |
| Actuator motors | 17,845 | 8.0 % | 18,496 | −651 | KM-130x50-LC ×4 at ≈ A$2,110 each (laminations, N50UH magnets, winding, rotor, liquid jacket); CubeMars RI115-PH ×3 (US$199.90) and RI85-PH ×7 (US$147.90); scratch KM-115x32-N50 ×4, KM-85x26-N50-4t ×4, KM-50x20 ×4 |
| Actuator housings | 17,140 | 7.7 % | 16,540 | +600 | jacketed KA-130 housings with the HC2 drive bay |
| Test rig | 16,300 | 7.3 % | 15,700 | +600 | gantry + harness, dyno (FUTEK TRS605), leg stand, coolant-loop bench |
| Hands | 15,748 | 7.1 % | 11,168 | +4,580 | 26 maxon micro-drives (10 DCX 12 L flexors), 13-DOA mechanics, controllers |
| Structure | 11,620 | 5.2 % | 11,620 | 0 | unchanged pending the Mk II structure re-check (higher knee loads, R10 §1.2 item 7) |
| Sensors | 10,626 | 4.8 % | 9,873 | +753 | adds 2 palm cameras (TechNexion VLS-GM2-AR0234) and their arm coax |
| Compute | 10,037 | 4.5 % | 10,037 | 0 | Jetson T5000 (US$4,999 after the Jul-2026 price rise), J601, UP Squared Pro |
| Consumables & spares | 9,400 | 4.2 % | 6,900 | +2,500 | fasteners, adhesives, ≈ 10 % spares allowance |
| Battery | 8,368 | 3.8 % | 4,301 | +4,067 | 200 P50B cells, 3 in-pack BMS boards, 3 power-path boards (one per bay + spare), 2 IP67 enclosures with heaters, hot-swap connectors, bay electrics |
| Actuator bearings | 7,704 | 3.5 % | 7,544 | +160 | 26 crossed-roller (KA-130 size re-rated) + 52 rotor bearings |
| Shells | 5,710 | 2.6 % | 5,710 | 0 | MJF + paint + visor + bellows |
| Safety | 4,300 | 1.9 % | 4,150 | +150 | FORT e-stop (quote), relay + delayed-contact expansion, pendant, 2 buttons |
| Power | 3,500 | 1.6 % | 1,355 | +2,145 | 2 kW dock charger + dock (E), 2.5 Ω chopper, PDU Mk II with charge inlet and pump drivers |
| Wrist actuators (KW-L2) | 3,755 | 1.7 % | 2,600 | +1,155 | 5 × ECX FLAT 32 L (€140), screws and guides, 3 forearm driver boards (F28P65x + 2 × DRV8353 + 24 V buck) |
| Harness | 2,950 | 1.3 % | 2,500 | +450 | 10 AWG leg feeds, IP67 sensor connectors |
| Cooling | 2,898 | 1.3 % | 210 | +2,688 | sealed loop to docs/03 §9.4: 3 pumps (M510 class), 240 mm radiator, IP68 fans, compensator, 40 % PG coolant, Thor cold plate, dry-break couplings, flow/temperature/pressure/leak sensors |
| **Total** | **222,781** | 100 % | **196,004** | **+26,777** | |

Actuators (motors + gears + sensing + housings + bearings + drives + wrist) total **≈ A$121k, 54 % of the robot**, down
from 57 % in Mk I because the power, cooling and hand systems grew faster. They are still where cost-down pays.

**Where the A$26.8k went:**

| Cause | Share of the increase |
|---|---|
| Hands | 17 % |
| Drives | 15 % |
| Battery / hot-swap | 15 % |
| Gears | 13 % |
| Cooling | 10 % |
| Spares | 9 % |
| Power / charging | 8 % |
| Wrist (KW-L2) | 4 % |
| Everything else | 8 % (shares rounded) |

## 3. Scenarios

| Scenario | Changes from the Mk II baseline | Est. AUD (parts + rig) |
|---|---|---|
| **Lean** | custom F28P65x drives on the 22 Everest joints (−≈ 13k, but +6–12 months of firmware/safety work); Chinese crossed-roller bearings (−≈ 5k); MT6835 on all motor sides (−≈ 3k); Jetson T4000 (−≈ 3k); FDM-ASA shells primed in-house (−≈ 3k); off-board charging only, no dock (−≈ 2.5k) | ≈ 193,000 |
| **Baseline** | as designed | ≈ 222,800 |
| **Premium** | Bota F/T at wrists + ankles (+≈ 35k); a spare KA-130K2 leg actuator set with HC2s (+≈ 30k); THK branded bearings throughout (+≈ 3k); third pack + off-board charger (+≈ 3.4k); Harmonic Drive CSG-14 (+≈ 1k) | ≈ 295,000 |
| **KA-150X (20S)** | baseline + B135: KM-150 motors, 200 A 150 V-class drives, 20S packs, 100 V-class replacements for every other drive and power-path IC | ≈ 261,000 (rough) |
| Phase-0 software mule (optional, before custom actuators) | MyActuator X12-320/X8-120/RH-25 class integrated actuators on a 13S bench robot | +≈ 45,000 |

## 4. Tools and equipment (if not already owned)

| Item | Indicative AUD | Notes / source |
|---|---|---|
| Oscilloscope 4-ch 100 MHz (Rigol DHO814) | 1,016 | Emona [R6] |
| Electronic DC load 150 V 60 A 350 W (Rigol DL3031) | 1,914 | Emona [R6], for battery/drive tests and pack-current calibration |
| Bench supply ≥ 70 V / ≥ 10 A, programmable, current-limited | 1,500–3,000 | for safe drive bring-up |
| **Mk II:** high-voltage differential probe + 150 A DC current probe | 1,500–3,500 [E] | HC2 GaN bring-up (fast edges, 150 A locked-rotor test) |
| **Mk II:** coolant fill/bleed kit + hand pressure pump with gauge (2 bar decay test) | 200–500 [E] | jacket and quick-disconnect leak tests |
| Soldering station + hot-air rework + microscope | 1,200–2,500 | Hakko FX-951 / FR-810B via HK Wentworth [R6] |
| Battery spot welder (kWeld kit + supply) or a laser-welding service | 400–1,500 | [R6]; 128 cells, 2 packs |
| Insulation tester (500/1000 V) + 4-wire milliohm meter | 800–1,500 | motor/pack hi-pot and resistance |
| Thermal camera | 600–2,000 | thermal tests, radiator and jacket checks |
| Torque wrenches 1–25 N·m and 5–60 N·m, calibrated | 500 | flange preloads |
| Metrology: calipers, micrometers, bore gauges, dial indicators, surface plate, height gauge | 1,500–3,000 | Mitutoyo-class |
| 3D printer (Bambu/Prusa class, enclosed) | 1,500–2,500 | jigs, fixtures, prototype shells |
| Benchtop mill + lathe (optional: most machining is outsourced) | 8,000–25,000 | Hare & Forbes class; the jacket shrink-fit needs a lathe |
| Lithium safety: fire blanket, Class D/AVD extinguisher, battery bag, sand bin | 400–800 | |
| **Total** | **≈ 17,000 – 50,000** | depending on what is outsourced |

## 5. Manufacturing cost assumptions to verify

* CNC: A$70–180/h Australian shop rates (low-confidence vendor marketing, R6). The BOM uses per-part estimates; get
  PCBWay/JLCCNC/local quotes from the STEP files before committing.
* Hard anodise: about A$20/dm² (Absolute Anodising WA, R6); budgeted inside the housing and structure lines.
* MJF PA12: about A$0.35–0.50/cm³ effective; ≈ 4,600 cm³ of shells.
* **Custom motor parts (Mk II):**
  - lamination stacks are budgeted at ≈ A$1.6 per laser-cut 0.20 mm lamination plus bonding;
  - N50UH arcs at ≈ A$480 per 42-arc set;
  - KM-130 jackets at ≈ A$540 including the 2-bar leak test.
  All [E]. Ask two lamination shops and two magnet vendors with the docs/13 drawings.
* **Gear sets and cycloids:** the largest uncertainty after the drives. Quote the KA-130 17:1 set (m1.5 stage 2) and one
  wire-EDM C25 disc pair first.
* **HC2:** 6-layer, 2 oz boards with GaN devices in small quantity. The A$1,450 per drive [E] assumes JLCPCB/PCBWay
  assembly and excludes the developer's time.

## 6. Spending sequence (cash flow)

1. **Phase 0–2 (≈ A$42k):** test rig and loop bench, e-stop, power bench, RT computer, safety MCU, **HC2 eval board + first
   spin**, and one each of: KA-130K2 (with jacket), KH-C25 (with cycloid), KA-90P. Dyno them before buying more.
2. **Phase 3–5 (≈ A$100k):** all remaining actuators and drives, after the first article of each class passes the dyno
   tests (R10 §7).
3. **Phase 6–9 (≈ A$55k):**
   - battery: two packs, BMS, power-path module; build and hot-swap-test the PPM on the bench first;
   - structure, compute, sensors, arms, cooling loop, PDU, dock.
4. **Phase 10–12 (≈ A$26k):** hands, head, shells, harness.

Buying one of each class first and testing it before buying the rest is still the single most effective way to protect
the budget. In Mk II it matters most for the HC2, the jacket and the cycloid, three new processes with no K1 precedent.

## 7. Effort estimate (builder hours, experienced)

| Phase | Hours |
|---|---|
| Workshop, rigs, electronics bring-up (P0–P2) | 250–400 |
| **HC2 drive: layout, 2 spins, firmware, STO/ASC test (Mk II)** | 300–600 |
| Actuators incl. custom motors, jackets, cycloids (P3–P5) | 1,000–1,700 |
| Battery, BMS, power path, hot-swap tests (P6) | 150–300 |
| Cooling loop: plumbing, leak tests, control firmware (Mk II) | 80–150 |
| Legs, torso, arms (P7–P9) | 500–800 |
| Hands, 13 DOA (P10) | 350–600 |
| Head, harness, shells, assembly (P11–P12) | 300–500 |
| Software and commissioning to stable walking and 30 kg carrying (P13, docs/11) | 1,600–3,200 |
| **Total** | **≈ 4,500 – 8,250 h** (2.5–4.5 years part-time) |
