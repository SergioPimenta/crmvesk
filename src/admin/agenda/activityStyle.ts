import type { Activity, AgendaType } from '../../contexts/CrmDataContext';
import type { Span } from './dateUtils';

export const AGENDA_TYPES: AgendaType[] = ['Reunião', 'Ligação', 'Follow-up', 'Tarefa'];

/** Ícone (Tabler) e cor de cada tipo de atividade. */
export const TYPE_META: Record<AgendaType, { icon: string; color: string }> = {
  Reunião: { icon: 'ti-users', color: '#378add' },
  Ligação: { icon: 'ti-phone', color: '#25d366' },
  'Follow-up': { icon: 'ti-refresh', color: '#ef9f27' },
  Tarefa: { icon: 'ti-checkbox', color: '#9b8cf7' },
};

/** Atividade já posicionada no calendário (só as que têm data). */
export type CalendarEvent = { activity: Activity; span: Span };

export type AgendaFilters = {
  types: AgendaType[];
  /** 'all' | 'mine' | 'none' (sem responsável) | id de um usuário. */
  assignee: string;
  showDone: boolean;
  query: string;
};

export const DEFAULT_FILTERS: AgendaFilters = {
  types: [...AGENDA_TYPES],
  assignee: 'all',
  showDone: true,
  query: '',
};
