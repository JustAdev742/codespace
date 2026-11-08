# R4 — Compute, cameras, LiDAR, IMU, F/T, tactile, misc sensors (research notes)

Collected November 2026. Each row carries its source; "(sec)" = press/distributor; "NF" = not found.

## A. Compute

| | Jetson T5000 / AGX Thor Dev Kit | T4000 | AGX Orin 64GB |
|---|---|---|---|
| AI | 2070 TFLOPS FP4 sparse | 1200 TFLOPS FP4 sparse | 275 TOPS |
| GPU | 2560-core Blackwell, MIG | 1536-core | 2048-core Ampere |
| CPU | 14× Neoverse-V3AE 2.6 GHz | 12× V3AE | 12× A78AE |
| Memory | 128 GB LPDDR5X 273 GB/s | 64 GB | 64 GB LPDDR5 |
| Power | 40–130 W | 40–70 W | 15–60 W |
| Module | 100×87 mm, 699-pin B2B; 4×25GbE; HSB cameras; 16-lane CSI-2 | same footprint | 100×87 mm |
| Price (Jul 2026 increase, sec) | Kit US$5,499; T5000 US$4,999 | US$2,999 | US$2,999 |

Sources: nvidia.com/en-us/autonomous-machines/embedded-systems/jetson-thor/ · …/jetson-orin/ ·
cnx-software.com/2026/07/22/nvidia-increases-the-price-of-jetson-modules-and-devkits-by-up-to-101/ (sec) ·
jetsonhacks.com 2026-01-12 (T4000 availability, sec). **Thor dev-kit carrier has no CSI/GMSL** → third-party carrier
(support.stereolabs.com/hc/en-us/articles/36125536933015).

Carriers: **Seeed reComputer J601** 168×155 mm, 312 g, 8× GMSL2 (MAX96712), 4×10GbE, 4× CAN-FD, **19–48 V input**
(needs DC-DC from 13S), €775.95 (openelab.io); Connect Tech Gauntlet AGX301 (GMSL2/3 via add-ons, connecttech.com);
Auvidea X242 125×105 mm (sec).

Real-time computer: IgH 1.6 native drivers include **igc (i225/i226) kernels 5.14–6.12** and igb (i210)
(docs.etherlab.org/ethercat/1.6/doxygen/devicedrivers.html); no NXP FEC/ENETC native driver.
**UP Squared Pro 7000** (i3-N305 8C, 2× i226-IT, 101.6×101.6 mm, ~200 g, 12 V, ~35 W typ, US$249–499, sec);
UP Xtreme i14 (Core Ultra, i226-IT + i219, 67–80 W typ, US$749+, up-board.org datasheet); TI AM6442 (A53 + 4× R5F
+ PRU-ICSSG EtherCAT, ti.com/product/AM6442).

## B. Cameras

| Camera | Sensor | Baseline | Depth | FoV | I/F | Size/mass | Power | Price |
|---|---|---|---|---|---|---|---|---|
| **ZED X** | 2× 1920×1200 60 fps global shutter | 120 mm | 0.3–20 m (2.2 mm lens) | 110×80° | GMSL2 PoC, IMU, IP67 | 164×32×37 mm, 240 g | 1.0–1.5 W | US$599 |
| **ZED X Mini** | same | 50 mm | 0.1–8 m | 110×80° | GMSL2 | 94×32×37 mm, 150 g | 1.0–1.5 W | US$549 |
| **ZED X One GS** mono | AR0234 1920×1200 GS | — | — | 110×80° | GMSL2, IMU | 31×31×49 mm, 50 g | 0.7–0.9 W | €399 |
| Orbbec Gemini 335Lg | active stereo GS | 95 mm | 0.17–20 m (best 0.25–6) | 90×65° | GMSL2 FAKRA + USB3 | 124×29×36 mm, 164 g | ≤3.8 W avg | NF |
| Orbbec Gemini 335L (USB) | same | 95 mm | same | same | USB3, IP65 | 133 g | <3 W | US$413 RobotShop |
| RealSense D457 | GS | 95 mm | 0.6–6 m | 87×58° | GMSL, IP65 | 124×29×36 mm | NF | SGD 1,767 |
| OAK-D SR | 2× OV9782 GS | 20 mm | 0.3–1 m | — | USB | — | — | US$229 |
| TechNexion VLS-GM2-AR0234 | GS, 191° M12 fisheye | — | — | 191° | GMSL2 | — | — | US$188.50 |

Sources: stereolabs.com/products/zed-x · docs.stereolabs.com (GMSL2 power) · stereolabs.com zed-x-one-gs ·
orbbec.com/products/stereo-vision-camera/gemini-335lg/ · robotshop.com · intelrealsense.com D457 ·
checkout.luxonis.com/products/oak-d-sr · technexion.com/shop/serdes/gmsl/gmsl2/vls/uvls-gm2-ar0234-c-s191-ir/.
RealSense spun out of Intel July 2025 (intelcapital.com).

## C. LiDAR

| LiDAR | FoV | Range | pts/s | Mass | Power | Size | Price |
|---|---|---|---|---|---|---|---|
| **Livox Mid-360** | 360° × −7…+52° | 40 m @10 %, min 0.1 m | 200k | 265 g | 6.5 W (14 W heating), 9–27 V | 65×65×60 mm | US$979 (sec) |
| Hesai JT128 | 360° × 189° | 40 m @10 % | 1.15M | 265 g | ~4 W (sec) | Ø62.5×73 mm, IPX7 | US$1,080 (sec) |
| RoboSense Airy | 360° × 90° | 30 m @10 % | 1.72M | <240 g | <8 W | Ø60×63 mm | €1,320 (sec) |
| Unitree L2 | 360° × 96° | 15 m @10 % | 64k | 230 g | 10 W | 75×75×65 mm | US$419 |

