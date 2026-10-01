import { useEffect, useRef, useState } from 'react';
import { useCrmData } from '../../contexts/CrmDataContext';
import { useGoogleCalendar } from './useGoogleCalendar';

const RETURN_MESSAGES: Record<string, { ok: boolean; text: string }> = {
  connected: { ok: true, text: 'Google Agenda conectado.' },
  denied: { ok: false, text: 'Você não autorizou o acesso ao Google Agenda.' },
  error: { ok: false, text: 'Não foi possível conectar ao Google. Tente novamente.' },
};

const lastSyncLabel = (iso: string | null) => {
  if (!iso) return 'Ainda não sincronizado';
  const minutes = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 60000));
  if (minutes < 1) return 'Sincronizado agora há pouco';
  if (minutes < 60) return `Sincronizado há ${minutes} min`;
  const hours = Math.round(minutes / 60);
  return hours < 24 ? `Sincronizado há ${hours} h` : `Sincronizado há ${Math.round(hours / 24)} d`;
};

/** Botão "Google Agenda" da Agenda: conectar a conta, sincronizar agora, importar eventos e desconectar. */
const GoogleCalendarMenu = () => {
  const { refreshCrmData } = useCrmData();
  const google = useGoogleCalendar();
  const { status } = google;
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<{ ok: boolean; text: string } | null>(null);
  const wrapRef = useRef<HTMLDivElement>(null);

  // Retorno do consentimento do Google (?google=connected|denied|error): mostra o resultado e limpa a URL.
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const result = params.get('google');
    if (!result) return;
    setNotice(RETURN_MESSAGES[result] ?? null);
    params.delete('google');
    const qs = params.toString();
    window.history.replaceState(null, '', `${window.location.pathname}${qs ? `?${qs}` : ''}`);
    if (result === 'connected') void google.reload();
    // roda uma única vez ao abrir a página
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!notice) return;
    const t = window.setTimeout(() => setNotice(null), 6000);
    return () => window.clearTimeout(t);
  }, [notice]);

  useEffect(() => {
    if (!open) return;
    const onClickOutside = (ev: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(ev.target as Node)) setOpen(false);
    };
    const onEsc = (ev: KeyboardEvent) => {
      if (ev.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', onClickOutside);
    document.addEventListener('keydown', onEsc);
    return () => {
      document.removeEventListener('mousedown', onClickOutside);
      document.removeEventListener('keydown', onEsc);
    };
  }, [open]);

  const run = async (action: () => Promise<void>) => {
    setBusy(true);
    try {
      await action();
    } catch (err: unknown) {
      setNotice({ ok: false, text: err instanceof Error ? err.message : 'Não foi possível concluir a ação.' });
    } finally {
      setBusy(false);
    }
  };

  const syncNow = () =>
    run(async () => {
      const r = await google.sync();
      if (r.throttled) {
        setNotice({ ok: true, text: 'Já sincronizado há menos de 1 minuto.' });
        return;
      }
      await refreshCrmData();
      const changes = r.created + r.updated + r.cancelled;
      setNotice({ ok: true, text: changes ? `${changes} alteração(ões) trazida(s) do Google.` : 'Tudo em dia com o Google Agenda.' });
    });

  const disconnect = () => {
    if (!window.confirm('Desconectar o Google Agenda? Os eventos já criados continuam no Google e no CRM.')) return;
    return run(async () => {
      await google.disconnect();
      setOpen(false);
    });
  };

  if (!status.configured && google.loaded) {
    // Sem credenciais no servidor o recurso fica escondido para quem não é admin; o admin vê como ativar.
    return (
      <div className="crm-notif" ref={wrapRef}>
        <button type="button" className="crm-btn-secondary ag-google-btn" onClick={() => setOpen((v) => !v)} aria-expanded={open}>
          <i className="ti ti-brand-google" aria-hidden="true" />
          Google Agenda
        </button>
        {open ? (
          <div className="crm-notif-panel ag-google-panel" role="dialog" aria-label="Google Agenda">
            <div className="crm-notif-title">Google Agenda</div>
            <div className="crm-notif-hint">
              <i className="ti ti-info-circle" aria-hidden="true" />
              <span>
                Ainda não foi ativado neste servidor. Peça ao administrador para configurar <code>GOOGLE_CLIENT_ID</code> e{' '}
                <code>GOOGLE_CLIENT_SECRET</code> (veja o README).
              </span>
            </div>
          </div>
        ) : null}
      </div>
    );
  }

  return (
    <div className="crm-notif" ref={wrapRef}>
      <button
        type="button"
        className={`crm-btn-secondary ag-google-btn${status.connected ? ' connected' : ''}`}
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="true"
        aria-expanded={open}
      >
        <i className="ti ti-brand-google" aria-hidden="true" />
        Google Agenda
        {status.connected ? <span className="ag-google-dot" aria-label="Conectado" /> : null}
      </button>

      {notice ? (
        <div className={`ag-google-notice${notice.ok ? ' ok' : ''}`} role="status">
          {notice.text}
        </div>
      ) : null}

      {open ? (
        <div className="crm-notif-panel ag-google-panel" role="dialog" aria-label="Google Agenda">
          <div className="crm-notif-title">Google Agenda</div>
          {status.connected ? (
            <>
              <div className="ag-google-account">
                <i className="ti ti-circle-check" aria-hidden="true" />
                <div>
                  <strong>{status.email || 'Conta conectada'}</strong>
                  <span>{lastSyncLabel(status.lastSyncedAt)}</span>
                </div>
              </div>
              <p className="ag-google-help">
                Atividades marcadas com “Adicionar ao Google Agenda” viram eventos (com Meet e convites). Alterações feitas
                no Google voltam para cá ao sincronizar.
              </p>
              <label className="ag-check-inline ag-google-import">
                <input
                  type="checkbox"
                  checked={status.importEvents}
                  disabled={busy}
                  onChange={(e) => void run(() => google.setImportEvents(e.target.checked))}
                />
                Importar também eventos criados direto no Google
              </label>
              <div className="ag-google-actions">
                <button type="button" className="crm-btn-primary" onClick={() => void syncNow()} disabled={busy}>
                  <i className="ti ti-refresh" aria-hidden="true" />
                  {busy ? 'Aguarde…' : 'Sincronizar agora'}
                </button>
                <button type="button" className="crm-btn-secondary ag-danger-btn" onClick={() => void disconnect()} disabled={busy}>
                  Desconectar
                </button>
              </div>
            </>
          ) : (
            <>
              <p className="ag-google-help">
                Conecte seu Google para criar eventos com link do <strong>Google Meet</strong> direto da Agenda, convidar
                participantes por e-mail e manter tudo sincronizado.
              </p>
              <div className="ag-google-actions">
                <button type="button" className="crm-btn-primary" onClick={() => void run(google.connect)} disabled={busy}>
                  <i className="ti ti-brand-google" aria-hidden="true" />
                  Conectar Google Agenda
                </button>
              </div>
            </>
          )}
        </div>
      ) : null}
    </div>
  );
};

export default GoogleCalendarMenu;
