import { Component, type ErrorInfo, type ReactNode } from 'react';
import { ErrorNotice } from './primitives.tsx';

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
    return (
      <div className={this.props.className}>
        <ErrorNotice title={`${this.props.name ? `${this.props.name[0]!.toUpperCase()}${this.props.name.slice(1)}` : 'This part'} did not load`} message="Something went wrong here. The rest of the page still works. Try again, or reload the page if it keeps happening." onRetry={() => this.setState({ error: null })} />
      </div>
    );
  }
}
