# 03 — Mechanical architecture: skeleton, joints, transmissions, cooling, power bay, sealing (Mk II)

![Skeleton](../renders/10_skeleton_front.png)

*Render shows the K1 skeleton. The CAD (`cad/`) is maintained separately; §14 lists the Mk II packaging items it must
carry.*

Source of truth: `calc/kestrel/params.py` (geometry, mass budget), `calc/kestrel/actuators.py` (sizing),
`calc/kestrel/structure.py` (hand calculations, results in [generated/structure_checks.md](generated/structure_checks.md)),
[generated/mass_budget.md](generated/mass_budget.md) and [generated/power_budget.md](generated/power_budget.md). Mk II
upgrade targets come from [research/R7](research/R7-commercial-humanoids.md) §(d) and the actuator designs from
[research/R10](research/R10-actuator-state-of-the-art.md).

Tags: **[gen]** value from `docs/generated`; **[E]** estimate with the arithmetic shown here; **[ex]** part example,
datasheet values to be confirmed before purchase (the part examples in §9–§13 were not re-verified in this revision).

## 1. Skeleton and load paths

```
            head ── neck (KH-14 ×2)
                      │
   arm ─ KH-25 ─┐   torso: 7075 spine + ribs; twin hot-swap battery bay (§10);
   (7 DOF,      │          sealed electronics core; radiator in a wet duct (§9)
   cycloid)     └── shoulder pitch actuators on the upper rib
                      │ waist pitch (KA-110P, 29:1) ── waist yoke ── waist yaw (KA-90P)
                      │   coolant + power + EtherCAT cross the waist inside the bellows
                 PELVIS BOWL (7075, 5-axis) ← central hub: hip yaw ×2, waist yaw
                 ╱                 ╲
    hip yaw (KA-90P)            hip yaw
    ══ V-band limb interface (§13): leg detaches here, dry-break coolant couplings ══
    yaw–roll yoke                    …
    hip roll (KA-110P, gluteal, 12 × M5 output flange)
    roll–pitch bracket
    hip pitch (KA-130H, KM-130x50-LC, jacketed, coaxial with hip centre)
    THIGH: twin 7075 plates + Ø40 CF tube; knee actuator (KA-130K, jacketed) 160 mm below hip
           → four-bar (Ti push-rod) → knee hub
    SHANK: CF tube Ø40×2 + 7075 upper fitting carrying two KA-90P ankle actuators
           → two Ti push-rods → foot levers
    ANKLE CROSS (Ti-6Al-4V, needle rollers) → FOOT PLATE (7075 ribbed) → replaceable sole
```

Ground reaction loads run sole → foot plate → ankle cross → shank tube → knee hub → thigh plates → hip pitch output →
roll bracket → yoke → **limb interface** → hip yaw bearing → pelvis bowl. **Every actuator output bearing is a
crossed-roller bearing that carries the joint's full moment load.** The gear sees torque only.

Principal dimensions are unchanged from K1 (joint centre to joint centre): ankle height 75 mm, shank 420, thigh 420
(hip centre at 915 mm), hip half-width 105, waist pitch 1085, shoulders 1420 at ±200, upper arm 300, forearm 260,
hand 190. Ranges are in `diagrams/dof_map.svg`.

## 2. Material selection

| Component | Material | Why this material (and why not the alternatives) |
|---|---|---|
| Pelvis bowl, torso spine/ribs, yokes, brackets, thigh plates, foot plate, actuator housings, battery bay channels | **7075-T6/T651** (σy 503 MPa, E 71.7 GPa, ρ 2.81) [ds R6] | Best strength-to-weight of machinable aluminium; hard-anodises. 6061 (σy 276 MPa) needs ~1.8× the section. Titanium is 1.6× denser and 10× the cost, with no stiffness-to-weight advantage. |
| Thigh/shank tubes, upper-arm tubes | **CFRP roll-wrapped tube** (axial E ≈ 90 GPa, design σ 350 MPa) [ds R6] | Highest bending stiffness per kg for long members; bonded into 7075 end fittings (structural epoxy, 25 mm engagement). No fasteners into the CF. |
| Knee and ankle push-rods, ankle and wrist crosses, ankle pins | **Ti-6Al-4V** (σy 880 MPa, fatigue 510/240 MPa) [ds R6] | Fatigue strength in slender, highly cycled parts; the knee rod is buckling-critical. |
| Planetary gears | **18CrNiMo7-6 carburised** 58–62 HRC, ground, crowned with tip relief | Mk II stage 2 carries the 493 N·m knee peak (Lewis SF 2.16 [gen]). Aluminium or plastic gears are not acceptable. |
| **Cycloid discs (C25, C20)** | **100Cr6 hardened 60–62 HRC, then wire-EDM** (preferred); or 42CrMo4 Q&T + gas nitride with a pressed 100Cr6 raceway sleeve | Hertz contact against hardened pins and a needle raceway in the disc bore; cutting after hardening avoids distortion (docs/13 §4.2, docs/09 §5.3). |
| Cycloid ring and output pins | 62 HRC hardened dowel pins (or 100Cr6) in a 42CrMo4 ring | catalogue-hardened pins are cheaper and better than home heat treatment |
| **Liquid jacket sleeve** (KA-130K/H) | **6061-T6** (not 7075: better corrosion resistance in glycol, good thermal conductivity ≈ 167 W/m·K) | Shrink-fitted on the stator; channel machined in its OD, closed by the 7075 housing bore. Anodise the coolant-wetted faces. |
| Magnets | **N50UH** sintered NdFeB (Br 1.39–1.44 T, Hcj ≥ 25 kOe, 180 °C) [R10 §3.2.4] | Hcj margin at 4× rated current in jacketed stators; +8.6 % Br over K1's N42SH. |
| Shafts, rotor hubs | 7075 (rotor hub), 17-4PH (high-load shafts, pins, bushings) | 17-4PH: 1,170 MPa yield, stainless, machinable before ageing. |
| Strain-wave gears (KH-14 only) | supplied component sets | not field-manufacturable (docs/13) |
| Shells | **PA12 HP MJF** (E 1.7 GPa, 48 MPa, 20 % elongation) | Light and tough; in Mk II the shells are impact and splash covers, not the IP boundary (§12). |
| Visor | Polycarbonate | impact-resistant, optical |
| Bellows (waist, neck, ankles) | TPU 95A, with stainless band clamps | elastic, abrasion resistant; IP65 jets (§12) |
| **Coolant-wetted elastomers** | **EPDM** (O-rings, hoses) | EPDM is the compatible elastomer for water–glycol. **Never on grease:** EPDM swells in mineral grease. |
| Gearbox and output seals | **FKM** lip seals (or PTFE-lip, §12) | grease and temperature compatible; FKM never on the coolant side |
| Fasteners | 12.9 alloy (zinc-flake) for joints; A4 stainless for shells and wet-duct parts; Ti Gr5 where weight/corrosion matter | preload for slip-critical flanges; stainless where water reaches |

## 3. Joint assemblies

### 3.1 Hip (yaw → roll → pitch)
* **Yaw:** KA-90P (28:1, 129 N·m [gen]) in the pelvis bowl, axis vertical, 75 mm above the hip centre. Its output
  carries the **limb interface** (§13). Range −30/+45°.
