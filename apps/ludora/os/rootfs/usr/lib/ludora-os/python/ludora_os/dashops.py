"""The staff dashboard's root side: the ONLY things the web dashboard can ask this server to do.

The dashboard's web service runs as an unprivileged, sandboxed user and can do nothing itself. For every reading
and every action it sends one JSON request down a local socket that only it may open; a fresh root process
(`ludoractl dash-op`) handles that one request here and exits. So this file is the boundary: whatever happens to
the web service, an attacker who took it over could do what is listed here and nothing else. On purpose that
excludes reading any secret, touching SSH or administrators' keys, switching the firewall or the sentinel off,
changing who is trusted, and running any command of their choosing.

Everything that arrives is treated as hostile: every field is checked here, with the same validators the command
line uses, whether or not the web service checked it first.
"""

from __future__ import annotations

import ipaddress
import json
import secrets as _random
import socket
import time
from typing import Any

from . import alerts, analyst, config, doctor, maintain, overview, sentinel, system
from . import apply as applier

# The only settings the dashboard may read or change: the site's name and certificate, who runs it, and alerts.
SETTINGS = {
    "DOMAIN": "The address people open",
    "TLS_MODE": "Certificate",
    "OPERATOR_NAME": "Who runs this server",
    "OPERATOR_CONTACT": "Contact for privacy questions",
    "ALERT_SECURITY_TO": "Told about attacks",
    "ALERT_UPKEEP_TO": "Told when the server needs care",
    "ALERT_CHEAT_TO": "Told about likely cheating",
    "ALERT_QUIET_MINUTES": "Minutes between alert batches",
    "SMTP_HOST": "Mail server",
    "SMTP_PORT": "Mail server port",
    "SMTP_SECURITY": "Mail encryption",
    "SMTP_USER": "Mail account",
    "SMTP_FROM": "Address alerts come from",
    "NTFY_SERVER": "Phone push server",
}
MAIL_PRESETS = [
    {"id": "google", "label": "Google Workspace or Gmail", "host": "smtp.gmail.com", "port": 587, "security": "starttls",
     "note": "Use the account's address, and an app password made in the Google account's security settings (not its normal password)."},
    {"id": "microsoft", "label": "Microsoft 365 or Outlook", "host": "smtp.office365.com", "port": 587, "security": "starttls",
     "note": "The account must be allowed to send with SMTP (\"authenticated SMTP\"), which your Microsoft 365 administrator switches on per mailbox."},
    {"id": "other", "label": "Another mail server", "host": "", "port": 587, "security": "starttls",
     "note": "Ask whoever runs the school's email for the server name, port, account and password."},
]
LOG_UNITS = ("app", "db", "proxy", "sentinel")
SECRETS = {"smtp_password": "SMTP_PASSWORD", "telegram_token": "TELEGRAM_BOT_TOKEN"}


class Refused(Exception):
    """A request that is not allowed or not well formed. Its text is shown to the person at the dashboard."""


def _text(value: Any, limit: int = 300) -> str:
    if not isinstance(value, str):
        raise Refused("That was not understood.")
    return alerts.clean(value, limit)


def _address(value: Any) -> str:
    try:
        addr = ipaddress.ip_address(_text(value, 60))
    except ValueError:
        raise Refused("That is not an address such as 10.20.3.7.") from None
    if isinstance(addr, ipaddress.IPv6Address) and addr.ipv4_mapped:
        addr = addr.ipv4_mapped
    return str(addr)


def _who(request: dict[str, Any]) -> str:
    """Where the signed-in person is connecting from, as the web service reports it. Used in the record only."""
    try:
        return str(ipaddress.ip_address(str(request.get("client", ""))))
    except ValueError:
        return "an unknown address"


def _record(request: dict[str, Any], text: str, severity: str = "notice") -> None:
    sentinel.append_event({"at": int(time.time()), "severity": severity, "kind": "dashboard", "text": f"Dashboard ({_who(request)}): {text}"})


