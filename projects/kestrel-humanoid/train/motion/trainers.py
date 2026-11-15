"""The three learning stages: warm start (idea 4), one specialist per motion family (idea 3, with idea 5's
failure-weighted sampling), and distillation of all specialists into one controller (idea 3); plus evaluation.

    python -m motion.trainers warmstart  --lib L --out runs/motion/warmstart.pt
    python -m motion.trainers specialist --lib L --family 3 --init runs/motion/warmstart.pt --out runs/motion/spec3 --hours 10
    python -m motion.trainers distill    --lib L --teachers runs/motion/spec* --out runs/motion/final --hours 5
    python -m motion.trainers evaluate   --lib L --policy runs/motion/final/ckpt.pt

All of them save checkpoints as they go (every --save-min minutes) and resume from them, so a stopped run loses
little. The learner runs on --device (cuda:N on a GPU machine); the simulation runs in --workers CPU processes.
"""
from __future__ import annotations

import argparse
import csv
import glob
import json
import sys
import time
from pathlib import Path

import numpy as np
import torch

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
import ppo as P                                            # noqa: E402  (train/ppo.py: ActorCritic, PPO)

from .vec import VecTrack                                  # noqa: E402

HIDDEN = (1024, 512, 256)


def make_ac(obs_dim, critic_dim, act_dim, device):
    ac = P.ActorCritic(obs_dim, critic_dim, act_dim, init_std=0.4)
    ac.actor = P.mlp(obs_dim, act_dim, HIDDEN)       # ppo.mlp's default size is fixed at import: set ours explicitly
    ac.critic = P.mlp(critic_dim, 1, HIDDEN)
    return ac.to(device)


def save(path, ac, extra):
    path = Path(path)
    path.parent.mkdir(parents=True, exist_ok=True)
    tmp = path.with_suffix(".tmp")
    torch.save(dict(ac=ac.state_dict(), dims=(ac.obs_norm.mean.numel(), ac.critic_norm.mean.numel(),
                                               ac.log_std.numel()), **extra), tmp)
    tmp.replace(path)


def load_ac(path, device):
    ck = torch.load(path, map_location=device, weights_only=False)
    ac = make_ac(*ck["dims"], device)
    ac.load_state_dict(ck["ac"])
    return ac, ck


def export(ac, path):
    """A standalone TorchScript policy: normalised observation in, action out (CPU)."""
    class Pol(torch.nn.Module):
        def __init__(self, ac):
            super().__init__()
            self.norm, self.actor = ac.obs_norm, ac.actor

        def forward(self, x):
            return self.actor(self.norm(x))
    m = Pol(ac).cpu().eval()
    torch.jit.trace(m, torch.zeros(1, ac.obs_norm.mean.numel())).save(str(path))
    ac.to(next(ac.parameters()).device)


# --------------------------------------------------------------------------------------------- warm start (4)
def warmstart(a):
    """Behaviour cloning before any RL: on reference states, the action that holds the pose against gravity and the
    servo damping (feed-forward from MuJoCo's inverse dynamics), so the controller starts out roughly able to do
    every motion."""
    import mujoco
    from .track_env import TrackEnvs, ACTION_SCALE
    dev = torch.device(a.device)
    env = TrackEnvs(a.lib, M=1, seed=1)
    m, d = env.m, env.d[0]
    kd = -m.actuator_biasprm[:m.nu, 2]
    obs_l, crit_l, act_l = [], [], []
    for n in range(a.samples):
        env._reset(0)
        env.t[0] = int(env.rs.integers(0, 20))
        f = env._frame(0, env.t0[0] + env.t[0])
        lib = env.lib
        d.qpos[0:3], d.qpos[3:7] = lib.root_pos[f], lib.root_quat[f]
        d.qpos[env.qadr], d.qvel[env.vadr] = lib.q[f], lib.qd[f]
        mujoco.mj_forward(m, d)
        tau = d.qfrc_bias[env.vadr] + kd * lib.qd[f]           # hold against gravity and damping
        label = np.clip(tau / env.kp / ACTION_SCALE, -3, 3)
        o, c = env._obs_one(0)
        obs_l.append(o), crit_l.append(c), act_l.append(label)
    O = torch.tensor(np.array(obs_l), dtype=torch.float32, device=dev)
    C = torch.tensor(np.array(crit_l), dtype=torch.float32, device=dev)
    A = torch.tensor(np.array(act_l), dtype=torch.float32, device=dev)
    ac = make_ac(O.shape[1], C.shape[1], A.shape[1], dev)
    ac.obs_norm.update(O)
    ac.critic_norm.update(C)
    opt = torch.optim.Adam(ac.actor.parameters(), lr=1e-3)
    for ep in range(a.epochs):
        idx = torch.randperm(len(O), device=dev)
        for b in range(0, len(O), 1024):
            j = idx[b:b + 1024]
            loss = ((ac.act(O[j], deterministic=True) - A[j]) ** 2).mean()
            opt.zero_grad()
            loss.backward()
            opt.step()
    print(f"warm start: {len(O)} reference states, final imitation loss {loss.item():.4f}", flush=True)
    save(a.out, ac, dict(stage="warmstart"))


