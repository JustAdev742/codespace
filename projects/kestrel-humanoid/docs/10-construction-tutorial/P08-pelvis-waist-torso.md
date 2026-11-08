# P08 — Pelvis, waist, torso frame, power distribution and compute

## A. Visual reference
* Torso internals: [`renders/17_torso_ghost.png`](../../renders/17_torso_ghost.png)
* Skeleton: [`renders/10_skeleton_front.png`](../../renders/10_skeleton_front.png), [`renders/13_exploded_skeleton.png`](../../renders/13_exploded_skeleton.png)
* Drawings: `cad/out/drawings/pelvis__pelvis_bowl.svg`, `torso__spine_plate.svg`
* Power and comms: [`diagrams/power_architecture.svg`](../../diagrams/power_architecture.svg), [`diagrams/comms_topology.svg`](../../diagrams/comms_topology.svg)

## B. Parts list

| BOM | Item | Qty |
|---|---|---|
| B063 | Pelvis bowl (7075, 5-axis) with M10 lifting eye | 1 |
| (P03) | KA-90P (waist yaw) + KA-90P ×2 (hip yaw, already in the legs) | 1 |
| (P03) | KA-110P (waist pitch) | 1 |
| B064 | Spine plate, upper/lower ribs, CF closeout panels, battery rails, lifting eye | 1 set |
| (P04) | KH-25 shoulder-pitch actuators | 2 |
| (P04) | KH-14 neck-yaw actuator | 1 |
| B035, B036 | PDU board (6 eFuse zones, brake chopper, telemetry), brake resistor | 1 each |
| B033, B034 | DC-DC 24 V 300 W, 12 V 150 W (36–75 V input) | 1 each |
| B038–B040 | Jetson T5000 + J601 carrier + NVMe, cold plate + heat pipes | 1 |
| B041 | UP Squared Pro 7000 (RT computer) | 1 |
| B042, B050 | Safety MCU board + IIM-46230 | 1 |
| B049 | MicroStrain 3DM-CV7 on a 4-point silicone isolator (pelvis) | 1 |
| B047 | Gemini 335Lg (abdomen, 35° down) | 1 |
| B080 | 2 torso blowers + ducts + filters | 1 set |
| (P06) | Battery pack | 1 |
| B077 | Waist TPU bellows | 1 |

## C. Tools
As P07, plus thermal paste and pads, crimp tools (XT60, SurLok, Gecko-MT, JST GH), a label printer.

## D. Manufacturing
* Pelvis bowl: 5-axis 7075 with all seats (hip yaw ×2, waist yaw) bored in one setup for relative position ≤ 0.02 mm. Hard anodise with the seats masked.
* Spine and ribs: CNC 7075 plates. CF closeouts cut from 2 mm CF sheet and bonded/screwed.

## E. Assembly
1. **Pelvis:** fit both hip-yaw KA-90P (outputs down) and the waist-yaw KA-90P (output up) into the bowl seats (8 × M4 at 4.5 N·m each). Mount the IMU isolator at (−60, 0, +50 mm) from the hip-centre midpoint, x-axis forward ±0.5°.
2. **Waist:** yoke onto the waist-yaw output; KA-110P (waist pitch) into the yoke with its axis y at z = 1085 mm.
3. **Torso frame:** spine plate onto the waist-pitch output flange (10 × M4 at 4.5 N·m), then the ribs. Battery rails inside. KH-25 shoulder-pitch actuators on the upper rib at y = ±135 mm, outputs outward, axes at z = 1420 mm. Neck-yaw KH-14 on top.
4. **Electronics bay:**
   - Jetson + J601 on the front of the upper ribcage with the cold plate facing forward into the intake duct.
   - RT computer and safety MCU on the rear of the spine plate (conduction pad).
   - PDU and DC-DCs beside the battery bay (front lower).
5. **Ducts:** torso intake under the chest light → Jetson cold plate → blowers → rear grille. Thermal paste on the cold plate, heat pipes clamped.
6. **Mount the legs** to the pelvis (hip-yaw outputs → yaw–roll yokes) with the robot hanging from the gantry lifting eyes.
7. **Battery:** slide into the rails from the back, latch, connect the SurLok pair to the PDU, then the service disconnect.

## F. Electrical
* PDU zone outputs:
  - left leg / right leg: 40 A, 12 AWG;
  - pelvis/waist: 30 A, 14 AWG (waist yaw, waist pitch, both hip yaws);
  - left arm / right arm: 20 A, 14 AWG;
  - neck + hands: 15 A, 16 AWG.
* 24 V rail → J601 (XT30, 12 AWG), Mid-360, GMSL camera power through the J601.
* 12 V rail → RT computer, blowers, hand logic, foot boards, safety MCU (its own fuse).
* EtherCAT: RT computer port 1 → torso junction → waist → left leg chain → right leg chain → arms → neck → back to port 2.
* E-stop chain: FORT receiver + back button + tether socket → safety relay (back of the spine) → STO bus (all J-LINK pins 5/6/7) + disconnect enable.
* CAN: BMS ↔ RT computer ↔ safety MCU (120 Ω terminations at the ends).
* Bond BUS− to the chassis at the PDU star point (10 mm² strap). Mask the anodise at the bonding pads.

## G. Testing (gate G2/G3 preparation)
| Test | Pass |
|---|---|
| Insulation, bus → chassis with the bond lifted, 500 V | > 10 MΩ (then refit the bond) |
| Power-up sequence (pack → precharge → bus → DC-DCs → computers) | rails within ±3 %; precharge < 0.5 s |
| eFuse trip test per zone with an electronic load | trips at the set current ±10 % |
| EtherCAT: all slaves present, ring redundancy (pull one cable mid-run) | OP state maintained; 1 kHz DC, jitter logged < 20 µs |
| Thermal: Jetson at 100 W synthetic load for 30 min in the closed torso | module below throttle temperature |
| Waist yaw/pitch range and holding with the arms mounted later | per P07 criteria |
| Safety MCU trip paths (tilt the torso > 35° on the gantry, kill the heartbeat) | Cat 1 sequence then STO |
