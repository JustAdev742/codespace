"""ludoractl: every action on a Ludora OS server, by name.

The console is a face on top of this. Anything it does can be done here, so a
remote administrator, a script and the support shell all go the same way.
"""

from __future__ import annotations

import argparse
import ipaddress
import json
import os
import re
import sys
import time
from typing import Any

from . import access, alerts, analyst, config, dash, dashops, doctor, maintain, overview, render, sentinel, system
from . import apply as applier


class Refused(Exception):
    pass


def need_root() -> None:
    if not system.is_root() and not system.root():
        raise Refused("This needs root. Run it with sudo.")


def say(text: str = "") -> None:
    print(text, flush=True)


# ---- claim (first boot) --------------------------------------------------------------------


def password_problem(password: str, user: str = system.ADMIN_USER) -> str | None:
    """Why a password is not good enough, or None. The system's own checker has the last word when it is there."""
    if len(password) < 12:
        return "Use at least 12 characters. Four unrelated words work well."
    if password.lower() in ("ludora-admin", "password1234", "administrator") or "ludora" in password.lower() or "password" in password.lower():
        return "Leave out the words ludora and password."
    if len(set(password)) < 6:
        return "That repeats the same few characters."
    scored = system.run(["pwscore", user], input_text=password + "\n")
    if scored.code not in (0, 127):
        reason = (scored.err or scored.out).strip().splitlines()
        return "The system refused that password: " + (reason[-1] if reason else "too weak") + "."
    return None


def claim(password: str, grub_password: str | None = None, *, log=say) -> None:
    """Take ownership of a freshly installed server: set the administrator's password, then build and open Ludora."""
    need_root()
    if applier.claimed():
        raise Refused("This server has already been set up.")
    cfg = config.load()
    if not cfg["DOMAIN"]:
        raise Refused("Set the address people will open first (DOMAIN).")
    problem = password_problem(password)
    if problem:
        raise Refused(problem)
    done = system.run(["chpasswd"], input_text=f"{system.ADMIN_USER}:{password}\n")
    if not done.ok:
        raise Refused("The password could not be set: " + done.err.strip()[-200:])
    system.run(["usermod", "--unlock", system.ADMIN_USER])
    if grub_password:
        grub = system.run(["grub2-setpassword"], input_text=f"{grub_password}\n{grub_password}\n")
        log("The boot menu now needs its password to be edited." if grub.ok else "The boot menu password could not be set here; set it later with grub2-setpassword.")
    config.load_secrets(create=True)
    if not maintain.image_exists("localhost/ludora:bundled"):
        maintain.load_bundled_images(log)
    log("Fetching the database and proxy images.")
    maintain.pin_images(log)
    maintain.install_app(None, log)
    system.write_atomic(system.CLAIMED_FLAG, time.strftime("%Y-%m-%dT%H:%M:%SZ\n", time.gmtime()), 0o644)
    try:
        log("Opening the firewall for Ludora and writing the services.")
        applier.apply(restart=True, log=log)
        maintain.start_stack(log)
    except Exception:
        os.unlink(system.p(system.CLAIMED_FLAG))  # stay sealed if the services could not be brought up
        applier.apply(restart=True, firewall_only=True, log=log)
        raise
    try:
        log(maintain.usb_init(log))
    except maintain.MaintainError as err:
        log(f"USB lock-down was skipped: {err}")
    log("Waiting for Ludora to answer.")
    if maintain.wait_healthy(240):
        log(f"Ludora is up at https://{cfg['DOMAIN']}")
    else:
        log("Ludora has not answered its health check yet. See: ludoractl logs app")
    doctor.run_all()


# ---- commands ------------------------------------------------------------------------------


def cmd_status(args: argparse.Namespace) -> int:
    view = overview.gather()
    say(json.dumps(view, indent=1) if args.json else overview.text(view))
    return 0 if view["state"] == "OK" else 1


def tell(alert: alerts.Alert, quiet: bool = False) -> None:
    """Send an alert from a command (the sentinel sends its own). Says where it went; never fails the command."""
    try:
        cfg = config.load()
        if not alerts.recipients(cfg, alert.audience):
            return
        outcome = alerts.summary(alerts.deliver(alert, cfg))
        sentinel.append_event({"at": int(time.time()), "severity": "info", "kind": "alert-delivery", "text": f"Alert \"{alerts.clean(alert.title, 80)}\": {outcome}."})
        if not quiet:
            say(f"Alert {outcome}.")
    except Exception as err:  # telling people is never worth failing the thing they are told about
        if not quiet:
            say(f"(The alert could not be sent: {alerts.clean(err, 160)})")


