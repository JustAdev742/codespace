# R2 — Servo drives, encoders, torque sensing, EtherCAT, safety (research notes)

Collected November 2026 from manufacturer pages and datasheets. Every row carries its
source. "(secondary)" = distributor/press figure, not manufacturer. Prices USD unless noted.
These notes feed `docs/05-electrical-architecture.md` and `docs/04-actuator-catalogue.md`.

## A. Off-the-shelf joint drives (fit against a 13S bus: 54.6 V full, regen clamp < 60 V)

| Drive | Supply op / max | Cont / peak | Size, mass | Bus | Feedback | STO | Price | 13S fit |
|---|---|---|---|---|---|---|---|---|
| **Novanta Everest S NET** | 8–80 V cont, 85 V 100 ms; rec. 12–72 V | 45 A @60 °C / 60 A 1 s | 34.5×26×14.25 mm, 23 g | EtherCAT / CANopen; 50 kHz current loop | Halls, 2× quadrature, 2× absolute (BiSS-C/SSI), **single-ended 3.3 V inputs** | 2 inputs SIL3/PLe Cat3 | ~$620 (secondary) | **Good** |
| Everest S Safe NET | 8–60 V | 45/60 A | 37×28.5×17.1 mm | EtherCAT + FSoE | — | STO, SS1, SLS | quote | marginal |
| Ingenia Capitan NET | 5–60 V | 10/20 A | 34.5×26×10.3 mm, 17.5 g | EtherCAT | dual BiSS-C, SSI, EnDat; 2× 16-bit diff. analog (load cell) | SIL3 PLe | n/f | marginal |
| Ingenia Denali NET | 5–60 V | 5/10 A | 33×17.6×6 mm, 3.9 g | EtherCAT | dual BiSS-C, SSI | SIL3 PLe | n/f | marginal |
| **Elmo Gold Twitter 100 V** (R50/100 … 10/100) | 10–95 V | R50/100: 50 A amplitude (35.3 A rms), peak 2× | 35×30×14.4 mm, 22.2 g | EtherCAT / CAN | BiSS, SSI, EnDat, inc., SinCos, resolver; dual loop | STO | quote | **Good** |
| Elmo Platinum Twitter R50/100, R70/100 | 95 V max | 50 / 70 A amplitude | 35×30×15.3 mm, 26 g | EtherCAT | Safe BiSS/EnDat | SIL3 PLe, FSoE | quote | **Good** |
| Synapticon Node 400/1000/2000 | 12–48 V, 60 V max | 13.2/33/36 A rms | Node 400 70×40×23 mm | EtherCAT | many | Safety variant | n/f | marginal |
| mjbots moteus x1 | 10–54 V | 25 A (62 A cooled) / 120 A | 56×56×10 mm, 23.7 g | CAN-FD 5 Mbps | SPI, I2C, quad, Hall, RS422 AksIM-2/BiSS-C | none | $175 | **No** |
| moteus n1 | 10–54 V | 9 A (26 A cooled) / 100 A | 46×46×8 mm | CAN-FD | as x1 | none | $149 | **No** |
| ODrive Pro | 12–56 V, 58 V max | 70 / 100 A | 51×64 mm, 35 g | CAN 2.0B | quad, Hall, SPI, SSI | none | $229 (sold out) | marginal |
| ODrive S1 | 12–48 V, 50.5 V max | 40 A | 66×50 mm | CAN 2.0B | | none | $149 | **No** |

Sources: drives.novantamotion.com/eve-net/product-description · novanta.com/robotics-automation/product/everest/ ·
ethercat.org/en/products/F0FB8DC54B734F2DA235E9094963EF8A.htm · drives.novantamotion.com/cap-net/product-description ·
drives.novantamotion.com/den-net/product-description · elmomc.com/product/gold-twitter/ · elmomc.com/product/platinum-twitter/ ·
synapticon.com/en/products/somanet-node · mjbots.com/products/moteus-x1 · mjbots.github.io/moteus/reference/hardware/ ·
shop.odriverobotics.com/products/odrive-pro

