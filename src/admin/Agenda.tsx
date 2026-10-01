import { useEffect, useMemo, useState } from 'react';
import CrmLayout from '../components/crm/CrmLayout';
import { useAuth } from '../contexts/AuthContext';
import { useCrmData, type Activity } from '../contexts/CrmDataContext';
import ActivityModal, { type ActivityDefaults } from './agenda/ActivityModal';
import CompletionModal from './agenda/CompletionModal';
import { useTeamMembers } from './agenda/useTeamMembers';
import AgendaSidePanel from './agenda/AgendaSidePanel';
import AgendaToolbar from './agenda/AgendaToolbar';
import GoogleCalendarMenu from './agenda/GoogleCalendarMenu';
import MonthView from './agenda/MonthView';
import TimeGridView from './agenda/TimeGridView';
import { DEFAULT_FILTERS, type AgendaFilters, type CalendarEvent } from './agenda/activityStyle';
import {
  activitySpan,
  addDays,
  addMinutes,
  DEFAULT_DURATION_MIN,
  shiftCursor,
  startOfDay,
  visibleDays,
  type AgendaView,
} from './agenda/dateUtils';

type ModalState = { open: boolean; activity: Activity | null; defaults: ActivityDefaults | null };

const CLOSED: ModalState = { open: false, activity: null, defaults: null };

/** Próxima hora cheia: horário sugerido ao criar pelo botão "Nova atividade". */
const nextFullHour = () => {
  const d = new Date();
  d.setMinutes(0, 0, 0);
  d.setHours(d.getHours() + 1);
  return d;
};

