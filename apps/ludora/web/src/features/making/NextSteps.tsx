import { useState } from 'react';
import { useNavigate } from 'react-router';
import { toast } from 'sonner';
import { ClipboardList, LayoutTemplate } from 'lucide-react';
import { ApiError } from '../../lib/api.ts';
import { Button, ButtonLink } from '../../ui/Button.tsx';
import { lessonFromSet } from './lessonFromSet.ts';

/*
 * One press from a set to the next thing (making): a whole lesson built round it, or homework
 * for one or more classes. Hosting it and adding it to a lesson are already beside these.
 */
export function SetNextSteps({ setId, title }: { setId: string; title: string }) {
  const navigate = useNavigate();
  const [busy, setBusy] = useState(false);
  const make = async () => {
    setBusy(true);
    try {
      const id = await lessonFromSet(setId, title);
      toast.success('Lesson made: a starter, a main game and an exit ticket with this set');
      navigate(`/lessons/${id}`);
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'The lesson was not made. Check your connection and try again.');
      setBusy(false);
    }
  };
  return (
    <>
      <Button icon={<LayoutTemplate className="size-4" aria-hidden />} loading={busy} onClick={() => void make()}>
        Make a lesson with it
      </Button>
      <ButtonLink to={`/make/organise?tab=homework&set=${setId}`} icon={<ClipboardList className="size-4" aria-hidden />}>
        Set as homework
      </ButtonLink>
    </>
  );
}
