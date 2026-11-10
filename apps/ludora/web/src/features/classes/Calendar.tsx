import { useMemo, useState } from 'react';
import { ChevronLeft, ChevronRight, CalendarClock, DoorOpen, Lock } from 'lucide-react';
import { IconButton } from '../../ui/Button.tsx';
import { dayKey, monthGrid } from './classLogic.ts';

/*
 * A month calendar of the class's assignments: when each opens, is due and closes.
 * Each kind of date has its own icon and word, not only a colour. Below the grid
 * (and instead of it on a phone) the same dates are listed in order.
 */

export interface CalendarItem {
  id: string;
  title: string;
  dueAt: string | null;
  opensAt: string | null;
  closesAt: string | null;
}

type Kind = 'opens' | 'due' | 'closes';

const KIND: Record<Kind, { label: string; icon: typeof CalendarClock; tone: string }> = {
  opens: { label: 'Opens', icon: DoorOpen, tone: 'bg-sky/20' },
  due: { label: 'Due', icon: CalendarClock, tone: 'bg-lantern/25' },
  closes: { label: 'Closes', icon: Lock, tone: 'bg-ember/15' },
};

interface Entry {
  id: string;
  title: string;
  kind: Kind;
  at: Date;
}

const WEEKDAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];

export function ClassCalendar({ items, now }: { items: CalendarItem[]; now: number }) {
  const today = new Date(now);
  const [month, setMonth] = useState({
    y: today.getFullYear(),
    m: today.getMonth(),
  });
  const entries = useMemo(() => {
    const out: Entry[] = [];
    for (const a of items) {
      if (a.opensAt)
        out.push({
          id: a.id,
          title: a.title,
          kind: 'opens',
          at: new Date(a.opensAt),
        });
      if (a.dueAt)
        out.push({
          id: a.id,
          title: a.title,
          kind: 'due',
          at: new Date(a.dueAt),
        });
      if (a.closesAt)
        out.push({
          id: a.id,
          title: a.title,
          kind: 'closes',
          at: new Date(a.closesAt),
        });
    }
    return out.sort((a, b) => a.at.getTime() - b.at.getTime());
  }, [items]);
  const byDay = useMemo(() => {
    const m = new Map<string, Entry[]>();
    for (const e of entries) m.set(dayKey(e.at), [...(m.get(dayKey(e.at)) ?? []), e]);
    return m;
  }, [entries]);
  const weeks = monthGrid(month.y, month.m);
  const title = new Date(month.y, month.m, 1).toLocaleDateString('en-GB', {
    month: 'long',
    year: 'numeric',
  });
  const shift = (d: number) =>
    setMonth(({ y, m }) => ({
      y: m + d < 0 ? y - 1 : m + d > 11 ? y + 1 : y,
      m: (m + d + 12) % 12,
    }));
  const inMonth = entries.filter((e) => e.at.getFullYear() === month.y && e.at.getMonth() === month.m);
  const todayKey = dayKey(today);

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between gap-3">
        <h3 className="font-display text-2xl font-bold text-text" aria-live="polite">
          {title}
        </h3>
        <div className="flex gap-1">
          <IconButton label="Previous month" onClick={() => shift(-1)}>
            <ChevronLeft className="size-5" />
          </IconButton>
          <IconButton label="Next month" onClick={() => shift(1)}>
            <ChevronRight className="size-5" />
          </IconButton>
        </div>
      </div>
      <ul className="flex flex-wrap gap-x-4 gap-y-1 text-sm text-text-2" aria-label="Key">
        {(Object.keys(KIND) as Kind[]).map((k) => {
          const Icon = KIND[k].icon;
          return (
            <li key={k} className="flex items-center gap-1.5">
              <span className={`grid size-6 place-items-center rounded-[var(--radius-s)] ${KIND[k].tone}`}>
                <Icon className="size-3.5" aria-hidden />
              </span>
              {KIND[k].label}
            </li>
          );
        })}
      </ul>

      {/* The grid is for seeing the month at a glance; the list below carries the same dates for screen readers and phones. */}
      <div className="hidden overflow-hidden rounded-[var(--radius-l)] border border-line sm:block" aria-hidden>
        <div className="grid grid-cols-7 bg-surface-2 text-center text-xs font-semibold text-text-2">
          {WEEKDAYS.map((d) => (
            <div key={d} className="px-1 py-2">
              {d.slice(0, 3)}
            </div>
          ))}
        </div>
        {weeks.map((w) => (
          <div key={w[0]!.key} className="grid grid-cols-7 border-t border-line">
            {w.map((d) => {
              const list = byDay.get(d.key) ?? [];
              return (
                <div key={d.key} className={`min-h-24 border-l border-line p-1.5 first:border-l-0 ${d.inMonth ? 'bg-raised' : 'bg-sunken'}`}>
                  <div className={`mb-1 text-right text-xs tabular ${d.key === todayKey ? 'font-bold text-text' : d.inMonth ? 'text-text-2' : 'text-text-3'}`}>
                    {d.key === todayKey ? <span className="rounded-[var(--radius-s)] bg-lantern px-1.5 text-on-accent">{d.date.getDate()}</span> : d.date.getDate()}
                  </div>
                  <ul className="flex flex-col gap-1">
                    {list.slice(0, 3).map((e) => {
                      const Icon = KIND[e.kind].icon;
                      return (
                        <li key={`${e.id}-${e.kind}`} className={`flex items-start gap-1 rounded-[var(--radius-s)] px-1 py-0.5 text-xs text-text ${KIND[e.kind].tone}`}>
                          <Icon className="mt-0.5 size-3 shrink-0" />
                          <span className="line-clamp-2 break-words">{e.title}</span>
                        </li>
                      );
                    })}
                    {list.length > 3 ? <li className="text-xs text-text-3">+{list.length - 3} more</li> : null}
                  </ul>
                </div>
              );
            })}
          </div>
        ))}
      </div>

      <section aria-label={`Dates in ${title}`}>
        {inMonth.length === 0 ? (
          <p className="rounded-[var(--radius-m)] bg-surface-2 p-3 text-sm text-text-2">Nothing opens, is due or closes in {title}. Assignments with dates show up here.</p>
        ) : (
          <ul className="flex flex-col gap-1.5">
            {inMonth.map((e) => {
              const Icon = KIND[e.kind].icon;
              const past = e.at.getTime() < now;
              return (
                <li key={`${e.id}-${e.kind}`} className={`flex items-center gap-3 rounded-[var(--radius-m)] bg-surface-2 px-3 py-2`}>
                  <span className={`grid size-8 shrink-0 place-items-center rounded-[var(--radius-s)] ${KIND[e.kind].tone}`}>
                    <Icon className="size-4" aria-hidden />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block font-semibold break-words text-text">{e.title}</span>
                    <span className="block text-sm text-text-2">
                      {KIND[e.kind].label}{' '}
                      <time dateTime={e.at.toISOString()}>
                        {e.at.toLocaleString('en-GB', {
                          weekday: 'long',
                          day: 'numeric',
                          month: 'long',
                          hour: '2-digit',
                          minute: '2-digit',
                        })}
                      </time>
                      {past ? ', passed' : ''}
                    </span>
                  </span>
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </div>
  );
}
