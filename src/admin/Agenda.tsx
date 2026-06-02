import { useMemo, useState } from 'react';
import CrmLayout from '../components/crm/CrmLayout';
import Modal from '../components/crm/Modal';
import { useCrmData, type AgendaType } from '../contexts/CrmDataContext';

type AgendaView = 'Dia' | 'Semana' | 'Mês';

const Agenda = () => {
  const { activities, contacts, companies, addActivity, updateActivity, getContactName, getCompanyName } = useCrmData();
  const [view, setView] = useState<AgendaView>('Semana');
  const [query, setQuery] = useState('');
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [isEditOpen, setIsEditOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState({
    titulo: '',
    tipo: 'Reunião' as AgendaType,
    quando: '',
    contatoId: '',
    empresaId: '',
  });

  const selectedContact = useMemo(() => contacts.find((c) => c.id === form.contatoId) ?? null, [contacts, form.contatoId]);
  const allowedCompanies = useMemo(() => {
    if (!form.contatoId) return companies;
    if (!selectedContact?.empresaId) return [];
    return companies.filter((co) => co.id === selectedContact.empresaId);
  }, [companies, form.contatoId, selectedContact?.empresaId]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return activities;
    return activities.filter(
      (a) =>
        a.titulo.toLowerCase().includes(q) ||
        getContactName(a.contatoId).toLowerCase().includes(q) ||
        getCompanyName(a.empresaId).toLowerCase().includes(q) ||
        a.tipo.toLowerCase().includes(q)
    );
  }, [activities, getCompanyName, getContactName, query]);

  const typeIcon = (t: AgendaType) => {
    if (t === 'Reunião') return <i className="ti ti-users" aria-hidden="true" />;
    if (t === 'Ligação') return <i className="ti ti-phone" aria-hidden="true" />;
    if (t === 'Follow-up') return <i className="ti ti-refresh" aria-hidden="true" />;
    return <i className="ti ti-checkbox" aria-hidden="true" />;
  };

  const resetForm = () =>
    setForm({
      titulo: '',
      tipo: 'Reunião',
      quando: '',
      contatoId: '',
      empresaId: '',
    });

  const openCreate = () => {
    resetForm();
    setIsCreateOpen(true);
  };

  const openEdit = (id: string) => {
    const a = activities.find((x) => x.id === id);
    if (!a) return;
    setEditingId(id);
    setForm({
      titulo: a.titulo,
      tipo: a.tipo,
      quando: a.quando ?? '',
      contatoId: a.contatoId ?? '',
      empresaId: a.empresaId ?? '',
    });
    setIsEditOpen(true);
  };

  const createActivity = (e: React.FormEvent) => {
    e.preventDefault();
    addActivity({
      titulo: form.titulo.trim(),
      tipo: form.tipo,
      quando: form.quando.trim() || 'Hoje · agora',
      contatoId: form.contatoId || undefined,
      empresaId: form.empresaId || undefined,
      status: 'Pendente',
    });
    setIsCreateOpen(false);
  };

  const saveEdit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingId) return;
    const current = activities.find((x) => x.id === editingId);
    if (!current) return;
    updateActivity(editingId, {
      ...current,
      titulo: form.titulo.trim(),
      tipo: form.tipo,
      quando: form.quando.trim(),
      contatoId: form.contatoId || undefined,
      empresaId: form.empresaId || undefined,
    });
    setIsEditOpen(false);
    setEditingId(null);
  };

  return (
    <CrmLayout>
      <div className="crm-page-header">
        <div>
          <div className="crm-page-title">
            Agenda <span>({view})</span>
          </div>
          <div style={{ fontSize: 12, color: 'var(--vesk-muted)', marginTop: 2 }}>
            Calendário de atividades: reuniões, ligações, follow-ups e tarefas com data
          </div>
        </div>
        <div className="crm-page-actions">
          <div className="crm-inline-search" role="search">
            <i className="ti ti-search si" aria-hidden="true" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Buscar atividade, contato ou empresa…"
              aria-label="Buscar atividades"
            />
          </div>
          <button type="button" className="crm-btn-primary" onClick={openCreate}>
            <i className="ti ti-plus" style={{ fontSize: 13 }} aria-hidden="true" />
            Nova atividade
          </button>
        </div>
      </div>

      <div className="crm-card">
        <div className="crm-card-header" style={{ marginBottom: 12 }}>
          <i className="ti ti-calendar-time" style={{ color: 'var(--vesk-orange)', fontSize: 16 }} aria-hidden="true" />
          <div className="crm-card-title">Visão</div>
          <div className="segmented" role="tablist" aria-label="Alternar visão da agenda">
            {(['Dia', 'Semana', 'Mês'] as const).map((v) => (
              <button
                key={v}
                type="button"
                className={`segmented-btn${view === v ? ' active' : ''}`}
                onClick={() => setView(v)}
                role="tab"
                aria-selected={view === v}
              >
                {v}
              </button>
            ))}
          </div>
        </div>

        <div className="agenda-grid" aria-label="Calendário simplificado">
          {Array.from({ length: 7 }).map((_, idx) => (
            <div key={idx} className="agenda-day">
              <div className="agenda-day-head">
                <span className="agenda-dow">{['Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb', 'Dom'][idx]}</span>
                <span className="agenda-date">{String(2 + idx).padStart(2, '0')}</span>
              </div>
              <div className="agenda-day-body">
                {idx === 1 ? <div className="agenda-chip">Reunião 10:30</div> : null}
                {idx === 1 ? <div className="agenda-chip">Ligação 14:00</div> : null}
                {idx === 2 ? <div className="agenda-chip">Follow-up 09:15</div> : null}
                {idx === 4 ? <div className="agenda-chip">Tarefa 16:30</div> : null}
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="crm-card">
        <div className="crm-card-header">
          <i className="ti ti-list-details" style={{ color: 'var(--vesk-orange)', fontSize: 16 }} aria-hidden="true" />
          <div className="crm-card-title">Atividades</div>
          <span className="pipeline-badge">{filtered.length} itens</span>
        </div>

        <div className="agenda-list" role="list" aria-label="Lista de atividades">
          {filtered.map((a) => (
            <div key={a.id} className="agenda-item" role="listitem">
              <div className={`agenda-ico${a.status === 'Concluída' ? ' done' : ''}`}>{typeIcon(a.tipo)}</div>
              <div className="agenda-body">
                <div className="agenda-title">
                  {a.titulo} <span className="pill-stage" style={{ marginLeft: 8 }}>{a.tipo}</span>
                </div>
                <div className="agenda-sub">
                  {a.quando} · {getContactName(a.contatoId)} · {getCompanyName(a.empresaId)}
                </div>
              </div>
              <div className={`pill-status${a.status === 'Concluída' ? ' ok' : ''}`}>{a.status}</div>
              <button type="button" className="crm-action-btn" onClick={() => openEdit(a.id)} aria-label={`Editar atividade ${a.titulo}`}>
                <i className="ti ti-pencil" aria-hidden="true" />
                Editar
              </button>
            </div>
          ))}
          {filtered.length === 0 ? <div className="kanban-empty">Nenhuma atividade encontrada.</div> : null}
        </div>
      </div>

      <Modal
        open={isCreateOpen}
        title="Nova atividade"
        description="Agende reuniões, ligações, follow-ups e tarefas com data."
        onClose={() => setIsCreateOpen(false)}
      >
        <form className="crm-form" onSubmit={createActivity}>
          <div className="crm-field" style={{ gridColumn: '1 / -1' }}>
            <label htmlFor="a_titulo">Título</label>
            <input id="a_titulo" value={form.titulo} onChange={(e) => setForm((p) => ({ ...p, titulo: e.target.value }))} required />
          </div>
          <div className="crm-field">
            <label htmlFor="a_tipo">Tipo</label>
            <select id="a_tipo" value={form.tipo} onChange={(e) => setForm((p) => ({ ...p, tipo: e.target.value as AgendaType }))}>
              <option value="Reunião">Reunião</option>
              <option value="Ligação">Ligação</option>
              <option value="Follow-up">Follow-up</option>
              <option value="Tarefa">Tarefa</option>
            </select>
          </div>
          <div className="crm-field">
            <label htmlFor="a_quando">Quando</label>
            <input
              id="a_quando"
              value={form.quando}
              onChange={(e) => setForm((p) => ({ ...p, quando: e.target.value }))}
              placeholder="Ex: Amanhã · 09:30"
            />
          </div>
          <div className="crm-field">
            <label htmlFor="a_cont">Contato</label>
            <select
              id="a_cont"
              value={form.contatoId}
              onChange={(e) => {
                const contatoId = e.target.value;
                const c = contacts.find((x) => x.id === contatoId);
                setForm((p) => ({
                  ...p,
                  contatoId,
                  empresaId: contatoId ? c?.empresaId ?? '' : p.empresaId,
                }));
              }}
            >
              <option value="">— Selecione —</option>
              {contacts.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.nome}
                </option>
              ))}
            </select>
          </div>
          <div className="crm-field">
            <label htmlFor="a_emp">Empresa</label>
            <select id="a_emp" value={form.empresaId} onChange={(e) => setForm((p) => ({ ...p, empresaId: e.target.value }))}>
              <option value="">— Selecione —</option>
              {allowedCompanies.map((co) => (
                <option key={co.id} value={co.id}>
                  {co.nome}
                </option>
              ))}
            </select>
          </div>

          <div className="crm-form-actions" style={{ gridColumn: '1 / -1' }}>
            <button type="button" className="crm-btn-secondary" onClick={() => setIsCreateOpen(false)}>
              Cancelar
            </button>
            <button type="submit" className="crm-btn-primary" style={{ marginLeft: 'auto' }}>
              Criar atividade
            </button>
          </div>
        </form>
      </Modal>

      <Modal
        open={isEditOpen}
        title="Editar atividade"
        description="Atualize os detalhes e vínculos da atividade."
        onClose={() => setIsEditOpen(false)}
      >
        <form className="crm-form" onSubmit={saveEdit}>
          <div className="crm-field" style={{ gridColumn: '1 / -1' }}>
            <label htmlFor="ea_titulo">Título</label>
            <input id="ea_titulo" value={form.titulo} onChange={(e) => setForm((p) => ({ ...p, titulo: e.target.value }))} required />
          </div>
          <div className="crm-field">
            <label htmlFor="ea_tipo">Tipo</label>
            <select id="ea_tipo" value={form.tipo} onChange={(e) => setForm((p) => ({ ...p, tipo: e.target.value as AgendaType }))}>
              <option value="Reunião">Reunião</option>
              <option value="Ligação">Ligação</option>
              <option value="Follow-up">Follow-up</option>
              <option value="Tarefa">Tarefa</option>
            </select>
          </div>
          <div className="crm-field">
            <label htmlFor="ea_quando">Quando</label>
            <input id="ea_quando" value={form.quando} onChange={(e) => setForm((p) => ({ ...p, quando: e.target.value }))} />
          </div>
          <div className="crm-field">
            <label htmlFor="ea_cont">Contato</label>
            <select
              id="ea_cont"
              value={form.contatoId}
              onChange={(e) => {
                const contatoId = e.target.value;
                const c = contacts.find((x) => x.id === contatoId);
                setForm((p) => ({
                  ...p,
                  contatoId,
                  empresaId: contatoId ? c?.empresaId ?? '' : p.empresaId,
                }));
              }}
            >
              <option value="">— Selecione —</option>
              {contacts.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.nome}
                </option>
              ))}
            </select>
          </div>
          <div className="crm-field">
            <label htmlFor="ea_emp">Empresa</label>
            <select id="ea_emp" value={form.empresaId} onChange={(e) => setForm((p) => ({ ...p, empresaId: e.target.value }))}>
              <option value="">— Selecione —</option>
              {allowedCompanies.map((co) => (
                <option key={co.id} value={co.id}>
                  {co.nome}
                </option>
              ))}
            </select>
          </div>

          <div className="crm-form-actions" style={{ gridColumn: '1 / -1' }}>
            <button type="button" className="crm-btn-secondary" onClick={() => setIsEditOpen(false)}>
              Cancelar
            </button>
            <button type="submit" className="crm-btn-primary" style={{ marginLeft: 'auto' }}>
              Salvar alterações
            </button>
          </div>
        </form>
      </Modal>
    </CrmLayout>
  );
};

export default Agenda;

