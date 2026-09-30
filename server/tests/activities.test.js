import test from 'node:test';
import assert from 'node:assert/strict';
import { installDb, startApp, signToken, userRow, authHeader, findCall, findCalls, calls } from './helpers.js';
import crmRouter from '../routes/crm.js';

const USER = { role: 'user', id: 7 };
const ADMIN = { role: 'admin', id: 1 };

const BASE = { titulo: 'Reunião de proposta', tipo: 'Reunião' };
const START = '2026-10-05T13:00:00.000Z'; // 10:00 em Brasília

/**
 * missing: tabelas cujo id informado NÃO existe no workspace (ex.: ['contacts']).
 * notMember: o responsável informado não pertence ao workspace.
 * existing: linha devolvida pelo SELECT da atividade (getActivity); null = não encontrada.
 */
async function call(actor, method, path, body, { missing = [], notMember = false, existing, extra = () => undefined } = {}) {
  installDb((sql, params) => {
    if (/FROM users WHERE id = \? AND \(id = \? OR account_id = \?\)/.test(sql)) return notMember ? [] : [{ id: params[0] }];
    if (/FROM users/.test(sql)) return [userRow({ id: actor.id, role: actor.role, account_id: 1 })];
    const ref = sql.match(/^SELECT id FROM (contacts|companies|deals) WHERE id = \? AND user_id = \?/);
    if (ref) return missing.includes(ref[1]) ? [] : [{ id: params[0] }];
    if (/FROM activities a LEFT JOIN users u/.test(sql)) return existing === null ? [] : [existing ?? { id: 5, titulo: 'x', status: 'Pendente', allday: false }];
    if (/^INSERT INTO activities/.test(sql)) return [{ id: 11 }];
    return extra(sql, params);
  });
  const app = await startApp({ '/crm': crmRouter });
  try {
    const res = await fetch(`${app.url}/crm${path}`, {
      method,
      headers: authHeader(signToken({ id: actor.id, role: actor.role })),
      body: body ? JSON.stringify(body) : undefined,
    });
    const text = await res.text();
    return { status: res.status, body: text ? JSON.parse(text) : null };
  } finally {
    await app.close();
  }
}

// ---------- listagem e visibilidade ----------
test('GET /activities: administrador vê todas; ordenadas por data, sem data por último', async () => {
  await call(ADMIN, 'GET', '/activities');
  const q = findCall(/FROM activities a LEFT JOIN users u/);
  assert.doesNotMatch(q.sql, /created_by = \?/);
  assert.match(q.sql, /ORDER BY a\.start_at ASC NULLS LAST, a\.id DESC/);
  assert.deepEqual(q.params, [1]);
});

test('GET /activities: usuário comum vê as que criou OU as designadas a ele', async () => {
  await call(USER, 'GET', '/activities');
  const q = findCall(/FROM activities a LEFT JOIN users u/);
  assert.match(q.sql, /\(a\.created_by = \? OR a\.assigned_to = \?\)/);
  assert.deepEqual(q.params, [1, 7, 7]);
});

test('GET /activities?from&to filtra pelo intervalo; datas inválidas são ignoradas', async () => {
  await call(ADMIN, 'GET', `/activities?from=${encodeURIComponent('2026-10-01T00:00:00Z')}&to=${encodeURIComponent('2026-11-01T00:00:00Z')}`);
  const q = findCall(/FROM activities a LEFT JOIN users u/);
  assert.match(q.sql, /a\.start_at >= \?/);
  assert.match(q.sql, /a\.start_at < \?/);
  assert.deepEqual(q.params, [1, '2026-10-01T00:00:00.000Z', '2026-11-01T00:00:00.000Z']);

  await call(ADMIN, 'GET', '/activities?from=lixo');
  assert.doesNotMatch(findCall(/FROM activities a LEFT JOIN users u/).sql, /start_at >= \?/);
});

test('GET /activities devolve ids em texto, allDay booleano e o nome do responsável', async () => {
  const { body } = await call(ADMIN, 'GET', '/activities', null, {
    existing: { id: 9, titulo: 'Ligar', tipo: 'Ligação', status: 'Pendente', startat: START, allday: 0, assignedtoname: 'Maria', assignedto: 7 },
  });
  assert.equal(body[0].id, '9');
  assert.equal(body[0].allDay, false);
  assert.equal(body[0].startAt, START);
  assert.equal(body[0].assignedToName, 'Maria');
  assert.equal(body[0].assignedTo, 7);
});

