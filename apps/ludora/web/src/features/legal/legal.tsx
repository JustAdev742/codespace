import type { ReactNode } from 'react';
import { useQuery } from '@tanstack/react-query';
import { api } from '../../lib/api.ts';
import { PageHeader, Panel } from '../../ui/primitives.tsx';

/*
 * Shared layout for the privacy policy and terms of use. The text describes
 * what this software actually does (checked against the server's code); the
 * organisation running a copy names itself with OPERATOR_NAME and
 * OPERATOR_CONTACT and should have the text reviewed for the law that applies
 * to it (docs/DEPLOYMENT.md).
 */

export const UPDATED = '29 October 2026';

export interface Operator {
  operatorName: string | null;
  operatorContact: string | null;
}

export function useOperator() {
  return useQuery({ queryKey: ['legal'], queryFn: () => api.get<Operator>('/api/legal'), staleTime: Infinity });
}

/** Who runs this copy, or a plain note that they have not said yet. */
export function OperatorNote({ what }: { what: string }) {
  const op = useOperator().data;
  if (!op) return null;
  if (!op.operatorName) {
    return (
      <p className="rounded-[var(--radius-m)] border border-lantern/60 bg-lantern/[0.06] p-4 text-sm text-text-2">
        Whoever runs this copy of Ludora has not added their name and contact details yet, and should have this {what} checked for the law that applies to them before students use it.
      </p>
    );
  }
  return (
    <p className="text-text-2">
      This copy of Ludora is run by <strong className="text-text">{op.operatorName}</strong>
      {op.operatorContact ? (
        <>
          . Contact them at <ContactLink contact={op.operatorContact} />.
        </>
      ) : (
        '.'
      )}
    </p>
  );
}

export function ContactLink({ contact }: { contact: string }) {
  const href = /^[^\s@]+@[^\s@]+$/.test(contact) ? `mailto:${contact}` : /^https?:\/\//.test(contact) ? contact : null;
  return href ? (
    <a href={href} className="font-semibold underline underline-offset-2">
      {contact}
    </a>
  ) : (
    <span className="font-semibold text-text">{contact}</span>
  );
}

export function LegalPage({ title, intro, children }: { title: string; intro: string; children: ReactNode }) {
  return (
    <>
      <PageHeader title={title} description={`Last updated ${UPDATED}.`} />
      <Panel className="p-5 sm:p-8">
        <article className="legal flex max-w-[68ch] flex-col gap-4 text-[1.0625rem] leading-relaxed">
          <p className="text-lg text-text">{intro}</p>
          {children}
        </article>
      </Panel>
    </>
  );
}

export function H2({ children }: { children: ReactNode }) {
  return <h2 className="mt-6 font-display text-2xl leading-tight font-bold text-text">{children}</h2>;
}

export function P({ children }: { children: ReactNode }) {
  return <p className="text-text-2">{children}</p>;
}

export function List({ children }: { children: ReactNode }) {
  return <ul className="flex list-disc flex-col gap-1.5 pl-5 text-text-2 marker:text-text-3">{children}</ul>;
}
