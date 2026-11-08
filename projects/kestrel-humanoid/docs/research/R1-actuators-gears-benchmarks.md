# R1 — Reference humanoids, integrated actuators, frameless motors, gears, screws (research notes)

Collected November 2026 from manufacturer datasheets/catalogues (MyActuator V4 manual + 2026 catalogue, RobStride
spec PDF 2026-10-09, CubeMars 2026 catalogue, Harmonic Drive CSG/CSF component catalogue, Rollvis RV tables,
TQ-RoboDrive pages). "(secondary)" = press/aggregator. Not verified this pass: Encos, HighTorque, Fourier FSA,
Kollmorgen (403), Allied, Moog, Nabtesco, Sumitomo, Neugart, THK/IKO crossed-roller tables (login/502).

## A. Reference humanoids

| Robot | Height / mass | DOF | Battery / runtime | Peak joint torques | Source |
|---|---|---|---|---|---|
| Unitree H1 | ~180 cm / 47 kg | 5/leg, 4/arm | 0.864 kWh, 67.2 V max | knee 360, hip 220, ankle 59, arm 75 N·m | unitree.com/h1 |
| **Unitree H1-2** | ~178 cm / **70 kg** | 27 (6/leg, 7/arm) | same pack | **knee 360, hip 220, ankle 2×75, waist 220, shoulder/elbow 120, wrist 30 N·m** | unitree.com/h1 |
| Unitree G1 | 132 cm / 35 kg | 23–43 | 9 Ah 13S, ~2 h | knee 90/120 N·m | unitree.com/g1 |
| Tesla Optimus (2022) | — | 28 actuators, 6 designs | 2.3 kWh | rotary 20/110/180 N·m; linear 500/3,900/8,000 N (secondary) | humanoid.guide |
| Figure 03 | 173 cm / 61 kg | — | 5 h | 20 kg payload | figure.ai/figure |
| Figure 02 | ~168 cm / ~70 kg | — | 2.25 kWh, ~5 h (secondary) | — | press |
| Apptronik Apollo | ~173 cm / 73 kg | — | ~4 h swappable | 25 kg payload (secondary) | qviro.com |
| Fourier GR-2 | 175 cm / 63 kg | 53 | ~2 h | max joint 380 N·m | rbtx.de |
| Booster T1 | 118 cm / 30 kg | 23–41 | 13S3P, 2 h walking | knee 130 N·m | generationrobots.com |
| Berkeley Humanoid | 0.85 m / 16 kg | 12 | — | 9:1 planetary: 10413 = 81.1 peak / 34.2 sustained N·m, 1,011 g, 27.9 rad/s @48 V | arXiv 2407.21781 |
| Berkeley Humanoid Lite | 0.8 m / 16 kg | — | 6S | 3D-printed cycloidal ~90 % eff.; robot US$4,312 | arXiv 2504.17249 |
| Boston Dynamics Atlas (electric) | 1.9 m / 90 kg | 56 | 4 h, self battery swap | 50 kg instant / 30 kg sustained lift, IP67 | bostondynamics.com/atlas/ |

## B. Integrated actuators

MyActuator RMD-X V4 (dual 17-bit absolute encoders, EtherCAT + CAN, crossed-roller output) — myactuator.com/downloads-xseries:

| Model | Ratio | V nom (range) | Rated N·m @ rpm | Peak | No-load rpm | Kt | Mass | Price |
|---|---|---|---|---|---|---|---|---|
| X6-60 | 19.6 | 48 (20–55) | 20 @153 | 60 | 176 | 2.1 | 0.82 kg | — |
| X8-120 | 19.6 | 48 (20–55) | 43 @127 | 120 | 158 | 2.4 | 1.40 kg | US$977 RobotShop |
| X10-200 hollow | 20 | 48 | 60 @74 | 170 | 80 | 5.1 | 1.64 kg | — |
| **X12-320** | 20 | 48 (sheet: 20–70; note: 55 V max) | 85 @100 | 320 | 125 | 3.3 | 2.37 kg | US$1,647 RobotShop |
| X15-450 | 20.25 | **72** (20–80) | 145 @98 | 450 | 108 @72 V | 5.8 | 3.50 kg | US$2,376 |

