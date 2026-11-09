# 06 — Sensor architecture (K1 Mk II)

![Head](../renders/07_head_detail.png)

Component data and sources: [research/R4](research/R4-sensors-compute.md), [research/R5](research/R5-hands.md),
[research/R2](research/R2-drives-encoders-safety.md), [research/R7](research/R7-commercial-humanoids.md),
[research/R10](research/R10-actuator-state-of-the-art.md). Electrical interfaces are in
[05-electrical-architecture.md](05-electrical-architecture.md). Parts checked for this revision cite their URL
(accessed 2026-11-09); **[E]** = engineering estimate or a value still to be verified.

**Mk II additions:**
- palm cameras (R7 #15);
- liquid-loop sensing: coolant temperature, flow, pressure and leak;
- per-pack sensing for the two hot-swap packs and their power path;
- jacket and HC2 temperatures on the knee and hip pitch;
- wrist-cross angle sensors for KW-L2;
- 13-DOA hand joint sensing;
- the foot load cells now also feed payload estimation (docs/07 §8).

## 1. Sensor set: what, where, why, how it's processed

### 1.1 Perception, balance and contact (Mk I set, kept)

| Sensor (qty) | Where | Measures | Why it's necessary | Interface → processing |
|---|---|---|---|---|
| **Stereolabs ZED X Mini** (1): 2× 1920×1200 global shutter, 50 mm baseline, 0.1–8 m, IMU, 150 g, ≈ 1.5 W [ds] | head, behind the visor, pitched 10° down | dense depth + RGB of the manipulation and walking workspace | grasping, object pose, near obstacles; global shutter avoids motion blur while walking | GMSL2 → Thor (ZED SDK / Isaac ROS stereo) at 30–60 fps |
| **ZED X One GS** (2): AR0234 mono global shutter, 110° HFOV, 50 g [ds] | head temples, yawed ±55° | wide peripheral images | visual-inertial odometry (cuVSLAM); people detection to the sides | GMSL2 → Thor cuVSLAM at 30 fps, hardware-synced |
| **Orbbec Gemini 335Lg** (1): active stereo, 0.17–20 m (best 0.25–6 m), 90×65° [ds] | abdomen window, pitched 35° down | depth of the ground 0.3–2.5 m ahead | foothold and step-edge detection (stairs), terrain height map for the locomotion policy | GMSL2 → Thor (elevation mapping) at 30 fps |
| **Livox Mid-360** (1): 360° × −7…+52°, 0.1–40 m @10 %, 200 k pts/s, 265 g, 6.5 W [ds] | crown of head | 3D point cloud, all-round | mapping and localisation independent of lighting; long-range obstacles; people-presence zone monitoring | Ethernet → Thor (FAST-LIO2, nvblox) at 10 Hz |
| **MicroStrain 3DM-CV7-AHRS** (1): gyro bias instability 1.5 °/h, 1 kHz, 8.3 g [ds] | pelvis, on a silicone isolator | angular rate, acceleration, attitude | **balance**: base orientation and angular velocity are the most important estimator inputs | UART → RT computer at 1 kHz (IEKF) |
| **TDK IIM-46230** (1): 4.1 °/h [ds] | safety MCU board | independent attitude | tilt/fall detection with no dependence on the main computers | SPI → safety MCU at 1 kHz |
| Board IMUs (ICM-42688-P class, 4) | each foot board, each hand controller | impact acceleration | touchdown/impact detection; slip detection | SPI → foot/hand MCU → EtherCAT |
| **Foot load cells** (4 per foot) | sole corners, under the foot plate | vertical force at 4 points | **contact + centre of pressure** for balance; **total vertical force for payload-mass estimation** (Mk II) | foot board ADC → EtherCAT at 1 kHz |
| Ankle 6-axis F/T Bota PixONE T60 (option, 2) [ds] | between shank and ankle | full wrench | research option; not in the baseline (cost) | EtherCAT 3.8 kHz |
| Wrist 6-axis F/T Bota SensONE T5 (option, 2) [ds] | wrist | hand wrench | precise force control; the baseline estimates the wrench from arm torque flexures + current | EtherCAT |
| **ToF multizone ST VL53L5CX** (8): 8×8 zones, 4 m [ds] | shins ×2, forearms ×2, head rear, hands ×2, torso rear | near-field distance | slow-down zones near people and obstacles out of camera view | I²C → local MCU → EtherCAT at 15 Hz |
| **ReSpeaker XVF3800** mic array (1) [ds] | head lower rear | audio + direction of arrival | speech interface, sound localisation | USB → Thor |

### 1.2 Hands Mk II (13 DOA per hand)

| Sensor (qty) | Where | Measures | Why | Interface → processing |
|---|---|---|---|---|
| **Palm camera TechNexion VLS-GM2-AR0234** (2): AR0234 global shutter, 191° M12 fisheye, GMSL2 (US$188.50, [R4]) | centre of each palm behind a window | the last 10–15 cm of a grasp, where the head cameras are blocked by the hand itself | closes the grasp: pre-contact alignment, handle and edge finding, slip seen visually. Figure 03 has the same feature (R7 #15) | GMSL2 micro-coax through the arm (docs/05 §9) → J601 port 5/6 → Thor at 30–60 fps |
| **Contactile 3D force buttons** Ø10, 0–20 N (10) [ds R5] | under each fingertip pad | 3-axis fingertip force (±0.02–0.08 N resolution) | grip-force control, slip onset; the R7 #4 ≤ 5 g threshold is ≈ 0.05 N, at the edge of this resolution [E] | I²C → hand controller at 500 Hz |
| Magnetic tactile skin (AnySkin pattern, 5× MLX90393) (2) | palms, around the camera window | contact location and force | whole-hand grasp feedback; swappable skins without recalibration [R5] | I²C → hand controller at 200 Hz |
| Finger joint angle TMAG5273 (13 per hand, 32 bought) | each actuated joint | absolute finger angles | position after power-up and under back-driving; thumb opposition state | I²C → hand controller |
| Micro-motor current + ENX encoders (13 per hand) | each micro-actuator | motor position, current → nut force | position loop; force estimate where there is no tactile sensor (abduction, thumb rotation) | hand controller, 20 kHz current loop |

### 1.3 Joints

| Sensor (qty) | Where | Measures | Why | Interface |
|---|---|---|---|---|
| **Output encoders** RLS AksIM-2 (26) [ds R2] | every rotary actuator output | absolute joint angle (19–20 bit) | kinematics, gear-error compensation, link deflection | BiSS-C → drive → EtherCAT 1 kHz |
| Motor encoders (26): AksIM-2 (7, legs/waist) or MT6835 (19) | every rotor | rotor angle | commutation, velocity; with the output encoder → transmission wind-up and backlash monitoring (R10 §3.4) | drive internal, 10–50 kHz |
| Strain-gauge torque flexures (8 + 2 spare) | KH-C25 / KH-C20 outputs | joint torque | **cycloid friction defeats current-based torque estimation on the arms** (R10 §3.4); collision detection and compliant arm control | ADS1262 on the carrier → EtherCAT |
| Motor current (26 × 3-phase) | drives | torque estimate | torque control for the quasi-direct-drive legs (low ratio → current ≈ torque), with a friction model and a learned residual | drive internal |
| **HC2 telemetry** (4) | knee and hip-pitch drives | DC-link voltage and current, phase currents, GaN power-stage temperature, STO state | drive protection; per-leg power accounting; STO feedback to the safety MCU | EtherCAT 1 kHz |
| **Wrist-cross angle sensors** MT6835 (2 per wrist) | wrist cross, pitch and roll axes | absolute wrist pitch/roll angle | KW-L2 motors have Hall commutation only; the cross angle closes the wrist loop and checks the linkage IK | SPI → KW-L2 forearm driver board → EtherCAT |
| **KW-L2 phase current** (4) | KW-L2 forearm driver board | motor current → screw force (2.765 N per mN·m at 2 mm lead, docs/05 §6.4) | force limiting at the 754 N repeated / 970 N momentary corner; I²t | forearm driver board (F28P65x) → EtherCAT |

### 1.4 Thermal (all joints, packs, loop)

| Sensor (qty) | Where | Why | Interface |
|---|---|---|---|
| Winding NTCs (52) | 2 per motor, in the end turns | thermal derating (130 °C warn / 150 °C trip) | drive → EtherCAT |
| **Jacket NTCs** (4) | KA-130K2 jacket outlet (R10 §3.4: 2 in the end turns + 1 on the jacket outlet) | thermal-model boundary temperature: winding temperature = jacket outlet + copper loss × R_th | HC2 → EtherCAT |
| Drive power-stage NTC (26) | every drive | drive derating | EtherCAT |
| TMP117 on boards | PDU, PPM, carriers, computers | board health | I²C → local MCU |

### 1.5 Liquid cooling loop (new)

| Sensor (qty) | Where | Measures | Why | Interface |
|---|---|---|---|---|
| **Flow sensor Sensirion SLF3S-4000B** (2): 600 ml/min full scale, 5 % accuracy (water), I²C, 3 bar max ([sensirion.com](https://sensirion.com/products/catalog/SLF3S-4000B)) | supply to each leg branch, in the torso manifold | branch flow, 0.3–0.5 L/min each | detects a blocked, kinked or leaking leg branch and a failed pump; sets the loop derate | I²C → PDU MCU at 10 Hz |
| Coolant NTC probes, thread-in (6) | supply and return of each leg branch (docs/03 §9.4), cold-plate outlet, plus **one independent probe on the supply manifold read by the safety MCU** | coolant temperatures | fan and pump control, system derate, branch ΔT (pump or blockage detection), independent over-temperature trip | PDU MCU ADC at 10 Hz; safety MCU for the independent probe |
| Loop pressure transducer 0–2.5 bar, stainless wetted (TE M3200 class, docs/03 §9.4) (1) | at the compensator | loop gauge pressure (0.3 bar nominal, set by the compensator) | **pressure < 0.15 bar = leak** (docs/03 §9.6); a slow decay at rest = small leak; a rise = blockage or over-temperature | PDU MCU |
| **Leak sensing** (8 interdigitated PCB pads + 1 m sensing cable) | under each HC2 drive (the board-edge leak traces of docs/09 §7), each pump, manifold, cold plate; cable along the torso floor | conductive liquid present | a leak onto 67 V electronics is an electrical hazard, so the HC2 pads are wired to the **safety MCU** as well as the PDU MCU (docs/05 §8) | PDU MCU + safety MCU hard-wired line |
| Pump tach + current (2), fan tach (2) | PDU | pump and fan health | a stalled pump shows as tach = 0 with current anomaly; dry running shows as low current at speed | PDU MCU |

The loop is sealed: a spring-diaphragm compensator holds 0.3 bar and there is no reservoir (docs/03 §9.2), so leaks are
found by pressure, not level. The coolant (40 % propylene glycol + inhibitor, docs/03 §9.4) is conductive. That makes
the interdigitated leak pads respond quickly, but it also means a leak onto a powered board can short it. Hence the
conformal coat, the drip lips and the safety-MCU wiring of the HC2 pads. The pads use an AC measurement so they do not
electrolyse [E]. Test them with the actual coolant during commissioning.

### 1.6 Power: packs, power path, charging (new)

| Sensor (qty per pack) | Where | Measures | Why | Interface |
|---|---|---|---|---|
| Cell voltages (16 × 2) | BQ76952 AFE in each pack ([ti.com/product/BQ76952](https://www.ti.com/product/BQ76952)) | 16 series groups | OV/UV protection, balancing, SoC | BMS MCU → CAN-FD 10 Hz |
| Secondary OVP (1 × 2) | BQ77216, separate taps [R3] | cell over-voltage | independent second protection layer | hard-wired to the pack switch |
| Cell + FET NTCs (9 × 2) | 8 among the cells (edges, centre, both layers), 1 on the pack FETs | temperatures | charge/discharge derating, thermal-runaway early warning (rate of rise) | BQ76952 thermistor inputs |
| Pack current (1 × 2) | 0.5 mΩ shunt in each pack | current, coulomb count | SoC, CCL/DCL, short circuit | BQ76952 |
| **Thermal-event sensor** (1 × 2) | inside each pack enclosure | vent gas / pressure rise | earlier warning of a venting cell than temperature alone [E] | BMS MCU → CAN-FD + hard wake to the PPM |
| Pack-present pilot loop (1 × 2) | short pilot pin in the pack connector **in series with the sealed lever micro-switch** (docs/03 §10.2) | seated and lever closed | dead terminals unless seated; the channel is shed before any contact moves (docs/05 §4.5) | hard-wired → BMS + PPM |
| Lock-position switch + solenoid pin (1 × 2) | secondary catch of each bay | catch blocked / released | removal interlock state (docs/05 §4.5) | PPM MCU |
| Pack heater state + cell temperature (1 × 2) | 15 W heater film in each pack (docs/03 §10.2) | heater on/off | cold start: no discharge above C/5 below 0 °C | BMS → CAN-FD |
| **Robot-side path monitors INA228** (3) | PPM: pack A path, pack B path, charge inlet ([ti.com/product/INA228](https://www.ti.com/product/INA228)) | current, voltage, power, energy, charge (20-bit, 0–85 V) | current sharing, swap verification (< 1 A before unlock), energy logging independent of the BMS | I²C → PPM MCU |
| Bus voltage + zone currents | PDU | main bus V, 7 zone eFuse currents | brown-out detection, zone fault isolation, chopper monitoring | PDU MCU → CAN-FD / EtherCAT |
| Dock: charger telemetry + smoke/heat detector | charging dock | charger V/I, dock temperature, smoke | unattended-charging protection (docs/05 §12) | CAN via dock contacts; detector cuts mains locally |

## 2. Why each choice

* **Global-shutter stereo in the head, not a rolling-shutter RGB-D.** The head moves fast during gait and rolling shutter
  smears depth. The ZED X Mini replaces the full ZED X because the 164 mm ZED X body does not fit a human-proportioned head.
* **Separate downward depth sensor.** The head cannot see the feet during stair ascent without pitching down.
* **LiDAR is justified** for mixed lighting, glass and large indoor spaces, and as an independent second modality near stairs.
* **Load cells, not a 6-axis ankle F/T, in the baseline.** Four load cells give vertical force and centre of pressure for
  ≈ 2 % of the F/T cost. In Mk II they also give the **payload weight directly**: the change in total vertical force when
  an object leaves the ground (docs/07 §8).
* **Dual encoders on every joint** give true output position and a free torque/wind-up estimate on the legs.
* **Palm camera instead of a third head camera.** The occlusion problem is geometric: in the last few centimetres the hand
  blocks every head camera. A wide-angle global-shutter camera in the palm is the cheapest fix. A 191° fisheye sees the
  whole finger workspace.
  - Its module size is **not verified** for a ≈ 90 mm palm; check before the hand CAD freezes.
  - The fallback is a smaller GMSL2 or MIPI-over-serialiser module on the same port.
* **Flow per leg, not just pump tach.** A pump can spin with a kinked line. Flow per branch is the only direct evidence that
  each knee and hip jacket is cooled, and it also finds partial blockages before temperatures rise.
* **Leak pads under the drives, wired to the safety MCU.** The liquid shares the actuator housings with 67 V GaN drives, so a
  leak there is treated as a safety event, not a maintenance message.
* **Pack sensing stays in the pack.** A hot-swap pack is handled by people and stored off the robot. Its BMS must protect it
  and remember its history without the robot.

## 3. Data flow and timing

```
1 kHz      pelvis IMU, joint encoders, motor currents, HC2 telemetry, foot load cells ──► RT computer (estimator, WBC)
200–500 Hz fingertip force, palm skin, finger angles ──► hand controller (grip loops) ──► RT / Thor
30–60 Hz   ZED X Mini, 2× ZED X One, Gemini 335Lg, 2× palm cameras ──► Thor GPU (stereo, VIO, elevation map, grasp)
10 Hz      Mid-360 ──► Thor (LiDAR odometry, mapping, zone monitor)
15 Hz      ToF array ──► RT computer (speed scaling near obstacles)
10 Hz      coolant flow / temperature / pressure, pump + fan tach ──► PDU MCU ──► RT health manager (docs/07 §6)
10 Hz      BMS A/B (cell V, T, I, SoC, CCL/DCL), PPM path monitors ──► PPM MCU ──► RT computer (CAN-FD)
event      leak pads at HC2 drives, pack thermal event, pilot loss ──► hard-wired to safety MCU / PPM
```

All streams are timestamped against a single PTP clock: the RT computer is grandmaster; the J601 and Mid-360 support PTP;
CAN-FD frames are stamped on receipt by the RT computer. Camera exposure is hardware-triggered from one GMSL frame sync,
palm cameras included.

## 4. Calibration (each repeated after any head, hand or limb disassembly)

| Calibration | Method | Tool |
|---|---|---|
| Camera intrinsics + stereo extrinsics | checkerboard / ChArUco sequences | Kalibr, ZED SDK |
| **Palm camera intrinsics (fisheye) + hand-eye** | ChArUco board; move the hand through 20 poses while the head camera also sees the board | Kalibr (equidistant model), custom least squares |
| Camera-IMU extrinsics + time offset | dynamic excitation sequence | Kalibr camera-IMU |
| LiDAR-to-head extrinsics | planar target + hand-eye optimisation | `lidar_align` / Kalibr |
| Head-to-body (kinematic) | move the head through 30 poses viewing a ground AprilTag board | custom least squares |
| Joint zero offsets | machined zero pins at each joint (Ø4 mm dowel holes) | done at assembly |
| Encoder self-calibration | AksIM-2 built-in routine, one full rotation | RLS tool |
| **Wrist-cross sensors** | wrist zero fixture; sweep pitch/roll and fit against the KW-L2 linkage IK | custom |
| Load cells | dead weights 0–80 kg per foot | test stand |
| Torque flexures | lever arm + calibrated weights, ±full scale | arm fixture |
| IMU | 6-position static + thermal soak | — |
| **Flow sensors** | timed-volume test on the real coolant at 0.2 / 0.4 / 0.6 L/min (the sensor is specified for water) | loop bench (B131) |
| **Coolant NTCs** | ice point + 60 °C bath against a reference thermometer | — |
| **Leak pads** | drip test with the actual coolant on each pad; record the response time | — |
| **Pack current** | BMS shunt vs PPM INA228 vs a clamp meter at 0 / 10 / 30 A | Rigol DL3031 load (docs/12 §4) |

## 5. Failure handling

Every sensor has a staleness watchdog in the RT controller (or the PDU/PPM MCU for power and cooling sensors).

| Lost or implausible | Response |
|---|---|
| Pelvis IMU, any joint encoder, both feet's load cells | Cat 1 controlled stop (crouch) |
| One camera | drop to LiDAR + remaining cameras, reduce speed |
| LiDAR and all cameras | stop walking, hold balance |
| One palm camera | grasp from head cameras only; skills that need the palm view are refused |
| One leg flow sensor | assume that branch is at the other pump's flow; derate that leg's continuous limits to the air-only rating (docs/07 §6.4) |
| Coolant NTC | use the neighbouring probe + model; if the radiator-outlet probe is lost, fans to 100 % |
| Leak pad at an HC2 drive (or pad open-circuit) | Cat 1 stop; that leg's zone is cut after the crouch (docs/07 §6.4) |
| Pack cell sensing, BMS CAN silent > 200 ms | treat that pack as failed: its OR path is shed, single-pack mode, swap prompt |
| Loop pressure transducer | fall back to branch ΔT and flow for leak detection; maintenance flag |
| Pilot loss without a swap request | immediate shed of that channel (hardware), single-pack mode |
| Wrist-cross sensor | KW-L2 falls back to Hall position + stored offset; wrist speed halved, force-limited |