def cmd_doctor(args: argparse.Namespace) -> int:
    try:
        before = {c["title"] for c in json.loads(system.read(system.DOCTOR_FILE) or "{}").get("checks", []) if c.get("state") == "fail"}
        first_run = not system.exists(system.DOCTOR_FILE)
    except (ValueError, AttributeError, TypeError):
        before, first_run = set(), True
    report = doctor.run_all()
    newly = [c for c in report["checks"] if c["state"] == "fail" and c["title"] not in before]
    if newly and not first_run and system.is_root():
        tell(alerts.Alert(
            "upkeep", f"{len(newly)} protection{'s' if len(newly) != 1 else ''} stopped passing the self-check",
            what="The server checks its own protections every hour. These were passing and now are not.",
            todo="Sign in at the server, type `ludora`, and open Security > Run the self-check. Each line says what is wrong and usually how to put it right.",
            facts=[f"{c['title']}: {c['detail']}" for c in newly], urgent=any("firewall" in c["title"].lower() or "generated files" in c["title"].lower() for c in newly),
        ), quiet=bool(args.json))
    if args.json:
        say(json.dumps(report, indent=1))
    else:
        marks = {"pass": "  ok  ", "fail": " FAIL ", "unknown": "  ??  "}
        for item in report["checks"]:
            say(f"[{marks[item['state']]}] {item['title']}: {item['detail']}")
        say(f"\n{report['passed']} passing, {report['failed']} failing, {report['unknown']} could not be checked.")
    return 1 if report["failed"] else 0


def cmd_apply(args: argparse.Namespace) -> int:
    need_root()
    if args.check:
        cfg = config.load()
        files = applier.rendered(cfg, bans={})
        applier.check_firewall(files[system.NFT_FILE][0])
        differing = [path for path, (content, _) in files.items() if system.read(path) != content]
        say("Settings are valid." + (" Files that would change: " + ", ".join(differing) if differing else " Nothing would change."))
        return 0
    changed = applier.apply(restart=not args.no_restart, firewall_only=args.firewall_only, log=say)
    say("Applied. " + (f"{len(changed)} file{'s' if len(changed) != 1 else ''} changed." if changed else "Nothing needed changing."))
    return 0


def cmd_set(args: argparse.Namespace) -> int:
    need_root()
    cfg = config.load()
    config.set_value(cfg, args.key.upper(), args.value)
    config.save(cfg)
    say(f"{args.key.upper()} saved. Put it into effect with: ludoractl apply")
    return 0


def cmd_get(args: argparse.Namespace) -> int:
    cfg = config.load()
    if args.key:
        key = args.key.upper()
        if key not in config.BY_KEY:
            raise Refused(f"{key}: no such setting")
        say(config._format(cfg[key]))
    else:
        for field in config.FIELDS:
            value = config._format(cfg[field.key])
            say(f"{field.key}={'(set)' if field.key == 'WEBHOOK_URL' and value else value}")
    return 0


def _address(text: str) -> str:
    try:
        return str(ipaddress.ip_address(text))
    except ValueError:
        raise Refused(f"{text!r} is not an IP address") from None


def cmd_ban(args: argparse.Namespace) -> int:
    need_root()
    ip = _address(args.address)
    cfg = config.load()
    brain = sentinel.Brain(cfg, sentinel.discover_exempt(cfg)[0])
    reason = brain.protected(ip)
    if reason:
        raise Refused(f"{ip} is {reason} and is never banned.")
    if not sentinel.nft_ban(ip, args.minutes * 60):
        raise Refused("The firewall did not accept the ban. Is it loaded? Try: ludoractl apply")
    sentinel.append_event({"at": int(time.time()), "severity": "warning", "kind": "manual", "text": f"{ip} banned by an administrator for {args.minutes} min.", "ip": ip})
    say(f"{ip} is banned for {args.minutes} minutes.")
    return 0


def cmd_unban(args: argparse.Namespace) -> int:
    need_root()
    ip = _address(args.address)
    if not sentinel.nft_unban(ip):
        raise Refused(f"{ip} is not banned.")
    sentinel.forget_ban(ip)
    sentinel.append_event({"at": int(time.time()), "severity": "notice", "kind": "manual", "text": f"{ip} unbanned by an administrator.", "ip": ip})
    say(f"{ip} may connect again.")
    return 0


def cmd_bans(args: argparse.Namespace) -> int:
    held = sentinel.kernel_bans()
    if args.json:
        say(json.dumps(held))
    elif not held:
        say("Nobody is banned.")
    else:
        for ip, left in sorted(held.items()):
            say(f"{ip:<40} {max(1, left // 60)} min left")
    return 0


def cmd_shield(args: argparse.Namespace) -> int:
    need_root()
    cfg = config.load()
    cfg["SHIELD"] = args.mode
    config.save(cfg)
    if args.mode in ("on", "off"):
        sentinel.set_shield(cfg, args.mode == "on")
    system.run(["systemctl", "try-restart", "ludora-sentinel.service"])
    say({"on": "Shield raised: every limit is a quarter of normal.", "off": "Shield lowered and held down.", "auto": "The sentinel now raises the shield by itself under attack."}[args.mode])
    return 0


