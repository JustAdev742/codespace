# R9: COTS actuators and supporting parts for KESTREL S1 (research notes)

Collected 2026-11-09 (all URLs accessed that day) for **KESTREL S1**: a 1.5–1.7 m, 45–65 kg modular humanoid
built by one person in Australia. The machine-readable catalogue is
[`data/cots_actuators.json`](../../data/cots_actuators.json) (63 records, 56 with manufacturer-sourced specs).

**How to read this note**

- **V / R (verified flag).** **V** means the technical specs come from a manufacturer document: a datasheet, a product
  manual, the maker's own product page, or a selection table. **R** means the specs come from a reseller or forum (reported).
  Prices are often from resellers even when the specs are V. Each JSON `notes` field names the price source with its URL.
- **Speed.** No-load output speed at the voltage shown. For parts rated at both 24 V and 48 V, the 48 V figure is used
  where the maker publishes one, because S1 runs on a 48 V-class bus.
- **Missing values.** A dash means no source was found. Nothing was estimated into the data fields. A few derived
  numbers, such as gear ratio × motor torque for the DIY rows, appear only in `notes` and are labelled "derived".
- **Prices.** US$ are list or sale prices on the date above. A$ are Australian retail **including GST** unless marked "ex GST".
  No currency conversion was done.
- **2026 price inflation.** Memory-driven price rises hit compute hard this year. NVIDIA raised Jetson prices 33–101 % in
  July 2026, for example.

## 1. S1 joint targets (derived from K1)

The S1 numbers are 50–70 % of the K1 requirements in
[`generated/joint_requirements.md`](../generated/joint_requirements.md) (92.6 kg design). The K1 speed requirements carry
over unchanged, on the assumption that joint speed does not scale down with body mass.

| Joint | K1 repeated (momentary) N·m | **S1 at 50–70 %** N·m | K1 continuous N·m | Speed req rad/s |
|---|---|---|---|---|
| hip pitch | 336 | **168–235** | 91 | 9.7 |
| knee (joint side, before four-bar) | 351 (427) | **176–246** (214–299 momentary) | 113 | 9.5 |
| hip roll | 133 (193) | **67–93** (97–135) | 65 | 4.0 |
| hip yaw | 71 | **36–50** | 14 | 5.0 |
| ankle pitch (two push-rod actuators share it) | 173 (273) | **87–121** (137–191) | 21 | 8.0 |
| ankle roll | 50 | **25–35** | 4 | 4.0 |
| waist yaw / pitch | 60 / 208 | **30–42 / 104–146** | 19 / 14 | 4.0 / 1.5 |
| shoulder pitch / roll / yaw | 67 / 50 / 30 | **34–47 / 25–35 / 15–21** | 18 / 4 / 0 | 6.2 / 6.0 / 6.0 |
| elbow | 55 | **28–39** | 6 | 7.0 |
| wrist (3) / neck (2) | 10–13 / 12 | **5–9 / 6–8** | ≤1 | 6–8 |

## 2. Key findings

1. **"Lingzu" is RobStride.** The manufacturer of RobStride is 北京灵足时代科技有限公司 (Beijing Lingzu Shidai), which trades as
   RobStride Dynamics. There is no separate Lingzu catalogue. RobStride publishes the most complete and honest data of
   any low-cost maker: an overload-duration table for every model, rated torque tied to a stated heatsink plate, and CNY
   list prices. It also has an **Australian reseller, Pakronics**, which lists RS00/01/02/03/04/05 and the EDULITE 05 in
   AUD. Stock is shown only for the RS00 (173 units); the RS01 is out of stock.
2. **Read "peak torque" with its duration.**
   - RS04's 120 N·m lasts 10 s on a 345 × 345 mm aluminium plate, but only 5 s on a 220 × 200 mm plate, and 1 s when stalled.
   - MyActuator publishes stall tables. For example, the X12-320 manages 300 N·m for 3 s and 250 N·m for 7 s.
   - CubeMars, DAMIAO, ENCOS and HighTorque give no duration.
   - Steadywin's "peak" is a *stall* torque.
   - Unitree's 23.7 N·m is "measured at 24 °C".
   - mjbots is the most conservative: the qdd100 is rated 16 N·m for under 1 s and 3.3 N·m indefinitely.
3. **Bus-voltage trap.** These limits make a **13S bus (54.6 V full charge)** the safe choice. A 14S pack (58.8 V) only works
   with RobStride and with the MyActuator X12/X15.
   - MyActuator V4 (X2–X8): 55 V maximum operating voltage. The X12 is rated 20–70 V and the X15 20–80 V.
   - RobStride: 24–60 V (RS00, RS02) or 15–60 V (RS03–RS06). The RS01 is a 36 V part.
   - DAMIAO J10010: the sheet recommends over-voltage protection at ≤52 V. The newer J8520P/J10422P/J6248P sheets recommend ≤65 V.
   - Unitree GO-M8010-6: 30 V absolute maximum. It cannot share a 48 V bus.
4. **Only a few verified COTS parts sit in the 150–250 N·m knee/hip class**, and none is both cheap and fast:
   - MyActuator X12-320 (320 N·m, 13.1 rad/s, 2.37 kg, ~US$1,090)
   - DAMIAO J10010 (150 N·m, 15.7 rad/s, US$540)
   - DAMIAO J8520P (176 N·m, 1.39 kg, no Western price yet)
   - CubeMars AKE90-8 (170 N·m, US$484, but no integrated driver)
   - ENCOS EC-A10020-P1-12 (150 N·m, US$1,250)

   The best torque per dollar of any verified part is the **RobStride RS04 at 0.41 N·m per US$**. Paired with a 1.6–2:1
   linkage, it is the budget route into this class.
5. **Not usable for S1 legs:**
   - Unitree's separately sold motors are ≤34 N·m, and the GO-M8010-6 is limited to 30 V. No H1/G1 joint motor is sold
     separately.
   - HighTorque sells only small 36:1 units on the open market.
   - The hollow strain-wave/planetary units (CubeMars AKH70-48, DAMIAO JH20, Steadywin GIM8115-36) are too slow at
     3–6 rad/s. They suit waist pitch only.

## 3. Integrated actuator table (sorted by peak torque)

N·m/US$ and N·m/kg are computed from peak torque. "Peak duration" quotes the maker's overload or stall data where one
exists. Rows for DIY kits list part prices only.

