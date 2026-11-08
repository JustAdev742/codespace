# Bill of materials (generated)

Source: `calc/kestrel/bom.py` -> `data/bom.csv`. FX (AUD per unit): USD 1.52, EUR 1.65, GBP 1.95, CHF 1.75, CNY 0.21. Price status: **V** seen on manufacturer/retailer page, **Q** quote-only (estimate), **E** engineering estimate. Baseline = Y; options excluded from totals.

| ID | Subsystem | Item | Mfr / P/N | Qty | Unit (AUD) | Ext (AUD) | Make/buy | Status | AU supplier / source | Alternative |
|---|---|---|---|---|---|---|---|---|---|---|
| B001 | Actuators - motors | Custom frameless motor KM-130x45 (knee), kit of laminations+magnets+wire+rotor iron | builder / lamination & magnet vendors KM-130x45 | 2 | 1,100 | 2,200 | custom | E | docs/13; lamination stack by laser/EDM job shop, N42SH arc magnets (custom order) | MyActuator X15-450 integrated (72 V part, slower at 16S) |
| B002 | Actuators - motors | Custom frameless motor KM-130x40 (hip pitch) | builder / vendors KM-130x40 | 2 | 1,050 | 2,100 | custom | E | docs/13 | MyActuator X12-320 integrated (fits hip pitch with reduced speed margin) |
| B003 | Actuators - motors | Frameless motor kit TQ-RoboDrive ILM85x26 | TQ-Systems ILM85x26 | 3 | 1,300 | 3,900 | buy | Q | tq-group.com TQ-RoboDrive (10-12 wk) | CubeMars RI100 / KM custom |
| B004 | Actuators - motors | Frameless motor kit CubeMars RI85-PH KV85 | CubeMars (T-Motor) RI85-PH | 11 | 456 | 5,016 | buy | Q | cubemars.com catalogue 2026 | TQ ILM85x13 |
| B005 | Actuators - motors | Frameless motor kit TQ-RoboDrive ILM85x13 | TQ-Systems ILM85x13 | 4 | 1,100 | 4,400 | buy | Q | tq-group.com | CubeMars RI85-PH |
| B006 | Actuators - motors | Custom frameless motor KM-50x20 (12s/14p) | builder / vendors KM-50x20 | 4 | 220 | 880 | custom | E | docs/13 | CubeMars RI50 class (verify specs) |
| B007 | Actuators - gears | Custom 2-stage planetary gear set 14:1 (s1 m0.8 3.5:1, s2 m1.25 4:1), ground, case-hardened | gear job shop KA-130-PG | 4 | 1,250 | 5,000 | custom | E | docs/09 gear drawings; 18CrNiMo7-6 carburised, ISO 6 | KHK stock ground gears modified + EDM ring |
| B008 | Actuators - gears | Custom 2-stage planetary gear set 32:1 | gear job shop KA-110-PG | 3 | 950 | 2,850 | custom | E | docs/09 | KHK stock gears |
| B009 | Actuators - gears | Custom 2-stage planetary gear set 23:1 | gear job shop KA-90-PG | 7 | 800 | 5,600 | custom | E | docs/09 | KHK stock gears |
| B010 | Actuators - gears | Strain-wave component set size 25, 50:1 (CSG-25-50 equivalent) | Leaderdrive LHSG-25-50 | 4 | 638 | 2,554 | buy | Q | leaderdrive.com (CSG-identical ratings) | Harmonic Drive CSG-25-50 (premium, ~2-3x) |
| B011 | Actuators - gears | Strain-wave component set size 20, 50:1 | Leaderdrive LHSG-20-50 | 4 | 547 | 2,189 | buy | Q | leaderdrive.com | Harmonic Drive CSG-20-50 |
| B012 | Actuators - gears | Strain-wave component set size 14, 50:1 | Leaderdrive LHSG-14-50 | 4 | 456 | 1,824 | buy | Q | leaderdrive.com | Harmonic Drive CSG-14-50 |
| B013 | Actuators - bearings | Crossed-roller output bearing ~ID90/OD120 (KA-130) | THK / IKO RU/CRBH class | 4 | 380 | 1,520 | buy | Q | Statewide Bearings (THK AU) | Chinese CRB equivalents (~1/3 cost) |
| B014 | Actuators - bearings | Crossed-roller output bearing ~ID60/OD90 (KA-110, KA-90) | THK / IKO RU/CRBH class | 10 | 260 | 2,600 | buy | Q | Statewide Bearings / CBC | Chinese CRB |
| B015 | Actuators - bearings | Crossed-roller output bearing (KH-25/20/14) | THK / IKO RA/CRBS class | 12 | 190 | 2,280 | buy | Q | Statewide Bearings / CBC | Chinese CRB |
| B016 | Actuators - bearings | Thin-section deep-groove rotor bearings (2 per actuator) | NSK / SKF 68xx / 61xx | 52 | 22 | 1,144 | buy | E | CBC Australia / BSC |  |
| B017 | Actuators - sensing | Absolute encoder RLS AksIM-2 readhead + ring, BiSS-C, 19-20 bit | RLS MB049 + MRA049 | 33 | 456 | 15,048 | buy | V | rls.si; DigiKey marketplace US$199 readhead | Netzer DS-58 (output), MT6835 (motor) |
| B018 | Actuators - sensing | Magnetic motor encoder IC MagnTek MT6835 + magnet + PCB | MagnTek MT6835GT | 19 | 18 | 342 | buy | E | lcsc.com C2932578 | MA732 / AS5047P |
| B019 | Actuators - sensing | Strain-gauge torque flexure kit (HBK XY41 gauges x4, ADS1262 front-end) | HBK / TI XY41-3/350 + ADS1262 | 10 | 260 | 2,600 | make | E | hbkworld.com; ti.com/product/ADS1262 | FUTEK TFF400 (via Metromatics) |
| B020 | Actuators - sensing | Winding NTC thermistors EPCOS B57861S0103F045 | TDK B57861S0103F045 | 60 | 4 | 210 | buy | E | element14 AU / DigiKey AU |  |
| B021 | Actuators - housings | KA-130 machined housing set (front, rear cap, rotor hub, carriers, flange), 7075-T6 hard anodised | CNC job shop KA-130-H | 4 | 950 | 3,800 | machine | E | PCBWay CNC / JLCCNC / local shop |  |
| B022 | Actuators - housings | KA-110 / KA-90 machined housing set | CNC job shop KA-110/90-H | 10 | 650 | 6,500 | machine | E | PCBWay CNC |  |
| B023 | Actuators - housings | KH-25/20/14 machined housing set incl. torque flexure (Ti on KH-25/20) | CNC job shop KH-H | 12 | 520 | 6,240 | machine | E | PCBWay CNC (Ti Gr5) |  |
| B024 | Actuators - wrist | Wrist linear actuator: maxon DCX 16 L + GPX 16 + KSS Ø6x2 ball screw + linear guide | maxon / KSS DCX16L + GPX16 + SR0602 | 4 | 650 | 2,600 | buy | E | maxon motor Australia (Mt Kuring-Gai NSW); kssballscrew.com | Faulhaber 1724 + 15A via Erntec |
| B025 | Drives | High-current EtherCAT servo drive 100 V class (Elmo Platinum Twitter R70/100 class) | Elmo Motion Control PLA-TWI R70/100 | 4 | 1,600 | 6,400 | buy | Q | elmomc.com/product/platinum-twitter/ | custom GaN drive per TI TIDA-010979 |
| B026 | Drives | EtherCAT servo drive Novanta Everest S NET (8-80 V, 45 A) | Novanta / Ingenia EVS-NET-E | 22 | 942 | 20,733 | buy | Q | drives.novantamotion.com/eve-net (~US$620 indicative) | Elmo Gold Twitter 25/100; custom F28P65x drive |
| B027 | Drives | Drive carrier PCB (EtherCAT magnetics, RS-422 encoder receivers, STO, 5 V encoder supply, NTC inputs) | JLCPCB / PCBWay KES-DRV-CAR | 26 | 75 | 1,950 | custom | E | docs/05 sec 6; JLCPCB assembly |  |
| B028 | Battery | Li-ion cell Molicel INR-21700-P50B (5.0 Ah, 60 A) | Molicel INR-21700-P50B | 106 | 13 | 1,329 | buy | V | 18650batterystore.com US$8.25 @200+ (import via DG freight) | Molicel P45B 16S7P (AU: Master Instruments / Batteries Direct) |
| B029 | Battery | BMS Orion BMS 2 (24-cell) + 500 A Hall current sensor + harness | Ewert Energy Systems Orion BMS 2 | 1 | 1,672 | 1,672 | buy | V | orionbms.com (24-cell US$820 + sensor/harness) | custom TI BQ76952 + BQ77216 board (TIDA-010208 base) |
| B030 | Battery | Solid-state disconnect + precharge board (TI TPS48111 + back-to-back 100 V MOSFETs) | custom KES-SSD | 1 | 260 | 260 | custom | E | ti.com/product/TPS4811-Q1 | Gigavac GX11 contactor |
| B031 | Battery | Pack fuse 125 A, >=80 V DC, high breaking capacity (EV/MIDI class) | Littelfuse / Eaton Bussmann TBD >=80 VDC | 2 | 45 | 90 | buy | E | element14 AU |  |
| B032 | Battery | Pack enclosure 6061 machined + mica liners + cell holders + Ni-plated Cu busbars + thermal pads | CNC + make KES-BATT-ENC | 1 | 950 | 950 | machine | E | docs/09 |  |
| B033 | Power | DC-DC 36-75 V in -> 24 V 300 W isolated brick (Thor carrier, LiDAR, cameras) | TBD (Vicor / TDK-Lambda / RECOM) TBD | 1 | 260 | 260 | buy | E | docs/05 sec 5 (input range must cover 48-67.2 V) | Mean Well RSD-300C-24 bench only (heavy, 62.4 V max) |
| B034 | Power | DC-DC 36-75 V in -> 12 V 150 W (RT computer, fans, hands) | TBD TBD | 1 | 180 | 180 | buy | E | docs/05 |  |
| B035 | Power | Power distribution board (zone eFuses TPS4811-class x6, bus clamp/brake chopper, current sense) | custom KES-PDU | 1 | 420 | 420 | custom | E | docs/05 |  |
| B036 | Power | Brake resistor 8 ohm 100 W aluminium-clad + chopper MOSFET | TE / Arcol HS100 8R | 1 | 45 | 45 | buy | E | element14 AU |  |
| B037 | Power | Charger 16S Li-ion 67.2 V 10 A, CC/CV, CAN-controlled by BMS | TBD TBD | 1 | 450 | 450 | buy | E | docs/05 |  |
| B038 | Compute | NVIDIA Jetson T5000 module (AGX Thor) | NVIDIA Jetson T5000 | 1 | 7,598 | 7,598 | buy | V | nvidia.com (price after Jul-2026 increase, secondary) | Jetson T4000 (US$2,999, 40-70 W) drop-in |
| B039 | Compute | Carrier Seeed reComputer J601 (8x GMSL2, 4x CAN-FD, 4x10GbE) | Seeed Studio J601 | 1 | 1,280 | 1,280 | buy | V | openelab.io (pre-order) | Connect Tech Gauntlet AGX301 |
| B040 | Compute | NVMe SSD 1 TB industrial | Samsung / Kingston PM9A1 class | 1 | 180 | 180 | buy | E | Core Electronics / PLE |  |
| B041 | Compute | Real-time computer UP Squared Pro 7000 (i3-N305, 2x i226-IT) | AAEON UPN-ADLN-i3-N305 | 1 | 758 | 758 | buy | V | up-board.org (sec) | ASRock Industrial NUC BOX-1360P |
| B042 | Compute | Safety MCU board (TI TMS570LC4357, dual-channel I/O, CAN) | custom (TI LAUNCHXL2-570LC43 for dev) KES-SAFE | 1 | 220 | 220 | custom | E | ti.com/product/TMS570LC4357 |  |
| B043 | Safety | Wireless e-stop FORT Wireless E-Stop Pro (SIL3, RCM) | FORT Robotics WES Pro | 1 | 3,500 | 3,500 | buy | Q | fortrobotics.com/wireless-e-stop-pro | Tele Radio Panther (PLd) |
| B044 | Safety | Safety relay dual-channel (Pilz PNOZ s / Phoenix PSR class) + wired e-stop pendant 5 m | Pilz / Phoenix Contact PNOZ s3 class | 1 | 650 | 650 | buy | E | RS AU |  |
| B045 | Sensors | Stereo camera Stereolabs ZED X Mini (GMSL2, GS, 2.2 mm) | Stereolabs ZED X Mini | 1 | 834 | 834 | buy | V | stereolabs.com (en-au store) | Orbbec Gemini 336L |
| B046 | Sensors | Wide mono camera ZED X One GS (AR0234, GMSL2) | Stereolabs ZED X One GS | 2 | 658 | 1,317 | buy | V | stereolabs.com | TechNexion VLS-GM2-AR0234 191° (US$188.50) |
| B047 | Sensors | Depth camera Orbbec Gemini 335Lg (GMSL2) | Orbbec Gemini 335Lg | 1 | 684 | 684 | buy | Q | orbbec.com (335L US$413 at RobotShop) | RealSense D457 |
| B048 | Sensors | 3D LiDAR Livox Mid-360 | Livox (DJI) Mid-360 | 1 | 1,488 | 1,488 | buy | V | livoxtech.com (price secondary) | Hesai JT128 |
| B049 | Sensors | IMU MicroStrain 3DM-CV7-AHRS (1.5 deg/h) | HBK MicroStrain 3DM-CV7-AHRS | 1 | 1,500 | 1,500 | buy | Q | Metromatics (AU) | Xsens MTi-630 |
| B050 | Sensors | Industrial IMU TDK IIM-46230 (safety MCU) | TDK InvenSense IIM-46230 | 1 | 481 | 481 | buy | V | digikey.com.au | ADIS16500 |
| B051 | Sensors | Foot sole compression load cells 500 N + foot board (4 per foot) | TE / Futek class FX29 class (TE marked unavailable) | 8 | 55 | 440 | buy | E | confirm stock before design freeze | FSR arrays |
| B052 | Sensors | Fingertip 3-axis force sensor Contactile 3D Force Button Ø10, 0-20 N | Contactile (Sydney) 3DFBS-10-20N | 10 | 250 | 2,500 | buy | Q | contactile.com | PaXini PX6AX GEN4 |
| B053 | Sensors | Palm magnetic tactile skin (AnySkin/ReSkin pattern, 5x MLX90393) | builder KES-SKIN | 2 | 60 | 120 | make | E | arXiv 2409.08276 |  |
| B054 | Sensors | ToF multizone ST VL53L5CX modules (shins, forearms, head) | ST / Pololu VL53L5CX | 8 | 46 | 365 | buy | V | pololu.com/product/3417 | VL53L8CX |
| B055 | Sensors | Microphone array ReSpeaker XVF3800 + speaker 3 W + I2S amp | Seeed Studio XVF3800 | 1 | 144 | 144 | buy | V | seeedstudio.com |  |
| B056 | Sensors | Wrist 6-axis F/T sensor Bota SensONE T5 (EtherCAT) *(option)* | Bota Systems SensONE T5 | 2 | 9,831 | 19,661 | buy | V | shop.botasys.com | ATI Mini45 SI-290-10 |
| B057 | Sensors | Ankle 6-axis F/T Bota PixONE T60 (through-hole) *(option)* | Bota Systems PixONE T60 | 2 | 7,500 | 15,000 | buy | Q | shop.botasys.com |  |
| B058 | Hands | Micro linear actuator: maxon DCX 10 L 9 V + GPX 10 + ENX 10 + KSS SR0401K Ø4x1 ball screw | maxon / KSS DCX10L+GPX10+SR0401K | 20 | 430 | 8,600 | buy | E | maxon motor Australia; DCX10L €103.89 (maxongroup.com) | Faulhaber 1226 B + 12/4 (Erntec) |
| B059 | Hands | Hand joint angle sensors TI TMAG5273 + diametric magnets | TI TMAG5273 | 32 | 4 | 128 | buy | E | digikey.com.au | AS5600 |
| B060 | Hands | Hand controller PCB (F28P65x + 10x DRV8316 + EtherCAT, ref TI TIDA-010992) | custom KES-HAND | 2 | 320 | 640 | custom | E | ti.com/tool/TIDA-010992 |  |
| B061 | Hands | Hand mechanical set: 7075 palm frame, Ti pins, MJF PA12-CF links, cast Dragon Skin 20 fingertip caps | CNC + MJF + make KES-HAND-MECH | 2 | 900 | 1,800 | machine | E | docs/09 |  |
| B062 | Hands | Commercial fallback: Inspire RH56DFTP dexterous hand (6 DOA, tactile) *(option)* | Inspire Robots RH56DFTP | 2 | 10,104 | 20,209 | buy | V | robosavvy.co.uk (incl. VAT) | Linker Hand O6 (US$1,499) |
| B063 | Structure | Pelvis bowl 7075-T6, 5-axis machined, hard anodised black | CNC job shop KES-PEL-01 | 1 | 1,400 | 1,400 | machine | E | cad/out/step/pelvis__pelvis_bowl.step |  |
| B064 | Structure | Torso spine plate + ribs 7075-T6 + CF closeouts | CNC job shop KES-TOR-01..03 | 1 | 1,300 | 1,300 | machine | E | cad/out/step/torso__*.step |  |
| B065 | Structure | Hip yaw-roll yokes + roll-pitch brackets 7075-T6 (L/R) | CNC job shop KES-HIP-01/02 | 4 | 420 | 1,680 | machine | E | cad/out/step/l_hip__*.step |  |
| B066 | Structure | Thigh plates 7075-T6 (4) + CF tubes Ø40x2 (2) | CNC + Enhanced Composites KES-THI-01..03 | 1 | 1,100 | 1,100 | machine | E | enhancedcomposites.com.au |  |
| B067 | Structure | Knee push-rods Ti-6Al-4V tube 16x2 + M12 rod ends (2 sets) | CNC + SKF/igus KES-KNE-ROD | 2 | 260 | 520 | machine | E | Specialty Metals (Ti), CBC (rod ends) | 17-4PH H1025 tube |
| B068 | Structure | Knee cranks + knee hubs 7075-T6 / 17-4PH bushings | CNC KES-KNE-01/02 | 2 | 380 | 760 | machine | E |  |  |
| B069 | Structure | Shank upper fittings 7075 + CF tubes + ankle push-rods Ti (2 legs) | CNC + composites KES-SHK-01..03 | 2 | 620 | 1,240 | machine | E |  |  |
| B070 | Structure | Ankle cross Ti-6Al-4V + needle rollers + foot plate 7075 + replaceable NBR sole | CNC KES-FT-01..03 | 2 | 650 | 1,300 | machine | E |  |  |
| B071 | Structure | Arm structure: shoulder brackets, upper-arm CF tubes + fittings, forearm frames, wrist cross (Ti) | CNC KES-ARM-01..05 | 2 | 950 | 1,900 | machine | E |  |  |
| B072 | Structure | Neck yoke + head frame 6061/PA12-CF | CNC + MJF KES-HEAD-01 | 1 | 420 | 420 | machine | E |  |  |
| B073 | Shells | Exterior shells MJF PA12 (~42 panels, ~4,600 cm3), bead-blasted | KAD3D / Formero (AU) KES-SHELL-* | 1 | 2,300 | 2,300 | print | E | kad3d.com.au | SLS PA11, FDM ASA prototypes |
| B074 | Shells | Shell finishing: primer + 2K satin warm-white + matte graphite, clearcoat | automotive paint shop - | 1 | 2,500 | 2,500 | custom | E | local |  |
| B075 | Shells | Visor PC thermoformed / machined smoked, AR-coated camera windows | plastics shop KES-VIS-01 | 1 | 450 | 450 | custom | E |  |  |
| B076 | Shells | Magnetic shell fasteners (N52 disc + steel pads) + captive M3 quarter-turn studs | various - | 1 | 220 | 220 | buy | E |  |  |
| B077 | Shells | Waist + ankle TPU bellows/gaiters (cast or printed TPU 95A) | print KES-BEL-01 | 3 | 80 | 240 | print | E |  |  |
| B078 | Harness | Power wire (silicone 8/10/12/16 AWG, tinned), EtherCAT robot cable (igus chainflex CF Robot), signal cable | igus / various CFROBOT8 etc. | 1 | 1,400 | 1,400 | buy | E | Treotham (igus AU) |  |
| B079 | Harness | Connectors: Amphenol SurLok Plus (pack), Harwin Gecko-MT (signal), JST GH (sensors), XT60 (branches) | Amphenol / Harwin / JST - | 1 | 1,100 | 1,100 | buy | E | element14 AU / RS AU |  |
| B080 | Cooling | Blowers 12 V (2 torso, 4 leg ducts), ducts (MJF), filters | Delta / Sunon BFB04512 class | 6 | 35 | 210 | buy | E | element14 AU |  |
| B081 | Consumables | Fasteners (12.9 alloy, A4 stainless, Ti Gr5 critical), dowels, thread-locker, thermal epoxy, grease | AIMS / Bremick / Loctite - | 1 | 900 | 900 | buy | E | aimsindustrial.com.au |  |
| B082 | Consumables | Spares allowance (1 of each actuator part, 2 drives, sole, fingertip caps) | - - | 1 | 6,000 | 6,000 | buy | E |  |  |
| B083 | Test rig | Overhead gantry 2 t + trolley + fall-arrest harness/catch system for humanoid testing | Hare & Forbes / lifting supplier - | 1 | 4,200 | 4,200 | buy | E | docs/11 sec 2 |  |
| B084 | Test rig | Actuator dynamometer: FUTEK TRS605 inline torque transducer + absorber motor/drive + frame | FUTEK (Metromatics) + build TRS605 | 1 | 9,000 | 9,000 | buy | Q | metromatics.com.au | reaction torque cell + lever |
| B085 | Test rig | Single-leg test stand (vertical slide + load cells) and treadmill harness frame | make - | 1 | 2,500 | 2,500 | make | E | docs/11 |  |
