"""Puts the settings into effect, and notices when something changed behind its back."""

from __future__ import annotations

import hashlib
import json
import os
import tempfile
from typing import Any

from . import analyst, config, render, sentinel, system


class ApplyError(RuntimeError):
    pass


def claimed() -> bool:
    return system.exists(system.CLAIMED_FLAG)


support_window = config.support_window
effective = config.effective


def images_lock() -> dict[str, str]:
    try:
        data = json.loads(system.read(system.IMAGES_LOCK) or "{}")
    except ValueError:
        return {}
    return {k: v for k, v in data.items() if k in ("db", "proxy") and isinstance(v, str) and "@sha256:" in v}


def rendered(cfg: dict[str, Any], *, bans: dict[str, int] | None = None, shield: bool | None = None) -> dict[str, tuple[str, int]]:
    """Every generated file: path -> (content, mode)."""
    live = effective(cfg)
    secrets = config.load_secrets(create=True)
    if shield is None:
        shield = cfg["SHIELD"] == "on" or (cfg["SHIELD"] == "auto" and system.exists(sentinel.SHIELD_FLAG))
    files: dict[str, tuple[str, int]] = {
        system.NFT_FILE: (render.nftables(live, bans=bans, shield=shield, sealed=not claimed()), 0o600),
        system.SSHD_DROPIN: (render.sshd(live), 0o600),
        system.CADDYFILE: (render.caddyfile(cfg), 0o644),
        system.APP_ENV_FILE: (render.app_env(cfg, secrets), 0o600),
        system.DB_ENV_FILE: (render.db_env(secrets), 0o600),
        "/etc/sysctl.d/91-ludora-os-ipv6.conf": (
            render.HEADER + f"net.ipv6.conf.all.disable_ipv6 = {0 if cfg['IPV6'] else 1}\nnet.ipv6.conf.default.disable_ipv6 = {0 if cfg['IPV6'] else 1}\n"
            + f"net.ipv6.conf.all.accept_ra = {1 if cfg['IPV6'] else 0}\nnet.ipv6.conf.default.accept_ra = {1 if cfg['IPV6'] else 0}\n",
            0o644,
        ),
    }
    files["/etc/dnf/automatic.conf"] = (render.dnf_automatic(cfg), 0o644)
    images = images_lock()
    built = analyst.image()
    if built:
        images["analyst"] = built
    for name, content in render.quadlets(cfg, images).items():
        files[f"{system.QUADLET_DIR}/{name}"] = (content, 0o644)
    return files


def _digest(text: str) -> str:
    return hashlib.sha256(text.encode()).hexdigest()


def check_firewall(text: str) -> None:
    """Ask the kernel's own parser whether the ruleset is valid, without loading it."""
    with tempfile.NamedTemporaryFile("w", suffix=".nft", delete=False) as fh:
        fh.write(text)
        path = fh.name
    try:
        result = system.run(["nft", "-c", "-f", path])
    finally:
        os.unlink(path)
    if result.code == 127:
        return  # nftables is not installed here (a build machine); the server always has it
    if not result.ok:
        raise ApplyError("The firewall rules did not pass the kernel's check, so nothing was changed: " + (result.err.strip().splitlines() or ["unknown error"])[0])


def sshd_check() -> system.Result:
    """Have sshd read its whole configuration. Before the first boot there are no host keys yet, so lend it a throwaway one."""
    with tempfile.TemporaryDirectory(prefix="ludora-sshd-") as folder:
        key = os.path.join(folder, "check_key")
        made = system.run(["ssh-keygen", "-q", "-t", "ed25519", "-N", "", "-f", key])
        if not made.ok:
            return system.run(["sshd", "-t"])
        return system.run(["sshd", "-t", "-h", key])


