"""Unit tests for Ludora OS's logic. No root, no network:  python3 -m unittest discover -s tests -v"""

from __future__ import annotations

import base64
import io
import json
import os
import shutil
import struct
import sys
import tempfile
import time
import unittest
from contextlib import redirect_stderr, redirect_stdout

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(HERE, "..", "rootfs", "usr", "lib", "ludora-os", "python"))

from ludora_os import access, apply as applier, config, ctl, doctor, maintain, overview, render, sentinel, system  # noqa: E402

HOSTILE = [
    "a; nft flush ruleset", "x\nPermitRootLogin yes", "$(reboot)", "`id`", "} table inet evil {", "10.0.0.1 } accept #",
    'a" b', "a'b", "../../etc/shadow", "a{b}", "a|b", "a&b;c", "\x00", "a\tb", "ü" * 300, "-o ProxyCommand=x", "a\\b", "a<b>",
]


def ed25519_line(comment: str = "someone@laptop", seed: int = 7) -> str:
    kind = b"ssh-ed25519"
    blob = struct.pack(">I", len(kind)) + kind + struct.pack(">I", 32) + bytes([seed]) * 32
    return f"ssh-ed25519 {base64.b64encode(blob).decode()} {comment}"


def rsa_line(bits: int) -> str:
    kind = b"ssh-rsa"
    e = b"\x01\x00\x01"
    n = b"\x00" + b"\xc1" * (bits // 8)
    blob = struct.pack(">I", len(kind)) + kind + struct.pack(">I", len(e)) + e + struct.pack(">I", len(n)) + n
    return f"ssh-rsa {base64.b64encode(blob).decode()} old-key"


class Sandbox(unittest.TestCase):
    """Every test gets its own empty root directory and a recorder in place of real commands."""

    def setUp(self) -> None:
        self.root = tempfile.mkdtemp(prefix="ludora-os-test-")
        os.environ["LUDORA_OS_ROOT"] = self.root
        self.calls: list[list[str]] = []
        self.piped: dict[str, str] = {}
        self.answers: dict[str, system.Result] = {}
        self._runner = system.RUNNER

        def fake(argv, input_text, timeout):
            self.calls.append(list(argv))
            if input_text is not None:
                self.piped[" ".join(argv)] = input_text
            for prefix, result in self.answers.items():
                if " ".join(argv).startswith(prefix):
                    return result
            return system.Result(0, "", "")

        system.RUNNER = fake

    def tearDown(self) -> None:
        system.RUNNER = self._runner
        os.environ.pop("LUDORA_OS_ROOT", None)
        shutil.rmtree(self.root, ignore_errors=True)

    def configure(self, **values: str) -> dict:
        cfg = config.defaults()
        for key, value in values.items():
            config.set_value(cfg, key, value)
        config.save(cfg)
        return cfg

    def ran(self, prefix: str) -> bool:
        return any(" ".join(call).startswith(prefix) for call in self.calls)


class ConfigTests(Sandbox):
    def test_defaults_are_valid_and_round_trip(self):
        cfg = config.defaults()
        self.assertEqual(config.check(cfg), [])
        self.assertEqual(config.parse(config.dump(cfg)), cfg)

    def test_every_setting_refuses_hostile_text(self):
        """Nothing that could break out of a firewall rule, an SSH option or a Caddy block is ever accepted."""
        free_text = {"OPERATOR_NAME", "OPERATOR_CONTACT"}
        for field in config.FIELDS:
            for bad in HOSTILE:
                cfg = config.defaults()
                try:
                    config.set_value(cfg, field.key, bad)
                except config.ConfigError:
                    continue
                value = config._format(cfg[field.key])
                # Anything that was accepted must have been reduced to harmless characters.
                for ch in '\n\r;{}$`"|&<>\\\x00\t':
                    self.assertNotIn(ch, value, f"{field.key} kept {ch!r} from {bad!r}")
                if field.key not in free_text:
                    self.assertNotIn(" ", value, f"{field.key} kept a space from {bad!r}")

    def test_addresses_cannot_carry_an_ipv6_zone(self):
        """Python accepts "fe80::1%<anything>", and the anything would land in the firewall file."""
        for key, value in (("DNS_SERVERS", "fe80::1%};x"), ("TRUSTED_NETS", "fe80::1%eth0"), ("ADMIN_NETS", "fe80::%a\tb/64"), ("LAN_NETS", "10.0.0.0/24%x")):
            with self.assertRaises(config.ConfigError, msg=key):
                config.set_value(config.defaults(), key, value)
        config.set_value(config.defaults(), "DNS_SERVERS", "2001:db8::53 10.20.0.2")

    def test_wide_networks_are_refused_where_they_would_defeat_the_point(self):
        cfg = config.defaults()
        for key in ("TRUSTED_NETS", "ADMIN_NETS"):
            with self.assertRaises(config.ConfigError):
                config.set_value(cfg, key, "0.0.0.0/0")
            with self.assertRaises(config.ConfigError):
                config.set_value(cfg, key, "10.0.0.0/8")
        config.set_value(cfg, "TRUSTED_NETS", "10.20.9.7, 10.20.8.0/24")
        self.assertEqual(cfg["TRUSTED_NETS"], ["10.20.9.7/32", "10.20.8.0/24"])

    def test_rules_across_settings(self):
        cfg = config.defaults()
        config.set_value(cfg, "SSH_ENABLED", "yes")
        self.assertTrue(any("ADMIN_NETS" in p for p in config.check(cfg)))
        config.set_value(cfg, "ADMIN_NETS", "10.20.9.10")
        self.assertEqual(config.check(cfg), [])
        config.set_value(cfg, "TLS_MODE", "public")
        config.set_value(cfg, "DOMAIN", "10.20.0.5")
        self.assertTrue(any("public" in p for p in config.check(cfg)))
        config.set_value(cfg, "DOMAIN", "Play.School.example")
        self.assertEqual(cfg["DOMAIN"], "play.school.example")
        self.assertEqual(config.check(cfg), [])

    def test_unknown_and_duplicate_keys_are_errors(self):
        with self.assertRaises(config.ConfigError):
            config.parse("NO_SUCH_THING=1\n")
        with self.assertRaises(config.ConfigError):
            config.parse("IPV6=yes\nIPV6=no\n")
        with self.assertRaises(config.ConfigError):
            config.parse("TRIPWIRE_PORTS=22,443\n")

    def test_unreadable_settings_are_an_error_not_defaults(self):
        self.configure(TRUSTED_NETS="10.20.9.0/24")
        os.chmod(system.p(system.CONF_FILE), 0o000)
        try:
            if os.geteuid() == 0:
                self.skipTest("root can read anything; this is exercised as an unprivileged user on the server")
            with self.assertRaises(config.ConfigError):
                config.load()
        finally:
            os.chmod(system.p(system.CONF_FILE), 0o640)

    def test_secrets_are_made_once_and_kept_private(self):
        first = config.load_secrets(create=True)
        self.assertEqual(config.load_secrets(), first)
        self.assertEqual(len(first["POSTGRES_PASSWORD"]), 64)
        self.assertEqual(os.stat(system.p(system.SECRETS_FILE)).st_mode & 0o777, 0o600)


class RenderTests(Sandbox):
    def test_firewall_defaults(self):
        text = render.nftables(config.defaults())
        self.assertIn("policy drop", text)
        self.assertEqual(text.count("policy drop"), 3)  # input, forward, output
        self.assertIn("ip saddr @ban4 ip saddr != @trust4", text)
        self.assertNotIn("@admin4 accept", text)  # SSH is off by default
        self.assertIn("22, 23", text)  # ...so its port is a tripwire

    def test_containers_reach_each_other_but_not_the_school(self):
        text = render.nftables(config.defaults())
        same = text.index("ip saddr 10.89.20.0/24 ip daddr 10.89.20.0/24 accept")
        school = text.index("ip saddr 10.89.20.0/24 ip daddr { 10.0.0.0/8")
        self.assertLess(same, school)  # the private-range refusal must not swallow the containers' own network
        self.assertIn("ip saddr 10.89.10.0/24 ip daddr 10.89.10.0/24 accept", text)
        self.assertNotIn("ip saddr 10.89.10.0/24 tcp dport", text)  # the database network has no way out

    def test_ssh_only_from_admin_networks(self):
        cfg = config.defaults()
        config.set_value(cfg, "ADMIN_NETS", "10.20.9.10")
        config.set_value(cfg, "SSH_ENABLED", "yes")
        text = render.nftables(cfg)
        self.assertIn("tcp dport 22 ip saddr @admin4 accept", text)
        self.assertNotIn("21, 22, 23", text)
        self.assertIn("elements = { 10.20.9.10/32 }", text)

    def test_sealed_offers_nothing(self):
        cfg = config.defaults()
        config.set_value(cfg, "ADMIN_NETS", "10.20.9.10")
        config.set_value(cfg, "SSH_ENABLED", "yes")
        text = render.nftables(cfg, sealed=True)
        self.assertNotIn("@admin4 accept", text)
        self.assertNotIn("c_tripwire accept", text)
        self.assertIn("Not claimed yet", text)

    def test_lockdown_nat_and_bans(self):
        cfg = config.defaults()
        cfg["LOCKDOWN"] = True
        cfg["NAT_MODE"] = True
        text = render.nftables(cfg, bans={"10.1.2.3": 90, "fd00::1": 30, "10.9.9.9": 0}, shield=True)
        self.assertIn("ip saddr != @trust4 counter name c_closed drop", text)
        self.assertIn("10.1.2.3 timeout 90s", text)
        self.assertIn("fd00::1 timeout 30s", text)
        self.assertNotIn("10.9.9.9", text)
        self.assertIn("limit rate over 400/second", text)  # ten times the default for a shared address
        self.assertNotIn("@shield_rate4 {", text)  # the per-address shield would punish the whole school

    def test_sshd_is_keys_only(self):
        text = render.sshd(config.defaults())
        for needed in ("PasswordAuthentication no", "PermitRootLogin no", "AuthenticationMethods publickey", "AllowTcpForwarding no",
                       "AuthorizedKeysFile /etc/ssh/authorized_keys.d/%u", "ForceCommand /usr/libexec/ludora-os/support-shell"):
            self.assertIn(needed, text)

    def test_caddy_modes(self):
        cfg = config.defaults()
        config.set_value(cfg, "DOMAIN", "10.20.0.5")
        self.assertIn("tls internal", render.caddyfile(cfg))
        self.assertIn("default_sni 10.20.0.5", render.caddyfile(cfg))
        config.set_value(cfg, "DOMAIN", "play.school.example")
        self.assertNotIn("default_sni", render.caddyfile(cfg))
        config.set_value(cfg, "TLS_MODE", "public")
        config.set_value(cfg, "OPERATOR_CONTACT", "it@school.example")
        text = render.caddyfile(cfg)
        self.assertIn("email it@school.example", text)
        self.assertNotIn("tls internal", text)
        self.assertIn("admin off", text)
        # Requests another site made a browser send are refused, and the log keeps no headers (cookies; padding).
        self.assertIn("respond @from_another_site 403", text)
        self.assertIn("request>headers delete", text)
        self.assertIn("log_append fetch_site {header.Sec-Fetch-Site}", text)

    def test_containers_are_confined(self):
        files = render.quadlets(config.defaults())
        for name in ("ludora-db.container", "ludora-app.container", "ludora-proxy.container"):
            for needed in ("DropCapability=all", "NoNewPrivileges=true", "ReadOnly=true"):
                self.assertIn(needed, files[name], name)
        self.assertIn("Internal=true", files["ludora-internal.network"])
        self.assertNotIn("PublishPort", files["ludora-db.container"] + files["ludora-app.container"])
        self.assertNotIn("ludora-edge", files["ludora-db.container"])


class AccessTests(Sandbox):
    def test_keys_are_parsed_strictly(self):
        key = access.parse_public_key(ed25519_line("me@desk; rm -rf /"))
        self.assertEqual(key.comment, "me@deskrm-rf")
        self.assertTrue(key.fingerprint.startswith("SHA256:"))
        for bad in ('command="/bin/sh" ' + ed25519_line(), "ssh-dss AAAA x", "ssh-ed25519 not-base64!", ed25519_line() + "\nssh-ed25519 AAAA", rsa_line(2048),
                    "ssh-ed25519 " + base64.b64encode(b"\x00\x00\x00\x07ssh-rsa").decode()):
            with self.assertRaises(access.AccessError, msg=bad[:40]):
                access.parse_public_key(bad)
        self.assertEqual(access.parse_public_key(rsa_line(4096)).bits, 4096)

    def test_admin_keys_add_list_remove(self):
        key = access.add_admin_key(ed25519_line())
        self.assertEqual([k.fingerprint for k in access.admin_keys()], [key.fingerprint])
        with self.assertRaises(access.AccessError):
            access.add_admin_key(ed25519_line())
        access.remove_admin_key(key.fingerprint)
        self.assertEqual(access.admin_keys(), [])

    def test_support_window_opens_one_key_from_one_address_for_a_while(self):
        self.configure(DOMAIN="10.20.0.5")
        with self.assertRaises(access.AccessError):
            access.support_open(ed25519_line(), 2, "203.0.113.7", log=lambda *_: None)  # not set up yet
        system.write_atomic(system.CLAIMED_FLAG, "x")
        for hours, source in ((0.1, "203.0.113.7"), (100, "203.0.113.7"), (2, "0.0.0.0/0"), (2, "203.0.0.0/16"), (2, "nonsense"), (2, "fe80::1%x\nssh-ed25519 AAAA evil"), (2, "fe80::1%eth0")):
            with self.assertRaises(access.AccessError):
                access.support_open(ed25519_line(), hours, source, log=lambda *_: None)
        access.support_open(ed25519_line(), 2, "203.0.113.7", log=lambda *_: None)
        line = [l for l in system.read(access.SUPPORT_KEYS).splitlines() if not l.startswith("#")][0]
        self.assertTrue(line.startswith('restrict,pty,expiry-time="'))
        self.assertIn('from="203.0.113.7/32"', line)
        live = applier.effective(config.load())
        self.assertTrue(live["SSH_ENABLED"])
        self.assertIn("203.0.113.7/32", live["ADMIN_NETS"])
        self.assertIn("tcp dport 22 ip saddr @admin4 accept", system.read(system.NFT_FILE))
        # The SSH port is a decoy while SSH is off. The sentinel must let go of it before SSH starts, or SSH cannot.
        order = [" ".join(c) for c in self.calls if c[:1] == ["systemctl"] and ("sshd" in " ".join(c) or "sentinel" in " ".join(c))]
        self.assertLess(order.index("systemctl try-restart ludora-sentinel.service"), order.index("systemctl enable --now sshd.service"))
        self.assertTrue(os.stat(system.p(system.SUPPORT_FILE)).st_mode & 0o004)  # the sentinel, not root, has to read it
        self.calls.clear()
        self.assertTrue(access.support_close(log=lambda *_: None))
        order = [" ".join(c) for c in self.calls if c[:1] == ["systemctl"] and ("sshd" in " ".join(c) or "sentinel" in " ".join(c))]
        self.assertLess(order.index("systemctl disable --now sshd.service"), order.index("systemctl try-restart ludora-sentinel.service"))
        self.assertNotIn("@admin4 accept", system.read(system.NFT_FILE))
        self.assertFalse(system.exists(access.SUPPORT_KEYS))

    @unittest.skipIf(os.geteuid() == 0, "root can read anything")
    def test_unreadable_support_window_is_an_error_not_no_window(self):
        system.write_atomic(system.SUPPORT_FILE, "{}", 0o000)
        with self.assertRaises(config.ConfigError):
            config.support_window()

    def test_expired_support_is_swept(self):
        self.configure(DOMAIN="10.20.0.5")
        system.write_atomic(system.CLAIMED_FLAG, "x")
        access.support_open(ed25519_line(), 1, "203.0.113.7", log=lambda *_: None)
        window = json.loads(system.read(system.SUPPORT_FILE))
        window["until"] = time.time() - 5
        system.write_atomic(system.SUPPORT_FILE, json.dumps(window))
        self.assertFalse(applier.effective(config.load())["SSH_ENABLED"])
        self.assertTrue(access.sweep(log=lambda *_: None))
        self.assertFalse(system.exists(system.SUPPORT_FILE))

    def test_support_shell_runs_only_listed_commands(self):
        ran: list[list[str]] = []
        real = os.execv
        os.execv = lambda path, argv: ran.append(argv)  # type: ignore[assignment]
        try:
            for command, allowed in (("status", True), ("ludoractl doctor --json", True), ("update app", True), ("status; id", False), ("set DOMAIN x", False),
                                     ("admin add-key", False), ("support open", False), ("lockdown off", False), ("unban 1.2.3.4", False), ("sh", False), ("logs app -n 5", False)):
                os.environ["SSH_ORIGINAL_COMMAND"] = command
                ran.clear()
                with redirect_stdout(io.StringIO()), redirect_stderr(io.StringIO()):
                    ctl.support_shell()
                self.assertEqual(bool(ran), allowed, command)
                if ran:
                    self.assertEqual(ran[0][:3], ["sudo", "--non-interactive", "/usr/local/sbin/ludoractl"])
        finally:
            os.execv = real
            os.environ.pop("SSH_ORIGINAL_COMMAND", None)


class SentinelTests(unittest.TestCase):
    def brain(self, **values: str) -> sentinel.Brain:
        cfg = config.defaults()
        for key, value in {"TRUSTED_NETS": "10.20.9.0/24", **values}.items():
            config.set_value(cfg, key, value)
        return sentinel.Brain(cfg, ["10.20.0.1", "10.20.0.5"])

    def bans(self, actions) -> list[tuple[str, int]]:
        return [(a.ip, a.seconds) for a in actions if a.kind == "ban"]

    def test_tripwire_bans_and_escalates(self):
        b = self.brain()
        self.assertEqual(self.bans(b.on_tripwire("10.20.3.3", 3389, 1000)), [("10.20.3.3", 900)])
        self.assertEqual(self.bans(b.on_tripwire("10.20.3.3", 23, 1001)), [])  # already banned
        b.bans.clear()
        self.assertEqual(self.bans(b.on_tripwire("10.20.3.3", 23, 3000)), [("10.20.3.3", 3600)])
        b.bans.clear()
        self.assertEqual(self.bans(b.on_tripwire("10.20.3.3", 23, 9000)), [("10.20.3.3", 14400)])
        b.bans.clear()
        self.assertEqual(self.bans(b.on_tripwire("10.20.3.3", 23, 30000)), [("10.20.3.3", 14400)])  # capped at 16 times

    def test_a_lifted_ban_does_not_excuse_the_next_offence(self):
        b = self.brain()
        self.assertEqual(len(self.bans(b.on_tripwire("10.20.3.3", 3389, 1000))), 1)
        # The administrator unbans in the firewall; the sentinel has not noticed yet. A new connection
        # to a decoy can only mean the ban is gone, so it counts.
        self.assertEqual(self.bans(b.on_tripwire("10.20.3.3", 23, 1004)), [("10.20.3.3", 3600)])
        # Web-log lines, though, can trail in from before a ban: they do not ban twice.
        got = []
        for i in range(6):
            got += b.on_web_line(json.dumps({"request": {"remote_ip": "10.20.3.3", "uri": "/.env", "method": "GET"}, "status": 404}), 1005 + i)
        self.assertEqual(self.bans(got), [])

    def test_protected_addresses_are_never_banned(self):
        b = self.brain()
        for ip in ("10.20.9.10", "10.20.0.1", "10.20.0.5", "127.0.0.1", "10.89.20.2", "::ffff:10.20.9.11"):
            actions = b.on_tripwire(ip, 3389, 1000 + hash(ip) % 100)
            self.assertEqual(self.bans(actions), [], ip)
            self.assertTrue(any("Not banned" in a.event.get("text", "") for a in actions), ip)
        self.assertEqual(self.bans(b.on_tripwire("::ffff:10.20.3.9", 23, 5000)), [("10.20.3.9", 900)])
        self.assertEqual(self.bans(b.on_tripwire("not-an-ip", 23, 5000)), [])

    def test_ssh_failures(self):
        b = self.brain()
        lines = ["Failed password for invalid user admin from 10.20.3.4 port 5555 ssh2", "Invalid user pi from 10.20.3.4 port 5556",
                 "Connection closed by authenticating user ludora-admin 10.20.3.4 port 5557 [preauth]", "Failed publickey for ludora-admin from 10.20.3.4 port 1 ssh2"]
        got = []
        for i, line in enumerate(lines):
            got += b.on_ssh_line(line, 1000 + i)
        self.assertEqual(self.bans(got), [])
        self.assertEqual(self.bans(b.on_ssh_line("maximum authentication attempts exceeded for root from 10.20.3.4 port 9 ssh2", 1010)), [("10.20.3.4", 900)])
        self.assertEqual(b.on_ssh_line("Accepted publickey for ludora-admin from 10.20.9.10 port 1 ssh2", 1011), [])
        # a user name crafted to look like a log line must not put words in the sentinel's mouth
        framed = "10.20.3.50"
        for i in range(8):
            for line in (f"Invalid user x from {framed} port 22 from 10.20.3.77 port 1", f"Invalid user a from {framed} port 1 {'p' * 200} from 10.20.3.77 port 4444",
                         f"Failed password for invalid user from {framed} port 5 ssh2 [preauth] from 10.20.3.77 port 6 ssh2"):
                b.on_ssh_line(line, 2000 + i)
        self.assertNotIn(framed, b.bans)
        self.assertIn("10.20.3.77", b.bans)

    def web(self, ip, uri, status=200, method="GET", site=None):
        record = {"request": {"remote_ip": ip, "uri": uri, "method": method}, "status": status}
        if site is not None:
            record["fetch_site"] = site  # the proxy copies the browser's Sec-Fetch-Site header into the log line
        return json.dumps(record)

    def test_saved_bans_come_back_after_a_server_restart_but_not_a_sentinel_restart(self):
        root = tempfile.mkdtemp(prefix="ludora-os-test-")
        os.environ["LUDORA_OS_ROOT"] = root
        calls, real = [], system.RUNNER
        system.RUNNER = lambda argv, input_text, timeout: (calls.append(" ".join(argv)), system.Result(0, "[]" if argv[0] == "ip" else "", ""))[1]
        try:
            system.write_atomic(sentinel.BANS_FILE, json.dumps({"10.20.3.3": time.time() + 600}))
            sentinel.Daemon().restore()   # the server has just started: the firewall holds nothing yet
            self.assertTrue(any(c.startswith("nft add element inet ludora ban4 { 10.20.3.3 timeout") for c in calls), calls)
            calls.clear()
            sentinel.Daemon().restore()   # only the sentinel restarted: the firewall is the truth, the file may be stale
            self.assertFalse(any(c.startswith("nft add element") for c in calls), calls)
        finally:
            system.RUNNER = real
            os.environ.pop("LUDORA_OS_ROOT", None)
            shutil.rmtree(root, ignore_errors=True)

    def test_events_are_never_written_through_a_link(self):
        """Root logs into a folder the sentinel owns. A link planted there must not make root write somewhere else."""
        root = tempfile.mkdtemp(prefix="ludora-os-test-")
        os.environ["LUDORA_OS_ROOT"] = root
        try:
            victim = os.path.join(root, "victim")
            with open(victim, "w") as fh:
                fh.write("untouched\n")
            os.makedirs(os.path.dirname(system.p(sentinel.EVENTS_FILE)))
            os.symlink(victim, system.p(sentinel.EVENTS_FILE))
            sentinel.append_event({"at": 1, "severity": "info", "kind": "test", "text": "x"})  # must not raise either
            with open(victim) as fh:
                self.assertEqual(fh.read(), "untouched\n")
            os.unlink(system.p(sentinel.EVENTS_FILE))
            sentinel.append_event({"at": 1, "severity": "info", "kind": "test", "text": "x"})
            self.assertEqual([e["text"] for e in sentinel.read_events()], ["x"])
        finally:
            os.environ.pop("LUDORA_OS_ROOT", None)
            shutil.rmtree(root, ignore_errors=True)

    def test_web_probing_guessing_and_flooding(self):
        b = self.brain()
        self.assertEqual(b.on_web_line(self.web("10.20.3.3", "/play"), 1), [])
        self.assertEqual(b.on_web_line(self.web("10.20.3.3", "/api/sets?q=union+of+sets"), 1), [])
        got = []
        for i, uri in enumerate(("/.env", "/wp-login.php", "/index.php?x=1")):
            got += b.on_web_line(self.web("10.20.3.3", uri, 404), 10 + i)
        self.assertEqual(self.bans(got), [("10.20.3.3", 900)])
        got = []
        for i in range(20):
            got += b.on_web_line(self.web("10.20.3.4", "/api/auth/login", 401, "POST"), 100 + i)
        self.assertEqual(self.bans(got), [("10.20.3.4", 900)])
        got = []
        for i in range(19):
            got += b.on_web_line(self.web("10.20.3.5", "/api/auth/login", 200, "POST"), 100 + i)  # a class signing in successfully
        self.assertEqual(self.bans(got), [])
        got = []
        for i in range(600):
            got += b.on_web_line(self.web("10.20.3.6", "/api/rooms/1"), 200 + i * 0.01)
        self.assertEqual(self.bans(got), [("10.20.3.6", 900)])
        self.assertEqual(b.on_web_line("not json", 1), [])
        self.assertEqual(b.on_web_line('{"request": 5}', 1), [])
        self.assertEqual(b.on_web_line(self.web("garbage", "/.env"), 1), [])

    def test_shared_address_is_recorded_not_punished(self):
        b = self.brain(NAT_MODE="yes")
        got = []
        for i in range(700):
            got += b.on_web_line(self.web("10.20.0.200", "/.env", 404), i * 0.01)
        got += b.on_tripwire("10.20.0.200", 23, 50)  # one student touching a decoy must not lock out the school
        for i in range(8):
            got += b.on_ssh_line("Invalid user admin from 10.20.0.200 port 4242", 60 + i)
        for i in range(30):
            got += b.on_web_line(self.web("10.20.0.200", "/api/auth/login", 401, "POST"), 200 + i)
        self.assertEqual(self.bans(got), [])
        self.assertEqual(b.bans, {})
        kinds = {a.event["kind"] for a in got if a.kind == "event"}
        self.assertLessEqual({"probe", "tripwire", "ssh", "guessing"}, kinds)
        self.assertLess(sum(1 for a in got if a.kind == "event"), 12)  # and it does not fill the log either

    def test_a_web_page_cannot_get_its_visitor_banned(self):
        """Three hidden pictures pointing at /x.php make the VISITOR's browser ask for them. Browsers mark requests a
        page caused, and those never count towards a ban for probing or broken requests."""
        b = self.brain()
        got = []
        for i in range(40):
            got += b.on_web_line(self.web("10.20.5.5", f"/wp-login.php?{i}", 404, site="cross-site"), i)        # another site's page
            got += b.on_web_line(self.web("10.20.5.6", f"/img/{i}.php", 404, site="same-origin"), i)             # a picture link inside Ludora
            got += b.on_web_line(self.web("10.20.5.7", "/api/auth/login", 403, "POST", site="cross-site"), i)    # a hidden form elsewhere
        for i in range(200):
            got += b.on_web_line(self.web("10.20.5.8", f"/missing/{i}.png", 404, site="same-origin"), 100 + i * 0.1)
        self.assertEqual(self.bans(got), [])
        # The same requests from a tool (no such mark), or typed by hand, still count.
        got = []
        for i, uri in enumerate(("/.env", "/wp-login.php", "/a.php")):
            got += b.on_web_line(self.web("10.20.5.9", uri, 404, site="none"), 500 + i)
        self.assertEqual(self.bans(got), [("10.20.5.9", 900)])
        # Guessing through Ludora's own sign-in page is still guessing.
        got = []
        for i in range(20):
            got += b.on_web_line(self.web("10.20.5.10", "/api/auth/login", 401, "POST", site="same-origin"), 600 + i)
        self.assertEqual(self.bans(got), [("10.20.5.10", 900)])
        # Searching for the words attackers use is not an attack: only the path is examined.
        got = []
        for i in range(10):
            got += b.on_web_line(self.web("10.20.5.11", "/api/sets?q=%3Cscript%3E+union+select+../x.php", 200), 700 + i)
        self.assertEqual(self.bans(got), [])

    def test_an_address_that_just_changed_hands_is_not_banned(self):
        """On the same network segment a device can take another machine's address and misbehave in its name."""
        b = self.brain()
        macs = {"10.20.3.30": "aa:aa:aa:aa:aa:01"}
        b.lookup = macs.get
        seen = [{"dst": "10.20.3.30", "lladdr": "aa:aa:aa:aa:aa:01", "state": ["REACHABLE"]}]
        b.on_neighbours(seen, ["10.20.0.1"], 1000)
        macs["10.20.3.30"] = "ee:ee:ee:ee:ee:66"  # the impostor answers for that address now
        got = b.on_tripwire("10.20.3.30", 23, 1100)
        self.assertEqual(self.bans(got), [])
        self.assertEqual([a.event["kind"] for a in got if a.kind == "event"], ["impersonation"])
        self.assertEqual(self.bans(b.on_tripwire("10.20.3.30", 23, 1300)), [])   # still within ten minutes of the change
        # The same device misbehaving from an address it has held all along is banned as usual.
        self.assertEqual(self.bans(b.on_tripwire("10.20.3.30", 23, 1100 + 601)), [("10.20.3.30", 900)])
        macs["10.20.3.31"] = "bb:bb:bb:bb:bb:02"
        self.assertEqual(self.bans(b.on_tripwire("10.20.3.31", 23, 2000)), [("10.20.3.31", 900)])  # first seen: nothing changed
        self.assertEqual(self.bans(b.on_tripwire("203.0.113.9", 23, 2000)), [("203.0.113.9", 900)])  # beyond a router: no hardware address

    def test_gateway_impersonation_is_noticed(self):
        b = self.brain()
        calm = [{"dst": "10.20.0.1", "lladdr": "aa:aa:aa:aa:aa:01", "state": ["REACHABLE"]}]
        self.assertEqual(b.on_neighbours(calm, ["10.20.0.1"], 1), [])
        self.assertEqual(b.on_neighbours(calm, ["10.20.0.1"], 2), [])
        swapped = [{"dst": "10.20.0.1", "lladdr": "bb:bb:bb:bb:bb:66", "state": ["REACHABLE"]}]
        actions = b.on_neighbours(swapped, ["10.20.0.1"], 3)
        self.assertEqual(actions[0].event["severity"], "alert")
        self.assertIn("impersonating", actions[0].event["text"])
        many = [{"dst": f"10.20.3.{i}", "lladdr": "cc:cc:cc:cc:cc:99", "state": ["STALE"]} for i in range(8)]
        self.assertTrue(any("intercepted" in a.event["text"] for a in b.on_neighbours(many, ["10.20.0.1"], 4)))

    def test_shield_goes_up_under_attack_and_comes_down_after_quiet(self):
        b = self.brain()
        now = 1000.0
        self.assertEqual([a for a in b.tick(now) if a.kind == "shield"], [])
        for i in range(3):
            b.on_tripwire(f"10.20.3.{i + 10}", 23, now + i)
        actions = b.tick(now + 5)
        self.assertEqual([(a.kind, a.on) for a in actions if a.kind == "shield"], [("shield", True)])
        self.assertEqual(b.level, 2)
        self.assertEqual([a for a in b.tick(now + 700) if a.kind == "shield"], [])  # attackers aged out, but stay up for 15 quiet minutes
        self.assertTrue(b.shield)
        self.assertEqual([(a.kind, a.on) for a in b.tick(now + 700 + 901) if a.kind == "shield"], [("shield", False)])

    def test_counter_pressure_raises_the_level(self):
        b = self.brain()
        b.on_counters({"c_http_rate": 0}, 100)
        b.on_counters({"c_http_rate": 5000}, 110)
        b.tick(111)
        self.assertEqual(b.level, 2)

    def test_memory_is_bounded(self):
        w = sentinel.Window(60, 5, cap=100)
        for i in range(5000):
            w.add(f"10.{i // 65536}.{(i // 256) % 256}.{i % 256}", 1.0)
        self.assertLessEqual(len(w.hits), 100)


class ApplyTests(Sandbox):
    def test_apply_writes_private_files_and_stays_sealed_until_claimed(self):
        self.configure(DOMAIN="10.20.0.5", ADMIN_NETS="10.20.9.10", SSH_ENABLED="yes")
        changed = applier.apply(log=lambda *_: None)
        self.assertIn(system.NFT_FILE, changed)
        for path in (system.NFT_FILE, system.SSHD_DROPIN, system.APP_ENV_FILE, system.DB_ENV_FILE, system.SECRETS_FILE):
            self.assertEqual(os.stat(system.p(path)).st_mode & 0o777, 0o600, path)
        self.assertIn("Not claimed yet", system.read(system.NFT_FILE))
        self.assertTrue(self.ran("systemctl disable --now sshd.service"))  # SSH stays off until the server is claimed
        self.assertFalse(self.ran("systemctl restart ludora-"))
        self.assertEqual(applier.apply(log=lambda *_: None), [])  # nothing to do the second time

        system.write_atomic(system.CLAIMED_FLAG, "x")
        self.calls.clear()
        applier.apply(log=lambda *_: None)
        self.assertIn("@admin4 accept", system.read(system.NFT_FILE))
        self.assertTrue(self.ran("systemctl enable --now sshd.service"))
        self.assertIn("DATABASE_URL=postgres://ludora:", system.read(system.APP_ENV_FILE))
        self.assertIn("PUBLIC_ORIGIN=https://10.20.0.5", system.read(system.APP_ENV_FILE))

    def test_a_firewall_the_kernel_rejects_changes_nothing(self):
        self.configure(DOMAIN="10.20.0.5")
        self.answers["nft -c -f"] = system.Result(1, "", "Error: syntax error")
        with self.assertRaises(applier.ApplyError):
            applier.apply(log=lambda *_: None)
        self.assertFalse(system.exists(system.NFT_FILE))

    def test_sshd_refusing_its_settings_puts_the_old_ones_back(self):
        self.configure(DOMAIN="10.20.0.5")
        applier.apply(log=lambda *_: None)
        before = system.read(system.SSHD_DROPIN)
        cfg = config.load()
        config.set_value(cfg, "SSH_PORT", "2222")
        config.save(cfg)
        self.answers["sshd -t"] = system.Result(255, "", "bad configuration")
        self.answers["ssh-keygen"] = system.Result(0, "", "")
        with self.assertRaises(applier.ApplyError):
            applier.apply(log=lambda *_: None)
        self.assertEqual(system.read(system.SSHD_DROPIN), before)

    def test_tampering_is_noticed(self):
        self.configure(DOMAIN="10.20.0.5")
        applier.apply(log=lambda *_: None)
        self.assertEqual(applier.drift(), [])
        with open(system.p(system.SSHD_DROPIN), "a") as fh:
            fh.write("PermitRootLogin yes\n")
        with open(system.p(system.NFT_FILE), "a") as fh:
            fh.write("# add rule inet ludora input accept\n")
        found = " ".join(applier.drift())
        self.assertIn("00-ludora-os.conf was changed", found)
        self.assertIn("ludora-os.nft does not match", found)
        applier.apply(log=lambda *_: None)
        self.assertEqual(applier.drift(), [])

    def test_bans_cross_a_reload_but_are_never_written_to_the_file(self):
        """The file is loaded again at every start. A ban written into it would return at each restart, even after
        it was lifted or had run out."""
        self.configure(DOMAIN="10.20.0.5")
        self.answers["nft -j list set inet ludora ban4"] = system.Result(0, json.dumps({"nftables": [{"set": {"name": "ban4", "elem": [{"elem": {"val": "10.20.3.3", "timeout": 900, "expires": 800}}]}}]}), "")
        applier.apply(log=lambda *_: None)
        self.assertIn("10.20.3.3 timeout 800s", self.piped["nft -f -"])  # what the kernel was given
        self.assertNotIn("10.20.3.3", system.read(system.NFT_FILE))        # what the next start will load
        self.assertEqual(applier.drift(), [])

    def test_changing_a_setting_keeps_the_file_readable_to_the_sentinel(self):
        """`ludoractl shield on` rewrites the settings and restarts the sentinel, which reads them as its own user."""
        if os.geteuid() != 0:
            self.skipTest("needs root to give a file to another group")
        import grp
        other = next(g for g in grp.getgrall() if g.gr_gid != 0)
        real, system.SENTINEL_GROUP = system.SENTINEL_GROUP, other.gr_name
        try:
            cfg = self.configure(DOMAIN="10.20.0.5")
            config.set_value(cfg, "SHIELD", "on")
            config.save(cfg)
            info = os.stat(system.p(system.CONF_FILE))
            self.assertEqual((info.st_gid, info.st_mode & 0o777), (other.gr_gid, 0o640))
        finally:
            system.SENTINEL_GROUP = real


class CtlTests(Sandbox):
    def run_ctl(self, *argv: str) -> tuple[int, str, str]:
        out, err = io.StringIO(), io.StringIO()
        with redirect_stdout(out), redirect_stderr(err):
            code = ctl.main(list(argv))
        return code, out.getvalue(), err.getvalue()

    def test_set_refuses_bad_values_and_keeps_the_old_one(self):
        self.configure(DOMAIN="10.20.0.5")
        code, _, err = self.run_ctl("set", "domain", "bad;name")
        self.assertEqual(code, 2)
        self.assertIn("DOMAIN", err)
        self.assertEqual(config.load()["DOMAIN"], "10.20.0.5")
        self.assertEqual(self.run_ctl("set", "ssh_enabled", "yes")[0], 2)  # no admin network yet
        self.assertEqual(self.run_ctl("set", "admin_nets", "10.20.9.10")[0], 0)
        self.assertEqual(self.run_ctl("set", "ssh_enabled", "yes")[0], 0)

    def test_a_lifted_ban_leaves_the_saved_list_at_once(self):
        """The sentinel rewrites its saved list every few seconds. A restart inside that gap must not bring the ban back."""
        self.configure(DOMAIN="10.20.0.5")
        system.write_atomic(sentinel.BANS_FILE, json.dumps({"10.20.3.3": time.time() + 600, "10.20.3.4": time.time() + 600}))
        code, out, _ = self.run_ctl("unban", "10.20.3.3")
        self.assertEqual(code, 0, out)
        self.assertEqual(list(json.loads(system.read(sentinel.BANS_FILE))), ["10.20.3.4"])

    def test_ban_refuses_protected_and_nonsense(self):
        self.configure(DOMAIN="10.20.0.5", TRUSTED_NETS="10.20.9.0/24")
        self.assertEqual(self.run_ctl("ban", "10.20.9.10")[0], 2)
        self.assertEqual(self.run_ctl("ban", "10.20.3.3; reboot")[0], 2)
        code, out, _ = self.run_ctl("ban", "10.20.3.3", "--minutes", "30")
        self.assertEqual(code, 0)
        self.assertTrue(self.ran("nft add element inet ludora ban4 { 10.20.3.3 timeout 1800s }"))

    def test_claim_needs_a_real_password_and_brings_everything_up_in_order(self):
        self.configure(DOMAIN="10.20.0.5")
        self.answers["pwscore"] = system.Result(127, "", "")
        self.answers["podman image inspect"] = system.Result(0, "sha256:" + "ab" * 32 + "\n", "")
        self.answers["podman inspect"] = system.Result(0, "healthy\n", "")
        for weak in ("short", "ludora-rocks-2026", "aaaaaaaaaaaaaaaa"):
            with self.assertRaises(ctl.Refused):
                ctl.claim(weak, log=lambda *_: None)
        self.assertFalse(applier.claimed())
        ctl.claim("orbit-maple-seven-tugboat", log=lambda *_: None)
        self.assertTrue(applier.claimed())
        order = [" ".join(c[:3]) for c in self.calls]
        self.assertLess(order.index("chpasswd"), order.index("podman pull --quiet"))
        self.assertLess(order.index("podman pull --quiet"), order.index("systemctl enable --now"))
        self.assertIn("@sha256:", system.read(system.IMAGES_LOCK))
        self.assertIn("Image=docker.io/library/postgres@sha256:", system.read(f"{system.QUADLET_DIR}/ludora-db.container"))
        with self.assertRaises(ctl.Refused):
            ctl.claim("orbit-maple-seven-tugboat", log=lambda *_: None)

    def test_a_failed_first_start_leaves_the_server_sealed(self):
        self.configure(DOMAIN="10.20.0.5")
        self.answers["pwscore"] = system.Result(127, "", "")
        self.answers["podman image inspect"] = system.Result(0, "sha256:" + "ab" * 32 + "\n", "")
        self.answers["systemctl enable --now ludora-db.service"] = system.Result(1, "", "failed")
        self.answers["systemctl start ludora-db.service"] = system.Result(1, "", "failed")
        with self.assertRaises(maintain.MaintainError):
            ctl.claim("orbit-maple-seven-tugboat", log=lambda *_: None)
        self.assertFalse(applier.claimed())
        self.assertIn("Not claimed yet", system.read(system.NFT_FILE))

    def test_status_and_doctor_work_on_an_empty_machine(self):
        code, out, _ = self.run_ctl("status")
        self.assertEqual(code, 1)
        self.assertIn("not set up yet", out)
        code, out, _ = self.run_ctl("doctor", "--json")
        report = json.loads(out)
        self.assertGreater(len(report["checks"]), 25)
        self.assertEqual(overview.gather()["checks"]["passed"], report["passed"])
        self.assertEqual(doctor.last()["at"], report["at"])

    def test_update_goes_back_when_the_new_version_is_unhealthy(self):
        self.configure(DOMAIN="10.20.0.5")
        os.makedirs(system.p(system.SRC_DIR), exist_ok=True)
        real_backup, real_wait, real_fetch = maintain.backup, maintain.wait_healthy, maintain.fetch_source
        health = iter([False, True])
        maintain.backup = lambda log=print: {}
        maintain.wait_healthy = lambda seconds=180: next(health)
        maintain.fetch_source = lambda ref=None, log=print: system.p(system.SRC_DIR)
        try:
            with self.assertRaises(maintain.MaintainError) as caught:
                maintain.update_app(None, lambda *_: None)
            self.assertIn("undone", str(caught.exception))
            tags = [c for c in self.calls if c[:2] == ["podman", "tag"]]
            self.assertEqual(tags[-1], ["podman", "tag", "localhost/ludora:previous", "localhost/ludora:current"])
        finally:
            maintain.backup, maintain.wait_healthy, maintain.fetch_source = real_backup, real_wait, real_fetch


if __name__ == "__main__":
    unittest.main(verbosity=2)