# ------------------------------------------------------------------------------------ PPO specialist (3, 5)
def specialist(a):
    dev = torch.device(a.device)
    out = Path(a.out)
    out.mkdir(parents=True, exist_ok=True)
    venv = VecTrack(a.lib, a.workers, a.envs, family=a.family, seed=a.seed)
    ck_path = out / "ckpt.pt"
    if ck_path.exists():
        ac, ck = load_ac(ck_path, dev)
        it0, t_used = ck.get("it", 0), ck.get("time_s", 0.0)
        fail = np.array(ck.get("fail", np.full(len(venv.windows), 0.5)))
        print(f"resumed {ck_path} at iteration {it0}", flush=True)
    else:
        if a.init and Path(a.init).exists():
            ac, _ = load_ac(a.init, dev)
        else:
            ac = make_ac(venv.obs_dim, venv.critic_dim, venv.act_dim, dev)
        it0, t_used = 0, 0.0
        fail = np.full(len(venv.windows), 0.5)
    ppo = P.PPO(ac, lr=a.lr, epochs=5, minibatches=4, ent=0.002)
    win_index = {int(w): i for i, w in enumerate(venv.windows)}
    T, N = a.steps, venv.N
    obs, critic, _ = venv.observe()
    log = out / "log.csv"
    new = not log.exists()
    lf = open(log, "a", newline="")
    wr = csv.writer(lf)
    if new:
        wr.writerow(["iter", "time_s", "env_steps", "fps", "ep_return", "ep_len", "fail_rate", "kl", "vloss", "lr"])
    t_start = time.time()
    last_save = time.time()
    ends_window = []
    it = it0
    while True:
        it += 1
        buf = {k: torch.zeros((T, N) + s, device=dev) for k, s in
               dict(obs=(venv.obs_dim,), cobs=(venv.critic_dim,), act=(venv.act_dim,), logp=(), val=(),
                    rew=(), done=(), mu=(venv.act_dim,)).items()}
        t0 = time.time()
        for t in range(T):
            o = torch.from_numpy(obs).to(dev)
            c = torch.from_numpy(critic).to(dev)
            with torch.no_grad():
                ac.obs_norm.update(o)
                ac.critic_norm.update(c)
                dist = ac.dist(o)
                act = dist.sample()
                buf["logp"][t] = dist.log_prob(act).sum(-1)
                buf["val"][t] = ac.value(c)
            buf["obs"][t], buf["cobs"][t], buf["act"][t], buf["mu"][t] = o, c, act, dist.loc
            obs, critic, rew, done, trunc, ends, _ = venv.step(act.cpu().numpy())
            # a timeout is not a failure: bootstrap through it by treating the reward as continuing
            buf["rew"][t] = torch.from_numpy(rew).to(dev)
            buf["done"][t] = torch.from_numpy((done & ~trunc).astype(np.float32)).to(dev)
            ends_window += ends
        with torch.no_grad():
            last_v = ac.value(torch.from_numpy(critic).to(dev))
            adv = torch.zeros_like(buf["rew"])
            gae = torch.zeros(N, device=dev)
            for t in reversed(range(T)):
                nv = last_v if t == T - 1 else buf["val"][t + 1]
                nt = 1.0 - buf["done"][t]
                delta = buf["rew"][t] + ppo.gamma * nv * nt - buf["val"][t]
                gae = delta + ppo.gamma * ppo.lam * nt * gae
                adv[t] = gae
            ret = adv + buf["val"]
        flat = {k: v.reshape((T * N,) + v.shape[2:]) for k, v in buf.items()}
        flat["adv"], flat["ret"] = adv.reshape(-1), ret.reshape(-1)
        stats = ppo.update(flat)
        # failure-weighted sampling (idea 5): windows the policy fails on are drawn more often
        for w, failed, *_ in ends_window:
            i = win_index.get(w)
            if i is not None:
                fail[i] = 0.9 * fail[i] + 0.1 * float(failed)
        recent = ends_window[-2000:]
        ends_window = recent
        if it % 5 == 0:
            venv.set_weights(0.2 + fail)
        el = time.time() - t_start
        fps = T * N / (time.time() - t0)
        er = float(np.mean([e[2] for e in recent])) if recent else 0.0
        elen = float(np.mean([e[3] for e in recent])) if recent else 0.0
        fr = float(np.mean([e[1] for e in recent])) if recent else 1.0
        wr.writerow([it, round(t_used + el, 1), it * T * N, round(fps), round(er, 3), round(elen, 1), round(fr, 3),
                     round(stats.get("kl", 0), 5), round(stats.get("vloss", 0), 4), f"{ppo.lr:.2e}"])
        lf.flush()
        if it % 10 == 0 or it == it0 + 1:
            print(f"[family {a.family}] it {it} fps {fps:.0f} return {er:.2f} len {elen:.0f} fail {fr:.2f}", flush=True)
        done_time = (t_used + el) >= a.hours * 3600 or (a.iters and it - it0 >= a.iters)
        if time.time() - last_save > a.save_min * 60 or done_time:
            save(ck_path, ac, dict(it=it, time_s=t_used + el, fail=fail.tolist(), family=a.family))
            export(ac, out / "policy.pt")
            last_save = time.time()
        if done_time:
            break
    lf.close()
    venv.close()
    print(f"[family {a.family}] done: {it} iterations", flush=True)


