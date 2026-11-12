# AI helpers (`ai`)

AI helpers inside the making tools, running on any OpenAI-compatible provider (Groq, OpenRouter,
Cerebras, Mistral and others) as well as Anthropic, with an allowance per account. People never
sign in to a third party: the server holds the keys and makes every call. With no provider
configured, every helper is absent and every AI route answers "AI helpers are not set up on this
server."

Migration **0019** (`server/drizzle/0019_ai.sql`): `ai_requests` (one row per request: who, task,
model, outcome, tokens; never what was asked), `ai_failures` (provider failures for staff),
`ai_settings` (one row: allowance, site cap, models switched off).

## Turning it on

1. Set `AI_PROVIDERS` on the server (table in `docs/DEPLOYMENT.md`), for example
   `[{"name":"Groq","baseUrl":"https://api.groq.com/openai/v1","apiKey":"…","models":[{"id":"llama-3.3-70b-versatile","label":"Llama 3.3 70B"}]}]`.
   `ANTHROPIC_API_KEY` still works and adds Anthropic as one more provider.
2. In Staff, Feature flags: `ai.helpers_teachers` (teacher accounts, creators, staff) and/or
   `ai.helpers_students` (student and player accounts). Both are off by default. The older
   `ai.question_drafts` still turns on question drafts alone, for teachers.
3. Staff, AI helpers: switch models on or off, set the allowance (default 20 requests in any 5
   hours per account) and the site cap per 24 hours (default `AI_DRAFTS_DAILY_LIMIT`, 500).

## What was built

| What a person sees or can do | Where in the code | How it was verified |
|---|---|---|
| Providers: any number of OpenAI-compatible services from one `AI_PROVIDERS` setting, plus Anthropic; a broken setting stops the server with a message that never repeats the key | `server/src/config.ts`, `server/src/modules/ai/providers.ts` | `server/test/config.test.ts` ("AI providers", 3 tests); `server/test/ai.test.ts` "the Anthropic provider" |
| Keys stay on the server: never in a response, the staff page or a log line | `providers.ts` (key only in the request header), `admin.ts` | `ai.test.ts`: status, run and staff responses checked for the key; the fake provider sees `Authorization: Bearer` |
| A model that is busy (429, honouring `retry-after`), too slow (`AI_TIMEOUT_SEC`) or down is skipped for the next model the person allows; a person who allows none is told how long to wait | `server/src/modules/ai/runner.ts` | `ai.test.ts` "moves to the next model when one is rate limited…", "gives up on a model that takes too long, and on one that is down…" |
| Answers that are not clean JSON (prose, code fences, `<think>` blocks) are read defensively; one repair attempt is made with the problem fed back; models without a JSON mode are asked in the prompt only (`"jsonMode": false`, or found out from a 400) | `providers.ts` `extractJson`, `runner.ts` | `ai.test.ts` "finds the JSON…", "asks again once when the JSON needs repair…", backup provider sent no `response_format` |
| Nothing a model writes reaches an editor unchecked: each task's own schema, Ludora's question, lesson and mode rules, and the word filter; rule-breaking parts are dropped and counted, a filtered answer is refused plainly | `server/src/modules/ai/tasks/*.ts`, `tasks.ts` (`cleanLine`, `failsFilter`) | `ai.test.ts` "drops parts of an answer that break a rule, and refuses one the word filter stops" |
| No free chat: the browser sends only a registered task's fields; unknown fields (a "system" prompt, "instructions") are dropped | `server/src/modules/ai/tasks.ts`, `routes.ts` | `ai.test.ts` "sends only the task, keeps the key on the server…" |
| Email addresses and phone numbers are taken out of the text before it is sent, and the person is told how many | `server/src/modules/ai/privacy.ts`, `AiHelper.tsx` | `ai.test.ts` "takes out email addresses and phone numbers…" (unit) and the `set.describe` route test (a description holding an email address) |
| Who may use them: two flags (teachers; students and players), never guests; a student asking for a teacher-only helper is refused by the server; `ai.question_drafts` keeps working | `routes.ts` `aiAccess`, `server/src/db/seed.ts` | `ai.test.ts` "needs a provider, the right flag and the right kind of account", "keeps the older drafts flag working…" |
| Allowance: N requests in any rolling H hours per account (provider failures do not count), shown as what is left and when the next one arrives; a site cap per 24 hours; one request at a time per account; a limit per address | `server/src/modules/ai/allowance.ts`, `routes.ts` (`AI_PER_ADDRESS_10_MIN`) | `ai.test.ts` "runs out after N requests…, refills as they age…", "stops the whole site at its daily cap…", "the limit by address"; e2e "when the allowance is used up…" |
| Model picker: the models staff left on, by plain name, the choice remembered in the browser, "If it is busy, let another model answer", and which model answered | `web/src/features/ai/AiHelper.tsx` (`ModelPicker`), `aiData.ts` | `ai.test.ts` "keeps to the person's choice of model…"; e2e set editor test (picks a model, request carries it) |
| One reusable panel: a button and a panel with the suggestion beside what the person has, Accept, Try again and Discard; nothing is written until Accept; keyboard and screen-reader complete (disclosure button, labelled region, live status, focus back to the button, Escape closes) | `web/src/features/ai/AiHelper.tsx` | `e2e/ai-helpers.spec.ts` (Chromium, Firefox, WebKit; axe on each panel) |
| Set editor, per question: improve the wording, write wrong answers, write the explanation, make it easier or harder | `web/src/features/ai/AiQuestionTools.tsx` (one line in `QuestionCard.tsx`); tasks in `server/src/modules/ai/tasks/sets.ts` | `ai.test.ts` (wrong answers, difficulty, explanation); e2e "a teacher discards one suggestion and accepts another in the set editor" |
| Set editor: question drafts now run on the new layer and any provider (same dialog and addresses); the dialog names the provider, offers the model picker and says which model drafted | `server/src/modules/ai/routes.ts` (`/api/ai/drafts`), `web/src/features/sets/editor/AiDraftDialog.tsx` | `ai.test.ts` drafts route test; `e2e/ai-drafts.spec.ts` unchanged and passing in all three browsers |
| A set's page: suggest a title, description and tags (saved when accepted); make a version for another age group (saved as a new private set, this one untouched) | `web/src/features/ai/AiSetTools.tsx` (in `SetDetail.tsx`) | `ai.test.ts` `set.describe`; e2e "when the allowance is used up…" (phone width, axe) |
| Lessons: outline a lesson from a goal and the teacher's own sets (another teacher's set is refused); write an info slide; suggest discussion questions from a set | `web/src/features/ai/AiLessonTools.tsx` (in `LessonEditor.tsx`, `StepDialog.tsx`); `tasks/lessons.ts` | `ai.test.ts` "outlines a lesson from the teacher's own sets only"; e2e "a teacher outlines a lesson…" |
| Hosting: suggest a mode and settings for this set, this many players and this much time, with one sentence of why, checked against the real catalogue and the mode's own settings | `web/src/features/ai/AiModeHelper.tsx` (in `HostSetup.tsx`); `tasks/games.ts` | `ai.test.ts` "suggests a game mode only from the real catalogue…"; e2e "a host asks for a mode suggestion and uses it" |
| A generic "name and describe this" helper, used in the save-game dialog | `tasks/generic.ts`, `web/src/features/games/SaveGameDialog.tsx` | typecheck and build; task registered (`ai.test.ts` registry test). No dedicated test of the dialog. |
| Staff page (Staff, AI helpers): providers and models (never keys), switch each on or off, the allowance and site cap, the last 24 hours, failures by provider; reading needs `system.view` or `flags.manage`, changing needs `flags.manage`, a reason, and is audited | `server/src/modules/ai/admin.ts`, `web/src/features/admin/Ai.tsx` | `ai.test.ts` "the staff AI page" (wrong account refused, audit rows); e2e "staff see the models and switch one off with a reason" |
| The privacy page says, while helpers are on, that the text asked about goes to the named providers (taken from the configuration) | `GET /api/ai/about` in `routes.ts`, `web/src/features/legal/Privacy.tsx` | `ai.test.ts` "tells the privacy page which providers receive text…" |

