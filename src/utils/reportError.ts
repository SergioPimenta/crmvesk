// Envia erros de JavaScript do navegador ao servidor (POST /api/client-errors), que os registra nos logs.
// Evita enxurrada: no máximo 10 por sessão e a mesma mensagem só a cada 30 s.
const envApi = import.meta.env.VITE_API_URL as string | undefined;
const BASE_URL = envApi && !envApi.includes('localhost') ? envApi.replace(/\/$/, '') : '/api';

const MAX_PER_SESSION = 10;
const DEDUPE_MS = 30_000;
let sent = 0;
const lastSeen = new Map<string, number>();

export function reportClientError(error: unknown, component?: string) {
  try {
    const err = error instanceof Error ? error : new Error(String(error));
    const now = Date.now();
    const key = err.message.slice(0, 200);
    if (sent >= MAX_PER_SESSION || now - (lastSeen.get(key) ?? 0) < DEDUPE_MS) return;
    lastSeen.set(key, now);
    sent += 1;

    void fetch(`${BASE_URL}/client-errors`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      keepalive: true,
      body: JSON.stringify({
        message: err.message,
        stack: err.stack,
        url: window.location.href,
        component,
      }),
    }).catch(() => {});
  } catch {
    /* nunca deixar o relatório de erros gerar outro erro */
  }
}

export function installGlobalErrorReporting() {
  window.addEventListener('error', (e) => reportClientError(e.error ?? e.message, 'window.onerror'));
  window.addEventListener('unhandledrejection', (e) => reportClientError(e.reason, 'unhandledrejection'));
}
