import type { ReactNode } from 'react';
import { Link } from 'react-router';
import { Logo } from '../../art/icons.tsx';
import { Glim } from '../../art/glim/Glim.tsx';
import { Stage } from '../../ui/Stage.tsx';
import { AUTH_SCENE, GLIMS, GlimCrowd } from '../home/GlimCrowd.tsx';

/**
 * Sign in, sign up and recovery sit on the dusk sky. The form is a paper card;
 * on wide screens a crowd of Glims gathers on the hill beside it, and on
 * phones three of them peek over the top of the card.
 */
export function AuthLayout({ title, intro, children, footer }: { title: string; intro: ReactNode; children: ReactNode; footer?: ReactNode }) {
  return (
    <Stage className="flex min-h-dvh flex-col">
      <header className="relative z-10 mx-auto w-full max-w-[1180px] px-4 pt-5 sm:px-6 lg:pt-7">
        <Link to="/" aria-label="Ludora home" className="inline-block rounded-[10px]">
          <Logo size={28} />
        </Link>
      </header>
      <div className="mx-auto grid w-full max-w-[1180px] flex-1 grid-cols-1 gap-x-12 px-4 sm:px-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,460px)]">
        <div className="hidden flex-col justify-end lg:flex">
          <p className="mb-3 max-w-[19ch] font-display text-5xl leading-[1.05] font-extrabold">Learn something, win something, collect something.</p>
          <p className="mb-6 text-lg text-text-2">Free to play. Nothing in Ludora is sold for real money.</p>
          <GlimCrowd scene={AUTH_SCENE} ground="wide" aspect="10 / 7.6" className="max-w-[600px]" />
        </div>
        <main className="flex flex-col justify-center py-8 lg:py-12">
          <div className="relative mx-auto w-full max-w-[460px]">
            {/* Phones: three Glims peeking over the card */}
            <div className="pointer-events-none relative z-0 -mb-7 flex items-end justify-center gap-1 lg:hidden" aria-hidden>
              <Glim art={GLIMS.sprig} size={92} rarity="common" pose="wave" />
              <Glim art={GLIMS.lamplighter} size={112} rarity="legendary" aura="legendary" />
              <Glim art={GLIMS.dewdrop} size={88} rarity="common" pose="cheer" />
            </div>
            <div className="paper stage-card relative z-10 p-6 sm:p-8">
              <h1 className="font-display text-3xl leading-tight font-extrabold sm:text-4xl">{title}</h1>
              <p className="mt-2 mb-6 text-text-2">{intro}</p>
              {children}
              {footer ? <div className="mt-7 border-t border-line pt-5 text-sm text-text-2">{footer}</div> : null}
            </div>
            <p className="mt-5 text-center text-sm text-text-2 lg:hidden">Free to play. Nothing in Ludora is sold for real money.</p>
          </div>
        </main>
      </div>
    </Stage>
  );
}
