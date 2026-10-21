import { forwardRef } from 'react';
import { CircleAlert } from 'lucide-react';
import { ERROR_BORDER, ERROR_TEXT } from './parts.tsx';

export interface SummaryItem {
  key: string;
  /** "Title" or "Question 3". */
  label: string;
  message: string;
  /** DOM id of the field to focus; none for problems that belong to no field. */
  target?: string;
  /** The question the field is in, so it can be opened first. */
  questionId?: string;
}

const SHOWN = 12;

/**
 * Every problem in one place, each a link to its field (the GOV.UK error
 * summary pattern). It takes focus when a save is stopped, so screen readers
 * announce it.
 */
export const ErrorSummary = forwardRef<HTMLDivElement, { items: SummaryItem[]; serverError: string | null; onGo: (item: SummaryItem) => void }>(function ErrorSummary({ items, serverError, onGo }, ref) {
  const count = items.length;
  const title = serverError ? 'The set was not saved' : count === 1 ? 'Fix 1 thing before saving' : `Fix ${count} things before saving`;
  return (
    <div ref={ref} tabIndex={-1} role="alert" aria-labelledby="error-summary-title" className={`rounded-[var(--radius-m)] border-2 bg-raised p-4 focus:outline-none focus-visible:ring-[3px] focus-visible:ring-[var(--focus)] ${ERROR_BORDER}`}>
      <h2 id="error-summary-title" className={`flex items-center gap-2 font-display text-lg font-bold ${ERROR_TEXT}`}>
        <CircleAlert className="size-5 shrink-0" aria-hidden />
        {title}
      </h2>
      {serverError ? <p className="mt-1 text-sm text-text">{serverError}</p> : null}
      {count ? (
        <ul className="mt-2 flex flex-col gap-1 text-sm">
          {items.slice(0, SHOWN).map((item) => (
            <li key={item.key} className="[overflow-wrap:anywhere]">
              {item.target ? (
                <a
                  href={`#${item.target}`}
                  onClick={(e) => {
                    e.preventDefault();
                    onGo(item);
                  }}
                  className="font-semibold text-link underline underline-offset-2"
                >
                  {item.label}: {item.message}
                </a>
              ) : (
                <span className="font-semibold text-text">
                  {item.label}: {item.message}
                </span>
              )}
            </li>
          ))}
          {count > SHOWN ? <li className="text-text-2">And {count - SHOWN} more, marked on the questions below.</li> : null}
        </ul>
      ) : null}
    </div>
  );
});
