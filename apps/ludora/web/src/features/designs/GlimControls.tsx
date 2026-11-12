import type { ReactNode } from 'react';
import {
  ACCESSORY_SHAPES,
  ACCESSORY_SLOTS,
  GLIM_BACKS,
  GLIM_BODIES,
  GLIM_BROWS,
  GLIM_EARS,
  GLIM_EYES,
  GLIM_FACES,
  GLIM_FEET,
  GLIM_GRADIENTS,
  GLIM_IDLES,
  GLIM_MOUTHS,
  GLIM_PATTERNS,
  GLIM_SHAPE_RANGES,
  GLIM_TAILS,
  GLIM_TOPPERS,
  type AccessoryArt,
  type AccessorySlot,
  type GlimArt,
} from '@ludora/shared';
import { Field, Select, Switch } from '../../ui/primitives.tsx';
import { glimColors, paintPalette } from '../../art/glim/Glim.tsx';
import { Painter } from './Painter.tsx';

/*
 * The controls that shape a Glim and an item, shared by My designs and the Creator Studio. Each
 * change goes through `onChange(next, group)`: a group merges a run of changes from one control
 * (a slider drag, a painted stroke) into one undo step.
 */

export const label = (s: string) => {
  const t = s.replace(/-/g, ' ');
  return t.charAt(0).toUpperCase() + t.slice(1);
};

export function Choice<T extends string>({ label: l, value, options, onChange, names }: { label: string; value: T; options: readonly T[]; onChange: (v: T) => void; names?: Partial<Record<T, string>> }) {
  return (
    <Field label={l}>
      {(p) => (
        <Select value={value} onChange={(e) => onChange(e.target.value as T)} {...p}>
          {options.map((o) => (
            <option key={o} value={o}>
              {names?.[o] ?? label(o)}
            </option>
          ))}
        </Select>
      )}
    </Field>
  );
}

const RAINBOW = 'linear-gradient(90deg,hsl(0 80% 60%),hsl(60 80% 60%),hsl(120 80% 60%),hsl(180 80% 60%),hsl(240 80% 60%),hsl(300 80% 60%),hsl(359 80% 60%))';

export function Slider({ label: l, value, min, max, onChange, onCommit, hue = false, unit = '' }: { label: string; value: number; min: number; max: number; onChange: (v: number) => void; onCommit?: () => void; hue?: boolean; unit?: string }) {
  return (
    <Field label={`${l}: ${value}${unit}`}>
      {(p) => (
        <input
          type="range"
          min={min}
          max={max}
          value={value}
          onChange={(e) => onChange(Number(e.target.value))}
          onPointerUp={onCommit}
          onKeyUp={onCommit}
          onBlur={onCommit}
          className="h-11 w-full accent-[var(--lantern)]"
          style={hue ? { background: RAINBOW, borderRadius: 999, height: 12, marginBlock: 16 } : undefined}
          {...p}
        />
      )}
    </Field>
  );
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <fieldset className="flex flex-col gap-3 border-t border-line pt-3">
      <legend className="float-left mb-1 w-full font-display text-lg font-bold">{title}</legend>
      {children}
    </fieldset>
  );
}

/** Faces in one tap: each sets the eyes, mouth and brows together. */
export const EXPRESSION_PRESETS: { id: string; label: string; set: Partial<GlimArt> }[] = [
  { id: 'cheery', label: 'Cheery', set: { eyes: 'happy', mouth: 'grin', brows: 'soft' } },
  { id: 'sure', label: 'Sure of itself', set: { eyes: 'half', mouth: 'smirk', brows: 'smug' } },
  { id: 'wide', label: 'Wide-eyed', set: { eyes: 'big', mouth: 'o', brows: 'surprised' } },
  { id: 'fierce', label: 'Fierce', set: { eyes: 'sly', mouth: 'fang', brows: 'determined' } },
  { id: 'sleepy', label: 'Sleepy', set: { eyes: 'sleepy', mouth: 'yawn', brows: 'soft' } },
  { id: 'shy', label: 'Shy', set: { eyes: 'dot', mouth: 'wobble', brows: 'worried' } },
  { id: 'robot', label: 'Robotic', set: { eyes: 'pixel', mouth: 'grit', brows: 'none' } },
];

