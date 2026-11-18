"""One quick picture of the server, for `ludoractl status`, the console and the sign-in screen."""

from __future__ import annotations

import json
import time
from typing import Any

from . import apply as applier
from . import config, doctor, maintain, sentinel, system

UNITS = {
    "database": "ludora-db.service",
    "app": "ludora-app.service",
    "proxy": "ludora-proxy.service",
    "sentinel": "ludora-sentinel.service",
    "firewall": "nftables.service",
    "ssh": "sshd.service",
    "usb guard": "usbguard.service",
    "auditing": "auditd.service",
}


def addresses() -> list[str]:
    result = system.run(["ip", "-j", "-4", "addr", "show", "scope", "global"])
    out: list[str] = []
    if result.ok:
        try:
            for link in json.loads(result.out or "[]"):
                if str(link.get("ifname", "")).startswith(("podman", "veth")):
                    continue
                out += [info["local"] for info in link.get("addr_info", []) if info.get("local")]
        except ValueError:
            pass
    return out


def gather() -> dict[str, Any]:
    try:
        cfg = config.load()
        config_error = ""
    except config.ConfigError as err:
        cfg = config.defaults()
        config_error = str(err)
    names = list(UNITS)
    states = system.run(["systemctl", "is-active", *UNITS.values()]).out.split()
    services = {name: (states[i] if i < len(states) else "unknown") for i, name in enumerate(names)}
    try:
        watch = json.loads(system.read(sentinel.STATUS_FILE) or "{}")
    except ValueError:
        watch = {}
    if time.time() - float(watch.get("at", 0)) > 120:
        watch = {}
    report = doctor.last() or {}
    saved = maintain.backups()
    is_claimed = applier.claimed()
    window = applier.support_window()
    uptime = float((system.read("/proc/uptime") or "0").split()[0] or 0)

    problems: list[str] = []
    if config_error:
        problems.append("the settings file has an error")
    if not is_claimed:
        problems.append("not set up yet")
    else:
        for name in ("database", "app", "proxy"):
            if services[name] != "active":
                problems.append(f"the {name} is not running")
        if services["sentinel"] != "active":
            problems.append("the sentinel is not running")
        if not saved or saved[0]["age_hours"] > 36:
            problems.append("no recent backup")
    if watch.get("level", 0) == 2:
        problems.append("under attack")
    if report.get("failed"):
        problems.append(f"{report['failed']} self-check{'s' if report['failed'] != 1 else ''} failing")
    if cfg["LOCKDOWN"]:
        problems.append("lockdown is on")

    domain = cfg["DOMAIN"]
    return {
        "version": system.VERSION,
        "claimed": is_claimed,
        "name": cfg["SERVER_NAME"],
        "url": f"https://{domain}" if domain else "",
        "tls": cfg["TLS_MODE"],
        "addresses": addresses(),
        "uptime_hours": round(uptime / 3600, 1),
        "services": services,
        "threat": watch.get("level_name", "unknown"),
        "threat_level": watch.get("level", -1),
        "shield": bool(watch.get("shield")),
        "shield_mode": cfg["SHIELD"],
        "lockdown": cfg["LOCKDOWN"],
        "bans": watch.get("bans", {}),
        "checks": {"passed": report.get("passed"), "failed": report.get("failed"), "at": report.get("at")},
        "backup_age_hours": saved[0]["age_hours"] if saved else None,
        "backups": len(saved),
        "support": window,
        "config_error": config_error,
        "state": "OK" if not problems else "ATTENTION",
        "problems": problems,
    }


def text(view: dict[str, Any]) -> str:
    lines = [
        f"Ludora OS {view['version']}   {view['name']}   {', '.join(view['addresses']) or 'no address'}",
        f"State:     {view['state']}" + (": " + "; ".join(view["problems"]) if view["problems"] else ""),
        f"Site:      {view['url'] or 'not set'}  (certificate: {view['tls']})",
        "Services:  " + "  ".join(f"{name} {state}" for name, state in view["services"].items()),
        f"Threat:    {view['threat']}   shield {'UP' if view['shield'] else 'down'} ({view['shield_mode']})   lockdown {'ON' if view['lockdown'] else 'off'}   banned now: {len(view['bans'])}",
    ]
    checks = view["checks"]
    if checks["passed"] is not None:
        lines.append(f"Self-check: {checks['passed']} passing, {checks['failed']} failing (`ludoractl doctor` for the list)")
    else:
        lines.append("Self-check: not run yet (`ludoractl doctor`)")
    age = view["backup_age_hours"]
    lines.append(f"Backups:   {view['backups']} kept, newest {age} hours old" if age is not None else "Backups:   none yet")
    if view["support"]:
        left = max(0, int((view["support"]["until"] - time.time()) / 60))
        lines.append(f"Support access: OPEN for {left} more minutes, from {view['support']['from']}")
    return "\n".join(lines)
