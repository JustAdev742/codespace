"""Looking after the server: the app's image, updates with a way back, backups, certificates."""

from __future__ import annotations

import json
import os
import re
import shutil
import subprocess
import time
from typing import Any

from . import config, system

BUILD_DIR = f"{system.STATE}/build"
SERVICES = {"db": "ludora-db.service", "app": "ludora-app.service", "proxy": "ludora-proxy.service", "sentinel": "ludora-sentinel.service",
            "analyst": "ludora-analyst.service"}
_USERNAME = re.compile(r"^[A-Za-z0-9_.-]{2,40}$")
KEEP_BACKUPS = 14


class MaintainError(RuntimeError):
    pass


def _podman(*args: str, timeout: float | None = 120, check: bool = False) -> system.Result:
    return system.run(["podman", *args], timeout=timeout, check=check)


def image_exists(ref: str) -> bool:
    return _podman("image", "exists", ref).ok


def pin_images(log=print) -> dict[str, str]:
    """Pull the database and proxy images and remember exactly which ones (by digest), so they cannot change silently."""
    cfg = config.load()
    lock: dict[str, str] = {}
    for name, ref in (("db", cfg["DB_IMAGE"]), ("proxy", cfg["PROXY_IMAGE"])):
        if "@sha256:" in ref:
            lock[name] = ref
            continue
        log(f"Fetching {ref}.")
        pulled = _podman("pull", "--quiet", ref, timeout=900)
        if not pulled.ok:
            if image_exists(ref):
                # Loaded from the install media on a server with no internet: usable, but not pinned to a registry digest.
                log(f"{ref} could not be fetched; using the copy from the install media (not pinned).")
                continue
            raise MaintainError(f"{ref} could not be fetched: {pulled.err.strip()[-200:]}")
        digest = _podman("image", "inspect", "--format", "{{.Digest}}", ref).out.strip()
        if not re.fullmatch(r"sha256:[a-f0-9]{64}", digest):
            raise MaintainError(f"{ref} has no digest to pin")
        last = ref.rsplit("/", 1)[-1]
        repository = ref.rsplit(":", 1)[0] if ":" in last else ref
        lock[name] = f"{repository}@{digest}"
    system.write_atomic(system.IMAGES_LOCK, json.dumps(lock, indent=1), 0o644)
    return lock


def fetch_source(ref: str | None = None, log=print) -> str:
    """Ludora's source at the wanted version: the copy shipped with the OS, or a fresh one from the repository."""
    cfg = config.load()
    shipped = system.p(system.SRC_DIR)
    if ref is None and os.path.isfile(os.path.join(shipped, "Dockerfile")):
        return shipped
    ref = ref or cfg["APP_REF"]
    target = system.p(BUILD_DIR)
    shutil.rmtree(target, ignore_errors=True)
    os.makedirs(target, mode=0o700, exist_ok=True)
    log(f"Fetching Ludora ({ref}) from {cfg['APP_REPO']}.")
    # No shell, no credential helpers, no hooks: just the files at that version.
    clone = system.run(
        ["git", "-c", "core.hooksPath=/dev/null", "-c", "protocol.file.allow=never", "clone", "--quiet", "--depth", "1", "--no-tags", "--branch", ref, "--", cfg["APP_REPO"], target],
        timeout=900,
    )
    if not clone.ok:
        raise MaintainError(f"The source could not be fetched: {clone.err.strip()[-300:]}")
    source = os.path.join(target, "apps", "ludora")
    if not os.path.isfile(os.path.join(source, "Dockerfile")):
        raise MaintainError("That version has no apps/ludora/Dockerfile.")
    return source


def build_app(source: str, log=print) -> str:
    tag = "localhost/ludora:build-" + time.strftime("%Y%m%d-%H%M%S")
    log("Building Ludora. This takes a few minutes.")
    # --network host: the build's downloads leave through the server's own outbound rules (web ports only).
    # A build on Podman's default bridge would be stopped by the firewall, which forwards nothing it does not know.
    built = _podman("build", "--quiet", "--pull=newer", "--network", "host", "--tag", tag, source, timeout=3600)
    if not built.ok:
        raise MaintainError("The build failed: " + built.err.strip()[-600:])
    return tag


