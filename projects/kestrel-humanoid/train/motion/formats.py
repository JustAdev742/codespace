"""Read motion files from every dataset into one common form: Motion(name, fps, pos[T, 17, 3]).

Positions are in metres, z up, for the 17 keypoints in KEYPOINTS (joint centres of the human skeleton).

* AMASS (.npz with "poses", "trans", "betas"): SMPL+H forward kinematics, which needs the SMPL+H body model
  (the "Extended SMPL+H model" from mano.is.tue.mpg.de: smplh/<gender>/model.npz). Pass its folder as smplh_dir.
* BVH (Bandai Namco and most mocap exports): parsed directly; joints matched by name; units and up axis detected.
* XSens MVNX (.mvnx): segment origin positions, which are the joint centres.
* CMU / Acclaim (.amc with the subject's .asf skeleton in the same folder): Acclaim forward kinematics.
* Canonical .npz with "positions" [T, 17, 3] and "fps": already in this form.

A dataset in another format needs one more reader that returns a Motion; everything after this works unchanged.
"""
from __future__ import annotations

import re
from dataclasses import dataclass, field
from pathlib import Path

import numpy as np

KEYPOINTS = ["pelvis", "l_hip", "r_hip", "l_knee", "r_knee", "l_ankle", "r_ankle", "l_toe", "r_toe", "chest", "head",
             "l_shoulder", "r_shoulder", "l_elbow", "r_elbow", "l_wrist", "r_wrist"]
K = {k: i for i, k in enumerate(KEYPOINTS)}


@dataclass
class Motion:
    name: str
    fps: float
    pos: np.ndarray                     # [T, 17, 3] metres, z up
    meta: dict = field(default_factory=dict)


# ---------------------------------------------------------------------------------------------------------- rotations
def rodrigues(aa):
    """Axis-angle [..., 3] -> rotation matrices [..., 3, 3]."""
    th = np.linalg.norm(aa, axis=-1, keepdims=True)
    k = aa / np.maximum(th, 1e-12)
    kx, ky, kz = k[..., 0], k[..., 1], k[..., 2]
    z = np.zeros_like(kx)
    Kx = np.stack([np.stack([z, -kz, ky], -1), np.stack([kz, z, -kx], -1), np.stack([-ky, kx, z], -1)], -2)
    th = th[..., None]
    eye = np.broadcast_to(np.eye(3), Kx.shape)
    return eye + np.sin(th) * Kx + (1 - np.cos(th)) * (Kx @ Kx)


def euler_matrix(angles_deg, order):
    """Rotation matrices [T, 3, 3] from Euler angles [T, n] applied in BVH channel order (intrinsic)."""
    T = angles_deg.shape[0]
    R = np.broadcast_to(np.eye(3), (T, 3, 3)).copy()
    for i, ax in enumerate(order):
        a = np.radians(angles_deg[:, i])
        c, s = np.cos(a), np.sin(a)
        M = np.zeros((T, 3, 3))
        if ax == "X":
            M[:, 0, 0] = 1; M[:, 1, 1] = c; M[:, 1, 2] = -s; M[:, 2, 1] = s; M[:, 2, 2] = c
        elif ax == "Y":
            M[:, 1, 1] = 1; M[:, 0, 0] = c; M[:, 0, 2] = s; M[:, 2, 0] = -s; M[:, 2, 2] = c
        else:
            M[:, 2, 2] = 1; M[:, 0, 0] = c; M[:, 0, 1] = -s; M[:, 1, 0] = s; M[:, 1, 1] = c
        R = R @ M
    return R


# --------------------------------------------------------------------------------------------------------- AMASS
SMPLH_KP = {"pelvis": 0, "l_hip": 1, "r_hip": 2, "l_knee": 4, "r_knee": 5, "l_ankle": 7, "r_ankle": 8, "l_toe": 10,
            "r_toe": 11, "chest": 9, "head": 15, "l_shoulder": 16, "r_shoulder": 17, "l_elbow": 18, "r_elbow": 19,
            "l_wrist": 20, "r_wrist": 21}


def _smplh_model(smplh_dir, gender):
    d = Path(smplh_dir)
    for g in (gender, "neutral", "male"):
        for cand in (d / g / "model.npz", d / f"SMPLH_{g.upper()}.npz", d / f"{g}.npz"):
            if cand.exists():
                return np.load(cand, allow_pickle=True)
    raise FileNotFoundError(f"no SMPL+H model for '{gender}' under {d} (expected <gender>/model.npz from "
                            "mano.is.tue.mpg.de, 'Extended SMPL+H model')")


