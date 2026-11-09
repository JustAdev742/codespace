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
| 26 rotary joint drive logic supplies (standby) | 26.0 | 26.0 |
| 33 AksIM-2 absolute encoders (~0.7 W) + 19 magnetic motor encoders (~0.1 W) | 25.0 | 25.0 |
| 2x hand controllers + 26 micro-motor drivers (idle) + 2 palm cameras | 9.0 | 9.0 |
| Foot boards, tactile front-ends, ToF sensors | 4.0 | 4.0 |
| Audio: mic array + amplifier | 2.0 | 10.0 |
| Cooling Mk II: 2 coolant pumps + radiator fans + electronics blower | 35.0 | 60.0 |
| Face/status LEDs | 1.5 | 4.0 |
| BMS, PDU, contactor coil economised, DC-DC losses (~8 % of the above) | 17.0 | 25.0 |
| **Total electronics** | **235** | **361** |

## Actuators by scenario

| Scenario | Mean W | Peak W |
|---|---|---|
| W1 | 219 | 864 |
| W2 | 404 | 2745 |
| ST | 337 | 773 |
| SQ | 338 | 1199 |
| DS | 126 | 774 |
| SU | 345 | 697 |
| SL | 137 | 137 |
| AH | 248 | 248 |
| AL | 310 | 971 |
| AF | 127 | 703 |
| AS | 121 | 410 |
| TB | 57 | 119 |
| NK | 35 | 56 |
| CW | 437 | 718 |
| AO | 116 | 267 |
| SD | -21 | 1061 |

## Operating modes (whole robot)

| Mode | Average W |
|---|---|
| Idle standing (perception on, double support) | **268** |
| Normal mixed (40 % stand, 30 % walk 0.8 m/s, 30 % manipulation) | **402** |
| Continuous walking 0.8 m/s | **453** |
| Demanding (fast walk 1.2 m/s / stairs, continuous) | **638** |

Simultaneous peak (electronics peak + worst actuator peak): **3106 W**.

## Battery options (16S)

| Cell | Config | Cells | Energy Wh | Usable Wh | Pack kg (est.) | Runtime normal (h) | Runtime walking (h) | Peak A | A/cell | Sag V |
|---|---|---|---|---|---|---|---|---|---|---|
| Molicel P50B | 16S5P | 80 | 1397 | 1219 | 7.4 | 3.0 | 2.7 | 60 | 11.9 | 2.4 |
| Molicel P50B | 16S6P | 96 | 1676 | 1463 | 8.9 | 3.6 | 3.2 | 60 | 10.0 | 2.0 |
| Molicel P50B | 16S7P | 112 | 1956 | 1707 | 10.3 | 4.2 | 3.8 | 60 | 8.5 | 1.7 |
| Molicel P50B | 16S8P | 128 | 2235 | 1951 | 11.8 | 4.9 | 4.3 | 60 | 7.5 | 1.5 |
| Molicel P50B | 16S9P | 144 | 2514 | 2195 | 13.3 | 5.5 | 4.8 | 60 | 6.6 | 1.4 |
| Molicel P45B | 16S5P | 80 | 1238 | 1081 | 7.3 | 2.7 | 2.4 | 60 | 11.9 | 2.6 |
| Molicel P45B | 16S6P | 96 | 1486 | 1297 | 8.7 | 3.2 | 2.9 | 60 | 10.0 | 2.2 |
| Molicel P45B | 16S7P | 112 | 1734 | 1514 | 10.2 | 3.8 | 3.3 | 60 | 8.5 | 1.9 |
| Molicel P45B | 16S8P | 128 | 1981 | 1730 | 11.6 | 4.3 | 3.8 | 60 | 7.5 | 1.6 |
| Molicel P45B | 16S9P | 144 | 2229 | 1946 | 13.1 | 4.8 | 4.3 | 60 | 6.6 | 1.5 |
