import type { Activity } from '../../contexts/CrmDataContext';
import { TYPE_META } from './activityStyle';
import { formatTime, isOverdue, type Span } from './dateUtils';

/** Classes de estado de uma atividade no calendário: concluída, cancelada ou atrasada. */
export const eventStateClass = (a: Activity, now: Date) =>
  a.status === 'Concluída' ? ' done' : a.status === 'Cancelada' ? ' cancelled' : isOverdue(a, now) ? ' overdue' : '';

type Props = {
  activity: Activity;
  span: Span;
  now: Date;
  draggable?: boolean;
  onOpen: (a: Activity) => void;
  onDragStart?: (e: React.DragEvent, a: Activity) => void;
};

/** Faixa compacta de um compromisso (usada na visão de mês). */
const EventChip = ({ activity, span, now, draggable, onOpen, onDragStart }: Props) => (
  <button
    type="button"
    className={`ag-chip${eventStateClass(activity, now)}`}
    style={{ ['--ag-color' as string]: TYPE_META[activity.tipo].color }}
    draggable={draggable}
    onDragStart={(e) => onDragStart?.(e, activity)}
    onClick={(e) => {
      e.stopPropagation();
      onOpen(activity);
    }}
    title={`${activity.titulo}${span.allDay ? ' · dia inteiro' : ` · ${formatTime(span.start)}`}`}
  >
    {span.allDay ? null : <span className="ag-chip-time">{formatTime(span.start)}</span>}
    <span className="ag-chip-title">{activity.titulo}</span>
  </button>
);

export default EventChip;
