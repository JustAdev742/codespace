#!/usr/bin/env python3
"""Builds the Ludora presentation (a .pptx) from content.py and the screenshots filmed from the app.

    python3 build_deck.py [out.pptx]

Pictures come from the film's capture folder: stills/<name>.png, footage frames
(frame:<clip>:<n>) and rendered film frames (film:<name>). A missing picture becomes a labelled
grey box, so the deck still builds and it is obvious what to shoot.
"""
import os, re, sys, glob
from pptx import Presentation
from pptx.util import Inches, Pt, Emu
from pptx.dml.color import RGBColor
from pptx.enum.shapes import MSO_SHAPE
from pptx.enum.text import PP_ALIGN, MSO_ANCHOR
from pptx.oxml.ns import qn
from lxml import etree
from PIL import Image

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from content import SLIDES, MODES_2D, MODES_3D, QUESTION_TYPES, SITE  # noqa: E402

MEDIA = os.environ.get('FILM_OUT', '/tmp/claude-0/-home-user/97a5c84e-6d10-5253-ab94-c316a24e49f4/scratchpad/film')
WORK = os.path.join(MEDIA, 'deck')
OUT = sys.argv[1] if len(sys.argv) > 1 else os.path.join(MEDIA, 'out', 'Ludora.pptx')
DOCS = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', '..', 'docs', 'features')
os.makedirs(os.path.join(WORK, 'img'), exist_ok=True)
os.makedirs(os.path.dirname(OUT), exist_ok=True)

# The app's own colours.
NIGHT, NIGHT2, CARD, LINE = '0B1020', '131A4A', '171E4E', '303A86'
INK, SOFT, MUTE, GOLD, GOLD_DEEP = 'FFFFFF', 'D3DAFF', '9AA5DE', 'FFC233', 'E9A400'
SKY, MINT, CORAL, VIOLET = '4DD6FF', '7CF29A', 'FF6B81', 'B68CFF'
HEAD, BODY = 'Arial', 'Calibri'
W, H = 13.333, 7.5
MX = 0.6  # side margin


def rgb(hexstr):
    return RGBColor.from_string(hexstr)


prs = Presentation()
prs.slide_width, prs.slide_height = Inches(W), Inches(H)
BLANK = prs.slide_layouts[6]
missing = []


# ------------------------------------------------------------------ pictures

def picture_path(name):
    """Resolves a picture name to a JPEG no wider than 1920 px (made once, kept in the work folder)."""
    if name is None:
        return None
    if name.startswith('frame:'):
        _, clip, n = name.split(':')
        src = os.path.join(MEDIA, 'footage', clip, f'{int(n):05d}.jpg')
    elif name.startswith('film:'):
        src = os.path.join(MEDIA, 'deck', f'film-{name[5:]}.jpg')
    elif name == 'make-notes-typed':
        src = os.path.join(MEDIA, 'footage', 'make-notes', '00098.jpg')
    else:
        src = os.path.join(MEDIA, 'stills', name + '.png')
    if not os.path.exists(src):
        missing.append(name)
        return None
    out = os.path.join(WORK, 'img', re.sub(r'[^a-z0-9]+', '-', name.lower()) + '.jpg')
    if not os.path.exists(out) or os.path.getmtime(out) < os.path.getmtime(src):
        im = Image.open(src).convert('RGB')
        if im.width > 1920:
            im = im.resize((1920, round(im.height * 1920 / im.width)), Image.LANCZOS)
        im.save(out, quality=90)
    return out


