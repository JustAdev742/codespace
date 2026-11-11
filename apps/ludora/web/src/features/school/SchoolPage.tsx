import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Link } from 'react-router';
import { Megaphone, Settings2, Trophy, Users } from 'lucide-react';
import { toast } from 'sonner';
import { api } from '../../lib/api.ts';
import { useMe } from '../../lib/session.ts';
import { EmptyState, ErrorNotice, PageHeader, Panel, Skeleton, TabPanel, Tabs } from '../../ui/primitives.tsx';
import { Button, ButtonLink } from '../../ui/Button.tsx';
import { Segmented } from '../../ui/Segmented.tsx';
import { errorText, usePageTitle } from '../reports/reportUi.tsx';
import { HouseCrest } from './emblems.tsx';
import { HouseBoard, YearTable } from './Standings.tsx';
import { CupsPanel } from './Cups.tsx';
import { CompetePanel } from './Compete.tsx';
import { HouseWelcome } from './Welcome.tsx';
import { dayText, schoolKeys, useNotices, useSchool, useSchoolMe, useStandings, type House } from './schoolData.ts';
import { formatDate } from '../../lib/format.ts';

/*
 * /school: the whole school in one place. House standings (this week, the current cup, all time)
 * and year groups, the cups and hall of fame, tournaments and class challenges, and notices.
 * School staff and teachers get links to their own tools. Totals and display names only.
 */

const TABS = ['houses', 'cups', 'compete', 'notices'] as const;
type Tab = (typeof TABS)[number];

function tabFromUrl(): Tab {
  const t = new URLSearchParams(window.location.search).get('tab');
  return (TABS as readonly string[]).includes(t ?? '') ? (t as Tab) : 'houses';
}

function MyHouse({ house, canChoose, houses }: { house: House | null; canChoose: boolean; houses: House[] }) {
  const qc = useQueryClient();
  const choose = useMutation({
    mutationFn: (houseId: string) => api.post<{ house: House }>('/api/school/me/house', { houseId }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['school'] });
    },
    onError: (e) => toast.error(errorText(e, 'Your house could not be saved.')),
  });
  const [picked, setPicked] = useState<House | null>(null);
  if (house) {
    return (
      <Panel className="flex items-center gap-4 p-4 sm:p-5">
        <HouseCrest house={house} size={64} />
        <div className="min-w-0">
          <p className="text-sm font-semibold text-text-3">Your house</p>
          <p className="truncate font-display text-3xl font-bold text-text">{house.name}</p>
        </div>
      </Panel>
    );
  }
  if (canChoose && houses.length) {
    return (
      <Panel className="flex flex-col gap-4 p-4 sm:p-5" aria-labelledby="choose-house">
        <div>
          <h2 id="choose-house" className="font-display text-2xl font-bold text-text">
            Choose your house
          </h2>
          <p className="text-text-2">You choose once. After that only your teacher can change it.</p>
        </div>
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {houses.map((h) => (
            <button
              key={h.id}
              type="button"
              aria-pressed={picked?.id === h.id}
              onClick={() => setPicked(h)}
              className="press-soft flex min-h-14 items-center gap-3 rounded-[var(--radius-m)] border border-line bg-surface-2 p-3 text-left font-semibold text-text aria-pressed:border-[var(--focus)] aria-pressed:ring-2 aria-pressed:ring-[var(--focus)]"
            >
              <HouseCrest house={h} size={36} />
              <span className="min-w-0 truncate">{h.name}</span>
            </button>
          ))}
        </div>
        <div>
          <Button variant="primary" disabled={!picked} loading={choose.isPending} onClick={() => picked && choose.mutate(picked.id)}>
            {picked ? `Join ${picked.name}` : 'Pick a house first'}
          </Button>
        </div>
      </Panel>
    );
  }
  return (
    <Panel className="p-4 sm:p-5">
      <p className="font-semibold text-text">You are not in a house yet</p>
      <p className="text-text-2">{houses.length ? 'Your teacher puts you in your house. Your right answers then earn points for it.' : 'This school has not set up its houses yet.'}</p>
    </Panel>
  );
}

function HousesTab() {
  const [period, setPeriod] = useState<'week' | 'cup' | 'all'>('week');
  const standings = useStandings(period);
  const data = standings.data;
  const label = period === 'week' ? 'This week' : period === 'cup' ? (data?.cup ? data.cup.name : 'All time (no cup running)') : 'All time';
  return (
    <div className="grid gap-5 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
      <Panel className="flex flex-col gap-4 p-4 sm:p-5" aria-labelledby="house-standings">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 id="house-standings" className="font-display text-2xl font-bold text-text">
            House standings
          </h2>
          <Segmented
            label="Standings for"
            value={period}
            onChange={setPeriod}
            options={[
              { value: 'week', label: 'This week' },
              { value: 'cup', label: 'This cup' },
              { value: 'all', label: 'All time' },
            ]}
          />
        </div>
        <p className="text-sm text-text-3" aria-live="polite">
          {label}
          {data?.from && data.to ? `: ${dayText(data.from)} to ${dayText(data.to)}` : ''}
        </p>
        {standings.isPending ? <Skeleton className="h-48" /> : standings.isError ? <ErrorNotice message={errorText(standings.error, 'The standings did not load.')} onRetry={() => void standings.refetch()} /> : <HouseBoard houses={data!.houses} caption={`House standings, ${label}`} />}
      </Panel>
      <Panel className="flex flex-col gap-3 p-4 sm:p-5" aria-labelledby="year-standings">
        <h2 id="year-standings" className="font-display text-2xl font-bold text-text">
          Year groups
        </h2>
        <p className="text-sm text-text-3">House points earned by each year, from the year players give in their settings.</p>
        {standings.isPending ? <Skeleton className="h-40" /> : data ? <YearTable years={data.years} /> : null}
      </Panel>
    </div>
  );
}

