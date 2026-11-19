"""The sentinel: notices an attack from inside the school and shuts the door on it.

It runs without root. Its judgement lives in `Brain`, which only looks at
facts (a connection to a decoy port, a line from the SSH or web log, the
firewall's counters, the neighbour table) and answers with actions (ban this
address, raise the shield, record this event). Everything that touches the
system is in `Daemon`, kept small.

Rules it never breaks:
  * It bans only an address that completed a TCP handshake, so a forged
    packet cannot get someone else banned.
  * It never bans a trusted staff network, the gateway, a name server, the
    server's own addresses or its containers.
  * A ban is always temporary, and anyone at the console can lift it.
"""

from __future__ import annotations

import asyncio
import ipaddress
import json
import os
import re
import signal
import time
import urllib.request
from collections import defaultdict, deque
from dataclasses import dataclass, field
from typing import Any, Iterable

from . import alerts, analyst, config, render, system

STATE_DIR = f"{system.STATE}/sentinel"
BANS_FILE = f"{STATE_DIR}/bans.json"
EVENTS_FILE = f"{STATE_DIR}/events.jsonl"
SHIELD_FLAG = f"{STATE_DIR}/shield-on"
STATUS_FILE = f"{STATE_DIR}/status.json"
# On a memory-backed folder, so it is gone after a restart of the server and still there after a restart of the sentinel.
RUNNING_MARK = "/run/ludora-sentinel/running"

# Paths nothing in Ludora serves. Asking for one is looking for some other software's holes.
# It is matched against the path only, never the query: a person may honestly search for "<script" or "union select".
PROBE = re.compile(
    r"(?i)(?:^|/)(?:\.env|\.git|\.aws|\.ssh|\.htaccess|\.DS_Store|wp-(?:admin|login|content|includes)|xmlrpc\.php|phpmyadmin|pma|cgi-bin|"
    r"vendor/phpunit|actuator|server-status|manager/html|solr|jenkins|HNAP1|boaform|owa|autodiscover|etc/passwd|proc/self)"
    r"|\.(?:php\d?|asp|aspx|jsp|cgi|bak|sql|old|swp)$|\.\./|%2e%2e|%00"
)
GUESS_PATHS = ("/api/auth/login", "/api/auth/recover", "/api/auth/recovery-code", "/api/auth/password")
# sshd writes the peer's address itself, at a fixed place. A user name is the attacker's to choose, so the
# address is only ever read from where sshd put it: straight after a fixed opening, or at the very end.
SSH_FAIL_HEAD = re.compile(r"^(?:Unable to negotiate with|banner exchange: Connection from) (?P<ip>[0-9a-fA-F:.]{3,45}) port \d+")
SSH_FAIL_TAIL = re.compile(
    r"^(?:Failed \S+ for |Invalid user |Connection (?:closed|reset) by (?:authenticating|invalid) user |"
    r"Disconnected from (?:authenticating|invalid) user |maximum authentication attempts exceeded for )"
    r".* (?P<ip>[0-9a-fA-F:.]{3,45}) port \d+(?: ssh2)?(?: \[preauth\])?$"
)

LEVELS = ("calm", "watchful", "under attack")


@dataclass
class Action:
    kind: str  # ban | event | shield
    ip: str = ""
    seconds: int = 0
    on: bool = False
    event: dict[str, Any] = field(default_factory=dict)


class Window:
    """Counts what one address did lately, and forgets addresses that went quiet."""

    def __init__(self, span: float, limit: int, cap: int = 20000):
        self.span, self.limit, self.cap = span, limit, cap
        self.hits: dict[str, deque[float]] = {}

    def add(self, ip: str, now: float) -> bool:
        q = self.hits.get(ip)
        if q is None:
            if len(self.hits) >= self.cap:  # a flood of new addresses must not eat the memory
                self.sweep(now)
                if len(self.hits) >= self.cap:
                    self.hits.pop(next(iter(self.hits)))
            q = self.hits[ip] = deque(maxlen=self.limit)
        q.append(now)
        return len(q) >= self.limit and now - q[0] <= self.span

    def clear(self, ip: str) -> None:
        self.hits.pop(ip, None)

    def sweep(self, now: float) -> None:
        for ip in [ip for ip, q in self.hits.items() if not q or now - q[-1] > self.span]:
            del self.hits[ip]


