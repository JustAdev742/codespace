import { useId, useSyncExternalStore, type ReactNode } from 'react';
import { Download, Volume2 } from 'lucide-react';
import { toast } from 'sonner';
import { Select, Switch } from '../../ui/primitives.tsx';
import { Segmented } from '../../ui/Segmented.tsx';
import { Button } from '../../ui/Button.tsx';
import { useDevicePrefs, usePrefs, type PrefPatch } from '../../lib/usePrefs.ts';
import { browserWantsLessData, type AccessPrefs, type DevicePrefs, type FullPrefs } from '../../lib/prefs.ts';
import { speak, speechSupported, useVoices } from '../../lib/speech.ts';
import { installState, promptInstall, subscribeInstall } from '../../lib/pwa.ts';
import { deviceTimeZone, timeZones } from '../../lib/format.ts';
import { SectionBoundary } from '../../ui/SectionBoundary.tsx';

/*
 * The accessibility and comfort settings, as a list of definitions: Settings shows every one,
 * in sections, with a search; the game's "Comfort" dialog shows the ones that matter mid-game.
 * `device: true` marks the few kept on this device whoever is signed in (volumes, the voice,
 * installing); everything else follows the account (or this device, signed out).
 */

export type SectionId = 'look' | 'reading' | 'game' | 'sound' | 'device';

export const SECTIONS: { id: SectionId; title: string }[] = [
  { id: 'look', title: 'Look and text' },
  { id: 'reading', title: 'Read aloud' },
  { id: 'game', title: 'Answering and games' },
  { id: 'sound', title: 'Sound' },
  { id: 'device', title: 'This device' },
];

interface Ctx {
  p: Pick<FullPrefs, 'theme' | 'reducedMotion' | 'textSize' | 'highContrast' | 'sound' | 'music'>;
  a: AccessPrefs;
  save: (patch: PrefPatch) => void;
  setAccess: (patch: Partial<AccessPrefs>) => void;
  device: DevicePrefs;
  setDevice: (patch: Partial<DevicePrefs>) => void;
}

export interface SettingDef {
  id: string;
  section: SectionId;
  label: string;
  description?: string;
  /** Extra words people might search for. */
  keywords?: string;
  /** Kept on this device only. */
  device?: boolean;
  /** Shown in the game's Comfort dialog too. */
  inGame?: boolean;
  /** Hidden when this device cannot do it. */
  available?: () => boolean;
  render: (c: Ctx) => ReactNode;
}

export function Row({ label, description, children, device = false }: { label: string; description?: string | undefined; children: ReactNode; device?: boolean }) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 py-3">
      <div className="min-w-0">
        <div className="font-semibold">
          {label}
          {device ? <DeviceTag /> : null}
        </div>
        {description ? <p className="text-sm text-text-3">{description}</p> : null}
      </div>
      {children}
    </div>
  );
}

function DeviceTag() {
  return <span className="ml-2 inline-block rounded-full border border-line px-2 py-px align-middle text-xs font-semibold text-text-3">This device</span>;
}

function sw(label: string, description: string | undefined, checked: boolean, on: (v: boolean) => void) {
  return (
    <div>
      <Switch checked={checked} onCheckedChange={on} label={label} description={description} />
    </div>
  );
}

function Slider({ label, value, onChange, device = false }: { label: string; value: number; onChange: (v: number) => void; device?: boolean }) {
  const id = useId();
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 py-3">
      <label htmlFor={id} className="font-semibold">
        {label}
        {device ? <DeviceTag /> : null}
      </label>
      <div className="flex items-center gap-3 max-sm:w-full">
        <input id={id} type="range" min={0} max={100} step={5} value={value} onChange={(e) => onChange(Number(e.target.value))} aria-valuetext={`${value}%`} className="h-11 w-48 cursor-pointer accent-[var(--lantern-deep)] max-sm:flex-1" />
        <span className="w-12 text-right font-semibold text-text-2 tabular" aria-hidden>
          {value}%
        </span>
      </div>
    </div>
  );
}

