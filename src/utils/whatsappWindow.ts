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

export function computeMessagingWindow(messages: WindowMessage[] = []): MessagingWindow {
  const incoming = messages.filter((m) => !m.fromMe);
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
    lastCustomerMessageAt: lastAt.toISOString(),
    windowExpiresAt: new Date(expiresMs).toISOString(),
  };
}
