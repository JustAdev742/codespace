"""The analyst: an optional small AI model that reads a batch of security events and gives a second opinion.

It is a DECISION model, not a chat model. It is handed the events and three fixed questions, and answers each with
a probability for every option, in one pass. It never writes text, so nothing an attacker plants in a log line can
make it say anything: the most a planted line can do is tilt a probability. For that reason its reading is advice
and nothing more:

  - it never bans, unbans, opens or closes anything: the sentinel's rules do that, before the analyst is asked;
  - it can make an alert MORE urgent, never less, and it can never hold an alert back;
  - if it is slow, missing or answers nonsense, the alert goes out without it.

The engine is Colibri (github.com/JustVugg/colibri, Apache-2.0) running Laya (Convai Innovations, Apache-2.0, a
ModernBERT encoder with a decision head) and serving Colibri's `POST /v1/systemone`. It runs in its own container
with no way out to any network, listening on this machine's loopback only. Events never leave the server.

Why a decision model and not a small chat model: on an old office PC a chat model good enough to trust writes a
few words a second, and the wording of an alert is better fixed and tested anyway. A decision model reads several
hundred words a second on the same machine and has nothing to generate. `ludoractl ai bench` measures it on the
machine it is on.
"""

from __future__ import annotations

import hashlib
import json
import os
import re
import statistics
import time
import urllib.error
import urllib.request
from dataclasses import dataclass
from typing import Any

from . import alerts, system

MODEL_DIR = f"{system.STATE}/analyst/model"
IMAGE_FILE = f"{system.STATE}/analyst/image"      # which built image to run, written by `ludoractl ai install`
BUILD_DIR = "/usr/share/ludora-os/analyst"        # the Containerfile
IMAGE = "localhost/ludora-analyst"
# Pinned: the engine's source and the model's files are fetched at exactly these versions and checked.
ENGINE_REPO = "https://github.com/JustVugg/colibri"
ENGINE_COMMIT = "0a5504a1dc64f86fcd0fe7db298b0448c730e7e6"
MODEL_REPO = "https://huggingface.co/convaiinnovations/laya"
MODEL_REVISION = "e333cb7c823cd1787276228260f56d02fbf5180b"
MODEL_FILES: dict[str, tuple[int, str | None]] = {   # path -> (bytes, sha256 where the host publishes one)
    "model.safetensors": (842609210, "891102d372688fc2a094dac56a384bc537b87c63f21f9f3dac0be2b7cbc8d86c"),
    "rl_agent_config.json": (745, None),
    "encoder/config.json": (2083, None),
    "tokenizer/tokenizer.json": (3583228, None),
    "tokenizer/tokenizer_config.json": (308, None),
}
TIMEOUT = 8.0

ACTIVITY = {
    "scan": "an automated tool looking for open ports or for web pages with known weaknesses",
    "guessing": "someone trying many passwords to get into an account",
    "flood": "an attempt to overload the server or knock it offline",
    "impersonation": "a device pretending to be another machine or the network router",
    "mistake": "an ordinary person or a misconfigured device, not an attack",
}
ACTIVITY_WORDS = {
    "scan": "an automated scan", "guessing": "password guessing", "flood": "an attempt to overload the server",
    "impersonation": "a device impersonating another", "mistake": "a mistake rather than an attack",
}
SERIOUSNESS = ["routine background noise that needs no action", "worth a look later today", "needs a person to act now"]
# Two neutral labels, not yes/no: this model can lean on the words "true" and "false" themselves (its model card says so).
PLANNED = {
    "together": "several devices working together on one planned attack",
    "separate": "one device, or unrelated devices acting separately",
}
QUESTIONS = {
    "activity": {"type": "choice", "instructions": "A school runs a quiz-game web server for its students. Its guard recorded these events. What best describes what happened?", "criteria": ACTIVITY},
    "seriousness": {"type": "score", "instructions": "How serious is this for a school that is running lessons on this server right now?", "criteria": SERIOUSNESS},
    "planned": {"type": "choice", "instructions": "Do these events look like the work of several devices together, or not?", "criteria": PLANNED},
}


