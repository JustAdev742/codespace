import { useMe } from '../../lib/session.ts';
import { AccountError, PageHeader, Skeleton } from '../../ui/primitives.tsx';
import { Stage } from '../../ui/Stage.tsx';
import { BLEED_ROUNDING, Bleed } from './kit.tsx';
import Landing from './Landing.tsx';
import Dashboard from './Dashboard.tsx';

export default function Home() {
  const me = useMe();
  // Until the account check answers: the hero's stage and the first cards, so the page does not jump when it lands.
  if (me.isLoading) {
    return (
      <div className="flex flex-col gap-8" aria-busy="true">
        <span className="sr-only" role="status">
          Loading
        </span>
        <Bleed>
          <Stage className={`h-[360px] sm:h-[400px] ${BLEED_ROUNDING}`}>{null}</Stage>
        </Bleed>
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)]">
          <Skeleton className="h-64 rounded-[var(--radius-l)]" />
          <Skeleton className="h-64 rounded-[var(--radius-l)]" />
        </div>
      </div>
    );
  }
  // A failed account check is not the same as being signed out: say so, rather than show the welcome page.
  if (me.isError && !me.data) {
    return (
      <>
        <PageHeader title="Home" />
        <AccountError onRetry={() => void me.refetch()} />
      </>
    );
  }
  return me.data?.user ? <Dashboard /> : <Landing />;
}