def apply(*, restart: bool = True, firewall_only: bool = False, log=print) -> list[str]:
    """Render, check, write, reload. Returns the paths that changed."""
    cfg = config.load()
    problems = config.check(cfg)
    if problems:
        raise ApplyError(" ".join(problems))
    live = effective(cfg)
    # The file on disk never lists bans: it is loaded again at every start, and a ban written into it would come
    # back at each restart, even after it was lifted. Bans live in the kernel (and the sentinel puts its own back
    # when it starts); a reload carries the current ones across so nobody is let back in by it.
    files = rendered(cfg, bans={})
    with_bans = rendered(cfg, bans=sentinel.kernel_bans())[system.NFT_FILE][0]
    check_firewall(with_bans)
    if firewall_only:
        files = {system.NFT_FILE: files[system.NFT_FILE]}

    previous_sshd = system.read(system.SSHD_DROPIN)
    changed = [path for path, (content, mode) in files.items() if system.write_atomic(path, content, mode)]

    if system.SSHD_DROPIN in changed:
        test = sshd_check()
        if not test.ok and test.code != 127:
            if previous_sshd is None:
                os.unlink(system.p(system.SSHD_DROPIN))
            else:
                system.write_atomic(system.SSHD_DROPIN, previous_sshd, 0o600)
            raise ApplyError("The SSH settings were refused by sshd and have been put back: " + test.err.strip()[:200])

    manifest = {path: _digest(content) for path, (content, _) in rendered(cfg, bans={}, shield=False).items() if path != system.NFT_FILE}
    manifest["firewall-settings"] = _digest(json.dumps({k: live[k] for k in sorted(live)}, default=str) + str(claimed()))
    if not firewall_only:
        system.write_atomic(system.MANIFEST_FILE, json.dumps(manifest, indent=1), 0o600)
        if system.exists(system.CONF_FILE):
            # The sentinel reads the settings; nobody else needs to (an alert webhook address is a secret).
            system.run(["chgrp", "ludora-sentinel", system.p(system.CONF_FILE)])
            os.chmod(system.p(system.CONF_FILE), 0o640)

    if not restart:
        return changed

    loaded = system.run(["nft", "-f", "-"], input_text=with_bans)
    if not loaded.ok and loaded.code != 127:
        raise ApplyError("The firewall could not be loaded: " + loaded.err.strip()[:300])
    if firewall_only:
        return changed

    name = system.run(["hostnamectl", "--static"]).out.strip()
    if name and name != cfg["SERVER_NAME"]:
        system.run(["hostnamectl", "set-hostname", cfg["SERVER_NAME"]])
    if "/etc/sysctl.d/91-ludora-os-ipv6.conf" in changed:
        system.run(["sysctl", "-q", "--system"])
    system.run(["systemctl", "daemon-reload"])
    # The SSH port is a decoy while SSH is off, so the two hand it over in order: the sentinel lets go before SSH
    # starts, and takes it back only after SSH has stopped.
    if live["SSH_ENABLED"] and claimed():
        system.run(["systemctl", "try-restart", "ludora-sentinel.service"])
        system.run(["systemctl", "reset-failed", "sshd.service"])
        system.run(["systemctl", "enable", "--now", "sshd.service"])
        if system.SSHD_DROPIN in changed:
            system.run(["systemctl", "reload-or-restart", "sshd.service"])
    else:
        system.run(["systemctl", "disable", "--now", "sshd.service"])
        system.run(["systemctl", "try-restart", "ludora-sentinel.service"])
    if claimed():
        touched = lambda *needles: any(n in path for path in changed for n in needles)  # noqa: E731
        if touched("ludora-db", "db.env", "ludora-internal", "pgdata"):
            log("Restarting the database, the app and the proxy.")
            system.run(["systemctl", "restart", "ludora-db.service", "ludora-app.service", "ludora-proxy.service"], timeout=600)
        else:
            if touched("ludora-app", "app.env", "uploads", "ludora-edge"):
                log("Restarting the app.")
                system.run(["systemctl", "restart", "ludora-app.service"], timeout=600)
            if touched("ludora-proxy", "Caddyfile", "caddy", "ludora-edge"):
                log("Restarting the HTTPS proxy.")
                system.run(["systemctl", "restart", "ludora-proxy.service"], timeout=300)
        if cfg["AI_ENABLED"] and analyst.image():
            system.run(["systemctl", "restart" if touched("ludora-analyst") else "start", "ludora-analyst.service"], timeout=300)
        else:
            system.run(["systemctl", "stop", "ludora-analyst.service"], timeout=120)
    return changed


def _strip_bans(text: str) -> str:
    """The firewall file without the bans it carried over, which change from minute to minute."""
    return "\n".join(line for line in text.splitlines() if not (line.strip().startswith("elements = {") and " timeout " in line))


def drift() -> list[str]:
    """Generated files that no longer match what the settings produce: someone edited them by hand, or tampered."""
    try:
        manifest = json.loads(system.read(system.MANIFEST_FILE) or "{}")
    except ValueError:
        return ["the manifest is unreadable"]
    if not manifest:
        return []
    out: list[str] = []
    on_disk = system.read(system.NFT_FILE)
    if on_disk is None:
        out.append(f"{system.NFT_FILE} is missing")
    else:
        try:
            cfg = config.load()
            expected = {_strip_bans(rendered(cfg, bans={}, shield=flag)[system.NFT_FILE][0]) for flag in (False, True)}
            if _strip_bans(on_disk) not in expected:
                out.append(f"{system.NFT_FILE} does not match the settings")
        except (config.ConfigError, OSError) as err:
            out.append(f"the settings could not be read: {err}")
    for path, digest in manifest.items():
        if path == "firewall-settings":
            continue
        current = system.read(path)
        if current is None:
            out.append(f"{path} is missing")
        elif _digest(current) != digest:
            out.append(f"{path} was changed outside ludoractl")
    return out