# ------------------------------------------------------------------------------------------- distillation (3)
def distill(a):
    """DAgger: the student acts (mixed with the teachers early on) on windows from every family; each step, the
    teacher of that window's family labels the action; the student learns to match all teachers in one network."""
    dev = torch.device(a.device)
    out = Path(a.out)
    out.mkdir(parents=True, exist_ok=True)
    teachers = {}
    for p in sorted(glob.glob(a.teachers)) if isinstance(a.teachers, str) else a.teachers:
        ck = Path(p) / "ckpt.pt" if Path(p).is_dir() else Path(p)
        if ck.exists():
            t_ac, t_ck = load_ac(ck, dev)
            teachers[int(t_ck.get("family", len(teachers)))] = t_ac.eval()
    if not teachers:
        raise FileNotFoundError(f"no teacher checkpoints in {a.teachers}")
    venv = VecTrack(a.lib, a.workers, a.envs, family=None, seed=a.seed + 7)
    ck_path = out / "ckpt.pt"
    if ck_path.exists():
        student, ck = load_ac(ck_path, dev)
        it0, t_used = ck.get("it", 0), ck.get("time_s", 0.0)
    else:
        student = make_ac(venv.obs_dim, venv.critic_dim, venv.act_dim, dev)
        it0, t_used = 0, 0.0
    any_t = next(iter(teachers.values()))
    student.obs_norm.load_state_dict(any_t.obs_norm.state_dict())
    student.critic_norm.load_state_dict(any_t.critic_norm.state_dict())
    opt = torch.optim.Adam(student.actor.parameters(), lr=a.lr)
    obs, critic, fam = venv.observe()
    t_start, last_save = time.time(), time.time()
    it = it0
    while True:
        it += 1
        el = time.time() - t_start
        beta = max(0.0, 1.0 - (t_used + el) / max(1.0, 0.3 * a.hours * 3600))      # teacher mixing, fades out
        O, A = [], []
        ends_all = []
        for t in range(a.steps):
            o = torch.from_numpy(obs).to(dev)
            with torch.no_grad():
                label = torch.zeros(len(o), venv.act_dim, device=dev)
                for f, tac in teachers.items():
                    sel = torch.from_numpy(fam == f).to(dev)
                    if sel.any():
                        label[sel] = tac.act(o[sel], deterministic=True)
                miss = ~torch.from_numpy(np.isin(fam, list(teachers))).to(dev)
                if miss.any():                            # a family without a teacher: the nearest one labels it
                    label[miss] = any_t.act(o[miss], deterministic=True)
                act = student.act(o, deterministic=True)
                mix = (torch.rand(len(o), device=dev) < beta).unsqueeze(1)
                act = torch.where(mix, label, act)
            O.append(o)
            A.append(label)
            obs, critic, rew, done, trunc, ends, fam = venv.step(act.cpu().numpy())
            ends_all += ends
        O, A = torch.cat(O), torch.cat(A)
        for _ in range(a.epochs):
            idx = torch.randperm(len(O), device=dev)
            for b in range(0, len(O), 4096):
                j = idx[b:b + 4096]
                loss = ((student.act(O[j], deterministic=True) - A[j]) ** 2).mean()
                opt.zero_grad()
                loss.backward()
                opt.step()
        fr = float(np.mean([e[1] for e in ends_all])) if ends_all else 1.0
        if it % 10 == 0 or it == it0 + 1:
            print(f"[distill] it {it} beta {beta:.2f} loss {loss.item():.4f} fail {fr:.2f}", flush=True)
        done_time = (t_used + el) >= a.hours * 3600 or (a.iters and it - it0 >= a.iters)
        if time.time() - last_save > a.save_min * 60 or done_time:
            save(ck_path, student, dict(it=it, time_s=t_used + el, stage="distill"))
            export(student, out / "policy.pt")
            last_save = time.time()
        if done_time:
            break
    venv.close()
    print(f"[distill] done: {it} iterations", flush=True)


