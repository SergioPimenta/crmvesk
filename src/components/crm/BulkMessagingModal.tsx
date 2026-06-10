import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import Modal from './Modal';
import { useCrmData } from '../../contexts/CrmDataContext';
import { api } from '../../services/api';
import { buildFullPhone, DEFAULT_DIAL_COUNTRY, nationalDigitsFromContactPhone } from '../../utils/countryDialCodes';

type MetaApprovedTemplate = {
  id: string;
  name: string;
  body: string;
  language: string;
};

type BulkResult = {
  sent: number;
  failed: { phone: string; error: string }[];
};

const templateKey = (t: MetaApprovedTemplate) => `${t.id}-${t.language}`;

const templateOptionLabel = (t: MetaApprovedTemplate) => {
  const lang = t.language.replace('_', '-');
  return t.name.includes(lang) ? t.name : `${t.name} (${lang})`;
};

function contactPhonesText(contacts: { nome: string; telefone: string }[]): string {
  const seen = new Set<string>();
  const lines: string[] = [];
  const sorted = [...contacts].sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'));
  for (const contact of sorted) {
    const national = nationalDigitsFromContactPhone(contact.telefone || '');
    if (national.length < 10 || seen.has(national)) continue;
    seen.add(national);
    lines.push(national);
  }
  return lines.join('\n');
}

function parsePhoneLines(text: string): string[] {
  const lines = text.split(/[\n,;]+/).map((l) => l.trim()).filter(Boolean);
  const phones = new Set<string>();
  for (const line of lines) {
    const digits = line.replace(/\D/g, '');
    if (digits.length < 10) continue;
    phones.add(buildFullPhone(DEFAULT_DIAL_COUNTRY, digits.startsWith('55') && digits.length >= 12 ? digits.slice(2) : digits));
  }
  return [...phones];
}

type Props = {
  open: boolean;
  onClose: () => void;
  onComplete?: () => void;
};

