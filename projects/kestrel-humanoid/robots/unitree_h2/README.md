# Unitree H2 model (used for the "H2-X" body option)

`h2_mujoco.xml` and `meshes/` are Unitree's official MuJoCo model of the H2 humanoid, copied unchanged from
[unitreerobotics/unitree_mujoco](https://github.com/unitreerobotics/unitree_mujoco) (`unitree_robots/h2/`, commit in
`SOURCE_COMMIT`), under the BSD 3-Clause License in `LICENSE` (Copyright Unitree Robotics).

The H2-X, unveiled on 21 October 2026, is a security-and-rescue variant of the H2. Unitree has published no H2-X
specification or model, so the "h2x" option here is built on this H2 model: 1.82 m, 71.3 kg, 31 actuated joints
(6 per leg, 3 waist, 7 per arm, 2 head), joint torque limits as in the model. `train/model_h2x.py` adapts it for the
walking trainer and the house simulator; nothing in this folder is modified.
