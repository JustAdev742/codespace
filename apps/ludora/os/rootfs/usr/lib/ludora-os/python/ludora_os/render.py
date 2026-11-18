"""Turns the checked settings into the files the system runs on.

Pure functions: settings in, text out. Nothing here touches the disk or runs a
command, so every rule can be read, tested and compared for drift.
"""

from __future__ import annotations

import re
from typing import Any

from . import system

HEADER = "# Written by `ludoractl apply` from /etc/ludora-os/ludora-os.conf.\n# Do not edit: a change here is reported as drift and overwritten.\n"

_EMAIL = re.compile(r"^[A-Za-z0-9._+-]{1,64}@[A-Za-z0-9.-]{1,253}$")


def _v4(nets: list[str]) -> list[str]:
    return [n for n in nets if ":" not in n]


def _v6(nets: list[str]) -> list[str]:
    return [n for n in nets if ":" in n]


def _set(name: str, kind: str, flags: str, elements: list[str], extra: str = "") -> str:
    body = f"\tset {name} {{\n\t\ttype {kind}\n\t\tflags {flags}\n"
    if "interval" in flags:
        body += "\t\tauto-merge\n"
    if extra:
        body += f"\t\t{extra}\n"
    if elements:
        body += "\t\telements = { " + ", ".join(elements) + " }\n"
    return body + "\t}\n"


