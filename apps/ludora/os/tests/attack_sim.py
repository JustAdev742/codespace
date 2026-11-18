#!/usr/bin/env python3
"""Attack simulation on a real kernel: a small school network in network namespaces.

    sudo python3 tests/attack_sim.py

It builds a switch, a Ludora OS server (the rendered firewall plus the
sentinel, running without root), a container behind the server's published
ports, three student machines, a staff desk and a router with "the internet"
behind it. Then it attacks the server the way someone inside a school would
and checks what got through. Needs Linux, root, iproute2, nftables and
python3. Nothing outside the namespaces it creates is touched.
"""

from __future__ import annotations

import json
import os
import shutil
import socket
import struct
import subprocess
import sys
import tempfile
import time

HERE = os.path.dirname(os.path.abspath(__file__))
PY = os.path.join(HERE, "..", "rootfs", "usr", "lib", "ludora-os", "python")
sys.path.insert(0, PY)

from ludora_os import config, render  # noqa: E402

P = "los-"
SRV, GW, STU1, STU2, STU3, STAFF, CTR, SW = (P + n for n in ("srv", "gw", "stu1", "stu2", "stu3", "staff", "ctr", "sw"))
ADDR = {SRV: "10.20.0.5", GW: "10.20.0.1", STU1: "10.20.3.3", STU2: "10.20.3.4", STU3: "10.20.3.50", STAFF: "10.20.9.10"}
SERVER = ADDR[SRV]
INTERNET = "203.0.113.10"
results: list[tuple[bool, str]] = []
procs: list[subprocess.Popen] = []


def sh(*argv: str, check: bool = True, timeout: float = 30) -> subprocess.CompletedProcess:
    return subprocess.run(argv, capture_output=True, text=True, check=check, timeout=timeout)


def ns(name: str, *argv: str, check: bool = True, timeout: float = 30) -> subprocess.CompletedProcess:
    return sh("ip", "netns", "exec", name, *argv, check=check, timeout=timeout)


def spawn(name: str, *argv: str, env: dict[str, str] | None = None) -> subprocess.Popen:
    proc = subprocess.Popen(["ip", "netns", "exec", name, *argv], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, env=env)
    procs.append(proc)
    return proc


LISTENER = (
    "import socket,sys,threading\n"
    "def serve(port):\n"
    "    s=socket.socket(); s.setsockopt(socket.SOL_SOCKET,socket.SO_REUSEADDR,1); s.bind(('0.0.0.0',port)); s.listen(512)\n"
    "    while True:\n"
    "        c,_=s.accept()\n"
    "        try: c.sendall(b'ok\\n'); c.close()\n"
    "        except OSError: pass\n"
    "for p in sys.argv[1:]: threading.Thread(target=serve,args=(int(p),),daemon=True).start()\n"
    "threading.Event().wait()\n"
)
CONNECT = (
    "import socket,sys\n"
    "s=socket.socket(); s.settimeout(float(sys.argv[3]))\n"
    "try:\n"
    "    s.connect((sys.argv[1],int(sys.argv[2]))); d=s.recv(8); print('open' if d else 'empty')\n"
    "except Exception as e: print('closed', type(e).__name__)\n"
)
BURST = (
    "import socket,sys,time\n"
    "host,port,n,hold=sys.argv[1],int(sys.argv[2]),int(sys.argv[3]),float(sys.argv[4])\n"
    "socks=[]\n"
    "for i in range(n):\n"
    "    s=socket.socket(); s.setblocking(False)\n"
    "    try: s.connect((host,port))\n"
    "    except BlockingIOError: pass\n"
    "    socks.append(s)\n"
    "time.sleep(1.2)\n"
    "ok=0\n"
    "for s in socks:\n"
    "    try: s.getpeername(); ok+=1\n"
    "    except OSError: pass\n"
    "print(ok); time.sleep(hold)\n"
)


