import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import CrmLayout from '../components/crm/CrmLayout';
import ContactFormTab from '../components/integrations/ContactFormTab';
import WhatsAppButtonTab from '../components/integrations/WhatsAppButtonTab';
import MessageTemplatesModal from '../components/integrations/MessageTemplatesModal';
import { api } from '../services/api';

type IntegrationTab = 'whatsapp' | 'formulario' | 'botao';

type WaSettings = {
  phoneNumberId?: string;
  phone: string;
  status: string;
  hasApiKey: boolean;
  hasAppSecret?: boolean;
  wabaId?: string;
  metaAppId?: string;
  hasWabaId?: boolean;
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

  const [configured, setConfigured] = useState(false);
  const [hasStoredApiKey, setHasStoredApiKey] = useState(false);
  const [hasStoredAppSecret, setHasStoredAppSecret] = useState(false);
  const [status, setStatus] = useState<'disconnected' | 'connecting' | 'connected'>('disconnected');
  const [webhookUrl, setWebhookUrl] = useState('');
  const [verifyToken, setVerifyToken] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [connecting, setConnecting] = useState(false);
  const [error, setError] = useState('');
  const [copiedField, setCopiedField] = useState<'webhook' | 'token' | null>(null);
  const [templatesOpen, setTemplatesOpen] = useState(false);

  const [phoneNumberId, setPhoneNumberId] = useState('');
  const [apiToken, setApiToken] = useState('');
  const [appSecret, setAppSecret] = useState('');
  const [metaAppId, setMetaAppId] = useState('');
  const [wabaId, setWabaId] = useState('');
  const [phone, setPhone] = useState('');

  const setTab = (tab: IntegrationTab) => {
    setSearchParams({ tab }, { replace: true });
  };

  const loadConfig = useCallback(async () => {
    const data = await api.get<{ configured: boolean; settings: WaSettings | null }>('/whatsapp/config');
    setConfigured(data.configured);
    if (data.settings) {
      setHasStoredApiKey(Boolean(data.settings.hasApiKey));
      setHasStoredAppSecret(Boolean(data.settings.hasAppSecret));
      setPhoneNumberId(data.settings.phoneNumberId || '');
      setPhone(data.settings.phone || '');
      setMetaAppId(data.settings.metaAppId || '');
      setWabaId(data.settings.wabaId || '');
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
        webhookUrl?: string;
        error?: string;
      }>('/whatsapp/status');
      setConfigured(data.configured);
      setStatus(data.status || 'disconnected');
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

  const statusLabel = useMemo(() => {
    if (status === 'connected') return 'Conectado';
    if (status === 'connecting') return 'Conectando…';
    return 'Desconectado';
  }, [status]);

  const copyText = async (text: string, field: 'webhook' | 'token') => {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedField(field);
      window.setTimeout(() => setCopiedField(null), 2000);
    } catch {
      /* ignore */
    }
  };

  const validateMetaRequired = () => {
    if (!phoneNumberId.trim()) {
      setError('Phone Number ID é obrigatório');
      return false;
    }
    if (!apiToken.trim() && !(configured && hasStoredApiKey)) {
      setError('Access Token é obrigatório');
      return false;
    }
    if (!appSecret.trim() && !(configured && hasStoredAppSecret)) {
      setError('App Secret é obrigatório');
      return false;
    }
    if (!metaAppId.trim()) {
      setError('App ID (Meta) é obrigatório');
      return false;
    }
    return true;
  };

  const saveConfig = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!validateMetaRequired()) return;
    setSaving(true);
    setError('');
    try {
      await api.put('/whatsapp/config', {
        provider: 'meta',
        phoneNumberId: phoneNumberId.trim(),
        accessToken: apiToken.trim() || undefined,
        appSecret: appSecret.trim() || undefined,
        metaAppId: metaAppId.trim(),
        wabaId: wabaId.trim() || undefined,
        phone: phone.trim(),
      });
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
    if (!validateMetaRequired()) return;
    setConnecting(true);
    setError('');
    try {
      await api.put('/whatsapp/config', {
        provider: 'meta',
        phoneNumberId: phoneNumberId.trim(),
        accessToken: apiToken.trim() || undefined,
        appSecret: appSecret.trim() || undefined,
        metaAppId: metaAppId.trim(),
        wabaId: wabaId.trim() || undefined,
        phone: phone.trim(),
      });
      setConfigured(true);
      setHasStoredApiKey(true);
      setHasStoredAppSecret(true);
      setApiToken('');
      setAppSecret('');
      const data = await api.post<{ status: string; webhookUrl?: string }>('/whatsapp/connect', {});
      setStatus((data.status as typeof status) || 'connecting');
      if (data.webhookUrl) setWebhookUrl(data.webhookUrl);
      await loadConfig();
      await loadStatus();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Erro ao conectar');
    } finally {
      setConnecting(false);
    }
  };

  const handleDisconnect = async () => {
    if (!window.confirm('Desconectar WhatsApp? A configuração será removida, mas suas conversas serão mantidas.')) return;
    try {
      await api.delete('/whatsapp/config');
      setConfigured(false);
      setHasStoredApiKey(false);
      setHasStoredAppSecret(false);
      setStatus('disconnected');
      setApiToken('');
      setAppSecret('');
      setWebhookUrl('');
      setVerifyToken('');
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Erro ao desconectar');
    }
  };

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
              <button type="button" className="wa-provider-btn active" disabled>
                <i className="ti ti-cloud" aria-hidden="true" />
                API Oficial Meta
              </button>
            </div>

            {error ? (
              <div className="integration-hint" style={{ marginBottom: 12, borderColor: '#e0525240', color: '#e05252' }}>
                <i className="ti ti-alert-circle" aria-hidden="true" />
                <span>{error}</span>
              </div>
            ) : null}

            {loading ? <div className="kanban-empty">Carregando…</div> : null}

            <form className="crm-form integration-form" onSubmit={saveConfig} autoComplete="off">
              <div className="crm-field">
                <label htmlFor="wa_phone_id">Phone Number ID</label>
                <input
                  id="wa_phone_id"
                  name="meta_phone_number_id"
                  value={phoneNumberId}
                  onChange={(e) => setPhoneNumberId(e.target.value)}
                  placeholder="Ex: 123456789012345"
                  disabled={isLocked}
                  required
                  autoComplete="off"
                  autoCorrect="off"
                  autoCapitalize="off"
                  spellCheck={false}
                  data-lpignore="true"
                  data-1p-ignore
                />
              </div>
              <div className="crm-field">
                <label htmlFor="wa_token">Access Token (permanente)</label>
                <input
                  id="wa_token"
                  name="meta_access_token"
                  type="password"
                  value={apiToken}
                  onChange={(e) => setApiToken(e.target.value)}
                  placeholder={configured ? 'Deixe em branco para manter o atual' : 'Token da Meta Graph API'}
                  disabled={isLocked}
                  autoComplete="new-password"
                  data-lpignore="true"
                  data-1p-ignore
                  required={!configured}
                />
              </div>
              <div className="crm-field">
                <label htmlFor="wa_app_secret">App Secret</label>
                <input
                  id="wa_app_secret"
                  name="meta_app_secret"
                  type="password"
                  value={appSecret}
                  onChange={(e) => setAppSecret(e.target.value)}
                  placeholder={configured ? 'Deixe em branco para manter o atual' : 'Segredo do app Meta'}
                  disabled={isLocked}
                  autoComplete="new-password"
                  data-lpignore="true"
                  data-1p-ignore
                  required={!configured || !hasStoredAppSecret}
                />
              </div>
              <div className="crm-field">
                <label htmlFor="wa_app_id">App ID (Meta)</label>
                <input
                  id="wa_app_id"
                  name="meta_app_id"
                  value={metaAppId}
                  onChange={(e) => setMetaAppId(e.target.value)}
                  placeholder="Ex: 1234567890123456"
                  disabled={isLocked}
                  required
                  autoComplete="off"
                  autoCorrect="off"
                  autoCapitalize="off"
                  spellCheck={false}
                  data-lpignore="true"
                  data-1p-ignore
                />
              </div>
              <div className="crm-field">
                <label htmlFor="wa_waba_id">WABA ID (WhatsApp Business Account)</label>
                <input
                  id="wa_waba_id"
                  name="meta_waba_id"
                  value={wabaId}
                  onChange={(e) => setWabaId(e.target.value)}
                  placeholder="Ex: 102289599326934"
                  disabled={isLocked}
                  autoComplete="off"
                  autoCorrect="off"
                  autoCapitalize="off"
                  spellCheck={false}
                  data-lpignore="true"
                  data-1p-ignore
                />
              </div>
              <div className="crm-field">
                <label htmlFor="wa_phone">Número exibido (opcional)</label>
                <input
                  id="wa_phone"
                  name="meta_display_phone"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  placeholder="Ex: 5511999998888"
                  disabled={isLocked}
                  autoComplete="off"
                  inputMode="tel"
                  data-lpignore="true"
                  data-1p-ignore
                />
              </div>

              {webhookUrl ? (
                <div className="integration-hint" style={{ gridColumn: '1 / -1' }}>
                  <i className="ti ti-webhook" aria-hidden="true" />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <strong>Webhook (configure no Meta for Developers)</strong>
                    <div className="wa-widget-field" style={{ marginTop: 10 }}>
                      <label>URL</label>
                      <div className="wa-widget-copy-row">
                        <code>{webhookUrl}</code>
                        <button
                          type="button"
                          className="crm-btn-secondary wa-widget-btn"
                          onClick={() => void copyText(webhookUrl, 'webhook')}
                        >
                          <i className="ti ti-copy" aria-hidden="true" />
                          {copiedField === 'webhook' ? 'Copiado!' : 'Copiar'}
                        </button>
                      </div>
                    </div>
                    {verifyToken ? (
                      <div className="wa-widget-field" style={{ marginTop: 10 }}>
                        <label>Verify Token</label>
                        <div className="wa-widget-copy-row">
                          <code>{verifyToken}</code>
                          <button
                            type="button"
                            className="crm-btn-secondary wa-widget-btn"
                            onClick={() => void copyText(verifyToken, 'token')}
                          >
                            <i className="ti ti-copy" aria-hidden="true" />
                            {copiedField === 'token' ? 'Copiado!' : 'Copiar'}
                          </button>
                        </div>
                      </div>
                    ) : null}
                    <div style={{ marginTop: 10, fontSize: 12, color: 'var(--vesk-muted)' }}>
                      Assine o campo <strong>messages</strong>. Defina <code>WHATSAPP_WEBHOOK_PUBLIC_URL</code> no
                      servidor (ex.: https://crm.vesk.com.br).
                    </div>
                  </div>
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
                    <button type="button" className="crm-btn-secondary" onClick={() => setTemplatesOpen(true)}>
                      <i className="ti ti-template" aria-hidden="true" />
                      Modelos de mensagem
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
                    {connecting ? 'Conectando…' : 'Validar e conectar'}
                  </button>
                )}
              </div>
            </form>

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

      <MessageTemplatesModal open={templatesOpen} onClose={() => setTemplatesOpen(false)} />
    </CrmLayout>
  );
};

export default Integracoes;
