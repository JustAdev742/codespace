"""The server examines itself: is every protection still in place?

Each check answers pass, fail or unknown (the tool to ask was not there).
Nothing here changes the system. The sentinel's timer runs it every hour and
the console shows the score, so a protection that quietly stopped is noticed.
"""

from __future__ import annotations

import json
import os
import re
import shutil
import time
from typing import Any, Callable

from . import alerts, apply as applier
from . import config, maintain, sentinel, system

Check = tuple[str, str, str]  # state, title, detail


def _active(unit: str) -> bool | None:
    result = system.run(["systemctl", "is-active", unit])
    if result.code == 127:
        return None
    return result.out.strip() == "active"


def _sysctl(key: str) -> str | None:
    return (system.read("/proc/sys/" + key.replace(".", "/")) or "").strip() or None


def _state(ok: bool | None) -> str:
    return "unknown" if ok is None else ("pass" if ok else "fail")


def _selinux() -> Check:
    mode = system.run(["getenforce"])
    if mode.code == 127:
        return ("unknown", "SELinux is enforcing", "getenforce is not installed")
    return (_state(mode.out.strip() == "Enforcing"), "SELinux is enforcing", mode.out.strip() or "no answer")


def _firewall() -> Check:
    result = system.run(["nft", "-j", "list", "chain", "inet", "ludora", "input"])
    if result.code == 127:
        return ("unknown", "The firewall is loaded and refuses by default", "nft is not installed")
    try:
        chains = [i["chain"] for i in json.loads(result.out)["nftables"] if "chain" in i]
        ok = bool(chains) and chains[0].get("policy") == "drop"
    except (ValueError, KeyError):
        ok = False
    if ok and system.run(["nft", "list", "chain", "inet", "ludora", "failsafe"]).ok:
        return ("fail", "The firewall is loaded and refuses by default", "only the emergency rules are loaded, which refuse everyone: run `ludoractl apply` and read its error")
    return (_state(ok), "The firewall is loaded and refuses by default", "the ludora table's input chain drops what it does not know" if ok else "the ludora firewall table is not loaded: run `ludoractl apply`")


def _root_locked() -> Check:
    shadow = system.read("/etc/shadow")
    if shadow is None:
        return ("unknown", "The root account cannot sign in", "the password file could not be read (run as root)")
    for line in shadow.splitlines():
        parts = line.split(":")
        if parts[0] == "root" and len(parts) > 1:
            locked = parts[1].startswith(("!", "*"))
            return (_state(locked), "The root account cannot sign in", "locked" if locked else "root has a usable password")
    return ("fail", "The root account cannot sign in", "no root entry found")


def _empty_passwords() -> Check:
    shadow = system.read("/etc/shadow")
    if shadow is None:
        return ("unknown", "No account has an empty password", "the password file could not be read")
    empty = [line.split(":")[0] for line in shadow.splitlines() if line.count(":") >= 2 and line.split(":")[1] == ""]
    return (_state(not empty), "No account has an empty password", ", ".join(empty) or "none")


def _uid_zero() -> Check:
    passwd = system.read("/etc/passwd") or ""
    extra = [line.split(":")[0] for line in passwd.splitlines() if line.count(":") >= 3 and line.split(":")[2] == "0" and line.split(":")[0] != "root"]
    return (_state(not extra), "Only root has user id 0", ", ".join(extra) or "only root")


def _ssh(cfg: dict[str, Any]) -> Check:
    live = applier.effective(cfg)
    running = _active("sshd.service")
    if running is None:
        return ("unknown", "SSH matches the settings", "systemctl is not available")
    wanted = bool(live["SSH_ENABLED"]) and applier.claimed()
    if running != wanted:
        return ("fail", "SSH matches the settings", f"sshd is {'running' if running else 'stopped'} but the settings say {'on' if wanted else 'off'}")
    if not running:
        return ("pass", "SSH matches the settings", "SSH is off; the server is managed from its own screen")
    effective = system.run(["sshd", "-T"]).out.lower()
    need = ["passwordauthentication no", "permitrootlogin no", "kbdinteractiveauthentication no", "allowtcpforwarding no", "x11forwarding no"]
    missing = [n for n in need if n not in effective]
    return (_state(not missing), "SSH matches the settings", "keys only, no root, no forwarding" if not missing else "not in effect: " + "; ".join(missing))


