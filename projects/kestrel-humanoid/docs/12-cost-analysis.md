# 12 — Cost analysis

All figures are in AUD, November 2026, with the FX assumptions in docs/08. Source:
[generated/cost_summary.md](generated/cost_summary.md), generated from `data/bom.csv`.

## 1. Headline

| | AUD |
|---|---|
| **Baseline robot parts + robot-specific test rig** | **≈ 196,000** |
| Contingency (25 %): only 16 % of the baseline is a seen price; 36 % is quote-only, 47 % engineering estimate | ≈ 49,000 |
| **Planning budget (parts + rig + contingency)** | **≈ 245,000** |
| Workshop tools & instruments, if you do not already own them (§4) | 15,000 – 45,000 |
| Options: 6-axis F/T sensors (wrists + ankles) | ≈ 34,700 |

This is in line with what full-size humanoid builds cost in parts. The design deliberately avoids
premium choices where they don't buy capability (Leaderdrive vs Harmonic Drive, magnetic motor
encoders on 19 joints, load cells instead of 6-axis F/T in the baseline).

## 2. By subsystem (baseline)

| Subsystem | AUD | Share | Main drivers |
|---|---|---|---|
| Drives | 29,083 | 14.8 % | 22 × Everest S (~US$620 indicative) + 4 high-current drives + 26 carrier PCBs |
| Actuator gears | 20,016 | 10.2 % | 14 custom ground planetary sets + 12 strain-wave sets |
| Actuator motors | 18,496 | 9.4 % | 4 custom KM-130, 7 TQ kits, 11 CubeMars kits, 4 KM-50 |
| Actuator sensing | 18,200 | 9.3 % | 33 AksIM-2 encoders (≈ A$456 each incl. ring), torque flexures, NTCs |
| Actuator housings | 16,540 | 8.4 % | 26 machined + anodised housing sets |
| Test rig | 15,700 | 8.0 % | gantry + harness, actuator dyno (FUTEK TRS605), leg stand |
| Structure | 11,620 | 5.9 % | pelvis, torso, limbs, Ti parts, CF tubes |
| Hands | 11,168 | 5.7 % | 20 maxon micro-drives + ball screws, controllers, mechanics |
| Compute | 10,037 | 5.1 % | Jetson T5000 (US$4,999 after the Jul-2026 price rise), J601, UP Squared Pro |
| Sensors | 9,873 | 5.0 % | cameras, LiDAR, IMUs, fingertip sensors, ToF, audio |
| Bearings | 7,544 | 3.8 % | 26 crossed-roller + 52 rotor bearings |
| Consumables & spares | 6,900 | 3.5 % | fasteners, adhesives, 10 % spares |
| Shells | 5,710 | 2.9 % | MJF + paint + visor + bellows |
| Battery | 4,301 | 2.2 % | cells, Orion BMS 2, disconnect, enclosure |
| Safety | 4,150 | 2.1 % | FORT e-stop (quote), relay, pendant |
| Wrist actuators, harness, power, cooling | 6,665 | 3.4 % | |

Actuators (motors + gears + sensing + housings + bearings + drives + wrist) total **≈ A$112k, 57 %
of the robot**. That is where cost-down effort pays.

## 3. Scenarios

| Scenario | Changes from baseline | Est. AUD (parts + rig) |
|---|---|---|
| **Lean** | custom F28P65x/GaN drives instead of modules (−≈ 20k, but +6–12 months of firmware/safety work); MT6835 on all motor sides and AksIM-2 only on outputs (−≈ 3k); Chinese crossed-roller bearings (−≈ 5k); Jetson T4000 (−≈ 3k); FDM-ASA shells primed in-house (−≈ 3k) | ≈ 160,000 |
| **Baseline** | as designed | ≈ 196,000 |
| **Premium** | Harmonic Drive CSG sets (+≈ 9k); Bota F/T at wrists + ankles (+≈ 35k); Harmonic/THK branded bearings throughout (+≈ 3k); second spare actuator set for legs (+≈ 25k) | ≈ 268,000 |
| Phase-0 software mule (optional, before custom actuators) | MyActuator X12-320/X8-120/RH-25 class integrated actuators on a 13S bench robot | +≈ 45,000 |

## 4. Tools and equipment (if not already owned)

| Item | Indicative AUD | Notes / source |
|---|---|---|
| Oscilloscope 4-ch 100 MHz (Rigol DHO814) | 1,016 | Emona [R6] |
| Electronic DC load 150 V 60 A 350 W (Rigol DL3031) | 1,914 | Emona [R6], for battery/drive tests |
| Bench supply ≥ 70 V / ≥ 10 A, programmable, current-limited | 1,500–3,000 | for safe drive bring-up (Emona's first pages showed no 60 V/20 A unit [R6]) |
| Soldering station + hot-air rework + microscope | 1,200–2,500 | Hakko FX-951 / FR-810B via HK Wentworth [R6] |
| Battery spot welder (kWeld kit + supply) or a laser-welding service | 400–1,500 | [R6] |
| Insulation tester (500/1000 V) + 4-wire milliohm meter | 800–1,500 | motor/pack hi-pot and resistance |
| Thermal camera | 600–2,000 | thermal tests |
| Torque wrenches 1–25 N·m and 5–60 N·m, calibrated | 500 | flange preloads |
| Metrology: calipers, micrometers, bore gauges, dial indicators, surface plate, height gauge | 1,500–3,000 | Mitutoyo-class |
| 3D printer (Bambu/Prusa class, enclosed) | 1,500–2,500 | jigs, fixtures, prototype shells |
| Benchtop mill + lathe (optional: most machining is outsourced) | 8,000–25,000 | Hare & Forbes class |
| Lithium safety: fire blanket, Class D/AVD extinguisher, battery bag, sand bin | 400–800 | |
| **Total** | **≈ 15,000 – 45,000** | depending on what is outsourced |

## 5. Manufacturing cost assumptions to verify

* CNC: A$70–180/h Australian shop rates (low-confidence vendor marketing, R6). The BOM uses per-part
  estimates; get PCBWay/JLCCNC/local quotes from the STEP files before committing.
* Hard anodise: about A$20/dm² (Absolute Anodising WA, R6); budgeted inside the housing and structure lines.
* MJF PA12: about A$0.35–0.50/cm³ effective; ≈ 4,600 cm³ of shells.
* Gear sets: the largest uncertainty after drives. Get two gear-shop quotes for the KA-130 set first.

## 6. Spending sequence (cash flow)

1. **Phase 0–2 (≈ A$35k):** test rig, e-stop, power bench, one of each drive, RT computer, one KA-90P and one KH-25 actuator set.
2. **Phase 3–5 (≈ A$95k):** all actuators, after the first article of each class passes the dyno tests.
3. **Phase 6–9 (≈ A$45k):** battery, structure, compute, sensors, arms.
4. **Phase 10–12 (≈ A$21k):** hands, head, shells, harness.

Buying one of each class first and testing it before buying the rest is the single most effective way to protect the budget.

## 7. Effort estimate (builder hours, experienced)

| Phase | Hours |
|---|---|
| Workshop, rigs, electronics bring-up (P0–P2) | 250–400 |
| Actuators incl. custom motors (P3–P5) | 900–1,500 |
| Battery (P6) | 80–150 |
| Legs, torso, arms (P7–P9) | 500–800 |
| Hands (P10) | 300–500 |
| Head, harness, shells, assembly (P11–P12) | 300–500 |
| Software and commissioning to stable walking (P13, docs/11) | 1,500–3,000 |
| **Total** | **≈ 3,800 – 6,900 h** (2–4 years part-time) |