def load_amass(path, smplh_dir, max_frames=None):
    z = np.load(path, allow_pickle=True)
    poses = z["poses"][:max_frames].astype(np.float64)
    trans = z["trans"][:max_frames].astype(np.float64)
    betas = np.asarray(z["betas"], np.float64).ravel()
    gender = str(z["gender"]) if "gender" in z.files else "neutral"
    gender = gender.replace("b'", "").replace("'", "").strip().lower()
    fps = float(z["mocap_framerate"]) if "mocap_framerate" in z.files else float(z.get("mocap_frame_rate", 60.0))
    mdl = _smplh_model(smplh_dir, gender)
    nb = min(len(betas), mdl["shapedirs"].shape[-1])
    v = mdl["v_template"] + mdl["shapedirs"][:, :, :nb] @ betas[:nb]
    Jreg = mdl["J_regressor"]
    Jreg = Jreg.toarray() if hasattr(Jreg, "toarray") else np.asarray(Jreg)
    J = Jreg @ v                                          # [52, 3] rest joint positions
    parents = np.asarray(mdl["kintree_table"])[0].astype(int)
    nj = min(J.shape[0], poses.shape[1] // 3)
    R = rodrigues(poses[:, :nj * 3].reshape(-1, nj, 3))   # [T, nj, 3, 3] local rotations
    T = poses.shape[0]
    G_R = np.zeros((T, nj, 3, 3))
    G_t = np.zeros((T, nj, 3))
    for j in range(nj):
        p = parents[j]
        if j == 0 or p < 0 or p > 1e6:
            G_R[:, j] = R[:, j]
            G_t[:, j] = J[j] + trans
        else:
            G_R[:, j] = G_R[:, p] @ R[:, j]
            G_t[:, j] = G_t[:, p] + np.einsum("tij,j->ti", G_R[:, p], J[j] - J[p])
    pos = np.stack([G_t[:, SMPLH_KP[k]] for k in KEYPOINTS], 1)
    return Motion(Path(path).stem, fps, pos.astype(np.float32), dict(source="amass", gender=gender))


# ----------------------------------------------------------------------------------------------------------- BVH
# joint names: the side is split off first (Left/L as a prefix or a suffix: LeftUpLeg, l_thigh, UpperLeg_L, Hand.R),
# then the rest is matched; patterns are tried in order, so "UpperArm" beats "Shoulder" (often the collarbone)
BVH_BASE = {
    "pelvis": [r"^hips?$", r"^pelvis$", r"^root$"],
    "hip": [r"^up_?leg$", r"^upper_?leg$", r"^thigh$", r"^hip$", r"^femur$"],
    "knee": [r"^leg$", r"^lower_?leg$", r"^knee$", r"^shin$", r"^calf$", r"^low_?leg$", r"^tibia$"],
    "ankle": [r"^foot$", r"^ankle$"],
    "toe": [r"^toe_?base$", r"^toes?$", r"^ball$", r"^toe_?end$"],
    "chest": [r"^spine_?2$", r"^chest$", r"^upper_?chest$", r"^spine_?1$", r"^spine_?3$", r"^spine$"],
    "head": [r"^head$"],
    "shoulder": [r"^upper_?arm$", r"^arm$", r"^up_?arm$", r"^shoulder$", r"^humerus$"],
    "elbow": [r"^fore_?arm$", r"^lower_?arm$", r"^low_?arm$", r"^elbow$", r"^radius$"],
    "wrist": [r"^hand$", r"^wrist$"],
}


def _clean(n):
    n = n.split(":")[-1].lower()                       # "mixamorig:LeftArm" -> "leftarm"
    return re.sub(r"[\s\-\.]", "_", n)


def _side_split(n):
    """('l' | 'r' | '', base name) from a cleaned joint name."""
    for pre, side in (("left", "l"), ("right", "r"), ("l_", "l"), ("r_", "r")):
        if n.startswith(pre) and len(n) > len(pre):
            return side, n[len(pre):].lstrip("_")
    for suf, side in (("_left", "l"), ("_right", "r"), ("_l", "l"), ("_r", "r"), ("left", "l"), ("right", "r")):
        if n.endswith(suf) and len(n) > len(suf):
            return side, n[:-len(suf)].rstrip("_")
    return "", n


def _match_joints(names):
    cleaned = [_side_split(_clean(n)) for n in names]
    idx = {}
    for base, pats in BVH_BASE.items():
        sides = [""] if base in ("pelvis", "chest", "head") else ["l", "r"]
        for side in sides:
            key = base if not side else f"{side}_{base}"
            for pat in pats:
                hit = [j for j, (sd, b) in enumerate(cleaned) if sd == side and re.search(pat, b) and not names[j].startswith("_end")]
                if hit:
                    idx[key] = hit[0]
                    break
    return idx


def parse_bvh(path):
    """Joint names, parents, offsets, channels and the motion table of a BVH file."""
    toks = Path(path).read_text(errors="replace").split()
    i = 0
    names, parents, offsets, chans = [], [], [], []
    stack = []
    end_n = 0
    while toks[i] != "MOTION":
        t = toks[i]
        if t in ("ROOT", "JOINT"):
            names.append(toks[i + 1]); parents.append(stack[-1] if stack else -1)
            offsets.append([0, 0, 0]); chans.append([])
            i += 2
        elif t == "End":
            names.append(f"_end{end_n}"); end_n += 1; parents.append(stack[-1]); offsets.append([0, 0, 0]); chans.append([])
            i += 2
        elif t == "{":
            stack.append(len(names) - 1); i += 1
        elif t == "}":
            stack.pop(); i += 1
        elif t == "OFFSET":
            offsets[stack[-1]] = [float(toks[i + 1]), float(toks[i + 2]), float(toks[i + 3])]; i += 4
        elif t == "CHANNELS":
            n = int(toks[i + 1]); chans[stack[-1]] = toks[i + 2:i + 2 + n]; i += 2 + n
        else:
            i += 1
    i += 1
    assert toks[i] == "Frames:"
    nf = int(toks[i + 1])
    assert toks[i + 2] == "Frame" and toks[i + 3] == "Time:"
    dt = float(toks[i + 4])
    data = np.array(toks[i + 5:], dtype=np.float64)
    nc = sum(len(c) for c in chans)
    data = data[:nf * nc].reshape(nf, nc)
    return names, np.array(parents), np.array(offsets, float), chans, data, dt


def load_bvh(path, max_frames=None):
    names, parents, offsets, chans, data, dt = parse_bvh(path)
    if max_frames:
        data = data[:max_frames]
    T, nj = data.shape[0], len(names)
    G_R = np.zeros((T, nj, 3, 3))
    G_t = np.zeros((T, nj, 3))
    col = 0
    for j in range(nj):
        c = chans[j]
        pos = np.tile(offsets[j], (T, 1))
        rot_axes, rot_cols = [], []
        for k, ch in enumerate(c):
            if ch.endswith("position"):
                pos[:, "XYZ".index(ch[0])] = data[:, col + k]
            elif ch.endswith("rotation"):
                rot_axes.append(ch[0]); rot_cols.append(col + k)
        col += len(c)
        R = euler_matrix(data[:, rot_cols], "".join(rot_axes)) if rot_axes else np.broadcast_to(np.eye(3), (T, 3, 3))
        p = parents[j]
        if p < 0:
            G_R[:, j], G_t[:, j] = R, pos
        else:
            G_R[:, j] = G_R[:, p] @ R
            G_t[:, j] = G_t[:, p] + np.einsum("tij,tj->ti", G_R[:, p], pos)
    idx = _match_joints(names)
    missing = [k for k in KEYPOINTS if k not in idx]
    if missing:
        raise ValueError(f"{Path(path).name}: no joints matched for {missing}")
    pos = np.stack([G_t[:, idx[k]] for k in KEYPOINTS], 1)
    # units and up axis: the head is above the pelvis along the up axis; a body taller than 3 units is centimetres
    rest = pos[0]
    up = int(np.argmax(np.abs(rest[K["head"]] - rest[K["pelvis"]])))
    sign = np.sign(rest[K["head"], up] - rest[K["pelvis"], up])
    height = np.ptp(rest[:, up])
    scale = 0.01 if height > 3.0 else 1.0
    if up == 1:      # y up, z forward, x left (the BVH / Mixamo convention) -> x forward, y left, z up
        pos = np.stack([pos[..., 2] * sign, pos[..., 0], pos[..., 1] * sign], -1)
    elif up == 0:    # x up -> z up, a proper rotation (no mirroring, so left stays left)
        pos = np.stack([pos[..., 1], pos[..., 2] * sign, pos[..., 0] * sign], -1)
    else:
        pos = pos * np.array([1, sign, sign])
    return Motion(Path(path).stem, 1.0 / dt, (pos * scale).astype(np.float32), dict(source="bvh"))


# ------------------------------------------------------------------------------------------------- CMU ASF / AMC
def parse_asf(path):
    """CMU / Acclaim skeleton: {bone: dict(direction, length, axis, dof)}, children, units scale (to metres)."""
    lines = [ln.strip() for ln in open(path, encoding="latin-1")]
    bones, children, section, cur = {}, {}, None, None
    length_unit = 1.0
    for ln in lines:
        if not ln or ln.startswith("#"):
            continue
        if ln.startswith(":"):
            section = ln.split()[0]
            continue
        tok = ln.split()
        if section == ":units" and tok[0] == "length":
            length_unit = float(tok[1])
        elif section == ":bonedata":
            if tok[0] == "begin":
                cur = dict(dof=[], axis=np.zeros(3), direction=np.zeros(3), length=0.0)
            elif tok[0] == "end":
                bones[cur["name"]] = cur
            elif tok[0] == "name":
                cur["name"] = tok[1]
            elif tok[0] == "direction":
                cur["direction"] = np.array([float(x) for x in tok[1:4]])
            elif tok[0] == "length":
                cur["length"] = float(tok[1])
            elif tok[0] == "axis":
                cur["axis"] = np.array([float(x) for x in tok[1:4]])
            elif tok[0] == "dof":
                cur["dof"] = [d.lower() for d in tok[1:]]
        elif section == ":hierarchy" and tok[0] not in ("begin", "end"):
            children.setdefault(tok[0], []).extend(tok[1:])
    # lengths are in units of (1 / length_unit) inches
    return bones, children, 0.0254 / length_unit


def parse_amc(path):
    frames, cur = [], None
    for ln in open(path, encoding="latin-1"):
        ln = ln.strip()
        if not ln or ln.startswith("#") or ln.startswith(":"):
            continue
        tok = ln.split()
        if len(tok) == 1 and tok[0].isdigit():
            cur = {}
            frames.append(cur)
        elif cur is not None:
            cur[tok[0]] = np.array([float(x) for x in tok[1:]])
    return frames


CMU_KP = {"l_hip": "lhipjoint", "r_hip": "rhipjoint", "l_knee": "lfemur", "r_knee": "rfemur", "l_ankle": "ltibia",
          "r_ankle": "rtibia", "l_toe": "lfoot", "r_toe": "rfoot", "chest": "upperback", "head": "upperneck",
          "l_shoulder": "lclavicle", "r_shoulder": "rclavicle", "l_elbow": "lhumerus", "r_elbow": "rhumerus",
          "l_wrist": "lradius", "r_wrist": "rradius"}           # keypoint = the far end of that bone


def _xyz_matrix(deg):
    """[T, 3] Euler angles (degrees, X then Y then Z about fixed axes) -> [T, 3, 3] = Rz Ry Rx (the ASF convention)."""
    return euler_matrix(np.asarray(deg)[:, ::-1], "ZYX")


def load_amc(path, max_frames=None, asf=None, fps=120.0):
    """A CMU .amc motion; its skeleton is the subject's .asf in the same folder (or asf=...)."""
    p = Path(path)
    if asf is None:
        cands = sorted(p.parent.glob("*.asf"))
        if not cands:
            raise ValueError(f"{p.name}: no .asf skeleton next to it")
        asf = cands[0]
    bones, children, unit = parse_asf(asf)
    frames = parse_amc(p)[:max_frames]
    T = len(frames)
    if T < 2:
        raise ValueError(f"{p.name}: no frames")
    root = np.stack([f["root"] for f in frames])                # TX TY TZ RX RY RZ
    G_R = {"root": _xyz_matrix(root[:, 3:])}
    G_t = {"root": root[:, :3] * unit}
    order, stack = [], ["root"]
    while stack:
        b = stack.pop(0)
        for c in children.get(b, []):
            order.append((c, b))
            stack.append(c)
    for name, parent in order:
        bone = bones[name]
        C = _xyz_matrix(bone["axis"][None])[0]
        rot = np.zeros((T, 3))
        if bone["dof"]:
            vals = np.stack([f.get(name, np.zeros(len(bone["dof"]))) for f in frames])
            for k, dof in enumerate(bone["dof"]):
                if dof in ("rx", "ry", "rz") and k < vals.shape[1]:
                    rot[:, "xyz".index(dof[1])] = vals[:, k]
        M = _xyz_matrix(rot)
        G_R[name] = G_R[parent] @ C @ M @ C.T
        G_t[name] = G_t[parent] + bone["length"] * unit * np.einsum("tij,j->ti", G_R[name], C @ C.T @ bone["direction"])
    pos = np.stack([G_t["root"] if k == "pelvis" else G_t[CMU_KP[k]] for k in KEYPOINTS], 1)
    # CMU is y up; find forward from the feet and make the frame right-handed with x forward, y left, z up
    pos = np.stack([pos[..., 2], pos[..., 0], pos[..., 1]], -1)
    side = np.median(pos[:, K["l_hip"]] - pos[:, K["r_hip"]], 0)
    fwd = np.median(pos[:, [K["l_toe"], K["r_toe"]]].mean(1) - pos[:, [K["l_ankle"], K["r_ankle"]]].mean(1), 0)
    if np.dot(np.cross(side, [0, 0, 1.0]), fwd) < 0:          # mirrored: left would be on the right
        pos[..., 1] *= -1
    return Motion(p.stem, fps, pos.astype(np.float32), dict(source="cmu"))


# ---------------------------------------------------------------------------------------------------------- MVNX
MVNX_SEG = {"pelvis": "Pelvis", "l_hip": "LeftUpperLeg", "r_hip": "RightUpperLeg", "l_knee": "LeftLowerLeg",
            "r_knee": "RightLowerLeg", "l_ankle": "LeftFoot", "r_ankle": "RightFoot", "l_toe": "LeftToe", "r_toe": "RightToe",
            "chest": "T8", "head": "Head", "l_shoulder": "LeftUpperArm", "r_shoulder": "RightUpperArm",
            "l_elbow": "LeftForeArm", "r_elbow": "RightForeArm", "l_wrist": "LeftHand", "r_wrist": "RightHand"}


def load_mvnx(path, max_frames=None):
    import xml.etree.ElementTree as ET
    root = ET.parse(path).getroot()
    ns = {"m": root.tag.split("}")[0].strip("{")} if root.tag.startswith("{") else {}
    q = (lambda t: f"m:{t}") if ns else (lambda t: t)
    subj = root.find(q("subject"), ns)
    segs = [s.get("label") for s in subj.find(q("segments"), ns).findall(q("segment"), ns)]
    fps = float(subj.get("frameRate", 60))
    frames = [f for f in subj.find(q("frames"), ns).findall(q("frame"), ns) if f.get("type") == "normal"]
    if max_frames:
        frames = frames[:max_frames]
    P = np.array([np.array(f.find(q("position"), ns).text.split(), float).reshape(len(segs), 3) for f in frames])
    pos = np.stack([P[:, segs.index(MVNX_SEG[k])] for k in KEYPOINTS], 1)
    return Motion(Path(path).stem, fps, pos.astype(np.float32), dict(source="mvnx"))


# ------------------------------------------------------------------------------------------------------- dispatch
def load(path, smplh_dir=None, max_frames=None):
    p = Path(path)
    ext = p.suffix.lower()
    if ext == ".bvh":
        return load_bvh(p, max_frames)
    if ext == ".mvnx":
        return load_mvnx(p, max_frames)
    if ext == ".amc":
        fps = 120.0
        side = p.with_suffix(".fps")                     # written by build_cmu.py (some CMU trials are 60 fps)
        if side.exists():
            fps = float(side.read_text().strip())
        return load_amc(p, max_frames, fps=fps)
    if ext == ".npz":
        z = np.load(p, allow_pickle=True)
        if "positions" in z.files:
            pos = z["positions"][:max_frames].astype(np.float32)
            return Motion(p.stem, float(z["fps"]), pos, dict(source="canonical"))
        if "poses" in z.files:
            if smplh_dir is None:
                raise ValueError("AMASS files need --smplh (the SMPL+H body model folder)")
            return load_amass(p, smplh_dir, max_frames)
        return None                                   # e.g. AMASS shape.npz files: not motion
    return None


MOTION_EXT = {".bvh", ".mvnx", ".npz", ".amc"}


def find_files(roots):
    out = []
    for r in roots:
        r = Path(r)
        if r.is_file():
            out.append(r)
        else:
            out += sorted(p for p in r.rglob("*") if p.suffix.lower() in MOTION_EXT)
    return out
