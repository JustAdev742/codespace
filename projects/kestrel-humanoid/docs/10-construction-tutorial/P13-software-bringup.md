# P13 — Software bring-up and commissioning hand-off

This phase takes the assembled robot from "all joints move" to the walking, manipulation and payload gates. Detailed
test procedures and pass criteria are in [docs/11](../11-testing-commissioning.md). The architecture is in
[docs/07](../07-software-architecture.md).

## A. Visual reference
* Software layers: [`diagrams/software_stack.svg`](../../diagrams/software_stack.svg)
* Gates: [`diagrams/test_gates.svg`](../../diagrams/test_gates.svg)
* Simulation model: `sim/kestrel_k1.xml` (MuJoCo, generated with the sized torque limits)

## B. Software components
| Component | Install |
|---|---|
| RT computer | Ubuntu 24.04 + PREEMPT_RT, IgH EtherLab 1.6 (igc), ros2_control (Jazzy), Pinocchio, ProxQP/OSQP, ONNX Runtime |
| AI computer | JetPack 7, ROS 2 Jazzy, Isaac ROS (cuVSLAM, nvblox), ZED SDK, Livox SDK2, Foxglove bridge |
| Safety MCU | monitor firmware (heartbeat, tilt, temperatures, e-stop, leak, coolant temperature, relay outputs) |
| HC2 drives | custom firmware on F28P65x (TI C2000 SDK + EtherCAT slave stack), CiA-402 |
| PPM / PDU MCUs | hot-swap state machine, zone eFuse control, coolant sensing and pump control (docs/05 §4, §13) |
| Hand controllers | finger loops, tactile reflexes, KW-L2 commutation through the KES-WRIST board |
| Development PC | MuJoCo simulation, training package (see the training add-on), Foxglove |

## C. Tools
Gantry + harness (P01), wireless e-stop, cage, foam floor, a second person, a laptop with Foxglove, payload boxes for
G10 (a rigid box with handles on two sides and a quick-release strap, filled in 5 kg steps with sandbags).

## D. Configuration files to produce (commit them)
1. `config/joints.yaml`: joint order, encoder offsets, directions, soft limits, torque limits:
   - gear-limited classes at their repeated ratings (KH-25 160, KH-20 105, KH-14 23 N·m), duplicated by the drives'
     stored current limits (P04 §F);
   - the **knee angle-dependent limit table** (`data/knee_torque_limit.json`, P07 §F) and the HC2 continuous limit (75 A ≈ 263 / 217 N·m);
   - linkage tables (`data/knee_fourbar.json`, ankle/wrist geometry with the 1 mm KW-L2 lead).
2. `config/ethercat.xml`: slave order (30 slaves: 22 Everest + 4 HC2 + 2 hand controllers + 2 KES-WRIST boards, docs/05 §7), PDO maps (CST
   mode: target torque, position, velocity; actual position × 2, torque/current, temperatures, status), DC settings.
3. `config/safety.yaml`: tilt limit 35°; winding warn 130 °C / trip 150 °C; **coolant supply warn 55 °C, derate 65 °C,
   trip 75 °C; loop pressure < 0.15 bar → air-only rating**; leak → stop; heartbeat 2 ms; comms timeout 50 ms.
4. `config/power.yaml`: single-pack actuator power cap 1.8 kW; swap cap 1.5 kW; DIODE/TIED rules (|ΔV| < 0.5 V, SoC
   < 98 %); BMS CCL → regen cap.
5. `config/estimator.yaml`: IMU noise (CV7: 1.5 °/h bias instability, 30 µg/√Hz [ds R4]), kinematic noise, contact
   thresholds; payload mass and CoM parameters for G10.

## E. Bring-up sequence (each step gated in docs/11)
1. **G3 hanging:** robot suspended, feet clear, coolant loop running. Joint-by-joint at 10 % torque limits, then
   gravity compensation, then whole-body slow motions. Check every sensor stream, the estimator (base attitude vs the
   gantry inclinometer), the coolant sensors, and a pack swap with the drives in STO.
2. **G4 standing:**
   1. lower until the feet carry 20 % of the weight, then 50 %, then 100 % with the harness slack-taut;
   2. balance controller (WBC + IEKF);
   3. push tests ≤ 20 N·s;
   4. practise Cat 1 and Cat 0 stops caught by the harness.
3. **G5 stepping:** the ZMP walker (`calc/kestrel/gait.py` patterns through the WBC) for in-place steps, then
   0.1–0.3 m/s, with the harness taking ≥ 10 % load.
4. **Learned policy:** train in simulation (training add-on), evaluate in MuJoCo against the ZMP walker on the
   regression suite, deploy with the harness at 50 % action scale first.
5. **G6–G9:** free walking in the cage, stairs, endurance and manipulation per docs/11.
6. **G10 payload:** 30 kg sustained and 50 kg momentary, in steps, harness attached (docs/11 §7.1).

## F. Electrical / safety in this phase
* Every session starts with the e-stop functional check (press → drives disabled → reset), including the commissioning
  contactors on the HC2 feeds; their uncertified STO is never the only stop (docs/09 H8).
* Torque limits are raised in steps (25 % → 50 % → 100 %) only after the previous level has run for 1 h without faults.
  **No unrestricted high-torque operation near people at any stage**; nobody in the cage while drives are enabled.
* The standing (no-STO) pack swap is enabled only after G6, with the robot in the swap posture and the 1.5 kW cap.

## G. Exit criteria
Gate G10 signed (docs/11): G9 passed (1 h untethered walking at ≥ 0.8 m/s in the cage, 0.18 m stairs, pick-and-place),
30 kg carried 20 m at 0.6 m/s and a 50 kg momentary lift with all margins logged, thermal and coolant margins logged,
and a teardown inspection with no unexpected wear.