def reach(name: str, host: str, port: int, timeout: float = 1.5) -> bool:
    out = ns(name, sys.executable, "-c", CONNECT, host, str(port), str(timeout), check=False).stdout
    return out.startswith(("open", "empty"))


def check(ok: bool, text: str) -> None:
    results.append((bool(ok), text))
    print(("  pass  " if ok else "  FAIL  ") + text, flush=True)


def counters() -> dict[str, int]:
    data = json.loads(ns(SRV, "nft", "-j", "list", "counters", "table", "inet", "ludora").stdout)
    return {i["counter"]["name"]: i["counter"]["packets"] for i in data["nftables"] if "counter" in i}


def banned() -> list[str]:
    data = json.loads(ns(SRV, "nft", "-j", "list", "set", "inet", "ludora", "ban4").stdout)
    out = []
    for item in data["nftables"]:
        for element in item.get("set", {}).get("elem", []) or []:
            out.append(element["elem"]["val"] if isinstance(element, dict) else element)
    return out


def wait_for(predicate, seconds: float = 6.0) -> bool:
    end = time.time() + seconds
    while time.time() < end:
        if predicate():
            return True
        time.sleep(0.25)
    return False


def spoofed_syn(from_ns: str, forged_source: str, target: str, port: int) -> None:
    """A SYN that claims to come from another machine: what a student would send to get a classmate banned."""
    code = (
        "import socket,struct,sys\n"
        "src,dst,port=sys.argv[1],sys.argv[2],int(sys.argv[3])\n"
        "def csum(b):\n"
        "    if len(b)%2: b+=b'\\0'\n"
        "    s=sum(struct.unpack('!%dH'%(len(b)//2),b)); s=(s>>16)+(s&0xffff); s+=s>>16; return ~s&0xffff\n"
        "tcp=struct.pack('!HHLLBBHHH',40000,port,12345,0,5<<4,2,64240,0,0)\n"
        "pseudo=socket.inet_aton(src)+socket.inet_aton(dst)+struct.pack('!BBH',0,6,len(tcp))\n"
        "tcp=tcp[:16]+struct.pack('!H',csum(pseudo+tcp))+tcp[18:]\n"
        "ip=struct.pack('!BBHHHBBH4s4s',0x45,0,40,1,0,64,6,0,socket.inet_aton(src),socket.inet_aton(dst))\n"
        "s=socket.socket(socket.AF_INET,socket.SOCK_RAW,socket.IPPROTO_RAW)\n"
        "for _ in range(5): s.sendto(ip+tcp,(dst,0))\n"
    )
    ns(from_ns, sys.executable, "-c", code, forged_source, target, str(port))


def syn_flood(from_ns: str, target: str, port: int, count: int) -> None:
    """Connection attempts from thousands of made-up addresses on the school network, as fast as they will go."""
    code = (
        "import socket,struct,sys,random\n"
        "dst,port,count=sys.argv[1],int(sys.argv[2]),int(sys.argv[3])\n"
        "def csum(b):\n"
        "    if len(b)%2: b+=b'\\0'\n"
        "    s=sum(struct.unpack('!%dH'%(len(b)//2),b)); s=(s>>16)+(s&0xffff); s+=s>>16; return ~s&0xffff\n"
        "s=socket.socket(socket.AF_INET,socket.SOCK_RAW,socket.IPPROTO_RAW)\n"
        "for i in range(count):\n"
        "    src='10.20.%d.%d'%(random.randint(100,250),random.randint(1,254))\n"
        "    tcp=struct.pack('!HHLLBBHHH',random.randint(1025,65000),port,i,0,5<<4,2,64240,0,0)\n"
        "    pseudo=socket.inet_aton(src)+socket.inet_aton(dst)+struct.pack('!BBH',0,6,len(tcp))\n"
        "    tcp=tcp[:16]+struct.pack('!H',csum(pseudo+tcp))+tcp[18:]\n"
        "    s.sendto(struct.pack('!BBHHHBBH4s4s',0x45,0,40,1,0,64,6,0,socket.inet_aton(src),socket.inet_aton(dst))+tcp,(dst,0))\n"
    )
    ns(from_ns, sys.executable, "-c", code, target, str(port), str(count), timeout=120)


