import { useEffect, useState, type ReactNode } from 'react';
import { useMutation, useQueryClient, type QueryKey } from '@tanstack/react-query';
import { toast } from 'sonner';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { ApiError } from '../../lib/api.ts';
import { Badge, Dialog, ErrorNotice, Field, Input, Skeleton, Textarea } from '../../ui/primitives.tsx';
import { Button, IconButton, type ButtonVariant } from '../../ui/Button.tsx';

/*
 * Building blocks for staff pages. Staff screens are dense and plain on
 * purpose: tables, facts and clearly worded actions. Every action that
 * changes something asks for a reason, and destructive ones ask for the
 * target's name; the server checks both again.
 */

export function StaffPage({ title, description, actions, children }: { title: string; description?: ReactNode; actions?: ReactNode; children: ReactNode }) {
  useEffect(() => {
    document.title = `${title} - Staff - Ludora`;
  }, [title]);
  return (
    <div className="min-w-0">
      <header className="mb-5 flex flex-wrap items-end justify-between gap-3">
        <div className="min-w-0">
          <h1 className="font-display text-2xl font-extrabold text-text sm:text-3xl">{title}</h1>
          {description ? <p className="mt-1 max-w-[70ch] text-sm text-text-2">{description}</p> : null}
        </div>
        {actions ? <div className="flex flex-wrap items-center gap-2">{actions}</div> : null}
      </header>
      {children}
    </div>
  );
}

export function Card({ title, actions, children, className = '' }: { title?: ReactNode; actions?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <section className={`min-w-0 rounded-[var(--radius-m)] border border-line bg-raised p-4 ${className}`}>
      {title || actions ? (
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          {title ? <h2 className="font-semibold text-text">{title}</h2> : <span />}
          {actions ? <div className="flex flex-wrap items-center gap-2">{actions}</div> : null}
        </div>
      ) : null}
      {children}
    </section>
  );
}

export interface Column<T> {
  key: string;
  header: ReactNode;
  cell: (row: T) => ReactNode;
  className?: string;
  align?: 'left' | 'right';
}

