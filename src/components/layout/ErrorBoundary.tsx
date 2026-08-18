import { Component, type ErrorInfo, type ReactNode } from "react";

/**
 * Catches render errors so a single broken component does not leave the
 * tournament director staring at a white window.
 *
 * v2.8.1 was a hotfix for exactly that ("TournamentView white screen on
 * open"). Without a boundary the next one looks the same: nothing on
 * screen, nothing to report, and no way back except restarting the app
 * (REVIEW-BACKLOG.md D6).
 *
 * The data is safe when this happens — everything is already in SQLite —
 * so reloading is genuinely enough, which is what the message says.
 */
interface Props {
  children: ReactNode;
  /** Shown above the error text; defaults to a generic message. */
  title?: string;
  /** Text for the reload button. */
  reloadLabel?: string;
  /** Text for the details toggle. */
  detailsLabel?: string;
  /** Reassurance that nothing was lost. */
  hint?: string;
}

interface State {
  error: Error | null;
  info: ErrorInfo | null;
}

export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null, info: null };

  static getDerivedStateFromError(error: Error): Partial<State> {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    this.setState({ info });
    // Goes to the console today; once file logging lands (J5) this is the
    // single place that has to change.
    console.error("ErrorBoundary caught a render error:", error, info.componentStack);
  }

  private handleReload = () => {
    window.location.reload();
  };

  render() {
    const { error, info } = this.state;
    if (!error) return this.props.children;

    const details = [
      error.message,
      error.stack ?? "",
      info?.componentStack ?? "",
    ]
      .filter(Boolean)
      .join("\n\n");

    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 p-6">
        <div className="max-w-2xl w-full bg-white border border-rose-200 rounded-2xl shadow-sm p-6">
          <h1 className="text-lg font-bold text-rose-700">
            {this.props.title ?? "Da ist etwas schiefgelaufen"}
          </h1>
          <p className="mt-2 text-sm text-gray-600">
            {this.props.hint ??
              "Deine Daten sind gespeichert. Lade die Ansicht neu, um weiterzuarbeiten."}
          </p>

          <div className="mt-4 flex gap-2">
            <button
              onClick={this.handleReload}
              className="bg-rose-600 text-white px-4 py-2 rounded-xl text-sm font-medium hover:bg-rose-700 transition-colors"
            >
              {this.props.reloadLabel ?? "Neu laden"}
            </button>
            <button
              onClick={() => navigator.clipboard?.writeText(details)}
              className="border border-gray-200 text-gray-600 px-4 py-2 rounded-xl text-sm font-medium hover:border-gray-300 transition-colors"
            >
              {this.props.detailsLabel ?? "Details kopieren"}
            </button>
          </div>

          <details className="mt-4">
            <summary className="text-xs uppercase tracking-wide text-gray-400 cursor-pointer">
              Technische Details
            </summary>
            <pre className="mt-2 text-xs text-gray-600 bg-gray-50 rounded-xl p-3 overflow-auto max-h-64 whitespace-pre-wrap">
              {details}
            </pre>
          </details>
        </div>
      </div>
    );
  }
}

export default ErrorBoundary;
