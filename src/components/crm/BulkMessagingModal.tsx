import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import Modal from './Modal';
import { useCrmData, type Contact } from '../../contexts/CrmDataContext';
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

type DispatchGroup = {
  id: string;
  name: string;
  contactIds: string[];
};

// Grupos dinâmicos calculados a partir dos contatos (sempre atualizados).
const DYNAMIC_GROUPS: { id: string; label: string; filter: (c: Contact) => boolean }[] = [
  { id: 'novos', label: 'Contatos novos', filter: (c) => Boolean(c.precisaFollowUp) },
  { id: 'leads', label: 'Leads', filter: (c) => c.tipo === 'Lead' },
  { id: 'clientes', label: 'Clientes', filter: (c) => c.tipo === 'Cliente' },
  { id: 'prospects', label: 'Prospects', filter: (c) => c.tipo === 'Prospect' },
  { id: 'todos', label: 'Todos os contatos', filter: () => true },
];

const DEFAULT_GROUP = 'novos';

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

const hasPhone = (c: Contact) => nationalDigitsFromContactPhone(c.telefone || '').length >= 10;

type Props = {
  open: boolean;
  onClose: () => void;
  onComplete?: () => void;
};

const BulkMessagingModal = ({ open, onClose, onComplete }: Props) => {
  const { contacts } = useCrmData();
  const [view, setView] = useState<'send' | 'groups'>('send');

  const [loadingTemplates, setLoadingTemplates] = useState(false);
  const [templates, setTemplates] = useState<MetaApprovedTemplate[]>([]);
  const [templateId, setTemplateId] = useState('');
  const [selectedGroup, setSelectedGroup] = useState(DEFAULT_GROUP);
  const [phonesText, setPhonesText] = useState('');
  const [sending, setSending] = useState(false);
  const [error, setError] = useState('');
  const [result, setResult] = useState<BulkResult | null>(null);

  // Grupos personalizados (salvos no servidor)
  const [groups, setGroups] = useState<DispatchGroup[]>([]);

  const resolveGroupContacts = useCallback(
    (groupId: string, groupList: DispatchGroup[] = groups): Contact[] => {
      const dyn = DYNAMIC_GROUPS.find((g) => g.id === groupId);
      if (dyn) return contacts.filter(dyn.filter);
      const custom = groupList.find((g) => `custom-${g.id}` === groupId);
      if (custom) {
        const ids = new Set(custom.contactIds);
        return contacts.filter((c) => ids.has(c.id));
      }
      return contacts;
    },
    [contacts, groups]
  );

  const applyGroup = useCallback(
    (groupId: string, groupList?: DispatchGroup[]) => {
      setSelectedGroup(groupId);
      setPhonesText(contactPhonesText(resolveGroupContacts(groupId, groupList)));
    },
    [resolveGroupContacts]
  );

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

  const loadGroups = useCallback(async () => {
    try {
      const data = await api.get<{ groups: DispatchGroup[] }>('/whatsapp/dispatch-groups');
      const list = data.groups ?? [];
      setGroups(list);
      return list;
    } catch {
      setGroups([]);
      return [];
    }
  }, []);

  // Após salvar um grupo: recarrega, seleciona e preenche os telefones dele.
  const finishWithGroup = useCallback(
    async (selectId: string) => {
      const fresh = await loadGroups();
      applyGroup(selectId, fresh);
      setView('send');
    },
    [loadGroups, applyGroup]
  );

  // Volta para a tela de envio, revalidando o grupo selecionado (ex.: se foi excluído).
  const returnToSend = useCallback(() => {
    const stillValid = selectedGroup.startsWith('custom-')
      ? groups.some((g) => `custom-${g.id}` === selectedGroup)
      : true;
    if (!stillValid) applyGroup(DEFAULT_GROUP);
    setView('send');
  }, [selectedGroup, groups, applyGroup]);

  useEffect(() => {
    if (!open) return;
    setError('');
    setResult(null);
    setView('send');
    setSelectedGroup(DEFAULT_GROUP);
    setPhonesText(contactPhonesText(contacts.filter(DYNAMIC_GROUPS[0].filter)));
    void loadTemplates();
    void loadGroups();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

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
      description="Envie um modelo aprovado pela Meta para um grupo de contatos."
      onClose={onClose}
    >
      {view === 'groups' ? (
        <GroupManager
          contacts={contacts}
          groups={groups}
          onBack={returnToSend}
          reloadGroups={loadGroups}
          finishWithGroup={finishWithGroup}
        />
      ) : (
        <form className="wa-bulk-form" onSubmit={(e) => void handleSend(e)}>
          <div className="crm-field">
            <label htmlFor="wa_bulk_group">Grupo de disparo</label>
            <div className="wa-bulk-group-row">
              <select
                id="wa_bulk_group"
                value={selectedGroup}
                onChange={(e) => applyGroup(e.target.value)}
              >
                <optgroup label="Dinâmicos">
                  {DYNAMIC_GROUPS.map((g) => (
                    <option key={g.id} value={g.id}>
                      {g.label} ({contacts.filter(g.filter).length})
                    </option>
                  ))}
                </optgroup>
                {groups.length > 0 ? (
                  <optgroup label="Meus grupos">
                    {groups.map((g) => (
                      <option key={g.id} value={`custom-${g.id}`}>
                        {g.name} ({g.contactIds.length})
                      </option>
                    ))}
                  </optgroup>
                ) : null}
              </select>
              <button type="button" className="crm-btn-secondary" onClick={() => setView('groups')}>
                <i className="ti ti-users-group" aria-hidden="true" />
                Gerenciar grupos
              </button>
            </div>
          </div>

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
              placeholder="Nenhum contato com telefone neste grupo"
              rows={7}
              required
            />
            <p className="wa-new-attendance-hint" style={{ marginTop: 6 }}>
              Lista preenchida a partir do grupo selecionado. Edite, remova ou adicione números (DDD + número, um por linha). DDI +55 é aplicado automaticamente. Os disparos são enviados em fila, com intervalo de 2–3 segundos entre cada mensagem.
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
                {sending ? 'Enviando em fila…' : `Disparar para ${phoneCount || 0} número${phoneCount === 1 ? '' : 's'}`}
              </button>
            ) : null}
          </div>
        </form>
      )}
    </Modal>
  );
};