class Brain:
    def __init__(self, cfg: dict[str, Any], exempt: Iterable[str] = ()):
        self.cfg = cfg
        self.trusted = [ipaddress.ip_network(n) for n in cfg["TRUSTED_NETS"]]
        self.never = [ipaddress.ip_network(n, strict=False) for n in exempt]
        self.never += [ipaddress.ip_network(n) for n in ("127.0.0.0/8", "::1/128", system.NET_INTERNAL, system.NET_EDGE)]
        self.base = cfg["BAN_MINUTES"] * 60
        self.nat = cfg["NAT_MODE"]
        self.bans: dict[str, float] = {}  # address -> until (epoch seconds)
        self.strikes: dict[str, deque[float]] = defaultdict(lambda: deque(maxlen=8))
        self.ssh = Window(600, 5)
        self.probe = Window(300, 3)
        self.guess = Window(300, 20)
        self.flood = Window(10, 600)
        self.errors = Window(60, 150)
        self.recent_bans: deque[tuple[float, str]] = deque(maxlen=500)
        self.gateway_mac: dict[str, str] = {}
        self.last_counters: dict[str, int] = {}
        self.last_counter_time = 0.0
        self.rates: dict[str, float] = {}
        self.shield = False
        self.calm_since = 0.0
        self.level = 0
        self.seen_tripwire: dict[str, float] = {}
        self.warned: dict[str, float] = {}
        # address -> [hardware address, when it last CHANGED (0 if it never has)]. See _moved.
        self.mac_of: dict[str, list[Any]] = {}
        self.lookup: Any = None  # the daemon supplies a function: address -> its hardware address right now, or None

    # ---- who may never be banned ---------------------------------------------------------
    def protected(self, ip: str) -> str | None:
        try:
            addr = ipaddress.ip_address(ip)
        except ValueError:
            return "not an address"
        if isinstance(addr, ipaddress.IPv6Address) and addr.ipv4_mapped:
            addr = addr.ipv4_mapped
        for net in self.trusted:
            if addr.version == net.version and addr in net:
                return "trusted"
        for net in self.never:
            if addr.version == net.version and addr in net:
                return "the server's own network gear"
        return None

    @staticmethod
    def clean(ip: str) -> str:
        """One spelling per address (IPv4 arriving on an IPv6 socket looks like ::ffff:10.0.0.1)."""
        try:
            addr = ipaddress.ip_address(ip.split("%")[0])
        except ValueError:
            return ""
        if isinstance(addr, ipaddress.IPv6Address) and addr.ipv4_mapped:
            addr = addr.ipv4_mapped
        return str(addr)

    def _event(self, now: float, severity: str, kind: str, text: str, **extra: Any) -> Action:
        return Action("event", event={"at": int(now), "severity": severity, "kind": kind, "text": text, **extra})

    def _ban(self, ip: str, why: str, kind: str, now: float, *, got_through: bool = False, **extra: Any) -> list[Action]:
        """got_through: the evidence is a completed connection, which a banned address cannot make. If we still
        think it is banned, an administrator has lifted the ban and this is a new offence."""
        ip = self.clean(ip)
        if not ip:
            return []
        shielded = self.protected(ip)
        if shielded:
            return [self._event(now, "notice", kind, f"{ip} {why}. Not banned: it is {shielded}.", ip=ip, **extra)]
        if self.nat:
            # Many students share this address: a ban would lock out the school. Record it, punish nobody.
            for window in (self.ssh, self.probe, self.guess, self.flood, self.errors):
                window.clear(ip)
            if now - self.warned.get(f"nat:{kind}:{ip}", float("-inf")) < 60:
                return []
            self._warn(f"nat:{kind}:{ip}", now)
            return [self._event(now, "notice", kind, f"{ip} {why}. Not banned: it is a shared address.", ip=ip, **extra)]
        moved = self._moved(ip, now)
        if moved:
            for window in (self.ssh, self.probe, self.guess, self.flood, self.errors):
                window.clear(ip)
            if now - self.warned.get(f"moved:{ip}", float("-inf")) < 60:
                return []
            self._warn(f"moved:{ip}", now)
            return [self._event(now, "alert", "impersonation", f"{ip} {why}, minutes after that address moved to a different device ({moved}). "
                                "Not banned: someone may be using another machine's address to get it banned.", ip=ip, mac=moved, **extra)]
        if self.bans.get(ip, 0) > now and not got_through:
            return []  # already banned; log lines can still trail in from just before the ban took hold
        history = self.strikes[ip]
        earlier = sum(1 for t in history if now - t < 86400)
        seconds = min(self.base * (4 ** min(earlier, 2)), 86400)
        history.append(now)
        self.bans[ip] = now + seconds
        self.recent_bans.append((now, ip))
        for window in (self.ssh, self.probe, self.guess, self.flood, self.errors):
            window.clear(ip)
        minutes = max(1, round(seconds / 60))
        return [
            Action("ban", ip=ip, seconds=int(seconds)),
            self._event(now, "warning", kind, f"{ip} {why}. Banned for {minutes} min.", ip=ip, minutes=minutes, **extra),
        ]

    def _warn(self, key: str, now: float) -> None:
        if len(self.warned) > 20000:
            self.warned.clear()
        self.warned[key] = now

    def _note_mac(self, ip: str, mac: str, now: float) -> None:
        known = self.mac_of.get(ip)
        if known is None:
            if len(self.mac_of) >= 20000:
                self.mac_of.pop(next(iter(self.mac_of)))
            self.mac_of[ip] = [mac, 0.0]
        elif known[0] != mac:
            self.mac_of[ip] = [mac, now]

    def _moved(self, ip: str, now: float) -> str | None:
        """On the server's own network segment a device can simply take another machine's address, and then
        misbehave in its name. So an address that changed hardware address in the last ten minutes is not banned.
        Returns the new hardware address when that is the case."""
        if self.lookup:
            mac = self.lookup(ip)
            if mac:
                self._note_mac(ip, mac, now)
        known = self.mac_of.get(ip)
        if known and known[1] and now - known[1] < 600:
            return str(known[0])
        return None

    # ---- facts ---------------------------------------------------------------------------
    def on_tripwire(self, ip: str, port: int, now: float) -> list[Action]:
        ip = self.clean(ip)
        if not ip or now - self.seen_tripwire.get(ip, float("-inf")) < 2:
            return []
        if len(self.seen_tripwire) > 20000:
            self.seen_tripwire.clear()
        self.seen_tripwire[ip] = now
        return self._ban(ip, f"connected to decoy port {port}", "tripwire", now, got_through=True, port=port)

    def on_ssh_line(self, message: str, now: float) -> list[Action]:
        if len(message) > 600 or "\n" in message:
            return []
        m = SSH_FAIL_HEAD.match(message) or SSH_FAIL_TAIL.match(message)
        if not m:
            return []
        ip = self.clean(m.group("ip"))
        if ip and self.ssh.add(ip, now):
            return self._ban(ip, "failed to sign in over SSH 5 times", "ssh", now)
        return []

    def on_web_line(self, message: str, now: float) -> list[Action]:
        if not message.startswith("{"):
            return []
        try:
            record = json.loads(message)
            request = record["request"]
            if not isinstance(request, dict):
                return []
            ip = self.clean(str(request.get("remote_ip") or request.get("client_ip") or ""))
            uri = str(request.get("uri", ""))[:2000]
            method = str(request.get("method", ""))
            status = int(record.get("status", 0))
            site = record.get("fetch_site")
            if not isinstance(site, str):
                headers = request.get("headers")
                values = headers.get("Sec-Fetch-Site") if isinstance(headers, dict) else None
                site = str(values[0]) if isinstance(values, list) and values else ""
            site = site.strip().lower()
        except (ValueError, KeyError, TypeError, AttributeError):
            return []
        if not ip:
            return []
        # A web page can make its visitor's browser ask for anything: three hidden pictures pointing at /x.php would
        # otherwise get the VISITOR banned. Browsers say when a page caused a request (Sec-Fetch-Site), so those never
        # count towards a ban for probing or broken requests, and requests caused by another site never count as
        # sign-in guessing. A scanner can add the header to dodge these three rules; it still meets the firewall's
        # limits and the flood rule, and what it probes for is not there.
        by_a_page = site not in ("", "none")
        from_elsewhere = site in ("cross-site", "same-site")
        path = uri.split("?", 1)[0]
        if not by_a_page and PROBE.search(path) and self.probe.add(ip, now):
            return self._ban(ip, "probed for other software's weak spots", "probe", now, uri=path[:120])
        if not from_elsewhere and method == "POST" and path in GUESS_PATHS and status in (400, 401, 403, 429) and self.guess.add(ip, now):
            return self._ban(ip, "kept guessing at sign-in", "guessing", now)
        if not by_a_page and status in (400, 403, 404, 405, 414, 431) and self.errors.add(ip, now):
            return self._ban(ip, "sent a stream of broken requests", "fuzzing", now)
        if self.flood.add(ip, now):
            return self._ban(ip, "flooded the site with requests", "flood", now)
        return []

    def on_app_line(self, message: str, now: float) -> list[Action]:
        """Ludora itself reports likely cheating in a game as one JSON log line. Passed on; nobody is banned for it."""
        if not message.startswith("{") or len(message) > 4000:
            return []
        try:
            record = json.loads(message)
        except ValueError:
            return []
        if not isinstance(record, dict) or record.get("ludora_event") != "integrity" or record.get("kind") not in alerts.CHEAT_KINDS:
            return []
        key = f"cheat:{alerts.clean(record.get('room', ''), 12)}:{alerts.clean(record.get('player', ''), 40)}:{record['kind']}"
        if now - self.warned.get(key, float("-inf")) < 3600:
            return []
        self._warn(key, now)
        kept = {"kind": record["kind"], "room": alerts.clean(record.get("room", "?"), 12), "mode": alerts.clean(record.get("mode", ""), 40),
                "player": alerts.clean(record.get("player", "?"), 40), "count": record.get("count") if isinstance(record.get("count"), int) else None}
        text = f"Game {kept['room']}: a player calling themselves \"{kept['player']}\" {alerts.CHEAT_KINDS[kept['kind']]}."
        return [self._event(now, "notice", "integrity", text, record=kept)]

    def on_neighbours(self, entries: list[dict[str, Any]], gateways: list[str], now: float) -> list[Action]:
        """Watch the gateway's hardware address: if it changes, someone may be standing in the middle."""
        out: list[Action] = []
        by_mac: dict[str, set[str]] = defaultdict(set)
        for entry in entries:
            ip, mac = entry.get("dst"), entry.get("lladdr")
            if not ip or not mac or "FAILED" in entry.get("state", []):
                continue
            by_mac[mac].add(ip)
            self._note_mac(self.clean(str(ip)) or str(ip), str(mac), now)
            if ip in gateways:
                known = self.gateway_mac.get(ip)
                if known and known != mac:
                    out.append(self._event(now, "alert", "arp", f"The gateway {ip} changed hardware address ({known} to {mac}). If nobody replaced the router, a device is impersonating it.", ip=ip, mac=mac))
                self.gateway_mac[ip] = mac
        gateway_macs = set(self.gateway_mac.values())
        for mac, ips in by_mac.items():
            if len(ips) >= 6 and mac not in gateway_macs:
                key = f"multi:{mac}"
                if now - self.warned.get(key, float("-inf")) > 3600:
                    self.warned[key] = now
                    out.append(self._event(now, "warning", "arp", f"One device ({mac}) answers for {len(ips)} addresses. That is how traffic gets intercepted.", mac=mac))
        return out

    def on_counters(self, counters: dict[str, int], now: float) -> None:
        if self.last_counter_time and now > self.last_counter_time:
            span = now - self.last_counter_time
            self.rates = {k: max(0, v - self.last_counters.get(k, v)) / span for k, v in counters.items()}
        self.last_counters, self.last_counter_time = dict(counters), now

    # ---- judgement -----------------------------------------------------------------------
    def tick(self, now: float) -> list[Action]:
        out: list[Action] = []
        for ip in [ip for ip, until in self.bans.items() if until <= now]:
            del self.bans[ip]
        for window in (self.ssh, self.probe, self.guess, self.flood, self.errors):
            window.sweep(now)
        for ip in [ip for ip, seen in self.strikes.items() if not seen or now - seen[-1] > 86400]:
            del self.strikes[ip]
        attackers = {ip for t, ip in self.recent_bans if now - t < 600}
        pressure = self.rates.get("c_http_rate", 0) + self.rates.get("c_http_conns", 0) + self.rates.get("c_shield", 0) + self.rates.get("c_synflood", 0)
        noise = self.rates.get("c_dropped", 0) + self.rates.get("c_bogus", 0) + self.rates.get("c_banned", 0)
        level = 0
        if attackers or pressure > 5 or noise > 20:
            level = 1
        if len(attackers) >= 3 or pressure > 100 or noise > 500:
            level = 2
        if level != self.level:
            severity = "alert" if level == 2 else "notice"
            out.append(self._event(now, severity, "level", f"Threat level: {LEVELS[level]}.", level=level))
            self.level = level
        mode = self.cfg["SHIELD"]
        want = mode == "on" or (mode == "auto" and level == 2)
        if level < 2:
            self.calm_since = self.calm_since or now
        else:
            self.calm_since = 0.0
        if mode == "auto" and self.shield and level < 2 and now - self.calm_since < 900:
            want = True  # stay up for 15 quiet minutes before lowering
        if want != self.shield:
            self.shield = want
            out.append(Action("shield", on=want))
            out.append(self._event(now, "alert" if want else "notice", "shield", "Shield raised: every limit is a quarter of normal." if want else "Shield lowered."))
        return out

    def status(self, now: float) -> dict[str, Any]:
        return {
            "at": int(now),
            "level": self.level,
            "level_name": LEVELS[self.level],
            "shield": self.shield,
            "bans": {ip: int(until - now) for ip, until in sorted(self.bans.items()) if until > now},
            "rates": {k: round(v, 1) for k, v in self.rates.items() if v},
            "gateway": self.gateway_mac,
        }