* **Roll:** KA-110P (RI115-PH, 29:1, 427 N·m [gen]) on the yaw–roll yoke **behind** the hip (x = −118 mm, gluteal
  volume), axis through the hip centre. Output flange **12 × M5 12.9 on PCD 100** (§5). Range −25/+45°.
* **Pitch:** KA-130H (KM-130x50-LC, 14:1, 406 / 243 N·m, 15.2 rad/s [gen]) **coaxial with the hip centre.** The 50 mm
  stack makes the motor 10 mm longer than K1's KM-130x40 (66 vs 56 mm active + end turns [E, R10 §8 `len`]). Take the
  extra length **inboard** (housing y ≈ 51–149 mm instead of 61–149 mm) so the hanging-arm clearance at the wrist
  (y ≈ ±167 mm) is unchanged. The jacket section of the housing is ≈ Ø145 mm (§9.3) [E]. Range −125/+30°.

### 3.2 Knee: actuator in the thigh, four-bar drive

![Knee linkage](../diagrams/knee_linkage.svg)

* KA-130K (KM-130x50-LC, 17:1, 493 / 295 N·m, 4.96 kg [gen]) mounted 160 mm below the hip axis. With the Ø145 jacket
  sections the running clearance to the hip actuator falls from 18 to ≈ 15 mm (160 − 145) [E]; confirm in CAD.
* Four-bar (`calc/kestrel/linkages.py`, unchanged): crank r1 = 70 mm, Ti-6Al-4V push-rod L = 253 mm (Ø16 × 2 mm),
  M12 PTFE-lined rod ends, knee crank r2 = 74 mm. G = τ_knee/τ_act = **0.84–1.46** over the range (0.86 at 20°, 1.43 at
  120° at the tabulated angles [gen]).
* Knee joint capability is **415 N·m (20–40°) to 719 N·m (110°)** [gen]. The structure is checked at the requirement
  loads (431 / 535 / 615 N·m), so the drive caps actuator torque at **535 / G(θ)** until FEA clears the full
  capability (docs/04 §5.3).
* Range 0–130° with a hard stop at 132°. Kneeling is not supported; the deep squat (≈ 125°) is.
* Moving the 4.96 kg actuator from the knee to 0.16 m below the hip saves 4.96 × (0.42² − 0.16²) ≈ **0.75 kg·m²** of
  leg inertia about the hip [E].
* Knee hub: 2 × thin-section angular-contact bearings, preloaded, 7075 hub with a 17-4PH bushing.

### 3.3 Ankle: parallel push-rods

![Ankle linkage](../diagrams/ankle_linkage.svg)

* Two KA-90P actuators in the calf drive the foot through Ti push-rods to levers 52 mm behind the ankle axis at ±36 mm.
  Pitch is the sum of the rod forces, roll their difference.
* Full authority at the 112.7 kg design mass: 210 N·m pitch / 61 N·m roll → **115 N·m per actuator** against 129 N·m
  available [gen]. Joint capability 335 N·m pure pitch, 232 N·m pure roll [gen].
* Ankle cross: Ti-6Al-4V, 4 drawn-cup needle rollers (HK1212 class) on Ø12 hardened pins; double-shear SF **41.8** at
  the structural drop [gen].

### 3.4 Waist
Yaw: KA-90P in the pelvis top. Pitch: KA-110P (29:1) on the waist yoke, −15/+75°. Requirements 288 N·m repeated
(30 kg squat), **379 N·m momentary (50 kg lift, LM)**, 176 N·m hold (10 kg per hand at reach) [gen]. A 10.8 N·m
spring-applied brake on the waist-pitch motor holds the torso without heat for long static tasks (docs/04 §8). The
coolant bundle crosses both waist joints inside the TPU bellows (§11).

### 3.5 Shoulder, elbow, wrist
* Shoulder pitch: KH-25 (KM-115x32-N50 + C25 cycloid 30:1, Ø127 housing, 2.60 kg [gen]) in the chest at
  y = ±135 mm. The Ø127 housing is larger than K1's; the upper-rib pocket grows accordingly. ≥ 4.5 N·m brake for the
  90 N·m hold (docs/04 §8).
* Shoulder roll: KH-25 behind the shoulder centre, under the deltoid cap.
* Shoulder yaw: KH-20 (KM-85x26-N50-4t + C20, Ø97) in the upper arm. Elbow: KH-20, −145/0°.
* Wrist yaw: KH-14 in the proximal forearm.
* Wrist pitch/roll: **two KW-L2 linear actuators** (flat BLDC on a ball screw, 24 V rail, own driver; docs/04 §9) on
  the Ti wrist cross through 22 mm (pitch) and 16 mm (roll) levers: 19 N·m pitch / 10 N·m roll, 6 rad/s.
* Every arm joint carries an output torque flexure (4 strain gauges, ADS1262).

### 3.6 Neck
Yaw (KH-14 in the upper torso) and pitch (KH-14 in the neck yoke), unchanged: 12 N·m each.

## 4. Transmission technology selection

| Technology | Torque density | Back-drive / impact | Precision | Efficiency | Builder feasibility | Used for |
|---|---|---|---|---|---|---|
| **Low-ratio planetary (14–29:1)** | medium–high | **excellent** | backlash 3–10 arcmin | 0.92 assumed (0.90–0.95) | gears from a gear shop | **legs, waist** |
| **Machined two-disc cycloid, 30:1** | high | good: back-drivable, high momentary rating | 1–7 arcmin backlash [R10 §3.3] | 0.85 assumed (UCLA machined 0.82 [R10 S9]) | wire-EDM discs at a job shop | **shoulders, shoulder yaw, elbow (Mk II)** |
| Strain-wave, 50:1 | very high | poor back-drive; flexspline can ratchet under shock | < 1 arcmin | 0.75 assumed | buy only | **wrist yaw, neck** |
| Planetary roller screw + linkage | very high | good | high | 0.88–0.89 [R10 §3.3] | buy-only screw | rejected for Mk II (KL-R knee is a Mk III research path, R10 §5.3.3) |
| Ball screw (micro) | high | back-drivable (η ≈ 0.88–0.90) | high | 0.88 | buy | **wrist pitch/roll, fingers** |
| Belt / cable | medium | good | compliant | 0.95 | easy | rejected for main joints (creep, re-tensioning) |

Why the arms moved from strain-wave to cycloid: K1's KH-25 and KH-20 were capped by the CSG repeated-peak ratings
(127 and 73 N·m). Mk II needs 108 N·m at the shoulder and 79 N·m at the elbow, with 136 / 115 N·m momentary [gen]. The
cycloid's repeated targets (160 / 105 N·m) and momentary targets (250 / 160 N·m) cover this at 30:1, which is also fast
enough at 52 V (docs/04 §8). The ratings are validation targets until the dyno proves them.

## 5. Bearings, shafts, couplings and output flanges

| Location | Bearing | Fit / preload |
|---|---|---|
| Actuator outputs (all 26) | crossed-roller: KA-130 **THK RB9016** (90 × 130 × 16; `structure.py`, docs/09 §11 H1); KA-110P/KA-90P THK RB6013 (60 × 90 × 13); KH-25 RB5013 (50 × 80 × 13); KH-20 RB4010 (40 × 65 × 10) | housing H6 / shaft k5, preload class C1 (exact fits: docs/09 §2) |
| Motor rotors | thin-section deep-groove pair (61808 on KA-130 and KH-25, 61806 on KA-90P and KH-20), one fixed, one floating with a wave spring | j5 / H6 |
| Cycloid eccentric | one needle cage per disc on hardened 100Cr6 eccentric sleeves, 180° apart | per docs/09 §5.3 |
| Knee hub | 2 × angular-contact (back-to-back) | 50 N axial preload |
| Rod ends | PTFE-lined spherical, M12 (knee), M8 (ankle) | — |
| Ankle / wrist crosses | drawn-cup needle rollers on hardened pins (100Cr6 60–64 HRC, ground; never Ti: docs/09 §11 H13) | pins h6, Ra ≤ 0.2 |