X12-320: η 75 %, 0.12 Ω line, 20 pole pairs, output bearing 4.5 kN axial / 5 kN radial; stall table 300 N·m 3 s,
250 N·m 7 s, 150 N·m 10 s. RH harmonic actuators (100:1): RH-20 50/80 N·m 1.45 kg; RH-25 108/157 N·m 2.42 kg; RH-32
150/229 N·m 4.32 kg.

RobStride (CAN/CAN-FD only; rated at 100 rpm on stated heatsink plate) — github.com/RobStride/Product_Information:
RS00 10:1 14–17 N·m peak 0.31 kg ¥598 · RS02 7.75:1 17 N·m 0.40 kg · RS03 9:1 20/60 N·m 0.90 kg ¥999 ·
**RS04 9:1 40 (345 mm plate) / 35 (220×200 plate) rated, 120 peak N·m, 1.42–1.51 kg, Ø120×42, ¥1,199 / €255** ·
RS06 9:1 11/36 N·m 0.62 kg · RS10P 25:1 14/42 N·m 0.46 kg. RS01 is 36 V (48 V max) — excluded.

CubeMars AK (CAN) — cubemars.com 2026 catalogue: AK10-9 V3 9:1 18 rated/53 peak, Km 0.32, 0.94 kg, US$799 ·
AK80-64 64:1 48/120 N·m 0.85 kg · AK70-10 8.3/24.8 · AK60-6 3/9 · AK45-36 8/24.

Synapticon Circulo 7/9: ring servo drive for frameless motors, ≤60 V, 60 A rms, EtherCAT ≤4 kHz, FSoE, 2× 20-bit
encoders, 72/92 mm OD.

## C. Frameless torque motors

TQ-RoboDrive ILM (48 V, star) — tq-group.com TQ-RoboDrive motor kits; 10–12 weeks, price on request:

| Model | OD / rotor ID mm | Stator / rotor len mm | Mass g | Nom / peak N·m | Kt N·m/A | R mΩ | pp | rpm | I nom | η max |
|---|---|---|---|---|---|---|---|---|---|---|
| ILM70x18 | 69 / 42 | 30.5 / 20.7 | 330 | 1.25 / 4.05 | 0.187 | 660 | 10 | 2110 | 6.7 A | 90 % |
| ILM85x13 | 85 / 52 | 26.9 / 15.7 | 400 | 1.44 / 4.66 | 0.134 | 220 | 10 | 2938 | 10.8 A | 92 % |
| ILM85x26 | 85 / 52 | 40.3 / 27.2 | 670 | 2.9 / 9.37 | 0.253 | 320 | 10 | 1560 | 11.5 A | 91 % |
| **ILM115x25** | 115 / 74 | 38.7 / 27.1 | 1,070 | 3.9 / 12.7 | 0.281 | 140 | 15 | 1400 | 14 A | 93 % |

CubeMars RI frameless — 2026 catalogue:

| Model | Size mm | Rated / peak N·m | Kt | **Km N·m/√W** | Line R mΩ | pp | Mass g | rpm @48 V |
|---|---|---|---|---|---|---|---|---|
| RI70 KV95 | Ø76×24 | 0.94 / 2.68 | 0.130 | 0.201 | 418 | 14 | 270 | 3912 |
| RI80 V2 KV75 | Ø85×27 | 1.45 / 4.1 | 0.155 | 0.270 | 330 | 8 | 411 | 2960 |
| RI100 KV105 | Ø104×26 | 1.76 / 4.95 | 0.129 | 0.363 | 126 | 14 | 500 | 4368 |
| **RI85-PH KV85** | Ø85×27.3, Ø52 bore | 2 / 5 | 0.13 | 0.299 | 138.5 | 14 | 411 | 3042 |
| **RI115-PH KV40** | Ø115×38.1, Ø74 bore | 5.5 / 16 | 0.29 | **0.66** | 134 | 20 | 1,108 | 1430 |

