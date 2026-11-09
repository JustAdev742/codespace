# P10 — Hands Mk II (13 actuated DOF each, palm camera)

Build **one finger first** (index: 3 actuators, then a 4-DOF thumb) and run the single-finger endurance and force tests
before building the rest. Architecture: docs/03 §8 (mechanical), docs/05 §6 (electrical); K1 hand CAD `cad/hand.py` is
the 10-DOA version and is the starting point for the Mk II detailing.

Mk II targets (R7 #4, `mass_budget.md`): **13 DOA**, 4-DOF thumb, finger abduction, **≥ 15 N fingertip**, **≥ 200 N power
grasp**, **≥ 20 kg hook/handle hold**, tactile threshold ≤ 5 g, palm camera, **1.15 kg** per hand.

## A. Visual reference
* Hand detail render (K1): [`renders/08_hand_detail.png`](../../renders/08_hand_detail.png)
* Actuation map (K1 10-DOA diagram; Mk II allocation in the table below): [`diagrams/hand_architecture.svg`](../../diagrams/hand_architecture.svg)
* CAD: `cad/hand.py` (palm, phalanges, joints, internals: `hand_internals()`), STEP `cad/out/step/l_hand__palm_shell.step`
* Reference design: ILDA hand (Kim et al., Nat. Commun. 2021) [R5]

**Actuator allocation (docs/03 §8):**

| Finger | DOA | Actuators (gearhead) |
|---|---|---|
| Thumb | 4 | CMC opposition rotation (4:1), CMC flexion (high-force), MCP flexion (16:1), IP flexion (16:1, short tendon) |
| Index | 3 | MCP abduction (4:1), MCP flexion (high-force), PIP + DIP coupled (16:1) |
| Middle | 2 | MCP flexion (high-force), PIP + DIP coupled (16:1) |
| Ring | 2 | MCP flexion (high-force), PIP + DIP coupled (16:1, short tendon to DIP) |
| Little | 1 | coupled flexion (high-force) |
| Spread | 1 | ring + little abduction, coupled (4:1) |

High-force flexors (5 per hand): maxon DCX 12 L + GPX 12 (B118). Standard units (8 per hand): maxon DCX 10 L + GPX 10
(B058). All drive KSS SR0401K Ø4 × 1 ball screws on miniature guides into crossed four-bar links; DIP joints follow
their PIP through a second four-bar or a short Dyneema tendon.

## B. Parts list (one hand)

| BOM | Item | Qty |
|---|---|---|
| B118 | High-force micro linear actuator: DCX 12 L 9 V + GPX 12 + ENX + KSS SR0401K Ø4 × 1 + miniature guide | 5 |
| B058 | Standard micro linear actuator: DCX 10 L 9 V + GPX 10 (16:1 flexors, 4:1 abduction/rotation) + ENX 10 + KSS SR0401K + MGN5-class guide | 8 |
| B059 | TMAG5273 3D Hall angle sensors + Ø3 × 1 mm diametric N52 magnets (MCP, PIP, thumb joints) | 16 |
| B052 | Contactile 3D force buttons Ø10, 0–20 N | 5 |
| B053 | Palm magnetic tactile skin (5 × MLX90393 + magnetised Dragon Skin 10 + iron microparticles, AnySkin pattern) | 1 |
| B116 | Palm camera TechNexion VLS-GM2-AR0234-C-S191-IR (global shutter, GMSL2) behind a sealed PC window, 20° toward the fingertips | 1 |
| B060 | Hand controller Mk II (F28P65x, 13 H-bridges, EtherCAT, local 12 V buck from the 24 V forearm rail), in the sealed palm | 1 |
| B061 | Hand mechanical set: 7075 palm frame, 4-DOF thumb base on a 2-bearing pivot, abduction pivots, Ti-6Al-4V Ø2 pins, 17-4PH bushings, MJF PA12-CF links, Dyneema SK99 tendon (0.5 mm) with crimp terminals, cast Dragon Skin 20 fingertip caps, palm shell with camera window | 1 set |
| B081 | M1.6/M2 screws, E-clips, 0.2 mm PTFE washers, Loctite 222 | set |

## C. Tools
Stereo microscope, fine tweezers, M1.6 drivers, torque screwdriver 0.05–0.5 N·m, reamers Ø2 H7, small press for pins,
silicone casting kit (vacuum chamber), printed moulds, force gauge 0–100 N, a 50 mm test cylinder on a load cell
(grasp force), a 20 kg handle hook test mass, the finger endurance rig (printed frame + load spring + cycle counter),
precision weights 1–10 g (tactile threshold).

## D. Manufacturing
* **Palm frame (7075):** CNC; holds 13 actuators in two staggered rows, guide rails, MCP pivot bores (Ø2 H7), the
  thumb-base pivot bearings, the abduction pivots and the controller/camera bay. Hard anodise.
* **Phalanx and four-bar links:** MJF PA12-CF, reamed to Ø2 H7 after printing, bushings pressed in. ILDA crossed
  four-bars for MCP and PIP; DIP ≈ 0.8 × PIP through a second four-bar (index, middle) or a short tendon (ring, thumb
  IP).
* **Tendons:** 0.5 mm Dyneema SK99 over Ø4 PTFE pulleys, pre-stretched at 50 N for 1 h, terminated with crimp sleeves;
  set length with a printed jig.
* **Fingertip caps:** Dragon Skin 20 (Shore 20A) cast over a PA12-CF distal core with a dovetail; the Contactile button
  sits under 1.5 mm of silicone.
* **Palm skin:** Dragon Skin 10 with iron microparticles, cast 2 mm, magnetised (AnySkin method [R5]).
* **Palm window:** 2 mm PC, AR coated, bonded and O-ring sealed in front of the camera (the palm is a sealed zone, docs/03
  §12).

## E. Assembly
1. **Actuator sub-assemblies:** motor + gearhead + ball-screw coupling (set screw on a flat, Loctite 222), nut carriage
   on the guide, rod end. Check smooth travel; no-load current over the full stroke < 60 mA (DCX 10 L) / < 80 mA
   (DCX 12 L).
2. **Fingers:** phalanges with pins + PTFE washers + E-clips; four-bar links; magnets in each MCP and PIP pin end and the
   TMAG5273 flex PCB in the facing link; tendons for ring DIP and thumb IP.
3. **Thumb base:** opposition-rotation actuator (4:1) turning the thumb base on its 2-bearing pivot; CMC flexion
   (high-force) and MCP flexion actuators; IP by tendon.
4. **Abduction:** index abduction actuator; spread actuator driving ring and little abduction through a coupled link.
5. **Mount the actuators** in the palm frame and connect each nut carriage to its crank or link.
6. **Overload breakaway:** the spring detent in each MCP crank must release at 1.5 × the stall force (set with the force
   gauge) and re-seat by hand.
7. **Palm camera and controller:** camera behind the sealed window, controller board in the palm bay; micro-coax from
   the camera to the forearm FAKRA-Z break (P09).
8. Fingertip caps (dovetail slide-on, one drop of silicone adhesive), palm skin (4 × M2), palm shell.
9. **Wiring:** motor leads and encoder flex to the in-palm controller; only power (24 V), EtherCAT and the camera coax
   cross the wrist, with service loops through the wrist cross.

## F. Electrical
* Hand controller fed from the forearm 24 V rail (XT30, 16 AWG) through its local 12 V buck; EtherCAT IN/OUT, after the
  forearm KES-WRIST board in the chain (each is its own slave, docs/05 §7). The 24 V rail is disabled in STO (Cat 0 for the hand).
* Each micro-motor on an H-bridge with a current limit from the maxon data sheet for the 9 V winding on the 12 V supply:
  continuous current for holds, short-time 2 × for grasps, I²t in firmware; stall protection.
* I²C buses: 2 for the TMAG5273 sets (address-select via mux), 1 for the Contactile buttons, 1 for the palm skin.
* Palm camera: GMSL2 power-over-coax from the J601 (ports 4–5, docs/05 §7).

## G. Testing (gate G2: hand)
| Test | Pass |
|---|---|
| Each joint range and the finger angle sensors vs a protractor | ±1° |
| Fingertip force, straight and bent (force gauge), every finger | **≥ 15 N** |
| Power grasp on the 50 mm instrumented cylinder (short-time) | **≥ 200 N** total; ≥ 150 N held for 60 s |
| Hook/handle hold: 20 kg on the four fingers for 60 s | no slip; motor temperatures < 60 °C; nut force ≤ 560 N (KSS Ø4 × 1 Ca) by current |
| Thumb opposition: thumb tip meets each fingertip | all four reached; pinch ≥ 15 N index–thumb |
| Close time, open → full fist | ≤ 1.0 s |
| Back-drive: push a fingertip with 20 N, motors off | finger yields without damage |
| Breakaway: overload the MCP | detent releases, re-seats |
| Endurance (first finger, then first thumb): 10⁴ close/open cycles at 50 % load | force loss < 10 %; pin wear < 0.05 mm; tendon creep within the adjuster range |
| Tactile: Contactile and palm skin, 5 g weight and 0.1–20 N ramp | 5 g detected; monotonic, calibrated |
| Palm camera: stream at rate through the wrist with the arm cycling | no drops; image clear through the window |
| Mass of the finished hand (without F/T sensor) | ≤ 1.15 kg (budget); record the actual |
