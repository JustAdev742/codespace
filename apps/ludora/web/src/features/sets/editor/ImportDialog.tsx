import { useDeferredValue, useId, useMemo, useRef, useState } from 'react';
import { Download, FileUp } from 'lucide-react';
import { QUESTION_TYPE_LABELS, type Question, type QuestionType } from '@ludora/shared';
import { Button } from '../../../ui/Button.tsx';
import { Dialog, TabPanel, Tabs, Textarea } from '../../../ui/primitives.tsx';
import { plural } from '../../../lib/format.ts';
import { downloadText } from './download.ts';
import { csvTemplate } from './exporters.ts';
import { CSV_COLUMN_HELP, CSV_COLUMNS, JSON_EXAMPLE, PASTE_EXAMPLE, PASTE_RULES } from './formats.ts';
import { detectFormat, parseImport, type ImportedDetails, type ImportFormat, type ImportProblem } from './importers.ts';
import { LIMITS } from './model.ts';
import { ERROR_TEXT, ErrorText } from './parts.tsx';

const MAX_FILE_BYTES = 2 * 1024 * 1024;
const SHOWN_PROBLEMS = 40;

const FORMAT_TABS: { value: ImportFormat; label: string }[] = [
  { value: 'text', label: 'Typed text' },
  { value: 'csv', label: 'Spreadsheet (CSV)' },
  { value: 'json', label: 'Ludora file (JSON)' },
];

export interface ImportChoice {
  questions: Question[];
  mode: 'add' | 'replace';
  details: ImportedDetails | null;
}

/** Why a file cannot be read as text, for the formats people most often pick by mistake. */
function unsupportedFile(name: string): string | null {
  const n = name.toLowerCase();
  if (/\.(xlsx|xls|xlsm|ods|numbers)$/.test(n)) return 'Ludora reads spreadsheets saved as CSV. In your spreadsheet app, save or download the sheet as CSV (CSV UTF-8 in Excel), then choose that file.';
  if (/\.(docx?|odt|pages|rtf|pdf)$/.test(n)) return 'Ludora cannot read documents. Copy the questions out of the document and paste them below instead.';
  return null;
}

function problemText(p: ImportProblem): string {
  return `${p.where}${p.field ? `, ${p.field}` : ''}: ${p.message}`;
}

function typeBreakdown(questions: Question[]): string {
  const counts = new Map<QuestionType, number>();
  for (const q of questions) counts.set(q.type, (counts.get(q.type) ?? 0) + 1);
  return [...counts].map(([t, n]) => `${QUESTION_TYPE_LABELS[t]}: ${n}`).join(', ');
}