def _listeners(cfg: dict[str, Any]) -> Check:
    result = system.run(["ss", "-H", "-tuln"])
    if not result.ok:
        return ("unknown", "Nothing unexpected is listening", "ss is not available")
    expected = set(cfg["TRIPWIRE_PORTS"]) | {cfg["SSH_PORT"], 68, 546}
    odd: list[str] = []
    for line in result.out.splitlines():
        parts = line.split()
        if len(parts) < 5:
            continue
        address, _, port = parts[4].rpartition(":")
        address = address.strip("[]").split("%")[0]
        if address.startswith(("127.", "::1", "10.89.")) or not port.isdigit():
            continue
        if int(port) not in expected:
            odd.append(f"{parts[0]} {parts[4]}")
    return (_state(not odd), "Nothing unexpected is listening", ", ".join(sorted(set(odd))[:8]) or "only the decoy ports and what the settings allow")


def _sysctls() -> Check:
    wanted = {
        "kernel.kptr_restrict": ("2",), "kernel.dmesg_restrict": ("1",), "kernel.unprivileged_bpf_disabled": ("1", "2"),
        "kernel.yama.ptrace_scope": ("1", "2", "3"), "net.ipv4.tcp_syncookies": ("1",), "net.ipv4.conf.all.accept_redirects": ("0",),
        "net.ipv4.conf.all.send_redirects": ("0",), "net.ipv4.conf.all.accept_source_route": ("0",), "fs.suid_dumpable": ("0",),
        "fs.protected_symlinks": ("1",), "fs.protected_hardlinks": ("1",), "kernel.sysrq": ("0",),
    }
    wrong = []
    seen = 0
    for key, good in wanted.items():
        value = _sysctl(key)
        if value is None:
            continue
        seen += 1
        if value not in good:
            wrong.append(f"{key}={value}")
    if not seen:
        return ("unknown", "Kernel hardening settings are in effect", "the kernel's settings could not be read")
    return (_state(not wrong), "Kernel hardening settings are in effect", ", ".join(wrong) or f"{seen} settings checked")


def _encrypted() -> Check:
    result = system.run(["lsblk", "-J", "-o", "NAME,TYPE"])
    if not result.ok:
        return ("unknown", "The disk is encrypted", "lsblk is not available")
    ok = '"type": "crypt"' in result.out or '"type":"crypt"' in result.out
    return (_state(ok), "The disk is encrypted", "a LUKS volume is in use" if ok else "no encrypted volume: a stolen disk can be read")


def _unit(unit: str, title: str, hint: str = "") -> Callable[[], Check]:
    def run() -> Check:
        state = _active(unit)
        return (_state(state), title, "running" if state else (hint or f"{unit} is not running"))

    return run


def _time_sync() -> Check:
    result = system.run(["chronyc", "-n", "tracking"])
    if not result.ok:
        return ("unknown", "The clock is synchronised", "chronyc is not available")
    ok = "Leap status     : Normal" in result.out
    return (_state(ok), "The clock is synchronised", "in step with a time server" if ok else "not synchronised (certificates and logs depend on the clock)")


def _updates() -> Check:
    result = system.run(["dnf", "-q", "check-update"], timeout=300)
    if result.code == 127:
        return ("unknown", "Operating system updates are installed", "dnf is not available")
    if result.code == 0:
        return ("pass", "Operating system updates are installed", "nothing waiting")
    if result.code == 100:
        count = len([line for line in result.out.splitlines() if re.match(r"^\S+\.\S+\s+\S+\s+\S+", line)])
        timer = _active("dnf-automatic.timer")
        return (_state(bool(timer)), "Operating system updates are installed", f"{count} waiting; " + ("they install themselves tonight" if timer else "automatic updates are OFF: run `ludoractl update os`"))
    return ("unknown", "Operating system updates are installed", "the update check could not run (no network?)")


def _restart_needed() -> Check:
    result = system.run(["dnf", "needs-restarting", "-r"], timeout=120)
    if result.code not in (0, 1):
        return ("unknown", "No restart is waiting", "could not tell")
    return (_state(result.code == 0), "No restart is waiting", "none" if result.code == 0 else "a security update needs a restart to take effect")


