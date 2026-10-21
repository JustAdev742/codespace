import { useEffect, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { Dialog as RDialog } from 'radix-ui';
import { Sparkles, X } from 'lucide-react';
import { RARITY_INFO, type GlimArt, type LanternArt, type Rarity } from '@ludora/shared';
import { Lantern } from '../../art/Lantern.tsx';
import { Glim } from '../../art/glim/Glim.tsx';
import { Button } from '../../ui/Button.tsx';
import { Amount, RarityBadge } from '../../ui/primitives.tsx';
import { prefersReducedMotion } from '../../lib/prefs.ts';

export interface OpenedGlim {
  item: { id: string; name: string; rarity: Rarity; art: unknown };
  duplicate: boolean;
  quantity: number;
  pity: boolean;
  dustValue: number;
  collectionsCompleted: string[];
}

const BIG: Rarity[] = ['epic', 'legendary', 'mythic'];

/**
 * The Lantern reveal. The result is already decided and saved on the
 * server before this plays; the animation only shows it.
 */
export function PackOpening({ lantern, result, onClose, onAgain, againLabel, againDisabled, onMakeBuddy }: { lantern: LanternArt | null; result: OpenedGlim | null; onClose: () => void; onAgain?: () => void; againLabel?: string; againDisabled?: boolean; onMakeBuddy?: (id: string) => void }) {
  const reduced = prefersReducedMotion();
  const [stage, setStage] = useState<'lantern' | 'burst' | 'reveal'>('lantern');
  useEffect(() => {
    if (!result) return;
    setStage(reduced ? 'reveal' : 'lantern');
    if (reduced) return;
    const big = BIG.includes(result.item.rarity);
    const t1 = setTimeout(() => setStage('burst'), big ? 1300 : 900);
    const t2 = setTimeout(() => setStage('reveal'), big ? 1800 : 1250);
    return () => {
      clearTimeout(t1);
      clearTimeout(t2);
    };
  }, [result, reduced]);

  const open = Boolean(result);
  const rarity = result?.item.rarity;
  const color = rarity ? `var(--r-${rarity})` : 'var(--lantern)';
  return (
    <RDialog.Root open={open} onOpenChange={(o) => !o && onClose()}>
      <RDialog.Portal>
        <RDialog.Overlay className="fixed inset-0 z-50 bg-[rgb(8_6_26/0.88)] backdrop-blur-sm" />
        <RDialog.Content className="fixed inset-0 z-50 flex flex-col items-center justify-center gap-6 p-6 focus:outline-none" aria-describedby={undefined}>
          <RDialog.Title className="sr-only">Lantern opening</RDialog.Title>
          <RDialog.Close className="absolute top-4 right-4 rounded-[12px] p-2 text-white/70 hover:bg-white/10 hover:text-white" aria-label="Close">
            <X className="size-6" />
          </RDialog.Close>
          <div className="relative grid h-[300px] w-[300px] place-items-center">
            <AnimatePresence mode="wait">
              {stage !== 'reveal' && lantern ? (
                <motion.div
                  key="lantern"
                  initial={{ scale: 0.8, opacity: 0 }}
                  animate={stage === 'burst' ? { scale: 1.25, opacity: 0, y: -30 } : { scale: 1, opacity: 1, rotate: [0, -4, 4, -3, 3, 0], y: [0, -6, 0] }}
                  transition={stage === 'burst' ? { duration: 0.4 } : { duration: 0.9, repeat: Infinity }}
                  exit={{ opacity: 0 }}
                >
                  <Lantern art={lantern} size={170} lit />
                </motion.div>
              ) : null}
              {stage === 'reveal' && result ? (
                <motion.div key="glim" initial={reduced ? { opacity: 0 } : { scale: 0.3, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} transition={reduced ? { duration: 0.2 } : { type: 'spring', stiffness: 260, damping: 15 }} className="relative grid place-items-center">
                  {!reduced && BIG.includes(result.item.rarity) ? (
                    <motion.div className="absolute inset-[-60px] rounded-full" style={{ background: `conic-gradient(from 0deg, transparent, ${color}, transparent 30%, ${color}, transparent 60%, ${color}, transparent)`, opacity: 0.35 }} animate={{ rotate: 360 }} transition={{ duration: 8, repeat: Infinity, ease: 'linear' }} />
                  ) : null}
                  <Glim art={result.item.art as GlimArt} size={240} aura={result.item.rarity} bob />
                </motion.div>
              ) : null}
            </AnimatePresence>
            {stage === 'burst' ? <motion.div className="pointer-events-none absolute inset-0 rounded-full" initial={{ scale: 0.2, opacity: 0.9 }} animate={{ scale: 2.2, opacity: 0 }} transition={{ duration: 0.5 }} style={{ background: `radial-gradient(circle, #fff 0%, ${color} 35%, transparent 70%)` }} /> : null}
          </div>
          <div className="min-h-[150px] text-center text-white" aria-live="polite">
            {stage === 'reveal' && result ? (
              <motion.div initial={reduced ? false : { y: 12, opacity: 0 }} animate={{ y: 0, opacity: 1 }} className="flex flex-col items-center gap-2">
                <RarityBadge rarity={result.item.rarity} />
                <h2 className="font-display text-4xl font-extrabold">{result.item.name}</h2>
                <p className="text-white/80">
                  {result.duplicate ? (
                    <>
                      You have {result.quantity} now. Recycle a spare for <Amount currency="dust" value={result.dustValue} size="sm" />.
                    </>
                  ) : (
                    <span className="inline-flex items-center gap-1.5 font-semibold text-[#ffd77a]">
                      <Sparkles className="size-4" /> New to your collection
                    </span>
                  )}
                </p>
                {result.pity ? <p className="text-sm text-white/70">Guaranteed {RARITY_INFO[result.item.rarity].label.toLowerCase()} or better: you had not had one for a while.</p> : null}
                {result.collectionsCompleted.length ? <p className="font-semibold text-[#7df0cb]">Collection complete! Its reward is in your wallet.</p> : null}
                <div className="mt-3 flex flex-wrap justify-center gap-2">
                  {onAgain ? (
                    <Button variant="primary" size="lg" onClick={onAgain} disabled={againDisabled}>
                      {againLabel ?? 'Open another'}
                    </Button>
                  ) : null}
                  {onMakeBuddy && !result.duplicate ? (
                    <Button size="lg" onClick={() => onMakeBuddy(result.item.id)}>
                      Make my buddy
                    </Button>
                  ) : null}
                  <Button size="lg" variant="ghost" className="text-white hover:bg-white/10" onClick={onClose}>
                    Done
                  </Button>
                </div>
              </motion.div>
            ) : (
              <p className="pt-10 font-display text-xl text-white/80">The Lantern is glowing…</p>
            )}
          </div>
        </RDialog.Content>
      </RDialog.Portal>
    </RDialog.Root>
  );
}
