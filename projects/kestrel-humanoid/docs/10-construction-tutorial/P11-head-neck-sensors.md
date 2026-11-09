# P11 — Neck, head, cameras, LiDAR, calibration

## A. Visual reference
* Head detail: [`renders/07_head_detail.png`](../../renders/07_head_detail.png)
* Sensor placement: [docs/06](../06-sensor-architecture.md)
* CAD: head shell `cad/out/step/head__head_shell.step`; visor and side windows in `cad/build_robot.py`

## B. Parts list

| BOM | Item | Qty |
|---|---|---|
| (P04) | KH-14 neck pitch, drive limit 23 N·m stored (neck yaw installed in P08) | 1 |
| B072 | Neck yoke, head frame (6061 plate + PA12-CF bracketry) | 1 set |
| B045 | ZED X Mini (behind the visor, 10° down) | 1 |
| B046 | ZED X One GS (temples, yaw ±55°) | 2 |
| B048 | Livox Mid-360 (crown) | 1 |
| B055 | ReSpeaker XVF3800 + speaker | 1 |
| B054 | VL53L5CX (head rear) | 1 |
| B075 | Visor (PC, smoked) + side windows + LiDAR window | 1 set |
| — | GMSL2 FAKRA-Z coax, 1.2 m × 4; Ethernet (Mid-360); USB (mic) | — |

## C. Tools
ChArUco calibration board (A1, rigid), AprilTag ground board, a laptop with Kalibr and the ZED SDK, a level, a lint-free optics kit.

## D. Manufacturing
* Head frame: a 6061 plate carrying the camera bracket (stiff: cameras must not move relative to each other, so first mode > 150 Hz), the LiDAR seat and the neck-pitch flange.
* Visor: thermoform 3 mm PC over a printed buck; cut the aperture windows; AR + hard coat on the camera apertures (outsourced optical coating, or buy coated PC windows and bond them in).

## E. Assembly
1. Neck yoke on the neck-yaw output (6 × M3 12.9 at 1.7 N·m, dowels); neck-pitch KH-14 in the yoke (axis y at z = 1555).
2. Head frame on the neck-pitch output (6 × M3 12.9 at 1.7 N·m, Loctite 243, dowels).
3. Cameras on the rigid bracket: ZED X Mini centred 66 mm forward of the neck axis at z = 1655; the two ZED X One GS at the temples, yawed ±55°. Torque the camera screws per the manufacturer and add thread-locker.
4. Mid-360 on its seat, its top ≈ 2 mm below the crown window. Ethernet + 24 V. Mic array at the lower rear behind its grille.
5. Route the 4 coax cables and the Ethernet through the neck with a twist-capable service loop (neck yaw ±80°, pitch −35/+50°).
6. Fit the head shell (two halves) and the visor (gasketed). Clean the windows.

## F. Electrical
* GMSL2 coax to the J601 deserialiser ports 0–3 (ports 4–5 are the palm cameras, P10). Power-over-coax from the J601,
  which sits on the 24 V logic bus, so the cameras stay up through an e-stop.
* Mid-360: 24 V logic bus (9–27 V input [ds R4]), Ethernet to the Thor 10GbE switch port, PTP enabled.
* Hardware frame sync: all GMSL cameras on one J601 frame-sync line.

## G. Testing and calibration (part of gate G3)
| Test | Pass |
|---|---|
| All streams at rate (ZED X Mini 30–60 fps, One GS 30 fps, Gemini 30 fps, 2 palm cameras, Mid-360 10 Hz) with PTP timestamps | no drops over 10 min; time offset < 1 ms |
| Stereo + intrinsics calibration (Kalibr / ZED tool) | reprojection RMS < 0.3 px |
| Camera–IMU extrinsics + time offset (Kalibr) | converged; time offset stable within 0.5 ms |
| LiDAR–head extrinsics | plane residual < 1 cm |
| Head–body kinematic calibration (AprilTag board, 30 poses) | ≤ 2 mm / 0.2° at 1 m |
| Neck range with cables, 1,000 cycles | no intermittent camera link errors |