# ---------------------------------------------------------------------------------------------
# Everything below touches the system.
# ---------------------------------------------------------------------------------------------


def discover_exempt(cfg: dict[str, Any]) -> tuple[list[str], list[str]]:
    """The gateway, the name servers and the server's own addresses. Returns (never-ban, gateways)."""
    never: list[str] = list(cfg["DNS_SERVERS"])
    gateways: list[str] = []
    routes = system.run(["ip", "-j", "route", "show", "default"])
    routes6 = system.run(["ip", "-j", "-6", "route", "show", "default"])
    for result in (routes, routes6):
        if result.ok:
            try:
                for route in json.loads(result.out or "[]"):
                    if route.get("gateway"):
                        gateways.append(route["gateway"])
            except ValueError:
                pass
    addresses = system.run(["ip", "-j", "addr", "show"])
    if addresses.ok:
        try:
            for link in json.loads(addresses.out or "[]"):
                for info in link.get("addr_info", []):
                    if info.get("local"):
                        never.append(info["local"])
        except ValueError:
            pass
    for line in (system.read("/etc/resolv.conf") or "").splitlines():
        parts = line.split()
        if len(parts) >= 2 and parts[0] == "nameserver":
            never.append(parts[1].split("%")[0])
    clean: list[str] = []
    for item in never + gateways:
        try:
            clean.append(str(ipaddress.ip_address(item)))
        except ValueError:
            continue
    return sorted(set(clean)), sorted(set(gateways))


