"""Tracking environments across CPU processes (the simulation runs on the CPU cores; learning runs on a GPU).

Each worker process holds a TrackEnvs with M robots; the main process sends actions and gets observations back.
"""
from __future__ import annotations

import multiprocessing as mp
import os

import numpy as np


def _worker(conn, lib, M, family, split, seed):
    os.environ.setdefault("OMP_NUM_THREADS", "1")
    from .track_env import TrackEnvs
    env = TrackEnvs(lib, M=M, family=family, split=split, seed=seed)
    conn.send(("ready", env.obs_dims(), env.nj, len(env.windows), env.windows.tolist()))
    while True:
        cmd, arg = conn.recv()
        if cmd == "obs":
            conn.send(env.observe() + (env.lib.win_family[env.win].astype(np.int32),))
        elif cmd == "step":
            conn.send(env.step(arg))
        elif cmd == "weights":
            env.set_weights(arg)
            conn.send(True)
        elif cmd == "close":
            conn.close()
            return


class VecTrack:
    def __init__(self, lib, workers=4, envs_per_worker=16, family=None, split="train", seed=0):
        ctx = mp.get_context("fork")
        self.conns, self.procs = [], []
        for w in range(workers):
            a, b = ctx.Pipe()
            p = ctx.Process(target=_worker, args=(b, lib, envs_per_worker, family, split, seed * 1000 + w), daemon=True)
            p.start()
            self.conns.append(a)
            self.procs.append(p)
        info = [c.recv() for c in self.conns]
        _, (self.obs_dim, self.critic_dim), self.act_dim, _, windows = info[0]
        self.windows = np.array(windows)                     # the same window set in every worker (same filter)
        self.N = workers * envs_per_worker

    def observe(self):
        for c in self.conns:
            c.send(("obs", None))
        r = [c.recv() for c in self.conns]
        return tuple(np.concatenate(x) for x in zip(*r))

    def step(self, actions):
        k = len(actions) // len(self.conns)
        for i, c in enumerate(self.conns):
            c.send(("step", actions[i * k:(i + 1) * k]))
        r = [c.recv() for c in self.conns]
        obs, critic, rew, done, trunc, ends, fam = zip(*r)
        return (np.concatenate(obs), np.concatenate(critic), np.concatenate(rew), np.concatenate(done),
                np.concatenate(trunc), [e for x in ends for e in x], np.concatenate(fam))

    def set_weights(self, factor):
        for c in self.conns:
            c.send(("weights", factor))
        for c in self.conns:
            c.recv()

    def close(self):
        for c in self.conns:
            try:
                c.send(("close", None))
            except (BrokenPipeError, OSError):
                pass
        for p in self.procs:
            p.join(timeout=5)
            if p.is_alive():
                p.terminate()