def build(tmp: str, cfg: dict) -> None:
    for name in (SW, SRV, GW, STU1, STU2, STU3, STAFF, CTR):
        sh("ip", "netns", "add", name)
        ns(name, "ip", "link", "set", "lo", "up")
    ns(SW, "ip", "link", "add", "br0", "type", "bridge")
    ns(SW, "ip", "link", "set", "br0", "up")
    for name, address in ADDR.items():
        port = "p" + name[len(P):]
        sh("ip", "link", "add", port, "netns", SW, "type", "veth", "peer", "name", "eth0", "netns", name)
        ns(SW, "ip", "link", "set", port, "master", "br0")
        ns(SW, "ip", "link", "set", port, "up")
        ns(name, "ip", "addr", "add", f"{address}/16", "dev", "eth0")
        ns(name, "ip", "link", "set", "eth0", "up")
        if name != GW:
            ns(name, "ip", "route", "add", "default", "via", ADDR[GW])
    # the router, with the internet behind it
    ns(GW, "ip", "addr", "add", f"{INTERNET}/32", "dev", "lo")
    ns(GW, "sysctl", "-qw", "net.ipv4.ip_forward=1")
    # a container behind the server, on the interface name and subnet Podman uses
    sh("ip", "link", "add", "podman1", "netns", SRV, "type", "veth", "peer", "name", "eth0", "netns", CTR)
    ns(SRV, "ip", "addr", "add", "10.89.20.1/24", "dev", "podman1")
    ns(SRV, "ip", "link", "set", "podman1", "up")
    ns(CTR, "ip", "addr", "add", "10.89.20.2/24", "dev", "eth0")
    ns(CTR, "ip", "link", "set", "eth0", "up")
    ns(CTR, "ip", "route", "add", "default", "via", "10.89.20.1")
    ns(SRV, "sysctl", "-qw", "net.ipv4.ip_forward=1")
    # what Podman's own network layer does for published ports: forward 80 and 443 to the container
    fake = os.path.join(tmp, "podman.nft")
    with open(fake, "w") as fh:
        fh.write(
            "table inet fakepodman {\n"
            "\tchain pre {\n\t\ttype nat hook prerouting priority dstnat;\n"
            "\t\tfib daddr type local tcp dport { 80, 443 } dnat ip to 10.89.20.2\n\t}\n"
            "\tchain post {\n\t\ttype nat hook postrouting priority srcnat;\n"
            '\t\tip saddr 10.89.20.0/24 oifname "eth0" masquerade\n\t}\n'
            "}\n"
        )
    ns(SRV, "nft", "-f", fake)
    spawn(CTR, sys.executable, "-c", LISTENER, "80", "443")
    spawn(GW, sys.executable, "-c", LISTENER, "443", "25")
    spawn(STU2, sys.executable, "-c", LISTENER, "80")
    spawn(SRV, sys.executable, "-c", LISTENER, str(cfg["SSH_PORT"]), "9999")


def load_firewall(tmp: str, cfg: dict, **kw) -> None:
    path = os.path.join(tmp, "ludora.nft")
    with open(path, "w") as fh:
        fh.write(render.nftables(cfg, **kw))
    ns(SRV, "nft", "-f", path)