@dataclass
class Reading:
    activity: str
    activity_p: float
    seriousness: float          # 0 (noise) to 2 (act now)
    planned_p: float            # probability that several devices are working together
    ms: int
    input_tokens: int

    def lines(self) -> list[str]:
        level = SERIOUSNESS[min(2, max(0, round(self.seriousness)))]
        out = [f"Most likely {ACTIVITY_WORDS[self.activity]} ({self.activity_p:.0%} sure).", f"Seriousness: {level} ({self.seriousness:.1f} on a scale of 0 to 2)."]
        if self.planned_p >= 0.6:
            out.append(f"It looks like several devices working together ({self.planned_p:.0%}).")
        return out

    @property
    def raises_urgency(self) -> bool:
        return self.seriousness >= 1.5 and self.activity != "mistake"


def state_for(events: list[dict[str, Any]], cfg: dict[str, Any]) -> dict[str, Any]:
    """What the model is shown: the cleaned event texts and a few counts. No options and no instructions go in here."""
    texts = [alerts.clean(e.get("text", ""), 200) for e in events if e.get("text")][:24]
    addresses = sorted({str(e["ip"]) for e in events if e.get("ip")})
    times = [e.get("at", 0) for e in events if e.get("at")]
    return {
        "events": texts,
        "distinct_addresses": len(addresses),
        "addresses_banned": len({str(e["ip"]) for e in events if e.get("ip") and "minutes" in e}),
        "minutes_spanned": round((max(times) - min(times)) / 60, 1) if len(times) > 1 else 0,
        "students_share_one_address": bool(cfg.get("NAT_MODE")),
    }


def _ask(port: int, state: Any, questions: dict[str, Any], timeout: float = TIMEOUT) -> tuple[dict[str, Any], float]:
    body = json.dumps({"model": "laya", "state": state, "questions": questions}).encode()
    request = urllib.request.Request(f"http://127.0.0.1:{int(port)}/v1/systemone", data=body, headers={"Content-Type": "application/json"}, method="POST")
    opener = urllib.request.build_opener(urllib.request.ProxyHandler({}))   # this machine only: never through a proxy
    started = time.monotonic()
    with opener.open(request, timeout=timeout) as response:
        raw = response.read(200_000)
    return json.loads(raw), time.monotonic() - started


def _probabilities(answer: Any, labels: list[str]) -> dict[str, float] | None:
    """The model's numbers, or None if they are not what was asked for. Nothing else in the reply is ever used."""
    if not isinstance(answer, dict) or not isinstance(answer.get("probabilities"), dict):
        return None
    out: dict[str, float] = {}
    for label in labels:
        value = answer["probabilities"].get(label)
        if isinstance(value, bool) or not isinstance(value, (int, float)) or not 0.0 <= float(value) <= 1.0:
            return None
        out[label] = float(value)
    return out if 0.98 <= sum(out.values()) <= 1.02 else None


def read(events: list[dict[str, Any]], cfg: dict[str, Any], ask=_ask) -> Reading | None:
    """Ask the model about one batch of events. None when it is off, unreachable, slow or its reply is not usable."""
    if not cfg.get("AI_ENABLED") or not events:
        return None
    try:
        reply, seconds = ask(cfg["AI_PORT"], state_for(events, cfg), QUESTIONS)
        answers = reply.get("answers") if isinstance(reply, dict) else None
        if not isinstance(answers, dict):
            return None
        activity = _probabilities(answers.get("activity"), list(ACTIVITY))
        serious = _probabilities(answers.get("seriousness"), ["0", "1", "2"])
        planned = _probabilities(answers.get("planned"), list(PLANNED))
        if not activity or not serious or not planned:
            return None
        top = max(activity, key=lambda k: activity[k])
        usage = reply.get("usage") if isinstance(reply.get("usage"), dict) else {}
        tokens = usage.get("input_tokens")
        return Reading(top, activity[top], sum(int(k) * v for k, v in serious.items()), planned["together"], int(seconds * 1000),
                       int(tokens) if isinstance(tokens, int) and not isinstance(tokens, bool) else 0)
    except (urllib.error.URLError, OSError, ValueError, TypeError, AttributeError):
        return None


