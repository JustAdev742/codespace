"""Console trainer: PPO on CPU MuJoCo, multi-process, no GPU and no Isaac Sim needed.

    python train.py --name rough --hours 2            # train (Ctrl-C saves a checkpoint and exits)
    python train.py --name rough --hours 2 --resume   # continue the latest checkpoint of that run
    python train.py --name mk2 --init rough --hours 1  # fine-tune a new run from another run's weights

Layout of a run: runs/<name>/log.csv, runs/<name>/ckpt_last.pt, runs/<name>/ckpt_<iter>.pt,
runs/<name>/policy.pt (TorchScript actor + observation normaliser, for play.py or deployment).

Process model: W worker processes each step M environments (env.Envs) that share one MuJoCo model and
one terrain; the main process batches the policy over all W*M environments, then runs GAE + PPO. This is
the Isaac Lab / rsl_rl loop (24-step rollouts, adaptive-LR PPO, asymmetric critic) with CPU processes in
place of GPU environments.
"""
from __future__ import annotations

import os

for _v in ("OMP_NUM_THREADS", "OPENBLAS_NUM_THREADS", "MKL_NUM_THREADS"):
    os.environ.setdefault(_v, "1")

import argparse
import csv
import multiprocessing as mp
import signal
import sys
import time
from pathlib import Path

import numpy as np

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))


# ---------------------------------------------------------------------------------------- worker
def worker(rank, conn, cfg):
    signal.signal(signal.SIGINT, signal.SIG_IGN)     # Ctrl-C goes to the learner, which saves and then closes
                                                     # the workers (SIGTERM stays default so they can be killed)
    import env as E
    e = E.Envs(M=cfg["envs"], seed=cfg["seed"] * 1000 + rank, terrain_seed=cfg["terrain_seed"],
               max_row=cfg["max_row"], curriculum=cfg["curriculum"], randomize=cfg["randomize"], cols=cfg["cols"],
               delay_prob=cfg["delay"])
    e.randomize_model()
    while True:
        cmd, data = conn.recv()
        if cmd == "step":
            conn.send(e.step(data))
        elif cmd == "obs":
            conn.send(e.observe())
        elif cmd == "stats":
            s, e.done_stats = e.done_stats, []
            terms = {k: v / max(e.term_n, 1) for k, v in e.term_sum.items()}
            e.term_sum, e.term_n = {}, 0
            conn.send((s, e.row.copy(), e.col.copy(), terms))
        elif cmd == "rand":
            e.randomize_model()
            conn.send(None)
        elif cmd == "weights":
            e.w.update(data)
            conn.send(None)
        elif cmd == "rows":
            e.row[:] = data
            conn.send(None)
        elif cmd == "close":
            conn.close()
            return


class Pool:
    def __init__(self, n, cfg):
        ctx = mp.get_context("fork")
        self.conns, self.procs = [], []
        for r in range(n):
            a, b = ctx.Pipe()
            p = ctx.Process(target=worker, args=(r, b, cfg), daemon=True)
            p.start()
            self.conns.append(a)
            self.procs.append(p)
        self.M = cfg["envs"]

    def call(self, cmd, data=None):
        for c in self.conns:
            c.send((cmd, data))
        return [c.recv() for c in self.conns]

    def step(self, actions):
        for k, c in enumerate(self.conns):
            c.send(("step", actions[k * self.M:(k + 1) * self.M]))
        res = [c.recv() for c in self.conns]
        return [np.concatenate(x) for x in zip(*res)]

    def observe(self):
        return [np.concatenate(x) for x in zip(*self.call("obs"))]

    def close(self):
        for c in self.conns:
            try:
                c.send(("close", None))
            except (BrokenPipeError, OSError):
                pass
        for p in self.procs:
            p.join(timeout=5)
            if p.is_alive():
                p.kill()