| # | Actuator | Peak N·m | Peak duration | Rated N·m | No-load ω rad/s @ V | Ratio | Mass kg | OD×L mm | Interface | US$ | A$ | N·m/US$ | N·m/kg | V/R |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| 1 | MyActuator RMD-X15-P20-450-E | 450 | stall 435 N·m 5 s | 145 | 11.3 @ 72 V | 20.25 | 3.5 | — | EtherCAT & CAN | 1515 | — | 0.297 | 129 | V |
| 2 | DAMIAO DM-J10422P-2EC | 400 | not stated | 100 | 12.6 @ 48 V | 22 | 2.7 | 110×89.9 | CAN-FD up to 5 Mbps; UART 921600 tuning | — | — | — | 148 | V |
| 3 | ENCOS EC-A10020-P2-24 | 330 | not stated | 100 | 12.9 @ 48 V | 24 | 2.19 | 124×85 | CAN 1 Mbps (EtherCAT bridge sold separately) | 2250 | — | 0.147 | 151 | R |
| 4 | MyActuator RMD-X12-P20-320-E | 320 | stall 300 N·m 3 s | 85 | 13.1 @ 48 V | 20 | 2.37 | 124×85 | EtherCAT & CAN | 1090 | — | 0.294 | 135 | V |
| 5 | CubeMars AKH70-48 V1.0 KV41 | 222 | not stated | 74 | 3.7 @ 48 V | 48 | 1.396 | 90×81.5 | CAN | 698.9 | — | 0.318 | 159 | V |
| 6 | Steadywin GIM8115-36 (48 V) | 190.2 | stall rating | 48 | 3.7 @ 48 V | 36 | 0.96 | 96×64 | CAN & RS485 | — | — | — | 198 | V |
| 7 | DAMIAO DM-J8520P-2EC | 176 | not stated | 50 | 13.0 @ 48 V | 20 | 1.392 | 90×70 | CAN-FD up to 5 Mbps; UART 921600 tuning | — | — | — | 126 | V |
| 8 | CubeMars AKE90-8 KV35 (no integrated driver) | 170 | not stated | 55 | 22.0 @ 48 V | 8 | 1.4 | 107.5×43.5 | none integrated - needs separate driver AK80-4830-1C-A4 | 483.9 | — | 0.351 | 121 | V |
| 9 | MyActuator RMD-X10-P20-200-E (V4.1, hollow) | 170 | not stated | 60 | 8.4 @ 48 V | 20 | 1.64 | 124×63.5 | EtherCAT & CAN | — | — | — | 104 | V |
| 10 | DAMIAO DM-J10010-2EC | 150 | not stated | 40 | 15.7 @ 48 V | 10 | 1.485 | 112×62 | CAN 1 Mbps; UART 921600 tuning | 540 | — | 0.278 | 101 | V |
| 11 | ENCOS EC-A10020-P1-12 | 150 | not stated | 50 | 14.7 @ 48 V | 12 | 1.373 | 124×60 | CAN 1 Mbps | 1250 | — | 0.120 | 109 | R |
| 12 | MyActuator RMD-X8-P20-150-E (V4.1) | 150 | not stated | 43 | 16.6 @ 48 V | 19.61 | 1.33 | 96×71 | EtherCAT & CAN | — | — | — | 113 | V |
| 13 | CubeMars AK80-64 KV80 | 120 | not stated | 48 | 7.8 @ 48 V | 64 | 0.85 | 98×61.9 | CAN + UART | 889.9 | — | 0.135 | 141 | V |
| 14 | DAMIAO DM-J10010L-2EC | 120 | not stated | 40 | 20.9 @ 48 V | 10 | 1.372 | 120×53 | CAN 1 Mbps; UART 921600 tuning | 321.99 | — | 0.373 | 87 | V |
| 15 | MyActuator RMD-X8-P20-120-E | 120 | stall 129 N·m 5 s | 43 | 16.6 @ 48 V | 19.612 | 1.4 | 96×76 | EtherCAT & CAN | 645 | — | 0.186 | 86 | V |
| 16 | RobStride RS04 | 120 | 10 s | 40 | 20.9 @ 48 V | 9 | 1.51 | 120×42.2 | CAN 2.0 / CAN-FD (1 Mbps per reseller) | 295 | 577.04 | 0.407 | 79 | V |
| 17 | Steadywin GIM10015-9 (48 V) | 112 | stall rating | 20.5 | 11.9 @ 48 V | 9 | 1.372 | 122×57.5 | CAN & RS485 | 300 | — | 0.373 | 82 | V |
| 18 | DAMIAO DM-JH20-101-2EC (harmonic) | 102 | not stated | 50 | 3.1 @ 48 V | 101 | 1.434 | 90×73 | CAN-FD up to 5 Mbps | — | — | — | 71 | V |
| 19 | MyActuator RMD-X10-P35-100 (V3, discontinued) | 100 | not stated | 50 | — @ 48 V | 35 | 1.7 | — | CAN 1 Mbps / RS485 | — | — | — | 59 | V |
| 20 | DAMIAO DM-J6248P-2EC | 97 | not stated | 30 | 6.3 @ 24 V | 48 | 0.628 | 76×62.5 | CAN-FD up to 5 Mbps | 265 | — | 0.366 | 154 | V |
| 21 | MyActuator RMD-X6-P30-80-E (V4.1) | 80 | not stated | 25 | 12.2 @ 48 V | 30 | 0.81 | 80×63.5 | EtherCAT & CAN | — | — | — | 99 | V |
| 22 | CubeMars AKH70-16 V1.0 KV41 | 78 | not stated | 26 | 11.0 @ 48 V | 16 | 0.879 | 90×60.5 | CAN | — | — | — | 89 | V |
| 23 | CubeMars AK60-39 V3.0 KV80 | 72 | not stated | 24 | 10.3 @ 48 V | 39 | 0.75 | 79×67 | CAN | 448.9 | — | 0.160 | 96 | V |
| 24 | DAMIAO DM-JH20-51-2EC (harmonic) | 69 | not stated | 32 | 6.3 @ 48 V | 51 | 1.428 | 90×73 | CAN-FD up to 5 Mbps | — | — | — | 48 | V |
| 25 | MyActuator RMD-X6-P20-60-E | 60 | stall 60 N·m 5 s | 20 | 18.4 @ 48 V | 19.612 | 0.82 | 80×67.5 | EtherCAT & CAN | 490 | — | 0.122 | 73 | V |
| 26 | RobStride RS03 | 60 | 13 s | 21 | 20.4 @ 48 V | 9 | 0.928 | 98×54.1 | CAN 2.0 / CAN-FD | 245 | 509.15 | 0.245 | 65 | V |
| 27 | Steadywin GIM8115-9 (48 V) | 54.55 | stall rating | 15.27 | 13.1 @ 48 V | 9 | 0.705 | 96×48.5 | CAN & RS485 | 155 | — | 0.352 | 77 | V |
| 28 | CubeMars AK10-9 V3.0 KV60 | 53 | not stated | 18 | 33.5 @ 48 V | 9 | 0.94 | 98×61.7 | CAN (power+CAN on XT30 2+2) + UART tuning port | 698.9 | — | 0.076 | 56 | V |
| 29 | MyActuator RMD-X5-P25-50-E (V4.1) | 45 | not stated | 14.5 | 13.6 @ 48 V | 25.2 | 0.75 | 70×59.5 | EtherCAT & CAN | — | — | — | 60 | V |
| 30 | RobStride RS10P | 42 | ~1 s | 14 | 13.1 @ 48 V | 25 | 0.46 | 57×59.1 | CAN 2.0 / CAN-FD | 233.99 | — | 0.179 | 91 | V |
| 31 | DAMIAO DM-J4340-2EC V1.1 (48 V) | 40 | not stated | 12 | 11.7 @ 48 V | 40 | 0.362 | 57×53.3 | CAN 1 Mbps; UART 921600 | 215 | — | 0.186 | 110 | V |
| 32 | DAMIAO DM-J8009P-2EC | 40 | not stated | 20 | 33.5 @ 48 V | 9 | 0.963 | 98×61.7 | CAN 1 Mbps; UART 921600 | 480 | — | 0.083 | 42 | V |
| 33 | MyActuator RMD-X6-P36-40 (V2, discontinued) | 40 | not stated | 18 | — @ 48 V | 36 | 0.59 | — | CAN 1 Mbps / RS485 | 525 | — | 0.076 | 68 | V |
| 34 | HighTorque HTDW-6056-36-NE | 36 | not stated | 10 | — @ — V | 36 | — | 60×56 | CAN-FD / CAN | 321.69 | — | 0.112 | — | R |
| 35 | RobStride RS06 | 36 | 4 s | 11 | 50.3 @ 48 V | 9 | 0.621 | 82×49 | CAN 2.0 / CAN-FD | 255 | — | 0.141 | 58 | V |
| 36 | Unitree IM6014 | 34.4 | not stated | — | — @ — V | 12.66 | 0.535 | 65×60 | RS-485 (dual-port daisy chain) | 269 | — | 0.128 | 64 | R |
| 37 | MyActuator RMD-X4-P36-36-E | 34 | stall 34.5 N·m 3 s | 10.5 | 11.6 @ 24 V | 36 | 0.36 | 55×61 | EtherCAT & CAN | 400 | — | 0.085 | 94 | V |
| 38 | Unitree A1 motor | 33.5 | not stated | — | 21.0 @ — V | — | 0.605 | — | RS-485 (1 kHz control) | 500 | — | 0.067 | 55 | V |
| 39 | MyActuator RMD-X8-P9-32-R (X8-32) | 32 | stall 30 N·m 3 s | 8 | 29.0 @ 24 V | 9 | 0.55 | — | RS485 only | 645 | — | 0.050 | 58 | V |
| 40 | CubeMars AKE80-8 KV30 (no integrated driver) | 30 | not stated | 12 | 20.4 @ 48 V | 8 | 0.57 | 87×32 | none integrated | 339.9 | — | 0.088 | 53 | V |
| 41 | CubeMars AK70-9 V3.0 KV60 | 29.2 | not stated | 8.5 | 33.5 @ 48 V | 9 | 0.54 | 89×49 | CAN (XT30 2+2) + UART | 398.9 | — | 0.073 | 54 | V |
| 42 | Steadywin GIM8108-9 (48 V) | 27.38 | stall rating | 8.19 | 25.3 @ 48 V | 9 | 0.567 | 96×41.5 | CAN | — | — | — | 48 | V |
| 43 | MyActuator RMD-X8-P9-25 (X8-Pro 1:9 V2) | 25 | not stated | 10 | — @ 48 V | 9 | 0.71 | — | CAN 1 Mbps / RS485 | 450 | — | 0.056 | 35 | V |
| 44 | CubeMars AK70-10 KV100 | 24.8 | not stated | 8.3 | 50.3 @ 48 V | 10 | 0.621 | 89×50.25 | CAN | 398.9 | — | 0.062 | 40 | V |
| 45 | CubeMars AK45-36 V3.0 KV80 | 24 | not stated | 8 | 5.5 @ 24 V | 36 | 0.349 | 55×56.5 | CAN | 185.9 | — | 0.129 | 69 | V |
| 46 | Unitree GO-M8010-6 | 23.7 | not stated | — | 30.0 @ 24 V | 6.33 | 0.53 | —×42.3 | RS-485 4 Mbps (6 kHz control) | 369 | — | 0.064 | 45 | V |
| 47 | CubeMars AK80-9 V3.0 KV100 | 22 | not stated | 9 | 59.7 @ 48 V | 9 | 0.49 | 98×38.5 | CAN-FD (XT30 2+2) + UART | 479.9 | — | 0.046 | 45 | V |
| 48 | DAMIAO DM-J8006-2EC V1.1 | 20 | not stated | 8 | 19.9 @ 24 V | 6 | 0.559 | 96×40 | CAN 1 Mbps; UART 921600 | 210 | — | 0.095 | 36 | V |
| 49 | RobStride RS01 | 17 | not stated | 7 | 33.0 @ 36 V | 7.75 | 0.395 | 78.5×41.5 | CAN 2.0 only | 185 | 294.16 | 0.092 | 43 | V |
| 50 | RobStride RS02 | 17 | not stated | 7 | 42.9 @ 48 V | 7.75 | 0.418 | 78.5×41.5 | CAN 2.0 / CAN-FD | 195 | 328.12 | 0.087 | 41 | V |
| 51 | mjbots qdd100 beta 3 | 16 | <1 s | 3.3 | 40.1 @ 24 V | 6 | 0.507 | 100×44 | CAN-FD 5 Mbps | 879 | — | 0.018 | 32 | V |
| 52 | EYOU PP11-36 | 14 | not stated | 6.6 | — @ 24 V | 36 | 0.391 | 52×64 | — | 300 | — | 0.047 | 36 | R |
| 53 | RobStride RS00 | 14 | 5 s | 5 | 33.0 @ 48 V | 10 | 0.31 | 57×51 | CAN 2.0 / CAN-FD | 185 | 282.85 | 0.076 | 45 | V |
| 54 | DAMIAO DM-J4310-2EC V1.2 (48 V) | 12.5 | not stated | 3.5 | 47.1 @ 48 V | 10 | 0.306 | 57×46 | CAN 1 Mbps; UART 921600 | 180 | — | 0.069 | 41 | V |
| 55 | DAMIAO DM-J6006-2EC | 11 | not stated | 4 | 25.1 @ 24 V | 6 | 0.335 | 76×36.5 | CAN 1 Mbps; UART 921600 | 150 | — | 0.073 | 33 | V |
| 56 | CubeMars AK60-6 V3.0 KV80 | 9 | not stated | 3 | 67.0 @ 48 V | 6 | 0.38 | 79×43 | CAN + UART | 229.9 | — | 0.039 | 24 | V |
| 57 | MyActuator RMD-X6-P8-8 (X6-8, QDD) | 8 | not stated | 4.5 | 40.5 @ 48 V | 8 | 0.49 | — | CAN | 355 | — | 0.023 | 16 | V |
| 58 | MyActuator RMD-X2-P28-7-E | 7 | stall 7.5 N·m 5 s | 2.5 | 18.6 @ 24 V | 28.17 | 0.26 | — | EtherCAT & CAN | 345 | — | 0.020 | 27 | V |
| 59 | RobStride EDULITE 05 | 6 | 5 s | 1.8 | 45.0 @ 48 V | 9 | 0.242 | — | CAN | — | 181.04 | — | 25 | V |
| 60 | RobStride RS05 | 5.5 | not stated | 1.8 | 50.3 @ 48 V | 7.75 | 0.243 | 46×44 | CAN 2.0 / CAN-FD | 155 | 248.92 | 0.035 | 23 | V |
| 61 | DIY: ODrive S1 + M8325s (+ printed cycloid) | — | — | — | — @ 48 V | — | — | 92×46.5 | CAN 2.0 (ODrive CANSimple) / USB | 298 | — | — | — | R |
| 62 | DIY: moteus-n1 + mj5208 + mjbots 6x planetary gearset | — | — | — | — @ 48 V | 6 | — | — | CAN-FD 5 Mbps | 253 | — | — | — | R |
| 63 | Unitree B1 motor | — | — | — | — @ — V | — | — | — | — | 3000 | — | — | — | V |