def annotate(alert: alerts.Alert, reading: Reading | None) -> alerts.Alert:
    """Add the analyst's reading to an alert. It can raise the urgency; it cannot lower it or change anything else."""
    if reading is None:
        return alert
    alert.second_opinion = reading.lines()
    alert.urgent = alert.urgent or reading.raises_urgency
    return alert


# ---- a fixed set of cases with known answers, to check a model before trusting it and to time it ---------------
# The idea is Colibri's own: judge a setting by a small fixed quiz, and report speed beside it, never speed alone.
QUIZ: list[tuple[str, int, list[str]]] = [   # (expected activity, least seriousness expected 0-2, event texts)
    ("scan", 0, ["10.20.3.3 connected to decoy port 3389. Banned for 15 min."]),
    ("scan", 0, ["10.20.4.9 probed for other software's weak spots. Banned for 15 min."]),
    ("scan", 0, ["10.20.3.3 connected to decoy port 23. Banned for 15 min.", "10.20.3.3 connected to decoy port 445. Banned for 60 min."]),
    ("guessing", 1, ["10.20.5.5 kept guessing at sign-in. Banned for 15 min."]),
    ("guessing", 1, ["10.20.5.5 failed to sign in over SSH 5 times. Banned for 15 min."]),
    ("guessing", 1, ["10.20.5.5 kept guessing at sign-in. Banned for 60 min.", "10.20.5.6 kept guessing at sign-in. Banned for 15 min."]),
    ("flood", 1, ["10.20.6.1 flooded the site with requests. Banned for 15 min."]),
    ("flood", 2, ["Threat level: under attack.", "Shield raised: every limit is a quarter of normal.", "10.20.6.1 flooded the site with requests. Banned for 15 min.",
                  "10.20.6.2 flooded the site with requests. Banned for 15 min.", "10.20.6.3 flooded the site with requests. Banned for 15 min."]),
    ("flood", 1, ["10.20.6.4 sent a stream of broken requests. Banned for 15 min.", "10.20.6.4 flooded the site with requests. Banned for 60 min."]),
    ("impersonation", 1, ["The gateway 10.20.0.1 changed hardware address (aa:aa:aa:aa:aa:01 to ee:ee:ee:ee:ee:66). If nobody replaced the router, a device is impersonating it."]),
    ("impersonation", 1, ["10.20.3.30 connected to decoy port 23, minutes after that address moved to a different device (ee:ee:ee:ee:ee:66). Not banned: someone may be using another machine's address to get it banned."]),
    ("impersonation", 1, ["One device (ee:ee:ee:ee:ee:66) answers for 9 addresses. That is how traffic gets intercepted."]),
    ("mistake", 0, ["10.20.9.10 connected to decoy port 23. Not banned: it is trusted."]),
    ("mistake", 0, ["10.20.9.12 failed to sign in over SSH 5 times. Not banned: it is trusted."]),
]