def _overview() -> dict[str, Any]:
    view = overview.gather()
    try:
        watch = json.loads(system.read(sentinel.STATUS_FILE) or "{}")
    except ValueError:
        watch = {}
    held = sentinel.kernel_bans()
    cfg = config.load()
    level = view["threat_level"] if view["threat_level"] in (0, 1, 2) else 0
    return {
        "server": view["name"], "address": ", ".join(view["addresses"]), "site": view["url"], "version": view["version"], "time": int(time.time()),
        "state": "ok" if view["state"] == "OK" else "attention", "attention": list(view["problems"]),
        "services": dict(view["services"]),
        "threat": {"level": level, "name": sentinel.LEVELS[level]},
        "shield": {"up": bool(view["shield"]), "mode": view["shield_mode"]},
        "lockdown": bool(view["lockdown"]),
        "bans": [{"ip": ip, "seconds_left": int(left)} for ip, left in sorted(held.items())],
        "doctor": {"at": view["checks"]["at"], "passed": view["checks"]["passed"] or 0, "failed": view["checks"]["failed"] or 0,
                   "unknown": (doctor.last() or {}).get("unknown", 0)},
        "backups": {"count": view["backups"], "newest_hours": view["backup_age_hours"]},
        "support": {"until": view["support"]["until"], "from": view["support"]["from"]} if view["support"] else None,
        "analyst": {"enabled": bool(cfg["AI_ENABLED"]), "installed": bool(analyst.image()) and not analyst.model_ready()},
        "rates": {k: v for k, v in (watch.get("rates") or {}).items() if isinstance(v, (int, float))},
    }


def _settings() -> dict[str, Any]:
    cfg = config.load()
    held = alerts.load_secrets()
    return {
        "settings": {key: {"value": config._format(cfg[key]), "label": label, "help": config.BY_KEY[key].help} for key, label in SETTINGS.items()},
        "secrets": {name: key in held for name, key in SECRETS.items()},
    }


def _setup() -> dict[str, Any]:
    cfg = config.load()
    domain = cfg["DOMAIN"]
    is_name = bool(domain) and not domain.replace(".", "").isdigit()
    mail_problems = [p for p in alerts.problems(cfg) if "mail" in p.lower() or "SMTP" in p]
    lists = {audience: alerts.recipients(cfg, audience) for audience in alerts.AUDIENCES}
    return {
        "domain": {"current": domain, "server_addresses": overview.addresses(), "tls_mode": cfg["TLS_MODE"], "is_name": is_name},
        "email": {"configured": bool(cfg["SMTP_HOST"] and cfg["SMTP_FROM"]) and not mail_problems, "problems": mail_problems, "presets": MAIL_PRESETS},
        "alerts": {**lists, "problems": alerts.problems(cfg)},
        "done": {"domain": is_name, "email": bool(cfg["SMTP_HOST"] and cfg["SMTP_FROM"]) and not mail_problems, "alerts": bool(lists["security"])},
    }


def _dns_check(request: dict[str, Any]) -> dict[str, Any]:
    name = _text(request.get("name"), 253).lower().rstrip(".")
    try:
        if not name or "." not in name or config._site(name) != name or name.replace(".", "").isdigit():
            raise config.ConfigError("")
    except config.ConfigError:
        raise Refused("Give a name such as play.your-school.org.") from None
    try:
        found = sorted({info[4][0] for info in socket.getaddrinfo(name, 443, proto=socket.IPPROTO_TCP)})
    except OSError:
        found = []
    mine = overview.addresses()
    matches = bool(found) and any(a in mine for a in found)
    public = any(ipaddress.ip_address(a).is_global for a in mine)
    if not found:
        advice = f"{name} does not exist yet, or the change has not spread. Ask whoever manages the school's domain for an A record for {name} pointing to this server, then check again in a few minutes."
    elif matches:
        advice = f"{name} points to this server. You can use it as the address now."
    elif not public:
        advice = (f"{name} points to {', '.join(found)}, which is not one of this server's own addresses ({', '.join(mine) or 'none'}). "
                  "That is right if it is your school's internet address and the router passes ports 80 and 443 on to this server; otherwise the record needs changing.")
    else:
        advice = f"{name} points to {', '.join(found)}, not to this server ({', '.join(mine)}). The record needs changing."
    return {"name": name, "resolves_to": found, "server_addresses": mine, "matches": matches, "public": public, "advice": advice}


