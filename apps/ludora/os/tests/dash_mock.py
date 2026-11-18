#!/usr/bin/env python3
"""A stand-in for the Ludora OS staff dashboard service, so the screen can be run without a server.

It serves the three static files with the same Content-Security-Policy and headers the real service
(ludora_os/dash.py) sends, and answers the dashboard's JSON API with the same shapes, checks and sentences
as the real service and its root helper (ludora_os/dashops.py), from canned data that changes a little over
time. Nothing here touches the machine it runs on: every "action" only changes this process's memory.
Standard library only.

    python3 apps/ludora/os/tests/dash_mock.py

Then open http://127.0.0.1:8788/ and sign in with the password it prints.

Environment:
    DASH_MOCK_SCENARIO      calm (default), watchful, or attack
    DASH_MOCK_HOSTILE       1: attacker-chosen text everywhere (markup, very long strings, right-to-left
                            overrides) in events, ban addresses, the server's name, checks and log lines,
                            sent raw (the real server would already have replaced the control characters)
    DASH_MOCK_PORT          8788
    DASH_MOCK_PASSWORD      correct horse battery
    DASH_MOCK_CODE          1: also ask for an authenticator code (it is 123456)
    DASH_MOCK_IDLE_MINUTES  15
    DASH_MOCK_DELAY         seconds an ordinary action takes, default 1.5 (so the working spinner shows)
    DASH_MOCK_SITE_WAIT     seconds a change of the site's name or certificate takes, default 8 (the real
                            server takes up to about 70). Like the real one it answers at once with
                            "moving", then stops answering and signs everyone out. If the change holds,
                            this address answers every API call with 421 from then on (the dashboard
                            lives at the new name now; restart the mock to carry on). If it does not,
                            the old settings come back and the overview's "last_change" says why.
    A proxy restart answers at once with "moving" too and stops answering for three seconds; sessions
    survive it, as they do on the real server (only the proxy restarts).
    DASH_MOCK_PAUSE         seconds sign-in stays paused after five wrong tries, default 900

DNS check and the site's name: names starting play. reach this server from the internet, ludora. or
intranet. only from inside the school, old. point at another machine; anything else does not exist.
A name starting old. is refused at once (it points at another machine); a public certificate for an
inside-only name is applied and then undone, as the real server does when the site stops answering.
"""

from __future__ import annotations

import json
import math
import os
import random
import re
import secrets
import sys
import threading
import time
from http import cookies
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import urlparse

DASH = Path(__file__).resolve().parent.parent / "rootfs" / "usr" / "share" / "ludora-os" / "dash"
STATIC = {"/": ("index.html", "text/html; charset=utf-8"), "/dash.css": ("dash.css", "text/css; charset=utf-8"),
          "/dash.js": ("dash.js", "text/javascript; charset=utf-8")}
CSP = ("default-src 'none'; script-src 'self'; style-src 'self'; img-src 'self' data:; connect-src 'self'; "
       "base-uri 'none'; form-action 'none'; frame-ancestors 'none'")

SCENARIO = os.environ.get("DASH_MOCK_SCENARIO", "calm").strip().lower()
if SCENARIO not in ("calm", "watchful", "attack"):
    sys.exit("DASH_MOCK_SCENARIO must be calm, watchful or attack")
HOSTILE_ON = os.environ.get("DASH_MOCK_HOSTILE", "") not in ("", "0")
PORT = int(os.environ.get("DASH_MOCK_PORT", "8788"))
PASSWORD = os.environ.get("DASH_MOCK_PASSWORD", "correct horse battery")
NEEDS_CODE = os.environ.get("DASH_MOCK_CODE", "") not in ("", "0")
CODE = "123456"
IDLE_MINUTES = int(os.environ.get("DASH_MOCK_IDLE_MINUTES", "15"))
DELAY = float(os.environ.get("DASH_MOCK_DELAY", "1.5"))
SITE_WAIT = float(os.environ.get("DASH_MOCK_SITE_WAIT", "8"))
PAUSE = int(os.environ.get("DASH_MOCK_PAUSE", "900"))
DASH_PORT = 8443
TRIES, WINDOW = 5, 15 * 60

RLO, PDF = "‮", "‬"
LONG = "a" * 40 + "-" + "unbrokenwordwithoutanyspaceatall" * 12
HOSTILE_TEXTS = [
    '<img src=x onerror=alert(1)> asked for /"><script>alert(document.cookie)</script>',
    f"Game R2MD: a player calling themselves \"{RLO}gnp.exe{PDF} teacher\" sent messages the game's own screens never send.",
    "10.20.3.52 tried to sign in as " + LONG + " 20 times in five minutes.",
    "javascript:alert(1) &lt;b&gt;not bold&lt;/b&gt; {{constructor.constructor('alert(1)')()}} ${alert(1)}",
]

SERVER = (f"ludora-{RLO}sllih{PDF}<img src=x onerror=alert(1)>" + "x" * 80) if HOSTILE_ON else "ludora-hills"
VERSION = "1.0.0"
ADDRESSES = ["10.20.0.5", "203.0.113.7"]
STAFF_NETS = ("10.20.9.",)
MAIL_KEYS = ("SMTP_HOST", "SMTP_PORT", "SMTP_SECURITY", "SMTP_USER")
MAIL_PORTS = (25, 465, 587, 2525)
ALERT_KEYS = ("ALERT_SECURITY_TO", "ALERT_UPKEEP_TO", "ALERT_CHEAT_TO")
AUDIENCES = {"security": ("ALERT_SECURITY_TO", "Security"), "upkeep": ("ALERT_UPKEEP_TO", "Upkeep"), "cheat": ("ALERT_CHEAT_TO", "Fair play")}
MASK = "****"

LABEL = r"[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?"
FQDN = re.compile(rf"^(?=.{{1,253}}$){LABEL}(?:\.{LABEL})*$")
IPV4 = re.compile(r"^(25[0-5]|2[0-4]\d|1?\d?\d)(\.(25[0-5]|2[0-4]\d|1?\d?\d)){3}$")
MAIL = re.compile(r"^[A-Za-z0-9._+-]{1,64}@(?=.{1,253}$)[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?(?:\.[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?)+$")
NTFY_TOPIC = re.compile(r"^[A-Za-z0-9_-]{8,64}$")
TELEGRAM_CHAT = re.compile(r"^-?[0-9]{5,20}$")
TELEGRAM_TOKEN = re.compile(r"^[0-9]{6,12}:[A-Za-z0-9_-]{30,50}$")
TEXT_EXTRA = set(" .,'@:/_+()&-!?")