Sources: livoxtech.com/mid-360/specs · hesaitech.com/product/jt128/ · robosense.ai/en/rslidar/Airy · unitree.com/L2.
Unitree G1 uses Mid-360 + D435i (westonrobot docs, sec).

## D. IMUs

| IMU | Gyro bias instab. | ARW / noise | Accel noise | Rate | I/F | Size, mass | Price |
|---|---|---|---|---|---|---|---|
| **MicroStrain 3DM-CV7-AHRS** | 1.5 °/h | 0.14 °/√h | 30 µg/√Hz | 1 kHz | UART, USB | 38×24×8.6 mm, 8.3 g, 0.23 W | NF (AU: Metromatics) |
| Xsens MTi-630 | 8 °/h | 0.007 °/s/√Hz | 60 µg/√Hz | 2 kHz | UART, CAN | 28×31.5×13 mm, 8.9 g | quote |
| VectorNav VN-100 | <10 °/h | 0.0035 °/s/√Hz | 0.14 mg/√Hz | — | — | 13 g | US$750 (sec) |
| ADIS16500 | 8.1 °/h | 0.29 °/√h | — | — | SPI | — | US$280 |
| **TDK IIM-46230** | 4.1 °/h | 0.15 °/√h | 70 µg/√Hz | — | SPI | 23×23×8.5 mm | A$480.72 (DigiKey AU) |
| TDK ICM-42688-P | — | 2.8 mdps/√Hz | 70 µg/√Hz | — | SPI | 2.5×3 mm | — |
| Bosch BMI088 | ±1 °/s offset | 0.014 °/s/√Hz | 175 µg/√Hz | 2 kHz | SPI | 3×4.5 mm | — |

Sources: metromatics.com.au 3DM-CV7 datasheet · xsens.com mti-630 · VectorNav brochure · analog.com ADIS16500 ·
invensense.tdk.com flyers + digikey.com.au IIM-46230 · bosch-sensortec.com BMI088.

## E. Force/torque

| Sensor | Fxy/Fz | Txy/Tz | Overload | Mass | Size | I/F | Price |
|---|---|---|---|---|---|---|---|
| ATI Mini45 | 145–580 / 290–1160 N | 5–20 N·m | 5.7–25× | 92 g | Ø45×15.7 | EtherCAT/Net F/T | NF |
| ATI Mini85 | 475–1900 / 950–3800 N | 20–80 N·m | 5.9–25× | 635 g | Ø85×29.8 | same | NF |
| Bota MiniONE | 80/100 N | 1.5 N·m | 3.5 N·m | 30 g | Ø30×23 | USB/UART 800 Hz | CHF 3,045 |
| **Bota SensONE T5** | 400/500 N | 5/8 N·m | 1000/2000 N; 12/15 N·m | 240 g | Ø48×32 | EtherCAT 3.8 kHz | CHF 5,617.50 |
| Bota SensONE T15 | 500/1200 N | 15/12 N·m | 2500/4000 N; 35/40 N·m | 240 g | Ø70×35 | EtherCAT | CHF 5,617.50 |
| **Bota PixONE T60** (through-hole) | 1800/4000 N | 60 N·m | 7200/12800 N; 160/200 N·m | ~436 g | Ø85×41.5 | EtherCAT | quote |
| Bota SensONE T80 | 2000/4000 N | 80 N·m | 7200/12800 N; 200 N·m | ~710 g | Ø100×48 | EtherCAT | quote |
| Robotiq FT 300-S | 300 N | 30 N·m | 500 % | 440 g | — | Modbus 100 Hz | quote |

Sources: ati-ia.com ft_models (Mini45, Mini85) · shop.botasys.com (minione, sensone, pixone-t60, sensone-t80) · robotiq.com.
TE FX29 compression load cell (50–500 N, I²C) is marked **not currently available** (te.com CAT-FSE0006).

## F. Tactile

PaXini PX6AX GEN3: normal 0–25 N, shear ±10 N, min 0.01 N, 1 kHz, IP68, fingertip 18×13×10 mm (paxini.com/cn/ax/gen3).
**ReSkin** (open source): 5× MLX90393 on 20×20 mm, ~400 Hz, 1 mm localisation, 2–3 mm thick, <US$30
(arXiv 2111.00071; github.com/raunaqbhirangi/reskin_sensor). GelSight Mini, XELA, Contactile: NF. TakkTile site defunct.

## G. Other

ST VL53L5CX 8×8-zone ToF, 4 m, I²C, US$19.95 Pololu (pololu.com/product/3417). ReSpeaker XVF3800 4-mic array
(AEC, DoA, beamforming, USB/I2S), US$60.99 (seeedstudio.com). EPCOS B57861S0103F045 10 k NTC −55…155 °C
(tdk-electronics.tdk.com NTC_Mini_sensors_S861.pdf). TI TMP117 ±0.1 °C I²C (ti.com/product/TMP117).
Fans/pumps/speakers: NF this pass.

## Researcher recommendation (adopted in docs/06 with changes noted there)

T5000 on Seeed J601 (needs DC-DC; T4000 drop-in fallback) · UP Squared Pro 7000 RT computer · ZED X head stereo ·
ZED X Mini hand-workspace stereo · 2× ZED X One GS / AR0234 fisheyes for VIO · Livox Mid-360 · MicroStrain CV7 pelvis IMU ·
IIM-46230 safety IMU · Bota PixONE T60 ankle F/T (or 4 load cells/foot) · Bota SensONE T5 wrist · PaXini fingertips,
ReSkin palms · VL53L5CX proximity · XVF3800 audio · B57861S NTC in windings, TMP117 on boards.
