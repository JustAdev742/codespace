import { useId, useState, type ReactNode } from 'react';
import { Plus, Trash2, Users } from 'lucide-react';
import {
  ANSWER_RULES,
  BLUEPRINT_EVENTS,
  BLUEPRINT_KINDS,
  BOARD_STYLES,
  ENDING_INFO,
  EVENT_INFO,
  GAME_GLYPHS,
  KIND_INFO,
  KINDS_3D,
  PLACE_INFO,
  POWER_INFO,
  POWER_UPS,
  SCENE_CAMERAS,
  SCENE_PLACES,
  SCENE_PROPS,
  SCENE_SHAPES,
  SCENE_TIMES,
  outcomeOdds,
  withKind,
  ACTION_N,
  ACTION_VAR,
  CONDITION_N,
  CONDITION_VAR,
  HARMFUL_ACTIONS,
  MAX_RULES,
  MAX_VARS,
  RULE_ACTIONS,
  RULE_CONDITIONS,
  RULE_MESSAGES,
  RULE_TRIGGERS,
  ROOM_TRIGGERS,
  ROUNDS_TRIGGERS,
  TRIGGER_N,
  TRIGGER_VAR,
  VAR_MAX,
  describeRule,
  describeVar,
  ruleCode,
  type GameRule,
  type GameVar,
  type Blueprint,
  type BlueprintProblem,
} from '@ludora/shared';
import { CodeLine } from './CodeHelp.tsx';
import { Field, Input, Select, Switch, Textarea } from '../../ui/primitives.tsx';
import { Button } from '../../ui/Button.tsx';

/*
 * The choices side of the studio: every part a made game is built from, in the order a person
 * thinks about a game. Each control changes the blueprint at once (the live test and the rules
 * follow). Problems from the check show under the control they belong to.
 */

type Change = (fn: (bp: Blueprint) => Blueprint) => void;

const ANSWER_INFO: Record<(typeof ANSWER_RULES)[number], { label: string; help: string }> = {
  points: { label: 'Points', help: 'A right answer gains a set amount, with extra for speed and streaks if you like.' },
  steady: { label: 'Steady', help: 'Every right answer gains the same. Simple and fair.' },
  chance: { label: 'Surprise', help: 'A right answer opens a surprise. You set the odds, and players see them.' },
};
const STYLE_INFO: Record<(typeof BOARD_STYLES)[number], string> = { bold: 'Bold', soft: 'Soft', striped: 'Striped' };
const SHAPE_INFO: Record<(typeof SCENE_SHAPES)[number], string> = { straight: 'Straight', zigzag: 'Zigzag', loop: 'Loop' };
const CAMERA_INFO: Record<(typeof SCENE_CAMERAS)[number], string> = { follow: 'Behind your Glim', overview: 'From above', side: 'From the side' };
const TIME_INFO: Record<(typeof SCENE_TIMES)[number], string> = { day: 'Day', dusk: 'Dusk', night: 'Night' };
const PROP_INFO: Record<(typeof SCENE_PROPS)[number], string> = { trees: 'Trees', rocks: 'Rocks', crates: 'Crates', lamps: 'Lamps', tents: 'Tents', flags: 'Flags' };

/** The first problem for a path (or anything under it). */
export function problemAt(problems: BlueprintProblem[], ...paths: string[]): string | undefined {
  return problems.find((p) => paths.some((path) => p.path === path || p.path.startsWith(`${path}.`)))?.message;
}

function Section({ id, title, children, hint }: { id: string; title: string; children: ReactNode; hint?: string }) {
  return (
    <section aria-labelledby={id} className="flex flex-col gap-3 rounded-[var(--radius-l)] border border-line bg-raised p-4">
      <div>
        <h2 id={id} className="font-display text-2xl font-bold">
          {title}
        </h2>
        {hint ? <p className="text-sm text-text-2">{hint}</p> : null}
      </div>
      {children}
    </section>
  );
}

/** A group of radio choices drawn as cards (native radios, so keyboards and screen readers work as usual). */
function Choices<T extends string>({ legend, name, value, options, onChange, error, id }: { legend: string; name: string; value: T; options: { value: T; label: string; help?: string; disabled?: string | false }[]; onChange: (v: T) => void; error?: string | undefined; id?: string }) {
  const errId = useId();
  return (
    <fieldset id={id} className="flex flex-col gap-1.5" aria-describedby={error ? errId : undefined} tabIndex={-1}>
      <legend className="mb-1 text-sm font-semibold">{legend}</legend>
      <div className="grid grid-cols-1 gap-1.5 min-[480px]:grid-cols-2">
        {options.map((o) => (
          <label
            key={o.value}
            className={`flex min-h-11 cursor-pointer items-start gap-2 rounded-[var(--radius-m)] border px-3 py-2 ${value === o.value ? 'border-lantern-deep bg-lantern/10' : 'border-line bg-surface-2'} ${o.disabled ? 'cursor-not-allowed opacity-70' : ''}`}
          >
            <input type="radio" name={name} value={o.value} checked={value === o.value} disabled={Boolean(o.disabled)} onChange={() => onChange(o.value)} className="mt-1 size-4 shrink-0 accent-[var(--lantern-deep)]" />
            <span className="min-w-0">
              <span className="block font-semibold">{o.label}</span>
              {o.disabled ? <span className="block text-xs text-text-2">{o.disabled}</span> : o.help ? <span className="block text-xs text-text-2">{o.help}</span> : null}
            </span>
          </label>
        ))}
      </div>
      {error ? (
        <p id={errId} className="text-xs font-semibold text-ember">
          {error}
        </p>
      ) : null}
    </fieldset>
  );
}

