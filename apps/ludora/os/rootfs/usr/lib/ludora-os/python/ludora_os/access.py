"""Who may connect: administrators' SSH keys, and short-lived support access."""

from __future__ import annotations

import base64
import binascii
import hashlib
import ipaddress
import json
import os
import re
import struct
import time
import urllib.request
from dataclasses import dataclass
from typing import Any

from . import apply as applier
from . import config, system

ALLOWED_TYPES = {
    "ssh-ed25519",
    "sk-ssh-ed25519@openssh.com",
    "ecdsa-sha2-nistp256",
    "ecdsa-sha2-nistp384",
    "ecdsa-sha2-nistp521",
    "sk-ecdsa-sha2-nistp256@openssh.com",
    "ssh-rsa",
}
_GITHUB_USER = re.compile(r"^[A-Za-z0-9](?:[A-Za-z0-9-]{0,37}[A-Za-z0-9])?$")
ADMIN_KEYS = f"{system.AUTHORIZED_KEYS_DIR}/{system.ADMIN_USER}"
SUPPORT_KEYS = f"{system.AUTHORIZED_KEYS_DIR}/{system.SUPPORT_USER}"

# What a support session may run. Nothing else, and no shell.
SUPPORT_VERBS: dict[str, list[str]] = {
    "status": ["status"],
    "status --json": ["status", "--json"],
    "doctor": ["doctor"],
    "doctor --json": ["doctor", "--json"],
    "events": ["events"],
    "bans": ["bans"],
    "logs app": ["logs", "app"],
    "logs db": ["logs", "db"],
    "logs proxy": ["logs", "proxy"],
    "logs sentinel": ["logs", "sentinel"],
    "restart app": ["restart", "app"],
    "backup": ["backup"],
    "update app": ["update", "app"],
    "update os": ["update", "os"],
}


class AccessError(ValueError):
    pass


@dataclass(frozen=True)
class Key:
    kind: str
    blob: str
    comment: str
    fingerprint: str
    bits: int

    def line(self) -> str:
        return f"{self.kind} {self.blob} {self.comment}".rstrip()


def _read_string(data: bytes, at: int) -> tuple[bytes, int]:
    if at + 4 > len(data):
        raise AccessError("that is not a complete public key")
    (size,) = struct.unpack(">I", data[at : at + 4])
    end = at + 4 + size
    if size > 8192 or end > len(data):
        raise AccessError("that is not a complete public key")
    return data[at + 4 : end], end


def parse_public_key(line: str) -> Key:
    """Accept exactly `type base64 [comment]`. Options in front of a key are never taken from outside."""
    line = line.strip()
    if "\n" in line or "\r" in line or len(line) > 4000:
        raise AccessError("paste one public key, on one line")
    parts = line.split(None, 2)
    if len(parts) < 2:
        raise AccessError("a public key looks like: ssh-ed25519 AAAA... name")
    kind, blob = parts[0], parts[1]
    if kind not in ALLOWED_TYPES:
        raise AccessError(f"key type {kind!r} is not accepted (use ssh-ed25519, or a security-key type)")
    try:
        raw = base64.b64decode(blob, validate=True)
    except (binascii.Error, ValueError):
        raise AccessError("the key's middle part is not valid base64") from None
    inner, at = _read_string(raw, 0)
    if inner.decode("ascii", "replace") != kind:
        raise AccessError("the key does not match the type written in front of it")
    bits = 0
    if kind == "ssh-rsa":
        _, at = _read_string(raw, at)
        modulus, _ = _read_string(raw, at)
        bits = len(modulus.lstrip(b"\x00")) * 8
        if bits < 3072:
            raise AccessError(f"this RSA key is {bits} bits; 3072 or more is required (ed25519 is better)")
    comment = re.sub(r"[^A-Za-z0-9@._+-]", "", parts[2] if len(parts) > 2 else "")[:64]
    fingerprint = "SHA256:" + base64.b64encode(hashlib.sha256(raw).digest()).decode().rstrip("=")
    return Key(kind, base64.b64encode(raw).decode(), comment, fingerprint, bits)


def _keys_in(path: str) -> list[Key]:
    out: list[Key] = []
    for line in (system.read(path) or "").splitlines():
        line = line.strip()
        if not line or line.startswith("#"):
            continue
        for kind in ALLOWED_TYPES:  # skip any options written in front of the key
            at = line.find(kind + " ")
            if at >= 0:
                try:
                    out.append(parse_public_key(line[at:]))
                except AccessError:
                    pass
                break
    return out


