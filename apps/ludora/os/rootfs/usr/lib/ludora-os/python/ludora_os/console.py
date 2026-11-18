"""The Ludora OS console: the server's own screen.

Arrow keys and Enter. On first boot it walks through claiming the server; after
that it is a dashboard with everything an administrator does, in plain words.
It is a face on `ludoractl`: nothing here can do what the command line cannot.
"""

from __future__ import annotations

import curses
import locale
import os
import subprocess
import sys
import textwrap
import threading
import time
from typing import Any, Callable

from . import access, alerts, config, ctl, doctor, maintain, overview, sentinel, system
from . import apply as applier

MIN_ROWS, MIN_COLS = 22, 78


class Quit(Exception):
    pass


class UI:
    def __init__(self, screen: "curses._CursesWindow"):
        self.s = screen
        curses.curs_set(0)
        self.s.keypad(True)
        self.colour = curses.has_colors()
        if self.colour:
            curses.start_color()
            try:
                curses.use_default_colors()
                background = -1
            except curses.error:
                background = curses.COLOR_BLACK
            curses.init_pair(1, curses.COLOR_YELLOW, curses.COLOR_BLUE)  # the bar: Ludora's gold on navy
            curses.init_pair(2, curses.COLOR_GREEN, background)
            curses.init_pair(3, curses.COLOR_RED, background)
            curses.init_pair(4, curses.COLOR_YELLOW, background)
            curses.init_pair(5, curses.COLOR_CYAN, background)
            curses.init_pair(6, curses.COLOR_BLACK, curses.COLOR_YELLOW)  # the selected line

    # ---- drawing -------------------------------------------------------------------------
    def attr(self, name: str) -> int:
        pairs = {"bar": 1, "good": 2, "bad": 3, "warn": 4, "accent": 5, "pick": 6}
        if name == "bold":
            return curses.A_BOLD
        if name == "dim":
            return curses.A_DIM
        if not self.colour:
            return {"bar": curses.A_REVERSE, "pick": curses.A_REVERSE, "bad": curses.A_BOLD}.get(name, 0)
        return curses.color_pair(pairs[name]) | (curses.A_BOLD if name in ("bar", "bad", "good") else 0)

    def size(self) -> tuple[int, int]:
        return self.s.getmaxyx()

    def put(self, row: int, col: int, text: str, attr: int = 0) -> None:
        rows, cols = self.size()
        if 0 <= row < rows and 0 <= col < cols - 1:
            try:
                self.s.addnstr(row, col, text, cols - 1 - col, attr)
            except curses.error:
                pass

    def frame(self, title: str, footer: str) -> int:
        """Clear, draw the top and bottom bars, return the first free row."""
        self.s.erase()
        rows, cols = self.size()
        bar = self.attr("bar")
        self.put(0, 0, " " * (cols - 1), bar)
        self.put(0, 1, "Ludora OS", bar)
        self.put(0, 12, title, bar)
        self.put(rows - 1, 0, " " * (cols - 1), bar)
        self.put(rows - 1, 1, footer, bar)
        return 2

    def wrap(self, text: str, indent: int = 2) -> list[str]:
        cols = self.size()[1]
        out: list[str] = []
        for paragraph in text.split("\n"):
            out += textwrap.wrap(paragraph, max(20, cols - indent * 2)) or [""]
        return out

    def too_small(self) -> bool:
        rows, cols = self.size()
        if rows >= MIN_ROWS and cols >= MIN_COLS:
            return False
        self.s.erase()
        self.put(0, 0, f"This screen is {cols} by {rows}. Ludora OS needs {MIN_COLS} by {MIN_ROWS}.")
        self.s.refresh()
        return True

    def key(self, timeout_ms: int = -1) -> int:
        self.s.timeout(timeout_ms)
        try:
            return self.s.getch()
        except KeyboardInterrupt:
            return 27

    # ---- widgets -------------------------------------------------------------------------
    def message(self, title: str, text: str, footer: str = "Enter: continue") -> None:
        while True:
            row = self.frame(title, footer)
            for line in self.wrap(text):
                self.put(row, 2, line)
                row += 1
            self.s.refresh()
            if self.key() in (10, 13, 27, curses.KEY_ENTER, ord(" "), ord("q")):
                return

    def menu(self, title: str, items: list[tuple[str, str]], intro: str = "", footer: str = "Up/Down: move   Enter: choose   Esc: back", start: int = 0) -> int | None:
        """items: (label, hint). Returns the chosen index, or None for back."""
        at = min(start, max(0, len(items) - 1))
        while True:
            if self.too_small():
                self.key()
                continue
            row = self.frame(title, footer)
            for line in self.wrap(intro) if intro else []:
                self.put(row, 2, line)
                row += 1
            row += 1 if intro else 0
            rows = self.size()[0]
            room = max(1, rows - row - 4)
            first = max(0, min(at - room + 1, len(items) - room)) if at >= room else 0
            for i in range(first, min(len(items), first + room)):
                label = items[i][0]
                self.put(row, 2, f" {label:<{min(60, self.size()[1] - 6)}} ", self.attr("pick") if i == at else 0)
                row += 1
            hint = items[at][1] if items else ""
            for n, line in enumerate(self.wrap(hint)[:2]):
                self.put(rows - 3 + n, 2, line, self.attr("accent"))
            self.s.refresh()
            k = self.key()
            if k in (curses.KEY_UP, ord("k")):
                at = (at - 1) % len(items)
            elif k in (curses.KEY_DOWN, ord("j"), 9):
                at = (at + 1) % len(items)
            elif k in (curses.KEY_HOME,):
                at = 0
            elif k in (curses.KEY_END,):
                at = len(items) - 1
            elif k in (10, 13, curses.KEY_ENTER):
                return at
            elif k in (27, curses.KEY_LEFT, ord("q")):
                return None
            elif ord("1") <= k <= ord("9") and k - ord("1") < len(items):
                at = k - ord("1")

    def ask(self, title: str, question: str, *, secret: bool = False, default: str = "", check: Callable[[str], str | None] | None = None, limit: int = 900) -> str | None:
        """One line of text. `check` returns a complaint or None. Esc gives None."""
        value = default
        complaint = ""
        curses.curs_set(1)
        try:
            while True:
                row = self.frame(title, "Enter: accept   Esc: cancel")
                for line in self.wrap(question):
                    self.put(row, 2, line)
                    row += 1
                row += 1
                cols = self.size()[1]
                width = cols - 6
                shown = "*" * len(value) if secret else value
                shown = shown[-(width - 1):]
                self.put(row, 2, "> " + shown + " " * (width - len(shown)), curses.A_UNDERLINE)
                if complaint:
                    for n, line in enumerate(self.wrap(complaint)[:3]):
                        self.put(row + 2 + n, 2, line, self.attr("bad"))
                try:
                    self.s.move(row, min(cols - 2, 4 + len(shown)))
                except curses.error:
                    pass
                self.s.refresh()
                k = self.key()
                if k == 27:
                    return None
                if k in (10, 13, curses.KEY_ENTER):
                    answer = value if secret else value.strip()
                    complaint = (check(answer) if check else None) or ""
                    if not complaint:
                        return answer
                elif k in (curses.KEY_BACKSPACE, 127, 8):
                    value = value[:-1]
                elif k == 21:  # Ctrl-U
                    value = ""
                elif 32 <= k < 127 and len(value) < limit:
                    value += chr(k)
        finally:
            curses.curs_set(0)

    def confirm(self, title: str, question: str, *, danger: bool = False) -> bool:
        if danger:
            typed = self.ask(title, question + "\n\nType YES to go ahead.")
            return typed == "YES"
        return self.menu(title, [("No, go back", ""), ("Yes", "")], intro=question, footer="Up/Down: move   Enter: choose") == 1

    def pager(self, title: str, lines: list[str]) -> None:
        top = 0
        while True:
            rows, cols = self.size()
            room = rows - 3
            self.frame(title, "Up/Down, PgUp/PgDn: scroll   Esc: back")
            flat: list[str] = []
            for line in lines:
                flat += textwrap.wrap(line, cols - 4, subsequent_indent="    ") or [""]
            top = max(0, min(top, max(0, len(flat) - room)))
            for i, line in enumerate(flat[top : top + room]):
                attr = self.attr("bad") if "FAIL" in line[:9] else (self.attr("good") if line.startswith("[  ok") else 0)
                self.put(2 + i, 2, line, attr)
            self.s.refresh()
            k = self.key()
            if k in (27, ord("q"), 10, 13, curses.KEY_LEFT):
                return
            if k == curses.KEY_UP:
                top -= 1
            elif k == curses.KEY_DOWN:
                top += 1
            elif k == curses.KEY_PPAGE:
                top -= room
            elif k in (curses.KEY_NPAGE, ord(" ")):
                top += room
            elif k == curses.KEY_HOME:
                top = 0
            elif k == curses.KEY_END:
                top = len(flat)

    def task(self, title: str, work: Callable[[Callable[[str], None]], Any]) -> tuple[bool, Any]:
        """Run something slow, showing what it says as it goes. Returns (worked, result or error text)."""
        lines: list[str] = []
        outcome: dict[str, Any] = {}

        def log(*parts: Any) -> None:
            lines.append(" ".join(str(p) for p in parts))

        def run() -> None:
            try:
                outcome["result"] = work(log)
            except Exception as err:  # shown to the person at the screen, never a stack trace
                outcome["error"] = str(err) or err.__class__.__name__

        thread = threading.Thread(target=run, daemon=True)
        thread.start()
        spinner = "|/-\\"
        tick = 0
        while True:
            done = not thread.is_alive()
            rows = self.size()[0]
            self.frame(title, "Enter: continue" if done else "Working... please wait")
            shown: list[str] = []
            for line in lines:
                shown += self.wrap(line)
            for i, line in enumerate(shown[-(rows - 6):]):
                self.put(2 + i, 2, line)
            row = 2 + min(len(shown), rows - 6) + 1
            if not done:
                self.put(row, 2, spinner[tick % 4] + " working", self.attr("accent"))
            elif "error" in outcome:
                for n, line in enumerate(self.wrap("It did not work: " + outcome["error"])[:4]):
                    self.put(row + n, 2, line, self.attr("bad"))
            else:
                result = outcome.get("result")
                for n, line in enumerate(self.wrap(str(result) if isinstance(result, str) and result else "Done.")[:4]):
                    self.put(row + n, 2, line, self.attr("good"))
            self.s.refresh()
            k = self.key(200)
            tick += 1
            if done and k in (10, 13, 27, curses.KEY_ENTER, ord(" ")):
                return ("error" not in outcome, outcome.get("result", outcome.get("error")))