def load_bundled_images(log=print) -> bool:
    """Images carried on the install media, for a server set up without the internet."""
    bundle = system.p(f"{system.SHARE}/images")
    if not os.path.isdir(bundle):
        return False
    loaded = False
    for name in sorted(os.listdir(bundle)):
        if name.endswith(".tar"):
            log(f"Loading {name}.")
            if _podman("load", "--quiet", "--input", os.path.join(bundle, name), timeout=900).ok:
                loaded = True
    return loaded


def wait_healthy(seconds: int = 180) -> bool:
    end = time.time() + seconds
    while time.time() < end:
        state = _podman("inspect", "--format", "{{.State.Health.Status}}", "ludora-app").out.strip()
        if state == "healthy":
            return True
        time.sleep(3)
    return False


def start_stack(log=print) -> None:
    system.run(["systemctl", "daemon-reload"])
    for unit in ("ludora-db.service", "ludora-app.service", "ludora-proxy.service"):
        log(f"Starting {unit}.")
        started = system.run(["systemctl", "enable", "--now", unit], timeout=600)
        if not started.ok:
            # Quadlet units are generated, so `enable` can refuse while `start` works.
            started = system.run(["systemctl", "start", unit], timeout=600)
        if not started.ok:
            raise MaintainError(f"{unit} did not start: {started.err.strip()[-300:]}")


def install_app(ref: str | None = None, log=print) -> str:
    """First install: make `localhost/ludora:current` exist."""
    if not image_exists("localhost/ludora:current"):
        if not image_exists("localhost/ludora:bundled"):
            load_bundled_images(log)
        if image_exists("localhost/ludora:bundled"):
            _podman("tag", "localhost/ludora:bundled", "localhost/ludora:current", check=True)
    if not image_exists("localhost/ludora:current"):
        tag = build_app(fetch_source(ref, log), log)
        _podman("tag", tag, "localhost/ludora:current", check=True)
    return "localhost/ludora:current"


def update_app(ref: str | None = None, log=print) -> str:
    """Back up, build the new version, switch to it, and go back by itself if it does not come up healthy."""
    log("Backing up first.")
    backup(log)
    cfg = config.load()
    tag = build_app(fetch_source(ref or cfg["APP_REF"], log), log)
    had_previous = image_exists("localhost/ludora:current")
    if had_previous:
        _podman("tag", "localhost/ludora:current", "localhost/ludora:previous", check=True)
    _podman("tag", tag, "localhost/ludora:current", check=True)
    log("Switching to the new version. Running games end now; their results are saved.")
    system.run(["systemctl", "restart", "ludora-app.service"], timeout=600)
    if wait_healthy():
        _podman("image", "prune", "--force")
        return "Ludora is running the new version."
    if not had_previous:
        raise MaintainError("The new version did not come up healthy, and there is no earlier version to return to. See: ludoractl logs app")
    log("The new version did not come up healthy. Going back to the one before.")
    _podman("tag", "localhost/ludora:previous", "localhost/ludora:current", check=True)
    system.run(["systemctl", "restart", "ludora-app.service"], timeout=600)
    if wait_healthy():
        raise MaintainError("The update was undone: the new version failed its health check. The earlier version is running. See: ludoractl logs app")
    raise MaintainError("The update failed and the earlier version is not healthy either. Restore the backup just taken: ludoractl restore")


def update_os(log=print) -> str:
    log("Installing operating system updates.")
    done = system.run(["dnf", "-y", "--refresh", "upgrade"], timeout=3600)
    if not done.ok:
        raise MaintainError("The update did not finish: " + (done.err or done.out).strip()[-400:])
    needs = system.run(["dnf", "needs-restarting", "-r"])
    return "Updates installed. A restart is needed to finish them." if needs.code == 1 else "Updates installed."


def grant_admin(username: str) -> str:
    if not _USERNAME.match(username):
        raise MaintainError("That does not look like a Ludora user name.")
    done = _podman("exec", "ludora-app", "node", "dist/admin.js", "grant", username, "superadmin", "--reason", "first administrator (Ludora OS console)")
    if not done.ok:
        raise MaintainError((done.err or done.out).strip()[-300:] or "The account could not be granted the role.")
    return f"{username} is now a super administrator in Ludora."


