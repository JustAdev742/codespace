"""Alerts: telling the right people, in detail, by ways that cost nothing.

Three audiences, each with its own list of recipients in the settings:

  security  attacks: bans, floods, impersonation, lockdown, support access   ALERT_SECURITY_TO
  upkeep    the server needs care: failed backup or update, failing checks    ALERT_UPKEEP_TO
  cheat     Ludora spotted likely cheating in a game                          ALERT_CHEAT_TO

A recipient is an email address, `ntfy:<topic>` (a free push to the ntfy phone app) or `telegram:<chat number>`
(a message from a Telegram bot the school makes). A text message to a phone number is not offered: every way of
sending one costs money or depends on a mobile carrier's email gateway, and those are being switched off.

Nothing here raises: an alert that cannot be delivered must never stop what it reports on. Text that came from
outside (an attacker picks user names, paths and player names) is cleaned before it goes into a message, and
messages are plain text only.
"""

from __future__ import annotations

import json
import re
import smtplib
import ssl
import time
import urllib.error
import urllib.request
from dataclasses import dataclass, field
from email.message import EmailMessage
from email.utils import formatdate, make_msgid
from typing import Any

from . import system

AUDIENCES = {
    "security": ("ALERT_SECURITY_TO", "Security"),
    "upkeep": ("ALERT_UPKEEP_TO", "Upkeep"),
    "cheat": ("ALERT_CHEAT_TO", "Fair play"),
}
SECRET_KEYS = ("SMTP_PASSWORD", "TELEGRAM_BOT_TOKEN")
TIMEOUT = 20
_TELEGRAM_TOKEN = re.compile(r"^[0-9]{6,12}:[A-Za-z0-9_-]{30,50}$")

# What each kind of event means and what to do about it. Kept beside the sending code so an alert is never
# just "something happened": it says what the server did, and what, if anything, a person should do.
ADVICE: dict[str, tuple[str, str]] = {
    "tripwire": (
        "A device connected to a decoy port: a port with nothing real behind it, which only something scanning the server finds.",
        "Usually nothing: the address is refused for the length of the ban. If it is a school machine that should not have been banned, "
        "run `ludoractl unban ADDRESS`, and add it to the staff addresses if it must never be banned.",
    ),
    "ssh": (
        "A device kept failing to sign in over SSH.",
        "Nothing if it was a stranger: SSH takes keys only. If it was you, check which key your SSH program is offering.",
    ),
    "probe": (
        "A device asked for pages that belong to other software (WordPress, PHP, hidden settings files), looking for a known hole. Ludora has none of them.",
        "Nothing: the address is refused for the length of the ban. Repeated bans of one address are worth a word with whoever uses that device.",
    ),
    "guessing": (
        "A device kept trying passwords at Ludora's sign-in.",
        "Check the account it was aimed at if you can tell which, and remind its owner not to reuse passwords. The address is refused for the length of the ban.",
    ),
    "fuzzing": (
        "A device sent a stream of broken requests, the pattern of a tool hunting for faults.",
        "Nothing: the address is refused for the length of the ban.",
    ),
    "flood": (
        "A device sent requests far faster than a person or the game can.",
        "Nothing if the game carried on. If lessons were disturbed, `ludoractl lockdown on` closes Ludora to everyone outside the staff addresses until you turn it off.",
    ),
    "impersonation": (
        "An address misbehaved minutes after it moved to a different device. Someone may be using a classmate's address to get that classmate banned, so nobody was banned.",
        "Find the device with the hardware address shown (the network switch can tell you which port it is on). Switch port security stops this for good.",
    ),
    "arp": (
        "The server's view of its own network changed in a way that happens when a device pretends to be the router.",
        "If nobody replaced the router, treat it as an attack on the network: find the device with the hardware address shown. HTTPS keeps Ludora's traffic unreadable meanwhile.",
    ),
    "level": (
        "The server's threat level changed. 'Under attack' means several addresses misbehaved at once, or traffic far past the limits.",
        "Look at `ludoractl events` for who and what. The server tightens its own limits while this lasts.",
    ),
    "shield": (
        "The shield changed. While it is up, every limit is a quarter of normal for everyone outside the staff addresses.",
        "Nothing: it lowers itself after fifteen quiet minutes. `ludoractl shield off` forces it down.",
    ),
    "manual": ("An administrator banned or unbanned an address by hand.", "Nothing, unless nobody at the school did this."),
    "support": (
        "Support access was opened or closed: a time-limited way for a helper to run a short list of safe commands over SSH.",
        "Nothing if you opened it. If nobody did, run `ludoractl support close` and check who has the administrator password.",
    ),
    "lockdown": ("Lockdown was switched on or off. While on, only the staff addresses can open Ludora.", "Nothing, unless nobody at the school did this."),
}