# ---- helpers -----------------------------------------------------------------------------------


def check_setting(key: str) -> Callable[[str], str | None]:
    def check(value: str) -> str | None:
        trial = config.load()
        try:
            config.set_value(trial, key, value)
        except config.ConfigError as err:
            return str(err).split(": ", 1)[-1]
        return None

    return check


def save_settings(changes: dict[str, str]) -> str | None:
    cfg = config.load()
    try:
        for key, value in changes.items():
            config.set_value(cfg, key, value)
        config.save(cfg)
    except config.ConfigError as err:
        return str(err)
    return None


def shell_out(ui: UI, argv: list[str]) -> None:
    """Hand the screen to another full-screen program (the network editor), then take it back."""
    curses.endwin()
    try:
        subprocess.call(argv)
    except FileNotFoundError:
        print(f"{argv[0]} is not installed.")
        time.sleep(2)
    ui.s.refresh()
    curses.doupdate()


# ---- first boot --------------------------------------------------------------------------------


def wizard(ui: UI) -> None:
    ui.message(
        "Welcome",
        "This server is sealed: nothing on the network can connect to it yet.\n\n"
        "The next few screens set it up. You will choose the address people open, say who runs it, "
        "and make the administrator's password. Then the server builds Ludora and opens for your school.\n\n"
        "It needs the internet for this step (about ten minutes).",
    )
    while True:
        found = overview.addresses()
        if found:
            break
        choice = ui.menu("Network", [("Open the network settings", "Set an address, a gateway and name servers."), ("Look again", ""), ("Shut down", "")],
                         intro="This server has no network address yet. Plug in the cable, or set one by hand.")
        if choice == 0:
            shell_out(ui, ["nmtui"])
        elif choice == 2:
            system.run(["systemctl", "poweroff"])
            raise Quit
    cfg = config.load()
    settings: dict[str, str] = {}

    mode = ui.menu(
        "How people reach Ludora",
        [
            ("On the school network only", "People open the server by its address or an internal name. The server makes its own certificate; you install its root on school devices."),
            ("From the internet, with a public name", "You own a name such as play.your-school.org that points here. The certificate is issued and renewed automatically."),
        ],
        intro="Where will students and teachers connect from?",
    )
    if mode is None:
        raise Quit
    settings["TLS_MODE"] = "public" if mode == 1 else "internal"
    default = cfg["DOMAIN"] or ("" if mode == 1 else found[0])
    domain = ui.ask("The address people open", "Type the name or address, without https://." + ("" if mode == 1 else f"\nThis server's address is {', '.join(found)}."),
                    default=default, check=lambda v: check_setting("DOMAIN")(v) or (None if v else "This is needed.") or (("A public certificate needs a full name, not an address.") if mode == 1 and ("." not in v or v.replace(".", "").isdigit()) else None))
    if domain is None:
        raise Quit
    settings["DOMAIN"] = domain

    name = ui.ask("Who runs this server", "The school or person responsible. It is shown on the privacy policy.", default=cfg["OPERATOR_NAME"], check=lambda v: check_setting("OPERATOR_NAME")(v) or (None if v else "This is needed."))
    if name is None:
        raise Quit
    contact = ui.ask("Contact", "How people reach you about their data: an email address or a web page.", default=cfg["OPERATOR_CONTACT"], check=lambda v: check_setting("OPERATOR_CONTACT")(v) or (None if v else "This is needed."))
    if contact is None:
        raise Quit
    settings["OPERATOR_NAME"], settings["OPERATOR_CONTACT"] = name, contact

    trusted = ui.ask("Staff addresses (optional)", "Addresses that are never banned or slowed: the teacher's desk, the IT office. Give networks such as 10.20.9.0/24, separated by commas. Leave empty to decide later.",
                     default=",".join(cfg["TRUSTED_NETS"]), check=check_setting("TRUSTED_NETS"))
    if trusted is None:
        raise Quit
    settings["TRUSTED_NETS"] = trusted
    if mode == 0:
        lan = ui.ask("School networks (optional)", "If given, only these networks can open Ludora at all, such as 10.20.0.0/16. Leave empty to let any address in.",
                     default=",".join(cfg["LAN_NETS"]), check=check_setting("LAN_NETS"))
        if lan is None:
            raise Quit
        settings["LAN_NETS"] = lan
        shared = ui.menu("One address for many students?", [("No: each device has its own address", "The usual case on a school network."), ("Yes: students arrive through one shared address", "Web limits are raised and the shared address is never banned for web behaviour.")],
                         intro="Some networks send every student through one gateway address.")
        settings["NAT_MODE"] = "yes" if shared == 1 else "no"

    while True:
        password = ui.ask("Administrator password", f"Make the password for {system.ADMIN_USER}. At least 12 characters; four unrelated words work well. It is asked for at this screen and for every change.", secret=True, check=ctl.password_problem)
        if password is None:
            raise Quit
        again = ui.ask("Administrator password", "Type it once more.", secret=True)
        if again == password:
            break
        ui.message("Administrator password", "Those two did not match. Nothing was set.")
    grub = None
    if ui.confirm("Boot menu", "Protect the boot menu with the same password? Without it, someone at the keyboard can change how the server starts."):
        grub = password

    problem = save_settings(settings)
    if problem:
        ui.message("Settings", "Those settings do not fit together: " + problem + "\n\nThe setup starts again.")
        return
    certificate = "public (Let's Encrypt)" if settings["TLS_MODE"] == "public" else "the server's own authority"
    summary = (f"Address: https://{settings['DOMAIN']}\nCertificate: {certificate}\n"
               f"Run by: {name} ({contact})\nStaff addresses: {settings['TRUSTED_NETS'] or 'none yet'}\n\nReady to build Ludora and open the server?")
    if not ui.confirm("Ready", summary):
        return
    ok, result = ui.task("Setting up", lambda log: ctl.claim(password, grub, log=log))
    if not ok:
        ui.message("Setup did not finish", f"{result}\n\nThe server is still sealed. Fix the cause (most often the network) and the setup runs again.")
        return
    ui.message(
        "Ludora is open",
        f"Open https://{settings['DOMAIN']} and sign up: that first account becomes a normal account.\n\n"
        f"Then sign in here as {system.ADMIN_USER}, type `ludora`, and choose Ludora > Make an account a super administrator.\n\n"
        + ("The server made its own certificate authority. Choose Ludora > Show the certificate authority and install it on school devices, so browsers trust the padlock.\n\n" if settings["TLS_MODE"] == "internal" else "")
        + "Remote access is off. Everything is managed from this screen until you switch SSH on.",
    )


