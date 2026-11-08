"""Write the KESTREL K1 training robot (legs actuated, upper body rigid) as a standalone MJCF for Isaac Lab.

    python isaaclab/export_mjcf.py                  # -> isaaclab/kestrel_k1/kestrel_k1.xml

Same bodies, masses, inertias, armature, joint limits and collision geometry (4 sphere contacts per foot,
thigh and shank capsules) as the CPU training model, without terrain. Convert it to USD once with Isaac
Lab's scripts/tools/convert_mjcf.py (see isaaclab/README.md).
"""
from __future__ import annotations

import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE.parent))

import model as KM  # noqa: E402


def main():
    out = Path(sys.argv[1]) if len(sys.argv) > 1 else HERE / "kestrel_k1" / "kestrel_k1.xml"
    xml, _ = KM.build_xml(None)
    xml = xml.replace("<worldbody>", '<worldbody>\n    <geom name="floor" type="plane" size="0 0 0.05"/>', 1)
    out.write_text(xml)
    import mujoco
    m = mujoco.MjModel.from_xml_path(str(out))
    print(f"wrote {out}: {m.nbody - 1} bodies, {m.njnt - 1} actuated leg joints, mass {m.body_subtreemass[1]:.1f} kg")


if __name__ == "__main__":
    main()
