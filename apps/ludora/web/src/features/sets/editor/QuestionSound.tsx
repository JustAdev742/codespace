import { formatDecimal } from '../../../lib/format.ts';
import { useEffect, useRef, useState } from 'react';
import { Mic, Music, Square, Trash2, Upload, Volume2 } from 'lucide-react';
import { CLIP_MAX_SECONDS, SPEECH_LANGS, SOUND_BANK_IDS, type Sound, type SoundBankId, type SpeechLang } from '@ludora/shared';
import { api, ApiError } from '../../../lib/api.ts';
import { BANK_GROUPS, SOUND_BANK } from '../../../lib/sound/bank.ts';
import { Button } from '../../../ui/Button.tsx';
import { Input, Select, Textarea } from '../../../ui/primitives.tsx';
import { Segmented } from '../../../ui/Segmented.tsx';
import { ClipError, toClip } from '../sound/encode.ts';
import { SoundPlay } from '../sound/SoundPlay.tsx';
import { EditorField, ERROR_TEXT } from './parts.tsx';

/*
 * A sound for a question or a choice, from one of three places: words the device says (in a
 * chosen language), the app's own sound bank, or the author's own clip, recorded with the
 * microphone or chosen from a file. Every sound needs a caption, the text players read when they
 * cannot hear it. Clips are trimmed, turned into a plain WAV in the browser and checked again on
 * the server; staff can remove any of them.
 */

type Source = Sound['kind'];
const SOURCE_LABEL: Record<Source, string> = { speech: 'Say it', bank: 'Sound bank', clip: 'Your own clip' };

const LANG_NAMES: Record<SpeechLang, string> = {
  'en-GB': 'English (UK)',
  'en-US': 'English (US)',
  'fr-FR': 'French',
  'es-ES': 'Spanish',
  'de-DE': 'German',
  'it-IT': 'Italian',
  'pt-PT': 'Portuguese',
  'nl-NL': 'Dutch',
  'pl-PL': 'Polish',
  'cy-GB': 'Welsh',
  'ga-IE': 'Irish',
  'zh-CN': 'Chinese (Mandarin)',
  'ja-JP': 'Japanese',
  'ko-KR': 'Korean',
  'ar-SA': 'Arabic',
  'hi-IN': 'Hindi',
  'ru-RU': 'Russian',
  'tr-TR': 'Turkish',
};

/** A blank sound of a kind, keeping a caption already written. */
function startOf(kind: Source, caption = ''): Sound | null {
  if (kind === 'speech') return { kind, text: '', lang: 'en-GB', caption };
  if (kind === 'bank') return { kind, id: 'note-c4', caption: caption || SOUND_BANK['note-c4'].caption };
  return null;
}