# ---- dashboard -----------------------------------------------------------------------------------


def draw_dashboard(ui: UI, view: dict[str, Any], events: list[dict[str, Any]], items: list[tuple[str, str]], at: int) -> None:
    row = ui.frame(f"{view['name']}   {', '.join(view['addresses']) or 'no address'}", "Up/Down: move   Enter: open   r: refresh   q: sign out")
    cols = ui.size()[1]
    good = view["state"] == "OK"
    ui.put(row, 2, " ALL GOOD " if good else " ATTENTION ", ui.attr("good" if good else "bad") | curses.A_REVERSE)
    ui.put(row, 14, "; ".join(view["problems"]) if view["problems"] else (view["url"] or ""), 0 if good else ui.attr("bad"))
    row += 2
    col = 2
    for name, state in view["services"].items():
        if name == "ssh" and state != "active":
            label, attr = f"{name}: off", ui.attr("dim")
        else:
            label, attr = f"{name}: {'up' if state == 'active' else state}", ui.attr("good" if state == "active" else "bad")
        if col + len(label) + 3 > cols:
            row, col = row + 1, 2
        ui.put(row, col, label, attr)
        col += len(label) + 3
    row += 2
    level = view["threat_level"]
    ui.put(row, 2, "Threat: ")
    ui.put(row, 10, view["threat"], ui.attr("good" if level == 0 else ("warn" if level == 1 else "bad")))
    extra = f"   shield {'UP' if view['shield'] else 'down'} ({view['shield_mode']})   lockdown {'ON' if view['lockdown'] else 'off'}   banned now: {len(view['bans'])}"
    ui.put(row, 10 + len(view["threat"]), extra, ui.attr("bad") if view["lockdown"] else 0)
    row += 1
    checks = view["checks"]
    line = "Self-check: not run yet" if checks["passed"] is None else f"Self-check: {checks['passed']} passing, {checks['failed']} failing"
    age = view["backup_age_hours"]
    line += "   Backups: none yet" if age is None else f"   Backups: {view['backups']} kept, newest {age} h old"
    ui.put(row, 2, line, ui.attr("warn") if checks["failed"] else 0)
    row += 1
    if view["support"]:
        left = max(0, int((view["support"]["until"] - time.time()) / 60))
        ui.put(row, 2, f"Support access is OPEN for {left} more minutes, from {view['support']['from']}", ui.attr("warn"))
        row += 1
    row += 1
    menu_top = row
    for i, (label, _) in enumerate(items):
        ui.put(menu_top + i, 2, f" {label:<28} ", ui.attr("pick") if i == at else 0)
    side = 36
    if cols > side + 30:
        ui.put(menu_top, side, "Lately", ui.attr("accent"))
        room = max(0, ui.size()[0] - menu_top - 4)
        for i, event in enumerate(reversed(events[-room:] if room else [])):
            when = time.strftime("%H:%M", time.localtime(event.get("at", 0)))
            severity = event.get("severity", "")
            attr = ui.attr("bad") if severity == "alert" else (ui.attr("warn") if severity == "warning" else 0)
            ui.put(menu_top + 1 + i, side, f"{when} {event.get('text', '')}"[: cols - side - 2], attr)
        if not events:
            ui.put(menu_top + 1, side, "Nothing to report.", ui.attr("dim"))
    hint = items[at][1]
    ui.put(ui.size()[0] - 3, 2, hint[: cols - 4], ui.attr("accent"))
    ui.s.refresh()


