"""Compact PPO in the rsl_rl style: asymmetric actor-critic, GAE, clipped surrogate and value loss,
entropy bonus, learning rate adapted per minibatch on the analytic KL to the rollout policy. CPU PyTorch.

Networks are (256, 128, 128) ELU MLPs, the size Isaac Lab uses for its G1 humanoid, about a third of the
compute of the (512, 256, 128) rough-terrain default, which matters when the learner shares four CPU cores
with the simulator.
"""
from __future__ import annotations

import torch
import torch.nn as nn


HIDDEN = (256, 128, 128)


def mlp(i, o, h=HIDDEN):
    layers, d = [], i
    for k in h:
        layers += [nn.Linear(d, k), nn.ELU()]
        d = k
    layers.append(nn.Linear(d, o))
    return nn.Sequential(*layers)


class RunningNorm(nn.Module):
    def __init__(self, n, eps=1e-5):
        super().__init__()
        self.register_buffer("mean", torch.zeros(n))
        self.register_buffer("var", torch.ones(n))
        self.register_buffer("count", torch.tensor(1e-4))
        self.eps = eps

    def update(self, x):
        b_mean, b_var, b_n = x.mean(0), x.var(0, unbiased=False), x.shape[0]
        delta = b_mean - self.mean
        tot = self.count + b_n
        self.mean += delta * b_n / tot
        self.var = (self.var * self.count + b_var * b_n + delta ** 2 * self.count * b_n / tot) / tot
        self.count = tot

    def forward(self, x):
        return torch.clamp((x - self.mean) / torch.sqrt(self.var + self.eps), -5, 5)


class ActorCritic(nn.Module):
    def __init__(self, obs_dim, critic_dim, act_dim, init_std=0.8):
        super().__init__()
        self.obs_norm = RunningNorm(obs_dim)
        self.critic_norm = RunningNorm(critic_dim)
        self.actor = mlp(obs_dim, act_dim)
        self.critic = mlp(critic_dim, 1)
        self.log_std = nn.Parameter(torch.full((act_dim,), float(torch.log(torch.tensor(init_std)))))

    def act(self, obs, deterministic=False):
        mu = self.actor(self.obs_norm(obs))
        if deterministic:
            return mu
        return mu + torch.randn_like(mu) * self.log_std.exp()

    def dist(self, obs):
        mu = self.actor(self.obs_norm(obs))
        return torch.distributions.Normal(mu, self.log_std.exp())

    def value(self, cobs):
        return self.critic(self.critic_norm(cobs)).squeeze(-1)


class PPO:
    def __init__(self, ac, lr=1e-3, gamma=0.99, lam=0.95, clip=0.2, epochs=5, minibatches=4, ent=0.005,
                 vcoef=1.0, kl_target=0.01, max_grad=1.0):
        self.ac = ac
        self.opt = torch.optim.Adam(ac.parameters(), lr=lr)
        self.lr, self.gamma, self.lam, self.clip = lr, gamma, lam, clip
        self.epochs, self.mb, self.ent, self.vcoef, self.kl_target, self.max_grad = epochs, minibatches, ent, vcoef, kl_target, max_grad

    def update(self, buf):
        obs, cobs, act, logp_old, val_old, ret, adv, mu_old = (buf[k] for k in ("obs", "cobs", "act", "logp", "val", "ret",
                                                                                   "adv", "mu"))
        std_old = self.ac.log_std.detach().exp()
        adv = (adv - adv.mean()) / (adv.std() + 1e-8)
        n = obs.shape[0]
        mbs = n // self.mb
        stats = dict(kl=0.0, vloss=0.0, ploss=0.0, ent=0.0)
        k = 0
        for _ in range(self.epochs):
            idx = torch.randperm(n)
            for b in range(self.mb):
                j = idx[b * mbs:(b + 1) * mbs]
                d = self.ac.dist(obs[j])
                with torch.no_grad():               # analytic KL(rollout policy || current), before this step
                    s1, s2 = std_old, d.scale
                    kl = (torch.log(s2 / s1) + (s1 ** 2 + (mu_old[j] - d.loc) ** 2) / (2 * s2 ** 2) - 0.5).sum(-1).mean().item()
                if kl > 2 * self.kl_target:
                    self.lr = max(1e-5, self.lr / 1.5)
                elif 0.0 < kl < self.kl_target / 2:
                    self.lr = min(1e-2, self.lr * 1.5)
                for g in self.opt.param_groups:
                    g["lr"] = self.lr
                logp = d.log_prob(act[j]).sum(-1)
                ratio = torch.exp(logp - logp_old[j])
                p1, p2 = ratio * adv[j], torch.clamp(ratio, 1 - self.clip, 1 + self.clip) * adv[j]
                ploss = -torch.min(p1, p2).mean()
                v = self.ac.value(cobs[j])
                v_clip = val_old[j] + torch.clamp(v - val_old[j], -self.clip, self.clip)
                vloss = torch.max((v - ret[j]) ** 2, (v_clip - ret[j]) ** 2).mean()
                ent = d.entropy().sum(-1).mean()
                loss = ploss + self.vcoef * vloss - self.ent * ent
                self.opt.zero_grad()
                loss.backward()
                nn.utils.clip_grad_norm_(self.ac.parameters(), self.max_grad)
                self.opt.step()
                stats["kl"] += kl; stats["vloss"] += vloss.item(); stats["ploss"] += ploss.item(); stats["ent"] += ent.item()
                k += 1
        return {kk: vv / k for kk, vv in stats.items()} | {"lr": self.lr}