def bench(cfg: dict[str, Any], rounds: int = 3, ask=_ask) -> dict[str, Any]:
    """Run the quiz against the running model. One warm-up pass is thrown away; then `rounds` passes are timed."""
    cases = [([{"text": t, "at": 1000 + i} for i, t in enumerate(texts)], want, least) for want, least, texts in QUIZ]
    on = dict(cfg, AI_ENABLED=True)
    for events, _, _ in cases[:2]:
        read(events, on, ask)
    right = answered = 0
    times: list[int] = []
    tokens = 0
    wrong: list[str] = []
    for _ in range(max(1, rounds)):
        for events, want, least in cases:
            reading = read(events, on, ask)
            if reading is None:
                continue
            answered += 1
            times.append(reading.ms)
            tokens += reading.input_tokens
            if reading.activity == want and reading.seriousness >= least - 0.5:
                right += 1
            elif len(wrong) < 8:
                wrong.append(f"expected {want}, at least {least}; got {reading.activity} ({reading.activity_p:.0%}), {reading.seriousness:.1f}: {events[0]['text'][:70]}")
    asked = len(cases) * max(1, rounds)
    total = sum(times) / 1000 or 1e-9
    return {
        "asked": asked, "answered": answered, "right": right, "wrong": wrong,
        "median_ms": int(statistics.median(times)) if times else None,
        "slowest_ms": max(times) if times else None,
        "readings_per_minute": round(answered / total * 60, 1) if times else 0,
        "words_read_per_second": round(tokens / total) if times and tokens else None,   # the model's own count of input tokens
    }


# ---- installing it ----------------------------------------------------------------------------------------------
class AnalystError(RuntimeError):
    pass


def image() -> str | None:
    """The image `ludoractl ai install` built, if there is one."""
    tag = (system.read(IMAGE_FILE) or "").strip()
    return tag if re.fullmatch(re.escape(IMAGE) + r":[a-f0-9]{12}", tag) else None


def model_ready() -> list[str]:
    """What is missing or the wrong size among the model's files. Empty means all there."""
    out = []
    for name, (size, _) in MODEL_FILES.items():
        path = system.p(f"{MODEL_DIR}/{name}")
        if not os.path.isfile(path) or os.path.getsize(path) != size:
            out.append(name)
    return out


def _fetch(url: str, path: str, size: int, sha256: str | None, log) -> None:
    """Download one file to a temporary name, check its size and checksum, and only then put it in place."""
    os.makedirs(os.path.dirname(path), exist_ok=True)
    partial = path + ".part"
    digest = hashlib.sha256()
    got = 0
    request = urllib.request.Request(url, headers={"User-Agent": "ludora-os"})
    with urllib.request.urlopen(request, timeout=60) as response, open(partial, "wb") as out:  # noqa: S310 - https, a fixed host
        while True:
            block = response.read(1 << 20)
            if not block:
                break
            got += len(block)
            if got > size:
                break
            digest.update(block)
            out.write(block)
            if size > (50 << 20) and got % (100 << 20) < (1 << 20):
                log(f"  {got >> 20} of {size >> 20} MB")
    if got != size or (sha256 and digest.hexdigest() != sha256):
        os.unlink(partial)
        raise AnalystError(f"{os.path.basename(path)} did not arrive intact (size or checksum differs from the pinned one). Nothing was installed.")
    os.chmod(partial, 0o644)
    os.replace(partial, path)


def install(log=print) -> str:
    """Fetch the model (checked against pinned checksums) and build the engine from its pinned source, in a container."""
    for name, (size, sha256) in MODEL_FILES.items():
        path = system.p(f"{MODEL_DIR}/{name}")
        if os.path.isfile(path) and os.path.getsize(path) == size:
            continue
        log(f"Fetching the model: {name} ({max(1, size >> 20)} MB).")
        _fetch(f"{MODEL_REPO}/resolve/{MODEL_REVISION}/{name}", path, size, sha256, log)
    for folder, _, _ in os.walk(system.p(MODEL_DIR)):
        os.chmod(folder, 0o755)
    tag = f"{IMAGE}:{ENGINE_COMMIT[:12]}"
    if not system.run(["podman", "image", "exists", tag]).ok:
        log("Building the engine from its source. This takes several minutes.")
        built = system.run(["podman", "build", "--quiet", "--network", "host", "--build-arg", f"ENGINE_REPO={ENGINE_REPO}", "--build-arg", f"ENGINE_COMMIT={ENGINE_COMMIT}",
                            "--tag", tag, system.p(BUILD_DIR)], timeout=3600)
        if not built.ok:
            raise AnalystError("The engine could not be built: " + built.err.strip()[-500:])
    system.write_atomic(IMAGE_FILE, tag + "\n", 0o644)
    return tag