# A short name for each kind, for headings and for the subject line when several things happened at once.
LABEL = {
    "tripwire": "Decoy port touched", "ssh": "SSH sign-in failures", "probe": "Probing for weak spots", "guessing": "Password guessing",
    "fuzzing": "Stream of broken requests", "flood": "Flood of requests", "impersonation": "Possible impersonation of an address",
    "arp": "The network gateway may be impersonated", "level": "Threat level changed", "shield": "Shield changed", "manual": "Ban changed by hand",
    "support": "Support access", "lockdown": "Lockdown",
}


@dataclass
class Alert:
    audience: str                      # security | upkeep | cheat
    title: str                         # one line: what happened
    what: str = ""                     # a sentence or two of explanation
    did: str = ""                      # what the server has already done about it
    todo: str = ""                     # what a person should do now, if anything
    facts: list[str] = field(default_factory=list)   # the specifics, one per line
    urgent: bool = False
    explain: list[tuple[str, str, str]] = field(default_factory=list)   # (heading, what it means, what to do) when several kinds are in one alert


def clean(text: Any, limit: int = 300) -> str:
    """One line of printable text. Whatever an outsider typed cannot add lines, hide text or outgrow its place."""
    out = "".join(ch if ch.isprintable() else " " for ch in str(text))
    out = " ".join(out.split())
    return out if len(out) <= limit else out[: limit - 3].rstrip() + "..."


def load_secrets() -> dict[str, str]:
    found: dict[str, str] = {}
    for line in (system.read(system.ALERT_SECRETS_FILE) or "").splitlines():
        key, sep, value = line.partition("=")
        if sep and key in SECRET_KEYS and value:
            found[key] = value
    return found


def save_secret(key: str, value: str) -> None:
    if key not in SECRET_KEYS:
        raise ValueError("no such secret")
    value = value.strip()
    if key == "SMTP_PASSWORD":
        value = value.replace(" ", "")  # mail providers show app passwords in groups of four; the spaces are not part of it
    if not value or len(value) > 256 or any(not ch.isprintable() or ch.isspace() for ch in value):
        raise ValueError("a password or token is one line with no spaces")
    if key == "TELEGRAM_BOT_TOKEN" and not _TELEGRAM_TOKEN.match(value):
        raise ValueError("that does not look like a Telegram bot token (numbers, a colon, then letters and digits)")
    found = load_secrets()
    found[key] = value
    body = "# Written by `ludoractl alerts secret`. Read by root and by the sentinel, which sends the alerts.\n"
    body += "".join(f"{k}={found[k]}\n" for k in SECRET_KEYS if k in found)
    system.write_atomic(system.ALERT_SECRETS_FILE, body, 0o640, group=system.SENTINEL_GROUP)


def recipients(cfg: dict[str, Any], audience: str) -> list[str]:
    return list(cfg[AUDIENCES[audience][0]])


def problems(cfg: dict[str, Any], secrets: dict[str, str] | None = None) -> list[str]:
    """Why an alert the settings ask for could not be sent. Empty means every recipient can be reached in principle."""
    secrets = load_secrets() if secrets is None else secrets
    everyone = [r for audience in AUDIENCES for r in recipients(cfg, audience)]
    out: list[str] = []
    if any("@" in r and ":" not in r for r in everyone):
        if not cfg["SMTP_HOST"]:
            out.append("Email recipients are set but SMTP_HOST is not: no mail server to send through.")
        elif not cfg["SMTP_FROM"]:
            out.append("SMTP_FROM is not set: mail needs an address to come from.")
        elif cfg["SMTP_USER"] and "SMTP_PASSWORD" not in secrets:
            out.append("The mail account has no password yet: run `ludoractl alerts secret smtp-password`.")
    if any(r.startswith("telegram:") for r in everyone) and "TELEGRAM_BOT_TOKEN" not in secrets:
        out.append("Telegram recipients are set but the bot has no token yet: run `ludoractl alerts secret telegram-token`.")
    return out


