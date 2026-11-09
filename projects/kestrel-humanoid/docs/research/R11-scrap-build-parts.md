# R11 — Scrap-build parts: salvaged and AliExpress actuators, drivers, mechanics, batteries (research notes)

Collected 9 November 2026 for an ultra-low-cost, hand-tools-only full-size humanoid (A$500 simple / A$1000 better).
Tools assumed: drill press, hacksaw, taps, soldering iron. No CNC, no 3D printer.

**Confidence legend.**
- **V**: the number was on the cited page and I read it there (fetched, or for PDFs, text extracted).
- **Vs**: the number was in the search-engine summary of the cited page. I could not open the page itself, because Gumtree, eBay, Bunnings, Kmart and Facebook all return HTTP 403 to automated fetches.
- **E**: an estimate or derived value. The reason is given every time.

**Currency.** AliExpress search pages showed prices in **USD**. I convert them at **1 USD = A$1.44**, from AUD/USD 0.6966 on 14 Oct 2026 ([30rates](https://30rates.com/australian-dollar-aud-usd-forecast), Vs). AliExpress listing prices exclude the 10% GST charged at checkout on low-value imports to Australia, and they may exclude shipping. **E**: I did not re-check the GST policy this session.

**AliExpress caveat.** Many search results show **US$1.09**. That is a "New shoppers" bait price or the price of the cheapest variant, not the unit price. Where a listing showed its "save $X" figure, I take regular price = $1.09 + X. Otherwise I quote non-deal listings only.

---

## 1. Hoverboard hub motors (6.5", 36 V, "350 W") as actuators

### 1.1 Motor constants and torque

| Item | Spec | Source | Conf. |
|---|---|---|---|
| Pole pairs | **15** (30 magnets) | [ODrive hoverboard guide](https://docs.odriverobotics.com/v/0.5.5/hoverboard.html) | V |
| Slots | 27-slot / 30-pole | [electric-skateboard.builders teardown](https://electric-skateboard.builders/t/rewinding-of-hoverboard-motor-looking-for-advices/76373?page=3) | Vs |
| Kv | **≈16 rpm/V**, the "typical value" if you cannot measure it | [ODrive guide](https://docs.odriverobotics.com/v/0.5.5/hoverboard.html) | V |
| Kv (another unit) | 17 rpm/V on a dyno | [esk8.news dyno database](https://forum.esk8.news/t/esk8-motor-dyno-results-database/35617) | Vs |
| Kt formula | ODrive config uses `torque_constant = 8.27 / Kv`, so Kv 16 gives **0.52 N·m/A** | [ODrive guide](https://docs.odriverobotics.com/v/0.5.5/hoverboard.html) | V (formula); 0.52 is derived |
| Kt (measured) | **0.45 N·m/A**, "little cogging torque" | [XRL paper, arXiv 2007.00872](https://arxiv.org/pdf/2007.00872) | V |
| Phase resistance | **0.179 Ω** (ODrive calibration), L = 0.336 mH | [ODrive guide](https://docs.odriverobotics.com/v/0.5.5/hoverboard.html) | V |
| Phase resistance (others) | 0.281 Ω (dyno); about 0.17 Ω (teardown V/I test) | [esk8 dyno](https://forum.esk8.news/t/esk8-motor-dyno-results-database/35617), [teardown](https://electric-skateboard.builders/t/rewinding-of-hoverboard-motor-looking-for-advices/76373?page=3) | Vs |
| **Peak torque, measured** | **22.5 N·m at 50 A, "with no saturation"** (driven by a RoboteQ HBL2360, 50 A continuous / 75 A peak) | [XRL paper](https://arxiv.org/pdf/2007.00872) | V |
| Hobby lever test | "Highest reasonable" 12 N·m at 12 V and **13.9 A DC supply current**; 14 N·m made it squeak. Rig: Nucleo F303 + IHM08M1 running FOC, 0.5 m lever and scale | [xsimulator.net post](https://xsimulator.net/community/goto/post?id=174858) | V |
| Continuous torque | **About 5–7 N·m.** **E**: no published rating exists. Derivation: copper loss ≈ 1.5·R·I². If a sealed hub sheds 40–60 W at stall (assumed), I ≈ 12–15 A, which gives about 5.5–6.8 N·m at 0.45 N·m/A. This matches the firmware's default 15 A limit | derived | E |
| No-load speed | 16 × 36 V ≈ **576 rpm** (about 670 rpm at 42 V) | derived from Kv | E |
| Mass | **2.2 kg** each (XRL); 3.1 kg (Parallax 6.5" 36 V hub, 250–350 W, 3 halls); 3 kg (replacement-wheel listing) | [XRL](https://arxiv.org/pdf/2007.00872), [Parallax](https://www.parallax.com/?p=16596), [Shopabunda](https://www.shopabunda.com/products/6-5-inch-self-balancing-scooter-motor-wheel-with-tire-self-balance-2-wheels-unicycle-hover-board-motor-replacement) | V / Vs / Vs |
| Mass without tyre | **About 1.7–1.9 kg.** **E**: not found. The XRL authors only say "much of the weight can be reduced by removing excess material used to encapsulate the tire" | — | E |
| Hall sensors | **Yes**: 3 halls with a 5 V supply. ODrive gets 6 states per pole pair, so cpr = 90; it recommends about 22 nF filter capacitors | [ODrive guide](https://docs.odriverobotics.com/v/0.5.5/hoverboard.html), [Parallax](https://www.parallax.com/?p=16596) | V |
| Bearings | Built-in deep-groove bearings "withstand large moments when cantilevered by its mounting shaft" | [XRL](https://arxiv.org/pdf/2007.00872) | V |
| New price, AliExpress | US$38.49–38.89 for a single 6.5" 36 V 250/350 W wheel motor, **about A$55–56** before GST | [AliExpress search](https://www.aliexpress.com/w/wholesale-hoverboard-motor.html) | V |
| New price, 2020 | "replacements can be purchased for 20 USD each" | [XRL](https://arxiv.org/pdf/2007.00872) | V |

**Sanity check of the hobby lever test.** 12 N·m at 0.45 N·m/A needs about 27 A of *phase* current. Copper loss is then 1.5 × 0.18 × 27² ≈ 190 W. The DC input was 12 V × 13.9 A = 167 W. The two figures agree. **At stall, phase current is much higher than DC supply current**, so a DC ammeter cannot give you Kt.

### 1.2 Firmware: EmanuelFeru/hoverboard-firmware-hack-FOC

| Item | Value | Source | Conf. |
|---|---|---|---|
| Control types | FOC (default), SIN, COM | [config.h](https://raw.githubusercontent.com/EmanuelFeru/hoverboard-firmware-hack-FOC/main/Inc/config.h) | V |
| **Torque mode** | **Yes.** `TRQ_MODE`: "the input torque target is realized"; a target of 0 freewheels. "SPD_MODE and TRQ_MODE are only available for CTRL_FOC". The default is `VLT_MODE`, so change `CTRL_MOD_REQ` | [README](https://github.com/EmanuelFeru/hoverboard-firmware-hack-FOC), [config.h](https://raw.githubusercontent.com/EmanuelFeru/hoverboard-firmware-hack-FOC/main/Inc/config.h) | V |
| Default motor current limit | `I_MOT_MAX` = **15 A** ("Maximum single motor current limit") | config.h | V |
| Default DC-link limit | `I_DC_MAX` = **17 A** (keep it 2 A above I_MOT_MAX) | config.h | V |
| Speed limit | `N_MOT_MAX` = 1000 rpm | config.h | V |
| Field weakening | Off by default; `FIELD_WEAK_MAX` 5 A ("Up to 10A has been tested using 10" wheels") | config.h | V |
| **Maximum current** | **No hard maximum is documented** in config.h or the README. **E**: the ceiling is set by the board's shunt/ADC scaling and its MOSFETs. Raising I_MOT_MAX into the 20–30 A range is plausible but unverified for these boards | — | E |
| Interfaces | **USART** (115200 baud default on USART2), **ADC** (2 pots), **PPM**, **PWM**, **iBUS**, Nunchuk; USART2 and USART3 both accept UART/PWM/PPM/iBUS | [README](https://github.com/EmanuelFeru/hoverboard-firmware-hack-FOC), config.h | V |
| Battery setting | `BAT_CELLS` = 10 ("Normal Hoverboard battery: 10s"); beeps at 3.60 V/cell, fast beeps at 3.50 V, undervoltage cut-off at 3.37 V | config.h | V |
| **Board voltage limit** | **Not stated** anywhere in the firmware. **E**: the boards are built for 10S (42 V full charge). Running above 42 V needs the MOSFET and capacitor ratings read off your own board | — | E |
| MCU | STM32F103RCT6, or GD32F103RCT6 on some boards (also supported) | [README mirror](https://git.ctdo.de/interfisch/hoverboard-firmware-hack-foc-serial-esc/blame/commit/70c385e4a1755d53e137c2839f6a2420a4db39ef/README.md) | Vs |
| Other features | Detects unconnected halls, blocked motor and defective MOSFET; README warns: do not power the board from the programmer's 3.3 V | same | Vs |

**What this means for a robot.** One board drives **two** motors in closed-loop torque mode at up to 15 A each by default (about 6.8 N·m each). A host such as an ESP32 commands it over UART. Joint angle has to come from an external encoder (an AS5600 or MT6701 on the joint, section 3), because hall resolution is only 90 counts per revolution (4° mechanical per count).

### 1.3 Second-hand hoverboards in Australia

| Item | Price / spec | Source | Conf. |
|---|---|---|---|
| Hover Blade, used, working, 2 chargers (Sydney) | **A$75** sold (was A$200) | [FB Marketplace item](https://www.facebook.com/marketplace/item/2093284847844850/) | Vs |
| Two hoverboards sharing one charger | **A$70** with charger and bag, **A$50** without charger | [Gumtree "hoverboard used"](https://www.gumtree.com.au/s-sport-fitness/hoverboard+used/k0c18314) | Vs |
| Vavid Street 6.5", with charger and box | A$125 | [Gumtree hoverboard](https://www.gumtree.com.au/s-sport-fitness/hoverboard/k0c18314) | Vs |
| Razor Hovertrax, with charger | A$150 ono | [Gumtree hoverboards](https://www.gumtree.com.au/s-sport-fitness/hoverboards/k0c18314) | Vs |
| Near-new (one test ride), Mt Barker SA | A$250 ono | same | Vs |
| **Faulty / "for parts"** | **A$20–50.** **E**: no for-parts listing was visible, because Gumtree and eBay block automated access. Working boards with a charger go for A$50–75, so broken ones should cost less | — | E |
| New-board price bands (brand blog, weak evidence) | A$150–300 basic, A$300–600 mid-range | [gyroorboard blog](https://gyroorboard.com/it/blogs/learn-with-gyroor/how-much-is-a-hoverboard-in-australia-a-complete-price-guide) | Vs |

**What you get from one board.** 2 × hub motors with halls, 1 mainboard (or, on older designs, 2 split boards; not all are supported by the firmware), a **36 V 10S2P 18650 pack of 4.4 Ah / 158 Wh** (42 V full, about 26 V cut-off, typically 15–20 A continuous), and a **42 V 2 A charger**. Pack specs: [batteryworldonline](https://batteryworldonline.com/products/replacement-battery-for-balance-scooter-board-36v-4-4ah-10s2p), [streetsaw](https://www.streetsaw.com/products/hoverboard-battery-replacement) (Vs). Some packs are 10S1P, so check yours. **Safety:** the ACCC has linked house fires to cheap hoverboard packs and chargers ([Gumtree safety page](https://help.gumtree.com.au/AU/articles/en_US/KB_Article/Safety-information-about-Hoverboards-and-related-electronics-AU/), Vs). Test every salvaged pack before using it.

### 1.4 Projects that used hoverboard motors

| Project | What | Link | Conf. |
|---|---|---|---|
| **XRL, Extra Robotic Legs (MIT, 2020)** | Load-carrying legs. Hoverboard motors with **chain drives into a spiral-mitre-gear differential**, so two motors share each 2-DoF joint, with gearing under 10:1. Needed: knee 168 N·m, ankle 115.6 N·m, hip 102.8 N·m | [arXiv 2007.00872](https://arxiv.org/pdf/2007.00872) | V |
| ODrive "Project HoverArm" | Robot arm on hoverboard motors with ODrive | [ODrive forum](https://discourse.odriverobotics.com/t/project-hoverarm/441/8) | Vs |
| ODrive "Project RoboDog" | Quadruped discussion. The builder warns that a leg "would be massive" with a radially large motor like a hoverboard motor | [ODrive forum](https://discourse.odriverobotics.com/t/project-robodog/6330) | Vs |
| HardwareX project (Montanuniversität Leoben) | ODrive calibration script for hoverboard motors (Kv 16, Kt = 8.27/Kv) | [git.cps.unileoben.ac.at](https://git.cps.unileoben.ac.at/Linus/HardwareX) | Vs |
| Projects linked from the firmware README | ROS `hoverboard-driver`, wheelchair controller, OneWheel | [README](https://github.com/EmanuelFeru/hoverboard-firmware-hack-FOC) | V |

I found no complete humanoid built on hoverboard motors.

---

## 2. Cordless drill motor + gearbox as an actuator

### 2.1 Budget 18 V drills

| Item | Spec | AUD | Source | Conf. |
|---|---|---|---|---|
| **Ozito PXC PXDDS-180** drill driver, skin only | 2-speed, **0–400 / 0–1,500 rpm** no load, **40 N·m max**, 21 clutch settings, 13 mm chuck, 1.07 kg | **A$49.98** (Bunnings) | specs: [Ozito PXDDS-180](https://www.ozito.com.au/p/3000168-PXDDS-180/), [Ozito spec PDF](https://d2c5rvsfjg2eub.cloudfront.net/asset/208244749100/document_u6fsbj11k56epee9n263e9nu46/3000168_11017_001_EN_PXDDS_180_EX_AUS.pdf); price: [buywisely](https://buywisely.com.au/au/product/ozito-pxc-18v-drill-driver-skin-only) | Vs |
| Ozito PXDDGK-600 compact drill | 0–350 / 0–1,250 rpm, 40 N·m | (kit) | [manualshive](https://manualshive.com/manual/ozito/pxddgk-600/1666253) | Vs |
| Aldi Ferrex 20 V brushless drill skin | — | **A$49.99** (past special buy) | [OzBargain](https://ozbargain.com.au/node/702376) | Vs |
| Ferrex Pro drill | 400 / 1,400 rpm | A$169 (kit) | [Choice](https://www.choice.com.au/products/home-improvement/building-and-renovating/tools/ferrex-pro-pt190101) | Vs |
| Katana 18 V hammer drill skin | 1,650 rpm high gear | A$79.99–89.00 | [toolswarehouse](https://toolswarehouse.com.au/products/katana-220001-18v-cordless-hammer-drill-skin-only) | Vs |
| **Kmart Anko 18 V drill** | **Not found.** kmart.com.au returns 403 and search found no listing | **E: A$29–49**, assumed from Kmart's usual tool pricing | — | E |
| **Motor inside a budget 18 V brushed drill** | **E: a 550-size can (RS-550 class)** in compact drill/drivers, and 755/775 class in larger ones. Mabuchi's own catalogue lists RS-775WC and RS-755WC as "Cordless Power Tools: Drill & Screwdriver" motors. I did not open an Ozito to confirm | — | [Mabuchi catalogue](https://mikrocontroller.net/attachment/641472/Mabuchi_Motors_Complete.pdf) | E |
| Used drill, dead battery (Gumtree/Marketplace/tip shop) | **E: A$5–25.** Marketplace pages are blocked, and PXC skins cost A$50 new | — | — | E |
| Gearbox ratio | **E: ≈ 50:1 in low gear** (about 20,000 rpm motor ÷ 400 rpm) | — | derived | E |

**Caution on the 40 N·m figure.** It is the drill's maximum torque on a hard joint, a brief peak. Continuous output from a drill gearbox is much lower: **E about 10–15 N·m**, limited by motor heating and plastic ring gears. Drills are also poorly back-drivable. The clutch is useful as a mechanical torque limiter.

### 2.2 Motor datasheets (Mabuchi, from the catalogue PDF, text extracted)

| Model | Nominal V | No-load rpm / A | At max efficiency | **Stall torque** | **Stall current** | Conf. |
|---|---|---|---|---|---|---|
| RS-550VC-7527 | 14.4 V | 19,800 / 1.30 A | 17,620 rpm, 10.5 A, 64.7 mN·m | **588 mN·m** (6,000 g·cm) | **85 A** | V |
| RS-550VC-7525 | 12 V | 17,600 / 1.20 A | — | 549 mN·m | 85 A | Vs |
| **RS-755WC-8017** | **18 V** | 19,800 / 2.30 A | 17,320 rpm, 16.0 A, 126 mN·m | **1,009 mN·m** (10,300 g·cm) | **112 A** | V |
| **RS-775WC-8514** | **18 V** | 19,500 / 2.70 A | 17,040 rpm, 18.7 A, 153 mN·m, 273 W | **1,215 mN·m** (12,400 g·cm) | **130 A** | V |
| RS-775VC-8015 | 16.8 V | 18,000 / 2.60 A | 15,630 rpm, 17.1 A, 135 mN·m, 220 W | 1,024 mN·m | 113 A | V |

Source: [Mabuchi catalogue sheets (mikrocontroller.net mirror)](https://mikrocontroller.net/attachment/641472/Mabuchi_Motors_Complete.pdf). Also [AndyMark RS-550VC-7527F](https://andymark.com/products/550-dc-motor-rs-550vc-7527f): 12 V, 17,500 rpm, 85 A stall, 0.34 N·m stall (Vs).

**Driver implication.** A 775 motor at 18 V stalls at **130 A**, roughly 3× the BTS7960's 43 A current limit. Use PWM current limiting with the IS pin, or keep the gearbox running so the motor never stalls hard.

### 2.3 Alternatives

| Item | Spec | Price | Source | Conf. |
|---|---|---|---|---|
| 775 + 42 mm planetary (42GP-775), 12/24 V | 8–1,600 rpm options. Torque claims of "200 kg", "250 kg", "253 kg" (meaning kg·cm, i.e. **19.6–24.8 N·m**); ratios not stated in titles | **US$19.65–46.05 ≈ A$28–66** | [AliExpress search](https://www.aliexpress.com/w/wholesale-775-planetary-gear-motor.html?shipCountry=au&currency=AUD) | V (prices); torque is a seller claim |
| Same, with encoder (GA42Y-775 / "AMX 250 kg") | Encoder fitted | US$34.09–40.19 ≈ A$49–58 | same | V |
| **Car windscreen wiper motor (OEM Trico, Saab 9-3)** | At 13.5 V: **45 ± 6 rpm / 41 ± 6 N·m max** (low speed); 71 ± 8 rpm / 36 ± 5 N·m (high speed); **20 A nominal, 33 A stall** (low speed) | — | [Saab WIS technical data](https://saabwisonline.com/9-3-9440/2005/3-electrical-system/wash-wipe-systems/technical-data/windscreen-wiper-motor) | V |
| Rear wiper motor (Denso, Saab) | 12 N·m max, 385 rpm | — | [Saab WIS rear wiper](https://saabwisonline.com/9-3-9400/1998/3-electrical-system/wash-wipe-systems/technical-data/rear-window-wiper-motor) | Vs |
| Marine aftermarket wiper motor (Exalto) | 23 N·m max at 12 V, 3 A; 40 / 60 rpm | — | [Exalto manual](https://manualedistruzioni.it/exalto/engine/md1-223bdc/user-manual/zyib) | Vs |
| Used wiper motor, eBay AU | Collector parts (Falcon AU, Holden HQ) sold at A$245–250; a VW Passat B6 motor from the UK about A$39 | — | [eBay AU](https://www.ebay.com.au/itm/256476753061) | Vs |
| **Used wiper motor, wrecker / pick-a-part** | **E: A$20–50.** No AU wrecker price list was found; eBay prices are inflated by classic-car demand | — | — | E |

Wiper motors use a worm gear, so **E: they self-lock and are not back-drivable**. That is good for holding a pose, bad for compliance. They are also heavy (**E: about 1.5–2.5 kg** with linkage removed; not measured).

---

## 3. Drivers and sensors

| Item | Spec | Price | Source | Conf. |
|---|---|---|---|---|
| **BTS7960 dual half-bridge module ("43 A")** | 5.5–27 V. **43 A is the chip's typical current-limit trip level, not a continuous rating** | AliExpress **US$5.29–5.65 ≈ A$7.6–8.1** (US$1.09–1.33 listings are suspect); AU stock: Phipps A$27.95, Ubuy A$29 | [AliExpress](https://www.aliexpress.com/w/wholesale-bts7960.html), [Phipps](https://www.phippselectronics.com/product/bts7960-43a-double-dc-stepper-motor-driver-h-bridge-pwm/), [Ubuy](https://www.u-buy.com.au/product/LSTZO7M6U-bts7960-motor-driver-43a-h-bridge-current-limiting-control-semiconductor-refrigeration-driver-for-smart-car-motor-drive-controller-module) | V / Vs |
| BTS7960 real continuous current | Vendor FAQ: "brief peak currents up to 43A, but continuous operation should ideally be kept under 15A-20A, depending on active cooling". **E: about 15 A** on the stock heatsink without a fan | — | [Phipps](https://www.phippselectronics.com/product/bts7960-43a-double-dc-stepper-motor-driver-h-bridge-pwm/) | Vs |
| BTS7960 current sense (R_IS, L_IS pins) | k_ILIS = I_L / I_IS ≈ **8,500** nominal. With R_IS = 1 kΩ, V_IS = I_L / 8.5 A volts. ±20% spread across parts (third-party figure). In a fault, IS is driven to I_IS(lim) as a flag | — | [Infineon datasheet copy](https://components101.com/sites/default/files/component_datasheet/BTS7960B-Datasheet.pdf), [blog](https://industrialmonitordirect.com/blogs/knowledgebase/bts7960-high-side-current-sensing-and-fault-detection-explained) | Vs |
| **MT6701** magnetic angle board | **14-bit**; I²C, PWM, ABZ (1,024 lines); sold as an AS5600 replacement | **US$1.55/pc (5-pack) – 2.65 ≈ A$2.2–3.8** | [AliExpress](https://www.aliexpress.com/w/wholesale-mt6701-magnetic-encoder.html?shipCountry=au&currency=AUD) | V |
| **AS5600** board | **E: 12-bit (4,096 counts); I²C plus analog or PWM out.** This is the ams datasheet value from memory; no AS5600-only listing came up this session. **E: price A$2–4**, about the same as MT6701 boards | — | — | E |
| **ESP32-S3 DevKitC-1 N16R8** | 16 MB flash, 8 MB PSRAM, dual LX7 at 240 MHz | Non-deal **US$6.05–7.61 ≈ A$8.7–11** ($1.09 = new-shopper price) | [AliExpress](https://www.aliexpress.com/w/wholesale-esp32-s3-devkitc-n16r8.html) | V |
| **BNO085** IMU (GY-BNO085) | 9-DoF with on-chip fusion | **US$6.50 (TENSTAR, 2k+ sold) – 24.19 ≈ A$9.4–35**. Very cheap units may be counterfeit or BNO080 | [AliExpress](https://www.aliexpress.com/w/wholesale-bno085.html) | V |
| **MPU6050** (GY-521) | 6-DoF, no fusion output | **E: A$2–4.** Not on the page that was fetched | — | E |
| **SimpleFOC-class BLDC drivers** | DRV8316 boards: **3 A continuous / 8 A peak**, 8–35 V | US$17.10–24.49 ≈ A$25–35 | [AliExpress](https://www.aliexpress.com/w/wholesale-simplefoc-driver.html) | V |
| "ESP32 Simple FOC Shield V2.0.4, 20 A" | 20 A claim in the title | US$3.05 (almost certainly a variant or part price) | same | V (claim unverified) |
| **20–40 A FOC driver cheaper than a used hoverboard board?** | **None found.** Cheap SimpleFOC boards are 3–8 A. A used hoverboard (A$50–75) gives a dual 15 A+ FOC board **plus** two motors and a battery. **E: VESC/ODrive clones cost A$60–150 per channel** (not looked up this session) | — | — | E |

---

## 4. Mechanical, cheap

### 4.1 Bicycle parts

| Item | Spec | Price | Source | Conf. |
|---|---|---|---|---|
| **Bicycle chain, 1/2" pitch (081C 1/8", 082C 3/32", derailleur)** | **ISO 9633 minimum tensile strength 8,000 N (8 kN)** for all 1/2"-pitch cycle chains | — | [ISO 9633:2001 via iTeh](https://standards.iteh.ai/catalog/standards/iso/33879ee4-f863-44c6-884b-75ca7549038d/iso-9633-2001) ([sample PDF](https://cdn.standards.iteh.ai/samples/23532/453a19f1116949d1932b9444b8c54516/ISO-9633-2001.pdf)) | V |
| Working load | **E: 1.0–1.6 kN** (a safety factor of 5–8 on 8 kN, the usual practice for shock and fatigue loads; no standard working load exists for cycle chain) | — | — | E |
| KMC e1 3/32" chain | 367 g | US$37.12 (sale) | [kmcchain.us](https://kmcchain.us/collections/bmx/products/e1) | V |
| Sprocket pitch radius | r = p / (2·sin(180°/N)): 11T → 22.5 mm, 34T → 68.8 mm, 44T → 89.0 mm, 52T → 105.2 mm | — | geometry | E (computed) |
| Torque on a sprocket at 1.6 kN | 11T: 36 N·m; 44T: 142 N·m; 52T: 168 N·m. **The chain is not the weak link** for a knee | — | computed | E |
| Cassette / freewheel tooth range | **E: 11–34T** on common 7–10-speed MTB/hybrid cassettes (11–28 on road; freewheels 14–28/34T) | — | common drivetrain knowledge, not looked up | E |
| Chainring tooth range | **E: 22–52T** (triple MTB 22/32/44, road 34–53) | — | same | E |
| Second-hand bike / tip shop | **E: A$0–40** for a donor bike (council hard rubbish, tip shops). No source checked | — | — | E |

### 4.2 608 bearings (AliExpress)

| Item | Price | Source | Conf. |
|---|---|---|---|
| 608-2RS / 608ZZ, 100-pack (listing 7) | US$24.09 → **US$0.24 ≈ A$0.35 each** | [AliExpress](https://www.aliexpress.com/w/wholesale-608zz-bearing-100pcs.html) | V |
| Genuine NMB/Minebea 608ZZ, 100-pack | US$33.68 → US$0.34 ≈ A$0.48 each | same | V |
| Generic 608ZZ (new-shopper US$1.09 for 10/100) | regular about US$6.6 (1.09 + "save" 5.53); **E: A$0.10–0.25 each** in 100s | same | V / E |

### 4.3 Bunnings stock (Metal Mate aluminium, plywood)

| Item | Price | Source | Conf. |
|---|---|---|---|
| Aluminium equal angle **25 × 25 × 3 mm, 1 m**, silver (I/N 1069859) | **A$13.96** | [Bunnings](https://www.bunnings.com.au/metal-mate-25-x-25-x-3mm-1m-aluminium-equal-angle-silver-1m_p1069859) | Vs |
| Aluminium equal angle **40 × 40 × 3 mm, 1 m**, white (I/N 0816253) | **A$40.97** | [Bunnings](https://www.bunnings.com.au/metal-mate-40-x-40-x-3mm-1m-white-aluminium-equal-angle_p0816253) | Vs |
| 40 × 40 × 1.4 mm, 1 m, silver (too thin for joints) | A$12.37 | [Bunnings](https://www.bunnings.com.au/metal-mate-40-x-40-x-1-4mm-1m-aluminium-equal-angle-silver-1m_p1072729) | Vs |
| **Flat bar 40 × 6 / 50 × 6 mm** | **Not in the Metal Mate range.** The largest found is 25 × 3 mm × 1 m black, A$12.80. **E: A$15–30/m** from a metal supplier or offcut bin (e.g. Maker Supplies, All Aluminium; see R6) | [Bunnings 25×3](https://www.bunnings.com.au/metal-mate-25-x-3mm-x-1m-black-aluminium-flat-bar_p0427795) | Vs / E |
| **Square tube 25 × 25 × 1.6 mm** | **Not found.** Nearest: 25.4 × 25.4 × 1 mm × 3 m white, A$46.36 (I/N 0427719); 40 × 40 × 1.9 mm × 1 m silver exists (I/N 1130551, price not seen) | [Bunnings](https://www.bunnings.com.au/metal-mate-25-4-x-25-4-x-1mm-x-3m-white-aluminium-square-tube_p0427719) | Vs |
| **12 mm structural plywood, 2400 × 1200** (STRUCTAply CD) | **A$70** | [Bunnings structural plywood](https://www.bunnings.com.au/our-range/building-hardware/building-boards/structural-plywood) | Vs |
| 12 mm Ecoply, non-structural | A$45.50 | [Bunnings](https://www.bunnings.com.au/ecoply-2400-x-1200-x-12mm-non-structural-plywood-12mm_p0340315) | Vs |

Bunnings prices come from cached search summaries; the live pages return 403. Metal Mate angle in 3 mm wall is poor value. **E**: a metal recycler or offcut bin usually sells 6060/6061 by weight at a fraction of retail.

### 4.4 EVA foam for cosplay-style shells

| Item | Price | Source | Conf. |
|---|---|---|---|
| Kmart 12-pack EVA foam flooring tiles (P_43404186) | **A$10** (tile size not shown in the summary; **E: 30 × 30 cm, about 10 mm**) | [Kmart](https://www.kmart.com.au/product/12-pack-eva-foam-flooring-tiles-43404186) | Vs / E |
| Centra 12 pcs heavy-duty EVA mats, 60 × 60 cm (third-party seller on Kmart) | A$42.99 | [Kmart marketplace](https://www.kmart.com.au/product/centra-12-pcs-eva-foam-mats-interlocking-floor-gym-flooring-heavy-duty-60x60cm-110082285/) | Vs |

---

## 5. Batteries, cheap

| Item | Spec | Price | Source | Conf. |
|---|---|---|---|---|
| Hoverboard pack (salvaged with the board) | 36 V 10S2P 18650, 4.4 Ah, **158 Wh**, 42 V full, 15–20 A continuous (one listing claims 20 A continuous / 30 A max) | comes in the A$50–75 used board | [batteryworldonline](https://batteryworldonline.com/products/replacement-battery-for-balance-scooter-board-36v-4-4ah-10s2p) | Vs |
| **10S 36 V BMS, 15–20 A** (Heltec, Bisida and others, NTC) | regular **US$6.3–9.1 ≈ A$9–13** (US$1.09 is the new-shopper price plus the listed $5.25–7.98 saving) | [AliExpress](https://www.aliexpress.com/w/wholesale-10s-36v-bms-18650.html) | V (derived) |
| Heltec 6S–10S 36 V 15/20 A BMS | same price band | same | V |
| JK smart BMS 8S–24S, 100 A | US$42.29 ≈ A$61 | same | V |
| **5S / 6S BMS** | Only a 4S–8S 200 A JK (US$55) was on the page. **E: A$3–8** for a basic 5S/6S 20 A board | same | V / E |
| **10S3P 18650 holder kit + nickel strip + 10S 15 A BMS** | US$14.65 ≈ **A$21** (804 sold) | same | V |
| Bare 18650 plastic holders/spacers | **E: A$0.05–0.15 per cell slot.** None listed on the fetched page | — | E |
| Salvaged 18650 sources | Laptop packs, dead hoverboard and e-bike packs, power-tool packs (Ozito PXC packs hold 18650s; **E**, from teardown knowledge). Free from e-waste days and tip shops. **E: expect 30–50% of cells usable** after capacity and IR testing | — | E |
| **Used 36 V e-bike pack** | **E: A$80–250** on Marketplace/Gumtree depending on Ah and health. Not sourced; Gumtree/FB blocked | — | E |

---

## 6. Best value per N·m

Assumptions: each row includes a driver. The hoverboard row includes its own board (one board for two motors). The DC motor rows add one BTS7960 (A$9 incl. GST). Torque is at the actuator output, before any extra chain stage.

| Actuator | Unit cost incl. driver (A$) | Peak torque (N·m) | Realistic continuous (N·m) | **A$ per peak N·m** | **A$ per cont. N·m** | Speed at output | Back-drivable | Notes |
|---|---|---|---|---|---|---|---|---|
| **Hoverboard hub motor** (used board, A$50–75 ÷ 2) | **25–38** | 22.5 at 50 A (V); **about 6.8 at the stock 15 A** (V × V) | 5–7 (E) | **1.1–1.7** (at 50 A, needs a better driver); 3.7–5.6 at the stock limit | **3.6–7.6** | about 576 rpm at 36 V (E) | **Yes**, direct drive with low cogging | Also yields battery and charger. Hall feedback is coarse (90 cpr), so add an MT6701. Add a 1:4–1:8 chain stage (11T → 44–88T) to reach 25–55 N·m stock |
| **Drill gearmotor** (Ozito skin new A$50; used A$5–25) | new **59**; used **14–34** | 40 (V, short) | 10–15 (E) | new 1.5; used **0.35–0.85** | new 4–6; used 0.9–3.4 | 400 rpm low gear (V) | Poor (E) | Clutch acts as a torque limiter. The chuck takes a hex shaft directly |
| **775 + 42 mm planetary** (AliExpress) | **37–75** | 19.6–24.8 claimed (seller) | **E: about 8–12** (42 mm planetaries are commonly rated about half of the claimed peak) | 1.5–3.8 | 3–9 | 8–1,600 rpm by ratio | Poor at high ratios | 130 A motor stall vs 43 A driver limit, so current limiting is essential |
| **Wiper motor** (used, wrecker) | **E: 29–59** | **41 ± 6 (V, OEM Trico, low speed)** | E: 10–15 | **0.7–1.4** | 2–6 | 45 rpm (V) | **No** (worm, self-locking) | Heaviest option (E: 1.5–2.5 kg). Holds a pose unpowered. Drives easily from a BTS7960 (20 A nominal, 33 A stall) |
| **"380 kg·cm" hobby servo** (ASME-05B/-MXB/-MRB) | **E: 30–110** (listing range US$10–76; cheap listings likely variants) | 37.3 claimed (380 kg·cm "starting"), 33.3 holding (V, listing) | E: 10–15 (5 A current limit on a 12–24 V supply) | 0.8–3.0 | 2–11 | 0.5 s/60° at 24 V ≈ 20 rpm (Vs) | No | Driver and position loop built in, no extra encoder. Claims are unverified; the 5 A limit at 24 V caps input at 120 W |

Sources for the table: XRL [arXiv 2007.00872](https://arxiv.org/pdf/2007.00872); firmware [config.h](https://raw.githubusercontent.com/EmanuelFeru/hoverboard-firmware-hack-FOC/main/Inc/config.h); [Ozito PXDDS-180](https://www.ozito.com.au/p/3000168-PXDDS-180/); [Saab WIS wiper data](https://saabwisonline.com/9-3-9440/2005/3-electrical-system/wash-wipe-systems/technical-data/windscreen-wiper-motor); [AliExpress 775](https://www.aliexpress.com/w/wholesale-775-planetary-gear-motor.html?shipCountry=au&currency=AUD); [AliExpress 380 kg servo](https://www.aliexpress.com/w/wholesale-380kg-servo.html); servo spec summary from [desertcart ASME-04B listing](https://www.desertcart.ro/products/486482857-asme-04b-robot-servo-high-power-high-torque-servo-support) (Vs).

**Reading the table.**
- **Cheapest per peak N·m:** a used drill with a dead battery, or a wrecker's wiper motor, at about A$0.4–1.4 per N·m. Neither is back-drivable, and drills have little continuous margin.
- **Best whole-system value:** the **used hoverboard**, at about A$60 for two torque-controlled, back-drivable 7 N·m motors, a dual FOC driver, a 158 Wh pack and a charger. With a 1:6 bicycle-chain stage (11T → 66T, or a double stage), each motor reaches about **40 N·m** at the stock 15 A, and about 70 N·m if the board can be pushed to 25 A (E). A full-size knee needs roughly 60–170 N·m; XRL's 168 N·m figure is for a load-carrying exoskeleton, so expect less for a bare robot. Three or four hoverboards (A$200–300) would cover 6–8 big joints.
- **The 380 kg·cm servo is the simplest wiring** (PWM in, done), but its torque claim is unverified and it has no torque or current feedback.

---

## Gaps and what to measure first

1. **Measure hoverboard Kt and thermal limit yourself.** Clamp the motor, use a 0.5 m lever on a luggage scale, and run firmware TRQ_MODE at 5/10/15 A. Log case temperature over 10 min to fix the continuous rating. The published values differ: 0.45 vs 0.52 N·m/A.
2. **Find the maximum safe I_MOT_MAX** for your specific mainboard. Read the MOSFET part numbers and the shunt value. Nothing is published.
3. Kmart Anko drill specs and price, Gumtree for-parts prices, and wrecker wiper-motor prices: all of these sites blocked automated access, so check in person.
4. AS5600 and MPU6050 specs and prices are from memory (E). Confirm on the listing before ordering.