## Adding a helper (worked example)

A task lives on the server. The browser sends only its fields; the task builds the prompt and
checks the answer. Put the module next to the others and import it from
`server/src/modules/ai/tasks/index.ts`:

```ts
// server/src/modules/ai/tasks/glims.ts
import { z } from 'zod';
import { cleanLine, registerAiTask, TaskReject } from '../tasks.ts';

registerAiTask({
  id: 'glim.backstory',                 // "area.job", unique
  title: 'Write a Glim backstory',      // shown to staff
  audience: ['teacher', 'student'],     // who may use it (with the matching flag)
  input: z.object({ name: z.string().trim().min(2).max(24), traits: z.array(z.string().max(30)).max(5).default([]) }),
  prompt: (i) => ({
    system: 'You write a two-sentence backstory for a friendly creature in a classroom game. Keep it kind and age-appropriate.',
    user: `Name: ${i.name}\nTraits: ${i.traits.join(', ') || 'none'}`, // email addresses and phone numbers are removed before sending
  }),
  output: z.object({ story: z.string().max(400) }), // the JSON the model must return
  example: '{"story":"..."}',                       // shown to models without a JSON mode
  validate: (w) => {
    const story = cleanLine(w.story);               // null when empty or caught by the word filter
    if (!story) throw new TaskReject('Write the story.'); // the model gets one repair attempt with this message
    return { output: { story } };
  },
});
```

Optional fields: `prepare(input, { deps, auth })` loads the person's own records on the server and
throws `TaskInputError` to refuse (see `tasks/lessons.ts`); `maxTokens`. Add the id to
`AI_TASK_IDS` in `packages/shared/src/ai.ts` if the web app refers to it by name.

In the web app, one line in the editor:

```tsx
<AiHelper<{ story: string }> task="glim.backstory" label="Write a backstory" input={() => ({ name, traits })} current={story || 'None yet'} renderSuggestion={(o) => o.story} onAccept={(o) => setStory(o.story)} />
```

It renders nothing unless the server says this person may use the task. Use `fields` for choices
made before asking (then the panel waits for Suggest) and `ready` to say what is missing.

## Not done

- Studio and a game-mode studio helpers: the registry and panel are ready for them; none added.
- The "Draft with AI" button and the set's title/description/tags helper are not inside the set
  editor page itself: the brief limits edits in `web/src/features/sets/editor/` to the draft
  dialog and one line each in `EditorTools.tsx` and `QuestionCard.tsx`, and `Editor.tsx` holds the
  set's details. Set-wide helpers are on the set's own page instead. `EditorTools.tsx` is untouched.
- The "AI question drafts" section of `docs/DEPLOYMENT.md` outside its settings table still speaks
  of Anthropic only (only that table may be edited in this programme).
- No real provider was ever called: everything is tested against a fake OpenAI-compatible server
  and stubbed browser routes.
