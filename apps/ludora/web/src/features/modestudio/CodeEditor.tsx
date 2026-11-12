import { forwardRef, useCallback, useEffect, useId, useImperativeHandle, useMemo, useRef, useState, type KeyboardEvent } from 'react';
import { ArrowRight, BookOpen, ClipboardCopy, ClipboardPaste, Wand2 } from 'lucide-react';
import { completeLine, highlightLine, type CodeProblem, type CodeToken } from '@ludora/shared';
import { Button } from '../../ui/Button.tsx';

/*
 * The game code editor: a plain textarea (so typing, selecting, a screen reader and a phone's
 * keyboard all work as they always do) over a coloured copy of the same text with line numbers.
 * Both layers use the same font, size, spacing and wrapping, and colour is the only difference,
 * so the caret always sits on the letters you see. Under it: ideas for the next word, and every
 * problem with its line and a fix you can press.
 */

const TOKEN_CLASS: Record<CodeToken['kind'], string> = {
  key: 'text-sky',
  string: 'text-glim',
  number: 'text-lantern',
  comment: 'text-text-3 italic',
  word: 'text-text',
  plain: 'text-text-2',
};

export interface CodeEditorHandle {
  /** Put a line of code after the line the caret is on (or at the end), and select it. */
  insertLine: (line: string) => void;
  /** Move the caret to the start of a line (1-based) and focus the editor. */
  goToLine: (line: number) => void;
  focus: () => void;
}

interface Props {
  code: string;
  onChange: (code: string) => void;
  problems: CodeProblem[];
  readOnly?: boolean;
  onHelp: () => void;
  onCopy: () => void;
  onPaste: () => void;
}

/** Character offset where a 1-based line starts. */
function lineStart(code: string, line: number): number {
  let at = 0;
  for (let i = 1; i < line; i++) {
    const nl = code.indexOf('\n', at);
    if (nl < 0) return code.length;
    at = nl + 1;
  }
  return at;
}

