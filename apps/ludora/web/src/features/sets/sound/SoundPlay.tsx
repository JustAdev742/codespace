import { useEffect, useId, useRef, useState } from 'react';
import { Square, Volume2 } from 'lucide-react';
import type { Sound } from '@ludora/shared';
import { sound as engine, type SoundState } from '../../../lib/sound/engine.ts';
import { speak, speechSupported, stopSpeaking } from '../../../lib/speech.ts';
import { useAccess } from '../../../lib/usePrefs.ts';
import { useSoundState } from '../../../lib/sound/react.tsx';

/*
 * Playing a question's sound. Phones never play it by themselves: the player taps Play. The big
 * screen plays it once as the question opens, for the room, unless the room is quiet. A tap on
 * Play always plays (it is the question, not a game effect), on this device only.
 */

/** Rough length of a sound, for the "playing" state and reading time. */
export function soundSeconds(s: Sound): number {
  if (s.kind === 'clip') return s.seconds;
  if (s.kind === 'speech') return Math.min(12, 0.8 + s.text.length * 0.07);
  return 2.5;
}

/** Plays a sound now. `explicit`: someone pressed Play. Resolves to a stop function. */
export async function playSound(s: Sound, opts: { explicit: boolean }): Promise<() => void> {
  if (s.kind === 'speech') {
    const state: SoundState = engine.getState();
    if (!opts.explicit && (state.muted || state.silenced)) return () => {};
    speak(s.text, { lang: s.lang, rate: 0.95 });
    return stopSpeaking;
  }
  if (s.kind === 'bank') return engine.playBank(s.id, { explicit: opts.explicit });
  return (await engine.playClip(s.url, { explicit: opts.explicit })) ?? (() => {});
}

/** Whether this device can play this kind of sound at all. */
export function canPlay(s: Sound): boolean {
  if (s.kind === 'speech') return speechSupported();
  return typeof window !== 'undefined' && Boolean(window.AudioContext ?? (window as Window & { webkitAudioContext?: unknown }).webkitAudioContext);
}

export function SoundPlay({
  sound,
  size = 'md',
  auto = false,
  label = 'Play the sound',
  showCaption,
  playKey,
}: {
  sound: Sound;
  size?: 'sm' | 'md' | 'lg';
  /** Play once when shown (the big screen only). */
  auto?: boolean;
  label?: string;
  /** Always show the caption (the editor, a quiet room). Otherwise it shows when captions are on or the device cannot play it. */
  showCaption?: boolean;
  /** Changes when a new question opens, so auto-play runs again. */
  playKey?: string;
}) {
  const [playing, setPlaying] = useState(false);
  const stop = useRef<(() => void) | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const captionId = useId();
  const { captions } = useAccess();
  const state = useSoundState();
  const able = canPlay(sound);
  const quiet = Boolean(state.silenced);

  const finish = () => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
    setPlaying(false);
  };
  const start = async (explicit: boolean) => {
    stop.current?.();
    setPlaying(true);
    stop.current = await playSound(sound, { explicit });
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(finish, soundSeconds(sound) * 1000 + 300);
  };
  const halt = () => {
    stop.current?.();
    stop.current = null;
    finish();
  };

  useEffect(() => {
    if (!auto || quiet || !able) return;
    const t = setTimeout(() => void start(false), 600);
    return () => clearTimeout(t);
    // Auto-play once per question.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [auto, playKey, quiet, able]);
  useEffect(
    () => () => {
      stop.current?.();
      if (timer.current) clearTimeout(timer.current);
    },
    [],
  );

  const show = showCaption || captions || quiet || !able;
  const pad = size === 'lg' ? 'min-h-14 px-5 text-[clamp(1.1rem,1.6vw,1.6rem)]' : size === 'sm' ? 'min-h-11 px-3 text-sm' : 'min-h-12 px-4 text-base';
  return (
    <div className="flex min-w-0 flex-col items-start gap-1.5">
      {able ? (
        <button
          type="button"
          onClick={() => (playing ? halt() : void start(true))}
          aria-describedby={captionId}
          aria-pressed={playing}
          data-sound-play
          className={`inline-flex items-center gap-2 rounded-full bg-lantern font-display font-extrabold text-on-accent focus-visible:outline-offset-2 ${pad}`}
        >
          {playing ? <Square className="size-[1.1em]" aria-hidden /> : <Volume2 className="size-[1.2em]" aria-hidden />}
          {playing ? 'Stop' : label}
        </button>
      ) : null}
      <p id={captionId} className={show ? `max-w-full break-words font-semibold ${size === 'lg' ? 'text-[clamp(1rem,1.4vw,1.4rem)] text-text-2' : 'text-sm text-text-2'}` : 'sr-only'}>
        Sound: {sound.caption}
        {!able ? ' (this device cannot play sounds)' : ''}
      </p>
    </div>
  );
}
