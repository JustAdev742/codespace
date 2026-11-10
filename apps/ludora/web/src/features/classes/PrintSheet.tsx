import { useEffect, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import './print.css';

/**
 * What goes on paper. Rendered into <body> only while printing (the browser's print
 * dialog opens straight away), so the screen keeps its own layout and only this
 * sheet is printed. Closing the print dialog removes it again.
 */
export function PrintSheet({ onDone, children, label }: { onDone: () => void; children: ReactNode; label: string }) {
  const done = useRef(onDone);
  done.current = onDone;
  useEffect(() => {
    document.body.classList.add('has-print-sheet');
    const after = () => done.current();
    window.addEventListener('afterprint', after);
    // A frame for the sheet (and any Glim art) to lay out before the dialog opens.
    const t = window.setTimeout(() => window.print(), 80);
    return () => {
      window.clearTimeout(t);
      window.removeEventListener('afterprint', after);
      document.body.classList.remove('has-print-sheet');
    };
  }, []);
  return createPortal(
    <div className="print-sheet" aria-hidden="true" data-label={label}>
      {children}
    </div>,
    document.body,
  );
}

/** Whether a sheet is being printed, and how to start and finish. */
export function usePrinting() {
  const [printing, setPrinting] = useState(false);
  return {
    printing,
    print: () => setPrinting(true),
    done: () => setPrinting(false),
  };
}
