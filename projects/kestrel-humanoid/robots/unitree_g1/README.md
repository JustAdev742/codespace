# Unitree G1 model (the "g1" body option)

`g1_29dof.xml` and `meshes/` are Unitree's official MuJoCo model of the G1 humanoid (29 degrees of freedom), copied
unchanged from [unitreerobotics/unitree_mujoco](https://github.com/unitreerobotics/unitree_mujoco)
(`unitree_robots/g1/`, commit in `SOURCE_COMMIT`), under the BSD 3-Clause License in `LICENSE` (Copyright Unitree
Robotics).

About 1.3 m and 35 kg: 6 joints per leg, 3 waist, 7 per arm, joint torque limits as in the model (hip 88 N m,
knee 139 N m, ankle 50 N m, shoulder and elbow 25 N m). `train/model_g1.py` adapts it for the walking trainer and the
house simulator; nothing in this folder is modified. It is also the body the motion-dataset pipeline retargets to.