# Labels as dashops.SETTINGS has them; help as config.py has it.
SETTINGS = {
    "DOMAIN": ("The address people open", "The address people open: a name such as play.your-school.org, or the server's IPv4 address."),
    "TLS_MODE": ("Certificate", "public: a free certificate from Let's Encrypt (the name must be reachable from the internet). internal: the server's own certificate authority, for a school network. custom: your own certificate in /etc/ludora-os/tls."),
    "OPERATOR_NAME": ("Who runs this server", "Who runs this copy. Shown on the privacy policy."),
    "OPERATOR_CONTACT": ("Contact for privacy questions", "How people reach you about their data. Shown on the privacy policy."),
    "ALERT_SECURITY_TO": ("Told about attacks", "Who is told about attacks: bans, floods, impersonation, lockdown, support access. Email addresses, ntfy:<topic> or telegram:<chat number>, separated by commas."),
    "ALERT_UPKEEP_TO": ("Told when the server needs care", "Who is told when the server needs care: a failed backup or update, a self-check that starts failing, a full disk."),
    "ALERT_CHEAT_TO": ("Told about likely cheating", "Who is told when Ludora spots likely cheating in a game."),
    "ALERT_QUIET_MINUTES": ("Minutes between alert batches", "After an alert about bans, further ones are saved up and sent together after this many minutes."),
    "SMTP_HOST": ("Mail server", "The mail server that sends alert emails, e.g. smtp.gmail.com or the school's own. Needed for email recipients."),
    "SMTP_PORT": ("Mail server port", "Its port: 587 (the usual) or 465."),
    "SMTP_SECURITY": ("Mail encryption", "starttls for port 587, tls for port 465. Mail is never sent unencrypted."),
    "SMTP_USER": ("Mail account", "The account the server signs in to the mail server with. Its password is set with `ludoractl alerts secret smtp-password`."),
    "SMTP_FROM": ("Address alerts come from", "The address alerts come from. Usually the same as the account."),
    "NTFY_SERVER": ("Phone push server", "The ntfy server for phone pushes. ntfy.sh is free and public; a school can run its own."),
}
PRESETS = [
    {"id": "google", "label": "Google Workspace or Gmail", "host": "smtp.gmail.com", "port": 587, "security": "starttls",
     "note": "Use the account's address, and an app password made in the Google account's security settings (not its normal password)."},
    {"id": "microsoft", "label": "Microsoft 365 or Outlook", "host": "smtp.office365.com", "port": 587, "security": "starttls",
     "note": "The account must be allowed to send with SMTP (\"authenticated SMTP\"), which your Microsoft 365 administrator switches on per mailbox."},
    {"id": "other", "label": "Another mail server", "host": "", "port": 587, "security": "starttls",
     "note": "Ask whoever runs the school's email for the server name, port, account and password."},
]

CHECKS = [
    "SELinux is enforcing|Enforcing",
    "The firewall is loaded and refuses by default|the ludora table's input chain drops what it does not know",
    "The root account cannot sign in|locked",
    "No account has an empty password|none",
    "SSH matches the settings|SSH is off; the server is managed from its own screen",
    "Nothing unexpected is listening|only the decoy ports and what the settings allow",
    "Kernel hardening settings are in effect|31 settings checked",
    "The disk is encrypted|a LUKS volume is in use",
    "The clock is synchronised|in step with a time server",
    "Operating system updates are installed|nothing waiting",
    "Ludora answers its health check|healthy",
    "The sentinel is watching|last report 4s ago",
    "A backup was made in the last day and a half|newest is 5 hours old; 7 kept",
    "There is room on the disk|/var is 41% full",
    "Generated files match the settings|no file was changed outside ludoractl",
    "Every set-uid program came from a signed package|14 programs, all from packages",
    "The boot menu needs a password to edit|set",
    "Container images are pinned to exact versions|database and proxy pinned by digest",
    "System files are unchanged since the last baseline|no change in 48,112 files",
    "Security auditing is recording|running",
    "USB devices are restricted|running",
]

HOSTILE = [
    '10.20.3.41 asked for /<script>alert("dash")</script> and 2 other pages that only other software has. Banned for 15 min.',
    'Game K7QX: a player calling themselves "<img src=x onerror=alert(1)>" answered five questions faster than a person can.',
    'Game R2MD: a player calling themselves " gnp.exe  teacher" sent messages the game\'s own screens never send.',
    "10.20.3.52 tried to sign in to Ludora as \"admin'--\" 20 times in five minutes. Banned for 60 min.",
]


def clean(text: object, limit: int = 300) -> str:
    """What alerts.clean does on the real server: one line of printable text."""
    if HOSTILE_ON:
        return str(text)          # hostile mode sends it raw, to prove the page copes on its own
    out = "".join(ch if ch.isprintable() else " " for ch in str(text))
    out = " ".join(out.split())
    return out if len(out) <= limit else out[: limit - 3].rstrip() + "..."


def split(value: str) -> list[str]:
    return [part for part in re.split(r"[,\s]+", value.strip()) if part]


def mask(recipient: str) -> str:
    kind, sep, rest = recipient.partition(":")
    return f"ntfy:{rest[:4]}{MASK}" if sep and kind == "ntfy" else recipient


def hide(recipient: str) -> str:
    if ":" in recipient:
        kind, _, rest = recipient.partition(":")
        return f"{kind}:{rest[:3]}…"
    name, _, domain = recipient.partition("@")
    return f"{name[:2]}…@{domain}"


class Refused(Exception):
    """Shown to the person as it is, like dashops.Refused."""


