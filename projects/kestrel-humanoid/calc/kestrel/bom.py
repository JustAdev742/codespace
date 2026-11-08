"""Bill of materials and cost roll-up for KESTREL K1.

Every line records: price status
  V  = price seen on a manufacturer / retailer page during research (docs/research/R1-R6)
  Q  = quote-only part: price is an ESTIMATE pending a formal quote
  E  = engineering estimate (custom / machined / not found)
make/buy: buy | machine (CNC job shop) | print (MJF/FDM) | make (builder fabricates) | custom (outsourced to drawing)
baseline: Y = needed for the baseline robot; O = recommended option (excluded from the baseline total).

FX assumptions (AUD per unit, November 2026; update before ordering):
"""
from __future__ import annotations

import csv
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
FX = {"AUD": 1.0, "USD": 1.52, "EUR": 1.65, "GBP": 1.95, "CHF": 1.75, "CNY": 0.21}
__doc__ += "  " + ", ".join(f"{k} {v}" for k, v in FX.items() if k != "AUD") + "\n"

# (subsystem, item, manufacturer, part_no, qty, unit_price, cur, make_buy, status, baseline, source/supplier, alternative, notes)
ITEMS = [
    # ------------------------------------------------------------------ actuators: motors
    ("Actuators - motors", "Custom frameless motor KM-130x45 (knee), kit of laminations+magnets+wire+rotor iron", "builder / lamination & magnet vendors", "KM-130x45", 2, 1100, "AUD", "custom", "E", "Y",
     "docs/13; lamination stack by laser/EDM job shop, N42SH arc magnets (custom order)", "MyActuator X15-450 integrated (72 V part, slower at 16S)", "36 slots / 42 poles, 5 turns x 2 paths; design in calc/kestrel/motor_design.py"),
    ("Actuators - motors", "Custom frameless motor KM-130x40 (hip pitch)", "builder / vendors", "KM-130x40", 2, 1050, "AUD", "custom", "E", "Y",
     "docs/13", "MyActuator X12-320 integrated (fits hip pitch with reduced speed margin)", "same laminations as KM-130x45, 40 mm stack, 3 turns"),
    ("Actuators - motors", "Frameless motor kit TQ-RoboDrive ILM85x26", "TQ-Systems", "ILM85x26", 3, 1300, "AUD", "buy", "Q", "Y",
     "tq-group.com TQ-RoboDrive (10-12 wk)", "CubeMars RI100 / KM custom", "hip roll x2, waist pitch x1"),
    ("Actuators - motors", "Frameless motor kit CubeMars RI85-PH KV85", "CubeMars (T-Motor)", "RI85-PH", 11, 300, "USD", "buy", "Q", "Y",
     "cubemars.com catalogue 2026", "TQ ILM85x13", "hip yaw x2, waist yaw, ankle x4, shoulder yaw x2, elbow x2"),
    ("Actuators - motors", "Frameless motor kit TQ-RoboDrive ILM85x13", "TQ-Systems", "ILM85x13", 4, 1100, "AUD", "buy", "Q", "Y",
     "tq-group.com", "CubeMars RI85-PH", "shoulder pitch x2, shoulder roll x2"),
    ("Actuators - motors", "Custom frameless motor KM-50x20 (12s/14p)", "builder / vendors", "KM-50x20", 4, 220, "AUD", "custom", "E", "Y",
     "docs/13", "CubeMars RI50 class (verify specs)", "wrist yaw x2, neck x2"),
    # ------------------------------------------------------------------ actuators: gears
    ("Actuators - gears", "Custom 2-stage planetary gear set 14:1 (s1 m0.8 3.5:1, s2 m1.25 4:1), ground, case-hardened", "gear job shop", "KA-130-PG", 4, 1250, "AUD", "custom", "E", "Y",
     "docs/09 gear drawings; 18CrNiMo7-6 carburised, ISO 6", "KHK stock ground gears modified + EDM ring", "knee x2, hip pitch x2"),
    ("Actuators - gears", "Custom 2-stage planetary gear set 32:1", "gear job shop", "KA-110-PG", 3, 950, "AUD", "custom", "E", "Y", "docs/09", "KHK stock gears", ""),
    ("Actuators - gears", "Custom 2-stage planetary gear set 23:1", "gear job shop", "KA-90-PG", 7, 800, "AUD", "custom", "E", "Y", "docs/09", "KHK stock gears", ""),
    ("Actuators - gears", "Strain-wave component set size 25, 50:1 (CSG-25-50 equivalent)", "Leaderdrive", "LHSG-25-50", 4, 420, "USD", "buy", "Q", "Y",
     "leaderdrive.com (CSG-identical ratings)", "Harmonic Drive CSG-25-50 (premium, ~2-3x)", "shoulder pitch/roll"),
    ("Actuators - gears", "Strain-wave component set size 20, 50:1", "Leaderdrive", "LHSG-20-50", 4, 360, "USD", "buy", "Q", "Y", "leaderdrive.com", "Harmonic Drive CSG-20-50", "shoulder yaw, elbow"),
    ("Actuators - gears", "Strain-wave component set size 14, 50:1", "Leaderdrive", "LHSG-14-50", 4, 300, "USD", "buy", "Q", "Y", "leaderdrive.com", "Harmonic Drive CSG-14-50", "wrist yaw, neck"),
    # ------------------------------------------------------------------ actuators: bearings, encoders, housings
    ("Actuators - bearings", "Crossed-roller output bearing ~ID90/OD120 (KA-130)", "THK / IKO", "RU/CRBH class", 4, 380, "AUD", "buy", "Q", "Y", "Statewide Bearings (THK AU)", "Chinese CRB equivalents (~1/3 cost)", ""),
    ("Actuators - bearings", "Crossed-roller output bearing ~ID60/OD90 (KA-110, KA-90)", "THK / IKO", "RU/CRBH class", 10, 260, "AUD", "buy", "Q", "Y", "Statewide Bearings / CBC", "Chinese CRB", ""),
    ("Actuators - bearings", "Crossed-roller output bearing (KH-25/20/14)", "THK / IKO", "RA/CRBS class", 12, 190, "AUD", "buy", "Q", "Y", "Statewide Bearings / CBC", "Chinese CRB", ""),
    ("Actuators - bearings", "Thin-section deep-groove rotor bearings (2 per actuator)", "NSK / SKF", "68xx / 61xx", 52, 22, "AUD", "buy", "E", "Y", "CBC Australia / BSC", "", ""),
    ("Actuators - sensing", "Absolute encoder RLS AksIM-2 readhead + ring, BiSS-C, 19-20 bit", "RLS", "MB049 + MRA049", 33, 300, "USD", "buy", "V", "Y",
     "rls.si; DigiKey marketplace US$199 readhead", "Netzer DS-58 (output), MT6835 (motor)", "26 output + 7 motor-side (legs/waist)"),
    ("Actuators - sensing", "Magnetic motor encoder IC MagnTek MT6835 + magnet + PCB", "MagnTek", "MT6835GT", 19, 18, "AUD", "buy", "E", "Y", "lcsc.com C2932578", "MA732 / AS5047P", "motor side, arms/neck/ankle/yaw"),
    ("Actuators - sensing", "Strain-gauge torque flexure kit (HBK XY41 gauges x4, ADS1262 front-end)", "HBK / TI", "XY41-3/350 + ADS1262", 10, 260, "AUD", "make", "E", "Y",
     "hbkworld.com; ti.com/product/ADS1262", "FUTEK TFF400 (via Metromatics)", "arm joints KH-25/KH-20 for collision detection"),
    ("Actuators - sensing", "Winding NTC thermistors EPCOS B57861S0103F045", "TDK", "B57861S0103F045", 60, 3.5, "AUD", "buy", "E", "Y", "element14 AU / DigiKey AU", "", "2 per motor + spares"),
    ("Actuators - housings", "KA-130 machined housing set (front, rear cap, rotor hub, carriers, flange), 7075-T6 hard anodised", "CNC job shop", "KA-130-H", 4, 950, "AUD", "machine", "E", "Y",
     "PCBWay CNC / JLCCNC / local shop", "", "fins, bearing seats H6/k5"),
    ("Actuators - housings", "KA-110 / KA-90 machined housing set", "CNC job shop", "KA-110/90-H", 10, 650, "AUD", "machine", "E", "Y", "PCBWay CNC", "", ""),
    ("Actuators - housings", "KH-25/20/14 machined housing set incl. torque flexure (Ti on KH-25/20)", "CNC job shop", "KH-H", 12, 520, "AUD", "machine", "E", "Y", "PCBWay CNC (Ti Gr5)", "", ""),
    ("Actuators - wrist", "Wrist linear actuator: maxon DCX 16 L + GPX 16 + KSS Ø6x2 ball screw + linear guide", "maxon / KSS", "DCX16L + GPX16 + SR0602", 4, 650, "AUD", "buy", "E", "Y",
     "maxon motor Australia (Mt Kuring-Gai NSW); kssballscrew.com", "Faulhaber 1724 + 15A via Erntec", "wrist pitch/roll parallel pair x2 arms"),
    # ------------------------------------------------------------------ drives
    ("Drives", "High-current EtherCAT servo drive 100 V class (Elmo Platinum Twitter R70/100 class)", "Elmo Motion Control", "PLA-TWI R70/100", 4, 1600, "AUD", "buy", "Q", "Y",
     "elmomc.com/product/platinum-twitter/", "custom GaN drive per TI TIDA-010979", "knee x2, hip pitch x2"),
    ("Drives", "EtherCAT servo drive Novanta Everest S NET (8-80 V, 45 A)", "Novanta / Ingenia", "EVS-NET-E", 22, 620, "USD", "buy", "Q", "Y",
     "drives.novantamotion.com/eve-net (~US$620 indicative)", "Elmo Gold Twitter 25/100; custom F28P65x drive", "all other rotary joints"),
    ("Drives", "Drive carrier PCB (EtherCAT magnetics, RS-422 encoder receivers, STO, 5 V encoder supply, NTC inputs)", "JLCPCB / PCBWay", "KES-DRV-CAR", 26, 75, "AUD", "custom", "E", "Y",
     "docs/05 sec 6; JLCPCB assembly", "", "4-layer, 2 oz"),
    # ------------------------------------------------------------------ battery & power
    ("Battery", "Li-ion cell Molicel INR-21700-P50B (5.0 Ah, 60 A)", "Molicel", "INR-21700-P50B", 106, 8.25, "USD", "buy", "V", "Y",
     "18650batterystore.com US$8.25 @200+ (import via DG freight)", "Molicel P45B 16S7P (AU: Master Instruments / Batteries Direct)", "96 + 10 spares for matching"),
    ("Battery", "BMS Orion BMS 2 (24-cell) + 500 A Hall current sensor + harness", "Ewert Energy Systems", "Orion BMS 2", 1, 1100, "USD", "buy", "V", "Y",
     "orionbms.com (24-cell US$820 + sensor/harness)", "custom TI BQ76952 + BQ77216 board (TIDA-010208 base)", "Orion Jr 2 is limited to 60 V - not usable at 16S"),
    ("Battery", "Solid-state disconnect + precharge board (TI TPS48111 + back-to-back 100 V MOSFETs)", "custom", "KES-SSD", 1, 260, "AUD", "custom", "E", "Y",
     "ti.com/product/TPS4811-Q1", "Gigavac GX11 contactor", "bidirectional, 150 A cont"),
    ("Battery", "Pack fuse 125 A, >=80 V DC, high breaking capacity (EV/MIDI class)", "Littelfuse / Eaton Bussmann", "TBD >=80 VDC", 2, 45, "AUD", "buy", "E", "Y",
     "element14 AU", "", "one spare; verify DC rating before purchase"),
    ("Battery", "Pack enclosure 6061 machined + mica liners + cell holders + Ni-plated Cu busbars + thermal pads", "CNC + make", "KES-BATT-ENC", 1, 950, "AUD", "machine", "E", "Y", "docs/09", "", ""),
    ("Power", "DC-DC 36-75 V in -> 24 V 300 W isolated brick (Thor carrier, LiDAR, cameras)", "TBD (Vicor / TDK-Lambda / RECOM)", "TBD", 1, 260, "AUD", "buy", "E", "Y",
     "docs/05 sec 5 (input range must cover 48-67.2 V)", "Mean Well RSD-300C-24 bench only (heavy, 62.4 V max)", ""),
    ("Power", "DC-DC 36-75 V in -> 12 V 150 W (RT computer, fans, hands)", "TBD", "TBD", 1, 180, "AUD", "buy", "E", "Y", "docs/05", "", ""),
    ("Power", "Power distribution board (zone eFuses TPS4811-class x6, bus clamp/brake chopper, current sense)", "custom", "KES-PDU", 1, 420, "AUD", "custom", "E", "Y", "docs/05", "", ""),
    ("Power", "Brake resistor 8 ohm 100 W aluminium-clad + chopper MOSFET", "TE / Arcol", "HS100 8R", 1, 45, "AUD", "buy", "E", "Y", "element14 AU", "", "regen clamp at 72 V"),
    ("Power", "Charger 16S Li-ion 67.2 V 10 A, CC/CV, CAN-controlled by BMS", "TBD", "TBD", 1, 450, "AUD", "buy", "E", "Y", "docs/05", "", ""),
    # ------------------------------------------------------------------ compute & safety
    ("Compute", "NVIDIA Jetson T5000 module (AGX Thor)", "NVIDIA", "Jetson T5000", 1, 4999, "USD", "buy", "V", "Y",
     "nvidia.com (price after Jul-2026 increase, secondary)", "Jetson T4000 (US$2,999, 40-70 W) drop-in", ""),
    ("Compute", "Carrier Seeed reComputer J601 (8x GMSL2, 4x CAN-FD, 4x10GbE)", "Seeed Studio", "J601", 1, 776, "EUR", "buy", "V", "Y", "openelab.io (pre-order)", "Connect Tech Gauntlet AGX301", "19-48 V input - fed from 24 V rail"),
    ("Compute", "NVMe SSD 1 TB industrial", "Samsung / Kingston", "PM9A1 class", 1, 180, "AUD", "buy", "E", "Y", "Core Electronics / PLE", "", ""),
    ("Compute", "Real-time computer UP Squared Pro 7000 (i3-N305, 2x i226-IT)", "AAEON", "UPN-ADLN-i3-N305", 1, 499, "USD", "buy", "V", "Y", "up-board.org (sec)", "ASRock Industrial NUC BOX-1360P", "IgH igc native driver"),
    ("Compute", "Safety MCU board (TI TMS570LC4357, dual-channel I/O, CAN)", "custom (TI LAUNCHXL2-570LC43 for dev)", "KES-SAFE", 1, 220, "AUD", "custom", "E", "Y", "ti.com/product/TMS570LC4357", "", ""),
    ("Safety", "Wireless e-stop FORT Wireless E-Stop Pro (SIL3, RCM)", "FORT Robotics", "WES Pro", 1, 3500, "AUD", "buy", "Q", "Y", "fortrobotics.com/wireless-e-stop-pro", "Tele Radio Panther (PLd)", "quote required"),
    ("Safety", "Safety relay dual-channel (Pilz PNOZ s / Phoenix PSR class) + wired e-stop pendant 5 m", "Pilz / Phoenix Contact", "PNOZ s3 class", 1, 650, "AUD", "buy", "E", "Y", "RS AU", "", ""),
    # ------------------------------------------------------------------ sensors
    ("Sensors", "Stereo camera Stereolabs ZED X Mini (GMSL2, GS, 2.2 mm)", "Stereolabs", "ZED X Mini", 1, 549, "USD", "buy", "V", "Y", "stereolabs.com (en-au store)", "Orbbec Gemini 336L", "head"),
    ("Sensors", "Wide mono camera ZED X One GS (AR0234, GMSL2)", "Stereolabs", "ZED X One GS", 2, 399, "EUR", "buy", "V", "Y", "stereolabs.com", "TechNexion VLS-GM2-AR0234 191° (US$188.50)", "head temples, VIO/SLAM"),
    ("Sensors", "Depth camera Orbbec Gemini 335Lg (GMSL2)", "Orbbec", "Gemini 335Lg", 1, 450, "USD", "buy", "Q", "Y", "orbbec.com (335L US$413 at RobotShop)", "RealSense D457", "abdomen, terrain/feet"),
    ("Sensors", "3D LiDAR Livox Mid-360", "Livox (DJI)", "Mid-360", 1, 979, "USD", "buy", "V", "Y", "livoxtech.com (price secondary)", "Hesai JT128", "crown of head"),
    ("Sensors", "IMU MicroStrain 3DM-CV7-AHRS (1.5 deg/h)", "HBK MicroStrain", "3DM-CV7-AHRS", 1, 1500, "AUD", "buy", "Q", "Y", "Metromatics (AU)", "Xsens MTi-630", "pelvis"),
    ("Sensors", "Industrial IMU TDK IIM-46230 (safety MCU)", "TDK InvenSense", "IIM-46230", 1, 480.72, "AUD", "buy", "V", "Y", "digikey.com.au", "ADIS16500", ""),
    ("Sensors", "Foot sole compression load cells 500 N + foot board (4 per foot)", "TE / Futek class", "FX29 class (TE marked unavailable)", 8, 55, "AUD", "buy", "E", "Y", "confirm stock before design freeze", "FSR arrays", ""),
    ("Sensors", "Fingertip 3-axis force sensor Contactile 3D Force Button Ø10, 0-20 N", "Contactile (Sydney)", "3DFBS-10-20N", 10, 250, "AUD", "buy", "Q", "Y", "contactile.com", "PaXini PX6AX GEN4", ""),
    ("Sensors", "Palm magnetic tactile skin (AnySkin/ReSkin pattern, 5x MLX90393)", "builder", "KES-SKIN", 2, 60, "AUD", "make", "E", "Y", "arXiv 2409.08276", "", ""),
    ("Sensors", "ToF multizone ST VL53L5CX modules (shins, forearms, head)", "ST / Pololu", "VL53L5CX", 8, 30, "USD", "buy", "V", "Y", "pololu.com/product/3417", "VL53L8CX", ""),
    ("Sensors", "Microphone array ReSpeaker XVF3800 + speaker 3 W + I2S amp", "Seeed Studio", "XVF3800", 1, 95, "USD", "buy", "V", "Y", "seeedstudio.com", "", ""),
    ("Sensors", "Wrist 6-axis F/T sensor Bota SensONE T5 (EtherCAT)", "Bota Systems", "SensONE T5", 2, 5617.5, "CHF", "buy", "V", "O",
     "shop.botasys.com", "ATI Mini45 SI-290-10", "OPTION: baseline uses joint-torque flexures + current for wrench estimation"),
    ("Sensors", "Ankle 6-axis F/T Bota PixONE T60 (through-hole)", "Bota Systems", "PixONE T60", 2, 7500, "AUD", "buy", "Q", "O", "shop.botasys.com", "", "OPTION: baseline uses 4 load cells per foot"),
    # ------------------------------------------------------------------ hands
    ("Hands", "Micro linear actuator: maxon DCX 10 L 9 V + GPX 10 + ENX 10 + KSS SR0401K Ø4x1 ball screw", "maxon / KSS", "DCX10L+GPX10+SR0401K", 20, 430, "AUD", "buy", "E", "Y",
     "maxon motor Australia; DCX10L €103.89 (maxongroup.com)", "Faulhaber 1226 B + 12/4 (Erntec)", "10 per hand"),
    ("Hands", "Hand joint angle sensors TI TMAG5273 + diametric magnets", "TI", "TMAG5273", 32, 4, "AUD", "buy", "E", "Y", "digikey.com.au", "AS5600", ""),
    ("Hands", "Hand controller PCB (F28P65x + 10x DRV8316 + EtherCAT, ref TI TIDA-010992)", "custom", "KES-HAND", 2, 320, "AUD", "custom", "E", "Y", "ti.com/tool/TIDA-010992", "", ""),
    ("Hands", "Hand mechanical set: 7075 palm frame, Ti pins, MJF PA12-CF links, cast Dragon Skin 20 fingertip caps", "CNC + MJF + make", "KES-HAND-MECH", 2, 900, "AUD", "machine", "E", "Y", "docs/09", "", ""),
    ("Hands", "Commercial fallback: Inspire RH56DFTP dexterous hand (6 DOA, tactile)", "Inspire Robots", "RH56DFTP", 2, 5181.72, "GBP", "buy", "V", "O", "robosavvy.co.uk (incl. VAT)", "Linker Hand O6 (US$1,499)", "OPTION: replaces the custom hand"),
    # ------------------------------------------------------------------ structure
    ("Structure", "Pelvis bowl 7075-T6, 5-axis machined, hard anodised black", "CNC job shop", "KES-PEL-01", 1, 1400, "AUD", "machine", "E", "Y", "cad/out/step/pelvis__pelvis_bowl.step", "", ""),
    ("Structure", "Torso spine plate + ribs 7075-T6 + CF closeouts", "CNC job shop", "KES-TOR-01..03", 1, 1300, "AUD", "machine", "E", "Y", "cad/out/step/torso__*.step", "", ""),
    ("Structure", "Hip yaw-roll yokes + roll-pitch brackets 7075-T6 (L/R)", "CNC job shop", "KES-HIP-01/02", 4, 420, "AUD", "machine", "E", "Y", "cad/out/step/l_hip__*.step", "", ""),
    ("Structure", "Thigh plates 7075-T6 (4) + CF tubes Ø40x2 (2)", "CNC + Enhanced Composites", "KES-THI-01..03", 1, 1100, "AUD", "machine", "E", "Y", "enhancedcomposites.com.au", "", ""),
    ("Structure", "Knee push-rods Ti-6Al-4V tube 16x2 + M12 rod ends (2 sets)", "CNC + SKF/igus", "KES-KNE-ROD", 2, 260, "AUD", "machine", "E", "Y", "Specialty Metals (Ti), CBC (rod ends)", "17-4PH H1025 tube", ""),
    ("Structure", "Knee cranks + knee hubs 7075-T6 / 17-4PH bushings", "CNC", "KES-KNE-01/02", 2, 380, "AUD", "machine", "E", "Y", "", "", ""),
    ("Structure", "Shank upper fittings 7075 + CF tubes + ankle push-rods Ti (2 legs)", "CNC + composites", "KES-SHK-01..03", 2, 620, "AUD", "machine", "E", "Y", "", "", ""),
    ("Structure", "Ankle cross Ti-6Al-4V + needle rollers + foot plate 7075 + replaceable NBR sole", "CNC", "KES-FT-01..03", 2, 650, "AUD", "machine", "E", "Y", "", "", ""),
    ("Structure", "Arm structure: shoulder brackets, upper-arm CF tubes + fittings, forearm frames, wrist cross (Ti)", "CNC", "KES-ARM-01..05", 2, 950, "AUD", "machine", "E", "Y", "", "", ""),
    ("Structure", "Neck yoke + head frame 6061/PA12-CF", "CNC + MJF", "KES-HEAD-01", 1, 420, "AUD", "machine", "E", "Y", "", "", ""),
    # ------------------------------------------------------------------ shells / CMF
    ("Shells", "Exterior shells MJF PA12 (~42 panels, ~4,600 cm3), bead-blasted", "KAD3D / Formero (AU)", "KES-SHELL-*", 1, 2300, "AUD", "print", "E", "Y", "kad3d.com.au", "SLS PA11, FDM ASA prototypes", "STEP in cad/out/step"),
    ("Shells", "Shell finishing: primer + 2K satin warm-white + matte graphite, clearcoat", "automotive paint shop", "-", 1, 2500, "AUD", "custom", "E", "Y", "local", "", ""),
    ("Shells", "Visor PC thermoformed / machined smoked, AR-coated camera windows", "plastics shop", "KES-VIS-01", 1, 450, "AUD", "custom", "E", "Y", "", "", ""),
    ("Shells", "Magnetic shell fasteners (N52 disc + steel pads) + captive M3 quarter-turn studs", "various", "-", 1, 220, "AUD", "buy", "E", "Y", "", "", ""),
    ("Shells", "Waist + ankle TPU bellows/gaiters (cast or printed TPU 95A)", "print", "KES-BEL-01", 3, 80, "AUD", "print", "E", "Y", "", "", ""),
    # ------------------------------------------------------------------ harness, cooling, consumables
    ("Harness", "Power wire (silicone 8/10/12/16 AWG, tinned), EtherCAT robot cable (igus chainflex CF Robot), signal cable", "igus / various", "CFROBOT8 etc.", 1, 1400, "AUD", "buy", "E", "Y", "Treotham (igus AU)", "", ""),
    ("Harness", "Connectors: Amphenol SurLok Plus (pack), Harwin Gecko-MT (signal), JST GH (sensors), XT60 (branches)", "Amphenol / Harwin / JST", "-", 1, 1100, "AUD", "buy", "E", "Y", "element14 AU / RS AU", "", ""),
    ("Cooling", "Blowers 12 V (2 torso, 4 leg ducts), ducts (MJF), filters", "Delta / Sunon", "BFB04512 class", 6, 35, "AUD", "buy", "E", "Y", "element14 AU", "", ""),
    ("Consumables", "Fasteners (12.9 alloy, A4 stainless, Ti Gr5 critical), dowels, thread-locker, thermal epoxy, grease", "AIMS / Bremick / Loctite", "-", 1, 900, "AUD", "buy", "E", "Y", "aimsindustrial.com.au", "", ""),
    ("Consumables", "Spares allowance (1 of each actuator part, 2 drives, sole, fingertip caps)", "-", "-", 1, 6000, "AUD", "buy", "E", "Y", "", "", "10 % of actuator + drive cost"),
    # ------------------------------------------------------------------ test infrastructure (robot-specific)
    ("Test rig", "Overhead gantry 2 t + trolley + fall-arrest harness/catch system for humanoid testing", "Hare & Forbes / lifting supplier", "-", 1, 4200, "AUD", "buy", "E", "Y", "docs/11 sec 2", "", ""),
    ("Test rig", "Actuator dynamometer: FUTEK TRS605 inline torque transducer + absorber motor/drive + frame", "FUTEK (Metromatics) + build", "TRS605", 1, 9000, "AUD", "buy", "Q", "Y", "metromatics.com.au", "reaction torque cell + lever", "docs/10 phase 1"),
    ("Test rig", "Single-leg test stand (vertical slide + load cells) and treadmill harness frame", "make", "-", 1, 2500, "AUD", "make", "E", "Y", "docs/11", "", ""),
]


