import { useEffect, useMemo, useState } from 'react';
import CrmLayout from '../components/crm/CrmLayout';
import { useCrmData } from '../contexts/CrmDataContext';
import { useAuth } from '../contexts/AuthContext';
import { stageToContactEtapa } from '../utils/crmStage';
import ActivityModal, { type ActivityDefaults } from './agenda/ActivityModal';
import { useTeamMembers } from './agenda/useTeamMembers';
import { CreateContactModal, EditContactModal } from './contatos/ContactModals';
import ContactsTable from './contatos/ContactsTable';
import OwnerAssignBar from './contatos/OwnerAssignBar';
import type { ContactTab } from './contatos/types';
import { useContactForm } from './contatos/useContactForm';
import { useContactsPage } from './contatos/useContactsPage';
import { useOwnerAssignment } from './contatos/useOwnerAssignment';

const TABS: ContactTab[] = ['Todos', 'Lead', 'Cliente', 'Prospect'];

const Contatos = () => {
  const {
    contacts,
    companies,
    pipelines,
    activePipelineId,
    addContact,
    updateContact,
    deleteContact,
    getCompanyName,
    refreshCrmData,
  } = useCrmData();
  const { user: authUser } = useAuth();
  const isAdmin = authUser?.role === 'admin';

  const [activeTab, setActiveTab] = useState<ContactTab>('Todos');
  const [query, setQuery] = useState('');
  const [onlyUnowned, setOnlyUnowned] = useState(false);
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [isEditOpen, setIsEditOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [schedule, setSchedule] = useState<ActivityDefaults | null>(null);
  const members = useTeamMembers();

  // Lista paginada no servidor; recarrega quando o contexto muda (contato criado, editado, excluído, atribuído).
  const list = useContactsPage({ query, tab: activeTab, onlyUnowned, refreshKey: contacts });
  const owners = useOwnerAssignment(isAdmin, refreshCrmData);
  const { clearSelection } = owners;
  const { form, setForm, formStages, sortedFormStages, stagesStatus, reloadStages, resetForm, loadForEdit } = useContactForm({
    isCreateOpen,
    pipelines,
    activePipelineId,
  });

  const pendingCount = useMemo(() => contacts.filter((c) => c.precisaFollowUp).length, [contacts]);

  // Mudou a busca ou um filtro: a seleção de contatos é descartada.
  useEffect(() => {
    clearSelection();
  }, [activeTab, list.debouncedQuery, onlyUnowned, clearSelection]);

  const openCreate = () => {
    resetForm();
    setIsCreateOpen(true);
  };

  const openEdit = (id: string) => {
    const c = contacts.find((x) => x.id === id);
    if (!c) return;
    setEditingId(id);
    loadForEdit(c);
    setIsEditOpen(true);
  };

  const createContact = async (e: React.FormEvent) => {
    e.preventDefault();
    const stage = formStages.find((s) => s.stageKey === form.stageKey);
    const etapa = stage ? stageToContactEtapa(stage.stageKey, stage.titulo) : form.etapa;
    try {
      await addContact({
        nome: form.nome.trim(),
        email: form.email.trim(),
        telefone: form.telefone.trim(),
        site: form.site.trim(),
        empresaId: form.empresaId || undefined,
        tipo: form.tipo,
        etapa,
        precisaFollowUp: true,
        ultimaInteracao: 'Criado agora',
        pipelineId: form.pipelineId || undefined,
        stageKey: form.stageKey || undefined,
      });
      setIsCreateOpen(false);
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : 'Não foi possível salvar o contato.');
    }
  };

  // "Agendar" na ficha do contato: fecha a edição e abre a Agenda já com o contato.
  const scheduleForContact = () => {
    const contact = contacts.find((x) => x.id === editingId);
    if (!contact) return;
    const start = new Date();
    start.setMinutes(0, 0, 0);
    start.setHours(start.getHours() + 1);
    setIsEditOpen(false);
    setSchedule({
      start,
      end: new Date(start.getTime() + 60 * 60_000),
      allDay: false,
      titulo: `Contato com ${contact.nome}`,
      tipo: 'Follow-up',
      contatoId: contact.id,
    });
  };

  const handleDelete = async (id: string) => {
    const contact = contacts.find((c) => c.id === id);
    if (!contact) return;
    if (!window.confirm(`Excluir o contato "${contact.nome}"? Esta ação não pode ser desfeita.`)) return;
    try {
      await deleteContact(id);
      if (editingId === id) {
        setIsEditOpen(false);
        setEditingId(null);
      }
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : 'Não foi possível excluir o contato.');
    }
  };

  const saveEdit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingId) return;
    const current = contacts.find((x) => x.id === editingId);
    if (!current) return;
    updateContact(editingId, {
      ...current,
      nome: form.nome.trim(),
      email: form.email.trim(),
      telefone: form.telefone.trim(),
      site: form.site.trim(),
      empresaId: form.empresaId || undefined,
      tipo: form.tipo,
      etapa: form.etapa,
      ultimaInteracao: current.ultimaInteracao || 'Atualizado',
      precisaFollowUp: current.precisaFollowUp,
    });
    setIsEditOpen(false);
    setEditingId(null);
  };

  return (
    <CrmLayout>
      <div className="crm-page-header">
        <div>
          <div className="crm-page-title">
            Contatos <span>({list.total})</span>
          </div>
          <div style={{ fontSize: 12, color: 'var(--vesk-muted)', marginTop: 2 }}>
            {pendingCount} novos/sem follow-up aguardando atenção
          </div>
        </div>
        <div className="crm-page-actions">
          <div className="crm-inline-search" role="search">
            <i className="ti ti-search si" aria-hidden="true" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Buscar por nome, e-mail ou empresa…"
              aria-label="Buscar contatos"
            />
          </div>
          <button type="button" className="crm-btn-primary" onClick={openCreate}>
            <i className="ti ti-user-plus" style={{ fontSize: 13 }} aria-hidden="true" />
            Novo contato
          </button>
        </div>
      </div>

      <div className="crm-card">
        <div className="crm-tabs" aria-label="Filtro de contatos">
          {TABS.map((tab) => (
            <button
              key={tab}
              type="button"
              className={`crm-tab${activeTab === tab ? ' active' : ''}`}
              onClick={() => setActiveTab(tab)}
            >
              {tab === 'Todos' ? 'Todos' : `${tab}s`}
            </button>
          ))}
        </div>

        {isAdmin ? (
          <OwnerAssignBar
            unownedCount={list.unownedTotal}
            onlyUnowned={onlyUnowned}
            onToggleOnlyUnowned={() => setOnlyUnowned((v) => !v)}
            selectedCount={owners.selectedIds.size}
            members={owners.members}
            assignTarget={owners.assignTarget}
            onAssignTargetChange={owners.setAssignTarget}
            assigning={owners.assigning}
            assignError={owners.assignError}
            onAssign={() => void owners.assignSelected()}
            onClearSelection={owners.clearSelection}
          />
        ) : null}

        <ContactsTable
          rows={list.items}
          loading={list.loading}
          isAdmin={isAdmin}
          selectedIds={owners.selectedIds}
          onToggleSelected={owners.toggleSelected}
          onSelectAll={owners.selectAll}
          ownerName={owners.ownerName}
          getCompanyName={getCompanyName}
          onEdit={openEdit}
          onDelete={(id) => void handleDelete(id)}
          page={list.page}
          totalPages={list.totalPages}
          total={list.total}
          onPageChange={list.setPage}
        />
      </div>

      <CreateContactModal
        open={isCreateOpen}
        form={form}
        setForm={setForm}
        companies={companies}
        pipelines={pipelines}
        sortedFormStages={sortedFormStages}
        stagesStatus={stagesStatus}
        onReloadStages={reloadStages}
        onClose={() => setIsCreateOpen(false)}
        onSubmit={createContact}
      />

      <EditContactModal
        open={isEditOpen}
        form={form}
        setForm={setForm}
        companies={companies}
        contactId={editingId}
        onSchedule={scheduleForContact}
        onClose={() => setIsEditOpen(false)}
        onSubmit={saveEdit}
      />

      <ActivityModal
        open={Boolean(schedule)}
        activity={null}
        defaults={schedule}
        members={members}
        currentUserId={authUser?.id}
        onClose={() => setSchedule(null)}
      />
    </CrmLayout>
  );
};

export default Contatos;