class World:
    """Everything the pretend server knows. One lock; the handler threads share it."""

    def __init__(self) -> None:
        self.lock = threading.Lock()
        self.change_lock = threading.Lock()     # one change at a time, like dashops._locked
        self.rng = random.Random(7)
        self.sessions: dict[str, dict[str, float]] = {}
        self.failures: dict[str, list[float]] = {}
        self.paused: dict[str, float] = {}
        self.settings: dict[str, str] = {
            "DOMAIN": "10.20.0.5", "TLS_MODE": "internal",
            "OPERATOR_NAME": "Hills Grammar School", "OPERATOR_CONTACT": "privacy@hills.example",
            "ALERT_SECURITY_TO": "it@hills.example,ntfy:ludora-k3j9x2m8q7wz", "ALERT_UPKEEP_TO": "it@hills.example", "ALERT_CHEAT_TO": "",
            "ALERT_QUIET_MINUTES": "10",
            "SMTP_HOST": "", "SMTP_PORT": "587", "SMTP_SECURITY": "starttls", "SMTP_USER": "", "SMTP_FROM": "",
            "NTFY_SERVER": "https://ntfy.sh",
        }
        if HOSTILE_ON:
            self.settings["OPERATOR_NAME"] = f"{RLO}loohcS{PDF} <img src=x onerror=alert(1)>"
        self.secrets = {"smtp_password": False, "telegram_token": False}
        self.shield_mode = "auto"
        self.lockdown = False
        self.bans: dict[str, float] = {}
        self.events: list[dict] = []
        self.doctor_at = time.time() - 17 * 60
        self.backups = 7
        self.backup_at = time.time() - 5.2 * 3600
        self.support: dict | None = None
        self.analyst = {"enabled": False, "installed": False}
        self.last_event = time.time()
        self.next_host = 60
        self.last_change: dict | None = None
        self.outage = (0.0, 0.0)          # (from, until): the proxy is restarting, the API does not answer
        self.moved = False                # the web service now answers only to the new name
        self._seed(time.time())

    # ---- history the screen opens on

    def _seed(self, now: float) -> None:
        def add(ago: float, severity: str, kind: str, text: str) -> None:
            self.events.append({"at": int(now - ago), "severity": severity, "kind": kind, "text": text})

        add(26 * 3600, "info", "sentinel", "Sentinel started. Watching 9 decoy listeners, SSH and the web log.")
        add(22 * 3600, "info", "backup", "Nightly backup made and encrypted (212 MB). 7 kept.")
        add(9 * 3600, "warning", "decoy", "10.20.3.17 connected to decoy port 3389. Banned for 15 min.")
        add(9 * 3600 - 900, "info", "ban", "10.20.3.17 is let back in: its 15 minutes are over.")
        add(5.2 * 3600, "info", "backup", "Nightly backup made and encrypted (214 MB). 7 kept.")
        add(3 * 3600, "notice", "probe", "10.20.9.10 asked for /.env. Not banned: it is a staff address.")
        add(55 * 60, "notice", "integrity", HOSTILE[1])
        add(17 * 60, "info", "doctor", "Self-check: 21 passed, 0 failed, 1 could not be checked.")
        if SCENARIO == "watchful":
            add(6 * 60, "warning", "probe", HOSTILE[0])
            add(4 * 60, "warning", "login", HOSTILE[3])
            add(3 * 60, "notice", "level", "Threat level: watchful.")
            self.bans = {"10.20.3.41": now + 9 * 60, "10.20.3.52": now + 56 * 60}
        if SCENARIO == "attack":
            self.support = {"until": int(now + 100 * 60), "from": "203.0.113.50"}
            self.analyst = {"enabled": True, "installed": True}
            add(8 * 60, "warning", "probe", HOSTILE[0])
            add(7 * 60, "warning", "login", HOSTILE[3])
            add(6 * 60, "warning", "decoy", "10.20.3.44 connected to decoy port 445. Banned for 15 min.")
            add(5 * 60, "warning", "flood", "10.20.3.45 made 912 requests in ten seconds. Banned for 15 min.")
            add(4 * 60 + 30, "warning", "flood", "10.20.3.46 made 1,404 requests in ten seconds. Banned for 60 min.")
            add(4 * 60, "alert", "shield", "Shield raised: 5 addresses misbehaved within two minutes. Every limit is quartered for everyone outside the staff addresses.")
            add(3 * 60 + 40, "alert", "level", "Threat level: under attack.")
            add(3 * 60, "alert", "gateway", "The gateway 10.20.0.1 answered from a different device (hardware address changed). Someone may be pretending to be the gateway.")
            add(2 * 60, "notice", "integrity", HOSTILE[2])
            add(90, "info", "alert-delivery", "Security alert sent to 2 of 2 recipients.")
            for i, left in enumerate((9, 52, 7, 10, 55, 12, 13, 14, 236)):
                self.bans[f"10.20.3.{41 + i}"] = now + left * 60 + 20
        if HOSTILE_ON:
            for i, text in enumerate(HOSTILE_TEXTS):
                add(30 + i, ("alert", "warning", "notice", "info")[i], "integrity", text)
            self.bans['<img src=x onerror=alert(1)>'] = now + 600
            self.bans[f"10.20.{RLO}3.99{PDF}"] = now + 900
            self.bans["2001:db8:" + "ffff:" * 30] = now + 1200
            self.support = {"until": int(now + 3600), "from": f"<b>{RLO}05.311.0.302</b>"}

    # ---- time passing

    def advance(self) -> None:
        now = time.time()
        for ip in [ip for ip, until in self.bans.items() if until <= now]:
            del self.bans[ip]
            self._event(now, "info", "ban", f"{ip} is let back in: its ban is over.")
        gap = {"calm": 45, "watchful": 16, "attack": 5}[SCENARIO]
        if now - self.last_event < gap:
            return
        self.last_event = now
        pick = self.rng.random()
        if SCENARIO == "calm":
            self._event(now, "info", "sentinel", self.rng.choice([
                "All quiet: 0 bans, 0 refused sign-ins in the last hour.",
                "Game P4TT started with 24 players.",
                "Game P4TT ended. 24 players, no integrity signals.",
                "Certificate checked: 61 days left.",
            ]))
        elif SCENARIO == "watchful":
            if pick < 0.5:
                self._event(now, "notice", "probe", f"10.20.3.{self.rng.randint(60, 90)} asked for /wp-login.php. One more and it is banned.")
            else:
                self._event(now, "info", "sentinel", "Still watchful: the last ban was a few minutes ago.")
        else:
            self.next_host += 1
            ip = f"10.20.4.{self.next_host % 200 + 20}"
            if pick < 0.45 and len(self.bans) < 16:
                self.bans[ip] = now + self.rng.choice([15, 15, 60]) * 60
                self._event(now, "warning", "flood", f"{ip} made {self.rng.randint(640, 2400):,} requests in ten seconds. Banned for 15 min.")
            elif pick < 0.7:
                self._event(now, "warning", "decoy", f"{ip} connected to decoy port {self.rng.choice([23, 445, 3306, 3389, 5900])}. It is already refused.")
            elif pick < 0.82:
                self._event(now, "alert", "flood", f"{self.rng.randint(1100, 4200):,} connection attempts a second from made-up addresses. The extra ones are refused before they use any memory.")
            elif pick < 0.92:
                self._event(now, "notice", "integrity", self.rng.choice(HOSTILE[1:3]))
            else:
                self._event(now, "info", "alert-delivery", "Security alert sent to 2 of 2 recipients.")

    def _event(self, now: float, severity: str, kind: str, text: str) -> None:
        self.events.append({"at": int(now), "severity": severity, "kind": kind, "text": text})
        del self.events[:-400]

    def record(self, client: str, text: str, severity: str = "notice") -> None:
        self._event(time.time(), severity, "dashboard", f"Dashboard ({client}): {text}")

    # ---- readings (the shapes dashops.handle answers with, before dash.py adds nothing)

    def recipients(self, key: str) -> list[str]:
        return split(self.settings[key])

    def mail_problems(self) -> list[str]:
        everyone = [r for key in ALERT_KEYS for r in self.recipients(key)]
        out = []
        if any("@" in r and ":" not in r for r in everyone):
            if not self.settings["SMTP_HOST"]:
                out.append("Email recipients are set but SMTP_HOST is not: no mail server to send through.")
            elif not self.settings["SMTP_FROM"]:
                out.append("SMTP_FROM is not set: mail needs an address to come from.")
            elif self.settings["SMTP_USER"] and not self.secrets["smtp_password"]:
                out.append("The mail account has no password yet: run `ludoractl alerts secret smtp-password`.")
        return out

    def problems(self) -> list[str]:
        out = self.mail_problems()
        everyone = [r for key in ALERT_KEYS for r in self.recipients(key)]
        if any(r.startswith("telegram:") for r in everyone) and not self.secrets["telegram_token"]:
            out.append("A Telegram chat is listed but TELEGRAM_BOT_TOKEN is not set: run `ludoractl alerts secret telegram-token`.")
        return out

    def doctor(self) -> dict:
        checks = []
        for line in CHECKS:
            title, detail = line.split("|")
            checks.append({"state": "pass", "title": title, "detail": detail})
        age = (time.time() - self.backup_at) / 3600
        for check in checks:
            if check["title"].startswith("A backup was made"):
                check["detail"] = f"newest is {age:.0f} hours old; {self.backups} kept"
        checks.append({"state": "unknown", "title": "The certificate is valid for a while yet", "detail": "the site uses an address, not a name, so there is no public certificate to check"})
        if SCENARIO == "attack":
            checks.insert(3, {"state": "fail", "title": "The gateway is the device it was",
                              "detail": "the gateway 10.20.0.1 changed hardware address at 10:41; a device on the network may be pretending to be it. Check the network cupboard, and treat any certificate warning in a browser as real"})
        if HOSTILE_ON:
            checks.insert(0, {"state": "fail", "title": "<img src=x onerror=alert(1)>" + LONG, "detail": f"{RLO}detrevni{PDF} " + LONG})
        count = {state: sum(1 for c in checks if c["state"] == state) for state in ("pass", "fail", "unknown")}
        return {"at": int(self.doctor_at), "passed": count["pass"], "failed": count["fail"], "unknown": count["unknown"],
                "checks": [{k: clean(v, 600) if k != "state" else v for k, v in c.items()} for c in checks]}

    def overview(self) -> dict:
        now = time.time()
        report = self.doctor()
        attention = []
        if (now - self.backup_at) / 3600 > 36:
            attention.append("no recent backup")
        if SCENARIO == "attack":
            attention.append("under attack")
        if report["failed"]:
            attention.append(f"{report['failed']} self-check{'s' if report['failed'] != 1 else ''} failing")
        if self.lockdown:
            attention.append("lockdown is on")
        wobble = 0.5 + 0.5 * math.sin(now / 7.0)
        busy = {"calm": 1.0, "watchful": 1.6, "attack": 30.0}[SCENARIO]
        rates = {
            "web requests": round((38 + 30 * wobble) * busy + self.rng.random() * 6, 1),
            "new connections": round((6 + 5 * wobble) * busy + self.rng.random() * 2, 1),
            "refused at the firewall": round({"calm": 0.2, "watchful": 4.0, "attack": 1900.0}[SCENARIO] * (0.6 + wobble), 1),
            "decoy port touches": round({"calm": 0.0, "watchful": 0.1, "attack": 3.4}[SCENARIO] * (0.5 + wobble), 1),
        }
        level = {"calm": 0, "watchful": 1, "attack": 2}[SCENARIO]
        domain = self.settings["DOMAIN"]
        return {
            "server": SERVER, "address": ", ".join(ADDRESSES), "site": f"https://{domain}" if domain else "", "version": VERSION,
            "time": int(now), "state": "attention" if attention else "ok", "attention": attention,
            "services": {"database": "active", "app": "active", "proxy": "active", "sentinel": "active", "firewall": "active",
                         "ssh": "active" if self.support else "inactive", "usb guard": "active", "auditing": "active"},
            "threat": {"level": level, "name": ("calm", "watchful", "under attack")[level], "known": os.environ.get("DASH_MOCK_BLIND") != "1"},
            "shield": {"up": self.shield_mode == "on" or (self.shield_mode == "auto" and SCENARIO == "attack"), "mode": self.shield_mode},
            "lockdown": self.lockdown,
            "bans": [{"ip": ip, "seconds_left": int(until - now)} for ip, until in sorted(self.bans.items())],
            "doctor": {k: report[k] for k in ("at", "passed", "failed", "unknown")},
            "backups": {"count": self.backups, "newest_hours": round((now - self.backup_at) / 3600, 2)},
            "support": self.support, "analyst": self.analyst, "rates": rates,
            "last_change": self.last_change if self.last_change and now - self.last_change["at"] < 24 * 3600 else None,
        }

    def settings_view(self) -> dict:
        values = {k: (",".join(mask(r) for r in split(v)) if k in ALERT_KEYS else v) for k, v in self.settings.items()}
        return {"settings": {k: {"value": values[k], "label": SETTINGS[k][0], "help": SETTINGS[k][1]} for k in SETTINGS},
                "secrets": dict(self.secrets)}

    def setup(self) -> dict:
        domain = self.settings["DOMAIN"]
        is_name = bool(domain) and not domain.replace(".", "").isdigit()
        mail_ok = bool(self.settings["SMTP_HOST"] and self.settings["SMTP_FROM"]) and not self.mail_problems()
        lists = {a: [mask(r) for r in self.recipients(key)] for a, (key, _) in AUDIENCES.items()}
        return {
            "domain": {"current": domain, "server_addresses": ADDRESSES, "tls_mode": self.settings["TLS_MODE"], "is_name": is_name},
            "email": {"configured": mail_ok, "problems": self.mail_problems(), "presets": PRESETS},
            "alerts": {**lists, "problems": self.problems()},
            "done": {"domain": is_name, "email": mail_ok, "alerts": bool(lists["security"])},
        }

    def logs(self, what: object, lines: object) -> dict:
        if what not in ("app", "db", "proxy", "sentinel"):
            raise Refused("Choose the app, the database, the proxy or the sentinel.")
        if not isinstance(lines, int) or not 1 <= lines <= 200:
            raise Refused("Between 1 and 200 lines.")
        now = time.time()
        stamp = lambda ago: time.strftime("%Y-%m-%dT%H:%M:%S%z", time.localtime(now - ago))
        if what == "app":
            pool = ['{"level":"info","msg":"request","method":"GET","path":"/api/rooms/K7QX","status":200,"ms":4}',
                    '{"level":"info","msg":"ws join","room":"K7QX","players":24}',
                    '{"level":"warn","ludora_event":"integrity","kind":"too_fast","room":"K7QX","player":"<img src=x onerror=alert(1)>"}',
                    '{"level":"info","msg":"request","method":"POST","path":"/api/auth/sign-in","status":401,"ms":88}',
                    '{"level":"info","msg":"health","db":"ok","uptime_s":93544}']
        elif what == "db":
            pool = ["LOG:  checkpoint starting: time", "LOG:  checkpoint complete: wrote 41 buffers (0.3%); write=4.012 s",
                    "LOG:  connection authorized: user=ludora database=ludora", "LOG:  automatic vacuum of table \"ludora.public.answers\": index scans: 0"]
        elif what == "proxy":
            pool = ['{"ts":%d,"request":{"remote_ip":"10.20.3.41","method":"GET","uri":"/<script>alert(1)</script>"},"status":404}' % now,
                    '{"ts":%d,"request":{"remote_ip":"10.20.3.52","method":"POST","uri":"/api/auth/sign-in"},"status":401}' % now,
                    '{"ts":%d,"request":{"remote_ip":"10.20.5.12","method":"GET","uri":"/play/K7QX"},"status":200}' % now,
                    '{"ts":%d,"request":{"remote_ip":"10.20.3.44","method":"GET","uri":"/.env"},"status":404}' % now]
        else:
            pool = ["sentinel: watching 9 decoy listeners, SSH and the web log",
                    "sentinel: 10.20.3.41 probe count 3/3 in 300s -> ban 15 min",
                    "sentinel: 10.20.9.10 touched decoy 3389; staff address, recorded only",
                    "sentinel: level calm -> watchful (2 bans in 600s)",
                    f"sentinel: {RLO}detrevni si enil siht{PDF} player-chosen text kept as data",
                    "sentinel: status written; 0 errors"]
        if HOSTILE_ON:
            pool = pool + ["\t" + LONG + " <img src=x onerror=alert(1)>", f"{RLO}<script>alert(1)</script>{PDF}" + "\x1b[31mred\x1b[0m"]
        unit = {"app": "ludora-app", "db": "ludora-db", "proxy": "ludora-proxy", "sentinel": "ludora-sentinel"}[what]
        return {"lines": [clean(f"{stamp((lines - i) * 7)} ludora {unit}[{1200 + i % 7}]: {pool[i % len(pool)]}", 600) for i in range(lines)]}

    def dns_check(self, name: object) -> dict:
        if not isinstance(name, str):
            raise Refused("That was not understood.")
        name = name.strip().lower().rstrip(".")
        if not name or "." not in name or not FQDN.match(name) or name.replace(".", "").isdigit():
            raise Refused("Give a name such as play.your-school.org.")
        first = name.split(".")[0]
        found = {"play": [ADDRESSES[1]], "ludora": [ADDRESSES[0]], "intranet": [ADDRESSES[0]], "old": ["198.51.100.9"]}.get(first, [])
        mine = ADDRESSES
        matches = bool(found) and any(a in mine for a in found)
        public = True   # one of this server's own addresses is a public one
        if not found:
            advice = f"{name} does not exist yet, or the change has not spread. Ask whoever manages the school's domain for an A record for {name} pointing to this server, then check again in a few minutes."
        elif matches:
            advice = f"{name} points to this server. You can use it as the address now."
        else:
            advice = f"{name} points to {', '.join(found)}, not to this server ({', '.join(mine)}). The record needs changing."
        return {"name": name, "resolves_to": found, "server_addresses": mine, "matches": matches, "public": public, "advice": advice}

    # ---- changes (dashops._apply_changes)

    def change(self, changes: object, client: str) -> str:
        if not isinstance(changes, dict) or not changes or len(changes) > len(SETTINGS):
            raise Refused("Nothing to change.")
        before = dict(self.settings)
        cfg = dict(self.settings)
        for key, value in changes.items():
            if key not in SETTINGS:
                raise Refused(f"{clean(key, 40)} cannot be changed from the dashboard.")
            label = SETTINGS[key][0]
            if not isinstance(value, str) or len(value) > 2000:
                raise Refused(f"{label}: that value was not understood.")
            try:
                cfg[key] = self._check(key, value, before)
            except ValueError as err:
                raise Refused(f"{label}: {err}") from None
        if cfg["TLS_MODE"] == "public" and (not cfg["DOMAIN"] or cfg["DOMAIN"].replace(".", "").isdigit() or "." not in cfg["DOMAIN"]):
            raise Refused("TLS_MODE=public needs DOMAIN to be a full name such as play.your-school.org, not an address.")
        changed = [k for k in SETTINGS if cfg[k] != before[k]]
        if not changed:
            return {"message": "Nothing needed changing."}
        if "SMTP_PORT" in changed and int(cfg["SMTP_PORT"]) not in MAIL_PORTS:
            raise Refused("Mail server port: from the dashboard this can be 587, 465, 25 or 2525. Any other port is set at the server itself.")
        if cfg["TLS_MODE"] == "custom":
            raise Refused("Certificate: your own certificate has to be put on the server first, as /etc/ludora-os/tls/site.crt and site.key.")
        if "DOMAIN" in changed or "TLS_MODE" in changed:
            self._reachable(cfg["DOMAIN"])
            # The proxy restarts for this, which cuts the request off: answer first, change afterwards.
            threading.Thread(target=self._move, args=(cfg, before, changed, client), daemon=True).start()
            to = f"https://{cfg['DOMAIN']}:{DASH_PORT}"
            return {"message": f"The server is changing its address or certificate now, which takes about a minute. Then open {to} and sign in again. "
                               "If the site does not answer there, the server puts the old settings back by itself, and this page works again and says why.",
                    "moving": {"to": to, "seconds": 90}}
        extra = ""
        if any(k in changed for k in MAIL_KEYS) and self.secrets["smtp_password"]:
            self.secrets["smtp_password"] = False
            extra = " The mail password was forgotten because the mail server changed: enter it again."
        with self.lock:
            self.settings = cfg
            self.record(client, "changed " + ", ".join(SETTINGS[k][0].lower() for k in changed) + ".")
        return {"message": "Saved and in effect: " + ", ".join(SETTINGS[k][0].lower() for k in changed) + "." + extra}

    def _reachable(self, name: str) -> None:
        """dashops._reachable_name: refuse a name that plainly cannot reach this server, before anything is touched."""
        if IPV4.match(name):
            if name not in ADDRESSES:
                raise Refused(f"The address people open: {name} is not one of this server's own addresses ({', '.join(ADDRESSES)}).")
            return
        looked = self.dns_check(name)
        if not looked["resolves_to"]:
            raise Refused(f"The address people open: this server cannot find {name} in DNS yet. Use the Check button, and try again once the name exists. "
                          "A name that only some computers can look up is set at the server itself (`ludoractl set DOMAIN`).")
        if not looked["matches"] and looked["public"]:
            raise Refused(f"The address people open: {looked['advice']}")

    def _move(self, cfg: dict[str, str], before: dict[str, str], changed: list[str], client: str) -> None:
        """The change itself, after the answer has gone: the proxy restarts, then the site must answer again."""
        start = time.time()
        time.sleep(0.5)
        with self.lock:
            self.outage = (time.time(), time.time() + SITE_WAIT)
            self.sessions.clear()             # the dashboard's web service restarts: everyone is signed out
            self.settings = cfg
        time.sleep(SITE_WAIT)
        first = cfg["DOMAIN"].split(".")[0]
        breaks = cfg["TLS_MODE"] == "public" and first in ("ludora", "intranet")
        with self.lock:
            if breaks:
                self.settings = before
                self.last_change = {"at": int(time.time()), "ok": False, "message":
                                    "With that name and certificate the site stopped answering over HTTPS, so the change was undone. "
                                    "For a public certificate the name must reach this server from the internet on ports 80 and 443."}
                self.record(client, "a change to the site's address or certificate did not hold.", "warning")
            else:
                said = "Saved and in effect: " + ", ".join(SETTINGS[k][0].lower() for k in changed) + "."
                self.last_change = {"at": int(time.time()), "ok": True, "message": said}
                self.record(client, "changed " + ", ".join(SETTINGS[k][0].lower() for k in changed) + ".")
                self.moved = True

    def _check(self, key: str, value: str, before: dict[str, str]) -> str:
        v = value.strip()
        if key == "DOMAIN":
            v = v.lower().rstrip(".")
            if v and not IPV4.match(v) and (not FQDN.match(v) or v.replace(".", "").isdigit()):
                raise ValueError("give a name such as play.your-school.org, or an IPv4 address such as 10.20.0.5")
            return v
        if key == "TLS_MODE" or key == "SMTP_SECURITY":
            allowed = ("public", "internal", "custom") if key == "TLS_MODE" else ("starttls", "tls")
            if v not in allowed:
                raise ValueError("choose " + ", ".join(allowed[:-1]) + " or " + allowed[-1])
            return v
        if key in ("OPERATOR_NAME", "OPERATOR_CONTACT"):
            if len(v) > 120:
                raise ValueError("keep it under 120 characters")
            for ch in v:
                if not (ch.isalnum() or ch in TEXT_EXTRA):
                    raise ValueError(f"the character {ch!r} is not allowed here")
            return v
        if key in ALERT_KEYS:
            current = split(before[key])
            out: list[str] = []
            for part in split(v):
                if part.startswith("ntfy:") and part.endswith(MASK):
                    match = [c for c in current if c.startswith("ntfy:") and mask(c) == part]
                    if len(match) != 1:
                        raise Refused("A hidden phone-push topic could not be matched. Remove it and add the full topic again.")
                    part = match[0]
                kind, sep, rest = part.partition(":")
                ok = (not sep and MAIL.match(part)) or (sep and kind == "ntfy" and NTFY_TOPIC.match(rest)) or (sep and kind == "telegram" and TELEGRAM_CHAT.match(rest))
                if not ok:
                    raise ValueError(f"{part[:60]!r} is not an email address, ntfy:<topic of 8 or more letters and digits> or telegram:<chat number>")
                if part not in out:
                    out.append(part)
            return ",".join(out)
        if key in ("ALERT_QUIET_MINUTES", "SMTP_PORT"):
            low, high = (1, 1440) if key == "ALERT_QUIET_MINUTES" else (1, 65535)
            try:
                n = int(v)
            except ValueError:
                raise ValueError("give a whole number") from None
            if not low <= n <= high:
                raise ValueError(f"give a number from {low} to {high}")
            return str(n)
        if key == "SMTP_HOST":
            v = v.lower()
            if v and not FQDN.match(v):
                raise ValueError("give a host name such as smtp.your-school.org")
            return v
        if key == "SMTP_USER":
            if not re.fullmatch(r"[A-Za-z0-9._%+@-]{0,128}", v):
                raise ValueError("letters, digits and . _ % + @ - only")
            return v
        if key == "SMTP_FROM":
            if v and not MAIL.match(v):
                raise ValueError("give one email address")
            return v
        if key == "NTFY_SERVER":
            if v and not re.match(r"^https://[A-Za-z0-9.-]{1,253}(?::\d{1,5})?(/[A-Za-z0-9._~%/-]{0,400})?$", v):
                raise ValueError("give an https:// address with no spaces, user name or password")
            return v
        return v

    # ---- actions (dashops._action)

    def action(self, body: dict, client: str) -> dict:
        name = body.get("action")
        now = time.time()
        if name == "ban":
            ip = self._address(body.get("ip"))
            minutes = body.get("minutes", 60)
            if isinstance(minutes, bool) or not isinstance(minutes, int) or not 1 <= minutes <= 1440:
                raise Refused("A ban lasts from 1 minute to 24 hours.")
            if ip in ADDRESSES:
                raise Refused(f"{ip} is this server's own address: it cannot be banned.")
            if ip.startswith(STAFF_NETS):
                raise Refused(f"{ip} is an administrator's address: banning it would cut off the people who look after the server.")
            self.bans[ip] = now + minutes * 60
            self.record(client, f"{ip} banned for {minutes} minutes.", "warning")
            return {"message": f"{ip} is refused for {minutes} minutes."}
        if name == "unban":
            ip = body.get("ip") if HOSTILE_ON and body.get("ip") in self.bans else self._address(body.get("ip"))
            if ip not in self.bans:
                raise Refused(f"{ip} is not banned.")
            del self.bans[ip]
            self.record(client, f"{ip} let back in.")
            return {"message": f"{ip} may connect again."}
        if name == "shield":
            mode = body.get("mode")
            if mode not in ("auto", "on", "off"):
                raise Refused("The shield is auto, on or off.")
            self.shield_mode = mode
            self.record(client, f"shield set to {mode}.")
            return {"message": {"auto": "The sentinel raises the shield by itself under attack.", "on": "The shield is up: every limit is a quarter of normal.", "off": "The shield stays down."}[mode]}
        if name == "lockdown":
            on = body.get("on")
            if not isinstance(on, bool):
                raise Refused("Lockdown is on or off.")
            self.lockdown = on
            self.record(client, f"lockdown switched {'on' if on else 'off'}.", "alert" if on else "notice")
            return {"message": "Lockdown is on: only the staff addresses can open Ludora." if on else "Lockdown is off: Ludora is open again."}
        if name == "backup":
            if (now - self.backup_at) < 600:
                raise Refused("A backup was made a few minutes ago. Only so many are kept, so they are not made back to back.")
            self.backup_at = now
            self.backups = min(self.backups + 1, 14)
            self.record(client, "a backup was made.")
            return {"message": "Backed up. The copy is encrypted and kept on the server: copy it somewhere else too."}
        if name == "doctor":
            self.doctor_at = now
            report = self.doctor()
            return {"message": f"{report['passed']} passing, {report['failed']} failing."}
        if name == "alerts_test":
            audience = body.get("audience")
            if audience is not None and audience not in AUDIENCES:
                raise Refused("Choose security, upkeep or fair play.")
            said = []
            for who in ([audience] if audience else list(AUDIENCES)):
                key, label = AUDIENCES[who]
                listed = self.recipients(key)
                if not listed:
                    said.append(f"{label}: nobody is on that list.")
                    continue
                parts = []
                for r in listed:
                    if "@" in r and ":" not in r and self.mail_problems():
                        parts.append(f"{hide(r)} NOT delivered (the mail settings are not complete)")
                    elif r.startswith("telegram:") and not self.secrets["telegram_token"]:
                        parts.append(f"{hide(r)} NOT delivered (no Telegram bot token)")
                    else:
                        parts.append(f"{hide(r)} sent")
                said.append(f"{label}: " + "; ".join(parts))
            return {"message": " ".join(said)}
        if name == "set":
            return self.change(body.get("changes"), client)
        if name == "secret":
            which = body.get("name")
            if which not in self.secrets:
                raise Refused("That is not something the dashboard can set.")
            value = body.get("value")
            if not isinstance(value, str) or not 0 < len(value) <= 256 or not value.isprintable():
                raise Refused("A password or token is one line of ordinary characters.")
            value = value.strip().replace(" ", "") if which == "smtp_password" else value.strip()
            if not value or any(ch.isspace() for ch in value):
                raise Refused("A password or token is one line with no spaces.")
            if which == "telegram_token" and not TELEGRAM_TOKEN.match(value):
                raise Refused("That does not look like a Telegram bot token (numbers, a colon, then letters and digits).")
            self.secrets[which] = True
            self.record(client, f"the {which.replace('_', ' ')} was set.")
            return {"message": "Saved. Send a test to check it works."}
        if name == "ntfy_topic":
            topic = "ludora-" + secrets.token_urlsafe(18).replace("-", "x").replace("_", "y")
            return {"message": f"In the ntfy phone app, subscribe to this topic on {self.settings['NTFY_SERVER']}, then add ntfy:{topic} to a list. Anyone who knows the name can read its messages.", "topic": topic}
        if name == "support_close":
            closed = self.support is not None
            self.support = None
            if closed:
                self.record(client, "support access closed.")
            return {"message": "Support access is closed." if closed else "Support access was not open."}
        if name == "restart":
            what = body.get("what")
            if what not in ("app", "proxy"):
                raise Refused("Only the app or the proxy can be restarted from here.")
            if what == "proxy":
                self.outage = (now + 0.5, now + 3.5)
                self.record(client, "the proxy was restarted.")
                return {"message": "The proxy is restarting. This page loses its connection for a few seconds and then carries on.", "moving": {"to": None, "seconds": 15}}
            self.record(client, f"the {what} was restarted.")
            return {"message": f"The {what} was restarted."}
        raise Refused("That is not something the dashboard can do.")

    @staticmethod
    def _address(value: object) -> str:
        if not isinstance(value, str) or not (IPV4.match(value.strip()) or re.fullmatch(r"[0-9a-fA-F:]{2,39}", value.strip())):
            raise Refused("That is not an address such as 10.20.3.7.")
        return value.strip()


