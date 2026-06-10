export const CUSTOMER_CARE_WINDOW_MS = 24 * 60 * 60 * 1000;

function toIso(date) {
  if (!date) return null;
  const d = new Date(date);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

/**
 * Janela de atendimento Meta: 24 h a partir da última mensagem do cliente.
 * Cada nova mensagem recebida do cliente reinicia a contagem (ex.: resposta aos 23 h → +24 h).
 */
export function computeMessagingWindow(messages = []) {
  let lastMs = null;

  for (const m of messages || []) {
    if (m.fromMe) continue;
    const t = new Date(m.messageAt).getTime();
    if (Number.isNaN(t)) continue;
    if (lastMs === null || t > lastMs) lastMs = t;
  }

  if (lastMs === null) {
    return {
      withinWindow: false,
      lastCustomerMessageAt: null,
      windowExpiresAt: null,
    };
  }

  const expiresMs = lastMs + CUSTOMER_CARE_WINDOW_MS;
  return {
    withinWindow: Date.now() < expiresMs,
    lastCustomerMessageAt: toIso(new Date(lastMs)),
    windowExpiresAt: toIso(new Date(expiresMs)),
  };
}
