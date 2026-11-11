import { useState } from 'react';
import { Dialog as RDialog } from 'radix-ui';
import { houseFill } from '@ludora/shared';
import { Burst } from '../../art/bursts.tsx';
import { Button } from '../../ui/Button.tsx';
import { Stage } from '../../ui/Stage.tsx';
import { HouseCrest } from './emblems.tsx';
import type { House } from './schoolData.ts';

/*
 * "Welcome to your house": shown once, the first time a student opens Ludora after their house is
 * set. One moment: the crest lands and a burst in the house's colour (none with reduced motion,
 * where everything holds still). Closing it tells the server it has been seen.
 */
export function HouseWelcome({ house, onDone }: { house: House; onDone: () => void }) {
  const [open, setOpen] = useState(true);
  const close = () => {
    setOpen(false);
    onDone();
  };
  return (
    <RDialog.Root open={open} onOpenChange={(v) => (v ? setOpen(true) : close())}>
      <RDialog.Portal>
        <RDialog.Overlay className="fixed inset-0 z-50 bg-[var(--scrim)]" />
        <RDialog.Content className="fixed top-1/2 left-1/2 z-50 w-[calc(100vw-32px)] max-w-md -translate-x-1/2 -translate-y-1/2 focus:outline-none" aria-describedby="house-welcome-desc">
          <Stage className="relative flex flex-col items-center gap-4 overflow-hidden rounded-[var(--radius-l)] px-6 pt-10 pb-6 text-center shadow-[0_24px_60px_-12px_rgb(2_5_20/0.6)]">
            <div className="relative data-[state=open]:animate-[pop-in_220ms_var(--ease-out)]" data-state="open">
              <Burst style="house" hue={house.hue} size={260} count={16} />
              <HouseCrest house={house} size={112} className="relative" />
            </div>
            <p className="plate mt-2 px-3 py-1 font-display text-lg font-extrabold italic" style={{ background: houseFill(house.hue) }}>
              <span className="text-on-accent">Welcome</span>
            </p>
            <RDialog.Title className="font-display text-[2.4rem] leading-none font-bold text-balance text-text">You are in {house.name}</RDialog.Title>
            <RDialog.Description id="house-welcome-desc" className="max-w-[34ch] text-text-2">
              Every right answer in a live game or an assignment earns points for {house.name}. Your teacher can give merits too.
            </RDialog.Description>
            <Button variant="primary" size="lg" onClick={close} autoFocus>
              Let’s go
            </Button>
          </Stage>
        </RDialog.Content>
      </RDialog.Portal>
    </RDialog.Root>
  );
}
