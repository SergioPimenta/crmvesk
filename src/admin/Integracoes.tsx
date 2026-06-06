import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import CrmLayout from '../components/crm/CrmLayout';
import { api } from '../services/api';

type IntegrationTab = 'whatsapp';

type WaSettings = {
  baseUrl: string;
  instanceName: string;
  phone: string;
  status: string;
  hasApiKey: boolean;
  apiKeyPreview: string;
};

const TABS: { id: IntegrationTab; label: string; icon: string }[] = [
  { id: 'whatsapp', label: 'WhatsApp', icon: 'ti-brand-whatsapp' },
];

const Integracoes = () => {
  const [searchParams, setSearchParams] = useSearchParams();
  const tabParam = searchParams.get('tab') as IntegrationTab | null;
  const activeTab: IntegrationTab = TABS.some((t) => t.id === tabParam) ? tabParam! : 'whatsapp';

  const [configured, setConfigured] = useState(false);
  const [status, setStatus] = useState<'disconnected' | 'connecting' | 'connected'>('disconnected');
  const [qrcode, setQrcode] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [connecting, setConnecting] = useState(false);
  const [error, setError] = useState('');

  const [baseUrl, setBaseUrl] = useState('');
  const [instanceName, setInstanceName] = useState('');
  const [apiToken, setApiToken] = useState('');
  const [phone, setPhone] = useState('');

  const setTab = (tab: IntegrationTab) => {
    setSearchParams({ tab }, { replace: true });
  };

  const loadConfig = useCallback(async () => {
    const data = await api.get<{ configured: boolean; settings: WaSettings | null }>('/whatsapp/config');
    setConfigured(data.configured);
    if (data.settings) {
      setBaseUrl(data.settings.baseUrl || '');
      setInstanceName(data.settings.instanceName || '');
      setPhone(data.settings.phone || '');
      setStatus((data.settings.status as typeof status) || 'disconnected');
    }
  }, []);

  const loadStatus = useCallback(async () => {
    try {
      const data = await api.get<{
        configured: boolean;
        status: typeof status;
        qrcode?: string | null;
        error?: string;
      }>('/whatsapp/status');
      setConfigured(data.configured);
      setStatus(data.status || 'disconnected');
      setQrcode(data.qrcode ?? null);
      if (data.error) setError(data.error);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Erro ao consultar status');
    }
  }, []);

  useEffect(() => {
    void (async () => {
      setLoading(true);
      try {
        await loadConfig();
        await loadStatus();
      } finally {
        setLoading(false);
      }
    })();
  }, [loadConfig, loadStatus]);

  useEffect(() => {
    if (status !== 'connecting') return undefined;
    const id = window.setInterval(() => void loadStatus(), 4000);
    return () => window.clearInterval(id);
  }, [status, loadStatus]);

  const statusLabel = useMemo(() => {
    if (status === 'connected') return 'Conectado';
    if (status === 'connecting') return 'Aguardando QR Code';
    return 'Desconectado';
  }, [status]);

  const saveConfig = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setError('');
    try {
      await api.put('/whatsapp/config', {
        baseUrl: baseUrl.trim(),
        instanceName: instanceName.trim(),
        apiKey: apiToken.trim() || undefined,
        phone: phone.trim(),
      });
      setApiToken('');
      await loadConfig();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Erro ao salvar configuração');
    } finally {
      setSaving(false);
    }
  };

  const handleConnect = async () => {
    setConnecting(true);
    setError('');
    try {
      if (!configured) {
        await api.put('/whatsapp/config', {
          baseUrl: baseUrl.trim(),
          instanceName: instanceName.trim(),
          apiKey: apiToken.trim(),
          phone: phone.trim(),
        });
        setConfigured(true);
        setApiToken('');
      }
      const data = await api.post<{ status: string; qrcode?: string }>('/whatsapp/connect', {});
      setStatus((data.status as typeof status) || 'connecting');
      setQrcode(data.qrcode ?? null);
      void loadStatus();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Erro ao conectar');
    } finally {
      setConnecting(false);
    }
  };

  const handleDisconnect = async () => {
    if (!window.confirm('Desconectar WhatsApp e remover a configuração deste CRM?')) return;
    try {
      await api.delete('/whatsapp/config');
      setConfigured(false);
      setStatus('disconnected');
      setQrcode(null);
      setApiToken('');
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Erro ao desconectar');
    }
  };

  const handleSync = async () => {
    try {
      await api.post('/whatsapp/sync', {});
      await loadStatus();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Erro ao sincronizar conversas');
    }
  };

  return (
    <CrmLayout>
      <div className="crm-page-header">
        <div>
          <div className="crm-page-title">Integrações</div>
          <div style={{ fontSize: 12, color: 'var(--vesk-muted)', marginTop: 2 }}>
            Conecte canais externos ao CRM ·{' '}
            <Link to="/admin/whatsapp" style={{ color: 'var(--vesk-orange)' }}>
              Abrir chat WhatsApp
            </Link>
          </div>
        </div>
      </div>

      <div className="crm-card integration-card">
        <div className="crm-tabs" aria-label="Integrações disponíveis">
          {TABS.map((tab) => (
            <button
              key={tab.id}
              type="button"
              className={`crm-tab${activeTab === tab.id ? ' active' : ''}`}
              onClick={() => setTab(tab.id)}
            >
              <i className={`ti ${tab.icon}`} aria-hidden="true" />
              {tab.label}
            </button>
          ))}
        </div>

        {activeTab === 'whatsapp' ? (
          <div className="integration-panel">
            <div className="integration-panel-head">
              <div className="integration-brand whatsapp">
                <i className="ti ti-brand-whatsapp" aria-hidden="true" />
              </div>
              <div>
                <h3 className="integration-panel-title">Evolution API (WhatsApp)</h3>
                <p className="integration-panel-desc">
                  Compatível com Evolution API v2, Whatsmiau e provedores similares. Informe a URL base, o nome da
                  instância e a API Key do seu servidor.
                </p>
              </div>
              <span className={`pill-status ${status === 'connected' ? 'ok' : status === 'connecting' ? 'wait' : 'warn'}`}>
                {statusLabel}
              </span>
            </div>

            {error ? (
              <div className="integration-hint" style={{ marginBottom: 12, borderColor: '#e0525240', color: '#e05252' }}>
                <i className="ti ti-alert-circle" aria-hidden="true" />
                <span>{error}</span>
              </div>
            ) : null}

            {loading ? <div className="kanban-empty">Carregando…</div> : null}

            <form className="crm-form integration-form" onSubmit={saveConfig}>
              <div className="crm-field" style={{ gridColumn: '1 / -1' }}>
                <label htmlFor="wa_base">URL da API</label>
                <input
                  id="wa_base"
                  value={baseUrl}
                  onChange={(e) => setBaseUrl(e.target.value)}
                  placeholder="Ex: https://sua-evolution.com"
                  disabled={status === 'connected'}
                  required
                />
              </div>
              <div className="crm-field">
                <label htmlFor="wa_instance">Nome da instância</label>
                <input
                  id="wa_instance"
                  value={instanceName}
                  onChange={(e) => setInstanceName(e.target.value)}
                  placeholder="Ex: crmvesk"
                  disabled={status === 'connected'}
                  required
                />
              </div>
              <div className="crm-field">
                <label htmlFor="wa_token">API Key</label>
                <input
                  id="wa_token"
                  type="password"
                  value={apiToken}
                  onChange={(e) => setApiToken(e.target.value)}
                  placeholder={configured ? 'Deixe em branco para manter a atual' : 'Sua chave global'}
                  disabled={status === 'connected'}
                  autoComplete="off"
                  required={!configured}
                />
              </div>
              <div className="crm-field" style={{ gridColumn: '1 / -1' }}>
                <label htmlFor="wa_phone">Número (opcional, com DDI)</label>
                <input
                  id="wa_phone"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  placeholder="Ex: 5511999998888"
                  disabled={status === 'connected'}
                />
              </div>

              <div className="integration-hint" style={{ gridColumn: '1 / -1' }}>
                <i className="ti ti-info-circle" aria-hidden="true" />
                <span>
                  Configure <code>WHATSAPP_WEBHOOK_PUBLIC_URL</code> no servidor com a URL pública acessível pela Evolution
                  (ex.: https://crmvesk.vercel.app). O webhook é registrado automaticamente ao conectar.
                </span>
              </div>

              <div className="crm-form-actions" style={{ gridColumn: '1 / -1' }}>
                {status !== 'connected' ? (
                  <button type="submit" className="crm-btn-secondary" disabled={saving}>
                    Salvar configuração
                  </button>
                ) : null}
                {status === 'connected' ? (
                  <>
                    <button type="button" className="crm-btn-secondary" onClick={() => void handleSync()}>
                      Sincronizar conversas
                    </button>
                    <button type="button" className="crm-btn-secondary crm-btn-danger" onClick={() => void handleDisconnect()}>
                      Desconectar
                    </button>
                  </>
                ) : (
                  <button
                    type="button"
                    className="crm-btn-primary integration-connect-btn"
                    style={{ marginLeft: 'auto' }}
                    onClick={() => void handleConnect()}
                    disabled={connecting}
                  >
                    <i className="ti ti-plug-connected" aria-hidden="true" />
                    {connecting ? 'Conectando…' : 'Conectar e exibir QR Code'}
                  </button>
                )}
              </div>
            </form>

            {status === 'connecting' && qrcode ? (
              <div className="wa-qr-panel">
                <p style={{ fontSize: 12, color: 'var(--vesk-muted)', marginBottom: 10 }}>
                  Escaneie o QR Code no WhatsApp → Aparelhos conectados → Conectar aparelho
                </p>
                <img src={qrcode} alt="QR Code WhatsApp" className="wa-qr-image" />
              </div>
            ) : null}

            <div className="integration-features">
              <div className="integration-feature">
                <i className="ti ti-message-circle" aria-hidden="true" />
                <div>
                  <strong>Mensagens no CRM</strong>
                  <span>Histórico em Gestão → WhatsApp</span>
                </div>
              </div>
              <div className="integration-feature">
                <i className="ti ti-user-plus" aria-hidden="true" />
                <div>
                  <strong>Vínculo com contatos</strong>
                  <span>Match automático por telefone</span>
                </div>
              </div>
              <div className="integration-feature">
                <i className="ti ti-webhook" aria-hidden="true" />
                <div>
                  <strong>Webhook em tempo real</strong>
                  <span>Mensagens recebidas atualizam o chat</span>
                </div>
              </div>
            </div>
          </div>
        ) : null}
      </div>
    </CrmLayout>
  );
};

export default Integracoes;
