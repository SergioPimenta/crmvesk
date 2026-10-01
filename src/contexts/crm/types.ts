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

export type ActivityStatus = 'Pendente' | 'Concluída' | 'Cancelada';
export type ActivityPriority = 'Alta' | 'Média' | 'Baixa';

export type Activity = {
  id: string;
  titulo: string;
  tipo: AgendaType;
  /** Texto legado (atividades antigas, sem data). Use startAt/endAt quando existirem. */
  quando: string;
  contatoId?: string;
  empresaId?: string;
  dealId?: string;
  status: ActivityStatus;
  /** Datas em ISO (UTC). Atividades antigas não têm startAt. */
  startAt?: string | null;
  endAt?: string | null;
  allDay?: boolean;
  descricao?: string;
  local?: string;
  /** Link de videochamada (ex.: Google Meet). */
  link?: string;
  prioridade?: ActivityPriority;
  assignedTo?: number | null;
  assignedToName?: string | null;
  completedAt?: string | null;
  createdBy?: number | null;
  /** Minutos antes do início para avisar (0 = na hora); null/ausente = sem lembrete. */
  remindMinutes?: number | null;
  /** E-mails dos convidados (Google Agenda). */
  attendees?: string[];
  /** Resposta de cada convidado ao convite do Google, por e-mail (minúsculo). */
  attendeeResponses?: Record<string, 'accepted' | 'declined' | 'tentative' | 'needsAction'>;
  /** Evento vinculado no Google Agenda (null/ausente = não sincronizada). */
  googleEventId?: string | null;
  googleHtmlLink?: string;
};

/** Resultado do envio ao Google Agenda ao salvar; "error" não impede a atividade de ser salva. */
export type GoogleOutcome = { status: 'ok'; htmlLink: string; meetUrl: string } | { status: 'error'; message: string };

/** Atividade salva + o que aconteceu no Google (só vem na resposta de criar/editar). */
export type SavedActivity = Activity & { google?: GoogleOutcome };

/** O que o formulário envia ao criar/editar (campos calculados pelo servidor ficam de fora). */
export type ActivityInput = Omit<
  Activity,
  | 'id'
  | 'quando'
  | 'assignedToName'
  | 'completedAt'
  | 'createdBy'
  | 'googleEventId'
  | 'googleHtmlLink'
  | 'attendeeResponses'
> & {
  quando?: string;
  /** Enviar ao Google Agenda ao salvar. */
  googleSync?: boolean;
  /** Gerar link do Google Meet. */
  meet?: boolean;
  /** Pedir ao Google para enviar o convite por e-mail aos convidados. */
  invite?: boolean;
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
  addActivity: (activity: ActivityInput) => Promise<SavedActivity>;
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
  updateActivity: (id: string, activity: ActivityInput) => Promise<SavedActivity>;
  deleteActivity: (id: string) => Promise<void>;
  /** Concluir, cancelar ou reabrir (atualiza a tela na hora e desfaz se o servidor recusar). */
  setActivityStatus: (id: string, status: ActivityStatus) => Promise<void>;
  /** Remarcar (arrastar no calendário): atualiza na hora e desfaz se o servidor recusar. */
  rescheduleActivity: (id: string, startAt: string, endAt: string | null) => Promise<void>;
  updateProposal: (id: string, patch: Omit<Proposal, 'id'>) => void;

  updateDealStage: (dealId: string, stageKey: StageKey) => void;

  getCompanyName: (id?: string) => string;
  getContactName: (id?: string) => string;
  getDealTitle: (id?: string) => string;
};
