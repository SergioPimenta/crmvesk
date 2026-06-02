import type { ContactStage } from '../contexts/CrmDataContext';

const STAGE_KEY_TO_ETAPA: Record<string, ContactStage> = {
  prospeccao: 'Prospecção',
  qualificacao: 'Qualificação',
  proposta: 'Proposta',
  negociacao: 'Negociação',
  fechado: 'Fechado',
};

const ETAPAS: ContactStage[] = ['Prospecção', 'Qualificação', 'Proposta', 'Negociação', 'Fechado'];

export function stageToContactEtapa(stageKey: string, titulo?: string): ContactStage {
  if (STAGE_KEY_TO_ETAPA[stageKey]) return STAGE_KEY_TO_ETAPA[stageKey];
  if (titulo && ETAPAS.includes(titulo as ContactStage)) return titulo as ContactStage;
  return 'Prospecção';
}
