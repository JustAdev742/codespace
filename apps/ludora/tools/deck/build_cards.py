#!/usr/bin/env python3
"""Builds the paper cue cards for the Ludora presentation: one card a slide, four cards to an
A4 page, to print, cut along the dashed lines and hold.

    python3 build_cards.py [out.pdf]

Each card has the slide's number and title, the words to say, what to do with your hands, and
about how long it takes. The words are the same ones in the slides' speaker notes (content.py).
"""
import os, sys
from reportlab.lib.pagesizes import A4
from reportlab.lib.units import mm
from reportlab.lib.colors import HexColor, white, black
from reportlab.lib.styles import ParagraphStyle
from reportlab.pdfgen import canvas
from reportlab.platypus import Paragraph

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from content import SLIDES, BEFORE, QUESTIONS  # noqa: E402

MEDIA = os.environ.get('FILM_OUT', '/tmp/claude-0/-home-user/97a5c84e-6d10-5253-ab94-c316a24e49f4/scratchpad/film')
OUT = sys.argv[1] if len(sys.argv) > 1 else os.path.join(MEDIA, 'out', 'Ludora cue cards.pdf')
PW, PH = A4
CW, CH = PW / 2, PH / 2
M = 8 * mm
NAVY, GOLD, GREY, SOFT = HexColor('#0B1020'), HexColor('#FFC233'), HexColor('#5A6072'), HexColor('#EEF0F7')


def esc(s):
    return s.replace('&', '&amp;').replace('<', '&lt;').replace('>', '&gt;')


def fit(text, width, height, size=13.5, smallest=9.5, bold=False, color=black):
    """A paragraph in the largest size that fits the space."""
    while True:
        style = ParagraphStyle('p', fontName='Helvetica-Bold' if bold else 'Helvetica', fontSize=size, leading=size * 1.36, textColor=color)
        p = Paragraph(text, style)
        _, h = p.wrap(width, height)
        if h <= height or size <= smallest:
            return p, h
        size -= 0.5


def header(c, x, y, number, title, right):
    """The dark band across the top of a card: its number, its title, and a note on the right."""
    c.setFillColor(NAVY)
    c.roundRect(x + M, y + CH - M - 17 * mm, CW - 2 * M, 17 * mm, 3 * mm, stroke=0, fill=1)
    c.setFillColor(GOLD)
    c.circle(x + M + 8.5 * mm, y + CH - M - 8.5 * mm, 5.6 * mm, stroke=0, fill=1)
    c.setFillColor(NAVY)
    c.setFont('Helvetica-Bold', 15 if len(str(number)) < 3 else 11)
    c.drawCentredString(x + M + 8.5 * mm, y + CH - M - 8.5 * mm - 5.2, str(number))
    room = CW - 2 * M - 19 * mm - (c.stringWidth(right, 'Helvetica', 8.5) + 5 * mm if right else 3 * mm)
    p, h = fit(esc(title), room, 13 * mm, size=12.5, smallest=8.5, bold=True, color=white)
    p.drawOn(c, x + M + 17 * mm, y + CH - M - 8.5 * mm - h / 2)
    if right:
        c.setFillColor(HexColor('#C9D1FF'))
        c.setFont('Helvetica', 8.5)
        c.drawRightString(x + CW - M - 3.5 * mm, y + CH - M - 8.5 * mm - 3, right)


def footer(c, x, y, label):
    c.setFillColor(GREY)
    c.setFont('Helvetica', 7.5)
    c.drawString(x + M, y + M - 1.5 * mm, 'Ludora')
    c.drawRightString(x + CW - M, y + M - 1.5 * mm, label)


def label(c, x, y, word):
    c.setFillColor(GREY)
    c.setFont('Helvetica-Bold', 8)
    c.drawString(x, y, word)


