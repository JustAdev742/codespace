#!/usr/bin/env python3
"""Builds the "What's new" presentation (a .pptx) from updates_content.py and the pictures shot from
The Hills Grammar School's copy by tools/film/capture/updates.mjs.

    python3 build_updates.py [out.pptx]

The look is the school's copy: cream pages, bottle-green titles, a deep green cover, and the staff
dashboard's teal for the server section. Pictures are stills/<name>.png or a film frame saved as
deck/<name>.jpg in the film's output folder (FILM_OUT). A missing picture becomes a labelled box,
so the deck still builds and says what to shoot. The script goes in each slide's notes.

Fonts are Calibri throughout on purpose: it is on every school computer, so the slides look the same
wherever they are opened.
"""
import os, re, sys
from pptx import Presentation
from pptx.util import Inches, Pt
from pptx.dml.color import RGBColor
from pptx.enum.shapes import MSO_SHAPE
from pptx.enum.text import PP_ALIGN, MSO_ANCHOR
from pptx.oxml.ns import qn
from lxml import etree
from PIL import Image, ImageDraw, ImageFont

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from updates_content import SLIDES  # noqa: E402

MEDIA = os.environ.get('FILM_OUT', '/tmp/claude-0/-home-user/97a5c84e-6d10-5253-ab94-c316a24e49f4/scratchpad/upd')
WORK = os.path.join(MEDIA, 'deck')
OUT = sys.argv[1] if len(sys.argv) > 1 else os.path.join(MEDIA, 'out', 'Ludora - what is new.pptx')
os.makedirs(os.path.join(WORK, 'img'), exist_ok=True)
os.makedirs(os.path.dirname(OUT), exist_ok=True)

# The school's copy.
DEEP, DEEPER, GREEN, MINT = '083A2B', '05241B', '00603F', '5FDCAA'
CREAM, PAPER, PAGE, LINE = 'F6ECD2', 'FFFDF8', 'F8F4EA', 'E0D8C5'
INK, BODY_INK, MUTED, RED = '14211B', '36413A', '59655D', 'C02327'
# The staff dashboard.
TEAL, TEAL_PANEL, TEAL_LINE, TERM, TERM_DIM, CALM, CORAL = '0A1A1C', '0F2427', '3F7F7A', 'EFE6CF', '9DBFB8', '9BE27A', 'FF8A78'
FONT = 'Calibri'
W, H = 13.333, 7.5
MX = 0.7

prs = Presentation()
prs.slide_width, prs.slide_height = Inches(W), Inches(H)
BLANK = prs.slide_layouts[6]
missing = []


def rgb(hexstr):
    return RGBColor.from_string(hexstr)


# ------------------------------------------------------------------ pictures

def source(name):
    kind, _, key = name.partition(':')
    if kind == 'frame':
        return os.path.join(WORK, f'{key}.jpg')
    if kind == 'card':
        return os.path.join(WORK, f'card-{key}.png')
    return os.path.join(MEDIA, 'stills', key + '.png')


def picture_path(name):
    """A picture by name as a JPEG no wider than 2200 px, or None when it has not been shot."""
    if name is None:
        return None
    src = source(name)
    if not os.path.exists(src):
        missing.append(name)
        return None
    out = os.path.join(WORK, 'img', re.sub(r'[^a-z0-9]+', '-', name.lower()) + '.jpg')
    if not os.path.exists(out) or os.path.getmtime(out) < os.path.getmtime(src):
        im = Image.open(src).convert('RGB')
        if im.width > 2200:
            im = im.resize((2200, round(im.height * 2200 / im.width)), Image.LANCZOS)
        im.save(out, quality=92)
    return out


def round_corners(shape, radius, w, h):
    shape.auto_shape_type = MSO_SHAPE.ROUNDED_RECTANGLE
    geom = shape._element.spPr.find(qn('a:prstGeom'))
    av = geom.find(qn('a:avLst'))
    if av is None:
        av = etree.SubElement(geom, qn('a:avLst'))
    for old in list(av):
        av.remove(old)
    gd = etree.SubElement(av, qn('a:gd'))
    gd.set('name', 'adj')
    gd.set('fmla', f'val {int(min(0.5, radius / min(w, h)) * 100000)}')


