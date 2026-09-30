import test from 'node:test';
import assert from 'node:assert/strict';
import {
  activitySpan,
  addDays,
  formatWhen,
  fromInputs,
  isOverdue,
  isSameDay,
  layoutOverlaps,
  monthGrid,
  rangeLabel,
  shiftCursor,
  snapMinutes,
  spanOnDay,
  startOfWeek,
  toInputs,
  visibleDays,
  visibleRange,
} from '../../src/admin/agenda/dateUtils.ts';

// Datas locais (o relógio do teste não importa: tudo é construído com o construtor local).
const d = (y, m, day, h = 0, min = 0) => new Date(y, m - 1, day, h, min);

test('a semana começa na segunda-feira', () => {
  // 30/09/2026 é quarta-feira
  assert.equal(startOfWeek(d(2026, 9, 30)).getDate(), 28);
  assert.equal(startOfWeek(d(2026, 9, 28)).getDate(), 28); // a própria segunda
  assert.equal(startOfWeek(d(2026, 10, 4)).getDate(), 28); // domingo pertence à semana que começou na segunda
  assert.equal(startOfWeek(d(2026, 10, 5)).getDate(), 5);
});

test('monthGrid tem 42 dias, começa na segunda e cobre o mês inteiro', () => {
  const grid = monthGrid(d(2026, 9, 15));
  assert.equal(grid.length, 42);
  assert.equal(grid[0].getDay(), 1);
  assert.ok(grid.some((x) => isSameDay(x, d(2026, 9, 1))));
  assert.ok(grid.some((x) => isSameDay(x, d(2026, 9, 30))));
});

test('visibleDays e visibleRange por visão', () => {
  const cursor = d(2026, 9, 30, 15);
  assert.equal(visibleDays('Dia', cursor).length, 1);
  assert.equal(visibleDays('Semana', cursor).length, 7);
  assert.equal(visibleDays('Mês', cursor).length, 42);

  const week = visibleRange('Semana', cursor);
  assert.equal(week.from.getDate(), 28);
  assert.equal(week.to.getDate(), 5); // exclusivo: segunda seguinte
  assert.equal(week.to.getMonth(), 9);
});

test('shiftCursor: dia, semana e mês (sem pular meses curtos)', () => {
  assert.equal(shiftCursor('Dia', d(2026, 9, 30), 1).getDate(), 1); // 1º de outubro
  assert.equal(shiftCursor('Semana', d(2026, 9, 30), -1).getDate(), 23);
  const next = shiftCursor('Mês', d(2026, 1, 31), 1);
  assert.equal(next.getMonth(), 1); // fevereiro, e não março
  assert.equal(next.getDate(), 1);
  assert.equal(shiftCursor('Mês', d(2026, 1, 15), -1).getFullYear(), 2025);
});

test('rangeLabel', () => {
  assert.equal(rangeLabel('Dia', d(2026, 9, 30)), '30 de setembro de 2026');
  assert.equal(rangeLabel('Mês', d(2026, 9, 30)), 'setembro de 2026');
  assert.equal(rangeLabel('Semana', d(2026, 9, 30)), '28 set – 4 out 2026'); // cruza o mês
  assert.equal(rangeLabel('Semana', d(2026, 10, 14)), '12 – 18 out 2026');
});

test('fromInputs / toInputs fazem o caminho de ida e volta e rejeitam lixo', () => {
  const date = fromInputs('2026-10-05', '09:30');
  assert.deepEqual(toInputs(date), { date: '2026-10-05', time: '09:30' });
  assert.equal(fromInputs('2026-10-05', '').getHours(), 0); // sem hora = meia-noite
  assert.equal(fromInputs('05/10/2026', '09:00'), null);
  assert.equal(fromInputs('', '09:00'), null);
  assert.equal(fromInputs('2026-10-05', '9h'), null);
});

test('activitySpan: sem data, com duração padrão, término inválido e dia inteiro', () => {
  assert.equal(activitySpan({ startAt: null }), null);
  assert.equal(activitySpan({ startAt: 'lixo' }), null);

  const start = d(2026, 10, 5, 10);
  const padrao = activitySpan({ startAt: start.toISOString() });
  assert.equal(padrao.end.getTime() - padrao.start.getTime(), 60 * 60_000);

  const invertido = activitySpan({ startAt: start.toISOString(), endAt: d(2026, 10, 5, 9).toISOString() });
  assert.equal(invertido.end.getTime() - invertido.start.getTime(), 60 * 60_000); // término antes do início é ignorado

  const real = activitySpan({ startAt: start.toISOString(), endAt: d(2026, 10, 5, 11, 30).toISOString() });
  assert.equal(real.end.getTime() - real.start.getTime(), 90 * 60_000);

  const dia = activitySpan({ startAt: d(2026, 10, 5, 15).toISOString(), allDay: true });
  assert.equal(dia.allDay, true);
  assert.equal(dia.start.getHours(), 0);
  assert.ok(isSameDay(dia.end, d(2026, 10, 6)));
});