def cmd_lockdown(args: argparse.Namespace) -> int:
    need_root()
    cfg = config.load()
    cfg["LOCKDOWN"] = args.mode == "on"
    config.save(cfg)
    applier.apply(restart=True, firewall_only=True, log=say)
    sentinel.append_event({"at": int(time.time()), "severity": "alert" if cfg["LOCKDOWN"] else "notice", "kind": "manual", "text": f"Lockdown switched {args.mode} by an administrator."})
    tell(alerts.Alert("security", f"Lockdown was switched {args.mode}", what=alerts.ADVICE["lockdown"][0], todo=alerts.ADVICE["lockdown"][1], urgent=cfg["LOCKDOWN"]))
    if cfg["LOCKDOWN"]:
        say("Lockdown is ON: only TRUSTED_NETS can open Ludora." + ("" if cfg["TRUSTED_NETS"] else " TRUSTED_NETS is empty, so nobody can."))
    else:
        say("Lockdown is off.")
    return 0


def cmd_events(args: argparse.Namespace) -> int:
    events = sentinel.read_events(args.lines)
    if args.json:
        say(json.dumps(events))
        return 0
    if not events:
        say("Nothing has happened yet.")
    for event in events:
        when = time.strftime("%d %b %H:%M:%S", time.localtime(event.get("at", 0)))
        say(f"{when}  {event.get('severity', ''):<8} {event.get('text', '')}")
    return 0


def cmd_logs(args: argparse.Namespace) -> int:
    need_root()
    unit = maintain.SERVICES[args.what]
    result = system.run(["journalctl", "--no-pager", "--unit", unit, "--lines", str(args.lines), "--output", "short-iso"])
    say(result.out.rstrip() or result.err.strip() or "No log lines.")
    return 0


def cmd_admin(args: argparse.Namespace) -> int:
    if args.action == "list":
        keys = access.admin_keys()
        if not keys:
            say("No administrator keys are installed. SSH cannot be used until one is.")
        for key in keys:
            say(f"{key.fingerprint}  {key.kind}  {key.comment}")
        return 0
    need_root()
    if args.action == "add-key":
        if args.github:
            found = access.github_keys(args.github)
            for key in found:
                say(f"  {key.fingerprint}  {key.kind}")
            if not args.yes:
                raise Refused(f"These are {args.github}'s public keys on GitHub. Check a fingerprint with their owner, then repeat with --yes.")
            added = 0
            for key in found:
                try:
                    access.add_admin_key(key.line())
                    added += 1
                except access.AccessError:
                    pass
            say(f"{added} key{'s' if added != 1 else ''} installed.")
        else:
            line = args.key if args.key else sys.stdin.readline()
            key = access.add_admin_key(line)
            say(f"Installed {key.fingerprint} ({key.kind}).")
        return 0
    if args.action == "remove-key":
        key = access.remove_admin_key(args.fingerprint)
        say(f"Removed {key.fingerprint}.")
        return 0
    if args.action == "grant":
        say(maintain.grant_admin(args.username))
        return 0
    return 2


def cmd_support(args: argparse.Namespace) -> int:
    if args.action == "status":
        window = access.support_status()
        if not window:
            say("Support access is closed.")
        else:
            say(f"Support access is OPEN until {time.strftime('%d %b %H:%M', time.localtime(window['until']))}, from {window['from']}, key {window['fingerprint']}.")
        return 0
    need_root()
    if args.action == "open":
        line = args.key if args.key else sys.stdin.readline()
        window = access.support_open(line, args.hours, args.source, log=say)
        say(f"Support access is open until {time.strftime('%d %b %H:%M', time.localtime(window['until']))} for key {window['fingerprint']} from {window['from']}.")
        say("It can run: " + ", ".join(sorted(access.SUPPORT_VERBS)) + ". It has no shell.")
        sentinel.append_event({"at": int(time.time()), "severity": "notice", "kind": "support", "text": f"Support access opened for {args.hours} h from {window['from']}."})
        tell(alerts.Alert("security", f"Support access was opened for {args.hours:g} hours", what=alerts.ADVICE["support"][0], todo=alerts.ADVICE["support"][1],
                          facts=[f"From {window['from']}, for the key {window['fingerprint']}", "Closes by itself at " + time.strftime("%H:%M on %d %B", time.localtime(window["until"]))]))
        return 0
    if args.action == "close":
        closed = access.support_close(log=say)
        if closed:
            sentinel.append_event({"at": int(time.time()), "severity": "notice", "kind": "support", "text": "Support access closed."})
        say("Support access is closed." if closed else "Support access was not open.")
        return 0
    return 2


