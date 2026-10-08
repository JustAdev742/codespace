#!/usr/bin/env python3
"""Audit the e-bike listings in data/catalogue.json: one row per bike, UNKNOWN where the listing is silent.

Every value is read from the listing's own name or description, and reports/bikes-evidence.json keeps
the words each one came from so it can be checked. Nothing is inferred. The one calculation, battery
watt-hours as volts x amp-hours, sits in its own column labelled as calculated and never fills the
stated-Wh column.

    python3 scripts/audit_catalogue.py [--catalogue data/catalogue.json] [--sitemap sitemap.xml]

Writes reports/bikes.csv, reports/bikes-evidence.json, reports/catalogue-summary.json and, with
--sitemap, reports/stale-sitemap-urls.txt.
"""
import argparse
import csv
import html
import json
import os
import re
import urllib.request

U = 'UNKNOWN'
BIKE_CATEGORIES = {'New E-Bikes', 'Cyberbikes', 'Mamba', 'Mono', 'Vamos', 'DiroDi', 'Fatboy', 'Eunorau',
                   'Lagads', 'NCM', 'CRUZR'}
BRANDS = ['Cyberbikes', 'CRUZR', 'NCM', 'Eunorau', 'Vamos', 'DiroDi', 'Mamba', 'Mono', 'Fatboy', 'Lagads']
# A listing outside every bike category still counts as a bike when its name says so and it costs a bike's price.
LOOKS_LIKE_BIKE = re.compile(r'electric (bike|bicycle|trike|mtb)|e-?bike\b|\bebike\b|e-?trike', re.I)
# Listings explain the EPAC rules ("e-bike law limits road bikes to 250W ... 25km/h"); those figures are not the bike's.
LAW = re.compile(r'\blaws?\b|\bregulations?\b', re.I)
BOILERPLATE = re.compile(r'Online price = Bike-in-Box\..*?assembly is included in the price\.', re.I | re.S)


def plain(description):
    """Description HTML as text; paragraph and list breaks become ' | ' so a match never runs across them."""
    t = re.sub(r'</(p|li|h\d|div|tr)>|<br\s*/?>', ' | ', description or '', flags=re.I)
    return re.sub(r'\s+', ' ', html.unescape(re.sub(r'<[^>]+>', ' ', t))).strip()


class Reader:
    """Finds values in one listing's text and remembers where each came from."""

    def __init__(self, name, text):
        self.text = f'{name} | {text}'
        self.evidence = {}

    def _snip(self, m):
        s, e = max(0, m.start() - 45), min(len(self.text), m.end() + 45)
        return ('…' if s else '') + self.text[s:e] + ('…' if e < len(self.text) else '')

    def _before(self, m, width):
        """Up to `width` characters before a match, never reaching back past a ' | ' break."""
        return self.text[max(0, m.start() - width):m.start()].rsplit(' | ', 1)[-1]

    def _after(self, m, width):
        return self.text[m.end():m.end() + width].split(' | ', 1)[0]

    def _about_the_law(self, m):
        """True when the match sits in a sentence about the law ("e-bike law limits bikes to 250W"), not this bike."""
        start = max(self.text.rfind(b, 0, m.start()) for b in ('. ', ' | ', '; ', '! ', '? '))
        ends = [i for i in (self.text.find(b, m.end()) for b in ('. ', ' | ', '; ', '! ', '? ')) if i >= 0]
        return bool(LAW.search(self.text[start + 1:min(ends) if ends else len(self.text)]))

    def first(self, field, pattern, fmt=lambda m: m.group(1), skip=None, skip_after=None):
        for m in re.finditer(pattern, self.text, re.I):
            if skip and re.search(skip, self._before(m, 25), re.I):
                continue
            if skip_after and re.search(skip_after, self._after(m, 20), re.I):
                continue
            if self._about_the_law(m):
                continue
            self.evidence[field] = {'value': fmt(m), 'evidence': self._snip(m)}
            return fmt(m)
        return U

    def every(self, field, pattern, fmt=lambda m: m.group(1), keep=lambda v: True, skip=None, skip_after=None):
        values, snips = [], []
        for m in re.finditer(pattern, self.text, re.I):
            if skip and re.search(skip, self._before(m, 25), re.I):
                continue
            if skip_after and re.search(skip_after, self._after(m, 20), re.I):
                continue
            if self._about_the_law(m):
                continue
            v = fmt(m)
            if keep(v) and v not in values:
                values.append(v)
                snips.append(self._snip(m))
        if not values:
            return U
        joined = ' / '.join(values)
        self.evidence[field] = {'value': joined, 'evidence': snips[:3]}
        return joined


