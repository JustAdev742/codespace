# P10 — Hands (10 actuated DOF each)

Build **one finger first** (index: 3 actuators) and run its endurance test before building the rest.

## A. Visual reference
* Hand detail render: [`renders/08_hand_detail.png`](../../renders/08_hand_detail.png)
* Actuation map: [`diagrams/hand_architecture.svg`](../../diagrams/hand_architecture.svg)
* CAD: `cad/hand.py` (palm, phalanges, joints, internals: `hand_internals()`), STEP `cad/out/step/l_hand__palm_shell.step`
* Reference design: ILDA hand (Kim et al., Nat. Commun. 2021), the architecture this hand follows [R5].

## B. Parts list (one hand)

| BOM | Item | Qty |
|---|---|---|
| B058 | Micro linear actuator: maxon DCX 10 L 9 V + GPX 10 (16:1 for MCP flexors; 4:1 for thumb rotation and index abduction) + ENX 10 encoder + KSS SR0401K Ø4 × 1 mm ball screw + miniature guide (MGN5 class) | 10 |
| B059 | TMAG5273 3D Hall angle sensors + Ø3 × 1 mm diametric N52 magnets | 16 |
| B052 | Contactile 3D force buttons Ø10, 0–20 N | 5 |
| B053 | Palm magnetic tactile skin (5 × MLX90393 + magnetised Dragon Skin 10 + iron microparticles, AnySkin pattern) | 1 |
| B060 | Hand controller PCB (F28P65x + 10 × DRV8316-class + EtherCAT + 2 wrist-actuator channels), per TIDA-010992 | 1 |
| B061 | 7075 palm frame, PA12-CF (MJF) phalanx links and four-bar links, Ti-6Al-4V Ø2 pins, 17-4PH bushings, cast Dragon Skin 20 fingertip caps, palm shell | 1 set |
| B081 | M1.6/M2 screws, E-clips, 0.2 mm PTFE washers, Loctite 222 | set |

## C. Tools
Stereo microscope, fine tweezers, M1.6 drivers, torque screwdriver 0.05–0.5 N·m, reamers Ø2 H7, small press for pins, silicone casting kit (vacuum chamber), printed moulds, force gauge 0–100 N, the finger endurance rig (printed frame + load spring + cycle counter).

## D. Manufacturing
* **Palm frame (7075):** CNC; holds the 10 actuators in two rows, guide rails and the MCP pivot bores (Ø2 H7). Hard anodise.
* **Phalanx and four-bar links:** MJF PA12-CF, reamed to Ø2 H7 after printing. Bushings are pressed in. Link lengths follow the ILDA crossed four-bar for MCP and PIP, with DIP coupled by a second four-bar. Size them in a parametric sketch so DIP ≈ 0.8 × PIP angle.
* **Fingertip caps:** cast Dragon Skin 20 (Shore 20A) in a two-part printed mould over a PA12-CF distal core with a dovetail. The Contactile button sits under a 1.5 mm silicone layer.
* **Palm skin:** mix Dragon Skin 10 with iron microparticles, cast 2 mm, magnetise in a pulse magnetiser or with an array of N52 blocks (AnySkin method [R5]).

## E. Assembly
1. **Actuator sub-assembly:** motor + gearhead + ball screw coupling (set screw on a flat, Loctite 222), nut carriage on the MGN5 guide, rod end. Check smooth travel; measure the no-load current over the full stroke (< 60 mA).
2. **Fingers:** assemble the phalanges with pins + PTFE washers + E-clips. Fit the four-bar links. Fit a magnet in each MCP and PIP pin end, and the TMAG5273 flex PCB in the facing link.
3. **Mount the actuators** in the palm frame. Connect each nut carriage to its MCP crank (or PIP link through the proximal phalanx for index/middle).
4. **Thumb:**
   - CMC rotation actuator (4:1, fast) turns the thumb base on a 2-bearing pivot.
   - CMC flexion actuator.
   - MCP+IP coupled flexion through a four-bar.
5. **Overload breakaway:** the spring-detent in each MCP crank must release at 1.5× the stall force (set with the force gauge) and re-seat by hand.
6. Fingertip caps (dovetail slide-on, one drop of silicone adhesive), palm skin (4 × M2 screws), palm shell.
7. **Wiring:** motor leads and encoder flex through the wrist on a 0.5 mm-pitch flat flex with a service loop to the controller in the forearm.

## F. Electrical
* Hand controller: 12 V from the neck/hands zone; EtherCAT IN/OUT.
* Each motor on a DRV8316-class channel with a current limit (stall-protect at 0.4 A for the DCX 10 L at 9 V).
* I²C buses: 2 × for the TMAG5273 sets (address-select via mux), 1 × for the Contactile buttons, 1 × for the palm skin.
* Wrist linear actuators on two higher-current channels (DCX 16 L).

## G. Testing (gate G2: hand)
| Test | Pass |
|---|---|
| Each joint range and the finger angle sensors vs a protractor | ±1° |
| Fingertip force, straight and bent (force gauge) | ≥ 10 N (target; ILDA achieved 28–34 N [R5]) |
| Power grasp on a 50 mm cylinder | ≥ 50 N total |
| Close time, open → full fist | ≤ 1.0 s |
| Payload: 5 kg handle hook grasp for 60 s | no slip, motor temperature < 60 °C |
| Back-drive: push a fingertip 20 N | finger yields (ball screw back-drives) without damage |
| Breakaway: overload the MCP | detent releases, re-seats |
| Endurance (first finger): 10⁴ close/open cycles at 50 % load | no loss of force > 10 %; no link wear beyond 0.05 mm at the pins |
| Tactile: Contactile and palm skin respond to 0.1–20 N | monotonic, calibrated |
