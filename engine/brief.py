#!/usr/bin/env python3
"""Staff briefing pack: one page per policy from rendered Markdown-equivalent content.

Reads the same content/policies templates, renders them with the intake, and extracts the
Roles and responsibilities, Procedure and Records kept sections into a single DOCX
'Staff briefing pack' so workers can explain what they must do and where they record it.

Usage: engine/brief.py --intake data/clients/x/intake.json --out build/x/STAFF-BRIEFING-PACK.docx
"""
import argparse, datetime, json, os, re, sys
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from render import make_env, load_docs, md_to_docx  # noqa: E402
from docx import Document  # noqa: E402

SECTIONS = ("Roles and responsibilities", "Procedure", "Records kept")

def extract(text):
    out = {}
    parts = re.split(r"^## +", text, flags=re.M)
    for p in parts[1:]:
        head, _, body = p.partition("\n")
        for s in SECTIONS:
            if head.strip().lower().startswith(s.lower()):
                out[s] = body.strip()
    return out

def main():
    ap = argparse.ArgumentParser(); ap.add_argument("--intake", required=True); ap.add_argument("--out", required=True)
    a = ap.parse_args()
    intake = json.load(open(a.intake, encoding="utf-8"))
    ctx = {"intake": intake, "org": intake["org"], "today": datetime.date.today().isoformat()}
    env = make_env(); md = [f"# Staff briefing pack — {intake['org']['name']}", "",
                            f"Generated {ctx['today']}. One page per policy: what you must do, and where you record it. Read with the full policy.", ""]
    n = 0
    for meta, body in load_docs():
        if meta.get("doc_type") not in ("policy", "procedure", "plan", "agreement"):
            continue
        try:
            if env.from_string("{{ (" + str(meta.get("applies_if", "true")) + ") }}").render(**ctx).strip().lower() != "true":
                continue
            text = env.from_string(body).render(**ctx)
        except Exception as e:  # template errors are reported by render.py; skip here
            print(f"skip {meta['slug']}: {e}"); continue
        sec = extract(text)
        if not sec:
            continue
        n += 1
        md.append(f"## {meta.get('title', meta['slug'])}")
        for s in SECTIONS:
            if s in sec:
                md.append(f"### {s}"); md.append(sec[s]); md.append("")
    os.makedirs(os.path.dirname(a.out) or ".", exist_ok=True)
    md_to_docx("\n".join(md), intake["org"]["name"], "Staff briefing pack").save(a.out)
    print(f"briefing pack: {n} policies → {a.out}")

if __name__ == "__main__":
    main()
