import { useEffect, useMemo, useState } from 'react';
import CrmLayout from '../components/crm/CrmLayout';
import Modal from '../components/crm/Modal';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useCrmData, type StageKey } from '../contexts/CrmDataContext';

const Pipeline = () => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const {
    deals,
    companies,
    pipelines,
    stages,
    activePipelineId,
    setActivePipelineId,
    addPipeline,
    updatePipeline,
    deletePipeline,
    addStage,
    updateStage,
    deleteStage,
    addDeal,
    updateDeal,
    deleteDeal,
    updateDealStage,
    getCompanyName,
  } = useCrmData();
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [isEditDealOpen, setIsEditDealOpen] = useState(false);
  const [editingDealId, setEditingDealId] = useState<string | null>(null);
  const [isStagesOpen, setIsStagesOpen] = useState(false);
  const [isNewPipelineOpen, setIsNewPipelineOpen] = useState(false);
  const [isRenamePipelineOpen, setIsRenamePipelineOpen] = useState(false);
  const [pipelineName, setPipelineName] = useState('');
  const [renamePipelineName, setRenamePipelineName] = useState('');
  const [newStage, setNewStage] = useState({ titulo: '', cor: '#7a7880' });
  const [form, setForm] = useState({
    titulo: '',
    empresaId: '',
    valor: '',
    prob: '20%',
    stageKey: 'prospeccao' as StageKey,
  });

  useEffect(() => {
    if (searchParams.get('newDeal') === '1') {
      openCreate();
      navigate('/admin/pipeline', { replace: true });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const stagesForActive = useMemo(() => stages.filter((s) => s.pipelineId === activePipelineId).sort((a, b) => a.pos - b.pos), [activePipelineId, stages]);
  const dealsForActive = useMemo(() => deals.filter((d) => (activePipelineId ? d.pipelineId === activePipelineId : true)), [activePipelineId, deals]);

  const totalOpen = useMemo(() => {
    const open = dealsForActive.filter((d) => d.stageKey !== 'fechado');
    return `${open.length} negócios em aberto`;
  }, [dealsForActive]);

  const onDropStage = (stageKey: StageKey) => {
    if (!draggingId) return;
    updateDealStage(draggingId, stageKey);
    setDraggingId(null);
  };

  const resetForm = () =>
    setForm({
      titulo: '',
      empresaId: '',
      valor: '',
      prob: '20%',
      stageKey: stagesForActive[0]?.stageKey ?? 'prospeccao',
    });

  const openCreate = () => {
    resetForm();
    setIsCreateOpen(true);
  };

  const createDeal = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await addDeal({
        pipelineId: activePipelineId || undefined,
        titulo: form.titulo.trim(),
        empresaId: form.empresaId || undefined,
        valor: form.valor.trim() || 'R$0',
        prob: form.prob.trim() || '20%',
        stageKey: form.stageKey,
      });
      setIsCreateOpen(false);
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : 'Não foi possível salvar o negócio.');
    }
  };

  const openEditDeal = (dealId: string) => {
    const d = deals.find((x) => x.id === dealId);
    if (!d) return;
    setEditingDealId(dealId);
    setForm({
      titulo: d.titulo,
      empresaId: d.empresaId ?? '',
      valor: d.valor,
      prob: d.prob,
      stageKey: d.stageKey,
    });
    setIsEditDealOpen(true);
  };

  const saveEditDeal = (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingDealId) return;
    const current = deals.find((x) => x.id === editingDealId);
    if (!current) return;
    updateDeal(editingDealId, {
      pipelineId: current.pipelineId ?? activePipelineId ?? undefined,
      titulo: form.titulo.trim(),
      empresaId: form.empresaId || undefined,
      valor: form.valor.trim() || 'R$0',
      prob: form.prob.trim() || '20%',
      stageKey: form.stageKey,
    });
    setIsEditDealOpen(false);
    setEditingDealId(null);
  };

  const handleDeleteDeal = async (dealId: string) => {
    const d = deals.find((x) => x.id === dealId);
    if (!d) return;
    if (!window.confirm(`Excluir o negócio "${d.titulo}"?`)) return;
    try {
      await deleteDeal(dealId);
      if (editingDealId === dealId) {
        setIsEditDealOpen(false);
        setEditingDealId(null);
      }
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : 'Não foi possível excluir o negócio.');
    }
  };

  const openStages = () => setIsStagesOpen(true);

  const createPipeline = (e: React.FormEvent) => {
    e.preventDefault();
    if (!pipelineName.trim()) return;
    addPipeline({ nome: pipelineName.trim() });
    setPipelineName('');
    setIsNewPipelineOpen(false);
  };

  const createStage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activePipelineId) return;
    if (!newStage.titulo.trim()) return;
    try {
      await addStage(activePipelineId, {
        stageKey: newStage.titulo,
        titulo: newStage.titulo.trim(),
        cor: newStage.cor,
      });
      setNewStage({ titulo: '', cor: '#7a7880' });
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : 'Não foi possível salvar a etapa.');
    }
  };

  const moveStage = (stageId: string, dir: -1 | 1) => {
    const list = stagesForActive;
    const idx = list.findIndex((s) => s.id === stageId);
    const next = idx + dir;
    if (idx < 0 || next < 0 || next >= list.length) return;
    const a = list[idx];
    const b = list[next];
    updateStage(a.pipelineId, a.id, { ...a, pos: b.pos });
    updateStage(b.pipelineId, b.id, { ...b, pos: a.pos });
  };

  const activePipeline = pipelines.find((p) => p.id === activePipelineId);
  const canDeletePipeline = pipelines.length > 1 && Boolean(activePipelineId);
  const canDeleteStage = stagesForActive.length > 1;

  const openRenamePipeline = () => {
    if (!activePipeline) return;
    setRenamePipelineName(activePipeline.nome);
    setIsRenamePipelineOpen(true);
  };

  const saveRenamePipeline = (e: React.FormEvent) => {
    e.preventDefault();
    if (!activePipelineId || !activePipeline) return;
    const nome = renamePipelineName.trim();
    if (!nome) return;
    updatePipeline(activePipelineId, { nome, isDefault: activePipeline.isDefault });
    setIsRenamePipelineOpen(false);
  };

  const handleDeletePipeline = async () => {
    if (!activePipelineId || !activePipeline) return;
    const dealCount = dealsForActive.length;
    const msg =
      dealCount > 0
        ? `Excluir o funil "${activePipeline.nome}"? ${dealCount} negócio(s) deste funil serão removidos permanentemente.`
        : `Excluir o funil "${activePipeline.nome}"?`;
    if (!window.confirm(msg)) return;
    try {
      await deletePipeline(activePipelineId);
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : 'Não foi possível excluir o funil.');
    }
  };

  const handleDeleteStage = async (stageId: string) => {
    if (!activePipelineId || !canDeleteStage) return;
    const stage = stagesForActive.find((s) => s.id === stageId);
    if (!stage) return;
    const fallback = stagesForActive.find((s) => s.id !== stageId);
    const inStage = dealsForActive.filter((d) => d.stageKey === stage.stageKey).length;
    const msg =
      inStage > 0 && fallback
        ? `Excluir a etapa "${stage.titulo}"? ${inStage} negócio(s) serão movidos para "${fallback.titulo}".`
        : `Excluir a etapa "${stage.titulo}"?`;
    if (!window.confirm(msg)) return;
    try {
      await deleteStage(activePipelineId, stageId);
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : 'Não foi possível excluir a etapa.');
    }
  };

  return (
    <CrmLayout>
      <div className="crm-page-header">
        <div>
          <div className="crm-page-title">
            Pipeline <span>(kanban)</span>
          </div>
          <div style={{ fontSize: 12, color: 'var(--vesk-muted)', marginTop: 2 }}>{totalOpen} · arraste cards entre as etapas</div>
        </div>
        <div className="crm-page-actions">
          <select
            value={activePipelineId ?? ''}
            onChange={(e) => setActivePipelineId(e.target.value || null)}
            className="crm-btn-secondary"
            style={{ padding: '8px 10px' }}
            aria-label="Selecionar funil"
          >
            {pipelines.map((p) => (
              <option key={p.id} value={p.id}>
                {p.nome}
              </option>
            ))}
          </select>

          <button
            type="button"
            className="crm-btn-secondary"
            onClick={openRenamePipeline}
            disabled={!activePipelineId}
            title="Editar nome do funil"
            aria-label="Editar nome do funil"
          >
            <i className="ti ti-pencil" style={{ fontSize: 13 }} aria-hidden="true" />
            Renomear funil
          </button>

          <button type="button" className="crm-btn-secondary" onClick={() => setIsNewPipelineOpen(true)}>
            <i className="ti ti-plus" style={{ fontSize: 13 }} aria-hidden="true" />
            Novo funil
          </button>

          <button
            type="button"
            className="crm-btn-secondary crm-btn-danger"
            onClick={() => void handleDeletePipeline()}
            disabled={!canDeletePipeline}
            title={canDeletePipeline ? 'Excluir funil selecionado' : 'É necessário manter pelo menos um funil'}
          >
            <i className="ti ti-trash" style={{ fontSize: 13 }} aria-hidden="true" />
            Excluir funil
          </button>

          <button type="button" className="crm-btn-secondary" onClick={openStages} disabled={!activePipelineId}>
            <i className="ti ti-adjustments" style={{ fontSize: 13 }} aria-hidden="true" />
            Configurar etapas
          </button>
          <button type="button" className="crm-btn-primary" onClick={openCreate}>
            <i className="ti ti-plus" style={{ fontSize: 13 }} aria-hidden="true" />
            Novo negócio
          </button>
        </div>
      </div>

      <div className="kanban-board" aria-label="Funil de vendas em kanban">
        {stagesForActive.map((s) => {
          const items = dealsForActive.filter((d) => d.stageKey === s.stageKey);
          return (
            <section
              key={s.stageKey}
              className="kanban-col"
              onDragOver={(e) => e.preventDefault()}
              onDrop={() => onDropStage(s.stageKey)}
              aria-label={`Etapa ${s.titulo}`}
            >
              <div className="kanban-col-head">
                <span className="pipeline-dot" style={{ background: s.cor }} />
                <span>{s.titulo}</span>
                <span className="kanban-count">{items.length}</span>
              </div>

              <div className="kanban-col-body">
                {items.map((d) => (
                  <div
                    key={d.id}
                    className={`pipeline-deal kanban-card${draggingId === d.id ? ' dragging' : ''}`}
                    draggable
                    onDragStart={() => setDraggingId(d.id)}
                    onDragEnd={() => setDraggingId(null)}
                    role="listitem"
                    aria-label={`${d.titulo} — ${getCompanyName(d.empresaId)}`}
                  >
                    <div className="pipeline-deal-top">
                      <div className="pipeline-deal-name">{d.titulo}</div>
                      <div className="pipeline-deal-actions">
                        <button
                          type="button"
                          className="pipeline-deal-action"
                          onMouseDown={(e) => e.stopPropagation()}
                          onClick={(e) => {
                            e.stopPropagation();
                            openEditDeal(d.id);
                          }}
                          aria-label={`Editar ${d.titulo}`}
                          title="Editar"
                        >
                          <i className="ti ti-pencil" aria-hidden="true" />
                        </button>
                        <button
                          type="button"
                          className="pipeline-deal-action danger"
                          onMouseDown={(e) => e.stopPropagation()}
                          onClick={(e) => {
                            e.stopPropagation();
                            void handleDeleteDeal(d.id);
                          }}
                          aria-label={`Excluir ${d.titulo}`}
                          title="Excluir"
                        >
                          <i className="ti ti-trash" aria-hidden="true" />
                        </button>
                      </div>
                    </div>
                    <div className="pipeline-deal-co">{getCompanyName(d.empresaId)}</div>
                    <div className="pipeline-deal-bottom">
                      <span className="pipeline-deal-val">{d.valor}</span>
                      <span className="pipeline-deal-prob">{d.prob}</span>
                    </div>
                  </div>
                ))}
                {items.length === 0 ? <div className="kanban-empty">Solte um card aqui</div> : null}
              </div>
            </section>
          );
        })}
      </div>

      <Modal
        open={isCreateOpen}
        title="Novo negócio"
        description="Crie uma oportunidade e escolha a etapa inicial do funil."
        onClose={() => setIsCreateOpen(false)}
      >
        <form className="crm-form" onSubmit={createDeal}>
          <div className="crm-field" style={{ gridColumn: '1 / -1' }}>
            <label htmlFor="d_titulo">Título</label>
            <input
              id="d_titulo"
              value={form.titulo}
              onChange={(e) => setForm((p) => ({ ...p, titulo: e.target.value }))}
              placeholder="Ex: Implantação CRM"
              required
            />
          </div>
          <div className="crm-field">
            <label htmlFor="d_empresa">Empresa</label>
            <select id="d_empresa" value={form.empresaId} onChange={(e) => setForm((p) => ({ ...p, empresaId: e.target.value }))} required>
              <option value="">— Selecione —</option>
              {companies.map((co) => (
                <option key={co.id} value={co.id}>
                  {co.nome}
                </option>
              ))}
            </select>
          </div>
          <div className="crm-field">
            <label htmlFor="d_valor">Valor</label>
            <input id="d_valor" value={form.valor} onChange={(e) => setForm((p) => ({ ...p, valor: e.target.value }))} placeholder="Ex: R$45k" />
          </div>
          <div className="crm-field">
            <label htmlFor="d_prob">Probabilidade</label>
            <input id="d_prob" value={form.prob} onChange={(e) => setForm((p) => ({ ...p, prob: e.target.value }))} placeholder="Ex: 40%" />
          </div>
          <div className="crm-field">
            <label htmlFor="d_stage">Etapa</label>
            <select id="d_stage" value={form.stageKey} onChange={(e) => setForm((p) => ({ ...p, stageKey: e.target.value }))}>
              {stagesForActive.map((s) => (
                <option key={s.stageKey} value={s.stageKey}>
                  {s.titulo}
                </option>
              ))}
            </select>
          </div>

          <div className="crm-form-actions" style={{ gridColumn: '1 / -1' }}>
            <button type="button" className="crm-btn-secondary" onClick={() => setIsCreateOpen(false)}>
              Cancelar
            </button>
            <button type="submit" className="crm-btn-primary" style={{ marginLeft: 'auto' }}>
              Criar negócio
            </button>
          </div>
        </form>
      </Modal>

      <Modal
        open={isEditDealOpen}
        title="Editar negócio"
        description="Atualize os dados do negócio no funil."
        onClose={() => {
          setIsEditDealOpen(false);
          setEditingDealId(null);
        }}
      >
        <form className="crm-form" onSubmit={saveEditDeal}>
          <div className="crm-field" style={{ gridColumn: '1 / -1' }}>
            <label htmlFor="ed_titulo">Título</label>
            <input
              id="ed_titulo"
              value={form.titulo}
              onChange={(e) => setForm((p) => ({ ...p, titulo: e.target.value }))}
              required
            />
          </div>
          <div className="crm-field">
            <label htmlFor="ed_empresa">Empresa</label>
            <select id="ed_empresa" value={form.empresaId} onChange={(e) => setForm((p) => ({ ...p, empresaId: e.target.value }))}>
              <option value="">— Selecione —</option>
              {companies.map((co) => (
                <option key={co.id} value={co.id}>
                  {co.nome}
                </option>
              ))}
            </select>
          </div>
          <div className="crm-field">
            <label htmlFor="ed_valor">Valor</label>
            <input id="ed_valor" value={form.valor} onChange={(e) => setForm((p) => ({ ...p, valor: e.target.value }))} />
          </div>
          <div className="crm-field">
            <label htmlFor="ed_prob">Probabilidade</label>
            <input id="ed_prob" value={form.prob} onChange={(e) => setForm((p) => ({ ...p, prob: e.target.value }))} />
          </div>
          <div className="crm-field">
            <label htmlFor="ed_stage">Etapa</label>
            <select id="ed_stage" value={form.stageKey} onChange={(e) => setForm((p) => ({ ...p, stageKey: e.target.value }))}>
              {stagesForActive.map((s) => (
                <option key={s.stageKey} value={s.stageKey}>
                  {s.titulo}
                </option>
              ))}
            </select>
          </div>
          <div className="crm-form-actions" style={{ gridColumn: '1 / -1' }}>
            <button
              type="button"
              className="crm-btn-secondary crm-btn-danger"
              onClick={() => editingDealId && void handleDeleteDeal(editingDealId)}
            >
              Excluir
            </button>
            <button type="button" className="crm-btn-secondary" onClick={() => setIsEditDealOpen(false)}>
              Cancelar
            </button>
            <button type="submit" className="crm-btn-primary" style={{ marginLeft: 'auto' }}>
              Salvar
            </button>
          </div>
        </form>
      </Modal>

      <Modal
        open={isStagesOpen}
        title="Configurar etapas"
        description="Crie, renomeie e reordene as colunas do funil."
        onClose={() => setIsStagesOpen(false)}
      >
        <div className="crm-card" style={{ padding: 12, background: 'transparent', border: 'none' }}>
          {stagesForActive.length === 0 ? <div className="kanban-empty">Este funil ainda não tem etapas.</div> : null}
          {stagesForActive.map((s) => (
            <div key={s.id} className="agenda-item" style={{ alignItems: 'center' }}>
              <span className="pipeline-dot" style={{ background: s.cor }} />
              <input
                value={s.titulo}
                onChange={(e) => updateStage(s.pipelineId, s.id, { ...s, titulo: e.target.value })}
                className="crm-btn-secondary"
                style={{ width: '100%' }}
              />
              <input type="color" value={s.cor} onChange={(e) => updateStage(s.pipelineId, s.id, { ...s, cor: e.target.value })} />
              <button type="button" className="crm-action-btn" onClick={() => moveStage(s.id, -1)} aria-label="Mover para cima">
                ↑
              </button>
              <button type="button" className="crm-action-btn" onClick={() => moveStage(s.id, 1)} aria-label="Mover para baixo">
                ↓
              </button>
              <button
                type="button"
                className="crm-action-btn crm-action-btn-danger"
                onClick={() => void handleDeleteStage(s.id)}
                disabled={!canDeleteStage}
                aria-label={`Excluir etapa ${s.titulo}`}
                title={canDeleteStage ? 'Excluir etapa' : 'O funil precisa ter pelo menos uma etapa'}
              >
                <i className="ti ti-trash" style={{ fontSize: 14 }} aria-hidden="true" />
              </button>
            </div>
          ))}

          <form className="crm-form" onSubmit={createStage} style={{ marginTop: 10 }}>
            <div className="crm-field" style={{ gridColumn: '1 / -1' }}>
              <label htmlFor="ns_titulo">Nova etapa</label>
              <input id="ns_titulo" value={newStage.titulo} onChange={(e) => setNewStage((p) => ({ ...p, titulo: e.target.value }))} />
            </div>
            <div className="crm-field">
              <label htmlFor="ns_cor">Cor</label>
              <input id="ns_cor" type="color" value={newStage.cor} onChange={(e) => setNewStage((p) => ({ ...p, cor: e.target.value }))} />
            </div>
            <div className="crm-form-actions" style={{ gridColumn: '1 / -1' }}>
              <button type="submit" className="crm-btn-primary" style={{ marginLeft: 'auto' }}>
                Adicionar etapa
              </button>
            </div>
          </form>
        </div>
      </Modal>

      <Modal
        open={isRenamePipelineOpen}
        title="Renomear funil"
        description="Altere o nome do funil selecionado."
        onClose={() => setIsRenamePipelineOpen(false)}
      >
        <form className="crm-form" onSubmit={saveRenamePipeline}>
          <div className="crm-field" style={{ gridColumn: '1 / -1' }}>
            <label htmlFor="pl_rename">Nome do funil</label>
            <input
              id="pl_rename"
              value={renamePipelineName}
              onChange={(e) => setRenamePipelineName(e.target.value)}
              required
              autoFocus
            />
          </div>
          <div className="crm-form-actions" style={{ gridColumn: '1 / -1' }}>
            <button type="button" className="crm-btn-secondary" onClick={() => setIsRenamePipelineOpen(false)}>
              Cancelar
            </button>
            <button type="submit" className="crm-btn-primary" style={{ marginLeft: 'auto' }}>
              Salvar
            </button>
          </div>
        </form>
      </Modal>

      <Modal open={isNewPipelineOpen} title="Novo funil" description="Crie um novo funil de vendas." onClose={() => setIsNewPipelineOpen(false)}>
        <form className="crm-form" onSubmit={createPipeline}>
          <div className="crm-field" style={{ gridColumn: '1 / -1' }}>
            <label htmlFor="pl_nome">Nome do funil</label>
            <input id="pl_nome" value={pipelineName} onChange={(e) => setPipelineName(e.target.value)} required />
          </div>
          <div className="crm-form-actions" style={{ gridColumn: '1 / -1' }}>
            <button type="button" className="crm-btn-secondary" onClick={() => setIsNewPipelineOpen(false)}>
              Cancelar
            </button>
            <button type="submit" className="crm-btn-primary" style={{ marginLeft: 'auto' }}>
              Criar funil
            </button>
          </div>
        </form>
      </Modal>
    </CrmLayout>
  );
};

export default Pipeline;