const FEET_NAMES: Partial<Record<(typeof GLIM_FEET)[number], string>> = { nub: 'Round', none: 'None (floats)' };
const GRADIENT_NAMES: Partial<Record<(typeof GLIM_GRADIENTS)[number], string>> = { none: 'None', top: 'From the top', bottom: 'From the bottom', side: 'From the side', glow: 'Glow from inside' };
const IDLE_NAMES: Partial<Record<(typeof GLIM_IDLES)[number], string>> = { calm: 'Calm (breathing)', bob: 'Bob', sway: 'Sway', bounce: 'Bounce', hover: 'Hover', wiggle: 'Wiggle' };

export function GlimControls({ art, onChange, onCommit }: { art: GlimArt; onChange: (next: GlimArt, group?: string) => void; onCommit: () => void }) {
  const set = <K extends keyof GlimArt>(k: K, v: GlimArt[K], group?: string) => onChange({ ...art, [k]: v }, group);
  const c = glimColors(art);
  const third = art.thirdHue !== undefined;
  return (
    <div className="flex flex-col gap-4">
      <Section title="Body">
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          <Choice label="Body" value={art.body} options={GLIM_BODIES} onChange={(v) => set('body', v)} />
          <Choice label="Feet" value={art.feet ?? 'nub'} options={GLIM_FEET} names={FEET_NAMES} onChange={(v) => set('feet', v)} />
          <Choice label="Back" value={art.back ?? 'none'} options={GLIM_BACKS} onChange={(v) => set('back', v)} />
        </div>
        <div className="grid gap-x-4 sm:grid-cols-2">
          <Slider label="Width" unit="%" value={art.width ?? 100} min={GLIM_SHAPE_RANGES.width[0]} max={GLIM_SHAPE_RANGES.width[1]} onChange={(v) => set('width', v, 'width')} onCommit={onCommit} />
          <Slider label="Height" unit="%" value={art.height ?? 100} min={GLIM_SHAPE_RANGES.height[0]} max={GLIM_SHAPE_RANGES.height[1]} onChange={(v) => set('height', v, 'height')} onCommit={onCommit} />
        </div>
      </Section>
      <Section title="Face">
        <div className="flex flex-wrap gap-1.5" role="group" aria-label="Quick expressions">
          {EXPRESSION_PRESETS.map((e) => (
            <button key={e.id} type="button" onClick={() => onChange({ ...art, ...e.set })} className="min-h-11 rounded-full border border-line bg-raised px-3 text-sm font-semibold text-text-2 hover:border-lantern hover:text-text">
              {e.label}
            </button>
          ))}
        </div>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          <Choice label="Eyes" value={art.eyes} options={GLIM_EYES} onChange={(v) => set('eyes', v)} />
          <Choice label="Mouth" value={art.mouth} options={GLIM_MOUTHS} onChange={(v) => set('mouth', v)} />
          <Choice label="Eyebrows" value={art.brows ?? 'none'} options={GLIM_BROWS} onChange={(v) => set('brows', v)} />
          <Choice label="On the face" value={art.face ?? 'none'} options={GLIM_FACES} onChange={(v) => set('face', v)} />
        </div>
        <Slider label="Eye size" unit="%" value={art.eyeSize ?? 100} min={GLIM_SHAPE_RANGES.eyeSize[0]} max={GLIM_SHAPE_RANGES.eyeSize[1]} onChange={(v) => set('eyeSize', v, 'eyeSize')} onCommit={onCommit} />
      </Section>
      <Section title="Parts">
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          <Choice label="Ears" value={art.ears ?? 'none'} options={GLIM_EARS} onChange={(v) => set('ears', v)} />
          <Choice label="On top (antennae and more)" value={art.topper} options={GLIM_TOPPERS} onChange={(v) => set('topper', v)} />
          <Choice label="Tail" value={art.tail ?? 'none'} options={GLIM_TAILS} onChange={(v) => set('tail', v)} />
        </div>
      </Section>
      <Section title="Colours">
        <div className="grid gap-x-4 sm:grid-cols-2">
          <Slider hue label="Main colour" value={art.hue} min={0} max={359} onChange={(v) => set('hue', v, 'hue')} onCommit={onCommit} />
          <Slider hue label="Second colour" value={art.accentHue} min={0} max={359} onChange={(v) => set('accentHue', v, 'accentHue')} onCommit={onCommit} />
          <Slider label="Colour strength" value={art.saturation} min={0} max={100} onChange={(v) => set('saturation', v, 'saturation')} onCommit={onCommit} />
          {third ? <Slider hue label="Third colour" value={art.thirdHue ?? 0} min={0} max={359} onChange={(v) => set('thirdHue', v, 'thirdHue')} onCommit={onCommit} /> : null}
        </div>
        <Switch
          checked={third}
          onCheckedChange={(on) => {
            const next = { ...art };
            if (on) next.thirdHue = (art.accentHue + 120) % 360;
            else delete next.thirdHue;
            onChange(next);
          }}
          label="Use a third colour"
          description="For markings, painted cells and two-colour parts. Ludora keeps every colour bright enough to read."
        />
        <Choice label="Colour wash" value={art.gradient ?? 'none'} options={GLIM_GRADIENTS} names={GRADIENT_NAMES} onChange={(v) => set('gradient', v)} />
      </Section>
      <Section title="Markings">
        <Choice label="Pattern" value={art.pattern} options={GLIM_PATTERNS} onChange={(v) => set('pattern', v)} />
        <p className="text-sm text-text-2">Paint your own markings on the grid. They sit on the body under the face, in your Glim’s colours.</p>
        <Painter label="Markings painter" value={art.paint} palette={paintPalette(c)} onChange={(paint, group) => {
          const next = { ...art };
          if (paint) next.paint = paint;
          else delete next.paint;
          onChange(next, group);
        }} />
      </Section>
      <Section title="Movement">
        <Choice label="While it waits (in 3D)" value={art.idle ?? 'calm'} options={GLIM_IDLES} names={IDLE_NAMES} onChange={(v) => set('idle', v)} />
        <p className="text-sm text-text-2">Lobbies and game screens hold still, and so does everything when reduced motion is on.</p>
      </Section>
    </div>
  );
}

