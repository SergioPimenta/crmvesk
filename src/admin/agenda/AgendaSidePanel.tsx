import { useMemo } from 'react';
import CrmCheckbox from '../../components/crm/CrmCheckbox';
import type { Activity } from '../../contexts/CrmDataContext';
import ActivityDetails from './ActivityDetails';
import { TYPE_META } from './activityStyle';
import { activitySpan, addDays, formatWhen, isOverdue, spanOnDay, startOfDay } from './dateUtils';

type Props = {
  activities: Activity[];
  now: Date;
  getContactName: (id?: string) => string;
  onOpen: (a: Activity) => void;
  onToggleDone: (a: Activity) => void;
};

type Section = { key: string; title: string; tone?: 'danger'; items: Activity[]; hint?: string };

const byStart = (a: Activity, b: Activity) =>
  (activitySpan(a)?.start.getTime() ?? Infinity) - (activitySpan(b)?.start.getTime() ?? Infinity);

/** Painel lateral: o que está atrasado, o que é de hoje, o que vem a seguir e as atividades antigas sem data. */
const AgendaSidePanel = ({ activities, now, getContactName, onOpen, onToggleDone }: Props) => {
  const sections = useMemo<Section[]>(() => {
    const pending = activities.filter((a) => a.status === 'Pendente');
    const today = startOfDay(now);
    const weekEnd = addDays(today, 8);

    const overdue = pending.filter((a) => isOverdue(a, now)).sort(byStart);
    const overdueIds = new Set(overdue.map((a) => a.id));
    const todayItems = pending
      .filter((a) => {
        const span = activitySpan(a);
        return span && !overdueIds.has(a.id) && spanOnDay(span, today);
      })
      .sort(byStart);
    const upcoming = pending
      .filter((a) => {
        const span = activitySpan(a);
        return span && span.start >= addDays(today, 1) && span.start < weekEnd;
      })
      .sort(byStart);
    const undated = pending.filter((a) => !a.startAt);

    return [
      { key: 'overdue', title: 'Atrasadas', tone: 'danger', items: overdue },
      { key: 'today', title: 'Hoje', items: todayItems },
      { key: 'upcoming', title: 'Próximos 7 dias', items: upcoming },
      {
        key: 'undated',
        title: 'Sem data',
        items: undated,
        hint: 'Atividades antigas: abra e escolha uma data para vê-las no calendário.',
      },
    ];
  }, [activities, now]);

  const total = sections.reduce((n, s) => n + s.items.length, 0);

  return (
    <aside className="ag-side" aria-label="Resumo das atividades">
      {sections.map((section) =>
        section.items.length === 0 ? null : (
          <section key={section.key} className="ag-side-section">
            <h3 className={`ag-side-title${section.tone === 'danger' ? ' danger' : ''}`}>
              {section.title}
              <span className="pipeline-badge">{section.items.length}</span>
            </h3>
            {section.hint ? <p className="ag-side-hint">{section.hint}</p> : null}
            <div role="list">
              {section.items.slice(0, section.key === 'undated' ? 5 : 8).map((a) => {
                const span = activitySpan(a);
                return (
                  <div key={a.id} className="ag-side-item" role="listitem">
                    <CrmCheckbox
                      ariaLabel={`Concluir ${a.titulo}`}
                      checked={false}
                      onChange={() => onToggleDone(a)}
                    />
                    <div className="ag-side-col">
                      <button type="button" className="ag-side-body" onClick={() => onOpen(a)}>
                        <span className="ag-side-name">
                          <i
                            className={`ti ${TYPE_META[a.tipo].icon}`}
                            style={{ color: TYPE_META[a.tipo].color }}
                            aria-hidden="true"
                          />
                          {a.titulo}
                        </span>
                        <span className="ag-side-meta">
                          {span ? formatWhen(span.start, span.allDay, now) : a.quando || 'Sem data'}
                        </span>
                      </button>
                      <ActivityDetails activity={a} contactName={a.contatoId ? getContactName(a.contatoId) : ''} />
                    </div>
                  </div>
                );
              })}
              {section.items.length > (section.key === 'undated' ? 5 : 8) ? (
                <div className="ag-side-more">+{section.items.length - (section.key === 'undated' ? 5 : 8)} no calendário</div>
              ) : null}
            </div>
          </section>
        )
      )}
      {total === 0 ? (
        <div className="ag-side-empty">
          <i className="ti ti-circle-check" aria-hidden="true" />
          <p>Tudo em dia! Nenhuma atividade pendente nos próximos dias.</p>
        </div>
      ) : null}
    </aside>
  );
};

export default AgendaSidePanel;