function VoicePicker({ c }: { c: Ctx }) {
  const voices = useVoices();
  const id = useId();
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 py-3">
      <div className="min-w-0">
        <label htmlFor={id} className="font-semibold">
          Voice
          <DeviceTag />
        </label>
        <p className="text-sm text-text-3">{voices.length ? 'Voices come with this device and browser.' : 'This browser has no voices to choose from yet.'}</p>
      </div>
      <div className="flex items-center gap-2 max-sm:w-full">
        <Select id={id} value={c.device.voice ?? ''} onChange={(e) => c.setDevice({ voice: e.target.value || null })} className="w-56 max-sm:flex-1">
          <option value="">The browser's own</option>
          {voices.map((v) => (
            <option key={v.voiceURI || v.name} value={v.name}>
              {v.name} ({v.lang})
            </option>
          ))}
        </Select>
        <Button size="sm" icon={<Volume2 className="size-4" aria-hidden />} onClick={() => speak('This is how questions will sound.', { rate: c.a.readRate })}>
          Try it
        </Button>
      </div>
    </div>
  );
}

function InstallRow() {
  const state = useSyncExternalStore(subscribeInstall, installState, installState);
  const description =
    state === 'installed'
      ? 'Ludora is installed on this device.'
      : state === 'ready'
        ? 'Opens in its own window, from the home screen or the app list. It still needs a connection to play.'
        : state === 'ios'
          ? 'On an iPhone or iPad: tap Share, then Add to Home Screen.'
          : 'This browser does not offer installing. Chrome and Edge do, on Chromebooks, Windows and Android.';
  return (
    <Row label="Install Ludora" description={description} device>
      {state === 'ready' ? (
        <Button
          size="sm"
          variant="primary"
          icon={<Download className="size-4" aria-hidden />}
          onClick={() =>
            void promptInstall().then((ok) => {
              if (ok) toast.success('Ludora is installed');
            })
          }
        >
          Install Ludora
        </Button>
      ) : null}
    </Row>
  );
}

function TimeZoneRow({ c }: { c: Ctx }) {
  const id = useId();
  const zones = timeZones();
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 py-3">
      <div className="min-w-0">
        <label htmlFor={id} className="font-semibold">
          Time zone
        </label>
        <p className="text-sm text-text-3">Dates and times, due dates included, show in this zone. Dates and numbers use this device's language.</p>
      </div>
      <Select id={id} value={c.a.timeZone ?? ''} onChange={(e) => c.setAccess({ timeZone: e.target.value || null })} className="w-64 max-sm:w-full">
        <option value="">This device's ({deviceTimeZone()})</option>
        {zones.map((z) => (
          <option key={z} value={z}>
            {z.replace(/_/g, ' ')}
          </option>
        ))}
      </Select>
    </div>
  );
}

const SPACING = [
  { value: 'normal' as const, label: 'Normal' },
  { value: 'wide' as const, label: 'Wide' },
  { value: 'wider' as const, label: 'Wider' },
];

