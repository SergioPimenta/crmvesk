import { useMemo } from 'react';
import { useCrmData } from '../../contexts/CrmDataContext';
import { TYPE_META } from '../agenda/activityStyle';
import { activitySpan, formatWhen, isOverdue } from '../agenda/dateUtils';

type Props = {
  contactId: string;
  /** Fecha esta tela e abre o formulário de atividade já com o contato. */
  onSchedule: () => void;
};

/** Atividades do contato (próximas primeiro, depois as já feitas) com atalho para agendar uma nova. */
const ContactActivities = ({ contactId, onSchedule }: Props) => {
  const { activities } = useCrmData();
  const now = new Date();

  const items = useMemo(() => {
    const mine = activities.filter((a) => a.contatoId === contactId);
    const start = (a: (typeof mine)[number]) => activitySpan(a)?.start.getTime() ?? 0;
    const open = mine.filter((a) => a.status === 'Pendente').sort((a, b) => (start(a) || Infinity) - (start(b) || Infinity));
    const closed = mine.filter((a) => a.status !== 'Pendente').sort((a, b) => start(b) - start(a));
    return [...open, ...closed];
  }, [activities, contactId]);

  return (
    <div className="ag-form-wide ct-activities">
      <div className="ct-activities-head">
        <div className="ag-label">Atividades ({items.length})</div>
        <button type="button" className="crm-action-btn" onClick={onSchedule}>
          <i className="ti ti-calendar-plus" aria-hidden="true" />
          Agendar
        </button>
      </div>
      {items.length === 0 ? (
        <div className="ct-activities-empty">Nenhuma atividade com este contato ainda.</div>
      ) : (
        <div className="ct-activities-list" role="list">
          {items.slice(0, 6).map((a) => {
            const span = activitySpan(a);
            const overdue = isOverdue(a, now);
            return (
              <div key={a.id} className={`ct-activity${a.status !== 'Pendente' ? ' done' : ''}`} role="listitem">
                <i className={`ti ${TYPE_META[a.tipo].icon}`} style={{ color: TYPE_META[a.tipo].color }} aria-hidden="true" />
                <div className="ct-activity-body">
                  <span className="ct-activity-title">{a.titulo}</span>
                  <span className={`ct-activity-when${overdue ? ' overdue' : ''}`}>
                    {span ? formatWhen(span.start, span.allDay, now) : a.quando || 'Sem data'}
                    {overdue ? ' · atrasada' : ''}
                  </span>
                </div>
                <span className={`pill-status${a.status === 'Concluída' ? ' ok' : ''}`}>{a.status}</span>
              </div>
            );
          })}
          {items.length > 6 ? <div className="ct-activities-empty">+{items.length - 6} na Agenda</div> : null}
        </div>
      )}
    </div>
  );
};

export default ContactActivities;
