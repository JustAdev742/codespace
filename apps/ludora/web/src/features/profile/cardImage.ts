/*
 * The profile card as a picture to keep: drawn on a canvas from the card's own Glim (its SVG,
 * with the page's colour tokens filled in) and the player's name, title and level, in the
 * display face. Made in the browser; nothing is uploaded.
 */

const W = 800;
const H = 1000;

/** An SVG drawn as an image cannot see the page's CSS variables, so put their values in. */
export function inlineVars(svg: string, style: CSSStyleDeclaration): string {
  return svg.replace(/var\((--[\w-]+)(?:,([^)]*))?\)/g, (_m, name: string, fallback?: string) => style.getPropertyValue(name).trim() || fallback?.trim() || 'transparent');
}

function loadSvg(svg: SVGSVGElement): Promise<HTMLImageElement> {
  const clone = svg.cloneNode(true) as SVGSVGElement;
  clone.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
  clone.setAttribute('width', '600');
  clone.setAttribute('height', '600');
  clone.removeAttribute('class');
  const markup = inlineVars(new XMLSerializer().serializeToString(clone), getComputedStyle(document.documentElement));
  const url = URL.createObjectURL(new Blob([markup], { type: 'image/svg+xml' }));
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      resolve(img);
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('The Glim could not be drawn.'));
    };
    img.src = url;
  });
}

/** Shrink a font until the text fits the width. */
function fit(ctx: CanvasRenderingContext2D, text: string, weight: string, start: number, max: number, face: string): number {
  let size = start;
  ctx.font = `${weight} ${size}px ${face}`;
  while (size > 24 && ctx.measureText(text).width > max) {
    size -= 4;
    ctx.font = `${weight} ${size}px ${face}`;
  }
  return size;
}

export async function drawCard(opts: { glim: SVGSVGElement | null; name: string; title: string | null; level: number | null; hue: number | null }): Promise<Blob> {
  const canvas = document.createElement('canvas');
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('This browser cannot make pictures.');
  const face = getComputedStyle(document.documentElement).getPropertyValue('--face-display').trim() || 'sans-serif';
  await document.fonts?.ready;

  // The stage, tinted by the card's theme when it has one.
  const bg = ctx.createLinearGradient(0, 0, 0, H);
  bg.addColorStop(0, opts.hue === null ? '#121c55' : `hsl(${opts.hue} 58% 34%)`);
  bg.addColorStop(0.6, opts.hue === null ? '#0b1236' : `hsl(${opts.hue} 55% 18%)`);
  bg.addColorStop(1, '#070a20');
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, W, H);
  const glow = ctx.createRadialGradient(W / 2, 0, 0, W / 2, 0, 520);
  glow.addColorStop(0, 'rgba(84,128,255,0.5)');
  glow.addColorStop(1, 'rgba(58,107,255,0)');
  ctx.fillStyle = glow;
  ctx.fillRect(0, 0, W, H);

  if (opts.glim) ctx.drawImage(await loadSvg(opts.glim), W / 2 - 280, 70, 560, 560);

  ctx.textAlign = 'center';
  ctx.textBaseline = 'alphabetic';
  ctx.fillStyle = '#ffffff';
  const nameSize = fit(ctx, opts.name, '800', 96, W - 100, face);
  ctx.fillText(opts.name, W / 2, 720 + nameSize * 0.25);

  let y = 790;
  if (opts.title) {
    // The slanted gold plate, with ink text.
    const size = fit(ctx, opts.title, '700', 40, W - 220, face);
    const tw = ctx.measureText(opts.title).width + 56;
    ctx.save();
    ctx.translate(W / 2, y);
    ctx.transform(1, 0, -0.18, 1, 0, 0);
    ctx.fillStyle = '#ffc233';
    ctx.fillRect(-tw / 2, -size * 0.85, tw, size * 1.3);
    ctx.restore();
    ctx.fillStyle = '#0b1020';
    ctx.fillText(opts.title, W / 2, y + size * 0.2);
    y += 80;
  }
  if (opts.level) {
    ctx.font = `700 40px ${face}`;
    ctx.fillStyle = 'rgba(255,255,255,0.85)';
    ctx.fillText(`Level ${opts.level}`, W / 2, y + 20);
  }
  ctx.font = `700 28px ${face}`;
  ctx.fillStyle = 'rgba(255,255,255,0.6)';
  ctx.fillText('Ludora', W / 2, H - 40);

  return new Promise((resolve, reject) => canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('The picture could not be made.'))), 'image/png'));
}

/** Save a blob with a file name, through a temporary link. */
export function saveBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