def cmd_backup(args: argparse.Namespace) -> int:
    need_root()
    try:
        maintain.backup(say)
    except Exception as err:
        tell(alerts.Alert("upkeep", "The backup failed", what="The nightly copy of Ludora's database and uploads was not made.",
                          todo="Run `ludoractl backup` at the server to see the error. The usual causes are a full disk or the database being stopped. "
                               "Until it works, the newest backup is getting older.", facts=[alerts.clean(err, 300)], urgent=True))
        raise
    return 0


def cmd_alerts(args: argparse.Namespace) -> int:
    cfg = config.load()
    if args.action == "show":
        for audience, (key, label) in alerts.AUDIENCES.items():
            to = alerts.recipients(cfg, audience)
            say(f"{label:<10} ({key}): " + (", ".join(to) if to else "nobody"))
        say(f"Mail server: {cfg['SMTP_HOST'] or 'not set'}" + (f" port {cfg['SMTP_PORT']} ({cfg['SMTP_SECURITY']}), from {cfg['SMTP_FROM'] or 'not set'}" if cfg["SMTP_HOST"] else ""))
        say(f"Phone pushes: {cfg['NTFY_SERVER']}")
        found = alerts.problems(cfg) if system.is_root() else []
        for problem in found:
            say("PROBLEM: " + problem)
        if not any(alerts.recipients(cfg, a) for a in alerts.AUDIENCES):
            say("Nobody is on any list, so nobody would be told about an attack. Add someone: ludoractl set ALERT_SECURITY_TO you@school.example")
        return 1 if found else 0
    need_root()
    if args.action == "topic":
        import secrets as _random
        topic = "ludora-" + _random.token_urlsafe(18).replace("-", "x").replace("_", "y")
        say(topic)
        say(f"On the phone: install the ntfy app, add a subscription to this topic on {cfg['NTFY_SERVER']}.")
        say(f"On the server: ludoractl set ALERT_SECURITY_TO ntfy:{topic}   (add it to the other lists the same way)")
        say("Anyone who knows the topic name can read its messages, so treat it like a password.")
        return 0
    if args.action == "secret":
        if sys.stdin.isatty():
            import getpass
            value = getpass.getpass("Paste it here (it is not shown): ")
        else:
            value = sys.stdin.readline()
        try:
            alerts.save_secret({"smtp-password": "SMTP_PASSWORD", "telegram-token": "TELEGRAM_BOT_TOKEN"}[args.name], value)
        except ValueError as err:
            raise Refused(str(err)) from None
        system.run(["systemctl", "try-restart", "ludora-sentinel.service"])
        say("Saved. Check it works: ludoractl alerts test")
        return 0
    if args.action == "test":
        wanted = [args.audience] if args.audience else list(alerts.AUDIENCES)
        failed = False
        for problem in alerts.problems(cfg):
            say("PROBLEM: " + problem)
        for audience in wanted:
            label = alerts.AUDIENCES[audience][1]
            if not alerts.recipients(cfg, audience):
                say(f"{label}: nobody is on that list.")
                continue
            results = alerts.deliver(alerts.Alert(
                audience, "This is a test", what=f"Someone at the server asked for a test of the {label.lower()} alerts. Nothing is wrong.",
                todo="Nothing. If you were not expecting this, you are on this server's alert list: ask whoever runs it.",
                facts=["Real alerts look like this one: what happened, what the server did, and what to do."]), cfg)
            failed = failed or any(not ok for _, ok, _ in results)
            say(f"{label}: " + "; ".join(f"{r}: {'sent' if ok else 'NOT delivered: ' + why}" for r, ok, why in results))
        return 1 if failed else 0
    return 2


