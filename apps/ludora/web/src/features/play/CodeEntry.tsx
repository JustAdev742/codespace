import { useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router';
import { buttonClass } from '../../ui/Button.tsx';

/**
 * The room-code box. Six digits; accepts pasted codes with spaces.
 * `layout="stacked"` puts a giant code box above a full-width Join button,
 * for the join screen on a phone; the default sits the two side by side.
 *
 * The box is white with ink digits wherever it sits (the stage, a smoked panel
 * or paper), the way a game code box looks: no outline, a ring in the focus
 * colour while typing, and a coral ring with a hint when the code is short.
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
    <form onSubmit={submit} className={`flex w-full flex-col gap-2 ${stacked ? '' : 'max-w-md'}`} aria-label="Join a game">
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
          className={`rounded-[var(--radius-m)] border border-line-strong bg-white px-4 text-center font-display font-extrabold tracking-[0.12em] text-on-accent tabular transition-shadow placeholder:font-sans placeholder:font-semibold placeholder:tracking-normal placeholder:text-[#5a638c] focus:outline-none focus-visible:outline-none focus:ring-4 focus:ring-[var(--focus)] aria-[invalid=true]:shadow-[0_0_0_4px_var(--ember)] ${
            stacked ? 'h-20 w-full text-5xl placeholder:text-2xl' : `w-0 min-w-0 flex-1 placeholder:text-base ${big ? 'h-16 text-3xl' : 'h-14 text-2xl'}`
          }`}
        />
        <button type="submit" className={buttonClass('primary', stacked || big ? '2xl' : 'xl', stacked ? 'w-full' : '')}>
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