def pic(slide, name, x, y, w, h, radius=0.12, border=LINE, anchor='center', fit='cover', edge=1.0):
    """A picture in a box. 'cover' fills the box and trims the overflow; 'contain' keeps all of it and
    shrinks the box to the picture. Returns (shape, x, y, w, h) as drawn."""
    path = picture_path(name)
    if path is None:
        s = card(slide, x, y, w, h, fill='ECE6D6', line='B3AA93')
        text(slide, x, y + h / 2 - 0.2, w, 0.4, f'[{name}]', 11, color=MUTED, align='center')
        return s, x, y, w, h
    im = Image.open(path)
    src = im.width / im.height
    if fit == 'contain':
        if src > w / h:
            nh = w / src
            y, h = y + (h - nh) / 2, nh
        else:
            nw = h * src
            x, w = x + (w - nw) / 2, nw
    p = slide.shapes.add_picture(path, Inches(x), Inches(y), Inches(w), Inches(h))
    box = w / h
    if fit == 'cover':
        if src > box:
            cut = 1 - box / src
            p.crop_left, p.crop_right = (cut / 2, cut / 2) if anchor == 'center' else (0, cut) if anchor == 'left' else (cut, 0)
        elif src < box:
            cut = 1 - src / box
            p.crop_top, p.crop_bottom = (cut / 2, cut / 2) if anchor == 'center' else (0, cut) if anchor == 'top' else (cut, 0)
    round_corners(p, radius, w, h)
    if border:
        p.line.color.rgb = rgb(border)
        p.line.width = Pt(edge)
    else:
        p.line.fill.background()
    return p, x, y, w, h


def phone(slide, name, x, y, h, body='0A1410'):
    """A still in a phone: a dark body with the screen set into it. Returns the width used."""
    w = h * 390 / 844
    bez = h * 0.018
    card(slide, x - bez, y - bez, w + bez * 2, h + bez * 2, fill=body, line='2B3A33', radius=w * 0.17)
    pic(slide, name, x, y, w, h, radius=w * 0.13, border=None, anchor='top')
    return w


# ------------------------------------------------------------------ shapes and text

def background(slide, color):
    fill = slide.background.fill
    fill.solid()
    fill.fore_color.rgb = rgb(color)


def card(slide, x, y, w, h, fill=PAPER, line=LINE, radius=0.12, shape=MSO_SHAPE.ROUNDED_RECTANGLE, line_w=1.0):
    s = slide.shapes.add_shape(shape, Inches(x), Inches(y), Inches(w), Inches(h))
    s.fill.solid()
    s.fill.fore_color.rgb = rgb(fill)
    if line:
        s.line.color.rgb = rgb(line)
        s.line.width = Pt(line_w)
    else:
        s.line.fill.background()
    s.shadow.inherit = False
    if shape == MSO_SHAPE.ROUNDED_RECTANGLE:
        s.adjustments[0] = min(0.5, radius / min(w, h))
    s.text_frame.text = ''
    return s


def text(slide, x, y, w, h, value, size, color=INK, bold=False, italic=False, align='left', anchor='top', line=None, after=0):
    """A text box with no inner padding. `value` is a string, or a list of paragraphs: a string, or
    a list of (text, {bold, color, size}) runs."""
    box = slide.shapes.add_textbox(Inches(x), Inches(y), Inches(w), Inches(h))
    tf = box.text_frame
    tf.word_wrap = True
    tf.margin_left = tf.margin_right = tf.margin_top = tf.margin_bottom = 0
    tf.vertical_anchor = {'top': MSO_ANCHOR.TOP, 'middle': MSO_ANCHOR.MIDDLE, 'bottom': MSO_ANCHOR.BOTTOM}[anchor]
    paras = value if isinstance(value, list) else [value]
    for i, para in enumerate(paras):
        p = tf.paragraphs[0] if i == 0 else tf.add_paragraph()
        p.alignment = {'left': PP_ALIGN.LEFT, 'center': PP_ALIGN.CENTER, 'right': PP_ALIGN.RIGHT}[align]
        if line:
            p.line_spacing = line
        p.space_after = Pt(after)
        for run_text, opts in (para if isinstance(para, list) else [(para, {})]):
            r = p.add_run()
            r.text = run_text
            f = r.font
            f.name, f.size = FONT, Pt(opts.get('size', size))
            f.bold, f.italic = opts.get('bold', bold), opts.get('italic', italic)
            f.color.rgb = rgb(opts.get('color', color))
    return box


