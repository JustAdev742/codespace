"""Bill of materials and cost roll-up for KESTREL K1 Mk II.

Every line records: price status
  V  = price seen on a manufacturer / retailer page (this revision: accessed 2026-11-09; or docs/research/R1-R6)
  Q  = quote-only part: price is an ESTIMATE pending a formal quote
  E  = engineering estimate (custom / machined / not found)
make/buy: buy | machine (CNC job shop) | print (MJF/FDM) | make (builder fabricates) | custom (outsourced to drawing)
baseline: Y = needed for the baseline robot; O = recommended option (excluded from the baseline total).

Line IDs are STABLE: the construction tutorial (docs/10) and other docs cite them. B001-B085 keep the slot they had in
Mk I (several now hold the Mk II replacement part, see MK2_CHANGE); Mk II additions start at B101. Never renumber.

FX assumptions (AUD per unit, November 2026; update before ordering):
"""
from __future__ import annotations

import csv
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
FX = {"AUD": 1.0, "USD": 1.52, "EUR": 1.65, "GBP": 1.95, "CHF": 1.75, "CNY": 0.21}
__doc__ += "  " + ", ".join(f"{k} {v}" for k, v in FX.items() if k != "AUD") + "\n"

# Mk I baseline (commit 4068103 cost_summary.md), kept for the delta table in docs/generated/cost_summary.md
MK1_TOTAL = 196004
MK1_BY_SUB = {
    "Drives": 29083, "Actuators - gears": 20016, "Actuators - motors": 18496, "Actuators - sensing": 18200,
    "Actuators - housings": 16540, "Test rig": 15700, "Structure": 11620, "Hands": 11168, "Compute": 10037,
    "Sensors": 9873, "Actuators - bearings": 7544, "Consumables": 6900, "Shells": 5710, "Battery": 4301,
    "Safety": 4150, "Actuators - wrist": 2600, "Harness": 2500, "Power": 1355, "Cooling": 210,
}

ACC = "accessed 2026-11-09"
CM_RI115 = "https://www.cubemars.com/product/ri115-ph-kv40-potting-frameless-torque-motor.html"
CM_RI85 = "https://www.cubemars.com/product/ri85-ph-kv85-potting-frameless-torque-motor.html"
MAXON_ECX32 = "https://www.maxongroup.com/maxon/view/product/motor/ecmotor/ECX-Flat/ECX-Flat-32/ECXA32LZF50E6ILACO1Y330A"
KOOL_PMP420 = "https://koolance.com/pump-g-1-4-bsp-pmp-420"
KOOL_HX720 = "https://koolance.com/radiator-2-fan-120mm-18-fpi-aluminum"
SENSIRION = "https://sensirion.com/products/catalog/SLF3S-4000B"
TI = "https://www.ti.com/product/"