def admin_keys() -> list[Key]:
    return _keys_in(ADMIN_KEYS)


def _write_admin(keys: list[Key]) -> None:
    body = "# Administrators' SSH keys. Managed by `ludoractl admin`; only root can write here.\n"
    body += "".join(key.line() + "\n" for key in keys)
    system.write_atomic(ADMIN_KEYS, body, 0o644)


def add_admin_key(line: str) -> Key:
    key = parse_public_key(line)
    keys = admin_keys()
    if any(k.fingerprint == key.fingerprint for k in keys):
        raise AccessError("that key is already installed")
    if len(keys) >= 20:
        raise AccessError("there are already 20 keys; remove one first")
    _write_admin(keys + [key])
    return key


def remove_admin_key(fingerprint: str) -> Key:
    keys = admin_keys()
    match = [k for k in keys if k.fingerprint == fingerprint or k.fingerprint.endswith(fingerprint)]
    if len(match) != 1:
        raise AccessError("no single key has that fingerprint")
    _write_admin([k for k in keys if k is not match[0]])
    return match[0]


def github_keys(user: str) -> list[Key]:
    if not _GITHUB_USER.match(user):
        raise AccessError("that is not a GitHub user name")
    request = urllib.request.Request(f"https://github.com/{user}.keys", headers={"User-Agent": "ludora-os"})
    try:
        with urllib.request.urlopen(request, timeout=15) as response:  # noqa: S310 - fixed https host
            text = response.read(64_000).decode("utf-8", "replace")
    except Exception as err:
        raise AccessError(f"GitHub could not be reached: {err}") from None
    keys: list[Key] = []
    for line in text.splitlines():
        try:
            keys.append(parse_public_key(f"{line.strip()} github-{user}"))
        except AccessError:
            continue
    if not keys:
        raise AccessError(f"{user} has no usable public keys on GitHub")
    return keys


# ---- support access ----------------------------------------------------------------------


def support_status() -> dict[str, Any] | None:
    return applier.support_window()


def support_open(key_line: str, hours: float, source: str, *, log=print) -> dict[str, Any]:
    """Let one key, from one address, run the fixed support commands until a set time."""
    if not applier.claimed():
        raise AccessError("finish the first-boot setup first")
    if not 0.25 <= hours <= 72:
        raise AccessError("support access lasts from 15 minutes to 72 hours")
    key = parse_public_key(key_line)
    try:
        if not re.fullmatch(r"[0-9A-Fa-f:./]{1,49}", source):
            raise ValueError(source)  # no IPv6 zone: it can hold any characters, and this goes into SSH's key file
        net = ipaddress.ip_network(source, strict=False)
    except ValueError:
        raise AccessError("give the address the helper connects from, such as 203.0.113.7") from None
    floor = 24 if net.version == 4 else 64
    if net.prefixlen < floor:
        raise AccessError(f"that is too wide for support access: use /{floor} or narrower")
    if net.version == 6 and not config.load()["IPV6"]:
        raise AccessError("IPv6 is switched off on this server")
    until = time.time() + hours * 3600
    stamp = time.strftime("%Y%m%d%H%M%S", time.localtime(until))
    options = f'restrict,pty,expiry-time="{stamp}",from="{net}"'
    body = "# Support access. Written by `ludoractl support open`; removed when it runs out.\n"
    body += f"{options} {key.kind} {key.blob} ludora-support\n"
    system.write_atomic(SUPPORT_KEYS, body, 0o644)
    window = {"until": until, "from": str(net), "fingerprint": key.fingerprint, "opened": time.time()}
    system.write_atomic(system.SUPPORT_FILE, json.dumps(window), 0o644)  # the sentinel reads it; nothing in it is secret
    applier.apply(log=log)
    return window


def support_close(*, log=print) -> bool:
    was_open = system.exists(system.SUPPORT_FILE) or system.exists(SUPPORT_KEYS)
    for path in (SUPPORT_KEYS, system.SUPPORT_FILE):
        try:
            os.unlink(system.p(path))
        except FileNotFoundError:
            pass
    system.run(["pkill", "-KILL", "-u", system.SUPPORT_USER])
    if was_open:
        applier.apply(log=log)
    return was_open


def sweep(*, log=print) -> bool:
    """Close a support window that has run out. Called every couple of minutes by a timer."""
    if system.exists(system.SUPPORT_FILE) and applier.support_window() is None:
        support_close(log=log)
        return True
    return False