def pic(slide, name, x, y, w, h, radius=0.045, border=LINE, anchor='center', phone=False):
    """A picture that fills its box (cropped to fit), with rounded corners and a thin edge."""
    path = picture_path(name)
    if path is None:
        box = card(slide, x, y, w, h, fill='20264F', line='5560B0')
        text(slide, x, y + h / 2 - 0.2, w, 0.4, f'[{name}]', 11, color=MUTE, align='center')
        return box
    im = Image.open(path)
    p = slide.shapes.add_picture(path, Inches(x), Inches(y), Inches(w), Inches(h))
    box, src = w / h, im.width / im.height
    if src > box:  # too wide: trim the sides
        cut = (1 - box / src)
        p.crop_left, p.crop_right = (cut / 2, cut / 2) if anchor == 'center' else (0, cut) if anchor == 'left' else (cut, 0)
    elif src < box:  # too tall: trim top and bottom
        cut = (1 - src / box)
        p.crop_top, p.crop_bottom = (cut / 2, cut / 2) if anchor == 'center' else (0, cut) if anchor == 'top' else (cut, 0)
    p.auto_shape_type = MSO_SHAPE.ROUNDED_RECTANGLE
    # The corner size is a fraction of the shorter side, in hundred-thousandths.
    geom = p._element.spPr.find(qn('a:prstGeom'))
    av = geom.find(qn('a:avLst'))
    if av is None:
        av = etree.SubElement(geom, qn('a:avLst'))
    for old in list(av):
        av.remove(old)
    gd = etree.SubElement(av, qn('a:gd'))
    gd.set('name', 'adj')
    gd.set('fmla', f'val {int(min(0.5, 0.13 if phone else radius * max(w, h) / min(w, h)) * 100000)}')
    p.line.color.rgb = rgb('05060F' if phone else border)
    p.line.width = Pt(5 if phone else 1.25)
    return p


# ------------------------------------------------------------------ shapes and text

def background(slide, a=NIGHT, b=NIGHT2):
    fill = slide.background.fill
    fill.gradient()
    fill.gradient_angle = 50
    stops = fill.gradient_stops
    stops[0].color.rgb, stops[0].position = rgb(a), 0
    stops[1].color.rgb, stops[1].position = rgb(b), 1


def card(slide, x, y, w, h, fill=CARD, line=LINE, radius=0.08, shape=MSO_SHAPE.ROUNDED_RECTANGLE):
    s = slide.shapes.add_shape(shape, Inches(x), Inches(y), Inches(w), Inches(h))
    s.fill.solid()
    s.fill.fore_color.rgb = rgb(fill)
    if line:
        s.line.color.rgb = rgb(line)
        s.line.width = Pt(1)
    else:
        s.line.fill.background()
    s.shadow.inherit = False
    if shape == MSO_SHAPE.ROUNDED_RECTANGLE:
        s.adjustments[0] = min(0.5, radius * (max(w, h) / min(w, h)) if w >= h else radius)
    s.text_frame.text = ''
    return s


def text(slide, x, y, w, h, value, size, color=INK, bold=False, italic=False, font=BODY, align='left', anchor='top', spacing=None, line=None):
    """A text box with no inner padding. `value` is a string, or a list of runs/paragraphs (see below)."""
    tb = slide.shapes.add_textbox(Inches(x), Inches(y), Inches(w), Inches(h))
    tf = tb.text_frame
    tf.word_wrap = True
    tf.margin_left = tf.margin_right = tf.margin_top = tf.margin_bottom = 0
    tf.vertical_anchor = {'top': MSO_ANCHOR.TOP, 'middle': MSO_ANCHOR.MIDDLE, 'bottom': MSO_ANCHOR.BOTTOM}[anchor]
    paras = value if isinstance(value, list) else [value]
    for i, para in enumerate(paras):
        p = tf.paragraphs[0] if i == 0 else tf.add_paragraph()
        p.alignment = {'left': PP_ALIGN.LEFT, 'center': PP_ALIGN.CENTER, 'right': PP_ALIGN.RIGHT}[align]
        if spacing is not None:
            p.space_after = Pt(spacing)
        if line is not None:
            p.line_spacing = line
        runs = para if isinstance(para, list) else [para]
        for run in runs:
            opts = {}
            if isinstance(run, tuple):
                run, opts = run
            r = p.add_run()
            r.text = run
            f = r.font
            f.name = opts.get('font', font)
            f.size = Pt(opts.get('size', size))
            f.bold = opts.get('bold', bold)
            f.italic = opts.get('italic', italic)
            f.color.rgb = rgb(opts.get('color', color))
    return tb


