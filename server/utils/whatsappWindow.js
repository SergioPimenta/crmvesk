export const CUSTOMER_CARE_WINDOW_MS = 24 * 60 * 60 * 1000;

function toIso(date) {
  if (!date) return null;
  const d = new Date(date);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

/** Janela de atendimento Meta: 24 h após a última mensagem recebida do cliente. */
export function computeMessagingWindow(messages = []) {
  const incoming = (messages || []).filter((m) => !m.fromMe);
  if (incoming.length === 0) {
    return {
      withinWindow: false,
      lastCustomerMessageAt: null,
      windowExpiresAt: null,
    };
  }

  const last = incoming[incoming.length - 1];
  const lastAt = new Date(last.messageAt);
  const lastMs = lastAt.getTime();
  if (Number.isNaN(lastMs)) {
    return {
      withinWindow: false,
      lastCustomerMessageAt: null,
      windowExpiresAt: null,
    };
  }

  const expiresMs = lastMs + CUSTOMER_CARE_WINDOW_MS;
  return {
    withinWindow: Date.now() < expiresMs,
    lastCustomerMessageAt: toIso(lastAt),
    windowExpiresAt: toIso(new Date(expiresMs)),
  };
}
