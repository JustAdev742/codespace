#!/usr/bin/env python3
"""Prospect list builder for SIL providers.

Input: one or more CSVs (any columns; recognises name, phone, email, website, suburb, state, source)
collected from directories (Provider Link, MyCareSpace, Clickability, Google Maps exports, Housing Hub, referrals).
Output: data/prospects.csv (deduplicated, normalised) + data/verify-worklist.csv for manual checks
against the NDIS Commission Provider Register (registered for group 0138? -> exclude; 0115 only -> gap segment).

Usage: tools/prospects.py add source1.csv [source2.csv ...]
       tools/prospects.py mark --name "X" --status registered_0138|unregistered|registered_0115|out_of_scope|no_contact
       tools/prospects.py stats
"""
import argparse, csv, os, re, sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(ROOT, "data", "prospects.csv")
FIELDS = ["name", "phone", "email", "website", "suburb", "state", "source", "status", "notes"]
ALIASES = {"name": ["name", "provider", "business", "organisation", "organization", "title"],
           "phone": ["phone", "mobile", "tel", "telephone"], "email": ["email", "e-mail"],
           "website": ["website", "url", "web"], "suburb": ["suburb", "city", "locality"],
           "state": ["state", "region"], "source": ["source"]}

def norm_phone(p):
    d = re.sub(r"\D", "", p or "")
    if d.startswith("61"): d = "0" + d[2:]
    return d

def key(r):
    return (re.sub(r"[^a-z0-9]", "", (r["name"] or "").lower())[:40], norm_phone(r["phone"]))

def load():
    if not os.path.exists(OUT): return {}
    rows = list(csv.DictReader(open(OUT, encoding="utf-8")))
    return {key(r): r for r in rows}

def save(d):
    os.makedirs(os.path.dirname(OUT), exist_ok=True)
    with open(OUT, "w", newline="", encoding="utf-8") as f:
        w = csv.DictWriter(f, FIELDS); w.writeheader()
        for r in sorted(d.values(), key=lambda r: (r["state"], r["name"])): w.writerow(r)
    work = [r for r in d.values() if r["status"] in ("", "unverified")]
    with open(os.path.join(ROOT, "data", "verify-worklist.csv"), "w", newline="", encoding="utf-8") as f:
        w = csv.DictWriter(f, FIELDS + ["register_check_url"]); w.writeheader()
        for r in work:
            w.writerow({**r, "register_check_url": "https://www.ndiscommission.gov.au/provider-registration/find-registered-provider"})

def cmd_add(a):
    d = load(); added = 0
    for path in a.files:
        for row in csv.DictReader(open(path, encoding="utf-8-sig")):
            low = {k.lower().strip(): (v or "").strip() for k, v in row.items() if k}
            r = {f: "" for f in FIELDS}
            for f, names in ALIASES.items():
                for n in names:
                    if n in low and low[n]: r[f] = low[n]; break
            r["source"] = r["source"] or os.path.basename(path)
            r["status"] = "unverified"
            if not r["name"]: continue
            k = key(r)
            if k in d:
                for f in FIELDS:
                    if not d[k].get(f) and r[f]: d[k][f] = r[f]
            else:
                d[k] = r; added += 1
    save(d); print(f"added {added}; total {len(d)}")

def cmd_mark(a):
    d = load()
    for k, r in d.items():
        if r["name"].lower() == a.name.lower():
            r["status"] = a.status; r["notes"] = (r["notes"] + " " + (a.note or "")).strip(); save(d); print("ok"); return
    sys.exit("not found")

def cmd_stats(a):
    d = load(); from collections import Counter
    print(Counter(r["status"] for r in d.values())); print(Counter(r["state"] for r in d.values()))

if __name__ == "__main__":
    ap = argparse.ArgumentParser(); sub = ap.add_subparsers(dest="cmd", required=True)
    s = sub.add_parser("add"); s.add_argument("files", nargs="+")
    s = sub.add_parser("mark"); s.add_argument("--name", required=True); s.add_argument("--status", required=True, choices=["registered_0138", "unregistered", "registered_0115", "out_of_scope", "no_contact", "unverified"]); s.add_argument("--note")
    sub.add_parser("stats")
    a = ap.parse_args(); {"add": cmd_add, "mark": cmd_mark, "stats": cmd_stats}[a.cmd](a)
