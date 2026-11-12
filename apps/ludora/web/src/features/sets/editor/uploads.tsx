import { formatDate, formatDecimal } from '../../../lib/format.ts';
import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { FileAudio, ImageIcon, Trash2 } from 'lucide-react';
import { api, ApiError } from '../../../lib/api.ts';
import { Button } from '../../../ui/Button.tsx';
import { Dialog, ErrorNotice, ProgressBar, Skeleton } from '../../../ui/primitives.tsx';
import { ERROR_TEXT } from './parts.tsx';

/*
 * The author's own uploads: how much space they use where uploads are kept in the database, and
 * a way to delete ones no longer needed. Only the account's own uploads are ever listed (the
 * server checks), and deleting one stops it showing in any set that still uses it.
 */

export interface MyUploads {
  store: 'disk' | 'db';
  used: number;
  allowance: number | null;
  fileCap: number;
  uploads: { id: string; url: string; kind: 'image' | 'sound'; bytes: number; createdAt: string; hidden: boolean }[];
}

export const myUploadsKey = ['my-uploads'] as const;

export function useMyUploads(enabled = true) {
  return useQuery({ queryKey: myUploadsKey, queryFn: ({ signal }) => api.get<MyUploads>('/api/uploads', signal), enabled, staleTime: 60_000 });
}

/** The largest file the server keeps: 2 MB on disk, smaller in the database. */
export function useUploadCap(): number {
  return useMyUploads().data?.fileCap ?? 2_000_000;
}

const mb = (n: number) => `${formatDecimal(n / 1_000_000)} MB`;
const kb = (n: number) => (n < 1_000_000 ? `${Math.max(1, Math.round(n / 1000))} KB` : mb(n));

export function UploadsDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (o: boolean) => void }) {
  const q = useMyUploads(open);
  const qc = useQueryClient();
  const [problem, setProblem] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const remove = async (id: string) => {
    setBusy(id);
    setProblem(null);
    try {
      await api.delete(`/api/uploads/${id}`);
      await qc.invalidateQueries({ queryKey: myUploadsKey });
    } catch (err) {
      setProblem(err instanceof ApiError ? err.message : 'That upload was not deleted. Try again.');
    } finally {
      setBusy(null);
    }
  };
  const d = q.data;
  return (
    <Dialog open={open} onOpenChange={onOpenChange} title="Your uploads" description="Pictures and sound clips you uploaded for your questions. Deleting one removes it from any set that still uses it." size="lg">
      {q.isError && !d ? (
        <ErrorNotice message="Your uploads could not be loaded." onRetry={() => void q.refetch()} />
      ) : !d ? (
        <Skeleton className="h-40" />
      ) : (
        <div className="flex flex-col gap-4">
          {d.allowance ? <ProgressBar value={d.used} max={d.allowance} label={`${mb(d.used)} of ${mb(d.allowance)} used`} /> : null}
          {problem ? (
            <p role="alert" className={`text-sm font-semibold ${ERROR_TEXT}`}>
              {problem}
            </p>
          ) : null}
          {d.uploads.length === 0 ? (
            <p className="text-text-2">You have not uploaded anything yet.</p>
          ) : (
            <ul className="flex max-h-[50vh] flex-col gap-2 overflow-y-auto">
              {d.uploads.map((u, i) => (
                <li key={u.id} className="flex min-w-0 items-center gap-3 rounded-[var(--radius-m)] border border-line p-2">
                  {u.kind === 'image' && !u.hidden ? <img src={u.url} alt="" className="size-12 shrink-0 rounded-[var(--radius-s)] border border-line bg-white object-contain" /> : u.kind === 'image' ? <ImageIcon className="size-6 shrink-0 text-text-3" aria-hidden /> : <FileAudio className="size-6 shrink-0 text-text-3" aria-hidden />}
                  <span className="min-w-0 flex-1 text-sm">
                    <span className="block font-semibold text-text">{u.kind === 'image' ? 'Picture' : 'Sound clip'}, {kb(u.bytes)}</span>
                    <span className="block text-text-2">
                      Uploaded {formatDate(u.createdAt, { day: 'numeric', month: 'short', year: 'numeric' })}
                      {u.hidden ? '. Hidden by staff' : ''}
                    </span>
                  </span>
                  <Button size="sm" variant="ghost" icon={<Trash2 className="size-4" aria-hidden />} loading={busy === u.id} onClick={() => void remove(u.id)} aria-label={`Delete upload ${i + 1}, a ${u.kind === 'image' ? 'picture' : 'sound clip'}`}>
                    Delete
                  </Button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </Dialog>
  );
}
