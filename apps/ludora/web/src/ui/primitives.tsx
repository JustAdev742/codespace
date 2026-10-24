import { forwardRef, useId, useLayoutEffect, useRef, type InputHTMLAttributes, type ReactNode, type SelectHTMLAttributes, type TextareaHTMLAttributes } from 'react';
import { Dialog as RDialog, Switch as RSwitch, Tabs as RTabs, Tooltip as RTooltip } from 'radix-ui';
import { X } from 'lucide-react';
import type { Rarity } from '@ludora/shared';
import { RARITY_INFO } from '@ludora/shared';
import { CurrencyIcon } from '../art/icons.tsx';
import { formatNumber } from '../lib/format.ts';

/* ---------------------------------- Layout ---------------------------------- */

export function Panel({ className = '', children, as: As = 'section', ...rest }: { className?: string; children: ReactNode; as?: 'section' | 'div' | 'article' | 'aside' } & Record<string, unknown>) {
  return (
    <As className={`panel ${className}`} {...rest}>
      {children}
    </As>
  );
}

export function PageHeader({
  title,
  description,
  actions,
  eyebrow,
}: {
  title: ReactNode;
  description?: ReactNode;
  actions?: ReactNode;
  eyebrow?: ReactNode;
  /** No longer shown: characters and illustrations do not decorate page headers (docs/DESIGN.md, principle 4). Still accepted, so existing callers keep working. */
  art?: ReactNode;
}) {
  return (
    <header className="mb-6 flex flex-wrap items-end justify-between gap-4">
      <div className="min-w-0">
        {eyebrow ? <div className="mb-1.5 text-sm font-semibold text-text-3">{eyebrow}</div> : null}
        <h1 className="font-display text-[2.25rem] leading-[1.02] font-bold text-text sm:text-[2.9rem]">{title}</h1>
        {description ? <p className="mt-2 max-w-[62ch] text-text-2">{description}</p> : null}
      </div>
      {actions ? <div className="flex flex-wrap items-center gap-2">{actions}</div> : null}
    </header>
  );
}

export function SectionTitle({ children, action }: { children: ReactNode; action?: ReactNode }) {
  return (
    <div className="mb-3 flex items-center justify-between gap-3">
      <h2 className="font-display text-2xl font-bold text-text">{children}</h2>
      {action}
    </div>
  );
}

export function EmptyState({ icon, title, children, action }: { icon?: ReactNode; title: string; children?: ReactNode; action?: ReactNode }) {
  return (
    <div className="flex flex-col items-center gap-3 rounded-[var(--radius-m)] border border-dashed border-line-strong px-6 py-10 text-center">
      {icon ? <div className="text-text-3">{icon}</div> : null}
      <h3 className="font-display text-xl leading-tight font-bold text-text">{title}</h3>
      {children ? <p className="max-w-[46ch] text-sm text-text-2">{children}</p> : null}
      {action}
    </div>
  );
}

export function Skeleton({ className = '' }: { className?: string }) {
  return <div className={`skeleton ${className}`} aria-hidden />;
}

export function Spinner({ label = 'Loading' }: { label?: string }) {
  return (
    <div role="status" className="grid place-items-center p-8 text-text-3">
      <svg className="size-8 animate-spin" viewBox="0 0 24 24" aria-hidden>
        <circle cx="12" cy="12" r="9" fill="none" stroke="currentColor" strokeWidth="3" opacity="0.25" />
        <path d="M21 12a9 9 0 0 0-9-9" fill="none" stroke="var(--lantern)" strokeWidth="3" strokeLinecap="round" />
      </svg>
      <span className="sr-only">{label}</span>
    </div>
  );
}

export function ErrorNotice({ title = 'That did not load', message, onRetry }: { title?: string; message: string; onRetry?: () => void }) {
  return (
    <div role="alert" className="rounded-[var(--radius-m)] border border-ember/50 bg-ember/10 px-4 py-3 text-sm">
      <p className="font-semibold text-text">{title}</p>
      <p className="text-text-2">{message}</p>
      {onRetry ? (
        <button type="button" onClick={onRetry} className="mt-2 font-semibold text-link underline underline-offset-2">
          Try again
        </button>
      ) : null}
    </div>
  );
}

/** For pages that depend on who is signed in, when that could not be checked: never claims the viewer is signed out. */
export function AccountError({ onRetry }: { onRetry: () => void }) {
  return <ErrorNotice title="Your account did not load" message="Ludora could not check who is signed in. Check your connection and try again." onRetry={onRetry} />;
}

/* ---------------------------------- Badges ---------------------------------- */