def nftables(cfg: dict[str, Any], *, bans: dict[str, int] | None = None, shield: bool = False, sealed: bool = False) -> str:
    """The whole firewall as one atomic ruleset.

    bans: address -> seconds left, carried across a reload.
    sealed: the server has not been claimed yet; nothing may connect to it.
    """
    bans = bans or {}
    nat = cfg["NAT_MODE"]
    rate = cfg["HTTP_NEW_PER_SEC"] * (10 if nat else 1)
    conns = cfg["HTTP_MAX_CONNS"] * (10 if nat else 1)
    ceiling = max(1000, cfg["HTTP_NEW_PER_SEC"] * 25)  # new connection attempts a second, from everyone together
    shield_rate = max(5, cfg["HTTP_NEW_PER_SEC"] // 4)
    shield_conns = max(10, cfg["HTTP_MAX_CONNS"] // 4)
    ssh_port = cfg["SSH_PORT"]
    trip = list(cfg["TRIPWIRE_PORTS"])
    if not cfg["SSH_ENABLED"] and ssh_port not in trip:
        trip.append(ssh_port)  # SSH is off, so a knock on its port is a probe too
    trip_set = ", ".join(str(n) for n in sorted(trip))
    web = "{ 80, 443 }"
    ban4 = [f"{ip} timeout {secs}s" for ip, secs in sorted(bans.items()) if ":" not in ip and secs > 0]
    ban6 = [f"{ip} timeout {secs}s" for ip, secs in sorted(bans.items()) if ":" in ip and secs > 0]

    out = "#!/usr/sbin/nft -f\n" + HEADER
    out += "# One table, loaded in one transaction: the firewall is never half-applied.\n"
    out += "table inet ludora\ndelete table inet ludora\n\ntable inet ludora {\n"
    out += _set("trust4", "ipv4_addr", "interval", _v4(cfg["TRUSTED_NETS"]))
    out += _set("trust6", "ipv6_addr", "interval", _v6(cfg["TRUSTED_NETS"]))
    out += _set("admin4", "ipv4_addr", "interval", _v4(cfg["ADMIN_NETS"]))
    out += _set("admin6", "ipv6_addr", "interval", _v6(cfg["ADMIN_NETS"]))
    out += _set("lan4", "ipv4_addr", "interval", _v4(cfg["LAN_NETS"]))
    out += _set("lan6", "ipv6_addr", "interval", _v6(cfg["LAN_NETS"]))
    out += _set("block4", "ipv4_addr", "interval", _v4(cfg["BLOCKED_NETS"]))
    out += _set("block6", "ipv6_addr", "interval", _v6(cfg["BLOCKED_NETS"]))
    out += _set("ban4", "ipv4_addr", "timeout", ban4, "size 65536")
    out += _set("ban6", "ipv6_addr", "timeout", ban6, "size 65536")
    for name in ("http_rate", "shield_rate", "ssh_rate", "dash_rate"):
        out += _set(f"{name}4", "ipv4_addr", "dynamic,timeout", [], "timeout 1m\n\t\tsize 131072")
        out += _set(f"{name}6", "ipv6_addr", "dynamic,timeout", [], "timeout 1m\n\t\tsize 131072")
    for name in ("http_conn", "shield_conn"):
        out += _set(f"{name}4", "ipv4_addr", "dynamic", [], "size 65536")
        out += _set(f"{name}6", "ipv6_addr", "dynamic", [], "size 65536")
    for name in ("c_synflood", "c_banned", "c_blocked", "c_bogus", "c_spoofed", "c_http_rate", "c_http_conns", "c_shield", "c_closed", "c_ssh_rate", "c_dropped", "c_out_dropped", "c_fwd_dropped", "c_tripwire"):
        out += f"\tcounter {name} {{ }}\n"

    # ---- before connection tracking: the cheapest place to refuse a packet -------------
    out += "\n\tchain early {\n\t\ttype filter hook prerouting priority raw; policy accept;\n"
    out += '\t\tiifname "lo" accept\n'
    out += "\t\tip saddr @block4 counter name c_blocked drop\n"
    out += "\t\tip6 saddr @block6 counter name c_blocked drop\n"
    out += "\t\t# Banned by the sentinel. Trusted staff addresses are never held here, even if listed.\n"
    out += "\t\tip saddr @ban4 ip saddr != @trust4 counter name c_banned drop\n"
    out += "\t\tip6 saddr @ban6 ip6 saddr != @trust6 counter name c_banned drop\n"
    out += "\t\t# Packets no honest sender makes: scanner probes and stack fingerprinting.\n"
    out += "\t\ttcp flags & (fin|syn|rst|psh|ack|urg) == 0x0 counter name c_bogus drop\n"
    out += "\t\ttcp flags & (fin|syn) == fin|syn counter name c_bogus drop\n"
    out += "\t\ttcp flags & (syn|rst) == syn|rst counter name c_bogus drop\n"
    out += "\t\ttcp flags & (fin|psh|urg) == fin|psh|urg counter name c_bogus drop\n"
    out += "\t\t# A source that could not have arrived on this interface is forged.\n"
    out += "\t\tip6 saddr :: icmpv6 type nd-neighbor-solicit accept\n"
    out += "\t\tudp sport 68 udp dport 67 accept\n"
    out += "\t\tfib saddr . iif oif missing counter name c_spoofed drop\n"
    out += "\t\t# A flood of connection attempts, usually from forged addresses. Past this many a second, new attempts are\n"
    out += "\t\t# refused here, before they cost any memory, so connections already open (a game in progress) carry on.\n"
    out += "\t\t# It also keeps the per-address limiters below from being filled with forged addresses.\n"
    out += f"\t\tfib daddr type local ip saddr != @trust4 tcp flags & (fin|syn|rst|ack) == syn limit rate over {ceiling}/second burst {ceiling * 2} packets counter name c_synflood drop\n"
    out += f"\t\tfib daddr type local ip6 saddr != @trust6 tcp flags & (fin|syn|rst|ack) == syn limit rate over {ceiling}/second burst {ceiling * 2} packets counter name c_synflood drop\n"
    out += "\t}\n"

    # ---- after tracking, before port forwarding: covers the host and the published ports
    out += "\n\tchain guard {\n\t\ttype filter hook prerouting priority -150; policy accept;\n"
    out += '\t\tiifname "lo" accept\n'
    out += "\t\tct state invalid counter name c_bogus drop\n"
    out += "\t\tct state established,related accept\n"
    out += f"\t\tfib daddr type local tcp dport {web} jump web\n"
    if cfg["DASH_ENABLED"]:
        out += f"\t\tfib daddr type local tcp dport {cfg['DASH_PORT']} jump dash\n"
    out += "\t}\n"
    if cfg["DASH_ENABLED"]:
        out += "\n\tchain dash {\n"
        if sealed:
            out += "\t\tcounter name c_closed drop\n"
        else:
            out += "\t\t# The staff dashboard: staff and administrators' addresses only, and never in a rush.\n"
            out += "\t\tip saddr != @trust4 ip saddr != @admin4 counter name c_closed drop\n"
            out += "\t\tip6 saddr != @trust6 ip6 saddr != @admin6 counter name c_closed drop\n"
            out += "\t\tct state new add @dash_rate4 { ip saddr limit rate over 60/minute burst 60 packets } counter name c_ssh_rate drop\n"
            out += "\t\tct state new add @dash_rate6 { ip6 saddr limit rate over 60/minute burst 60 packets } counter name c_ssh_rate drop\n"
        out += "\t}\n"

    out += "\n\tchain web {\n"
    if sealed:
        out += "\t\t# Not claimed yet: Ludora is not offered to anyone.\n\t\tcounter name c_closed drop\n"
    else:
        if cfg["LOCKDOWN"]:
            out += "\t\t# Lockdown: only trusted staff addresses.\n"
            out += "\t\tip saddr != @trust4 counter name c_closed drop\n"
            out += "\t\tip6 saddr != @trust6 counter name c_closed drop\n"
        elif cfg["LAN_NETS"]:
            out += "\t\t# Only the school's own networks.\n"
            out += "\t\tip saddr != @lan4 ip saddr != @trust4 counter name c_closed drop\n"
            out += "\t\tip6 saddr != @lan6 ip6 saddr != @trust6 counter name c_closed drop\n"
        out += "\t\tip saddr @trust4 accept\n\t\tip6 saddr @trust6 accept\n"
        out += "\t\tjump shield\n"
        out += "\t\t# One address may open only so many new connections a second, and hold only so many at once.\n"
        out += f"\t\tct state new add @http_rate4 {{ ip saddr limit rate over {rate}/second burst {rate * 2} packets }} counter name c_http_rate drop\n"
        out += f"\t\tct state new add @http_rate6 {{ ip6 saddr limit rate over {rate}/second burst {rate * 2} packets }} counter name c_http_rate drop\n"
        out += f"\t\tct state new add @http_conn4 {{ ip saddr ct count over {conns} }} counter name c_http_conns drop\n"
        out += f"\t\tct state new add @http_conn6 {{ ip6 saddr ct count over {conns} }} counter name c_http_conns drop\n"
    out += "\t}\n"

    out += "\n\tchain shield {\n"
    if shield and not sealed and not nat:
        out += "\t\t# Shield is up: every limit is a quarter of normal until the attack passes.\n"
        out += f"\t\tct state new add @shield_rate4 {{ ip saddr limit rate over {shield_rate}/second burst {shield_rate * 2} packets }} counter name c_shield drop\n"
        out += f"\t\tct state new add @shield_rate6 {{ ip6 saddr limit rate over {shield_rate}/second burst {shield_rate * 2} packets }} counter name c_shield drop\n"
        out += f"\t\tct state new add @shield_conn4 {{ ip saddr ct count over {shield_conns} }} counter name c_shield drop\n"
        out += f"\t\tct state new add @shield_conn6 {{ ip6 saddr ct count over {shield_conns} }} counter name c_shield drop\n"
    out += "\t}\n"

    # ---- to the server itself ------------------------------------------------------------
    out += "\n\tchain input {\n\t\ttype filter hook input priority filter; policy drop;\n"
    out += '\t\tiifname "lo" accept\n'
    out += "\t\tct state established,related accept\n"
    out += "\t\tct state invalid counter name c_bogus drop\n"
    out += "\t\ticmp type { destination-unreachable, time-exceeded, parameter-problem } accept\n"
    out += "\t\ticmp type echo-request limit rate 5/second burst 10 packets accept\n"
    out += "\t\ticmpv6 type { destination-unreachable, packet-too-big, time-exceeded, parameter-problem, nd-neighbor-solicit, nd-neighbor-advert } accept\n"
    if cfg["IPV6"]:
        out += "\t\tip6 saddr fe80::/10 ip6 hoplimit 255 icmpv6 type nd-router-advert accept\n"
        out += "\t\tip6 saddr fe80::/10 udp sport 547 udp dport 546 accept\n"
    out += "\t\ticmpv6 type echo-request limit rate 5/second burst 10 packets accept\n"
    out += "\t\tudp sport 67 udp dport 68 accept\n"
    out += f'\t\tiifname "podman*" ip saddr {{ {system.NET_INTERNAL}, {system.NET_EDGE} }} meta l4proto {{ tcp, udp }} th dport 53 accept\n'
    if not sealed:
        if cfg["DASH_ENABLED"]:
            out += "\t\t# The HTTPS proxy, and nothing else, may speak to the staff dashboard's service.\n"
            out += f'\t\tiifname "podman*" ip saddr {system.NET_EDGE} tcp dport 8760 accept\n'
        if cfg["SSH_ENABLED"]:
            out += "\t\t# SSH: only from the administrators' addresses, and slowly.\n"
            out += f"\t\ttcp dport {ssh_port} ip saddr @admin4 ct state new add @ssh_rate4 {{ ip saddr limit rate over 6/minute burst 6 packets }} counter name c_ssh_rate drop\n"
            out += f"\t\ttcp dport {ssh_port} ip6 saddr @admin6 ct state new add @ssh_rate6 {{ ip6 saddr limit rate over 6/minute burst 6 packets }} counter name c_ssh_rate drop\n"
            out += f"\t\ttcp dport {ssh_port} ip saddr @admin4 accept\n"
            out += f"\t\ttcp dport {ssh_port} ip6 saddr @admin6 accept\n"
        out += "\t\t# Tripwires: decoy ports answered by the sentinel. Completing a connection here earns a ban.\n"
        out += f"\t\ttcp dport {{ {trip_set} }} ct state new limit rate 50/second burst 100 packets counter name c_tripwire accept\n"
    out += "\t\t# The network's own chatter is dropped without a log line.\n"
    out += "\t\tmeta pkttype { broadcast, multicast } drop\n"
    out += '\t\tlimit rate 6/minute burst 10 packets log prefix "ludora-drop " level info\n'
    out += "\t\tcounter name c_dropped drop\n"
    out += "\t}\n"

    # ---- through the server, to and from its containers -----------------------------------
    edge = system.NET_EDGE
    out += "\n\tchain forward {\n\t\ttype filter hook forward priority filter - 10; policy drop;\n"
    out += "\t\tct state established,related accept\n"
    out += "\t\tct state invalid counter name c_bogus drop\n"
    out += "\t\t# Containers on the same private network talk to each other. (Only seen here on kernels that filter bridged traffic.)\n"
    out += f"\t\tip saddr {system.NET_INTERNAL} ip daddr {system.NET_INTERNAL} accept\n"
    out += f"\t\tip saddr {edge} ip daddr {edge} accept\n"
    out += f"\t\t# In: only what was published, to the proxy.\n\t\tip daddr {edge} ct status dnat tcp dport {web} accept\n"
    if cfg["DASH_ENABLED"] and not sealed:
        out += f"\t\tip daddr {edge} ct status dnat tcp dport {cfg['DASH_PORT']} accept\n"
    out += "\t\t# Out: the proxy and the app may fetch from the internet (certificates, AI drafts), never from the school's own network.\n"
    out += f"\t\tip saddr {edge} ip daddr {{ 10.0.0.0/8, 172.16.0.0/12, 192.168.0.0/16, 169.254.0.0/16, 100.64.0.0/10 }} counter name c_fwd_dropped drop\n"
    out += f"\t\tip saddr {edge} tcp dport {web} accept\n"
    out += '\t\tlimit rate 6/minute burst 10 packets log prefix "ludora-fwd-drop " level info\n'
    out += "\t\tcounter name c_fwd_dropped drop\n"
    out += "\t}\n"

    # ---- from the server itself -----------------------------------------------------------
    out += "\n\tchain output {\n\t\ttype filter hook output priority filter; policy drop;\n"
    out += '\t\toifname "lo" accept\n'
    out += "\t\tct state established,related accept\n"
    out += "\t\t# The server may ask for names, the time and web pages (updates, images, certificates, alerts). Nothing else leaves.\n"
    dns4 = _v4(cfg["DNS_SERVERS"])
    dns6 = _v6(cfg["DNS_SERVERS"])
    if dns4 or dns6:
        if dns4:
            out += f"\t\tip daddr {{ {', '.join(dns4)} }} meta l4proto {{ tcp, udp }} th dport 53 accept\n"
        if dns6:
            out += f"\t\tip6 daddr {{ {', '.join(dns6)} }} meta l4proto {{ tcp, udp }} th dport 53 accept\n"
    else:
        out += "\t\tmeta l4proto { tcp, udp } th dport 53 accept\n"
    out += "\t\tudp dport 123 accept\n"
    out += f"\t\ttcp dport {web} accept\n"
    if cfg["SMTP_HOST"] and cfg["SMTP_PORT"] not in (80, 443):
        out += "\t\t# Alert emails go out through the mail server in the settings.\n"
        out += f"\t\ttcp dport {cfg['SMTP_PORT']} accept\n"
    out += "\t\tudp sport 68 udp dport 67 accept\n"
    if cfg["IPV6"]:
        out += "\t\tudp sport 546 udp dport 547 accept\n"
    out += "\t\ticmp type { echo-request, destination-unreachable, time-exceeded, parameter-problem } accept\n"
    out += "\t\tmeta l4proto ipv6-icmp accept\n"
    out += f"\t\tip daddr {{ {system.NET_INTERNAL}, {system.NET_EDGE} }} accept\n"
    out += '\t\tlimit rate 6/minute burst 10 packets log prefix "ludora-out-drop " level info\n'
    out += "\t\tcounter name c_out_dropped drop\n"
    out += "\t}\n}\n"
    return out


def shield_rules(cfg: dict[str, Any]) -> list[list[str]]:
    """The commands that raise the shield without reloading the table (bans and counters survive)."""
    if cfg["NAT_MODE"]:
        return []
    rate = max(5, cfg["HTTP_NEW_PER_SEC"] // 4)
    conns = max(10, cfg["HTTP_MAX_CONNS"] // 4)
    base = ["nft", "add", "rule", "inet", "ludora", "shield"]
    return [
        base + ["ct", "state", "new", "add", "@shield_rate4", "{", "ip", "saddr", "limit", "rate", "over", f"{rate}/second", "burst", str(rate * 2), "packets", "}", "counter", "name", "c_shield", "drop"],
        base + ["ct", "state", "new", "add", "@shield_rate6", "{", "ip6", "saddr", "limit", "rate", "over", f"{rate}/second", "burst", str(rate * 2), "packets", "}", "counter", "name", "c_shield", "drop"],
        base + ["ct", "state", "new", "add", "@shield_conn4", "{", "ip", "saddr", "ct", "count", "over", str(conns), "}", "counter", "name", "c_shield", "drop"],
        base + ["ct", "state", "new", "add", "@shield_conn6", "{", "ip6", "saddr", "ct", "count", "over", str(conns), "}", "counter", "name", "c_shield", "drop"],
    ]


def caddyfile(cfg: dict[str, Any]) -> str:
    domain = cfg["DOMAIN"] or "localhost"
    out = HEADER
    out += "{\n\tadmin off\n"
    contact = cfg["OPERATOR_CONTACT"]
    if cfg["TLS_MODE"] == "public" and _EMAIL.match(contact):
        out += f"\temail {contact}\n"
    if domain.replace(".", "").isdigit():
        out += "\t# Browsers send no server name when the address is a number, so say which certificate to answer with.\n"
        out += f"\tdefault_sni {domain}\n"
    out += "\tservers {\n"
    out += "\t\t# A client that dribbles its request, or sends an enormous header, is cut off.\n"
    out += "\t\ttimeouts {\n\t\t\tread_header 10s\n\t\t\tread_body 60s\n\t\t\tidle 2m\n\t\t}\n"
    out += "\t\tmax_header_size 16KB\n"
    out += "\t\tprotocols h1 h2\n"
    out += "\t}\n}\n\n"
    out += f"{domain} {{\n"
    if cfg["TLS_MODE"] == "internal":
        out += "\t# This server is its own certificate authority. Install its root certificate on school devices\n"
        out += "\t# (`ludoractl tls ca` prints it) so browsers trust the padlock.\n"
        out += "\ttls internal\n"
    elif cfg["TLS_MODE"] == "custom":
        out += "\ttls /certs/site.crt /certs/site.key\n"
    out += "\tencode zstd gzip\n"
    out += "\t# Ludora's largest upload is 2 MB; nothing bigger is read.\n"
    out += "\trequest_body {\n\t\tmax_size 4MB\n\t}\n"
    out += "\theader {\n"
    out += '\t\tStrict-Transport-Security "max-age=31536000"\n'
    out += "\t\t-Server\n\t\t-Via\n"
    out += "\t}\n"
    out += "\t# A request that another website made a visitor's browser send (a hidden form, a script) is refused. Following a\n"
    out += "\t# link here from elsewhere is still fine. Browsers mark such requests themselves (Sec-Fetch-Site).\n"
    out += "\t@from_another_site {\n\t\theader Sec-Fetch-Site cross-site\n\t\tnot {\n\t\t\tmethod GET HEAD\n\t\t\theader Sec-Fetch-Mode navigate\n\t\t}\n\t}\n"
    out += "\trespond @from_another_site 403\n"
    out += "\t# One JSON line per request, to the journal: the sentinel reads it for probing and guessing. Headers are left\n"
    out += "\t# out (they hold cookies, and padding them would make a line too long to read), except the one the sentinel needs.\n"
    out += "\tlog_append fetch_site {header.Sec-Fetch-Site}\n"
    out += "\tlog {\n\t\toutput stdout\n\t\tformat filter {\n\t\t\twrap json\n\t\t\tfields {\n\t\t\t\trequest>headers delete\n\t\t\t\tresp_headers delete\n\t\t\t}\n\t\t}\n\t}\n"
    out += "\treverse_proxy ludora-app:8787\n"
    out += "}\n"
    if cfg["DASH_ENABLED"]:
        gateway = edge_gateway()
        out += f"\n# The staff dashboard, on its own port. The firewall opens that port to the staff addresses only.\n{domain}:{cfg['DASH_PORT']} {{\n"
        if cfg["TLS_MODE"] == "internal":
            out += "\ttls internal\n"
        elif cfg["TLS_MODE"] == "custom":
            out += "\ttls /certs/site.crt /certs/site.key\n"
        out += "\tencode zstd gzip\n"
        out += "\trequest_body {\n\t\tmax_size 64KB\n\t}\n"
        out += "\theader {\n\t\tStrict-Transport-Security \"max-age=31536000\"\n\t\t-Server\n\t\t-Via\n\t}\n"
        out += "\t@from_another_site {\n\t\theader Sec-Fetch-Site cross-site\n\t\tnot {\n\t\t\tmethod GET HEAD\n\t\t\theader Sec-Fetch-Mode navigate\n\t\t}\n\t}\n"
        out += "\trespond @from_another_site 403\n"
        out += "\tlog_append fetch_site {header.Sec-Fetch-Site}\n"
        out += "\tlog {\n\t\toutput stdout\n\t\tformat filter {\n\t\t\twrap json\n\t\t\tfields {\n\t\t\t\trequest>headers delete\n\t\t\t\tresp_headers delete\n\t\t\t}\n\t\t}\n\t}\n"
        out += "\t# The dashboard's service learns the visitor's address from this header, which the proxy sets itself.\n"
        out += f"\treverse_proxy {gateway}:8760 {{\n\t\theader_up X-Real-IP {{remote_host}}\n\t}}\n"
        out += "}\n"
    return out


def edge_gateway() -> str:
    """The server's own address on the proxy's network: where the proxy finds the dashboard's service."""
    import ipaddress
    return str(ipaddress.ip_network(system.NET_EDGE).network_address + 1)


def dash_env(cfg: dict[str, Any]) -> str:
    """All the staff dashboard's service is told: its own web address and the server's name. It reads no settings."""
    return HEADER + f"LUDORA_DASH_ORIGIN=https://{cfg['DOMAIN']}:{cfg['DASH_PORT']}\nLUDORA_DASH_SERVER={cfg['SERVER_NAME']}\n"


def sshd(cfg: dict[str, Any]) -> str:
    out = HEADER
    out += f"Port {cfg['SSH_PORT']}\n"
    out += f"AddressFamily {'any' if cfg['IPV6'] else 'inet'}\n"
    out += "# Keys only. No passwords, no root, no account outside the two groups below.\n"
    out += "PermitRootLogin no\n"
    out += "PasswordAuthentication no\n"
    out += "KbdInteractiveAuthentication no\n"
    out += "PermitEmptyPasswords no\n"
    out += "PubkeyAuthentication yes\n"
    out += "AuthenticationMethods publickey\n"
    out += "# Keys live where only root can write, so a stolen account cannot add its own.\n"
    out += f"AuthorizedKeysFile {system.AUTHORIZED_KEYS_DIR}/%u\n"
    out += f"AllowGroups {system.ADMIN_GROUP} {system.SUPPORT_GROUP}\n"
    out += "MaxAuthTries 3\n"
    out += "MaxSessions 4\n"
    out += "LoginGraceTime 20\n"
    out += "MaxStartups 4:50:20\n"
    out += "PerSourceMaxStartups 2\n"
    out += "# The SSH server itself holds off an address that keeps failing.\n"
    out += "PerSourcePenalties crash:90s authfail:30s noauth:10s grace-exceeded:30s max:1h min:30s\n"
    exempt = ",".join(cfg["TRUSTED_NETS"])
    if exempt:
        out += f"PerSourcePenaltyExemptList {exempt}\n"
    out += "ClientAliveInterval 300\n"
    out += "ClientAliveCountMax 2\n"
    out += "# No tunnels, no forwarding: SSH here is for administration only.\n"
    out += "AllowTcpForwarding no\n"
    out += "AllowAgentForwarding no\n"
    out += "AllowStreamLocalForwarding no\n"
    out += "X11Forwarding no\n"
    out += "PermitTunnel no\n"
    out += "GatewayPorts no\n"
    out += "PermitUserEnvironment no\n"
    out += "Banner /etc/issue.net\n"
    out += "LogLevel VERBOSE\n"
    out += "\n# Support access: a short-lived key that can run a fixed list of commands and nothing else.\n"
    out += f"Match User {system.SUPPORT_USER}\n"
    out += "\tForceCommand /usr/libexec/ludora-os/support-shell\n"
    out += "\tPermitTTY yes\n"
    out += "\tMaxSessions 1\n"
    return out


def app_env(cfg: dict[str, Any], secrets: dict[str, str]) -> str:
    """The app container's environment. Read by podman, which takes each value to the end of its line."""
    domain = cfg["DOMAIN"] or "localhost"
    lines = [
        f"DATABASE_URL=postgres://ludora:{secrets['POSTGRES_PASSWORD']}@ludora-db:5432/ludora",
        "APP_ENV=production",
        f"PUBLIC_ORIGIN=https://{domain}",
        f"IP_HASH_KEY={secrets['IP_HASH_KEY']}",
        f"OPERATOR_NAME={cfg['OPERATOR_NAME']}",
        f"OPERATOR_CONTACT={cfg['OPERATOR_CONTACT']}",
        f"SCHOOL_THEME={cfg['SCHOOL_THEME']}",
        "TRUST_PROXY=true",
        "COOKIE_SECURE=true",
        "LOG_LEVEL=info",
    ]
    if cfg["NAT_MODE"]:
        # A whole school behind one address: the app's own per-address sign-up limits are raised to match.
        lines += ["SIGNUPS_PER_10_MIN=600", "GUESTS_PER_10_MIN=600"]
    return "\n".join(lines) + "\n"


def db_env(secrets: dict[str, str]) -> str:
    return f"POSTGRES_DB=ludora\nPOSTGRES_USER=ludora\nPOSTGRES_PASSWORD={secrets['POSTGRES_PASSWORD']}\n"


_QUADLET_NOTE = "# Written by `ludoractl apply`. systemd turns this into a service (Podman Quadlet).\n"

_HARDEN = "DropCapability=all\nNoNewPrivileges=true\nReadOnly=true\nPidsLimit=512\n"


def quadlets(cfg: dict[str, Any], images: dict[str, str] | None = None) -> dict[str, str]:
    images = images or {}
    db_image = images.get("db", cfg["DB_IMAGE"])
    proxy_image = images.get("proxy", cfg["PROXY_IMAGE"])
    files: dict[str, str] = {}
    files["ludora-internal.network"] = (
        _QUADLET_NOTE + "# Database and app only. No route out of the server.\n"
        f"[Network]\nNetworkName=ludora-internal\nSubnet={system.NET_INTERNAL}\nInternal=true\n"
    )
    files["ludora-edge.network"] = (
        _QUADLET_NOTE + "# Proxy and app. The firewall decides what may leave.\n"
        f"[Network]\nNetworkName=ludora-edge\nSubnet={system.NET_EDGE}\nGateway={edge_gateway()}\n"
    )
    for volume in ("pgdata", "uploads", "caddy-data", "caddy-config"):
        files[f"ludora-{volume}.volume"] = _QUADLET_NOTE + f"[Volume]\nVolumeName=ludora-{volume}\n"
    files["ludora-db.container"] = (
        _QUADLET_NOTE
        + "[Unit]\nDescription=Ludora database (PostgreSQL)\nAfter=network-online.target\nWants=network-online.target\n\n"
        + "[Container]\nContainerName=ludora-db\n"
        + f"Image={db_image}\n"
        + "Network=ludora-internal.network\n"
        + "Volume=ludora-pgdata.volume:/var/lib/postgresql/data:Z\n"
        + f"EnvironmentFile={system.DB_ENV_FILE}\n"
        + _HARDEN
        + "# What the image's own start-up needs to hand the data directory to the postgres user, and no more.\n"
        + "AddCapability=CHOWN DAC_OVERRIDE FOWNER SETGID SETUID\n"
        + "Tmpfs=/tmp\nTmpfs=/run/postgresql\nShmSize=256m\n"
        + "HealthCmd=pg_isready -U ludora -d ludora\nHealthInterval=10s\nHealthTimeout=5s\nHealthRetries=12\nHealthStartPeriod=20s\n"
        + "Notify=healthy\n\n"
        + "[Service]\nRestart=always\nRestartSec=5\nTimeoutStartSec=300\n\n"
        + "[Install]\nWantedBy=multi-user.target\n"
    )
    files["ludora-app.container"] = (
        _QUADLET_NOTE
        + "[Unit]\nDescription=Ludora (API, realtime server and web app)\nRequires=ludora-db.service\nAfter=ludora-db.service\n\n"
        + "[Container]\nContainerName=ludora-app\n"
        + "Image=localhost/ludora:current\n"
        + "Network=ludora-internal.network\nNetwork=ludora-edge.network\n"
        + "Volume=ludora-uploads.volume:/data/uploads:Z\n"
        + f"EnvironmentFile={system.APP_ENV_FILE}\n"
        + _HARDEN
        + "Tmpfs=/tmp\n"
        + "# The health check is stated here, not left to the image: images built by Podman do not carry one.\n"
        + """HealthCmd=["node","-e","fetch('http://127.0.0.1:8787/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"]\n"""
        + "HealthInterval=15s\nHealthTimeout=5s\nHealthRetries=8\nHealthStartPeriod=40s\n"
        + "Notify=healthy\n\n"
        + "[Service]\nRestart=always\nRestartSec=5\nTimeoutStartSec=300\n\n"
        + "[Install]\nWantedBy=multi-user.target\n"
    )
    proxy = (
        _QUADLET_NOTE
        + "[Unit]\nDescription=Ludora HTTPS proxy (Caddy)\nWants=ludora-app.service\nAfter=ludora-app.service\n\n"
        + "[Container]\nContainerName=ludora-proxy\n"
        + f"Image={proxy_image}\n"
        + "Network=ludora-edge.network\n"
        + "PublishPort=80:80\nPublishPort=443:443\n"
        + (f"PublishPort={cfg['DASH_PORT']}:{cfg['DASH_PORT']}\n" if cfg["DASH_ENABLED"] else "")
        + f"Volume={system.CADDYFILE}:/etc/caddy/Caddyfile:ro,Z\n"
        + "Volume=ludora-caddy-data.volume:/data:Z\n"
        + "Volume=ludora-caddy-config.volume:/config:Z\n"
    )
    if cfg["TLS_MODE"] == "custom":
        proxy += f"Volume={system.TLS_DIR}:/certs:ro,Z\n"
    proxy += (
        _HARDEN
        + "AddCapability=NET_BIND_SERVICE\n"
        + "Tmpfs=/tmp\n\n"
        + "[Service]\nRestart=always\nRestartSec=5\nTimeoutStartSec=300\n\n"
        + "[Install]\nWantedBy=multi-user.target\n"
    )
    files["ludora-proxy.container"] = proxy
    if cfg["AI_ENABLED"] and images.get("analyst"):
        files["ludora-analyst.container"] = (
            _QUADLET_NOTE
            + "# The optional AI analyst: a decision model that gives security alerts a second opinion. It sits on the\n"
            + "# network that has no route out of the server, and is published on this machine's loopback only.\n"
            + "[Unit]\nDescription=Ludora OS analyst (a small AI model; advice only)\nAfter=network-online.target\n\n"
            + "[Container]\nContainerName=ludora-analyst\n"
            + f"Image={images['analyst']}\n"
            + "Network=ludora-internal.network\n"
            + f"PublishPort=127.0.0.1:{cfg['AI_PORT']}:8000\n"
            + "Volume=/var/lib/ludora-os/analyst/model:/model:ro,Z\n"
            + _HARDEN
            + "Tmpfs=/tmp\n"
            + "# It must never crowd out the game: little processor share, and a hard ceiling on memory.\n"
            + "PodmanArgs=--memory=3g --cpu-shares=256\n\n"
            + "[Service]\nRestart=always\nRestartSec=10\nTimeoutStartSec=300\nNice=10\n\n"
            + "[Install]\nWantedBy=multi-user.target\n"
        )
    return files


def dnf_automatic(cfg: dict[str, Any]) -> str:
    out = HEADER
    out += "[commands]\n# Every update Rocky Linux publishes for this release, installed each night.\nupgrade_type = default\nrandom_sleep = 0\ndownload_updates = yes\napply_updates = yes\n"
    if cfg["AUTO_REBOOT"]:
        out += "# A kernel or library fix only protects after a restart: restart, five minutes after warning anyone signed in.\n"
        out += "reboot = when-needed\nreboot_command = \"shutdown -r +5 'Ludora OS is restarting to finish security updates'\"\n"
    else:
        out += "reboot = never\n"
    out += "\n[emitters]\nemit_via = stdio\n\n[base]\ndebuglevel = 1\n"
    return out


def issue(name: str, address: str, state: str, detail: str) -> str:
    """What the server's own screen shows before anyone signs in. No secrets, nothing an onlooker can use."""
    return (
        "\n"
        "  Ludora OS\n"
        f"  {name}   {address}\n"
        f"  {state}{(': ' + detail) if detail else ''}\n"
        "\n"
        "  Sign in as ludora-admin, then type: ludora\n"
        "\n"
    )
