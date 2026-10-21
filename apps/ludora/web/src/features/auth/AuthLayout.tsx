import type { ReactNode } from 'react';
import { Link } from 'react-router';
import { Logo } from '../../art/icons.tsx';
import { Glim } from '../../art/glim/Glim.tsx';
import type { GlimArt } from '@ludora/shared';

const PARADE: GlimArt[] = [
  { kind: 'glim', body: 'bean', hue: 110, accentHue: 80, saturation: 65, eyes: 'happy', mouth: 'smile', pattern: 'belly', topper: 'leaf', cheeks: true },
  { kind: 'glim', body: 'drop', hue: 195, accentHue: 175, saturation: 75, eyes: 'big', mouth: 'o', pattern: 'none', topper: 'none', cheeks: true },
  { kind: 'glim', body: 'owl', hue: 32, accentHue: 18, saturation: 45, eyes: 'curious', mouth: 'smile', pattern: 'belly', topper: 'none', cheeks: true },
  { kind: 'glim', body: 'moth', hue: 270, accentHue: 45, saturation: 70, eyes: 'sparkle', mouth: 'cat', pattern: 'stars', topper: 'none', cheeks: true },
];

export function AuthLayout({ title, intro, children, footer }: { title: string; intro: ReactNode; children: ReactNode; footer?: ReactNode }) {
  return (
    <div className="grid grid-cols-1 min-h-dvh lg:grid-cols-[1fr_minmax(0,520px)]">
      <aside className="relative hidden overflow-hidden bg-sunken lg:flex lg:flex-col lg:justify-between lg:p-10">
        <Link to="/" aria-label="Ludora home">
          <Logo size={28} />
        </Link>
        <div>
          <div className="mb-6 flex items-end gap-2">
            {PARADE.map((art, i) => (
              <div key={i} style={{ transform: `translateY(${i % 2 ? -10 : 0}px)` }}>
                <Glim art={art} size={i === 2 ? 132 : 104} bob />
              </div>
            ))}
          </div>
          <p className="max-w-[36ch] font-display text-3xl leading-tight font-bold text-text">Learn something, win something, collect something.</p>
        </div>
        <p className="text-sm text-text-3">Free to play. Nothing in Ludora is sold for real money.</p>
      </aside>
      <main className="flex flex-col justify-center px-5 py-10 sm:px-10">
        <div className="mx-auto w-full max-w-sm">
          <Link to="/" className="mb-8 inline-block lg:hidden" aria-label="Ludora home">
            <Logo size={26} />
          </Link>
          <h1 className="font-display text-3xl font-extrabold">{title}</h1>
          <p className="mt-2 mb-7 text-text-2">{intro}</p>
          {children}
          {footer ? <div className="mt-8 border-t border-line pt-5 text-sm text-text-2">{footer}</div> : null}
        </div>
      </main>
    </div>
  );
}
