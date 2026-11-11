import { useState } from 'react';
import { Accessibility } from 'lucide-react';
import { IconButton } from '../../../ui/Button.tsx';
import { Dialog } from '../../../ui/primitives.tsx';
import { SETTINGS, SettingsList } from '../../settings/AccessSettings.tsx';
import { usePrefs } from '../../../lib/usePrefs.ts';

const GAME_SETTINGS = SETTINGS.filter((d) => d.inGame);

/**
 * The settings that matter mid-game, one tap from the game's header: read aloud, the timer, tiles,
 * calm mode, bigger text... Students often play signed out on a shared Chromebook, so these save to
 * this device then, and to the account when signed in.
 */
export function ComfortButton({ className = '' }: { className?: string }) {
  const [open, setOpen] = useState(false);
  const { signedIn } = usePrefs();
  return (
    <>
      <IconButton label="Comfort settings" size="sm" className={className} onClick={() => setOpen(true)}>
        <Accessibility className="size-4" aria-hidden />
      </IconButton>
      <Dialog open={open} onOpenChange={setOpen} title="Comfort settings" description={signedIn ? 'Saved to your account. More in Settings.' : 'Saved on this device. More in Settings.'} size="md">
        <SettingsList defs={GAME_SETTINGS} flat />
      </Dialog>
    </>
  );
}