def audit_bike(p, shown, cat_names):
    desc = plain(p.get('short_description'))
    has_boilerplate = bool(re.search(r'bike[- ]in[- ]box', desc, re.I))  # the notice has several wordings
    body = BOILERPLATE.sub('', desc).strip(' |')
    r = Reader(p['name'], body)
    num = r'(?<![\d.])'

    brand = next((b for b in BRANDS if b in shown), None) or \
        next((b for b in BRANDS if re.search(rf'\b{b}\b', p['name'], re.I)), U)
    # Some rent-to-own listings do not say so in the name: their price is the weekly instalment and only
    # the description explains the plan. No bike here sells for under $600, so that price plus a
    # rent-to-own plan in the description marks a payment plan, not a bike for sale.
    listing = 'rent-to-own' if re.search(r'rent[- ]to[- ]own', p['name'], re.I) or \
        (p['price']['low'] < 600 and re.search(r'rent[- ]to[- ]own', desc, re.I)) else \
        'deposit' if re.search(r'\bdeposit\b', p['name'], re.I) else 'bike'

    # "4,000W" and "5,000W" too: the thousands separator is dropped from the value.
    watts = r.every('motor_power_w', num + r'(\d,\d{3}|\d{3,4})\s*w(?:atts?)?\b', fmt=lambda m: m.group(1).replace(',', ''),
                    keep=lambda v: 100 <= int(v) <= 8000, skip=r'peak[\w\s]{0,12}$', skip_after=r'^\W{0,3}peak')
    peak = r.first('motor_peak_w', num + r'(\d{3,4})\s*w(?:atts?)?\s*\)?\s*peak|peak[^|;]{0,12}?' + num + r'(\d{3,4})\s*w\b',
                   fmt=lambda m: m.group(1) or m.group(2))
    motor_type = r.every('motor_type', r'\b(mid[- ]?drive|rear[- ]hub|front[- ]hub|hub)\b(?:\s*(?:drive|motor))?',
                         fmt=lambda m: m.group(1).lower().replace(' ', '-'))
    motor_brand = r.every('motor_brand', r'\b(Bafang|Das-?Kit|Ananda|Shimano Steps|Bosch|MXUS|Aikema|Dapu|Yamaha|Brose|TQ)\b')
    volts = r.every('battery_v', num + r'(\d{2})\s*v\b', keep=lambda v: 24 <= int(v) <= 84)
    amp_hours = r.every('battery_ah', num + r'(\d{1,2}(?:\.\d)?)\s*ah\b')
    wh = r.every('battery_wh', num + r'(\d{3,4}(?:\.\d+)?)\s*wh\b')
    cells = r.first('battery_cells', r'\b(Samsung|LG|Panasonic|Molicel|Sony)\b')
    rng = r.every('range_km', r'(?:range|up to|distance|travel)[^|;]{0,40}?' + num + r'(\d{2,3}(?:\s*(?:[-–~]|to)\s*\d{2,3})?)\s*\+?\s*(?:km|kilomet(?:er|re)s?)(?!\s*/?\s*h)'
                  r'|' + num + r'(\d{2,3}(?:\s*(?:[-–~]|to)\s*\d{2,3})?)\s*\+?\s*(?:km|kilomet(?:er|re)s?)(?!\s*/?\s*h)[^|;]{0,25}range',
                  fmt=lambda m: re.sub(r'\s*(?:[-–~]|to)\s*', '–', (m.group(1) or m.group(2)).strip()))
    speed = r.every('top_speed_kmh', num + r'(\d{2})\s*(?:km\s*/?\s*h|kph|km per hour)\b', keep=lambda v: int(v) >= 15)
    # "Bike weight: 26 kg" yes; "rider weight", "battery weight", "max weight" no.
    weight = r.first('weight_kg', r'\b(?:weight|weighs|weighing)\b[^|;]{0,20}?' + num + r'(\d{2}(?:\.\d)?)\s*kg'
                     r'|' + num + r'(\d{2}(?:\.\d)?)\s*kg[^|;]{0,12}(?:bike |net |total )?weight',
                     fmt=lambda m: m.group(1) or m.group(2),
                     skip=r'(rider|battery|max(?:imum)?|load|carry(?:ing)?|rack|payload|user)\s*$')
    payload = r.first('payload_kg', r'(?:max(?:imum)?\.?\s*(?:load|payload|rider(?: weight)?)|payload|load capacity|carrying capacity)'
                      r'[^|;]{0,25}?' + num + r'(\d{2,3})\s*kg|' + num + r'(\d{3})\s*kg\s*(?:max(?:imum)?\.?\s*)?(?:load|payload|capacity)',
                      fmt=lambda m: m.group(1) or m.group(2))
    brakes = r.first('brakes', r'((?:\d-piston\s+)?(?:hydraulic|mechanical|cable)(?:[^|;,.]{0,25}?disc)?\s*brakes?|disc\s*brakes?)',
                     fmt=lambda m: re.sub(r'\s+', ' ', m.group(1)).strip())
    suspension = r.every('suspension', r'\b(full[- ]suspension|dual[- ]suspension|front (?:and|&) rear suspension|'
                                       r'front[\w\s-]{0,25}?suspension|suspension fork|front fork|rear[\w\s-]{0,20}?(?:shock|suspension)|hardtail|rigid fork)\b',
                         fmt=lambda m: re.sub(r'^(front|rear)\b.*?(suspension|shock)$', r'\1 \2', m.group(1).lower()))
    if suspension == U:
        suspension = r.first('suspension', r'\b(suspension)\b', fmt=lambda m: 'suspension, type not stated',
                             skip=r'(no|without|seat\s*post)\s*$', skip_after=r'^\s*seat')
    # "Frame size: 20″" is not a wheel.
    wheel = r.every('wheel_in', num + r'((?:1[2-9]|2[0-9])(?:\.5)?)\s*(?:"|”|″|-?inch(?:es)?\b|in\b)|' + num +
                    r'((?:1[2-9]|2[0-9])(?:\.5)?)\s*[x×]\s*\d(?:\.\d+)?|\b(700\s*c)\b',
                    fmt=lambda m: (m.group(1) or m.group(2) or m.group(3)).replace(' ', ''),
                    skip=r'(frame|size|height|seat)[\w\s:]{0,8}$')
    gears = r.first('drivetrain', r'((?:Shimano|SRAM|microSHIFT|Sunrace)?[^|;,.]{0,15}?\b\d{1,2}[- ]speed|single[- ]speed|belt drive)',
                    fmt=lambda m: re.sub(r'\s+', ' ', m.group(1)).strip())
    # Frame and intended use come from the listing name, or from explicit "... frame" / "fat tyres"
    # wording; descriptions mention "folding" pedals and "cargo" racks too often to trust loose words.
    norm = lambda s: s.lower().replace(' ', '-').replace('tire', 'tyre').replace('foldable', 'folding').rstrip('s')
    frame_words = r'step[- ]?thr(?:ough|u)|step[- ]over|fat[- ]ty?i?re?s?|folding|foldable|cargo|trike|tandem|compact'
    frame = ' / '.join(dict.fromkeys(norm(w) for w in re.findall(rf'\b({frame_words})\b', p['name'], re.I))) or \
        r.every('frame_type', rf'\b({frame_words})\s+(?:aluminium\s+|alloy\s+|steel\s+)?frame\b|\b(fat[- ]ty?i?res)\b',
                fmt=lambda m: norm(m.group(1) or m.group(2)))
    use = ' / '.join(dict.fromkeys(m.lower() for m in re.findall(
        r'\b(commuter|mtb|mountain|trekking|cruiser|hybrid|all[- ]rounder|off[- ]road|urban|touring|kids?|cargo)\b', p['name'], re.I))) or U
    n_ = r'(\d{1,2}|one|two|three|four|five|six|ten|twelve|eighteen|twenty-four)'
    warranty = r.first('warranty', n_ + r'[- ]?(year|yr|month)s?[^|;.]{0,25}warrant|warrant[^|;.]{0,35}?' + n_ + r'[- ]?(year|yr|month)s?|(lifetime) warrant',
                       fmt=lambda m: (f'{m.group(1)} {m.group(2)}' if m.group(1) else f'{m.group(3)} {m.group(4)}' if m.group(3) else 'lifetime').lower())
    charge = r.first('charge_time', r'(\d(?:\.\d)?(?:\s*[-–]\s*\d(?:\.\d)?)?)\s*(?:h|hrs?|hours)\b[^|;.]{0,20}charg|'
                                    r'charg[^|;.]{0,30}?(\d(?:\.\d)?(?:\s*[-–]\s*\d(?:\.\d)?)?)\s*(?:h|hrs?|hours)\b',
                     fmt=lambda m: (m.group(1) or m.group(2)).replace(' ', '') + ' h')
    en15194 = 'stated' if re.search(r'EN\s*15194', r.text, re.I) else U
    road_claim = r.first('road_legal_claim', r'([^|;.]{0,40}road[- ]legal[^|;.]{0,40})', fmt=lambda m: m.group(1).strip())

    calc_wh = U
    if volts != U and amp_hours != U and '/' not in volts and '/' not in amp_hours:
        calc_wh = str(round(int(volts) * float(amp_hours)))

    images = (p.get('images') or {}).get('data', [])
    widths = [i.get('width') or 0 for i in images]
    key = {'motor power': watts, 'battery voltage': volts, 'battery Ah': amp_hours, 'battery Wh (stated)': wh,
           'range': rng, 'top speed': speed, 'weight': weight, 'brakes': brakes, 'suspension': suspension,
           'wheel size': wheel, 'drivetrain': gears, 'frame type': frame, 'warranty': warranty}
    known = [k for k, v in key.items() if v != U]
    price = p['price']
    return {
        'id': p['id'],
        'brand': brand,
        'listing_name': p['name'],
        'listing_type': listing,
        'url': 'https://www.cyberbikes.com/' + p.get('site_link', ''),
        'price_aud': price.get('low'),
        'regular_price_aud': price.get('regular_low') if p.get('on_sale') else '',
        'on_sale': p.get('on_sale'),
        'shown_in_categories': ' / '.join(shown) or 'NONE (unpublished category)' if p.get('categoryIds') else ' / '.join(shown) or 'NONE',
        'visibility': p.get('visibility'),
        'stock': 'out of stock' if p['badges'].get('out_of_stock') else 'low stock' if p['badges'].get('low_stock') else 'in stock',
        'stock_tracking': 'on' if (p.get('inventory') or {}).get('enabled') else 'off',
        'options': '; '.join(f"{o['name']}: {', '.join(o.get('choice_order') or [])}" for o in (p.get('options') or {}).get('data', [])) or '',
        'motor_type': motor_type, 'motor_brand': motor_brand, 'motor_power_w': watts, 'motor_peak_w': peak,
        'battery_v': volts, 'battery_ah': amp_hours, 'battery_wh_stated': wh, 'battery_wh_calculated_v_x_ah': calc_wh,
        'battery_cells': cells, 'range_km_claimed': rng, 'top_speed_kmh': speed, 'weight_kg': weight, 'payload_kg': payload,
        'brakes': brakes, 'suspension': suspension, 'wheel_in': wheel, 'drivetrain': gears, 'frame_type': frame or U,
        'intended_use_from_name': use, 'warranty': warranty, 'charge_time': charge, 'en15194': en15194, 'road_legal_claim': road_claim,
        'description_chars': len(body), 'online_price_notice': 'yes' if has_boilerplate else 'no',
        'description_quality': 'missing' if len(body) < 40 else 'thin' if len(body) < 400 else 'adequate' if len(body) < 1500 else 'detailed',
        'images': len(images), 'smallest_image_px': min(widths) if widths else 0,
        'image_quality': 'none' if not images else 'low-res' if min(widths) < 800 else 'single image' if len(images) == 1 else 'ok',
        'spec_fields_known': f'{len(known)}/{len(key)}',
        'spec_fields_missing': ', '.join(k for k in key if key[k] == U),
        '_evidence': r.evidence,
    }


