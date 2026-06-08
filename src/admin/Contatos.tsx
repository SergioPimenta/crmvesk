import { useEffect, useMemo, useState } from 'react';

import CrmLayout from '../components/crm/CrmLayout';

import Modal from '../components/crm/Modal';

import { useCrmData, type ContactStage, type ContactType, type PipelineStage } from '../contexts/CrmDataContext';

import { api } from '../services/api';

import { stageToContactEtapa } from '../utils/crmStage';
import { contactOrigin } from '../utils/contactOrigin';



const initials = (name: string) => {

  const parts = name.trim().split(/\s+/);

  if (parts.length >= 2) return `${parts[0][0]}${parts[parts.length - 1][0]}`.toUpperCase();

  return name.slice(0, 2).toUpperCase();

};



const Contatos = () => {

  const { contacts, companies, pipelines, activePipelineId, addContact, updateContact, deleteContact, getCompanyName } = useCrmData();

  const [activeTab, setActiveTab] = useState<'Todos' | ContactType>('Todos');

  const [query, setQuery] = useState('');

  const [isCreateOpen, setIsCreateOpen] = useState(false);

  const [isEditOpen, setIsEditOpen] = useState(false);

  const [editingId, setEditingId] = useState<string | null>(null);

  const [formStages, setFormStages] = useState<PipelineStage[]>([]);



  const defaultPipelineId = pipelines.find((p) => p.isDefault)?.id ?? pipelines[0]?.id ?? '';



  const [form, setForm] = useState({

    nome: '',

    email: '',

    telefone: '',

    site: '',

    empresaId: '',

    tipo: 'Lead' as ContactType,

    etapa: 'Prospecção' as ContactStage,

    pipelineId: '',

    stageKey: '',

  });



  const pendingCount = useMemo(() => contacts.filter((c) => c.precisaFollowUp).length, [contacts]);



  const filtered = useMemo(() => {

    const q = query.trim().toLowerCase();

    return contacts.filter((c) => {

      const matchesTab = activeTab === 'Todos' ? true : c.tipo === activeTab;

      const matchesQuery =

        q.length === 0 ||

        c.nome.toLowerCase().includes(q) ||

        c.email.toLowerCase().includes(q) ||

        getCompanyName(c.empresaId).toLowerCase().includes(q);

      return matchesTab && matchesQuery;

    });

  }, [activeTab, contacts, getCompanyName, query]);

  useEffect(() => {
    if (!isCreateOpen || form.pipelineId) return;
    const pid = activePipelineId ?? defaultPipelineId;
    if (pid) setForm((p) => ({ ...p, pipelineId: pid }));
  }, [isCreateOpen, activePipelineId, defaultPipelineId, form.pipelineId]);

  useEffect(() => {
    if (!form.pipelineId) {
      setFormStages([]);
      return;
    }

    void (async () => {

      const stagesData = await api.get<Array<{ id: number; pipelineId: number; stageKey: string; titulo: string; cor: string; pos: number }>>(

        `/crm/pipelines/${form.pipelineId}/stages`

      );

      setFormStages(
        stagesData.map((s) => ({
          id: String(s.id),
          pipelineId: String((s as { pipelineId?: number; pipelineid?: number }).pipelineId ?? (s as { pipelineid?: number }).pipelineid),
          stageKey: String((s as { stageKey?: string; stagekey?: string }).stageKey ?? (s as { stagekey?: string }).stagekey),
          titulo: s.titulo,
          cor: s.cor,
          pos: Number(s.pos ?? 0),
        }))
      );

    })();

  }, [form.pipelineId]);



  useEffect(() => {

    if (formStages.length === 0) return;

    const hasStage = formStages.some((s) => s.stageKey === form.stageKey);

    if (!hasStage) {

      const first = [...formStages].sort((a, b) => a.pos - b.pos)[0];

      if (first) {

        setForm((p) => ({

          ...p,

          stageKey: first.stageKey,

          etapa: stageToContactEtapa(first.stageKey, first.titulo),

        }));

      }

    }

  }, [formStages, form.stageKey]);



  const resetForm = () => {

    const pipelineId = activePipelineId ?? defaultPipelineId;

    setForm({

      nome: '',

      email: '',

      telefone: '',

      site: '',

      empresaId: '',

      tipo: 'Lead',

      etapa: 'Prospecção',

      pipelineId,

      stageKey: '',

    });

    setFormStages([]);

  };



  const openCreate = () => {

    resetForm();

    setIsCreateOpen(true);

  };



  const openEdit = (id: string) => {

    const c = contacts.find((x) => x.id === id);

    if (!c) return;

    setEditingId(id);

    setForm({

      nome: c.nome,

      email: c.email ?? '',

      telefone: c.telefone ?? '',

      site: c.site ?? '',

      empresaId: c.empresaId ?? '',

      tipo: c.tipo,

      etapa: c.etapa,

      pipelineId: activePipelineId ?? defaultPipelineId,

      stageKey: '',

    });

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



  const sortedFormStages = useMemo(() => [...formStages].sort((a, b) => a.pos - b.pos), [formStages]);



  return (

    <CrmLayout>

      <div className="crm-page-header">

        <div>

          <div className="crm-page-title">

            Contatos <span>({filtered.length})</span>

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

          {(['Todos', 'Lead', 'Cliente', 'Prospect'] as const).map((tab) => (

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



        <table className="crm-table" aria-label="Lista de contatos cadastrados">

          <thead>

            <tr>

              <th>Contato</th>

              <th>Telefone</th>

              <th>Site</th>

              <th>Empresa</th>

              <th>Etapa</th>

              <th>Origem</th>

              <th />

            </tr>

          </thead>

          <tbody>

            {filtered.map((c) => (

              <tr key={c.id}>

                <td>

                  <div className="contact-name-cell">

                    <div className={`contact-av${c.precisaFollowUp ? ' attention' : ''}`}>{initials(c.nome)}</div>

                    <div style={{ minWidth: 0 }}>

                      <div style={{ fontSize: 12, fontWeight: 500, display: 'flex', alignItems: 'center', gap: 8 }}>

                        <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{c.nome}</span>

                        {c.precisaFollowUp ? <span className="pill-attention">Novo</span> : null}

                      </div>

                      <div style={{ fontSize: 10, color: 'var(--vesk-muted)' }}>{c.email}</div>

                    </div>

                  </div>

                </td>

                <td style={{ color: 'var(--vesk-muted)' }}>{c.telefone}</td>

                <td>
                  {c.site?.trim() ? (
                    <a
                      href={c.site.startsWith('http') ? c.site : `https://${c.site}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="scrape-site-link"
                    >
                      {c.site.replace(/^https?:\/\//, '').slice(0, 36)}
                      {c.site.length > 40 ? '…' : ''}
                    </a>
                  ) : (
                    '—'
                  )}
                </td>

                <td style={{ color: 'var(--vesk-muted)' }}>{getCompanyName(c.empresaId)}</td>

                <td>

                  <span className="pill-stage">{c.etapa}</span>

                </td>

                <td style={{ color: 'var(--vesk-muted)' }}>{contactOrigin(c.ultimaInteracao)}</td>

                <td>

                  <div className="crm-row-actions">

                    <button type="button" className="crm-action-btn" onClick={() => openEdit(c.id)} aria-label={`Editar ${c.nome}`}>

                      <i className="ti ti-pencil" aria-hidden="true" />

                      Editar

                    </button>

                    <button
                      type="button"
                      className="crm-action-btn crm-action-btn-danger"
                      onClick={() => void handleDelete(c.id)}
                      aria-label={`Excluir ${c.nome}`}
                    >
                      <i className="ti ti-trash" aria-hidden="true" />
                      Excluir
                    </button>

                  </div>

                </td>

              </tr>

            ))}

            {filtered.length === 0 ? (

              <tr>

                <td colSpan={6} style={{ color: 'var(--vesk-muted)', padding: 14 }}>

                  Nenhum contato encontrado.

                </td>

              </tr>

            ) : null}

          </tbody>

        </table>

      </div>



      <Modal

        open={isCreateOpen}

        title="Novo contato"

        description="Cadastre o contato e escolha o funil e a etapa em que ele entrará automaticamente."

        onClose={() => setIsCreateOpen(false)}

      >

        <form className="crm-form" onSubmit={createContact}>

          <div className="crm-field" style={{ gridColumn: '1 / -1' }}>

            <label htmlFor="c_nome">Nome</label>

            <input id="c_nome" value={form.nome} onChange={(e) => setForm((p) => ({ ...p, nome: e.target.value }))} required />

          </div>

          <div className="crm-field">

            <label htmlFor="c_email">E-mail</label>

            <input

              id="c_email"

              type="email"

              value={form.email}

              onChange={(e) => setForm((p) => ({ ...p, email: e.target.value }))}

              required

            />

          </div>

          <div className="crm-field">

            <label htmlFor="c_tel">Telefone</label>

            <input id="c_tel" value={form.telefone} onChange={(e) => setForm((p) => ({ ...p, telefone: e.target.value }))} />

          </div>

          <div className="crm-field" style={{ gridColumn: '1 / -1' }}>

            <label htmlFor="c_site">Site</label>

            <input

              id="c_site"

              type="text"

              placeholder="https://exemplo.com.br"

              value={form.site}

              onChange={(e) => setForm((p) => ({ ...p, site: e.target.value }))}

            />

          </div>

          <div className="crm-field" style={{ gridColumn: '1 / -1' }}>

            <label htmlFor="c_emp">Empresa</label>

            <select

              id="c_emp"

              value={form.empresaId}

              onChange={(e) => setForm((p) => ({ ...p, empresaId: e.target.value }))}

            >

              <option value="">— Selecione —</option>

              {companies.map((co) => (

                <option key={co.id} value={co.id}>

                  {co.nome}

                </option>

              ))}

            </select>

          </div>

          <div className="crm-field">

            <label htmlFor="c_tipo">Tipo</label>

            <select id="c_tipo" value={form.tipo} onChange={(e) => setForm((p) => ({ ...p, tipo: e.target.value as ContactType }))}>

              <option value="Lead">Lead</option>

              <option value="Prospect">Prospect</option>

              <option value="Cliente">Cliente</option>

            </select>

          </div>



          <div className="crm-field">

                <label htmlFor="c_pipeline">Funil</label>

                <select

                  id="c_pipeline"

                  value={form.pipelineId}

                  onChange={(e) => setForm((p) => ({ ...p, pipelineId: e.target.value, stageKey: '' }))}

                  required

                >

                  <option value="">— Selecione —</option>

                  {pipelines.map((pl) => (

                    <option key={pl.id} value={pl.id}>

                      {pl.nome}

                    </option>

                  ))}

                </select>

              </div>

              <div className="crm-field">

                <label htmlFor="c_stage">Etapa do funil</label>

                <select

                  id="c_stage"

                  value={form.stageKey}

                  onChange={(e) => {

                    const key = e.target.value;

                    const st = sortedFormStages.find((s) => s.stageKey === key);

                    setForm((p) => ({

                      ...p,

                      stageKey: key,

                      etapa: st ? stageToContactEtapa(st.stageKey, st.titulo) : p.etapa,

                    }));

                  }}

                  required

                  disabled={sortedFormStages.length === 0}

                >

                  {sortedFormStages.length === 0 ? (

                    <option value="">Carregando etapas…</option>

                  ) : (

                    sortedFormStages.map((s) => (

                      <option key={s.stageKey} value={s.stageKey}>

                        {s.titulo}

                      </option>

                    ))

                  )}

                </select>

              </div>



          <div className="crm-form-actions" style={{ gridColumn: '1 / -1' }}>

            <button type="button" className="crm-btn-secondary" onClick={() => setIsCreateOpen(false)}>

              Cancelar

            </button>

            <button

              type="submit"

              className="crm-btn-primary"

              style={{ marginLeft: 'auto' }}

              disabled={!form.pipelineId || !form.stageKey}

            >

              Salvar contato

            </button>

          </div>

        </form>

      </Modal>



      <Modal

        open={isEditOpen}

        title="Editar contato"

        description="Atualize as informações do contato."

        onClose={() => setIsEditOpen(false)}

      >

        <form className="crm-form" onSubmit={saveEdit}>

          <div className="crm-field" style={{ gridColumn: '1 / -1' }}>

            <label htmlFor="ec_nome">Nome</label>

            <input id="ec_nome" value={form.nome} onChange={(e) => setForm((p) => ({ ...p, nome: e.target.value }))} required />

          </div>

          <div className="crm-field">

            <label htmlFor="ec_email">E-mail</label>

            <input

              id="ec_email"

              type="email"

              value={form.email}

              onChange={(e) => setForm((p) => ({ ...p, email: e.target.value }))}

              required

            />

          </div>

          <div className="crm-field">

            <label htmlFor="ec_tel">Telefone</label>

            <input id="ec_tel" value={form.telefone} onChange={(e) => setForm((p) => ({ ...p, telefone: e.target.value }))} />

          </div>

          <div className="crm-field" style={{ gridColumn: '1 / -1' }}>

            <label htmlFor="ec_site">Site</label>

            <input

              id="ec_site"

              type="text"

              placeholder="https://exemplo.com.br"

              value={form.site}

              onChange={(e) => setForm((p) => ({ ...p, site: e.target.value }))}

            />

          </div>

          <div className="crm-field" style={{ gridColumn: '1 / -1' }}>

            <label htmlFor="ec_emp">Empresa</label>

            <select id="ec_emp" value={form.empresaId} onChange={(e) => setForm((p) => ({ ...p, empresaId: e.target.value }))}>

              <option value="">— Selecione —</option>

              {companies.map((co) => (

                <option key={co.id} value={co.id}>

                  {co.nome}

                </option>

              ))}

            </select>

          </div>

          <div className="crm-field">

            <label htmlFor="ec_tipo">Tipo</label>

            <select id="ec_tipo" value={form.tipo} onChange={(e) => setForm((p) => ({ ...p, tipo: e.target.value as ContactType }))}>

              <option value="Lead">Lead</option>

              <option value="Prospect">Prospect</option>

              <option value="Cliente">Cliente</option>

            </select>

          </div>

          <div className="crm-field">

            <label htmlFor="ec_etapa">Etapa (lista)</label>

            <select id="ec_etapa" value={form.etapa} onChange={(e) => setForm((p) => ({ ...p, etapa: e.target.value as ContactStage }))}>

              <option value="Prospecção">Prospecção</option>

              <option value="Qualificação">Qualificação</option>

              <option value="Proposta">Proposta</option>

              <option value="Negociação">Negociação</option>

              <option value="Fechado">Fechado</option>

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



export default Contatos;


