import { useMemo, useState } from 'react';
import CrmLayout from '../components/crm/CrmLayout';
import Modal from '../components/crm/Modal';
import { useCrmData, type Company, type CompanyStage } from '../contexts/CrmDataContext';

const Empresas = () => {
  const { companies, addCompany, updateCompany } = useCrmData();
  const [query, setQuery] = useState('');
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [isEditOpen, setIsEditOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState({
    nome: '',
    segmento: '',
    contatos: 1,
    etapa: 'Prospecção' as CompanyStage,
    proximaAcao: '',
    prioridade: 'Média' as NonNullable<Company['prioridade']>,
  });

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return companies;
    return companies.filter((c) => c.nome.toLowerCase().includes(q) || c.segmento.toLowerCase().includes(q));
  }, [companies, query]);

  const priorityPillClass = (p?: Company['prioridade']) => {
    if (p === 'Alta') return 'pill-priority high';
    if (p === 'Média') return 'pill-priority mid';
    return 'pill-priority low';
  };

  const resetForm = () =>
    setForm({
      nome: '',
      segmento: '',
      contatos: 1,
      etapa: 'Prospecção',
      proximaAcao: '',
      prioridade: 'Média',
    });

  const openCreate = () => {
    resetForm();
    setIsCreateOpen(true);
  };

  const openEdit = (id: string) => {
    const c = companies.find((x) => x.id === id);
    if (!c) return;
    setEditingId(id);
    setForm({
      nome: c.nome,
      segmento: c.segmento ?? '',
      contatos: c.contatos ?? 0,
      etapa: c.etapa,
      proximaAcao: c.proximaAcao ?? '',
      prioridade: (c.prioridade ?? 'Média') as NonNullable<Company['prioridade']>,
    });
    setIsEditOpen(true);
  };

  const createCompany = (e: React.FormEvent) => {
    e.preventDefault();
    addCompany({
      nome: form.nome.trim(),
      segmento: form.segmento.trim(),
      contatos: Math.max(0, Number(form.contatos) || 0),
      etapa: form.etapa,
      proximaAcao: form.proximaAcao.trim() || 'Definir próxima ação',
      prioridade: form.prioridade,
    });
    setIsCreateOpen(false);
  };

  const saveEdit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingId) return;
    updateCompany(editingId, {
      nome: form.nome.trim(),
      segmento: form.segmento.trim(),
      contatos: Math.max(0, Number(form.contatos) || 0),
      etapa: form.etapa,
      proximaAcao: form.proximaAcao.trim() || 'Definir próxima ação',
      prioridade: form.prioridade,
    });
    setIsEditOpen(false);
    setEditingId(null);
  };

  return (
    <CrmLayout>
      <div className="crm-page-header">
        <div>
          <div className="crm-page-title">
            Empresas <span>({filtered.length})</span>
          </div>
          <div style={{ fontSize: 12, color: 'var(--vesk-muted)', marginTop: 2 }}>
            Pessoas jurídicas com contatos vinculados e estágio no funil
          </div>
        </div>
        <div className="crm-page-actions">
          <div className="crm-inline-search" role="search">
            <i className="ti ti-search si" aria-hidden="true" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Buscar por empresa ou segmento…"
              aria-label="Buscar empresas"
            />
          </div>
          <button type="button" className="crm-btn-primary" onClick={openCreate}>
            <i className="ti ti-building" style={{ fontSize: 13 }} aria-hidden="true" />
            Nova empresa
          </button>
        </div>
      </div>

      <div className="crm-card">
        <table className="crm-table" aria-label="Lista de empresas cadastradas">
          <thead>
            <tr>
              <th>Empresa</th>
              <th>Segmento</th>
              <th>Contatos</th>
              <th>Etapa</th>
              <th>Próxima ação</th>
              <th>Prioridade</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {filtered.map((c) => (
              <tr key={c.id}>
                <td style={{ fontWeight: 600 }}>{c.nome}</td>
                <td style={{ color: 'var(--vesk-muted)' }}>{c.segmento}</td>
                <td style={{ color: 'var(--vesk-muted)' }}>
                  <span className="pill-count">
                    <i className="ti ti-users" aria-hidden="true" />
                    {c.contatos}
                  </span>
                </td>
                <td>
                  <span className="pill-stage">{c.etapa}</span>
                </td>
                <td style={{ color: 'var(--vesk-muted)' }}>{c.proximaAcao}</td>
                <td>
                  <span className={priorityPillClass(c.prioridade)}>{c.prioridade ?? '—'}</span>
                </td>
                <td>
                  <div className="crm-row-actions">
                    <button type="button" className="crm-action-btn" onClick={() => openEdit(c.id)} aria-label={`Editar ${c.nome}`}>
                      <i className="ti ti-pencil" aria-hidden="true" />
                      Editar
                    </button>
                  </div>
                </td>
              </tr>
            ))}
            {filtered.length === 0 ? (
              <tr>
                <td colSpan={7} style={{ color: 'var(--vesk-muted)', padding: 14 }}>
                  Nenhuma empresa encontrada.
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>

      <Modal
        open={isCreateOpen}
        title="Nova empresa"
        description="Cadastre uma empresa e vincule quantidade inicial de contatos."
        onClose={() => setIsCreateOpen(false)}
      >
        <form className="crm-form" onSubmit={createCompany}>
          <div className="crm-field" style={{ gridColumn: '1 / -1' }}>
            <label htmlFor="e_nome">Nome</label>
            <input id="e_nome" value={form.nome} onChange={(e) => setForm((p) => ({ ...p, nome: e.target.value }))} required />
          </div>
          <div className="crm-field">
            <label htmlFor="e_seg">Segmento</label>
            <input id="e_seg" value={form.segmento} onChange={(e) => setForm((p) => ({ ...p, segmento: e.target.value }))} />
          </div>
          <div className="crm-field">
            <label htmlFor="e_cont">Contatos</label>
            <input
              id="e_cont"
              type="number"
              min={0}
              value={form.contatos}
              onChange={(e) => setForm((p) => ({ ...p, contatos: Number(e.target.value) }))}
            />
          </div>
          <div className="crm-field">
            <label htmlFor="e_etapa">Etapa</label>
            <select id="e_etapa" value={form.etapa} onChange={(e) => setForm((p) => ({ ...p, etapa: e.target.value as CompanyStage }))}>
              <option value="Prospecção">Prospecção</option>
              <option value="Qualificação">Qualificação</option>
              <option value="Proposta">Proposta</option>
              <option value="Negociação">Negociação</option>
              <option value="Fechado">Fechado</option>
            </select>
          </div>
          <div className="crm-field">
            <label htmlFor="e_prio">Prioridade</label>
            <select
              id="e_prio"
              value={form.prioridade}
              onChange={(e) => setForm((p) => ({ ...p, prioridade: e.target.value as NonNullable<Company['prioridade']> }))}
            >
              <option value="Alta">Alta</option>
              <option value="Média">Média</option>
              <option value="Baixa">Baixa</option>
            </select>
          </div>
          <div className="crm-field" style={{ gridColumn: '1 / -1' }}>
            <label htmlFor="e_acao">Próxima ação</label>
            <input
              id="e_acao"
              value={form.proximaAcao}
              onChange={(e) => setForm((p) => ({ ...p, proximaAcao: e.target.value }))}
              placeholder="Ex: Reunião · amanhã 10:30"
            />
          </div>

          <div className="crm-form-actions" style={{ gridColumn: '1 / -1' }}>
            <button type="button" className="crm-btn-secondary" onClick={() => setIsCreateOpen(false)}>
              Cancelar
            </button>
            <button type="submit" className="crm-btn-primary" style={{ marginLeft: 'auto' }}>
              Salvar empresa
            </button>
          </div>
        </form>
      </Modal>

      <Modal
        open={isEditOpen}
        title="Editar empresa"
        description="Atualize as informações da empresa."
        onClose={() => setIsEditOpen(false)}
      >
        <form className="crm-form" onSubmit={saveEdit}>
          <div className="crm-field" style={{ gridColumn: '1 / -1' }}>
            <label htmlFor="ee_nome">Nome</label>
            <input id="ee_nome" value={form.nome} onChange={(e) => setForm((p) => ({ ...p, nome: e.target.value }))} required />
          </div>
          <div className="crm-field">
            <label htmlFor="ee_seg">Segmento</label>
            <input id="ee_seg" value={form.segmento} onChange={(e) => setForm((p) => ({ ...p, segmento: e.target.value }))} />
          </div>
          <div className="crm-field">
            <label htmlFor="ee_cont">Contatos</label>
            <input
              id="ee_cont"
              type="number"
              min={0}
              value={form.contatos}
              onChange={(e) => setForm((p) => ({ ...p, contatos: Number(e.target.value) }))}
            />
          </div>
          <div className="crm-field">
            <label htmlFor="ee_etapa">Etapa</label>
            <select id="ee_etapa" value={form.etapa} onChange={(e) => setForm((p) => ({ ...p, etapa: e.target.value as CompanyStage }))}>
              <option value="Prospecção">Prospecção</option>
              <option value="Qualificação">Qualificação</option>
              <option value="Proposta">Proposta</option>
              <option value="Negociação">Negociação</option>
              <option value="Fechado">Fechado</option>
            </select>
          </div>
          <div className="crm-field">
            <label htmlFor="ee_prio">Prioridade</label>
            <select
              id="ee_prio"
              value={form.prioridade}
              onChange={(e) => setForm((p) => ({ ...p, prioridade: e.target.value as NonNullable<Company['prioridade']> }))}
            >
              <option value="Alta">Alta</option>
              <option value="Média">Média</option>
              <option value="Baixa">Baixa</option>
            </select>
          </div>
          <div className="crm-field" style={{ gridColumn: '1 / -1' }}>
            <label htmlFor="ee_acao">Próxima ação</label>
            <input
              id="ee_acao"
              value={form.proximaAcao}
              onChange={(e) => setForm((p) => ({ ...p, proximaAcao: e.target.value }))}
              placeholder="Ex: Reunião · amanhã 10:30"
            />
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

export default Empresas;

