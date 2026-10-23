import { useCallback, useEffect, useId, useRef, useState, type CSSProperties } from 'react';
import { Dialog as RDialog } from 'radix-ui';
import { X } from 'lucide-react';
import { RARITY_INFO, type GlimArt, type LanternArt, type Rarity } from '@ludora/shared';
import { Lantern } from '../../art/Lantern.tsx';
import { Glim } from '../../art/glim/Glim.tsx';
import { Burst } from '../../art/bursts.tsx';
import { Stage } from '../../ui/Stage.tsx';
import { Button } from '../../ui/Button.tsx';
import { Amount, Skeleton } from '../../ui/primitives.tsx';
import { prefersReducedMotion } from '../../lib/prefs.ts';
import { formatNumber } from '../../lib/format.ts';
import { RarityTag, formatPercent } from '../home/kit.tsx';
import { OddsBar, usePackDetail } from './odds.tsx';
import '../home/festival.css';
import { playSfx } from '../../lib/sound/react.tsx';

export interface OpenedGlim {
  item: { id: string; name: string; rarity: Rarity; art: unknown };
  duplicate: boolean;
  quantity: number;
  pity: boolean;
  dustValue: number;
  collectionsCompleted: string[];
}

type Phase = 'arrive' | 'glow' | 'open' | 'reveal';

/** How long the light builds before the Lantern opens. Rarer Glims make it wait a little longer. */
const GLOW_MS: Record<Rarity, number> = { common: 1100, uncommon: 1100, rare: 1300, epic: 1650, legendary: 2000, mythic: 2200 };
const ARRIVE_MS = 750;
const OPEN_MS = 560;

/** Burst colours for each rarity, as hues. */
const RARITY_HUE: Record<Rarity, number> = { common: 230, uncommon: 148, rare: 212, epic: 268, legendary: 40, mythic: 330 };

const rank = (r: Rarity) => RARITY_INFO[r].rank;

/** Rough frequency in words: "about 28 in every 100" or "about 1 in 58". Derived from the server's percentage. */
function frequency(percent: number): string {
  if (percent >= 10) return `about ${Math.round(percent)} in every 100`;
  return `about 1 in ${formatNumber(Math.max(2, Math.round(100 / percent)))}`;
}

/** Light rays behind a rare-or-better Glim, fading out towards the edge. */
function Rays({ color, className = '' }: { color: string; className?: string }) {
  const id = `rays-${useId().replace(/[^a-zA-Z0-9_-]/g, '')}`;
  return (
    <svg viewBox="-100 -100 200 200" className={className} aria-hidden focusable={false}>
      <defs>
        <radialGradient id={`${id}-fade`}>
          <stop offset="20%" stopColor="#fff" stopOpacity="1" />
          <stop offset="100%" stopColor="#fff" stopOpacity="0" />
        </radialGradient>
        <mask id={`${id}-mask`}>
          <circle r="100" fill={`url(#${id}-fade)`} />
        </mask>
      </defs>
      <g mask={`url(#${id}-mask)`} fill={color}>
        {Array.from({ length: 14 }, (_, i) => (
          <path key={i} d="M0 0L-9 -100H9Z" transform={`rotate(${(i * 360) / 14})`} opacity={i % 2 ? 0.55 : 0.85} />
        ))}
      </g>
    </svg>
  );
}

const MOTES = Array.from({ length: 12 }, (_, i) => ({ x: ((i * 37) % 100) - 50, drift: ((i * 53) % 60) - 30, delay: (i * 173) % 1400, size: 4 + (i % 3) * 2 }));

interface OpeningProps {
  lantern: LanternArt | null;
  packId: string | null;
  packName: string;
  result: OpenedGlim | null;
  /** Changes for every opening, so "Open another" starts the sequence again. */
  runKey?: string | undefined;
  onClose: () => void;
  /** Open another of the same Lantern. `note` explains a disabled button. */
  again?: { label: string; disabled: boolean; loading?: boolean; note?: string; onClick: () => void } | undefined;
  onMakeBuddy?: (id: string) => void;
  isBuddy?: boolean;
}

/**
 * The Lantern reveal. The result is already decided and saved on the server
 * before this plays; the sequence only shows it. Under reduced motion the
 * Glim is shown straight away.
 */
