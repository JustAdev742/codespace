import { SCHOOL_YEARS, schoolYearLabel, uniformForDress, yearHasBlazer, type AccessoryArt, type GlimArt, type SchoolDress, type SchoolUniform } from '@ludora/shared';
import { Glim } from '../../art/glim/Glim.tsx';
import { Select } from '../../ui/primitives.tsx';
import { Segmented } from '../../ui/Segmented.tsx';

/** What each uniform is, in the school's words. */
export const UNIFORM_NAMES: Record<SchoolUniform, string> = {
  kinder: 'Red polo and bucket hat',
  'junior-green': 'Green blazer, red jumper and rounded collar',
  'junior-grey': 'Grey blazer, red jumper and argyle tie',
  'senior-green': 'Green blazer, red jumper and striped tie',
  'senior-grey': 'Grey blazer, red jumper and striped tie',
  'sport-junior': 'Sport polo and bucket hat',
  sport: 'Sport polo and cap',
};

/**
 * Pick your school year, and from Year 3 your blazer and whether it is a sport day: your Glim wears
 * that year's Hills Grammar uniform. Used in Settings for accounts and on the join screen for guests.
 */
export function UniformPicker({ value, onChange, preview, onStage = false }: { value: SchoolDress; onChange: (patch: Partial<SchoolDress>) => void; preview?: { art: GlimArt; accessories?: AccessoryArt[] | undefined } | null; onStage?: boolean }) {
  const uniform = uniformForDress(value);
  const field = onStage ? 'h-12 bg-white text-lg font-semibold text-on-accent!' : 'w-full @min-[30rem]:w-48';
  return (
    // Sized by its own box, not the window: it sits in a narrow Locker column as well as in Settings.
    <div className="@container">
    <div className="flex flex-col gap-4 @min-[26rem]:flex-row @min-[26rem]:items-center @min-[26rem]:gap-6">
      {preview ? (
        <div className={`grid size-28 shrink-0 place-items-center rounded-[var(--radius-l)] ${onStage ? 'bg-white/10' : 'bg-sunken'}`}>
          <Glim art={preview.art} accessories={preview.accessories} dress={uniform} size={104} pose="wave" />
        </div>
      ) : null}
      <div className="flex min-w-0 flex-1 flex-col gap-3">
        <label className="flex flex-col gap-1.5">
          <span className="font-semibold">School year</span>
          <Select aria-label="School year" value={value.year === null ? '' : String(value.year)} onChange={(e) => onChange({ year: e.target.value === '' ? null : Number(e.target.value) })} className={field}>
            <option value="">Choose your year</option>
            {SCHOOL_YEARS.map((y) => (
              <option key={y} value={y}>
                {schoolYearLabel(y)}
              </option>
            ))}
          </Select>
        </label>
        {yearHasBlazer(value.year) ? (
          <div className="flex flex-wrap gap-3 @max-[30rem]:flex-col">
            <Segmented label="Blazer" value={value.blazer} onChange={(blazer) => onChange({ blazer })} options={[{ value: 'green', label: 'Green blazer' }, { value: 'grey', label: 'Grey blazer' }]} />
            <Segmented label="Uniform" value={value.kit} onChange={(kit) => onChange({ kit })} options={[{ value: 'school', label: 'School' }, { value: 'sport', label: 'Sport' }]} />
          </div>
        ) : null}
        <p className={`text-sm ${onStage ? 'text-text-2' : 'text-text-3'}`} aria-live="polite">
          {uniform ? UNIFORM_NAMES[uniform] : 'Your Glim wears the uniform for your year.'}
        </p>
      </div>
    </div>
    </div>
  );
}
