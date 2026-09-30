import { useCallback, useEffect, useState } from 'react';
import { Navigate } from 'react-router-dom';
import CrmLayout from '../components/crm/CrmLayout';
import { useAuth } from '../contexts/AuthContext';
import { api } from '../services/api';

type AutomationSettings = {
  welcomeMessageEnabled: boolean;
  welcomeMessageText: string;
};

const Fluxos = () => {
  const { user: authUser } = useAuth();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [saved, setSaved] = useState(false);

  const [enabled, setEnabled] = useState(false);
  const [text, setText] = useState('');

  const loadSettings = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const data = await api.get<AutomationSettings>('/automation/settings');
      setEnabled(Boolean(data.welcomeMessageEnabled));
      setText(data.welcomeMessageText || '');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao carregar fluxos');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (authUser?.role === 'admin') {
      void loadSettings();
    }
  }, [authUser?.role, loadSettings]);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setError('');
    setSaved(false);
    try {
      const data = await api.put<AutomationSettings>('/automation/settings', {
        welcomeMessageEnabled: enabled,
        welcomeMessageText: text,
      });
      setEnabled(Boolean(data.welcomeMessageEnabled));
      setText(data.welcomeMessageText || '');
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao salvar fluxo');
    } finally {
      setSaving(false);
    }
  };

  if (authUser?.role !== 'admin') {
    return <Navigate to="/admin" replace />;
  }

  const previewName = 'Maria';
  const preview = text.replace(/\{\{\s*nome\s*\}\}/gi, previewName).trim();

  return (
    <CrmLayout>
      <div className="crm-page-header">
        <div>
          <div className="crm-page-title">Fluxos</div>
          <div style={{ fontSize: 12, color: 'var(--vesk-muted)', marginTop: 2 }}>
            Automações que disparam sozinhas quando algo acontece no CRM
          </div>
        </div>
      </div>

      {error ? (
        <div className="integration-hint" style={{ marginBottom: 12, borderColor: '#e0525240', color: '#e05252' }}>
          <i className="ti ti-alert-circle" aria-hidden="true" />
          <span>{error}</span>
        </div>
      ) : null}

      {saved ? (
        <div className="integration-hint" style={{ marginBottom: 12 }}>
          <i className="ti ti-check" aria-hidden="true" />
          <span>Fluxo salvo com sucesso.</span>
        </div>
      ) : null}

      <div className="crm-card" style={{ padding: 20 }}>
        {loading ? (
          <div className="kanban-empty">Carregando…</div>
        ) : (
          <form className="crm-form" onSubmit={handleSave}>
            <div style={{ gridColumn: '1 / -1', display: 'flex', alignItems: 'flex-start', gap: 14 }}>
              <div
                style={{
                  width: 40,
                  height: 40,
                  borderRadius: 10,
                  background: '#25d36618',
                  color: '#25d366',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  flexShrink: 0,
                }}
              >
                <i className="ti ti-brand-whatsapp" style={{ fontSize: 20 }} aria-hidden="true" />
              </div>
              <div style={{ flex: 1 }}>
                <div style={{ fontWeight: 700, fontSize: 14 }}>Mensagem de boas-vindas</div>
                <div style={{ fontSize: 12, color: 'var(--vesk-muted)', marginTop: 2 }}>
                  Assim que um contato novo manda a primeira mensagem no WhatsApp (ou escreve de novo numa conversa finalizada), ele cai em "Aguardando" e
                  recebe automaticamente esta resposta — sem atribuir a conversa a ninguém.
                </div>
              </div>
              <label className="crm-switch" title={enabled ? 'Ativo' : 'Inativo'}>
                <input type="checkbox" checked={enabled} onChange={(e) => setEnabled(e.target.checked)} />
                <span className="crm-switch-slider" aria-hidden="true" />
              </label>
            </div>

            <div className="crm-field" style={{ gridColumn: '1 / -1', marginTop: 14 }}>
              <label htmlFor="welcome_text">Mensagem</label>
              <textarea
                id="welcome_text"
                value={text}
                onChange={(e) => setText(e.target.value)}
                rows={4}
                placeholder="Olá {{nome}}! Recebemos sua mensagem e em breve alguém da equipe vai te atender."
                required={enabled}
              />
              <div style={{ fontSize: 11, color: 'var(--vesk-muted)', marginTop: 4 }}>
                Use <code>{'{{nome}}'}</code> para inserir o nome do contato automaticamente.
              </div>
            </div>

            {preview ? (
              <div className="crm-field" style={{ gridColumn: '1 / -1' }}>
                <label>Pré-visualização</label>
                <div className="wa-new-attendance-preview-bubble">
                  <p>{preview}</p>
                </div>
              </div>
            ) : null}

            <div className="crm-form-actions" style={{ gridColumn: '1 / -1' }}>
              <button type="submit" className="crm-btn-primary" style={{ marginLeft: 'auto' }} disabled={saving}>
                {saving ? 'Salvando…' : 'Salvar'}
              </button>
            </div>
          </form>
        )}
      </div>

      <div className="crm-card" style={{ padding: 20, marginTop: 16, opacity: 0.6 }}>
        <div style={{ fontWeight: 700, fontSize: 14, marginBottom: 4 }}>Mais fluxos em breve</div>
        <div style={{ fontSize: 12, color: 'var(--vesk-muted)' }}>
          Atribuição automática por etapa do pipeline, follow-up de leads parados e notificações de conversas
          esquecidas na fila estão nos próximos passos.
        </div>
      </div>
    </CrmLayout>
  );
};

export default Fluxos;
