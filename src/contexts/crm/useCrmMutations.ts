import type { Dispatch, SetStateAction } from 'react';
import { api } from '../../services/api';
import { activityToInput, genId, normalizeActivity } from './mappers';
import type {
  Activity,
  ActivityStatus,
  Company,
  Contact,
  CrmDataContextType,
  Deal,
  EmailItem,
  GoogleOutcome,
  Pipeline,
  PipelineStage,
  Proposal,
} from './types';

type Options = {
  /** Lista atual, para desfazer mudanças otimistas (status e remarcação) se o servidor recusar. */
  activities: Activity[];
  activePipelineId: string | null;
  setActivePipelineId: (id: string | null | ((prev: string | null) => string | null)) => void;
  stages: PipelineStage[];
  setPipelines: Dispatch<SetStateAction<Pipeline[]>>;
  setStages: Dispatch<SetStateAction<PipelineStage[]>>;
  setCompanies: Dispatch<SetStateAction<Company[]>>;
  setContacts: Dispatch<SetStateAction<Contact[]>>;
  setDeals: Dispatch<SetStateAction<Deal[]>>;
  setActivities: Dispatch<SetStateAction<Activity[]>>;
  setEmails: Dispatch<SetStateAction<EmailItem[]>>;
  setProposals: Dispatch<SetStateAction<Proposal[]>>;
};

/**
 * Criar, editar e excluir registros do CRM. As telas veem a mudança na hora (atualização otimista) e o
 * servidor confirma em seguida; em caso de erro o registro temporário é desfeito.
 */
