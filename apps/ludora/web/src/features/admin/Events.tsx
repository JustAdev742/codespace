import { useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { CalendarRange } from 'lucide-react';
import { api } from '../../lib/api.ts';
import { formatNumber, plural } from '../../lib/format.ts';
import { useCan } from '../../lib/session.ts';
import { useNow } from '../../lib/useNow.ts';
import { Amount, Badge, EmptyState, ErrorNotice, Skeleton, Switch } from '../../ui/primitives.tsx';
import { Button, ButtonLink } from '../../ui/Button.tsx';
import { ActionDialog, Card, KeyValues, StaffPage, dateTime, useStaffMutation } from './ui.tsx';
import { DateTimeField, isoToLocalInput, localInputToIso } from './Economy.tsx';

/*
 * Limited-time events. Each event is a feature flag (the switch), a date
 * window, a shop section and an event currency that expires with it. The
 * server moves the shop listings and the currency expiry together with the
 * window, in one transaction, so staff only ever set the dates here.
 */

interface AdminEvent {
  key: string;
  name: string;
  flag: string;
  enabled: boolean;
  startsAt: string;
  endsAt: string;
  running: boolean;
  listings: number;
  currency: { code: string; name: string; expiresAt: string | null; holders: number; circulating: number } | null;
}

const eventsKey = ['admin', 'events'] as const;

function stateOf(ev: AdminEvent, now: number): { label: string; tone: 'mint' | 'sky' | 'neutral' | 'amber'; detail: string } {
  const start = new Date(ev.startsAt).getTime();
  const end = new Date(ev.endsAt).getTime();
  if (!ev.enabled) return { label: 'Switched off', tone: 'amber', detail: 'Players cannot see it, whatever the dates say.' };
  if (ev.running) return { label: 'Running', tone: 'mint', detail: `Ends ${dateTime(ev.endsAt)}.` };
  if (now < start) return { label: 'Scheduled', tone: 'sky', detail: `Starts ${dateTime(ev.startsAt)}.` };
  if (now > end) return { label: 'Ended', tone: 'neutral', detail: `Ended ${dateTime(ev.endsAt)}.` };
  return { label: 'On', tone: 'mint', detail: '' };
}

export default function Events() {
  const q = useQuery({ queryKey: eventsKey, queryFn: () => api.get<{ events: AdminEvent[] }>('/api/admin/events') });
  return (
    <StaffPage title="Events" description="Limited-time events. Each has an on and off switch, a date window, its own shop section and an event currency that expires when it ends.">
      {q.isError ? (
        <ErrorNotice message="The events did not load." onRetry={() => void q.refetch()} />
      ) : !q.data ? (
        <Skeleton className="h-96" />
      ) : !q.data.events.length ? (
        <EmptyState icon={<CalendarRange className="size-8" />} title="No events">
          Events are defined in the server code. There are none at the moment.
        </EmptyState>
      ) : (
        <div className="flex flex-col gap-4">
          {q.data.events.map((ev) => (
            <EventCard key={ev.key} ev={ev} />
          ))}
        </div>
      )}
    </StaffPage>
  );
}

function EventCard({ ev }: { ev: AdminEvent }) {
  const now = useNow(30_000);
  const canShop = useCan('shop.manage');
  const canEconomy = useCan('economy.view');
  const canFlags = useCan('flags.manage');
  const state = stateOf(ev, now);
  const [start, setStart] = useState(() => isoToLocalInput(ev.startsAt, true));
  const [end, setEnd] = useState(() => isoToLocalInput(ev.endsAt, true));
  useEffect(() => {
    setStart(isoToLocalInput(ev.startsAt, true));
    setEnd(isoToLocalInput(ev.endsAt, true));
  }, [ev.startsAt, ev.endsAt]);
  const [flagOpen, setFlagOpen] = useState(false);
  const [datesOpen, setDatesOpen] = useState(false);

  const startIso = localInputToIso(start);
  const endIso = localInputToIso(end);
  const startChanged = start !== isoToLocalInput(ev.startsAt, true);
  const endChanged = end !== isoToLocalInput(ev.endsAt, true);
  const dateError = !startIso || !endIso ? 'Both dates are needed.' : new Date(startIso) >= new Date(endIso) ? 'The end has to come after the start.' : undefined;

  const change = useStaffMutation((body: Record<string, unknown>) => api.patch(`/api/admin/events/${ev.key}`, body), {
    silentError: true,
    invalidate: [eventsKey, ['admin', 'flags'], ['admin', 'shop'], ['admin', 'currencies'], ['admin', 'economy']],
    success: (_r, b) => ('enabled' in b ? (b.enabled ? `${ev.name} is switched on.` : `${ev.name} is switched off.`) : `${ev.name} dates saved. Its shop listings and ${ev.currency?.name ?? 'currency'} expiry moved with them.`),
  });

  const holders = ev.currency?.holders ?? 0;
  return (
    <Card
      title={
        <span className="flex flex-wrap items-center gap-2">
          {ev.name}
          <Badge tone={state.tone}>{state.label}</Badge>
        </span>
      }
    >
      <div className="flex flex-col gap-5">
        {state.detail ? <p className="-mt-1 text-sm text-text-2">{state.detail}</p> : null}
        <KeyValues
          items={[
            ['Event key', <span key="k" className="font-mono">{ev.key}</span>],
            ['Feature flag', <span key="f" className="font-mono">{ev.flag}</span>],
            ['Starts', dateTime(ev.startsAt)],
            ['Ends', dateTime(ev.endsAt)],
            ['Shop listings', `${formatNumber(ev.listings)} on sale in the Event section`],
            ['Event currency', ev.currency ? `${ev.currency.name} (${ev.currency.code})` : 'None'],
            ['Players holding it', ev.currency ? `${formatNumber(holders)} (test accounts included)` : '-'],
            ['In circulation', ev.currency ? <Amount key="c" currency={ev.currency.code} value={ev.currency.circulating} size="sm" /> : '-'],
            ['Currency expires', ev.currency ? (ev.currency.expiresAt ? dateTime(ev.currency.expiresAt) : 'No expiry set') : '-'],
          ]}
        />
        <div className="flex flex-wrap gap-2">
          {canShop ? (
            <ButtonLink to="/staff/shop?section=event" size="sm" variant="secondary">
              Event shop listings
            </ButtonLink>
          ) : null}
          {canEconomy ? (
            <ButtonLink to="/staff/economy?tab=currencies" size="sm" variant="ghost">
              Currencies
            </ButtonLink>
          ) : null}
          {canFlags ? (
            <ButtonLink to="/staff/flags" size="sm" variant="ghost">
              Feature flags
            </ButtonLink>
          ) : null}
        </div>

        <div className="rounded-[var(--radius-m)] border border-line p-3">
          <Switch
            checked={ev.enabled}
            onCheckedChange={() => setFlagOpen(true)}
            label="Event switched on"
            description={ev.enabled ? 'Switching it off closes the event shop and makes the event currency unspendable straight away. You will type the event key to confirm.' : 'Switching it on opens the event for everyone, within its dates.'}
          />
        </div>

        <section aria-labelledby={`dates-${ev.key}`} className="flex flex-col gap-3 rounded-[var(--radius-m)] border border-line p-3">
          <div>
            <h3 id={`dates-${ev.key}`} className="font-sans font-semibold text-text">
              Dates
            </h3>
            <p className="text-sm text-text-2">
              Moving the window moves everything with it: the {plural(ev.listings, 'shop listing')} in the Event section get the same start and end, and {ev.currency ? `${ev.currency.name} expire` : 'the event currency expires'} at the new end.
            </p>
          </div>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <DateTimeField label="Starts" value={start} onChange={setStart} withSeconds />
            <DateTimeField label="Ends" value={end} onChange={setEnd} withSeconds error={startChanged || endChanged ? dateError : undefined} />
          </div>
          <div className="flex flex-wrap gap-2">
            <Button variant="primary" disabled={!(startChanged || endChanged) || Boolean(dateError)} onClick={() => setDatesOpen(true)}>
              Save dates
            </Button>
            {startChanged || endChanged ? (
              <Button
                variant="ghost"
                onClick={() => {
                  setStart(isoToLocalInput(ev.startsAt, true));
                  setEnd(isoToLocalInput(ev.endsAt, true));
                }}
              >
                Discard changes
              </Button>
            ) : null}
          </div>
        </section>
      </div>

      <ActionDialog
        open={flagOpen}
        onOpenChange={setFlagOpen}
        title={ev.enabled ? `Switch off ${ev.name}` : `Switch on ${ev.name}`}
        description={
          ev.enabled
            ? `This ends the event now for everyone and closes the event shop. ${!ev.currency ? 'Its currency can no longer be spent.' : holders ? `${plural(holders, 'account')} holding ${formatNumber(ev.currency.circulating)} ${ev.currency.name} can no longer spend them.` : `Nobody holds any ${ev.currency.name} at the moment.`}`
            : `Players see the event within its dates, ${dateTime(ev.startsAt)} to ${dateTime(ev.endsAt)}.`
        }
        confirmWord={ev.enabled ? ev.key : null}
        confirmLabel={ev.enabled ? `Switch off ${ev.name}` : `Switch on ${ev.name}`}
        variant={ev.enabled ? 'danger' : 'primary'}
        onSubmit={async ({ reason, confirm }) => {
          await change.mutateAsync({ enabled: !ev.enabled, reason, ...(confirm !== undefined ? { confirm } : {}) });
        }}
      />
      <ActionDialog
        open={datesOpen}
        onOpenChange={setDatesOpen}
        title={`Move ${ev.name}`}
        description="These move together, in one change:"
        confirmLabel="Save dates"
        disabled={Boolean(dateError)}
        onSubmit={async ({ reason }) => {
          await change.mutateAsync({ ...(startChanged ? { startsAt: startIso } : {}), ...(endChanged ? { endsAt: endIso } : {}), reason });
        }}
      >
        <ul className="flex list-disc flex-col gap-1 pl-5 text-sm text-text-2">
          <li>
            The event window: <span className="text-text">{startIso ? dateTime(startIso) : '-'}</span> to <span className="text-text">{endIso ? dateTime(endIso) : '-'}</span>
            {startChanged || endChanged ? <span className="text-text-3"> (was {dateTime(ev.startsAt)} to {dateTime(ev.endsAt)})</span> : null}.
          </li>
          <li>The start and end of all {plural(ev.listings, 'shop listing')} in the Event section.</li>
          {ev.currency ? <li>When {ev.currency.name} expire: {endIso ? dateTime(endIso) : '-'}.</li> : null}
        </ul>
      </ActionDialog>
    </Card>
  );
}
