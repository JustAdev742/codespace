"""The analyst: what a batch of security events amounts to, said in three plain lines on each alert.

Two readers, kept strictly apart:

  - THE RULES (`by_rules`). The sentinel knows exactly what each event is, because a rule of its own produced it.
    From the kinds of event, how many devices were banned and the threat level, the rules say what it was, how
    serious it is and whether several devices were at it together. This reading is exact, instant and free, and
    nothing an attacker writes into a log line can sway it. It is always there, with or without the model below.

  - AN OPTIONAL AI MODEL (`read`). A small DECISION model is shown the event texts and asked one fixed question
    with five fixed answers. It never writes text. Measured on this server's own test set
    (`ludoractl ai bench`), the model shipped here names the activity correctly on about three quarters of the
    held-out cases, where the rules are right by construction. So it is off unless switched on, its line is printed
    beside the rules' reading as advice, it changes nothing (not urgency, not bans, not whether an alert is sent),
    and while its score is below the pass mark its line says so.

The engine is Colibri (github.com/JustVugg/colibri, Apache-2.0) running Laya (Convai Innovations, Apache-2.0, a
ModernBERT encoder with a decision head) and serving Colibri's `POST /v1/systemone`. It runs in its own container
with no way out to any network, listening on this machine's loopback only. Events never leave the server. The
engine is built from a pinned commit with this repository's patches on top (`analyst/patches/`): the same
answers, bit for bit, in less time.
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

ACTIVITY = {     # the options the model chooses between, in the guard's own vocabulary (wording tuned on half the test set)
    "scan": "touching decoy ports or probing for weak spots",
    "guessing": "repeated failed sign-ins: guessing passwords",
    "flood": "flooding the site with requests to overload it",
    "impersonation": "a device using another machine's address or hardware address",
    "mistake": "a trusted staff device, not banned: an honest slip",
}
ACTIVITY_WORDS = {
    "scan": "an automated scan", "guessing": "password guessing", "flood": "an attempt to overload the server",
    "impersonation": "a device impersonating another", "mistake": "a mistake rather than an attack",
}
SERIOUSNESS = ["needs no action", "worth a look today", "needs a person to act now"]
# What each kind of event the sentinel records IS. The sentinel knows this exactly: it is the rule that fired.
KIND_ACTIVITY = {"tripwire": "scan", "probe": "scan", "ssh": "guessing", "guessing": "guessing", "fuzzing": "flood", "flood": "flood",
                 "impersonation": "impersonation", "arp": "impersonation"}
QUESTION = {"activity": {"type": "choice", "instructions": "A school server's guard recorded this. What was it?", "criteria": ACTIVITY}}
PASS_MARK = 0.9          # the share of the test cases a model must get right before its line is trusted in an alert
BENCH_FILE = f"{system.STATE}/analyst/bench.json"


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


@dataclass
class Verdict:
    """What the guard's own rules make of a batch of events. Exact, instant, and nothing in a log line can sway it."""
    activity: str
    seriousness: int            # 0 needs no action, 1 worth a look today, 2 needs a person now
    devices: int                # distinct addresses that were banned in this batch

    def lines(self) -> list[str]:
        out = [f"What it was: {ACTIVITY_WORDS[self.activity]}.", f"How serious: {SERIOUSNESS[self.seriousness]}."]
        if self.devices >= 3:
            out.append(f"{self.devices} devices were at it together.")
        return out


def by_rules(events: list[dict[str, Any]]) -> Verdict | None:
    """Read a batch the way the rules that produced it would. None when it holds nothing the rules class as an offence.

    Seriousness, by a fixed rubric: 2 when the router is impersonated, the threat level is "under attack", or three
    or more devices were banned together; 1 for one device guessing, flooding, probing or coming back after a ban,
    and for a decoy touch from an address that had just changed hands; 0 for a single decoy touch and for staff slips."""
    offences = [e for e in events if e.get("kind") in KIND_ACTIVITY]
    if not offences:
        return None
    banned = [e for e in offences if "minutes" in e]
    devices = len({str(e.get("ip")) for e in banned if e.get("ip")})
    kinds = {e["kind"] for e in offences}
    under_attack = any(e.get("kind") == "level" and e.get("level") == 2 for e in events)
    if kinds & {"impersonation", "arp"}:
        activity = "impersonation"
    elif banned:
        counts: dict[str, int] = {}
        for e in banned:
            counts[KIND_ACTIVITY[e["kind"]]] = counts.get(KIND_ACTIVITY[e["kind"]], 0) + 1
        activity = max(("flood", "guessing", "scan"), key=lambda a: counts.get(a, 0))     # ties go to the graver one
    else:
        activity = "mistake"                        # every offender was trusted staff, or a shared address: nobody was banned
    if "arp" in kinds or under_attack or devices >= 3:
        seriousness = 2
    elif activity in ("guessing", "flood", "impersonation") or "probe" in kinds or any(e.get("minutes", 0) > 15 for e in banned):
        seriousness = 1
    else:
        seriousness = 0
    return Verdict(activity, seriousness, devices)


