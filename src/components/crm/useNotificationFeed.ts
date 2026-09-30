import { useCallback, useEffect, useRef, useState } from 'react';
import { api } from '../../services/api';

export type FeedItem = {
  id: string;
  type: string;
  title: string;
  body: string;
  url: string;
  refId?: number | null;
  createdAt: string;
  read: boolean;
};

const POLL_MS = 30_000;

/**
 * Lembretes e avisos do usuário (sino). Consulta o servidor a cada 30 s — a própria consulta dispara os lembretes
 * vencidos. `onNew` recebe os itens não lidos que chegaram depois da primeira carga (para o aviso do navegador).
 */
export function useNotificationFeed(onNew?: (items: FeedItem[]) => void) {
  const [items, setItems] = useState<FeedItem[]>([]);
  const [unread, setUnread] = useState(0);
  const seen = useRef<Set<string> | null>(null);
  const onNewRef = useRef(onNew);
  onNewRef.current = onNew;

  const refresh = useCallback(async () => {
    try {
      const data = await api.get<{ items: FeedItem[]; unread: number }>('/notifications/feed');
      setItems(data.items);
      setUnread(data.unread);
      if (seen.current === null) {
        seen.current = new Set(data.items.map((i) => i.id)); // primeira carga: não avisa o que já existia
      } else {
        const fresh = data.items.filter((i) => !i.read && !seen.current!.has(i.id));
        data.items.forEach((i) => seen.current!.add(i.id));
        if (fresh.length) onNewRef.current?.(fresh);
      }
    } catch {
      /* sem rede ou servidor fora: tenta de novo no próximo ciclo */
    }
  }, []);

  useEffect(() => {
    void refresh();
    const id = window.setInterval(() => void refresh(), POLL_MS);
    return () => window.clearInterval(id);
  }, [refresh]);

  const markRead = useCallback(async (id: string) => {
    setItems((prev) => prev.map((i) => (i.id === id ? { ...i, read: true } : i)));
    setUnread((n) => Math.max(0, n - 1));
    try {
      await api.post(`/notifications/feed/${id}/read`);
    } catch {
      void refresh();
    }
  }, [refresh]);

  const markAllRead = useCallback(async () => {
    setItems((prev) => prev.map((i) => ({ ...i, read: true })));
    setUnread(0);
    try {
      await api.post('/notifications/feed/read-all');
    } catch {
      void refresh();
    }
  }, [refresh]);

  return { items, unread, refresh, markRead, markAllRead };
}
