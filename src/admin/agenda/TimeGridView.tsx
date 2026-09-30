import { useEffect, useMemo, useRef, useState } from 'react';
import type { Activity } from '../../contexts/CrmDataContext';
import { TYPE_META, type CalendarEvent } from './activityStyle';
import EventChip, { eventStateClass } from './EventChip';
import {
  addDays,
  addMinutes,
  clamp,
  formatTime,
  isSameDay,
  layoutOverlaps,
  minutesFromMidnight,
  snapMinutes,
  spanOnDay,
  startOfDay,
  WEEKDAYS_SHORT,
  type Span,
} from './dateUtils';

const HOUR_PX = 48;
const DAY_PX = HOUR_PX * 24;
const SNAP_MIN = 15;
const MIN_EVENT_MIN = 15;
const MOVE_THRESHOLD_PX = 4;

type Props = {
  days: Date[];
  /** Hora atual (atualizada a cada minuto pela página) — desenha a linha do "agora". */
  now: Date;
  events: CalendarEvent[];
  onOpenActivity: (a: Activity) => void;
  /** Clique num horário vazio: criar uma atividade nesse horário. */
  onCreateAt: (start: Date) => void;
  onMove: (activityId: string, start: Date, end: Date) => void;
  onResize: (activityId: string, end: Date) => void;
};

type Drag = {
  id: string;
  mode: 'move' | 'resize';
  startX: number;
  startY: number;
  originDay: number;
  origStart: Date;
  origEnd: Date;
  deltaMin: number;
  dayOffset: number;
  moved: boolean;
};

/** Período da atividade enquanto ela é arrastada (ou o original, se não está sendo arrastada). */
function previewSpan(span: Span, drag: Drag | null, id: string): Span {
  if (!drag || drag.id !== id || !drag.moved) return span;
  if (drag.mode === 'resize') {
    const minEnd = addMinutes(drag.origStart, MIN_EVENT_MIN);
    const end = addMinutes(drag.origEnd, drag.deltaMin);
    return { ...span, end: end < minEnd ? minEnd : end };
  }
  const duration = drag.origEnd.getTime() - drag.origStart.getTime();
  const start = addMinutes(addDays(drag.origStart, drag.dayOffset), drag.deltaMin);
  return { ...span, start, end: new Date(start.getTime() + duration) };
}

/**
 * Grade de horas para as visões Dia e Semana: clique num horário vazio para criar, arraste para remarcar
 * (muda de dia na semana) e puxe a borda de baixo para alterar a duração. Passo de 15 minutos.
 */