# ---------------------------------------------------------------------------------------- export
def export_policy(ac, path):
    """TorchScript module: raw actor observation (N,122) -> joint position offsets (N,12), deterministic."""
    import torch

    class Policy(torch.nn.Module):
        def __init__(self, ac):
            super().__init__()
            self.register_buffer("mean", ac.obs_norm.mean.clone())
            self.register_buffer("std", torch.sqrt(ac.obs_norm.var + ac.obs_norm.eps).clone())
            self.actor = ac.actor

        def forward(self, obs):
            return self.actor(torch.clamp((obs - self.mean) / self.std, -5.0, 5.0))

    # trace (not script): scripting re-reads this file's source, which breaks if it was edited mid-run
    pol = Policy(ac).eval()
    with torch.no_grad():
        torch.jit.trace(pol, torch.zeros(1, ac.obs_norm.mean.shape[0])).save(str(path))


# ---------------------------------------------------------------------------------------- main
def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--name", default="rough")
    ap.add_argument("--variant", default=os.environ.get("KESTREL_VARIANT", "k1"), choices=["k1", "s1", "s1scrap", "k1scrap", "s1fast", "k1fast", "s1run", "s1sprint"],
                    help="robot: k1 (KESTREL K1, current calc revision) or s1 (the simple off-the-shelf build)")
    ap.add_argument("--workers", type=int, default=max(1, (os.cpu_count() or 2)))
    ap.add_argument("--envs", type=int, default=96, help="environments per worker")
    ap.add_argument("--steps", type=int, default=24, help="rollout length per iteration")
    ap.add_argument("--iters", type=int, default=100000)
    ap.add_argument("--hours", type=float, default=1.0, help="wall-clock budget for this invocation")
    ap.add_argument("--terrain", choices=["rough", "flat", "stairs", "mixed", "climb"], default="rough",
                    help="rough: all 6 types equally; mixed: stairs get half the environments; climb: 40 %% stairs up, "
                         "20 %% stairs down; stairs: flat + stairs")
    ap.add_argument("--seed", type=int, default=1)
    ap.add_argument("--resume", action="store_true")
    ap.add_argument("--init", default="", help="start a new run from another run's network weights (fine-tune), e.g. --init rough")
    ap.add_argument("--no-randomize", action="store_true")
    ap.add_argument("--delay", type=float, default=0.0, help="fraction of episodes with one step (20 ms) of action latency")
    ap.add_argument("--rand-every", type=int, default=4, help="re-randomise each worker's physics every N iterations")
    ap.add_argument("--save-every", type=int, default=250)
    ap.add_argument("--threads", type=int, default=0, help="torch threads in the learner (0 = all cores)")
    args = ap.parse_args()
    os.environ["KESTREL_VARIANT"] = args.variant        # read by model.py / calc before the workers fork

    cols = {"rough": None, "flat": [0], "stairs": [0, 4, 5], "mixed": [0, 1, 2, 3, 4, 4, 5, 5],
            "climb": [0, 1, 2, 3, 4, 4, 5, 5, 5, 5]}[args.terrain]
    cfg = dict(envs=args.envs, seed=args.seed, terrain_seed=0, max_row=None, curriculum=True,
               randomize=not args.no_randomize, cols=cols, delay=args.delay)
    pool = Pool(args.workers, cfg)          # fork before torch starts any threads

    import torch
    import env as E
    from ppo import PPO, ActorCritic
    learn_threads = args.threads or os.cpu_count() or 1
    torch.manual_seed(args.seed)

    run = HERE / "runs" / args.name
    run.mkdir(parents=True, exist_ok=True)
    N, T_ = args.workers * args.envs, args.steps
    ac = ActorCritic(E.OBS_DIM, E.CRITIC_DIM, E.ACT_DIM)
    ppo = PPO(ac)
    it0, steps = 0, 0
    ck = run / "ckpt_last.pt"
    if args.resume and ck.exists():
        cst = torch.load(ck, weights_only=False)
        ac.load_state_dict(cst["ac"])
        ppo.opt.load_state_dict(cst["opt"])
        ppo.lr, it0, steps = cst["lr"], cst["it"], cst["steps"]
        rows = cst.get("rows")
        if rows is not None and len(rows) == args.workers and len(rows[0]) == args.envs:
            for c, rw in zip(pool.conns, rows):
                c.send(("rows", rw))
                c.recv()
        print(f"resumed {ck} at iteration {it0}, {steps / 1e6:.1f} M steps")
    elif args.init:
        src = HERE / "runs" / args.init / "ckpt_last.pt"
        ac.load_state_dict(torch.load(src, weights_only=False)["ac"])
        print(f"initialised from {src} (weights only; new optimiser, curriculum and step count)")

    stop = {"flag": False}

    def on_signal(sig, frame):
        stop["flag"] = True
        print("\nstopping after this iteration (checkpoint will be saved)")
    signal.signal(signal.SIGINT, on_signal)
    signal.signal(signal.SIGTERM, on_signal)

    def save(it, rows, tag="last"):
        st = dict(ac=ac.state_dict(), opt=ppo.opt.state_dict(), lr=ppo.lr, it=it, steps=steps, rows=rows,
                  time_s=t_offset + time.time() - t_start,
                  args=vars(args))
        tmp = run / f"ckpt_{tag}.pt.tmp"
        torch.save(st, tmp)
        os.replace(tmp, run / f"ckpt_{tag}.pt")
        export_policy(ac, run / "policy.pt")

    log_path = run / "log.csv"
    new_log = not log_path.exists() or not args.resume
    cols_log = ["iter", "steps", "time_s", "fps", "ep_return", "ep_len_s", "fall_rate", "episodes", "row_mean",
                "row_flat", "row_rough", "row_slope_dn", "row_slope_up", "row_stairs_dn", "row_stairs_up",
                "vloss", "ploss", "kl", "lr", "action_std"] + [f"r_{k}" for k in E.W]
    if not new_log:                  # resuming: keep old rows, re-header if the columns changed
        old_rows = list(csv.reader(open(log_path)))
        if old_rows and old_rows[0] != cols_log:
            hdr = old_rows[0]
            with open(log_path, "w", newline="") as f:
                w = csv.writer(f)
                w.writerow(cols_log)
                for r in old_rows[1:]:
                    d = dict(zip(hdr, r))
                    w.writerow([d.get(k, "nan") for k in cols_log])
    logf = open(log_path, "w" if new_log else "a", newline="")
    wr = csv.writer(logf)
    if new_log:
        wr.writerow(cols_log)

    obs, cobs = pool.observe()
    buf = {k: torch.zeros((T_, N) + s, dtype=torch.float32) for k, s in
           dict(obs=(E.OBS_DIM,), cobs=(E.CRITIC_DIM,), act=(E.ACT_DIM,), mu=(E.ACT_DIM,), logp=(), val=(), rew=(),
                done=()).items()}
    t_start = time.time()
    t_offset = 0.0                   # wall time of earlier chunks of this run, so time_s is cumulative
    if args.resume and ck.exists():
        t_offset = float(cst.get("time_s", 0.0))
        if not t_offset and not new_log:
            last = open(log_path).read().strip().splitlines()[-1].split(",")
            t_offset = float(last[cols_log.index("time_s")]) if last[0].isdigit() else 0.0
    hist = []
    rows_now = None
    print(f"{args.workers} workers x {args.envs} envs = {N} environments, {T_}-step rollouts, terrain '{args.terrain}'")
    print(f"{'iter':>6} {'Msteps':>7} {'fps':>6} {'return':>7} {'len_s':>6} {'fall':>5} {'row':>4} "
          f"{'stairsDn':>8} {'stairsUp':>8} {'vloss':>7} {'kl':>7} {'lr':>8} {'std':>5}")
    it = it0
    sent_w = None
    while it < args.iters and not stop["flag"]:
        t_it = time.time()
        sw = {k: round(v, 3) for k, v in E.Envs.scheduled_weights(steps).items()}
        if sw != sent_w:
            pool.call("weights", sw)
            sent_w = sw
        torch.set_num_threads(1)            # the workers own the cores during the rollout
        for t in range(T_):
            o, c = torch.from_numpy(obs), torch.from_numpy(cobs)
            with torch.no_grad():
                d = ac.dist(o)
                a = d.sample()
                buf["logp"][t] = d.log_prob(a).sum(-1)
                v = ac.value(c)
            buf["obs"][t], buf["cobs"][t], buf["act"][t], buf["mu"][t], buf["val"][t] = o, c, a, d.loc, v
            obs, cobs, r, done, trunc = pool.step(a.numpy())
            r = torch.from_numpy(r) + ppo.gamma * v * torch.from_numpy(trunc.astype(np.float32))   # bootstrap time-outs
            buf["rew"][t], buf["done"][t] = r, torch.from_numpy(done.astype(np.float32))
        with torch.no_grad():
            last_v = ac.value(torch.from_numpy(cobs))
        adv = torch.zeros(T_, N)
        gae = torch.zeros(N)
        for t in reversed(range(T_)):
            nv = last_v if t == T_ - 1 else buf["val"][t + 1]
            nt = 1.0 - buf["done"][t]
            delta = buf["rew"][t] + ppo.gamma * nv * nt - buf["val"][t]
            gae = delta + ppo.gamma * ppo.lam * nt * gae
            adv[t] = gae
        flat = {k: v.reshape((T_ * N,) + v.shape[2:]) for k, v in buf.items()}
        flat["adv"] = adv.reshape(-1)
        flat["ret"] = flat["adv"] + flat["val"]
        t_roll = time.time() - t_it
        torch.set_num_threads(learn_threads)    # ...and the learner owns them during the update
        st = ppo.update(flat)
        with torch.no_grad():       # normalisers move between iterations, so each update sees the rollout's own
            ac.obs_norm.update(flat["obs"])
            ac.critic_norm.update(flat["cobs"])
        steps += T_ * N
        it += 1
        if it % args.rand_every == 0:
            pool.call("rand")
        res = pool.call("stats")
        for s, _, _, _ in res:
            hist.extend(s)
        hist = hist[-2000:]
        rows_now = [rw for _, rw, _, _ in res]
        row_all = np.concatenate(rows_now)
        col_all = np.concatenate([cl for _, _, cl, _ in res])
        terms = {k: float(np.mean([tm.get(k, 0.0) for _, _, _, tm in res])) for k in res[0][3]}
        per_col = [float(row_all[col_all == k].mean()) if (col_all == k).any() else float("nan") for k in range(6)]
        recent = np.array(hist[-500:]) if hist else np.zeros((1, 5))
        fps = T_ * N / (time.time() - t_it)
        line = dict(iter=it, steps=steps, time_s=round(t_offset + time.time() - t_start, 1), fps=round(fps),
                    ep_return=float(recent[:, 0].mean()), ep_len_s=float(recent[:, 1].mean() * E.DT),
                    fall_rate=float(recent[:, 2].mean()), episodes=len(hist), row_mean=float(row_all.mean()),
                    row_flat=per_col[0], row_rough=per_col[1], row_slope_dn=per_col[2], row_slope_up=per_col[3],
                    row_stairs_dn=per_col[4], row_stairs_up=per_col[5], vloss=st["vloss"], ploss=st["ploss"],
                    kl=st["kl"], lr=st["lr"], action_std=float(ac.log_std.detach().exp().mean()),
                    **{f"r_{k}": terms.get(k, 0.0) for k in E.W})
        wr.writerow([f"{line[k]:.5g}" if isinstance(line[k], float) else line[k] for k in cols_log])
        if it % 5 == 0 or it == it0 + 1:
            logf.flush()
            print(f"{it:6d} {steps / 1e6:7.2f} {fps:6.0f} {line['ep_return']:7.2f} {line['ep_len_s']:6.1f} "
                  f"{line['fall_rate']:5.2f} {line['row_mean']:4.2f} {per_col[4]:8.2f} {per_col[5]:8.2f} "
                  f"{st['vloss']:7.4f} {st['kl']:7.4f} {st['lr']:8.2e} {line['action_std']:5.2f}"
                  f"   (rollout {t_roll:.2f}s)", flush=True)
        if it % 10 == 0:
            save(it, rows_now)
        if it % args.save_every == 0:
            save(it, rows_now, tag=str(it))
        if time.time() - t_start > args.hours * 3600:
            print("time budget reached")
            break
    save(it, rows_now)
    logf.close()
    pool.close()
    print(f"saved {run / 'ckpt_last.pt'} and {run / 'policy.pt'} at iteration {it}, {steps / 1e6:.1f} M steps")


if __name__ == "__main__":
    try:
        main()
    finally:                         # never leave worker processes behind, whatever happened
        for ch in mp.active_children():
            ch.kill()
