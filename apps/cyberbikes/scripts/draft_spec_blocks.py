#!/usr/bin/env python3
"""Draft the standard Specifications block for every bike from what its listing already says.

Reads reports/bikes.csv and reports/bikes-evidence.json (scripts/audit_catalogue.py) and writes:

  reports/spec-blocks.md    per bike: a block ready to paste at the end of its Square description,
                            the values to settle first (with the listing's own words) and the
                            fields to get from the manufacturer
  reports/spec-blocks.json  the same, for the local preview

Only single, stated values go into a block. When a listing states two different values, or a value
the script cannot read cleanly, the field stays out of the block and is listed for the owner to
decide. Nothing is estimated: watt-hours are never calculated into a block, and warranty, road use
and compliance claims are always left for the owner to confirm in their own words.

    python3 scripts/draft_spec_blocks.py [--reports reports]
"""
import argparse
import csv
import html
import json
import os
import re

U = 'UNKNOWN'
# Same order and labels as SPEC_FIELDS in src/specs.js; tests/fields.test.mjs checks they match.
FIELDS = ['Type', 'Motor', 'Rated power', 'Peak power', 'Battery', 'Battery cells', 'Range', 'Top speed', 'Weight',
          'Max load', 'Frame', 'Wheels', 'Brakes', 'Suspension', 'Gears', 'Charging time', 'Warranty', 'Standard',
          'Road use']
# What to ask the manufacturer for, in the order that matters most to buyers (catalogue audit, P1).
PRIORITY = ['Battery', 'Weight', 'Range', 'Warranty', 'Brakes', 'Suspension', 'Top speed', 'Rated power', 'Type',
            'Max load', 'Wheels', 'Frame', 'Gears', 'Motor', 'Charging time', 'Peak power', 'Battery cells']
CHECK = object()  # a stated value the owner must settle before it goes in
# The same rule the site applies (src/specs.js): a range that needs an optional or second battery.
EXTRA_BATTERY = re.compile(r'\b(?:dual|double|twin|two|three|second(?:ary)?|extra|optional|spare|additional|both)\b[^.;|]{0,30}?'
                           r'\bbatter(?:y|ies)\b|\bbatteries\b|\boptional\b|\d\s*v\s*/?\s*\d+(?:\.\d+)?\s*ah\s*\+|'
                           r'\bwith\s*\d{2}\s*V\s*\d', re.I)
# A range quoted at a set speed ("120 km (under 25 km/h)") only holds under that condition.
RANGE_CONDITION = re.compile(r'(?:\b(?:under|below|at)|@)\s*\d+\s*(?:mph|kph|km\s*/?\s*h)', re.I)
KM_FIGURE = re.compile(r'\d{2,3}\s*\+?\s*(?:km|kilomet)(?!\s*/?\s*h)', re.I)


def values(cell):
    return [] if cell in ('', U) else [v.strip() for v in cell.split(' / ')]


def single(cell, unit=''):
    vs = values(cell)
    if not vs:
        return None
    if len({v.lower() for v in vs}) > 1:
        return CHECK
    return f'{vs[0]} {unit}'.strip() if unit else vs[0]


def tidy_case(s):
    """BAFANG -> Bafang, SAMSUNG -> Samsung; leaves LG, Das-Kit and mixed case alone."""
    return s.capitalize() if s.isupper() and len(s) > 3 else s


def motor(b):
    brands = list(dict.fromkeys(tidy_case(v) for v in values(b['motor_brand'])))
    kinds = values(b['motor_type'])
    if 'hub' in kinds and any(k.endswith('-hub') for k in kinds):
        kinds.remove('hub')  # "rear hub" and "hub" are the same statement
    if len(brands) > 1 or len(kinds) > 1:
        return CHECK
    kind = {'rear-hub': 'rear hub', 'front-hub': 'front hub'}.get(kinds[0], kinds[0]) if kinds else ''
    text = ' '.join(x for x in (brands[0] if brands else '', kind) if x)
    return text[:1].upper() + text[1:] if text else None