// ---------- criação: validação ----------
test('POST /activities: entradas inválidas são recusadas e nada é gravado', async () => {
  const cases = [
    [{ ...BASE, titulo: '   ' }, /Título é obrigatório/],
    [{ ...BASE, titulo: 'x'.repeat(201) }, /no máximo 200/],
    [{ ...BASE, tipo: 'Churrasco' }, /Tipo inválido/],
    [{ ...BASE, status: 'Feito' }, /Status inválido/],
    [{ ...BASE, prioridade: 'Urgente' }, /Prioridade inválida/],
    [{ ...BASE, startAt: 'ontem' }, /Início inválido/],
    [{ ...BASE, startAt: START, endAt: 'amanhã' }, /Término inválido/],
    [{ ...BASE, startAt: START, endAt: '2026-10-05T12:00:00.000Z' }, /término deve ser depois/],
    [{ ...BASE, endAt: START }, /Informe o início/],
    [{ ...BASE, allDay: true }, /data do compromisso/],
    [{ ...BASE, descricao: 'x'.repeat(2001) }, /descrição pode ter no máximo/],
    [{ ...BASE, link: 'meet.google.com/abc' }, /http/],
  ];
  for (const [body, pattern] of cases) {
    const { status, body: res } = await call(USER, 'POST', '/activities', body);
    assert.equal(status, 400, JSON.stringify(body).slice(0, 60));
    assert.match(res.message, pattern);
  }
  assert.equal(findCalls(/^INSERT INTO activities/).length, 0);
});

test('POST /activities: contato, empresa, negócio ou responsável de fora do workspace são recusados', async () => {
  for (const table of ['contacts', 'companies', 'deals']) {
    const field = { contacts: 'contatoId', companies: 'empresaId', deals: 'dealId' }[table];
    const { status } = await call(USER, 'POST', '/activities', { ...BASE, [field]: 99 }, { missing: [table] });
    assert.equal(status, 400, table);
  }
  const { status, body } = await call(USER, 'POST', '/activities', { ...BASE, assignedTo: 99 }, { notMember: true });
  assert.equal(status, 400);
  assert.match(body.message, /Responsável inválido/);
  assert.equal(findCalls(/^INSERT INTO activities/).length, 0);
});

test('POST /activities: grava com autor, data em UTC, rótulo legado e devolve a atividade', async () => {
  const { status, body } = await call(USER, 'POST', '/activities', {
    ...BASE,
    startAt: START,
    endAt: '2026-10-05T14:00:00.000Z',
    local: 'Sala 2',
    link: 'https://meet.google.com/abc-defg-hij',
    descricao: 'Apresentar proposta',
    prioridade: 'Alta',
    contatoId: 3,
    assignedTo: 2,
  });
  assert.equal(status, 201);
  assert.equal(body.id, 11);
  const ins = findCall(/^INSERT INTO activities/);
  const p = ins.params;
  assert.deepEqual(p.slice(0, 2), [1, 7]); // workspace e autor
  assert.equal(p[2], 3); // contato
  assert.equal(p[5], 'Reunião de proposta');
  assert.equal(p[7], '05/10/2026 10:00'); // rótulo legado em horário de Brasília
  assert.equal(p[9], START);
  assert.equal(p[10], '2026-10-05T14:00:00.000Z');
  assert.equal(p[11], false); // allDay
  assert.equal(p[15], 'Alta');
  assert.equal(p[16], 2); // responsável
  assert.equal(p[17], null); // ainda não concluída
});

test('POST /activities: dia inteiro usa rótulo "dia inteiro"; status Concluída já grava completed_at', async () => {
  await call(USER, 'POST', '/activities', { ...BASE, startAt: '2026-10-05T03:00:00.000Z', allDay: true, status: 'Concluída' });
  const p = findCall(/^INSERT INTO activities/).params;
  assert.match(p[7], /dia inteiro/);
  assert.equal(p[11], true);
  assert.ok(p[17], 'completed_at preenchido');
});

test('POST /activities: atividade sem data é aceita (legado); quando vira texto curto', async () => {
  const { status } = await call(USER, 'POST', '/activities', { ...BASE, quando: 'Semana que vem' });
  assert.equal(status, 201);
  const p = findCall(/^INSERT INTO activities/).params;
  assert.equal(p[7], 'Semana que vem');
  assert.equal(p[9], null);
});