/** The item's palette for its emblem, matching how accessories draw it. */
export function emblemPalette(art: AccessoryArt): readonly [string, string, string, string, string] {
  const a = art.accentHue ?? (art.hue + 180) % 360;
  return [`hsl(${art.hue} 70% 34%)`, `hsl(${a} 85% 60%)`, `hsl(${(a + 120) % 360} 80% 62%)`, 'hsl(48 60% 96%)', 'hsl(240 30% 12%)'];
}
export const EMBLEM_COLOUR_NAMES = ['Deep main colour', 'Second colour', 'Third colour', 'White', 'Ink'] as const;

const SLOT_NAMES: Record<AccessorySlot, string> = { hat: 'Hat', eyes: 'Glasses', neck: 'Neckwear' };

export function ItemControls({ art, onChange, onCommit }: { art: AccessoryArt; onChange: (next: AccessoryArt, group?: string) => void; onCommit: () => void }) {
  const shapes = ACCESSORY_SHAPES[art.slot] as readonly string[];
  return (
    <div className="flex flex-col gap-4">
      <div className="grid grid-cols-2 gap-3">
        <Choice label="Worn as" value={art.slot} options={ACCESSORY_SLOTS} names={SLOT_NAMES} onChange={(slot) => onChange({ ...art, slot, shape: ACCESSORY_SHAPES[slot][0] })} />
        <Choice label="Shape" value={art.shape} options={shapes} onChange={(shape) => onChange({ ...art, shape })} />
      </div>
      <div className="grid gap-x-4 sm:grid-cols-2">
        <Slider hue label="Main colour" value={art.hue} min={0} max={359} onChange={(hue) => onChange({ ...art, hue }, 'hue')} onCommit={onCommit} />
        <Slider hue label="Second colour" value={art.accentHue ?? (art.hue + 50) % 360} min={0} max={359} onChange={(accentHue) => onChange({ ...art, accentHue }, 'accentHue')} onCommit={onCommit} />
      </div>
      {art.slot === 'eyes' ? (
        <p className="text-sm text-text-2">Glasses have no room for an emblem. Hats and neckwear do.</p>
      ) : (
        <fieldset className="flex flex-col gap-2 border-t border-line pt-3">
          <legend className="float-left mb-1 w-full font-display text-lg font-bold">Emblem</legend>
          <p className="text-sm text-text-2">Paint a badge for the front of it.</p>
          <Painter label="Emblem painter" value={art.emblem} palette={emblemPalette(art)} colourNames={EMBLEM_COLOUR_NAMES} onChange={(emblem, group) => {
            const next = { ...art };
            if (emblem) next.emblem = emblem;
            else delete next.emblem;
            onChange(next, group);
          }} />
        </fieldset>
      )}
    </div>
  );
}
