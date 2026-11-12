import { useMemo, useState } from 'react';
import { CODE_CATALOGUE, STARTER_BLUEPRINTS, describeBlueprint, highlightLine, toCode, type CodeToken } from '@ludora/shared';
import { Dialog, Input, TabPanel, Tabs } from '../../ui/primitives.tsx';
import { Button } from '../../ui/Button.tsx';

/*
 * "What you can write": every kind of line, grouped, each with an example that goes into the code
 * when pressed; and the starting points as code to read and learn from.
 */

const TOKEN_CLASS: Record<CodeToken['kind'], string> = { key: 'text-sky', string: 'text-glim', number: 'text-lantern', comment: 'text-text-3 italic', word: 'text-text', plain: 'text-text-2' };

export function CodeLine({ line }: { line: string }) {
  return (
    <>
      {highlightLine(line).map((t, i) => (
        <span key={i} className={TOKEN_CLASS[t.kind]}>
          {t.text}
        </span>
      ))}
    </>
  );
}

export function CodeHelp({ open, onOpenChange, onInsert, onUseStarter, readOnly }: { open: boolean; onOpenChange: (v: boolean) => void; onInsert: (line: string) => void; onUseStarter: (code: string) => void; readOnly?: boolean }) {
  const [tab, setTab] = useState('lines');
  const [q, setQ] = useState('');
  const groups = useMemo(() => {
    const out = new Map<string, typeof CODE_CATALOGUE[number][]>();
    const term = q.trim().toLowerCase();
    for (const e of CODE_CATALOGUE) {
      if (term && !`${e.code} ${e.help} ${e.group}`.toLowerCase().includes(term)) continue;
      out.set(e.group, [...(out.get(e.group) ?? []), e]);
    }
    return [...out.entries()];
  }, [q]);
  return (
    <Dialog open={open} onOpenChange={onOpenChange} size="lg" title="What you can write" description={readOnly ? 'Every kind of line a game can have.' : 'Press a line to put it in your code, then change its numbers and words.'}>
      <Tabs
        value={tab}
        onValueChange={setTab}
        label="Help"
        items={[
          { value: 'lines', label: 'Every kind of line' },
          { value: 'starters', label: 'Starting points as code' },
        ]}
      >
        <TabPanel value="lines" className="flex flex-col gap-4">
          <label className="block">
            <span className="mb-1 block text-sm font-semibold">Find a line</span>
            <Input type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="lives, coins, when, 3D…" />
          </label>
          {groups.map(([group, entries]) => (
            <section key={group} aria-label={group}>
              <h3 className="mb-1.5 font-display text-lg font-bold">{group}</h3>
              <ul className="flex flex-col gap-1">
                {entries.map((e) => (
                  <li key={e.code}>
                    <button
                      type="button"
                      disabled={readOnly}
                      onClick={() => onInsert(e.code)}
                      className="flex min-h-11 w-full flex-col items-start rounded-[var(--radius-m)] border border-line bg-surface-2 px-3 py-1.5 text-left hover:border-line-strong disabled:cursor-default"
                    >
                      <span className="font-sans text-sm [overflow-wrap:anywhere]">
                        <CodeLine line={e.code} />
                      </span>
                      <span className="text-xs text-text-2">{e.help}</span>
                    </button>
                  </li>
                ))}
              </ul>
            </section>
          ))}
          {!groups.length ? <p className="text-sm text-text-2">No line matches that. Try another word.</p> : null}
        </TabPanel>
        <TabPanel value="starters" className="flex flex-col gap-4">
          {STARTER_BLUEPRINTS.map(({ id, blueprint }) => {
            const code = toCode(blueprint);
            return (
              <section key={id} aria-label={blueprint.name} className="rounded-[var(--radius-m)] border border-line bg-surface-2 p-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <h3 className="font-display text-lg font-bold">{blueprint.name}</h3>
                  {!readOnly ? (
                    <Button size="sm" variant="secondary" onClick={() => onUseStarter(code)}>
                      Use this code
                    </Button>
                  ) : null}
                </div>
                <p className="text-sm text-text-2">{describeBlueprint(blueprint)[0]}</p>
                <pre className="mt-2 max-h-64 overflow-auto rounded-[var(--radius-s)] bg-sunken p-2 font-sans text-sm leading-6 whitespace-pre-wrap [overflow-wrap:anywhere]" tabIndex={0} aria-label={`The code of ${blueprint.name}`}>
                  {code.trimEnd().split('\n').map((l, i) => (
                    <div key={i}>{l ? <CodeLine line={l} /> : '​'}</div>
                  ))}
                </pre>
              </section>
            );
          })}
        </TabPanel>
      </Tabs>
    </Dialog>
  );
}