WORLD = World()
COOKIE = "ludora_dash"    # the real one is __Host-ludora-dash, which needs HTTPS


class Handler(BaseHTTPRequestHandler):
    server_version = "ludora"
    sys_version = ""
    protocol_version = "HTTP/1.1"

    def log_message(self, fmt: str, *args: object) -> None:  # quiet unless asked
        if os.environ.get("DASH_MOCK_VERBOSE"):
            super().log_message(fmt, *args)

    def send(self, status: int, body: bytes, kind: str, extra: dict[str, str] | None = None) -> None:
        self.send_response(status)
        self.send_header("Content-Type", kind)
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Content-Security-Policy", CSP)
        self.send_header("X-Content-Type-Options", "nosniff")
        self.send_header("X-Frame-Options", "DENY")
        self.send_header("Referrer-Policy", "no-referrer")
        self.send_header("Cross-Origin-Opener-Policy", "same-origin")
        self.send_header("Cache-Control", "no-store")
        for name, value in (extra or {}).items():
            self.send_header(name, value)
        self.end_headers()
        self.wfile.write(body)

    def json(self, status: int, data: dict, extra: dict[str, str] | None = None) -> None:
        self.send(status, json.dumps(data).encode(), "application/json", extra)

    def session(self) -> bool:
        """Like dash.App._session: the page's own refreshes (overview and events) do not count as someone using it."""
        jar = cookies.SimpleCookie()
        try:
            jar.load(self.headers.get("Cookie", ""))
        except cookies.CookieError:
            return False
        token = jar[COOKIE].value if COOKIE in jar else ""
        now = time.time()
        with WORLD.lock:
            found = WORLD.sessions.get(token)
            if not found:
                return False
            if now - found["seen"] > IDLE_MINUTES * 60 or now - found["since"] > 8 * 3600:
                del WORLD.sessions[token]
                return False
            if not (self.command == "GET" and self.path.split("?")[0] in ("/api/overview", "/api/events")):
                found["seen"] = now
            self.token = token
        return True

    def _serve(self, method: str) -> None:
        url = urlparse(self.path[:2000])
        path, query = url.path, url.query
        if method == "GET" and path in STATIC:
            name, kind = STATIC[path]
            self.send(200, (DASH / name).read_bytes(), kind)
            return
        if not path.startswith("/api/"):
            self.json(404, {"error": "There is nothing at that address."})
            return
        now = time.time()
        if WORLD.outage[0] <= now < WORLD.outage[1]:
            self.json(502, {"error": "The proxy is restarting."})
            return
        if WORLD.moved:
            self.json(421, {"error": "This dashboard is not served under that name."})
            return
        try:
            length = int(self.headers.get("Content-Length") or 0)
        except ValueError:
            length = -1
        if not 0 <= length <= 64 * 1024:
            self.send_error(413)
            return
        raw = self.rfile.read(length) if length else b""
        data: dict = {}
        if method == "POST":
            origin = f"http://{self.headers.get('Host', '')}"
            if self.headers.get("Origin") != origin or self.headers.get("X-Ludora-Dash") != "1" or not self.headers.get("Content-Type", "").startswith("application/json"):
                self.json(403, {"error": "That request did not come from the dashboard's own pages."})
                return
            try:
                data = json.loads(raw or b"{}")
            except ValueError:
                data = None  # type: ignore[assignment]
            if not isinstance(data, dict):
                self.json(400, {"error": "That was not understood."})
                return
        client = self.client_address[0]
        signed_in = self.session()
        if path == "/api/session" and method == "GET":
            self.json(200, {"signed_in": signed_in, "server": SERVER, "version": VERSION, "needs_code": NEEDS_CODE, "idle_minutes": IDLE_MINUTES})
            return
        if path == "/api/login" and method == "POST":
            self.login(data, client)
            return
        if not signed_in:
            self.json(401, {"error": "signed_out"})
            return
        if path == "/api/logout" and method == "POST":
            with WORLD.lock:
                WORLD.sessions.pop(self.token, None)
            self.json(200, {"ok": True}, {"Set-Cookie": f"{COOKIE}=; Path=/; HttpOnly; SameSite=Strict; Max-Age=0"})
            return
        params = {k: v for k, _, v in (pair.partition("=") for pair in query.split("&") if pair)}

        def number(text: str | None, default: int) -> int:
            return int(text) if text and text.isdigit() and len(text) <= 4 else default

        try:
            if method == "GET":
                with WORLD.lock:
                    WORLD.advance()
                    if path == "/api/overview":
                        answer = WORLD.overview()
                    elif path == "/api/doctor":
                        answer = WORLD.doctor()
                    elif path == "/api/settings":
                        answer = WORLD.settings_view()
                    elif path == "/api/setup":
                        answer = WORLD.setup()
                    elif path == "/api/events":
                        limit = number(params.get("limit"), 100)
                        if not 1 <= limit <= 300:
                            raise Refused("Between 1 and 300 events.")
                        answer = {"events": [{**e, "text": clean(e["text"], 400)} for e in WORLD.events[-limit:]]}
                    elif path == "/api/logs":
                        answer = WORLD.logs(params.get("what", ""), number(params.get("lines"), 80))
                    else:
                        self.json(404, {"error": "There is nothing at that address."})
                        return
            elif path == "/api/dns-check":
                time.sleep(DELAY * 0.6)
                answer = WORLD.dns_check(data.get("name"))
            elif path == "/api/action":
                time.sleep(DELAY * {"backup": 2.0, "doctor": 1.6, "restart": 1.6, "alerts_test": 1.4, "set": 0.6}.get(str(data.get("action")), 0.5))
                with WORLD.change_lock:
                    if data.get("action") == "set":
                        answer = WORLD.action(data, client)         # takes the world lock itself around its long wait
                    else:
                        with WORLD.lock:
                            answer = WORLD.action(data, client)
            else:
                self.json(404, {"error": "There is nothing at that address."})
                return
        except Refused as err:
            self.json(400, {"error": str(err)})
            return
        self.json(200, {"ok": True, **answer})

    def login(self, body: dict, ip: str) -> None:
        now = time.time()
        with WORLD.lock:
            if WORLD.paused.get(ip, 0) > now:
                left = int(WORLD.paused[ip] - now) + 1
                self.json(429, {"error": f"Too many wrong tries. Sign-in is paused for {max(1, round(left / 60))} more minutes.", "retry_after": left})
                return
            tries = [t for t in WORLD.failures.get(ip, []) if now - t < WINDOW] + [now]
            WORLD.failures[ip] = tries
            if len(tries) >= TRIES:
                WORLD.paused[ip] = now + PAUSE
                WORLD.failures[ip] = []
        time.sleep(0.4)
        password, code = body.get("password"), body.get("code")
        good = isinstance(password, str) and 0 < len(password) <= 256 and secrets.compare_digest(password.encode(), PASSWORD.encode())
        if NEEDS_CODE:
            good = good and isinstance(code, str) and secrets.compare_digest(code.encode(), CODE.encode())
        elif code is not None and not (isinstance(code, str) and len(code) == 6 and code.isdigit()):
            good = False
        if not good:
            self.json(401, {"error": "That password or code is not right."})
            return
        token = secrets.token_urlsafe(32)
        with WORLD.lock:
            WORLD.failures.pop(ip, None)
            WORLD.sessions[token] = {"since": now, "seen": now}
            WORLD.record(ip, "a member of staff signed in.", "info")
        self.json(200, {"ok": True}, {"Set-Cookie": f"{COOKIE}={token}; Path=/; HttpOnly; SameSite=Strict"})

    def do_GET(self) -> None:  # noqa: N802
        self._serve("GET")

    def do_POST(self) -> None:  # noqa: N802
        self._serve("POST")


def main() -> None:
    for name, _ in STATIC.values():
        if not (DASH / name).is_file():
            sys.exit(f"missing {DASH / name}")
    server = ThreadingHTTPServer(("127.0.0.1", PORT), Handler)
    server.daemon_threads = True
    print(f"Ludora OS dashboard mock ({SCENARIO}{', hostile text' if HOSTILE_ON else ''}) at http://127.0.0.1:{PORT}/")
    print(f"Password: {PASSWORD}" + (f"   Code: {CODE}" if NEEDS_CODE else ""))
    print("DNS check: names starting play. (public), ludora. or intranet. (inside), old. (elsewhere); anything else is not found.")
    sys.stdout.flush()
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        pass


if __name__ == "__main__":
    main()