const TimeGridView = ({ days, now, events, onOpenActivity, onCreateAt, onMove, onResize }: Props) => {
  const scrollRef = useRef<HTMLDivElement>(null);
  const colsRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef<Drag | null>(null);
  const [drag, setDrag] = useState<Drag | null>(null);

  const setDragState = (next: Drag | null) => {
    dragRef.current = next;
    setDrag(next);
  };

  // Abre a rolagem perto da hora atual (se hoje está visível) ou às 7h.
  useEffect(() => {
    const todayVisible = days.some((d) => isSameDay(d, now));
    const hour = todayVisible ? Math.max(0, now.getHours() - 1) : 7;
    if (scrollRef.current) scrollRef.current.scrollTop = hour * HOUR_PX;
    // só na montagem e quando a semana visível muda de conjunto de dias
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [days[0]?.getTime(), days.length]);

  const effective = useMemo(
    () => events.map((e) => ({ ...e, span: previewSpan(e.span, drag, e.activity.id) })),
    [events, drag]
  );

  const allDayEvents = effective.filter((e) => e.span.allDay);
  const timed = effective.filter((e) => !e.span.allDay);

  const beginDrag = (e: React.PointerEvent, ev: CalendarEvent, originDay: number, mode: Drag['mode']) => {
    if (e.button !== 0) return;
    trackPointer();
    setDragState({
      id: ev.activity.id,
      mode,
      startX: e.clientX,
      startY: e.clientY,
      originDay,
      origStart: ev.span.start,
      origEnd: ev.span.end,
      deltaMin: 0,
      dayOffset: 0,
      moved: false,
    });
  };

  // Sempre o que a tela mostra agora (os ouvintes da janela não podem ficar com dados velhos).
  const latest = useRef({ days, events, onOpenActivity, onMove, onResize });
  latest.current = { days, events, onOpenActivity, onMove, onResize };

  // Durante o arrasto os ouvintes ficam na janela, e não no bloco: ao mudar de dia o bloco é desenhado
  // em outra coluna (outro elemento) e o navegador perderia o ponteiro.
  const stopTrackingRef = useRef<(() => void) | null>(null);
  const trackPointer = () => {
    stopTrackingRef.current?.();

    const handleMove = (e: PointerEvent) => {
      const d = dragRef.current;
      if (!d) return;
      const { days: currentDays } = latest.current;
      const dy = e.clientY - d.startY;
      const dx = e.clientX - d.startX;
      const moved = d.moved || Math.abs(dy) > MOVE_THRESHOLD_PX || Math.abs(dx) > MOVE_THRESHOLD_PX;
      const deltaMin = snapMinutes((dy / HOUR_PX) * 60, SNAP_MIN);
      let dayOffset = d.dayOffset;
      if (d.mode === 'move' && currentDays.length > 1 && colsRef.current) {
        const rect = colsRef.current.getBoundingClientRect();
        const index = clamp(Math.floor(((e.clientX - rect.left) / rect.width) * currentDays.length), 0, currentDays.length - 1);
        dayOffset = index - d.originDay;
      }
      setDragState({ ...d, moved, deltaMin, dayOffset });
    };

    const finish = (cancelled: boolean) => {
      const d = dragRef.current;
      if (!d) return;
      stopTrackingRef.current?.();
      setDragState(null);
      if (cancelled) return;
      const { events: currentEvents, onOpenActivity: open, onMove: move, onResize: resize } = latest.current;
      if (!d.moved) {
        const clicked = currentEvents.find((ev) => ev.activity.id === d.id);
        if (clicked) open(clicked.activity);
        return;
      }
      const span = previewSpan({ start: d.origStart, end: d.origEnd, allDay: false }, d, d.id);
      if (d.mode === 'move') {
        if (span.start.getTime() !== d.origStart.getTime()) move(d.id, span.start, span.end);
      } else if (span.end.getTime() !== d.origEnd.getTime()) {
        resize(d.id, span.end);
      }
    };

    const handleUp = () => finish(false);
    const handleCancel = () => finish(true);
    const previousSelect = document.body.style.userSelect;
    document.body.style.userSelect = 'none';
    window.addEventListener('pointermove', handleMove);
    window.addEventListener('pointerup', handleUp);
    window.addEventListener('pointercancel', handleCancel);
    stopTrackingRef.current = () => {
      document.body.style.userSelect = previousSelect;
      window.removeEventListener('pointermove', handleMove);
      window.removeEventListener('pointerup', handleUp);
      window.removeEventListener('pointercancel', handleCancel);
      stopTrackingRef.current = null;
    };
  };

  // Ao sair da tela no meio de um arrasto, solta os ouvintes.
  useEffect(() => () => stopTrackingRef.current?.(), []);

  const createAtClick = (e: React.MouseEvent<HTMLDivElement>, day: Date) => {
    if (e.target !== e.currentTarget) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const minutes = clamp(snapMinutes(((e.clientY - rect.top) / HOUR_PX) * 60, 30), 0, 23 * 60);
    onCreateAt(addMinutes(startOfDay(day), minutes));
  };

  const nowMinutes = minutesFromMidnight(now);

  return (
    <div className="ag-timegrid">
      <div className="ag-tg-head">
        <div className="ag-gutter" />
        {days.map((day) => (
          <div key={day.toISOString()} className={`ag-tg-dayhead${isSameDay(day, now) ? ' today' : ''}`}>
            <span className="ag-dow">{WEEKDAYS_SHORT[(day.getDay() + 6) % 7]}</span>
            <span className="ag-daynum">{day.getDate()}</span>
          </div>
        ))}
      </div>

      {allDayEvents.length > 0 ? (
        <div className="ag-allday">
          <div className="ag-gutter ag-allday-label">dia todo</div>
          {days.map((day) => (
            <div key={day.toISOString()} className="ag-allday-cell">
              {allDayEvents
                .filter((e) => spanOnDay(e.span, day))
                .map((e) => (
                  <EventChip key={e.activity.id} activity={e.activity} span={e.span} now={now} onOpen={onOpenActivity} />
                ))}
            </div>
          ))}
        </div>
      ) : null}

      <div className="ag-tg-scroll" ref={scrollRef}>
        <div className="ag-tg-inner" style={{ height: DAY_PX }}>
          <div className="ag-gutter ag-hours" aria-hidden="true">
            {Array.from({ length: 24 }, (_, h) => (
              <div key={h} className="ag-hour-label" style={{ top: h * HOUR_PX }}>
                {h === 0 ? '' : `${String(h).padStart(2, '0')}:00`}
              </div>
            ))}
          </div>

          <div className="ag-cols" ref={colsRef}>
            {days.map((day, dayIndex) => {
              const dayStart = startOfDay(day);
              const dayEnd = addDays(dayStart, 1);
              const segments = timed
                .filter((e) => spanOnDay(e.span, day))
                .map((e) => ({
                  event: e,
                  start: e.span.start < dayStart ? dayStart : e.span.start,
                  end: e.span.end > dayEnd ? dayEnd : e.span.end,
                }));
              const placement = layoutOverlaps(segments.map((s) => ({ id: s.event.activity.id, start: s.start, end: s.end })));
              return (
                <div
                  key={day.toISOString()}
                  className={`ag-col${isSameDay(day, now) ? ' today' : ''}`}
                  onClick={(e) => createAtClick(e, day)}
                >
                  {isSameDay(day, now) ? (
                    <div className="ag-now" style={{ top: (nowMinutes / 60) * HOUR_PX }} aria-hidden="true" />
                  ) : null}
                  {segments.map(({ event, start, end }) => {
                    const place = placement.get(event.activity.id) ?? { column: 0, columns: 1 };
                    const top = (minutesFromMidnight(start) / 60) * HOUR_PX;
                    const minutes = Math.max((end.getTime() - start.getTime()) / 60_000, MIN_EVENT_MIN);
                    const height = Math.max((minutes / 60) * HOUR_PX, 20);
                    const dragging = drag?.id === event.activity.id && drag.moved;
                    return (
                      <div
                        key={event.activity.id}
                        className={`ag-event${eventStateClass(event.activity, now)}${dragging ? ' dragging' : ''}`}
                        role="button"
                        tabIndex={0}
                        style={{
                          top,
                          height,
                          left: `calc(${(place.column / place.columns) * 100}% + 1px)`,
                          width: `calc(${100 / place.columns}% - 3px)`,
                          ['--ag-color' as string]: TYPE_META[event.activity.tipo].color,
                        }}
                        onPointerDown={(e) => beginDrag(e, event, dayIndex, 'move')}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter' || e.key === ' ') {
                            e.preventDefault();
                            onOpenActivity(event.activity);
                          }
                        }}
                        aria-label={`${event.activity.titulo}, ${formatTime(event.span.start)} às ${formatTime(event.span.end)}`}
                      >
                        <div className="ag-event-title">
                          <i className={`ti ${TYPE_META[event.activity.tipo].icon}`} aria-hidden="true" />
                          {event.activity.titulo}
                        </div>
                        {height >= 34 ? (
                          <div className="ag-event-time">
                            {formatTime(event.span.start)} – {formatTime(event.span.end)}
                          </div>
                        ) : null}
                        <div
                          className="ag-resize"
                          onPointerDown={(e) => {
                            e.stopPropagation();
                            beginDrag(e, event, dayIndex, 'resize');
                          }}
                          aria-hidden="true"
                        />
                      </div>
                    );
                  })}
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
};

export default TimeGridView;