# (id, subsystem, item, manufacturer, part_no, qty, unit_price, cur, make_buy, status, baseline, source/supplier, alternative, notes)
ITEMS = [
    # ------------------------------------------------------------------ actuators: motors
    ("B001", "Actuators - motors", "KM-130x50-LC lamination stack: Ø130 36-slot die, 250 x 0.20 mm NO20, bonded, 50 mm (knee x2 + hip pitch x2)", "lamination job shop (laser/EDM + bonding)", "KM-130-LAM-50", 4, 620, "AUD", "custom", "E", "Y",
     "docs/13 sec 3; R10 sec 5.1 (same Ø130 die as Mk I)", "stamped stacks once a die is justified", "estimate: 250 laser-cut laminations ~A$1.6 each + bonding; get 2 quotes"),
    ("B002", "Actuators - motors", "KM-130x50-LC magnet set: 42 N50UH arcs, 3.0 mm, 50 mm long (~0.29 kg/set)", "NdFeB magnet vendor (custom arcs)", "KM-130-MAG-N50UH", 4, 480, "AUD", "custom", "E", "Y",
     "R10 sec 3.2.4 / S21 (N50UH grade table)", "N52SH (lower Hcj margin, R10)", "estimate; small-lot custom arc pricing - quote with grade certificate"),
    ("B101", "Actuators - motors", "KM-130x50-LC winding set: magnet wire 10 x Ø0.67 mm per conductor (3 turns x 2 paths), slot liners, varnish, potting epoxy >=1.5 W/m K", "Elektrisola / Essex + potting vendor", "KM-130-WIND", 4, 150, "AUD", "buy", "E", "Y",
     "R10 sec 5.1", "", "estimate"),
    ("B102", "Actuators - motors", "KM-130x50-LC rotor: 1018 back-iron + carbon-fibre retaining sleeve, balanced", "CNC job shop + composites", "KM-130-ROT", 4, 320, "AUD", "machine", "E", "Y",
     "docs/13 sec 3", "", "estimate"),
    ("B103", "Actuators - motors", "KM-130x50-LC liquid jacket: 6061 shrink-fit sleeve, 6 x 3 mm helical channel, 2 O-rings, 2 x G1/8 ports, 2-bar leak test", "CNC job shop", "KM-130-JKT", 4, 540, "AUD", "machine", "E", "Y",
     "R10 sec 5.1 (0.6 -> 0.25 K/W target, to be measured)", "air-only fallback (knee continuous 1.34 margin, R10)", "estimate; HC2 drive bolts to the jacket rear face"),
    ("B003", "Actuators - motors", "Frameless motor CubeMars RI115-PH KV40 (with connector), 5.5 / 16 N m (hip roll x2, waist pitch)", "CubeMars", "RI115-PH KV40", 3, 199.90, "USD", "buy", "V", "Y",
     f"{CM_RI115} ({ACC})", "KM-115x32-N50 scratch build (B005 die)", "Mk II KA-110P motor; resistance on page conflicts (119 vs 134 mOhm LL) - measure"),
    ("B004", "Actuators - motors", "Frameless motor CubeMars RI85-PH KV85 (with connector), 2 / 5 N m (hip yaw x2, waist yaw, ankle x4)", "CubeMars", "RI85-PH KV85", 7, 147.90, "USD", "buy", "V", "Y",
     f"{CM_RI85} ({ACC})", "KM-85x26-N50-3t scratch build", "Mk II KA-90P motor"),
    ("B005", "Actuators - motors", "KM-115x32-N50 custom motor kit (new Ø115 36s/40p die, N50UH 2.8 mm arcs, 3 turns): shoulder pitch x2 + roll x2", "builder / lamination + magnet vendors", "KM-115x32-N50", 4, 950, "AUD", "custom", "E", "Y",
     "R10 sec 5.4 (KA-115R design); actuator_family.md KH-25", "TQ ILM115x25 (Q)", "estimate: stack A$450, magnets A$300, wire/potting A$80, rotor A$120"),
    ("B104", "Actuators - motors", "KM-85x26-N50-4t custom motor kit (Ø85 die, N50UH, 4 turns): shoulder yaw x2 + elbow x2", "builder / vendors", "KM-85x26-N50-4t", 4, 560, "AUD", "custom", "E", "Y",
     "R10 sec 5.6; actuator_family.md KH-20", "TQ ILM85x26 (Q)", "estimate"),
    ("B006", "Actuators - motors", "Custom frameless motor KM-50x20 (12s/14p): wrist yaw x2, neck x2", "builder / vendors", "KM-50x20", 4, 220, "AUD", "custom", "E", "Y",
     "docs/13", "CubeMars RI50 class (verify specs)", "unchanged from Mk I"),
    # ------------------------------------------------------------------ actuators: gears
    ("B007", "Actuators - gears", "KA-130K 2-stage planetary 17:1 (knee), Plan A: s1 m0.8 z16 / 4 x z18 / z52, b 14 mm; s2 m1.25 z18 / 4 x z18 / z54, b 18 mm (4.25 x 4.0); 18CrNiMo7-6 carburised + ground ISO 1328 grade 6, nitrided 42CrMo4 rings", "gear job shop", "KA-130-PG17", 2, 1500, "AUD", "custom", "E", "Y",
     "docs/09 sec 5.1 Plan A; docs/04 sec 5.2; structure_checks.md (s2 Lewis SF 2.16)", "KHK stock ground gears modified + EDM ring", "sized for 1.1 x 493 N m delivered peak; R10 sec 5.1 m1.5 x 14 mm stage 2 is the fallback only if ISO 6336 asks for it; pins + needle cages in B138"),
    ("B105", "Actuators - gears", "KA-130H 2-stage planetary 14:1 (hip pitch), Plan A: s1 m0.8 z24 / 3 x z18 / z60, b 12 mm; s2 shared with the knee (B007)", "gear job shop", "KA-130-PG14", 2, 1450, "AUD", "custom", "E", "Y",
     "docs/09 sec 5.1 Plan A; docs/04 sec 5.2", "", "estimate; 14:1 fixed in the calc (docs/09 hold H14 resolved)"),
    ("B008", "Actuators - gears", "Custom 2-stage planetary gear set 29:1 (KA-110P)", "gear job shop", "KA-110-PG29", 3, 950, "AUD", "custom", "E", "Y", "actuator_family.md", "KHK stock gears", ""),
    ("B009", "Actuators - gears", "Custom 2-stage planetary gear set 28:1 (KA-90P)", "gear job shop", "KA-90-PG28", 7, 800, "AUD", "custom", "E", "Y", "actuator_family.md", "KHK stock gears", ""),
    ("B010", "Actuators - gears", "C25 machined two-disc cycloid 30:1: 2 wire-EDM 42CrMo4 nitrided discs, Ø84 pin circle Ø5 pins, eccentric shaft + bearings, 8 output pins (replaces strain-wave 25)", "wire-EDM + CNC job shop", "KH-C25-CYC", 4, 980, "AUD", "custom", "E", "Y",
     "R10 sec 5.6; docs/13 sec 4.2; profile cad/cycloid_profile.py", "Leaderdrive LHSG-25-50 (US$420 Q, gear-limited 127 N m)", "rating targets 160 rep / 250 mom N m - dyno-proof before buying 4"),
    ("B011", "Actuators - gears", "C20 machined two-disc cycloid 30:1: Ø68 pin circle, Ø4 pins, 6 mm discs (replaces strain-wave 20)", "wire-EDM + CNC job shop", "KH-C20-CYC", 4, 820, "AUD", "custom", "E", "Y",
     "R10 sec 5.7", "Leaderdrive LHSG-20-50", "rating targets 105 rep / 160 mom N m"),
    ("B012", "Actuators - gears", "Strain-wave component set size 14, 50:1", "Leaderdrive", "LHSG-14-50", 4, 300, "USD", "buy", "Q", "Y", "leaderdrive.com", "Harmonic Drive CSG-14-50", "wrist yaw, neck (kept)"),
    # ------------------------------------------------------------------ actuators: bearings, encoders, housings
    ("B013", "Actuators - bearings", "Crossed-roller output bearing THK RB9016 (90 x 130 x 16), KA-130 output, checked for 1.1 x 493 N m + four-bar rod load (structure_checks.md)", "THK", "RB9016", 4, 420, "AUD", "buy", "Q", "Y", "Statewide Bearings (THK AU)", "IKO CRBH9016 class; Chinese CRB equivalents (~1/3 cost)", "docs/09 hold H1 (resolved); fits in docs/09 sec 2"),
    ("B014", "Actuators - bearings", "Crossed-roller output bearing THK RB6013 (60 x 90 x 13), KA-110P and KA-90P outputs", "THK", "RB6013", 10, 260, "AUD", "buy", "Q", "Y", "Statewide Bearings / CBC", "IKO CRBH6013 class; Chinese CRB", "fits in docs/09 sec 2; confirm the PCD 100 KA-110P output hub overhang in CAD"),
    ("B015", "Actuators - bearings", "Crossed-roller output bearing (KH-C25/C20/KH-14)", "THK / IKO", "RA/CRBS class", 12, 190, "AUD", "buy", "Q", "Y", "Statewide Bearings / CBC", "Chinese CRB", ""),
    ("B016", "Actuators - bearings", "Thin-section deep-groove rotor bearings (2 per actuator): 61808 (KA-130, KH-C25), 61806 (KA-90P, KH-C20), per drawing (KA-110P, KH-14)", "NSK / SKF", "61808 / 61806 / 68xx", 52, 22, "AUD", "buy", "E", "Y", "CBC Australia / BSC", "", "docs/09 sec 2; cycloid input journals 61803 / 61802 are in B010 / B011"),
    ("B138", "Actuators - bearings", "Planet pins 100Cr6 through-hardened 60-64 HRC, ground h5, Ra <= 0.2 (Ø5 / Ø6 / Ø8 / Ø10 / Ø12) + INA needle roller and cage assemblies K5x8x8, K6x9x8, K8x12x10, K10x14x13, K12x16x13: one pin + cage per planet, 93 planets (KA-130K 2 x 8, KA-130H 2 x 7, KA-110P 3 x 7, KA-90P 7 x 6)", "grinding shop + Schaeffler (INA)", "K-series + pins", 93, 22, "AUD", "buy", "E", "Y",
     "docs/09 sec 5.1 (planet pin and bearing table) and hold H13", "", "estimate (pin ~A$12 ground in a small batch, cage ~A$10); verify C/C0 against the planet load at 1.1 x peak; gear-shop quotes B007-B009 / B105 exclude them unless stated"),
    ("B017", "Actuators - sensing", "Absolute encoder RLS AksIM-2 readhead + ring, BiSS-C, 19-20 bit", "RLS", "MB049 + MRA049", 33, 300, "USD", "buy", "V", "Y",
     "rls.si; DigiKey marketplace US$199 readhead (R2)", "Netzer DS-58 (output), MT6835 (motor)", "26 output + 7 motor-side (legs/waist)"),
    ("B018", "Actuators - sensing", "Magnetic motor encoder IC MagnTek MT6835 + magnet + PCB", "MagnTek", "MT6835GT", 19, 18, "AUD", "buy", "E", "Y", "lcsc.com C2932578 (R2)", "MA732 / AS5047P", "motor side, arms/neck/ankle/yaw"),
    ("B108", "Actuators - sensing", "Wrist-cross absolute angle sensor (MT6835 + diametric magnet + flex PCB), pitch + roll per wrist", "MagnTek", "MT6835GT", 4, 18, "AUD", "buy", "E", "Y", "lcsc.com C2932578 (R2)", "TMAG5273", "KW-L2 has Hall commutation only; joint angle measured at the cross"),
    ("B019", "Actuators - sensing", "Strain-gauge torque flexure kit (HBK XY41 gauges x4, ADS1262 front-end)", "HBK / TI", "XY41-3/350 + ADS1262", 10, 260, "AUD", "make", "E", "Y",
     "hbkworld.com; ti.com/product/ADS1262 (R2)", "FUTEK TFF400 (via Metromatics)", "8 cycloid arm joints + 2 spare (cycloid friction defeats current-based torque)"),
    ("B020", "Actuators - sensing", "Winding NTC thermistors EPCOS B57861S0103F045", "TDK", "B57861S0103F045", 60, 3.5, "AUD", "buy", "E", "Y", "element14 AU / DigiKey AU", "", "2 per motor + spares"),
    ("B021", "Actuators - housings", "KA-130 jacketed housing set (front, rear cap with HC2 drive bay + coolant ports, rotor hub, carriers, flange), 7075-T6 hard anodised", "CNC job shop", "KA-130-H2", 4, 1100, "AUD", "machine", "E", "Y",
     "PCBWay CNC / JLCCNC / local shop", "", "bearing seats H6/k5; jacket bore H7"),
    ("B022", "Actuators - housings", "KA-110 / KA-90 machined housing set", "CNC job shop", "KA-110/90-H", 10, 650, "AUD", "machine", "E", "Y", "PCBWay CNC", "", ""),
    ("B023", "Actuators - housings", "KH-C25/C20/KH-14 machined housing set incl. torque flexure (Ti on KH-C25/C20)", "CNC job shop", "KH-H", 12, 520, "AUD", "machine", "E", "Y", "PCBWay CNC (Ti Gr5)", "", ""),
    # ------------------------------------------------------------------ actuators: wrist KW-L2
    ("B024", "Actuators - wrist", "KW-L2 motor: maxon ECX FLAT 32 L high torque, 24 V, Hall sensors (98.5 mN m nom, 540 mN m stall, 10,600 rpm no-load, 71 g)", "maxon", "ECXA32LZF50E6ILACO1Y330A", 5, 140.00, "EUR", "buy", "V", "Y",
     f"{MAXON_ECX32} (EUR 140.00 at 5-19 pcs, {ACC}); maxon motor Australia (Mt Kuring-Gai NSW)", "ECX FLAT 22 L + 3.9:1 (speed 0.94 of req, R10)", "4 + 1 spare; directly on the screw, no gearhead"),
    ("B106", "Actuators - wrist", "KW-L2 mechanics: KSS Ø8 x 1 ground ball screw + flange nut (1 mm lead, docs/09 hold H10; Ø6 x 1 only if Ca >= 1.5 kN and C0a >= 3 kN), miniature linear guide, angular-contact thrust pair, housing, rod ends", "KSS / THK / CNC", "KW-L2-MECH", 4, 380, "AUD", "buy", "E", "Y",
     "kssballscrew.com (R5); R10 sec 5.9; docs/05 sec 6.4; P09.1", "", "estimate; screw load rating not yet retrieved - confirm >= 1.5 kN dynamic (970 N momentary case) in the KSS catalogue"),
    ("B107", "Actuators - wrist", "KW-L2 forearm driver board: TI F28P65x (EtherCAT slave) + 2 x DRV8353 + 100 V FETs (>= 20 A), phase-current sense, Hall + wrist-cross sensor inputs, 52 -> 24 V 15 A pk / 8 A cont buck (TI LM5146-Q1) feeding KW-L2 + hand", "custom (JLCPCB assembly)", "KES-WRIST", 3, 360, "AUD", "custom", "E", "Y",
     f"ti.com/product/DRV8353 (R2); {TI}LM5146-Q1 ({ACC}); docs/09 MK2-17", "maxon EPOS4 Micro 24/5 + separate 24 V brick", "2 + 1 spare; one per forearm, its own EtherCAT slave (30 slaves in total, docs/05 sec 7); 2-channel STO disables the buck and the bridges"),
    # ------------------------------------------------------------------ drives
    ("B025", "Drives", "HC2 150 A pk / 75 A cont GaN EtherCAT drive (custom): EPC9186HC-class 100 V GaN stage, TI F28P65x (on-chip EtherCAT ESC), 2 x BiSS-C, 2-channel hardware STO, ASC braking", "custom (6-layer 2 oz, JLCPCB/PCBWay assembly)", "KES-HC2", 5, 1450, "AUD", "custom", "E", "Y",
     "R10 sec 3.2.7 + S26 (EPC9186HC2/HC3: 150 A rms, <= 76 V, vendor press); ti.com TMS320F28P650DK (R2)", "Elmo Platinum Twitter R70/100 (99 A only - ~30 % less knee peak: 327 vs 464 N m at 16:1, R10 sec 1.2)", "knee x2, hip pitch x2 + 1 spare"),
    ("B109", "Drives", "HC2 bring-up: EPC9186HC2 GaN motor-drive evaluation board", "EPC", "EPC9186HC2", 1, 1100, "AUD", "buy", "E", "Y",
     "R10 S26 (eepower.com article); price not retrieved", "TI TIDA-010979 (1 kW only)", "estimate - quote from EPC/DigiKey"),
    ("B110", "Drives", "HC2 prototype spin: 2 PCB iterations, stencils, locked-rotor test fixture (150 A 2 s, 99 A 10 s)", "custom", "KES-HC2-NRE", 1, 2500, "AUD", "custom", "E", "Y",
     "R10 sec 7 item 3", "", "estimate"),
    ("B026", "Drives", "EtherCAT servo drive Novanta Everest S NET (8-80 V, 45 A)", "Novanta / Ingenia", "EVS-NET-E", 22, 620, "USD", "buy", "Q", "Y",
     "drives.novantamotion.com/eve-net (~US$620 indicative, R2)", "Elmo Gold Twitter 25/100; custom F28P65x drive", "all other rotary joints"),
    ("B027", "Drives", "Drive carrier PCB for Everest S (EtherCAT magnetics, RS-422 encoder receivers, STO, 5 V encoder supply, NTC inputs)", "JLCPCB / PCBWay", "KES-DRV-CAR", 22, 75, "AUD", "custom", "E", "Y",
     "docs/05 sec 6; JLCPCB assembly", "", "4-layer, 2 oz; HC2 carries its own"),
    # ------------------------------------------------------------------ battery & hot-swap power path
    ("B028", "Battery", "Li-ion cell Molicel INR-21700-P50B (5.0 Ah, 60 A)", "Molicel", "INR-21700-P50B", 200, 8.25, "USD", "buy", "V", "Y",
     "18650batterystore.com US$8.25 @200+ (R3; 200 cells cost less than 144 at the single-cell price)", "Molicel P45B (AU: Master Instruments / Batteries Direct)", "128 in 2 packs + 72 for matching rejects/spares (enough for a 3rd pack, B133)"),
    ("B029", "Battery", "Per-pack BMS KES-BMS16: TI BQ76952 16S AFE + BQ77216 secondary OVP + CAN-FD MCU + in-pack back-to-back 100 V NFET switch + 0.5 mOhm shunt + 8 NTC + pilot/wake + heater switch", "custom (TIDA-010208 pattern)", "KES-BMS16", 3, 450, "AUD", "custom", "E", "Y",
     f"{TI}BQ76952 ({ACC}); ti.com/product/BQ77216, ti.com/tool/TIDA-010208 (R3)", "Orion BMS 2 per pack (too large to live inside a hot-swap pack)", "2 + 1 spare; pack terminals dead unless seated"),
    ("B030", "Battery", "Pack power-path board KES-PPM, one per bay (robot side): TI LM5069 hot-swap controller + LM5050-1 ideal-diode controller (OR path), TPS48111-Q1 back-to-back tie switch, INA228 monitor, 12 x 100 V FETs, removal-interlock hardware AND, solenoid-lock driver, CAN-FD MCU (docs/05 sec 4.2)", "custom", "KES-PPM", 3, 420, "AUD", "custom", "E", "Y",
     f"{TI}LM5069, {TI}LM5050-1, {TI}TPS4811-Q1, {TI}INA228 ({ACC})", "per-pack contactors (Gigavac GX11 class) - heavier, no seamless OR-ing", "2 + 1 spare; 12 x 100 V FETs per board (Nexperia PSMN2R0-100SSF class, R2)"),
    ("B031", "Battery", "Pack fuse 100 A UL Class T + holder (selection rule: >=125 V DC rated, >=20 kA DC interrupting - verify on the datasheet)", "Littelfuse / Eaton Bussmann", "JLLN-100 / JJN-100 class", 4, 60, "AUD", "buy", "E", "Y",
     "element14 AU / RS AU (rating not verified this session)", "", "one per pack + 2 spares"),
    ("B032", "Battery", "Pack enclosure 16S4P: 6061 machined shell, mica liners, cell holders, Ni-plated Cu busbars, handle + cam lever, IP67 face seal, vent path, 15 W heater film", "CNC + make", "KES-BATT-ENC2", 2, 950, "AUD", "machine", "E", "Y", "docs/09", "", "<= 1.3 kg each for the 6.20 kg, 175 x 98 x 185 mm pack (params.py, docs/09 hold H12)"),
    ("B111", "Battery", "Hot-swap pack connector pair: floating blind-mate, sequenced (power make-first/break-last, pilot >= 2 mm shorter), CAN-FD + wake aux contacts, >= 60 A cont, >= 100 V", "Anderson Power Products (SBS series with auxiliary contacts) class", "SBS + aux (docs/03 sec 10.2)", 3, 180, "AUD", "buy", "E", "Y",
     "selection rule in docs/05 sec 4.4", "", "2 robot bays + 1 for the bench charger; estimate"),
    ("B112", "Battery", "Pack bay electrics (per bay): fail-locked removal-lock solenoid pin on the secondary catch, sealed lever micro-switch in the pilot loop (Omron D2SW class), lock-position switch, release button, 3-colour bay LED, keyed manual override", "make + buy", "KES-BAY", 2, 240, "AUD", "make", "E", "Y", "docs/05 sec 4.5; docs/03 sec 10.2 (bay mechanics)", "", "estimate; rails, cam lever and catch are in the structure/shell lines"),
    ("B113", "Battery", "In-pack thermal-event sensor (vent gas / pressure rise)", "TBD", "TBD", 2, 45, "AUD", "buy", "E", "Y", "docs/06 sec 1", "", "estimate"),
    # ------------------------------------------------------------------ power conversion & distribution
    ("B033", "Power", "DC-DC 36-75 V in -> 24 V 300 W isolated brick (Thor carrier, LiDAR, cameras) - logic bus", "TBD (Vicor / TDK-Lambda / RECOM)", "TBD", 1, 260, "AUD", "buy", "E", "Y",
     "docs/05 sec 5 (input range must cover 48-72 V)", "Mean Well RSD-300C-24 bench only (heavy, 62.4 V max)", ""),
    ("B034", "Power", "DC-DC 36-75 V in -> 12 V 150 W (RT computer, coolant pumps, fans, foot boards) - logic bus", "TBD", "TBD", 1, 180, "AUD", "buy", "E", "Y", "docs/05 sec 5", "", "~98 W peak load"),
    ("B035", "Power", "Power distribution board Mk II: 6 zone eFuses (TPS4811-class), actuator/logic bus split, brake chopper, dock charge-inlet TPS48111-Q1 channel, pump/fan drivers, bus V/I telemetry", "custom", "KES-PDU2", 1, 520, "AUD", "custom", "E", "Y", "docs/05 sec 5", "", ""),
    ("B036", "Power", "Brake resistor 5 ohm 100 W aluminium-clad + chopper MOSFET (2 in parallel = 2.5 ohm, ~2 kW at 70 V)", "TE / Arcol", "HS100 5R", 2, 45, "AUD", "buy", "E", "Y", "element14 AU", "", "regen dump when packs are not tied"),
    ("B037", "Power", "Dock charger 16S Li-ion, 67.2 V / 30 A (2 kW) CC/CV, CAN-controlled by the BMS master, RCM-approved", "TBD (TC Charger/Elcon or Delta-Q class)", "TBD", 1, 1500, "AUD", "buy", "E", "Y",
     "docs/05 sec 12 (R7 #8 target >= 2 kW)", "Mk I 10 A charger (3 h)", "estimate - quote"),
    ("B115", "Power", "Charging dock: frame, spring-blade contacts (CHG+/CHG-/CAN-H/CAN-L, >=50 A), robot-side contact block, smoke/heat sensor, docking fiducials", "make + buy", "KES-DOCK", 1, 950, "AUD", "make", "E", "Y", "docs/05 sec 12", "", "estimate"),
    # ------------------------------------------------------------------ compute & safety
    ("B038", "Compute", "NVIDIA Jetson T5000 module (AGX Thor)", "NVIDIA", "Jetson T5000", 1, 4999, "USD", "buy", "V", "Y",
     "nvidia.com (price after Jul-2026 increase, secondary, R4)", "Jetson T4000 (US$2,999, 40-70 W) drop-in", ""),
    ("B039", "Compute", "Carrier Seeed reComputer J601 (8x GMSL2, 4x CAN-FD, 4x10GbE)", "Seeed Studio", "J601", 1, 776, "EUR", "buy", "V", "Y", "openelab.io (pre-order, R4)", "Connect Tech Gauntlet AGX301", "19-48 V input - fed from 24 V rail"),
    ("B040", "Compute", "NVMe SSD 1 TB industrial", "Samsung / Kingston", "PM9A1 class", 1, 180, "AUD", "buy", "E", "Y", "Core Electronics / PLE", "", ""),
    ("B041", "Compute", "Real-time computer UP Squared Pro 7000 (i3-N305, 2x i226-IT)", "AAEON", "UPN-ADLN-i3-N305", 1, 499, "USD", "buy", "V", "Y", "up-board.org (sec, R4)", "ASRock Industrial NUC BOX-1360P", "IgH igc native driver"),
    ("B042", "Compute", "Safety MCU board (TI TMS570LC4357, dual-channel I/O, CAN, leak + coolant inputs)", "custom (TI LAUNCHXL2-570LC43 for dev)", "KES-SAFE", 1, 220, "AUD", "custom", "E", "Y", "ti.com/product/TMS570LC4357 (R2)", "", ""),
    ("B043", "Safety", "Wireless e-stop FORT Wireless E-Stop Pro (SIL3, RCM)", "FORT Robotics", "WES Pro", 1, 3500, "AUD", "buy", "Q", "Y", "fortrobotics.com/wireless-e-stop-pro (R2)", "Tele Radio Panther (PLd)", "quote required"),
    ("B044", "Safety", "Safety relay dual-channel + delayed-contact expansion (Cat 1 zone cut) (Pilz PNOZ s / Phoenix PSR class) + wired e-stop pendant 5 m + 2 on-robot buttons", "Pilz / Phoenix Contact", "PNOZ s3 + s7.1 class", 1, 800, "AUD", "buy", "E", "Y", "RS AU", "", "estimate"),
    ("B137", "Safety", "Commissioning stop hardware: 3 DC contactors (Gigavac GX11 class, >= 100 A cont, >= 80 V DC break; one per leg-zone feed + one in the bench-bus feed, opened by the safety relay's instantaneous contacts) + keyed main switch (PPM shed input) + sealed NC back-cover switch", "Gigavac / various", "GX11 class + switches", 1, 930, "AUD", "buy", "E", "Y",
     "P02 sec F; P08 parts list; docs/05 sec 4.6 and sec 8; docs/09 hold H8", "", "estimate (3 x A$280 contactor + A$90 switches, prices not verified); the contactors stay until the HC2 STO is proven"),
    # ------------------------------------------------------------------ sensors
    ("B045", "Sensors", "Stereo camera Stereolabs ZED X Mini (GMSL2, GS, 2.2 mm)", "Stereolabs", "ZED X Mini", 1, 549, "USD", "buy", "V", "Y", "stereolabs.com (en-au store, R4)", "Orbbec Gemini 336L", "head"),
    ("B046", "Sensors", "Wide mono camera ZED X One GS (AR0234, GMSL2)", "Stereolabs", "ZED X One GS", 2, 399, "EUR", "buy", "V", "Y", "stereolabs.com (R4)", "TechNexion VLS-GM2-AR0234 191° (US$188.50)", "head temples, VIO/SLAM"),
    ("B047", "Sensors", "Depth camera Orbbec Gemini 335Lg (GMSL2)", "Orbbec", "Gemini 335Lg", 1, 450, "USD", "buy", "Q", "Y", "orbbec.com (335L US$413 at RobotShop, R4)", "RealSense D457", "abdomen, terrain/feet"),
    ("B048", "Sensors", "3D LiDAR Livox Mid-360", "Livox (DJI)", "Mid-360", 1, 979, "USD", "buy", "V", "Y", "livoxtech.com (price secondary, R4)", "Hesai JT128", "crown of head"),
    ("B049", "Sensors", "IMU MicroStrain 3DM-CV7-AHRS (1.5 deg/h)", "HBK MicroStrain", "3DM-CV7-AHRS", 1, 1500, "AUD", "buy", "Q", "Y", "Metromatics (AU)", "Xsens MTi-630", "pelvis"),
    ("B050", "Sensors", "Industrial IMU TDK IIM-46230 (safety MCU)", "TDK InvenSense", "IIM-46230", 1, 480.72, "AUD", "buy", "V", "Y", "digikey.com.au (R4)", "ADIS16500", ""),
    ("B051", "Sensors", "Foot sole compression load cells 500 N + foot board (4 per foot)", "TE / Futek class", "FX29 class (TE marked unavailable)", 8, 55, "AUD", "buy", "E", "Y", "confirm stock before design freeze", "FSR arrays", "also the payload-mass estimate (docs/07)"),
    ("B052", "Sensors", "Fingertip 3-axis force sensor Contactile 3D Force Button Ø10, 0-20 N", "Contactile (Sydney)", "3DFBS-10-20N", 10, 250, "AUD", "buy", "Q", "Y", "contactile.com (R5)", "PaXini PX6AX GEN4", ""),
    ("B053", "Sensors", "Palm magnetic tactile skin (AnySkin/ReSkin pattern, 5x MLX90393)", "builder", "KES-SKIN", 2, 60, "AUD", "make", "E", "Y", "arXiv 2409.08276 (R5)", "", ""),
    ("B054", "Sensors", "ToF multizone ST VL53L5CX modules (shins, forearms, head)", "ST / Pololu", "VL53L5CX", 8, 30, "USD", "buy", "V", "Y", "pololu.com/product/3417", "VL53L8CX", ""),
    ("B055", "Sensors", "Microphone array ReSpeaker XVF3800 + speaker 3 W + I2S amp", "Seeed Studio", "XVF3800", 1, 95, "USD", "buy", "V", "Y", "seeedstudio.com", "", ""),
    ("B116", "Sensors", "Palm camera TechNexion VLS-GM2-AR0234 (global shutter, 191° M12, GMSL2)", "TechNexion", "VLS-GM2-AR0234-C-S191-IR", 2, 188.50, "USD", "buy", "V", "Y",
     "technexion.com/shop/serdes/gmsl/gmsl2/vls/uvls-gm2-ar0234-c-s191-ir/ (R4)", "ZED X One GS (larger)", "module size not verified for the palm - check before hand CAD freeze"),
    ("B117", "Sensors", "Palm-camera link: torsion-rated 50 ohm micro-coax through elbow/wrist + FAKRA-Z break at the forearm", "various", "-", 2, 90, "AUD", "buy", "E", "Y", "docs/05 sec 9", "", "estimate"),
    ("B056", "Sensors", "Wrist 6-axis F/T sensor Bota SensONE T5 (EtherCAT)", "Bota Systems", "SensONE T5", 2, 5617.5, "CHF", "buy", "V", "O",
     "shop.botasys.com", "ATI Mini45 SI-290-10", "OPTION: baseline uses joint-torque flexures + current for wrench estimation"),
    ("B057", "Sensors", "Ankle 6-axis F/T Bota PixONE T60 (through-hole)", "Bota Systems", "PixONE T60", 2, 7500, "AUD", "buy", "Q", "O", "shop.botasys.com", "", "OPTION: baseline uses 4 load cells per foot"),
    # ------------------------------------------------------------------ hands Mk II (13 DOA each)
    ("B058", "Hands", "Hand Mk II standard micro linear actuator: maxon DCX 10 L 9 V + GPX 10 + ENX 10 + KSS SR0401K Ø4x1 ball screw + guide", "maxon / KSS", "DCX10L+GPX10+SR0401K", 16, 430, "AUD", "buy", "E", "Y",
     "maxon motor Australia; DCX10L EUR 103.89 (maxongroup.com, R5)", "Faulhaber 1226 B + 12/4 (Erntec)", "8 per hand"),
    ("B118", "Hands", "Hand Mk II high-force flexor actuator: maxon DCX 12 L 9 V + GPX 12 + ENX + KSS SR0401K (power grasp >= 200 N)", "maxon / KSS", "DCX12L+GPX12+SR0401K", 10, 520, "AUD", "buy", "E", "Y",
     "DCX12L EUR 142.31 (maxongroup.com, R5)", "", "5 per hand; motors run from the hand's local 12 V buck"),
    ("B059", "Hands", "Hand joint angle sensors TI TMAG5273 + diametric magnets", "TI", "TMAG5273", 32, 4, "AUD", "buy", "E", "Y", "digikey.com.au (R5)", "AS5600", "13 per hand + spares"),
    ("B060", "Hands", "Hand controller Mk II (F28P65x + 13 H-bridges + EtherCAT + local 12 V buck, fed 24 V from the KW-L2 forearm board), ref TI TIDA-010992", "custom", "KES-HAND2", 3, 380, "AUD", "custom", "E", "Y", "ti.com/tool/TIDA-010992 (R2)", "", "2 + 1 spare; one EtherCAT slave per hand (the KW-L2 board B107 is a separate slave: 30 in total, docs/05 sec 7)"),
    ("B061", "Hands", "Hand Mk II mechanical set: 7075 palm frame, 4-DOF thumb, abduction, Ti pins, MJF PA12-CF links, ring/little tendons, Dragon Skin 20 caps, palm-camera window", "CNC + MJF + make", "KES-HAND2-MECH", 2, 1200, "AUD", "machine", "E", "Y", "docs/09", "", "estimate"),
    ("B062", "Hands", "Commercial fallback: Inspire RH56DFTP dexterous hand (6 DOA, tactile)", "Inspire Robots", "RH56DFTP", 2, 5181.72, "GBP", "buy", "V", "O", "robosavvy.co.uk (incl. VAT, R5)", "Linker Hand O6 (US$1,499)", "OPTION: replaces the custom hand (misses the Mk II 13-DOA target)"),
    # ------------------------------------------------------------------ structure
    ("B063", "Structure", "Pelvis bowl 7075-T6, 5-axis machined, hard anodised black", "CNC job shop", "KES-PEL-01", 1, 1400, "AUD", "machine", "E", "Y", "cad/out/step/pelvis__pelvis_bowl.step", "", ""),
    ("B064", "Structure", "Torso spine plate + ribs 7075-T6 + CF closeouts", "CNC job shop", "KES-TOR-01..03", 1, 1300, "AUD", "machine", "E", "Y", "cad/out/step/torso__*.step", "", ""),
    ("B065", "Structure", "Hip yaw-roll yokes + roll-pitch brackets 7075-T6 (L/R)", "CNC job shop", "KES-HIP-01/02", 4, 420, "AUD", "machine", "E", "Y", "cad/out/step/l_hip__*.step", "", ""),
    ("B066", "Structure", "Thigh plates 7075-T6 (4) + CF tubes Ø40x2 (2)", "CNC + Enhanced Composites", "KES-THI-01..03", 1, 1100, "AUD", "machine", "E", "Y", "enhancedcomposites.com.au", "", ""),
    ("B067", "Structure", "Knee push-rods Ti-6Al-4V tube 16x2 + M12 rod ends (2 sets)", "CNC + SKF/igus", "KES-KNE-ROD", 2, 260, "AUD", "machine", "E", "Y", "Specialty Metals (Ti), CBC (rod ends)", "17-4PH H1025 tube", ""),
    ("B068", "Structure", "Knee cranks + knee hubs 7075-T6 / 17-4PH bushings", "CNC", "KES-KNE-01/02", 2, 380, "AUD", "machine", "E", "Y", "estimate, machined/made to cad/out drawings (docs/09)", "", ""),
    ("B069", "Structure", "Shank upper fittings 7075 + CF tubes + ankle push-rods Ti (2 legs)", "CNC + composites", "KES-SHK-01..03", 2, 620, "AUD", "machine", "E", "Y", "estimate, machined/made to cad/out drawings (docs/09)", "", ""),
    ("B070", "Structure", "Ankle cross Ti-6Al-4V + 4 INA HK1212 drawn cups + 2 Ø12 h6 100Cr6 60-64 HRC ground pins (docs/09 hold H13) + foot plate 7075 + replaceable NBR sole", "CNC", "KES-FT-01..03", 2, 650, "AUD", "machine", "E", "Y", "estimate, machined/made to cad/out drawings (docs/09)", "", ""),
    ("B071", "Structure", "Arm structure: shoulder brackets, upper-arm CF tubes + fittings, forearm frames, wrist cross (Ti)", "CNC", "KES-ARM-01..05", 2, 950, "AUD", "machine", "E", "Y", "estimate, machined/made to cad/out drawings (docs/09)", "", ""),
    ("B072", "Structure", "Neck yoke + head frame 6061/PA12-CF", "CNC + MJF", "KES-HEAD-01", 1, 420, "AUD", "machine", "E", "Y", "estimate, machined/made to cad/out drawings (docs/09)", "", ""),
    # ------------------------------------------------------------------ shells / CMF
    ("B073", "Shells", "Exterior shells MJF PA12 (~42 panels, ~4,600 cm3), bead-blasted", "KAD3D / Formero (AU)", "KES-SHELL-*", 1, 2300, "AUD", "print", "E", "Y", "kad3d.com.au", "SLS PA11, FDM ASA prototypes", "STEP in cad/out/step"),
    ("B074", "Shells", "Shell finishing: primer + 2K satin warm-white + matte graphite, clearcoat", "automotive paint shop", "-", 1, 2500, "AUD", "custom", "E", "Y", "local", "", ""),
    ("B075", "Shells", "Visor PC thermoformed / machined smoked, AR-coated camera windows", "plastics shop", "KES-VIS-01", 1, 450, "AUD", "custom", "E", "Y", "estimate, machined/made to cad/out drawings (docs/09)", "", ""),
    ("B076", "Shells", "Magnetic shell fasteners (N52 disc + steel pads) + captive M3 quarter-turn studs", "various", "-", 1, 220, "AUD", "buy", "E", "Y", "estimate, machined/made to cad/out drawings (docs/09)", "", ""),
    ("B077", "Shells", "Waist + ankle TPU bellows/gaiters (cast or printed TPU 95A)", "print", "KES-BEL-01", 3, 80, "AUD", "print", "E", "Y", "estimate, machined/made to cad/out drawings (docs/09)", "", ""),
    # ------------------------------------------------------------------ harness
    ("B078", "Harness", "Power wire (silicone 8/10/12/14/16 AWG, tinned; 10 AWG leg feeds ~2 m each way through the external service loops), EtherCAT robot cable (igus chainflex CF Robot), signal cable", "igus / various", "CFROBOT8 etc.", 1, 1700, "AUD", "buy", "E", "Y", "Treotham (igus AU)", "", "no cable runs through an actuator bore (docs/03 sec 11)"),
    ("B079", "Harness", "Connectors: Amphenol SurLok Plus (pack-to-PPM), Harwin Gecko-MT (signal), JST GH (sensors), XT60H/XT30 (branches), IP67 sensor connectors", "Amphenol / Harwin / JST", "-", 1, 1250, "AUD", "buy", "E", "Y", "element14 AU / RS AU", "", ""),
    ("B136", "Harness", "Service-loop hardware for the external leg/waist routing (docs/03 sec 11): PA12-MJF loop guides with a cable channel above the hose channel (waist clock-spring former, 2 hip-yaw partial clock-springs, 2 hip-pitch C-troughs R85, U-loop clips at waist pitch and both hip rolls), PET braided abrasion sleeve, saddle clamps / P-clips for strain relief at both fixed points of every loop, edge grommets", "KAD3D / Formero (MJF) + various", "KES-LOOP", 1, 340, "AUD", "print", "E", "Y",
     "docs/03 sec 11; docs/09 hold H2", "", "estimate: MJF guides ~A$240, sleeve + clamps + grommets ~A$100"),
    # ------------------------------------------------------------------ cooling (Mk II liquid loop + electronics air)
    ("B080", "Cooling", "Electronics blowers 12 V (torso: RT computer, PDU, DC-DCs), MJF ducts, filters", "Delta / Sunon", "BFB04512 class", 2, 35, "AUD", "buy", "E", "Y", "element14 AU", "", "leg blowers deleted (liquid-cooled knee/hip pitch)"),
    ("B119", "Cooling", "Coolant pump to docs/03 sec 9.4: brushless 12 V, >= 0.8 L/min at >= 60 kPa, tach, glycol-compatible, <= 0.15 kg, <= 10 W", "TCS Micropumps (M510 series) class", "M510 class", 3, 220, "AUD", "buy", "E", "Y",
     "micropumps.co.uk (site unavailable 2026-11-09; price not verified)", f"Koolance PMP-420 US$83.36, 17 W, 5.8 m, 284 g - over the mass/power spec ({KOOL_PMP420}, {ACC})", "one per leg branch + 1 spare; check the head-flow curve against docs/03 sec 9.5"),
    ("B120", "Cooling", "Radiator 240 x 120 mm face, <= 30 mm core, ~20 W/K at full fan speed, mixed-metal-safe (docs/03 sec 9.4)", "Alphacool (NexXxoS ST30 240) class", "ST30 240 class", 1, 120, "AUD", "buy", "E", "Y",
     "alphacool.com (price not verified)", f"Koolance HX-720 aluminium US$69.60, 1.18 kg ({KOOL_HX720}, {ACC})", "W/K to be measured on B131"),
    ("B121", "Cooling", "Radiator fans 120 mm, IP68 (wet duct), 12 V PWM + tach (docs/03 sec 9.4)", "Sanyo Denki (San Ace 9WP) class", "9WP class", 2, 85, "AUD", "buy", "E", "Y", "sanyodenki.com (price not verified)", "", "estimate"),
    ("B122", "Cooling", "Coolant: 40 % propylene glycol + mixed-metal inhibitor, premixed, 2 L (loop 0.47 L, loop bench B131 and top-up; freezes ~ -21 C)", "Dow (DOWFROST) / automotive OAT class", "-", 1, 60, "AUD", "buy", "E", "Y",
     "docs/03 sec 9.4 (price not verified)", "any aluminium-safe OAT coolant at 40 % (not an insulative PC coolant: no stated freeze point, and it blinds the B129 leak pads)", "estimate; the loop bench B131 runs the same mix (docs/09 hold H11)"),
    ("B123", "Cooling", "Spring-diaphragm compensator 40 mL (EPDM membrane, PA12 housing) with fill/bleed valve - sealed loop, no reservoir", "custom", "KES-COMP", 1, 140, "AUD", "make", "E", "Y", "docs/03 sec 9.2; docs/09", "", "estimate"),
    ("B124", "Cooling", "Liquid cold plate for the Jetson T5000 module, machined 6061", "CNC job shop", "KES-CP-THOR", 1, 380, "AUD", "machine", "E", "Y", "estimate", "", "replaces Mk I heat pipes"),
    ("B125", "Cooling", "No-spill flat-face dry-break coupling pair, >= 3 mm flow path, EPDM, blind-mate capable (2 per leg)", "CPC (LQ2 / PLQ2) / Koolance QD3 class", "LQ2 class", 4, 75, "AUD", "buy", "E", "Y", "estimate", "", "leg module swap without draining"),
    ("B126", "Cooling", "Hose 6 mm ID x 10 mm OD EPDM / Norprene (6 m), fittings, clamps, supply + return manifolds, 2 check valves (<= 3 kPa cracking)", "various", "-", 1, 260, "AUD", "buy", "E", "Y", "estimate", "", ""),
    ("B127", "Cooling", "Liquid flow sensor Sensirion SLF3S-4000B (600 ml/min FS, I2C, 3 bar), one per leg branch", "Sensirion", "SLF3S-4000B", 2, 200, "AUD", "buy", "E", "Y",
     f"{SENSIRION} ({ACC}; price not shown)", "Digmesa turbine sensor", "calibrated for water - check on the coolant"),
    ("B128", "Cooling", "Coolant temperature probe, thread-in 10k NTC", "various", "-", 6, 18, "AUD", "buy", "E", "Y", "estimate", "", "supply + return per leg branch, cold-plate outlet, 1 independent probe read by the safety MCU"),
    ("B129", "Cooling", "Leak sensing: 8 interdigitated PCB leak pads (HC2 drives, pumps, manifold, cold plate) + 1 m sensing cable in the torso floor", "custom + buy", "KES-LEAK", 1, 140, "AUD", "custom", "E", "Y", "estimate", "", ""),
    ("B130", "Cooling", "Loop pressure transducer 0-2.5 bar, stainless wetted (leak = pressure < 0.15 bar)", "TE Connectivity (M3200) class", "M3200 class", 1, 90, "AUD", "buy", "E", "Y", "estimate", "", ""),
    # ------------------------------------------------------------------ consumables
    ("B081", "Consumables", "Fasteners (12.9 alloy, A4 stainless, Ti Gr5 critical), dowels, HeliCoil Plus inserts, 2 DIN 580 M12 lifting eyes, thread-locker, thermal epoxy, grease", "AIMS / Bremick / Loctite / Boellhoff", "-", 1, 900, "AUD", "buy", "E", "Y", "aimsindustrial.com.au", "", ""),
    ("B082", "Consumables", "Spares allowance (1 of each actuator part, 2 Everest drives, sole, fingertip caps, O-rings)", "-", "-", 1, 8500, "AUD", "buy", "E", "Y", "estimate (~10 % of actuator + drive cost)", "", "~10 % of actuator + drive cost"),
    # ------------------------------------------------------------------ test infrastructure (robot-specific)
    ("B083", "Test rig", "Overhead gantry 2 t + trolley + fall-arrest harness/catch system for humanoid testing", "Hare & Forbes / lifting supplier", "-", 1, 4200, "AUD", "buy", "E", "Y", "docs/11 sec 2", "", ""),
    ("B084", "Test rig", "Actuator dynamometer: FUTEK TRS605 inline torque transducer + absorber motor/drive + frame (rated for 500 N m)", "FUTEK (Metromatics) + build", "TRS605", 1, 9000, "AUD", "buy", "Q", "Y", "metromatics.com.au", "reaction torque cell + lever", "docs/10 phase 1"),
    ("B085", "Test rig", "Single-leg test stand (vertical slide + load cells) and treadmill harness frame", "make", "-", 1, 2500, "AUD", "make", "E", "Y", "docs/11", "", ""),
    ("B131", "Test rig", "Coolant loop bench: 2-bar leak/decay test, flow and pressure-drop measurement, jacket thermal-resistance test", "make", "-", 1, 600, "AUD", "make", "E", "Y", "R10 sec 7 item 2", "", "estimate"),
    # ------------------------------------------------------------------ options (not in baseline)
    ("B133", "Battery", "Third hot-swap pack: KES-BMS16, enclosure, connector half, fuse (cells from B028 spares)", "custom", "KES-PACK-3", 1, 1600, "AUD", "custom", "E", "O", "docs/05 sec 12", "", "OPTION: continuous operation with rotation"),
    ("B134", "Power", "Off-board 2-bay pack charger (2 x 1 kW, CAN to pack BMS)", "TBD", "TBD", 1, 1800, "AUD", "buy", "E", "O", "docs/05 sec 12", "", "OPTION"),
    ("B135", "Drives", "KA-150X 20S package: 4 x KM-150x50-LCS motors + 200 A 150 V-class drives, 20S re-pack, 100 V-class replacement for every other drive and power-path IC", "custom", "KA-150X-20S", 1, 38000, "AUD", "custom", "E", "O", "docs/05 sec 2.1; R10 sec 5.3", "", "OPTION: rough estimate only"),
]

