import { useEffect, useMemo, useState } from 'react';
import Modal from '../../components/crm/Modal';
import { useCrmData, type Activity, type ActivityInput, type ActivityPriority, type ActivityStatus, type AgendaType } from '../../contexts/CrmDataContext';
import { AGENDA_TYPES, TYPE_META } from './activityStyle';
import { activitySpan, addMinutes, DEFAULT_DURATION_MIN, fromInputs, toInputs } from './dateUtils';

type Member = { id: number; name: string };

/** Dados iniciais ao criar: horário e, opcionalmente, o que já se sabe (ex.: vindo de uma conversa do WhatsApp). */
export type ActivityDefaults = {
  start: Date;
  end: Date;
  allDay: boolean;
  titulo?: string;
  tipo?: AgendaType;
  contatoId?: string;
  dealId?: string;
  descricao?: string;
};

type Props = {
  open: boolean;
  /** Atividade em edição; null ao criar. */
  activity: Activity | null;
  /** Data/hora inicial ao criar (clique no calendário ou botão "Nova atividade"). */
  defaults: ActivityDefaults | null;
  members: Member[];
  currentUserId?: number | string;
  onClose: () => void;
  /** Chamado depois de concluir pelo botão "Concluir" (para oferecer registrar o resultado). */
  onCompleted?: (activity: Activity) => void;
};

type FormState = {
  titulo: string;
  tipo: AgendaType;
  allDay: boolean;
  date: string;
  start: string;
  end: string;
  contatoId: string;
  dealId: string;
  assignedTo: string;
  prioridade: ActivityPriority;
  status: ActivityStatus;
  local: string;
  link: string;
  descricao: string;
  /** Antecedência do lembrete em minutos (texto do select); '' = sem lembrete. */
  remind: string;
};

const REMIND_CHOICES: Array<{ value: string; label: string }> = [
  { value: '', label: 'Sem lembrete' },
  { value: '0', label: 'Na hora' },
  { value: '5', label: '5 minutos antes' },
  { value: '10', label: '10 minutos antes' },
  { value: '15', label: '15 minutos antes' },
  { value: '30', label: '30 minutos antes' },
  { value: '60', label: '1 hora antes' },
  { value: '120', label: '2 horas antes' },
  { value: '1440', label: '1 dia antes' },
];

const STATUSES: ActivityStatus[] = ['Pendente', 'Concluída', 'Cancelada'];
const PRIORITIES: ActivityPriority[] = ['Alta', 'Média', 'Baixa'];

const minutesOf = (time: string) => {
  const m = /^(\d{2}):(\d{2})$/.exec(time);
  return m ? Number(m[1]) * 60 + Number(m[2]) : null;
};
const timeOf = (minutes: number) =>
  `${String(Math.floor(minutes / 60) % 24).padStart(2, '0')}:${String(minutes % 60).padStart(2, '0')}`;

function buildForm(activity: Activity | null, defaults: Props['defaults'], currentUserId?: number | string): FormState {
  if (activity) {
    const span = activitySpan(activity);
    const start = span ? toInputs(span.start) : { date: '', time: '' };
    const end = span && !span.allDay ? toInputs(span.end) : { date: '', time: '' };
    return {
      titulo: activity.titulo,
      tipo: activity.tipo,
      allDay: Boolean(activity.allDay),
      date: start.date,
      start: start.time,
      end: end.time,
      contatoId: activity.contatoId ?? '',
      dealId: activity.dealId ?? '',
      assignedTo: activity.assignedTo ? String(activity.assignedTo) : '',
      prioridade: activity.prioridade ?? 'Média',
      status: activity.status,
      local: activity.local ?? '',
      link: activity.link ?? '',
      descricao: activity.descricao ?? '',
      remind: activity.remindMinutes === null || activity.remindMinutes === undefined ? '' : String(activity.remindMinutes),
    };
  }
  const start = defaults?.start ?? new Date();
  const end = defaults?.end ?? addMinutes(start, DEFAULT_DURATION_MIN);
  return {
    titulo: defaults?.titulo ?? '',
    tipo: defaults?.tipo ?? 'Reunião',
    allDay: defaults?.allDay ?? false,
    date: toInputs(start).date,
    start: toInputs(start).time,
    end: toInputs(end).time,
    contatoId: defaults?.contatoId ?? '',
    dealId: defaults?.dealId ?? '',
    assignedTo: currentUserId ? String(currentUserId) : '',
    prioridade: 'Média',
    status: 'Pendente',
    local: '',
    link: '',
    descricao: defaults?.descricao ?? '',
    remind: '15',
  };
}