def battery(b):
    v, ah, wh = (single(b[k]) for k in ('battery_v', 'battery_ah', 'battery_wh_stated'))
    if CHECK in (v, ah, wh):
        return CHECK
    if v and ah and wh and abs(float(v) * float(ah) - float(wh)) > 0.05 * float(wh):
        return CHECK  # the stated watt-hours do not match the stated volts and amp-hours
    parts = ' '.join(x for x in (v and f'{v} V', ah and f'{ah} Ah') if x)
    if wh:
        return f'{parts} ({wh} Wh)' if parts else f'{wh} Wh'
    return parts or None


def brakes(b):
    v = single(b['brakes'])
    if v in (None, CHECK):
        return v
    v = re.sub(r'\s*brakes?$', '', v.lower()).strip()
    return v[:1].upper() + v[1:]


def suspension(b):
    vs = {v.lower().replace('-', ' ') for v in values(b['suspension'])}
    if not vs:
        return None
    if vs & {'full suspension', 'dual suspension', 'front and rear suspension', 'front & rear suspension'} or \
            ({'front suspension', 'rear shock'} <= vs) or ({'front suspension', 'rear suspension'} <= vs):
        return 'Full suspension (front and rear)'
    if vs == {'front suspension'}:
        return 'Front suspension'
    if vs == {'rigid fork'}:
        return 'None (rigid fork)'
    return CHECK  # "front fork" may be rigid; "suspension" alone does not say where


def wheels(b):
    v = single(b['wheel_in'])
    fat = 'fat-tyre' in b['frame_type']
    if v is CHECK:
        return CHECK
    if v is None:
        return 'Fat tyres' if fat else None
    size = v if v.lower().endswith('c') else f'{v} in'
    return f'{size}, fat tyres' if fat else size


def gears(b):
    v = single(b['drivetrain'])
    if v in (None, CHECK):
        return v
    m = re.search(r'\b((?:Shimano|SRAM|microSHIFT|Sunrace)(?:\s+[A-Z][a-z]+)?\s+)?(\d{1,2})[- ]speed\b', v, re.I)
    if m and not re.search(r'maximum speed|top speed', v, re.I):
        return f"{(m.group(1) or '').strip()} {m.group(2)}-speed".strip()
    if re.fullmatch(r'single[- ]speed|belt drive', v, re.I):
        return v.capitalize()
    return CHECK


def type_and_frame(b):
    kinds = values(b['frame_type'])
    frame = [k for k in kinds if k in ('step-through', 'step-over', 'folding', 'compact')]
    kind = [k for k in kinds if k in ('cargo', 'trike', 'tandem')] + \
        [u for u in values(b['intended_use_from_name']) if u not in ('cargo',)]
    if 'fat-tyre' in kinds:
        kind.insert(0, 'fat-tyre')
    t = ', '.join(dict.fromkeys('MTB' if k == 'mtb' else k for k in kind))
    f = ', '.join(frame)
    return (t[:1].upper() + t[1:]) if t else None, (f[:1].upper() + f[1:]) if f else None


def charge(b):
    v = single(b['charge_time'])
    return v if v in (None, CHECK) else v.replace('-', '–')


def range_clauses(evidence):
    """The words around each quoted range figure: the field it sits in, not the fields beside it."""
    quoted = evidence.get('range_km', {}).get('evidence') or []
    quoted = quoted if isinstance(quoted, list) else [quoted]
    return [part.strip(' …') for q in quoted for part in re.split(r'[|;]', q) if KM_FIGURE.search(part)]


def range_value(b, clauses):
    v = single(b['range_km_claimed'])
    if v in (None, CHECK):
        return v
    # "Up to 180 km" stays "up to": it is the most the supplier claims, not a typical figure.
    first = re.match(r'[\d.]+', v).group(0)
    up_to = any(re.search(r'\bup\s*to\s*' + re.escape(first) + r'(?![\d.])', c, re.I) for c in clauses)
    return f'{"up to " if up_to else ""}{v} km'