def _say_bench(result: dict[str, Any]) -> None:
    say(f"Right: {result['right']} of {result['asked']} cases the guard's own rules know the answer to" + (f" ({result['asked'] - result['answered']} not answered)." if result["answered"] < result["asked"] else "."))
    say(f"Speed: {result['median_ms']} ms for a typical alert, {result['slowest_ms']} ms for the slowest; about {result['readings_per_minute']} alerts a minute.")
    if result.get("tokens_read_per_second"):
        say(f"It read about {result['tokens_read_per_second']} tokens a second. It writes none: it scores five fixed answers.")
    need = -(-int(analyst.PASS_MARK * 100) * result["asked"] // 100)
    say("That is a pass." if analyst.passed(result) else f"That is below the pass mark ({need} of {result['asked']}). The rules' reading on each alert does not depend on this model.")


def cmd_ai(args: argparse.Namespace) -> int:
    cfg = config.load()
    if args.action == "status":
        missing = analyst.model_ready()
        say("Every security alert carries the guard's own reading of what happened, worked out by fixed rules. That needs no model.")
        say("The AI model is " + ("ON" if cfg["AI_ENABLED"] else "off") + ": an optional extra line on those alerts. It never bans, unbans or changes an alert's urgency.")
        say("Model: " + ("installed" if not missing else "not installed (" + ", ".join(missing[:2]) + ("..." if len(missing) > 2 else "") + " missing)"))
        say("Engine: " + (analyst.image() or "not built"))
        scored = analyst.last_bench()
        say("Its test on this server: " + (f"{scored['right']} of {scored['asked']} right, {scored.get('median_ms')} ms a reading" + (" (a pass)." if analyst.passed(scored) else " (below the pass mark).")
                                           if scored else "not run yet (`ludoractl ai bench`)."))
        if cfg["AI_ENABLED"]:
            reading = analyst.read([{"text": "10.20.3.3 connected to decoy port 3389. Banned for 15 min.", "at": int(time.time()), "ip": "10.20.3.3", "minutes": 15}], cfg)
            say("Answering: " + (f"yes, in {reading.ms} ms" if reading else f"NO: nothing usable came back from port {cfg['AI_PORT']} on this machine. See `ludoractl logs analyst`."))
        return 0
    need_root()
    if args.action == "install":
        say("This downloads an 840 MB model and builds its engine. The model needs about 2 GB of memory while it runs.")
        try:
            tag = analyst.install(say)
        except (analyst.AnalystError, OSError) as err:
            raise Refused(str(err)) from None
        say(f"Installed ({tag}). Try it with: ludoractl ai on")
        return 0
    if args.action == "off":
        cfg["AI_ENABLED"] = False
        config.save(cfg)
        applier.apply(log=say)
        say("The AI model is off. Alerts still carry the guard's own reading.")
        return 0
    if args.action == "on":
        if analyst.model_ready() or not analyst.image():
            raise Refused("It is not installed yet. Run: ludoractl ai install")
        cfg["AI_ENABLED"] = True
        config.save(cfg)
        applier.apply(log=say)
        say("Testing the model on this server before its line goes on any alert.")
        result = None
        for _ in range(30):                              # the engine takes a few seconds to load the model
            if analyst.read([{"text": "10.20.3.3 connected to decoy port 3389. Banned for 15 min."}], cfg):
                result = analyst.bench(cfg)
                break
            time.sleep(3)
        if result is None or not result["answered"]:
            cfg["AI_ENABLED"] = False
            config.save(cfg)
            applier.apply(log=say)
            raise Refused(f"The model did not answer on port {cfg['AI_PORT']}, so it was switched off again. See `ludoractl logs analyst`.")
        _say_bench(result)
        if not analyst.passed(result) and not getattr(args, "anyway", False):
            cfg["AI_ENABLED"] = False
            config.save(cfg)
            applier.apply(log=say)
            raise Refused("So the model was switched off again: a line that is wrong this often would mislead more than it helps. "
                          "To see its line anyway, marked with its score: ludoractl ai on --anyway")
        say("The AI model is on. Its line appears under the guard's own reading" + ("." if analyst.passed(result) else ", marked with its score."))
        return 0
    if args.action == "bench":
        say("Asking the model 36 held-out cases the guard's rules know the answer to, after a warm-up.")
        result = analyst.bench(cfg)
        if not result["answered"]:
            raise Refused(f"Nothing usable came back from port {cfg['AI_PORT']} on this machine. Is it installed and on? `ludoractl ai status`")
        _say_bench(result)
        for line in result["wrong"]:
            say("  missed: " + line)
        return 0
    return 2


def cmd_dash(args: argparse.Namespace) -> int:
    cfg = config.load()
    auth = dash.load_auth() if system.is_root() else {}
    if args.action == "status":
        say("The staff dashboard is " + (f"ON at https://{cfg['DOMAIN']}:{cfg['DASH_PORT']}" if cfg["DASH_ENABLED"] else "off") + ".")
        say("It opens only to the staff addresses: " + (", ".join(cfg["TRUSTED_NETS"] + cfg["ADMIN_NETS"]) or "none set yet") + ".")
        if system.is_root():
            say("Password: " + ("set" if auth.get("password") else "NOT set (`ludoractl dash password`)") + ". Authenticator code: " + ("required" if auth.get("totp") else "not used (`ludoractl dash code on` adds one)") + ".")
        return 0
    need_root()
    if args.action == "password":
        if sys.stdin.isatty():
            import getpass
            first = getpass.getpass("New dashboard password (it is not shown): ")
            if getpass.getpass("Again: ") != first:
                raise Refused("Those two did not match. Nothing was changed.")
        else:
            first = sys.stdin.readline().rstrip("\n")
        problem = password_problem(first)
        if problem:
            raise Refused(problem)
        auth["password"] = dash.hash_password(first)
        dash.save_auth(auth)
        system.run(["systemctl", "try-restart", "ludora-dash.service"])   # everyone signed in is signed out
        say("The dashboard password is set. Anyone signed in has been signed out.")
        return 0
    if args.action == "code":
        if args.mode == "on":
            import base64
            import secrets as _random
            auth["totp"] = base64.b32encode(_random.token_bytes(20)).decode().rstrip("=")
            dash.save_auth(auth)
            say("In an authenticator app (Google Authenticator, Microsoft Authenticator, Aegis), add an account by typing this key:")
            say("  " + " ".join(auth["totp"][i:i + 4] for i in range(0, len(auth["totp"]), 4)))
            say(f"  (or this address: otpauth://totp/Ludora%20OS:{cfg['SERVER_NAME']}?secret={auth['totp']}&issuer=Ludora%20OS)")
            say("From now on the dashboard asks for the six-digit code from that app as well as the password.")
        else:
            auth.pop("totp", None)
            dash.save_auth(auth)
            say("The dashboard no longer asks for an authenticator code.")
        system.run(["systemctl", "try-restart", "ludora-dash.service"])
        return 0
    if args.action in ("on", "off"):
        if args.action == "on":
            if not applier.claimed():
                raise Refused("Finish the first-boot setup first.")
            if not auth.get("password"):
                raise Refused("Set its password first: ludoractl dash password")
        cfg["DASH_ENABLED"] = args.action == "on"
        try:
            config.save(cfg)
        except config.ConfigError as err:
            raise Refused(str(err)) from None
        applier.apply(log=say)
        say(f"The staff dashboard is on: https://{cfg['DOMAIN']}:{cfg['DASH_PORT']} (from the staff addresses only)." if cfg["DASH_ENABLED"] else "The staff dashboard is off and its port is closed.")
        return 0
    return 2


def cmd_dash_op(args: argparse.Namespace) -> int:
    """One request from the dashboard's web service, on standard input; one answer on standard output. Root only."""
    need_root()
    raw = sys.stdin.buffer.read(dash.MAX_BODY + 4096)
    try:
        request = json.loads(raw or b"null")
    except ValueError:
        request = None
    import socket
    import stat
    conn = None
    if stat.S_ISSOCK(os.fstat(0).st_mode):
        # Started by systemd with the dashboard's connection as standard input and output. Keep that connection to
        # ourselves and give the commands we run /dev/null instead: with a socket for standard input `podman exec`
        # fails (backups did), and a command still holding the connection would keep the web service waiting.
        conn = socket.socket(fileno=os.dup(0))
        null = os.open(os.devnull, os.O_RDWR)
        os.dup2(null, 0)
        os.dup2(null, 1)
        os.close(null)
    answer = json.dumps(dashops.handle(request))
    if conn is None:
        sys.stdout.write(answer)
        sys.stdout.flush()
    else:
        with conn:
            conn.sendall(answer.encode())
            conn.shutdown(socket.SHUT_RDWR)
    # Some changes cut the connection they were asked over (a new site name restarts the proxy). Their answer has
    # gone by now; the work is done here, after it.
    dashops.run_later()
    return 0


def cmd_backups(args: argparse.Namespace) -> int:
    found = maintain.backups()
    if not found:
        say("There are no backups yet.")
    for item in found:
        say(f"{item['stamp']}  {item['size'] // 1024:>8} KB  {item['age_hours']} h old{'' if item['uploads'] else '  (no uploads file)'}")
    return 0


def cmd_restore(args: argparse.Namespace) -> int:
    need_root()
    if not args.yes:
        raise Refused("Restoring replaces everything in Ludora's database. Repeat with --yes when no class is playing.")
    say(maintain.restore(args.stamp, say))
    return 0


def cmd_update(args: argparse.Namespace) -> int:
    need_root()
    try:
        say(maintain.update_app(args.ref, say) if args.what == "app" else maintain.update_os(say))
    except Exception as err:
        what = "Ludora" if args.what == "app" else "the operating system"
        tell(alerts.Alert("upkeep", f"Updating {what} did not work", what="An update was tried and did not finish." + (" Ludora was put back to the version it had been running." if args.what == "app" else ""),
                          todo="Nothing urgent if Ludora is answering. Read the error, and try again when its cause is fixed.", facts=[alerts.clean(err, 300)]))
        raise
    return 0


def cmd_images(args: argparse.Namespace) -> int:
    need_root()
    for name, ref in maintain.pin_images(say).items():
        say(f"{name}: {ref}")
    applier.apply(log=say)
    return 0


def cmd_restart(args: argparse.Namespace) -> int:
    need_root()
    units = [maintain.SERVICES[args.what]] if args.what != "all" else ["ludora-db.service", "ludora-app.service", "ludora-proxy.service"]
    done = system.run(["systemctl", "restart", *units], timeout=600)
    if not done.ok:
        raise Refused(done.err.strip()[-300:] or "The restart failed.")
    say("Restarted.")
    return 0


def cmd_power(args: argparse.Namespace) -> int:
    need_root()
    system.run(["systemctl", "reboot" if args.command == "reboot" else "poweroff"])
    return 0


def cmd_usb(args: argparse.Namespace) -> int:
    need_root()
    say(maintain.usb_init(say))
    return 0


def cmd_tls(args: argparse.Namespace) -> int:
    need_root()
    cert, fingerprint = maintain.proxy_ca()
    say(cert.strip())
    say(f"\nSHA-256 fingerprint: {fingerprint}")
    say("Install this root certificate on school devices (through your device management) so browsers trust this server.")
    return 0


def cmd_claim(args: argparse.Namespace) -> int:
    password = sys.stdin.readline().rstrip("\n")
    claim(password, None, log=say)
    return 0


def cmd_housekeeping(args: argparse.Namespace) -> int:
    need_root()
    access.sweep(log=lambda *_: None)
    view = overview.gather()
    address = ", ".join(view["addresses"]) or "no address"
    detail = "; ".join(view["problems"][:2])
    system.write_atomic(system.ISSUE_FILE, render.issue(view["name"], address, view["state"], detail), 0o644)
    return 0


def cmd_install_app(args: argparse.Namespace) -> int:
    need_root()
    say(maintain.install_app(args.ref, say))
    return 0


def cmd_version(args: argparse.Namespace) -> int:
    say(f"Ludora OS {system.VERSION}")
    return 0


def parser() -> argparse.ArgumentParser:
    top = argparse.ArgumentParser(prog="ludoractl", description="Manage a Ludora OS server.")
    sub = top.add_subparsers(dest="command", required=True, metavar="command")

    def add(name: str, func: Any, help_text: str) -> argparse.ArgumentParser:
        p = sub.add_parser(name, help=help_text, description=help_text)
        p.set_defaults(func=func)
        return p

    p = add("status", cmd_status, "One picture of the server.")
    p.add_argument("--json", action="store_true")
    p = add("doctor", cmd_doctor, "Check that every protection is still in place.")
    p.add_argument("--json", action="store_true")
    p = add("apply", cmd_apply, "Put the settings into effect.")
    p.add_argument("--check", action="store_true", help="only say what would change")
    p.add_argument("--no-restart", action="store_true", help="write the files, reload nothing")
    p.add_argument("--firewall-only", action="store_true", help="make and load the firewall rules, touch nothing else")
    p = add("set", cmd_set, "Change one setting (then `apply`).")
    p.add_argument("key")
    p.add_argument("value")
    p = add("get", cmd_get, "Show the settings, or one of them.")
    p.add_argument("key", nargs="?")
    p = add("ban", cmd_ban, "Refuse an address for a while.")
    p.add_argument("address")
    p.add_argument("--minutes", type=int, default=60, choices=range(1, 10081), metavar="1-10080")
    p = add("unban", cmd_unban, "Let a banned address back in.")
    p.add_argument("address")
    p = add("bans", cmd_bans, "Who is banned right now.")
    p.add_argument("--json", action="store_true")
    p = add("shield", cmd_shield, "Tighten every limit: on, off, or auto (the sentinel decides).")
    p.add_argument("mode", choices=["on", "off", "auto"])
    p = add("lockdown", cmd_lockdown, "Close Ludora to everyone outside the trusted networks.")
    p.add_argument("mode", choices=["on", "off"])
    p = add("events", cmd_events, "What the sentinel has seen.")
    p.add_argument("-n", "--lines", type=int, default=40)
    p.add_argument("--json", action="store_true")
    p = add("logs", cmd_logs, "Recent log lines from one service.")
    p.add_argument("what", choices=sorted(maintain.SERVICES))
    p.add_argument("-n", "--lines", type=int, default=80)
    p = add("admin", cmd_admin, "Administrators: SSH keys, and Ludora's first super administrator.")
    admin = p.add_subparsers(dest="action", required=True)
    a = admin.add_parser("add-key")
    a.add_argument("--key")
    a.add_argument("--github", metavar="USER")
    a.add_argument("--yes", action="store_true")
    admin.add_parser("list")
    a = admin.add_parser("remove-key")
    a.add_argument("fingerprint")
    a = admin.add_parser("grant")
    a.add_argument("username")
    p = add("support", cmd_support, "Short-lived, restricted remote access for someone helping you.")
    support = p.add_subparsers(dest="action", required=True)
    a = support.add_parser("open")
    a.add_argument("--key", help="the helper's public key (or give it on standard input)")
    a.add_argument("--hours", type=float, default=2.0)
    a.add_argument("--from", dest="source", required=True, help="the address the helper connects from")
    support.add_parser("close")
    support.add_parser("status")
    add("backup", cmd_backup, "Back up the database and uploads now (encrypted).")
    add("backups", cmd_backups, "List the backups kept.")
    p = add("restore", cmd_restore, "Put a backup back (replaces the database).")
    p.add_argument("stamp", nargs="?")
    p.add_argument("--yes", action="store_true")
    p = add("update", cmd_update, "Update Ludora (with automatic return on failure) or the operating system.")
    p.add_argument("what", choices=["app", "os"])
    p.add_argument("--ref", help="branch, tag or commit of Ludora")
    p = add("images", cmd_images, "Pin the database and proxy images to exact versions.")
    p.add_argument("action", choices=["pin"])
    p = add("restart", cmd_restart, "Restart a service.")
    p.add_argument("what", choices=sorted(maintain.SERVICES) + ["all"])
    add("reboot", cmd_power, "Restart the server.")
    add("poweroff", cmd_power, "Shut the server down.")
    p = add("alerts", cmd_alerts, "Who is told about attacks, upkeep and cheating, and a test message.")
    alert_actions = p.add_subparsers(dest="action", required=True)
    alert_actions.add_parser("show", help="the lists and what, if anything, stops delivery")
    a = alert_actions.add_parser("test", help="send a test message to a list, or to all three")
    a.add_argument("audience", nargs="?", choices=sorted(alerts.AUDIENCES))
    a = alert_actions.add_parser("secret", help="set the mail password or the Telegram bot token (read from standard input, never from the command line)")
    a.add_argument("name", choices=["smtp-password", "telegram-token"])
    alert_actions.add_parser("topic", help="make a long random ntfy topic name for phone pushes")
    p = add("dash", cmd_dash, "The web staff dashboard: its password, an optional authenticator code, on and off.")
    dash_actions = p.add_subparsers(dest="action", required=True)
    for name in ("status", "password", "on", "off"):
        dash_actions.add_parser(name)
    a = dash_actions.add_parser("code", help="ask for a six-digit authenticator code as well as the password")
    a.add_argument("mode", choices=["on", "off"])
    add("dash-op", cmd_dash_op, "Used by the staff dashboard itself: one request on standard input.")
    p = add("ai", cmd_ai, "The optional AI model: one extra line on security alerts, beside the guard's own reading.")
    p.add_argument("action", choices=["status", "install", "on", "off", "bench"])
    p.add_argument("--anyway", action="store_true", help="with `on`: keep the model on even if it fails its test (its line is then marked with its score)")
    p = add("usb", cmd_usb, "Trust the USB devices plugged in now and refuse new ones.")
    p.add_argument("action", choices=["init"])
    p = add("tls", cmd_tls, "Print the server's own root certificate (TLS_MODE=internal).")
    p.add_argument("action", choices=["ca"])
    add("claim", cmd_claim, "First boot: read the administrator's new password from standard input and bring Ludora up.")
    add("housekeeping", cmd_housekeeping, "Timer job: close expired support access, refresh the sign-in screen.")
    p = add("install-app", cmd_install_app, "Build or load Ludora's image if it is not there.")
    p.add_argument("--ref")
    add("version", cmd_version, "Print the version.")
    return top


def main(argv: list[str] | None = None) -> int:
    args = parser().parse_args(argv)
    try:
        return int(args.func(args) or 0)
    except (Refused, config.ConfigError, applier.ApplyError, access.AccessError, maintain.MaintainError) as err:
        print(f"ludoractl: {err}", file=sys.stderr)
        return 2
    except system.CommandError as err:
        print(f"ludoractl: {err}", file=sys.stderr)
        return 3
    except KeyboardInterrupt:
        return 130
    except BrokenPipeError:
        # The reader went away (`ludoractl doctor | head`). Point stdout at nothing so the exit is quiet.
        os.dup2(os.open(os.devnull, os.O_WRONLY), sys.stdout.fileno())
        return 0


_SUPPORT_LINE = re.compile(r"^[a-z -]{1,40}$")


def support_shell() -> int:
    """What a support key gets instead of a shell: one command from a fixed list."""
    requested = " ".join((os.environ.get("SSH_ORIGINAL_COMMAND") or "").split())
    if requested.startswith("ludoractl "):
        requested = requested[len("ludoractl "):]
    if not requested or requested == "help":
        print("Ludora OS support access. You can run:")
        for verb in sorted(access.SUPPORT_VERBS):
            print(f"  ssh {system.SUPPORT_USER}@this-server {verb}")
        return 0
    verb = access.SUPPORT_VERBS.get(requested) if _SUPPORT_LINE.match(requested) else None
    if verb is None:
        print("That command is not available over support access. Send `help` for the list.", file=sys.stderr)
        return 126
    os.execv("/usr/bin/sudo", ["sudo", "--non-interactive", "/usr/local/sbin/ludoractl", *verb])
    return 127


if __name__ == "__main__":
    raise SystemExit(main())
