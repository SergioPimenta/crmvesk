import { useCallback, useEffect, useState } from 'react';
import { api } from '../../services/api';

export type GoogleStatus = {
  /** O servidor tem GOOGLE_CLIENT_ID/SECRET. */
  configured: boolean;
  connected: boolean;
  email: string;
  importEvents: boolean;
  lastSyncedAt: string | null;
};

export type GoogleSyncResult = { throttled: boolean; created: number; updated: number; cancelled: number };

const EMPTY: GoogleStatus = { configured: false, connected: false, email: '', importEvents: false, lastSyncedAt: null };

/** Estado da conexão do usuário com o Google Agenda e as ações de conectar, sincronizar e desconectar. */
export function useGoogleCalendar(enabled = true) {
  const [status, setStatus] = useState<GoogleStatus>(EMPTY);
  const [loaded, setLoaded] = useState(false);

  const reload = useCallback(async () => {
    try {
      setStatus(await api.get<GoogleStatus>('/google/status'));
    } catch {
      setStatus(EMPTY);
    } finally {
      setLoaded(true);
    }
  }, []);

  useEffect(() => {
    if (enabled) void reload();
  }, [enabled, reload]);

  /** Leva o usuário à tela de consentimento do Google; ele volta para a Agenda com `?google=`. */
  const connect = useCallback(async () => {
    const { url } = await api.get<{ url: string }>('/google/connect-url');
    window.location.href = url;
  }, []);

  const disconnect = useCallback(async () => {
    await api.post('/google/disconnect');
    await reload();
  }, [reload]);

  const sync = useCallback(async () => {
    const result = await api.post<GoogleSyncResult>('/google/sync');
    await reload();
    return result;
  }, [reload]);

  const setImportEvents = useCallback(
    async (importEvents: boolean) => {
      await api.put('/google/settings', { importEvents });
      await reload();
    },
    [reload]
  );

  return { status, loaded, reload, connect, disconnect, sync, setImportEvents };
}
