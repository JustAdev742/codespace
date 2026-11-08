# P13 — Software bring-up and commissioning hand-off

This phase takes the assembled robot from "all joints move" to the walking and manipulation gates.
Detailed test procedures and pass criteria are in [docs/11](../11-testing-commissioning.md). The architecture is in [docs/07](../07-software-architecture.md).

## A. Visual reference
* Software layers: [`diagrams/software_stack.svg`](../../diagrams/software_stack.svg)
* Gates: [`diagrams/test_gates.svg`](../../diagrams/test_gates.svg)
* Simulation model: `sim/kestrel_k1.xml` (MuJoCo, generated with the sized torque limits)

## B. Software components
| Component | Install |
|---|---|
| RT computer | Ubuntu 24.04 + PREEMPT_RT, IgH EtherLab 1.6 (igc), ros2_control (Jazzy), Pinocchio, ProxQP/OSQP, ONNX Runtime |
| AI computer | JetPack 7, ROS 2 Jazzy, Isaac ROS (cuVSLAM, nvblox), ZED SDK, Livox SDK2, Foxglove bridge |
| Safety MCU | monitor firmware (heartbeat, tilt, temperatures, e-stop, relay outputs) |
| Development PC | MuJoCo simulation, training package (see the training add-on), Foxglove |

## C. Tools
Gantry + harness (P01), wireless e-stop, cage, foam floor, a second person, a laptop with Foxglove.

## D. Configuration files to produce (commit them)
1. `config/joints.yaml`: joint order, encoder offsets, directions, soft limits, torque limits (strain-wave classes at their repeated-peak values), linkage tables (`data/knee_fourbar.json`, ankle/wrist geometry).
2. `config/ethercat.xml`: slave order, PDO maps (CST mode: target torque, position, velocity; actual position ×2, torque/current, temperatures, status), DC settings.
3. `config/safety.yaml`: tilt limit 35°, temperature warn 130 °C / trip 150 °C, heartbeat 2 ms, comms timeout 50 ms.
4. `config/estimator.yaml`: IMU noise (CV7: 1.5 °/h bias instability, 30 µg/√Hz [ds R4]), kinematic noise, contact thresholds.

## E. Bring-up sequence (each step gated in docs/11)
1. **G3 hanging:** robot suspended, feet clear. Joint-by-joint at 10 % torque limits, then gravity compensation, then whole-body slow motions. Check every sensor stream and the estimator (base attitude vs the gantry inclinometer).
2. **G4 standing:**
   1. Lower until the feet carry 20 % of the weight, then 50 %, then 100 % with the harness slack-taut.
   2. Balance controller (WBC + IEKF).
   3. Push tests ≤ 20 N·s.
   4. Practise Cat 1 and Cat 0 stops caught by the harness.
3. **G5 stepping:** the ZMP walker (`calc/kestrel/gait.py` patterns, replayed through the WBC) for in-place steps, then 0.1–0.3 m/s, with the harness taking ≥ 10 % load.
4. **Learned policy:**
   1. Train in simulation (training add-on).
   2. Evaluate in MuJoCo against the ZMP walker on the regression suite.
   3. Deploy with the harness, at 50 % action scale first.
5. **G6–G9:** free walking in the cage, stairs, endurance and manipulation per docs/11.

## F. Electrical / safety in this phase
* Every session starts with the e-stop functional check (press → drives disabled → reset).
* Torque limits are raised in steps (25 % → 50 % → 100 %) only after the previous level has run for 1 h without faults.

## G. Exit criteria
Gate G9 signed (docs/11): 1 h untethered walking at ≥ 0.8 m/s in the cage, 0.18 m stairs, 5 kg pick-and-place, all thermal margins logged, and a teardown inspection with no unexpected wear.