def dashboard(ui: UI) -> None:
    items = [
        ("Security", "What the sentinel saw, who is banned, shield, lockdown, the self-check."),
        ("Settings", "The address, staff and school networks, alerts."),
        ("Remote access", "SSH and its keys; short-lived support access for a helper."),
        ("Maintenance", "Backups, updates, restarts."),
        ("Ludora", "Make a super administrator, the certificate authority, logs."),
        ("Network", "This server's address, gateway and name servers."),
        ("Sign out", ""),
    ]
    actions = [security, settings_menu, remote, maintenance, ludora_menu, lambda u: shell_out(u, ["nmtui"])]
    at = 0
    view, events, fetched = overview.gather(), sentinel.read_events(30), time.time()
    while True:
        if ui.too_small():
            ui.key(1000)
            continue
        if time.time() - fetched > 5:
            view, events, fetched = overview.gather(), sentinel.read_events(30), time.time()
        draw_dashboard(ui, view, events, items, at)
        k = ui.key(1000)
        if k in (curses.KEY_UP, ord("k")):
            at = (at - 1) % len(items)
        elif k in (curses.KEY_DOWN, ord("j"), 9):
            at = (at + 1) % len(items)
        elif k == ord("r"):
            fetched = 0
        elif k in (ord("q"), 27):
            return
        elif k in (10, 13, curses.KEY_ENTER):
            if at == len(items) - 1:
                return
            actions[at](ui)
            fetched = 0