/** A plain table that scrolls sideways inside its own box on narrow screens, never the page. */
export function DataTable<T>({ columns, rows, rowKey, empty = 'Nothing here.', loading = false, error, onRetry, onRowClick, caption, minWidth = 640 }: { columns: Column<T>[]; rows: T[] | undefined; rowKey: (row: T) => string | number; empty?: ReactNode; loading?: boolean; error?: unknown; onRetry?: () => void; onRowClick?: (row: T) => void; caption?: string; /** Below this width the table scrolls inside its box. */ minWidth?: number }) {
  if (error) return <ErrorNotice message={error instanceof ApiError ? error.message : 'Could not load this list.'} onRetry={onRetry} />;
  if (loading && !rows) return <Skeleton className="h-48" />;
  return (
    <div className="relative overflow-x-auto rounded-[var(--radius-m)] border border-line">
      <table className="w-full border-collapse text-sm" style={{ minWidth }}>
        {caption ? <caption className="sr-only">{caption}</caption> : null}
        <thead className="bg-surface-2 text-left text-xs font-semibold text-text-3">
          <tr>
            {columns.map((c) => (
              <th key={c.key} scope="col" className={`px-3 py-2 font-semibold ${c.align === 'right' ? 'text-right' : ''} ${c.className ?? ''}`}>
                {c.header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows && rows.length ? (
            rows.map((r) => (
              <tr
                key={rowKey(r)}
                className={`border-t border-line ${onRowClick ? 'cursor-pointer hover:bg-surface-2 focus-within:bg-surface-2' : ''}`}
                onClick={onRowClick ? () => onRowClick(r) : undefined}
              >
                {columns.map((c) => (
                  <td key={c.key} className={`px-3 py-2 align-top text-text ${c.align === 'right' ? 'text-right tabular' : ''} ${c.className ?? ''}`}>
                    {c.cell(r)}
                  </td>
                ))}
              </tr>
            ))
          ) : (
            <tr>
              <td colSpan={columns.length} className="px-3 py-8 text-center text-text-3">
                {empty}
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}

export function Pager({ offset, pageSize, total, onChange }: { offset: number; pageSize: number; total: number; onChange: (offset: number) => void }) {
  if (total <= pageSize) return null;
  const from = offset + 1;
  const to = Math.min(total, offset + pageSize);
  return (
    <div className="mt-3 flex items-center justify-end gap-2 text-sm text-text-2">
      <span className="tabular">
        {from}-{to} of {total.toLocaleString('en-GB')}
      </span>
      <IconButton label="Previous page" size="sm" variant="secondary" disabled={offset === 0} onClick={() => onChange(Math.max(0, offset - pageSize))}>
        <ChevronLeft className="size-4" />
      </IconButton>
      <IconButton label="Next page" size="sm" variant="secondary" disabled={to >= total} onClick={() => onChange(offset + pageSize)}>
        <ChevronRight className="size-4" />
      </IconButton>
    </div>
  );
}

/** "Load older" pagination for logs keyed by id. */
export function OlderButton({ next, onLoad, loading }: { next: number | null | undefined; onLoad: (before: number) => void; loading?: boolean }) {
  if (!next) return null;
  return (
    <div className="mt-3 flex justify-center">
      <Button size="sm" onClick={() => onLoad(next)} loading={loading}>
        Load older
      </Button>
    </div>
  );
}

const STATUS_TONE: Record<string, 'mint' | 'coral' | 'amber' | 'neutral' | 'violet' | 'sky'> = {
  active: 'mint',
  live: 'mint',
  published: 'mint',
  running: 'mint',
  open: 'amber',
  lobby: 'sky',
  paused: 'amber',
  suspended: 'amber',
  draft: 'neutral',
  unreleased: 'violet',
  featured: 'violet',
  resolved: 'neutral',
  ended: 'neutral',
  banned: 'coral',
  hidden: 'coral',
  retired: 'neutral',
};

export function StatusPill({ status, label }: { status: string; label?: string }) {
  return <Badge tone={STATUS_TONE[status] ?? 'neutral'}>{label ?? status.replace(/_/g, ' ')}</Badge>;
}

export function Stat({ label, value, hint }: { label: string; value: ReactNode; hint?: ReactNode }) {
  return (
    <div className="min-w-0 rounded-[var(--radius-m)] border border-line bg-raised p-3">
      <div className="text-xs text-text-3">{label}</div>
      <div className="mt-0.5 font-display text-2xl font-extrabold text-text tabular">{value}</div>
      {hint ? <div className="mt-0.5 text-xs text-text-3">{hint}</div> : null}
    </div>
  );
}

export function KeyValues({ items }: { items: [string, ReactNode][] }) {
  return (
    <dl className="grid grid-cols-1 gap-x-6 gap-y-2 text-sm sm:grid-cols-2">
      {items.map(([k, v]) => (
        <div key={k} className="flex min-w-0 justify-between gap-3 border-b border-line pb-1.5 sm:block sm:border-0 sm:pb-0">
          <dt className="text-text-3">{k}</dt>
          <dd className="min-w-0 truncate text-right font-medium text-text sm:text-left">{v ?? '-'}</dd>
        </div>
      ))}
    </dl>
  );
}

export function dateTime(iso: string | null | undefined): string {
  if (!iso) return '-';
  return new Date(iso).toLocaleString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}

export function errorText(err: unknown, fallback = 'That did not work.'): string {
  return err instanceof ApiError ? err.message : fallback;
}

/** useMutation with the staff conventions: a toast either way, and the given queries refreshed afterwards. */
export function useStaffMutation<V, R>(fn: (vars: V) => Promise<R>, opts: { success?: string | ((res: R, vars: V) => string); invalidate?: QueryKey[]; onSuccess?: (res: R, vars: V) => void; silentError?: boolean } = {}) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: fn,
    onSuccess: async (res, vars) => {
      if (opts.success) toast.success(typeof opts.success === 'function' ? opts.success(res, vars) : opts.success);
      opts.onSuccess?.(res, vars);
      await Promise.all((opts.invalidate ?? []).map((queryKey) => qc.invalidateQueries({ queryKey })));
    },
    onError: (err) => {
      if (!opts.silentError) toast.error(errorText(err));
    },
  });
}

/**
 * The standard staff action dialog: a reason (always), an optional typed
 * confirmation, and any extra fields. Server errors show inside the dialog
 * so nothing typed is lost.
 */
export function ActionDialog({
  open,
  onOpenChange,
  title,
  description,
  confirmWord,
  confirmLabel,
  variant = 'primary',
  children,
  onSubmit,
  reasonLabel = 'Reason',
  reasonHint = 'Saved in the audit log. Write it for a colleague reading it later.',
  disabled = false,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  title: string;
  description?: ReactNode;
  confirmWord?: string | null;
  confirmLabel: string;
  variant?: ButtonVariant;
  children?: ReactNode;
  onSubmit: (input: { reason: string; confirm?: string }) => Promise<unknown>;
  reasonLabel?: string;
  reasonHint?: string;
  disabled?: boolean;
}) {
  const [reason, setReason] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState<ApiError | null>(null);
  const [pending, setPending] = useState(false);
  useEffect(() => {
    if (open) {
      setReason('');
      setConfirm('');
      setError(null);
    }
  }, [open]);
  const confirmOk = !confirmWord || confirm.trim().toLowerCase() === confirmWord.toLowerCase();
  const ready = reason.trim().length >= 3 && confirmOk && !disabled;
  const submit = async () => {
    if (!ready) return;
    setPending(true);
    setError(null);
    try {
      await onSubmit({ reason: reason.trim(), ...(confirmWord ? { confirm: confirm.trim() } : {}) });
      onOpenChange(false);
    } catch (err) {
      setError(err instanceof ApiError ? err : new ApiError(0, 'internal', 'That did not work.'));
    } finally {
      setPending(false);
    }
  };
  return (
    <Dialog
      open={open}
      onOpenChange={(v) => !pending && onOpenChange(v)}
      title={title}
      description={description}
      footer={
        <>
          <Button onClick={() => onOpenChange(false)} disabled={pending}>
            Cancel
          </Button>
          <Button variant={variant} onClick={submit} loading={pending} disabled={!ready}>
            {confirmLabel}
          </Button>
        </>
      }
    >
      <form
        className="flex flex-col gap-4"
        onSubmit={(e) => {
          e.preventDefault();
          void submit();
        }}
      >
        {children}
        <Field label={reasonLabel} hint={reasonHint} error={error?.fields.reason}>
          {(p) => <Textarea {...p} rows={3} value={reason} onChange={(e) => setReason(e.target.value)} maxLength={500} required />}
        </Field>
        {confirmWord ? (
          <Field label={`Type ${confirmWord} to confirm`} error={error?.fields.confirm}>
            {(p) => <Input {...p} value={confirm} onChange={(e) => setConfirm(e.target.value)} autoComplete="off" spellCheck={false} />}
          </Field>
        ) : null}
        {error && !error.fields.reason && !error.fields.confirm ? <ErrorNotice title="Not done" message={error.message} /> : null}
        <button type="submit" hidden />
      </form>
    </Dialog>
  );
}

/** Shows a secret (a recovery code or a test password) exactly once, with a copy button. */
export function SecretDialog({ open, onOpenChange, title, description, values }: { open: boolean; onOpenChange: (v: boolean) => void; title: string; description: ReactNode; values: [string, string][] }) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange} title={title} description={description} footer={<Button variant="primary" onClick={() => onOpenChange(false)}>I have copied it</Button>}>
      <dl className="flex flex-col gap-3">
        {values.map(([label, value]) => (
          <div key={label}>
            <dt className="text-sm text-text-3">{label}</dt>
            <dd className="mt-1 flex items-center gap-2">
              <code className="min-w-0 flex-1 truncate rounded-[10px] bg-sunken px-3 py-2 font-mono text-base text-text">{value}</code>
              <Button
                size="sm"
                onClick={() => {
                  void navigator.clipboard?.writeText(value).then(
                    () => toast.success(`${label} copied`),
                    () => toast.error('Copy did not work. Select the text instead.'),
                  );
                }}
              >
                Copy
              </Button>
            </dd>
          </div>
        ))}
      </dl>
    </Dialog>
  );
}

/** A text box for JSON (drop tables, art specs) that reports parse errors as you type. */
export function JsonField({ label, value, onChange, hint, rows = 8 }: { label: string; value: string; onChange: (v: string) => void; hint?: ReactNode; rows?: number }) {
  let parseError: string | undefined;
  try {
    JSON.parse(value);
  } catch (e) {
    parseError = `Not valid JSON: ${(e as Error).message}`;
  }
  return (
    <Field label={label} hint={hint} error={parseError}>
      {(p) => <Textarea {...p} rows={rows} value={value} onChange={(e) => onChange(e.target.value)} spellCheck={false} className="font-mono text-[13px]" />}
    </Field>
  );
}

/** Debounced value for search boxes. */
export function useDebounced<T>(value: T, ms = 300): T {
  const [v, setV] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setV(value), ms);
    return () => clearTimeout(t);
  }, [value, ms]);
  return v;
}