### 3a. Torque per dollar, units ≥ 50 N·m peak with a price

| Actuator | Peak N·m | US$ | N·m/US$ | Mass kg | N·m/kg | No-load rad/s |
|---|---|---|---|---|---|---|
| RobStride RS04 | 120 | 295 | 0.407 | 1.51 | 79 | 20.9 |
| Steadywin GIM10015-9 (48 V) | 112 | 300 | 0.373 | 1.372 | 82 | 11.9 |
| DAMIAO DM-J10010L-2EC | 120 | 321.99 | 0.373 | 1.372 | 87 | 20.9 |
| DAMIAO DM-J6248P-2EC | 97 | 265 | 0.366 | 0.628 | 154 | 6.3 |
| Steadywin GIM8115-9 (48 V) | 54.55 | 155 | 0.352 | 0.705 | 77 | 13.1 |
| CubeMars AKE90-8 KV35 (no integrated driver) | 170 | 483.9 | 0.351 | 1.4 | 121 | 22.0 |
| CubeMars AKH70-48 V1.0 KV41 | 222 | 698.9 | 0.318 | 1.396 | 159 | 3.7 |
| MyActuator RMD-X15-P20-450-E | 450 | 1515 | 0.297 | 3.5 | 129 | 11.3 |
| MyActuator RMD-X12-P20-320-E | 320 | 1090 | 0.294 | 2.37 | 135 | 13.1 |
| DAMIAO DM-J10010-2EC | 150 | 540 | 0.278 | 1.485 | 101 | 15.7 |
| RobStride RS03 | 60 | 245 | 0.245 | 0.928 | 65 | 20.4 |
| MyActuator RMD-X8-P20-120-E | 120 | 645 | 0.186 | 1.4 | 86 | 16.6 |
| CubeMars AK60-39 V3.0 KV80 | 72 | 448.9 | 0.160 | 0.75 | 96 | 10.3 |
| ENCOS EC-A10020-P2-24 | 330 | 2250 | 0.147 | 2.19 | 151 | 12.9 |
| CubeMars AK80-64 KV80 | 120 | 889.9 | 0.135 | 0.85 | 141 | 7.8 |
| MyActuator RMD-X6-P20-60-E | 60 | 490 | 0.122 | 0.82 | 73 | 18.4 |
| ENCOS EC-A10020-P1-12 | 150 | 1250 | 0.120 | 1.373 | 109 | 14.7 |
| CubeMars AK10-9 V3.0 KV60 | 53 | 698.9 | 0.076 | 0.94 | 56 | 33.5 |

### 3b. Gearbox, current, backlash, encoder, protocol

The JSON schema has no fields for peak current or backlash, so they are recorded in the `notes` field and shown here.

