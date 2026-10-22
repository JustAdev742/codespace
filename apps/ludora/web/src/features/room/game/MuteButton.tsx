import { Volume2, VolumeX } from 'lucide-react';
import { IconButton } from '../../../ui/Button.tsx';
import { sound } from '../../../lib/sound/engine.ts';
import { useSoundState } from '../../../lib/sound/react.tsx';

/** Turns every sound on this device off, and on again. Remembered on this device. */
export function MuteButton({ className = '' }: { className?: string }) {
  const { muted } = useSoundState();
  return (
    <IconButton label="Mute sound" aria-pressed={muted} size="sm" className={className} onClick={() => sound.setMuted(!muted)}>
      {muted ? <VolumeX className="size-4" aria-hidden /> : <Volume2 className="size-4" aria-hidden />}
    </IconButton>
  );
}