const BulkMessagingModal = ({ open, onClose, onComplete }: Props) => {
  const { contacts } = useCrmData();
  const [loadingTemplates, setLoadingTemplates] = useState(false);
  const [templates, setTemplates] = useState<MetaApprovedTemplate[]>([]);
  const [templateId, setTemplateId] = useState('');
  const [phonesText, setPhonesText] = useState('');
  const [sending, setSending] = useState(false);
  const [error, setError] = useState('');
  const [result, setResult] = useState<BulkResult | null>(null);

  const loadTemplates = useCallback(async () => {
    setLoadingTemplates(true);
    try {
      const data = await api.get<{ groups: { approved: MetaApprovedTemplate[] } }>('/whatsapp/templates');
      const approved = data.groups?.approved ?? [];
      setTemplates(approved);
      if (approved.length > 0) {
        setTemplateId((current) =>
          approved.some((t) => templateKey(t) === current) ? current : templateKey(approved[0])
        );
      }
    } catch {
      setTemplates([]);
      setTemplateId('');
    } finally {
      setLoadingTemplates(false);
    }
  }, []);

  const defaultPhonesText = useMemo(() => contactPhonesText(contacts), [contacts]);

  useEffect(() => {
    if (!open) return;
    setError('');
    setResult(null);
    setPhonesText(defaultPhonesText);
    void loadTemplates();
  }, [open, loadTemplates, defaultPhonesText]);

  const selectedTemplate = useMemo(
    () => templates.find((t) => templateKey(t) === templateId) ?? templates[0],
    [templates, templateId]
  );

  const phoneCount = useMemo(() => parsePhoneLines(phonesText).length, [phonesText]);

  const handleSend = async (e: React.FormEvent) => {
    e.preventDefault();
    const phones = parsePhoneLines(phonesText);
    if (!phones.length) {
      setError('Informe ao menos um telefone válido (um por linha).');
      return;
    }
    if (!selectedTemplate) {
      setError('Selecione um modelo aprovado pela Meta.');
      return;
    }

    setSending(true);
    setError('');
    setResult(null);
    try {
      const data = await api.post<BulkResult>('/whatsapp/bulk-send', {
        phones,
        templateName: selectedTemplate.name,
        templateLanguage: selectedTemplate.language,
        templateBody: selectedTemplate.body,
      });
      setResult(data);
      onComplete?.();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao enviar disparos');
    } finally {
      setSending(false);
    }
  };

  return (
    <Modal
      open={open}
      wide
      title="Disparos em massa"
      description="Envie um modelo aprovado pela Meta para vários números de uma vez."
      onClose={onClose}
    >
      <form className="wa-bulk-form" onSubmit={(e) => void handleSend(e)}>
        <div className="crm-field">
          <label htmlFor="wa_bulk_template">Modelo de mensagem</label>
          {loadingTemplates ? (
            <div className="wa-new-attendance-state">
              <i className="ti ti-loader-2 wa-spin" aria-hidden="true" />
              <p>Carregando modelos aprovados…</p>
            </div>
          ) : templates.length === 0 ? (
            <div className="wa-new-attendance-state wa-new-attendance-state--warn">
              <i className="ti ti-alert-circle" aria-hidden="true" />
              <p>
                Nenhum modelo aprovado. Configure em{' '}
                <Link to="/admin/integracoes?tab=whatsapp">Integrações → Modelos de mensagem</Link>.
              </p>
            </div>
          ) : (
            <>
              <select
                id="wa_bulk_template"
                value={templateId}
                onChange={(e) => setTemplateId(e.target.value)}
                required
              >
                {templates.map((t) => (
                  <option key={templateKey(t)} value={templateKey(t)}>
                    {templateOptionLabel(t)}
                  </option>
                ))}
              </select>
              <div className="wa-new-attendance-preview" style={{ marginTop: 10 }}>
                <span className="wa-new-attendance-preview-label">Pré-visualização</span>
                <div className="wa-new-attendance-preview-bubble">
                  <p>{selectedTemplate?.body}</p>
                </div>
              </div>
            </>
          )}
        </div>

        <div className="crm-field">
          <label htmlFor="wa_bulk_phones">
            Telefones <span className="wa-bulk-count">({phoneCount} válido{phoneCount === 1 ? '' : 's'})</span>
          </label>
          <textarea
            id="wa_bulk_phones"
            value={phonesText}
            onChange={(e) => setPhonesText(e.target.value)}
            placeholder={defaultPhonesText ? undefined : 'Nenhum contato com telefone cadastrado'}
            rows={8}
            required
          />
          <p className="wa-new-attendance-hint" style={{ marginTop: 6 }}>
            Lista preenchida com os telefones dos contatos salvos. Edite, remova ou adicione números (DDD + número, um por linha). DDI +55 é aplicado automaticamente.
          </p>
        </div>

        {error ? (
          <div className="integration-hint" style={{ borderColor: '#e0525240', color: '#e05252' }}>
            <i className="ti ti-alert-circle" aria-hidden="true" />
            <span>{error}</span>
          </div>
        ) : null}

        {result ? (
          <div className={`wa-bulk-result${result.failed.length ? ' has-errors' : ''}`}>
            <strong>
              {result.sent} enviado{result.sent === 1 ? '' : 's'}
              {result.failed.length ? ` · ${result.failed.length} falha${result.failed.length === 1 ? '' : 's'}` : ''}
            </strong>
            {result.failed.length > 0 ? (
              <ul>
                {result.failed.slice(0, 8).map((f) => (
                  <li key={f.phone}>
                    {f.phone}: {f.error}
                  </li>
                ))}
                {result.failed.length > 8 ? <li>…e mais {result.failed.length - 8}</li> : null}
              </ul>
            ) : null}
          </div>
        ) : null}

        <div className="wa-new-attendance-footer">
          <button type="button" className="crm-btn-secondary" onClick={onClose} disabled={sending}>
            {result ? 'Fechar' : 'Cancelar'}
          </button>
          {!result ? (
            <button
              type="submit"
              className="crm-btn-primary"
              disabled={sending || !templates.length || loadingTemplates || phoneCount === 0}
            >
              <i className="ti ti-broadcast" aria-hidden="true" />
              {sending ? 'Enviando…' : `Disparar para ${phoneCount || 0} número${phoneCount === 1 ? '' : 's'}`}
            </button>
          ) : null}
        </div>
      </form>
    </Modal>
  );
};

export default BulkMessagingModal;