def draft(b, evidence):
    kind, frame = type_and_frame(b)
    clauses = range_clauses(evidence)
    block = {
        'Type': kind,
        'Motor': motor(b),
        'Rated power': single(b['motor_power_w'], 'W'),
        'Peak power': single(b['motor_peak_w'], 'W'),
        'Battery': battery(b),
        'Battery cells': single(tidy_case(b['battery_cells'])) if b['battery_cells'] != U else None,
        'Range': range_value(b, clauses),
        'Top speed': single(b['top_speed_kmh'], 'km/h'),
        'Weight': single(b['weight_kg'], 'kg'),
        'Max load': single(b['payload_kg'], 'kg'),
        'Frame': frame,
        'Wheels': wheels(b),
        'Brakes': brakes(b),
        'Suspension': suspension(b),
        'Gears': gears(b),
        'Charging time': charge(b),
        # Promises and legal status are the owner's to word, so these never go in on their own.
        'Warranty': CHECK if b['warranty'] != U else None,
        'Standard': 'EN 15194' if b['en15194'] == 'stated' else None,
        'Road use': CHECK if b['road_legal_claim'] != U else None,
    }
    # Why each held-back value was held back; anything not listed here had more than one value.
    reasons = {
        'Warranty': 'Warranty terms are a promise: write them in full (frame, motor, battery) from the supplier terms.',
        'Road use': 'The listing says something about road use. That wording is yours to decide.',
        'Suspension': 'The listing does not say clearly whether the fork is a suspension fork, or where the suspension is.',
    }
    if b['options'] and re.search(r'motor\s*power|power', b['options'], re.I) and block['Rated power']:
        block['Rated power'] = CHECK
        reasons['Rated power'] = 'Power is sold as an option, so the listing has more than one figure.'
    if block['Battery'] is CHECK and all(len(values(b[k])) <= 1 for k in ('battery_v', 'battery_ah', 'battery_wh_stated')):
        reasons['Battery'] = 'The stated watt-hours do not match the stated volts × amp-hours.'
    range_said = ' '.join(clauses)
    if block['Range'] not in (None, CHECK) and EXTRA_BATTERY.search(range_said):
        block['Range'] = CHECK
        reasons['Range'] = ('The range quoted needs an optional extra battery. Give the range with the battery supplied, '
                            'and put the extended figure on its own line, e.g. "Range: 60 km" and "Range with the optional '
                            'second battery: 110 km".')
    elif block['Range'] not in (None, CHECK) and RANGE_CONDITION.search(range_said):
        block['Range'] = CHECK
        reasons['Range'] = ('The range is quoted at a set speed. Keep the condition in brackets after the figure, e.g. '
                            '"Range: 120 km (under 25 km/h)".')

    source = {'Motor': ['motor_brand', 'motor_type'], 'Rated power': ['motor_power_w'], 'Peak power': ['motor_peak_w'],
              'Battery': ['battery_v', 'battery_ah', 'battery_wh'], 'Battery cells': ['battery_cells'],
              'Range': ['range_km'], 'Top speed': ['top_speed_kmh'], 'Weight': ['weight_kg'],
              'Max load': ['payload_kg'], 'Wheels': ['wheel_in'], 'Brakes': ['brakes'], 'Suspension': ['suspension'],
              'Gears': ['drivetrain'], 'Charging time': ['charge_time'], 'Warranty': ['warranty'],
              'Road use': ['road_legal_claim'], 'Type': ['frame_type'], 'Frame': ['frame_type']}
    settle = []
    for label, value in block.items():
        if value is not CHECK:
            continue
        said = []
        for col in source.get(label, []):
            ev = evidence.get(col, {}).get('evidence')
            said += ev if isinstance(ev, list) else [ev] if ev else []
        why = reasons.get(label, 'The listing states more than one value, or one that could not be read cleanly: '
                                 'decide which is right for this bike.')
        settle.append({'field': label, 'why': why, 'listing_says': said[:3]})
    if b['options'] and re.search(r'motor\s*power|power', b['options'], re.I):
        settle.append({'field': 'Type', 'why': 'Sold with a motor power option. Say which power suits road use and '
                       'which is for private land, in your own wording.', 'listing_says': [b['options']]})
    if block['Standard']:
        settle.append({'field': 'Standard', 'why': 'The listing mentions EN 15194. Keep it only if you hold the '
                       "supplier's compliance documents for this model.", 'listing_says': []})
    lines = [(label, value) for label, value in block.items() if value not in (None, CHECK)]
    missing = [f for f in PRIORITY if block.get(f) is None and f not in ('Standard', 'Road use')]
    return lines, settle, missing