def proxy_ca() -> tuple[str, str]:
    """The proxy's own root certificate (TLS_MODE=internal), and its fingerprint."""
    cert = _podman("exec", "ludora-proxy", "cat", "/data/caddy/pki/authorities/local/root.crt")
    if not cert.ok or "BEGIN CERTIFICATE" not in cert.out:
        raise MaintainError("There is no internal certificate authority yet. It appears after the proxy has started with TLS_MODE=internal.")
    finger = system.run(["openssl", "x509", "-noout", "-fingerprint", "-sha256"], input_text=cert.out)
    return cert.out, finger.out.strip().split("=", 1)[-1] if finger.ok else ""


# ---- backups ---------------------------------------------------------------------------------


def _encrypt_stream(argv: list[str], target: str, passphrase: str) -> None:
    """Run a command and write its output to `target`, encrypted. The passphrase travels on a pipe, never on a command line."""
    read_fd, write_fd = os.pipe()
    partial = target + ".partial"
    try:
        source = subprocess.Popen(argv, stdout=subprocess.PIPE, stderr=subprocess.PIPE)
        gpg = subprocess.Popen(
            ["gpg", "--batch", "--yes", "--quiet", "--no-tty", "--pinentry-mode", "loopback", "--symmetric", "--cipher-algo", "AES256",
             "--passphrase-fd", str(read_fd), "--output", partial],
            stdin=source.stdout, stderr=subprocess.PIPE, pass_fds=(read_fd,),
        )
        assert source.stdout is not None
        source.stdout.close()
        os.close(read_fd)
        read_fd = -1
        os.write(write_fd, passphrase.encode() + b"\n")
        os.close(write_fd)
        write_fd = -1
        gpg_err = gpg.communicate()[1]
        source_err = source.stderr.read() if source.stderr else b""
        source.wait()
        if source.returncode != 0:
            raise MaintainError(f"{argv[0]} failed: {source_err.decode(errors='replace').strip()[-300:]}")
        if gpg.returncode != 0:
            raise MaintainError(f"Encryption failed: {gpg_err.decode(errors='replace').strip()[-300:]}")
        os.chmod(partial, 0o600)
        os.replace(partial, target)
    finally:
        for fd in (read_fd, write_fd):
            if fd >= 0:
                os.close(fd)
        if os.path.exists(partial):
            os.unlink(partial)


def _decrypt_stream(source_file: str, argv: list[str], passphrase: str) -> None:
    read_fd, write_fd = os.pipe()
    try:
        gpg = subprocess.Popen(
            ["gpg", "--batch", "--quiet", "--no-tty", "--pinentry-mode", "loopback", "--decrypt", "--passphrase-fd", str(read_fd), source_file],
            stdout=subprocess.PIPE, stderr=subprocess.PIPE, pass_fds=(read_fd,),
        )
        os.close(read_fd)
        read_fd = -1
        os.write(write_fd, passphrase.encode() + b"\n")
        os.close(write_fd)
        write_fd = -1
        sink = subprocess.Popen(argv, stdin=gpg.stdout, stdout=subprocess.PIPE, stderr=subprocess.PIPE)
        assert gpg.stdout is not None
        gpg.stdout.close()
        sink_err = sink.communicate()[1]
        gpg_err = gpg.stderr.read() if gpg.stderr else b""
        gpg.wait()
        if gpg.returncode != 0:
            raise MaintainError(f"The backup could not be opened: {gpg_err.decode(errors='replace').strip()[-300:]}")
        if sink.returncode != 0:
            raise MaintainError(f"{argv[0]} failed: {sink_err.decode(errors='replace').strip()[-300:]}")
    finally:
        for fd in (read_fd, write_fd):
            if fd >= 0:
                os.close(fd)


