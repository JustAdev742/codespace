import type { ApiErrorBody, ErrorCode } from '@ludora/shared';

/** An API failure with a message written for the player. */
export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: ErrorCode | 'network',
    message: string,
    readonly fields: Record<string, string> = {},
  ) {
    super(message);
  }
}

async function request<T>(method: string, path: string, body?: unknown, signal?: AbortSignal): Promise<T> {
  let res: Response;
  const form = body instanceof FormData;
  try {
    res = await fetch(path, {
      method,
      credentials: 'same-origin',
      headers: {
        // A FormData body sets its own multipart content type.
        ...(body !== undefined && !form ? { 'content-type': 'application/json' } : {}),
        // Required on every change; the server refuses state changes without it (CSRF protection).
        'x-ludora-csrf': '1',
      },
      body: body === undefined ? undefined : form ? body : JSON.stringify(body),
      signal,
    });
  } catch (err) {
    if ((err as Error).name === 'AbortError') throw err;
    throw new ApiError(0, 'network', 'Could not reach Ludora. Check your connection and try again.');
  }
  const text = await res.text();
  const data = text ? (JSON.parse(text) as unknown) : null;
  if (!res.ok) {
    const e = (data as ApiErrorBody | null)?.error;
    throw new ApiError(res.status, e?.code ?? 'internal', e?.message ?? 'Something went wrong.', e?.fields ?? {});
  }
  return data as T;
}

export const api = {
  get: <T>(path: string, signal?: AbortSignal) => request<T>('GET', path, undefined, signal),
  post: <T>(path: string, body: unknown = {}) => request<T>('POST', path, body),
  put: <T>(path: string, body: unknown = {}) => request<T>('PUT', path, body),
  patch: <T>(path: string, body: unknown = {}) => request<T>('PATCH', path, body),
  delete: <T>(path: string) => request<T>('DELETE', path),
  /** Sends one file as multipart form data, in a field named "file". */
  upload: <T>(path: string, file: File) => {
    const body = new FormData();
    body.append('file', file);
    return request<T>('POST', path, body);
  },
};

/** A fresh idempotency key for a purchase or claim; reuse it when retrying the same attempt. */
export function newRequestKey(prefix = 'k'): string {
  const bytes = crypto.getRandomValues(new Uint8Array(12));
  return `${prefix}-${Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('')}`;
}
