// Funções de data do calendário. Puras e sem dependências do projeto (testadas em server/tests/agendaDateUtils.test.js).
// Todas trabalham no fuso do navegador; o banco guarda UTC e o ISO faz a conversão.

export type AgendaView = 'Dia' | 'Semana' | 'Mês';

export const MS_MINUTE = 60_000;
export const DEFAULT_DURATION_MIN = 60;

const MONTHS = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];
const MONTHS_SHORT = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];
export const WEEKDAYS_SHORT = ['Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb', 'Dom'];

const pad = (n: number) => String(n).padStart(2, '0');

export const startOfDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate());
export const addDays = (d: Date, n: number) => new Date(d.getFullYear(), d.getMonth(), d.getDate() + n, d.getHours(), d.getMinutes(), d.getSeconds());
export const addMinutes = (d: Date, n: number) => new Date(d.getTime() + n * MS_MINUTE);
export const isSameDay = (a: Date, b: Date) =>
  a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();

/** Segunda-feira da semana de `d` (a semana do calendário começa na segunda). */
export const startOfWeek = (d: Date) => {
  const day = startOfDay(d);
  const offset = (day.getDay() + 6) % 7; // segunda = 0 ... domingo = 6
  return addDays(day, -offset);
};

export const startOfMonth = (d: Date) => new Date(d.getFullYear(), d.getMonth(), 1);

/** 42 dias (6 semanas) cobrindo o mês de `d`, começando na segunda-feira. */
export const monthGrid = (d: Date) => {
  const first = startOfWeek(startOfMonth(d));
  return Array.from({ length: 42 }, (_, i) => addDays(first, i));
};

/** Dias exibidos: 1 (Dia), 7 (Semana) ou 42 (Mês). */
export const visibleDays = (view: AgendaView, cursor: Date) =>
  view === 'Dia' ? [startOfDay(cursor)] : view === 'Semana' ? Array.from({ length: 7 }, (_, i) => addDays(startOfWeek(cursor), i)) : monthGrid(cursor);

/** Intervalo visível [from, to) — `to` é exclusivo. */
export const visibleRange = (view: AgendaView, cursor: Date) => {
  const days = visibleDays(view, cursor);
  return { from: days[0], to: addDays(days[days.length - 1], 1) };
};

export const shiftCursor = (view: AgendaView, cursor: Date, direction: -1 | 1) => {
  if (view === 'Dia') return addDays(cursor, direction);
  if (view === 'Semana') return addDays(cursor, 7 * direction);
  // Mês: vai para o dia 1 para não "pular" meses curtos (31 de março + 1 mês).
  return new Date(cursor.getFullYear(), cursor.getMonth() + direction, 1);
};

export const rangeLabel = (view: AgendaView, cursor: Date) => {
  if (view === 'Dia') return `${cursor.getDate()} de ${MONTHS[cursor.getMonth()]} de ${cursor.getFullYear()}`;
  if (view === 'Mês') return `${MONTHS[cursor.getMonth()]} de ${cursor.getFullYear()}`;
  const first = startOfWeek(cursor);
  const last = addDays(first, 6);
  const sameMonth = first.getMonth() === last.getMonth();
  const left = sameMonth ? `${first.getDate()}` : `${first.getDate()} ${MONTHS_SHORT[first.getMonth()]}`;
  return `${left} – ${last.getDate()} ${MONTHS_SHORT[last.getMonth()]} ${last.getFullYear()}`;
};

export const formatTime = (d: Date) => `${pad(d.getHours())}:${pad(d.getMinutes())}`;

export const formatDayMonth = (d: Date) => `${pad(d.getDate())}/${pad(d.getMonth() + 1)}`;

/** Data e hora legíveis: "Hoje, 10:00", "Amanhã, 14:30", "05/10, 09:00" ou "05/10/2027, 09:00". */
export const formatWhen = (d: Date, allDay: boolean, now: Date = new Date()) => {
  const today = startOfDay(now);
  const diff = Math.round((startOfDay(d).getTime() - today.getTime()) / 86_400_000);
  let day: string;
  if (diff === 0) day = 'Hoje';
  else if (diff === 1) day = 'Amanhã';
  else if (diff === -1) day = 'Ontem';
  else day = d.getFullYear() === now.getFullYear() ? formatDayMonth(d) : `${formatDayMonth(d)}/${d.getFullYear()}`;
  return allDay ? `${day} · dia inteiro` : `${day}, ${formatTime(d)}`;
};