def _logs(request: dict[str, Any]) -> dict[str, Any]:
    what = request.get("what")
    if what not in LOG_UNITS:
        raise Refused("Choose the app, the database, the proxy or the sentinel.")
    lines = request.get("lines", 80)
    if isinstance(lines, bool) or not isinstance(lines, int) or not 1 <= lines <= 200:
        raise Refused("Between 1 and 200 lines.")
    result = system.run(["journalctl", "--no-pager", "--unit", maintain.SERVICES[what], "--lines", str(lines), "--output", "short-iso"])
    return {"lines": [alerts.clean(line, 600) for line in result.out.splitlines()[-lines:]]}


def _apply_changes(request: dict[str, Any]) -> str:
    changes = request.get("changes")
    if not isinstance(changes, dict) or not changes or len(changes) > len(SETTINGS):
        raise Refused("Nothing to change.")
    cfg = config.load()
    before = {k: cfg[k] for k in SETTINGS}
    for key, value in changes.items():
        if key not in SETTINGS:
            raise Refused(f"{alerts.clean(key, 40)} cannot be changed from the dashboard.")
        if not isinstance(value, str) or len(value) > 2000:
            raise Refused(f"{SETTINGS[key]}: that value was not understood.")
        try:
            config.set_value(cfg, key, value)
        except config.ConfigError as err:
            raise Refused(f"{SETTINGS[key]}: {str(err).split(': ', 1)[-1]}") from None
    problems = config.check(cfg)
    if problems:
        raise Refused(" ".join(problems))
    changed = [k for k in SETTINGS if cfg[k] != before[k]]
    if not changed:
        return "Nothing needed changing."
    config.save(cfg)
    try:
        applier.apply(log=lambda *_: None)
    except applier.ApplyError as err:
        for key, value in before.items():   # put the old settings back rather than leave the server half-changed
            cfg[key] = value
        config.save(cfg)
        applier.apply(log=lambda *_: None)
        raise Refused(f"That could not be put into effect, so nothing was changed: {alerts.clean(err, 200)}") from None
    _record(request, "changed " + ", ".join(SETTINGS[k].lower() for k in changed) + ".")
    return "Saved and in effect: " + ", ".join(SETTINGS[k].lower() for k in changed) + "."