export function QuestionSound({ sound, idBase, error, onChange, what = 'question', compact = false, label }: { sound: Sound | undefined; idBase: string; error?: string | undefined; onChange: (s: Sound | undefined) => void; what?: 'question' | 'choice'; compact?: boolean; label?: string }) {
  const [open, setOpen] = useState(Boolean(sound));
  const [source, setSource] = useState<Source>(sound?.kind ?? 'speech');
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const [recording, setRecording] = useState<number | null>(null);
  const recorder = useRef<MediaRecorder | null>(null);
  const file = useRef<HTMLInputElement>(null);
  const tick = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(
    () => () => {
      if (tick.current) clearInterval(tick.current);
      recorder.current?.stream.getTracks().forEach((t) => t.stop());
    },
    [],
  );

  const choose = (kind: Source) => {
    setSource(kind);
    setProblem(null);
    if (sound?.kind === kind) return;
    onChange(startOf(kind, sound?.caption) ?? undefined);
  };

  const sendClip = async (blob: Blob) => {
    setBusy(true);
    setProblem(null);
    try {
      const clip = await toClip(blob);
      const res = await api.upload<{ url: string; seconds: number }>('/api/uploads', clip.file);
      onChange({ kind: 'clip', url: res.url, seconds: res.seconds ?? clip.seconds, caption: sound?.caption ?? '' });
    } catch (err) {
      setProblem(err instanceof ClipError || err instanceof ApiError ? err.message : 'The sound did not upload. Try again.');
    } finally {
      setBusy(false);
      if (file.current) file.current.value = '';
    }
  };

  const record = async () => {
    setProblem(null);
    if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === 'undefined') return setProblem('This browser cannot record. Choose a sound file instead.');
    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    } catch {
      return setProblem('The microphone could not be used. Allow it in the browser, or choose a sound file instead.');
    }
    const chunks: Blob[] = [];
    const r = new MediaRecorder(stream);
    recorder.current = r;
    r.ondataavailable = (e) => e.data.size && chunks.push(e.data);
    r.onstop = () => {
      stream.getTracks().forEach((t) => t.stop());
      if (tick.current) clearInterval(tick.current);
      setRecording(null);
      void sendClip(new Blob(chunks, { type: r.mimeType }));
    };
    r.start();
    setRecording(0);
    const began = Date.now();
    tick.current = setInterval(() => {
      const s = Math.floor((Date.now() - began) / 1000);
      setRecording(s);
      if (s >= CLIP_MAX_SECONDS) r.stop();
    }, 250);
  };

  if (!open) {
    return (
      <div>
        <Button
          size="sm"
          variant={what === 'choice' ? 'ghost' : undefined}
          icon={<Volume2 className="size-4" aria-hidden />}
          id={`${idBase}-add`}
          onClick={() => {
            setOpen(true);
            onChange(startOf(source) ?? undefined);
          }}
        >
          {label ?? (what === 'question' ? 'Add a sound' : 'Add a sound to this choice')}
        </Button>
      </div>
    );
  }

  const set = (patch: Partial<Sound>) => sound && onChange({ ...sound, ...patch } as Sound);
  return (
    <fieldset className={`flex min-w-0 flex-col gap-3 rounded-[var(--radius-m)] border border-line bg-sunken/40 ${compact ? 'p-2.5' : 'p-3'}`}>
      <legend className="px-1 text-sm font-semibold text-text">{what === 'question' ? 'Sound for this question' : 'Sound for this choice'}</legend>
      <Segmented<Source> label="Where the sound comes from" value={source} onChange={choose} options={(['speech', 'bank', 'clip'] as const).map((k) => ({ value: k, label: SOURCE_LABEL[k] }))} />
      {source === 'speech' && sound?.kind === 'speech' ? (
        <div className="grid min-w-0 gap-3 sm:grid-cols-[minmax(0,1fr)_12rem]">
          <EditorField id={`${idBase}-say`} label="Words to say" hint="The player's device says these in the language you choose. Nothing is recorded or stored but the words.">
            {(p) => <Textarea {...p} rows={2} maxLength={300} value={sound.text} onChange={(e) => set({ text: e.target.value })} className="h-auto min-h-[60px]" />}
          </EditorField>
          <EditorField id={`${idBase}-lang`} label="Language">
            {(p) => (
              <Select {...p} value={sound.lang} onChange={(e) => set({ lang: e.target.value as SpeechLang })}>
                {SPEECH_LANGS.map((l) => (
                  <option key={l} value={l}>
                    {LANG_NAMES[l]}
                  </option>
                ))}
              </Select>
            )}
          </EditorField>
        </div>
      ) : null}
      {source === 'bank' && sound?.kind === 'bank' ? (
        <EditorField id={`${idBase}-bank`} label="Sound" hint="Made in Ludora: notes, intervals, chords, rhythms, tones and game sounds.">
          {(p) => (
            <Select
              {...p}
              value={sound.id}
              onChange={(e) => {
                const id = e.target.value as SoundBankId;
                const wasSuggested = Object.values(SOUND_BANK).some((b) => b.caption === sound.caption);
                onChange({ ...sound, id, caption: !sound.caption || wasSuggested ? SOUND_BANK[id].caption : sound.caption });
              }}
            >
              {BANK_GROUPS.map((g) => (
                <optgroup key={g} label={g}>
                  {SOUND_BANK_IDS.filter((id) => SOUND_BANK[id].group === g).map((id) => (
                    <option key={id} value={id}>
                      {SOUND_BANK[id].label}
                    </option>
                  ))}
                </optgroup>
              ))}
            </Select>
          )}
        </EditorField>
      ) : null}
      {source === 'clip' ? (
        <div className="flex min-w-0 flex-col gap-2">
          <p className="text-sm text-text-2">
            Up to {CLIP_MAX_SECONDS} seconds, for the question only: a word, a phrase, a few bars. Do not say anyone's name in a recording. Staff can remove any recording.
          </p>
          <input ref={file} type="file" accept="audio/*" className="sr-only" tabIndex={-1} aria-hidden data-testid={`${idBase}-file`} onChange={(e) => e.target.files?.[0] && void sendClip(e.target.files[0])} />
          <div className="flex flex-wrap items-center gap-2">
            {recording !== null ? (
              <Button size="sm" variant="primary" icon={<Square className="size-4" aria-hidden />} onClick={() => recorder.current?.stop()}>
                Stop recording
              </Button>
            ) : (
              <Button size="sm" icon={<Mic className="size-4" aria-hidden />} loading={busy} onClick={() => void record()}>
                {sound?.kind === 'clip' ? 'Record again' : 'Record'}
              </Button>
            )}
            <Button size="sm" icon={<Upload className="size-4" aria-hidden />} disabled={recording !== null || busy} onClick={() => file.current?.click()}>
              Choose a sound file
            </Button>
            {recording !== null ? (
              <span role="status" className="font-semibold text-text tabular">
                Recording: {recording} of {CLIP_MAX_SECONDS} seconds
              </span>
            ) : busy ? (
              <span role="status" className="text-sm text-text-2">
                Preparing the sound…
              </span>
            ) : sound?.kind === 'clip' ? (
              <span className="text-sm text-text-2">Clip, {formatDecimal(sound.seconds)} seconds</span>
            ) : null}
          </div>
        </div>
      ) : null}
      {sound ? (
        <EditorField id={`${idBase}-caption`} label="Caption" hint="What players read when they cannot hear it, like a picture's description. Describe it without giving the answer away if the question is about listening." error={error}>
          {(p) => <Input {...p} maxLength={200} value={sound.caption} onChange={(e) => set({ caption: e.target.value })} />}
        </EditorField>
      ) : null}
      {problem ? (
        <p role="alert" className={`text-sm font-semibold ${ERROR_TEXT}`}>
          {problem}
        </p>
      ) : null}
      <div className="flex flex-wrap items-center gap-2">
        {sound && sound.caption.trim() && (sound.kind !== 'speech' || sound.text.trim()) ? <SoundPlay sound={sound} size="sm" label="Hear it" /> : null}
        <Button
          size="sm"
          variant="ghost"
          icon={<Trash2 className="size-4" aria-hidden />}
          onClick={() => {
            onChange(undefined);
            setOpen(false);
            setProblem(null);
          }}
        >
          Remove sound
        </Button>
        {source === 'bank' ? <Music className="ml-auto size-4 text-text-3" aria-hidden /> : null}
      </div>
    </fieldset>
  );
}