export function PackOpening(props: OpeningProps) {
  const { result, onClose, packName, runKey } = props;
  return (
    <RDialog.Root open={Boolean(result)} onOpenChange={(o) => !o && onClose()}>
      <RDialog.Portal>
        {result ? <Sequence key={runKey ?? result.item.id} {...props} result={result} packName={packName} /> : null}
      </RDialog.Portal>
    </RDialog.Root>
  );
}

function Sequence({ lantern, packId, packName, result, onClose, again, onMakeBuddy, isBuddy = false }: OpeningProps & { result: OpenedGlim }) {
  const [reduced] = useState(prefersReducedMotion);
  // Each opening mounts afresh (see the key above), so the first frame is already the right one.
  const [phase, setPhase] = useState<Phase>(reduced ? 'reveal' : 'arrive');
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);
  const doneRef = useRef<HTMLButtonElement>(null);
  const lanternRef = useRef<HTMLButtonElement>(null);
  const detail = usePackDetail(packId);

  useEffect(() => {
    if (reduced) return;
    const glow = GLOW_MS[result.item.rarity];
    const list = [setTimeout(() => setPhase('glow'), ARRIVE_MS), setTimeout(() => setPhase('open'), ARRIVE_MS + glow), setTimeout(() => setPhase('reveal'), ARRIVE_MS + glow + OPEN_MS)];
    timers.current = list;
    return () => list.forEach(clearTimeout);
  }, [result, reduced]);

  const skip = useCallback(() => {
    timers.current.forEach(clearTimeout);
    setPhase('reveal');
  }, []);

  // The sound follows the moments: the light building, the Lantern opening, then the Glim, grander for rarer ones.
  const stopRise = useRef<() => void>(() => {});
  useEffect(() => {
    // The build-up lands as the Lantern opens.
    if (phase === 'glow') stopRise.current = playSfx('lanternRise', { seconds: GLOW_MS[result.item.rarity] / 1000 });
    if (phase === 'open') playSfx('lanternOpen');
    if (phase === 'reveal') {
      stopRise.current();
      playSfx('lanternReveal', { rarity: result.item.rarity });
    }
  }, [phase, result.item.rarity]);
  useEffect(() => () => stopRise.current(), []);

  // Keyboard focus follows the moment: the Lantern while it glows, then Done (which never spends anything).
  useEffect(() => {
    if (phase !== 'reveal') return;
    const t = setTimeout(() => doneRef.current?.focus({ preventScroll: true }), 30);
    return () => clearTimeout(t);
  }, [phase]);

  const rarity = result.item.rarity;
  const color = `var(--r-${rarity})`;
  const big = rank(rarity) >= rank('epic');
  const glowMs = GLOW_MS[rarity];
  const oddsRow = detail.data?.odds.find((o) => o.rarity === rarity);

  const announcement =
    phase === 'reveal'
      ? `${result.item.name}, ${RARITY_INFO[rarity].label.toLowerCase()} Glim. ${result.duplicate ? `That makes ${result.quantity}.` : 'It is new to you.'}`
      : `Your ${packName} is glowing.`;

  return (
    <RDialog.Content
      className="fixed inset-0 z-50 focus:outline-none"
      aria-describedby={undefined}
      onOpenAutoFocus={(e) => {
        e.preventDefault();
        (phase === 'reveal' ? doneRef : lanternRef).current?.focus({ preventScroll: true });
      }}
    >
      <Stage className="h-full animate-[fx-fade-in_220ms_ease-out]">
        <div className="h-full overflow-y-auto">
          <RDialog.Title className="sr-only">Opening your {packName}</RDialog.Title>
          <p role="status" className="sr-only">
            {announcement}
          </p>
          <RDialog.Close className="absolute top-3 right-3 z-30 grid size-11 place-items-center rounded-full border-2 border-white/30 bg-white/10 text-white hover:bg-white/20" aria-label="Close">
            <X className="size-6" />
          </RDialog.Close>

          <div className="mx-auto flex min-h-full w-full max-w-xl flex-col items-center justify-center px-5 pt-12 pb-6">
            {/* The art: the Lantern while it glows, then the Glim */}
            <div className="relative grid h-[clamp(220px,38dvh,310px)] w-full place-items-center">
              {phase !== 'reveal' && lantern ? (
                <div className="absolute inset-x-0 top-0 bottom-0 flex flex-col items-center">
                  <div className={phase === 'arrive' ? 'fx-lower' : ''} style={phase === 'arrive' ? { animationDuration: `${ARRIVE_MS + 300}ms` } : undefined}>
                    <div className={phase === 'glow' ? (big ? 'origin-top animate-[fx-shake_520ms_ease-in-out_infinite]' : 'fx-sway') : ''} style={phase === 'glow' && !big ? { animationDuration: '1.8s' } : undefined}>
                      <div className="mx-auto h-[6dvh] min-h-6 w-[3px] bg-[#120b3d]" />
                      <div className="relative">
                        {/* The light inside, building up; for epic and better it turns the rarity's colour */}
                        <div
                          className="absolute inset-[-28%] rounded-full blur-2xl"
                          style={
                            {
                              background: big && phase !== 'arrive' ? color : '#ffcf5c',
                              transition: big ? `background-color ${glowMs * 0.5}ms ease-in ${glowMs * 0.35}ms` : undefined,
                              animation: phase === 'glow' || phase === 'open' ? `fx-build ${glowMs}ms ease-in forwards` : undefined,
                              opacity: phase === 'arrive' ? 0.35 : undefined,
                            } as CSSProperties
                          }
                          aria-hidden
                        />
                        <button
                          ref={lanternRef}
                          type="button"
                          onClick={skip}
                          className="relative block rounded-[28px] focus-visible:outline-offset-8"
                          aria-label="Open the Lantern now"
                          style={phase === 'open' ? { animation: `fx-lantern-out ${OPEN_MS}ms ease-in forwards` } : undefined}
                        >
                          <Lantern art={lantern} size={190} lit capClassName={phase === 'open' ? 'animate-[fx-cap-off_420ms_ease-in_forwards]' : undefined} glowClassName="animate-[fx-flicker_900ms_ease-in-out_infinite]" />
                        </button>
                      </div>
                    </div>
                  </div>
                  {/* Motes of light rising */}
                  {phase === 'glow' ? (
                    <div className="pointer-events-none absolute top-[52%] left-1/2" aria-hidden>
                      {MOTES.map((m, i) => (
                        <span
                          key={i}
                          className="absolute rounded-full"
                          style={
                            {
                              left: m.x,
                              width: m.size,
                              height: m.size,
                              background: i % 3 === 0 && big ? color : '#ffe9a8',
                              boxShadow: '0 0 8px 2px rgb(255 220 140 / 0.7)',
                              '--mx': `${m.drift}px`,
                              animation: `fx-mote 1600ms ease-out ${m.delay}ms infinite both`,
                            } as CSSProperties
                          }
                        />
                      ))}
                    </div>
                  ) : null}
                  {phase === 'open' ? (
                    <div className="pointer-events-none absolute top-[56%] left-1/2 size-56 -translate-x-1/2 -translate-y-1/2" aria-hidden>
                      <div className="absolute inset-0 rounded-full" style={{ background: `radial-gradient(circle, #fff 0%, #fff 30%, ${big ? color : '#ffd36b'} 55%, transparent 72%)`, animation: `fx-flash ${OPEN_MS + 120}ms ease-out forwards` }} />
                    </div>
                  ) : null}
                </div>
              ) : null}

              {phase === 'reveal' ? (
                <div className="relative grid size-full place-items-center">
                  {rank(rarity) >= rank('rare') ? (
                    <div className="pointer-events-none absolute top-1/2 left-1/2 size-[min(130vw,560px)] -translate-x-1/2 -translate-y-1/2 animate-[fx-fade-in_600ms_ease-out_both]" aria-hidden>
                      <Rays color={rarity === 'mythic' ? '#ff9fd0' : color} className={`size-full animate-[fx-spin_40s_linear_infinite] ${rarity === 'mythic' ? 'opacity-90' : 'opacity-70'}`} />
                    </div>
                  ) : null}
                  {/* Every Glim comes out in a pool of its own light; rarer ones bring rays and a burst */}
                  <div className="pointer-events-none absolute top-1/2 left-1/2 size-[min(70vw,300px)] -translate-x-1/2 -translate-y-1/2 rounded-full bg-[#fff3c4] opacity-25 blur-3xl" aria-hidden />
                  {big ? <Burst style="stars" hue={RARITY_HUE[rarity]} size={440} /> : rank(rarity) >= rank('uncommon') || !result.duplicate ? <Burst style="sparkle" hue={RARITY_HUE[rarity]} size={320} /> : null}
                  <div className={`relative ${reduced ? '' : 'animate-[fx-reveal_720ms_var(--ease-out)_both]'}`}>
                    <Glim art={result.item.art as GlimArt} size={240} aura={rarity} rarity={rarity} pose="cheer" bob className="h-auto w-[min(58vw,240px)]" />
                    {!result.duplicate ? (
                      <span className="absolute top-2 -right-3 rotate-[-3deg] rounded-[12px] border-[2.5px] border-ink bg-glim px-3 py-0.5 font-display text-xl font-extrabold text-on-accent shadow-[0_3px_0_var(--ink)] animate-[fx-stamp_420ms_var(--ease-out)_300ms_both]" aria-hidden>
                        New!
                      </span>
                    ) : null}
                  </div>
                </div>
              ) : null}
            </div>

            {/* Words. The status line above announces the moment; this block stays quiet. */}
            <div className="w-full text-center">
              {phase === 'reveal' ? (
                <div className={`flex flex-col items-center gap-2.5 ${reduced ? '' : 'animate-[fx-fade-in_350ms_ease-out_both]'}`}>
                  <RarityTag rarity={rarity} size="lg" />
                  <h2 className="font-display text-4xl leading-none font-extrabold sm:text-5xl">{result.item.name}</h2>
                  <p className="text-lg text-text-2">
                    {result.duplicate ? (
                      <>
                        You have {result.quantity} now. Recycle a spare in your collection for <Amount currency="dust" value={result.dustValue} size="sm" className="text-white" /> Glow Dust.
                      </>
                    ) : (
                      <span className="font-bold text-[#ffe08a]">New to your collection</span>
                    )}
                  </p>
                  {result.collectionsCompleted.length ? <p className="rounded-full border-2 border-ink bg-glim px-4 py-1 font-bold text-on-accent">Collection complete! Its reward is in your wallet.</p> : null}

                  <div className="w-full max-w-md rounded-[18px] border border-white/20 bg-[rgb(12_8_48/0.35)] px-4 py-2.5 text-left">
                    {detail.data ? (
                      <>
                        <p className="mb-2 text-sm text-text-2">
                          {result.pity ? (
                            <>This one was guaranteed to be epic or better, because you had opened {detail.data.pity?.every ? formatNumber(detail.data.pity.every - 1) : 'several'} in a row without one. The usual odds for this Lantern:</>
                          ) : oddsRow ? (
                            <>
                              <span className="font-bold text-text">{RARITY_INFO[rarity].label}</span> is a {formatPercent(oddsRow.percent)} chance in a {detail.data.pack.name}, {frequency(oddsRow.percent)}.
                            </>
                          ) : (
                            <>The odds for this Lantern:</>
                          )}
                        </p>
                        <OddsBar odds={detail.data.odds} highlight={result.pity ? null : rarity} compact />
                      </>
                    ) : detail.isError ? (
                      <p className="text-sm text-text-2">The odds for this Lantern are on its card in the shop.</p>
                    ) : (
                      <Skeleton className="h-12 bg-white/10" />
                    )}
                  </div>

                  <div className="mt-1.5 flex w-full flex-wrap justify-center gap-2">
                    {again ? (
                      <Button variant="primary" size="lg" onClick={again.onClick} disabled={again.disabled} loading={again.loading}>
                        {again.label}
                      </Button>
                    ) : null}
                    {onMakeBuddy && !result.duplicate ? (
                      <Button size="lg" onClick={() => onMakeBuddy(result.item.id)} disabled={isBuddy}>
                        {isBuddy ? 'Your buddy now' : 'Make my buddy'}
                      </Button>
                    ) : null}
                    <Button ref={doneRef} size="lg" variant="ghost" className="text-white hover:bg-white/12 hover:text-white" onClick={onClose}>
                      Done
                    </Button>
                  </div>
                  {again?.note ? <p className="text-sm text-text-2">{again.note}</p> : null}
                </div>
              ) : (
                <div className="flex flex-col items-center gap-1 pt-4">
                  <p className="font-display text-2xl font-bold">{phase === 'open' ? 'Here it comes!' : `Your ${packName} is glowing`}</p>
                  <p className="text-sm text-text-2">Tap the Lantern to open it now.</p>
                </div>
              )}
            </div>
          </div>
        </div>
      </Stage>
    </RDialog.Content>
  );
}
