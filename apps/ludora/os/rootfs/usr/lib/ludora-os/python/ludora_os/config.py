"""The server's settings: one small file, checked strictly.

Every value that reaches the firewall, the SSH server, the web proxy or a
container passes through a validator here first. A value that does not match
is refused with a plain message; it is never "cleaned up" and used anyway.
"""

from __future__ import annotations

import ipaddress
import json
import re
import secrets as _secrets
import time
from dataclasses import dataclass
from typing import Any, Callable

from . import system


class ConfigError(ValueError):
    pass


_NAME = re.compile(r"^[a-z][a-z0-9-]{0,30}$")
_LABEL = r"[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?"
_FQDN = re.compile(rf"^(?=.{{1,253}}$){_LABEL}(?:\.{_LABEL})*$")
_SLUG = re.compile(r"^[a-z0-9][a-z0-9-]{0,40}$")
_REF = re.compile(r"^[A-Za-z0-9][A-Za-z0-9._/-]{0,99}$")
_IMAGE = re.compile(r"^[a-z0-9][a-z0-9./_-]{0,200}(?::[A-Za-z0-9._-]{1,100})?(?:@sha256:[a-f0-9]{64})?$")
_TEXT_EXTRA = set(" .,'@:/_+()&-!?")


def _name(v: str) -> str:
    v = v.strip().lower()
    if not _NAME.match(v):
        raise ConfigError("use a short name of letters, digits and hyphens, starting with a letter")
    return v


def _site(v: str) -> str:
    v = v.strip().lower().rstrip(".")
    if not v:
        return ""
    try:
        return str(ipaddress.IPv4Address(v))
    except ValueError:
        pass
    if not _FQDN.match(v) or v.replace(".", "").isdigit():
        raise ConfigError("give a name such as play.your-school.org, or an IPv4 address such as 10.20.0.5")
    return v


def _text(v: str) -> str:
    v = v.strip()
    if len(v) > 120:
        raise ConfigError("keep it under 120 characters")
    for ch in v:
        if not (ch.isalnum() or ch in _TEXT_EXTRA):
            raise ConfigError(f"the character {ch!r} is not allowed here")
    return v


def _slug(v: str) -> str:
    v = v.strip().lower()
    if v and not _SLUG.match(v):
        raise ConfigError("use lower-case letters, digits and hyphens")
    return v


def _bool(v: str) -> bool:
    v = v.strip().lower()
    if v in ("yes", "true", "on", "1"):
        return True
    if v in ("no", "false", "off", "0", ""):
        return False
    raise ConfigError("answer yes or no")


def _choice(*options: str) -> Callable[[str], str]:
    def check(v: str) -> str:
        v = v.strip().lower()
        if v not in options:
            raise ConfigError(f"choose one of: {', '.join(options)}")
        return v

    return check


def _int(low: int, high: int) -> Callable[[str], int]:
    def check(v: str) -> int:
        try:
            n = int(v.strip())
        except ValueError:
            raise ConfigError("give a whole number") from None
        if not low <= n <= high:
            raise ConfigError(f"give a number from {low} to {high}")
        return n

    return check


def _plain_address(part: str) -> None:
    """Python accepts an IPv6 zone ("fe80::1%eth0") holding any characters at all. Nothing here needs one."""
    if not re.fullmatch(r"[0-9A-Fa-f:./]{1,49}", part):
        raise ConfigError(f"{part!r} is not an address or a network: only digits, a-f, dots, colons and one slash")


def _split(v: str) -> list[str]:
    return [part for part in re.split(r"[,\s]+", v.strip()) if part]


def _cidrs(min_v4: int, min_v6: int, limit: int = 64) -> Callable[[str], list[str]]:
    def check(v: str) -> list[str]:
        out: list[str] = []
        for part in _split(v):
            _plain_address(part)
            try:
                net = ipaddress.ip_network(part, strict=False)
            except ValueError:
                raise ConfigError(f"{part!r} is not an address or a network such as 10.20.0.0/24") from None
            floor = min_v4 if net.version == 4 else min_v6
            if net.prefixlen < floor:
                raise ConfigError(f"{net} is too wide: use /{floor} or narrower")
            if net.is_multicast or net.is_unspecified or (net.version == 4 and net.is_loopback):
                raise ConfigError(f"{net} is not a network that people connect from")
            text = str(net)
            if text not in out:
                out.append(text)
        if len(out) > limit:
            raise ConfigError(f"at most {limit} networks")
        return out

    return check