def _action(request: dict[str, Any]) -> dict[str, Any]:
    action = request.get("action")
    cfg = config.load()
    if action == "ban":
        ip = _address(request.get("ip"))
        minutes = request.get("minutes", 60)
        if isinstance(minutes, bool) or not isinstance(minutes, int) or not 1 <= minutes <= 1440:
            raise Refused("A ban lasts from 1 minute to 24 hours.")
        never, _ = sentinel.discover_exempt(cfg)
        why = sentinel.Brain(cfg, never).protected(ip)
        if why:
            raise Refused(f"{ip} is {why}: it cannot be banned.")
        if not sentinel.nft_ban(ip, minutes * 60):
            raise Refused("The firewall did not take the ban. Is the server set up and the firewall running?")
        _record(request, f"{ip} banned for {minutes} minutes.", "warning")
        return {"message": f"{ip} is refused for {minutes} minutes."}
    if action == "unban":
        ip = _address(request.get("ip"))
        if not sentinel.nft_unban(ip):
            raise Refused(f"{ip} is not banned.")
        sentinel.forget_ban(ip)
        _record(request, f"{ip} let back in.")
        return {"message": f"{ip} may connect again."}
    if action == "shield":
        mode = request.get("mode")
        if mode not in ("auto", "on", "off"):
            raise Refused("The shield is auto, on or off.")
        cfg["SHIELD"] = mode
        config.save(cfg)
        applier.apply(restart=True, firewall_only=True, log=lambda *_: None)
        system.run(["systemctl", "try-restart", "ludora-sentinel.service"])
        _record(request, f"shield set to {mode}.")
        return {"message": {"auto": "The sentinel raises the shield by itself under attack.", "on": "The shield is up: every limit is a quarter of normal.", "off": "The shield stays down."}[mode]}
    if action == "lockdown":
        on = request.get("on")
        if not isinstance(on, bool):
            raise Refused("Lockdown is on or off.")
        cfg["LOCKDOWN"] = on
        config.save(cfg)
        applier.apply(restart=True, firewall_only=True, log=lambda *_: None)
        _record(request, f"lockdown switched {'on' if on else 'off'}.", "alert" if on else "notice")
        made = alerts.Alert("security", f"Lockdown was switched {'on' if on else 'off'} from the staff dashboard", what=alerts.ADVICE["lockdown"][0], todo=alerts.ADVICE["lockdown"][1],
                            facts=[f"From {_who(request)}"], urgent=on)
        if alerts.recipients(cfg, "security"):
            alerts.deliver(made, cfg)
        return {"message": "Lockdown is on: only the staff addresses can open Ludora." if on else "Lockdown is off: Ludora is open again."}
    if action == "backup":
        try:
            maintain.backup(lambda *_: None)
        except Exception as err:
            raise Refused(f"The backup failed: {alerts.clean(err, 200)}") from None
        _record(request, "a backup was made.")
        return {"message": "Backed up. The copy is encrypted and kept on the server: copy it somewhere else too."}
    if action == "doctor":
        report = doctor.run_all()
        return {"message": f"{report['passed']} passing, {report['failed']} failing."}
    if action == "alerts_test":
        audience = request.get("audience")
        if audience is not None and audience not in alerts.AUDIENCES:
            raise Refused("Choose security, upkeep or fair play.")
        said = []
        for name in ([audience] if audience else list(alerts.AUDIENCES)):
            label = alerts.AUDIENCES[name][1]
            if not alerts.recipients(cfg, name):
                said.append(f"{label}: nobody is on that list.")
                continue
            results = alerts.deliver(alerts.Alert(name, "This is a test", what=f"Someone at the staff dashboard asked for a test of the {label.lower()} alerts. Nothing is wrong.",
                                                  todo="Nothing. If you were not expecting this, you are on this server's alert list: ask whoever runs it."), cfg)
            said.append(f"{label}: " + "; ".join(f"{alerts.hide(r)} {'sent' if ok else 'NOT delivered (' + why + ')'}" for r, ok, why in results))
        return {"message": " ".join(said)}
    if action == "set":
        return {"message": _apply_changes(request)}
    if action == "secret":
        name = request.get("name")
        if name not in SECRETS:
            raise Refused("That is not something the dashboard can set.")
        value = request.get("value")
        if not isinstance(value, str) or not 0 < len(value) <= 256 or not value.isprintable():
            raise Refused("A password or token is one line of ordinary characters.")
        try:
            alerts.save_secret(SECRETS[name], value)
        except ValueError as err:
            raise Refused(str(err)[:1].upper() + str(err)[1:] + ".") from None
        system.run(["systemctl", "try-restart", "ludora-sentinel.service"])
        _record(request, f"the {name.replace('_', ' ')} was set.")
        return {"message": "Saved. Send a test to check it works."}
    if action == "ntfy_topic":
        topic = "ludora-" + _random.token_urlsafe(18).replace("-", "x").replace("_", "y")
        return {"message": f"In the ntfy phone app, subscribe to this topic on {cfg['NTFY_SERVER']}, then add ntfy:{topic} to a list. Anyone who knows the name can read its messages.", "topic": topic}
    if action == "support_close":
        from . import access
        closed = access.support_close(log=lambda *_: None)
        if closed:
            _record(request, "support access closed.")
        return {"message": "Support access is closed." if closed else "Support access was not open."}
    if action == "restart":
        what = request.get("what")
        if what not in ("app", "proxy"):
            raise Refused("Only the app or the proxy can be restarted from here.")
        done = system.run(["systemctl", "restart", maintain.SERVICES[what]], timeout=300)
        if not done.ok:
            raise Refused(f"The {what} did not restart: {alerts.clean(done.err, 200)}")
        _record(request, f"the {what} was restarted.")
        return {"message": f"The {what} was restarted."}
    raise Refused("That is not something the dashboard can do.")