def block_text(lines):
    return 'Specifications\n' + '\n'.join(f'{label}: {value}' for label, value in lines)


def block_html(lines):
    items = ''.join(f'<li><strong>{html.escape(label)}:</strong> {html.escape(value)}</li>' for label, value in lines)
    return f'<p><strong>Specifications</strong></p><ul>{items}</ul>'


def main():
    here = os.path.dirname(os.path.abspath(__file__))
    parser = argparse.ArgumentParser(description=__doc__.split('\n')[0])
    parser.add_argument('--reports', default=os.path.join(here, '..', 'reports'))
    parser.add_argument('--print-fields', action='store_true', help='print the field labels as JSON and exit')
    args = parser.parse_args()
    if args.print_fields:
        print(json.dumps(FIELDS))
        return

    bikes = list(csv.DictReader(open(os.path.join(args.reports, 'bikes.csv'))))
    evidence = json.load(open(os.path.join(args.reports, 'bikes-evidence.json')))
    out, md = {}, []
    stated_before = stated_after = 0
    for b in bikes:
        if b['listing_type'] != 'bike':
            continue
        lines, settle, missing = draft(b, evidence.get(b['id'], {}).get('fields', {}))
        out[b['id']] = {'name': b['listing_name'], 'url': b['url'], 'block_text': block_text(lines),
                        'block_html': block_html(lines), 'settle': settle, 'missing': missing}
        stated_after += len(lines)
        stated_before += int(b['spec_fields_known'].split('/')[0])
        md.append(f"## {b['listing_name']}\n\n[Listing]({b['url']}) · {len(lines)} of {len(FIELDS)} fields drafted\n")
        md.append('```text\n' + block_text(lines) + '\n```\n')
        if settle:
            md.append('**Settle before pasting**\n')
            for s in settle:
                quote = ''.join(f'\n  > {q}' for q in s['listing_says'])
                md.append(f"- **{s['field']}**: {s['why']}{quote}")
            md.append('')
        if missing:
            md.append(f"**Ask the manufacturer for**: {', '.join(missing)}\n")

    n = len(out)
    head = [
        '# Specification blocks: drafts for review\n',
        f'{n} bikes. Each block holds only what the current listing already states, reworded into the standard '
        'format. Read each one against the listing, settle the flagged fields, then paste the block at the end of '
        "the product's description in Square (Items → the item → Description). A bulleted list or one line per "
        'field both work.\n',
        'Fields left out are shown on the site as "Not listed". Add them as the manufacturer confirms them; never '
        'estimate. If a supplier gives a range figure for a specific test (rider weight, assist level), put the '
        'condition in brackets after the number, e.g. `Range: 60 km (PAS 1, 75 kg rider)`. A range that needs an '
        'optional battery goes on its own line, e.g. `Range with the optional second battery: 110 km`, so the '
        'standard range still compares.\n',
    ]
    open(os.path.join(args.reports, 'spec-blocks.md'), 'w').write('\n'.join(head + md) + '\n')
    json.dump(out, open(os.path.join(args.reports, 'spec-blocks.json'), 'w'), indent=1, ensure_ascii=False)
    print(f'{n} drafts -> {os.path.relpath(os.path.join(args.reports, "spec-blocks.md"))}; '
          f'{sum(len(o["settle"]) for o in out.values())} values to settle')


if __name__ == '__main__':
    main()
