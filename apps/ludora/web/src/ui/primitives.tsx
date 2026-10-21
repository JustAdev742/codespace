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

export function PageHeader({ title, description, actions, eyebrow, art }: { title: ReactNode; description?: ReactNode; actions?: ReactNode; eyebrow?: ReactNode; /** A character or illustration beside the title, hidden on narrow screens. */ art?: ReactNode }) {
  return (
    <header className="mb-6 flex flex-wrap items-end justify-between gap-4">
      <div className="flex min-w-0 items-end gap-4">
        {art ? (
          <div className="hidden shrink-0 sm:block" aria-hidden>
            {art}
          </div>
        ) : null}
        <div className="min-w-0">
          {eyebrow ? <div className="mb-1 text-sm text-text-3">{eyebrow}</div> : null}
          <h1 className="font-display text-3xl font-extrabold text-text sm:text-[2.6rem] sm:leading-[1.05]">{title}</h1>
          {description ? <p className="mt-1.5 max-w-[62ch] text-text-2">{description}</p> : null}
        </div>
      </div>
      {actions ? <div className="flex flex-wrap items-center gap-2">{actions}</div> : null}
    </header>
  );
}

export function SectionTitle({ children, action }: { children: ReactNode; action?: ReactNode }) {
  return (
    <div className="mb-3 flex items-center justify-between gap-3">
      <h2 className="font-display text-xl font-bold text-text">{children}</h2>
      {action}
    </div>
  );
}

