"""How smoothly a walking policy walks: the share of the leg joints' motion above 5 Hz (shaking) and how far it gets
in 12 s told to walk at 0.6 m/s, on flat ground, with the low-pass filter on the joint targets it is meant to run with.

    KESTREL_VARIANT=g1 python smooth_eval.py g1b 0.0      # the policy, the filter's memory per 20 ms step
    KESTREL_VARIANT=g1 python smooth_eval.py g1s 0.6
"""
from __future__ import annotations

import os
import sys

import numpy as np

os.environ.setdefault("KESTREL_VARIANT", "g1")
os.environ.setdefault("MUJOCO_GL", "osmesa")


def run(policy, smooth, seconds=12.0, vx=0.6, seeds=(0, 1, 2)):
    import env as E
    import play as PL
    pol = PL.load_policy(policy)
    hf, dist, falls = [], [], 0
    for seed in seeds:
        e = E.Envs(M=1, seed=seed, randomize=False, curriculum=False, cols=[0])
        e.action_smooth = smooth
        e._resample_cmd = lambda i: None                      # one command throughout
        e.ep_len = 10 ** 9
        PL.setup(e, 0, 0, 0, yaw=0.0, cmd=(vx, 0.0, 0.0))
        e.cmd[:] = (vx, 0.0, 0.0)
        obs, _ = e.observe()
        x0 = e.d[0].qpos[:2].copy()
        qv = []
        for k in range(int(seconds / E.DT)):
            obs, _, r, done, _ = e.step(pol(obs.astype(np.float32)))
            qv.append(e.d[0].qvel[e.vadr].copy())
            if done[0]:
                falls += 1
                break
        qv = np.array(qv[int(1.0 / E.DT):])                    # after the first second (getting going)
        if len(qv) > 50:
            spec = np.abs(np.fft.rfft(qv - qv.mean(0), axis=0)) ** 2
            f = np.fft.rfftfreq(len(qv), E.DT)
            hf.append(float(spec[f > 5.0].sum() / max(spec.sum(), 1e-12)))
        dist.append(float(np.linalg.norm(e.d[0].qpos[:2] - x0)))
    return dict(policy=policy, smooth=smooth, hf=float(np.mean(hf)) if hf else None, dist=float(np.mean(dist)), falls=falls)


if __name__ == "__main__":
    pol = sys.argv[1] if len(sys.argv) > 1 else "g1b"
    sm = float(sys.argv[2]) if len(sys.argv) > 2 else 0.0
    r = run(pol, sm)
    print(f"{r['policy']} filter {r['smooth']}: {100 * r['hf']:.0f} % of leg motion above 5 Hz, {r['dist']:.1f} m in 12 s, "
          f"falls {r['falls']}")