def main():
    here = os.path.dirname(os.path.abspath(__file__))
    root = os.path.join(here, '..')
    parser = argparse.ArgumentParser(description=__doc__.split('\n')[0])
    parser.add_argument('--catalogue', default=os.path.join(root, 'data', 'catalogue.json'))
    parser.add_argument('--sitemap', help='sitemap.xml path or URL, to list sitemap entries for deleted products')
    parser.add_argument('--out', default=os.path.join(root, 'reports'))
    args = parser.parse_args()

    cat = json.load(open(args.catalogue))
    shown_in = cat['shown_in']
    cat_names = {c['id']: c['name'] for c in cat['categories']}
    bikes = []
    for p in cat['products']:
        shown = shown_in.get(p['id'], [])
        bike_like = LOOKS_LIKE_BIKE.search(p['name']) or re.search(r'rent[- ]to[- ]own|\bdeposit\b', p['name'], re.I)
        if set(shown) & BIKE_CATEGORIES or (not shown and bike_like and
                                             (p['price']['low'] >= 600 or re.search(r'rent[- ]to[- ]own|\bdeposit\b', p['name'], re.I))):
            bikes.append(audit_bike(p, [s for s in shown], cat_names))
    bikes.sort(key=lambda b: (b['brand'], b['listing_name']))

    os.makedirs(args.out, exist_ok=True)
    cols = [k for k in bikes[0] if not k.startswith('_')]
    with open(os.path.join(args.out, 'bikes.csv'), 'w', newline='') as f:
        w = csv.DictWriter(f, fieldnames=cols)
        w.writeheader()
        for b in bikes:
            w.writerow({k: b[k] for k in cols})
    json.dump({b['id']: {'name': b['listing_name'], 'fields': b['_evidence']} for b in bikes},
              open(os.path.join(args.out, 'bikes-evidence.json'), 'w'), indent=1, ensure_ascii=False)

    real = [b for b in bikes if b['listing_type'] == 'bike']
    n = len(real)
    pct = lambda k: round(100 * sum(1 for b in real if k(b)) / n)
    stale = []
    if args.sitemap:
        src = args.sitemap
        xml = urllib.request.urlopen(src).read().decode() if src.startswith('http') else open(src).read()
        live = {p['id'] for p in cat['products']} | {str(p.get('site_product_id')) for p in cat['products']}
        stale = [u for u in re.findall(r'<loc>([^<]+)</loc>', xml) if '/product/' in u and u.rstrip('/').rsplit('/', 1)[1] not in live]
        open(os.path.join(args.out, 'stale-sitemap-urls.txt'), 'w').write('\n'.join(stale) + '\n')
    summary = {
        'fetched_at': cat['fetched_at'],
        'products': len(cat['products']),
        'e_bike_listings': len(bikes),
        'by_listing_type': {t: sum(1 for b in bikes if b['listing_type'] == t) for t in ('bike', 'rent-to-own', 'deposit')},
        'bikes_hidden_from_category_browsing': [b['listing_name'] for b in real if b['shown_in_categories'].startswith('NONE')],
        'percent_of_bikes': {
            'all 13 key specs stated': pct(lambda b: b['spec_fields_missing'] == ''),
            'battery capacity unknown (no Wh, and not both V and Ah)': pct(lambda b: b['battery_wh_stated'] == U and U in (b['battery_v'], b['battery_ah'])),
            'battery Wh not stated': pct(lambda b: b['battery_wh_stated'] == U),
            'weight missing': pct(lambda b: b['weight_kg'] == U),
            'range missing': pct(lambda b: b['range_km_claimed'] == U),
            'warranty missing': pct(lambda b: b['warranty'] == U),
            'top speed missing': pct(lambda b: b['top_speed_kmh'] == U),
            'suspension missing': pct(lambda b: b['suspension'] == U),
            'brakes missing': pct(lambda b: b['brakes'] == U),
            'EN 15194 not stated': pct(lambda b: b['en15194'] == U),
            'thin or missing description': pct(lambda b: b['description_quality'] in ('missing', 'thin')),
            'on sale': pct(lambda b: b['on_sale']),
        },
        'stale_sitemap_product_urls': len(stale),
    }
    json.dump(summary, open(os.path.join(args.out, 'catalogue-summary.json'), 'w'), indent=1)
    print(json.dumps(summary, indent=1))


if __name__ == '__main__':
    main()
