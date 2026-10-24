"""Spectrogram images without matplotlib: python spec.py in.wav out.png [maxHz]"""
import sys
import numpy as np, soundfile as sf
from PIL import Image
x, sr = sf.read(sys.argv[1]); x = x.mean(1) if x.ndim > 1 else x
fmax = float(sys.argv[3]) if len(sys.argv) > 3 else 8000
n, hop = 2048, 256
win = np.hanning(n)
frames = [np.abs(np.fft.rfft(x[i:i + n] * win)) for i in range(0, len(x) - n, hop)]
S = 20 * np.log10(np.array(frames).T + 1e-6)
S = S[: int(fmax / (sr / n))][::-1]
S = np.clip((S - (S.max() - 80)) / 80, 0, 1)
img = (np.stack([S ** 0.7, S ** 1.6, 0.35 + 0.65 * S ** 3], axis=2) * 255).astype(np.uint8)
Image.fromarray(img).resize((1200, 400)).save(sys.argv[2])
