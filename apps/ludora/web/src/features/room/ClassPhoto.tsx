import { useEffect, useRef, useState } from 'react';
import { Camera, Download } from 'lucide-react';
import type { RoomView } from '@ludora/shared';
import { Button } from '../../ui/Button.tsx';
import { Dialog } from '../../ui/primitives.tsx';
import { PlayerGlim } from './game/stage.tsx';
import { plural } from '../../lib/format.ts';

/*
 * The class photo: every Glim in the room on the stage, in rows like a school
 * photograph, as a picture the teacher can download. No names unless the host
 * ticks "Show first names" (never when names are hidden on the big screen).
 * Drawn in the browser on a canvas from the Glims already on the page; nothing
 * is uploaded anywhere.
 */

const W = 1600;
const H = 900;

/** The first word of a name: a photo for the classroom wall carries no surnames. */
export function firstName(name: string): string {
  return name.trim().split(/\s+/)[0] ?? '';
}

/** Where each Glim stands: rows from the back (small, high) to the front (large, low), centred. */
export function photoLayout(n: number, width = W, height = H): { x: number; y: number; size: number }[] {
  if (n <= 0) return [];
  const perRow = Math.min(n, n <= 8 ? 8 : n <= 24 ? 12 : 15);
  const rows = Math.ceil(n / perRow);
  const out: { x: number; y: number; size: number }[] = [];
  const top = height * 0.2;
  const bottom = height * 0.9;
  const rowGap = (bottom - top) / rows;
  let placed = 0;
  for (let r = 0; r < rows; r++) {
    // Rows share the class evenly (the back row a little shorter), so nobody stands alone in a row.
    const inRow = Math.floor((n - placed) / (rows - r));
    const depth = rows === 1 ? 1 : 0.78 + (0.22 * r) / (rows - 1);
    const size = Math.min(300, (width * 0.86) / perRow, rowGap * 1.15) * depth;
    const span = inRow * size * 0.92;
    const x0 = (width - span) / 2 + (r % 2 ? size * 0.2 : 0);
    const y = top + rowGap * (r + 1) - size * 0.25;
    for (let i = 0; i < inRow; i++) out.push({ x: x0 + i * size * 0.92, y: y - size, size });
    placed += inRow;
  }
  return out;
}

/** An SVG on the page as a standalone picture: the page's colour variables written in, so it draws the same off the page. */
function svgImage(svg: SVGSVGElement): Promise<HTMLImageElement> {
  const css = getComputedStyle(document.documentElement);
  const text = new XMLSerializer()
    .serializeToString(svg)
    .replace(/var\((--[\w-]+)(?:,[^)]*)?\)/g, (_m, name: string) => css.getPropertyValue(name).trim() || '#9aa5c4');
  const withNs = text.includes('xmlns=') ? text : text.replace('<svg', '<svg xmlns="http://www.w3.org/2000/svg"');
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(withNs)}`;
  });
}

async function drawPhoto(canvas: HTMLCanvasElement, svgs: SVGSVGElement[], names: string[] | null, title: string) {
  const ctx = canvas.getContext('2d');
  if (!ctx) return;
  canvas.width = W;
  canvas.height = H;
  // The stage: midnight navy, a floodlight from the top centre, arena glows low in the corners.
  const sky = ctx.createLinearGradient(0, 0, 0, H);
  sky.addColorStop(0, '#121c55');
  sky.addColorStop(0.55, '#0b1236');
  sky.addColorStop(1, '#070a20');
  ctx.fillStyle = sky;
  ctx.fillRect(0, 0, W, H);
  const glow = (x: number, y: number, r: number, colour: string) => {
    const g = ctx.createRadialGradient(x, y, 0, x, y, r);
    g.addColorStop(0, colour);
    g.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, H);
  };
  glow(W / 2, -60, 760, 'rgba(84,128,255,0.45)');
  glow(0, H, 620, 'rgba(34,207,195,0.16)');
  glow(W, H, 620, 'rgba(160,124,255,0.16)');
  // The stage floor.
  ctx.fillStyle = 'rgba(58,107,255,0.14)';
  ctx.beginPath();
  ctx.ellipse(W / 2, H * 0.93, W * 0.48, H * 0.1, 0, 0, Math.PI * 2);
  ctx.fill();
  await document.fonts?.ready;
  ctx.fillStyle = '#ffffff';
  ctx.font = "800 64px 'Barlow Condensed', sans-serif";
  ctx.textBaseline = 'top';
  ctx.fillText(title, 64, 48);
  ctx.font = "700 30px 'Atkinson Hyperlegible Next Variable', sans-serif";
  ctx.fillStyle = '#c9d4f5';
  ctx.fillText(new Date().toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' }), 64, 120);
  const spots = photoLayout(svgs.length);
  const images = await Promise.all(svgs.map((s) => svgImage(s).catch(() => null)));
  spots.forEach((spot, i) => {
    const img = images[i];
    if (img) ctx.drawImage(img, spot.x, spot.y, spot.size, spot.size);
    const name = names?.[i];
    if (name) {
      ctx.font = `700 ${Math.max(16, Math.round(spot.size * 0.15))}px 'Atkinson Hyperlegible Next Variable', sans-serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'top';
      const w = ctx.measureText(name).width + 16;
      const cx = spot.x + spot.size / 2;
      const cy = spot.y + spot.size * 0.93;
      ctx.fillStyle = 'rgba(7,10,32,0.85)';
      ctx.fillRect(cx - w / 2, cy, w, spot.size * 0.15 + 8);
      ctx.fillStyle = '#ffffff';
      ctx.fillText(name, cx, cy + 4);
      ctx.textAlign = 'start';
    }
  });
}

