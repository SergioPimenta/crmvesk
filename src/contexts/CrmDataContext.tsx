import React, { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { api } from '../services/api';
import { enrichDealWithContact, mapDealRow } from '../utils/apiRow';
import { useAuth } from './AuthContext';
import {
  activePipelineKey,
  LEGACY_ACTIVE_PIPELINE_KEY,
  mapStageRow,
  normalizeActivity,
  normalizeCompany,
  normalizeContact,
  normalizeEmail,
  normalizeProposal,
} from './crm/mappers';
import { useCrmMutations } from './crm/useCrmMutations';
import { useCrmNotifications } from './crm/useCrmNotifications';
import {
  type Activity,
  type Company,
  type Contact,
  type CrmDataContextType,
  type Deal,
  type EmailItem,
  type Pipeline,
  type PipelineStage,
  type Proposal,
} from './crm/types';

// Os tipos do CRM vivem em ./crm/types; continuam exportados daqui para quem já importava deste arquivo.
export * from './crm/types';

const CrmDataContext = createContext<CrmDataContextType>({} as CrmDataContextType);

export const CrmDataProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { user } = useAuth();
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

    setCompanies(companiesData.map(normalizeCompany));
    const normalizedContacts = contactsData.map(normalizeContact);
    setContacts(normalizedContacts);
    setDeals(
      (dealsData as Record<string, unknown>[])
        .map(mapDealRow)
        .map((deal) => enrichDealWithContact(deal, normalizedContacts))
    );
    setActivities(activitiesData.map(normalizeActivity));
    setEmails(emailsData.map(normalizeEmail));
    setProposals(proposalsData.map(normalizeProposal));
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

  const refreshEmails = useCallback(async () => {
    const emailsData = await api.get<EmailItem[]>('/crm/emails');
    setEmails(emailsData.map(normalizeEmail));
  }, []);

  const notifications = useCrmNotifications({
    userId: user?.id,
    whatsappUnread,
    emails,
    refreshWhatsappUnread,
    refreshEmails,
  });

  const refreshCrmData = useCallback(async () => {
    const token = localStorage.getItem('token');
    if (!token) return;

    const [contactsData, dealsData, activitiesData] = await Promise.all([
      api.get<Contact[]>('/crm/contacts'),
      api.get<Record<string, unknown>[]>('/crm/deals'),
      api.get<Activity[]>('/crm/activities'),
    ]);

    const normalizedContacts = contactsData.map(normalizeContact);

    setContacts(normalizedContacts);
    setDeals(
      dealsData.map(mapDealRow).map((deal) => enrichDealWithContact(deal, normalizedContacts))
    );
    setActivities(activitiesData.map(normalizeActivity));
  }, []);

  const mutations = useCrmMutations({
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
  });

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
    ...notifications,
    ...mutations,
    refreshEmails,
    refreshCrmData,
    getCompanyName,
    getContactName,
    getDealTitle,
  };

  return <CrmDataContext.Provider value={value}>{children}</CrmDataContext.Provider>;
};

export const useCrmData = () => useContext(CrmDataContext);