| Actuator | Gearbox | Peak current | Backlash | Encoder | Protocol | Primary spec source |
|---|---|---|---|---|---|---|
| MyActuator RMD-X15-P20-450-E | planetary, crossed-roller output | 69.2 Arms | garbled in PDF | dual absolute: 17-bit input + 17-bit output | MyActuator CAN protocol V4.4 (1 Mbps; includes 'motion mode' 0x400+ID p/v/Kp/Kd/t_ff command) or EtherCAT protocol V2.0 | <https://www.myactuator.com/_files/archives/cab28a_712afb681f434c1394145c69aae60b8e.zip> |
| DAMIAO DM-J10422P-2EC | geared (type not stated), 12 mm hollow | 165 A phase | — | dual 17-bit, output single-turn absolute (+-0.03 deg) | DAMIAO CAN: MIT mode (MIT-compatible, configurable P/V/T_MAX), position-velocity, velocity (+ force-position hybrid on newer models) | <https://www.damiaokeji.com/index.php?c=show&id=126> |
| ENCOS EC-A10020-P2-24 | planetary, 9008 crossed-roller | 140 A phase | 20 arcmin | dual | ENCOS protocol | <https://aifitlab.com/products/encos-ec-a10020-p2-24-motor> |
| MyActuator RMD-X12-P20-320-E | planetary, crossed-roller output | 100 Arms | garbled in PDF | dual absolute: 17-bit input + 17-bit output | MyActuator CAN protocol V4.4 (1 Mbps; includes 'motion mode' 0x400+ID p/v/Kp/Kd/t_ff command) or EtherCAT protocol V2.0 | <https://www.myactuator.com/_files/archives/cab28a_712afb681f434c1394145c69aae60b8e.zip> |
| CubeMars AKH70-48 V1.0 KV41 | hollow planetary | — | — | dual | CubeMars servo mode + MIT mode (switchable) | <https://www.cubemars.com/product/ak60-6-v3-0-kv80-robotic-actuator.html> |
| Steadywin GIM8115-36 (48 V) | planetary, steel | 48.91 A | 15 arcmin | 14-bit on-board + optional second (output) encoder | Steadywin driver protocol (GDZ810) | <https://download.s21i.co99.net/14180476/0/0/ABUIABA-GAAg85zExQYowOGT9Ac.xlsx?f=Robotic%20Joint%20Motor%20Selection%20Table_2025-08-28.xlsx&v=1756434035> |
| DAMIAO DM-J8520P-2EC | geared (type not stated) | 41.6 A phase | — | dual 17-bit inductive, output single-turn absolute | DAMIAO CAN: MIT mode (MIT-compatible, configurable P/V/T_MAX), position-velocity, velocity (+ force-position hybrid on newer models) | <https://www.damiaokeji.com/index.php?c=show&id=142> |
| CubeMars AKE90-8 KV35 (no integrated driver) | reducer (type not stated) | 72 A | 9 arcmin | not stated | depends on driver | <https://www.cubemars.com/product/ake90-8-kv35-quasi-direct-drive-actuator.html> |
| MyActuator RMD-X10-P20-200-E (V4.1, hollow) | planetary, hollow | — | — | dual absolute 17/19-bit | MyActuator CAN protocol V4.4 (1 Mbps; includes 'motion mode' 0x400+ID p/v/Kp/Kd/t_ff command) or EtherCAT protocol V2.0 | <https://www.myactuator.com/_files/archives/cab28a_0316582549cf4af7942242e05309227c.zip> |
| DAMIAO DM-J10010-2EC | geared (type not stated) | 70 A | — | dual 14-bit magnetic, output single-turn absolute | DAMIAO CAN: MIT mode (MIT-compatible, configurable P/V/T_MAX), position-velocity, velocity (+ force-position hybrid on newer models) | <https://www.damiaokeji.com/index.php?c=show&id=107> |
| ENCOS EC-A10020-P1-12 | planetary | 70 A phase | 20 arcmin | dual | ENCOS protocol | <https://aifitlab.com/collections/encos-motor/products/encos-ec-a10020-p1-12-motor> |
| MyActuator RMD-X8-P20-150-E (V4.1) | planetary | — | — | dual absolute 17/19-bit | MyActuator CAN protocol V4.4 (1 Mbps; includes 'motion mode' 0x400+ID p/v/Kp/Kd/t_ff command) or EtherCAT protocol V2.0 | <https://www.myactuator.com/_files/archives/cab28a_0316582549cf4af7942242e05309227c.zip> |
| CubeMars AK80-64 KV80 | planetary | 19 A | 0.18° | single 14-bit (motor side only) | CubeMars servo mode + MIT mode (switchable) | <https://www.cubemars.com/product/ak80-64-kv80-robotic-actuator.html> |
| DAMIAO DM-J10010L-2EC | geared (type not stated) | 95 A (manual max 99.74 A) | — | dual 14-bit magnetic, output single-turn absolute | DAMIAO CAN: MIT mode (MIT-compatible, configurable P/V/T_MAX), position-velocity, velocity (+ force-position hybrid on newer models) | <https://www.damiaokeji.com/index.php?c=show&id=106> |
| MyActuator RMD-X8-P20-120-E | planetary, crossed-roller output | 43.8 Arms | garbled in PDF | dual absolute: 17-bit input + 17-bit output | MyActuator CAN protocol V4.4 (1 Mbps; includes 'motion mode' 0x400+ID p/v/Kp/Kd/t_ff command) or EtherCAT protocol V2.0 | <https://www.myactuator.com/_files/archives/cab28a_712afb681f434c1394145c69aae60b8e.zip> |
| RobStride RS04 | planetary, machined steel | 90 Apk | not published | 2 magnetic encoders (motor + output), output single-turn absolute; 14-bit per reseller | RobStride private CAN protocol (29-bit ext. frames) with motion-control (MIT-style p/v/Kp/Kd/t_ff) mode; separate 11-bit MIT protocol and CANopen selectable | <https://raw.githubusercontent.com/RobStride/Product_Information/main/%E7%81%B5%E8%B6%B3%E6%97%B6%E4%BB%A3RS%E7%B3%BB%E5%88%97%E4%BA%A7%E5%93%81%E8%A7%84%E6%A0%BC%E4%BB%8B%E7%BB%8D%282026.010.09%29.pdf> |
| Steadywin GIM10015-9 (48 V) | planetary, steel | 39.28 A | 15 arcmin | 14-bit on-board; no second encoder | Steadywin driver protocol (GDZ810); MIT driver option (GDM810) per reseller | <https://download.s21i.co99.net/14180476/0/0/ABUIABA-GAAg85zExQYowOGT9Ac.xlsx?f=Robotic%20Joint%20Motor%20Selection%20Table_2025-08-28.xlsx&v=1756434035> |
| DAMIAO DM-JH20-101-2EC (harmonic) | strain-wave (harmonic), 18 mm hollow | 10.05 A phase @48 V | — | dual 17-bit | DAMIAO CAN: MIT mode (MIT-compatible, configurable P/V/T_MAX), position-velocity, velocity (+ force-position hybrid on newer models) | <https://www.damiaokeji.com/index.php?c=show&id=149> |
| MyActuator RMD-X10-P35-100 (V3, discontinued) | planetary | 13.5 A (as printed) | 15 arcmin | dual 14-bit / 14-bit | MyActuator motion protocol V4.2 | <https://www.myactuator.com/_files/archives/cab28a_31f28832b90245fba0b79ad79480821e.zip> |
| DAMIAO DM-J6248P-2EC | geared (type not stated) | 38.7 A phase | — | dual 16-bit, single-turn | DAMIAO CAN: MIT mode (MIT-compatible, configurable P/V/T_MAX), position-velocity, velocity (+ force-position hybrid on newer models) | <https://www.damiaokeji.com/index.php?c=show&id=110> |
| MyActuator RMD-X6-P30-80-E (V4.1) | planetary | — | — | dual absolute 17/19-bit | MyActuator CAN protocol V4.4 (1 Mbps; includes 'motion mode' 0x400+ID p/v/Kp/Kd/t_ff command) or EtherCAT protocol V2.0 | <https://www.myactuator.com/_files/archives/cab28a_0316582549cf4af7942242e05309227c.zip> |
| CubeMars AKH70-16 V1.0 KV41 | hollow planetary | — | — | dual | CubeMars servo mode + MIT mode (switchable) | <https://www.cubemars.com/product/ak60-6-v3-0-kv80-robotic-actuator.html> |
| CubeMars AK60-39 V3.0 KV80 | planetary | — | — | dual | CubeMars servo mode + MIT mode (switchable) | <https://www.cubemars.com/product/ak60-6-v3-0-kv80-robotic-actuator.html> |
| DAMIAO DM-JH20-51-2EC (harmonic) | strain-wave (harmonic), 18 mm hollow | 13.7 A phase @48 V | — | dual 17-bit | DAMIAO CAN: MIT mode (MIT-compatible, configurable P/V/T_MAX), position-velocity, velocity (+ force-position hybrid on newer models) | <https://www.damiaokeji.com/index.php?c=show&id=149> |
| MyActuator RMD-X6-P20-60-E | planetary, crossed-roller output | 29.1 Arms | garbled in PDF | dual absolute: 17-bit input + 17-bit output | MyActuator CAN protocol V4.4 (1 Mbps; includes 'motion mode' 0x400+ID p/v/Kp/Kd/t_ff command) or EtherCAT protocol V2.0 | <https://www.myactuator.com/_files/archives/cab28a_712afb681f434c1394145c69aae60b8e.zip> |
| RobStride RS03 | planetary, machined steel | 43 Apk | not published | 2 magnetic encoders (motor + output), output single-turn absolute; 14-bit per reseller | RobStride private CAN protocol (29-bit ext. frames) with motion-control (MIT-style p/v/Kp/Kd/t_ff) mode; separate 11-bit MIT protocol and CANopen selectable | <https://raw.githubusercontent.com/RobStride/Product_Information/main/%E7%81%B5%E8%B6%B3%E6%97%B6%E4%BB%A3RS%E7%B3%BB%E5%88%97%E4%BA%A7%E5%93%81%E8%A7%84%E6%A0%BC%E4%BB%8B%E7%BB%8D%282026.010.09%29.pdf> |
| Steadywin GIM8115-9 (48 V) | planetary, steel | 25.21 A | 15 arcmin | 14-bit on-board + optional second (output) encoder | Steadywin driver protocol (GDZ810) | <https://download.s21i.co99.net/14180476/0/0/ABUIABA-GAAg85zExQYowOGT9Ac.xlsx?f=Robotic%20Joint%20Motor%20Selection%20Table_2025-08-28.xlsx&v=1756434035> |
| CubeMars AK10-9 V3.0 KV60 | planetary | 31.9 A | — | dual magnetic: 21-bit inner, 15-bit outer | CubeMars servo mode + MIT mode (switchable) | <https://www.cubemars.com/product/ak10-9-v3-0-kv60-robotic-actuator.html> |
| MyActuator RMD-X5-P25-50-E (V4.1) | planetary | — | — | dual absolute | MyActuator CAN protocol V4.4 (1 Mbps; includes 'motion mode' 0x400+ID p/v/Kp/Kd/t_ff command) or EtherCAT protocol V2.0 | <https://www.myactuator.com/_files/archives/cab28a_0316582549cf4af7942242e05309227c.zip> |
| RobStride RS10P | planetary | 19 Apk | not published | 2 magnetic encoders | RobStride private CAN protocol (29-bit ext. frames) with motion-control (MIT-style p/v/Kp/Kd/t_ff) mode; separate 11-bit MIT protocol and CANopen selectable | <https://raw.githubusercontent.com/RobStride/Product_Information/main/%E7%81%B5%E8%B6%B3%E6%97%B6%E4%BB%A3RS%E7%B3%BB%E5%88%97%E4%BA%A7%E5%93%81%E8%A7%84%E6%A0%BC%E4%BB%8B%E7%BB%8D%282026.010.09%29.pdf> |
| DAMIAO DM-J4340-2EC V1.1 (48 V) | geared (type not stated) | 19.85 A phase | — | dual 16-bit, single-turn | DAMIAO CAN: MIT mode (MIT-compatible, configurable P/V/T_MAX), position-velocity, velocity (+ force-position hybrid on newer models) | <https://www.damiaokeji.com/index.php?c=show&id=135> |
| DAMIAO DM-J8009P-2EC | geared (type not stated) | 40 A | — | dual 14-bit, output single-turn absolute | DAMIAO CAN: MIT mode (MIT-compatible, configurable P/V/T_MAX), position-velocity, velocity (+ force-position hybrid on newer models) | <https://www.damiaokeji.com/index.php?c=show&id=105> |
| MyActuator RMD-X6-P36-40 (V2, discontinued) | planetary | 10.5 A (as printed) | 15 arcmin | single 18-bit (motor) | MyActuator motion protocol V4.2 | <https://www.myactuator.com/_files/archives/cab28a_31f28832b90245fba0b79ad79480821e.zip> |
| HighTorque HTDW-6056-36-NE | planetary | — | — | dual, multi-turn absolute | HighTorque protocol | <https://openelab.com/products/seeed-hightorque-htdw-6056-36> |
| RobStride RS06 | planetary, machined steel | 57 Apk | not published | 2 magnetic encoders (motor + output), output single-turn absolute; 14-bit per reseller | RobStride private CAN protocol (29-bit ext. frames) with motion-control (MIT-style p/v/Kp/Kd/t_ff) mode; separate 11-bit MIT protocol and CANopen selectable | <https://raw.githubusercontent.com/RobStride/Product_Information/main/%E7%81%B5%E8%B6%B3%E6%97%B6%E4%BB%A3RS%E7%B3%BB%E5%88%97%E4%BA%A7%E5%93%81%E8%A7%84%E6%A0%BC%E4%BB%8B%E7%BB%8D%282026.010.09%29.pdf> |
| Unitree IM6014 | reducer (type not stated) | 40 A (reported) | — | dual (rotor + output) per Unitree shop | Unitree RS-485 motor protocol | <https://www.4gltemall.com/unitree-im6014-joint-actuator.html> |
| MyActuator RMD-X4-P36-36-E | planetary, crossed-roller output | 21.5 Arms | garbled in PDF | dual absolute 17-bit in / 18-bit out | MyActuator CAN protocol V4.4 (1 Mbps; includes 'motion mode' 0x400+ID p/v/Kp/Kd/t_ff command) or EtherCAT protocol V2.0 | <https://www.myactuator.com/_files/archives/cab28a_712afb681f434c1394145c69aae60b8e.zip> |
| Unitree A1 motor | planetary | — | — | 15-bit motor encoder | Unitree: torque/position/velocity/stiffness/damping command (MIT-style) | <https://www.unitree.com/mobile/a1/motor/> |
| MyActuator RMD-X8-P9-32-R (X8-32) | planetary, deep-groove output | 30 Arms | ≤10 arcmin | single 18-bit (motor) | MyActuator motion protocol | <https://www.myactuator.com/_files/archives/cab28a_712afb681f434c1394145c69aae60b8e.zip> |
| CubeMars AKE80-8 KV30 (no integrated driver) | reducer (type not stated) | 12 A | 9 arcmin | not stated | depends on driver | <https://www.cubemars.com/product/ake80-8-kv30-quasi-direct-drive-actuator.html> |
| CubeMars AK70-9 V3.0 KV60 | planetary | 23.8 A | 18 arcmin | dual 21-bit (motor + output) | CubeMars servo mode + MIT mode (switchable) | <https://www.cubemars.com/product/ak70-9-v3-0-kv60-robotic-actuator.html> |
| Steadywin GIM8108-9 (48 V) | planetary, steel | 19.8 A | 15 arcmin | 14-bit on-board; no second encoder | Steadywin driver protocol (GDS810) | <https://download.s21i.co99.net/14180476/0/0/ABUIABA-GAAg85zExQYowOGT9Ac.xlsx?f=Robotic%20Joint%20Motor%20Selection%20Table_2025-08-28.xlsx&v=1756434035> |
| MyActuator RMD-X8-P9-25 (X8-Pro 1:9 V2) | planetary | 8 A (as printed) | 10 arcmin | single 18-bit (motor) | MyActuator motion protocol V4.2 | <https://www.myactuator.com/_files/archives/cab28a_31f28832b90245fba0b79ad79480821e.zip> |
| CubeMars AK70-10 KV100 | planetary | — | — | single | CubeMars servo mode + MIT mode (switchable) | <https://www.cubemars.com/product/ak70-10-kv100-robotic-actuator.html> |
| CubeMars AK45-36 V3.0 KV80 | planetary | — | — | dual | CubeMars servo mode + MIT mode (switchable) | <https://www.cubemars.com/product/ak60-6-v3-0-kv80-robotic-actuator.html> |
| Unitree GO-M8010-6 | reducer (type not stated) | 40 A | — | 15-bit motor encoder (motor side) | Unitree RS-485 motor protocol (dev-motor.unitree.com) | <https://www.unitree.com/mobile/go1/motor/> |
| CubeMars AK80-9 V3.0 KV100 | planetary | 28 A | 15 arcmin | single 16-bit (motor side) | CubeMars servo mode + MIT mode (switchable) | <https://www.cubemars.com/product/ak80-9-v3-0-robotic-actuator.html> |
| DAMIAO DM-J8006-2EC V1.1 | geared (type not stated) | 21 A phase | — | dual 14-bit, single-turn | DAMIAO CAN: MIT mode (MIT-compatible, configurable P/V/T_MAX), position-velocity, velocity (+ force-position hybrid on newer models) | <https://www.damiaokeji.com/index.php?c=show&id=103> |
| RobStride RS01 | planetary | 23 Apk | not published | 1 magnetic encoder (motor side only) | RobStride private CAN protocol (29-bit ext. frames) with motion-control (MIT-style p/v/Kp/Kd/t_ff) mode; separate 11-bit MIT protocol and CANopen selectable | <https://raw.githubusercontent.com/RobStride/Product_Information/main/%E7%81%B5%E8%B6%B3%E6%97%B6%E4%BB%A3RS%E7%B3%BB%E5%88%97%E4%BA%A7%E5%93%81%E8%A7%84%E6%A0%BC%E4%BB%8B%E7%BB%8D%282026.010.09%29.pdf> |
| RobStride RS02 | planetary, machined steel | 23 Apk | not published | 2 magnetic encoders (motor + output), output single-turn absolute; 14-bit per reseller | RobStride private CAN protocol (29-bit ext. frames) with motion-control (MIT-style p/v/Kp/Kd/t_ff) mode; separate 11-bit MIT protocol and CANopen selectable | <https://raw.githubusercontent.com/RobStride/Product_Information/main/%E7%81%B5%E8%B6%B3%E6%97%B6%E4%BB%A3RS%E7%B3%BB%E5%88%97%E4%BA%A7%E5%93%81%E8%A7%84%E6%A0%BC%E4%BB%8B%E7%BB%8D%282026.010.09%29.pdf> |
| mjbots qdd100 beta 3 | planetary | — | ±0.25° | not stated (moteus on-board magnetic) | moteus (open source) | <https://mjbots.com/products/qdd100-beta-3> |
| EYOU PP11-36 | planetary | — | — | — | — | <https://aifitlab.com/products/eyou-pp11-motor> |
| RobStride RS00 | planetary, machined steel | 15.5 Apk | not published | 2 magnetic encoders (motor + output), output single-turn absolute; 14-bit per reseller | RobStride private CAN protocol (29-bit ext. frames) with motion-control (MIT-style p/v/Kp/Kd/t_ff) mode; separate 11-bit MIT protocol and CANopen selectable | <https://raw.githubusercontent.com/RobStride/Product_Information/main/%E7%81%B5%E8%B6%B3%E6%97%B6%E4%BB%A3RS%E7%B3%BB%E5%88%97%E4%BA%A7%E5%93%81%E8%A7%84%E6%A0%BC%E4%BB%8B%E7%BB%8D%282026.010.09%29.pdf> |
| DAMIAO DM-J4310-2EC V1.2 (48 V) | geared (type not stated) | 20 A phase | — | dual 16-bit, single-turn | DAMIAO CAN: MIT mode (MIT-compatible, configurable P/V/T_MAX), position-velocity, velocity (+ force-position hybrid on newer models) | <https://www.damiaokeji.com/index.php?c=show&id=125> |
| DAMIAO DM-J6006-2EC | geared (type not stated) | 13 A | — | dual 14-bit, single-turn | DAMIAO CAN: MIT mode (MIT-compatible, configurable P/V/T_MAX), position-velocity, velocity (+ force-position hybrid on newer models) | <https://www.damiaokeji.com/index.php?c=show&id=102> |
| CubeMars AK60-6 V3.0 KV80 | planetary | 11.2 A @48 V | 'low' | single 21-bit (motor side) | CubeMars servo mode + MIT mode (switchable) | <https://www.cubemars.com/product/ak60-6-v3-0-kv80-robotic-actuator.html> |
| MyActuator RMD-X6-P8-8 (X6-8, QDD) | one-stage planetary (QDD per maker) | 7.2 Arms | 10 arcmin | dual absolute 17/18-bit | MyActuator motion protocol | <https://www.myactuator.com/_files/archives/cab28a_712afb681f434c1394145c69aae60b8e.zip> |
| MyActuator RMD-X2-P28-7-E | planetary, deep-groove output | — | — | dual absolute 17-bit in / 18-bit out | MyActuator CAN protocol V4.4 (1 Mbps; includes 'motion mode' 0x400+ID p/v/Kp/Kd/t_ff command) or EtherCAT protocol V2.0 | <https://www.myactuator.com/_files/archives/cab28a_712afb681f434c1394145c69aae60b8e.zip> |
| RobStride EDULITE 05 | planetary, powder-metallurgy gears | 11 Apk | not published | 2 magnetic encoders | RobStride private CAN protocol (29-bit ext. frames) with motion-control (MIT-style p/v/Kp/Kd/t_ff) mode; separate 11-bit MIT protocol and CANopen selectable | <https://raw.githubusercontent.com/RobStride/Product_Information/main/%E7%81%B5%E8%B6%B3%E6%97%B6%E4%BB%A3EL%E7%B3%BB%E5%88%97%E4%BA%A7%E5%93%81%E8%A7%84%E6%A0%BC%E4%BB%8B%E7%BB%8D%282026.09.22%EF%BC%89.pdf> |
| RobStride RS05 | planetary, machined steel | 11 Apk | not published | 2 magnetic encoders (motor + output), output single-turn absolute; 14-bit per reseller | RobStride private CAN protocol (29-bit ext. frames) with motion-control (MIT-style p/v/Kp/Kd/t_ff) mode; separate 11-bit MIT protocol and CANopen selectable | <https://raw.githubusercontent.com/RobStride/Product_Information/main/%E7%81%B5%E8%B6%B3%E6%97%B6%E4%BB%A3RS%E7%B3%BB%E5%88%97%E4%BA%A7%E5%93%81%E8%A7%84%E6%A0%BC%E4%BB%8B%E7%BB%8D%282026.010.09%29.pdf> |
| DIY: ODrive S1 + M8325s (+ printed cycloid) | user-built cycloidal or planetary | 90 A for 3 s (motor) | — | S1 on-board magnetic (motor side) | ODrive firmware | <https://shop.odriverobotics.com/products.json> |
| DIY: moteus-n1 + mj5208 + mjbots 6x planetary gearset | printed/machined housing + steel 6:1 planetary | 100 A (controller) | — | moteus on-board absolute magnetic (motor side) | moteus (open source) | <https://mjbots.com/products.json> |
| Unitree B1 motor | — | — | — | — | — | <https://shop.unitree.com/products.json> |