## D. Strain-wave gears — Harmonic Drive CSG / CSF component sets

Cells: rated @2000 rpm / repeated peak / average limit / momentary peak (N·m). harmonicdrive.net CSG-CSF_Component.pdf
(Tables 038-1/038-2, 041-1).

| Size | CSG-50 | CSG-80 | CSG-100 | CSG-120 | CSF-100 |
|---|---|---|---|---|---|
| 14 | 7/23/9/46 | 10/30/14/61 | 10/36/14/70 | — | 7.8/28/11/54 |
| 17 | 21/44/34/91 | 29/56/35/113 | 31/70/51/143 | 31/70/51/112 | 24/54/39/108 |
| 20 | 33/73/44/127 | 44/96/61/165 | 52/107/64/191 | 52/113/64/191 | 40/82/49/147 |
| 25 | 51/127/72/242 | 82/178/113/332 | 87/204/140/369 | 87/217/140/395 | 67/157/108/284 |
| 32 | 99/281/140/497 | 153/395/217/738 | 178/433/281/841 | 178/459/281/892 | 137/333/216/647 |

| Size | 14 | 17 | 20 | 25 | 32 |
|---|---|---|---|---|---|
| Component OD (mm) | 50 | 60 | 70 | 85 | 110 |
| Mass (kg) | 0.09 | 0.15 | 0.28 | 0.42 | 0.89 |
| Max input, grease (rpm) | 8,500 | 7,300 | 6,500 | 5,600 | 4,800 |

Efficiency: curves only (catalogue p.047). Leaderdrive LHS(G) table is numerically identical to CSG but rated at
3500 rpm input; LCS matches CSF; backlash ≤10 arcsec; no prices/masses published (leaderdrive.com/product/4.html, /6.html).

## E. Cycloidal / planetary

Spinea TwinSpin G (ratio 33–57): TS 075 i41 35/70 N·m 0.95 kg · TS 085 i33 75/150 N·m, Mc 336 N·m, 1.7 kg ·
TS 095 i43 85/170 N·m 1.9 kg · TS 115 i43 173/346 N·m 3.2 kg (spinea.com/en/products/twinspin/g-series).
Low-ratio QDD datapoints: Berkeley 9:1, RobStride 7.75–10:1, CubeMars 6–9:1, MyActuator X8-32 9:1.

## F. Crossed-roller bearings

Not retrieved (THK login, IKO 502). Proxy ratings from integrated actuators: X12-320 4.5 kN axial / 5 kN radial;
X15-450 5.4 / 6 kN; AK10-9 Cr 2.0 kN. → Bearing selections in docs/03 use catalogue values flagged for confirmation.

## G. Planetary roller screws — Rollvis RV single nut (Ca / C0a kN, η direct/inverse)

RV 8 L2 10.0/20.3 (0.88/0.87) · RV 10 L4 15.6/25.1 (0.89/0.88) · RV 12 L5 18.1/27.3 (0.89/0.88) · RV 15 L5 28.9/51.5 ·
RV 20 L5 48.0/100.2 (rollvis.com product tables). Prices not public.

## Researcher's five findings (leg actuators)

1. Class benchmark: H1-2 (70 kg) knee ~360, hip ~220, ankle 2×75 N·m; GR-2 up to 380 N·m.
2. MyActuator X12-320 is the only verified off-the-shelf EtherCAT actuator at this level (2.37 kg, 320 N·m, 125 rpm
   no-load) — slow for running gaits; X15-450 is a 72 V part.
3. 13S gives little headroom for 55 V-max integrated actuators → bus clamp/brake resistor needed.
4. Custom harmonic: gear sets the limit (CSG-32-100 178/433/841 N·m, 0.89 kg); motor peak × ratio exceeds repeated peak
   → firmware torque limits mandatory.
5. Continuous ratings are heatsink-dependent (RS04 40 vs 35 N·m by plate size; X12-320 300 N·m for 3 s only).
