export type ContactStage = 'Prospecção' | 'Qualificação' | 'Proposta' | 'Negociação' | 'Fechado';
export type ContactType = 'Lead' | 'Cliente' | 'Prospect';

export type Contact = {
  id: string;
  nome: string;
  email: string;
  telefone: string;
  site?: string;
  empresaId?: string;
  tipo: ContactType;
  etapa: ContactStage;
  ultimaInteracao: string;
  precisaFollowUp?: boolean;
  /** Usuário responsável (criador) do contato; null/ausente = sem responsável. */
  ownerId?: number | null;
};

export type CompanyStage = 'Prospecção' | 'Qualificação' | 'Proposta' | 'Negociação' | 'Fechado';

export type Company = {
  id: string;
  nome: string;
  segmento: string;
  contatos: number;
  etapa: CompanyStage;
  proximaAcao: string;
  prioridade?: 'Alta' | 'Média' | 'Baixa';
};

export type StageKey = string;

export type Pipeline = {
  id: string;
  nome: string;
  isDefault?: boolean;
};

export type PipelineStage = {
  id: string;
  pipelineId: string;
  stageKey: string;
  titulo: string;
  cor: string;
  pos: number;
};

export type Deal = {
  id: string;
  pipelineId?: string;
  titulo: string;
  empresaId?: string;
  contatoId?: string;
  contatoNome?: string;
  contatoEmail?: string;
  contatoTelefone?: string;
  valor: string;
  prob: string;
  stageKey: StageKey;
};

export type AgendaType = 'Reunião' | 'Ligação' | 'Follow-up' | 'Tarefa';

export type Activity = {
  id: string;
  titulo: string;
  tipo: AgendaType;
  quando: string;
  contatoId?: string;
  empresaId?: string;
  status: 'Pendente' | 'Concluída';
};

export type EmailStatus = 'Não lido' | 'Aguardando resposta' | 'Respondido' | 'Lido';

export const isEmailUnread = (status: EmailStatus) =>
  status === 'Não lido' || status === 'Aguardando resposta';

export const isEmailRead = (status: EmailStatus) => status === 'Lido' || status === 'Respondido';

export type EmailItem = {
  id: string;
  de: string;
  assunto: string;
  preview: string;
  quando: string;
  contatoId?: string;
  empresaId?: string;
  status: EmailStatus;
};

export type ProposalStatus = 'Enviada' | 'Visualizada' | 'Aceita' | 'Recusada';

export type Proposal = {
  id: string;
  titulo: string;
  contatoId?: string;
  empresaId?: string;
  valor: string;
  status: ProposalStatus;
  enviadaEm: string;
  dealId?: string;
  templateId?: string;
  fieldValues?: Record<string, string>;
  emailSentAt?: string;
};

export type CrmDataContextType = {
  pipelines: Pipeline[];
  stages: PipelineStage[];
  activePipelineId: string | null;
  setActivePipelineId: (id: string | null) => void;

  companies: Company[];
  contacts: Contact[];
  deals: Deal[];
  activities: Activity[];
  emails: EmailItem[];
  proposals: Proposal[];
  whatsappUnread: number;
  setWhatsappUnread: (n: number) => void;
  refreshWhatsappUnread: () => Promise<void>;
  notificationsEnabled: boolean;
  toggleNotifications: () => Promise<boolean>;
  notifyWhatsapp: boolean;
  notifyEmail: boolean;
  setNotifyWhatsapp: (v: boolean) => void;
  setNotifyEmail: (v: boolean) => void;
  pushEnabled: boolean;
  pushBusy: boolean;
  pushSupported: boolean;
  togglePush: () => Promise<void>;

  addCompany: (company: Omit<Company, 'id'> & { id?: string }) => string;
  addContact: (
    contact: Omit<Contact, 'id' | 'ultimaInteracao'> & {
      id?: string;
      ultimaInteracao?: string;
      pipelineId?: string;
      stageKey?: string;
    }
  ) => Promise<string>;
  addDeal: (deal: Omit<Deal, 'id'> & { id?: string }) => Promise<string>;
  updateDeal: (id: string, patch: Omit<Deal, 'id'>) => void;
  deleteDeal: (id: string) => Promise<void>;
  addActivity: (activity: Omit<Activity, 'id'> & { id?: string }) => string;
  addEmail: (email: Omit<EmailItem, 'id'> & { id?: string }) => string;
  updateEmail: (id: string, patch: Partial<Pick<EmailItem, 'status'>>) => void;
  deleteEmail: (id: string) => Promise<void>;
  refreshEmails: () => Promise<void>;
  refreshCrmData: () => Promise<void>;
  addProposal: (proposal: Omit<Proposal, 'id'> & { id?: string }) => string;

  addPipeline: (pipeline: Omit<Pipeline, 'id'> & { id?: string }) => string;
  updatePipeline: (id: string, patch: Omit<Pipeline, 'id'>) => void;
  deletePipeline: (id: string) => Promise<void>;
  addStage: (pipelineId: string, stage: Omit<PipelineStage, 'id' | 'pipelineId' | 'pos'> & { id?: string }) => Promise<string>;
  updateStage: (pipelineId: string, stageId: string, patch: Omit<PipelineStage, 'id' | 'pipelineId'>) => void;
  deleteStage: (pipelineId: string, stageId: string) => Promise<void>;

  updateCompany: (id: string, patch: Omit<Company, 'id'>) => void;
  updateContact: (id: string, patch: Omit<Contact, 'id'>) => void;
  deleteContact: (id: string) => Promise<void>;
  updateActivity: (id: string, patch: Omit<Activity, 'id'>) => void;
  updateProposal: (id: string, patch: Omit<Proposal, 'id'>) => void;

  updateDealStage: (dealId: string, stageKey: StageKey) => void;

  getCompanyName: (id?: string) => string;
  getContactName: (id?: string) => string;
  getDealTitle: (id?: string) => string;
};
