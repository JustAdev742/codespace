#!/usr/bin/env python3
"""Drives the console in a pretend terminal and prints what the screen showed.

    python3 tests/console_harness.py firstboot     # the claim wizard, start to finish
    python3 tests/console_harness.py dashboard     # the dashboard and its menus

No real command is run: the child process swaps the command runner for one
with canned answers, and every file goes to a scratch directory. Needs `pyte`
(pip install pyte) for the pretend terminal. Exits 1 if an expected screen
never appeared.
"""

from __future__ import annotations

import json
import os
import pty
import select
import shutil
import struct
import sys
import tempfile
import time

HERE = os.path.dirname(os.path.abspath(__file__))
PY = os.path.join(HERE, "..", "rootfs", "usr", "lib", "ludora-os", "python")
ROWS, COLS = 30, 100


def child(mode: str) -> None:
    sys.path.insert(0, PY)
    from ludora_os import config, console, sentinel, system

    def fake(argv, input_text, timeout):
        line = " ".join(argv)
        if line.startswith("ip -j -4 addr"):
            return system.Result(0, json.dumps([{"ifname": "eth0", "addr_info": [{"local": "10.20.0.5"}]}]), "")
        if line.startswith("systemctl is-active"):
            return system.Result(0, "\n".join("inactive" if unit == "sshd.service" else "active" for unit in argv[2:]) + "\n", "")
        if line.startswith("nft -j list set inet ludora ban4"):
            return system.Result(0, json.dumps({"nftables": [{"set": {"name": "ban4", "elem": [{"elem": {"val": "10.20.3.3", "timeout": 900, "expires": 640}}]}}]}), "")
        if line.startswith("pwscore"):
            return system.Result(127, "", "")
        if line.startswith("podman image inspect"):
            return system.Result(0, "sha256:" + "ab" * 32 + "\n", "")
        if line.startswith("podman inspect"):
            return system.Result(0, "healthy\n", "")
        if line.startswith(("podman pull", "podman build", "systemctl enable --now ludora")):
            time.sleep(0.4)
        return system.Result(0, "", "")

    system.RUNNER = fake
    if mode == "dashboard":
        cfg = config.defaults()
        for key, value in {"DOMAIN": "10.20.0.5", "SERVER_NAME": "ludora-hills", "TRUSTED_NETS": "10.20.9.0/24", "OPERATOR_NAME": "Example School"}.items():
            config.set_value(cfg, key, value)
        config.save(cfg)
        config.load_secrets(create=True)
        system.write_atomic(system.CLAIMED_FLAG, "x")
        now = int(time.time())
        system.write_atomic(sentinel.STATUS_FILE, json.dumps({"at": now + 600, "level": 1, "level_name": "watchful", "shield": False, "bans": {"10.20.3.3": 640}}))
        for i, (severity, text) in enumerate([
            ("info", "Sentinel started. Watching 12 decoy listeners, SSH and the web log."),
            ("warning", "10.20.3.3 connected to decoy port 3389. Banned for 15 min."),
            ("notice", "10.20.9.10 connected to decoy port 23. Not banned: it is trusted."),
            ("notice", "Threat level: watchful."),
        ]):
            sentinel.append_event({"at": now - 300 + i * 60, "severity": severity, "kind": "demo", "text": text})
        system.write_atomic(system.DOCTOR_FILE, json.dumps({"at": now, "passed": 27, "failed": 1, "unknown": 1, "checks": []}))
        os.makedirs(system.p(system.BACKUP_DIR), exist_ok=True)
        open(system.p(f"{system.BACKUP_DIR}/ludora-20261118-021500.dump.gpg"), "w").write("x" * 4096)
    raise SystemExit(console.main(["--firstboot"] if mode == "firstboot" else []))