def bullets(slide, x, y, w, h, items, size=17, color=SOFT, gap=9, dot=GOLD):
    """A real bulleted list (gold dots), one paragraph an item. An item may be (bold lead, rest)."""
    tb = slide.shapes.add_textbox(Inches(x), Inches(y), Inches(w), Inches(h))
    tf = tb.text_frame
    tf.word_wrap = True
    tf.margin_left = tf.margin_right = tf.margin_top = tf.margin_bottom = 0
    for i, item in enumerate(items):
        p = tf.paragraphs[0] if i == 0 else tf.add_paragraph()
        p.space_after = Pt(gap)
        lead, rest = item if isinstance(item, tuple) else (None, item)
        if lead:
            r = p.add_run(); r.text = lead + ' '
            r.font.name, r.font.size, r.font.bold, r.font.color.rgb = BODY, Pt(size), True, rgb(INK)
        r = p.add_run(); r.text = rest
        r.font.name, r.font.size, r.font.color.rgb = BODY, Pt(size), rgb(color)
        pPr = p._p.get_or_add_pPr()
        indent = Inches(0.26 * size / 17)
        pPr.set('marL', str(indent)); pPr.set('indent', str(-indent))
        for tag, attrs, child in (('a:buClr', {}, ('a:srgbClr', {'val': dot})), ('a:buFont', {'typeface': 'Arial'}, None), ('a:buChar', {'char': '•'}, None)):
            el = etree.SubElement(pPr, qn(tag))
            for k, v in attrs.items():
                el.set(k, v)
            if child:
                c = etree.SubElement(el, qn(child[0]))
                for k, v in child[1].items():
                    c.set(k, v)
            pPr.remove(el)
            pPr.insert_element_before(el, 'a:tabLst', 'a:defRPr', 'a:extLst')
    return tb


def title(slide, value, y=0.55, size=38, w=W - 2 * MX, color=INK):
    return text(slide, MX, y, w, 1.0, value, size, color=color, bold=True, italic=True, font=HEAD, anchor='top')


def chrome(slide, n, total):
    """The mark in the corner, and the slide's number."""
    mark = card(slide, MX, H - 0.52, 0.24, 0.28, fill=GOLD, line=None, radius=0.22)
    mark.rotation = 0
    text(slide, MX, H - 0.52, 0.24, 0.28, 'L', 13, color=NIGHT, bold=True, font=HEAD, align='center', anchor='middle')
    text(slide, MX + 0.34, H - 0.52, 2.0, 0.28, 'Ludora', 12, color=MUTE, bold=True, italic=True, font=HEAD, anchor='middle')
    text(slide, W - MX - 1.2, H - 0.52, 1.2, 0.28, f'{n} / {total}', 11, color=MUTE, align='right', anchor='middle')


def foot(slide, value, y=H - 1.18):
    text(slide, MX, y, W - 2 * MX, 0.5, value, 13.5, color=MUTE, italic=True)


def notes(slide, spec):
    body = spec.get('say', '')
    if spec.get('do'):
        body += f"\n\nDO: {spec['do']}"
    if spec.get('secs'):
        body += f"\n\nAbout {spec['secs']} seconds."
    slide.notes_slide.notes_text_frame.text = body


# ------------------------------------------------------------------ the layouts

def s_title(slide, s):
    pic(slide, s['image'], 0, 0, W, H, radius=0, border=NIGHT)
    veil = card(slide, 0, 0, W, H, fill='05071A', line=None, shape=MSO_SHAPE.RECTANGLE)
    set_alpha(veil, 38)
    panel = card(slide, MX, 4.55, 7.4, 2.3, fill='0B1020', line='39439A', radius=0.07)
    set_alpha(panel, 86)
    tile = card(slide, MX + 0.4, 4.95, 1.15, 1.35, fill=GOLD, line=None, radius=0.2)
    text(slide, MX + 0.4, 4.95, 1.15, 1.35, 'L', 66, color=NIGHT, bold=True, font=HEAD, align='center', anchor='middle')
    text(slide, MX + 1.85, 4.78, 5.4, 1.2, s['title'], 72, bold=True, italic=True, font=HEAD, anchor='middle')
    text(slide, MX + 1.9, 5.95, 5.4, 0.6, s['sub'], 24, color=GOLD, bold=True, italic=True, font=HEAD)


