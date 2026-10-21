import { Compass } from 'lucide-react';
import { EmptyState } from '../../ui/primitives.tsx';
import { ButtonLink } from '../../ui/Button.tsx';

export default function NotFound() {
  return (
    <EmptyState icon={<Compass className="size-8" />} title="Nothing here" action={<ButtonLink to="/" variant="primary">Go home</ButtonLink>}>
      The link may be old, or the page has moved.
    </EmptyState>
  );
}
