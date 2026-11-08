# R5 — Dexterous hands, micro-actuation, tactile, fingertip materials (research notes)

Collected November 2026. Source IDs at end of each section. "(secondary)" = press/aggregator.

## A. Commercial and open hands

| Hand | Architecture | DOF | Mass | Force | Speed | Sensors / I/F | Price |
|---|---|---|---|---|---|---|---|
| Inspire RH56DFX [1,2] | linkage fingers, 6 micro linear servos in hand, power-off self-locking | 6 DOA / 12 | 540 g | tip 10–15 N | fingers 260°/s, thumb flex 70°/s | position + force; RS485; 12–48 V | €4,980 incl. VAT (Generation Robots) |
| **Inspire RH56DFTP** [4,5] | same family | 6 / 12 | 790 g | 30 N per finger | fingers 200°/s, thumb flex 80°/s | 17 tactile + 6 force; CAN/ModbusTCP or RS485 | £5,181.72 single (RoboSavvy) |
| Inspire RH56F1/F2 [6,7] | all-metal skeleton | 6 / 12 | 605–630 g | tip ≥10 N, thumb ≥12–15 N, 30 kg passive | close ≤0.8 s | palm tactile; EtherCAT + RS485/CAN-FD 1 kHz; 18–60 V | ~US$8.8k (quote) |
| PSYONIC Ability Hand [8,9] | 6 BLDC in hand | 6 | 440–490 g | power 78 N, key 17 N, pinch 8 N | 0.2 s close (sec) | 30 FSR, 6 encoders, IP64 | on request |
| Shadow Dexterous Hand [10] | tendon, 20 motors | 24 (20 act.) | 4.3 kg | — | — | >100 sensors, EtherCAT | on request |
| Wuji Hand [12] (sec) | in-finger direct-drive micro joints | 20 | <600 g | ~15 N tip | — | USB/RS485/EtherCAT | US$16k |
| Linker Hand O6 [14] | worm gear | 6 + 5 passive | 370 g | 33 N fingers, 130 N five-finger | — | CAN/RS485 | US$1,499 |
| Unitree Dex5-1 [17] | coreless motor + reducer + encoder | 20 (16 act.) | 1.1 kg | 10 N tip | — | 94 pressure sensors | — |
| Schunk SVH [18] | 9 drives | 20 joints | 1.3 kg | — | — | 24 V | — |
| Tesla Optimus (sec) [20,21] | 2022 metal tendons; Gen-3 patents: 25 forearm linear actuators driving tendons | 11 → 22 | — | — | — | — | — |
| LEAP Hand [24] | Dynamixel at each joint | 16 | 595 g, ~30 % oversize | pull-out 19.5 N | — | — | ~US$2k |
| ORCA [26] | tendon, 17 Dynamixels below wrist, "poppable" overload joints | 17 | ~1.2 kg | 4-finger payload 10.5 kg | — | FSR tips | <CHF 2k |

[1] en.inspire-robots.com/product/rh56dfx/ [2] generationrobots.com 404369 [4] robosavvy.co.uk/rh56dftphands.html
[5] robotshop.com inspire-rh56dftp [6] en.inspire-robots.com/product/rh56f1/ [7] knoxlabs.com [8] psyonic.io/ability-hand
[9] knoxlabs.com psyonic [10] shadowrobot.com/dexterous-hand-series/ [12] humanoid.guide/product/wuji-hand/
[14] aifitlab.com linker-hand-o6 [17] unitree.com/Dex5-1 [18] schunk.com SVH [20] notateslaapp.com (sec) [21] basenor.com (sec)
[24] arXiv 2309.06440 [26] arXiv 2504.04259

## B. Architecture literature

| Source | Finding |
|---|---|
| **Kim et al., ILDA hand, Nature Communications 2021** (pmc.ncbi.nlm.nih.gov/articles/PMC8671524/) | 15 × **maxon DCX 8 M + GPX 8 16:1 + ENX 8 MAG** each driving a **KSS SR0401K Ø4 × 1 mm ball screw** in the palm; MCP 2-DOF parallel mechanism, PIP crossed four-bar, DIP coupled four-bar; **fingertip 34 N bent / 28 N straight; payload 18 kg; 1.1 kg; 218 mm long**; joint speed 53–103 °/s; fingertip 6-axis F/T. |
| LEAP Hand, RSS 2023 (arXiv 2309.06440) | joint-servo hand 30 % oversize; pull-out 19.5 N (human 26.5 N). |
| ORCA (arXiv 2504.04259) | tendons: ~2,000 cycles no slack; skin wear 2–4k cycles; wires snapped 4.5–7k cycles; pop-out joints for overload. |
| MM-Hand (arXiv 2604.17245) | tendon-sheath friction T = T0·e^{μφ}: fingertip ≈33 N with 0.1 m sheath vs ≈25 N with 1 m sheath (≈24 % loss). |
| Fabisch et al. 2025 (arXiv 2508.05415) | survey: tendons need tensioning, have hysteresis; linkages stiff/precise but add hand mass; gears vulnerable to impact. |
| Helix Linear | lead screws 20–80 % efficient, ball screws ≥90 %; <50 % efficiency ⇒ not back-drivable (self-locking). |

## C. Micro-actuation