def neighbour_mac(ip: str) -> str | None:
    """The hardware address the kernel currently has for an address on our own network segment, if any."""
    try:
        addr = ipaddress.ip_address(ip)
    except ValueError:
        return None
    result = system.run(["ip", "-j", "neigh", "show", str(addr)])
    if not result.ok:
        return None
    try:
        for entry in json.loads(result.out or "[]"):
            states = entry.get("state", [])
            if entry.get("lladdr") and "FAILED" not in states and "INCOMPLETE" not in states:
                return str(entry["lladdr"])
    except (ValueError, AttributeError, TypeError):
        pass
    return None


def nft_ban(ip: str, seconds: int) -> bool:
    addr = ipaddress.ip_address(ip)  # raises on anything that is not exactly an address
    name = "ban6" if addr.version == 6 else "ban4"
    return system.run(["nft", "add", "element", "inet", "ludora", name, "{", str(addr), "timeout", f"{int(seconds)}s", "}"]).ok


def nft_unban(ip: str) -> bool:
    addr = ipaddress.ip_address(ip)
    name = "ban6" if addr.version == 6 else "ban4"
    return system.run(["nft", "delete", "element", "inet", "ludora", name, "{", str(addr), "}"]).ok


def _nft_json(args: list[str]) -> list[dict[str, Any]]:
    result = system.run(["nft", "-j", "list"] + args)
    if not result.ok:
        return []
    try:
        return json.loads(result.out).get("nftables", [])
    except ValueError:
        return []