/** Criar e editar uma atividade da agenda. */
const ActivityModal = ({ open, activity, defaults, members, currentUserId, onClose, onCompleted }: Props) => {
  const { contacts, deals, addActivity, updateActivity, deleteActivity, setActivityStatus } = useCrmData();
  const [form, setForm] = useState<FormState>(() => buildForm(null, null));
  const [contactQuery, setContactQuery] = useState('');
  const [contactListOpen, setContactListOpen] = useState(false);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    setForm(buildForm(activity, defaults, currentUserId));
    setContactQuery('');
    setContactListOpen(false);
    setError('');
    setSaving(false);
    // reinicia só ao abrir ou ao trocar de atividade
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, activity?.id]);

  const set = <K extends keyof FormState>(key: K, value: FormState[K]) => setForm((f) => ({ ...f, [key]: value }));

  const selectedContact = useMemo(() => contacts.find((c) => c.id === form.contatoId) ?? null, [contacts, form.contatoId]);
  const contactMatches = useMemo(() => {
    const q = contactQuery.trim().toLowerCase();
    if (!q) return contacts.slice(0, 8);
    return contacts
      .filter((c) => c.nome.toLowerCase().includes(q) || c.telefone.toLowerCase().includes(q) || c.email.toLowerCase().includes(q))
      .slice(0, 8);
  }, [contacts, contactQuery]);
  const contactDeals = useMemo(() => deals.filter((d) => form.contatoId && d.contatoId === form.contatoId), [deals, form.contatoId]);

  // Mudar o início mantém a duração (o término acompanha).
  const changeStart = (time: string) => {
    setForm((f) => {
      const oldStart = minutesOf(f.start);
      const oldEnd = minutesOf(f.end);
      const newStart = minutesOf(time);
      if (oldStart === null || oldEnd === null || newStart === null) return { ...f, start: time };
      const duration = oldEnd > oldStart ? oldEnd - oldStart : DEFAULT_DURATION_MIN;
      return { ...f, start: time, end: timeOf(Math.min(newStart + duration, 23 * 60 + 59)) };
    });
  };

  const undated = Boolean(activity && !activity.startAt);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    const titulo = form.titulo.trim();
    if (!titulo) return setError('Informe o título da atividade.');

    let startAt: string | null = null;
    let endAt: string | null = null;
    if (form.date || !undated) {
      const start = fromInputs(form.date, form.allDay ? '00:00' : form.start);
      if (!start) return setError('Informe a data e o horário de início.');
      startAt = start.toISOString();
      if (!form.allDay) {
        const end = fromInputs(form.date, form.end);
        if (!end) return setError('Informe o horário de término.');
        if (end <= start) return setError('O término deve ser depois do início.');
        endAt = end.toISOString();
      }
    }

    const input: ActivityInput = {
      titulo,
      tipo: form.tipo,
      status: form.status,
      contatoId: form.contatoId || undefined,
      empresaId: selectedContact?.empresaId ?? activity?.empresaId,
      dealId: form.dealId || undefined,
      startAt,
      endAt,
      allDay: form.allDay,
      descricao: form.descricao,
      local: form.local,
      link: form.link,
      prioridade: form.prioridade,
      assignedTo: form.assignedTo ? Number(form.assignedTo) : null,
      // Lembrete só existe para compromissos com horário.
      remindMinutes: form.allDay || !startAt || form.remind === '' ? null : Number(form.remind),
      quando: activity?.quando,
    };

    setSaving(true);
    try {
      if (activity) await updateActivity(activity.id, input);
      else await addActivity(input);
      onClose();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Não foi possível salvar a atividade.');
    } finally {
      setSaving(false);
    }
  };

  const complete = async () => {
    if (!activity) return;
    setSaving(true);
    try {
      await setActivityStatus(activity.id, 'Concluída');
      onClose();
      onCompleted?.({ ...activity, status: 'Concluída' });
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Não foi possível concluir a atividade.');
      setSaving(false);
    }
  };

  const remove = async () => {
    if (!activity) return;
    if (!window.confirm(`Excluir a atividade "${activity.titulo}"?`)) return;
    setSaving(true);
    try {
      await deleteActivity(activity.id);
      onClose();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Não foi possível excluir a atividade.');
      setSaving(false);
    }
  };

  return (
    <Modal
      open={open}
      wide
      title={activity ? 'Editar atividade' : 'Nova atividade'}
      description={activity ? 'Atualize os dados do compromisso.' : 'Reuniões, ligações, follow-ups e tarefas com data e hora.'}
      onClose={onClose}
    >
      <form className="crm-form ag-form" onSubmit={(e) => void submit(e)}>
        {error ? (
          <div className="integration-hint ag-form-error" role="alert">
            <i className="ti ti-alert-circle" aria-hidden="true" />
            <span>{error}</span>
          </div>
        ) : null}

        {undated ? (
          <div className="integration-hint ag-form-wide">
            <i className="ti ti-info-circle" aria-hidden="true" />
            <span>
              Atividade antiga sem data{activity?.quando ? ` (“${activity.quando}”)` : ''}. Escolha uma data para ela
              aparecer no calendário.
            </span>
          </div>
        ) : null}

        <div className="crm-field ag-form-wide">
          <label htmlFor="ag_titulo">Título</label>
          <input
            id="ag_titulo"
            value={form.titulo}
            onChange={(e) => set('titulo', e.target.value)}
            placeholder="Ex.: Apresentar proposta para a Acme"
            maxLength={200}
            autoFocus
            required
          />
        </div>

        <div className="ag-form-wide">
          <div className="ag-label">Tipo</div>
          <div className="ag-type-picker" role="radiogroup" aria-label="Tipo de atividade">
            {AGENDA_TYPES.map((type) => (
              <button
                key={type}
                type="button"
                role="radio"
                aria-checked={form.tipo === type}
                className={`ag-type-option${form.tipo === type ? ' active' : ''}`}
                style={{ ['--ag-color' as string]: TYPE_META[type].color }}
                onClick={() => set('tipo', type)}
              >
                <i className={`ti ${TYPE_META[type].icon}`} aria-hidden="true" />
                {type}
              </button>
            ))}
          </div>
        </div>

        <div className="crm-field">
          <label htmlFor="ag_data">Data</label>
          <input id="ag_data" type="date" value={form.date} onChange={(e) => set('date', e.target.value)} required={!undated} />
        </div>

        <label className="ag-check-inline ag-allday-toggle">
          <input type="checkbox" checked={form.allDay} onChange={(e) => set('allDay', e.target.checked)} />
          Dia inteiro
        </label>

        {!form.allDay ? (
          <>
            <div className="crm-field">
              <label htmlFor="ag_inicio">Início</label>
              <input id="ag_inicio" type="time" value={form.start} onChange={(e) => changeStart(e.target.value)} required={!undated || Boolean(form.date)} />
            </div>
            <div className="crm-field">
              <label htmlFor="ag_fim">Término</label>
              <input id="ag_fim" type="time" value={form.end} onChange={(e) => set('end', e.target.value)} required={!undated || Boolean(form.date)} />
            </div>
          </>
        ) : null}

        <div className="crm-field ag-form-wide ag-contact-field">
          <label htmlFor="ag_contato">Contato</label>
          {selectedContact ? (
            <div className="ag-selected-contact">
              <span>
                {selectedContact.nome}
                {selectedContact.telefone ? ` · ${selectedContact.telefone}` : ''}
              </span>
              <button
                type="button"
                className="crm-action-btn"
                onClick={() => setForm((f) => ({ ...f, contatoId: '', dealId: '' }))}
              >
                Trocar
              </button>
            </div>
          ) : (
            <>
              <input
                id="ag_contato"
                value={contactQuery}
                onChange={(e) => {
                  setContactQuery(e.target.value);
                  setContactListOpen(true);
                }}
                onFocus={() => setContactListOpen(true)}
                onBlur={() => window.setTimeout(() => setContactListOpen(false), 120)}
                placeholder="Buscar por nome, telefone ou e-mail…"
                autoComplete="off"
              />
              {contactListOpen ? (
                <div className="ag-contact-list" role="listbox">
                  {contactMatches.map((c) => (
                    <button
                      key={c.id}
                      type="button"
                      role="option"
                      aria-selected={false}
                      className="ag-contact-option"
                      onMouseDown={(e) => {
                        e.preventDefault();
                        setForm((f) => ({ ...f, contatoId: c.id, dealId: '' }));
                        setContactQuery('');
                        setContactListOpen(false);
                      }}
                    >
                      <strong>{c.nome}</strong>
                      <span>{[c.telefone, c.email].filter(Boolean).join(' · ')}</span>
                    </button>
                  ))}
                  {contactMatches.length === 0 ? <div className="ag-contact-empty">Nenhum contato encontrado.</div> : null}
                </div>
              ) : null}
            </>
          )}
        </div>

        <div className="crm-field">
          <label htmlFor="ag_deal">Negócio</label>
          <select id="ag_deal" value={form.dealId} onChange={(e) => set('dealId', e.target.value)} disabled={contactDeals.length === 0}>
            <option value="">{form.contatoId ? (contactDeals.length ? '— Nenhum —' : 'Nenhum negócio deste contato') : 'Escolha um contato primeiro'}</option>
            {contactDeals.map((d) => (
              <option key={d.id} value={d.id}>
                {d.titulo}
              </option>
            ))}
          </select>
        </div>

        <div className="crm-field">
          <label htmlFor="ag_resp">Responsável</label>
          <select id="ag_resp" value={form.assignedTo} onChange={(e) => set('assignedTo', e.target.value)}>
            <option value="">Sem responsável</option>
            {members.map((m) => (
              <option key={m.id} value={String(m.id)}>
                {m.name}
              </option>
            ))}
          </select>
        </div>

        <div className="crm-field">
          <label htmlFor="ag_remind">Lembrete</label>
          <select
            id="ag_remind"
            value={form.allDay ? '' : form.remind}
            onChange={(e) => set('remind', e.target.value)}
            disabled={form.allDay}
          >
            {REMIND_CHOICES.map((c) => (
              <option key={c.value || 'none'} value={c.value}>
                {form.allDay && c.value === '' ? 'Indisponível para dia inteiro' : c.label}
              </option>
            ))}
          </select>
        </div>

        <div className="crm-field">
          <label htmlFor="ag_prio">Prioridade</label>
          <select id="ag_prio" value={form.prioridade} onChange={(e) => set('prioridade', e.target.value as ActivityPriority)}>
            {PRIORITIES.map((p) => (
              <option key={p} value={p}>
                {p}
              </option>
            ))}
          </select>
        </div>

        {activity ? (
          <div className="crm-field">
            <label htmlFor="ag_status">Status</label>
            <select id="ag_status" value={form.status} onChange={(e) => set('status', e.target.value as ActivityStatus)}>
              {STATUSES.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
          </div>
        ) : null}

        <div className="crm-field">
          <label htmlFor="ag_local">Local</label>
          <input id="ag_local" value={form.local} onChange={(e) => set('local', e.target.value)} placeholder="Endereço ou sala" maxLength={255} />
        </div>

        <div className="crm-field">
          <label htmlFor="ag_link">Link da videochamada</label>
          <input id="ag_link" type="url" value={form.link} onChange={(e) => set('link', e.target.value)} placeholder="https://meet.google.com/…" maxLength={512} />
        </div>

        <div className="crm-field ag-form-wide">
          <label htmlFor="ag_desc">Descrição</label>
          <textarea id="ag_desc" rows={3} value={form.descricao} onChange={(e) => set('descricao', e.target.value)} placeholder="Pauta, observações, o que preparar…" maxLength={2000} />
        </div>

        <div className="crm-form-actions ag-form-wide">
          {activity ? (
            <button type="button" className="crm-btn-secondary ag-danger-btn" onClick={() => void remove()} disabled={saving}>
              <i className="ti ti-trash" aria-hidden="true" />
              Excluir
            </button>
          ) : null}
          {activity && activity.status === 'Pendente' ? (
            <button type="button" className="crm-btn-secondary ag-done-btn" onClick={() => void complete()} disabled={saving}>
              <i className="ti ti-circle-check" aria-hidden="true" />
              Concluir
            </button>
          ) : null}
          <button type="button" className="crm-btn-secondary" onClick={onClose} disabled={saving} style={{ marginLeft: activity && activity.status === 'Pendente' ? undefined : 'auto' }}>
            Cancelar
          </button>
          <button type="submit" className="crm-btn-primary" disabled={saving}>
            {saving ? 'Salvando…' : activity ? 'Salvar alterações' : 'Criar atividade'}
          </button>
        </div>
      </form>
    </Modal>
  );
};

export default ActivityModal;
