import { useRef, useState } from 'react';
import { ImagePlus, RefreshCw, Trash2 } from 'lucide-react';
import type { Media } from '@ludora/shared';
import { api, ApiError } from '../../../lib/api.ts';
import { Button } from '../../../ui/Button.tsx';
import { Input } from '../../../ui/primitives.tsx';
import { LIMITS } from './model.ts';
import { EditorField, ERROR_TEXT } from './parts.tsx';

const ACCEPT = 'image/png,image/jpeg,image/gif,image/webp';
const MAX_BYTES = 2_000_000;

/**
 * A question's picture: upload one (PNG, JPEG, GIF or WebP up to 2 MB), see
 * it, describe it for players who cannot see it, replace or remove it. The
 * server checks the file again, removes location and camera details, and
 * caps its size.
 */
export function QuestionImage({ media, altId, altError, onChange }: { media: Media | undefined; altId: string; altError?: string | undefined; onChange: (media: Media | undefined) => void }) {
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);

  const pick = () => input.current?.click();
  const upload = async (file: File | undefined) => {
    if (!file) return;
    setProblem(null);
    if (!ACCEPT.split(',').includes(file.type)) return setProblem('Use a PNG, JPEG, GIF or WebP image.');
    if (file.size > MAX_BYTES) return setProblem('Images can be up to 2 MB. Try a smaller copy of this one.');
    setBusy(true);
    try {
      const res = await api.upload<{ url: string }>('/api/uploads', file);
      onChange({ kind: 'image', url: res.url, alt: media?.alt ?? '' });
      // The description is the next thing to fill in.
      requestAnimationFrame(() => document.getElementById(altId)?.focus());
    } catch (err) {
      setProblem(err instanceof ApiError ? err.message : 'The image did not upload. Try again.');
    } finally {
      setBusy(false);
      if (input.current) input.current.value = '';
    }
  };

  return (
    <div className="flex min-w-0 flex-col gap-2">
      <input ref={input} type="file" accept={ACCEPT} className="sr-only" tabIndex={-1} aria-hidden onChange={(e) => void upload(e.target.files?.[0])} />
      {media ? (
        <div className="flex min-w-0 flex-col gap-3 rounded-[12px] border border-line bg-sunken/40 p-3 sm:flex-row">
          <img src={media.url} alt="" className="h-28 w-auto max-w-full self-start rounded-[10px] border border-line bg-white object-contain sm:max-w-[40%]" />
          <div className="flex min-w-0 flex-1 flex-col gap-2">
            <EditorField id={altId} label="Image description" hint="Say what the picture shows, for players who cannot see it." error={altError}>
              {(p) => <Input {...p} value={media.alt} maxLength={LIMITS.alt} onChange={(e) => onChange({ ...media, alt: e.target.value })} />}
            </EditorField>
            <div className="flex flex-wrap gap-2">
              <Button size="sm" icon={<RefreshCw className="size-4" aria-hidden />} loading={busy} onClick={pick}>
                Replace image
              </Button>
              <Button size="sm" variant="ghost" icon={<Trash2 className="size-4" aria-hidden />} onClick={() => onChange(undefined)}>
                Remove image
              </Button>
            </div>
          </div>
        </div>
      ) : (
        <div>
          <Button size="sm" icon={<ImagePlus className="size-4" aria-hidden />} loading={busy} onClick={pick}>
            Add an image
          </Button>
        </div>
      )}
      {problem ? (
        <p role="alert" className={`text-sm font-semibold ${ERROR_TEXT}`}>
          {problem}
        </p>
      ) : null}
    </div>
  );
}
