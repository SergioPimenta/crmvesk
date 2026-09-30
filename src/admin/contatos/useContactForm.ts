import { useEffect, useMemo, useState } from 'react';
import type { Contact, Pipeline, PipelineStage } from '../../contexts/CrmDataContext';
import { api } from '../../services/api';
import { stageToContactEtapa } from '../../utils/crmStage';
import { emptyContactForm, type ContactFormState } from './types';

type Options = {
  isCreateOpen: boolean;
  pipelines: Pipeline[];
  activePipelineId: string | null;
};

type StageRow = { id: number; pipelineId: number; stageKey: string; titulo: string; cor: string; pos: number };

/**
 * Estado do formulário de contato (criar e editar): campos, funil e etapas do funil escolhido.
 * Ao criar, o funil começa no funil ativo e a etapa, na primeira do funil.
 */
export function useContactForm({ isCreateOpen, pipelines, activePipelineId }: Options) {
  const defaultPipelineId = pipelines.find((p) => p.isDefault)?.id ?? pipelines[0]?.id ?? '';
  const [form, setForm] = useState<ContactFormState>(() => emptyContactForm(''));
  const [formStages, setFormStages] = useState<PipelineStage[]>([]);

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
      const stagesData = await api.get<StageRow[]>(`/crm/pipelines/${form.pipelineId}/stages`);
      setFormStages(
        stagesData.map((s) => ({
          id: String(s.id),
          pipelineId: String(
            (s as { pipelineId?: number; pipelineid?: number }).pipelineId ??
              (s as { pipelineid?: number }).pipelineid
          ),
          stageKey: String(
            (s as { stageKey?: string; stagekey?: string }).stageKey ?? (s as { stagekey?: string }).stagekey
          ),
          titulo: s.titulo,
          cor: s.cor,
          pos: Number(s.pos ?? 0),
        }))
      );
    })();
  }, [form.pipelineId]);

  // Se a etapa escolhida não existe no funil, seleciona a primeira.
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

  const sortedFormStages = useMemo(() => [...formStages].sort((a, b) => a.pos - b.pos), [formStages]);

  const resetForm = () => {
    setForm(emptyContactForm(activePipelineId ?? defaultPipelineId));
    setFormStages([]);
  };

  const loadForEdit = (c: Contact) =>
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

  return { form, setForm, formStages, sortedFormStages, resetForm, loadForEdit };
}
