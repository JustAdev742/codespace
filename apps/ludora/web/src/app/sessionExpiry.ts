import type { QueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { ApiError } from '../lib/api.ts';
import { meKey, type Me } from '../lib/session.ts';

let checking = false;

/**
 * A request refused because the session is gone (it expired, was signed out
 * on another device, or the account was signed out by staff) while this page
 * still thinks someone is signed in. Ask the server who is signed in; if
 * nobody is, every page switches to its signed-out view (with a way to sign
 * in) instead of showing "That did not load" with a retry that cannot work.
 */
export function onSessionError(qc: QueryClient, err: unknown) {
  if (!(err instanceof ApiError) || err.status !== 401 || err.code !== 'unauthenticated') return;
  const before = qc.getQueryData<Me>(meKey);
  if (!before?.user || checking) return;
  checking = true;
  void qc
    .fetchQuery({ queryKey: meKey, staleTime: 0 })
    .then(async (now) => {
      if ((now as Me | undefined)?.user) return;
      toast.info('You have been signed out. Sign in again to carry on.', { id: 'session-ended' });
      // Everything else was fetched for the old session.
      await qc.invalidateQueries({ predicate: (q) => q.queryKey[0] !== meKey[0] });
    })
    .catch(() => {})
    .finally(() => {
      checking = false;
    });
}