def _ips(v: str) -> list[str]:
    out: list[str] = []
    for part in _split(v):
        _plain_address(part)
        try:
            ip = ipaddress.ip_address(part)
        except ValueError:
            raise ConfigError(f"{part!r} is not an IP address") from None
        if ip.is_unspecified or ip.is_multicast:
            raise ConfigError(f"{ip} cannot be used here")
        if str(ip) not in out:
            out.append(str(ip))
    if len(out) > 8:
        raise ConfigError("at most 8 addresses")
    return out


def _ports(v: str) -> list[int]:
    out: list[int] = []
    for part in _split(v):
        if not part.isdigit() or not 1 <= int(part) <= 65535:
            raise ConfigError(f"{part!r} is not a port number")
        if int(part) in (80, 443):
            raise ConfigError("ports 80 and 443 serve Ludora and cannot be tripwires")
        if int(part) not in out:
            out.append(int(part))
    if len(out) > 32:
        raise ConfigError("at most 32 ports")
    return sorted(out)


_MAIL = re.compile(r"^[A-Za-z0-9._+-]{1,64}@(?=.{1,253}$)[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?(?:\.[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?)+$")
_NTFY_TOPIC = re.compile(r"^[A-Za-z0-9_-]{8,64}$")
_TELEGRAM_CHAT = re.compile(r"^-?[0-9]{5,20}$")


def _recipients(v: str) -> list[str]:
    """Who gets a kind of alert. Each one is an email address, ntfy:<topic> (a free push to a phone) or
    telegram:<chat id> (a message from the school's own Telegram bot)."""
    out: list[str] = []
    for part in _split(v):
        kind, sep, rest = part.partition(":")
        if not sep and _MAIL.match(part):
            item = part
        elif sep and kind == "ntfy" and _NTFY_TOPIC.match(rest):
            item = part
        elif sep and kind == "telegram" and _TELEGRAM_CHAT.match(rest):
            item = part
        else:
            raise ConfigError(f"{part[:60]!r} is not an email address, ntfy:<topic of 8 or more letters and digits> or telegram:<chat number>")
        if item not in out:
            out.append(item)
    if len(out) > 12:
        raise ConfigError("at most 12 recipients")
    return out


def _mail_or_empty(v: str) -> str:
    v = v.strip()
    if v and not _MAIL.match(v):
        raise ConfigError("give one email address")
    return v


def _host_or_empty(v: str) -> str:
    v = v.strip().lower()
    if v and not _FQDN.match(v):
        raise ConfigError("give a host name such as smtp.your-school.org")
    return v


def _login(v: str) -> str:
    v = v.strip()
    if not re.fullmatch(r"[A-Za-z0-9._%+@-]{0,128}", v):
        raise ConfigError("letters, digits and . _ % + @ - only")
    return v


def _https_url(v: str) -> str:
    v = v.strip()
    if not v:
        return ""
    m = re.match(r"^https://([A-Za-z0-9.-]{1,253})(?::(\d{1,5}))?(/[A-Za-z0-9._~%!$&'()*+,;=:@/?-]{0,400})?$", v)
    if not m or not _FQDN.match(m.group(1).lower()):
        raise ConfigError("give an https:// address with no spaces, user name or password")
    return v


def _ref(v: str) -> str:
    v = v.strip()
    if not _REF.match(v) or ".." in v:
        raise ConfigError("give a branch, tag or commit")
    return v


def _image(v: str) -> str:
    v = v.strip()
    if not _IMAGE.match(v):
        raise ConfigError("give a container image such as docker.io/library/caddy:2-alpine")
    return v


@dataclass(frozen=True)
class Field:
    key: str
    parse: Callable[[str], Any]
    default: Any
    help: str


