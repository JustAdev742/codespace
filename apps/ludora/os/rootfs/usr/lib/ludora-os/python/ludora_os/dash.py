"""The staff dashboard's web service.

It runs as its own unprivileged, sandboxed user and holds no power: it checks who is asking, then passes each
request to the root helper (dashops.py) over a local socket only it may open. It is reached only through the HTTPS
proxy, on its own port, which the firewall opens to the staff addresses and nobody else.

What it guards:
  - a password (scrypt), and a six-digit authenticator code as well when one is set up;
  - five wrong tries from one address pause that address for fifteen minutes; twenty from anywhere pause everyone;
  - a session is a random token in a cookie scripts cannot read, tied to the address it began at, ended after
    fifteen idle minutes or eight hours;
  - every change must be a JSON POST from this site's own pages (Origin, Host and a header are all checked), so
    another website cannot make a signed-in browser act;
  - the pages may load nothing from anywhere else and run no inline script (Content-Security-Policy).
"""

from __future__ import annotations

import base64
import hashlib
import hmac
import ipaddress
import json
import os
import secrets
import socket
import struct
import threading
import time
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from typing import Any, Callable

from . import system

AUTH_FILE = f"{system.ETC}/dash.json"          # the password's hash and the authenticator secret: root and the dashboard only
SOCKET = "/run/ludora-dashop.sock"            # the root helper
STATIC_DIR = "/usr/share/ludora-os/dash"
LISTEN_PORT = 8760                            # reached only by the proxy container; the firewall refuses everyone else
STATIC = {"/": ("index.html", "text/html; charset=utf-8"), "/dash.css": ("dash.css", "text/css; charset=utf-8"), "/dash.js": ("dash.js", "text/javascript; charset=utf-8")}
CSP = "default-src 'none'; script-src 'self'; style-src 'self'; img-src 'self' data:; connect-src 'self'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'"
IDLE_SECONDS, MAX_SECONDS, MAX_SESSIONS = 15 * 60, 8 * 3600, 8
TRIES, GLOBAL_TRIES, WINDOW, PAUSE = 5, 20, 15 * 60, 15 * 60
MAX_BODY = 64 * 1024
SCRYPT = {"n": 1 << 15, "r": 8, "p": 1}
COOKIE = "__Host-ludora-dash"


# ---- the password and the authenticator code ---------------------------------------------------------------------
def hash_password(password: str) -> dict[str, Any]:
    salt = secrets.token_bytes(16)
    digest = hashlib.scrypt(password.encode(), salt=salt, dklen=32, maxmem=1 << 27, **SCRYPT)
    return {"salt": salt.hex(), "hash": digest.hex(), **SCRYPT}


def password_matches(stored: Any, password: str) -> bool:
    try:
        salt, want = bytes.fromhex(stored["salt"]), bytes.fromhex(stored["hash"])
        n, r, p = int(stored["n"]), int(stored["r"]), int(stored["p"])
        if not (1 << 14 <= n <= 1 << 17 and r == 8 and 1 <= p <= 2 and len(want) == 32):
            return False
        got = hashlib.scrypt(password.encode(), salt=salt, dklen=32, maxmem=1 << 28, n=n, r=r, p=p)
    except (KeyError, TypeError, ValueError):
        return False
    return hmac.compare_digest(got, want)