/** The host's "Class photo" button on the results, with a preview and the download. */
export function ClassPhotoButton({ room }: { room: RoomView }) {
  const [open, setOpen] = useState(false);
  const [names, setNames] = useState(false);
  const [preview, setPreview] = useState<string | null>(null);
  const glims = useRef<HTMLDivElement>(null);
  const canvas = useRef<HTMLCanvasElement | null>(null);
  const hidden = Boolean(room.room.options.hideNames);
  const people = room.players.filter((p) => !p.isBot);
  const crowd = people.length ? people : room.players;
  const showNames = names && !hidden;
  useEffect(() => {
    if (!open) return;
    let live = true;
    // The Glims render first (below), then the photo is drawn from them.
    const t = setTimeout(async () => {
      const svgs = Array.from(glims.current?.querySelectorAll('svg') ?? []) as SVGSVGElement[];
      canvas.current ??= document.createElement('canvas');
      await drawPhoto(canvas.current, svgs, showNames ? crowd.map((p) => firstName(p.name)) : null, room.room.title);
      if (live) setPreview(canvas.current.toDataURL('image/png'));
    }, 60);
    return () => {
      live = false;
      clearTimeout(t);
    };
    // The crowd is fixed once the game has ended.
  }, [open, showNames]);
  const download = () => {
    canvas.current?.toBlob((blob) => {
      if (!blob) return;
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = `ludora-${room.room.code}-class-photo.png`;
      a.click();
      setTimeout(() => URL.revokeObjectURL(a.href), 1000);
    }, 'image/png');
  };
  return (
    <>
      <Button size="lg" className="grow" icon={<Camera className="size-5" aria-hidden />} onClick={() => setOpen(true)}>
        Class photo
      </Button>
      <Dialog
        open={open}
        onOpenChange={(v) => {
          setOpen(v);
          if (!v) setPreview(null);
        }}
        size="lg"
        title="Class photo"
        description={`Every Glim in the game on the stage (${plural(crowd.length, 'player')}). Names are left off unless you add first names.`}
        footer={
          <Button variant="primary" icon={<Download className="size-4" aria-hidden />} onClick={download} disabled={!preview}>
            Download photo
          </Button>
        }
      >
        <div className="flex flex-col gap-3">
          <label className={`flex min-h-11 items-center gap-2.5 font-semibold ${hidden ? 'text-text-3' : ''}`}>
            <input type="checkbox" className="size-5 accent-[var(--lantern)]" checked={showNames} disabled={hidden} onChange={(e) => setNames(e.target.checked)} />
            {hidden ? 'Names are hidden in this room, so the photo has none' : 'Show first names'}
          </label>
          <div className="stage grid aspect-video w-full place-items-center overflow-hidden rounded-[var(--radius-m)]">
            {preview ? <img src={preview} alt={`Class photo: ${crowd.length} ${crowd.length === 1 ? 'Glim' : 'Glims'} on the stage${showNames ? ', with first names' : ''}.`} className="block size-full" /> : <span className="font-semibold text-white">Taking the photo…</span>}
          </div>
        </div>
        {/* The Glims the photo is drawn from, off screen. */}
        <div ref={glims} className="pointer-events-none fixed -left-[10000px] top-0" aria-hidden>
          {open ? crowd.map((p) => <PlayerGlim key={p.id} avatar={p.avatar} seed={p.id} size={240} pose="cheer" />) : null}
        </div>
      </Dialog>
    </>
  );
}
