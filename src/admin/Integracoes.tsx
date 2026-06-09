import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import CrmLayout from '../components/crm/CrmLayout';
import ContactFormTab from '../components/integrations/ContactFormTab';
import WhatsAppButtonTab from '../components/integrations/WhatsAppButtonTab';
import { api } from '../services/api';

type IntegrationTab = 'whatsapp' | 'formulario' | 'botao';
type WaProvider = 'meta' | 'evolution';

type WaSettings = {
  provider: WaProvider;
  baseUrl: string;
  instanceName: string;
  phoneNumberId?: string;
  phone: string;
  status: string;
  hasApiKey: boolean;
  hasAppSecret?: boolean;
  apiKeyPreview: string;
  webhookUrl?: string;
  verifyToken?: string;
};

const TABS: { id: IntegrationTab; label: string; icon: string }[] = [
  { id: 'whatsapp', label: 'WhatsApp', icon: 'ti-brand-whatsapp' },
  { id: 'formulario', label: 'Formulário de contato', icon: 'ti-forms' },
  { id: 'botao', label: 'Botão WhatsApp', icon: 'ti-click' },
];

const Integracoes = () => {
  const [searchParams, setSearchParams] = useSearchParams();
  const tabParam = searchParams.get('tab') as IntegrationTab | null;
  const activeTab: IntegrationTab = TABS.some((t) => t.id === tabParam) ? tabParam! : 'whatsapp';

  const [provider, setProvider] = useState<WaProvider>('meta');
  const [configured, setConfigured] = useState(false);
  const [status, setStatus] = useState<'disconnected' | 'connecting' | 'connected'>('disconnected');
  const [qrcode, setQrcode] = useState<string | null>(null);
  const [webhookUrl, setWebhookUrl] = useState('');
  const [verifyToken, setVerifyToken] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [connecting, setConnecting] = useState(false);
  const [error, setError] = useState('');

  const [baseUrl, setBaseUrl] = useState('');
  const [instanceName, setInstanceName] = useState('');
  const [phoneNumberId, setPhoneNumberId] = useState('');
  const [apiToken, setApiToken] = useState('');
  const [appSecret, setAppSecret] = useState('');
  const [phone, setPhone] = useState('');

  const setTab = (tab: IntegrationTab) => {
    setSearchParams({ tab }, { replace: true });
  };

  const loadConfig = useCallback(async () => {
    const data = await api.get<{ configured: boolean; settings: WaSettings | null }>('/whatsapp/config');
    setConfigured(data.configured);
    if (data.settings) {
      setProvider(data.settings.provider === 'evolution' ? 'evolution' : 'meta');
      setBaseUrl(data.settings.baseUrl || '');
      setInstanceName(data.settings.instanceName || '');
      setPhoneNumberId(data.settings.phoneNumberId || data.settings.instanceName || '');
      setPhone(data.settings.phone || '');
      setWebhookUrl(data.settings.webhookUrl || '');
      setVerifyToken(data.settings.verifyToken || '');
      setStatus((data.settings.status as typeof status) || 'disconnected');
    }
  }, []);

  const loadStatus = useCallback(async () => {
    try {
      const data = await api.get<{
        configured: boolean;
        status: typeof status;
        qrcode?: string | null;
        webhookUrl?: string;
        error?: string;
      }>('/whatsapp/status');
      setConfigured(data.configured);
      setStatus(data.status || 'disconnected');
      setQrcode(data.qrcode ?? null);
      if (data.webhookUrl) setWebhookUrl(data.webhookUrl);
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
    if (provider !== 'evolution' || status !== 'connecting') return undefined;
    const id = window.setInterval(() => void loadStatus(), 4000);
    return () => window.clearInterval(id);
  }, [provider, status, loadStatus]);

  const statusLabel = useMemo(() => {
    if (status === 'connected') return 'Conectado';
    if (status === 'connecting') return 'Aguardando QR Code';
    return 'Desconectado';
  }, [status]);

  const copyText = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      /* ignore */
    }
  };

  const saveConfig = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setError('');
    try {
      if (provider === 'meta') {
        await api.put('/whatsapp/config', {
          provider: 'meta',
          phoneNumberId: phoneNumberId.trim(),
          accessToken: apiToken.trim() || undefined,
          appSecret: appSecret.trim() || undefined,
          phone: phone.trim(),
        });
      } else {
        await api.put('/whatsapp/config', {
          provider: 'evolution',
          baseUrl: baseUrl.trim(),
          instanceName: instanceName.trim(),
          apiKey: apiToken.trim() || undefined,
          phone: phone.trim(),
        });
      }
      setApiToken('');
      setAppSecret('');
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
        if (provider === 'meta') {
          await api.put('/whatsapp/config', {
            provider: 'meta',
            phoneNumberId: phoneNumberId.trim(),
            accessToken: apiToken.trim(),
            appSecret: appSecret.trim() || undefined,
            phone: phone.trim(),
          });
        } else {
          await api.put('/whatsapp/config', {
            provider: 'evolution',
            baseUrl: baseUrl.trim(),
            instanceName: instanceName.trim(),
            apiKey: apiToken.trim(),
            phone: phone.trim(),
          });
        }
        setConfigured(true);
        setApiToken('');
        setAppSecret('');
      }
      const data = await api.post<{ status: string; qrcode?: string; webhookUrl?: string }>('/whatsapp/connect', {});
      setStatus((data.status as typeof status) || 'connecting');
      setQrcode(data.qrcode ?? null);
      if (data.webhookUrl) setWebhookUrl(data.webhookUrl);
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
      setAppSecret('');
      setWebhookUrl('');
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

  const isMeta = provider === 'meta';
  const isLocked = status === 'connected';

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
                <h3 className="integration-panel-title">WhatsApp Business</h3>
                <p className="integration-panel-desc">
                  Use a API oficial da Meta
                </p>
              </div>
              <span className={`pill-status ${status === 'connected' ? 'ok' : status === 'connecting' ? 'wait' : 'warn'}`}>
                {statusLabel}
              </span>
            </div>

            <div className="wa-provider-toggle" role="radiogroup" aria-label="Provedor WhatsApp">
              <button
                type="button"
                className={`wa-provider-btn${isMeta ? ' active' : ''}`}
                onClick={() => !isLocked && setProvider('meta')}
                disabled={isLocked && provider !== 'meta'}
              >
                <i className="ti ti-cloud" aria-hidden="true" />
                API Oficial Meta
              </button>
              <button
                type="button"
                className={`wa-provider-btn${!isMeta ? ' active' : ''}`}
                onClick={() => !isLocked && setProvider('evolution')}
                disabled={isLocked && provider !== 'evolution'}
              >
                <i className="ti ti-qrcode" aria-hidden="true" />
                Evolution API
              </button>
            </div>

            {error ? (
              <div className="integration-hint" style={{ marginBottom: 12, borderColor: '#e0525240', color: '#e05252' }}>
                <i className="ti ti-alert-circle" aria-hidden="true" />
                <span>{error}</span>
              </div>
            ) : null}

            {loading ? <div className="kanban-empty">Carregando…</div> : null}

            <form className="crm-form integration-form" onSubmit={saveConfig}>
              {isMeta ? (
                <>
                  <div className="crm-field">
                    <label htmlFor="wa_phone_id">Phone Number ID</label>
                    <input
                      id="wa_phone_id"
                      value={phoneNumberId}
                      onChange={(e) => setPhoneNumberId(e.target.value)}
                      placeholder="Ex: 123456789012345"
                      disabled={isLocked}
                      required
                    />
                  </div>
                  <div className="crm-field">
                    <label htmlFor="wa_token">Access Token (permanente)</label>
                    <input
                      id="wa_token"
                      type="password"
                      value={apiToken}
                      onChange={(e) => setApiToken(e.target.value)}
                      placeholder={configured ? 'Deixe em branco para manter o atual' : 'Token da Meta Graph API'}
                      disabled={isLocked}
                      autoComplete="off"
                      required={!configured}
                    />
                  </div>
                  <div className="crm-field">
                    <label htmlFor="wa_app_secret">App Secret (recomendado)</label>
                    <input
                      id="wa_app_secret"
                      type="password"
                      value={appSecret}
                      onChange={(e) => setAppSecret(e.target.value)}
                      placeholder={configured ? 'Deixe em branco para manter o atual' : 'Segredo do app Meta'}
                      disabled={isLocked}
                      autoComplete="off"
                    />
                  </div>
                  <div className="crm-field">
                    <label htmlFor="wa_phone">Número exibido (opcional)</label>
                    <input
                      id="wa_phone"
                      value={phone}
                      onChange={(e) => setPhone(e.target.value)}
                      placeholder="Ex: 5511999998888"
                      disabled={isLocked}
                    />
                  </div>
                </>
              ) : (
                <>
                  <div className="crm-field" style={{ gridColumn: '1 / -1' }}>
                    <label htmlFor="wa_base">URL da API</label>
                    <input
                      id="wa_base"
                      value={baseUrl}
                      onChange={(e) => setBaseUrl(e.target.value)}
                      placeholder="Ex: https://sua-evolution.com"
                      disabled={isLocked}
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
                      disabled={isLocked}
                      required
                    />
                  </div>
                  <div className="crm-field">
                    <label htmlFor="wa_token_evo">API Key</label>
                    <input
                      id="wa_token_evo"
                      type="password"
                      value={apiToken}
                      onChange={(e) => setApiToken(e.target.value)}
                      placeholder={configured ? 'Deixe em branco para manter a atual' : 'Sua chave global'}
                      disabled={isLocked}
                      autoComplete="off"
                      required={!configured}
                    />
                  </div>
                  <div className="crm-field" style={{ gridColumn: '1 / -1' }}>
                    <label htmlFor="wa_phone_evo">Número (opcional, com DDI)</label>
                    <input
                      id="wa_phone_evo"
                      value={phone}
                      onChange={(e) => setPhone(e.target.value)}
                      placeholder="Ex: 5511999998888"
                      disabled={isLocked}
                    />
                  </div>
                </>
              )}

              {isMeta && webhookUrl ? (
                <div className="integration-hint" style={{ gridColumn: '1 / -1' }}>
                  <i className="ti ti-webhook" aria-hidden="true" />
                  <div>
                    <strong>Webhook (configure no Meta for Developers)</strong>
                    <div style={{ marginTop: 6, fontSize: 12 }}>
                      URL:{' '}
                      <code style={{ wordBreak: 'break-all' }}>{webhookUrl}</code>{' '}
                      <button type="button" className="crm-btn-link" onClick={() => void copyText(webhookUrl)}>
                        Copiar
                      </button>
                    </div>
                    {verifyToken ? (
                      <div style={{ marginTop: 4, fontSize: 12 }}>
                        Verify Token: <code>{verifyToken}</code>{' '}
                        <button type="button" className="crm-btn-link" onClick={() => void copyText(verifyToken)}>
                          Copiar
                        </button>
                      </div>
                    ) : null}
                    <div style={{ marginTop: 6, fontSize: 12, color: 'var(--vesk-muted)' }}>
                      Assine o campo <strong>messages</strong>. Defina <code>WHATSAPP_WEBHOOK_PUBLIC_URL</code> no
                      servidor (ex.: https://crm.vesk.com.br).
                    </div>
                  </div>
                </div>
              ) : null}

              {!isMeta ? (
                <div className="integration-hint" style={{ gridColumn: '1 / -1' }}>
                  <i className="ti ti-info-circle" aria-hidden="true" />
                  <span>
                    Configure <code>WHATSAPP_WEBHOOK_PUBLIC_URL</code> no servidor com a URL pública acessível pela
                    Evolution. O webhook é registrado automaticamente ao conectar.
                  </span>
                </div>
              ) : null}

              <div className="crm-form-actions" style={{ gridColumn: '1 / -1' }}>
                {!isLocked ? (
                  <button type="submit" className="crm-btn-secondary" disabled={saving}>
                    Salvar configuração
                  </button>
                ) : null}
                {isLocked ? (
                  <>
                    {!isMeta ? (
                      <button type="button" className="crm-btn-secondary" onClick={() => void handleSync()}>
                        Sincronizar conversas
                      </button>
                    ) : null}
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
                    {connecting
                      ? 'Conectando…'
                      : isMeta
                        ? 'Validar e conectar'
                        : 'Conectar e exibir QR Code'}
                  </button>
                )}
              </div>
            </form>

            {!isMeta && status === 'connecting' && qrcode ? (
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
        ) : activeTab === 'formulario' ? (
          <ContactFormTab />
        ) : activeTab === 'botao' ? (
          <WhatsAppButtonTab />
        ) : null}
      </div>
    </CrmLayout>
  );
};

export default Integracoes;
