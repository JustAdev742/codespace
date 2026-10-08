#!/usr/bin/env python3
"""Write preview/data/products.json: the bikes as the live store API would return them once the
drafted Specifications blocks are pasted into Square.

Takes the products from data/catalogue.json that the bike categories actually show (the same set
the components fetch live), and appends each bike's draft block from reports/spec-blocks.json to
its description. Nothing else changes. Local only: the output stays out of git.

    python3 scripts/build_preview_data.py
"""
import json
import os

BIKE_CATEGORIES = {'New E-Bikes', 'Cyberbikes', 'Mamba', 'Mono', 'Vamos', 'DiroDi', 'Eunorau', 'Lagads', 'NCM', 'CRUZR'}


def main():
    root = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..')
    cat = json.load(open(os.path.join(root, 'data', 'catalogue.json')))
    drafts = json.load(open(os.path.join(root, 'reports', 'spec-blocks.json')))
    shown = cat['shown_in']
    out = []
    for p in cat['products']:
        if not set(shown.get(p['id'], [])) & BIKE_CATEGORIES:
            continue
        p = dict(p)
        if p['id'] in drafts:
            p['short_description'] = (p.get('short_description') or '') + drafts[p['id']]['block_html']
        out.append(p)
    os.makedirs(os.path.join(root, 'preview', 'data'), exist_ok=True)
    path = os.path.join(root, 'preview', 'data', 'products.json')
    json.dump(out, open(path, 'w'))
    with_block = sum(1 for p in out if p['id'] in drafts)
    print(f'{len(out)} products ({with_block} with a drafted block) -> {os.path.relpath(path)}')


if __name__ == '__main__':
    main()