def kernel_bans() -> dict[str, int]:
    """What the firewall is really holding, with the seconds each ban has left."""
    out: dict[str, int] = {}
    for name in ("ban4", "ban6"):
        for item in _nft_json(["set", "inet", "ludora", name]):
            for element in item.get("set", {}).get("elem", []) or []:
                detail = element.get("elem", element) if isinstance(element, dict) else element
                if isinstance(detail, dict):
                    out[str(detail.get("val"))] = int(detail.get("expires", detail.get("timeout", 0)))
                else:
                    out[str(detail)] = 0
    return out


def kernel_counters() -> dict[str, int]:
    out: dict[str, int] = {}
    for item in _nft_json(["counters", "table", "inet", "ludora"]):
        counter = item.get("counter")
        if counter:
            out[counter["name"]] = int(counter.get("packets", 0))
    return out


def set_shield(cfg: dict[str, Any], on: bool) -> None:
    system.run(["nft", "flush", "chain", "inet", "ludora", "shield"])
    if on:
        for argv in render.shield_rules(cfg):
            system.run(argv)
        system.write_atomic(SHIELD_FLAG, "on\n")
    else:
        try:
            os.unlink(system.p(SHIELD_FLAG))
        except FileNotFoundError:
            pass


def forget_ban(ip: str) -> None:
    """Take an address out of the saved ban list at once (the sentinel only rewrites it every few seconds), so a ban
    an administrator lifted cannot come back if the server restarts straight afterwards."""
    try:
        saved = json.loads(system.read(BANS_FILE) or "{}")
    except ValueError:
        saved = {}
    if isinstance(saved, dict) and saved.pop(ip, None) is not None:
        system.write_atomic(BANS_FILE, json.dumps(saved), 0o640, group=system.SENTINEL_GROUP)