/*
 * Tags. The coloured tones are solid fills with ink text, like a broadcast
 * caption: each passes AA (5:1 or more) in both themes, on the stage and on
 * paper, whatever sits under it. Neutral stays quiet for the many small labels.
 */
const TONES = {
  neutral: 'bg-surface-3 text-text-2',
  amber: 'bg-lantern text-on-accent',
  mint: 'bg-glim text-on-accent',
  coral: 'bg-ember text-on-accent',
  violet: 'bg-dusk text-on-accent',
  sky: 'bg-sky text-on-accent',
} as const;

export function Badge({ tone = 'neutral', children, className = '' }: { tone?: keyof typeof TONES; children: ReactNode; className?: string }) {
  return <span className={`inline-flex items-center gap-1 rounded-[var(--radius-s)] px-2 py-0.5 font-sans text-xs font-bold whitespace-nowrap ${TONES[tone]} ${className}`}>{children}</span>;
}

export function RarityBadge({ rarity }: { rarity: Rarity }) {
  return (
    <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-text-2">
      <span className={`size-2.5 rounded-full ${rarity === 'mythic' ? 'rarity-mythic-shimmer' : ''}`} style={rarity === 'mythic' ? undefined : { background: `var(--r-${rarity})` }} aria-hidden />
      {RARITY_INFO[rarity].label}
    </span>
  );
}

export function Amount({ currency, value, size = 'md', className = '' }: { currency: string; value: number; size?: 'sm' | 'md' | 'lg'; className?: string }) {
  const icon = size === 'sm' ? 15 : size === 'lg' ? 24 : 18;
  // Coins are numbers: condensed, bold and tabular, a step bigger than body text because condensed type runs small.
  const text = size === 'sm' ? 'text-base' : size === 'lg' ? 'text-2xl' : 'text-lg';
  return (
    <span className={`inline-flex items-center gap-1 font-display leading-tight font-bold tabular ${text} ${className}`}>
      <CurrencyIcon code={currency} size={icon} />
      {formatNumber(value)}
    </span>
  );
}

export function ProgressBar({ value, max, tone = 'amber', label, className = '' }: { value: number; max: number; tone?: 'amber' | 'mint' | 'violet'; label?: string; className?: string }) {
  const pct = max > 0 ? Math.max(0, Math.min(100, (value / max) * 100)) : 0;
  const fill = tone === 'mint' ? 'bg-glim' : tone === 'violet' ? 'bg-dusk' : 'bg-lantern';
  // A sunken groove with a fine edge and a solid fill, like the game-side Meter, at a size that suits dense pages.
  return (
    <div className={`h-2.5 w-full overflow-hidden rounded-[var(--radius-s)] bg-sunken shadow-[inset_0_0_0_1px_var(--line)] ${className}`} role="progressbar" aria-valuenow={value} aria-valuemin={0} aria-valuemax={max} aria-label={label}>
      <div className={`h-full rounded-[var(--radius-s)] ${fill} transition-[width] duration-200 ease-[var(--ease-out)]`} style={{ width: `${pct}%` }} />
    </div>
  );
}

/* ---------------------------------- Forms ----------------------------------- */

export function Field({ label, hint, error, children, id }: { label: string; hint?: ReactNode; error?: string | undefined; children: (props: { id: string; 'aria-invalid': boolean; 'aria-describedby': string | undefined }) => ReactNode; id?: string }) {
  const auto = useId();
  const fid = id ?? auto;
  const hintId = hint ? `${fid}-hint` : undefined;
  const errId = error ? `${fid}-err` : undefined;
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={fid} className="text-sm font-semibold text-text">
        {label}
      </label>
      {children({ id: fid, 'aria-invalid': Boolean(error), 'aria-describedby': [hintId, errId].filter(Boolean).join(' ') || undefined })}
      {hint ? (
        <p id={hintId} className="text-xs text-text-3">
          {hint}
        </p>
      ) : null}
      {error ? (
        <p id={errId} className="text-xs font-semibold text-ember">
          {error}
        </p>
      ) : null}
    </div>
  );
}

/* A dark well on dark surfaces and plain white on light ones (`.input-well` in app.css), a strong edge, and a ring in the focus colour. */
const inputClass =
  'input-well rounded-[var(--radius-m)] border border-line-strong px-3.5 text-[15px] text-text placeholder:text-text-3 transition-[border-color,box-shadow] focus:border-[var(--focus)] focus:outline-none focus-visible:outline-none focus:ring-2 focus:ring-[var(--focus)] aria-[invalid=true]:border-ember disabled:opacity-60';