# Mk II change marker per line ("new" = added in Mk II, "changed" = same slot, different part/qty/price); others unchanged.
MK2_CHANGE = {i: "new" for i in ("B101", "B102", "B103", "B104", "B105", "B106", "B107", "B108", "B109", "B110", "B111", "B112",
                                 "B113", "B115", "B116", "B117", "B118", "B119", "B120", "B121", "B122", "B123", "B124",
                                 "B125", "B126", "B127", "B128", "B129", "B130", "B131", "B133", "B134", "B135", "B136",
                                 "B137", "B138")}
MK2_CHANGE.update({i: "changed" for i in ("B001", "B002", "B003", "B004", "B005", "B007", "B008", "B009", "B010", "B011", "B013",
                                          "B019", "B021", "B023", "B024", "B025", "B027", "B028", "B029", "B030", "B031", "B032",
                                          "B033", "B034", "B035", "B036", "B037", "B042", "B044", "B058", "B060", "B061", "B078",
                                          "B079", "B080", "B082", "B084")})


def rows():
    out = []
    ids = set()
    for it in ITEMS:
        bid, sub, item, mfr, pn, qty, up, cur, mb, st, base, src, alt, note = it
        if bid in ids:
            raise ValueError(f"duplicate BOM id {bid}")
        ids.add(bid)
        aud = up * FX[cur]
        out.append(dict(id=bid, subsystem=sub, item=item, manufacturer=mfr, part_number=pn, qty=qty,
                        unit_price=up, currency=cur, unit_aud=round(aud, 2), ext_aud=round(aud * qty, 2),
                        make_buy=mb, price_status=st, baseline=base, mk2_change=MK2_CHANGE.get(bid, "unchanged"),
                        source_supplier=src, alternative=alt, notes=note))
    return out