def append_event(event: dict[str, Any]) -> None:
    path = system.p(EVENTS_FILE)
    os.makedirs(os.path.dirname(path), exist_ok=True)
    try:
        if not os.path.islink(path) and os.path.getsize(path) > 2_000_000:
            with open(path, encoding="utf-8") as fh:
                keep = fh.readlines()[-3000:]
            system.write_atomic(EVENTS_FILE, "".join(keep), 0o640)
    except OSError:
        pass
    # Root writes here too (`ludoractl ban`), into a folder the sentinel owns: never through a link, and a file
    # root creates is handed to the folder's owner so the sentinel can go on writing to it.
    try:
        fd = os.open(path, os.O_WRONLY | os.O_APPEND | os.O_CREAT | os.O_NOFOLLOW, 0o640)
    except OSError:
        return  # an event that cannot be written must never stop the action it describes
    try:
        if os.geteuid() == 0:
            owner = os.stat(os.path.dirname(path))
            if os.fstat(fd).st_uid != owner.st_uid:
                os.fchown(fd, owner.st_uid, owner.st_gid)
        os.write(fd, (json.dumps(event, ensure_ascii=False) + "\n").encode("utf-8"))
    except OSError:
        pass
    finally:
        os.close(fd)


def read_events(limit: int = 200) -> list[dict[str, Any]]:
    text = system.read(EVENTS_FILE) or ""
    out: list[dict[str, Any]] = []
    for line in text.splitlines()[-limit:]:
        try:
            out.append(json.loads(line))
        except ValueError:
            continue
    return out


def post_webhook(url: str, text: str) -> None:
    if not url.startswith("https://"):
        return
    body = json.dumps({"text": text}).encode()
    request = urllib.request.Request(url, data=body, headers={"Content-Type": "application/json", "User-Agent": "ludora-os-sentinel"})
    try:
        with urllib.request.urlopen(request, timeout=10) as response:  # noqa: S310 - https only, checked above and in config
            response.read(200)
    except Exception:  # an alert that cannot be delivered must never stop the sentinel
        pass