FIELDS: list[Field] = [
    Field("SERVER_NAME", _name, "ludora", "This server's short name on the network."),
    Field("DOMAIN", _site, "", "The address people open: a name such as play.your-school.org, or the server's IPv4 address."),
    Field("TLS_MODE", _choice("public", "internal", "custom"), "internal",
          "public: a free certificate from Let's Encrypt (the name must be reachable from the internet). "
          "internal: the server's own certificate authority, for a school network. custom: your own certificate in /etc/ludora-os/tls."),
    Field("OPERATOR_NAME", _text, "", "Who runs this copy. Shown on the privacy policy."),
    Field("OPERATOR_CONTACT", _text, "", "How people reach you about their data. Shown on the privacy policy."),
    Field("SCHOOL_THEME", _slug, "", "Optional school look, e.g. hills-grammar."),
    Field("LAN_NETS", _cidrs(8, 32), [], "Only these networks may open Ludora at all. Empty lets any address in."),
    Field("TRUSTED_NETS", _cidrs(16, 48), [], "Staff addresses that are never banned or slowed (the teacher's desk, the IT office)."),
    Field("ADMIN_NETS", _cidrs(16, 48), [], "The only addresses that may reach SSH."),
    Field("BLOCKED_NETS", _cidrs(8, 32), [], "Addresses that are always refused."),
    Field("SSH_ENABLED", _bool, False, "Remote administration over SSH (keys only). Off keeps the server managed from its own screen."),
    Field("SSH_PORT", _int(1, 65535), 22, "The SSH port."),
    Field("NAT_MODE", _bool, False, "yes when many students arrive from one shared address: web limits are raised and that address is never banned for web behaviour."),
    Field("IPV6", _bool, False, "no switches IPv6 off, which also closes rogue router-advertisement attacks."),
    Field("TRIPWIRE_PORTS", _ports, [21, 23, 135, 139, 445, 1433, 3306, 3389, 5432, 5900, 8080],
          "Decoy ports. Nothing real listens here: an address that completes a connection to one is banned."),
    Field("BAN_MINUTES", _int(1, 1440), 15, "First ban length. Repeat offenders get 4 times, then 16 times as long."),
    Field("HTTP_NEW_PER_SEC", _int(5, 2000), 40, "New web connections one address may open per second."),
    Field("HTTP_MAX_CONNS", _int(10, 20000), 200, "Web connections one address may hold open at once."),
    Field("SHIELD", _choice("auto", "on", "off"), "auto", "Shield tightens every limit. auto switches it on while the server is under attack."),
    Field("LOCKDOWN", _bool, False, "yes closes Ludora to everyone outside TRUSTED_NETS."),
    Field("DNS_SERVERS", _ips, [], "If set, the server may ask only these name servers."),
    Field("AUTO_REBOOT", _bool, True, "Restart in the small hours when a security update needs it."),
    Field("WEBHOOK_URL", _https_url, "", "Optional https address that receives a JSON alert for serious events (a Teams or Slack incoming webhook works)."),
    Field("ALERT_SECURITY_TO", _recipients, [], "Who is told about attacks: bans, floods, impersonation, lockdown, support access. Email addresses, ntfy:<topic> or telegram:<chat number>, separated by commas."),
    Field("ALERT_UPKEEP_TO", _recipients, [], "Who is told when the server needs care: a failed backup or update, a self-check that starts failing, a full disk."),
    Field("ALERT_CHEAT_TO", _recipients, [], "Who is told when Ludora spots likely cheating in a game."),
    Field("ALERT_QUIET_MINUTES", _int(1, 1440), 10, "After an alert about bans, further ones are saved up and sent together after this many minutes."),
    Field("SMTP_HOST", _host_or_empty, "", "The mail server that sends alert emails, e.g. smtp.gmail.com or the school's own. Needed for email recipients."),
    Field("SMTP_PORT", _int(1, 65535), 587, "Its port: 587 (the usual) or 465."),
    Field("SMTP_SECURITY", _choice("starttls", "tls"), "starttls", "starttls for port 587, tls for port 465. Mail is never sent unencrypted."),
    Field("SMTP_USER", _login, "", "The account the server signs in to the mail server with. Its password is set with `ludoractl alerts secret smtp-password`."),
    Field("SMTP_FROM", _mail_or_empty, "", "The address alerts come from. Usually the same as the account."),
    Field("DASH_ENABLED", _bool, False, "yes opens the web staff dashboard, to the staff addresses only. Set its password first with `ludoractl dash password`."),
    Field("DASH_PORT", _int(1024, 65535), 8443, "The port the staff dashboard is on: https://<the server's address>:8443."),
    Field("AI_ENABLED", _bool, False, "yes adds a small AI model's second opinion to security alerts. It only advises: it never bans or unbans. Install it first with `ludoractl ai install`."),
    Field("AI_PORT", _int(1024, 65535), 8750, "The port on this machine itself where the AI model listens. Nothing outside the server can reach it."),
    Field("NTFY_SERVER", _https_url, "https://ntfy.sh", "The ntfy server for phone pushes. ntfy.sh is free and public; a school can run its own."),
    Field("APP_REPO", _https_url, "https://github.com/JustAdev742/codespace", "Where Ludora's source comes from for updates."),
    Field("APP_REF", _ref, "main", "The branch, tag or commit of Ludora to run."),
    Field("DB_IMAGE", _image, "docker.io/library/postgres:16-alpine", "The database image."),
    Field("PROXY_IMAGE", _image, "docker.io/library/caddy:2-alpine", "The HTTPS proxy image."),
]