def apply_now(ui: UI, title: str = "Applying") -> bool:
    ok, _ = ui.task(title, lambda log: (applier.apply(log=log), "The settings are in effect.")[1])
    return ok


def security(ui: UI) -> None:
    while True:
        view = overview.gather()
        choice = ui.menu(
            "Security",
            [
                ("What happened lately", "Everything the sentinel noticed, newest last."),
                (f"Banned addresses ({len(view['bans'])})", "See who is banned and let someone back in."),
                ("Ban an address", "Refuse one address for an hour."),
                (f"Shield: {view['shield_mode']}" + (" (UP now)" if view["shield"] else ""), "The shield cuts every limit to a quarter. auto lets the sentinel raise it under attack."),
                (f"Lockdown: {'ON' if view['lockdown'] else 'off'}", "Lockdown closes Ludora to everyone outside the staff addresses. Use it to stop an attack during a lesson."),
                ("Run the self-check", "Is every protection still in place? About a minute."),
                ("Alerts: who is told", "The people told about attacks, upkeep and cheating; send a test; set the mail password."),
            ],
            intro=f"Threat level: {view['threat']}.",
        )
        if choice is None:
            return
        if choice == 0:
            events = sentinel.read_events(300)
            ui.pager("What happened lately", [f"{time.strftime('%d %b %H:%M:%S', time.localtime(e.get('at', 0)))}  {e.get('severity', ''):<8} {e.get('text', '')}" for e in events] or ["Nothing has happened yet."])
        elif choice == 1:
            held = sentinel.kernel_bans()
            if not held:
                ui.message("Banned addresses", "Nobody is banned.")
                continue
            listing = sorted(held.items())
            pick = ui.menu("Banned addresses", [(f"{ip}   {max(1, left // 60)} min left", "Enter lets this address back in.") for ip, left in listing], intro="Choose an address to let back in.")
            if pick is not None and ui.confirm("Unban", f"Let {listing[pick][0]} connect again?"):
                ctl.main(["unban", listing[pick][0]])
        elif choice == 2:
            ip = ui.ask("Ban an address", "The address to refuse for an hour.")
            if ip:
                ok, result = ui.task("Banning", lambda log, ip=ip: _ctl(["ban", ip]))
        elif choice == 3:
            mode = ui.menu("Shield", [("auto", "The sentinel raises it under attack and lowers it after 15 quiet minutes."), ("on", "Up now, until you change it."), ("off", "Never up.")], intro="Choose how the shield behaves.")
            if mode is not None:
                ui.task("Shield", lambda log, m=("auto", "on", "off")[mode]: _ctl(["shield", m]))
        elif choice == 4:
            turning_on = not view["lockdown"]
            cfg = config.load()
            warning = "Only the staff addresses will be able to open Ludora. Games in play for everyone else stop." + ("" if cfg["TRUSTED_NETS"] else " There are no staff addresses set, so NOBODY will get in.")
            if ui.confirm("Lockdown", warning if turning_on else "Open Ludora to everyone again?"):
                ui.task("Lockdown", lambda log, m=("on" if turning_on else "off"): _ctl(["lockdown", m]))
        elif choice == 5:
            ok, report = ui.task("Self-check", lambda log: doctor.run_all())
            if ok and isinstance(report, dict):
                marks = {"pass": "[  ok  ]", "fail": "[ FAIL ]", "unknown": "[  ??  ]"}
                ui.pager(f"Self-check: {report['passed']} passing, {report['failed']} failing", [f"{marks[c['state']]} {c['title']}: {c['detail']}" for c in report["checks"]])
        elif choice == 6:
            alerts_menu(ui)


