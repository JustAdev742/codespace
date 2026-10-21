import { useMe } from '../../lib/session.ts';
import { Spinner } from '../../ui/primitives.tsx';
import Landing from './Landing.tsx';
import Dashboard from './Dashboard.tsx';

export default function Home() {
  const me = useMe();
  if (me.isLoading) return <Spinner />;
  return me.data?.user ? <Dashboard /> : <Landing />;
}