/** Full width and standard height unless the caller sets their own width or height. */
function sizeFor(className: string, height = 'h-11'): string {
  const classes = className.split(/\s+/);
  const w = classes.some((c) => c.startsWith('w-')) ? '' : 'w-full';
  const h = classes.some((c) => c.startsWith('h-')) ? '' : height;
  return `${w} ${h}`;
}

export const Input = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement>>(function Input({ className = '', ...rest }, ref) {
  return <input ref={ref} className={`${inputClass} ${sizeFor(className)} ${className}`} {...rest} />;
});

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaHTMLAttributes<HTMLTextAreaElement>>(function Textarea({ className = '', ...rest }, ref) {
  return <textarea ref={ref} className={`${inputClass} ${sizeFor(className, 'min-h-[88px]')} py-2.5 leading-relaxed ${className}`} {...rest} />;
});

export const Select = forwardRef<HTMLSelectElement, SelectHTMLAttributes<HTMLSelectElement>>(function Select({ className = '', children, ...rest }, ref) {
  return (
    <select ref={ref} className={`${inputClass} ${sizeFor(className)} cursor-pointer appearance-none bg-[length:12px] bg-[right_14px_center] bg-no-repeat pr-9 ${className}`} style={{ backgroundImage: "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 12 8'%3E%3Cpath d='M1 1l5 5 5-5' fill='none' stroke='%237b84b0' stroke-width='2'/%3E%3C/svg%3E\")" }} {...rest}>
      {children}
    </select>
  );
});

export function Switch({ checked, onCheckedChange, label, description, disabled }: { checked: boolean; onCheckedChange: (v: boolean) => void; label: string; description?: ReactNode; disabled?: boolean }) {
  const id = useId();
  return (
    <div className="flex items-start justify-between gap-4 py-2">
      <div className="min-w-0">
        <label htmlFor={id} className="font-semibold text-text">
          {label}
        </label>
        {description ? (
          <p id={`${id}-desc`} className="text-sm text-text-3">
            {description}
          </p>
        ) : null}
      </div>
      {/* On phones the button is a 44px target around the same 48 by 28 track; the negative margin keeps the row height. */}
      <RSwitch.Root
        id={id}
        aria-describedby={description ? `${id}-desc` : undefined}
        checked={checked}
        onCheckedChange={onCheckedChange}
        disabled={disabled}
        className="group -my-2 grid h-11 w-14 shrink-0 place-items-center rounded-[var(--radius-m)] disabled:opacity-50 sm:my-0 sm:mt-0.5 sm:h-7 sm:w-12 sm:rounded-full"
      >
        {/* Off: a grey thumb at the left of an outlined groove. On: an ink thumb at the right of a mint track. */}
        <span className="flex h-7 w-12 items-center rounded-full border border-line-strong bg-sunken transition-colors group-data-[state=checked]:border-transparent group-data-[state=checked]:bg-glim">
          <RSwitch.Thumb className="block size-5 translate-x-[3px] rounded-full bg-text-3 shadow-[0_1px_2px_rgb(2_5_20/0.3)] transition-[translate,transform,background-color] duration-150 ease-[var(--ease-out)] data-[state=checked]:translate-x-[23px] data-[state=checked]:bg-on-accent" />
        </span>
      </RSwitch.Root>
    </div>
  );
}

/* ---------------------------------- Tabs ------------------------------------ */

export function Tabs({ value, onValueChange, items, children, label }: { value: string; onValueChange: (v: string) => void; items: { value: string; label: ReactNode; count?: number }[]; children?: ReactNode; label: string }) {
  return (
    <RTabs.Root value={value} onValueChange={onValueChange}>
      {/* Hugs its tabs; when they do not fit they wrap onto another row, and each row shares out its width, so none is ever cut off. */}
      <RTabs.List aria-label={label} className="mb-5 flex w-fit max-w-full flex-wrap gap-1 rounded-[var(--radius-m)] border border-line bg-sunken p-1">
        {items.map((i) => (
          <RTabs.Trigger
            key={i.value}
            value={i.value}
            className="group flex min-h-11 grow items-center justify-center gap-1.5 rounded-[var(--radius-s)] px-3.5 py-1 text-center text-sm font-semibold text-text-2 transition-colors hover:text-text data-[state=active]:bg-lantern data-[state=active]:text-on-accent data-[state=active]:shadow-[inset_0_-3px_0_rgb(0_0_0/0.2)] data-[state=active]:hover:text-on-accent sm:min-h-9"
          >
            {i.label}
            {i.count !== undefined ? <span className="rounded-full bg-surface-3 px-1.5 text-xs font-bold text-text-2 tabular group-data-[state=active]:bg-black/15 group-data-[state=active]:text-on-accent">{i.count}</span> : null}
          </RTabs.Trigger>
        ))}
      </RTabs.List>
      {children}
    </RTabs.Root>
  );
}