def compose(alert: Alert, cfg: dict[str, Any], now: float | None = None) -> tuple[str, str]:
    """The subject line and the full text. Written to be understood by someone who does not know the server."""
    now = time.time() if now is None else now
    server = cfg["SERVER_NAME"]
    label = AUDIENCES[alert.audience][1]
    subject = clean(f"[Ludora OS {server}] {label}: {alert.title}", 160)
    lines = [clean(alert.title, 200), ""]
    if alert.what:
        lines += [clean(alert.what, 600), ""]
    if alert.facts:
        lines += ["Details:"] + [f"  - {clean(fact, 300)}" for fact in alert.facts[:40]]
        if len(alert.facts) > 40:
            lines.append(f"  - and {len(alert.facts) - 40} more: see `ludoractl events`")
        lines.append("")
    for heading, meaning, todo in alert.explain[:6]:
        lines += [clean(heading, 80) + ". " + clean(meaning, 500), "  What to do: " + clean(todo, 600), ""]
    if alert.did:
        lines += ["What the server did: " + clean(alert.did, 500), ""]
    if alert.todo:
        lines += ["What to do: " + clean(alert.todo, 700), ""]
    site = f"https://{cfg['DOMAIN']}" if cfg["DOMAIN"] else "not set"
    lines += [
        f"Server: {server} ({site})",
        "When: " + time.strftime("%A %d %B %Y, %H:%M %Z", time.localtime(now)),
        "More: sign in at the server and type `ludora`, or run `ludoractl events`.",
    ]
    return subject, "\n".join(lines) + "\n"


def _ssl_context() -> ssl.SSLContext:
    context = ssl.create_default_context()
    context.minimum_version = ssl.TLSVersion.TLSv1_2
    return context


def _send_mail(cfg: dict[str, Any], secrets: dict[str, str], to: list[str], subject: str, body: str) -> None:
    message = EmailMessage()
    message["Subject"] = subject
    message["From"] = f"Ludora OS <{cfg['SMTP_FROM']}>"
    message["To"] = ", ".join(to)
    message["Date"] = formatdate(localtime=True)
    message["Message-ID"] = make_msgid(domain=cfg["SMTP_FROM"].split("@")[-1])
    message["Auto-Submitted"] = "auto-generated"
    message.set_content(body)
    host, port = cfg["SMTP_HOST"], cfg["SMTP_PORT"]
    if cfg["SMTP_SECURITY"] == "tls":
        server: smtplib.SMTP = smtplib.SMTP_SSL(host, port, timeout=TIMEOUT, context=_ssl_context())
    else:
        server = smtplib.SMTP(host, port, timeout=TIMEOUT)
    try:
        if cfg["SMTP_SECURITY"] != "tls":
            server.starttls(context=_ssl_context())  # raises if the server offers no encryption: never sent in the clear
        if cfg["SMTP_USER"]:
            server.login(cfg["SMTP_USER"], secrets.get("SMTP_PASSWORD", ""))
        server.send_message(message, from_addr=cfg["SMTP_FROM"], to_addrs=to)
    finally:
        try:
            server.quit()
        except (smtplib.SMTPException, OSError):
            pass


def _post(url: str, data: bytes, headers: dict[str, str]) -> None:
    if not url.startswith("https://"):
        raise ValueError("https only")
    request = urllib.request.Request(url, data=data, headers={"User-Agent": "ludora-os", **headers}, method="POST")
    with urllib.request.urlopen(request, timeout=TIMEOUT, context=_ssl_context()) as response:  # noqa: S310 - https only, checked above
        response.read(400)


def _send_ntfy(cfg: dict[str, Any], topic: str, alert: Alert, subject: str, body: str) -> None:
    # The topic name is the only thing that keeps a public ntfy server's messages private: it is made long and random.
    headers = {"Title": subject.encode("ascii", "replace").decode(), "Priority": "urgent" if alert.urgent else "default",
               "Tags": {"security": "rotating_light", "upkeep": "wrench", "cheat": "eyes"}[alert.audience], "Content-Type": "text/plain; charset=utf-8"}
    _post(f"{cfg['NTFY_SERVER'].rstrip('/')}/{topic}", body.encode("utf-8")[:3800], headers)