export function useCrmMutations({
  activities,
  activePipelineId,
  setActivePipelineId,
  stages,
  setPipelines,
  setStages,
  setCompanies,
  setContacts,
  setDeals,
  setActivities,
  setEmails,
  setProposals,
}: Options) {
  const addCompany: CrmDataContextType['addCompany'] = (company) => {
    const tempId = company.id ?? genId('e');
    const optimistic: Company = { ...company, id: tempId };
    setCompanies((prev) => [optimistic, ...prev]);

    void (async () => {
      const result = await api.post<{ id: number }>('/crm/companies', company);
      const id = String(result.id);
      setCompanies((prev) => prev.map((c) => (c.id === tempId ? { ...c, id } : c)));
    })();

    return tempId;
  };

  const addContact: CrmDataContextType['addContact'] = async (contact) => {
    const { pipelineId, stageKey, ...contactData } = contact;
    if (!stageKey) throw new Error('Selecione a etapa do funil.');

    const tempId = contact.id ?? genId('c');
    const dealTempId = genId('d');
    const resolvedPipeline = pipelineId || activePipelineId || undefined;

    const optimistic: Contact = {
      ...contactData,
      id: tempId,
      ultimaInteracao: contact.ultimaInteracao ?? 'Criado agora',
    };
    setContacts((prev) => [optimistic, ...prev]);

    const optimisticDeal: Deal = {
      id: dealTempId,
      pipelineId: resolvedPipeline,
      stageKey,
      empresaId: contactData.empresaId,
      titulo: contactData.nome,
      valor: 'R$0',
      prob: '20%',
    };
    setDeals((prev) => [optimisticDeal, ...prev]);

    try {
      const result = await api.post<{ id: number; dealId?: number; pipelineId?: number; stageKey?: string }>(
        '/crm/contacts',
        { ...contact, pipelineId: resolvedPipeline, stageKey }
      );
      const id = String(result.id);
      setContacts((prev) => prev.map((c) => (c.id === tempId ? { ...c, id } : c)));

      if (result.dealId) {
        const dealId = String(result.dealId);
        const pipeId = result.pipelineId != null ? String(result.pipelineId) : resolvedPipeline;
        const key = result.stageKey ?? stageKey;
        setDeals((prev) =>
          prev.map((d) =>
            d.id === dealTempId
              ? { ...d, id: dealId, pipelineId: pipeId, stageKey: key, contatoId: id }
              : d
          )
        );
        if (pipeId) {
          setActivePipelineId((prev) => (prev === pipeId ? prev : pipeId));
        }
      } else {
        setDeals((prev) => prev.filter((d) => d.id !== dealTempId));
        throw new Error('Contato salvo, mas o negócio não foi criado no funil.');
      }
      return id;
    } catch (err) {
      setContacts((prev) => prev.filter((c) => c.id !== tempId));
      setDeals((prev) => prev.filter((d) => d.id !== dealTempId));
      throw err;
    }
  };

  const addDeal: CrmDataContextType['addDeal'] = async (deal) => {
    const pipelineId = deal.pipelineId || activePipelineId || undefined;
    if (!pipelineId) throw new Error('Selecione um funil.');
    if (!deal.stageKey) throw new Error('Selecione uma etapa.');

    const tempId = deal.id ?? genId('d');
    const optimistic: Deal = { ...deal, id: tempId, pipelineId };
    setDeals((prev) => [optimistic, ...prev]);

    try {
      const result = await api.post<{ id: number; pipelineId?: number; stageKey?: string }>('/crm/deals', {
        ...deal,
        pipelineId,
      });
      const id = String(result.id);
      const pipeId = result.pipelineId != null ? String(result.pipelineId) : pipelineId;
      const key = result.stageKey ?? deal.stageKey;
      setDeals((prev) =>
        prev.map((d) => (d.id === tempId ? { ...d, id, pipelineId: pipeId, stageKey: key } : d))
      );
      return id;
    } catch (err) {
      setDeals((prev) => prev.filter((d) => d.id !== tempId));
      throw err;
    }
  };

  const addActivity: CrmDataContextType['addActivity'] = async (input) => {
    const result = await api.post<{ id: number; activity: Activity | null; google?: GoogleOutcome }>('/crm/activities', input);
    if (!result.activity) throw new Error('Não foi possível criar a atividade.');
    const created = normalizeActivity(result.activity);
    setActivities((prev) => [created, ...prev]);
    return { ...created, google: result.google };
  };

  const addEmail: CrmDataContextType['addEmail'] = (email) => {
    const tempId = email.id ?? genId('m');
    const optimistic: EmailItem = { ...email, id: tempId };
    setEmails((prev) => [optimistic, ...prev]);

    void (async () => {
      const result = await api.post<{ id: number }>('/crm/emails', email);
      const id = String(result.id);
      setEmails((prev) => prev.map((m) => (m.id === tempId ? { ...m, id } : m)));
    })();

    return tempId;
  };

  const updateEmail: CrmDataContextType['updateEmail'] = (id, patch) => {
    setEmails((prev) => prev.map((m) => (m.id === id ? { ...m, ...patch } : m)));
    const numericId = Number(id);
    if (!Number.isFinite(numericId)) return;
    void api.put(`/crm/emails/${numericId}`, patch);
  };

  const deleteEmail: CrmDataContextType['deleteEmail'] = async (id) => {
    const numericId = Number(id);
    if (!Number.isFinite(numericId)) throw new Error('ID inválido');
    setEmails((prev) => prev.filter((m) => m.id !== id));
    await api.delete(`/crm/emails/${numericId}`);
  };

  const addProposal: CrmDataContextType['addProposal'] = (proposal) => {
    const tempId = proposal.id ?? genId('p');
    const optimistic: Proposal = { ...proposal, id: tempId };
    setProposals((prev) => [optimistic, ...prev]);

    void (async () => {
      const result = await api.post<{ id: number }>('/crm/proposals', proposal);
      const id = String(result.id);
      setProposals((prev) => prev.map((p) => (p.id === tempId ? { ...p, id } : p)));
    })();

    return tempId;
  };

  const clearContactNovoForDeal = (deal: Deal) => {
    setContacts((prev) =>
      prev.map((c) => {
        const linked =
          (deal.contatoId && c.id === deal.contatoId) ||
          (!deal.contatoId && c.precisaFollowUp && c.nome === deal.titulo);
        return linked && c.precisaFollowUp ? { ...c, precisaFollowUp: false } : c;
      })
    );
  };

  const updateDealStage: CrmDataContextType['updateDealStage'] = (dealId, stageKey) => {
    setDeals((prev) => {
      const deal = prev.find((d) => d.id === dealId);
      if (deal && deal.stageKey !== stageKey) {
        clearContactNovoForDeal(deal);
      }
      return prev.map((d) => (d.id === dealId ? { ...d, stageKey } : d));
    });
    const numericId = Number(dealId);
    if (Number.isFinite(numericId)) {
      void api.put(`/crm/deals/${numericId}/stage`, { stageKey });
    }
  };

  const updateDeal: CrmDataContextType['updateDeal'] = (id, patch) => {
    setDeals((prev) => {
      const current = prev.find((d) => d.id === id);
      if (current && patch.stageKey && patch.stageKey !== current.stageKey) {
        clearContactNovoForDeal({ ...current, ...patch });
      }
      return prev.map((d) => (d.id === id ? { ...patch, id } : d));
    });
    const numericId = Number(id);
    if (Number.isFinite(numericId)) {
      void api.put(`/crm/deals/${numericId}`, {
        ...patch,
        empresaId: patch.empresaId ?? null,
        pipelineId: patch.pipelineId ?? null,
      });
    }
  };

  const deleteDeal: CrmDataContextType['deleteDeal'] = async (id) => {
    const numericId = Number(id);
    if (!Number.isFinite(numericId)) return;
    await api.delete(`/crm/deals/${numericId}`);
    setDeals((prev) => prev.filter((d) => d.id !== id));
    setProposals((prev) => prev.map((p) => (p.dealId === id ? { ...p, dealId: undefined } : p)));
  };

  const addPipeline: CrmDataContextType['addPipeline'] = (pipeline) => {
    const tempId = pipeline.id ?? genId('pl');
    const optimistic: Pipeline = { ...pipeline, id: tempId };
    setPipelines((prev) => [optimistic, ...prev]);

    void (async () => {
      const result = await api.post<{ id: number }>('/crm/pipelines', pipeline);
      const id = String(result.id);
      setPipelines((prev) => prev.map((p) => (p.id === tempId ? { ...p, id } : p)));
      setActivePipelineId(id);
    })();

    return tempId;
  };

  const updatePipeline: CrmDataContextType['updatePipeline'] = (id, patch) => {
    setPipelines((prev) => prev.map((p) => (p.id === id ? { ...patch, id } : p)));
    const numericId = Number(id);
    if (Number.isFinite(numericId)) void api.put(`/crm/pipelines/${numericId}`, patch);
  };

  const deletePipeline: CrmDataContextType['deletePipeline'] = async (id) => {
    const numericId = Number(id);
    if (!Number.isFinite(numericId)) return;
    await api.delete(`/crm/pipelines/${numericId}`);
    setPipelines((prev) => {
      const next = prev.filter((p) => p.id !== id);
      setActivePipelineId((active) => {
        if (active !== id) return active;
        return next.find((p) => p.isDefault)?.id ?? next[0]?.id ?? null;
      });
      return next;
    });
    setStages((prev) => prev.filter((s) => s.pipelineId !== id));
    setDeals((prev) => prev.filter((d) => d.pipelineId !== id));
  };

  const addStage: CrmDataContextType['addStage'] = async (pipelineId, stage) => {
    const numericPipelineId = Number(pipelineId);
    if (!Number.isFinite(numericPipelineId)) {
      throw new Error('Aguarde o funil ser salvo antes de adicionar etapas.');
    }

    const tempId = stage.id ?? genId('st');
    const optimistic: PipelineStage = {
      id: tempId,
      pipelineId,
      stageKey: stage.stageKey,
      titulo: stage.titulo,
      cor: stage.cor,
      pos: 9999,
    };
    setStages((prev) => [...prev, optimistic]);

    try {
      const result = await api.post<{ id: number; stageKey: string; pos: number }>(
        `/crm/pipelines/${numericPipelineId}/stages`,
        stage
      );
      const id = String(result.id);
      setStages((prev) =>
        prev.map((s) => (s.id === tempId ? { ...s, id, stageKey: result.stageKey, pos: result.pos } : s))
      );
      return id;
    } catch (err) {
      setStages((prev) => prev.filter((s) => s.id !== tempId));
      throw err;
    }
  };

  const updateStage: CrmDataContextType['updateStage'] = (pipelineId, stageId, patch) => {
    setStages((prev) => prev.map((s) => (s.id === stageId ? { ...patch, id: stageId, pipelineId } : s)));
    const numericPipelineId = Number(pipelineId);
    const numericStageId = Number(stageId);
    if (Number.isFinite(numericPipelineId) && Number.isFinite(numericStageId)) {
      void api.put(`/crm/pipelines/${numericPipelineId}/stages/${numericStageId}`, patch);
    }
  };

  const deleteStage: CrmDataContextType['deleteStage'] = async (pipelineId, stageId) => {
    const numericPipelineId = Number(pipelineId);
    const numericStageId = Number(stageId);
    if (!Number.isFinite(numericPipelineId) || !Number.isFinite(numericStageId)) return;

    const removed = stages.find((s) => s.id === stageId);
    const fallback = stages
      .filter((s) => s.pipelineId === pipelineId && s.id !== stageId)
      .sort((a, b) => a.pos - b.pos)[0];

    await api.delete(`/crm/pipelines/${numericPipelineId}/stages/${numericStageId}`);

    setStages((prev) => prev.filter((s) => s.id !== stageId));
    if (removed && fallback) {
      setDeals((prev) =>
        prev.map((d) =>
          d.pipelineId === pipelineId && d.stageKey === removed.stageKey ? { ...d, stageKey: fallback.stageKey } : d
        )
      );
    }
  };

  const updateCompany: CrmDataContextType['updateCompany'] = (id, patch) => {
    setCompanies((prev) => prev.map((c) => (c.id === id ? { ...patch, id } : c)));
    const numericId = Number(id);
    if (Number.isFinite(numericId)) {
      void api.put(`/crm/companies/${numericId}`, patch);
    }
  };

  const updateContact: CrmDataContextType['updateContact'] = (id, patch) => {
    setContacts((prev) => prev.map((c) => (c.id === id ? { ...patch, id } : c)));
    const numericId = Number(id);
    if (Number.isFinite(numericId)) {
      void api.put(`/crm/contacts/${numericId}`, {
        ...patch,
        empresaId: patch.empresaId ?? null,
      });
    }
  };

  const deleteContact: CrmDataContextType['deleteContact'] = async (id) => {
    const numericId = Number(id);
    if (!Number.isFinite(numericId)) return;
    await api.delete(`/crm/contacts/${numericId}`);
    setContacts((prev) => prev.filter((c) => c.id !== id));
    setActivities((prev) => prev.map((a) => (a.contatoId === id ? { ...a, contatoId: undefined } : a)));
    setEmails((prev) => prev.map((m) => (m.contatoId === id ? { ...m, contatoId: undefined } : m)));
    setProposals((prev) => prev.map((p) => (p.contatoId === id ? { ...p, contatoId: undefined } : p)));
  };

  const updateActivity: CrmDataContextType['updateActivity'] = async (id, input) => {
    const result = await api.put<{ activity: Activity; google?: GoogleOutcome }>(`/crm/activities/${Number(id)}`, input);
    const updated = normalizeActivity(result.activity);
    setActivities((prev) => prev.map((a) => (a.id === id ? updated : a)));
    return { ...updated, google: result.google };
  };

  const deleteActivity: CrmDataContextType['deleteActivity'] = async (id) => {
    await api.delete(`/crm/activities/${Number(id)}`);
    setActivities((prev) => prev.filter((a) => a.id !== id));
  };

  // Mudança na tela na hora; se o servidor recusar, volta ao que era e avisa quem chamou.
  const optimisticActivity = async (
    id: string,
    apply: (a: Activity) => Activity,
    save: () => Promise<{ activity: Activity }>
  ) => {
    const before = activities.find((a) => a.id === id);
    if (!before) return;
    setActivities((prev) => prev.map((a) => (a.id === id ? apply(a) : a)));
    try {
      const result = await save();
      const saved = normalizeActivity(result.activity);
      setActivities((prev) => prev.map((a) => (a.id === id ? saved : a)));
    } catch (err) {
      setActivities((prev) => prev.map((a) => (a.id === id ? before : a)));
      throw err;
    }
  };

  const setActivityStatus: CrmDataContextType['setActivityStatus'] = (id, status: ActivityStatus) =>
    optimisticActivity(
      id,
      (a) => ({ ...a, status, completedAt: status === 'Concluída' ? new Date().toISOString() : null }),
      () => api.patch<{ activity: Activity }>(`/crm/activities/${Number(id)}/status`, { status })
    );

  const rescheduleActivity: CrmDataContextType['rescheduleActivity'] = (id, startAt, endAt) => {
    const current = activities.find((a) => a.id === id);
    if (!current) return Promise.resolve();
    return optimisticActivity(
      id,
      (a) => ({ ...a, startAt, endAt }),
      () =>
        api.put<{ activity: Activity }>(`/crm/activities/${Number(id)}`, {
          ...activityToInput(current),
          startAt,
          endAt,
        })
    );
  };

  const updateProposal: CrmDataContextType['updateProposal'] = (id, patch) => {
    setProposals((prev) => prev.map((p) => (p.id === id ? { ...patch, id } : p)));
    const numericId = Number(id);
    if (Number.isFinite(numericId)) {
      void api.put(`/crm/proposals/${numericId}`, {
        ...patch,
        contatoId: patch.contatoId ?? null,
        empresaId: patch.empresaId ?? null,
        dealId: patch.dealId ?? null,
      });
    }
  };

  return {
    addCompany,
    addContact,
    addDeal,
    addActivity,
    deleteActivity,
    setActivityStatus,
    rescheduleActivity,
    addEmail,
    updateEmail,
    deleteEmail,
    addProposal,
    updateDealStage,
    updateDeal,
    deleteDeal,
    addPipeline,
    updatePipeline,
    deletePipeline,
    addStage,
    updateStage,
    deleteStage,
    updateCompany,
    updateContact,
    deleteContact,
    updateActivity,
    updateProposal,
  };
}