export const TabPanel = RTabs.Content;

/* --------------------------------- Dialogs ---------------------------------- */

export function Dialog({
  open,
  onOpenChange,
  title,
  description,
  children,
  footer,
  size = 'md',
  dismissible = true,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  title: ReactNode;
  description?: ReactNode;
  children?: ReactNode;
  footer?: ReactNode;
  size?: 'sm' | 'md' | 'lg';
  /** False for a step that has to be finished: no close button, and Escape or a click outside does nothing. The footer's buttons are the way out. */
  dismissible?: boolean;
}) {
  const w = size === 'sm' ? 'max-w-sm' : size === 'lg' ? 'max-w-2xl' : 'max-w-lg';
  // These dialogs are opened from code, so there is no trigger for focus to return
  // to. Remember what had focus when the dialog opened (a layout effect runs before
  // the dialog moves focus inside) and put it back on close.
  const returnTo = useRef<HTMLElement | null>(null);
  useLayoutEffect(() => {
    if (open) returnTo.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
  }, [open]);
  const restoreFocus = (e: Event) => {
    const el = returnTo.current;
    returnTo.current = null;
    if (el && el.isConnected) {
      e.preventDefault();
      el.focus();
    }
  };
  return (
    <RDialog.Root open={open} onOpenChange={onOpenChange}>
      <RDialog.Portal>
        <RDialog.Overlay className="fixed inset-0 z-50 bg-[var(--scrim)] data-[state=open]:animate-[rise-fade_150ms_ease-out]" />
        {/* With a footer, scroll padding keeps a field that takes focus clear of the sticky buttons. */}
        <RDialog.Content
          onCloseAutoFocus={restoreFocus}
          onEscapeKeyDown={dismissible ? undefined : (e) => e.preventDefault()}
          onInteractOutside={(e) => {
            // Toasts sit outside the dialog: closing one must not close the dialog as well.
            if (!dismissible || (e.target instanceof Element && e.target.closest('[data-sonner-toaster]'))) e.preventDefault();
          }}
          className={`fixed top-1/2 left-1/2 z-50 max-h-[90dvh] w-[calc(100vw-32px)] ${w} -translate-x-1/2 -translate-y-1/2 overflow-y-auto rounded-[var(--radius-l)] border border-line bg-raised p-5 shadow-[0_24px_60px_-12px_rgb(2_5_20/0.6)] focus:outline-none data-[state=open]:animate-[pop-in_180ms_var(--ease-out)] sm:p-6 ${footer ? 'scroll-pb-24' : ''}`}
        >
          <div className="mb-4 flex items-start justify-between gap-4">
            <div>
              <RDialog.Title className="font-display text-2xl leading-tight font-bold text-text">{title}</RDialog.Title>
              {description ? <RDialog.Description className="mt-1 text-sm text-text-2">{description}</RDialog.Description> : <RDialog.Description className="sr-only">{typeof title === 'string' ? title : 'Dialog'}</RDialog.Description>}
            </div>
            {dismissible ? (
              <RDialog.Close className="-m-2 grid size-11 shrink-0 place-items-center rounded-[var(--radius-m)] text-text-3 hover:bg-surface-2 hover:text-text" aria-label="Close">
                <X className="size-5" />
              </RDialog.Close>
            ) : null}
          </div>
          {children}
          {/* The buttons stay in view while a long dialog scrolls. */}
          {footer ? <div className="sticky -bottom-5 z-10 -mx-5 mt-6 -mb-5 flex flex-wrap justify-end gap-2 border-t border-line bg-raised px-5 py-4 sm:-bottom-6 sm:-mx-6 sm:-mb-6 sm:px-6">{footer}</div> : null}
        </RDialog.Content>
      </RDialog.Portal>
    </RDialog.Root>
  );
}

export function Tooltip({ content, children }: { content: ReactNode; children: ReactNode }) {
  return (
    <RTooltip.Root delayDuration={250}>
      <RTooltip.Trigger asChild>{children}</RTooltip.Trigger>
      <RTooltip.Portal>
        <RTooltip.Content sideOffset={6} className="z-50 max-w-xs rounded-[var(--radius-s)] border border-line bg-raised px-2.5 py-1.5 text-xs font-semibold text-text shadow-[0_10px_24px_-8px_rgb(2_5_20/0.5)]">
          {content}
        </RTooltip.Content>
      </RTooltip.Portal>
    </RTooltip.Root>
  );
}

export const TooltipProvider = RTooltip.Provider;