def start_sentinel(tmp: str, cfg: dict) -> subprocess.Popen:
    root = os.path.join(tmp, "root")
    os.makedirs(os.path.join(root, "etc/ludora-os"), exist_ok=True)
    state = os.path.join(root, "var/lib/ludora-os/sentinel")
    os.makedirs(state, exist_ok=True)
    with open(os.path.join(root, "etc/ludora-os/ludora-os.conf"), "w") as fh:
        fh.write(config.dump(cfg))
    # a stand-in for the journal: the test appends lines to a file, the shim hands them over as the journal would
    shim = os.path.join(tmp, "bin")
    os.makedirs(shim, exist_ok=True)
    feed = os.path.join(tmp, "journal.feed")
    open(feed, "w").close()
    with open(os.path.join(shim, "journalctl"), "w") as fh:
        fh.write(f"#!/bin/sh\nexec tail -n 0 -F {feed}\n")
    os.chmod(os.path.join(shim, "journalctl"), 0o755)
    for path in (tmp, shim, root, os.path.join(root, "etc"), os.path.join(root, "etc/ludora-os")):
        os.chmod(path, 0o755)
    sh("chown", "-R", "nobody", os.path.join(root, "var"))
    os.chmod(feed, 0o644)
    env = {"PATH": shim + ":/usr/sbin:/usr/bin:/sbin:/bin", "LUDORA_OS_ROOT": root, "PYTHONPATH": PY, "PYTHONUNBUFFERED": "1"}
    caps = "+net_admin,+net_bind_service"
    return spawn(
        SRV, "setpriv", "--reuid", "nobody", "--regid", "nogroup", "--clear-groups", "--inh-caps", caps, "--ambient-caps", caps,
        "--bounding-set", caps, sys.executable, "-m", "ludora_os.sentinel", env=env,
    )


def journal(tmp: str, unit: str, message: str) -> None:
    with open(os.path.join(tmp, "journal.feed"), "a") as fh:
        fh.write(json.dumps({"_SYSTEMD_UNIT": unit, "MESSAGE": message}) + "\n")


def web_line(ip: str, uri: str, status: int = 404, method: str = "GET") -> str:
    return json.dumps({"level": "info", "request": {"remote_ip": ip, "method": method, "uri": uri}, "status": status})