export const SETTINGS: SettingDef[] = [
  {
    id: 'theme',
    section: 'look',
    label: 'Theme',
    keywords: 'dark light night day colour',
    render: (c) => (
      <Row label="Theme">
        <Segmented label="Theme" value={c.p.theme} onChange={(v) => c.save({ theme: v })} options={[{ value: 'system', label: 'Auto' }, { value: 'light', label: 'Day' }, { value: 'dark', label: 'Night' }]} />
      </Row>
    ),
  },
  {
    id: 'motion',
    section: 'look',
    label: 'Motion',
    description: 'Less motion turns off animations and slides, pack openings included.',
    keywords: 'animation reduced movement',
    inGame: true,
    render: (c) => (
      <Row label="Motion" description="Less motion turns off animations and slides, pack openings included.">
        <Segmented label="Motion" value={c.p.reducedMotion} onChange={(v) => c.save({ reducedMotion: v })} options={[{ value: 'system', label: 'Auto' }, { value: 'on', label: 'Less' }, { value: 'off', label: 'Full' }]} />
      </Row>
    ),
  },
  {
    id: 'textSize',
    section: 'look',
    label: 'Text size',
    keywords: 'bigger font zoom',
    inGame: true,
    render: (c) => (
      <Row label="Text size">
        <Segmented label="Text size" value={c.p.textSize} onChange={(v) => c.save({ textSize: v })} options={[{ value: 'normal', label: 'Normal' }, { value: 'large', label: 'Large' }, { value: 'larger', label: 'Larger' }]} />
      </Row>
    ),
  },
  {
    id: 'contrast',
    section: 'look',
    label: 'Contrast',
    description: 'Stronger borders and text. Highest makes every line and every word full strength.',
    keywords: 'high contrast low vision',
    inGame: true,
    render: (c) => (
      <Row label="Contrast" description="Stronger borders and text. Highest makes every line and every word full strength.">
        <Segmented
          label="Contrast"
          value={c.a.maxContrast ? 'max' : c.p.highContrast ? 'high' : 'normal'}
          onChange={(v) => c.save({ highContrast: v !== 'normal', access: { maxContrast: v === 'max' } })}
          options={[{ value: 'normal', label: 'Normal' }, { value: 'high', label: 'High' }, { value: 'max', label: 'Highest' }]}
        />
      </Row>
    ),
  },
  {
    id: 'lessTransparency',
    section: 'look',
    label: 'Less transparency',
    description: 'Solid panels and backgrounds instead of see-through ones.',
    keywords: 'blur glass opaque',
    render: (c) => sw('Less transparency', 'Solid panels and backgrounds instead of see-through ones.', c.a.lessTransparency, (v) => c.setAccess({ lessTransparency: v })),
  },
  {
    id: 'font',
    section: 'look',
    label: 'Easier-to-read typeface',
    description: 'Atkinson Hyperlegible for headings and numbers too, made so letters like I, l and 1 never look alike.',
    keywords: 'font dyslexia legible reading',
    inGame: true,
    render: (c) => sw('Easier-to-read typeface', 'Atkinson Hyperlegible for headings and numbers too, made so letters like I, l and 1 never look alike.', c.a.font === 'easy', (v) => c.setAccess({ font: v ? 'easy' : 'standard' })),
  },
  {
    id: 'letterSpacing',
    section: 'look',
    label: 'Letter spacing',
    keywords: 'dyslexia spacing tracking words',
    render: (c) => (
      <Row label="Letter spacing">
        <Segmented label="Letter spacing" value={c.a.letterSpacing} onChange={(v) => c.setAccess({ letterSpacing: v })} options={SPACING} />
      </Row>
    ),
  },
  {
    id: 'lineSpacing',
    section: 'look',
    label: 'Line spacing',
    keywords: 'dyslexia leading',
    render: (c) => (
      <Row label="Line spacing">
        <Segmented label="Line spacing" value={c.a.lineSpacing} onChange={(v) => c.setAccess({ lineSpacing: v })} options={SPACING} />
      </Row>
    ),
  },
  {
    id: 'underlineLinks',
    section: 'look',
    label: 'Always underline links',
    keywords: 'links underline',
    render: (c) => sw('Always underline links', undefined, c.a.underlineLinks, (v) => c.setAccess({ underlineLinks: v })),
  },
  {
    id: 'strongFocus',
    section: 'look',
    label: 'Always show the focus ring',
    description: 'A thick ring around whatever is selected, mouse clicks included.',
    keywords: 'keyboard outline focus',
    render: (c) => sw('Always show the focus ring', 'A thick ring around whatever is selected, mouse clicks included.', c.a.strongFocus, (v) => c.setAccess({ strongFocus: v })),
  },
  {
    id: 'readAloud',
    section: 'reading',
    label: 'Read aloud',
    description: 'A speaker button in games reads the question and its answers, with this device’s own voice.',
    keywords: 'speech voice tts speak listen dyslexia blind',
    inGame: true,
    available: speechSupported,
    render: (c) => sw('Read aloud', 'A speaker button in games reads the question and its answers, with this device’s own voice.', c.a.readAloud, (v) => c.setAccess({ readAloud: v })),
  },
  {
    id: 'readAuto',
    section: 'reading',
    label: 'Read each new question by itself',
    keywords: 'speech automatic',
    inGame: true,
    available: speechSupported,
    render: (c) => (c.a.readAloud ? sw('Read each new question by itself', undefined, c.a.readAuto, (v) => c.setAccess({ readAuto: v })) : null),
  },
  {
    id: 'readRate',
    section: 'reading',
    label: 'Reading speed',
    keywords: 'speech rate slow fast',
    available: speechSupported,
    render: (c) =>
      c.a.readAloud ? (
        <Row label="Reading speed">
          <Segmented
            label="Reading speed"
            value={String(c.a.readRate) as '0.75' | '1' | '1.25'}
            onChange={(v) => c.setAccess({ readRate: Number(v) })}
            options={[{ value: '0.75', label: 'Slower' }, { value: '1', label: 'Normal' }, { value: '1.25', label: 'Faster' }]}
          />
        </Row>
      ) : null,
  },
  {
    id: 'voice',
    section: 'reading',
    label: 'Voice',
    device: true,
    keywords: 'speech',
    available: speechSupported,
    render: (c) => (c.a.readAloud ? <VoicePicker c={c} /> : null),
  },
  {
    id: 'timer',
    section: 'game',
    label: 'Question timer',
    description: 'Hide it if a countdown makes questions harder. The time limit stays the same.',
    keywords: 'clock countdown stress anxiety',
    inGame: true,
    render: (c) => (
      <Row label="Question timer" description="Hide it if a countdown makes questions harder. The time limit stays the same.">
        <Segmented label="Question timer" value={c.a.timer} onChange={(v) => c.setAccess({ timer: v })} options={[{ value: 'both', label: 'Both' }, { value: 'bar', label: 'Bar' }, { value: 'number', label: 'Number' }, { value: 'hidden', label: 'Hidden' }]} />
      </Row>
    ),
  },
  {
    id: 'tiles',
    section: 'game',
    label: 'Colour-safe answer tiles',
    description: 'Colours chosen to stay apart for colour blindness, with a pattern on each tile.',
    keywords: 'colour blind color vision deuteranopia protanopia tritanopia pattern',
    inGame: true,
    render: (c) => sw('Colour-safe answer tiles', 'Colours chosen to stay apart for colour blindness, with a pattern on each tile.', c.a.tiles === 'safe', (v) => c.setAccess({ tiles: v ? 'safe' : 'standard' })),
  },
  {
    id: 'calm',
    section: 'game',
    label: 'Calm mode',
    description: 'No reactions, confetti, countdown tick or flashing on your screen.',
    keywords: 'autism sensory quiet distraction',
    inGame: true,
    render: (c) => sw('Calm mode', 'No reactions, confetti, countdown tick or flashing on your screen.', c.a.calm, (v) => c.setAccess({ calm: v })),
  },
  {
    id: 'littleHands',
    section: 'game',
    label: 'Little hands',
    description: 'Bigger buttons and text on game screens.',
    keywords: 'young children big buttons motor touch targets',
    inGame: true,
    render: (c) => sw('Little hands', 'Bigger buttons and text on game screens.', c.a.littleHands, (v) => c.setAccess({ littleHands: v })),
  },
  {
    id: 'captions',
    section: 'game',
    label: 'Show sounds',
    description: 'A short caption for sounds that mean something: the timer warning, right and wrong.',
    keywords: 'deaf hard of hearing captions visual cue',
    inGame: true,
    render: (c) => sw('Show sounds', 'A short caption for sounds that mean something: the timer warning, right and wrong.', c.a.captions, (v) => c.setAccess({ captions: v })),
  },
  {
    id: 'vibrate',
    section: 'game',
    label: 'Buzz when an answer locks in',
    description: 'On phones that can buzz: one short buzz when your answer goes in, and a pattern for right and wrong.',
    keywords: 'haptic vibration',
    inGame: true,
    available: () => typeof navigator !== 'undefined' && 'vibrate' in navigator,
    render: (c) => sw('Buzz when an answer locks in', 'On phones that can buzz: one short buzz when your answer goes in, and a pattern for right and wrong.', c.a.vibrate, (v) => c.setAccess({ vibrate: v })),
  },
  {
    id: 'wakeLock',
    section: 'game',
    label: 'Keep the screen on during games',
    keywords: 'sleep wake lock dim',
    available: () => typeof navigator !== 'undefined' && 'wakeLock' in navigator,
    render: (c) => sw('Keep the screen on during games', undefined, c.a.wakeLock, (v) => c.setAccess({ wakeLock: v })),
  },
  {
    id: 'sound',
    section: 'sound',
    label: 'Sound effects',
    description: 'Answers, the timer, results and opening Lanterns.',
    keywords: 'audio sfx',
    render: (c) => sw('Sound effects', 'Answers, the timer, results and opening Lanterns.', c.p.sound, (v) => c.save({ sound: v })),
  },
  {
    id: 'effectsVolume',
    section: 'sound',
    label: 'Effects volume',
    device: true,
    keywords: 'loud quiet audio',
    inGame: true,
    render: (c) => <Slider label="Effects volume" value={c.device.effectsVolume} onChange={(v) => c.setDevice({ effectsVolume: v })} device />,
  },
  {
    id: 'music',
    section: 'sound',
    label: 'Music',
    description: "Plays on the host's screen and in solo games, never on players' phones.",
    keywords: 'audio soundtrack',
    render: (c) => sw('Music', "Plays on the host's screen and in solo games, never on players' phones.", c.p.music, (v) => c.save({ music: v })),
  },
  {
    id: 'musicVolume',
    section: 'sound',
    label: 'Music volume',
    device: true,
    keywords: 'loud quiet audio',
    render: (c) => <Slider label="Music volume" value={c.device.musicVolume} onChange={(v) => c.setDevice({ musicVolume: v })} device />,
  },
  {
    id: 'dataSaver',
    section: 'device',
    label: 'Data saver',
    description: '',
    keywords: 'mobile data bandwidth slow connection',
    render: (c) => (
      <Row label="Data saver" description={`No music downloads, still backgrounds and simpler 3D. Auto turns it on when the browser asks to save data${c.a.dataSaver === 'auto' && browserWantsLessData() ? ' (it is asking now)' : ''}.`}>
        <Segmented label="Data saver" value={c.a.dataSaver} onChange={(v) => c.setAccess({ dataSaver: v })} options={[{ value: 'auto', label: 'Auto' }, { value: 'on', label: 'On' }, { value: 'off', label: 'Off' }]} />
      </Row>
    ),
  },
  {
    id: 'batterySaver',
    section: 'device',
    label: 'Battery saver for 3D',
    description: '3D games draw at most 30 frames a second, which uses less battery and keeps laptops cooler.',
    keywords: 'fps frame rate performance power',
    render: (c) => sw('Battery saver for 3D', '3D games draw at most 30 frames a second, which uses less battery and keeps laptops cooler.', c.a.batterySaver, (v) => c.setAccess({ batterySaver: v })),
  },
  {
    id: 'timeZone',
    section: 'device',
    label: 'Time zone',
    keywords: 'dates times due locale region',
    render: (c) => <TimeZoneRow c={c} />,
  },
  {
    id: 'install',
    section: 'device',
    label: 'Install Ludora',
    device: true,
    keywords: 'app home screen pwa offline',
    render: () => <InstallRow />,
  },
];

