import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import Modal from '../../components/crm/Modal';
import { api } from '../../services/api';
import {
  buildFullPhone,
  COUNTRY_DIAL_CODES,
  countryFlag,
  DEFAULT_DIAL_COUNTRY,
} from '../../utils/countryDialCodes';
import {
  templateKey,
  templateOptionLabel,
  type MetaApprovedTemplate,
  type WaConversation,
  type WaMessage,
} from './types';

export type NewAttendancePrefill = { national: string; contactId: string; name: string };

type Props = {
  open: boolean;
  /** WhatsApp conectado? Só então os modelos aprovados são carregados. */
  connected: boolean;
  /** Dados do contato escolhido na lista de contatos (telefone, id e nome). */
  prefill?: NewAttendancePrefill | null;
  onClose: () => void;
  onStarted: (result: { chat: WaConversation; messages: WaMessage[] }) => void | Promise<void>;
};

/** "Novo atendimento": inicia a conversa com um modelo de mensagem aprovado pela Meta. */
const NewAttendanceModal = ({ open, connected, prefill, onClose, onStarted }: Props) => {
  const [newPhoneDial, setNewPhoneDial] = useState(DEFAULT_DIAL_COUNTRY);
  const [newPhoneNational, setNewPhoneNational] = useState('');
  const [newContactId, setNewContactId] = useState<string | null>(null);
  const [newContactName, setNewContactName] = useState('');
  const [newTemplateId, setNewTemplateId] = useState('');
  const [approvedTemplates, setApprovedTemplates] = useState<MetaApprovedTemplate[]>([]);
  const [loadingTemplates, setLoadingTemplates] = useState(false);
  const [startingAttendance, setStartingAttendance] = useState(false);

  const loadApprovedTemplates = useCallback(async () => {
    setLoadingTemplates(true);
    try {
      const data = await api.get<{ groups: { approved: MetaApprovedTemplate[] } }>('/whatsapp/templates');
      const approved = data.groups?.approved ?? [];
      setApprovedTemplates(approved);
      if (approved.length > 0) {
        setNewTemplateId((current) =>
          approved.some((t) => templateKey(t) === current) ? current : templateKey(approved[0])
        );
      } else {
        setNewTemplateId('');
      }
    } catch {
      setApprovedTemplates([]);
      setNewTemplateId('');
    } finally {
      setLoadingTemplates(false);
    }
  }, []);

  useEffect(() => {
    if (open && connected) void loadApprovedTemplates();
  }, [open, connected, loadApprovedTemplates]);

  // A cada abertura o formulário volta ao início (ou vem preenchido com o contato escolhido).
  useEffect(() => {
    if (!open) return;
    setNewPhoneDial(DEFAULT_DIAL_COUNTRY);
    setNewPhoneNational(prefill?.national ?? '');
    setNewContactId(prefill?.contactId ?? null);
    setNewContactName(prefill?.name ?? '');
    setNewTemplateId(approvedTemplates[0] ? templateKey(approvedTemplates[0]) : '');
    // approvedTemplates fica de fora de propósito: só o estado inicial da abertura interessa.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, prefill]);

  const selectedTemplate = useMemo(
    () => approvedTemplates.find((t) => templateKey(t) === newTemplateId) ?? approvedTemplates[0],
    [approvedTemplates, newTemplateId]
  );

  const startNewAttendance = async (e: React.FormEvent) => {
    e.preventDefault();
    const phone = buildFullPhone(newPhoneDial, newPhoneNational);
    if (phone.length < 10) {
      alert('Informe um telefone válido com DDD + número.');
      return;
    }
    if (!selectedTemplate) {
      alert('Selecione um modelo aprovado pela Meta.');
      return;
    }

    setStartingAttendance(true);
    try {
      const data = await api.post<{ chat: WaConversation; messages: WaMessage[] }>('/whatsapp/chats', {
        phone,
        contactId: newContactId || undefined,
        name: newContactName || undefined,
        templateName: selectedTemplate.name,
        templateLanguage: selectedTemplate.language,
        templateBody: selectedTemplate.body,
      });
      await onStarted(data);
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : 'Não foi possível iniciar o atendimento');
    } finally {
      setStartingAttendance(false);
    }
  };

  return (
    <Modal
      open={open}
      wide
      title="Novo atendimento"
      description="Informe o número e selecione um modelo aprovado pela Meta para iniciar o atendimento."
      onClose={onClose}
    >
      <form className="crm-form wa-new-attendance-form" onSubmit={(e) => void startNewAttendance(e)}>
        <div className="wa-new-attendance-section">
          <div className="crm-field">
            <label htmlFor="wa_new_phone">Telefone</label>
            <div className="wa-new-attendance-phone">
              <select
                className="wa-phone-dial-select"
                value={newPhoneDial}
                onChange={(e) => setNewPhoneDial(e.target.value)}
                aria-label="DDI do país"
              >
                {COUNTRY_DIAL_CODES.map((c) => (
                  <option key={c.iso2} value={c.iso2} title={c.name}>
                    {countryFlag(c.iso2)} +{c.dial}
                  </option>
                ))}
              </select>
              <input
                id="wa_new_phone"
                value={newPhoneNational}
                onChange={(e) => setNewPhoneNational(e.target.value.replace(/\D/g, ''))}
                placeholder="DDD + número"
                inputMode="tel"
                autoFocus
                required
              />
            </div>
          </div>
        </div>

        <div className="wa-new-attendance-section wa-new-attendance-section--message">
          <div className="crm-field">
            <label htmlFor="wa_new_template">Modelo de mensagem (aprovado pela Meta)</label>
            <p className="wa-new-attendance-hint" style={{ marginTop: 0 }}>
              Obrigatório para iniciar atendimentos via API oficial WhatsApp.
            </p>
            {loadingTemplates ? (
              <div className="wa-new-attendance-state">
                <i className="ti ti-loader-2 wa-spin" aria-hidden="true" />
                <p>Carregando modelos aprovados da Meta…</p>
              </div>
            ) : approvedTemplates.length === 0 ? (
              <div className="wa-new-attendance-state wa-new-attendance-state--warn">
                <i className="ti ti-alert-circle" aria-hidden="true" />
                <p>
                  Nenhum modelo aprovado encontrado. Verifique em{' '}
                  <Link to="/admin/integracoes?tab=whatsapp">Integrações → Modelos de mensagem</Link>.
                </p>
              </div>
            ) : (
              <div className="wa-new-attendance-template">
                <select
                  id="wa_new_template"
                  value={newTemplateId}
                  onChange={(e) => setNewTemplateId(e.target.value)}
                  required
                >
                  {approvedTemplates.map((t) => (
                    <option key={templateKey(t)} value={templateKey(t)}>
                      {templateOptionLabel(t)}
                    </option>
                  ))}
                </select>
                <div className="wa-new-attendance-preview">
                  <span className="wa-new-attendance-preview-label">Pré-visualização</span>
                  <div className="wa-new-attendance-preview-bubble">
                    <p>{selectedTemplate?.body}</p>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>

        <div className="wa-new-attendance-footer">
          <button type="button" className="crm-btn-secondary" onClick={onClose} disabled={startingAttendance}>
            Cancelar
          </button>
          <button
            type="submit"
            className="crm-btn-primary"
            disabled={startingAttendance || !approvedTemplates.length || loadingTemplates}
          >
            <i className="ti ti-send" aria-hidden="true" />
            {startingAttendance ? 'Iniciando…' : 'Iniciar atendimento'}
          </button>
        </div>
      </form>
    </Modal>
  );
};

export default NewAttendanceModal;