def alerts_menu(ui: UI) -> None:
    while True:
        cfg = config.load()
        lists = [(audience, key, label, cfg[key]) for audience, (key, label) in alerts.AUDIENCES.items()]
        rows = [(f"{label}: {', '.join(to) if to else 'nobody'}", config.BY_KEY[key].help) for _, key, label, to in lists]
        rows += [
            ("Send a test to everyone listed", "Each list gets one message saying it is a test."),
            ("Set the mail account's password", "Needed when alerts go by email through an account that signs in."),
            ("Set the Telegram bot's token", "Needed for telegram: recipients. BotFather gives it to you when you make the bot."),
            ("Make a topic for phone pushes", "A long random ntfy topic name to subscribe to in the free ntfy phone app."),
        ]
        found = alerts.problems(cfg)
        intro = "Free ways only: email, a push to the ntfy phone app, or a Telegram message. " + (("Not working yet: " + " ".join(found)) if found else "The mail server is under Settings.")
        choice = ui.menu("Alerts", rows, intro=intro)
        if choice is None:
            return
        if choice < len(lists):
            _, key, label, to = lists[choice]
            value = ui.ask(label, "Email addresses, ntfy:<topic> or telegram:<chat number>, separated by commas. Empty for nobody.", default=", ".join(to), check=check_setting(key))
            if value is not None:
                problem = save_settings({key: value})
                if problem:
                    ui.message(label, "That does not fit with the other settings: " + problem)
                else:
                    apply_now(ui)
        elif choice == len(lists):
            ok, result = ui.task("Sending a test", lambda log: _ctl(["alerts", "test"]))
            ui.message("Test sent" if ok else "The test did not go through", str(result))
        elif choice in (len(lists) + 1, len(lists) + 2):
            name = "SMTP_PASSWORD" if choice == len(lists) + 1 else "TELEGRAM_BOT_TOKEN"
            value = ui.ask(rows[choice][0], "Type or paste it. It is kept in a file only the server's own services can read.", secret=True)
            if value:
                try:
                    alerts.save_secret(name, value)
                    system.run(["systemctl", "try-restart", "ludora-sentinel.service"])
                    ui.message("Alerts", "Saved. Send a test to check it works.")
                except ValueError as err:
                    ui.message("Alerts", f"Not saved: {err}.")
        else:
            ok, result = ui.task("Phone pushes", lambda log: _ctl(["alerts", "topic"]))
            ui.message("A topic for phone pushes", str(result))


def _ctl(argv: list[str]) -> str:
    """Run a ludoractl command inside the console and return what it said (or raise with what it complained)."""
    import contextlib
    import io

    out, err = io.StringIO(), io.StringIO()
    with contextlib.redirect_stdout(out), contextlib.redirect_stderr(err):
        code = ctl.main(argv)
    if code not in (0,):
        raise RuntimeError(err.getvalue().replace("ludoractl: ", "").strip() or out.getvalue().strip() or "it was refused")
    return out.getvalue().strip()


def settings_menu(ui: UI) -> None:
    fields = [
        ("DOMAIN", "The address people open"),
        ("TLS_MODE", "Certificate: public, internal or custom"),
        ("OPERATOR_NAME", "Who runs this server"),
        ("OPERATOR_CONTACT", "Contact for privacy questions"),
        ("TRUSTED_NETS", "Staff addresses (never banned or slowed)"),
        ("LAN_NETS", "School networks (only these may open Ludora)"),
        ("BLOCKED_NETS", "Addresses that are always refused"),
        ("NAT_MODE", "Students share one address: yes or no"),
        ("ALERT_SECURITY_TO", "Told about attacks (email, ntfy:topic, telegram:chat)"),
        ("ALERT_UPKEEP_TO", "Told when the server needs care"),
        ("ALERT_CHEAT_TO", "Told about likely cheating in games"),
        ("SMTP_HOST", "Mail server for alert emails"),
        ("SMTP_PORT", "Mail server port"),
        ("SMTP_SECURITY", "Mail encryption: starttls or tls"),
        ("SMTP_USER", "Mail account"),
        ("SMTP_FROM", "Address alerts come from"),
        ("WEBHOOK_URL", "Also post serious alerts to (https address)"),
        ("SCHOOL_THEME", "School look"),
        ("IPV6", "IPv6: yes or no"),
        ("AUTO_REBOOT", "Restart at night for security updates: yes or no"),
        ("APP_REF", "Which version of Ludora to run"),
    ]
    dirty = False
    while True:
        cfg = config.load()
        rows = [(f"{label}: {('(set)' if key == 'WEBHOOK_URL' and cfg[key] else config._format(cfg[key])) or '-'}", config.BY_KEY[key].help) for key, label in fields]
        rows.append(("Apply the changes now" if dirty else "Back", "Nothing changes on the server until you apply." if dirty else ""))
        choice = ui.menu("Settings", rows, intro="Choose a setting to change.")
        if choice is None or choice == len(fields):
            if dirty and (choice == len(fields) or ui.confirm("Settings", "Apply the changes now? Otherwise they wait until the next apply.")):
                apply_now(ui)
            return
        key, label = fields[choice]
        value = ui.ask(label, config.BY_KEY[key].help, default="" if key == "WEBHOOK_URL" else config._format(cfg[key]), check=check_setting(key))
        if value is None:
            continue
        problem = save_settings({key: value})
        if problem:
            ui.message(label, "That does not fit with the other settings: " + problem)
        else:
            dirty = True