def _app_health() -> Check:
    if not applier.claimed():
        return ("unknown", "Ludora answers its health check", "the server has not been set up yet")
    state = system.run(["podman", "inspect", "--format", "{{.State.Health.Status}}", "ludora-app"]).out.strip()
    return (_state(state == "healthy"), "Ludora answers its health check", state or "the app container is not there")


def _sentinel_fresh() -> Check:
    try:
        status = json.loads(system.read(sentinel.STATUS_FILE) or "{}")
        age = time.time() - float(status.get("at", 0))
    except ValueError:
        age = 1e9
    return (_state(age < 120), "The sentinel is watching", f"last report {int(age)}s ago" if age < 1e8 else "no report from the sentinel")


def _backups() -> Check:
    if not applier.claimed():
        return ("unknown", "A backup was made in the last day and a half", "the server has not been set up yet")
    found = maintain.backups()
    if not found:
        return ("fail", "A backup was made in the last day and a half", "there are no backups yet: run `ludoractl backup`")
    return (_state(found[0]["age_hours"] < 36), "A backup was made in the last day and a half", f"newest is {found[0]['age_hours']} hours old; {len(found)} kept")


def _disk() -> Check:
    worst = 0
    where = "/"
    for mount in ("/", "/var", "/var/log"):
        try:
            usage = shutil.disk_usage(system.p(mount) or "/")
        except OSError:
            continue
        percent = round(100 * usage.used / usage.total)
        if percent > worst:
            worst, where = percent, mount
    return (_state(worst < 85), "There is room on the disk", f"{where} is {worst}% full")


def _drift() -> Check:
    changed = applier.drift()
    return (_state(not changed), "Generated files match the settings", "; ".join(changed[:4]) or "no file was changed outside ludoractl")


def _world_writable() -> Check:
    result = system.run(["find", "/etc", "/usr", "/boot", "-xdev", "-type", "f", "-perm", "-0002"], timeout=300)
    if result.code == 127:
        return ("unknown", "No system file is writable by everyone", "find is not available")
    found = [line for line in result.out.splitlines() if line]
    return (_state(not found), "No system file is writable by everyone", ", ".join(found[:5]) or "none")


def _foreign_suid() -> Check:
    result = system.run(["find", "/", "-xdev", "-type", "f", "-perm", "-4000"], timeout=300)
    if result.code == 127:
        return ("unknown", "Every set-uid program came from a signed package", "find is not available")
    files = [line for line in result.out.splitlines() if line]
    if not files:
        return ("pass", "Every set-uid program came from a signed package", "none found")
    owned = system.run(["rpm", "-qf", "--", *files[:200]])
    if owned.code == 127:
        return ("unknown", "Every set-uid program came from a signed package", "rpm is not available")
    foreign = [line.split()[1] for line in owned.out.splitlines() if "is not owned by any package" in line]
    return (_state(not foreign), "Every set-uid program came from a signed package", ", ".join(foreign[:5]) or f"{len(files)} programs, all from packages")


def _admin_password() -> Check:
    shadow = system.read("/etc/shadow")
    if shadow is None:
        return ("unknown", "The administrator has a password", "the password file could not be read")
    for line in shadow.splitlines():
        parts = line.split(":")
        if parts[0] == system.ADMIN_USER and len(parts) > 1:
            ok = bool(parts[1]) and not parts[1].startswith(("!", "*"))
            return (_state(ok), "The administrator has a password", "set" if ok else "not set: finish the first-boot setup")
    return ("fail", "The administrator has a password", f"there is no {system.ADMIN_USER} account")


def _grub() -> Check:
    if not os.path.isdir(system.p("/boot/grub2")):
        return ("unknown", "The boot menu needs a password to edit", "this machine has no GRUB folder")
    ok = system.exists("/boot/grub2/user.cfg")
    return (_state(ok), "The boot menu needs a password to edit", "set" if ok else "anyone at the keyboard can edit the boot line: set one in the console")


def _images() -> Check:
    lock = applier.images_lock()
    ok = "db" in lock and "proxy" in lock
    return (_state(ok), "Container images are pinned to exact versions", "database and proxy pinned by digest" if ok else "not pinned yet: run `ludoractl images pin`")


