"""Build a MuJoCo MJCF model of KESTREL K1 from params.py.

Inertial properties are computed from the component list (parallel-axis theorem over
boxes / cylinders / spheres), so the model always matches the mass budget.
Each joint carries ``armature`` = rotor inertia x ratio^2 (reflected motor inertia),
which matters a great deal for swing-leg torques with geared actuators.
"""
from __future__ import annotations

import numpy as np

from . import params as P


def shape_inertia(c):
    m = c.mass
    if c.shape == "box":
        lx, ly, lz = c.size
        return np.diag([m * (ly**2 + lz**2) / 12, m * (lx**2 + lz**2) / 12, m * (lx**2 + ly**2) / 12])
    if c.shape == "cyl":
        r, h, ax = c.size
        ia = m * r**2 / 2
        ip = m * (3 * r**2 + h**2) / 12
        d = {"x": [ia, ip, ip], "y": [ip, ia, ip], "z": [ip, ip, ia]}[ax]
        return np.diag(d)
    if c.shape == "sph":
        (r,) = c.size
        return np.eye(3) * 0.4 * m * r**2
    raise ValueError(c.shape)


def composite(comps, scale=1.0, extra=()):
    """Return (mass, com, inertia about com) for a list of components (+ extra point masses)."""
    items = [(c.mass * scale, np.array(c.pos, float), shape_inertia(c) * scale) for c in comps]
    for m, pos in extra:
        items.append((m, np.array(pos, float), np.eye(3) * m * 0.03**2))
    M = sum(i[0] for i in items)
    com = sum(i[0] * i[1] for i in items) / M
    I = np.zeros((3, 3))
    for m, p, Ii in items:
        dvec = p - com
        I += Ii + m * (dvec @ dvec * np.eye(3) - np.outer(dvec, dvec))
    return M, com, I


def _f(v):
    return " ".join(f"{x:.6g}" for x in v)


def _geom_xml(c, rgba):
    if c.shape == "box":
        return f'<geom type="box" size="{_f(np.array(c.size) / 2)}" pos="{_f(c.pos)}" rgba="{rgba}" contype="0" conaffinity="0" group="1"/>'
    if c.shape == "cyl":
        r, h, ax = c.size
        q = {"x": "0.7071068 0 0.7071068 0", "y": "0.7071068 -0.7071068 0 0", "z": "1 0 0 0"}[ax]
        return f'<geom type="cylinder" size="{r:.4g} {h / 2:.4g}" pos="{_f(c.pos)}" quat="{q}" rgba="{rgba}" contype="0" conaffinity="0" group="1"/>'
    (r,) = c.size
    return f'<geom type="sphere" size="{r:.4g}" pos="{_f(c.pos)}" rgba="{rgba}" contype="0" conaffinity="0" group="1"/>'


CAT_RGBA = {
    "actuator": "0.20 0.22 0.25 1", "structure": "0.62 0.64 0.67 1", "battery": "0.85 0.55 0.15 1",
    "electronics": "0.15 0.45 0.30 1", "shell": "0.92 0.92 0.90 0.25", "harness": "0.1 0.1 0.1 1",
    "sensor": "0.10 0.35 0.70 1", "hand": "0.30 0.30 0.32 1",
}