BY_KEY = {f.key: f for f in FIELDS}


def defaults() -> dict[str, Any]:
    return {f.key: (list(f.default) if isinstance(f.default, list) else f.default) for f in FIELDS}


def _format(value: Any) -> str:
    if isinstance(value, bool):
        return "yes" if value else "no"
    if isinstance(value, list):
        return ",".join(str(v) for v in value)
    return str(value)


def set_value(cfg: dict[str, Any], key: str, raw: str) -> None:
    field = BY_KEY.get(key)
    if field is None:
        raise ConfigError(f"{key}: no such setting")
    if "\n" in raw or "\r" in raw or "\x00" in raw:
        raise ConfigError(f"{key}: one line only")
    try:
        cfg[key] = field.parse(raw)
    except ConfigError as err:
        raise ConfigError(f"{key}: {err}") from None


def check(cfg: dict[str, Any]) -> list[str]:
    """Rules that span more than one setting. Returns problems; empty means good."""
    problems: list[str] = []
    domain = cfg["DOMAIN"]
    is_ip = bool(domain) and domain.replace(".", "").isdigit()
    if cfg["TLS_MODE"] == "public" and (is_ip or "." not in domain):
        problems.append("TLS_MODE=public needs DOMAIN to be a full name such as play.your-school.org, not an address.")
    if cfg["SSH_ENABLED"] and not cfg["ADMIN_NETS"]:
        problems.append("SSH_ENABLED=yes needs ADMIN_NETS: SSH is never opened to every address.")
    if cfg["SSH_PORT"] in (80, 443):
        problems.append("SSH_PORT cannot be 80 or 443.")
    if cfg["SSH_ENABLED"] and cfg["SSH_PORT"] in cfg["TRIPWIRE_PORTS"]:
        problems.append("SSH_PORT is also listed in TRIPWIRE_PORTS.")
    if cfg["DASH_ENABLED"]:
        if not cfg["TRUSTED_NETS"] and not cfg["ADMIN_NETS"]:
            problems.append("DASH_ENABLED=yes needs TRUSTED_NETS or ADMIN_NETS: the staff dashboard is never opened to every address.")
        if not cfg["DOMAIN"]:
            problems.append("DASH_ENABLED=yes needs DOMAIN.")
    if cfg["DASH_PORT"] in (cfg["SSH_PORT"], cfg["AI_PORT"], 8760, 8787, 5432) or cfg["DASH_PORT"] in cfg["TRIPWIRE_PORTS"]:
        problems.append("DASH_PORT is already used for something else.")
    v6 = [n for key in ("LAN_NETS", "TRUSTED_NETS", "ADMIN_NETS") for n in cfg[key] if ":" in n]
    if v6 and not cfg["IPV6"]:
        problems.append(f"IPV6=no but {v6[0]} is an IPv6 network.")
    return problems


def parse(text: str) -> dict[str, Any]:
    cfg = defaults()
    seen: set[str] = set()
    for number, line in enumerate(text.splitlines(), 1):
        line = line.strip()
        if not line or line.startswith("#"):
            continue
        key, sep, raw = line.partition("=")
        key = key.strip()
        if not sep:
            raise ConfigError(f"line {number}: expected KEY=value")
        if key in seen:
            raise ConfigError(f"line {number}: {key} is set twice")
        seen.add(key)
        raw = raw.strip()
        if len(raw) >= 2 and raw[0] == raw[-1] and raw[0] in "\"'":
            raw = raw[1:-1]
        set_value(cfg, key, raw)
    problems = check(cfg)
    if problems:
        raise ConfigError(" ".join(problems))
    return cfg