**Not found or not verified:**
- MyActuator X10-40 and X8-Pro-H 1:6 (prices exist: US$625 and US$625; no spec sheet was read).
- EYOU's 48 V RP-series joints (the reseller page was blocked).
- HighTorque's leg-size modules.
- The ENCOS official datasheet: the ENCOS rows come from aifitlab.
- The Unitree IM6014 spec table: Unitree's shop gives none.
- The MyActuator backlash values: the V4 PDF renders them as a garbled glyph. The X8-32 page states ≤10 arcmin.

## 4. Supporting parts

### 4a. Frame

| Item | Spec | Mass | Price | Supplier (AU unless noted) | Source |
|---|---|---|---|---|---|
| T-slot 20×20, 6 mm slot, clear | 5.8 m bars, cut-to-length service | 0.51 kg/m | A$13.20/m ex GST | GAP Engineering | <https://www.gapengineering.com.au/product/profile-20x20-6mm-slot/> |
| T-slot 20×40, 6 mm slot | — | 0.89 kg/m | A$20.40/m ex GST | GAP Engineering | <https://www.gapengineering.com.au/product/profile-20x40-t-slot/> |
| T-slot 30×30, 8 mm slot | — | 0.97 kg/m | A$17.85/m ex GST | GAP Engineering | <https://www.gapengineering.com.au/product/profile-30x30-8mm-slot/> |
| T-slot 40×40, 8 mm slot | 5.8 m bar A$191.40 ex GST | 1.81 kg/m | A$33.00/m ex GST | GAP Engineering | <https://www.gapengineering.com.au/?p=1678> |
| T-slot 40×80, 8 mm slot | — | 2.44 kg/m | A$57.22/m ex GST | GAP Engineering | <https://www.gapengineering.com.au/product/profile-40x80-2-slot/> |
| 2020 extrusion 600 mm | — | — | A$8.30 inc GST (search snippet) | Core Electronics | <https://core-electronics.com.au/catalog/product/view/sku/CE09608> |
| V-Slot 20-series (OpenBuilds type) | 1500 mm listing, several variants | not stated | A$10.11–62.66 inc GST | Maker Store AU | <https://www.makerstore.com.au/product-category/v-slot/page/1/> |
| Misumi HFS6-3030 | 333 mm² section | 0.90 kg/m (reseller) | — | Misumi (served from Singapore; pages returned 403) | <https://www.imssupply.com/catalog/misumi/hfs6-3030-785.html> |
| Robotunits 40×40 / 40×80 | maker data | 1.53 / 2.78 kg/m | — | Robotunits (AT) | <https://robotunits.com/en-us/shop/extrusion-fastening-technology/extrusion-technology-40mm-series/extrusion-40x40/> |
| CF tube, roll-wrapped, 25 OD × 22 ID × 1.5 wall | 1 m or 2 m | 178 g/m | £29.20 ex VAT (trade £21.20 at 20+) | Easy Composites (UK, ships to AU) | <https://www.easycomposites.co.uk/25mm-roll-wrapped-carbon-fibre-tube-metric> |
| Al clamp for 25 mm CF tube | CNC | — | from US$12.59 (RJX); US$10.99 (sold out) | rcdrone.top (reseller) | <https://rcdrone.top/products/aluminum-alloy-drone-tube-clamp-16mm-18mm-20mm-22mm-25mm-30mm-cnc-uav-frame-arm-connector-for-carbon-fiber-tube> |
| Rose+Krieger 25 mm parallel tube clamp | industrial | — | price not shown | RS Components AU | <https://au.rs-online.com/web/p/connecting-components/4489609> |

