import type { ContactStage, ContactType } from '../../contexts/CrmDataContext';

export const PAGE_SIZE = 50;

export type ContactTab = 'Todos' | ContactType;

/** Estado do formulário de contato (usado pelos modais de criar e editar). */
export type ContactFormState = {
  nome: string;
  email: string;
  telefone: string;
  site: string;
  empresaId: string;
  tipo: ContactType;
  etapa: ContactStage;
  pipelineId: string;
  stageKey: string;
};

export type TeamMember = { id: number; name: string; role: string; active: boolean };

export const emptyContactForm = (pipelineId: string): ContactFormState => ({
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