def _send_telegram(secrets: dict[str, str], chat: str, subject: str, body: str) -> None:
    payload = {"chat_id": chat, "text": (subject + "\n\n" + body)[:4000], "disable_web_page_preview": True}
    _post(f"https://api.telegram.org/bot{secrets['TELEGRAM_BOT_TOKEN']}/sendMessage", json.dumps(payload).encode(), {"Content-Type": "application/json"})


def _reason(err: BaseException, secrets: dict[str, str]) -> str:
    text = clean(f"{type(err).__name__}: {err}", 200)
    for secret in secrets.values():   # a bot token is part of the address it is sent to: never let it into a log
        text = text.replace(secret, "(hidden)")
    return text


def deliver(alert: Alert, cfg: dict[str, Any], *, secrets: dict[str, str] | None = None, now: float | None = None) -> list[tuple[str, bool, str]]:
    """Send one alert to everyone on its audience's list. Returns (recipient, delivered, reason if not)."""
    secrets = load_secrets() if secrets is None else secrets
    to = recipients(cfg, alert.audience)
    if not to:
        return []
    subject, body = compose(alert, cfg, now)
    results: list[tuple[str, bool, str]] = []
    mail = [r for r in to if ":" not in r]
    if mail:
        try:
            if not cfg["SMTP_HOST"] or not cfg["SMTP_FROM"]:
                raise ValueError("no mail server is set (SMTP_HOST and SMTP_FROM)")
            _send_mail(cfg, secrets, mail, subject, body)
            results += [(r, True, "") for r in mail]
        except (smtplib.SMTPException, OSError, ValueError) as err:
            results += [(r, False, _reason(err, secrets)) for r in mail]
    for r in to:
        kind, _, rest = r.partition(":")
        if ":" not in r:
            continue
        try:
            if kind == "ntfy":
                _send_ntfy(cfg, rest, alert, subject, body)
            elif kind == "telegram":
                if "TELEGRAM_BOT_TOKEN" not in secrets:
                    raise ValueError("the Telegram bot has no token yet")
                _send_telegram(secrets, rest, subject, body)
            results.append((r, True, ""))
        except (urllib.error.URLError, OSError, ValueError) as err:
            results.append((r, False, _reason(err, secrets)))
    return results


def hide(recipient: str) -> str:
    """A recipient as it may appear in a log that more people can read than may know it."""
    if ":" in recipient:
        kind, _, rest = recipient.partition(":")
        return f"{kind}:{rest[:3]}…"
    name, _, domain = recipient.partition("@")
    return f"{name[:2]}…@{domain}"


def summary(results: list[tuple[str, bool, str]]) -> str:
    if not results:
        return "nobody is on that list"
    sent = [hide(r) for r, ok, _ in results if ok]
    failed = [f"{hide(r)} ({why})" for r, ok, why in results if not ok]
    parts = []
    if sent:
        parts.append("sent to " + ", ".join(sent))
    if failed:
        parts.append("NOT delivered to " + ", ".join(failed))
    return "; ".join(parts)


