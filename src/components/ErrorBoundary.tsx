import { Component, type ErrorInfo, type ReactNode } from 'react';
import { reportClientError } from '../utils/reportError';

type State = { failed: boolean };

/** Evita a tela branca quando um componente quebra: mostra uma mensagem e registra o erro no servidor. */
class ErrorBoundary extends Component<{ children: ReactNode }, State> {
  state: State = { failed: false };

  static getDerivedStateFromError(): State {
    return { failed: true };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    reportClientError(error, info.componentStack?.split('\n')[1]?.trim());
  }

  render() {
    if (!this.state.failed) return this.props.children;
    return (
      <div
        role="alert"
        style={{
          minHeight: '100vh',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 12,
          padding: 24,
          textAlign: 'center',
          background: 'var(--vesk-bg, #0e0e0f)',
          color: 'var(--vesk-text, #f2f1ee)',
          fontFamily: 'inherit',
        }}
      >
        <h1 style={{ fontSize: 20, margin: 0 }}>Algo deu errado</h1>
        <p style={{ margin: 0, maxWidth: 420, opacity: 0.75 }}>
          O erro foi registrado. Recarregue a página para continuar; se o problema voltar, avise o administrador.
        </p>
        <button
          type="button"
          onClick={() => window.location.reload()}
          style={{
            padding: '10px 18px',
            borderRadius: 8,
            border: 'none',
            background: '#e85d24',
            color: '#fff',
            fontWeight: 600,
            cursor: 'pointer',
          }}
        >
          Recarregar
        </button>
      </div>
    );
  }
}

export default ErrorBoundary;
