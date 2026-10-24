import { useCallback, useEffect, useRef, useState, type CSSProperties } from 'react';
import { Dialog as RDialog } from 'radix-ui';
import { X } from 'lucide-react';
import { RARITY_INFO, type GlimArt, type LanternArt, type Rarity } from '@ludora/shared';
import { Lantern } from '../../art/Lantern.tsx';
import { Glim } from '../../art/glim/Glim.tsx';
import { Burst } from '../../art/bursts.tsx';
import { Stage } from '../../ui/Stage.tsx';
import { Button } from '../../ui/Button.tsx';
import { Amount, Skeleton } from '../../ui/primitives.tsx';
import { formatPercent } from '../../ui/game.tsx';
import { prefersReducedMotion } from '../../lib/prefs.ts';
import { formatNumber } from '../../lib/format.ts';
import { RarityPanel, RarityPlate, frameProps } from '../collection/rarity.tsx';
import { OddsBar, usePackDetail } from './odds.tsx';
import { playSfx } from '../../lib/sound/react.tsx';

export interface OpenedGlim {
  item: { id: string; name: string; rarity: Rarity; art: unknown };
  duplicate: boolean;
  quantity: number;
  pity: boolean;
  dustValue: number;
  collectionsCompleted: string[];
}

type Phase = 'charge' | 'burst' | 'reveal';

/**
 * How long the Lantern charges before it opens. The light in it turns the
 * rarity's colour halfway through, and rarer finds hold it a beat longer.
 */
const CHARGE_MS: Record<Rarity, number> = { common: 700, uncommon: 760, rare: 900, epic: 1080, legendary: 1260, mythic: 1400 };
const DROP_MS = 220;
const BURST_MS = 260;

/** Burst colours for each rarity, as hues. */
const RARITY_HUE: Record<Rarity, number> = { common: 225, uncommon: 148, rare: 216, epic: 268, legendary: 40, mythic: 330 };

const rank = (r: Rarity) => RARITY_INFO[r].rank;

/** Rough frequency in words: "about 28 in every 100" or "about 1 in 58". Derived from the server's percentage. */
function frequency(percent: number): string {
  if (percent >= 10) return `about ${Math.round(percent)} in every 100`;
  return `about 1 in ${formatNumber(Math.max(2, Math.round(100 / percent)))}`;
}

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
 * The Lantern reveal, the one big moment of the collecting pages. The result
 * is already decided and saved on the server before this plays; the sequence
 * only shows it, in under two seconds: the Lantern drops in and charges, its
 * light turns the rarity's colour, it flashes open and the Glim lands on a
 * card framed in that colour. Tapping the Lantern skips straight to the card.
 * Under reduced motion the card is shown straight away and nothing moves.
 */
export function PackOpening(props: OpeningProps) {
  const { result, onClose, packName, runKey } = props;
  return (
    <RDialog.Root open={Boolean(result)} onOpenChange={(o) => !o && onClose()}>
      <RDialog.Portal>{result ? <Sequence key={runKey ?? result.item.id} {...props} result={result} packName={packName} /> : null}</RDialog.Portal>
    </RDialog.Root>
  );
}

