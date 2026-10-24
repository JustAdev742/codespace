"""Contact sheets of rendered frames labelled with their time: python3 tsheet.py <dir> <outprefix> [per=30] [w=360]"""
import sys, os
from PIL import Image, ImageDraw, ImageFont
d, out = sys.argv[1], sys.argv[2]
per = int(sys.argv[3]) if len(sys.argv) > 3 else 30
w = int(sys.argv[4]) if len(sys.argv) > 4 else 360
files = sorted(f for f in os.listdir(d) if f.endswith('.jpg'))
font = ImageFont.truetype('/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf', 18)
h = w * 9 // 16
cols = 5
for k in range(0, len(files), per):
    chunk = files[k:k + per]
    rows = (len(chunk) + cols - 1) // cols
    s = Image.new('RGB', (cols * (w + 4), rows * (h + 4)), 'white')
    for j, f in enumerate(chunk):
        im = Image.open(f'{d}/{f}').convert('RGB').resize((w, h))
        dr = ImageDraw.Draw(im)
        dr.rectangle((0, 0, 78, 24), fill='black')
        dr.text((4, 2), f'{int(f[1:6]) / 30:.1f}', fill='yellow', font=font)
        s.paste(im, ((j % cols) * (w + 4), (j // cols) * (h + 4)))
    s.save(f'{out}{k // per}.png')
    print(f'{out}{k // per}.png')
