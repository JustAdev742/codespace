"""Score the stand-up policy: episodes from every recorded seated state (plus noise), policy mean actions.

    KESTREL_VARIANT=s1body python eval_standup.py --run standup --episodes 64
"""
import argparse
import os
import sys
from pathlib import Path

os.environ.setdefault("KESTREL_VARIANT", "s1body")
sys.path.insert(0, str(Path(__file__).resolve().parent))
import numpy as np        # noqa: E402
import standup_env as S   # noqa: E402
import play as PL         # noqa: E402

ap = argparse.ArgumentParser()
ap.add_argument("--run", default="standup")
ap.add_argument("--episodes", type=int, default=64)
a = ap.parse_args()
pol = PL.load_policy(a.run)
M = 16
res = []
for rep in range(max(1, a.episodes // M)):
    e = S.Envs(M=M, seed=100 + rep, randomize=True)
    obs, _ = e.observe()
    t_stand = np.full(M, np.nan)
    fell = np.zeros(M, bool)
    drift = np.zeros(M)
    touched = np.zeros(M, bool)
    tabled = np.array([d.mocap_pos[e.table_mocap][1] > -25 for d in e.d])
    for k in range(S.EP_LEN - 1):
        obs, _, _, done, trunc = e.step(pol(obs))
        st = e._state()
        pz, up, ca = st[5], st[6], st[7]
        standing = (pz > S.STAND_Z - 0.03) & (up > 0.95) & (np.abs(ca - 0.03) < 0.07)
        t_stand = np.where(np.isnan(t_stand) & standing & ~fell, (k + 1) * S.DT, t_stand)
        fell |= done & ~trunc
        live = ~fell & ~(done & trunc)
        drift = np.where(live, np.maximum(drift, e.last_drift), drift)
        touched |= (e.last_touch > 0) & live
    final_ok = standing & ~fell
    res += list(zip(final_ok, t_stand, fell, drift, touched, tabled))
ok = np.array([r[0] for r in res])
ts = np.array([r[1] for r in res])
fl = np.array([r[2] for r in res])
dr = np.array([r[3] for r in res])
tc = np.array([r[4] for r in res])
tb = np.array([r[5] for r in res])
print(f"stood and still standing at 7 s: {ok.sum()} of {len(ok)} ({ok.mean():.0%}); falls {fl.sum()}; "
      f"median time to a balanced stand {np.nanmedian(ts):.1f} s; drift after standing: median {np.median(dr[ok]) if ok.any() else 0:.2f} m, "
      f"max {dr[ok].max() if ok.any() else 0:.2f} m; touched the table in {tc[tb].sum()} of {tb.sum()} episodes with a table")