function Sequence({ lantern, packId, packName, result, onClose, again, onMakeBuddy, isBuddy = false }: OpeningProps & { result: OpenedGlim }) {
  const [reduced] = useState(prefersReducedMotion);
  // Each opening mounts afresh (see the key above), so the first frame is already the right one.
  const [phase, setPhase] = useState<Phase>(reduced || !lantern ? 'reveal' : 'charge');
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);
  const doneRef = useRef<HTMLButtonElement>(null);
  const lanternRef = useRef<HTMLButtonElement>(null);
  const detail = usePackDetail(packId);
  const rarity = result.item.rarity;
  const chargeMs = CHARGE_MS[rarity];

  useEffect(() => {
    if (reduced || !lantern) return;
    const list = [setTimeout(() => setPhase('burst'), chargeMs), setTimeout(() => setPhase('reveal'), chargeMs + BURST_MS)];
    timers.current = list;
    return () => list.forEach(clearTimeout);
  }, [chargeMs, reduced, lantern]);

  const skip = useCallback(() => {
    timers.current.forEach(clearTimeout);
    setPhase('reveal');
  }, []);

  // The sound follows the moments: the charge building, the Lantern opening, then the Glim, grander for rarer ones.
  const stopRise = useRef<() => void>(() => {});
  useEffect(() => {
    if (phase === 'charge') stopRise.current = playSfx('lanternRise', { seconds: chargeMs / 1000 });
    if (phase === 'burst') playSfx('lanternOpen');
    if (phase === 'reveal') {
      stopRise.current();
      playSfx('lanternReveal', { rarity });
    }
  }, [phase, rarity, chargeMs]);
  useEffect(() => () => stopRise.current(), []);

  // Keyboard focus follows the moment: the Lantern while it charges, then Done (which never spends anything).
  useEffect(() => {
    if (phase !== 'reveal') return;
    const t = setTimeout(() => doneRef.current?.focus({ preventScroll: true }), 30);
    return () => clearTimeout(t);
  }, [phase]);

  const color = `var(--r-${rarity})`;
  const big = rank(rarity) >= rank('epic');
  const oddsRow = detail.data?.odds.find((o) => o.rarity === rarity);
  const f = frameProps(rarity);
  const motion = (value: string) => (reduced ? undefined : value);

  const announcement =
    phase === 'reveal' ? `${result.item.name}, ${RARITY_INFO[rarity].label.toLowerCase()} Glim. ${result.duplicate ? `That makes ${result.quantity}.` : 'It is new to you.'}` : `Opening your ${packName}.`;

  return (
    <RDialog.Content
      className="fixed inset-0 z-50 focus:outline-none"
      aria-describedby={undefined}
      onOpenAutoFocus={(e) => {
        e.preventDefault();
        (phase === 'reveal' ? doneRef : lanternRef).current?.focus({ preventScroll: true });
      }}
    >
      <Stage className="h-full">
        <div className="h-full overflow-y-auto">
          <RDialog.Title className="sr-only">Opening your {packName}</RDialog.Title>
          <p role="status" className="sr-only">
            {announcement}
          </p>
          <RDialog.Close className="absolute top-3 right-3 z-30 grid size-11 place-items-center rounded-full bg-white/10 text-white hover:bg-white/20" aria-label="Close">
            <X className="size-6" />
          </RDialog.Close>

          <div className="mx-auto flex min-h-full w-full max-w-md flex-col items-center justify-center px-4 pt-14 pb-6">
            {phase !== 'reveal' && lantern ? (
              <div className="flex w-full flex-col items-center gap-4">
                <span className="plate plate-blue text-[1.4rem] uppercase">
                  <span>{packName}</span>
                </span>
                <div className="relative grid h-[clamp(240px,44dvh,330px)] w-full place-items-center">
                  {/* The light inside, building up: gold at first, then halfway through it turns the rarity's colour. */}
                  <div
                    className="pointer-events-none absolute size-[min(76vw,300px)] rounded-full bg-lantern blur-2xl"
                    style={{ '--tint': color, animation: `pack-charge ${chargeMs}ms ease-in forwards, pack-tint ${chargeMs}ms ease-in forwards` } as CSSProperties}
                    aria-hidden
                  />
                  <button
                    ref={lanternRef}
                    type="button"
                    onClick={skip}
                    className="relative rounded-[var(--radius-l)] focus-visible:outline-offset-8"
                    aria-label="Open the Lantern now"
                    style={{
                      animation:
                        phase === 'burst'
                          ? `pack-out ${BURST_MS}ms ease-in forwards`
                          : `pack-drop ${DROP_MS}ms var(--ease-out) both${big ? `, pack-shake 140ms ease-in-out ${chargeMs - 600}ms 4` : ''}`,
                    }}
                  >
                    <Lantern art={lantern} size={196} lit capClassName={phase === 'burst' ? 'animate-[pack-cap-off_240ms_ease-in_forwards]' : undefined} />
                  </button>
                  {phase === 'burst' ? (
                    <div
                      className="pointer-events-none absolute size-60 rounded-full"
                      style={{ background: `radial-gradient(circle, #fff 0%, #fff 26%, ${color} 54%, transparent 72%)`, animation: `pack-flash ${BURST_MS + 80}ms ease-out forwards` }}
                      aria-hidden
                    />
                  ) : null}
                </div>
                <p className="text-sm text-text-2">Tap the Lantern to open it now.</p>
              </div>
            ) : (
              <div className="flex w-full flex-col items-center gap-3 text-center">
                {/* The card: framed in the rarity's colour, foil from epic up, the Glim big in its own light. */}
                <div className="relative mt-3 w-full max-w-[min(19.5rem,44dvh)]" style={{ animation: motion('pack-card-land 220ms var(--ease-out) both') }}>
                  <div className="pointer-events-none absolute top-1/2 left-1/2 -z-10 size-[min(120vw,560px)] -translate-x-1/2 -translate-y-1/2 rounded-full" style={{ background: `radial-gradient(circle, color-mix(in oklab, ${color} ${big ? 48 : 34}%, transparent) 0%, transparent 62%)` }} aria-hidden />
                  {rank(rarity) >= rank('rare') ? <Burst hue={RARITY_HUE[rarity]} size={big ? 460 : 340} count={big ? 20 : 14} /> : null}
                  <div className={`overflow-hidden p-2 shadow-[0_24px_60px_-20px_rgb(0_0_0/0.8)] [--card-bg:#121a46] ${f.className}`} style={f.style}>
                    <RarityPanel rarity={rarity} tag={false} className="aspect-square w-full">
                      <Glim art={result.item.art as GlimArt} size={240} rarity={rarity} aura={rarity} pose="cheer" className="h-auto w-[88%]" />
                    </RarityPanel>
                    <div className="px-2 pt-3 pb-2">
                      <h2 className="font-display text-[2.5rem] leading-none font-extrabold break-words">{result.item.name}</h2>
                      <p className="mt-1.5 text-sm text-text-2">From a {packName}</p>
                    </div>
                  </div>
                  <RarityPlate rarity={rarity} size="lg" className="absolute -top-5 left-1/2 z-10 -translate-x-1/2 shadow-[0_8px_20px_-8px_rgb(0_0_0/0.7)]" style={{ animation: motion('pack-plate-stamp 200ms var(--ease-out) 120ms both') }} />
                  {!result.duplicate ? (
                    <span className="plate absolute top-6 right-[-0.6rem] z-10 bg-glim text-lg text-on-accent uppercase" style={{ animation: motion('pack-plate-stamp 200ms var(--ease-out) 200ms both') }} aria-hidden>
                      <span>New</span>
                    </span>
                  ) : (
                    <span className="plate absolute top-6 right-[-0.6rem] z-10 text-lg tabular" aria-hidden>
                      <span>×{result.quantity}</span>
                    </span>
                  )}
                </div>

                {/* Words. The status line above announces the moment; this block stays quiet. */}
                <div className="flex w-full flex-col items-center gap-3" style={{ animation: motion('collect-rise-in 220ms var(--ease-out) 160ms both') }}>
                  <p className="text-lg">
                    {result.duplicate ? (
                      <span className="text-text-2">
                        You have {result.quantity} now. Recycle a spare in your collection for <Amount currency="dust" value={result.dustValue} size="sm" className="text-white" /> Glow Dust.
                      </span>
                    ) : (
                      <span className="font-bold text-lantern">New to your collection</span>
                    )}
                  </p>
                  {result.collectionsCompleted.length ? <p className="rounded-[var(--radius-m)] bg-glim px-4 py-2 font-bold text-on-accent">Collection complete. Its reward is in your wallet.</p> : null}

                  <div className="w-full rounded-[var(--radius-m)] border border-white/12 bg-white/[0.06] px-4 py-3 text-left">
                    {detail.data ? (
                      <>
                        <p className="mb-2 text-sm text-text-2">
                          {result.pity ? (
                            <>Guaranteed epic or better: you had opened {detail.data.pity?.every ? formatNumber(detail.data.pity.every - 1) : 'several'} in a row without one. The usual odds for this Lantern:</>
                          ) : oddsRow ? (
                            <>
                              <span className="font-bold text-text">{RARITY_INFO[rarity].label}</span> is a <span className="font-bold text-text tabular">{formatPercent(oddsRow.percent)}</span> chance in a {detail.data.pack.name}, {frequency(oddsRow.percent)}.
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

                  <div className="mt-1 flex w-full flex-wrap justify-center gap-2">
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
              </div>
            )}
          </div>
        </div>
      </Stage>
    </RDialog.Content>
  );
}