def title(slide, value, color=GREEN, y=0.55, size=38, w=W - 2 * MX):
    return text(slide, MX, y, w, 0.9, value, size, color=color, bold=True)


def foot(slide, n, total, dark=False):
    c = TERM_DIM if dark else MUTED
    text(slide, MX, H - 0.48, 6, 0.3, 'Ludora   What’s new, November 2026', 10.5, color=c)
    text(slide, W - MX - 2, H - 0.48, 2, 0.3, f'{n} / {total}', 10.5, color=c, align='right')


def notes(slide, spec):
    slide.notes_slide.notes_text_frame.text = spec.get('say', '')


def points(slide, items, x, y, w, head=19, body=15, gap=0.2, head_color=INK, body_color=BODY_INK, dot=GREEN):
    """Head and line pairs down a column. Returns the y below the last one."""
    for head_text, line_text in items:
        d = slide.shapes.add_shape(MSO_SHAPE.OVAL, Inches(x), Inches(y + 0.1), Inches(0.14), Inches(0.14))
        d.fill.solid(); d.fill.fore_color.rgb = rgb(dot); d.line.fill.background(); d.shadow.inherit = False
        text(slide, x + 0.32, y, w - 0.32, 0.36, head_text, head, color=head_color, bold=True)
        lines = max(1, -(-len(line_text) // max(20, int((w - 0.32) * 132 / body))))
        hh = lines * body * 1.26 / 72
        text(slide, x + 0.32, y + 0.38, w - 0.32, hh + 0.1, line_text, body, color=body_color, line=1.08)
        y += 0.38 + hh + gap
    return y


# ------------------------------------------------------------------ made pictures

def alert_card():
    """The alert as the server writes it (alerts.compose with the rules reading), drawn as a message."""
    out = os.path.join(WORK, 'card-alert.png')
    lines = [
        ('To: it@school.example', TERM_DIM, False), ('', None, False),
        ('[Ludora OS ludora-school] Security: Shield raised: 5 addresses', 'FFF7E0', True), ('misbehaved within two minutes.... (and 3 more events)', 'FFF7E0', True), ('', None, False),
        ('What the guard makes of it (worked out by fixed rules', 'FFF7E0', True), ('from what it recorded):', 'FFF7E0', True),
        ('  - What it was: an attempt to overload the server.', TERM, False), ('  - How serious: needs a person to act now.', CORAL, False), ('  - 3 devices were at it together.', TERM, False), ('', None, False),
        ('What the server did: Refused 3 addresses for up to', TERM, False), ('60 minutes. Staff addresses are never refused.', TERM, False), ('', None, False),
        ('Server: ludora-school (https://play.school.example)', TERM_DIM, False),
    ]
    size, pad = 34, 60
    try:
        reg = ImageFont.truetype('/usr/share/fonts/truetype/dejavu/DejaVuSansMono.ttf', size)
        bold = ImageFont.truetype('/usr/share/fonts/truetype/dejavu/DejaVuSansMono-Bold.ttf', size)
    except OSError:
        reg = bold = ImageFont.load_default()
    wpx = int(max(reg.getlength(t) for t, _, _ in lines) + pad * 2)
    hpx = int(len(lines) * size * 1.5 + pad * 2)
    im = Image.new('RGB', (wpx, hpx), '#' + TEAL_PANEL)
    d = ImageDraw.Draw(im)
    for i, (t, c, b) in enumerate(lines):
        if t:
            d.text((pad, pad + i * size * 1.5), t, font=bold if b else reg, fill='#' + c)
    im.save(out)
    return out


def crops():
    """Close-ups cut from full stills, saved as stills of their own."""
    def cut(src, dst, box):
        s, d = os.path.join(MEDIA, 'stills', src + '.png'), os.path.join(MEDIA, 'stills', dst + '.png')
        if os.path.exists(s) and (not os.path.exists(d) or os.path.getmtime(d) < os.path.getmtime(s)):
            im = Image.open(s)
            im.crop((int(box[0] * im.width), int(box[1] * im.height), int(box[2] * im.width), int(box[3] * im.height))).save(d)
    cut('sidebar', 'sidebar-crop', (0, 0, 1, 0.86))
    cut('sidebar', 'sidebar-tile', (0, 0.226, 1, 0.336))
    cut('wallet-full', 'wallet-list', (0, 0.565, 1, 0.905))
    cut('econ-grant-dialog', 'econ-grant', (0, 0, 1, 1))


# ------------------------------------------------------------------ the layouts

def s_cover(slide, s, n, total):
    background(slide, DEEP)
    # The picture bleeds off the right; the words sit on the green.
    pic(slide, s.get('image'), W * 0.44, 0, W * 0.56, H, radius=0.001, border=None)
    veil = slide.shapes.add_shape(MSO_SHAPE.RECTANGLE, Inches(0), Inches(0), Inches(W * 0.44 + 0.02), Inches(H))
    veil.fill.solid(); veil.fill.fore_color.rgb = rgb(DEEP); veil.line.fill.background(); veil.shadow.inherit = False
    text(slide, MX, 1.0, 4.8, 0.4, 'Ludora', 22, color=MINT, bold=True)
    text(slide, MX, 2.1, W * 0.44 - MX - 0.3, 2.6, s['title'], 58, color=CREAM, bold=True, line=0.95)
    text(slide, MX, 5.0, W * 0.44 - MX - 0.5, 1.4, s['sub'], 21 if not s.get('closing') else 26, color='CFE9DC', line=1.1)
    if not s.get('closing'):
        text(slide, MX, H - 0.75, 5, 0.3, 'November 2026', 13, color=MINT)


def s_tiles(slide, s, n, total):
    background(slide, PAGE)
    title(slide, s['title'])
    cols, gap = 3, 0.3
    tw = (W - 2 * MX - gap * (cols - 1)) / cols
    th = 2.5
    for i, (head, line, image) in enumerate(s['tiles']):
        x, y = MX + (i % cols) * (tw + gap), 1.5 + (i // cols) * (th + 0.22)
        card(slide, x, y, tw, th, fill=PAPER, line=LINE, radius=0.14)
        pic(slide, image, x + 0.14, y + 0.14, tw - 0.28, 1.34, radius=0.08, border=LINE, anchor='top')
        text(slide, x + 0.24, y + 1.58, tw - 0.48, 0.36, head, 19, color=GREEN, bold=True)
        text(slide, x + 0.24, y + 1.95, tw - 0.48, 0.5, line, 14, color=BODY_INK, line=1.05)
    foot(slide, n, total)


def s_feature(slide, s, n, total):
    background(slide, PAGE)
    title(slide, s['title'])
    narrow, tall = s.get('narrow'), s.get('tall')
    left_w = 5.5 if not narrow else 6.6
    text(slide, MX, 1.55, left_w, 1.2, s['lead'], 18, color=BODY_INK, line=1.12)
    y = points(slide, s['points'], MX, 2.95 if len(s['lead']) > 110 else 2.7, left_w)
    if s.get('foot'):
        text(slide, MX, max(y + 0.05, 6.05), left_w, 0.7, s['foot'], 13, color=MUTED, italic=True, line=1.08)
    px = MX + left_w + 0.5
    pw, ph_ = W - MX - px, H - 1.55 - 0.85
    if s.get('phone') and s.get('image') and not tall:
        w = phone(slide, s['phone'], px + 0.1, 1.55, ph_)
        pic(slide, s['image'], px + w + 0.55, 1.55, pw - w - 0.55, ph_, radius=0.12, anchor='top')
    elif tall:
        # A tall close-up and a phone, side by side.
        _, ax, ay, aw, ah = pic(slide, s['image'], px, 1.4, 2.9, H - 1.4 - 0.75, radius=0.12, fit='contain')
        phone(slide, s['phone'], ax + aw + 0.7, 1.55, ph_ - 0.1)
    elif narrow:
        pic(slide, s['image'], px + 0.3, 1.5, pw - 0.6, ph_ + 0.1, radius=0.14, fit='contain')
    else:
        pic(slide, s['image'], px, 1.7, pw, pw * 9 / 16, radius=0.12, anchor='top')
    foot(slide, n, total)


def s_split(slide, s, n, total):
    background(slide, PAGE)
    title(slide, s['title'])
    text(slide, MX, 1.5, 6.3, 1.2, s['lead'], 17, color=BODY_INK, line=1.12)
    colw = 3.02
    for i, key in enumerate(('left', 'right')):
        head, items = s[key]
        x = MX + i * (colw + 0.26)
        ok = i == 0
        card(slide, x, 2.95, colw, 3.25, fill=PAPER if ok else 'F1EBDD', line=LINE, radius=0.14)
        text(slide, x + 0.22, 3.1, colw - 0.44, 0.4, head, 17, color=GREEN if ok else (RED if head.startswith('They cannot') else GREEN), bold=True)
        text(slide, x + 0.22, 3.55, colw - 0.44, 2.6, [[('' + it, {})] for it in items], 13.5, color=BODY_INK, line=1.04, after=6)
    if s.get('foot'):
        text(slide, MX, 6.32, 6.3, 0.5, s['foot'], 13, color=MUTED, italic=True)
    px = MX + 6.3 + 0.5
    pw = W - MX - px
    _, ax, ay, aw, ah = pic(slide, s['image'], px, 1.7, pw, pw * 9 / 16, radius=0.12, anchor='top')
    if s.get('phone'):
        phone(slide, s['phone'], px + pw - 1.55, 3.3, 3.35)
    foot(slide, n, total)


def s_phones(slide, s, n, total):
    background(slide, PAGE)
    title(slide, s['title'])
    text(slide, MX, 1.5, 4.9, 1.6, s['lead'], 18, color=BODY_INK, line=1.12)
    pic(slide, s['image'], MX, 3.3, 4.9, 4.9 * 9 / 16, radius=0.12, anchor='top')
    text(slide, MX, 3.3 + 4.9 * 9 / 16 + 0.14, 4.9, 0.7, s['caption'], 13, color=MUTED, italic=True, line=1.08)
    ph_ = 4.1
    w = ph_ * 390 / 844
    x0 = MX + 4.9 + 0.6
    gap = (W - MX - x0 - 3 * w) / 2
    for i, name in enumerate(s['phones']):
        phone(slide, name, x0 + i * (w + gap), 1.6, ph_)
        text(slide, x0 + i * (w + gap), 1.6 + ph_ + 0.2, w, 0.3, ('The first step', 'The next step', 'Ready')[i], 13, color=MUTED, align='center')
    foot(slide, n, total)


def s_numbers(slide, s, n, total):
    background(slide, PAGE)
    title(slide, s['title'])
    text(slide, MX, 1.5, 5.6, 1.3, s['lead'], 18, color=BODY_INK, line=1.12)
    y = 3.0
    for big, label in s['numbers']:
        text(slide, MX, y, 1.9, 0.9, big, 54, color=GREEN, bold=True, anchor='middle')
        text(slide, MX + 2.0, y, 3.6, 0.9, label, 16, color=INK, anchor='middle', line=1.05)
        y += 0.98
    text(slide, MX, 6.0, 5.6, 0.8, s['foot'], 12.5, color=MUTED, italic=True, line=1.08)
    px = MX + 5.6 + 0.5
    pw = W - MX - px
    pic(slide, s['image'], px, 1.7, pw, pw * 9 / 16, radius=0.12, anchor='top')
    foot(slide, n, total)


def s_gallery(slide, s, n, total):
    """Four pictures, two by two, each with its words beside it."""
    dark = s.get('dark')
    background(slide, TEAL if dark else PAGE)
    title(slide, s['title'], color=TERM if dark else GREEN)
    gap = 0.4
    cw = (W - 2 * MX - gap) / 2
    pw_, ph_ = 3.55, 3.55 * 9 / 16
    rows = 2.28 if s.get('foot') else 2.45
    for i, (image, head, line) in enumerate(s['shots']):
        x, y = MX + (i % 2) * (cw + gap), 1.55 + (i // 2) * rows
        pic(slide, image, x, y, pw_, ph_, radius=0.1, border=TEAL_LINE if dark else LINE, anchor='top')
        text(slide, x + pw_ + 0.28, y + 0.02, cw - pw_ - 0.28, 0.36, head, 19, color=CALM if dark else GREEN, bold=True)
        text(slide, x + pw_ + 0.28, y + 0.44, cw - pw_ - 0.28, 1.6, line, 14, color=TERM if dark else BODY_INK, line=1.08)
    if s.get('foot'):
        text(slide, MX, 6.2, W - 2 * MX, 0.7, s['foot'], 13, color=TERM_DIM if dark else MUTED, italic=True, line=1.08)
    foot(slide, n, total, dark)


def s_section(slide, s, n, total):
    background(slide, TEAL)
    pic(slide, s.get('image'), W * 0.46, 0.85, W * 0.54 - MX, (W * 0.54 - MX) * 9 / 16, radius=0.12, border=TEAL_LINE, anchor='top')
    text(slide, MX, 2.2, 5.0, 1.4, s['title'], 66, color=CALM, bold=True)
    text(slide, MX, 3.7, 4.9, 2.0, s['sub'], 22, color=TERM, line=1.12)
    foot(slide, n, total, True)


def s_dark(slide, s, n, total):
    background(slide, TEAL)
    title(slide, s['title'], color=TERM)
    left_w = 6.0
    points(slide, s['points'], MX, 1.6, left_w, head=17.5, body=13.5, gap=0.14, head_color=CALM, body_color=TERM, dot=CALM)
    px = MX + left_w + 0.5
    pw = W - MX - px
    image = s.get('image')
    if image and image.startswith('card:'):
        pic(slide, image, px, 1.6, pw, 4.9, radius=0.12, border=TEAL_LINE, fit='contain')
    else:
        pic(slide, image, px, 1.75, pw, pw * 9 / 16, radius=0.12, border=TEAL_LINE, anchor='top')
    foot(slide, n, total, True)


def s_limits(slide, s, n, total):
    background(slide, PAGE)
    title(slide, s['title'])
    y = 1.6
    for head, line in s['items']:
        card(slide, MX, y, W - 2 * MX, 0.92, fill=PAPER, line=LINE, radius=0.12)
        text(slide, MX + 0.3, y + 0.12, 5.0, 0.7, head, 16, color=INK, bold=True, anchor='middle', line=1.02)
        text(slide, MX + 5.6, y + 0.12, W - 2 * MX - 5.9, 0.7, line, 14, color=BODY_INK, anchor='middle', line=1.05)
        y += 1.02
    foot(slide, n, total)


def s_asks(slide, s, n, total):
    background(slide, PAGE)
    title(slide, s['title'])
    points(slide, s['items'], MX, 1.75, 5.6, head=20, body=15.5, gap=0.3)
    px = MX + 5.6 + 0.5
    pw = W - MX - px
    pic(slide, s['image'], px, 1.7, pw, pw * 9 / 16, radius=0.12, anchor='top')
    foot(slide, n, total)


LAYOUTS = {'cover': s_cover, 'tiles': s_tiles, 'feature': s_feature, 'split': s_split, 'phones': s_phones, 'numbers': s_numbers, 'gallery': s_gallery,
           'section': s_section, 'dark': s_dark, 'limits': s_limits, 'asks': s_asks}

crops()
alert_card()
for i, spec in enumerate(SLIDES, 1):
    slide = prs.slides.add_slide(BLANK)
    LAYOUTS[spec['kind']](slide, spec, i, len(SLIDES))
    notes(slide, spec)
prs.save(OUT)
print(f'wrote {OUT}: {len(SLIDES)} slides')
if missing:
    print('missing pictures:', ', '.join(sorted(set(missing))))
