"""Paths and the one place commands are run.

Nothing in Ludora OS builds a shell string: every command is a list of
arguments, so a value from the settings file can never become a command.
Tests swap `RUNNER` for a fake and set LUDORA_OS_ROOT to a scratch directory.
"""

from __future__ import annotations

import os
import shutil
import subprocess
import tempfile
from dataclasses import dataclass

VERSION = "1.0.0"

ETC = "/etc/ludora-os"
STATE = "/var/lib/ludora-os"
RUN = "/run/ludora-os"
SHARE = "/usr/share/ludora-os"

CONF_FILE = f"{ETC}/ludora-os.conf"
SECRETS_FILE = f"{ETC}/secrets.env"
APP_ENV_FILE = f"{ETC}/app.env"
DB_ENV_FILE = f"{ETC}/db.env"
CADDYFILE = f"{ETC}/Caddyfile"
TLS_DIR = f"{ETC}/tls"
CLAIMED_FLAG = f"{ETC}/claimed"
MANIFEST_FILE = f"{STATE}/manifest.json"
IMAGES_LOCK = f"{STATE}/images.lock"
DOCTOR_FILE = f"{STATE}/doctor.json"
SUPPORT_FILE = f"{STATE}/support.json"
ALERT_SECRETS_FILE = f"{ETC}/alerts.env"   # the mail password and the Telegram bot token: root and the sentinel only
BACKUP_DIR = "/var/backups/ludora"
SRC_DIR = f"{SHARE}/src"

NFT_FILE = "/etc/nftables/ludora-os.nft"
SSHD_DROPIN = "/etc/ssh/sshd_config.d/00-ludora-os.conf"
AUTHORIZED_KEYS_DIR = "/etc/ssh/authorized_keys.d"
QUADLET_DIR = "/etc/containers/systemd"
ISSUE_FILE = "/run/issue.d/50-ludora-os.issue"

ADMIN_USER = "ludora-admin"
SUPPORT_USER = "ludora-support"
ADMIN_GROUP = "ludora-admins"
SUPPORT_GROUP = "ludora-support"
SENTINEL_GROUP = "ludora-sentinel"

# Fixed, private addresses for the containers. The firewall names them, so they must not move.
NET_INTERNAL = "10.89.10.0/24"
NET_EDGE = "10.89.20.0/24"


def root() -> str:
    """A prefix for every path, so tests never touch the real system."""
    return os.environ.get("LUDORA_OS_ROOT", "")


def p(path: str) -> str:
    return root() + path


@dataclass
class Result:
    code: int
    out: str
    err: str

    @property
    def ok(self) -> bool:
        return self.code == 0


class CommandError(RuntimeError):
    def __init__(self, argv: list[str], result: Result):
        self.argv = argv
        self.result = result
        tail = (result.err or result.out).strip().splitlines()[-3:]
        super().__init__(f"{argv[0]} failed ({result.code}): {' | '.join(tail)}")


def _real_runner(argv: list[str], input_text: str | None, timeout: float | None) -> Result:
    try:
        done = subprocess.run(argv, input=input_text, capture_output=True, text=True, timeout=timeout, check=False)
    except FileNotFoundError:
        return Result(127, "", f"{argv[0]}: not installed")
    except subprocess.TimeoutExpired:
        return Result(124, "", f"{argv[0]}: timed out after {timeout}s")
    return Result(done.returncode, done.stdout, done.stderr)


RUNNER = _real_runner


def run(argv: list[str], *, check: bool = False, input_text: str | None = None, timeout: float | None = 120) -> Result:
    """Run a command given as a list. Never a shell, never a string."""
    if not argv or not all(isinstance(a, str) for a in argv):
        raise TypeError("a command is a list of strings")
    if any("\x00" in a for a in argv):
        raise ValueError("a command argument holds a NUL byte")
    result = RUNNER(argv, input_text, timeout)
    if check and not result.ok:
        raise CommandError(argv, result)
    return result


def read(path: str, default: str | None = None) -> str | None:
    try:
        with open(p(path), encoding="utf-8") as fh:
            return fh.read()
    except (FileNotFoundError, PermissionError, IsADirectoryError):
        return default


def _give_group(path: str, group: str | None) -> None:
    if group and os.geteuid() == 0:
        try:
            shutil.chown(path, group=group)
        except (LookupError, OSError):
            pass  # the group does not exist yet (mid-install): `ludoractl apply` sets it


def write_atomic(path: str, content: str, mode: int = 0o644, group: str | None = None) -> bool:
    """Write through a temporary file in the same directory. Returns True when the content changed."""
    full = p(path)
    old = read(path)
    os.makedirs(os.path.dirname(full), exist_ok=True)
    if old == content:
        try:
            os.chmod(full, mode)
        except OSError:
            pass
        _give_group(full, group)
        return False
    fd, tmp = tempfile.mkstemp(dir=os.path.dirname(full), prefix=".ludora-")
    try:
        with os.fdopen(fd, "w", encoding="utf-8") as fh:
            fh.write(content)
            fh.flush()
            os.fsync(fh.fileno())
        os.chmod(tmp, mode)
        _give_group(tmp, group)
        os.replace(tmp, full)
    except BaseException:
        try:
            os.unlink(tmp)
        except OSError:
            pass
        raise
    return True


def exists(path: str) -> bool:
    return os.path.exists(p(path))


def is_root() -> bool:
    return os.geteuid() == 0