// ---------- edição ----------
test('PUT /activities/:id: só altera atividade visível (criada ou designada ao usuário)', async () => {
  const { status } = await call(USER, 'PUT', '/activities/5', BASE, { existing: null });
  assert.equal(status, 404);
  assert.equal(findCalls(/^UPDATE activities/).length, 0);

  await call(USER, 'PUT', '/activities/5', BASE);
  const up = findCall(/^UPDATE activities SET contact_id/);
  assert.match(up.sql, /\(created_by = \? OR assigned_to = \?\)/);
  assert.deepEqual(up.params.slice(-4), [5, 1, 7, 7]);
});

test('PUT /activities/:id: completed_at acompanha o status', async () => {
  // Pendente -> Concluída: marca a data
  await call(USER, 'PUT', '/activities/5', { ...BASE, status: 'Concluída' }, { existing: { id: 5, status: 'Pendente', allday: false } });
  let p = findCall(/^UPDATE activities SET contact_id/).params;
  assert.ok(p[15], 'marca completed_at ao concluir');

  // Concluída -> Concluída: mantém a data original
  await call(USER, 'PUT', '/activities/5', { ...BASE, status: 'Concluída' }, {
    existing: { id: 5, status: 'Concluída', completedat: '2026-09-01T10:00:00.000Z', allday: false },
  });
  p = findCall(/^UPDATE activities SET contact_id/).params;
  assert.equal(p[15], '2026-09-01T10:00:00.000Z');

  // Concluída -> Pendente: limpa
  await call(USER, 'PUT', '/activities/5', { ...BASE, status: 'Pendente' }, {
    existing: { id: 5, status: 'Concluída', completedat: '2026-09-01T10:00:00.000Z', allday: false },
  });
  p = findCall(/^UPDATE activities SET contact_id/).params;
  assert.equal(p[15], null);
});

test('PUT /activities/:id: dados inválidos dão 400 sem alterar', async () => {
  const { status } = await call(USER, 'PUT', '/activities/5', { ...BASE, startAt: START, endAt: '2026-10-05T12:00:00.000Z' });
  assert.equal(status, 400);
  assert.equal(findCalls(/^UPDATE activities/).length, 0);
});

// ---------- status rápido ----------
test('PATCH /activities/:id/status: conclui, cancela e reabre; status inválido é recusado', async () => {
  assert.equal((await call(USER, 'PATCH', '/activities/5/status', { status: 'Feito' })).status, 400);

  const done = await call(USER, 'PATCH', '/activities/5/status', { status: 'Concluída' });
  assert.equal(done.status, 200);
  let up = findCall(/^UPDATE activities SET status/);
  assert.match(up.sql, /\(created_by = \? OR assigned_to = \?\)/);
  assert.ok(up.params[1], 'completed_at preenchido ao concluir');

  await call(USER, 'PATCH', '/activities/5/status', { status: 'Pendente' });
  up = findCall(/^UPDATE activities SET status/);
  assert.equal(up.params[1], null);
});

test('PATCH /activities/:id/status: atividade que o usuário não enxerga dá 404', async () => {
  const { status } = await call(USER, 'PATCH', '/activities/5/status', { status: 'Concluída' }, {
    extra: (sql) => (/^UPDATE activities SET status/.test(sql) ? { rows: [], affectedRows: 0 } : undefined),
  });
  assert.equal(status, 404);
});

// ---------- exclusão ----------
test('DELETE /activities/:id: arquiva antes de excluir, respeita a visibilidade e dá 404 se não achar', async () => {
  const { status } = await call(USER, 'DELETE', '/activities/5', null, {
    extra: (sql) => (/^DELETE FROM activities/.test(sql) ? { rows: [], affectedRows: 0 } : undefined),
  });
  assert.equal(status, 404);
  const archive = findCall(/to_jsonb\(t\) AS data FROM activities/);
  assert.ok(archive, 'copia para deleted_records antes de excluir');
  assert.match(archive.sql, /assigned_to = \?/);
  const del = findCall(/^DELETE FROM activities/);
  assert.match(del.sql, /\(created_by = \? OR assigned_to = \?\)/);
  assert.ok(calls.indexOf(archive) < calls.indexOf(del));

  assert.equal((await call(ADMIN, 'DELETE', '/activities/5')).status, 204);
  assert.doesNotMatch(findCall(/^DELETE FROM activities/).sql, /created_by/);
});