| Part | Mass | Cont. torque | Stall | No-load | η | Price |
|---|---|---|---|---|---|---|
| maxon DCX 10 L 9 V | 11 g | 2.05 mN·m | 4.8 | 12,000 rpm | 73 % | €103.89 |
| **maxon DCX 12 L 9 V** | 16 g | 4.12 | 11.9 | 8,810 | 82 % | €142.31 |
| maxon DCX 16 L 18 V | 42 g | 10.9 | 37.3 | 6,390 | 82 % | €155.68 |
| maxon ECX SPEED 13 M 36 V | 24 g | 4.05 | 25.4 | 44,300 | 80 % | €273.47 |
| maxon ECX FLAT 22 L 18 V | 32 g | 28.8 | 127 | 12,000 | 83 % | €188.20 |
| Faulhaber 1226 B 012 B | 13 g | 1.97 | 8.99 | 27,400 | 72 % | — |
| Faulhaber 1524 SR 012 | 18 g | 2.82 | 6.92 | 9,850 | 80 % | — |
| maxon GPX 16 1-stage 3.9:1 | 20 g | 0.2 N·m cont | — | — | 90 % | €86.73 |
| maxon GPX 10 4-stage 256:1 | 8 g | 0.15 N·m | — | — | 65 % | €138.52 |
| Faulhaber 12/4 metal | 12–21 g | 0.3 / 0.45 N·m | — | — | 90 % (4:1) … 60 % (256:1) | — |
| **KSS miniature ball screws** | Ø3 (0.5/1 lead), **Ø4 × 1 (SR0401/SR0401K)**, Ø4 × 2, Ø6 × 1/2/6/10 | PSR0401 Ca 560 N, C0a 790 N | | | | — |

Sources: maxongroup.com product pages (DCX10L01EBSL601, DCX12L01EBKL604, DCX16L01EBSL645, ECXZ13M1VF40N1IL1D604A,
ECXA22LZF50E6ILACO1Y546A, GPX16AAKLSL03D9CPLW, GPX10A4ST0256); faulhaber.com EN_1226_B_FMM.pdf, EN_1524_SR_DFF.pdf,
EN_12-4_FMM.pdf; kssballscrew.com/us/pdf/catalog/03_v13.3_bs_s.pdf.

Angle sensors: TI TMAG5273 3D Hall + CORDIC, I²C, SOT-23-6 (ti.com/product/TMAG5273); Melexis MLX90393 (melexis.com);
ams AS5600 0.4° accuracy; Faulhaber IEH2-4096 encoder (+1.4 mm).

**Australian supply:** maxon has a subsidiary — **maxon motor Australia Pty Ltd, Mt Kuring-Gai NSW** (maxongroup.com/en-au).
(Motion Dynamics is *not* maxon's distributor.) Faulhaber: **Erntec** (erntec.com.au, +61 3 9756 4000); RS AU stocks some.

## D. Tactile

| Option | Principle | Range / resolution | Size | Cost |
|---|---|---|---|---|
| **Contactile 3D Force Button** (Sydney) | 3-axis force under silicone | Z 0–10/20/50 N, XY ±3/6/15 N, res. ±0.02–0.08 N, ≤1 kHz | **Ø10/12/14 × 3.6 mm**, I²C/SPI | on request |
| Contactile PapillArray v2 | optical 3×3 pillars | per-pillar 3D force, slip | 24×30.6×8.6 mm | on request |
| PaXini PX6AX GEN4 | "6D" tactile | 0–25 N normal, ±10 N shear, 1 kHz | tip 15×10×7 mm | store |
| ReSkin | 5× MLX90393 + magnetised skin | 1 mm localisation, 400 Hz | 20×20 mm | <US$30 |
| **AnySkin** (arXiv 2409.08276) | Dragon Skin 10 + magnetic particles over magnetometers | 92 % slip detection; skins swappable without retraining | slip-on | low |
| Bosch BMP390 barometer | potted pressure sensor | 0.02 Pa noise, 200 Hz | 2×2×0.75 mm | low |

Sources: contactile.com 3DFBS datasheet Rev 3 (2026-09) and PapillArray spec; paxini.com/cn/ax/gen4; arXiv 2111.00071; arXiv 2409.08276;
bosch-sensortec.com BMP390.

## E. Fingertip elastomers (Smooth-On)

Ecoflex 00-30 (Shore 00-30, 900 % elong.), Dragon Skin 10 Medium (10A, 102 pli tear), **Dragon Skin 20 (20A, 550 psi,
120 pli)**, Dragon Skin 30 (30A), VytaFlex 40 urethane (40A, 522 psi, 82 pli) — smooth-on.com product pages.

## Researcher recommendation

Custom: palm-housed linear actuators driving coupled four-bar fingers (Inspire/ILDA pattern); Ø10–13 mm motor + ~4:1
planetary + KSS Ø4×1 ball screw; MCP magnetic angle sensor per finger; Contactile Ø10 3D force button per fingertip;
AnySkin/ReSkin palms; cast Dragon Skin 20–30 / VytaFlex 40 snap-on caps; overload by breakaway + current limit.
Commercial fallback: Inspire RH56DFTP (thumb flex 80°/s — check); RH56F2 for EtherCAT.
