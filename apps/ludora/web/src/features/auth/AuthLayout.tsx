import type { ReactNode } from 'react';
import { Link } from 'react-router';
import { Sparkles, Swords, Target } from 'lucide-react';
import { Logo } from '../../art/icons.tsx';
import { Stage } from '../../ui/Stage.tsx';

/** What an account gets you, beside the form on wide screens. */
const PERKS = [
  { icon: Swords, text: 'Live games with your whole class, on any device' },
  { icon: Target, text: 'New quests every day and every week' },
  { icon: Sparkles, text: 'Glims to collect, from common to mythic' },
];

/**
 * Sign in, sign up and recovery sit on the stage. The form is a white paper
 * card; on wide screens the reasons to have an account stand beside it.
 */
export function AuthLayout({ title, intro, children, footer }: { title: string; intro: ReactNode; children: ReactNode; footer?: ReactNode }) {
  return (
    <Stage className="flex min-h-dvh flex-col">
      <header className="relative z-10 mx-auto w-full max-w-[1180px] px-4 pt-5 sm:px-6 lg:pt-7">
        <Link to="/" aria-label="Ludora home" className="inline-block rounded-[var(--radius-s)]">
          <Logo size={28} />
        </Link>
      </header>
      <div className="mx-auto grid w-full max-w-[1180px] flex-1 grid-cols-1 items-center gap-x-16 px-4 sm:px-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,460px)]">
        <div className="hidden lg:block">
          <p className="max-w-[20ch] font-display text-[3.4rem] leading-[0.95] font-extrabold">
            Learn something. <span className="text-lantern">Win something.</span> Collect something.
          </p>
          <ul className="mt-8 flex flex-col gap-3.5">
            {PERKS.map(({ icon: Icon, text }) => (
              <li key={text} className="flex items-center gap-3 text-lg text-text-2">
                <span className="grid size-9 shrink-0 place-items-center rounded-[var(--radius-s)] bg-white/[0.08] text-lantern">
                  <Icon className="size-5" aria-hidden />
                </span>
                {text}
              </li>
            ))}
          </ul>
          <p className="mt-8 font-semibold">Free to play. Nothing in Ludora is sold for real money.</p>
        </div>
        <main className="flex flex-col justify-center py-8 lg:py-12">
          <div className="mx-auto w-full max-w-[460px]">
            <div className="paper stage-card p-6 sm:p-8">
              <h1 className="font-display text-[2.25rem] leading-none font-bold sm:text-[2.6rem]">{title}</h1>
              <p className="mt-3 mb-6 text-text-2">{intro}</p>
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