def totp(secret_b32: str, at: float, step: int = 0) -> str:
    """The six-digit code an authenticator app shows for this secret (RFC 6238, 30 seconds, SHA-1)."""
    key = base64.b32decode(secret_b32.upper() + "=" * (-len(secret_b32) % 8))
    counter = int(at // 30) + step
    mac = hmac.new(key, struct.pack(">Q", counter), hashlib.sha1).digest()
    offset = mac[-1] & 0x0F
    return f"{(struct.unpack('>I', mac[offset:offset + 4])[0] & 0x7FFFFFFF) % 1_000_000:06d}"


def load_auth() -> dict[str, Any]:
    try:
        data = json.loads(system.read(AUTH_FILE) or "{}")
    except ValueError:
        return {}
    return data if isinstance(data, dict) else {}


def save_auth(data: dict[str, Any]) -> None:
    system.write_atomic(AUTH_FILE, json.dumps(data), 0o640, group="ludora-dash")


# ---- the app: pure enough to test without a network ---------------------------------------------------------------
class Reply:
    def __init__(self, status: int, body: bytes | dict[str, Any], kind: str = "application/json", headers: dict[str, str] | None = None):
        self.status = status
        self.body = json.dumps(body).encode() if isinstance(body, dict) else body
        self.kind = kind
        self.headers = headers or {}


class App:
    def __init__(self, ops: Callable[[dict[str, Any]], dict[str, Any]], origin: str, *, server: str = "ludora", auth: Callable[[], dict[str, Any]] = load_auth,
                 static_dir: str = STATIC_DIR, clock: Callable[[], float] = time.time):
        self.ops, self.origin, self.server, self.auth, self.static_dir, self.clock = ops, origin, server, auth, static_dir, clock
        self.host = origin.split("://", 1)[1]
        self.sessions: dict[str, dict[str, Any]] = {}     # sha256(token) -> {ip, since, seen}
        self.failures: dict[str, list[float]] = {}        # address -> times of wrong tries
        self.paused: dict[str, float] = {}                # address (or "*") -> until
        self.used_codes: dict[str, float] = {}            # authenticator codes already used, so one cannot be replayed
        self.lock = threading.Lock()

    # -- sessions
    def _session(self, cookie: str, ip: str) -> str | None:
        token = ""
        for part in cookie.split(";"):
            name, _, value = part.strip().partition("=")
            if name == COOKIE:
                token = value
        if not token or len(token) > 100:
            return None
        key = hashlib.sha256(token.encode()).hexdigest()
        now = self.clock()
        with self.lock:
            found = self.sessions.get(key)
            if not found:
                return None
            if found["ip"] != ip or now - found["seen"] > IDLE_SECONDS or now - found["since"] > MAX_SECONDS:
                del self.sessions[key]
                return None
            found["seen"] = now
        return key

    def _note(self, kind: str, ip: str) -> None:
        try:
            self.ops({"op": "note", "kind": kind, "client": ip})
        except Exception:  # the record is worth having, never worth failing a sign-in for
            pass

    def _login(self, body: dict[str, Any], ip: str) -> Reply:
        now = self.clock()
        with self.lock:
            for who in (ip, "*"):
                if self.paused.get(who, 0) > now:
                    left = int(self.paused[who] - now) + 1
                    return Reply(429, {"error": f"Too many wrong tries. Sign-in is paused for {max(1, round(left / 60))} more minutes.", "retry_after": left})
        stored = self.auth()
        password, code = body.get("password"), body.get("code")
        good = isinstance(password, str) and 0 < len(password) <= 256 and password_matches(stored.get("password"), password)
        secret = stored.get("totp")
        if good and secret:
            good = False
            if isinstance(code, str) and len(code) == 6 and code.isdigit():
                with self.lock:
                    self.used_codes = {c: t for c, t in self.used_codes.items() if now - t < 120}
                    fresh = code not in self.used_codes
                    if fresh and any(hmac.compare_digest(totp(secret, now, step), code) for step in (-1, 0, 1)):
                        self.used_codes[code] = now
                        good = True
        if not good:
            locked = False
            with self.lock:
                for who, limit in ((ip, TRIES), ("*", GLOBAL_TRIES)):
                    tries = [t for t in self.failures.get(who, []) if now - t < WINDOW] + [now]
                    self.failures[who] = tries
                    if len(tries) >= limit:
                        self.paused[who] = now + PAUSE
                        self.failures[who] = []
                        locked = True
                if len(self.failures) > 5000:
                    self.failures.clear()
            self._note("locked" if locked else "failed", ip)
            return Reply(401, {"error": "That password or code is not right." if stored.get("password") else "No dashboard password has been set. Set one at the server with `ludoractl dash password`."})
        token = secrets.token_urlsafe(32)
        with self.lock:
            self.failures.pop(ip, None)
            live = sorted(self.sessions.items(), key=lambda kv: kv[1]["seen"])
            for key, _ in live[: max(0, len(live) - MAX_SESSIONS + 1)]:
                del self.sessions[key]
            self.sessions[hashlib.sha256(token.encode()).hexdigest()] = {"ip": ip, "since": now, "seen": now}
        self._note("signed_in", ip)
        return Reply(200, {"ok": True}, headers={"Set-Cookie": f"{COOKIE}={token}; Path=/; Secure; HttpOnly; SameSite=Strict"})

    def _ask(self, request: dict[str, Any], ip: str) -> Reply:
        answer = self.ops({**request, "client": ip})
        if not isinstance(answer, dict) or not answer.get("ok"):
            return Reply(400, {"error": str((answer or {}).get("error") or "The server could not do that.")})
        return Reply(200, answer)

    def handle(self, method: str, target: str, headers: dict[str, str], body: bytes, ip: str) -> Reply:
        """One request. `headers` has lower-case names. `ip` is the address the proxy saw."""
        path, _, query = target.partition("?")
        if headers.get("host", "").lower() != self.host.lower():
            return Reply(421, {"error": "This dashboard is not served under that name."})   # a name aimed at us by someone else's DNS
        if method == "GET" and path in STATIC:
            name, kind = STATIC[path]
            try:
                with open(system.p(os.path.join(self.static_dir, name)), "rb") as fh:
                    return Reply(200, fh.read(), kind)
            except OSError:
                return Reply(503, b"The dashboard's pages are not installed.", "text/plain; charset=utf-8")
        if not path.startswith("/api/"):
            return Reply(404, {"error": "There is nothing at that address."})
        data: dict[str, Any] = {}
        if method == "POST":
            if headers.get("origin") != self.origin or headers.get("x-ludora-dash") != "1" or not headers.get("content-type", "").startswith("application/json"):
                return Reply(403, {"error": "That request did not come from the dashboard's own pages."})
            try:
                data = json.loads(body or b"{}")
            except ValueError:
                data = None  # type: ignore[assignment]
            if not isinstance(data, dict):
                return Reply(400, {"error": "That was not understood."})
        elif method != "GET":
            return Reply(405, {"error": "That is not how this is asked for."})
        session = self._session(headers.get("cookie", ""), ip)
        stored = self.auth()
        if path == "/api/session" and method == "GET":
            return Reply(200, {"signed_in": bool(session), "server": self.server, "version": system.VERSION, "needs_code": bool(stored.get("totp")), "idle_minutes": IDLE_SECONDS // 60})
        if path == "/api/login" and method == "POST":
            return self._login(data, ip)
        if not session:
            return Reply(401, {"error": "signed_out"})
        if path == "/api/logout" and method == "POST":
            with self.lock:
                self.sessions.pop(session, None)
            return Reply(200, {"ok": True}, headers={"Set-Cookie": f"{COOKIE}=; Path=/; Secure; HttpOnly; SameSite=Strict; Max-Age=0"})
        params = {k: v for k, _, v in (pair.partition("=") for pair in query.split("&") if pair)}
        if method == "GET":
            if path in ("/api/overview", "/api/doctor", "/api/settings", "/api/setup"):
                return self._ask({"op": path.rsplit("/", 1)[1]}, ip)
            if path == "/api/events":
                return self._ask({"op": "events", "limit": _number(params.get("limit"), 100)}, ip)
            if path == "/api/logs":
                return self._ask({"op": "logs", "what": params.get("what", ""), "lines": _number(params.get("lines"), 80)}, ip)
        else:
            if path == "/api/dns-check":
                return self._ask({"op": "dns_check", "name": data.get("name")}, ip)
            if path == "/api/action":
                return self._ask({**{k: v for k, v in data.items() if k not in ("op", "client")}, "op": "action"}, ip)
        return Reply(404, {"error": "There is nothing at that address."})


def _number(text: str | None, default: int) -> int:
    return int(text) if text and text.isdigit() and len(text) <= 4 else default


# ---- talking to the root helper, and serving ----------------------------------------------------------------------
def ask_helper(request: dict[str, Any]) -> dict[str, Any]:
    with socket.socket(socket.AF_UNIX, socket.SOCK_STREAM) as conn:
        conn.settimeout(150)
        conn.connect(SOCKET)
        conn.sendall(json.dumps(request).encode() + b"\n")
        conn.shutdown(socket.SHUT_WR)
        chunks = []
        while True:
            block = conn.recv(65536)
            if not block:
                break
            chunks.append(block)
            if sum(map(len, chunks)) > 4 << 20:
                break
    return json.loads(b"".join(chunks) or b"{}")


def make_handler(app: App, proxy_net: ipaddress.IPv4Network | None) -> type[BaseHTTPRequestHandler]:
    class Handler(BaseHTTPRequestHandler):
        protocol_version = "HTTP/1.1"
        server_version = "ludora"
        sys_version = ""
        timeout = 30

        def _serve(self, method: str) -> None:
            peer = self.client_address[0]
            if proxy_net is not None and ipaddress.ip_address(peer) not in proxy_net:
                self.send_error(403)   # only the proxy may speak to this service, whatever the firewall says
                return
            try:
                length = int(self.headers.get("Content-Length") or 0)
            except ValueError:
                length = -1
            if not 0 <= length <= MAX_BODY:
                self.send_error(413)
                return
            body = self.rfile.read(length) if length else b""
            headers = {k.lower(): v for k, v in self.headers.items()}
            try:
                ip = str(ipaddress.ip_address(headers.get("x-real-ip", "")))   # set by the proxy, which overwrites anything the browser sent
            except ValueError:
                self.send_error(400)
                return
            try:
                reply = app.handle(method, self.path[:2000], headers, body, ip)
            except Exception:
                reply = Reply(500, {"error": "The dashboard had a fault. Nothing was changed."})
            self.send_response(reply.status)
            self.send_header("Content-Type", reply.kind)
            self.send_header("Content-Length", str(len(reply.body)))
            self.send_header("Content-Security-Policy", CSP)
            self.send_header("X-Content-Type-Options", "nosniff")
            self.send_header("X-Frame-Options", "DENY")
            self.send_header("Referrer-Policy", "no-referrer")
            self.send_header("Cross-Origin-Opener-Policy", "same-origin")
            self.send_header("Cache-Control", "no-store")
            for name, value in reply.headers.items():
                self.send_header(name, value)
            self.end_headers()
            self.wfile.write(reply.body)

        def do_GET(self) -> None:  # noqa: N802 - the name http.server looks for
            self._serve("GET")

        def do_POST(self) -> None:  # noqa: N802
            self._serve("POST")

        def log_message(self, *args: Any) -> None:
            return   # the proxy keeps the access log; nothing typed into this service is ever written out

    return Handler


def main() -> int:
    # Its own address and the server's name come from the unit's environment (written by `ludoractl apply`):
    # this service cannot read the settings file, which holds things it has no business knowing.
    origin = os.environ.get("LUDORA_DASH_ORIGIN", "")
    if not origin.startswith("https://"):
        return 1
    app = App(ask_helper, origin, server=os.environ.get("LUDORA_DASH_SERVER", "ludora"))
    server = ThreadingHTTPServer(("0.0.0.0", LISTEN_PORT), make_handler(app, ipaddress.ip_network(system.NET_EDGE)))
    server.daemon_threads = True
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        pass
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