def dump(cfg: dict[str, Any]) -> str:
    lines = [
        "# Ludora OS settings. Change them with `ludoractl set KEY value` or the console,",
        "# then `ludoractl apply`. Every value is checked; a bad one is refused, not guessed at.",
        "",
    ]
    for f in FIELDS:
        lines.append(f"# {f.help}")
        lines.append(f"{f.key}={_format(cfg[f.key])}")
        lines.append("")
    return "\n".join(lines)


def load() -> dict[str, Any]:
    """The settings, or the defaults when no settings file exists yet. A file that exists but cannot be read is an
    error, never a silent fall back to defaults: a guard that guesses its orders is worse than one that stops."""
    path = system.p(system.CONF_FILE)
    try:
        with open(path, encoding="utf-8") as fh:
            return parse(fh.read())
    except FileNotFoundError:
        return defaults()
    except OSError as err:
        raise ConfigError(f"{system.CONF_FILE} cannot be read: {err.strerror}") from None


def support_window() -> dict[str, Any] | None:
    """The open support-access window, if one is open and has not run out. Like the settings file, a window file
    that exists but cannot be read is an error, never 'no window'."""
    try:
        with open(system.p(system.SUPPORT_FILE), encoding="utf-8") as fh:
            data = json.loads(fh.read() or "null")
    except FileNotFoundError:
        return None
    except OSError as err:
        raise ConfigError(f"{system.SUPPORT_FILE} cannot be read: {err.strerror}") from None
    except ValueError:
        return None
    try:
        if not isinstance(data, dict) or float(data.get("until", 0)) <= time.time():
            return None
        if not isinstance(data.get("from"), str) or not re.fullmatch(r"[0-9A-Fa-f:./]{1,49}", data["from"]):
            return None
    except (TypeError, ValueError):
        return None
    return data


def effective(cfg: dict[str, Any]) -> dict[str, Any]:
    """The settings as the firewall, SSH and the sentinel see them: an open support window admits one more address
    to SSH, and the SSH port stops being a decoy for as long as it is open."""
    window = support_window()
    if not window:
        return cfg
    out = dict(cfg)
    out["SSH_ENABLED"] = True
    out["ADMIN_NETS_OWN"] = list(cfg["ADMIN_NETS"])   # a helper let in over SSH is not thereby let in to the staff dashboard
    out["ADMIN_NETS"] = sorted(set(cfg["ADMIN_NETS"]) | {window["from"]})
    out["TRIPWIRE_PORTS"] = [p for p in cfg["TRIPWIRE_PORTS"] if p != cfg["SSH_PORT"]]
    return out


def save(cfg: dict[str, Any]) -> None:
    problems = check(cfg)
    if problems:
        raise ConfigError(" ".join(problems))
    # The sentinel reads the settings as its own user; a rewritten file must stay readable to it.
    system.write_atomic(system.CONF_FILE, dump(cfg), 0o640, group=system.SENTINEL_GROUP)


def load_secrets(create: bool = False) -> dict[str, str]:
    """The database password and the IP-hash key. Made once, kept in a file only root can read."""
    wanted = ("POSTGRES_PASSWORD", "IP_HASH_KEY", "BACKUP_PASSPHRASE")
    found: dict[str, str] = {}
    text = system.read(system.SECRETS_FILE) or ""
    for line in text.splitlines():
        key, sep, value = line.partition("=")
        if sep and key in wanted and re.fullmatch(r"[A-Fa-f0-9]{32,128}", value):
            found[key] = value
    missing = [k for k in wanted if k not in found]
    if missing and create:
        for key in missing:
            found[key] = _secrets.token_hex(32)
        body = "# Made by Ludora OS. Keep a copy somewhere safe: backups cannot be opened without BACKUP_PASSPHRASE.\n"
        body += "".join(f"{k}={found[k]}\n" for k in wanted)
        system.write_atomic(system.SECRETS_FILE, body, 0o600)
    elif missing:
        raise ConfigError(f"{system.SECRETS_FILE} is missing {', '.join(missing)}")
    return found