function NumberField({ label, value, min, max, step = 1, onChange, hint, error, id }: { label: string; value: number; min: number; max: number; step?: number; onChange: (n: number) => void; hint?: string; error?: string | undefined; id?: string }) {
  return (
    <Field label={label} hint={hint ?? `${min} to ${max}`} error={error} {...(id ? { id } : {})}>
      {(p) => (
        <Input
          {...p}
          type="number"
          inputMode="numeric"
          min={min}
          max={max}
          step={step}
          value={Number.isFinite(value) ? value : ''}
          onChange={(e) => onChange(e.target.value === '' ? Number.NaN : Number(e.target.value))}
          className="max-w-[9rem]"
        />
      )}
    </Field>
  );
}

function HueField({ label, value, onChange, id }: { label: string; value: number; onChange: (n: number) => void; id: string }) {
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={id} className="flex items-center gap-2 text-sm font-semibold">
        {label}
        <span className="inline-block size-5 rounded-full border border-line" style={{ background: `hsl(${value} 80% 62%)` }} aria-hidden />
      </label>
      <input id={id} type="range" min={0} max={359} value={value} onChange={(e) => onChange(Number(e.target.value))} className="h-11 w-full accent-[var(--lantern-deep)]" aria-valuetext={`Hue ${value}`} />
    </div>
  );
}

function Checks<T extends string>({ legend, values, chosen, label, onToggle, note, id }: { legend: string; values: readonly T[]; chosen: readonly T[]; label: (v: T) => ReactNode; onToggle: (v: T, on: boolean) => void; note?: (v: T) => string | null; id?: string }) {
  return (
    <fieldset id={id} className="flex flex-col gap-1.5" tabIndex={-1}>
      <legend className="mb-1 text-sm font-semibold">{legend}</legend>
      <div className="grid grid-cols-1 gap-1.5 min-[480px]:grid-cols-2">
        {values.map((v) => {
          const off = note?.(v) ?? null;
          return (
            <label key={v} className={`flex min-h-11 items-start gap-2 rounded-[var(--radius-m)] border border-line bg-surface-2 px-3 py-2 ${off ? 'opacity-70' : 'cursor-pointer'}`}>
              <input type="checkbox" checked={chosen.includes(v)} disabled={Boolean(off) && !chosen.includes(v)} onChange={(e) => onToggle(v, e.target.checked)} className="mt-1 size-4 shrink-0 accent-[var(--lantern-deep)]" />
              <span className="min-w-0 text-sm">
                {label(v)}
                {off ? <span className="block text-xs text-text-2">{off}</span> : null}
              </span>
            </label>
          );
        })}
      </div>
    </fieldset>
  );
}

const toggle = <T,>(list: readonly T[], v: T, on: boolean): T[] => (on ? [...list.filter((x) => x !== v), v] : list.filter((x) => x !== v));