def remote(ui: UI) -> None:
    while True:
        cfg = config.load()
        keys = access.admin_keys()
        window = access.support_status()
        choice = ui.menu(
            "Remote access",
            [
                (f"SSH: {'on' if cfg['SSH_ENABLED'] else 'off'}", "SSH lets administrators manage the server from their own computer. Keys only, and only from the administrators' addresses."),
                (f"Administrators' addresses: {','.join(cfg['ADMIN_NETS']) or 'none'}", "The only addresses that may reach SSH."),
                (f"Administrators' keys ({len(keys)})", "Add a key from GitHub or paste one; remove a key."),
                ("Support access: " + ("OPEN" if window else "closed"), "Let a helper in for a few hours: one key, one address, a fixed list of commands, no shell. It closes by itself."),
            ],
        )
        if choice is None:
            return
        if choice == 0:
            if not cfg["SSH_ENABLED"] and (not cfg["ADMIN_NETS"] or not keys):
                ui.message("SSH", "Before SSH can be switched on, set the administrators' addresses and install at least one key. Otherwise nobody could sign in, or anybody could try.")
                continue
            if ui.confirm("SSH", f"Switch SSH {'off' if cfg['SSH_ENABLED'] else 'on'}?"):
                problem = save_settings({"SSH_ENABLED": "no" if cfg["SSH_ENABLED"] else "yes"})
                if problem:
                    ui.message("SSH", problem)
                else:
                    apply_now(ui)
        elif choice == 1:
            value = ui.ask("Administrators' addresses", "Addresses or small networks, separated by commas, such as 10.20.9.10.", default=",".join(cfg["ADMIN_NETS"]), check=check_setting("ADMIN_NETS"))
            if value is not None:
                problem = save_settings({"ADMIN_NETS": value})
                if problem:
                    ui.message("Administrators' addresses", problem)
                else:
                    apply_now(ui)
        elif choice == 2:
            keys_menu(ui)
        elif choice == 3:
            support_menu(ui)


def keys_menu(ui: UI) -> None:
    while True:
        keys = access.admin_keys()
        rows = [(f"{k.kind}  {k.fingerprint[:30]}...  {k.comment}", "Enter removes this key.") for k in keys]
        rows += [("Add keys from a GitHub account", "Fetches the public keys published at github.com/<name>.keys and shows their fingerprints first."), ("Paste a public key", "For a console that can paste: a serial console, a virtual machine, or SSH.")]
        choice = ui.menu("Administrators' keys", rows, intro="A key is what lets an administrator sign in over SSH. There are no passwords over SSH.")
        if choice is None:
            return
        try:
            if choice < len(keys):
                if ui.confirm("Remove a key", f"Remove {keys[choice].fingerprint} ({keys[choice].comment})?"):
                    access.remove_admin_key(keys[choice].fingerprint)
            elif choice == len(keys):
                user = ui.ask("GitHub account", "The GitHub user name whose public keys to install.")
                if not user:
                    continue
                ok, found = ui.task("Fetching keys", lambda log, user=user: access.github_keys(user))
                if not ok or not isinstance(found, list):
                    continue
                listing = "\n".join(f"{k.kind}  {k.fingerprint}" for k in found)
                if ui.confirm("Install these keys?", f"{user} publishes these keys. Check a fingerprint with their owner before trusting them.\n\n{listing}"):
                    for key in found:
                        try:
                            access.add_admin_key(key.line())
                        except access.AccessError:
                            pass
            else:
                line = ui.ask("Paste a public key", "One line, starting with ssh-ed25519 (or another key type).", limit=3000)
                if line:
                    key = access.add_admin_key(line)
                    ui.message("Key installed", f"{key.kind}\n{key.fingerprint}")
        except access.AccessError as err:
            ui.message("Administrators' keys", str(err))


def support_menu(ui: UI) -> None:
    window = access.support_status()
    if window:
        until = time.strftime("%d %b %H:%M", time.localtime(window["until"]))
        if ui.confirm("Support access", f"Support access is open until {until}, from {window['from']}, for key {window['fingerprint']}.\n\nClose it now?"):
            ui.task("Closing support access", lambda log: _ctl(["support", "close"]))
        return
    ui.message("Support access", "This lets one person help you for a limited time. They get no shell: only these commands.\n\n" + ", ".join(sorted(access.SUPPORT_VERBS)) +
               "\n\nYou need their public key and the address they connect from. Everything they run is in the audit log.")
    line = ui.ask("Helper's public key", "Paste the helper's public key (one line).", limit=3000, check=lambda v: _key_problem(v))
    if not line:
        return
    source = ui.ask("Helper's address", "The address the helper connects from, such as 203.0.113.7.")
    if not source:
        return
    hours = ui.ask("How long", "Hours of access, from 0.25 to 72.", default="2", check=lambda v: None if _is_number(v) else "Give a number of hours.")
    if not hours:
        return
    ui.task("Opening support access", lambda log: _ctl(["support", "open", "--key", line, "--from", source, "--hours", hours]))


