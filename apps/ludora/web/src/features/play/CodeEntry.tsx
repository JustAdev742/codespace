import { useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router';

/**
 * The room-code box. Six digits; accepts pasted codes with spaces.
 * `layout="stacked"` puts a giant code box above a full-width Join button,
 * for the join screen on a phone; the default sits the two side by side.
 */
export function CodeEntry({ size = 'lg', autoFocus = false, layout = 'inline' }: { size?: 'lg' | 'xl'; autoFocus?: boolean; layout?: 'inline' | 'stacked' }) {
  const navigate = useNavigate();
  const [code, setCode] = useState('');
  const [hint, setHint] = useState<string | null>(null);
  const digits = code.replace(/\D/g, '').slice(0, 6);
  const shown = digits.length > 3 ? `${digits.slice(0, 3)} ${digits.slice(3)}` : digits;
  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (digits.length === 6) navigate(`/join/${digits}`);
    else setHint(digits.length ? `Codes have 6 digits. You typed ${digits.length}.` : 'Type the 6-digit code from the host screen.');
  };
  const big = size === 'xl';
  const stacked = layout === 'stacked';
  return (
    <form onSubmit={submit} className={`flex w-full flex-col gap-1.5 ${stacked ? '' : 'max-w-md'}`} aria-label="Join a game">
      <div className={stacked ? 'flex flex-col gap-3' : 'flex items-stretch gap-2'}>
        <label className="sr-only" htmlFor="room-code">
          Game code
        </label>
        <input
          id="room-code"
          value={shown}
          onChange={(e) => {
            setCode(e.target.value);
            setHint(null);
          }}
          aria-invalid={Boolean(hint)}
          aria-describedby={hint ? 'room-code-hint' : undefined}
          inputMode="numeric"
          autoComplete="off"
          autoFocus={autoFocus}
          placeholder="Game code"
          maxLength={7}
          className={`rounded-[18px] border-[3px] border-ink bg-raised px-4 text-center font-display font-extrabold tracking-[0.12em] text-text tabular placeholder:font-sans placeholder:font-semibold placeholder:tracking-normal placeholder:text-text-3 focus:outline-none focus-visible:ring-4 focus-visible:ring-[var(--focus)] ${
            stacked ? 'h-20 w-full text-5xl placeholder:text-2xl' : `w-0 min-w-0 flex-1 placeholder:text-base ${big ? 'h-16 text-3xl' : 'h-14 text-2xl'}`
          }`}
        />
        <button type="submit" className={`sticker inline-flex items-center justify-center rounded-[18px] bg-lantern px-6 font-display font-extrabold text-on-accent ${stacked ? 'h-16 w-full text-2xl [--press:6px]' : big ? 'h-16 text-xl' : 'h-14 text-lg'}`}>
          Join
        </button>
      </div>
      {hint ? (
        <p id="room-code-hint" role="alert" className="text-sm font-semibold text-ember">
          {hint}
        </p>
      ) : null}
    </form>
  );
}