test('spanOnDay: compromisso que atravessa a meia-noite aparece nos dois dias', () => {
  const span = activitySpan({ startAt: d(2026, 10, 5, 23).toISOString(), endAt: d(2026, 10, 6, 1).toISOString() });
  assert.ok(spanOnDay(span, d(2026, 10, 5)));
  assert.ok(spanOnDay(span, d(2026, 10, 6)));
  assert.ok(!spanOnDay(span, d(2026, 10, 7)));

  // termina exatamente à meia-noite: não entra no dia seguinte
  const ate = activitySpan({ startAt: d(2026, 10, 5, 22).toISOString(), endAt: d(2026, 10, 6, 0).toISOString() });
  assert.ok(!spanOnDay(ate, d(2026, 10, 6)));
});

test('isOverdue: só pendente com data que já terminou', () => {
  const now = d(2026, 10, 5, 12);
  const base = { startAt: d(2026, 10, 5, 9).toISOString(), endAt: d(2026, 10, 5, 10).toISOString() };
  assert.equal(isOverdue({ ...base, status: 'Pendente' }, now), true);
  assert.equal(isOverdue({ ...base, status: 'Concluída' }, now), false);
  assert.equal(isOverdue({ ...base, status: 'Cancelada' }, now), false);
  assert.equal(isOverdue({ startAt: d(2026, 10, 5, 11).toISOString(), endAt: d(2026, 10, 5, 13).toISOString(), status: 'Pendente' }, now), false); // em andamento
  assert.equal(isOverdue({ startAt: null, status: 'Pendente' }, now), false); // sem data
});

test('formatWhen: hoje, amanhã, ontem, outras datas e dia inteiro', () => {
  const now = d(2026, 10, 5, 8);
  assert.equal(formatWhen(d(2026, 10, 5, 10), false, now), 'Hoje, 10:00');
  assert.equal(formatWhen(d(2026, 10, 6, 14, 30), false, now), 'Amanhã, 14:30');
  assert.equal(formatWhen(d(2026, 10, 4, 9), false, now), 'Ontem, 09:00');
  assert.equal(formatWhen(d(2026, 11, 20, 9), false, now), '20/11, 09:00');
  assert.equal(formatWhen(d(2027, 1, 2, 9), false, now), '02/01/2027, 09:00');
  assert.equal(formatWhen(d(2026, 10, 5), true, now), 'Hoje · dia inteiro');
});

test('snapMinutes arredonda para o múltiplo mais próximo', () => {
  assert.equal(snapMinutes(7), 0);
  assert.equal(snapMinutes(8), 15);
  assert.equal(snapMinutes(52), 45);
  assert.equal(snapMinutes(53, 30), 60);
});

test('layoutOverlaps: dividem colunas só quem se sobrepõe', () => {
  const item = (id, sh, eh) => ({ id, start: d(2026, 10, 5, sh), end: d(2026, 10, 5, eh) });
  const placed = layoutOverlaps([item('a', 9, 11), item('b', 10, 12), item('c', 13, 14), item('d', 10, 11)]);
  assert.deepEqual(placed.get('c'), { column: 0, columns: 1 }); // isolado
  assert.equal(placed.get('a').columns, 3); // a, b e d se cruzam às 10h
  assert.equal(placed.get('b').columns, 3);
  const cols = ['a', 'b', 'd'].map((id) => placed.get(id).column).sort();
  assert.deepEqual(cols, [0, 1, 2]); // colunas distintas
});

test('layoutOverlaps: compromissos em sequência não dividem coluna', () => {
  const item = (id, sh, eh) => ({ id, start: d(2026, 10, 5, sh), end: d(2026, 10, 5, eh) });
  const placed = layoutOverlaps([item('a', 9, 10), item('b', 10, 11)]);
  assert.deepEqual(placed.get('a'), { column: 0, columns: 1 });
  assert.deepEqual(placed.get('b'), { column: 0, columns: 1 });
});

test('addDays atravessa o mês corretamente', () => {
  const r = addDays(d(2026, 9, 30, 10), 1);
  assert.equal(r.getMonth(), 9);
  assert.equal(r.getDate(), 1);
  assert.equal(r.getHours(), 10);
});