export function ImportDialog({ open, onOpenChange, currentCount, allBlank, hasTitle, onImport }: { open: boolean; onOpenChange: (v: boolean) => void; currentCount: number; allBlank: boolean; hasTitle: boolean; onImport: (choice: ImportChoice) => void }) {
  const [format, setFormat] = useState<ImportFormat>('text');
  const [text, setText] = useState('');
  const [fileName, setFileName] = useState<string | null>(null);
  const [fileError, setFileError] = useState<string | null>(null);
  const [mode, setMode] = useState<'add' | 'replace'>('add');
  const [useDetails, setUseDetails] = useState(false);
  // On a phone the typing rules start folded, so the text box is near the top instead of a long scroll down.
  const [rulesOpen] = useState(() => window.matchMedia?.('(min-width: 640px)').matches ?? true);
  const fileInput = useRef<HTMLInputElement>(null);
  const textId = useId();
  const deferredText = useDeferredValue(text);
  const result = useMemo(() => (deferredText.trim() ? parseImport(deferredText, format) : null), [deferredText, format]);

  // Each time the dialog opens, start from adding (keeping what is there) and
  // from taking the file's set details only when the set has no title yet.
  const [wasOpen, setWasOpen] = useState(false);
  if (open !== wasOpen) {
    setWasOpen(open);
    if (open) {
      setMode('add');
      setUseDetails(!hasTitle);
    }
  }

  const readFile = async (file: File) => {
    setFileError(null);
    const unsupported = unsupportedFile(file.name);
    if (unsupported) {
      setFileError(unsupported);
      return;
    }
    if (file.size > MAX_FILE_BYTES) {
      setFileError('That file is larger than 2 MB. Split it into smaller files and import them one at a time.');
      return;
    }
    try {
      const content = await file.text();
      setText(content);
      setFileName(file.name);
      setFormat(detectFormat(content, file.name));
    } catch {
      setFileError('That file could not be read. Check it opens on your device, then try again.');
    }
  };

  const ready = result?.questions.length ?? 0;
  // Questions nobody has typed into are simply filled, so there is no choice to make.
  const askMode = currentCount > 0 && !allBlank;
  const replacing = !askMode || mode === 'replace';
  const total = replacing ? ready : currentCount + ready;
  const tooMany = total > LIMITS.questions;
  const problems = result?.problems ?? [];

  const confirm = () => {
    if (!result || !ready || tooMany) return;
    onImport({ questions: result.questions, mode: replacing ? 'replace' : 'add', details: useDetails ? result.details : null });
    setText('');
    setFileName(null);
    setFileError(null);
  };

  const status = !result
    ? 'Paste text or choose a file, and a preview appears here.'
    : `${ready ? `${plural(ready, 'question')} ready to import` : 'No questions ready to import'}${problems.length ? `. ${plural(problems.length, 'problem')} to look at` : ''}.`;

  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      size="lg"
      title="Import questions"
      description="Bring in questions from typed text, a spreadsheet or a Ludora file. Check the preview, then add them."
      footer={
        <>
          <Button onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button variant="primary" disabled={!ready || tooMany} onClick={confirm}>
            {ready ? (askMode && replacing ? `Replace with ${plural(ready, 'question')}` : `Add ${plural(ready, 'question')}`) : 'Import'}
          </Button>
        </>
      }
    >
      <Tabs value={format} onValueChange={(v) => setFormat(v as ImportFormat)} label="Format" items={FORMAT_TABS}>
        <TabPanel value="text" className="flex flex-col gap-2 text-sm text-text-2">
          <details open={rulesOpen} className="rounded-[12px] border border-line">
            <summary className="cursor-pointer rounded-[12px] px-3 py-2 font-semibold text-text hover:bg-surface-2">How to type questions</summary>
            <ul className="flex list-disc flex-col gap-1 border-t border-line py-2 pr-3 pl-8">
              {PASTE_RULES.map((rule) => (
                <li key={rule}>{rule}</li>
              ))}
            </ul>
          </details>
          <details className="rounded-[12px] border border-line">
            <summary className="cursor-pointer rounded-[12px] px-3 py-2 font-semibold text-text hover:bg-surface-2">Example</summary>
            <pre className="max-h-56 overflow-auto border-t border-line px-3 py-2 font-mono text-xs leading-relaxed whitespace-pre-wrap text-text">{PASTE_EXAMPLE}</pre>
            <div className="border-t border-line px-3 py-2">
              <Button size="sm" variant="ghost" onClick={() => setText(PASTE_EXAMPLE)}>
                Use this example
              </Button>
            </div>
          </details>
        </TabPanel>
        <TabPanel value="csv" className="flex flex-col gap-2 text-sm text-text-2">
          <p>The first row names the columns. Only prompt is needed; leave type empty and Ludora works it out. Separate several choices, items, answers or tags with |. Save from any spreadsheet app as CSV. Images are not included in CSV files.</p>
          <div>
            <Button size="sm" icon={<Download className="size-4" />} onClick={() => downloadText('ludora-questions-template.csv', csvTemplate(), 'text/csv')}>
              Download the template
            </Button>
          </div>
          <details className="rounded-[12px] border border-line">
            <summary className="cursor-pointer rounded-[12px] px-3 py-2 font-semibold text-text hover:bg-surface-2">What each column means</summary>
            <dl className="flex flex-col gap-2 border-t border-line px-3 py-2">
              {CSV_COLUMNS.map((c) => (
                <div key={c}>
                  <dt className="font-mono text-xs font-semibold text-text">{c}</dt>
                  <dd className="text-xs">{CSV_COLUMN_HELP[c]}</dd>
                </div>
              ))}
            </dl>
          </details>
        </TabPanel>
        <TabPanel value="json" className="flex flex-col gap-2 text-sm text-text-2">
          <p>A file exported from Ludora, or a list of questions in the same shape. Ludora files keep everything, including images.</p>
          <details className="rounded-[12px] border border-line">
            <summary className="cursor-pointer rounded-[12px] px-3 py-2 font-semibold text-text hover:bg-surface-2">Example</summary>
            <pre className="max-h-56 overflow-auto border-t border-line px-3 py-2 font-mono text-xs leading-relaxed whitespace-pre-wrap text-text">{JSON_EXAMPLE}</pre>
          </details>
        </TabPanel>
      </Tabs>

      <div className="mt-4 flex flex-col gap-2">
        <div className="flex flex-wrap items-center gap-2">
          <input
            ref={fileInput}
            type="file"
            accept=".csv,.tsv,.json,.txt,text/csv,text/plain,application/json"
            className="sr-only"
            tabIndex={-1}
            aria-hidden
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) void readFile(file);
              e.target.value = '';
            }}
          />
          <Button size="sm" icon={<FileUp className="size-4" />} onClick={() => fileInput.current?.click()}>
            Choose a file
          </Button>
          <span className="min-w-0 text-sm text-text-3 [overflow-wrap:anywhere]">{fileName ? `Loaded ${fileName}` : 'CSV, JSON or a text file, up to 2 MB. Or paste below.'}</span>
        </div>
        {fileError ? <ErrorText id={`${textId}-file-error`}>{fileError}</ErrorText> : null}
        <label htmlFor={textId} className="text-sm font-semibold text-text">
          Text to import
        </label>
        <Textarea
          id={textId}
          value={text}
          rows={8}
          spellCheck={false}
          onChange={(e) => {
            setText(e.target.value);
            if (!e.target.value) setFileName(null);
          }}
          onPaste={(e) => {
            // Pasting into an empty box picks the format that fits what was pasted.
            if (!text.trim()) setFormat(detectFormat(e.clipboardData.getData('text')));
          }}
          className="h-auto min-h-[160px] font-mono text-sm"
        />
      </div>

      <section aria-label="Preview" className="mt-4 flex flex-col gap-3 rounded-[14px] border border-line bg-sunken/40 p-3">
        <p role="status" className="font-semibold text-text">
          {status}
        </p>
        {ready ? <p className="-mt-2 text-sm text-text-2">{typeBreakdown(result!.questions)}</p> : null}
        {result?.notes.map((note) => (
          <p key={note} className="text-sm text-text-2">
            {note}
          </p>
        ))}
        {problems.length ? (
          <div className="flex flex-col gap-1.5">
            <h3 className={`text-sm font-semibold ${ERROR_TEXT}`}>These were not imported</h3>
            <ul className="flex max-h-48 flex-col gap-1 overflow-y-auto text-sm text-text-2">
              {problems.slice(0, SHOWN_PROBLEMS).map((p, i) => (
                <li key={i} className="[overflow-wrap:anywhere]">
                  {problemText(p)}
                </li>
              ))}
              {problems.length > SHOWN_PROBLEMS ? <li>And {plural(problems.length - SHOWN_PROBLEMS, 'more problem')}.</li> : null}
            </ul>
          </div>
        ) : null}
        {ready && result?.details && format === 'json' ? (
          <label className="flex items-start gap-2.5 text-sm text-text">
            <input type="checkbox" checked={useDetails} onChange={(e) => setUseDetails(e.target.checked)} className="mt-0.5 size-4 shrink-0 accent-[var(--lantern)]" />
            <span>
              Also use this file's set details{result.details.title ? ` (“${result.details.title}”)` : ''}: title, description, subject and cover
            </span>
          </label>
        ) : null}
        {ready && askMode ? (
          <fieldset className="flex flex-col gap-1.5">
            <legend className="mb-1 text-sm font-semibold text-text">What to do with them</legend>
            <label className="flex items-center gap-2.5 text-sm text-text">
              <input type="radio" name="import-mode" checked={mode === 'add'} onChange={() => setMode('add')} className="size-4 accent-[var(--lantern)]" />
              Add them after the {plural(currentCount, 'current question')}
            </label>
            <label className="flex items-center gap-2.5 text-sm text-text">
              <input type="radio" name="import-mode" checked={mode === 'replace'} onChange={() => setMode('replace')} className="size-4 accent-[var(--lantern)]" />
              Replace the current questions
            </label>
          </fieldset>
        ) : null}
        {tooMany ? (
          <ErrorText id={`${textId}-too-many`}>
            That would make {total} questions, and a set can hold up to {LIMITS.questions}. {replacing ? 'Import fewer at a time.' : 'Replace the current questions instead, or import fewer.'}
          </ErrorText>
        ) : null}
      </section>
    </Dialog>
  );
}