Notes: Elmo "Ic" is amplitude. moteus handles regen by flux braking (mjbots.github.io/moteus/troubleshooting/overvoltage-fault-34/).
Everest's shunt output is a 3.3 V logic signal that needs an external switch.

## B. Parts for a custom drive

| Part | Key data | Source |
|---|---|---|
| TI DRV8353R/RS gate driver | 9–100 V (102 V abs), 1 A/2 A gate, 3 CSAs, WQFN-40 6×6 | ti.com/product/DRV8353 |
| TI DRV8350 | 9–100 V, WQFN-32 5×5 | ti.com/product/DRV8350 |
| Infineon 6EDL7141 | 5.5–60 V — **insufficient margin** | infineon 6EDL7141 datasheet |
| Infineon ISC022N10NM6 | 100 V, 2.24 mΩ max, SuperSO8 | infineon.com ISC022N10NM6 datasheet |
| Nexperia PSMN2R0-100SSF | 100 V, 2.07 mΩ, LFPAK88 | nexperia.com/product/PSMN2R0-100SSF |
| TI DRV7167 (GaN, preview) | 100 V half-bridge, 60 A rms, 2.2 mΩ/FET, 7×4.5 mm | ti.com/product/DRV7167 |
| TI INA241A | −5…110 V CM, gains 10–200, PWM rejection | ti.com/product/INA241A |
| **TI F28P650DK** | 2× C28x 200 MHz (lockstep) + CLA, 3× 16-bit ADC, 150 ps HRPWM, CAN-FD, **on-chip EtherCAT ESC**, SIL2/ASIL-B HW | ti.com/product/TMS320F28P650DK |
| STM32G474 | 170 MHz M4, 5× 4 Msps ADC, HRTIM 184 ps, CORDIC/FMAC, 3× FDCAN | st.com |
| Infineon XMC4800 | 144 MHz M4 + on-chip ESC (8 FMMU/8 SM) | ethercat.org product page |
| Microchip LAN9252 | ESC, 2 PHYs, SPI; stocked by RS AU (1785221) | au.rs-online.com/web/p/ethernet-controllers/1785221/ |
| Beckhoff ET1100 | ESC, BGA128 | download.beckhoff.com ET1100 datasheet |
| **TIDA-010979** ref. design | 48 V 1 kW robot-joint drive, AM2612, 3× DRV7167 GaN, 2× BiSS-C (rotor + output), EtherCAT, Ø70 mm board with 15 mm bore | ti.com/tool/TIDA-010979 |
| TIDA-010992 | F28P65 humanoid-hand 6-axis controller, EtherCAT | ti.com/tool/TIDA-010992 |
| kubabuda/ecat_servo | open CiA-402 drive (LAN9252/AX58100 + STM32 + SOES) | kubabuda.github.io/ecat_servo |

## C. Absolute encoders

| Encoder | Resolution | Accuracy | Geometry | Interface | Price / source |
|---|---|---|---|---|---|
| **RLS AksIM-2** | ≤20 bit | ±0.004–0.020° after self-cal | ring ID 8–68 mm, OD 29–80 mm; 5 V 130–150 mA | BiSS-C, SSI, async (RS422) | MB049 readhead ≈ $199 (DigiKey marketplace) · rls.si/eng/aksim-2-off-axis-rotary-absolute-encoder |
| RLS Orbis | ≤14 bit | ±0.25° | through-hole ID 12–30 | BiSS-C, SPI, SSI… | rls.si/eng/orbis-true-absolute-rotary-encoder |
| iC-Haus iC-PZ2656 | ≤22 bit | ±1 LSB @18 bit | reflective disc ≤Ø45 | BiSS/SSI/SPI | ichaus |
| Netzer DS-25 | 17–21 bit | ±0.020° | OD25/ID6/H7, 10 g | SSI, BiSS-C | netzerprecision.com/products/ds-25/ |
| Netzer DS-58 | 18–20 bit | ±0.010° | OD58/ID20/H10, 30 g | SSI/BiSS-C | DS-58 product guide |
| MagnTek MT6835 | 21 bit | ±0.07° after self-cal (distributor) | chip | SPI, ABZ | lcsc.com C2932578 |
| MPS MA732 | 14 bit | — | chip | SPI, ABZ | farnell datasheet |