function NoticesTab() {
  const notices = useNotices();
  if (notices.isPending) return <Skeleton className="h-32" />;
  if (notices.isError) return <ErrorNotice message={errorText(notices.error, 'Notices did not load.')} onRetry={() => void notices.refetch()} />;
  if (!notices.data.notices.length) return <EmptyState icon={<Megaphone />} title="No notices right now">School notices show here while they are on.</EmptyState>;
  return (
    <ul className="flex flex-col gap-3">
      {notices.data.notices.map((n) => (
        <li key={n.id}>
          <Panel as="article" className="p-4 sm:p-5">
            <h3 className="font-display text-xl font-bold text-text">{n.title}</h3>
            {n.body ? <p className="mt-1 whitespace-pre-line text-text-2">{n.body}</p> : null}
            <p className="mt-2 text-xs text-text-3">Until {formatDate(n.endsAt, { weekday: 'long', day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit' })}</p>
          </Panel>
        </li>
      ))}
    </ul>
  );
}

export default function SchoolPage() {
  usePageTitle('School');
  const me = useMe();
  const school = useSchool();
  const mine = useSchoolMe();
  const qc = useQueryClient();
  const [tab, setTab] = useState<Tab>(tabFromUrl);
  const changeTab = (v: string) => {
    setTab(v as Tab);
    // Built from the address as it is now (React Router's updater can see a stale one).
    const params = new URLSearchParams(window.location.search);
    if (v === 'houses') params.delete('tab');
    else params.set('tab', v);
    const q = params.toString();
    window.history.replaceState(window.history.state, '', `${window.location.pathname}${q ? `?${q}` : ''}`);
  };
  if (!me.data?.user) {
    return (
      <>
        <PageHeader title="School" />
        <EmptyState icon={<Users />} title="Sign in to see your school" action={<ButtonLink to="/signin?next=/school" variant="primary">Sign in</ButtonLink>}>
          Houses, house points and school notices are for players with an account.
        </EmptyState>
      </>
    );
  }
  const can = school.data?.can;
  return (
    <>
      <PageHeader
        title="School"
        description="Houses, house points, cups and competitions across the whole school."
        actions={
          <>
            {can?.teach ? (
              <ButtonLink to="/school/classes" icon={<Users className="size-4" />}>
                My classes
              </ButtonLink>
            ) : null}
            {can?.manage || can?.viewUsage ? (
              <ButtonLink to="/school/manage" variant="primary" icon={<Settings2 className="size-4" />}>
                Run the school
              </ButtonLink>
            ) : null}
          </>
        }
      />
      {mine.data?.welcome && mine.data.house ? (
        <HouseWelcome
          house={mine.data.house}
          onDone={() => {
            void api.post('/api/school/me/welcomed').then(() => qc.invalidateQueries({ queryKey: schoolKeys.me }));
          }}
        />
      ) : null}
      {school.isError ? <ErrorNotice message={errorText(school.error, 'School did not load.')} onRetry={() => void school.refetch()} /> : null}
      <div className="mb-5">{school.data ? <MyHouse house={school.data.me.house} canChoose={school.data.me.canChoose} houses={school.data.houses} /> : <Skeleton className="h-24" />}</div>
      <Tabs
        label="School"
        value={tab}
        onValueChange={changeTab}
        items={[
          { value: 'houses', label: 'Standings' },
          { value: 'cups', label: 'Cups and hall of fame' },
          { value: 'compete', label: 'Tournaments and challenges' },
          { value: 'notices', label: 'Notices' },
        ]}
      >
        <TabPanel value="houses">
          <HousesTab />
        </TabPanel>
        <TabPanel value="cups">
          <CupsPanel />
        </TabPanel>
        <TabPanel value="compete">
          <CompetePanel teacher={Boolean(can?.teach)} />
        </TabPanel>
        <TabPanel value="notices">
          <NoticesTab />
        </TabPanel>
      </Tabs>
      {school.data && school.data.settings.dailyCap ? (
        <p className="mt-6 text-sm text-text-3">
          <Trophy className="mr-1 inline size-4 align-[-3px]" aria-hidden />
          Each right answer in a live game or an assignment earns {school.data.settings.pointsPerCorrect === 1 ? 'a house point' : `${school.data.settings.pointsPerCorrect} house points`}, up to {school.data.settings.dailyCap} a day for each player. <Link to="/leaderboards" className="font-semibold text-link underline underline-offset-2">Leaderboards</Link> show players who chose to appear.
        </p>
      ) : null}
    </>
  );
}