For comparison, a 25 mm CF tube is 0.18 kg/m against 0.51 kg/m for 20×20 extrusion. Extrusion is the fast way to build
a test rig and torso box. CF tube with clamps, or laser-cut aluminium plate, suits the limbs.

**Laser/waterjet cutting in Australia**

| Service | What is verified | Source |
|---|---|---|
| **Cut Fold Direct** (Heidelberg West VIC) | Instant online quote from DXF/DWG/3D/vector PDF. Mild steel 250HR 1–10 mm and **aluminium 5005H34 1–12 mm** priced instantly; stainless goes to review. Folding available. Minimum order A$300 ex GST. Delivery quoted separately. | <https://www.cutfolddirect.com.au/> |
| O'Brien Engineering | "Get a quote online" page; claims dispatch anywhere in Australia (details not readable) | <https://obrieneng.com.au/get-custom-quote> |
| SendCutSend (US) | Ships to the USA and Canada only (FAQ), so **not to AU** | <https://sendcutsend.com/faq/can-you-ship-to-countries-outside-of-the-us/> |
| Others named in R6 (not re-verified) | Metal Parts, Ferracut, JDL Innovations; PCBWay CNC / JLCCNC for machined parts | [R6](R6-australian-sourcing-materials.md) |

### 4b. Bearings

| Bearing | Size (bore × OD × W) | Price | Supplier | Source |
|---|---|---|---|---|
| IKO CRBH7013 crossed-roller | 70 × 100 × 13 | US$371.02 (AC1) to US$679.93 (AUUT1) | KSC Direct / Motion (US) | <https://kscdirect.com/itemDetail/9554852/iko-crbh7013ac1-metric-series-high-rigidity-crossed-roller-bearing-70-mm> · <https://www.motion.com/products/sku/03389285> |
| GMT GSRBE7013 (CRBH7013 equivalent) | 70 × 100 × 13 | €127 ex tax | GMT Europe | <https://gmteurope.de/en-us/crossed-roller-bearing-gsrbe7013-uu-c1-p0-10-g-rbe-50305050165> |
| THK RE6013 crossed-roller | 60 × 90 | $154.49 (currency as listed) | Acorn Industries (UK) | <https://acorn-ind.co.uk/p/re6013c0-thk> |
| RU66 crossed-roller (non-THK, P5) | 35 × 95 × 15 | US$139.99 (out of stock); HFH RU66 €191.04 | eBay / Partao | <https://ebay.com/itm/235963019938> · <https://partao.com/hfh-ru66uucc0p5-hfh-crossed-roller-bearing.html> |
| Thin-section deep-groove 61812-2RS1 (SKF) | 60 × 78 × 10 | A$173.69 ex GST | RS Components AU | <https://au.rs-online.com/web/p/ball-bearings/2076978> |
| 61812-2RSR-Y (FAG) | 60 × 78 × 10 | A$145.59 ex GST | RS Components AU | <https://au.rs-online.com/web/p/ball-bearings/1908409> |
| 61812-2RS budget (Dunlop) | 60 × 78 × 10 | £9.72 ex VAT | Bearing Boys (UK) | <https://www.bearingboys.co.uk/Thin-Section-Ball-Bearings/618122RS-Dunlop-Sealed-Thin-Section-Ball-Bearing-60mm-x-78mm-x-10mm-2110-p> |
| Kaydon Reali-Slim | — | no public price found | — | — |

The MyActuator X-V4 units from the X4-36 up have crossed-roller output bearings with stated loads (X12-320: 4.5 kN
axial, 5 kN radial). The ENCOS EC-A10020-P2-24 lists a 9008 crossed roller. The smallest MyActuator units (X2-7, X8-32)
use deep-groove bearings, and RobStride, CubeMars and DAMIAO do not state their output-bearing ratings. Separate
crossed-roller bearings are therefore needed for DIY joints, and wherever a link load must not pass through an actuator
whose bearing rating is unknown.

### 4c. Battery (48 V class)

| Option | Energy | Price | Notes | Source |
|---|---|---|---|---|
| 48 V 20 Ah "Triangle" e-bike pack + charger | 0.96 kWh (48 V × 20 Ah) | A$609 | **40 A maximum continuous** discharge, so check against actuator peaks | <https://www.tdrmoto.com.au/products/48v-20ah-triangle-lithium-ion-battery-for-1000w-1500w-motor-electric-bike-ebike> |
| Vamos "El Diablo" 48 V 20 Ah, Samsung cells | 0.96 kWh | A$890 | 2-year warranty; BMS with over-current and short-circuit protection; Sydney pickup | <https://vamosbikes.com.au/products/el-diablo-battery-48v-20ah-samsung-cells> |
| Melbourne Powered tank-style 48 V 20 Ah | 960 Wh | A$895 | ~2-week lead time | <https://melbournepowered.com.au/products/tank-style-48v-20ah-960wh-samsung-cells-e-bike-battery> |
| **EGO POWER+ 56 V ARC BA2800T 5 Ah** (power tool) | ~0.28 kWh (56 V × 5 Ah, derived) | A$389 RRP; 2-pack A$719 | Swappable tool pack. Full-charge voltage is not published, so check it against MyActuator's 55 V limit. Listed "coming soon". | <https://egopowerplus.com.au/battery-5ampt/> |
| EGO BA5600T 10 Ah | ~0.56 kWh (derived) | US$494 (deal) to US$584.99 | US retailers; AU price not found | <https://9to5toys.com/2025/09/19/ego-56v-10-0ah-battery-494/> · <https://zoro.com/ego-battery-ba5600t/i/G801209265> |
| DIY 13S/14S: Molicel P45B 21700 cells (4.5 Ah, 45 A) | 13S4P ≈ 0.84 kWh (derived) | A$37/cell (Batteries Direct AU); US$5.19 (18650batterystore, sold out) | The AU listing is several times the US sale price | <https://batteriesdirect.com.au/shop/product/37780/favicon.ico> · <https://www.18650batterystore.com/products/molicel-p45b> |
| BMS: Daly 14S 60 A smart | — | ~US$54 | — | <https://srikobatteries.com/product/daly-smart-bms-14s-48v-60a-lithium-ion-battery-protection-module> |
| BMS: JK-BD6A24S10P 8–24S, 100 A continuous / 200 A peak, 0.6 A active balance | — | €131.01 | — | <https://www.desertcart.uy/products/680850055-jkbms-smart-bms-8s-24s-100a-0-6a-active-balance.md> · <https://www.18650batterystore.com/products/jk-bd6a24s10p-bms> |

E-bike packs are cheap energy, but the cheapest listed pack is limited to 40 A continuous. That is about 1.9 kW at 48 V
(derived), which a humanoid can exceed during a squat or stair step. For a first prototype, either use two packs in parallel or build a
13S pack with a 100 A BMS. Postal rules for lithium packs over 100 Wh are covered in R6.

### 4d. Power distribution and safety

| Item | Spec | Price | Source |
|---|---|---|---|
| TE Kilovac EV200AAANA main contactor | 500 A, 900 V rating, 9–36 V DC coil | A$327.50 ex GST (1–4; RS 690-0814); A$344.54 ex GST (element14 AU) | <https://au.rs-online.com/web/p/contactors/6900814> · <https://au.element14.com/kilovac-te-connectivity/ev200aaana/relay-power-spno-500a/dp/991397102> |
| EAO 84-series twist-release e-stop | 22.3 mm cutout, IP65/66/67 | €31.15 inc VAT (Bürklin); AU listing has no price | <https://www.buerklin.com/en/p/eao/emergency-stop/84-5220-0020/12G0489> · <https://au.rs-online.com/web/p/emergency-stop-push-buttons/0333935> |
| Eaton M22-PVT twist-release operator (operator only) | 22.5 mm | US$12.15 | <https://www.zoro.com/eaton-pushbuttons-twist-to-release-emergency-stop-operator-black-non-illuminated-m22s-pvt/i/G714798177/> |
| Mean Well DDR-120C-24 DC-DC (33.6–67.2 V in, 24 V out, 120 W, DIN) | for compute and sensors | US$67.30 (Master Electronics); NZ$123.86 (DigiKey NZ) | <https://www.masterelectronics.com/en/mean-well/ddr120c24-50178741.html> · <https://www.digikey.co.nz/en/products/detail/mean-well-usa-inc/DDR-120C-24/8591546> |
| mjbots power_dist r4.5b (pre-charge, soft switch) | — | US$149 | <https://mjbots.com/products.json> |
| ODrive regen clamp | brake resistor driver for battery-less or regen-heavy setups | US$89 | <https://shop.odriverobotics.com/products.json> |

### 4e. Compute

| Item | US$ | A$ | Notes | Source |
|---|---|---|---|---|
| Jetson Orin Nano Super Developer Kit | **399** (was 249 before July 2026) | 848.10 inc GST (Core Electronics, search snippet) | 8 GB | <https://www.cnx-software.com/2026/07/22/nvidia-increases-the-price-of-jetson-modules-and-devkits-by-up-to-101/> · <https://core-electronics.com.au/catalog/product/view/sku/DFR0629> |
| Jetson Orin NX 16 GB module | 999 (1KU+, was 599) | 1,890 ex GST (IoT Store AU, in stock) | needs a carrier board | <https://iot-store.com.au/products/nvidia-jetson-orin-nx-16gb-module> |
| Jetson Orin NX 8 GB module | 649 (1KU+) | — | — | CNX link above |
| Raspberry Pi 5 16 GB | 305 | — | 8 GB price not shown on raspberrypi.com | <https://www.raspberrypi.com/products/raspberry-pi-5/> |
| Raspberry Pi 5 8 GB | — | 216.71 inc GST (element14, search snippet) | memory-driven price rises noted by retailers | <https://nz.element14.com/raspberry-pi/rpi5-8gb-single/rpi-5-board-2-4ghz-8gb-arm-cortex/dp/425600002> |