def backups() -> list[dict[str, Any]]:
    folder = system.p(system.BACKUP_DIR)
    out: list[dict[str, Any]] = []
    try:
        names = sorted(os.listdir(folder), reverse=True)
    except FileNotFoundError:
        return out
    for name in names:
        m = re.fullmatch(r"ludora-(\d{8}-\d{6})\.dump\.gpg", name)
        if m:
            path = os.path.join(folder, name)
            uploads = os.path.join(folder, f"uploads-{m.group(1)}.tar.gz.gpg")
            out.append({"stamp": m.group(1), "database": path, "uploads": uploads if os.path.exists(uploads) else None,
                        "size": os.path.getsize(path), "age_hours": round((time.time() - os.path.getmtime(path)) / 3600, 1)})
    return out


def backup(log=print) -> dict[str, Any]:
    """The database and the uploaded pictures, encrypted, with the newest 14 kept."""
    passphrase = config.load_secrets()["BACKUP_PASSPHRASE"]
    folder = system.p(system.BACKUP_DIR)
    os.makedirs(folder, mode=0o700, exist_ok=True)
    os.chmod(folder, 0o700)
    stamp = time.strftime("%Y%m%d-%H%M%S", time.gmtime())
    database = os.path.join(folder, f"ludora-{stamp}.dump.gpg")
    uploads = os.path.join(folder, f"uploads-{stamp}.tar.gz.gpg")
    _encrypt_stream(["podman", "exec", "ludora-db", "pg_dump", "-U", "ludora", "-d", "ludora", "--format=custom"], database, passphrase)
    _encrypt_stream(["podman", "exec", "ludora-app", "tar", "-C", "/data", "-czf", "-", "uploads"], uploads, passphrase)
    for old in backups()[KEEP_BACKUPS:]:
        for path in (old["database"], old["uploads"]):
            if path and os.path.exists(path):
                os.unlink(path)
    log(f"Backed up to {database}.")
    return {"stamp": stamp, "database": database, "uploads": uploads}


def restore(stamp: str | None = None, log=print) -> str:
    """Put a backup back. Everything in the database is replaced."""
    available = backups()
    if not available:
        raise MaintainError("There are no backups to restore.")
    chosen = available[0] if stamp is None else next((b for b in available if b["stamp"] == stamp), None)
    if chosen is None:
        raise MaintainError("There is no backup with that date.")
    passphrase = config.load_secrets()["BACKUP_PASSPHRASE"]
    log("Stopping the app.")
    system.run(["systemctl", "stop", "ludora-app.service"], timeout=120)
    try:
        log(f"Restoring the database from {chosen['stamp']}.")
        _decrypt_stream(chosen["database"], ["podman", "exec", "-i", "ludora-db", "pg_restore", "-U", "ludora", "-d", "ludora", "--clean", "--if-exists", "--no-owner"], passphrase)
    finally:
        system.run(["systemctl", "start", "ludora-app.service"], timeout=600)
    if chosen["uploads"]:
        log("Restoring uploaded pictures.")
        _decrypt_stream(chosen["uploads"], ["podman", "exec", "-i", "ludora-app", "sh", "-c", "rm -rf /data/uploads/* && tar -C /data -xzf -"], passphrase)
    return f"Restored the backup from {chosen['stamp']}."


def usb_init(log=print) -> str:
    """Trust the USB devices plugged in right now, allow one keyboard, and refuse everything else from here on."""
    generated = system.run(["usbguard", "generate-policy"])
    if not generated.ok:
        raise MaintainError("USBGuard could not list the devices: " + generated.err.strip()[-200:])
    rules = "# Written by `ludoractl usb init`. Devices present at setup are allowed by identity.\n" + generated.out.strip() + "\n"
    rules += "\n# One keyboard at a time may be plugged in later (so the console stays usable). Storage and everything else is refused.\n"
    rules += "# A 'keyboard' that is also a network card, a modem or a disk is the classic attack device: refused outright.\n"
    rules += "reject with-interface one-of { 02:*:* 08:*:* 0a:*:* e0:*:* ef:*:* }\n"
    rules += "allow with-interface one-of { 03:00:01 03:01:01 } if !allowed-matches(with-interface one-of { 03:00:01 03:01:01 })\n"
    system.write_atomic("/etc/usbguard/rules.conf", rules, 0o600)
    system.run(["systemctl", "enable", "--now", "usbguard.service"])
    system.run(["systemctl", "restart", "usbguard.service"])
    return "USB is locked down: the devices plugged in now are trusted, new storage devices are refused."