export const CodeEditor = forwardRef<CodeEditorHandle, Props>(function CodeEditor({ code, onChange, problems, readOnly, onHelp, onCopy, onPaste }, ref) {
  const area = useRef<HTMLTextAreaElement>(null);
  const scroller = useRef<HTMLDivElement>(null);
  const ideas = useRef<HTMLDivElement>(null);
  const [caret, setCaret] = useState(0);
  const [focused, setFocused] = useState(false);
  const hintId = useId();
  const problemsId = useId();
  const lines = useMemo(() => code.split('\n'), [code]);
  const badLines = useMemo(() => new Set(problems.map((p) => p.line).filter((l): l is number => l !== null)), [problems]);

  const caretLine = useMemo(() => code.slice(0, caret).split('\n').length, [code, caret]);
  const before = useMemo(() => {
    const start = code.lastIndexOf('\n', caret - 1) + 1;
    return code.slice(start, caret);
  }, [code, caret]);
  const lineAfterCaret = useMemo(() => {
    const end = code.indexOf('\n', caret);
    return code.slice(caret, end < 0 ? code.length : end);
  }, [code, caret]);
  // Ideas only while the caret is at the end of what is typed on its line.
  const completions = useMemo(() => (readOnly || lineAfterCaret.trim() || !before.trim() ? [] : completeLine(before, code)), [before, code, lineAfterCaret, readOnly]);

  const setSelection = useCallback((start: number, end = start) => {
    requestAnimationFrame(() => {
      const el = area.current;
      if (!el) return;
      el.focus();
      el.setSelectionRange(start, end);
      setCaret(end);
      // Keep the caret's line in view inside the editor's own scroll.
      const lineNo = code.slice(0, end).split('\n').length;
      const row = scroller.current?.querySelector<HTMLElement>(`[data-line="${lineNo}"]`);
      row?.scrollIntoView({ block: 'nearest' });
    });
  }, [code]);

  useImperativeHandle(
    ref,
    () => ({
      insertLine(line: string) {
        const end = code.indexOf('\n', caret);
        const at = end < 0 ? code.length : end;
        const needsNl = at > 0 && code[at - 1] !== '\n' ? '\n' : at === 0 ? '' : '\n';
        const prefix = code.slice(0, at);
        const next = `${prefix}${prefix.trim() ? needsNl : ''}${line}${code.slice(at)}`;
        const startOfLine = (prefix.trim() ? prefix.length + needsNl.length : 0);
        onChange(next);
        setSelection(startOfLine, startOfLine + line.length);
      },
      goToLine(line: number) {
        setSelection(lineStart(code, line));
      },
      focus() {
        area.current?.focus();
      },
    }),
    [caret, code, onChange, setSelection],
  );

  const accept = (insert: string) => {
    const next = code.slice(0, caret) + insert + code.slice(caret);
    onChange(next);
    setSelection(caret + insert.length);
  };

  const onKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    // Ctrl+Space (or Alt+Down) jumps to the ideas for the next word; Escape in the ideas comes back.
    if (completions.length && ((e.ctrlKey && e.key === ' ') || (e.altKey && e.key === 'ArrowDown'))) {
      e.preventDefault();
      ideas.current?.querySelector<HTMLButtonElement>('button')?.focus();
    }
  };
  const onIdeasKey = (e: KeyboardEvent<HTMLDivElement>) => {
    const buttons = [...(ideas.current?.querySelectorAll<HTMLButtonElement>('button') ?? [])];
    const i = buttons.indexOf(document.activeElement as HTMLButtonElement);
    if (e.key === 'Escape') {
      e.preventDefault();
      area.current?.focus();
    } else if (e.key === 'ArrowRight' || e.key === 'ArrowDown') {
      e.preventDefault();
      buttons[(i + 1) % buttons.length]?.focus();
    } else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') {
      e.preventDefault();
      buttons[(i - 1 + buttons.length) % buttons.length]?.focus();
    }
  };

  useEffect(() => {
    if (caret > code.length) setCaret(code.length);
  }, [caret, code.length]);

  const track = () => setCaret(area.current?.selectionStart ?? 0);

  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap items-center gap-2">
        <Button size="sm" variant="secondary" icon={<BookOpen className="size-4" aria-hidden />} onClick={onHelp}>
          What you can write
        </Button>
        <Button size="sm" variant="ghost" icon={<ClipboardCopy className="size-4" aria-hidden />} onClick={onCopy}>
          Copy the code
        </Button>
        {!readOnly ? (
          <Button size="sm" variant="ghost" icon={<ClipboardPaste className="size-4" aria-hidden />} onClick={onPaste}>
            Paste code
          </Button>
        ) : null}
      </div>
      <div ref={scroller} className="max-h-[min(30rem,55vh)] overflow-y-auto rounded-[var(--radius-l)] border border-line-strong bg-sunken focus-within:ring-2 focus-within:ring-[var(--focus)]">
        <div className="relative font-sans text-[1rem] leading-7">
          <div aria-hidden className="pointer-events-none py-3 pr-3 pl-11 [overflow-wrap:anywhere] whitespace-pre-wrap">
            {lines.map((line, i) => (
              <div key={i} data-line={i + 1} className={`relative min-h-7 ${badLines.has(i + 1) ? 'underline decoration-ember decoration-wavy decoration-2 underline-offset-4' : ''} ${focused && caretLine === i + 1 ? 'bg-surface-2' : ''}`}>
                <span className={`absolute top-0 -left-10 w-8 text-right text-sm leading-7 tabular select-none ${badLines.has(i + 1) ? 'font-bold text-ember' : 'text-text-3'}`}>{i + 1}</span>
                {line ? highlightLine(line).map((t, j) => (
                  <span key={j} className={TOKEN_CLASS[t.kind]}>
                    {t.text}
                  </span>
                )) : '​'}
              </div>
            ))}
          </div>
          <textarea
            ref={area}
            value={code}
            readOnly={readOnly}
            aria-label="Game code"
            aria-describedby={`${hintId} ${problems.length ? problemsId : ''}`.trim()}
            aria-invalid={problems.length > 0}
            spellCheck={false}
            autoCapitalize="off"
            autoCorrect="off"
            autoComplete="off"
            wrap="soft"
            onChange={(e) => {
              onChange(e.target.value);
              setCaret(e.target.selectionStart);
            }}
            onSelect={track}
            onKeyUp={track}
            onClick={track}
            onFocus={() => (setFocused(true), track())}
            onBlur={() => setFocused(false)}
            onKeyDown={onKeyDown}
            className="absolute inset-0 m-0 block h-full w-full resize-none overflow-hidden border-0 bg-transparent py-3 pr-3 pl-11 font-sans text-[1rem] leading-7 text-transparent caret-[var(--text)] [overflow-wrap:anywhere] whitespace-pre-wrap outline-none selection:bg-[var(--sky)]/35"
          />
        </div>
      </div>
      <p id={hintId} className="text-xs text-text-2">
        One rule a line. Words after # are notes for you. {completions.length ? 'Press Ctrl+Space to pick the next word.' : ''}
      </p>
      {completions.length ? (
        <div ref={ideas} role="group" aria-label="Ideas for the next word" onKeyDown={onIdeasKey} className="flex flex-wrap items-center gap-1.5">
          <span className="flex items-center gap-1 text-xs font-semibold text-text-2">
            <Wand2 className="size-3.5" aria-hidden /> Next:
          </span>
          {completions.map((c) => (
            <button
              key={c.insert}
              type="button"
              title={c.label}
              aria-label={`${c.insert.trim()}, for ${c.label}`}
              onClick={() => accept(c.insert)}
              className="min-h-9 rounded-[var(--radius-s)] border border-line bg-surface-2 px-2.5 text-sm font-semibold hover:border-line-strong max-sm:min-h-11"
            >
              {c.insert.trim()}
            </button>
          ))}
        </div>
      ) : null}
      {problems.length ? (
        <div id={problemsId} role="region" aria-label="Problems in the code" className="flex flex-col gap-1.5 rounded-[var(--radius-m)] border border-ember/60 bg-ember/10 p-3">
          <p className="text-sm font-bold">{problems.length === 1 ? '1 thing to fix. The test keeps playing your last working game.' : `${problems.length} things to fix. The test keeps playing your last working game.`}</p>
          <ul className="flex flex-col gap-1.5">
            {problems.slice(0, 8).map((p, i) => (
              <li key={`${p.line}-${i}`} className="flex flex-wrap items-center gap-2 text-sm">
                <span className="min-w-[14rem] flex-1">{p.message}</span>
                {p.line ? (
                  <Button size="sm" variant="ghost" icon={<ArrowRight className="size-4" aria-hidden />} onClick={() => setSelection(lineStart(code, p.line!))}>
                    Go to line {p.line}
                  </Button>
                ) : null}
                {p.fix && p.line && !readOnly ? (
                  <Button
                    size="sm"
                    variant="secondary"
                    onClick={() => {
                      const start = lineStart(code, p.line!);
                      const end = code.indexOf('\n', start);
                      const next = code.slice(0, start) + p.fix!.text + (end < 0 ? '' : code.slice(end));
                      onChange(next);
                      setSelection(start + p.fix!.text.length);
                    }}
                  >
                    {p.fix.label}
                  </Button>
                ) : null}
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  );
});