## D. Torque sensing

| Item | Data | Source |
|---|---|---|
| FUTEK TFF400 reaction sensor | 0.04–56 N·m, through-hole, 300 % overload; AU distributor **Metromatics** | futek.com TFF400 |
| XJCSENSOR X-ST207-D | Ø83×9 mm, 98 N·m, 200 % overload | knoxlabs.com |
| Bota SensONE T15 | 6-axis, EtherCAT, $7,646 (Vention) | vention.io |
| HBK XY21/XY41, VY4 | shear/torsion gauges, 350 Ω | hbkworld.com Y-series |
| Vishay CEA-06-187UV-350 | shear pattern, ≈ $139 ea | rcfreelance.com |
| TI ADS1262 | 32-bit ΔΣ, ≤38.4 kSPS, PGA 1–32 | ti.com/product/ADS1262 |

## E. EtherCAT masters

| Master | Licence | RT | Distributed clocks |
|---|---|---|---|
| IgH EtherLab 1.6 | GPLv2 | RTAI, Xenomai, PREEMPT_RT, native NIC drivers | full API (ecrt_slave_config_dc, sync_reference_clock, sync_slave_clocks) |
| SOEM | GPLv3 / commercial | Linux, Windows | — |
| acontis EC-Master | commercial | Linux RT, polling drivers | DC + DCM, cable redundancy |

Sources: gitlab.com/etherlab.org/ethercat · github.com/OpenEtherCATsociety/SOEM · acontis.com/en/ethercat-master.html.
Published cycle/jitter figures for ~40 slaves: not found (to be measured in commissioning, docs/11 §E).
CAN-FD datapoint: mjbots pi3hat — 5 CAN-FD ports, "12 qdd100 servos at 1 kHz" (≈3 joints per bus at 1 kHz).

## F. Safety

| Item | Data | Source |
|---|---|---|
| TI TMS570LC4357 | 2× R5F lockstep 300 MHz, 4 MB flash, 4× CAN, EMAC; TÜV: SIL3-capable | ti.com/product/TMS570LC4357 |
| **FORT Wireless E-Stop Pro** | SIL3 (IEC 61508, exida), BLE, 200 m LOS, 12 h battery, **RCM (AU) certified** | fortrobotics.com/wireless-e-stop-pro |
| FORT Wireless E-Stop | PLd Cat3, 900 MHz (check AU legality) or 2.4 GHz | fortrobotics.com/wireless-emergency-stop |
| Tele Radio Panther | 2.4 GHz, ≤700 m, heartbeat auto-stop, PLd Cat3 transmitters, AU office | tele-radio.com/products/panther/ |

Response times not published for any wireless e-stop → measure (docs/11).

## Researcher recommendation (adopted with modification — see docs/05 §4)

Buy PCB-mount EtherCAT drive modules (Novanta Everest S NET primary; Elmo Gold Twitter 100 V
alternative) on custom carrier boards; AksIM-2 on output, AksIM-2 or Netzer on motor; IgH master
on PREEMPT_RT; FORT E-Stop Pro → dual-channel safety relay → drive STO, supervised by TMS570.
Custom F28P65x drive (TIDA-010979 architecture) as later cost-down for low-power joints.
Watch-out: Everest feedback inputs are single-ended 3.3 V; AksIM-2 BiSS-C is RS-422 → carrier needs
differential receivers and a 5 V / 150 mA supply per encoder.
