/** A row of choices, one of them picked: theme, motion, a blazer colour. */
export function Segmented<T extends string>({ value, onChange, options, label }: { value: T; onChange: (v: T) => void; options: { value: T; label: string }[]; label: string }) {
  // Thumb-sized on phones, where the control takes the full width under its label; a little smaller on wider screens.
  // The chosen option is lifted out of the groove (a raised fill and a fine edge), not only coloured.
  return (
    <div role="radiogroup" aria-label={label} className="inline-flex rounded-[var(--radius-m)] border border-line bg-sunken p-1 max-sm:w-full">
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          role="radio"
          aria-checked={value === o.value}
          onClick={() => onChange(o.value)}
          className={`h-9 rounded-[var(--radius-s)] px-3.5 text-sm font-semibold transition-colors max-sm:h-11 max-sm:flex-1 ${value === o.value ? 'bg-raised text-text shadow-[0_1px_3px_rgb(2_5_20/0.3)] ring-1 ring-line-strong' : 'text-text-2 hover:text-text'}`}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}