**Output flanges.** Every actuator output bolts to the next link through a **friction joint** plus 2 dowels. The flange
slip torque is the mechanical overload fuse: it slips before the gear teeth fail.

| Class | Pattern | Slip torque (μ 0.15) | SF at momentary [gen] | Slip / actuator peak [E] |
|---|---|---|---|---|
| KA-130K/H | 12 × M5 12.9 on PCD 105 | 935.5 N·m | **1.75** (535 N·m, knee) | 1.90 |
| **KA-110P (Mk II upgrade)** | **12 × M5 12.9 on PCD 100** (was 10 × M4 12.9 on PCD 85) | **891.0 N·m** | **2.35** (379 N·m, waist LM) | 2.09 |
| KA-90P | 8 × M4 12.9 on PCD 75 | 310.5 N·m | **2.08** | 2.41 |
| Hip-yaw output (limb interface) | V-band clamp + 2 dowels (§13) | ≈ 260 N·m friction + dowels [E] | 3.4 vs 76 N·m [E] | 2.0 |

**Why the KA-110P flange changed.** The K1 pattern slips at 10 × 6.9 kN × 0.15 × 0.0425 m = 440 N·m [E] (preloads from
`structure.py`, VDI 2230 table values at 70 % proof). That is 1.16 × the Mk II waist momentary (379 N·m) and **below the
427 N·m the Mk II KA-110P can produce**, so the joint would slip under its own actuator. The new pattern on PCD 100 slips
at 891 N·m. It needs a 10 mm larger output hub on the KA-110P (crossed-roller inner ring and mating link faces sized for
PCD 100 + M5 clearance) and 12 tapped M5 holes, 10 mm thread engagement in 7075 (≥ 2 × d), or helical inserts.

## 6. Mechanical stops and overload protection

1. **Soft limits** 3° inside the mechanical range (RT controller).
2. **Hard stops:** machined lugs with replaceable 90A polyurethane bumpers sized for the rotor kinetic energy at maximum
   speed. Knee: ½ × 0.400 kg·m² × 12.5² ≈ **31 J** at the actuator (K1: 15 J) [E, from gen inertia and speed]; bumper
   travel and durometer are re-sized for it.
3. **Drive torque limits:** at the gear's repeated rating for KH classes (C25 160, C20 105, CSG-14 23 N·m), and at
   535 / G(θ) for the knee (§3.2).
4. **Flange friction slip** at 1.75–2.35 × momentary and ≥ 1.9 × the actuator's own peak (§5).
5. **Hands:** back-drivable screws, spring-detent breakaway links, current limits.

## 7. Vibration management

* First structural mode targets: leg > 40 Hz, arm > 25 Hz (≥ 4× the ~8 Hz whole-body control bandwidth). FEA modal,
  then a tap test at G2. The heavier Mk II actuators (knee +0.76 kg, shoulder +1.2 kg over K1) lower these modes;
  re-run the modal check.
* The pelvis IMU sits on a 4-point silicone isolator (≈ 80 Hz corner).
* Gear mesh and cycloid lobe-passing frequencies are kept off structural modes by tooth-count choice (docs/09).
* Coolant hoses and cable bundles are clipped every 80 mm; hoses never touch an edge without a grommet.

## 8. Hands (mechanical, Mk II)

![Hand architecture](../diagrams/hand_architecture.svg)

*The diagram shows the K1 10-DOA hand. Mk II adds three DOA and a palm camera.*

* **Architecture:** linkage-driven fingers from palm-housed micro linear actuators (ILDA pattern, R5), with a
  short tendon coupling the distal joints. Linkages keep the K1 advantages over long tendons: no sheath loss, no
  re-tensioning, no wrist coupling. Ball screws are self-locking enough to hold a grasp without power.
