import { useEffect, useState } from 'react';

/*
 * A QR code drawn in the browser as an SVG: dark squares on white, with the quiet zone a scanner
 * needs. The encoder is loaded only when a QR code is shown, so it stays out of the first load.
 */

type Matrix = boolean[][];

async function encode(text: string): Promise<Matrix> {
  const { default: qrcode } = await import('qrcode-generator');
  // Medium error correction: still reads from the back of a room with a glare on the projector.
  const qr = qrcode(0, 'M');
  qr.addData(text);
  qr.make();
  const n = qr.getModuleCount();
  return Array.from({ length: n }, (_, r) => Array.from({ length: n }, (_, c) => qr.isDark(r, c)));
}

export function QrCode({ text, label, className = '' }: { text: string; label: string; className?: string }) {
  const [matrix, setMatrix] = useState<Matrix | null>(null);
  useEffect(() => {
    let live = true;
    encode(text)
      .then((m) => live && setMatrix(m))
      .catch(() => live && setMatrix(null));
    return () => {
      live = false;
    };
  }, [text]);
  const n = matrix?.length ?? 0;
  const quiet = 4;
  const size = n + quiet * 2;
  return (
    <div className={`aspect-square rounded-[var(--radius-m)] bg-white ${className}`}>
      {matrix ? (
        <svg viewBox={`0 0 ${size} ${size}`} role="img" aria-label={label} className="block size-full" shapeRendering="crispEdges">
          <path
            fill="#0B1020"
            d={matrix.flatMap((row, r) => row.map((dark, c) => (dark ? `M${c + quiet} ${r + quiet}h1v1h-1z` : ''))).join('')}
          />
        </svg>
      ) : (
        <span className="sr-only">{label}</span>
      )}
    </div>
  );
}
