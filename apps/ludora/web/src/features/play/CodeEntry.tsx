import { useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router';
import { ArrowRight } from 'lucide-react';

/** The room-code box. Six digits; accepts pasted codes with spaces. */
export function CodeEntry({ size = 'lg', autoFocus = false }: { size?: 'lg' | 'xl'; autoFocus?: boolean }) {
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
  return (
    <form onSubmit={submit} className="flex w-full max-w-md flex-col gap-1.5" aria-label="Join a game">
      <div className="flex items-stretch gap-2">
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
        className={`w-0 min-w-0 flex-1 rounded-[16px] border-2 border-ink bg-raised px-4 text-center font-display font-bold tracking-[0.12em] text-text tabular placeholder:font-sans placeholder:text-base placeholder:font-semibold placeholder:tracking-normal placeholder:text-text-3 focus:outline-none focus-visible:ring-4 focus-visible:ring-[var(--focus)] ${big ? 'h-16 text-3xl' : 'h-14 text-2xl'}`}
      />
      <button type="submit" className={`sticker inline-flex items-center gap-2 rounded-[16px] bg-lantern px-5 font-display font-bold text-on-accent ${big ? 'h-16 text-xl' : 'h-14 text-lg'}`}>
        Join
        <ArrowRight className="size-5" aria-hidden />
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