/** Valores para <input type="date"> e <input type="time"> no fuso local. */
export const toInputs = (d: Date) => ({
  date: `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`,
  time: `${pad(d.getHours())}:${pad(d.getMinutes())}`,
});

/** Junta data (AAAA-MM-DD) e hora (HH:MM) do formulário em um Date local; null se faltar ou for inválido. */
export const fromInputs = (date: string, time: string): Date | null => {
  const d = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date);
  const t = /^(\d{2}):(\d{2})$/.exec(time || '00:00');
  if (!d || !t) return null;
  const result = new Date(Number(d[1]), Number(d[2]) - 1, Number(d[3]), Number(t[1]), Number(t[2]));
  return Number.isNaN(result.getTime()) ? null : result;
};

export const minutesFromMidnight = (d: Date) => d.getHours() * 60 + d.getMinutes();

export const snapMinutes = (minutes: number, step = 15) => Math.round(minutes / step) * step;

export const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

export type Span = { start: Date; end: Date; allDay: boolean };

type SpanSource = { startAt?: string | null; endAt?: string | null; allDay?: boolean };

/**
 * Período de uma atividade no calendário, ou null se ela não tem data (atividades antigas).
 * Sem término, dura 60 min; dia inteiro ocupa o dia todo (término exclusivo à meia-noite seguinte).
 */
export const activitySpan = (a: SpanSource): Span | null => {
  if (!a.startAt) return null;
  const start = new Date(a.startAt);
  if (Number.isNaN(start.getTime())) return null;
  if (a.allDay) {
    const day = startOfDay(start);
    return { start: day, end: addDays(day, 1), allDay: true };
  }
  const parsedEnd = a.endAt ? new Date(a.endAt) : null;
  const end = parsedEnd && !Number.isNaN(parsedEnd.getTime()) && parsedEnd > start ? parsedEnd : addMinutes(start, DEFAULT_DURATION_MIN);
  return { start, end, allDay: false };
};

/** Um compromisso aparece no dia `day` se o período cruza esse dia. */
export const spanOnDay = (span: Span, day: Date) => {
  const from = startOfDay(day);
  const to = addDays(from, 1);
  return span.start < to && span.end > from;
};

/** Pendente e já terminou: atrasada. Atividades sem data nunca são "atrasadas". */
export const isOverdue = (a: SpanSource & { status: string }, now: Date = new Date()) => {
  if (a.status !== 'Pendente') return false;
  const span = activitySpan(a);
  return span ? span.end <= now : false;
};

export type LayoutItem = { id: string; start: Date; end: Date };
export type Placement = { column: number; columns: number };

/**
 * Coloca compromissos que se sobrepõem lado a lado: cada grupo de sobreposição divide a largura em colunas.
 */
export const layoutOverlaps = (items: LayoutItem[]): Map<string, Placement> => {
  const sorted = [...items].sort((a, b) => a.start.getTime() - b.start.getTime() || b.end.getTime() - a.end.getTime());
  const result = new Map<string, Placement>();

  let group: { item: LayoutItem; column: number }[] = [];
  let groupEnd = 0;

  const flush = () => {
    const columns = group.reduce((max, g) => Math.max(max, g.column + 1), 1);
    group.forEach((g) => result.set(g.item.id, { column: g.column, columns }));
    group = [];
  };

  for (const item of sorted) {
    if (group.length && item.start.getTime() >= groupEnd) flush();
    const used = new Set(group.filter((g) => g.item.end > item.start).map((g) => g.column));
    let column = 0;
    while (used.has(column)) column += 1;
    group.push({ item, column });
    groupEnd = Math.max(groupEnd, item.end.getTime());
  }
  if (group.length) flush();
  return result;
};
