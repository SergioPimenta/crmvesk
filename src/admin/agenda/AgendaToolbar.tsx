import type { AgendaType } from '../../contexts/CrmDataContext';
import { AGENDA_TYPES, TYPE_META, type AgendaFilters } from './activityStyle';
import { rangeLabel, type AgendaView } from './dateUtils';

type Member = { id: number; name: string };

type Props = {
  view: AgendaView;
  cursor: Date;
  onViewChange: (view: AgendaView) => void;
  onPrev: () => void;
  onNext: () => void;
  onToday: () => void;
  filters: AgendaFilters;
  onFiltersChange: (filters: AgendaFilters) => void;
  members: Member[];
};

const VIEWS: AgendaView[] = ['Dia', 'Semana', 'Mês'];

/** Navegação por data, troca de visão (Dia / Semana / Mês) e filtros do calendário. */
const AgendaToolbar = ({ view, cursor, onViewChange, onPrev, onNext, onToday, filters, onFiltersChange, members }: Props) => {
  const toggleType = (type: AgendaType) => {
    const has = filters.types.includes(type);
    onFiltersChange({ ...filters, types: has ? filters.types.filter((t) => t !== type) : [...filters.types, type] });
  };

  return (
    <div className="ag-toolbar">
      <div className="ag-nav">
        <button type="button" className="crm-icon-btn" onClick={onPrev} aria-label="Período anterior">
          <i className="ti ti-chevron-left" aria-hidden="true" />
        </button>
        <button type="button" className="crm-btn-secondary ag-today-btn" onClick={onToday}>
          Hoje
        </button>
        <button type="button" className="crm-icon-btn" onClick={onNext} aria-label="Próximo período">
          <i className="ti ti-chevron-right" aria-hidden="true" />
        </button>
        <h2 className="ag-range" aria-live="polite">
          {rangeLabel(view, cursor)}
        </h2>
      </div>

      <div className="ag-filters">
        <div className="ag-type-filters" role="group" aria-label="Filtrar por tipo">
          {AGENDA_TYPES.map((type) => {
            const active = filters.types.includes(type);
            return (
              <button
                key={type}
                type="button"
                className={`ag-type-chip${active ? ' active' : ''}`}
                style={{ ['--ag-color' as string]: TYPE_META[type].color }}
                aria-pressed={active}
                onClick={() => toggleType(type)}
              >
                <span className="ag-dot" aria-hidden="true" />
                {type}
              </button>
            );
          })}
        </div>

        <select
          className="ag-select"
          value={filters.assignee}
          onChange={(e) => onFiltersChange({ ...filters, assignee: e.target.value })}
          aria-label="Filtrar por responsável"
        >
          <option value="all">Todos os responsáveis</option>
          <option value="mine">Minhas</option>
          <option value="none">Sem responsável</option>
          {members.map((m) => (
            <option key={m.id} value={String(m.id)}>
              {m.name}
            </option>
          ))}
        </select>

        <label className="ag-check-inline">
          <input
            type="checkbox"
            checked={filters.showDone}
            onChange={(e) => onFiltersChange({ ...filters, showDone: e.target.checked })}
          />
          Mostrar concluídas
        </label>

        <div className="segmented" role="tablist" aria-label="Visão do calendário">
          {VIEWS.map((v) => (
            <button
              key={v}
              type="button"
              className={`segmented-btn${view === v ? ' active' : ''}`}
              onClick={() => onViewChange(v)}
              role="tab"
              aria-selected={view === v}
            >
              {v}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
};

export default AgendaToolbar;