### 4f. CAN interfaces

| Item | Channels / type | Price | Notes | Source |
|---|---|---|---|---|
| CANable 2.0 (Openlight Labs) | 1 × CAN-FD | US$35 | FD needs slcan firmware; candleLight has no FD | <https://canable.io/index.html> · <https://acceptance.reach.dog/shop/openlight-labs/products/canable-2-0> |
| mjbots mjcanfd-usb-1x | 1 × CAN-FD (to 12 Mbit/s data) | US$39 | gs_usb/SocketCAN; ±58 V common-mode | <https://mjbots.com/products.json> |
| ODrive USB-CAN adapter | 1 × CAN 2.0B, 1 Mbit/s | US$37 | native SocketCAN | <https://shop.odriverobotics.com/products.json> |
| RobStride USB-to-CAN (Type-C) | 1 × CAN | A$33.95 | Pakronics AU | <https://www.pakronics.com.au/search?q=robstride> |
| DAMIAO USB-CANFD-1 / USB-CANFD-2 | 1 / 2 inputs, CAN-FD | US$100 / US$150 | reseller | <https://damiao.roboticscenter.ai/> |
| PEAK PCAN-USB FD (IPEH-004022) | 1 × CAN-FD, isolated | €278 ex VAT; US$347 (Grid Connect) | industry-standard driver | <https://twincomm.nl/en/?p=2426> · <https://gridconnect.com/products/can-usb-fd-adapter-pcan-usb-fd> |
| PEAK PCAN-USB Pro FD (IPEH-004061) | 2 × CAN-FD | €555 | ESAcademy (listed unavailable) | <https://esacademystore.eu/de/products/peak-pcan-usb-pro-fd-usb-to-dual-can-fd-interface> |
| mjbots pi3hat r4.5 | 5 × CAN-FD + IMU | US$149 | **Raspberry Pi 4/3B+ only, not Pi 5** | <https://mjbots.com/products.json> |
| ENCOS USB-CAN-FD / EtherCAT-to-CAN-FD | 1 ch / gateway | US$50 / US$380 | reseller | <https://aifitlab.com/collections/encos-motor> |

At 1 Mbps classic CAN, a 1 kHz MIT-mode loop fits roughly 4–6 motors per bus, so S1's ~26 joints need about 5–6
channels. That is either several USB-CAN-FD sticks or EtherCAT, which the MyActuator X-V4 supports natively. This is
an engineering estimate, not a sourced figure.

### 4g. IMU

| Item | Price | Notes | Source |
|---|---|---|---|
| Adafruit BNO085 breakout (4754) | US$24.95; A$48.68 (Little Bird AU); A$47.40 (Zaitronics AU) | 9-DoF with on-chip fusion | <https://littlebirdelectronics.com.au/products/adafruit-9-dof-orientation-imu-fusion-breakout-bno085-bno080-stemma-qt-qwiic.md> · <https://zaitronics.com.au/products/adafruit-9-dof-orientation-imu-fusion-breakout-bno085-bno080-stemma-qt-qwiic> |
| TDK EV_ICM-45686 evaluation board | US$45.21; A$51.30 (DigiKey AU) | no SparkFun/Adafruit ICM-45686 breakout found | <https://www.digikey.com.au/en/products/detail/tdk-invensense/EV-ICM-45686/24883422> |
| MikroE ICM-45686 Click (MIKROE-6514) | €23.99 ex VAT | — | <https://www.digikey.be/en/products/detail/mikroelektronika/MIKROE-6514/26741714> |
| Xsens MTi-3 development kit | US$417.06 (Arrow); A$912.79 inc GST (RS AU) | industrial AHRS | <https://www.arrow.com/en/products/mti-3-5a-dk/xsens-technologies-bv> · <https://au.rs-online.com/web/p/sensor-development-tools/2614472> |

### 4h. Depth cameras

| Camera | US$ | Source |
|---|---|---|
| RealSense D435i | 399 | <https://store.realsenseai.com/> |
| RealSense D455 | 499 | same |
| RealSense D405 / D456 / D457 / D555 | 325 / 560 / 599 / 649 | same |
| Luxonis OAK-D Lite | 269 | <https://shop.luxonis.com/collections/oak-cameras-1> |
| Luxonis OAK-D / OAK-D S2 | 329 | same |
| Luxonis OAK-D Pro / OAK-D Pro W | 429 / 529 | same |
| Luxonis OAK 4 D | 1,049 | same |

RealSense cameras are now sold from RealSense's own store, store.realsenseai.com.

### 4i. Foot force sensing: FSR or load cells

| Option | Price | Notes | Source |
|---|---|---|---|
| Interlink FSR 402 (12.7 mm) | US$2.99 (Interlink); A$13.90 (Adafruit 166, Little Bird AU) | contact/no-contact sensing only | <https://www.interlinkelectronics.com/products/fsr-model-402> · <https://littlebirdelectronics.com.au/products/round-force-sensitive-resistor-fsr-interlink-402> |
| TE FX29 compression load cell, 100 lbf (445 N), analog | US$23.15 (DigiKey) | 2.5× over-range | <https://www.digikey.it/en/product-highlight/t/te-connectivity-measurement-specialties/fx29-force-sensors> · <https://au.element14.com/sensor-solutions-te-connectivity/fx293x-100a-0100-l/load-cell-sensor-100lb-5-25v/dp/3290103> |
| TE FX29K0 I2C version | US$36–50 | digital, no external ADC needed | <https://www.findchips.com/detail/fx29k0-100a-0100-l/TE-Connectivity> |

**Recommendation: load cells.** Four FX29 100 lbf cells per sole give 1.78 kN rated and about 4.4 kN at over-range
(derived), for about US$93 per foot. That covers a 65 kg robot in single stance at 2–3 × body weight (1.3–1.9 kN). FSRs
are fine as cheap contact switches but drift and show hysteresis, so they cannot measure centre of pressure reliably.

### 4j. Hands and grippers

| Hand | DoF | Price | Notes | Source |
|---|---|---|---|---|
| Inspire RH56DFX | not checked | US$4,500–6,500 (Knox Labs); US$9,768 (RobotShop) | RS485 or CAN | <https://knoxlabs.com/collections/rx-hands> · <https://www.robotshop.com/products/inspire-robots-the-dexterous-hands> |
| Pollen Robotics **Amazing Hand** (open source) | 8 (2 per finger, 4 fingers) | < €200 in parts | 400 g, fully 3D printed, hobby servos | <https://huggingface.co/blog/pollen-robotics/amazing-hand> · <https://github.com/pollen-robotics/AmazingHand> |
| **LEAP Hand v2** (CMU, open) | 8 | ~US$200 | RSS 2025 demo paper | <https://roboticsproceedings.org/rss21/p132.html> |
| DIY parallel gripper on an RS00 or J4310 | 1 | about US$185 actuator + printed jaws | uses the wrist actuator family | see the actuator table |

## 5. Recommended shortlist for S1, by joint class

| Class (S1 need) | 1st choice | 2nd choice | Why |
|---|---|---|---|
| **Knee / hip pitch** (150–250 N·m peak; ≥9.5 rad/s) | **MyActuator RMD-X12-P20-320-E**: 320 / 85 N·m, 2.37 kg, 13.1 rad/s @48 V, ~US$1,090 | **DAMIAO DM-J10010-2EC**: 150 / 40 N·m, 1.49 kg, 15.7 rad/s, US$540 | **X12:** the only 48 V unit with verified specs, a listed price and clear margin over 250 N·m. It also has a published overload table (250 N·m for 7 s, 150 N·m for 10 s). Crossed-roller output (5 kN radial). Its 20–70 V range allows a 14S bus: about 14 rad/s no-load at 51.8 V nominal (derived), which gives speed headroom over the 9.5 rad/s target. Dual 17-bit encoders; CAN or EtherCAT. Its torque per dollar (0.29 N·m/US$) is slightly better than the J10010's (0.28). **J10010:** half the cost and 0.9 kg lighter per joint. At 150 N·m it sits at the bottom of the band, so use it for hip pitch or with a ≥1.3:1 knee linkage. Keep the bus ≤52 V. **Budget route:** RobStride RS04 with a 1.6–2:1 belt or linkage (US$295 / A$577 in AU stock, 0.41 N·m/US$). Its 120 N·m is a 10 s rating on a large plate. **Watch:** DAMIAO J8520P (176 N·m, 1.39 kg, CAN-FD, 17-bit) once a price appears. |
| **Hip roll / yaw** (80–150 N·m; 4–5 rad/s) | **RobStride RS04**: 120 / 40 N·m, 1.51 kg, 20.9 rad/s, US$295 / **A$577.04 at Pakronics** | **MyActuator RMD-X8-P20-120-E**: 120 / 43 N·m, 1.40 kg, 16.5 rad/s, US$645 | **RS04:** best torque per dollar in the catalogue, sold by an AU reseller, and 4× the speed needed. Overload table: 70 N·m for 59 s and 50 N·m for 300 s, which covers short single-leg-stance holds (S1 ≈ 50–70 N·m). **X8-120:** crossed-roller output (4.5 kN radial) suits a load-bearing hip-roll joint. Higher rated torque and a stall table (129 N·m for 5 s). A cheaper fast alternative is the DAMIAO J10010L (120 / 40 N·m, 1.37 kg, ~US$322). For hip yaw alone (36–50 N·m), an RS03 saves 0.6 kg per side. |
| **Ankle** (60–120 N·m via two push-rods) | **RobStride RS03**: 60 / 21 N·m, 0.93 kg, 20.4 rad/s, US$245 / **A$509.15** | **MyActuator RMD-X6-P20-60-E**: 60 / 20 N·m, 0.82 kg, 18.4 rad/s, US$490 | Two actuators through a ~1.5:1 lever give about 180 N·m pitch peak at about 13 rad/s (derived). That covers S1's 87–121 N·m repeated and most of the momentary case. **RS03:** 60 N·m for 13 s, cheap, sold by an AU reseller. **X6-60:** 0.11 kg lighter, crossed-roller output, 17-bit output encoder, 60 N·m for 5 s. **Budget:** Steadywin GIM8115-9 (54.6 N·m stall, 0.705 kg, US$155, optional output encoder). |
| **Arm** (20–60 N·m; 6–7 rad/s) | **RobStride RS03** for shoulder pitch and roll (60 / 21 N·m, US$245) | **DAMIAO DM-J4340-2EC V1.1 (48 V)** for upper-arm yaw and elbow: 40 / 12 N·m, **0.36 kg**, 11.7 rad/s, ~US$215 | **RS03:** shoulder pitch needs 34–47 N·m peak and a 27–38 N·m hold (K1 54 N·m × 0.5–0.7). It shares the leg protocol and the AU reseller. **J4340:** 2.6× lighter than the RS03 where distal mass costs the most. Its 40:1 ratio gives less backdrivability. The RobStride RS06 (36 / 11 N·m, 0.62 kg, US$255) is a fast alternative for the elbow. |
| **Wrist / neck** (5–15 N·m) | **RobStride RS00**: 14 / 5 N·m, 0.31 kg, 33 rad/s, US$185 / **A$282.85 (173 in stock at Pakronics)** | **DAMIAO DM-J4310-2EC V1.2 (48 V)**: 12.5 / 3.5 N·m, 0.31 kg, 47 rad/s, from US$180 | **RS00:** local stock, dual encoders, same bus protocol as the legs, 14 N·m for 5 s. **J4310:** 16-bit dual encoders, faster, MIT mode. |

