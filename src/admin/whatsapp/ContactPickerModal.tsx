import { useEffect, useMemo, useState } from 'react';
import Modal from '../../components/crm/Modal';
import type { Contact } from '../../contexts/CrmDataContext';
import { initials } from './types';

type Props = {
  open: boolean;
  contacts: Contact[];
  onClose: () => void;
  onPick: (contact: Contact) => void;
};

/** Lista de contatos para iniciar um atendimento com um modelo da Meta. */
const ContactPickerModal = ({ open, contacts, onClose, onPick }: Props) => {
  const [contactSearch, setContactSearch] = useState('');

  useEffect(() => {
    if (open) setContactSearch('');
  }, [open]);

  const pickerContacts = useMemo(() => {
    const q = contactSearch.trim().toLowerCase();
    const sorted = [...contacts].sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'));
    if (!q) return sorted;
    return sorted.filter(
      (c) =>
        c.nome.toLowerCase().includes(q) ||
        c.telefone.toLowerCase().includes(q) ||
        c.email.toLowerCase().includes(q)
    );
  }, [contacts, contactSearch]);

  return (
    <Modal
      open={open}
      title="Contatos"
      description="Selecione um contato para iniciar o atendimento com um modelo da Meta."
      wide
      onClose={onClose}
    >
      <div className="wa-contact-picker">
        <div className="crm-inline-search" role="search">
          <i className="ti ti-search si" aria-hidden="true" />
          <input
            value={contactSearch}
            onChange={(e) => setContactSearch(e.target.value)}
            placeholder="Buscar por nome, telefone ou e-mail…"
            aria-label="Buscar contatos"
            autoFocus
          />
        </div>
        <div className="wa-contact-picker-list" role="list">
          {pickerContacts.map((c) => {
            const hasPhone = (c.telefone?.replace(/\D/g, '') || '').length >= 10;
            return (
              <button
                key={c.id}
                type="button"
                className="wa-contact-picker-item"
                disabled={!hasPhone}
                onClick={() => onPick(c)}
                role="listitem"
              >
                <div className="wa-avatar">{initials(c.nome)}</div>
                <div className="wa-contact-picker-body">
                  <div className="wa-contact-picker-name">{c.nome}</div>
                  <div className="wa-contact-picker-meta">
                    {c.telefone || 'Sem telefone'}
                    {c.email ? ` · ${c.email}` : ''}
                  </div>
                </div>
                <i className="ti ti-chevron-right" aria-hidden="true" />
              </button>
            );
          })}
          {pickerContacts.length === 0 ? <div className="kanban-empty">Nenhum contato encontrado.</div> : null}
        </div>
      </div>
    </Modal>
  );
};

export default ContactPickerModal;