export function EmptyState({ icon, title, children, action }: { icon?: ReactNode; title: string; children?: ReactNode; action?: ReactNode }) {
  return (
    <div className="flex flex-col items-center gap-3 rounded-[var(--radius-m)] border border-dashed border-line-strong px-6 py-10 text-center">
      {icon ? <div className="text-text-3">{icon}</div> : null}
      <h3 className="font-display text-lg font-bold text-text">{title}</h3>
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

/* ---------------------------------- Badges ---------------------------------- */

const TONES = {
  neutral: 'bg-surface-3 text-text-2',
  amber: 'bg-surface-3 text-lantern',
  mint: 'bg-glim/15 text-glim',
  coral: 'bg-ember/15 text-ember',
  violet: 'bg-dusk/20 text-link',
  sky: 'bg-sky/15 text-sky',
} as const;

export function Badge({ tone = 'neutral', children, className = '' }: { tone?: keyof typeof TONES; children: ReactNode; className?: string }) {
  return <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-semibold whitespace-nowrap ${TONES[tone]} ${className}`}>{children}</span>;
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
  const text = size === 'sm' ? 'text-sm' : size === 'lg' ? 'text-xl' : 'text-[15px]';
  return (
    <span className={`inline-flex items-center gap-1 font-bold tabular ${text} ${className}`}>
      <CurrencyIcon code={currency} size={icon} />
      {formatNumber(value)}
    </span>
  );
}

export function ProgressBar({ value, max, tone = 'amber', label, className = '' }: { value: number; max: number; tone?: 'amber' | 'mint' | 'violet'; label?: string; className?: string }) {
  const pct = max > 0 ? Math.max(0, Math.min(100, (value / max) * 100)) : 0;
  const fill = tone === 'mint' ? 'bg-glim' : tone === 'violet' ? 'bg-dusk' : 'bg-lantern';
  // The same inked edge as the game-side Meter, at a size that suits dense pages.
  return (
    <div className={`h-3 w-full overflow-hidden rounded-full border-[1.5px] border-ink/70 bg-surface-3 ${className}`} role="progressbar" aria-valuenow={value} aria-valuemin={0} aria-valuemax={max} aria-label={label}>
      <div className={`h-full rounded-full ${fill} transition-[width] duration-500`} style={{ width: `${pct}%` }} />
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

const inputClass =
  'rounded-[12px] border border-line-strong bg-sunken px-3.5 text-[15px] text-text placeholder:text-text-3 transition-colors focus:border-lantern focus:outline-none focus-visible:outline-none focus:ring-2 focus:ring-[var(--focus)] aria-[invalid=true]:border-ember disabled:opacity-60';

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
    <select ref={ref} className={`${inputClass} ${sizeFor(className)} cursor-pointer appearance-none bg-[length:12px] bg-[right_14px_center] bg-no-repeat pr-9 ${className}`} style={{ backgroundImage: "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 12 8'%3E%3Cpath d='M1 1l5 5 5-5' fill='none' stroke='%239c94d4' stroke-width='2'/%3E%3C/svg%3E\")" }} {...rest}>
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
      <RSwitch.Root
        id={id}
        aria-describedby={description ? `${id}-desc` : undefined}
        checked={checked}
        onCheckedChange={onCheckedChange}
        disabled={disabled}
        className="relative mt-0.5 h-7 w-12 shrink-0 rounded-full border-2 border-ink bg-surface-3 transition-colors data-[state=checked]:bg-glim disabled:opacity-50"
      >
        <RSwitch.Thumb className="block size-5 translate-x-0.5 rounded-full border-2 border-ink bg-white transition-transform data-[state=checked]:translate-x-[22px]" />
      </RSwitch.Root>
    </div>
  );
}

/* ---------------------------------- Tabs ------------------------------------ */

export function Tabs({ value, onValueChange, items, children, label }: { value: string; onValueChange: (v: string) => void; items: { value: string; label: ReactNode; count?: number }[]; children?: ReactNode; label: string }) {
  return (
    <RTabs.Root value={value} onValueChange={onValueChange}>
      <RTabs.List aria-label={label} className="mb-5 flex gap-1 overflow-x-auto rounded-[14px] border border-line bg-sunken p-1 [scrollbar-width:none]">
        {items.map((i) => (
          <RTabs.Trigger
            key={i.value}
            value={i.value}
            className="group flex h-9 shrink-0 items-center gap-1.5 rounded-[10px] px-3.5 text-sm font-semibold text-text-2 transition-colors hover:text-text data-[state=active]:bg-lantern data-[state=active]:text-on-accent data-[state=active]:shadow-[0_2px_0_var(--ink)]"
          >
            {i.label}
            {i.count !== undefined ? <span className="rounded-full bg-surface-3 px-1.5 text-xs text-text-3 group-data-[state=active]:bg-[rgb(29_24_70/0.14)] group-data-[state=active]:text-on-accent">{i.count}</span> : null}
          </RTabs.Trigger>
        ))}
      </RTabs.List>
      {children}
    </RTabs.Root>
  );
}

export const TabPanel = RTabs.Content;

/* --------------------------------- Dialogs ---------------------------------- */

export function Dialog({ open, onOpenChange, title, description, children, footer, size = 'md' }: { open: boolean; onOpenChange: (v: boolean) => void; title: ReactNode; description?: ReactNode; children?: ReactNode; footer?: ReactNode; size?: 'sm' | 'md' | 'lg' }) {
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
        <RDialog.Content onCloseAutoFocus={restoreFocus} className={`fixed top-1/2 left-1/2 z-50 max-h-[90dvh] w-[calc(100vw-32px)] ${w} -translate-x-1/2 -translate-y-1/2 overflow-y-auto rounded-[20px] border border-line bg-raised p-5 shadow-[0_24px_60px_rgb(0_0_0/0.35)] focus:outline-none data-[state=open]:animate-[pop-in_180ms_var(--ease-out)] sm:p-6`}>
          <div className="mb-4 flex items-start justify-between gap-4">
            <div>
              <RDialog.Title className="font-display text-xl font-bold text-text">{title}</RDialog.Title>
              {description ? <RDialog.Description className="mt-1 text-sm text-text-2">{description}</RDialog.Description> : <RDialog.Description className="sr-only">{typeof title === 'string' ? title : 'Dialog'}</RDialog.Description>}
            </div>
            <RDialog.Close className="-m-1 rounded-[10px] p-1.5 text-text-3 hover:bg-surface-2 hover:text-text" aria-label="Close">
              <X className="size-5" />
            </RDialog.Close>
          </div>
          {children}
          {footer ? <div className="mt-6 flex flex-wrap justify-end gap-2">{footer}</div> : null}
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
        <RTooltip.Content sideOffset={6} className="z-50 max-w-xs rounded-[10px] border border-line bg-raised px-2.5 py-1.5 text-xs font-semibold text-text shadow-lg">
          {content}
        </RTooltip.Content>
      </RTooltip.Portal>
    </RTooltip.Root>
  );
}

export const TooltipProvider = RTooltip.Provider;