class Daemon:
    def __init__(self) -> None:
        self.cfg = config.effective(config.load())
        never, self.gateways = discover_exempt(self.cfg)
        self.brain = Brain(self.cfg, never)
        self.brain.lookup = neighbour_mac
        self.pending_alerts: list[str] = []
        self.last_alert = 0.0
        quiet = self.cfg["ALERT_QUIET_MINUTES"] * 60
        self.security_box = alerts.Outbox(quiet)
        self.cheat_box = alerts.Outbox(quiet, settle=120)
        self.stop = asyncio.Event()

    def perform(self, actions: list[Action]) -> None:
        for action in actions:
            if action.kind == "ban":
                nft_ban(action.ip, action.seconds)
            elif action.kind == "shield":
                set_shield(self.cfg, action.on)
            elif action.kind == "event":
                append_event(action.event)
                severity = action.event.get("severity")
                if severity == "alert":
                    self.pending_alerts.append(action.event["text"])
                now = time.time()
                if action.event.get("kind") == "integrity":
                    self.cheat_box.add(action.event.get("record", {}), now)
                elif severity in ("alert", "warning"):
                    self.security_box.add(action.event, now, urgent=severity == "alert")

    async def tripwire(self, reader: asyncio.StreamReader, writer: asyncio.StreamWriter) -> None:
        try:
            peer = writer.get_extra_info("peername")
            local = writer.get_extra_info("sockname")
            if peer and local:
                self.perform(self.brain.on_tripwire(peer[0], local[1], time.time()))
        finally:
            writer.close()

    async def listen(self) -> None:
        ports = list(self.cfg["TRIPWIRE_PORTS"])
        if not self.cfg["SSH_ENABLED"] and self.cfg["SSH_PORT"] not in ports:
            ports.append(self.cfg["SSH_PORT"])
        hosts = ["0.0.0.0"] + (["::"] if self.cfg["IPV6"] else [])
        opened = 0
        for port in ports:
            for host in hosts:
                try:
                    await asyncio.start_server(self.tripwire, host, port, backlog=64, reuse_address=True)
                    opened += 1
                except OSError as err:
                    append_event({"at": int(time.time()), "severity": "notice", "kind": "sentinel", "text": f"Decoy port {port} could not be opened: {err.strerror}."})
        append_event({"at": int(time.time()), "severity": "info", "kind": "sentinel", "text": f"Sentinel started. Watching {opened} decoy listeners, SSH and the web log."})

    async def follow_journal(self) -> None:
        # --all: without it the journal hands over any line longer than 4096 bytes as "null", and a request padded
        # past that would slip by unseen.
        argv = ["journalctl", "--follow", "--lines=0", "--output=json", "--all", "--unit=sshd.service", "--unit=ludora-proxy.service", "--unit=ludora-app.service"]
        while not self.stop.is_set():
            try:
                proc = await asyncio.create_subprocess_exec(*argv, stdout=asyncio.subprocess.PIPE, stderr=asyncio.subprocess.DEVNULL, limit=1 << 20)
            except FileNotFoundError:
                return
            assert proc.stdout is not None
            while True:
                try:
                    line = await proc.stdout.readline()
                except (asyncio.LimitOverrunError, ValueError):
                    continue  # one absurdly long line is skipped, not fatal
                except asyncio.CancelledError:
                    proc.terminate()
                    raise
                if not line:
                    break
                try:
                    record = json.loads(line)
                except ValueError:
                    continue
                message = record.get("MESSAGE")
                if isinstance(message, list):  # the journal spells a line with unusual bytes as a list of numbers
                    try:
                        message = bytes(message).decode("utf-8", "replace")
                    except (ValueError, TypeError):
                        continue
                if not isinstance(message, str):
                    continue
                unit = record.get("_SYSTEMD_UNIT", "")
                now = time.time()
                if unit == "sshd.service" or record.get("SYSLOG_IDENTIFIER", "").startswith("sshd"):
                    self.perform(self.brain.on_ssh_line(message, now))
                elif unit == "ludora-app.service":
                    self.perform(self.brain.on_app_line(message, now))
                else:
                    self.perform(self.brain.on_web_line(message, now))
            await proc.wait()
            await asyncio.sleep(2)

    def restore(self) -> None:
        """After the server restarts the firewall holds no bans, and the saved list puts them back. After only the
        sentinel restarts the firewall still holds them and is the truth: an administrator may have lifted one a
        moment ago, and the saved list can be a few seconds stale."""
        now = time.time()
        same_boot = system.exists(RUNNING_MARK)
        try:
            system.write_atomic(RUNNING_MARK, "1\n")
        except OSError:
            pass
        try:
            saved = {} if same_boot else json.loads(system.read(BANS_FILE) or "{}")
        except ValueError:
            saved = {}
        if not isinstance(saved, dict):
            saved = {}
        for ip, until in saved.items():
            try:
                left = int(float(until) - now)
                if left > 5 and not self.brain.protected(ip):
                    nft_ban(ip, left)
                    self.brain.bans[ip] = now + left
            except (ValueError, TypeError):
                continue
        if system.exists(SHIELD_FLAG) or self.cfg["SHIELD"] == "on":
            self.brain.shield = True
            set_shield(self.cfg, True)

    async def heartbeat(self) -> None:
        ticks = 0
        while not self.stop.is_set():
            now = time.time()
            # The firewall is the truth about bans: an administrator may have lifted or added one.
            held = kernel_bans()
            for ip in [ip for ip in self.brain.bans if ip not in held]:
                del self.brain.bans[ip]
            for ip, left in held.items():
                if left > 0:
                    self.brain.bans[ip] = now + left  # the firewall is the truth about how long, too
            self.brain.on_counters(kernel_counters(), now)
            if ticks % 6 == 0:
                neigh = system.run(["ip", "-j", "neigh", "show"])
                if neigh.ok:
                    try:
                        self.perform(self.brain.on_neighbours(json.loads(neigh.out or "[]"), self.gateways, now))
                    except ValueError:
                        pass
            self.perform(self.brain.tick(now))
            system.write_atomic(BANS_FILE, json.dumps(self.brain.bans), 0o640)
            system.write_atomic(STATUS_FILE, json.dumps(self.brain.status(now)), 0o644)
            if self.pending_alerts and now - self.last_alert > 60 and self.cfg["WEBHOOK_URL"]:
                text = f"Ludora OS ({self.cfg['SERVER_NAME']}): " + " ".join(self.pending_alerts[-5:])
                self.pending_alerts.clear()
                self.last_alert = now
                await asyncio.get_running_loop().run_in_executor(None, post_webhook, self.cfg["WEBHOOK_URL"], text)
            await self.send_due(now)
            ticks += 1
            try:
                await asyncio.wait_for(self.stop.wait(), timeout=5)
            except asyncio.TimeoutError:
                pass

    async def send_due(self, now: float) -> None:
        """Tell the people on the lists, off the main loop so a slow mail server never delays a ban."""
        due: list[alerts.Alert] = []
        loop = asyncio.get_running_loop()
        batch = self.security_box.take(now)
        if batch:
            made = alerts.from_events(batch, self.cfg)
            if made:
                reading = None
                if self.cfg["AI_ENABLED"] and alerts.recipients(self.cfg, "security"):
                    # The optional model's line, asked off the main loop and never waited on for long. No answer changes nothing.
                    reading = await loop.run_in_executor(None, lambda b=batch: analyst.read(b, self.cfg))
                analyst.annotate(made, analyst.by_rules(batch), reading)      # the rules' reading is always there
                due.append(made)
        batch = self.cheat_box.take(now)
        if batch:
            made = alerts.from_integrity(batch)
            if made:
                due.append(made)
        for alert in due:
            if not alerts.recipients(self.cfg, alert.audience):
                continue
            results = await asyncio.get_running_loop().run_in_executor(None, lambda a=alert: alerts.deliver(a, self.cfg))
            failed = any(not ok for _, ok, _ in results)
            append_event({"at": int(time.time()), "severity": "notice" if failed else "info", "kind": "alert-delivery",
                          "text": f"Alert \"{alerts.clean(alert.title, 80)}\": {alerts.summary(results)}."})

    async def main(self) -> None:
        loop = asyncio.get_running_loop()
        for sig in (signal.SIGTERM, signal.SIGINT):
            loop.add_signal_handler(sig, self.stop.set)
        self.restore()
        await self.listen()
        tasks = [asyncio.create_task(self.follow_journal()), asyncio.create_task(self.heartbeat())]
        await self.stop.wait()
        for task in tasks:
            task.cancel()
        await asyncio.gather(*tasks, return_exceptions=True)


def main() -> int:
    try:
        asyncio.run(Daemon().main())
    except KeyboardInterrupt:
        pass
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