def rows():
    out = []
    for i, it in enumerate(ITEMS, 1):
        sub, item, mfr, pn, qty, up, cur, mb, st, base, src, alt, note = it
        aud = up * FX[cur]
        out.append(dict(id=f"B{i:03d}", subsystem=sub, item=item, manufacturer=mfr, part_number=pn, qty=qty,
                        unit_price=up, currency=cur, unit_aud=round(aud, 2), ext_aud=round(aud * qty, 2),
                        make_buy=mb, price_status=st, baseline=base, source_supplier=src, alternative=alt, notes=note))
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
    L = ["# Bill of materials (generated)", "", f"Source: `calc/kestrel/bom.py` -> `data/bom.csv`. FX (AUD per unit): " +
         ", ".join(f"{k} {v}" for k, v in FX.items() if k != "AUD") + ". Price status: **V** seen on manufacturer/retailer page, "
         "**Q** quote-only (estimate), **E** engineering estimate. Baseline = Y; options excluded from totals.", "",
         "| ID | Subsystem | Item | Mfr / P/N | Qty | Unit (AUD) | Ext (AUD) | Make/buy | Status | AU supplier / source | Alternative |",
         "|---|---|---|---|---|---|---|---|---|---|---|"]
    for r in R:
        flag = "" if r["baseline"] == "Y" else " *(option)*"
        L.append(f"| {r['id']} | {r['subsystem']} | {r['item']}{flag} | {r['manufacturer']} {r['part_number']} | {r['qty']} | {r['unit_aud']:,.0f} | "
                 f"{r['ext_aud']:,.0f} | {r['make_buy']} | {r['price_status']} | {r['source_supplier']} | {r['alternative']} |")
    (ROOT / "docs" / "generated" / "bom.md").write_text("\n".join(L) + "\n")
    C = ["# Cost summary (generated)", "", "| Subsystem | Baseline AUD | Share |", "|---|---|---|"]
    for k, v in sorted(by_sub.items(), key=lambda x: -x[1]):
        C.append(f"| {k} | {v:,.0f} | {100 * v / tot:.1f} % |")
    C.append(f"| **Baseline robot parts + robot-specific test rig** | **{tot:,.0f}** | 100 % |")
    C += ["", "By price confidence:", ""]
    for k, lbl in (("V", "seen price"), ("Q", "quote-only estimate"), ("E", "engineering estimate")):
        C.append(f"- {lbl} ({k}): A${st.get(k, 0):,.0f} ({100 * st.get(k, 0) / tot:.0f} %)")
    C += ["", "Options (not in total):", ""]
    for r in opt:
        C.append(f"- {r['item']}: A${r['ext_aud']:,.0f}")
    (ROOT / "docs" / "generated" / "cost_summary.md").write_text("\n".join(C) + "\n")
    return tot, by_sub, st, opt


if __name__ == "__main__":
    tot, by_sub, st, opt = write()
    print(f"baseline A${tot:,.0f}")
    for k, v in sorted(by_sub.items(), key=lambda x: -x[1]):
        print(f"  {k:24s} {v:10,.0f}")
    print({k: round(v) for k, v in st.items()})