def _failed_units() -> Check:
    result = system.run(["systemctl", "--failed", "--no-legend", "--plain"])
    if result.code == 127:
        return ("unknown", "No service has failed", "systemctl is not available")
    names = [line.split()[0] for line in result.out.splitlines() if line.strip()]
    return (_state(not names), "No service has failed", ", ".join(names[:6]) or "none")


def _aide() -> Check:
    text = system.read(f"{system.STATE}/aide-last")
    if text is None:
        return ("unknown", "System files are unchanged since the last baseline", "no integrity check has run yet")
    ok = text.strip().startswith("ok")
    return (_state(ok), "System files are unchanged since the last baseline", text.strip()[:160])


def _ctrl_alt_del() -> Check:
    result = system.run(["systemctl", "is-enabled", "ctrl-alt-del.target"])
    if result.code == 127:
        return ("unknown", "Ctrl-Alt-Del does not restart the server", "systemctl is not available")
    return (_state(result.out.strip() == "masked"), "Ctrl-Alt-Del does not restart the server", result.out.strip() or "unknown")


def _alerts(cfg: dict[str, Any]) -> Check:
    title = "Someone is told when something happens"
    lists = {label: alerts.recipients(cfg, audience) for audience, (_, label) in alerts.AUDIENCES.items()}
    if not lists["Security"]:
        return ("unknown", title, "nobody is on the security alert list, so an attack would only show on this screen: `ludoractl set ALERT_SECURITY_TO you@school.example`")
    found = alerts.problems(cfg)
    if found:
        return ("fail", title, " ".join(found))
    return ("pass", title, ", ".join(f"{label.lower()}: {len(to)}" for label, to in lists.items()) + " (`ludoractl alerts test` sends a test)")


def _dash(cfg: dict[str, Any]) -> Check:
    title = "The staff dashboard is closed, or properly guarded"
    if not cfg["DASH_ENABLED"]:
        return ("pass", title, "it is off and its port is closed")
    from . import dash
    auth = dash.load_auth()
    if not auth.get("password"):
        return ("fail", title, "it is on with no password: `ludoractl dash password`, or `ludoractl dash off`")
    info = os.stat(system.p(dash.AUTH_FILE))
    if info.st_mode & 0o007:
        return ("fail", title, f"{dash.AUTH_FILE} can be read by everyone: run `ludoractl dash password` again")
    extra = "with an authenticator code" if auth.get("totp") else "password only: `ludoractl dash code on` adds an authenticator code"
    return ("pass", title, f"open to the staff addresses only, {extra}")


def run_all() -> dict[str, Any]:
    cfg = config.load()
    checks: list[Callable[[], Check]] = [
        _selinux, _firewall, _root_locked, _empty_passwords, _uid_zero, _admin_password, lambda: _ssh(cfg), lambda: _listeners(cfg),
        _sysctls, _encrypted, _grub, _ctrl_alt_del,
        _unit("auditd.service", "Security auditing is recording"),
        _unit("usbguard.service", "USB devices are restricted", "USBGuard is not running: run `ludoractl usb init`"),
        _unit("ludora-sentinel.service", "The sentinel is running"),
        _sentinel_fresh, _time_sync,
        _unit("dnf-automatic.timer", "Automatic updates are scheduled"),
        _updates, _restart_needed, _images, _app_health, _backups, _disk, _drift, _world_writable, _foreign_suid, _aide, _failed_units,
        lambda: _alerts(cfg), lambda: _dash(cfg),
    ]
    results = []
    for check in checks:
        try:
            state, title, detail = check()
        except Exception as err:  # one broken check must not hide the others
            state, title, detail = "unknown", getattr(check, "__name__", "check").strip("_"), f"the check itself failed: {err}"
        results.append({"state": state, "title": title, "detail": detail})
    passed = sum(1 for r in results if r["state"] == "pass")
    failed = sum(1 for r in results if r["state"] == "fail")
    report = {"at": int(time.time()), "passed": passed, "failed": failed, "unknown": len(results) - passed - failed, "checks": results}
    try:
        system.write_atomic(system.DOCTOR_FILE, json.dumps(report, indent=1), 0o644)
    except OSError:
        pass
    return report


def last() -> dict[str, Any] | None:
    try:
        return json.loads(system.read(system.DOCTOR_FILE) or "null")
    except ValueError:
        return None
