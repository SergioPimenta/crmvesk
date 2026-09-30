import type { Activity } from '../../contexts/CrmDataContext';
import type { CalendarEvent } from './activityStyle';
import EventChip from './EventChip';
import { isSameDay, monthGrid, spanOnDay, WEEKDAYS_SHORT } from './dateUtils';

type Props = {
  cursor: Date;
  today: Date;
  events: CalendarEvent[];
  onOpenActivity: (a: Activity) => void;
  /** Clique num dia vazio: criar uma atividade nesse dia. */
  onCreateOnDay: (day: Date) => void;
  /** Clique em "+N mais": abrir o dia. */
  onOpenDay: (day: Date) => void;
  /** Arrastar uma atividade para outro dia. */
  onMoveToDay: (activityId: string, day: Date) => void;
};

const MAX_CHIPS = 3;
const DRAG_TYPE = 'text/x-agenda-activity';

/** Calendário do mês (6 semanas). Arraste uma atividade para outro dia para remarcar. */
const MonthView = ({ cursor, today, events, onOpenActivity, onCreateOnDay, onOpenDay, onMoveToDay }: Props) => {
  const days = monthGrid(cursor);

  return (
    <div className="ag-month" role="grid" aria-label="Calendário do mês">
      <div className="ag-month-head" role="row">
        {WEEKDAYS_SHORT.map((d) => (
          <div key={d} role="columnheader">
            {d}
          </div>
        ))}
      </div>
      <div className="ag-month-body">
        {days.map((day) => {
          const dayEvents = events
            .filter((e) => spanOnDay(e.span, day))
            .sort((a, b) => Number(b.span.allDay) - Number(a.span.allDay) || a.span.start.getTime() - b.span.start.getTime());
          const outside = day.getMonth() !== cursor.getMonth();
          const isToday = isSameDay(day, today);
          return (
            <div
              key={day.toISOString()}
              className={`ag-month-cell${outside ? ' outside' : ''}${isToday ? ' today' : ''}`}
              role="gridcell"
              onClick={() => onCreateOnDay(day)}
              onDragOver={(e) => {
                if (e.dataTransfer.types.includes(DRAG_TYPE)) e.preventDefault();
              }}
              onDrop={(e) => {
                const id = e.dataTransfer.getData(DRAG_TYPE);
                if (!id) return;
                e.preventDefault();
                onMoveToDay(id, day);
              }}
            >
              <button
                type="button"
                className="ag-month-daynum"
                onClick={(e) => {
                  e.stopPropagation();
                  onOpenDay(day);
                }}
                aria-label={`Abrir ${day.getDate()}/${day.getMonth() + 1}`}
              >
                {day.getDate()}
              </button>
              <div className="ag-month-events">
                {dayEvents.slice(0, MAX_CHIPS).map((e) => (
                  <EventChip
                    key={e.activity.id}
                    activity={e.activity}
                    span={e.span}
                    now={today}
                    draggable
                    onOpen={onOpenActivity}
                    onDragStart={(ev, a) => {
                      ev.dataTransfer.setData(DRAG_TYPE, a.id);
                      ev.dataTransfer.effectAllowed = 'move';
                    }}
                  />
                ))}
                {dayEvents.length > MAX_CHIPS ? (
                  <button
                    type="button"
                    className="ag-more"
                    onClick={(e) => {
                      e.stopPropagation();
                      onOpenDay(day);
                    }}
                  >
                    +{dayEvents.length - MAX_CHIPS} mais
                  </button>
                ) : null}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};

export default MonthView;
