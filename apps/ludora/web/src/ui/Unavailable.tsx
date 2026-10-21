import { Hammer } from 'lucide-react';
import { EmptyState, PageHeader } from './primitives.tsx';
import { ButtonLink } from './Button.tsx';

/** A clearly labelled section that is not built yet. Never pretends to work. */
export function Unavailable({ title, description }: { title: string; description: string }) {
  return (
    <>
      <PageHeader title={title} />
      <EmptyState icon={<Hammer className="size-8" />} title="Still being built" action={<ButtonLink to="/" variant="secondary">Back to home</ButtonLink>}>
        {description}
      </EmptyState>
    </>
  );
}