def slide_card(c, x, y, n, total, spec):
    header(c, x, y, n, spec.get('title', ''), f"about {spec['secs']} seconds" if spec.get('secs') else '')
    top = y + CH - M - 17 * mm - 6.5 * mm
    do_h = 0
    if spec.get('do'):
        dp, dh = fit(esc(spec['do']), CW - 2 * M - 6 * mm - 9 * mm, 30 * mm, size=10.5, smallest=8.5)
        do_h = dh + 6 * mm
        by = y + M + 4 * mm
        c.setFillColor(SOFT)
        c.roundRect(x + M, by, CW - 2 * M, do_h, 2.5 * mm, stroke=0, fill=1)
        label(c, x + M + 3 * mm, by + do_h - 3 * mm - 6.5, 'DO')
        dp.drawOn(c, x + M + 12 * mm, by + do_h - 3 * mm - dh + 1)
    label(c, x + M, top, 'SAY')
    room = top - 4 * mm - (y + M + 4 * mm + do_h + 3 * mm)
    p, h = fit(esc(spec['say']), CW - 2 * M, room, size=13.5)
    p.drawOn(c, x + M, top - 4 * mm - h)
    footer(c, x, y, f'card {n} of {total}')


def list_card(c, x, y, number, title, items, total, kind):
    header(c, x, y, number, title, '')
    top = y + CH - M - 17 * mm - 7 * mm
    room = top - (y + M + 5 * mm)
    size = 12.5
    while True:
        paras, used = [], 0
        for item in items:
            if kind == 'qa':
                q, a = item
                html = f'<b>{esc(q)}</b><br/>{esc(a)}'
            else:
                html = f'<font name="ZapfDingbats" color="#B8860B">o</font>&nbsp;&nbsp;{esc(item)}'
            p = Paragraph(html, ParagraphStyle('p', fontName='Helvetica', fontSize=size, leading=size * 1.34))
            _, h = p.wrap(CW - 2 * M, room)
            paras.append((p, h))
            used += h + size * 0.75
        if used <= room or size <= 8.5:
            break
        size -= 0.5
    yy = top
    for p, h in paras:
        p.drawOn(c, x + M, yy - h)
        yy -= h + size * 0.75
    footer(c, x, y, f'card {number} of {total}' if isinstance(number, int) else 'keep this one on top' if number == 'i' else 'for the questions at the end')


def cut_lines(c):
    c.setStrokeColor(HexColor('#9AA0B5'))
    c.setDash(3, 3)
    c.setLineWidth(0.6)
    c.line(CW, 6 * mm, CW, PH - 6 * mm)
    c.line(6 * mm, CH, PW - 6 * mm, CH)
    c.setDash()
    c.setFillColor(HexColor('#9AA0B5'))
    c.setFont('Helvetica', 6.5)
    c.drawCentredString(CW, 2.5 * mm, 'cut along the dashed lines')


cards = [('list', 'i', 'Before you start', BEFORE, 'check')]
total = len(SLIDES)
for i, spec in enumerate(SLIDES):
    cards.append(('slide', i + 1, spec))
half = (len(QUESTIONS) + 1) // 2
cards.append(('list', '?', 'If they ask (1 of 2)', QUESTIONS[:half], 'qa'))
cards.append(('list', '?', 'If they ask (2 of 2)', QUESTIONS[half:], 'qa'))

c = canvas.Canvas(OUT, pagesize=A4)
c.setTitle('Ludora cue cards')
c.setAuthor('Ludora')
spots = [(0, CH), (CW, CH), (0, 0), (CW, 0)]
for k, card in enumerate(cards):
    if k % 4 == 0:
        if k:
            c.showPage()
        cut_lines(c)
    x, y = spots[k % 4]
    if card[0] == 'slide':
        slide_card(c, x, y, card[1], total, card[2])
    else:
        list_card(c, x, y, card[1], card[2], card[3], total, card[4])
c.save()
print(f'{len(cards)} cards on {(len(cards) + 3) // 4} pages -> {OUT}')