@dataclass
class Reading:
    """The optional AI model's reading of the same batch: which of the five activities, and how sure."""
    activity: str
    activity_p: float
    ms: int
    input_tokens: int


def state_for(events: list[dict[str, Any]]) -> str:
    """What the model is shown: the cleaned event texts, one a line. No options and no instructions go in here."""
    return "\n".join(alerts.clean(e.get("text", ""), 200) for e in events if e.get("text"))[:6000]


def read(events: list[dict[str, Any]], cfg: dict[str, Any], ask=_ask) -> Reading | None:
    """Ask the model about one batch of events. None when it is off, unreachable, slow or its reply is not usable."""
    if not cfg.get("AI_ENABLED") or not events:
        return None
    try:
        reply, seconds = ask(cfg["AI_PORT"], state_for(events[:24]), QUESTION)
        answers = reply.get("answers") if isinstance(reply, dict) else None
        if not isinstance(answers, dict):
            return None
        activity = _probabilities(answers.get("activity"), list(ACTIVITY))
        if not activity:
            return None
        top = max(activity, key=lambda k: activity[k])
        usage = reply.get("usage") if isinstance(reply.get("usage"), dict) else {}
        tokens = usage.get("input_tokens")
        return Reading(top, activity[top], int(seconds * 1000), int(tokens) if isinstance(tokens, int) and not isinstance(tokens, bool) else 0)
    except (urllib.error.URLError, OSError, ValueError, TypeError, AttributeError):
        return None


def last_bench() -> dict[str, Any] | None:
    try:
        found = json.loads(system.read(BENCH_FILE) or "null")
        return found if isinstance(found, dict) and isinstance(found.get("right"), int) and isinstance(found.get("asked"), int) and found["asked"] > 0 else None
    except ValueError:
        return None


def passed(result: dict[str, Any] | None) -> bool:
    return bool(result) and result["answered"] == result["asked"] and result["right"] >= PASS_MARK * result["asked"]


def annotate(alert: alerts.Alert, verdict: Verdict | None, reading: Reading | None = None) -> alerts.Alert:
    """Add the rules' reading of the batch to an alert, and the model's line beside it if there is one.

    The rules' reading can make an alert MORE urgent, never less. The model's line changes nothing at all: it is
    printed as advice, says plainly when it disagrees with the rules, and carries its own test score when that
    score is below the pass mark."""
    if verdict is None:
        return alert
    lines = verdict.lines()
    if reading is not None:
        scored = last_bench()
        caveat = "" if passed(scored) else (f" This model got {scored['right']} of {scored['asked']} test cases right on this server: treat its line with care."
                                            if scored else " This model has not been tested on this server yet (`ludoractl ai bench`).")
        if reading.activity == verdict.activity:
            lines.append(f"The AI model reads it the same way ({reading.activity_p:.0%} sure).{caveat}")
        else:
            lines.append(f"The AI model reads it differently, as {ACTIVITY_WORDS[reading.activity]} ({reading.activity_p:.0%} sure). The server acts on the rules, not on this.{caveat}")
    alert.second_opinion = lines
    alert.urgent = alert.urgent or verdict.seriousness >= 2
    return alert


