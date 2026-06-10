export const CUSTOMER_CARE_WINDOW_MS = 24 * 60 * 60 * 1000;

type WindowMessage = {
  fromMe: boolean;
  messageAt: string;
};

export type MessagingWindow = {
  withinWindow: boolean;
  lastCustomerMessageAt: string | null;
  windowExpiresAt: string | null;
};

/** Cada nova mensagem do cliente reinicia a janela de 24 h. */
export function computeMessagingWindow(messages: WindowMessage[] = []): MessagingWindow {
  let lastMs: number | null = null;

  for (const m of messages) {
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
    lastCustomerMessageAt: new Date(lastMs).toISOString(),
    windowExpiresAt: new Date(expiresMs).toISOString(),
  };
}