export function Builder({ bp, change, problems }: { bp: Blueprint; change: Change; problems: BlueprintProblem[] }) {
  const info = KIND_INFO[bp.kind.type];
  const size = (bp.kind as Record<string, unknown>)[info.size.key] as number;
  const cooperative = bp.kind.type === 'build' || bp.end.type === 'together';
  const odds = outcomeOdds(bp.answer.outcomes);
  return (
    <div className="flex flex-col gap-4">
      <Section id="b-words" title="Its words" hint="Players see these. They are checked like set titles.">
        <Field label="Name" error={problemAt(problems, 'name')} id="f-name">
          {(p) => <Input {...p} value={bp.name} maxLength={40} onChange={(e) => change((b) => ({ ...b, name: e.target.value }))} />}
        </Field>
        <Field label="What points are called" hint="In the plural, such as steps, coins or stars." error={problemAt(problems, 'unit')} id="f-unit">
          {(p) => <Input {...p} value={bp.unit} maxLength={16} onChange={(e) => change((b) => ({ ...b, unit: e.target.value }))} />}
        </Field>
        <Field label="The goal in a sentence (optional)" error={problemAt(problems, 'goal')} id="f-goal">
          {(p) => <Input {...p} value={bp.goal} maxLength={120} onChange={(e) => change((b) => ({ ...b, goal: e.target.value }))} />}
        </Field>
        <Field label="How to play (optional)" hint="Up to 4 short lines, one per line." error={problemAt(problems, 'howTo')} id="f-howTo">
          {(p) => (
            <Textarea
              {...p}
              rows={3}
              value={bp.howTo.join('\n')}
              onChange={(e) =>
                change((b) => ({
                  ...b,
                  howTo: e.target.value
                    .split('\n')
                    .slice(0, 4)
                    .map((l) => l.slice(0, 90)),
                }))
              }
              onBlur={() => change((b) => ({ ...b, howTo: b.howTo.map((l) => l.trim()).filter(Boolean) }))}
            />
          )}
        </Field>
      </Section>

      <Section id="b-kind" title="What the game is about">
        <Choices
          id="f-kind"
          legend="Kind of game"
          name="kind"
          value={bp.kind.type}
          error={problemAt(problems, 'kind.type')}
          options={BLUEPRINT_KINDS.map((k) => ({ value: k, label: KIND_INFO[k].label, help: KIND_INFO[k].blurb }))}
          onChange={(k) => change((b) => withKind(b, k))}
        />
        <NumberField
          id="f-kind.size"
          label={info.size.label}
          value={size}
          min={info.size.min}
          max={info.size.max}
          step={info.size.step}
          error={problemAt(problems, `kind.${info.size.key}`)}
          onChange={(n) => change((b) => ({ ...b, kind: { ...b.kind, [info.size.key]: n } as Blueprint['kind'] }))}
        />
        <Switch checked={bp.kind.twist} onCheckedChange={(v) => change((b) => ({ ...b, kind: { ...b.kind, twist: v } }))} label={`Twist: ${info.twist.label}`} description={info.twist.help} />
        {info.teams === 'required' ? <p className="text-sm text-text-2">Played in teams. The host's room sorts players into two.</p> : null}
      </Section>

      <Section id="b-pacing" title="How questions arrive">
        <Choices
          id="f-pacing"
          legend="Pacing"
          name="pacing"
          value={bp.pacing}
          options={[
            { value: 'rounds', label: 'Everyone together', help: 'The same question for everyone at once, in rounds.' },
            { value: 'own-pace', label: 'Each at their own pace', help: 'Everyone answers as fast as they like.' },
          ]}
          onChange={(v) => change((b) => ({ ...b, pacing: v }))}
        />
        <div className="flex flex-wrap gap-4">
          <NumberField id="f-end.questions" label={bp.pacing === 'rounds' ? 'Questions' : 'Questions each'} value={bp.end.questions} min={5} max={50} error={problemAt(problems, 'end.questions')} onChange={(n) => change((b) => ({ ...b, end: { ...b.end, questions: n } }))} />
          {bp.pacing === 'rounds' ? <NumberField id="f-end.questionTimeSec" label="Seconds per question" value={bp.end.questionTimeSec} min={5} max={60} error={problemAt(problems, 'end.questionTimeSec')} onChange={(n) => change((b) => ({ ...b, end: { ...b.end, questionTimeSec: n } }))} /> : null}
        </div>
      </Section>

      <Section id="b-answer" title="What an answer does">
        <Choices id="f-answer.rule" legend="A right answer" name="rule" value={bp.answer.rule} options={ANSWER_RULES.map((r) => ({ value: r, ...ANSWER_INFO[r] }))} onChange={(v) => change((b) => ({ ...b, answer: { ...b.answer, rule: v, outcomes: v === 'chance' && b.answer.outcomes.length < 2 ? [{ label: 'Small', weight: 6, amount: 1 }, { label: 'Big', weight: 2, amount: 3 }] : b.answer.outcomes } }))} />
        <div className="flex flex-wrap gap-4">
          {bp.answer.rule !== 'chance' ? <NumberField id="f-answer.right" label={`A right answer gains (${bp.unit})`} value={bp.answer.right} min={1} max={10} error={problemAt(problems, 'answer.right')} onChange={(n) => change((b) => ({ ...b, answer: { ...b.answer, right: n } }))} /> : null}
          <NumberField id="f-answer.wrong" label={bp.kind.type === 'survive' ? `A wrong answer also costs (${bp.unit})` : `A wrong answer costs (${bp.unit})`} value={bp.answer.wrong} min={0} max={5} error={problemAt(problems, 'answer.wrong')} onChange={(n) => change((b) => ({ ...b, answer: { ...b.answer, wrong: n } }))} />
          {bp.answer.rule === 'points' ? (
            <>
              <NumberField id="f-answer.speed" label="Most extra for a quick answer" value={bp.answer.speed} min={0} max={5} error={problemAt(problems, 'answer.speed')} onChange={(n) => change((b) => ({ ...b, answer: { ...b.answer, speed: n } }))} />
              <NumberField id="f-answer.streak" label="Most extra for a streak" value={bp.answer.streak} min={0} max={5} error={problemAt(problems, 'answer.streak')} onChange={(n) => change((b) => ({ ...b, answer: { ...b.answer, streak: n } }))} />
            </>
          ) : null}
        </div>
        {bp.answer.rule === 'chance' ? (
          <fieldset id="f-answer.outcomes" tabIndex={-1} className="flex flex-col gap-2">
            <legend className="mb-1 text-sm font-semibold">Surprises (2 to 4). Players see each one’s chance.</legend>
            {bp.answer.outcomes.map((o, i) => (
              <div key={i} className="flex flex-wrap items-end gap-2 rounded-[var(--radius-m)] border border-line bg-surface-2 p-2">
                <Field label={`Surprise ${i + 1} name`}>
                  {(p) => <Input {...p} value={o.label} maxLength={20} className="w-[10rem]" onChange={(e) => change((b) => ({ ...b, answer: { ...b.answer, outcomes: b.answer.outcomes.map((x, j) => (j === i ? { ...x, label: e.target.value } : x)) } }))} />}
                </Field>
                <NumberField label="Weight" hint={`${odds[i]}% chance`} value={o.weight} min={1} max={10} onChange={(n) => change((b) => ({ ...b, answer: { ...b.answer, outcomes: b.answer.outcomes.map((x, j) => (j === i ? { ...x, weight: n } : x)) } }))} />
                <NumberField label={`Gives (${bp.unit})`} value={o.amount} min={0} max={10} onChange={(n) => change((b) => ({ ...b, answer: { ...b.answer, outcomes: b.answer.outcomes.map((x, j) => (j === i ? { ...x, amount: n } : x)) } }))} />
                <Button size="md" variant="ghost" aria-label={`Remove surprise ${i + 1}`} icon={<Trash2 className="size-4" aria-hidden />} onClick={() => change((b) => ({ ...b, answer: { ...b.answer, outcomes: b.answer.outcomes.filter((_, j) => j !== i) } }))} />
              </div>
            ))}
            {bp.answer.outcomes.length < 4 ? (
              <Button className="self-start" size="sm" variant="secondary" icon={<Plus className="size-4" aria-hidden />} onClick={() => change((b) => ({ ...b, answer: { ...b.answer, outcomes: [...b.answer.outcomes, { label: `Prize ${b.answer.outcomes.length + 1}`, weight: 3, amount: 2 }] } }))}>
                Add a surprise
              </Button>
            ) : null}
            {problemAt(problems, 'answer.outcomes') ? <p className="text-xs font-semibold text-ember">{problemAt(problems, 'answer.outcomes')}</p> : null}
          </fieldset>
        ) : null}
      </Section>

      <Section id="b-extras" title="Extras" hint="Power-ups are earned by right answers and used when the player chooses.">
        <Checks
          id="f-extras.powers"
          legend="Power-ups"
          values={POWER_UPS}
          chosen={bp.extras.powers}
          label={(p) => (
            <>
              <span className="font-semibold">{POWER_INFO[p].label}</span>
              {POWER_INFO[p].others ? (
                <span className="ml-1.5 inline-flex items-center gap-1 text-xs font-semibold">
                  <Users className="size-3.5" aria-hidden /> acts on others
                </span>
              ) : null}
              <span className="block text-xs text-text-2">{POWER_INFO[p].help}</span>
            </>
          )}
          note={(p) => (cooperative && POWER_INFO[p].others ? 'Not in a game everyone plays together.' : null)}
          onToggle={(p, on) => change((b) => ({ ...b, extras: { ...b.extras, powers: toggle(b.extras.powers, p, on) } }))}
        />
        {problemAt(problems, 'extras.powers') ? <p className="text-xs font-semibold text-ember">{problemAt(problems, 'extras.powers')}</p> : null}
        {bp.extras.powers.length ? <NumberField id="f-extras.powerEvery" label="Right answers for each power-up" value={bp.extras.powerEvery} min={2} max={8} onChange={(n) => change((b) => ({ ...b, extras: { ...b.extras, powerEvery: n } }))} /> : null}
        <Checks
          id="f-extras.events"
          legend="Events for everyone"
          values={BLUEPRINT_EVENTS}
          chosen={bp.extras.events}
          label={(e) => (
            <>
              <span className="font-semibold">{EVENT_INFO[e].label}</span>
              <span className="block text-xs text-text-2">{EVENT_INFO[e].help}</span>
            </>
          )}
          onToggle={(e, on) => change((b) => ({ ...b, extras: { ...b.extras, events: toggle(b.extras.events, e, on) } }))}
        />
      </Section>

      <RulesSection bp={bp} change={change} problems={problems} />

      <Section id="b-end" title="How it ends and who wins">
        <Choices
          id="f-end.type"
          legend="Winning"
          name="ending"
          value={bp.end.type}
          error={problemAt(problems, 'end.type')}
          options={(['first', 'most', 'last', 'together'] as const).map((e) => ({ value: e, label: ENDING_INFO[e].label, help: ENDING_INFO[e].help, disabled: info.endings.includes(e) ? false : `Not for a ${info.noun}.` }))}
          onChange={(v) => change((b) => ({ ...b, end: { ...b.end, type: v }, extras: v === 'together' ? { ...b.extras, powers: b.extras.powers.filter((p) => !POWER_INFO[p].others) } : b.extras }))}
        />
        <Field label="Longest the game lasts" error={problemAt(problems, 'end.timeLimitSec')} id="f-end.timeLimitSec">
          {(p) => (
            <Select {...p} value={String(bp.end.timeLimitSec)} onChange={(e) => change((b) => ({ ...b, end: { ...b.end, timeLimitSec: Number(e.target.value) } }))} className="max-w-[12rem]">
              {[60, 120, 180, 240, 300, 420, 600, 900].map((s) => (
                <option key={s} value={s}>
                  {s / 60} {s === 60 ? 'minute' : 'minutes'}
                </option>
              ))}
            </Select>
          )}
        </Field>
      </Section>

      <Section id="b-look" title="How it looks">
        <Choices
          id="f-look.dimension"
          legend="Picture"
          name="dimension"
          value={bp.look.dimension}
          error={problemAt(problems, 'look.dimension')}
          options={[
            { value: '2d', label: '2D board', help: 'A clear board on every screen.' },
            { value: '3d', label: '3D scene', help: 'A 3D place above the board. Falls back to the board where 3D is off.', disabled: KINDS_3D.includes(bp.kind.type) ? false : 'Ready for races and climbs.' },
          ]}
          onChange={(v) => change((b) => ({ ...b, look: { ...b.look, dimension: v } }))}
        />
        <Field label="Board style" id="f-look.style">
          {(p) => (
            <Select {...p} value={bp.look.style} onChange={(e) => change((b) => ({ ...b, look: { ...b.look, style: e.target.value as Blueprint['look']['style'] } }))} className="max-w-[12rem]">
              {BOARD_STYLES.map((s) => (
                <option key={s} value={s}>
                  {STYLE_INFO[s]}
                </option>
              ))}
            </Select>
          )}
        </Field>
        <div className="grid grid-cols-1 gap-3 min-[480px]:grid-cols-2">
          <HueField id="f-look.hue" label="Main colour" value={bp.look.hue} onChange={(n) => change((b) => ({ ...b, look: { ...b.look, hue: n } }))} />
          <HueField id="f-look.accent" label="Second colour" value={bp.look.accent} onChange={(n) => change((b) => ({ ...b, look: { ...b.look, accent: n } }))} />
        </div>
        {bp.look.dimension === '3d' ? (
          <div className="grid grid-cols-1 gap-3 min-[480px]:grid-cols-2">
            {(
              [
                ['place', 'Place', SCENE_PLACES, (v: string) => PLACE_INFO[v as keyof typeof PLACE_INFO].label],
                ['shape', 'Track shape', SCENE_SHAPES, (v: string) => SHAPE_INFO[v as keyof typeof SHAPE_INFO]],
                ['camera', 'Camera', SCENE_CAMERAS, (v: string) => CAMERA_INFO[v as keyof typeof CAMERA_INFO]],
                ['time', 'Time of day', SCENE_TIMES, (v: string) => TIME_INFO[v as keyof typeof TIME_INFO]],
              ] as const
            ).map(([key, label, values, words]) => (
              <Field key={key} label={label} id={`f-look.scene.${key}`}>
                {(p) => (
                  <Select {...p} value={bp.look.scene[key]} onChange={(e) => change((b) => ({ ...b, look: { ...b.look, scene: { ...b.look.scene, [key]: e.target.value } } }))}>
                    {values.map((v) => (
                      <option key={v} value={v}>
                        {words(v)}
                      </option>
                    ))}
                  </Select>
                )}
              </Field>
            ))}
            <div className="min-[480px]:col-span-2">
              <Checks
                id="f-look.scene.props"
                legend="Props (up to 4)"
                values={SCENE_PROPS}
                chosen={bp.look.scene.props}
                label={(v) => PROP_INFO[v]}
                note={(v) => (bp.look.scene.props.length >= 4 && !bp.look.scene.props.includes(v) ? 'Four already chosen.' : null)}
                onToggle={(v, on) => change((b) => ({ ...b, look: { ...b.look, scene: { ...b.look.scene, props: toggle(b.look.scene.props, v, on).slice(0, 4) } } }))}
              />
            </div>
          </div>
        ) : null}
        <div className="grid grid-cols-1 gap-3 min-[480px]:grid-cols-2">
          <Field label="Cover picture" id="f-cover.glyph">
            {(p) => (
              <Select {...p} value={bp.cover.glyph} onChange={(e) => change((b) => ({ ...b, cover: { ...b.cover, glyph: e.target.value as Blueprint['cover']['glyph'] } }))}>
                {GAME_GLYPHS.map((g) => (
                  <option key={g} value={g}>
                    {g.charAt(0).toUpperCase() + g.slice(1)}
                  </option>
                ))}
              </Select>
            )}
          </Field>
          <HueField id="f-cover.hue" label="Cover colour" value={bp.cover.hue} onChange={(n) => change((b) => ({ ...b, cover: { ...b.cover, hue: n } }))} />
        </div>
      </Section>
    </div>
  );
}

/* ------------------------------------------------------------------------------------------------ */
/* Numbers and rules: the same list the code's "each player has" and "when ..." lines make.         */
/* ------------------------------------------------------------------------------------------------ */

const TRIGGER_LABEL: Record<GameRule['when']['type'], string> = {
  start: 'The game starts',
  right: 'A player answers right',
  wrong: 'A player answers wrong',
  quick: 'A player answers right quickly',
  streak: 'A player gets N right in a row',
  'miss-streak': 'A player gets N wrong in a row',
  every: 'Every N questions a player answers',
  reach: 'A player reaches N',
  'runs-out': 'A player runs out of a number',
  halfway: 'A player gets halfway',
  lead: 'A player takes the lead',
  power: 'A player uses a power-up',
  'round-start': 'A round starts',
  'round-end': 'A round ends',
  'minutes-left': 'N minutes are left',
};
const CONDITION_LABEL: Record<GameRule['if'][number]['type'], string> = {
  'at-least': 'A number is at least N',
  'at-most': 'A number is at most N',
  first: 'They are in first place',
  last: 'They are in last place',
  team: 'They are on team N',
  chance: 'A chance of N%',
  'minutes-left': 'In the last N minutes',
};
const ACTION_LABEL: Record<GameRule['do'][number]['type'], string> = {
  gain: 'Gain N (score)',
  lose: 'Lose N (score)',
  add: 'Add N to a number',
  take: 'Take N from a number',
  set: 'Set a number to N',
  'everyone-gain': 'Everyone gains N',
  'behind-gain': 'Everyone behind gains N',
  'ahead-lose': 'Everyone ahead loses N',
  'leader-lose': 'The leader loses N',
  power: 'Get a power-up',
  shield: 'Get a shield',
  'freeze-leader': 'Freeze the leader',
  golden: 'Golden round',
  rally: 'Rally',
  double: 'Double points from now on',
  life: 'Gain a life',
  'lose-life': 'Lose a life',
  'swap-leader': 'Swap with the leader',
  win: 'Win the game',
  end: 'End the game',
  say: 'Say a message',
};

interface Part {
  type: string;
  n: number;
  var: string;
  power: string;
  message: string;
}
const blankPart = (type: string, n: number): Part => ({ type, n, var: '', power: 'shield', message: RULE_MESSAGES[0] });

/** One part of a rule being built: its kind, and the number, number name, power-up or message it needs. */
function PartPicker({ legend, part, setPart, options, labels, nRange, needsVar, vars, idBase, allowScore, extra }: { legend: string; part: Part; setPart: (p: Part) => void; options: readonly string[]; labels: Record<string, string>; nRange: [number, number] | null; needsVar: 'none' | 'optional' | 'required'; vars: GameVar[]; idBase: string; allowScore: boolean; extra?: ReactNode }) {
  return (
    <fieldset className="flex flex-wrap items-end gap-2">
      <legend className="mb-1 text-sm font-semibold">{legend}</legend>
      <label className="flex flex-col gap-1 text-xs font-semibold">
        <span className="sr-only">{legend}</span>
        <Select id={`${idBase}-type`} value={part.type} onChange={(e) => setPart({ ...part, type: e.target.value })} className="w-[15rem] max-w-full">
          {options.map((o) => (
            <option key={o} value={o}>
              {labels[o]}
            </option>
          ))}
        </Select>
      </label>
      {nRange ? (
        <label className="flex flex-col gap-1 text-xs font-semibold">
          N ({nRange[0]} to {nRange[1]})
          <Input type="number" inputMode="numeric" min={nRange[0]} max={nRange[1]} value={Number.isFinite(part.n) ? part.n : ''} onChange={(e) => setPart({ ...part, n: e.target.value === '' ? Number.NaN : Number(e.target.value) })} className="w-[6rem]" />
        </label>
      ) : null}
      {needsVar !== 'none' ? (
        <label className="flex flex-col gap-1 text-xs font-semibold">
          Number
          <Select value={part.var} onChange={(e) => setPart({ ...part, var: e.target.value })} className="w-[9rem]">
            {allowScore && needsVar === 'optional' ? <option value="">score</option> : null}
            {needsVar === 'required' && !part.var ? <option value="">Choose…</option> : null}
            {vars.map((v) => (
              <option key={v.name} value={v.name}>
                {v.name}
              </option>
            ))}
          </Select>
        </label>
      ) : null}
      {extra}
    </fieldset>
  );
}

function buildRule(when: Part, cond: Part | null, act: Part): GameRule {
  const w: GameRule['when'] = { type: when.type as GameRule['when']['type'] };
  if (TRIGGER_N[w.type]) w.n = when.n;
  if (TRIGGER_VAR[w.type] !== 'none' && when.var) w.var = when.var;
  const ifs: GameRule['if'] = [];
  if (cond) {
    const c: GameRule['if'][number] = { type: cond.type as GameRule['if'][number]['type'] };
    if (CONDITION_N[c.type]) c.n = cond.n;
    if (CONDITION_VAR[c.type] !== 'none' && cond.var) c.var = cond.var;
    ifs.push(c);
  }
  const d: GameRule['do'][number] = { type: act.type as GameRule['do'][number]['type'] };
  if (ACTION_N[d.type]) d.n = act.n;
  if (ACTION_VAR[d.type]) d.var = act.var;
  if (d.type === 'power') d.power = act.power as GameRule['do'][number]['power'];
  if (d.type === 'say') d.message = act.message as GameRule['do'][number]['message'];
  return { when: w, if: ifs, do: [d] };
}

function RulesSection({ bp, change, problems }: { bp: Blueprint; change: Change; problems: BlueprintProblem[] }) {
  const vars = bp.vars ?? [];
  const rules = bp.rules ?? [];
  const [newVar, setNewVar] = useState<GameVar>({ name: 'coins', scope: 'player', start: 0, max: VAR_MAX });
  const [when, setWhen] = useState<Part>(blankPart('right', 3));
  const [useCond, setUseCond] = useState(false);
  const [cond, setCond] = useState<Part>(blankPart('last', 5));
  const [act, setAct] = useState<Part>(blankPart('gain', 1));
  const cooperative = bp.kind.type === 'build' || bp.end.type === 'together';
  const triggers = RULE_TRIGGERS.filter((t) => bp.pacing === 'rounds' || !ROUNDS_TRIGGERS.includes(t));
  const actions = RULE_ACTIONS.filter((a) => !(cooperative && HARMFUL_ACTIONS.includes(a)) && ((a !== 'life' && a !== 'lose-life') || bp.kind.type === 'survive'));
  const draft = buildRule(when, useCond ? cond : null, act);
  const setVars = (next: GameVar[]) => change((b) => ({ ...b, vars: next }));
  const nameTaken = vars.some((v) => v.name === newVar.name.trim().toLowerCase());
  return (
    <Section id="b-rules" title="Numbers and rules" hint="Give the game numbers of its own (coins, health, keys) and rules: when something happens, if something is true, do something. The code shows each one as a line.">
      <div id="f-vars" tabIndex={-1} className="flex flex-col gap-2">
        <h3 className="font-semibold">Numbers the game keeps ({vars.length} of {MAX_VARS})</h3>
        {vars.length ? (
          <ul className="flex flex-col gap-1.5">
            {vars.map((v, i) => (
              <li key={v.name + i} className="flex flex-wrap items-center gap-2 rounded-[var(--radius-m)] border border-line bg-surface-2 px-3 py-2 text-sm">
                <span className="min-w-0 flex-1">{describeVar(v)}</span>
                <Button size="sm" variant="ghost" aria-label={`Remove the number ${v.name}`} icon={<Trash2 className="size-4" aria-hidden />} onClick={() => setVars(vars.filter((_, j) => j !== i))} />
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-text-2">None yet.</p>
        )}
        {problemAt(problems, 'vars') ? <p className="text-xs font-semibold text-ember">{problemAt(problems, 'vars')}</p> : null}
        {vars.length < MAX_VARS ? (
          <div className="flex flex-wrap items-end gap-2">
            <label className="flex flex-col gap-1 text-xs font-semibold">
              Name (one word)
              <Input value={newVar.name} maxLength={16} onChange={(e) => setNewVar({ ...newVar, name: e.target.value })} className="w-[9rem]" />
            </label>
            <label className="flex flex-col gap-1 text-xs font-semibold">
              Kept for
              <Select value={newVar.scope} onChange={(e) => setNewVar({ ...newVar, scope: e.target.value as GameVar['scope'] })} className="w-[10rem]">
                <option value="player">Each player</option>
                <option value="team">Each team</option>
                <option value="game">The whole game</option>
              </Select>
            </label>
            <label className="flex flex-col gap-1 text-xs font-semibold">
              Starts at
              <Input type="number" min={0} max={VAR_MAX} value={newVar.start} onChange={(e) => setNewVar({ ...newVar, start: Number(e.target.value) })} className="w-[6rem]" />
            </label>
            <Button size="sm" variant="secondary" icon={<Plus className="size-4" aria-hidden />} disabled={!newVar.name.trim() || nameTaken} onClick={() => setVars([...vars, { ...newVar, name: newVar.name.trim().toLowerCase() }])}>
              Add the number
            </Button>
          </div>
        ) : null}
      </div>
      <div id="f-rules" tabIndex={-1} className="flex flex-col gap-2 border-t border-line pt-3">
        <h3 className="font-semibold">Rules ({rules.length} of {MAX_RULES})</h3>
        {rules.length ? (
          <ol className="flex flex-col gap-1.5">
            {rules.map((r, i) => {
              const err = problemAt(problems, `rules.${i}`);
              return (
                <li key={i} className={`flex flex-wrap items-start gap-2 rounded-[var(--radius-m)] border bg-surface-2 px-3 py-2 text-sm ${err ? 'border-ember' : 'border-line'}`}>
                  <span className="min-w-0 flex-1">
                    <span className="block">{describeRule(r, bp)}</span>
                    <span className="block font-sans text-xs [overflow-wrap:anywhere]">
                      <CodeLine line={ruleCode(r, bp)} />
                    </span>
                    {err ? <span className="block text-xs font-semibold text-ember">{err}</span> : null}
                  </span>
                  <Button size="sm" variant="ghost" aria-label={`Remove rule ${i + 1}`} icon={<Trash2 className="size-4" aria-hidden />} onClick={() => change((b) => ({ ...b, rules: (b.rules ?? []).filter((_, j) => j !== i) }))} />
                </li>
              );
            })}
          </ol>
        ) : (
          <p className="text-sm text-text-2">None yet. Build one below, or write a line starting with “when” in the code.</p>
        )}
        {rules.length < MAX_RULES ? (
          <div className="flex flex-col gap-3 rounded-[var(--radius-m)] border border-dashed border-line-strong p-3">
            <PartPicker legend="When" idBase="rule-when" part={when} setPart={setWhen} options={triggers} labels={TRIGGER_LABEL} nRange={TRIGGER_N[when.type as GameRule['when']['type']]} needsVar={TRIGGER_VAR[when.type as GameRule['when']['type']]} vars={vars.filter((v) => v.scope === 'player')} allowScore />
            <Switch checked={useCond} onCheckedChange={setUseCond} label="Only if…" description="Add a condition that must be true." />
            {useCond ? <PartPicker legend="If" idBase="rule-if" part={cond} setPart={setCond} options={RULE_CONDITIONS} labels={CONDITION_LABEL} nRange={CONDITION_N[cond.type as GameRule['if'][number]['type']]} needsVar={CONDITION_VAR[cond.type as GameRule['if'][number]['type']]} vars={vars} allowScore /> : null}
            <PartPicker
              legend="Do"
              idBase="rule-do"
              part={act}
              setPart={setAct}
              options={actions}
              labels={ACTION_LABEL}
              nRange={ACTION_N[act.type as GameRule['do'][number]['type']]}
              needsVar={ACTION_VAR[act.type as GameRule['do'][number]['type']] ? 'required' : 'none'}
              vars={vars}
              allowScore={false}
              extra={
                act.type === 'power' ? (
                  <label className="flex flex-col gap-1 text-xs font-semibold">
                    Power-up
                    <Select value={act.power} onChange={(e) => setAct({ ...act, power: e.target.value })} className="w-[9rem]">
                      {POWER_UPS.filter((p) => !(cooperative && POWER_INFO[p].others)).map((p) => (
                        <option key={p} value={p}>
                          {POWER_INFO[p].label}
                        </option>
                      ))}
                    </Select>
                  </label>
                ) : act.type === 'say' ? (
                  <label className="flex flex-col gap-1 text-xs font-semibold">
                    Message
                    <Select value={act.message} onChange={(e) => setAct({ ...act, message: e.target.value })} className="w-[11rem]">
                      {RULE_MESSAGES.map((m) => (
                        <option key={m} value={m}>
                          {m}
                        </option>
                      ))}
                    </Select>
                  </label>
                ) : null
              }
            />
            <p className="text-sm">
              <span className="font-semibold">The rule: </span>
              {describeRule(draft, bp)}
              {ROOM_TRIGGERS.includes(draft.when.type) ? ' (for each player)' : ''}
            </p>
            <Button className="self-start" size="sm" variant="secondary" icon={<Plus className="size-4" aria-hidden />} onClick={() => change((b) => ({ ...b, rules: [...(b.rules ?? []), draft] }))}>
              Add the rule
            </Button>
          </div>
        ) : null}
      </div>
    </Section>
  );
}
