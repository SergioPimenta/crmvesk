import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../services/api';
import { enrichDealWithContact, mapDealRow } from '../utils/apiRow';
import { useAuth } from './AuthContext';
import {
  pushSupported as pushIsSupported,
  subscribeToPush,
  unsubscribeFromPush,
  isPushSubscribed,
} from '../utils/push';

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
};

type CrmDataContextType = {
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

const CrmDataContext = createContext<CrmDataContextType>({} as CrmDataContextType);

const activePipelineKey = (userId: number | string) => `crm_active_pipeline_id_${userId}`;
const LEGACY_ACTIVE_PIPELINE_KEY = 'crm_active_pipeline_id';

const mapStageRow = (s: Record<string, unknown>) => ({
  id: String(s.id),
  pipelineId: String(s.pipelineId ?? s.pipelineid),
  stageKey: String(s.stageKey ?? s.stagekey),
  titulo: String(s.titulo),
  cor: String(s.cor),
  pos: Number(s.pos ?? 0),
});

const genId = (prefix: string) =>
  (globalThis.crypto && 'randomUUID' in globalThis.crypto && typeof globalThis.crypto.randomUUID === 'function'
    ? `${prefix}_${globalThis.crypto.randomUUID()}`
    : `${prefix}_${Date.now()}_${Math.round(Math.random() * 1e9)}`) as string;

export const CrmDataProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [pipelines, setPipelines] = useState<Pipeline[]>([]);
  const [stages, setStages] = useState<PipelineStage[]>([]);
  const [activePipelineId, setActivePipelineIdState] = useState<string | null>(null);

  const setActivePipelineId = (id: string | null | ((prev: string | null) => string | null)) => {
    setActivePipelineIdState((prev) => {
      const next = typeof id === 'function' ? id(prev) : id;
      const uid = user?.id;
      if (uid) {
        const key = activePipelineKey(uid);
        if (next) localStorage.setItem(key, next);
        else localStorage.removeItem(key);
      }
      return next;
    });
  };

  const fetchStagesForPipeline = async (pipelineId: string) => {
    const stagesData = await api.get<Record<string, unknown>[]>(`/crm/pipelines/${pipelineId}/stages`);
    setStages(stagesData.map(mapStageRow));
  };
  const [companies, setCompanies] = useState<Company[]>([]);
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [deals, setDeals] = useState<Deal[]>([]);
  const [activities, setActivities] = useState<Activity[]>([]);
  const [emails, setEmails] = useState<EmailItem[]>([]);
  const [proposals, setProposals] = useState<Proposal[]>([]);
  const [whatsappUnread, setWhatsappUnread] = useState(0);

  const clearCrmState = useCallback(() => {
    setPipelines([]);
    setStages([]);
    setActivePipelineIdState(null);
    setCompanies([]);
    setContacts([]);
    setDeals([]);
    setActivities([]);
    setEmails([]);
    setProposals([]);
    setWhatsappUnread(0);
  }, []);

  const refreshWhatsappUnread = useCallback(async () => {
    try {
      const data = await api.get<{ count: number }>('/whatsapp/unread-count');
      setWhatsappUnread(Number(data?.count) || 0);
    } catch {
      /* WhatsApp não configurado ou offline — mantém contagem atual */
    }
  }, []);

  const loadCrmData = useCallback(async (userId: number) => {
    const [pipelinesData, companiesData, contactsData, dealsData, activitiesData, emailsData, proposalsData] =
      await Promise.all([
        api.get<any[]>('/crm/pipelines'),
        api.get<Company[]>('/crm/companies'),
        api.get<Contact[]>('/crm/contacts'),
        api.get<Deal[]>('/crm/deals'),
        api.get<Activity[]>('/crm/activities'),
        api.get<EmailItem[]>('/crm/emails'),
        api.get<Proposal[]>('/crm/proposals'),
      ]);

    const normalizedPipelines = pipelinesData.map((p) => ({
      id: String(p.id),
      nome: p.nome,
      isDefault: Boolean(p.isDefault ?? p.isdefault),
    }));
    setPipelines(normalizedPipelines);

    localStorage.removeItem(LEGACY_ACTIVE_PIPELINE_KEY);
    const savedId = localStorage.getItem(activePipelineKey(userId));
    const defaultId =
      (savedId && normalizedPipelines.some((p) => p.id === savedId) ? savedId : null) ??
      normalizedPipelines.find((p) => p.isDefault)?.id ??
      normalizedPipelines[0]?.id ??
      null;
    setActivePipelineIdState(defaultId);
    if (defaultId) localStorage.setItem(activePipelineKey(userId), defaultId);

    setCompanies(companiesData.map((c) => ({ ...c, id: String((c as any).id) })));
    const normalizedContacts = contactsData.map((c) => ({
      ...c,
      id: String((c as any).id),
      empresaId: (c as any).empresaId ? String((c as any).empresaId) : undefined,
    }));
    setContacts(normalizedContacts);
    setDeals(
      (dealsData as Record<string, unknown>[])
        .map(mapDealRow)
        .map((deal) => enrichDealWithContact(deal, normalizedContacts))
    );
    setActivities(
      activitiesData.map((a) => ({
        ...a,
        id: String((a as any).id),
        contatoId: (a as any).contatoId ? String((a as any).contatoId) : undefined,
        empresaId: (a as any).empresaId ? String((a as any).empresaId) : undefined,
      }))
    );
    setEmails(
      emailsData.map((m) => ({
        ...m,
        id: String((m as any).id),
        contatoId: (m as any).contatoId ? String((m as any).contatoId) : undefined,
        empresaId: (m as any).empresaId ? String((m as any).empresaId) : undefined,
      }))
    );
    setProposals(
      proposalsData.map((p) => ({
        ...p,
        id: String((p as any).id),
        contatoId: (p as any).contatoId ? String((p as any).contatoId) : undefined,
        empresaId: (p as any).empresaId ? String((p as any).empresaId) : undefined,
        dealId: (p as any).dealId ? String((p as any).dealId) : undefined,
      }))
    );
  }, []);

  useEffect(() => {
    if (!user?.id) {
      clearCrmState();
      return;
    }

    let cancelled = false;

    const load = async () => {
      clearCrmState();
      try {
        await loadCrmData(user.id);
      } catch (err) {
        if (!cancelled) {
          console.error('Erro ao carregar dados do CRM:', err);
        }
      }
    };

    void load();

    return () => {
      cancelled = true;
    };
  }, [user?.id, clearCrmState, loadCrmData]);

  useEffect(() => {
    if (!activePipelineId || !user?.id) {
      setStages([]);
      return;
    }
    void (async () => {
      try {
        await fetchStagesForPipeline(activePipelineId);
      } catch (err) {
        console.error('Erro ao carregar etapas:', err);
      }
    })();
  }, [activePipelineId, user?.id]);

  const getCompanyName = (id?: string) => (id ? companies.find((c) => c.id === String(id))?.nome ?? '—' : '—');
  const getContactName = (id?: string) => (id ? contacts.find((c) => c.id === String(id))?.nome ?? '—' : '—');
  const getDealTitle = (id?: string) => (id ? deals.find((d) => d.id === String(id))?.titulo ?? '—' : '—');

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

  const addActivity: CrmDataContextType['addActivity'] = (activity) => {
    const tempId = activity.id ?? genId('a');
    const optimistic: Activity = { ...activity, id: tempId };
    setActivities((prev) => [optimistic, ...prev]);

    void (async () => {
      const result = await api.post<{ id: number }>('/crm/activities', activity);
      const id = String(result.id);
      setActivities((prev) => prev.map((a) => (a.id === tempId ? { ...a, id } : a)));
    })();

    return tempId;
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

  const refreshEmails = useCallback(async () => {
    const emailsData = await api.get<EmailItem[]>('/crm/emails');
    setEmails(
      emailsData.map((m) => ({
        ...m,
        id: String((m as any).id),
        contatoId: (m as any).contatoId ? String((m as any).contatoId) : undefined,
        empresaId: (m as any).empresaId ? String((m as any).empresaId) : undefined,
      }))
    );
  }, []);

  // ---- Notificações de novas mensagens (WhatsApp / e-mails) ----
  const notificationsSupported =
    typeof window !== 'undefined' && 'Notification' in window;

  const [notificationsEnabled, setNotificationsEnabled] = useState<boolean>(() => {
    if (!notificationsSupported) return false;
    return (
      localStorage.getItem('crm_notifications_enabled') === '1' &&
      Notification.permission === 'granted'
    );
  });

  const navigateRef = useRef(navigate);
  navigateRef.current = navigate;

  const notifyBrowser = useCallback((title: string, body: string, path: string) => {
    if (!notificationsSupported || Notification.permission !== 'granted') return;
    try {
      const notification = new Notification(title, { body, icon: '/vite.svg', tag: path });
      notification.onclick = () => {
        window.focus();
        navigateRef.current(path);
        notification.close();
      };
    } catch {
      /* alguns navegadores exigem service worker; ignora silenciosamente */
    }
  }, [notificationsSupported]);

  const toggleNotifications = useCallback(async () => {
    if (!notificationsSupported) {
      window.alert('Este navegador não suporta notificações.');
      return false;
    }
    if (notificationsEnabled) {
      setNotificationsEnabled(false);
      localStorage.setItem('crm_notifications_enabled', '0');
      return false;
    }
    let permission = Notification.permission;
    if (permission === 'default') {
      permission = await Notification.requestPermission();
    }
    if (permission === 'granted') {
      setNotificationsEnabled(true);
      localStorage.setItem('crm_notifications_enabled', '1');
      return true;
    }
    window.alert(
      'Permissão de notificações negada. Habilite nas configurações do navegador para receber alertas.'
    );
    return false;
  }, [notificationsSupported, notificationsEnabled]);

  // Preferências por canal (WhatsApp / e-mail).
  const [notifyWhatsapp, setNotifyWhatsappState] = useState<boolean>(
    () => localStorage.getItem('crm_notify_whatsapp') !== '0'
  );
  const [notifyEmail, setNotifyEmailState] = useState<boolean>(
    () => localStorage.getItem('crm_notify_email') !== '0'
  );
  const setNotifyWhatsapp = useCallback((v: boolean) => {
    setNotifyWhatsappState(v);
    localStorage.setItem('crm_notify_whatsapp', v ? '1' : '0');
  }, []);
  const setNotifyEmail = useCallback((v: boolean) => {
    setNotifyEmailState(v);
    localStorage.setItem('crm_notify_email', v ? '1' : '0');
  }, []);

  // Push no celular (Web Push).
  const pushSupported = pushIsSupported();
  const [pushEnabled, setPushEnabled] = useState(false);
  const [pushBusy, setPushBusy] = useState(false);

  useEffect(() => {
    if (!user?.id || !pushSupported) {
      setPushEnabled(false);
      return;
    }
    void isPushSubscribed()
      .then(setPushEnabled)
      .catch(() => setPushEnabled(false));
  }, [user?.id, pushSupported]);

  const togglePush = useCallback(async () => {
    if (!pushSupported) {
      window.alert('Este dispositivo não suporta notificações push.');
      return;
    }
    setPushBusy(true);
    try {
      if (pushEnabled) {
        await unsubscribeFromPush();
        setPushEnabled(false);
      } else {
        if (Notification.permission !== 'granted') {
          const perm = await Notification.requestPermission();
          if (perm !== 'granted') {
            window.alert('Permissão de notificações negada. Habilite nas configurações do navegador.');
            return;
          }
        }
        await subscribeToPush();
        setPushEnabled(true);
      }
    } catch (err) {
      window.alert(err instanceof Error ? err.message : 'Falha ao configurar push no celular.');
    } finally {
      setPushBusy(false);
    }
  }, [pushSupported, pushEnabled]);

  // Polling: contagem do WhatsApp + e-mails, para detectar mensagens novas.
  useEffect(() => {
    if (!user?.id) return;

    void refreshWhatsappUnread();
    void refreshEmails().catch(() => {});
    const interval = window.setInterval(() => {
      void refreshWhatsappUnread();
      void refreshEmails().catch(() => {});
    }, 15000);

    return () => window.clearInterval(interval);
  }, [user?.id, refreshWhatsappUnread, refreshEmails]);

  // Só dispara notificações após um curto período, evitando alertar na carga inicial.
  const notifArmedRef = useRef(false);
  const prevWaUnreadRef = useRef<number | null>(null);
  const prevEmailUnreadRef = useRef<number | null>(null);

  useEffect(() => {
    if (!user?.id) {
      notifArmedRef.current = false;
      prevWaUnreadRef.current = null;
      prevEmailUnreadRef.current = null;
      return;
    }
    const timer = window.setTimeout(() => {
      notifArmedRef.current = true;
    }, 6000);
    return () => window.clearTimeout(timer);
  }, [user?.id]);

  useEffect(() => {
    const prev = prevWaUnreadRef.current;
    prevWaUnreadRef.current = whatsappUnread;
    if (prev === null || !notifArmedRef.current || !notificationsEnabled || !notifyWhatsapp) return;
    if (whatsappUnread > prev) {
      const diff = whatsappUnread - prev;
      notifyBrowser(
        'Novas mensagens no WhatsApp',
        diff === 1
          ? 'Você recebeu 1 nova mensagem no WhatsApp.'
          : `Você recebeu ${diff} novas mensagens no WhatsApp.`,
        '/admin/whatsapp'
      );
    }
  }, [whatsappUnread, notificationsEnabled, notifyWhatsapp, notifyBrowser]);

  const emailUnread = emails.filter((e) => isEmailUnread(e.status)).length;

  useEffect(() => {
    const prev = prevEmailUnreadRef.current;
    prevEmailUnreadRef.current = emailUnread;
    if (prev === null || !notifArmedRef.current || !notificationsEnabled || !notifyEmail) return;
    if (emailUnread > prev) {
      const diff = emailUnread - prev;
      notifyBrowser(
        'Novos e-mails',
        diff === 1 ? 'Você recebeu 1 novo e-mail.' : `Você recebeu ${diff} novos e-mails.`,
        '/admin/emails'
      );
    }
  }, [emailUnread, notificationsEnabled, notifyEmail, notifyBrowser]);

  const refreshCrmData = useCallback(async () => {
    const token = localStorage.getItem('token');
    if (!token) return;

    const [contactsData, dealsData] = await Promise.all([
      api.get<Contact[]>('/crm/contacts'),
      api.get<Record<string, unknown>[]>('/crm/deals'),
    ]);

    const normalizedContacts = contactsData.map((c) => ({
      ...c,
      id: String((c as any).id),
      empresaId: (c as any).empresaId ? String((c as any).empresaId) : undefined,
    }));

    setContacts(normalizedContacts);
    setDeals(
      dealsData.map(mapDealRow).map((deal) => enrichDealWithContact(deal, normalizedContacts))
    );
  }, []);

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

  const updateActivity: CrmDataContextType['updateActivity'] = (id, patch) => {
    setActivities((prev) => prev.map((a) => (a.id === id ? { ...patch, id } : a)));
    const numericId = Number(id);
    if (Number.isFinite(numericId)) {
      void api.put(`/crm/activities/${numericId}`, {
        ...patch,
        contatoId: patch.contatoId ?? null,
        empresaId: patch.empresaId ?? null,
      });
    }
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

  const value: CrmDataContextType = {
    pipelines,
    stages,
    activePipelineId,
    setActivePipelineId,
    companies,
    contacts,
    deals,
    activities,
    emails,
    proposals,
    whatsappUnread,
    setWhatsappUnread,
    refreshWhatsappUnread,
    notificationsEnabled,
    toggleNotifications,
    notifyWhatsapp,
    notifyEmail,
    setNotifyWhatsapp,
    setNotifyEmail,
    pushEnabled,
    pushBusy,
    pushSupported,
    togglePush,
    addCompany,
    addContact,
    addDeal,
    updateDeal,
    deleteDeal,
    addActivity,
    addEmail,
    updateEmail,
    deleteEmail,
    refreshEmails,
    refreshCrmData,
    addProposal,
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
    updateDealStage,
    getCompanyName,
    getContactName,
    getDealTitle,
  };

  return <CrmDataContext.Provider value={value}>{children}</CrmDataContext.Provider>;
};

export const useCrmData = () => useContext(CrmDataContext);

