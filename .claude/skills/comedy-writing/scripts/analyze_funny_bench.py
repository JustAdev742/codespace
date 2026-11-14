#!/usr/bin/env python3
"""Recompute the funny_bench contrasts in references/data-findings.md.

    pip install pandas pyarrow numpy
    # download sft/train-00000-of-00001.parquet from huggingface.co/datasets/fchaubard/funny_bench
    python analyze_funny_bench.py path/to/sft/train-00000-of-00001.parquet

Prints per-tier medians and means, the Spearman correlation of each feature with
engagement rate (averaged over five duration buckets), and the words most
over-represented in the top and bottom tiers (weighted log-odds, Monroe et al. 2008).
"""
import collections
import re
import sys

import numpy as np
import pandas as pd

ORDER = ["WARMING_UP", "SOLID", "KILLER", "LEGENDARY"]
LAUGH = "[LAUGHTER]"


def main(path):
    df = pd.read_parquet(path)
    text = df.messages.map(lambda m: m[-1]["content"])
    spoken = text.str.replace(r"\[(COMEDIAN|AUDIENCE|LAUGHTER)\]:?", " ", regex=True)
    words = spoken.str.split().str.len().clip(lower=1)
    minutes = df.duration_seconds / 60
    rate = lambda pat: spoken.str.count(pat, flags=re.I) / words * 100  # noqa: E731

    def first_laugh(t):
        return len(t.split(LAUGH)[0].split()) if LAUGH in t else np.nan

    f = pd.DataFrame({
        "tier": df.tier,
        "engagement": df.engagement_rate,
        "laughs_per_min": text.str.count(re.escape(LAUGH)) / minutes,
        "words_per_min": words / minutes,
        "words_before_first_laugh": text.map(first_laugh),
        "actout": rate(r"\b(he goes|she goes|i go|i'm like|he's like|she's like|they're like|he said|she said|i said)\b"),
        "i": rate(r"\bi\b"),
        "you": rate(r"\byou\b"),
        "names": spoken.str.count(r"(?<=[a-z,] )[A-Z][a-z]+") / words * 100,
        "words_per_sentence": words / spoken.str.count(r"[.!?]").clip(lower=1),
    })
    cols = [c for c in f.columns if c not in ("tier", "engagement")]
    print("medians by tier\n", f.groupby("tier")[cols].median().loc[ORDER].round(2).T.to_string(), "\n")
    print("means by tier\n", f.groupby("tier")[cols].mean().loc[ORDER].round(2).T.to_string(), "\n")

    f["bucket"] = pd.qcut(df.duration_seconds, 5, labels=False)
    print("Spearman with engagement rate (mean over duration buckets)")
    for c in cols:
        r = [g[[c, "engagement"]].dropna().corr(method="spearman").iloc[0, 1] for _, g in f.groupby("bucket")]
        print(f"  {c:26} {np.mean(r):+.3f}")

    tok = lambda s: re.findall(r"[a-z']+", s.lower())  # noqa: E731
    top = collections.Counter(w for s in spoken[df.tier.isin(["LEGENDARY", "KILLER"])] for w in tok(s))
    bot = collections.Counter(w for s in spoken[df.tier == "WARMING_UP"] for w in tok(s))
    prior = top + bot
    a0, n1, n2 = sum(prior.values()), sum(top.values()), sum(bot.values())
    z = {}
    for w, a in prior.items():
        if a < 150:
            continue
        d = np.log((top[w] + a) / (n1 + a0 - top[w] - a)) - np.log((bot[w] + a) / (n2 + a0 - bot[w] - a))
        z[w] = d / np.sqrt(1 / (top[w] + a) + 1 / (bot[w] + a))
    ranked = sorted(z, key=z.get)
    print("\ntop tiers over-use:", ", ".join(ranked[-40:][::-1]))
    print("bottom tier over-uses:", ", ".join(ranked[:40]))


if __name__ == "__main__":
    main(sys.argv[1])
