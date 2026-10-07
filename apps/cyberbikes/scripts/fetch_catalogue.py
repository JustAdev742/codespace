#!/usr/bin/env python3
"""Download the Cyberbikes catalogue into data/catalogue.json.

Uses Square Online's store API, the same read-only endpoints the storefront calls from every
visitor's browser, so it needs no credentials. It records each product, the published categories,
which products each category actually shows (a category's own product_count also counts deleted
products, so it cannot be trusted), and the store locations.

    python3 scripts/fetch_catalogue.py [--out data/catalogue.json]
"""
import argparse
import json
import os
import time
import urllib.request
from datetime import datetime, timezone

USER_ID = '142918621'
SITE_ID = '483401922371572548'
API = f'https://cdn5.editmysite.com/app/store/api/v28/editor/users/{USER_ID}/sites/{SITE_ID}'
PAUSE = 0.5  # seconds between requests


def get(path):
    with urllib.request.urlopen(API + path, timeout=60) as res:
        data = json.load(res)
    time.sleep(PAUSE)
    return data


def all_pages(path, per_page=100):
    items, page = [], 1
    while True:
        sep = '&' if '?' in path else '?'
        data = get(f'{path}{sep}page={page}&per_page={per_page}')
        items += data.get('data', [])
        pages = data.get('meta', {}).get('pagination', {}).get('total_pages', 1)
        if page >= pages:
            return items
        page += 1


def main():
    here = os.path.dirname(os.path.abspath(__file__))
    parser = argparse.ArgumentParser(description=__doc__.split('\n')[0])
    parser.add_argument('--out', default=os.path.join(here, '..', 'data', 'catalogue.json'))
    args = parser.parse_args()

    products = all_pages('/products?include=images,media_files,discounts,categories,options,variations')
    categories = all_pages('/categories')
    shown = {}
    for cat in categories:
        for p in all_pages(f"/products?categories[]={cat['id']}", per_page=200):
            shown.setdefault(p['id'], []).append(cat['name'])
    locations = get('/store-locations?page=1&per_page=100&include=address').get('data', [])

    os.makedirs(os.path.dirname(os.path.abspath(args.out)), exist_ok=True)
    with open(args.out, 'w') as f:
        json.dump({
            'fetched_at': datetime.now(timezone.utc).isoformat(timespec='seconds'),
            'products': products,
            'categories': categories,
            'shown_in': shown,
            'locations': locations,
        }, f)
    print(f'{len(products)} products, {len(categories)} categories -> {os.path.relpath(args.out)}')


if __name__ == '__main__':
    main()