def main() -> int:
    if os.geteuid() != 0:
        print("Run as root: it creates network namespaces.")
        return 2
    for tool in ("ip", "nft", "setpriv"):
        if not shutil.which(tool):
            print(f"Needs {tool}.")
            return 2
    cfg = config.defaults()
    for key, value in {
        "DOMAIN": SERVER, "TRUSTED_NETS": "10.20.9.0/24", "ADMIN_NETS": "10.20.9.10", "SSH_ENABLED": "yes",
        "HTTP_NEW_PER_SEC": "40", "HTTP_MAX_CONNS": "30", "BAN_MINUTES": "15",
    }.items():
        config.set_value(cfg, key, value)
    tmp = tempfile.mkdtemp(prefix="ludora-os-sim-")
    try:
        cleanup(quiet=True)
        build(tmp, cfg)

        print("\nSealed (before the server is claimed)")
        load_firewall(tmp, cfg, sealed=True)
        check(not reach(STU1, SERVER, 443), "a student cannot open Ludora")
        check(not reach(STAFF, SERVER, cfg["SSH_PORT"]), "staff cannot reach SSH")
        check(not reach(STU1, SERVER, 3389), "decoy ports are shut too")

        print("\nNormal running")
        load_firewall(tmp, cfg)
        sentinel = start_sentinel(tmp, cfg)
        check(wait_for(lambda: reach(STAFF, SERVER, 3389, 0.5), 8), "the sentinel (no root, two capabilities) is listening on the decoy ports")
        check(sentinel.poll() is None, "the sentinel is still running")
        check(reach(STU1, SERVER, 443) and reach(STU1, SERVER, 80), "a student opens Ludora through the published ports")
        check(reach(STAFF, SERVER, cfg["SSH_PORT"]), "the staff desk reaches SSH")
        check(not reach(STU2, SERVER, cfg["SSH_PORT"]), "a student cannot reach SSH")
        check(not reach(STU2, SERVER, 9999), "a service nobody published is unreachable")

        print("\nPort scan from a student laptop (ordinary connect scan)")
        check(reach(STU1, SERVER, 3389, 1.0), "the student's first knock on decoy port 3389 is answered")
        check(wait_for(lambda: ADDR[STU1] in banned()), "the sentinel bans that student's address")
        check(not reach(STU1, SERVER, 443), "the banned student can no longer open Ludora")
        check(reach(STU2, SERVER, 443), "the student at the next desk is unaffected")

        print("\nStaff network tools touching the same decoy")
        check(ADDR[STAFF] not in banned(), "the trusted staff address was not banned for its earlier knock")
        check(reach(STAFF, SERVER, 443), "staff still open Ludora")

        print("\nFraming a classmate: forged packets claiming to be student 3")
        spoofed_syn(STU2, ADDR[STU3], SERVER, 3389)
        spoofed_syn(STU2, ADDR[STU3], SERVER, 23)
        time.sleep(2)
        check(ADDR[STU3] not in banned(), "student 3 is not banned: a forged packet completes no connection")
        check(reach(STU3, SERVER, 443), "student 3 still opens Ludora")

        print("\nStealth scans (need root on the attacker's machine)")
        before = counters()
        ns(STU2, "nmap", "-n", "-Pn", "-sX", "-p", "1-200", "--max-retries", "0", "-T4", SERVER, check=False, timeout=60)
        ns(STU2, "nmap", "-n", "-Pn", "-sN", "-p", "1-200", "--max-retries", "0", "-T4", SERVER, check=False, timeout=60)
        after = counters()
        check(after["c_bogus"] - before["c_bogus"] >= 300, f"Xmas and null scan packets are dropped before anything answers ({after['c_bogus'] - before['c_bogus']} dropped)")
        scan = ns(STU2, "nmap", "-n", "-Pn", "-sS", "-p", "1-1024,3389,5432,8787", "--max-retries", "0", "-T4", "-oG", "-", SERVER, check=False, timeout=90).stdout
        ports_line = next((line for line in scan.splitlines() if "Ports:" in line), "")
        open_ports = sorted(int(part.strip().split("/")[0]) for part in ports_line.split("Ports:")[-1].split(",") if "/open/" in part)
        real = [p for p in open_ports if p in (80, 443)]
        check(real == [80, 443] and 8787 not in open_ports and 5432 in open_ports, f"a SYN scan sees the two web ports plus decoys, and cannot tell them apart from real services ({open_ports})")
        check(ADDR[STU2] not in banned(), "a half-open scan alone is not banned (it cannot be told from forgery); the decoys it found are the trap")
        check(reach(STU2, SERVER, 5432, 1.0) and wait_for(lambda: ADDR[STU2] in banned()), "the scanner follows up on 'PostgreSQL' on 5432 and is banned")
        ns(SRV, "nft", "delete", "element", "inet", "ludora", "ban4", "{", ADDR[STU2], "}")
        check(wait_for(lambda: reach(STU2, SERVER, 443)), "an administrator lifts the ban and the student is back at once")

        print("\nFlooding the site from one machine")
        before = counters()
        opened = int(ns(STU3, sys.executable, "-c", BURST, SERVER, "80", "400", "0", timeout=60).stdout.strip() or 0)
        after = counters()
        check(opened < 200 and after["c_http_rate"] > before["c_http_rate"], f"400 connections in one burst: {opened} got in, {after['c_http_rate'] - before['c_http_rate']} new-connection packets were refused")
        time.sleep(3)
        check(reach(STU3, SERVER, 443), "the same machine is welcome again a few seconds later (limited, not banned)")
        holder = spawn(STU3, sys.executable, "-c", BURST, SERVER, "443", "36", "6")
        time.sleep(2.2)
        check(not reach(STU3, SERVER, 443, 1.0), "holding 30 connections open: that machine cannot open another")
        check(reach(STU2, SERVER, 443), "while everyone else connects normally")
        holder.wait(timeout=20)

        print("\nA flood of connection attempts from forged addresses")
        before = counters()
        started = time.time()
        syn_flood(STU3, SERVER, 443, 12000)
        took = time.time() - started
        after = counters()
        refused = after["c_synflood"] - before["c_synflood"]
        check(refused > 1000, f"12,000 forged connection attempts in {took:.1f}s: {refused} were refused before they cost any memory")
        check(wait_for(lambda: reach(STU2, SERVER, 443), 8), "and students connect again as soon as it stops")
        check(wait_for(lambda: reach(STAFF, SERVER, 443), 3), "the staff desk is outside the ceiling")

        print("\nThe web log: probing and password guessing")
        for uri in ("/.env", "/wp-login.php", "/.git/config"):
            journal(tmp, "ludora-proxy.service", web_line(ADDR[STU3], uri))
        check(wait_for(lambda: ADDR[STU3] in banned()), "three requests for other software's weak spots: banned")
        ns(SRV, "nft", "delete", "element", "inet", "ludora", "ban4", "{", ADDR[STU3], "}")
        for _ in range(20):
            journal(tmp, "ludora-proxy.service", web_line(ADDR[STU2], "/api/auth/login", 401, "POST"))
        check(wait_for(lambda: ADDR[STU2] in banned()), "twenty failed sign-ins in a row: banned")
        for _ in range(6):
            journal(tmp, "sshd.service", f"Failed publickey for ludora-admin from {ADDR[STAFF]} port 50000 ssh2")
        journal(tmp, "ludora-proxy.service", web_line(ADDR[STU1], "/play"))
        time.sleep(1.5)
        check(ADDR[STAFF] not in banned(), "SSH failures from the trusted staff desk are recorded, not banned")
        events = open(os.path.join(tmp, "root/var/lib/ludora-os/sentinel/events.jsonl")).read()
        check("failed to sign in over SSH" in events and "Not banned" in events, "the event log says why the staff desk was spared")

        print("\nA compromised container trying to reach out")
        check(reach(CTR, INTERNET, 443), "the container can fetch from the internet on 443 (certificates, AI drafts)")
        check(not reach(CTR, INTERNET, 25), "it cannot send mail or open any other port")
        check(not reach(CTR, ADDR[STU2], 80), "it cannot reach machines on the school network")
        check(not reach(CTR, "10.89.20.1", 9999), "it cannot reach services on the server itself")
        check(reach(SRV, INTERNET, 443) and not reach(SRV, INTERNET, 25), "the server itself can fetch updates on 443 and nothing leaves on other ports")

        print("\nShield and lockdown")
        for argv in render.shield_rules(cfg):
            ns(SRV, *argv)
        opened = int(ns(STU3, sys.executable, "-c", BURST, SERVER, "80", "200", "0", timeout=60).stdout.strip() or 0)
        check(opened <= 25, f"with the shield up the same burst gets {opened} connections in (limit a quarter of normal)")
        held = {ip: 600 for ip in banned()}
        locked = dict(cfg)
        locked["LOCKDOWN"] = True
        load_firewall(tmp, locked, bans=held)
        check(ADDR[STU2] in banned(), "bans survive a firewall reload")
        check(not reach(STU3, SERVER, 443) and reach(STAFF, SERVER, 443), "lockdown: students are shut out, the staff desk still gets in")
        check(sentinel.poll() is None, "the sentinel ran through all of it without stopping")
    finally:
        for proc in procs:
            proc.terminate()
        cleanup()
        shutil.rmtree(tmp, ignore_errors=True)
    failed = [text for ok, text in results if not ok]
    print(f"\n{len(results) - len(failed)} of {len(results)} checks passed.")
    for text in failed:
        print("  failed: " + text)
    return 1 if failed else 0


def cleanup(quiet: bool = False) -> None:
    existing = sh("ip", "netns", "list", check=False).stdout
    for name in (SW, SRV, GW, STU1, STU2, STU3, STAFF, CTR):
        if name in existing:
            pids = sh("ip", "netns", "pids", name, check=False).stdout.split()
            for pid in pids:
                sh("kill", "-9", pid, check=False)
            sh("ip", "netns", "del", name, check=False)


if __name__ == "__main__":
    raise SystemExit(main())