# ------------------------------------------------------------------------------------------------- evaluation
def evaluate(a):
    dev = torch.device(a.device)
    ac, _ = load_ac(a.policy, dev)
    venv = VecTrack(a.lib, a.workers, a.envs, family=None, split="eval", seed=99)
    obs, critic, fam = venv.observe()
    ends = []
    for t in range(a.steps):
        with torch.no_grad():
            act = ac.act(torch.from_numpy(obs).to(dev), deterministic=True).cpu().numpy()
        obs, critic, rew, done, trunc, e, fam = venv.step(act)
        ends += e
    venv.close()
    if not ends:
        print("evaluation: no episode finished; run longer", flush=True)
        return {}
    by_f = {}
    for w, failed, ret, length, f in ends:
        by_f.setdefault(f, []).append(failed)
    res = dict(episodes=len(ends), success=round(1 - float(np.mean([e[1] for e in ends])), 3),
               mean_len_s=round(float(np.mean([e[3] for e in ends])) / 50, 2),
               by_family={int(f): round(1 - float(np.mean(v)), 3) for f, v in sorted(by_f.items())})
    print(json.dumps(res), flush=True)
    if a.out:
        Path(a.out).write_text(json.dumps(res, indent=1))
    return res


def main(argv=None):
    ap = argparse.ArgumentParser(description=__doc__.split("\n\n")[0])
    ap.add_argument("stage", choices=["warmstart", "specialist", "distill", "evaluate"])
    ap.add_argument("--lib", required=True)
    ap.add_argument("--out", default=None)
    ap.add_argument("--device", default="cuda" if torch.cuda.is_available() else "cpu")
    ap.add_argument("--workers", type=int, default=4)
    ap.add_argument("--envs", type=int, default=32, help="robots per worker process")
    ap.add_argument("--family", type=int, default=None)
    ap.add_argument("--init", default=None)
    ap.add_argument("--teachers", default=None, help="glob of specialist run folders")
    ap.add_argument("--policy", default=None)
    ap.add_argument("--hours", type=float, default=1.0)
    ap.add_argument("--iters", type=int, default=0, help="stop after this many iterations (0: time only)")
    ap.add_argument("--steps", type=int, default=32, help="steps per iteration per robot")
    ap.add_argument("--lr", type=float, default=3e-4)
    ap.add_argument("--epochs", type=int, default=20)
    ap.add_argument("--samples", type=int, default=20000, help="warm start: reference states")
    ap.add_argument("--save-min", type=float, default=30.0)
    ap.add_argument("--seed", type=int, default=0)
    a = ap.parse_args(argv)
    torch.set_num_threads(max(1, min(8, torch.get_num_threads())))
    {"warmstart": warmstart, "specialist": specialist, "distill": distill, "evaluate": evaluate}[a.stage](a)


if __name__ == "__main__":
    main()
