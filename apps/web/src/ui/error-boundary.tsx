import { Component, type ErrorInfo, type ReactNode } from 'react';

type Props = { children: ReactNode };
type State = { message: string | null };

/** Keeps the shell visible when a route throws instead of a blank #root. */
export class AppErrorBoundary extends Component<Props, State> {
  state: State = { message: null };

  static getDerivedStateFromError(error: unknown): State {
    const message = error instanceof Error ? error.message : String(error);
    return { message: message || 'Unknown render error' };
  }

  componentDidCatch(error: unknown, info: ErrorInfo): void {
    console.error('Climbing Coach UI crashed', error, info.componentStack);
  }

  render(): ReactNode {
    if (this.state.message) {
      return (
        <section className="panel" role="alert">
          <h1>Something broke in the UI</h1>
          <p>{this.state.message}</p>
          <p className="muted">Check the browser console. Try a hard refresh after `pnpm build`.</p>
        </section>
      );
    }
    return this.props.children;
  }
}
