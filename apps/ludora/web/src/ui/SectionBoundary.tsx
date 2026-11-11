import { Component, type ErrorInfo, type ReactNode } from 'react';
import { RotateCcw, Wrench } from 'lucide-react';
import { EmptyArt } from '../art/EmptyArt.tsx';
import { Button } from './Button.tsx';

/*
 * One part of a page that breaks shows "This part did not load" with Try again, and the rest of
 * the page (the menu, the game's header with Leave, the other settings) keeps working. The error
 * is reported the same way as a whole-page error, so staff see it in System health.
 */

interface Props {
  children: ReactNode;
  /** What this part is, for the message: "the game screen", "these settings". */
  name?: string;
  /** Change it (a route, a room stage) to clear an error and try again by itself. */
  resetKey?: unknown;
  className?: string;
}

export class SectionBoundary extends Component<Props, { error: Error | null; key: unknown }> {
  override state: { error: Error | null; key: unknown } = { error: null, key: this.props.resetKey };

  static getDerivedStateFromError(error: Error) {
    return { error };
  }

  static getDerivedStateFromProps(props: Props, state: { error: Error | null; key: unknown }) {
    return props.resetKey !== state.key ? { error: null, key: props.resetKey } : null;
  }

  override componentDidCatch(error: Error, info: ErrorInfo) {
    void fetch('/api/client-errors', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-ludora-csrf': '1' },
      body: JSON.stringify({ message: String(error?.message ?? error).slice(0, 500), stack: `${String(error?.stack ?? '')}\n${info.componentStack ?? ''}`.slice(0, 3000), url: location.pathname }),
    }).catch(() => {});
  }

  override render() {
    if (!this.state.error) return this.props.children;
    const what = this.props.name ? `${this.props.name[0]!.toUpperCase()}${this.props.name.slice(1)}` : 'This part';
    // The same care as a page that is not found: a Glim, plain words, and a way out.
    return (
      <div className={this.props.className}>
        <div role="alert" className="flex flex-col items-center gap-3 rounded-[var(--radius-l)] border border-line bg-raised px-4 py-6 text-center">
          <EmptyArt icon={<Wrench />} seed={what} />
          <p className="font-display text-2xl leading-tight font-bold text-text">{what} did not load</p>
          <p className="max-w-[48ch] text-sm text-text-2">Something went wrong here, and it has been reported. The rest of the page still works. Try again; if it keeps happening, reload the page.</p>
          <div className="flex flex-wrap justify-center gap-2">
            <Button variant="primary" icon={<RotateCcw className="size-4" aria-hidden />} onClick={() => this.setState({ error: null })}>
              Try again
            </Button>
            <Button onClick={() => location.reload()}>Reload the page</Button>
          </div>
        </div>
      </div>
    );
  }
}
