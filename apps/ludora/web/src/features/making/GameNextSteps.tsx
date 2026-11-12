import { useState } from 'react';
import { Link } from 'react-router';
import { toast } from 'sonner';
import { BarChart3, ListRestart } from 'lucide-react';
import { api, ApiError } from '../../lib/api.ts';
import { plural } from '../../lib/format.ts';
import { Button, buttonClass } from '../../ui/Button.tsx';

/*
 * After a game, for its host (making): the full report, and the questions the class got wrong as a
 * new set in one press (the report's own reteach request; the server decides who may make it).
 */
export function GameNextSteps({ gameId }: { gameId: string }) {
  const [busy, setBusy] = useState(false);
  const [made, setMade] = useState<{ id: string; title: string; questionCount: number } | null>(null);
  const reteach = async () => {
    setBusy(true);
    try {
      const r = await api.post<{ set: { id: string; title: string; questionCount: number } }>(`/api/games/${encodeURIComponent(gameId)}/reteach`, { count: 10 });
      setMade(r.set);
      toast.success(`Made “${r.set.title}” with ${plural(r.set.questionCount, 'question')}`);
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'The set was not made. Check your connection and try again.');
    } finally {
      setBusy(false);
    }
  };
  return (
    <>
      <Link to={`/reports/${gameId}`} className={buttonClass('secondary', 'lg', 'grow')}>
        <BarChart3 className="size-5" aria-hidden /> Full report
      </Link>
      {made ? (
        <Link to={`/sets/${made.id}`} className={buttonClass('secondary', 'lg', 'grow')}>
          <ListRestart className="size-5" aria-hidden /> Open “{made.title}”
        </Link>
      ) : (
        <Button size="lg" className="grow" icon={<ListRestart className="size-5" aria-hidden />} loading={busy} onClick={() => void reteach()}>
          Missed questions as a new set
        </Button>
      )}
    </>
  );
}