def set_alpha(shape, percent):
    """Makes a shape's fill see-through (percent opaque)."""
    fill = shape.fill._xPr.find(qn('a:solidFill'))
    clr = fill[0]
    for old in clr.findall(qn('a:alpha')):
        clr.remove(old)
    a = etree.SubElement(clr, qn('a:alpha'))
    a.set('val', str(int(percent * 1000)))


def s_idea(slide, s):
    title(slide, s['title'], size=44)
    y = 1.95
    for i, (head, body) in enumerate(s['points']):
        num = card(slide, MX, y + 0.05, 0.62, 0.62, fill=GOLD, line=None, shape=MSO_SHAPE.OVAL)
        text(slide, MX, y + 0.05, 0.62, 0.62, str(i + 1), 22, color=NIGHT, bold=True, font=HEAD, align='center', anchor='middle')
        text(slide, MX + 0.9, y, 5.0, 0.45, head, 23, bold=True, font=HEAD)
        text(slide, MX + 0.9, y + 0.48, 5.0, 0.95, body, 16, color=SOFT)
        y += 1.55
    pic(slide, s['image'], 7.0, 1.75, 5.2, 2.925)
    pic(slide, s['phone'], 10.75, 2.5, 1.95, 4.22, phone=True)
    text(slide, 7.0, 4.82, 3.6, 0.9, 'The big screen shows the question. Every student answers on their own device.', 13.5, color=MUTE, italic=True)


def s_steps(slide, s):
    title(slide, s['title'])
    n = len(s['steps'])
    gap = 0.4
    cw = (W - 2 * MX - gap * (n - 1)) / n
    has_img = any(st[3] for st in s['steps'])
    top = 1.75
    for i, (num, head, body, image) in enumerate(s['steps']):
        x = MX + i * (cw + gap)
        ch = 4.6 if has_img else 3.3
        card(slide, x, top, cw, ch)
        yy = top + 0.3
        if has_img:
            pic(slide, image, x + 0.25, top + 0.25, cw - 0.5, (cw - 0.5) * 9 / 16, radius=0.04)
            yy = top + 0.25 + (cw - 0.5) * 9 / 16 + 0.3
        badge = card(slide, x + 0.3, yy, 0.62, 0.62, fill=GOLD, line=None, shape=MSO_SHAPE.OVAL)
        text(slide, x + 0.3, yy, 0.62, 0.62, num, 22, color=NIGHT, bold=True, font=HEAD, align='center', anchor='middle')
        text(slide, x + 1.1, yy + 0.03, cw - 1.4, 0.6, head, 22, bold=True, font=HEAD, anchor='middle')
        text(slide, x + 0.3, yy + 0.85, cw - 0.6, 1.4, body, 16, color=SOFT)
    if s.get('foot'):
        foot(slide, s['foot'], y=top + (4.6 if has_img else 3.3) + 0.35)


