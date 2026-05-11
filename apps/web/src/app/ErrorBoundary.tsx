import { Component, type ErrorInfo, type ReactNode } from 'react';

type Props = {
  children: ReactNode;
};

type State = {
  error: Error | null;
  errorCode: string | null;
};

function makeErrorCode(error: Error) {
  let hash = 0;
  const source = `${error.name}:${error.message}`;
  for (let index = 0; index < source.length; index += 1) {
    hash = (hash * 31 + source.charCodeAt(index)) >>> 0;
  }
  return `AD-${hash.toString(16).toUpperCase().padStart(8, '0').slice(0, 8)}`;
}

export class ErrorBoundary extends Component<Props, State> {
  state: State = {
    error: null,
    errorCode: null,
  };

  static getDerivedStateFromError(error: Error): State {
    return {
      error,
      errorCode: makeErrorCode(error),
    };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('[AudiDisc UI]', makeErrorCode(error), error.message, info.componentStack);
  }

  render() {
    if (!this.state.error) {
      return this.props.children;
    }

    return (
      <main className="grid min-h-screen place-items-center bg-gray-950 px-4 text-white">
        <section className="w-full max-w-lg rounded-panel border border-white/10 bg-white/[0.08] p-6 shadow-luxury">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-audi-red">
            Audi Disc
          </p>
          <h1 className="mt-3 text-3xl font-semibold">Algo fallo en la interfaz</h1>
          <p className="mt-3 text-sm leading-6 text-white/70">
            La app sigue protegida. Recarga la pagina y, si el error vuelve, reporta este codigo.
          </p>
          <div className="mt-5 rounded-2xl bg-white px-4 py-3 text-sm font-bold text-gray-950">
            Codigo: {this.state.errorCode}
          </div>
          <button
            className="mt-5 h-12 rounded-2xl bg-audi-red px-5 text-sm font-semibold text-white shadow-button transition hover:bg-audi-redDark"
            onClick={() => window.location.reload()}
          >
            Recargar
          </button>
        </section>
      </main>
    );
  }
}
