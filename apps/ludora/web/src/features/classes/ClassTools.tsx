import { useEffect, useRef, useState } from 'react';
import { useParams } from 'react-router';
import { useQuery } from '@tanstack/react-query';
import { Users } from 'lucide-react';
import { api } from '../../lib/api.ts';
import { plural } from '../../lib/format.ts';
import { EmptyState, ErrorNotice, PageHeader } from '../../ui/primitives.tsx';
import { ButtonLink } from '../../ui/Button.tsx';
import { BackLink, errorText, hasStatus, usePageTitle } from '../reports/reportUi.tsx';
import { useAccountState, useClassDetail, type ClassMember } from './classData.ts';
import { ClassAccountGate, ClassPageSkeleton } from './classUi.tsx';
import { CheckInTool, CountdownTool, GroupsTool, PickerTool, ScoreboardTool, StopwatchTool, type Person } from '../making/tools/Tools.tsx';
import type { Score } from '../making/tools/logic.ts';
import { makingKeys } from '../making/data.ts';

/*
 * /classes/:id/tools, for the teacher at the board: a fair random picker (everyone
 * is picked once before anyone twice, remembered between visits), a team maker (shuffled
 * or the class's own groups), a countdown, a stopwatch, a quiet check-in and a scoreboard.
 * The tools themselves live in features/making/tools so lessons can use them as a step.
 */

/** What the tools remember for this class, saved a moment after each change (server: making module). */
function useToolMemory(classId: string) {
  const q = useQuery({ queryKey: makingKeys.tools(classId), queryFn: () => api.get<{ state: { picked: string[]; scores: Score[] } }>(`/api/making/classes/${classId}/tools`), staleTime: Infinity, retry: false });
  const state = useRef<{ picked: string[]; scores: Score[] } | null>(null);
  if (q.data && !state.current) state.current = { picked: q.data.state.picked, scores: q.data.state.scores };
  const timer = useRef<number | null>(null);
  const [failed, setFailed] = useState(false);
  const save = (change: Partial<{ picked: string[]; scores: Score[] }>) => {
    state.current = { ...(state.current ?? { picked: [], scores: [] }), ...change };
    if (timer.current) window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => {
      api.put(`/api/making/classes/${classId}/tools`, state.current).then(
        () => setFailed(false),
        () => setFailed(true),
      );
    }, 500);
  };
  useEffect(() => () => void (timer.current && window.clearTimeout(timer.current)), []);
  return { ready: !q.isPending, data: q.data?.state ?? { picked: [], scores: [] }, save, failed };
}

const people = (members: ClassMember[]): Person[] => members.map((m) => ({ id: m.id, name: m.displayName, avatar: m.avatar }));

function Tools({ classId, members, groups }: { classId: string; members: ClassMember[]; groups: { id: string; name: string; memberIds: string[] }[] }) {
  const memory = useToolMemory(classId);
  if (!memory.ready) return <ClassPageSkeleton />;
  const list = people(members);
  return (
    <>
      {memory.failed ? <p role="status" className="mb-3 text-sm text-text-2">The picker and scoreboard could not be saved just now; they still work on this page.</p> : null}
      <div className="grid grid-cols-1 items-start gap-4 xl:grid-cols-2">
        {list.length ? <PickerTool people={list} remembered={memory.data.picked} onRemember={(picked) => memory.save({ picked })} /> : null}
        <CountdownTool />
        {list.length > 1 ? <GroupsTool people={list} classGroups={groups} /> : null}
        <CheckInTool size={list.length} />
        <StopwatchTool />
        <ScoreboardTool initial={memory.data.scores} onScores={(scores) => memory.save({ scores })} suggestions={groups.map((g) => g.name)} />
      </div>
    </>
  );
}

export default function ClassTools() {
  const { id = '' } = useParams();
  const account = useAccountState();
  const detail = useClassDetail(id, account === 'account');
  usePageTitle(detail.data ? `${detail.data.class.name}: class tools` : 'Class tools');
  if (account === 'loading' || (account === 'account' && detail.isPending)) return <ClassPageSkeleton />;
  if (account === 'signedOut' || hasStatus(detail.error, 401)) return <ClassAccountGate state="signedOut" next={`/classes/${id}/tools`} />;
  if (account === 'guest') return <ClassAccountGate state="guest" next={`/classes/${id}/tools`} />;
  if (!detail.data) {
    return hasStatus(detail.error, 400, 404) ? (
      <EmptyState icon={<Users className="size-8" />} title="Class not found" action={<ButtonLink to="/classes">All classes</ButtonLink>}>
        {errorText(detail.error, 'That class does not exist.')}
      </EmptyState>
    ) : (
      <ErrorNotice message={errorText(detail.error, 'The class could not be loaded.')} onRetry={() => void detail.refetch()} />
    );
  }
  const data = detail.data;
  if (data.role !== 'teacher') {
    return (
      <EmptyState icon={<Users className="size-8" />} title="Class tools are for the teacher" action={<ButtonLink to={`/classes/${id}`}>Back to the class</ButtonLink>}>
        Your teacher uses these at the board.
      </EmptyState>
    );
  }
  return (
    <>
      <BackLink to={`/classes/${id}`}>{data.class.name}</BackLink>
      <PageHeader title="Class tools" description={`For the board: pick a student, make teams, run a timer or a stopwatch, check how everyone is doing and keep score. ${plural(data.members.length, 'student')} in ${data.class.name}.`} />
      {data.members.length === 0 ? (
        <div className="mb-4">
          <EmptyState icon={<Users className="size-8" />} title="No students yet">
            The picker and team maker use the class list. The timer works now.
          </EmptyState>
        </div>
      ) : null}
      <Tools classId={id} members={data.members} groups={data.groups} />
    </>
  );
}