def s_grid4(slide, s):
    title(slide, s['title'])
    gw, gh, gap = 3.55, 3.55 * 9 / 16, 0.3
    for i, (image, cap) in enumerate(s['images']):
        x = MX + (i % 2) * (gw + gap)
        y = 1.7 + (i // 2) * (gh + 0.62)
        pic(slide, image, x, y, gw, gh)
        text(slide, x, y + gh + 0.08, gw, 0.4, cap, 13, color=MUTE)
    bullets(slide, 8.45, 1.85, W - 8.45 - MX, 4.6, s['points'], size=18, gap=14)


def s_modes(slide, s):
    title(slide, s['title'])
    text(slide, MX, 1.55, 2.2, 1.5, '30', 110, color=GOLD, bold=True, italic=True, font=HEAD)
    text(slide, MX + 2.35, 1.95, 2.6, 1.0, ['game', 'modes'], 30, bold=True, italic=True, font=HEAD, line=0.9)
    pic(slide, s['image'], 7.05, 1.55, 5.68, 3.195)
    text(slide, 7.05, 4.85, 5.68, 0.4, 'Every mode has its own illustrated cover, rules and variants: 130 variants in all.', 13, color=MUTE, italic=True)
    card(slide, MX, 3.55, 6.1, 3.25)
    names = MODES_2D + MODES_3D
    cols = 3
    per = (len(names) + cols - 1) // cols
    for c in range(cols):
        chunk = names[c * per:(c + 1) * per]
        runs = []
        for nme in chunk:
            runs.append([(nme, {'color': INK, 'bold': False})] + ([('  3D', {'color': GOLD, 'bold': True, 'size': 9.5})] if nme in MODES_3D else []))
        text(slide, MX + 0.28 + c * 1.95, 3.75, 1.9, 2.9, runs, 12.5, color=INK, spacing=2.5)
    text(slide, 7.05, 5.45, 5.68, 1.3, [[('Races. ', {'bold': True, 'color': INK}), 'Team games the class wins or loses together. '], [('Bingo, memory, tug of war. ', {'bold': True, 'color': INK}), 'A boss fight. A night market.'], [('Self-paced or teacher-paced. ', {'bold': True, 'color': INK}), 'Each with rule-changing variants.']], 15, color=SOFT, spacing=6)


def s_grid6(slide, s):
    title(slide, s['title'])
    gap = 0.25
    gw = (W - 2 * MX - 2 * gap) / 3
    gh = gw * 9 / 16
    for i, (image, cap) in enumerate(s['images']):
        x = MX + (i % 3) * (gw + gap)
        y = 1.6 + (i // 3) * (gh + gap)
        pic(slide, image, x, y, gw, gh, radius=0.04)
        tag = card(slide, x + 0.15, y + gh - 0.55, 0.2 + 0.105 * len(cap) + 0.15, 0.4, fill='0B1020', line='4753B8', radius=0.3)
        set_alpha(tag, 88)
        text(slide, x + 0.15, y + gh - 0.55, 0.2 + 0.105 * len(cap) + 0.15, 0.4, cap, 13.5, bold=True, italic=True, font=HEAD, align='center', anchor='middle')
    foot(slide, s['foot'], y=1.6 + 2 * (gh + gap) + 0.02)


def s_questions(slide, s):
    title(slide, s['title'])
    x, y = MX, 1.7
    for q in QUESTION_TYPES:
        w = 0.3 + 0.098 * len(q) + 0.12
        if x + w > 6.55:
            x, y = MX, y + 0.56
        chip = card(slide, x, y, w, 0.42, fill='1E2760', line='4753B8', radius=0.5)
        text(slide, x, y, w, 0.42, q, 13.5, bold=True, align='center', anchor='middle')
        x += w + 0.14
    bullets(slide, MX, y + 0.9, 5.9, 3.4, s['points'], size=16, gap=9)
    pic(slide, s['image'], 6.75, 1.7, 5.98, 5.98 * 9 / 16)
    text(slide, 6.75, 1.7 + 5.98 * 9 / 16 + 0.12, 5.98, 0.8, 'The set editor: autosave, undo, drag to reorder, and "Try this question" before a class ever sees it.', 13, color=MUTE, italic=True)


def s_flow3(slide, s):
    title(slide, s['title'])
    gap = 0.75
    gw = (W - 2 * MX - 2 * gap) / 3
    gh = gw * 9 / 16
    y = 2.05
    for i, (image, cap) in enumerate(s['images']):
        x = MX + i * (gw + gap)
        pic(slide, image, x, y, gw, gh, radius=0.04)
        badge = card(slide, x, y + gh + 0.3, 0.55, 0.55, fill=GOLD, line=None, shape=MSO_SHAPE.OVAL)
        text(slide, x, y + gh + 0.3, 0.55, 0.55, str(i + 1), 19, color=NIGHT, bold=True, font=HEAD, align='center', anchor='middle')
        text(slide, x + 0.72, y + gh + 0.3, gw - 0.72, 0.55, cap, 19, bold=True, font=HEAD, anchor='middle')
        if i < 2:
            arrow = slide.shapes.add_shape(MSO_SHAPE.RIGHT_ARROW, Inches(x + gw + 0.16), Inches(y + gh / 2 - 0.2), Inches(gap - 0.32), Inches(0.4))
            arrow.fill.solid(); arrow.fill.fore_color.rgb = rgb(GOLD); arrow.line.fill.background(); arrow.shadow.inherit = False
    foot(slide, s['foot'], y=y + gh + 1.25)


def s_feature(slide, s):
    """One big screenshot and a list beside it. `side` is where the picture goes."""
    title(slide, s['title'])
    pw = 7.0
    ph = pw * 9 / 16
    left = s.get('side', 'right') == 'left'
    px = MX if left else W - MX - pw
    tx = MX + pw + 0.5 if left else MX
    pic(slide, s['image'], px, 1.7, pw, ph, anchor='top')
    bullets(slide, tx, 1.8, W - 2 * MX - pw - 0.5, 4.3, s['points'], size=16.5, gap=10)
    if s.get('foot'):
        foot(slide, s['foot'], y=1.7 + ph + 0.22)


def s_feature2(slide, s):
    title(slide, s['title'])
    pw = 5.0
    ph = pw * 9 / 16
    pic(slide, s['images'][0], MX, 1.7, pw, ph, anchor='top')
    pic(slide, s['images'][1], MX + 2.2, 3.55, pw, ph, anchor='top')
    bullets(slide, 8.45, 1.85, W - 8.45 - MX, 4.8, s['points'], size=17.5, gap=13)


def s_tiles(slide, s):
    title(slide, s['title'])
    cols = s['cols']
    tiles = s['tiles']
    rows = (len(tiles) + cols - 1) // cols
    gap = 0.22
    tw = (W - 2 * MX - gap * (cols - 1)) / cols
    avail = (H - 1.75 - (1.45 if s.get('foot') else 0.85))
    th = min(1.45, (avail - gap * (rows - 1)) / rows)
    tints = [GOLD, SKY, MINT, VIOLET, CORAL]
    for i, (head, body) in enumerate(tiles):
        x = MX + (i % cols) * (tw + gap)
        y = 1.72 + (i // cols) * (th + gap)
        card(slide, x, y, tw, th)
        dot = card(slide, x + 0.24, y + 0.26, 0.2, 0.2, fill=tints[i % len(tints)], line=None, shape=MSO_SHAPE.OVAL)
        text(slide, x + 0.58, y + 0.16, tw - 0.75, 0.42, head, 16.5 if cols >= 4 else 18, bold=True, font=HEAD, anchor='middle')
        text(slide, x + 0.58, y + 0.62, tw - 0.78, th - 0.7, body, 13 if cols >= 4 else 14.5, color=SOFT)
    if s.get('foot'):
        foot(slide, s['foot'], y=1.72 + rows * (th + gap) + 0.05)


def s_safety(slide, s):
    title(slide, s['title'])
    y = 2.0
    for i, line in enumerate(s['big']):
        text(slide, MX, y, 6.2, 0.9, line, 42, color=GOLD if i == 2 else INK, bold=True, italic=True, font=HEAD)
        y += 1.2
    card(slide, 7.0, 1.75, W - 7.0 - MX, 4.75)
    bullets(slide, 7.35, 2.05, W - 7.35 - MX - 0.3, 4.2, s['points'], size=16, gap=11)


def s_numbers(slide, s):
    title(slide, s['title'])
    cols, gap = 3, 0.3
    tw = (W - 2 * MX - gap * (cols - 1)) / cols
    th = 2.2
    for i, (num, label) in enumerate(s['stats']):
        x = MX + (i % cols) * (tw + gap)
        y = 1.75 + (i // cols) * (th + gap)
        card(slide, x, y, tw, th)
        text(slide, x, y + 0.2, tw, 1.25, num, 72, color=GOLD, bold=True, italic=True, font=HEAD, align='center', anchor='middle')
        text(slide, x, y + 1.45, tw, 0.5, label, 20, color=SOFT, bold=True, align='center')


def s_join(slide, s):
    pic(slide, 'film:crowd', 0, 0, W, H, radius=0, border=NIGHT)
    veil = card(slide, 0, 0, W, H, fill='05071A', line=None, shape=MSO_SHAPE.RECTANGLE)
    set_alpha(veil, 55)
    text(slide, MX, 0.7, W - 2 * MX, 1.0, s['title'], 54, bold=True, italic=True, font=HEAD, align='center')
    panel = card(slide, 2.4, 2.25, W - 4.8, 3.1, fill='0B1020', line='4753B8', radius=0.06)
    set_alpha(panel, 90)
    text(slide, 2.4, 2.5, W - 4.8, 0.5, 'On any phone, tablet or laptop, go to', 20, color=SOFT, align='center')
    text(slide, 2.4, 3.05, W - 4.8, 0.9, s['url'], 40, color=GOLD, bold=True, font=HEAD, align='center', anchor='middle')
    text(slide, 2.4, 4.1, W - 4.8, 0.9, 'and type the 6-digit code I read out', 24, bold=True, align='center', anchor='middle')
    text(slide, MX, 5.8, W - 2 * MX, 0.6, 'Thank you. Questions welcome.', 26, color=INK, bold=True, italic=True, font=HEAD, align='center')


LAYOUTS = {'title': s_title, 'idea': s_idea, 'steps': s_steps, 'grid4': s_grid4, 'modes': s_modes, 'grid6': s_grid6, 'questions': s_questions, 'flow3': s_flow3,
           'feature': s_feature, 'feature2': s_feature2, 'tiles': s_tiles, 'safety': s_safety, 'numbers': s_numbers, 'join': s_join}


# ------------------------------------------------------------------ the appendix: every feature

AREAS = [
    ('hosting', 'Hosting a live game'), ('sets', 'Question sets and the editor'), ('sets2', 'Sound, a set\'s feel, and games that adapt'), ('making', 'Making things and the teacher\'s day'),
    ('gamecode', 'Game Maker: game code'), ('modestudio', 'Game Maker: made games'), ('studio2', 'Glim designs and the Studio'), ('lessons', 'Lessons'), ('classes', 'Classes and homework'),
    ('reports', 'Reports'), ('students', 'For students'), ('solo', 'Solo play'), ('bots', 'Practice bots'), ('access', 'Accessibility, comfort and devices'), ('school', 'A school\'s own copy'),
    ('ai', 'AI helpers (optional)'), ('finish', 'More'), ('stage', 'The live game\'s look'),
]


def feature_rows(name):
    """One short line a feature: its name in bold and a few words, with nothing cut mid-word."""
    path = os.path.join(DOCS, name + '.md')
    if not os.path.exists(path):
        return []
    rows = []
    for line in open(path, encoding='utf8'):
        if not re.match(r'^\| \d+ \|', line):
            continue
        cell = line.split('|')[2].strip()
        cell = re.sub(r'`([^`]*)`', r'\1', cell)
        m = re.match(r'\*\*(.+?)\*\*[:.]?\s*(.*)', cell)
        lead, rest = (m.group(1).strip(' :.'), m.group(2)) if m else (None, cell)
        rest = re.sub(r'\*\*', '', rest)
        rest = re.sub(r'\s*\([^)]*\)', '', rest)           # asides in brackets
        rest = re.split(r'[.;:](\s|$)', rest)[0].strip(' ,')   # the first clause
        if re.search(r'[=_/]|[A-Z]{3,}', rest):               # settings and file names are not for a slide
            rest = ''
        room = LINE_CHARS - (len(lead) + 2 if lead else 0)
        if len(rest) > room:
            # Keep whole phrases only: cut at a comma if one fits, otherwise say nothing more than the name.
            head = rest[:room + 1]
            rest = head[:head.rfind(',')].strip() if ',' in head and len(head[:head.rfind(',')].split()) >= 3 else ''
        if lead and len(lead) > LINE_CHARS:
            lead = lead[:LINE_CHARS + 1].rsplit(' ', 1)[0]
        if not lead:
            lead, rest = rest[:1].upper() + rest[1:], ''
        if lead:
            rows.append((lead, rest if room >= 12 else ''))
    return rows


LINE_CHARS = 60

FOUNDATIONS = [
    ('Accounts and guests', 'usernames, no email needed; recovery codes'), ('Join with a code', 'six digits, a QR code or a link'), ('30 game modes, 130 variants', 'every variant a rule change'),
    ('Reconnection', 'a dropped device rejoins its game'), ('Host controls', 'pause, skip, end, remove, lock'), ('Server referee', 'scores, rewards and purchases decided on the server'),
    ('Shop', 'Glims and cosmetics for coins earned by playing'), ('Lanterns', 'mystery packs with their odds shown'), ('Collection and locker', 'what you own and what you wear'),
    ('Quests and achievements', 'daily and weekly, with badges'), ('Levels and streaks', 'progress that carries across games'), ('Monthly Glims', 'a new set each month'),
    ('Seasons and events', 'the look changes with the calendar'), ('Friends and profiles', 'with blocking; no chat'), ('Leaderboards', 'weekly, by mode, with privacy kept'),
    ('Music and sound', 'every sound made in code; captions for all'), ('Day and night themes', 'and reduced motion'), ('Staff tools', 'reports, moderation, roles, flags and an audit log'),
    ('Test accounts', 'kept apart from real ones'), ('Privacy policy and terms', 'inside the app'), ('Runs anywhere', 'one Docker image; free hosting works'),
    ('A playable demo', 'a static copy with no server'), ('Creator Studio', 'chosen designers publish Glims to the shop'), ('School look', 'a school\'s colours and uniforms'),
]


def appendix(make_slide):
    items = []  # (area title, [(lead, rest)])
    for key, name in AREAS:
        rows = feature_rows(key)
        if rows:
            items.append((name, rows))
    items.append(('The foundations', FOUNDATIONS))
    # Fill slides column by column: 3 columns, 25 one-line items each.
    COLS, LINES = 3, 25
    pages, col, used = [[]], [], 0

    def close_column():
        nonlocal col, used
        if col:
            pages[-1].append(col)
            col, used = [], 0
            if len(pages[-1]) == COLS:
                pages.append([])

    for name, rows in items:
        k = 0
        while rows:
            room = LINES - used - 1.4          # a heading takes a line and a bit
            if room < 4:
                close_column()
                room = LINES - 1.4
            take = rows[:int(room)]
            rows = rows[int(room):]
            col.append((name + (' (continued)' if k else ''), take))
            used += len(take) + 1.9
            k += 1
            if rows:
                close_column()
    close_column()
    pages = [p for p in pages if p]
    for pi, page in enumerate(pages):
        slide = make_slide({'say': 'Appendix: every feature, by area. For questions, not for reading out.', 'do': 'Only show these if someone asks "does it do X?"'})
        title(slide, f'Every feature ({pi + 1} of {len(pages)})', size=30, y=0.45)
        cw = (W - 2 * MX - 0.5) / 3
        for ci, column in enumerate(page):
            x = MX + ci * (cw + 0.25)
            paras = []
            for gi, (name, chunk) in enumerate(column):
                if gi:
                    paras.append([(' ', {'size': 5})])
                paras.append([(name, {'bold': True, 'color': GOLD, 'size': 12.5, 'font': HEAD})])
                for lead, rest in chunk:
                    paras.append([(lead + ('  ' if rest else ''), {'bold': True, 'color': INK})] + ([(rest, {})] if rest else []))
            text(slide, x, 1.25, cw, 5.7, paras, 10.5, color=SOFT, spacing=1.2)
    return len(pages)


# ------------------------------------------------------------------ build

specs = list(SLIDES)
made = []


def make_slide(spec):
    slide = prs.slides.add_slide(BLANK)
    background(slide)
    notes(slide, spec)
    made.append(slide)
    return slide


for spec in specs:
    slide = make_slide(spec)
    LAYOUTS[spec['kind']](slide, spec)
appendix(make_slide)
total = len(made)
for i, slide in enumerate(made):
    if i < len(specs) and specs[i]['kind'] in ('title', 'join'):
        continue
    chrome(slide, i + 1, total)
prs.core_properties.title = 'Ludora: turn any lesson into game night'
prs.core_properties.author = 'Ludora'
prs.save(OUT)
print(f'{total} slides -> {OUT}')
if missing:
    print('pictures still to shoot:', ', '.join(sorted(set(missing))))