const Agenda = () => {
  const { activities, getContactName, rescheduleActivity, setActivityStatus } = useCrmData();
  const { user } = useAuth();
  const [view, setView] = useState<AgendaView>('Semana');
  const [cursor, setCursor] = useState(() => new Date());
  const [filters, setFilters] = useState<AgendaFilters>(DEFAULT_FILTERS);
  const [now, setNow] = useState(() => new Date());
  const members = useTeamMembers();
  const [modal, setModal] = useState<ModalState>(CLOSED);
  const [completion, setCompletion] = useState<Activity | null>(null);
  const [actionError, setActionError] = useState('');

  useEffect(() => {
    const id = window.setInterval(() => setNow(new Date()), 60_000);
    return () => window.clearInterval(id);
  }, []);

  const me = user?.id;

  const filtered = useMemo(() => {
    const q = filters.query.trim().toLowerCase();
    return activities.filter((a) => {
      if (!filters.types.includes(a.tipo)) return false;
      if (!filters.showDone && a.status !== 'Pendente') return false;
      if (filters.assignee === 'none' && a.assignedTo) return false;
      if (filters.assignee === 'mine' && !(a.assignedTo === me || (!a.assignedTo && a.createdBy === me))) return false;
      if (/^\d+$/.test(filters.assignee) && a.assignedTo !== Number(filters.assignee)) return false;
      if (!q) return true;
      return (
        a.titulo.toLowerCase().includes(q) ||
        getContactName(a.contatoId).toLowerCase().includes(q) ||
        (a.local ?? '').toLowerCase().includes(q) ||
        (a.descricao ?? '').toLowerCase().includes(q)
      );
    });
  }, [activities, filters, getContactName, me]);

  const events = useMemo<CalendarEvent[]>(
    () =>
      filtered.flatMap((activity) => {
        const span = activitySpan(activity);
        return span ? [{ activity, span }] : [];
      }),
    [filtered]
  );

  const days = useMemo(() => visibleDays(view, cursor), [view, cursor]);

  const fail = (err: unknown, fallback: string) => setActionError(err instanceof Error ? err.message : fallback);

  const openCreate = (start?: Date, allDay = false) => {
    const from = start ?? nextFullHour();
    setModal({
      open: true,
      activity: null,
      defaults: { start: from, end: addMinutes(from, DEFAULT_DURATION_MIN), allDay },
    });
  };

  const openEdit = (activity: Activity) => setModal({ open: true, activity, defaults: null });
  const closeModal = () => setModal(CLOSED);

  const openDay = (day: Date) => {
    setCursor(day);
    setView('Dia');
  };

  const onCreateOnDay = (day: Date) => {
    const at = startOfDay(day);
    at.setHours(9, 0, 0, 0);
    openCreate(at);
  };

  // Arrastar no mês: mantém o horário e a duração, muda só o dia.
  const onMoveToDay = (id: string, day: Date) => {
    const activity = activities.find((a) => a.id === id);
    const span = activity ? activitySpan(activity) : null;
    if (!activity || !span) return;
    const newStart = new Date(span.start);
    newStart.setFullYear(day.getFullYear(), day.getMonth(), day.getDate());
    const delta = newStart.getTime() - span.start.getTime();
    if (delta === 0) return;
    const endAt = span.allDay ? null : new Date(span.end.getTime() + delta).toISOString();
    rescheduleActivity(id, newStart.toISOString(), endAt).catch((err) => fail(err, 'Não foi possível remarcar a atividade.'));
  };

  const onMove = (id: string, start: Date, end: Date) => {
    rescheduleActivity(id, start.toISOString(), end.toISOString()).catch((err) =>
      fail(err, 'Não foi possível remarcar a atividade.')
    );
  };

  const onResize = (id: string, end: Date) => {
    const activity = activities.find((a) => a.id === id);
    if (!activity?.startAt) return;
    rescheduleActivity(id, activity.startAt, end.toISOString()).catch((err) =>
      fail(err, 'Não foi possível alterar a duração.')
    );
  };

  // Reunião e ligação concluídas abrem "Como foi?" (resultado, etapa do negócio e próximo passo).
  const offerResult = (a: Activity) => {
    if (a.tipo === 'Reunião' || a.tipo === 'Ligação') setCompletion(a);
  };

  const onToggleDone = (a: Activity) => {
    setActivityStatus(a.id, 'Concluída')
      .then(() => offerResult(a))
      .catch((err) => fail(err, 'Não foi possível concluir a atividade.'));
  };

  const scheduleNext = (a: Activity) => {
    const at = addDays(startOfDay(new Date()), 1);
    at.setHours(9, 0, 0, 0);
    setModal({
      open: true,
      activity: null,
      defaults: {
        start: at,
        end: addMinutes(at, DEFAULT_DURATION_MIN),
        allDay: false,
        titulo: `Follow-up: ${a.titulo}`,
        tipo: 'Follow-up',
        contatoId: a.contatoId,
        dealId: a.dealId,
      },
    });
  };

  return (
    <CrmLayout>
      <div className="crm-page-header">
        <div>
          <div className="crm-page-title">Agenda</div>
          <div style={{ fontSize: 12, color: 'var(--vesk-muted)', marginTop: 2 }}>
            Reuniões, ligações, follow-ups e tarefas com data e hora
          </div>
        </div>
        <div className="crm-page-actions">
          <div className="crm-inline-search" role="search">
            <i className="ti ti-search si" aria-hidden="true" />
            <input
              value={filters.query}
              onChange={(e) => setFilters((f) => ({ ...f, query: e.target.value }))}
              placeholder="Buscar atividade, contato ou local…"
              aria-label="Buscar atividades"
            />
          </div>
          <GoogleCalendarMenu />
          <button type="button" className="crm-btn-primary" onClick={() => openCreate()}>
            <i className="ti ti-plus" style={{ fontSize: 13 }} aria-hidden="true" />
            Nova atividade
          </button>
        </div>
      </div>

      {actionError ? (
        <div className="wa-send-error ag-action-error" role="alert">
          <i className="ti ti-alert-circle" aria-hidden="true" />
          <span>{actionError}</span>
          <button type="button" className="wa-send-error-close" aria-label="Fechar aviso" onClick={() => setActionError('')}>
            <i className="ti ti-x" aria-hidden="true" />
          </button>
        </div>
      ) : null}

      <div className="ag-layout">
        <div className="crm-card ag-main">
          <AgendaToolbar
            view={view}
            cursor={cursor}
            onViewChange={setView}
            onPrev={() => setCursor((c) => shiftCursor(view, c, -1))}
            onNext={() => setCursor((c) => shiftCursor(view, c, 1))}
            onToday={() => setCursor(new Date())}
            filters={filters}
            onFiltersChange={setFilters}
            members={members}
          />

          {view === 'Mês' ? (
            <MonthView
              cursor={cursor}
              today={now}
              events={events}
              onOpenActivity={openEdit}
              onCreateOnDay={onCreateOnDay}
              onOpenDay={openDay}
              onMoveToDay={onMoveToDay}
            />
          ) : (
            <TimeGridView
              days={days}
              now={now}
              events={events}
              onOpenActivity={openEdit}
              onCreateAt={(start) => openCreate(start)}
              onMove={onMove}
              onResize={onResize}
            />
          )}
        </div>

        <AgendaSidePanel
          activities={filtered}
          now={now}
          getContactName={getContactName}
          onOpen={openEdit}
          onToggleDone={onToggleDone}
        />
      </div>

      <ActivityModal
        open={modal.open}
        activity={modal.activity}
        defaults={modal.defaults}
        members={members}
        currentUserId={me}
        onClose={closeModal}
        onCompleted={offerResult}
      />

      <CompletionModal activity={completion} onClose={() => setCompletion(null)} onScheduleNext={scheduleNext} />
    </CrmLayout>
  );
};

export default Agenda;
