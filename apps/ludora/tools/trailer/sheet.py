"""Numbered contact sheet of a frame sequence: python3 sheet.py <dir> <out.png> [every=15] [width=320]"""
import sys, os
from PIL import Image, ImageDraw, ImageFont
d, out = sys.argv[1], sys.argv[2]
every = int(sys.argv[3]) if len(sys.argv) > 3 else 15
w = int(sys.argv[4]) if len(sys.argv) > 4 else 320
files = sorted(f for f in os.listdir(d) if f.endswith('.jpg'))
picks = files[::every]
font = ImageFont.truetype('/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf', 18)
ims = []
for f in picks:
    im = Image.open(f'{d}/{f}').convert('RGB')
    im = im.resize((w, int(im.height * w / im.width)))
    ImageDraw.Draw(im).rectangle((0, 0, 70, 24), fill='black')
    ImageDraw.Draw(im).text((4, 2), f[1:5].lstrip('0') or '0', fill='yellow', font=font)
    ims.append(im)
cols = max(1, 1800 // (w + 4))
rows = (len(ims) + cols - 1) // cols
s = Image.new('RGB', (cols * (w + 4), rows * (ims[0].height + 4)), 'white')
for k, im in enumerate(ims):
    s.paste(im, ((k % cols) * (w + 4), (k // cols) * (im.height + 4)))
s.save(out)
print(out, s.size, len(files), 'frames')
