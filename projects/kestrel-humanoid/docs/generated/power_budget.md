# Power budget and battery sizing (generated)

Actuator electrical power from inverse-dynamics torque/speed through each joint's sized motor, gear, linkage and drive (copper loss via Km, gear efficiency both directions, 3 % drive loss, 50 % regeneration recovery).

## Electronics

| Load | Typical W | Peak W |
|---|---|---|
| AI computer: Jetson AGX Thor T5000 + carrier (40-130 W envelope) | 75.0 | 130.0 |
| Real-time computer: UP Squared Pro 7000 class, PREEMPT_RT | 20.0 | 35.0 |
| Safety MCU board (TMS570) + e-stop receiver | 2.0 | 3.0 |
| Head stereo ZED X (GMSL2) | 1.5 | 1.5 |
| Hand-workspace stereo ZED X Mini (GMSL2) | 1.5 | 1.5 |
| 2x wide SLAM cameras ZED X One GS | 1.9 | 1.9 |
| Chest depth camera Orbbec Gemini 335Lg | 3.0 | 7.5 |
| 3D LiDAR Livox Mid-360 | 6.5 | 14.0 |
| IMUs (MicroStrain CV7 + IIM-46230 + board IMUs) | 1.0 | 1.0 |
| 2x wrist F/T (Bota SensONE class) | 3.0 | 3.0 |
| 34 joint drive logic supplies (standby) | 34.0 | 34.0 |
| ~62 absolute encoders (AksIM-2 ~0.7 W, magnetic ~0.1 W) | 32.0 | 32.0 |
| 2x hand controllers + 20 micro-motor drivers (idle) | 6.0 | 6.0 |
| Foot boards, tactile front-ends, ToF sensors | 4.0 | 4.0 |
| Audio: mic array + amplifier | 2.0 | 10.0 |
| Cooling: 2 torso blowers + 4 leg-duct blowers | 10.0 | 24.0 |
| Face/status LEDs | 1.5 | 4.0 |
| BMS, PDU, contactor coil economised, DC-DC losses (~8 % of the above) | 17.0 | 25.0 |
| **Total electronics** | **222** | **337** |

## Actuators by scenario

| Scenario | Mean W | Peak W |
|---|---|---|
| W1 | 229 | 731 |
| W2 | 411 | 2301 |
| ST | 336 | 703 |
| SQ | 343 | 1034 |
| DS | 119 | 649 |
| SU | 367 | 664 |
| SL | 179 | 179 |
| AH | 236 | 236 |
| AL | 252 | 691 |
| AF | 131 | 692 |
| AS | 146 | 439 |
| TB | 79 | 133 |
| NK | 35 | 56 |
| SD | 97 | 720 |

## Operating modes (whole robot)

| Mode | Average W |
|---|---|
| Idle standing (perception on, double support) | **278** |
| Normal mixed (40 % stand, 30 % walk 0.8 m/s, 30 % manipulation) | **397** |
| Continuous walking 0.8 m/s | **451** |
| Demanding (fast walk 1.2 m/s / stairs, continuous) | **633** |

Simultaneous peak (electronics peak + worst actuator peak): **2638 W**.

## Battery options (16S)

| Cell | Config | Cells | Energy Wh | Usable Wh | Pack kg (est.) | Runtime normal (h) | Runtime walking (h) | Peak A | A/cell | Sag V |
|---|---|---|---|---|---|---|---|---|---|---|
| Molicel P50B | 16S5P | 80 | 1397 | 1219 | 7.4 | 3.1 | 2.7 | 51 | 10.1 | 2.1 |
| Molicel P50B | 16S6P | 96 | 1676 | 1463 | 8.9 | 3.7 | 3.2 | 51 | 8.5 | 1.7 |
| Molicel P50B | 16S7P | 112 | 1956 | 1707 | 10.3 | 4.3 | 3.8 | 51 | 7.2 | 1.5 |
| Molicel P50B | 16S8P | 128 | 2235 | 1951 | 11.8 | 4.9 | 4.3 | 51 | 6.3 | 1.3 |
| Molicel P50B | 16S9P | 144 | 2514 | 2195 | 13.3 | 5.5 | 4.9 | 51 | 5.6 | 1.2 |
| Molicel P45B | 16S5P | 80 | 1238 | 1081 | 7.3 | 2.7 | 2.4 | 51 | 10.1 | 2.2 |
| Molicel P45B | 16S6P | 96 | 1486 | 1297 | 8.7 | 3.3 | 2.9 | 51 | 8.5 | 1.9 |
| Molicel P45B | 16S7P | 112 | 1734 | 1514 | 10.2 | 3.8 | 3.4 | 51 | 7.2 | 1.6 |
| Molicel P45B | 16S8P | 128 | 1981 | 1730 | 11.6 | 4.4 | 3.8 | 51 | 6.3 | 1.4 |
| Molicel P45B | 16S9P | 144 | 2229 | 1946 | 13.1 | 4.9 | 4.3 | 51 | 5.6 | 1.2 |