/** Whether a setting matches a search. */
export function matches(def: SettingDef, query: string): boolean {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  const hay = `${def.label} ${def.description ?? ''} ${def.keywords ?? ''} ${SECTIONS.find((s) => s.id === def.section)?.title ?? ''}`.toLowerCase();
  return q.split(/\s+/).every((w) => hay.includes(w));
}

/** The settings, live: renders the definitions given, grouped by section unless `flat`. */
export function SettingsList({ defs, flat = false, headingLevel = 2 }: { defs: SettingDef[]; flat?: boolean; headingLevel?: 2 | 3 }) {
  const { prefs, access, save } = usePrefs();
  const [device, setDevice] = useDevicePrefs();
  const ctx: Ctx = { p: prefs, a: access, save, setAccess: (patch) => save({ access: patch }), device, setDevice };
  const shown = defs.filter((d) => !d.available || d.available());
  const H = headingLevel === 2 ? 'h2' : 'h3';
  if (flat) return <div className="divide-y divide-line">{shown.map((d) => <div key={d.id}>{d.render(ctx)}</div>)}</div>;
  return (
    <>
      {SECTIONS.map((s) => {
        const items = shown.filter((d) => d.section === s.id);
        if (!items.length) return null;
        return (
          <section key={s.id} aria-labelledby={`settings-${s.id}`} className="rounded-[var(--radius-l)] border border-line bg-raised px-5 py-2">
            <H id={`settings-${s.id}`} className="py-3 font-display text-2xl leading-tight font-bold">
              {s.title}
            </H>
            <div className="divide-y divide-line">
              {items.map((d) => (
                <SectionBoundary key={d.id} name={`the ${d.label.toLowerCase()} setting`} className="py-3">
                  {d.render(ctx)}
                </SectionBoundary>
              ))}
            </div>
          </section>
        );
      })}
    </>
  );
}
