#!/usr/bin/env python3
"""Funnel + revenue tracker. Only real, verified events go in here.

Usage:
  tools/funnel.py lead   --name "Acme SIL" --channel fb-group --note "..."
  tools/funnel.py stage  --name "Acme SIL" --stage contacted|conversation|call|proposal
  tools/funnel.py paid   --name "Acme SIL" --amount 2490 --offer "SIL Registration Sprint" --channel email --ref "stripe_pi_..."
  tools/funnel.py set    --offer "..." --channel "..." --hypothesis "..."
  tools/funnel.py render
"""
import argparse, json, os, sys, datetime

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DATA = os.path.join(ROOT, "data", "funnel.json")
DASH = os.path.join(ROOT, "docs", "DASHBOARD.md")
TARGET = 32500
STAGES = ["lead", "contacted", "conversation", "call", "proposal", "paid"]
MILESTONES = [(100, "prove someone will pay"),
              (1000, "identify what is generating the first meaningful revenue"),
              (5000, "concentrate on the strongest strategy"),
              (10000, "improve repeatability and delivery"),
              (25000, "optimise the best acquisition and sales systems"),
              (32500, "mission achieved")]

def load():
    if not os.path.exists(DATA):
        return {"prospects": {}, "payments": [], "meta": {"offer": "TBD", "channel": "TBD", "hypothesis": "TBD"}}
    with open(DATA) as f:
        return json.load(f)

def save(d):
    os.makedirs(os.path.dirname(DATA), exist_ok=True)
    with open(DATA, "w") as f:
        json.dump(d, f, indent=2, sort_keys=True)

def today():
    return datetime.date.today().isoformat()

def cmd_lead(d, a):
    p = d["prospects"].setdefault(a.name, {"stage": "lead", "channel": a.channel, "history": []})
    p["history"].append({"date": today(), "event": "lead", "note": a.note or ""})
    save(d)

def cmd_stage(d, a):
    if a.name not in d["prospects"]:
        sys.exit(f"unknown prospect {a.name!r}; add with `lead` first")
    p = d["prospects"][a.name]
    if STAGES.index(a.stage) > STAGES.index(p["stage"]):
        p["stage"] = a.stage
    p["history"].append({"date": today(), "event": a.stage, "note": a.note or ""})
    save(d)

def cmd_paid(d, a):
    if not a.ref:
        sys.exit("a payment needs --ref (Stripe payment id, bank reference or invoice number)")
    p = d["prospects"].setdefault(a.name, {"stage": "lead", "channel": a.channel, "history": []})
    p["stage"] = "paid"
    p["history"].append({"date": today(), "event": "paid", "note": f"A${a.amount:.2f} {a.ref}"})
    d["payments"].append({"date": today(), "customer": a.name, "amount": float(a.amount),
                          "offer": a.offer, "channel": a.channel, "ref": a.ref})
    save(d)

def cmd_set(d, a):
    for k in ("offer", "channel", "hypothesis"):
        v = getattr(a, k)
        if v:
            d["meta"][k] = v
    save(d)

def render(d):
    revenue = sum(p["amount"] for p in d["payments"])
    customers = len({p["customer"] for p in d["payments"]})
    avg = revenue / customers if customers else 0.0
    counts = {s: 0 for s in STAGES}
    for p in d["prospects"].values():
        # cumulative: a prospect at stage N counts in every stage <= N
        for s in STAGES[: STAGES.index(p["stage"]) + 1]:
            counts[s] += 1
    by_channel = {}
    for p in d["payments"]:
        by_channel[p["channel"]] = by_channel.get(p["channel"], 0) + p["amount"]
    best = max(by_channel, key=by_channel.get) if by_channel else d["meta"]["channel"]
    lines = ["# Revenue Dashboard", "",
             "| Metric | Value |", "|---|---|",
             f"| Target | A${TARGET:,.0f} |",
             f"| Revenue (received, verified) | A${revenue:,.2f} |",
             f"| Remaining | A${max(TARGET - revenue, 0):,.2f} |",
             f"| Customers (paid) | {customers} |",
             f"| Average revenue / customer | A${avg:,.2f} |",
             f"| Current offer | {d['meta']['offer']} |",
             f"| Best acquisition channel | {best} |",
             f"| Current hypothesis | {d['meta']['hypothesis']} |",
             f"| Last updated | {today()} |", "", "## Milestones"]
    for amt, label in MILESTONES:
        lines.append(f"- [{'x' if revenue >= amt else ' '}] A${amt:,} — {label}")
    lines += ["", "## Funnel (cumulative, actuals only)", "| Stage | Count |", "|---|---|",
              f"| Leads (prospects listed) | {counts['lead']} |",
              f"| Contacted | {counts['contacted']} |",
              f"| Conversations | {counts['conversation']} |",
              f"| Demos / calls | {counts['call']} |",
              f"| Proposals sent | {counts['proposal']} |",
              f"| Conversions (paid) | {counts['paid']} |",
              f"| Revenue | A${revenue:,.2f} |", ""]
    if by_channel:
        lines += ["## Revenue by channel", "| Channel | Revenue |", "|---|---|"]
        lines += [f"| {c} | A${v:,.2f} |" for c, v in sorted(by_channel.items(), key=lambda x: -x[1])]
        lines.append("")
    if d["payments"]:
        lines += ["## Payments (verified)", "| Date | Customer | Amount | Offer | Channel | Ref |", "|---|---|---|---|---|---|"]
        # public repo: show a customer code (initials + index), never the name or the payment reference
        codes = {}
        for p in d["payments"]:
            codes.setdefault(p["customer"], f"C{len(codes)+1:02d}")
        lines += [f"| {p['date']} | {codes[p['customer']]} | A${p['amount']:,.2f} | {p['offer']} | {p['channel']} | recorded |" for p in d["payments"]]
        lines.append("")
    lines.append("Rules: only real, verified numbers go here. No projections in this table.")
    with open(DASH, "w") as f:
        f.write("\n".join(lines) + "\n")
    print(open(DASH).read())

def main():
    ap = argparse.ArgumentParser()
    sub = ap.add_subparsers(dest="cmd", required=True)
    s = sub.add_parser("lead"); s.add_argument("--name", required=True); s.add_argument("--channel", required=True); s.add_argument("--note")
    s = sub.add_parser("stage"); s.add_argument("--name", required=True); s.add_argument("--stage", required=True, choices=STAGES[1:-1]); s.add_argument("--note")
    s = sub.add_parser("paid"); s.add_argument("--name", required=True); s.add_argument("--amount", required=True, type=float); s.add_argument("--offer", required=True); s.add_argument("--channel", required=True); s.add_argument("--ref", required=True)
    s = sub.add_parser("set"); s.add_argument("--offer"); s.add_argument("--channel"); s.add_argument("--hypothesis")
    sub.add_parser("render")
    a = ap.parse_args()
    d = load()
    {"lead": cmd_lead, "stage": cmd_stage, "paid": cmd_paid, "set": cmd_set, "render": lambda d, a: None}[a.cmd](d, a)
    render(load())

if __name__ == "__main__":
    main()