def drive(mode: str, script: list[tuple[str, str, str]]) -> int:
    """script: (wait for this text, label, keys to send once it shows)."""
    import pyte

    root = tempfile.mkdtemp(prefix="ludora-os-console-")
    pid, fd = pty.fork()
    if pid == 0:
        os.environ.update({"LUDORA_OS_ROOT": root, "TERM": "linux", "LINES": str(ROWS), "COLUMNS": str(COLS), "LC_ALL": "C.UTF-8"})
        os.execv(sys.executable, [sys.executable, os.path.abspath(__file__), "--child", mode])
    import fcntl
    import termios

    fcntl.ioctl(fd, termios.TIOCSWINSZ, struct.pack("HHHH", ROWS, COLS, 0, 0))
    screen = pyte.Screen(COLS, ROWS)
    stream = pyte.ByteStream(screen)
    failures = 0

    def pump(seconds: float) -> None:
        end = time.time() + seconds
        while time.time() < end:
            ready, _, _ = select.select([fd], [], [], 0.05)
            if ready:
                try:
                    data = os.read(fd, 65536)
                except OSError:
                    return
                if not data:
                    return
                stream.feed(data)

    def shown() -> str:
        return "\n".join(line.rstrip() for line in screen.display)

    try:
        for wanted, label, keys in script:
            deadline = time.time() + 25
            while wanted not in shown() and time.time() < deadline:
                pump(0.2)
            found = wanted in shown()
            failures += 0 if found else 1
            print(f"\n=== {label}{'' if found else '   << EXPECTED TEXT NOT FOUND: ' + wanted}")
            print("+" + "-" * COLS + "+")
            for line in screen.display:
                print("|" + line + "|")
            print("+" + "-" * COLS + "+")
            os.write(fd, keys.encode())
            pump(0.4)
    finally:
        try:
            os.kill(pid, 9)
        except ProcessLookupError:
            pass
        shutil.rmtree(root, ignore_errors=True)
    print(f"\n{len(script) - failures} of {len(script)} screens appeared as expected.")
    return 1 if failures else 0


ENTER, DOWN, ESC = "\r", "\x1b[B", "\x1b"

FIRSTBOOT = [
    ("This server is sealed", "Welcome", ENTER),
    ("Where will students and teachers connect from", "How people reach Ludora", ENTER),
    ("Type the name or address", "The address (default is the server's own)", ENTER),
    ("The school or person responsible", "Who runs it", "Example School" + ENTER),
    ("How people reach you about their data", "Contact", "it@example.school" + ENTER),
    ("never banned or slowed", "Staff addresses: a bad value is refused", "0.0.0.0/0" + ENTER),
    ("too wide", "Staff addresses: the complaint", "\x15" + "10.20.9.0/24" + ENTER),
    ("only these networks can open Ludora", "School networks", "10.20.0.0/16" + ENTER),
    ("One address for many students", "Shared address?", ENTER),
    ("Make the password", "Password: a weak one is refused", "hunter2" + ENTER),
    ("at least 12 characters", "Password: the complaint", "\x15" + "orbit-maple-seven-tugboat" + ENTER),
    ("Type it once more", "Password again", "orbit-maple-seven-tugboat" + ENTER),
    ("Protect the boot menu", "Boot menu", DOWN + ENTER),
    ("Ready to build Ludora", "Summary", DOWN + ENTER),
    ("Ludora is up at https://10.20.0.5", "Setting up (finished)", ENTER),
    ("Ludora is open", "Done", ENTER),
]

DASHBOARD = [
    ("Sign out", "Dashboard", ENTER),
    ("Threat level: watchful", "Security", DOWN + ENTER),
    ("10.20.3.3", "Banned addresses", ESC),
    ("Run the self-check", "Security again", ESC),
    ("Remote access", "Dashboard again", DOWN + DOWN + ENTER),
    ("Support access: closed", "Remote access", ENTER),
    ("Before SSH can be switched on", "SSH refuses to open with no key and no admin address", ENTER),
    ("Administrators' keys (0)", "Remote access again", ESC),
    ("Maintenance", "Dashboard", DOWN + ENTER),
    ("Update Ludora", "Maintenance", ESC),
]

if __name__ == "__main__":
    if len(sys.argv) >= 3 and sys.argv[1] == "--child":
        child(sys.argv[2])
    mode = sys.argv[1] if len(sys.argv) > 1 else "firstboot"
    raise SystemExit(drive(mode, FIRSTBOOT if mode == "firstboot" else DASHBOARD))
