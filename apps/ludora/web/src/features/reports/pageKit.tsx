import type { ReactNode } from 'react';
import type { UseQueryResult } from '@tanstack/react-query';
import { FileSearch } from 'lucide-react';
import { useMe } from '../../lib/session.ts';
import { AccountError, EmptyState, ErrorNotice, PageHeader, Skeleton } from '../../ui/primitives.tsx';
import { ButtonLink } from '../../ui/Button.tsx';
import { BackLink, errorText, hasStatus, SignInPrompt } from './reportUi.tsx';

/*
 * The states every report page shares before it has its data: loading, signed out, not found
 * (or not yours, which the server says the same way), and a failed load with Try again.
 */

export function useSignedIn() {
  const me = useMe();
  return { me, signedIn: Boolean(me.data?.user) };
}

export function ReportGate<T>({ me, query, title, next, notFound, children }: { me: ReturnType<typeof useMe>; query: UseQueryResult<T>; title: string; next: string; notFound: ReactNode; children: (data: T) => ReactNode }) {
  const signedIn = Boolean(me.data?.user);
  if (me.isLoading || (signedIn && query.isPending)) {
    return (
      <div className="flex flex-col gap-4" aria-busy="true">
        <span className="sr-only" role="status">
          Loading
        </span>
        <Skeleton className="h-4 w-36" />
        <Skeleton className="h-10 w-1/2 max-w-sm" />
        <Skeleton className="h-64" />
      </div>
    );
  }
  if (me.isError && !me.data) {
    return (
      <>
        <PageHeader title={title} />
        <AccountError onRetry={() => void me.refetch()} />
      </>
    );
  }
  if (!signedIn || hasStatus(query.error, 401)) {
    return (
      <>
        <PageHeader title={title} />
        <SignInPrompt title="Sign in to see your reports" next={next}>
          Reports are for the teacher who hosted the games.
        </SignInPrompt>
      </>
    );
  }
  if (hasStatus(query.error, 400, 404)) {
    return (
      <>
        <BackLink to="/reports">Your reports</BackLink>
        <PageHeader title={title} />
        <EmptyState icon={<FileSearch className="size-8" />} title="Not found" action={<ButtonLink to="/reports">Your reports</ButtonLink>}>
          {notFound}
        </EmptyState>
      </>
    );
  }
  if (!query.data) {
    return (
      <>
        <BackLink to="/reports">Your reports</BackLink>
        <PageHeader title={title} />
        <ErrorNotice message={errorText(query.error, 'This could not be loaded. Check your connection and try again.')} onRetry={() => void query.refetch()} />
      </>
    );
  }
  return <>{children(query.data)}</>;
}