def _key_problem(value: str) -> str | None:
    try:
        access.parse_public_key(value)
    except access.AccessError as err:
        return str(err)
    return None


def _is_number(value: str) -> bool:
    try:
        float(value)
    except ValueError:
        return False
    return True


def maintenance(ui: UI) -> None:
    while True:
        saved = maintain.backups()
        choice = ui.menu(
            "Maintenance",
            [
                ("Back up now", "The database and uploaded pictures, encrypted. It also runs by itself every night."),
                (f"Backups ({len(saved)})", "See them, and put one back."),
                ("Update Ludora", "Backs up, builds the new version, switches to it, and returns to the old one by itself if the new one is not healthy. Running games end."),
                ("Update the operating system", "Security updates install themselves every night; this does it now."),
                ("Restart Ludora", "Restarts the app only. Running games end; their results are saved."),
                ("Restart the server", ""),
                ("Shut the server down", ""),
            ],
        )
        if choice is None:
            return
        if choice == 0:
            ui.task("Backing up", lambda log: (maintain.backup(log), "Backed up.")[1])
        elif choice == 1:
            if not saved:
                ui.message("Backups", "There are no backups yet.")
                continue
            pick = ui.menu("Backups", [(f"{b['stamp']}   {b['size'] // 1024} KB   {b['age_hours']} h old", "Enter puts this backup back.") for b in saved],
                           intro=f"Kept in {system.BACKUP_DIR}, encrypted. Copy them off the server too: a backup on the same disk is lost with it.")
            if pick is not None and ui.confirm("Restore", f"Replace EVERYTHING in Ludora's database with the backup from {saved[pick]['stamp']}? Do this only when no class is playing.", danger=True):
                ui.task("Restoring", lambda log, stamp=saved[pick]["stamp"]: maintain.restore(stamp, log))
        elif choice == 2:
            if ui.confirm("Update Ludora", "Running games end during the update. Go ahead?"):
                ui.task("Updating Ludora", lambda log: maintain.update_app(None, log))
        elif choice == 3:
            ui.task("Updating the operating system", lambda log: maintain.update_os(log))
        elif choice == 4:
            if ui.confirm("Restart Ludora", "Running games end. Go ahead?"):
                ui.task("Restarting", lambda log: _ctl(["restart", "app"]))
        elif choice == 5:
            if ui.confirm("Restart the server", "Restart now?"):
                system.run(["systemctl", "reboot"])
        elif choice == 6:
            if ui.confirm("Shut down", "Shut the server down? Someone must press its power button to start it again.", danger=True):
                system.run(["systemctl", "poweroff"])


def ludora_menu(ui: UI) -> None:
    while True:
        choice = ui.menu(
            "Ludora",
            [
                ("Make an account a super administrator", "Sign up in the web app first, then name that account here."),
                ("Show the certificate authority", "The root certificate to install on school devices (certificate mode: internal)."),
                ("Logs: app", ""), ("Logs: database", ""), ("Logs: proxy", ""), ("Logs: sentinel", ""),
            ],
        )
        if choice is None:
            return
        if choice == 0:
            username = ui.ask("Super administrator", "The Ludora user name to promote.")
            if username:
                ui.task("Granting", lambda log, username=username: maintain.grant_admin(username))
        elif choice == 1:
            ok, result = ui.task("Certificate authority", lambda log: maintain.proxy_ca())
            if ok and isinstance(result, tuple):
                ui.pager("Certificate authority", [f"SHA-256 fingerprint: {result[1]}", "", "Get the file with: sudo ludoractl tls ca", ""] + result[0].splitlines())
        else:
            what = ("app", "db", "proxy", "sentinel")[choice - 2]
            result = system.run(["journalctl", "--no-pager", "--unit", maintain.SERVICES[what], "--lines", "200", "--output", "short-iso"])
            ui.pager(f"Logs: {what}", (result.out or result.err or "No log lines.").splitlines())


# ---- entry ---------------------------------------------------------------------------------------


def run(screen: "curses._CursesWindow", firstboot: bool) -> None:
    ui = UI(screen)
    try:
        if firstboot:
            while not applier.claimed():
                wizard(ui)
            return
        if not applier.claimed():
            ui.message("Not set up yet", "This server has not been set up. The setup runs on the server's own screen at start-up.")
            return
        dashboard(ui)
    except Quit:
        return


def main(argv: list[str] | None = None) -> int:
    argv = sys.argv[1:] if argv is None else argv
    firstboot = "--firstboot" in argv
    if not system.is_root() and not system.root():
        print("The console needs root. Start it with: ludora")
        return 2
    locale.setlocale(locale.LC_ALL, "")
    os.environ.setdefault("ESCDELAY", "25")
    try:
        curses.wrapper(run, firstboot)
    except KeyboardInterrupt:
        pass
    except curses.error as err:
        print(f"The console could not draw on this terminal: {err}")
        return 1
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
