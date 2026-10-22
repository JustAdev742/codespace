import { useMe } from '../../lib/session.ts';
import { AccountError, PageHeader, Spinner } from '../../ui/primitives.tsx';
import Landing from './Landing.tsx';
import Dashboard from './Dashboard.tsx';

export default function Home() {
  const me = useMe();
  if (me.isLoading) return <Spinner />;
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