# ---- a fixed set of cases with known answers, to check a model before trusting it and to time it ---------------
# The idea is Colibri's own: judge a setting by a fixed quiz, and report speed beside it, never speed alone. The cases
# are built from the sentences the sentinel really writes; the right answer for each is what the rules say it is.
def cases(seed: int = 7) -> tuple[list[list[dict[str, Any]]], list[list[dict[str, Any]]]]:
    """72 batches of events, as (tuning half, held-out half). The wording above was chosen on the first half only;
    `bench` scores a model on the second."""
    import random
    r = random.Random(seed)
    out: list[list[dict[str, Any]]] = []
    address = lambda: f"10.20.{r.randint(1, 8)}.{r.randint(2, 250)}"            # noqa: E731
    staff = lambda: f"10.20.9.{r.randint(2, 60)}"                                # noqa: E731
    mac = lambda: ":".join(f"{r.randint(0, 255):02x}" for _ in range(6))         # noqa: E731
    minutes = lambda: r.choice([15, 60, 240])                                    # noqa: E731
    port = lambda: r.choice([21, 23, 445, 1433, 3306, 3389, 5900, 8080])         # noqa: E731
    WHY = {"tripwire": lambda: f"connected to decoy port {port()}", "probe": lambda: "probed for other software's weak spots", "ssh": lambda: "failed to sign in over SSH 5 times",
           "guessing": lambda: "kept guessing at sign-in", "fuzzing": lambda: "sent a stream of broken requests", "flood": lambda: "flooded the site with requests"}

    def ban(kind: str, ip: str, mins: int | None = None) -> dict[str, Any]:
        mins = mins or minutes()
        return {"kind": kind, "ip": ip, "minutes": mins, "text": f"{ip} {WHY[kind]()}. Banned for {mins} min."}

    def trusted(kind: str, ip: str) -> dict[str, Any]:
        return {"kind": kind, "ip": ip, "text": f"{ip} {WHY[kind]()}. Not banned: it is trusted."}

    for _ in range(9):
        out.append([ban("tripwire", address(), 15)])
    for _ in range(6):
        a = address()
        out.append([ban("probe", a)] + ([ban("tripwire", a, 60)] if r.random() < 0.5 else []))
    for _ in range(5):
        out.append([ban("tripwire", address(), 15) for _ in range(r.randint(4, 7))])
    for _ in range(8):
        out.append([ban(r.choice(["guessing", "ssh"]), address())])
    for _ in range(6):
        out.append([ban("guessing", address()) for _ in range(r.randint(3, 6))])
    for _ in range(7):
        out.append([ban(r.choice(["flood", "fuzzing"]), address())])
    for _ in range(7):
        lead = ([{"kind": "level", "level": 2, "text": "Threat level: under attack."}, {"kind": "shield", "text": "Shield raised: every limit is a quarter of normal."}]
                if r.random() < 0.7 else [{"kind": "level", "level": 1, "text": "Threat level: watchful."}])
        out.append(lead + [ban("flood", address(), 15) for _ in range(r.randint(3, 6))])
    for _ in range(5):
        out.append([{"kind": "arp", "ip": "10.20.0.1", "text": f"The gateway 10.20.0.1 changed hardware address ({mac()} to {mac()}). If nobody replaced the router, a device is impersonating it."}])
    for _ in range(5):
        out.append([{"kind": "arp", "text": f"One device ({mac()}) answers for {r.randint(3, 14)} addresses. That is how traffic gets intercepted."}])
    for _ in range(5):
        a = address()
        out.append([{"kind": "impersonation", "ip": a, "text": f"{a} connected to decoy port {port()}, minutes after that address moved to a different device ({mac()}). "
                     "Not banned: someone may be using another machine's address to get it banned."}])
    for _ in range(9):
        out.append([trusted(r.choice(["tripwire", "ssh", "guessing"]), staff())])
    r.shuffle(out)
    for batch in out:
        for i, event in enumerate(batch):
            event["at"] = 1000 + i
    return out[0::2], out[1::2]


def bench(cfg: dict[str, Any], rounds: int = 1, ask=_ask, keep: bool = True) -> dict[str, Any]:
    """Score the running model on the held-out half of the cases: how often it names what the rules know happened,
    and how long it takes. One warm-up pass of two cases is thrown away. The result is kept for `ludoractl ai status`
    and for the caveat alerts carry while the model is below the pass mark."""
    held_out = cases()[1]
    on = dict(cfg, AI_ENABLED=True)
    for batch in held_out[:2]:
        read(batch, on, ask)
    right = answered = tokens = 0
    times: list[int] = []
    wrong: list[str] = []
    for _ in range(max(1, rounds)):
        for batch in held_out:
            reading = read(batch, on, ask)
            if reading is None:
                continue
            answered += 1
            times.append(reading.ms)
            tokens += reading.input_tokens
            want = by_rules(batch)
            assert want is not None
            if reading.activity == want.activity:
                right += 1
            elif len(wrong) < 8:
                wrong.append(f"it is {want.activity}; the model said {reading.activity} ({reading.activity_p:.0%}): {batch[0]['text'][:70]}")
    asked = len(held_out) * max(1, rounds)
    total = sum(times) / 1000 or 1e-9
    result = {
        "asked": asked, "answered": answered, "right": right, "wrong": wrong,
        "median_ms": int(statistics.median(times)) if times else None,
        "slowest_ms": max(times) if times else None,
        "readings_per_minute": round(answered / total * 60, 1) if times else 0,
        "tokens_read_per_second": round(tokens / total) if times and tokens else None,   # the model's own count of input tokens
        "at": int(time.time()),
    }
    if keep and answered:
        os.makedirs(os.path.dirname(system.p(BENCH_FILE)), exist_ok=True)
        system.write_atomic(BENCH_FILE, json.dumps({k: v for k, v in result.items() if k != "wrong"}), 0o644)
    return result


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


def engine_version() -> str:
    """Twelve hex digits naming the engine that would be built: the pinned commit and every patch laid on it."""
    digest = hashlib.sha256(ENGINE_COMMIT.encode())
    folder = system.p(f"{BUILD_DIR}/patches")
    for name in sorted(os.listdir(folder)) if os.path.isdir(folder) else []:
        with open(os.path.join(folder, name), "rb") as fh:
            digest.update(name.encode() + b"\0" + fh.read())
    return digest.hexdigest()[:12]


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
    tag = f"{IMAGE}:{engine_version()}"
    if not system.run(["podman", "image", "exists", tag]).ok:
        log("Building the engine from its source. This takes several minutes.")
        built = system.run(["podman", "build", "--quiet", "--network", "host", "--build-arg", f"ENGINE_REPO={ENGINE_REPO}", "--build-arg", f"ENGINE_COMMIT={ENGINE_COMMIT}",
                            "--tag", tag, system.p(BUILD_DIR)], timeout=3600)
        if not built.ok:
            raise AnalystError("The engine could not be built: " + built.err.strip()[-500:])
    system.write_atomic(IMAGE_FILE, tag + "\n", 0o644)
    return tag