def write():
    R = rows()
    (ROOT / "data").mkdir(exist_ok=True)
    with open(ROOT / "data" / "bom.csv", "w", newline="") as f:
        w = csv.DictWriter(f, fieldnames=list(R[0].keys()))
        w.writeheader()
        w.writerows(R)
    base = [r for r in R if r["baseline"] == "Y"]
    opt = [r for r in R if r["baseline"] == "O"]
    by_sub = {}
    for r in base:
        by_sub[r["subsystem"]] = by_sub.get(r["subsystem"], 0) + r["ext_aud"]
    tot = sum(by_sub.values())
    st = {}
    for r in base:
        st[r["price_status"]] = st.get(r["price_status"], 0) + r["ext_aud"]
    L = ["# Bill of materials - KESTREL K1 Mk II (generated)", "",
         f"Source: `calc/kestrel/bom.py` -> `data/bom.csv`. FX (AUD per unit): " +
         ", ".join(f"{k} {v}" for k, v in FX.items() if k != "AUD") + ". Price status: **V** seen on manufacturer/retailer page, "
         "**Q** quote-only (estimate), **E** engineering estimate. Baseline = Y; options excluded from totals. "
         "IDs are stable across revisions (Mk II additions start at B101). Change: Mk II vs Mk I.", "",
         "| ID | Subsystem | Item | Mfr / P/N | Qty | Unit (AUD) | Ext (AUD) | Make/buy | Status | Change | AU supplier / source | Alternative |",
         "|---|---|---|---|---|---|---|---|---|---|---|---|"]
    for r in R:
        flag = "" if r["baseline"] == "Y" else " *(option)*"
        L.append(f"| {r['id']} | {r['subsystem']} | {r['item']}{flag} | {r['manufacturer']} {r['part_number']} | {r['qty']} | {r['unit_aud']:,.0f} | "
                 f"{r['ext_aud']:,.0f} | {r['make_buy']} | {r['price_status']} | {r['mk2_change']} | {r['source_supplier']} | {r['alternative']} |")
    (ROOT / "docs" / "generated" / "bom.md").write_text("\n".join(L) + "\n")
    C = ["# Cost summary - KESTREL K1 Mk II (generated)", "",
         "| Subsystem | Mk II baseline AUD | Share | Mk I AUD | Delta AUD |", "|---|---|---|---|---|"]
    subs = sorted(set(by_sub) | set(MK1_BY_SUB), key=lambda k: -by_sub.get(k, 0))
    for k in subs:
        v = by_sub.get(k, 0)
        m1 = MK1_BY_SUB.get(k, 0)
        C.append(f"| {k} | {v:,.0f} | {100 * v / tot:.1f} % | {m1:,.0f} | {v - m1:+,.0f} |")
    C.append(f"| **Baseline robot parts + robot-specific test rig** | **{tot:,.0f}** | 100 % | **{MK1_TOTAL:,.0f}** | "
             f"**{tot - MK1_TOTAL:+,.0f} ({100 * (tot - MK1_TOTAL) / MK1_TOTAL:+.1f} %)** |")
    C += ["", "By price confidence:", ""]
    for k, lbl in (("V", "seen price"), ("Q", "quote-only estimate"), ("E", "engineering estimate")):
        C.append(f"- {lbl} ({k}): A${st.get(k, 0):,.0f} ({100 * st.get(k, 0) / tot:.0f} %)")
    C += ["", "Options (not in total):", ""]
    for r in opt:
        C.append(f"- {r['id']} {r['item']}: A${r['ext_aud']:,.0f}")
    (ROOT / "docs" / "generated" / "cost_summary.md").write_text("\n".join(C) + "\n")
    return tot, by_sub, st, opt


if __name__ == "__main__":
    tot, by_sub, st, opt = write()
    print(f"baseline A${tot:,.0f}  (Mk I A${MK1_TOTAL:,.0f}, delta {tot - MK1_TOTAL:+,.0f} = {100 * (tot - MK1_TOTAL) / MK1_TOTAL:+.1f} %)")
    for k, v in sorted(by_sub.items(), key=lambda x: -x[1]):
        print(f"  {k:24s} {v:10,.0f}   (Mk I {MK1_BY_SUB.get(k, 0):9,.0f})")
    print({k: round(v) for k, v in st.items()})