**Extra joints not in the five classes:**
- Waist yaw (30–42 N·m): RobStride RS03.
- Waist pitch (104–146 N·m at 1.5 rad/s): CubeMars AKH70-48 (222 N·m, 3.7 rad/s, ~US$699), or an RS04 through a 2:1 stage.

**Indicative set (derived sums, first choices):**
- **Joints:** 4 × X12-320, 4 × RS04, 8 × RS03 (ankles and shoulders), 4 × J4340, 4 × RS00 (wrists and neck), 1 × RS03 (waist yaw), 1 × AKH70-48 (waist pitch).
- **Cost:** about **US$10,000** in actuators. Swapping in 4 × J10010 for the X12s gives about US$7,800.
- **Mass:** about **28 kg** of actuators, or 24 kg with the J10010s. That is 37–62 % of S1's 45–65 kg budget, so mass,
  not torque, will push the design toward the lighter DAMIAO and RobStride parts.

## 6. Sources (all accessed 2026-11-09)

**RobStride (Lingzu Shidai)**
1. RobStride Product_Information repository and README (selection table, 2026-07-13 data): <https://github.com/RobStride/Product_Information>
2. RobStride RS series specification PDF (2026.010.09), with overload and T-N tables and the summary sheet: <https://raw.githubusercontent.com/RobStride/Product_Information/main/%E7%81%B5%E8%B6%B3%E6%97%B6%E4%BB%A3RS%E7%B3%BB%E5%88%97%E4%BA%A7%E5%93%81%E8%A7%84%E6%A0%BC%E4%BB%8B%E7%BB%8D%282026.010.09%29.pdf>
3. RobStride EL (EDULITE 05) specification PDF: <https://raw.githubusercontent.com/RobStride/Product_Information/main/%E7%81%B5%E8%B6%B3%E6%97%B6%E4%BB%A3EL%E7%B3%BB%E5%88%97%E4%BA%A7%E5%93%81%E8%A7%84%E6%A0%BC%E4%BB%8B%E7%BB%8D%282026.09.22%EF%BC%89.pdf>
4. Pakronics AU RobStride prices: <https://www.pakronics.com.au/search?q=robstride>
5. roboticscenter.ai RobStride prices: <https://www.roboticscenter.ai/store/brand/robstride/>
6. OpenELab RS04 (EUR price, 1 Mbps CAN, 14-bit encoders): <https://openelab.io/products/robstride04-qdd-120n-m-integrated-joint-motor-module>
7. OpenELab RS10P: <https://openelab.io/products/robstride-10p-qdd-joint-actuator>
8. Protocol notes: <https://index.ros.org/r/robstride_ros2/> · <https://wiki.seeedstudio.com/robstride_control/>

**MyActuator**

9. Downloads page: <https://www.myactuator.com/downloads-xseries>
10. X-V4 manual bundle (X Series-V4 product manual 261029, CAN protocol V4.4): <https://www.myactuator.com/_files/archives/cab28a_712afb681f434c1394145c69aae60b8e.zip>
11. X-V4.1 bundle (2026 Product Catalog EN-261103): <https://www.myactuator.com/_files/archives/cab28a_0316582549cf4af7942242e05309227c.zip>
12. X-V2 bundle (X Series-V2 product manual 241227): <https://www.myactuator.com/_files/archives/cab28a_31f28832b90245fba0b79ad79480821e.zip>
13. Model list and discontinued flags: <https://www.myactuator.com/rmd-x-planetarymotor>
14. roboticscenter.ai MyActuator prices: <https://www.roboticscenter.ai/store/brand/myactuator/> · <https://www.roboticscenter.ai/store/brand/myactuator/?page=2>

**CubeMars**

15. AK10-9 V3: <https://www.cubemars.com/product/ak10-9-v3-0-kv60-robotic-actuator.html>
16. AK80-9 V3: <https://www.cubemars.com/product/ak80-9-v3-0-robotic-actuator.html>
17. AK70-9 V3: <https://www.cubemars.com/product/ak70-9-v3-0-kv60-robotic-actuator.html>
18. AK60-6 V3, including the full comparison table: <https://www.cubemars.com/product/ak60-6-v3-0-kv80-robotic-actuator.html>
19. AK80-64: <https://www.cubemars.com/product/ak80-64-kv80-robotic-actuator.html>
20. AK70-10: <https://www.cubemars.com/product/ak70-10-kv100-robotic-actuator.html>
21. AKE90-8: <https://www.cubemars.com/product/ake90-8-kv35-quasi-direct-drive-actuator.html>
22. AKE80-8: <https://www.cubemars.com/product/ake80-8-kv30-quasi-direct-drive-actuator.html>
23. CubeMars store: <https://store.cubemars.com/collections/ak-series-robotic-actuation-module>
24. AKH70-48 price: <https://www.robotshop.com/products/cubemars-akh70-48-kv41-hollow-planetary-actuator-module> · <https://ozrobotics.com/vendors/cubemars/>

**DAMIAO** (parameter tables are images on the product pages)

25. Joint motor category: <https://www.damiaokeji.com/index.php?c=category&id=22>
26. Product pages, by model:
    - J10010: <https://www.damiaokeji.com/index.php?c=show&id=107>
    - J10010L: <https://www.damiaokeji.com/index.php?c=show&id=106>
    - J8520P: <https://www.damiaokeji.com/index.php?c=show&id=142>
    - J10422P: <https://www.damiaokeji.com/index.php?c=show&id=126>
    - J8009P: <https://www.damiaokeji.com/index.php?c=show&id=105>
    - J8006: <https://www.damiaokeji.com/index.php?c=show&id=103>
    - J6006: <https://www.damiaokeji.com/index.php?c=show&id=102>
    - J6248P: <https://www.damiaokeji.com/index.php?c=show&id=110>
    - J4340 V1.1: <https://www.damiaokeji.com/index.php?c=show&id=135>
    - J4310 V1.2: <https://www.damiaokeji.com/index.php?c=show&id=125>
    - JH20: <https://www.damiaokeji.com/index.php?c=show&id=149>
27. DM-J10010L-2EC user manual V1.0 (MIT mode, 1 Mbps, 99.74 A): <https://f.foxtech.com/manual/DM-J10010L-2EC-V1.0.pdf>
28. Prices: <https://damiao.roboticscenter.ai/> · <https://openelab.com/products/damiao-brushless-servo-dm-j10010l>

**Unitree**

29. GO-M8010-6: <https://www.unitree.com/mobile/go1/motor/>
30. A1 motor: <https://www.unitree.com/mobile/a1/motor/>
31. Unitree shop: <https://shop.unitree.com/products.json> · <https://shop.unitree.com/products/unitree-im6014-motor>
32. IM6014 reseller specs: <https://www.4gltemall.com/unitree-im6014-joint-actuator.html>

**Steadywin, HighTorque, ENCOS, EYOU**

33. Steadywin Robotic Joint Motor Selection Table 2025-08-28: <https://download.s21i.co99.net/14180476/0/0/ABUIABA-GAAg85zExQYowOGT9Ac.xlsx?f=Robotic%20Joint%20Motor%20Selection%20Table_2025-08-28.xlsx&v=1756434035> (linked from <https://www.steadywin.cn/en/h-pr-j-3_3.html>)
34. Steadywin prices: <https://www.roboticscenter.ai/store/product/steadywin-gim8115-9-planetary-reducer-servo-motor> · <https://aifitlab.com/products/steadywin-gim10015-9-planetary-reducer-motor>
35. HighTorque: <https://openelab.com/products/seeed-hightorque-htdw-6056-36> · <https://www.pakronics.com.au/products/hightorque-htdw-5047-20-ne-1-20-gear-motor-can-ss100010715>
36. ENCOS: <https://aifitlab.com/collections/encos-motor/products/encos-ec-a10020-p1-12-motor> · <https://aifitlab.com/products/encos-ec-a10020-p2-24-motor> · <https://aifitlab.com/collections/encos-motor>
37. EYOU: <https://aifitlab.com/products/eyou-pp11-motor>

**DIY (moteus / ODrive)**

38. mjbots store (qdd100, moteus-n1/c1/x1, mj5208, gearset, pi3hat, mjcanfd-usb-1x, power_dist): <https://mjbots.com/products.json>
39. ODrive store (S1, Pro, M8325s, USB-CAN): <https://shop.odriverobotics.com/products.json>
40. ODrive motor documentation: <https://docs.odriverobotics.com/v/latest/hardware/odrive-motors.html>
41. Berkeley Humanoid Lite paper: <https://arxiv.org/html/2504.17249v1>

**Supporting parts:** the URLs are listed in each table in section 4.

**Price change:** CNX Software, NVIDIA Jetson price increase (22 July 2026): <https://www.cnx-software.com/2026/07/22/nvidia-increases-the-price-of-jetson-modules-and-devkits-by-up-to-101/>