def build_mjcf(mass_scale=P.DESIGN_MASS_GROWTH, payloads=None, effort=None, floor=True,
               damping=0.3, timestep=0.001):
    """Return MJCF XML string.

    payloads: dict body_name -> list of (mass, (x,y,z)) point masses (body frame).
    effort:   dict joint_name -> torque limit (N*m) for <motor> actuators.
    """
    payloads = payloads or {}
    joints = P.joint_table()
    bodies = P.build_bodies()
    children = {}
    for b in bodies:
        children.setdefault(b.parent, []).append(b)
    d = P.DIM
    z0 = d["ankle_h"] + d["shank"] + d["thigh"]

    def body_xml(b, indent):
        pad = " " * indent
        M, com, I = composite(b.comps, mass_scale, payloads.get(b.name, ()))
        lines = []
        if b.parent is None:
            lines.append(f'{pad}<body name="{b.name}" pos="0 0 {z0:.4f}">')
            lines.append(f'{pad}  <freejoint name="root"/>')
            lines.append(f'{pad}  <site name="imu" pos="-0.06 0 0.05" size="0.01"/>')
        else:
            lines.append(f'{pad}<body name="{b.name}" pos="{_f(b.jpos)}">')
        if b.parent is not None and b.joint is not None:
            j = joints[b.joint]
            cls = P.ACT[j["act"]]
            arm = cls["rotor_J"] * cls["ratio"] ** 2
            lines.append(
                f'{pad}  <joint name="{b.joint}" type="hinge" axis="{_f(b.axis)}" range="{j["lo"]:.4f} {j["hi"]:.4f}" '
                f'armature="{arm:.5g}" damping="{damping}" limited="true"/>')
        lines.append(
            f'{pad}  <inertial pos="{_f(com)}" mass="{M:.5g}" '
            f'fullinertia="{I[0,0]:.6g} {I[1,1]:.6g} {I[2,2]:.6g} {I[0,1]:.6g} {I[0,2]:.6g} {I[1,2]:.6g}"/>')
        for c in b.comps:
            lines.append(pad + "  " + _geom_xml(c, CAT_RGBA[c.cat]))
        if b.name.endswith("_foot"):
            fl, fw, heel = d["foot_len"], d["foot_w"], d["heel"]
            cx = fl / 2 - heel
            lines.append(f'{pad}  <geom name="{b.name}_sole" type="box" size="{fl / 2:.4f} {fw / 2:.4f} 0.005" '
                         f'pos="{cx:.4f} 0 {-d["ankle_h"] + 0.005:.4f}" rgba="0.1 0.1 0.1 1" friction="1.0 0.02 0.001"/>')
            lines.append(f'{pad}  <site name="{b.name[0]}_sole" pos="0 0 {-d["ankle_h"]:.4f}" size="0.01"/>')
        if b.name.endswith("_hand"):
            lines.append(f'{pad}  <site name="{b.name[0]}_palm" pos="0 0 -0.09" size="0.01"/>')
        if b.name == "head":
            lines.append(f'{pad}  <site name="eyes" pos="0.09 0 0.075" size="0.01"/>')
        for ch in children.get(b.name, []):
            lines.extend(body_xml(ch, indent + 2))
        lines.append(f"{pad}</body>")
        return lines

    world = []
    if floor:
        world.append('<geom name="floor" type="plane" size="20 20 0.1" rgba="0.8 0.8 0.8 1"/>')
    world += body_xml(children[None][0], 4)
    act = []
    for jn in joints:
        lim = (effort or {}).get(jn, 1000.0)
        act.append(f'    <motor name="{jn}" joint="{jn}" gear="1" ctrlrange="{-lim:.1f} {lim:.1f}" ctrllimited="true"/>')
    xml = f"""<mujoco model="kestrel_k1">
  <!-- Generated by calc/kestrel/model.py from params.py. Do not edit by hand. -->
  <compiler angle="radian" inertiafromgeom="false" autolimits="true"/>
  <option timestep="{timestep}" integrator="implicitfast"/>
  <visual><global offwidth="1600" offheight="1200"/></visual>
  <default><geom condim="3"/></default>
  <worldbody>
    <light pos="0 0 4" dir="0 0 -1" directional="true"/>
{chr(10).join('    ' + w if not w.startswith(' ') else w for w in world)}
  </worldbody>
  <actuator>
{chr(10).join(act)}
  </actuator>
</mujoco>
"""
    return xml


def load_model(**kw):
    import mujoco

    return mujoco.MjModel.from_xml_string(build_mjcf(**kw))