type GroupManagerProps = {
  contacts: Contact[];
  groups: DispatchGroup[];
  onBack: () => void;
  reloadGroups: () => Promise<DispatchGroup[]>;
  finishWithGroup: (selectId: string) => Promise<void>;
};

const GroupManager = ({ contacts, groups, onBack, reloadGroups, finishWithGroup }: GroupManagerProps) => {
  const [editing, setEditing] = useState<DispatchGroup | null>(null);
  const [creating, setCreating] = useState(false);
  const [name, setName] = useState('');
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [search, setSearch] = useState('');
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState('');

  const startCreate = () => {
    setEditing(null);
    setCreating(true);
    setName('');
    setSelectedIds(new Set());
    setSearch('');
    setFormError('');
  };

  const startEdit = (group: DispatchGroup) => {
    setCreating(false);
    setEditing(group);
    setName(group.name);
    setSelectedIds(new Set(group.contactIds));
    setSearch('');
    setFormError('');
  };

  const closeForm = () => {
    setCreating(false);
    setEditing(null);
    setFormError('');
  };

  const toggleContact = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const filteredContacts = useMemo(() => {
    const q = search.trim().toLowerCase();
    const list = contacts
      .filter((c) => (q ? c.nome.toLowerCase().includes(q) || (c.telefone || '').includes(q) : true))
      .sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'));
    return list;
  }, [contacts, search]);

  const handleSave = async () => {
    if (!name.trim()) {
      setFormError('Informe o nome do grupo.');
      return;
    }
    if (selectedIds.size === 0) {
      setFormError('Selecione ao menos um contato.');
      return;
    }
    setSaving(true);
    setFormError('');
    try {
      const payload = { name: name.trim(), contactIds: [...selectedIds] };
      let savedId: string;
      if (editing) {
        const data = await api.put<{ group: DispatchGroup }>(`/whatsapp/dispatch-groups/${editing.id}`, payload);
        savedId = data.group.id;
      } else {
        const data = await api.post<{ group: DispatchGroup }>('/whatsapp/dispatch-groups', payload);
        savedId = data.group.id;
      }
      closeForm();
      await finishWithGroup(`custom-${savedId}`);
    } catch (err) {
      setFormError(err instanceof Error ? err.message : 'Erro ao salvar grupo');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (group: DispatchGroup) => {
    if (!window.confirm(`Excluir o grupo "${group.name}"?`)) return;
    try {
      await api.delete(`/whatsapp/dispatch-groups/${group.id}`);
      await reloadGroups();
    } catch {
      /* ignora falha de exclusão */
    }
  };

  const showForm = creating || editing;

  return (
    <div className="wa-bulk-form">
      <div className="wa-groups-head">
        <button type="button" className="crm-btn-secondary" onClick={showForm ? closeForm : onBack}>
          <i className="ti ti-arrow-left" aria-hidden="true" />
          Voltar
        </button>
        <div className="crm-card-title" style={{ flex: 1 }}>
          {showForm ? (editing ? 'Editar grupo' : 'Novo grupo') : 'Meus grupos'}
        </div>
        {!showForm ? (
          <button type="button" className="crm-btn-primary" onClick={startCreate}>
            <i className="ti ti-plus" aria-hidden="true" />
            Novo grupo
          </button>
        ) : null}
      </div>

      {showForm ? (
        <>
          <div className="crm-field">
            <label htmlFor="wa_group_name">Nome do grupo</label>
            <input
              id="wa_group_name"
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Ex.: Clientes VIP"
              maxLength={120}
            />
          </div>

          <div className="crm-field">
            <label>
              Contatos <span className="wa-bulk-count">({selectedIds.size} selecionado{selectedIds.size === 1 ? '' : 's'})</span>
            </label>
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Buscar contato por nome ou telefone…"
              style={{ marginBottom: 8 }}
            />
            <div className="wa-group-contacts">
              {filteredContacts.length === 0 ? (
                <div className="wa-group-empty">Nenhum contato encontrado.</div>
              ) : (
                filteredContacts.map((c) => (
                  <label key={c.id} className={`wa-group-contact${selectedIds.has(c.id) ? ' selected' : ''}`}>
                    <input
                      type="checkbox"
                      checked={selectedIds.has(c.id)}
                      onChange={() => toggleContact(c.id)}
                    />
                    <span className="wa-group-contact-name">{c.nome}</span>
                    <span className="wa-group-contact-phone">
                      {hasPhone(c) ? c.telefone : 'sem telefone'}
                    </span>
                  </label>
                ))
              )}
            </div>
          </div>

          {formError ? (
            <div className="integration-hint" style={{ borderColor: '#e0525240', color: '#e05252' }}>
              <i className="ti ti-alert-circle" aria-hidden="true" />
              <span>{formError}</span>
            </div>
          ) : null}

          <div className="wa-new-attendance-footer">
            <button type="button" className="crm-btn-secondary" onClick={closeForm} disabled={saving}>
              Cancelar
            </button>
            <button type="button" className="crm-btn-primary" onClick={() => void handleSave()} disabled={saving}>
              <i className="ti ti-check" aria-hidden="true" />
              {saving ? 'Salvando…' : 'Salvar grupo'}
            </button>
          </div>
        </>
      ) : (
        <div className="wa-groups-list">
          {groups.length === 0 ? (
            <div className="wa-group-empty">
              Nenhum grupo personalizado ainda. Crie um grupo escolhendo contatos específicos.
            </div>
          ) : (
            groups.map((g) => (
              <div key={g.id} className="wa-group-row">
                <div className="wa-group-row-info">
                  <div className="wa-group-row-name">{g.name}</div>
                  <div className="wa-group-row-count">
                    {g.contactIds.length} contato{g.contactIds.length === 1 ? '' : 's'}
                  </div>
                </div>
                <button type="button" className="crm-icon-btn" title="Editar" onClick={() => startEdit(g)}>
                  <i className="ti ti-pencil" aria-hidden="true" />
                </button>
                <button type="button" className="crm-icon-btn" title="Excluir" onClick={() => void handleDelete(g)}>
                  <i className="ti ti-trash" aria-hidden="true" />
                </button>
              </div>
            ))
          )}
        </div>
      )}
    </div>
  );
};

export default BulkMessagingModal;