* **13 DOA** (R7 #4: ≥ 13 active DOF with a 4-DOF thumb, finger abduction):
  - thumb 4 (CMC opposition rotation, CMC flexion, MCP flexion, IP flexion);
  - index 3 (MCP abduction, MCP flexion, PIP+DIP coupled);
  - middle 2 (MCP flexion, PIP+DIP);
  - ring 2 (MCP flexion, PIP+DIP);
  - little 1 (coupled flexion);
  - spread 1 (ring + little abduction, coupled).
* **Per actuator:** maxon DCX 10 L + GPX 10 + ENX 10 → KSS Ø4 × 1 ball screw on a miniature guide → crossed four-bar,
  as K1. 16:1 heads on the flexors, 4:1 on abduction and thumb rotation.
* **Grasp ≥ 200 N [target]** (R7 #4: 200 N ≈ 20 kg × 9.81 / (2 × μ 0.5)). Arithmetic [E]: the K1 actuator gives
  ≈ 42 N continuous at the nut with a 4:1 head (R5); a 16:1 head gives ≈ 42 × 4 × 0.875 ≈ 147 N continuous
  (0.875 = assumed 2-stage / 1-stage gearhead efficiency ratio). With an assumed 0.3 contact-to-nut force ratio at the
  proximal phalanx, four flexors give ≈ 176 N continuous and more than 200 N short-time. The KSS Ø4 × 1 dynamic
  rating (560 N [V, R5 via R10]) bounds the nut force. Prove it on the single-finger rig (docs/11).
* **Palm camera** behind a sealed PC window in the palm centre, angled 20° toward the fingertips; the controller board
  and 13 drivers sit in the sealed palm (§12).
* **Mass:** 1.15 kg per hand in the budget [gen] (Dex5-1 is 1.0 kg with 16 DOF, R7).

## 9. Thermal management and the liquid cooling loop

### 9.1 Heat sources and paths

| Heat source | Design heat | Path |
|---|---|---|
| KA-130K windings (×2) | **71 W** at the continuous requirement; 215 W at the motor's rating | stator → potting (≥ 1.5 W/m·K) → laminations → shrink fit → jacket → coolant |
| KA-130H windings (×2) | **35 W** at the continuous requirement | same |
| KA-130 iron loss (×4) | ≈ 20 W average walking; ≤ 85 W at maximum speed (upper bound, R10 §3.2.5) | laminations → jacket |
| HC2 drives (×4) on the actuator rear caps | ≈ 5 W each walking (3 % drive loss, power_budget) | rear cap → housing → jacket |
| Jetson AGX Thor | 75 W typical, 130 W peak [gen power budget] | cold plate on the loop |
| Other actuators (22) | low (hip roll 79 N·m continuous req is the highest) | stator → housing → link structure; derate 0.85 |
| RT computer, safety MCU, PDU | ≈ 20–60 W | conduction to the spine plate inside the sealed core; internal stirring blower |
| Battery packs | ≈ 15 W at 450 W draw | cells → mica → enclosure → bay walls |

Winding heat at the continuous requirement [E] uses P = (T_motor / Km)², Km 1.286 N·m/√W:
knee 142 / 0.84 / (17 × 0.92) = 10.8 N·m → 71 W; hip 98 / (14 × 0.92) = 7.6 N·m → 35 W. Requirements from
[generated/joint_requirements.md](generated/joint_requirements.md); worst-angle four-bar ratio 0.84.

**Design heat to the loop:** per leg 71 + 35 + 2 × 20 + 2 × 5 = **156 W**; two legs 311 W; plus the Thor
75–130 W → **≈ 390–440 W** [E]. Above this point (sustained running at the motors' full rating, up to ≈ 600 W per leg),
the drives' I²t model derates; the loop is not sized for it.

### 9.2 Loop layout

```
 TORSO (upper back)
   radiator 240 mm + 2 × 120 mm IP68 fans, in the wet duct
     │ outlet (coolest coolant)
   compensator (40 mL, 0.3 bar) + fill/bleed valve + pressure sensor
     │
   Thor cold plate
     └── pump L ── check valve ── supply L ─┐        (pump R, supply R, return R: right leg, mirrored)
                                            │
 WAIST       4 hoses cross waist yaw + pitch inside the bellows (clock-spring + U-loop)
                                            │
 PELVIS      hip-yaw service loop ──────────┤
 ═══ limb interface: dry-break couplings ═══╪══════════════════════════════════
 LEFT LEG    hip-roll U-loop                │
             rolling loop across hip pitch  ▼
             KA-130K jacket (knee actuator, in the thigh)      ← coolest coolant, highest heat
             rolling loop back across hip pitch
             KA-130H jacket (hip-pitch actuator)
             hip-roll U-loop ─ limb interface ─ hip-yaw loop ─ waist ─ return L
                                                                          │
   return manifold ◄──────────────────────────────────────────────────────┘
     └──► radiator inlet
```

* **Order in each leg: knee jacket first, hip jacket second** (decided, docs/09 §11 H11; docs/05 §13 agrees). The
  coldest coolant goes to the motor with the highest heat flux. Both jackets are the same KM-130x50-LC sleeve with the
  same wetted area, so flux follows winding heat: knee 71 W against hip 35 W at the continuous requirement (§9.1).
  The order only moves a winding by the coolant rise across the other jacket, so compare the hottest winding [E,
  0.25 K/W copper-to-jacket-inlet, 31.8 W/K per branch, iron 20 W and HC2 5 W per jacket]:

  | Duty (copper loss knee / hip) | Knee first: knee / hip winding above supply | Hip first: knee / hip | Result |
  |---|---|---|---|
  | Continuous requirement (71 / 35 W) | **17.8** / 11.8 K | **19.6** / 8.8 K | knee first 1.9 K cooler |
  | W2 walk 1.2 m/s, scenario mean (47 / 30 W) | **11.8** / 9.9 K | **13.6** / 7.6 K | knee first 1.8 K cooler |
  | CW 30 kg carry, scenario mean (26 / 47 W) | 6.6 / **13.3** K | 8.8 / **11.7** K | hip first 1.6 K cooler |

  Scenario means are copper loss from `data/scenario_series.npz` through the `power.py` loss model with the real knee
  G(θ) [E]. The knee is the hotter motor at the continuous requirement and in W1, W2, ST, SU and SL; the hip only in
  CW, SQ, the arm holds AH/AL and the momentary LM lift. The knee also has the smaller thermal margin (1.56 against
  2.2, HC2-limited, docs/05 §6.1), so it goes first. Both lines cross hip pitch either way, because the knee actuator
  rotates with the thigh and the hip-pitch stator sits on the roll–pitch bracket.
* **Two pumps, one per leg branch, in parallel**, each with a check valve so a failed pump cannot short-circuit the
  other branch. The radiator, compensator and Thor cold plate are shared and see the full 1.0 L/min.
* **No reservoir open to air: sealed loop with a spring-diaphragm compensator** (decided, docs/09 §11 H11; BOM B123).
  A humanoid tilts, lies down and falls; an open reservoir would spill or let the pumps draw air into the jacket
  helices. The loop is sealed and fully filled, and a spring-diaphragm compensator holds 0.3 bar (gauge) and takes
  thermal expansion. Expansion of ≈ 0.47 L of 40 % propylene glycol over −20 → 80 °C is ≈ 0.47 × 100 × 5.5×10⁻⁴
  ≈ 26 mL [E, expansion coefficient approximate]; the compensator holds 40 mL. Filled at 20 °C with the spring at half
  stroke (P08.1), it has 20 mL each way against +15.5 mL at 80 °C and −10.3 mL at −20 °C [E, same coefficient], plus
  ≤ 0.5 mL per dry-break re-mate.
* **Drives above and upstream:** the HC2 boards sit on the rear caps, above the jacket O-rings when standing, behind
  a drip lip, conformally coated (dielectric-tolerant). A jacket leak drains away from them (R10 §5.1 risk list).

### 9.3 Jacket (on each KA-130 stator)

6061-T6 sleeve shrink-fitted on the potted stator (ID 130 mm, 2 mm web). A **two-start helical channel 6 × 3 mm**
(each start: 6 mm wide, 3 mm deep, pitch 18 mm) is machined in the sleeve OD and closed by the 7075 housing bore, with
two EPDM O-rings at each end and a leak-test port between them. Housing OD at the jacket section 130 + 2 × (2 + 3 + 2.5)
≈ **145 mm** [E]. Build and leak test: docs/13 §3.9.

The two-start helix is chosen for pressure drop. At 0.5 L/min in a single 6 × 3 mm channel, 6 turns long (≈ 2.56 m),
the flow is laminar (Re ≈ 760) and drops ≈ 5.7 kPa. Two starts carry half the flow over half the length each, so the
drop falls to ≈ 1.4 kPa, with the same wetted area and the same laminar heat-transfer coefficient [E, arithmetic in
§9.5].

### 9.4 Components

| Item | Requirement | Part example [ex] and source |
|---|---|---|
| Pumps (2) | brushless DC on the 12 V logic bus (docs/05 allocates 34 W for both), ≥ 0.5 L/min at ≥ 30 kPa and ≥ 0.8 L/min at ≥ 60 kPa (§9.5), tach output, glycol-compatible wetted parts, ≤ 0.15 kg | TCS Micropumps M510 series (micropumps.co.uk); Xylem/Laing DDC 12 V class (xylem.com). Check the head–flow curve against §9.5 |
| Radiator (1) | ≈ 20 W/K at full fan speed; 240 × 120 mm face, ≤ 30 mm core; mixed-metal-safe | Alphacool NexXxoS ST30 240 class (alphacool.com), or an aluminium core of the same face area |
| Fans (2) | 120 mm, **IP68** (they sit in the wet duct), PWM + tach, 12 V | Sanyo Denki San Ace waterproof series, e.g. 9WP (sanyodenki.com) |
| Dry-break couplings (2 per leg) | non-spill flat-face, ≥ 3 mm flow path, EPDM seals, blind-mate capable, push-to-connect | CPC LQ2 / PLQ2 (cpcworldwide.com); Koolance QD3 (koolance.com); or fluid modules of the Stäubli CombiTac docking connector used at the limb interface (staubli.com), §13 |
| Hoses | 6 mm ID × 10 mm OD EPDM (or Norprene), min bend radius ≤ 30 mm, barbed + clamped or push-lock | Saint-Gobain Norprene / generic EPDM |
| Compensator | 40 mL spring-diaphragm (EPDM membrane in a PA12 housing), fill/bleed valve | custom (docs/09) |
| Check valves (2) | ≤ 3 kPa cracking, EPDM | inline PC-cooling or industrial micro check valve |
| Sensors | 4 NTCs (supply/return per branch), 1 loop pressure (0–2.5 bar, stainless wetted), pump tach | TE M3200-class transducer (te.com) |
| Coolant | **40 % propylene glycol + mixed-metal inhibitor**; freezes ≈ −21 °C (R7 #6: operate to −20 °C) | Dow DOWFROST (dow.com) or an automotive OAT coolant at 40 % (BOM B122) |
| Thor cold plate | aluminium plate to the module's thermal transfer plate (no copper in the loop, docs/09 §6.2) | custom (B124); limit temperatures from NVIDIA's Jetson AGX Thor thermal design guide (not verified here) |

**Coolant decision: 40 % propylene glycol, not an "insulative" PC coolant** (docs/09 §11 H11):
- **Freeze and corrosion are hard requirements.** The robot must run to −20 °C (R7 #6), and every wetted metal is
  aluminium (6061 jackets and manifolds, the 7075 bore that closes the helix, aluminium radiator and cold plate).
  Inhibited 40 % propylene glycol freezes ≈ −21 °C and protects aluminium. The insulative PC coolant once priced for
  the BOM (Koolance LIQ-705, [koolance.com](https://koolance.com/liquid-coolant-bottles), accessed 2026-11-09) does not
  state a freeze point.
- **Electrical safety near the 67 V electronics does not rest on the coolant.** The bus is extra-low voltage with IP2X
  shrouded conductors (docs/05 §2), so the coolant's risk is a short or corrosion on a board. That risk is handled by
  placement (drives above and upstream of every fitting, drip lips, no fitting above a board), conformal coat and leak
  detection that trips the stop chain (docs/05 §8, §9). A coolant sold as insulative stays insulative only while it is
  ion-free; in an aluminium loop it picks up ions in service, so the design would have to assume it conductive anyway.
- **The leak pads need a conductive coolant.** The interdigitated leak pads (B129) sense a leak by its conductivity; a
  dielectric coolant would leave them blind.

The loop bench (B131) runs the same mix, so the flow sensors are calibrated on it and the jackets see one chemistry
from the first test on.

### 9.5 Flow, heat and pressure arithmetic [E]

Fluid properties for 40 % propylene glycol near 40 °C (approximate handbook values, to be replaced by the supplier's
data): ρ ≈ 1,030 kg/m³, cp ≈ 3,700 J/kg·K, μ ≈ 2.5 mPa·s, k ≈ 0.42 W/m·K.

| Quantity | Arithmetic | Result |
|---|---|---|
| Heat capacity flow per leg, 0.5 L/min | 0.5/60 L/s × 1.03 kg/L × 3,700 | 31.8 W/K |
| Coolant rise across a leg at the design heat | 156 / 31.8 | **4.9 K** |
| … at both motors' full continuous rating + iron (≈ 600 W) | 600 / 31.8 | 18.9 K (or 11.8 K at 0.8 L/min) |
| Rise across the radiator, 1.0 L/min total, 440 W | 440 / 63.5 | 6.9 K |
| Radiator mean coolant-to-air difference, UA ≈ 20 W/K | 440 / 20 | 22 K |
| Supply temperature at 25 °C ambient | 25 + 22 − 6.9 / 2 | **≈ 44 °C** |
| Supply temperature at 40 °C ambient | 40 + 22 − 3.5 | **≈ 59 °C** |
| Knee winding at 40 °C ambient, continuous requirement | 59 + 2 (Thor) + 0.25 K/W × 71 W | ≈ 79 °C (warn 130 °C) |
| Knee winding at 40 °C ambient, full motor rating | 61 + 0.25 × 215 | ≈ 115 °C (warn 130 °C) |
| Laminar h in the jacket channel (Nu ≈ 4.4, D_h 4 mm) | 4.4 × 0.42 / 0.004 | ≈ 460 W/m²K |
| Convective part of the jacket resistance (wetted 0.0154 m² × 1.5 for side walls) | 1 / (460 × 0.023) | ≈ 0.09 K/W of the 0.25 K/W total |
| Jacket Δp, single start (Re 760, f·Re 62, L 2.56 m) | (62/760) × (2.56/0.004) × ½ρv² | 5.7 kPa (+20–30 % for curvature) |
| Jacket Δp, two-start | ¼ of the single start | **≈ 1.4–1.8 kPa** |
| Hose Δp, 6 mm ID, 2.6 m per branch (Re 730) | (64/730) × (2.6/0.006) × ½ρv² | 1.7 kPa |
| Couplings, 2 mated pairs per branch | assumed 5 kPa per pair at 0.5 L/min (take from the coupling's flow curve) | 10 kPa |
| Fittings, check valve | assumed | 3 kPa |
| Radiator + cold plate (shared, 1.0 L/min) | assumed | 5 kPa |
| **Branch total at 0.5 L/min** | 2 × 1.6 + 1.7 + 10 + 3 + 5 | **≈ 23 kPa (2.3 m head)** |
| Branch total at 0.8 L/min | laminar parts × 1.6, minor losses × 2.56 | ≈ 50–55 kPa |
| Loop volume | 4 × 46 mL (jackets) + 4 × 1.3 m × 28 mL/m (hoses) + ≈ 120 mL (radiator) + ≈ 20 mL (plate, pumps, compensator) | ≈ 0.47 L |

The radiator UA of 20 W/K (≈ 10 W/K per 120 mm section at full fan speed) is an assumption to measure on the bench
before the torso CAD freezes. **At 40 °C ambient the supply reaches ≈ 59 °C.** The motors tolerate this; the Thor cold
plate may not. If NVIDIA's limit for the thermal transfer plate is below ≈ 60 °C, the AI computer runs its 40 W mode
above 35 °C ambient, or moves to the radiator outlet with a dedicated small branch. This is an open item.

**Fan and pump power** ≈ 25–45 W against 35 W typical / 60 W peak allocated in the power budget [gen]. The pumps run
from the 12 V logic bus so they keep cooling the jackets after an actuator-bus stop (docs/05).

### 9.6 Failure behaviour

| Event | Detection | Response |
|---|---|---|
| Pump failure (one leg) | tach = 0, branch ΔT rises | that leg's KA-130 units switch to the **air-only rating**; robot finishes the task at reduced duty and sits |
| Leak | loop pressure falls below 0.15 bar; branch ΔT | both legs to air-only rating; stop at the next safe posture; leak isolates itself at the dry-break couplings when the leg is removed |
| Coolant over-temperature | supply NTC > 65 °C | Thor to 40 W mode, gait speed limit, then stop |
| Freeze risk | ambient < −15 °C and loop idle | circulate with pumps on battery heat (pack heaters, §10) |

The air-only rating is R10's no-jacket variant: 179 / 278 = 0.64 of the jacketed continuous torque. Applied to Mk II
[E]: knee 295 × 0.64 = 190 N·m, worst-angle 160 N·m at the joint against 142 N·m required (≈ 1.13); hip 243 × 0.64 = 156
against 98 N·m (≈ 1.6). **A loop failure is a derate, not a fall.**

### 9.7 Loop mass against the budget

`params.py` allows 1.25 kg in the torso for the loop + electronics blower, plus coolant lines in each thigh's 0.45 kg
harness line. Component estimate for the torso part [E]: radiator 0.60 + 2 IP68 fans 0.30 + 2 pumps 0.30 + compensator,
check valves and manifold 0.10 + torso coolant ≈ 0.15 + blower 0.08 = **≈ 1.5 kg**, i.e. ≈ 0.3 kg over the allowance
(the Thor cold plate is carried in the 1.45 kg AI-computer line). Carry it inside the 10.3 kg growth contingency (§14).
The radiator outline (274 × 120 × 30 mm + 25 mm fans) is wider than the 0.22 m box `params.py` uses for the cooling
item; it fits across the 0.44 m upper back behind the spine.

### 9.8 Fill and bleed

Vacuum-fill: pull the sealed loop to ≤ 50 mbar through the compensator valve, hold 10 min (leak-down ≤ 5 mbar), then
let premixed coolant in under vacuum. This fills the jacket helices without trapped air. Pressurise to 0.3 bar, run both
pumps 10 min with the robot laid on each side and on its back, recheck pressure. Re-mating a dry-break coupling admits
only the film volume; the compensator absorbs it.

## 10. Hot-swap battery bay

Two identical packs: **16S4P, 64 × Molicel P50B, 1.15 kWh each, 6.20 kg incl. BMS, fuse, end cap and handle** [gen mass
budget]. Total 128 cells, the energy of the 16S8P row of [generated/power_budget.md](generated/power_budget.md):
2,235 Wh, 1,951 Wh usable, **4.9 h normal mixed, 4.3 h continuous walking** [gen]. (The 2 × 1.15 kWh label uses 3.6 V
per cell; the power budget uses 3.49 V, hence 2.24 vs 2.30 kWh.)

### 10.1 Layout
* The two bays sit side by side in the torso behind the spine centreline (pack centres x = −40 mm, y = ±52 mm,
  z = +130 mm above the waist-pitch axis [params.py]); pack envelope **175 × 98 × 185 mm** (fore-aft × wide × tall
  [params.py]): 2 × 4 × 8 cells fill ≈ 150 mm, and the rear end cap with BMS, fuse, handle and connector half takes the
  other ≈ 25 mm (docs/09 §11 H12).
* Packs insert **from the back, fore-aft**, each through its own gasketed hatch in the back door.
* Suggested cell layout: 2 layers × 4 × 8 cells with axes fore-aft; a 4P group is one column of 4 cells, 8 groups per
  layer, 16 groups in series [E]. BMS, fuse and handle in the rear end cap.

### 10.2 Mechanism

| Element | Design | Part example [ex] |
|---|---|---|
| Bay | 7075 channel pair tied into the spine and lower rib; PTFE-lined (or POM) guide strips on both walls; a keyed T-rail in the floor so a pack enters one way only. Either pack fits either bay | machined |
| Retention | **over-centre cam lever** on the pack end cap engages a hardened pin in the bay; the last 8 mm of lever travel draws the pack onto its front stop and the connector, and preloads it against vibration (≈ 300 N). A spring-loaded **secondary catch** must be pressed before the lever can lift | Southco draw-latch class (southco.com), or machined cam |
| Lock | a **fail-locked solenoid pin** (unpowered = locked) blocks the secondary catch, and so the lever. It retracts only through the hardware AND of docs/05 §4.5 (the other pack present, connected and able to carry the robot; this pack already shed). Release button and 3-colour LED per bay; keyed manual override behind the back cover for a dead robot | BOM B112 |
| Power and signal connector | **floating blind-mate** connector on the bay front bulkhead (± 1 mm radial, ± 1° float); pack side fixed. 2 power contacts ≥ 60 A continuous, plus signal pins: CAN-FD (BMS) and the pilot loop (docs/05 B111) | Anderson Power Products SBS series with auxiliary contacts (andersonpower.com), or a Stäubli CombiTac docking frame |
| Contact sequencing | power contacts make first and break last; the **pilot contact is ≥ 2 mm shorter** (makes last, breaks first), so a forced removal still breaks the power pins at zero current (docs/05 §4.5) | per connector |
| Latch switches | latch and lock-position micro-switches (docs/05 B112); the latch switch opens in the first 10° of lever travel, a mechanical backup to the electrical shed sequence | Omron D2SW sealed (omron.com) |
| Sealing | pack enclosure IP67 on its own (connector face seal); bay hatch gasket IP65 | EPDM D-profile |
| Cold start | 15 W heater film on each pack, BMS-controlled; pack below 0 °C does not discharge above C/5 until warm | silicone heater film |

**No contact ever makes or breaks under load:** pack terminals are dead until the pack is seated and the pilot loop
closes, and a pack is shed before its lock releases. The OR-ing, hand-off, inrush limiting and unlock logic are
electrical (docs/05 §4). The mechanism provides the guidance, the draw-in force, the lock, the contact stagger and the
signals.

### 10.3 Swap without shutdown (≤ 3 min target, R7 #3)
1. Press the bay's release button. The robot moves to the swap posture with the 1.5 kW power cap (docs/05 §4.5); the
   power path sheds pack A; when the unlock conditions hold the solenoid retracts and the LED turns green.
2. Open the hatch (2 quarter-turn fasteners), press the secondary catch and lift the lever; pack B carries the
   robot. The lever ejects pack A ≈ 10 mm.
3. Pull pack A out (6.2 kg, handle on the end cap). Insert the charged pack until it touches the connector; close the
   lever (draws it home); close the hatch.
4. The BMS reports the new pack; firmware updates the torso mass model (pack-present).

One pack alone at the whole-robot simultaneous peak of 3,076 W [gen] draws 3,076 / 52 = 59 A, 14.8 A per cell, inside
the P50B's 60 A continuous rating (R3 via R7) [E]. Removing one pack moves the centre of mass 6.2 × 0.052 / 103.1 ≈
3 mm sideways [E, 103.1 kg estimated mass from the gen mass budget]; the controller corrects it from the pack-present signal.

## 11. Cable and hose routing through moving joints

**Decision (docs/09 §11 H2): no cable runs through an actuator bore. Every joint is crossed outside the actuator, in a
protected service loop with strain relief on both sides of the joint.**

* **Why.** K1 routed power and EtherCAT through Ø20 / Ø15 actuator bores. The Mk II planetary tooth plans (docs/04 §5.2,
  §7; docs/09 §5.1 Plan A, the baseline) leave no room for them: the KA-130K stage-1 sun is z16 × m0.8 (12.8 mm pitch
  diameter), and the KA-110P and KA-90P suns are z15. The bores that remain (KA-130H Ø12; the KH-C25 Ø12, KH-C20 Ø10
  and KH-14 Ø12 hollow input shafts, docs/09 §4) cannot take a 10 AWG pair plus a shielded EtherCAT cable, so they carry
  no harness. Gear Plan B (docs/09 §5.1) is not needed for routing.
* **Legs and waist: one service bundle per leg, alongside the coolant hoses.** Each leg bundle carries the 10 AWG
  leg-zone pair (52 V, docs/05 §5), the EtherCAT IN and OUT cables with STO and FAULT (J-LINK, docs/05 §9), the HC2
  12 V aux pair and the coolant supply and return hoses. EtherCAT cable: igus chainflex CF Robot (rated for torsion and
  bending, ±180°/m at 5 M cycles [ds R3]); power: 10 AWG silicone.
* **Protection.** Cables and hoses share each loop but not a channel. The loop guides (waist clock-spring former,
  hip-yaw partial clock-spring, hip-pitch C-trough, U-loop clips; BOM B136) have a cable channel above the hose channel,
  so a weeping fitting drains away from the cables (§9.2; docs/05 §9). The cable part of each loop runs in a PET
  braided abrasion sleeve, with a grommet at every edge.
* **Strain relief at each joint.** The bundle is clamped to the link at the two fixed points of every loop (saddle clamp
  or P-clip), so the loop takes the motion and no connector, crimp or hose barb does. Clips every 80 mm between joints;
  strain relief within 30 mm of every connector (docs/05 §9).
* **Bend radii.** Hoses ≥ 30 mm; 10 AWG silicone (≈ 5 mm OD) ≥ 50 mm, the docs/05 §9 rule of 10 × diameter [E];
  EtherCAT cable per its datasheet. The clock-springs and the C-trough have ≥ 60 mm radius; the U-loops are formed to
  ≥ 50 mm.
* The service loops (coolant hoses are 10 mm OD and never fit a bore):

| Joint crossed | Range | Loop | Length change [E] |
|---|---|---|---|
| Waist yaw | ±70° | 4 hoses and the torso-to-pelvis harness (2 leg bundles, the 14 AWG waist pair, EtherCAT down and back) as a flat ribbon in a 1.5-turn clock-spring around the waist-yaw housing, inside the bellows; cables on the upper face of the ribbon | 70 mm × 2.44 rad ≈ 170 mm |
| Waist pitch | −15/+75° | U-loop beside the KA-110P, hoses and harness together | 60 mm × 1.57 rad ≈ 95 mm |
| Hip yaw | −30/+45° | 2 hoses + the leg bundle per leg, partial clock-spring inside the pelvis shell, above the limb interface | 60 mm × 1.31 rad ≈ 80 mm |
| Hip roll | −25/+45° | U-loop behind the roll actuator, hoses and leg bundle | ≈ 75 mm |
| Hip pitch | −125/+30° | **rolling loop** in a C-trough concentric with the axis (radius 85 mm), hoses and the thigh/shank harness together, cables in the upper channel | 85 × 2.71 rad / 2 ≈ 115 mm |
| Knee, ankle | 0–130°; ±45° / ±25° | harness to the shank and foot in a rolling loop at the knee and a short U-loop at the ankle (no coolant below the knee) | ≈ 80 mm at the knee |

* Loops are tested for 10⁶ cycles over the full range on the leg test rig before the first walk (P07 §G).
* **Arms and neck follow the same rule.** The arm harness (14 AWG pair, EtherCAT/STO, palm-camera coax) crosses shoulder
  pitch (240°) and shoulder roll (175°) in the K1 clock-spring cable cassettes, and shoulder yaw, elbow, wrist yaw and
  the wrist cross in service loops (P09). The neck harness crosses in a twist-capable service loop (P11).
* Each limb has one power pair + EtherCAT in and out (daisy chain) + STO; legs add two coolant lines. The rolling and
  U-loops are what the limb-interface service plate (§13) and the bellows (§12) are sized around.

## 12. Sealing: IP65 body, IP67 legs and hands (R7 #6)

**Principle: seal the components, drain the limbs.** Shells and limb interiors are allowed to get wet and drain. The IP
boundary is each actuator, each electronics enclosure, each connector and each cable jacket. K1's IP54 relied on shell
overlaps; that cannot reach IP65 jets or IP67 immersion.

| Zone | Target | How |
|---|---|---|
| **Leg actuators** (hip roll down to ankles, 10 units) and **hands** | **IP67** (1 m, 30 min) | static EPDM/FKM O-rings on every housing joint; output **radial lip seal** (double lip with dust lip, FKM; or a PTFE-lip seal for low drag) instead of K1's V-ring; **pressure-equalising ePTFE vent** on each housing so thermal pumping cannot draw water past the lip; connectors IP67 when mated and capped when not; potted cable entries |
| Torso and pelvis electronics core | IP65 | gasketed sealed compartment (Thor, RT computer, safety MCU, PDU); internal stirring blower only; no air path from outside |
| Back door, battery hatches | IP65 | EPDM D-profile gaskets, 25 % compression, quarter-turn fasteners on a stiff frame |
| Battery packs | IP67 | sealed enclosure, connector face seal, ePTFE vent |
| Radiator and fans | wet duct | louvred intake low on the back, exhaust grille high, drain at the duct bottom, IP68 fans, stainless mesh (not foam, which soaks water); **the duct never opens into a sealed volume** |
| Arm actuators, head | IP65 | O-rings + output lip seals; vents; head sensors are IP65/IP67 parts (ZED X IP67 [R4]) |
| Waist, neck, ankle joints | IP65 / IP67 | TPU bellows with band clamps over the actuators (second barrier) |
| Foot | IP67 | load cells and foot board potted; sole replaceable |
| Hands | IP67 | sealed palm housing (O-ring lid) for controller, drivers and actuators; each push-rod leaves the palm through a PTFE rod seal or a silicone micro-bellows; palm camera behind a bonded PC window; tactile skin overmoulded |
| PCBs | all | conformal coat (acrylic, dielectric-tolerant near the coolant) |

**Seal drag** is small against the joint torques: a lip seal on a ≈ Ø90 mm output adds roughly 0.3–1 N·m at the output
[E, typical radial-seal friction; measure on the dyno]. It matters only for the friction model in torque estimation.
Part examples [ex]: SKF HMSA10 FKM radial seals (skf.com); Trelleborg Turcon Roto Variseal PTFE-lip seals
(trelleborg.com); GORE protective vents (gore.com); Amphenol SurLok Plus IP67 power connectors [ds R3].

**Verification:** IPX5 jet and IPX7 immersion of one actuator and one hand before the robot, then the IP65 spray test of
the assembled robot (docs/11). Not rated for pressure washing or submersion of the torso.

## 13. Modularity, service and the quick-release limb interface

* **26 rotary actuator modules in 7 classes.** Any module of a class swaps with another: same flanges, same connector,
  the drive identifies itself over EtherCAT, calibration is stored in the drive.
* Wear parts: soles, fingertip caps, bumpers, bellows, rod ends, lip seals, coupling seals. All listed as BOM spares.

### 13.1 Leg limb interface (hip-yaw output) — target: leg off in ≤ 10 min (R7 #14)

The leg below the hip yaw (yaw–roll yoke to foot) is one module of **20.6 kg** [gen body masses: 3.44 + 5.11 + 6.87 +
4.22 + 0.22 + 0.77].

| Element | Design |
|---|---|
| Location | between the KA-90P hip-yaw output and the yaw–roll yoke |
| Location features | Ø70 H7/g6 spigot; 2 dowels (one round, one diamond) for angular index; spigot face O-ring (IP67 at the interface) |
| Clamp | **V-band clamp**: 20° flank V-flanges on both halves (contact radius ≈ 50 mm), 3-segment hinged 17-4PH band, **single M8 12.9 T-bolt** tightened to 10 N·m with a torque-limiting T-handle; the band stays captive on the pelvis side; a spring safety catch holds it if the T-bolt is loose |
| Service plate | blind-mate, on the interface face, engaged by guide pins as the leg is offered up axially: 2 power contacts (60 V), EtherCAT (2 pairs in, 2 out), STO A/B, leg ID, and **2 dry-break coolant couplings** (supply, return) |
| Service plate example [ex] | Stäubli CombiTac docking frame with power, data and fluid modules (staubli.com). Fallback: discrete IP67 connectors (SurLok Plus 3.6 mm [ds R3], M12 X-coded EtherCAT, 2 × CPC LQ2) on one bracket, mated by hand after the clamp closes |
| Support | a leg trolley under the foot carries the 20.6 kg; the robot hangs in the gantry harness |

**Clamp arithmetic [E].** Wedge equilibrium of a V-band with band tension T, flank angle φ = 20°, friction μ = 0.15
during tightening: axial clamp F_a = π·T·(1 − μ·tan φ)/(tan φ + μ) = π × 6,000 × 0.945 / 0.514 ≈ **34.7 kN** for
T = 6 kN (M8 12.9 at ≈ 0.2 × 6,000 × 0.008 = 9.6 N·m).

* Separation moment of a thin clamped ring: M_sep = F_a × r / 2 = 34.7 kN × 0.050 / 2 ≈ **867 N·m.**
* Leg-root bending in the structural drop: GRF 2.76 kN [gen, X case] × CoP offset ≈ √(0.19² + 0.055²) = 0.198 m (toe
  and sole edge) ≈ 546 N·m → **SF 1.59** against separation (≥ 1.5 required for X).
* Torque by friction: 34.7 kN × 0.15 × 0.050 = 260 N·m, plus 2 dowels, against the hip-yaw momentary 76 N·m (3.4) and
  the KA-90P peak 129 N·m (2.0).
* Validate on a fixture: 1.5 × 546 N·m bending without a 0.02 mm feeler entering the joint, and torque to 260 N·m
  without slip (docs/11).

**Leg removal (≈ 5 min [target]):** robot in the gantry, leg on the trolley → leg drives to STO → loosen the T-bolt,
open the band → lower the leg 15 mm off the spigot: guide pins withdraw the service plate, the couplings close dry →
roll the leg away. Refit in reverse. No coolant bleed is needed (§9.8). Mass penalty against a bolted flange ≈ +0.25 kg
per leg (V-flanges, band, service plate) [E].

### 13.2 Arm limb interface (shoulder-pitch output)
Same pattern, smaller: Ø80 V-band, M6 T-bolt, service plate without coolant. The arm's root bending at 10 kg per hand
at full reach is ≈ the 90 N·m shoulder hold [gen], far below the clamp's capacity.

### 13.3 Hand
The hand stays on the wrist F/T flange (K1 layout). An ISO 9409-1 quick-change flange with power and EtherCAT
pass-through (R7 #7) is not in the Mk II baseline.

## 14. Mass budget (Mk II)

[generated/mass_budget.md](generated/mass_budget.md): **103.1 kg estimated; 113.4 kg design mass** (× 1.10). K1 for
comparison: 84.1 kg estimated, 92.6 kg design (the same file at git commit 96eb3d9).

| Category | Mk II kg [gen] | K1 kg | Change | Main reason |
|---|---|---|---|---|
| Actuators | 59.23 | 45.37 | +13.86 | KA-130 jacketed 50 mm stack, KA-110P RI115-PH, cycloid arms with Ø115 shoulder motors |
| Structure | 14.93 | 14.93 | 0 | unchanged in the budget (flange upgrade, interfaces and bay not yet added) |
| Battery | 12.40 | 8.90 | +3.50 | 2 × 16S4P hot-swap (128 cells, 6.20 kg packs with end cap) instead of 16S6P (96 cells) |
| Electronics | 5.26 | 4.56 | +0.70 | liquid loop + Thor cold plate |
| Shells | 4.66 | 4.66 | 0 | |
| Harness | 2.97 | 2.57 | +0.40 | thigh coolant lines + dry-break couplings |
| Hands | 2.30 | 1.84 | +0.46 | 13 DOA, palm camera |
| Sensors | 1.31 | 1.31 | 0 | |
| **Total** | **103.1** | **84.1** | **+19.0** | |

Heaviest bodies [gen]: torso 27.80 kg (two packs 12.40), thigh 6.87 kg each (knee actuator 4.96), hip-roll link
5.11 kg each (hip-pitch actuator 4.76).

**Known growth not yet in `params.py`** [E], to be carried inside the 10.3 kg contingency (113.4 − 103.1):

| Item | Estimate |
|---|---|
| Cooling loop over its 1.25 kg allowance (§9.7) | +0.3 kg |
| V-band limb interfaces, 2 legs + 2 arms | +0.25 × 2 + 0.15 × 2 ≈ +0.8 kg |
| Battery bay channels, rails, latches, connectors | +0.6 kg |
| IP67 seals, vents, bellows upgrades | +0.3 kg |
| Brakes, shoulder pitch × 2 + waist pitch | not yet sized for mass |
| KW-L2 motor (ECX FLAT 32 L mass not found) | unknown |
| **Sum of the known items** | **≈ +2.0 kg** → ≈ 105.2 kg, inside contingency |

**CAD and packaging items for the CAD owner:** hip-pitch housing 10 mm longer (inboard, §3.1); Ø145 jacket sections on
the KA-130 (§9.3); KA-110P output hub for PCD 100 (§5); KH-25 Ø127 housings in the chest and shoulder (§3.5); the
240 mm radiator across the upper back (§9.7); twin battery bays and hatches (§10); hip-yaw V-band interfaces (§13).

## 15. Structural verification status

Hand calculations at the Mk II loads ([generated/structure_checks.md](generated/structure_checks.md)). Required SF:
≥ 1.5 on yield for the structural drop (X) and momentary cases (M); ≥ 2.0 against fatigue for normal loads (N). All pass.

| Check | Case | Load | SF [gen] |
|---|---|---|---|
| Knee push-rod axial | N / X | 6.8 / 8.8 kN | 11.34 / 8.76 |
| Knee push-rod Euler buckling | N / X | 6.8 / 8.8 kN | **5.66 / 4.37** |
| Knee rod ends (M12, C0 ≈ 30 kN, confirm) | X | 8.8 kN | 3.40 |
| Thigh twin plates, bending at the knee reaction | X | 615 N·m | 5.89 |
| Thigh plates, fatigue at repeated knee torque | N | 431 N·m | **2.66** |
| Shank CFRP tube bending | X | 300 N·m | **2.52** |
| Shank CFRP axial | X | 2.76 kN | 30.2 |
| KA-130K output flange slip | M | 535 N·m | **1.75** |
| KA-110P output flange slip (12 × M5, PCD 100) | M | 379 N·m | 2.35 |
| KA-90P output flange slip | M | 149 N·m | 2.08 |
| Ankle cross pins, double shear | X | 2.76 kN | 41.8 |
| Foot plate toe cantilever, fatigue | N | 199 N·m | 2.93 |
| KA-130K stage-2 sun, Lewis | M | 493 N·m out | **2.16** |
| KA-130K output crossed-roller L10 | N | P_eq 3.5 kN | 734,811 h vs 3,000 h |
| Leg limb interface, separation (§13.1) | X | ≈ 546 N·m | ≈ 1.59 [E] |

The checks use the requirement loads. The knee actuator can produce more (719 N·m at 110°), which is why the drive caps
it at 535 / G(θ) (§3.2). Next: FEA of the pelvis bowl, yokes, knee hub, foot plate, KA-110P hub and the V-band flanges;
modal analysis with the heavier Mk II actuators; proof loading at 1.5 × the structural case (docs/11).