def _note(request: dict[str, Any]) -> dict[str, Any]:
    """The web service reporting on itself: a sign-in, a wrong password, a lock-out. Recorded; a lock-out is alerted."""
    kind = request.get("kind")
    who = _who(request)
    if kind == "signed_in":
        _record(request, "a member of staff signed in.", "info")
    elif kind == "failed":
        _record(request, "a wrong password or code was entered.", "notice")
    elif kind == "locked":
        _record(request, "too many wrong passwords: sign-in is paused for that address.", "warning")
        cfg = config.load()
        if alerts.recipients(cfg, "security"):
            alerts.deliver(alerts.Alert(
                "security", "Someone kept getting the staff dashboard's password wrong",
                what="The staff dashboard only opens to the staff addresses, so this came from one of them.",
                did="Sign-in from that address is paused for fifteen minutes.",
                todo="If it was not one of you, find out who was at that machine, and change the dashboard password at the server with `ludoractl dash password`.",
                facts=[f"From {who}"], urgent=True), cfg)
    else:
        raise Refused("That was not understood.")
    return {}


def handle(request: Any) -> dict[str, Any]:
    """One request in, one answer out. Never raises: a refusal or a fault is an answer too."""
    try:
        if not isinstance(request, dict) or not isinstance(request.get("op"), str):
            raise Refused("That was not understood.")
        if not applier.claimed():
            raise Refused("This server has not been set up yet. Finish the setup on its own screen first.")
        op = request["op"]
        if op == "overview":
            return {"ok": True, **_overview()}
        if op == "events":
            limit = request.get("limit", 100)
            if isinstance(limit, bool) or not isinstance(limit, int) or not 1 <= limit <= 300:
                raise Refused("Between 1 and 300 events.")
            keep = ("at", "severity", "kind", "text")
            return {"ok": True, "events": [{k: (alerts.clean(e.get(k, ""), 400) if k != "at" else int(e.get("at", 0))) for k in keep} for e in sentinel.read_events(limit)]}
        if op == "doctor":
            report = doctor.last() or {"at": None, "passed": 0, "failed": 0, "unknown": 0, "checks": []}
            return {"ok": True, "at": report.get("at"), "passed": report.get("passed", 0), "failed": report.get("failed", 0), "unknown": report.get("unknown", 0),
                    "checks": [{"state": c.get("state"), "title": alerts.clean(c.get("title", ""), 200), "detail": alerts.clean(c.get("detail", ""), 600)} for c in report.get("checks", [])]}
        if op == "settings":
            return {"ok": True, **_settings()}
        if op == "setup":
            return {"ok": True, **_setup()}
        if op == "logs":
            return {"ok": True, **_logs(request)}
        if op == "dns_check":
            return {"ok": True, **_dns_check(request)}
        if op == "action":
            return {"ok": True, **_action(request)}
        if op == "note":
            return {"ok": True, **_note(request)}
        raise Refused("That is not something the dashboard can do.")
    except Refused as err:
        return {"ok": False, "error": str(err)}
    except Exception as err:  # a fault in here must reach the person as a sentence, never as a crash or a stack
        return {"ok": False, "error": "The server could not do that: " + alerts.clean(f"{type(err).__name__}: {err}", 200)}