def from_events(events: list[dict[str, Any]], cfg: dict[str, Any]) -> Alert | None:
    """One security alert for a batch of sentinel events: the most serious first, each kind explained once."""
    events = [e for e in events if e.get("severity") in ("alert", "warning", "notice")]
    if not events:
        return None
    urgent = any(e.get("severity") == "alert" for e in events)
    bans = [e for e in events if "minutes" in e and e.get("ip")]
    order = {"alert": 0, "warning": 1, "notice": 2}
    events = sorted(events, key=lambda e: (order.get(e.get("severity"), 3), e.get("at", 0)))
    first = events[0]
    kinds: list[str] = []
    for e in events:
        if e.get("kind") in ADVICE and e["kind"] not in kinds:
            kinds.append(e["kind"])
    if len(events) == 1:
        title = clean(first.get("text", "Something needs a look"), 120)
    elif bans and len(bans) == len(events):
        addresses = sorted({e["ip"] for e in bans})
        title = f"{len(addresses)} address{'es' if len(addresses) != 1 else ''} banned in the last few minutes"
    else:
        lead = clean(first.get("text", ""), 60) if first.get("kind") in ("level", "shield") else LABEL.get(first.get("kind"), "Several events")
        title = f"{lead} (and {len(events) - 1} more event{'s' if len(events) != 2 else ''})"
    facts = [time.strftime("%H:%M:%S", time.localtime(e.get("at", 0))) + "  " + clean(e.get("text", ""), 240) for e in events]
    what = todo = ""
    explain: list[tuple[str, str, str]] = []
    if len(kinds) == 1:
        what, todo = ADVICE[kinds[0]]
    else:
        explain = [(LABEL.get(k, k), ADVICE[k][0], ADVICE[k][1]) for k in kinds]
    did = ""
    if bans:
        longest = max(int(e.get("minutes", 0)) for e in bans)
        did = f"Refused {len({e['ip'] for e in bans})} address{'es' if len({e['ip'] for e in bans}) != 1 else ''} for up to {longest} minutes. Staff addresses are never refused."
    return Alert("security", title, what=what, did=did, todo=todo, facts=facts, urgent=urgent, explain=explain)


CHEAT_KINDS = {
    "too_fast": "answered correctly faster than a person can read the question, more than once",
    "illegal_moves": "sent moves the game does not allow, which the ordinary game screen cannot send",
    "one_device_many_players": "is one device playing as several players",
}


def from_integrity(records: list[dict[str, Any]]) -> Alert | None:
    """One fair-play alert for the signals Ludora raised in one game. Names in it were typed by players."""
    records = [r for r in records if r.get("kind") in CHEAT_KINDS]
    if not records:
        return None
    room = clean(records[0].get("room", "?"), 12)
    mode = clean(records[0].get("mode", ""), 40)
    facts = []
    for r in records[:20]:
        count = r.get("count")
        facts.append(f"A player calling themselves \"{clean(r.get('player', '?'), 40)}\" {CHEAT_KINDS[r['kind']]}"
                     + (f" ({int(count)} times)" if isinstance(count, int) and r["kind"] != "one_device_many_players" else "")
                     + (f" ({int(count)} players)" if isinstance(count, int) and r["kind"] == "one_device_many_players" else "") + ".")
    title = f"Possible cheating in game {room}" + (f" ({mode})" if mode else "")
    return Alert(
        "cheat", title,
        what="Ludora noticed play that a person at the ordinary game screen could not produce. This is a signal, not proof: a very fast guess or a shared computer can look the same.",
        did="Nothing. Ludora never punishes or slows a player by itself, and the players were not told.",
        todo="Have a quiet look at who was playing under those names. The names are whatever the players typed, so a name alone does not identify anyone.",
        facts=facts,
    )


class Outbox:
    """Saves up what there is to tell and decides when to send it, so a burst of bans is one message, not fifty.

    Something urgent goes within a minute. Anything else waits `settle` seconds for its companions, and after a
    message has gone the next one waits out the quiet period."""

    def __init__(self, quiet: float, settle: float = 60, cap: int = 200):
        self.quiet, self.settle, self.cap = quiet, settle, cap
        self.items: list[dict[str, Any]] = []
        self.first_at = 0.0
        self.urgent = False
        self.last_sent = float("-inf")
        self.dropped = 0

    def add(self, item: dict[str, Any], now: float, urgent: bool = False) -> None:
        if not self.items:
            self.first_at = now
        if len(self.items) >= self.cap:   # under a storm the count matters, not every line
            self.dropped += 1
        else:
            self.items.append(item)
        self.urgent = self.urgent or urgent

    def take(self, now: float) -> list[dict[str, Any]] | None:
        if not self.items:
            return None
        if self.urgent:
            ready = now - self.last_sent >= 60
        else:
            ready = now - self.first_at >= self.settle and now - self.last_sent >= self.quiet
        if not ready:
            return None
        items, self.items, self.urgent, self.last_sent = self.items, [], False, now
        if self.dropped:
            items.append({"at": int(now), "severity": "warning", "kind": "sentinel", "text": f"{self.dropped} more events were not listed here: see `ludoractl events`."})
            self.dropped = 0
        return items
