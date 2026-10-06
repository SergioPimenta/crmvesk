import test from 'node:test';
import assert from 'node:assert/strict';
import { installDb, startApp, signToken, userRow, authHeader, findCall, findCalls, calls } from './helpers.js';
import crmRouter from '../routes/crm.js';

// Workspace 1; usuário comum #7 e administrador #1.
const USER = { role: 'user', id: 7 };
const ADMIN = { role: 'admin', id: 1 };

async function request(actor, method, path, body, dbHandler = () => undefined) {
  installDb((sql, params) => {
    if (/FROM users WHERE id = \? AND \(id = \? OR account_id = \?\)/.test(sql)) return [{ id: params[0] }]; // membro válido
    if (/FROM users/.test(sql)) return [userRow({ id: actor.id, role: actor.role, account_id: 1 })];
    return dbHandler(sql, params);
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

const listSql = (table) => new RegExp(`FROM ${table}\\b.* ORDER BY`);

for (const [table, path] of [
  ['companies', '/companies'],
  ['contacts', '/contacts'],
  ['emails', '/emails'],
  ['proposals', '/proposals'],
]) {
  test(`GET ${path}: usuário comum só lista os próprios registros`, async () => {
    await request(USER, 'GET', path);
    const q = findCall(listSql(table));
    assert.match(q.sql, /created_by = \?/);
    assert.deepEqual(q.params, [1, 7]); // workspace, autor
  });

  test(`GET ${path}: administrador lista tudo do workspace`, async () => {
    await request(ADMIN, 'GET', path);
    const q = findCall(listSql(table));
    assert.doesNotMatch(q.sql, /AND (w+.)?created_by/); // (o SELECT pode trazer created_by AS ownerId)
    assert.deepEqual(q.params, [1]);
  });
}

test('GET /deals: usuário comum filtra por d.created_by', async () => {
  await request(USER, 'GET', '/deals');
  const q = findCall(/FROM deals d/);
  assert.match(q.sql, /d\.created_by = \?/);
  assert.deepEqual(q.params, [1, 7]);
});

test('GET /contacts devolve o responsável (ownerId)', async () => {
  const { body } = await request(ADMIN, 'GET', '/contacts', null, (sql) =>
    /FROM contacts/.test(sql) ? [{ id: 1, nome: 'Ana', ownerid: 7 }] : undefined
  );
  assert.equal(body[0].ownerId, 7);
});

test('PUT /contacts/:id: usuário comum só altera o que criou', async () => {
  await request(USER, 'PUT', '/contacts/5', { nome: 'Ana', empresaId: null });
  const q = findCall(/^UPDATE contacts/);
  assert.match(q.sql, /WHERE id = \? AND user_id = \? AND created_by = \?/);
  assert.deepEqual(q.params.slice(-3), [5, 1, 7]);
});

test('DELETE /contacts/:id: arquiva antes de excluir e respeita o dono; 404 se não for dele', async () => {
  const { status } = await request(USER, 'DELETE', '/contacts/5', null, (sql) =>
    /^DELETE FROM contacts/.test(sql) ? { rows: [], affectedRows: 0 } : undefined
  );
  assert.equal(status, 404);
  const archive = findCall(/to_jsonb\(t\) AS data FROM contacts/);
  assert.ok(archive, 'deveria copiar a linha para deleted_records antes de excluir');
  assert.match(archive.sql, /created_by = \?/);
  const del = findCall(/^DELETE FROM contacts/);
  assert.match(del.sql, /created_by = \?/);
  assert.ok(calls.indexOf(archive) < calls.indexOf(del));
});

test('DELETE /deals/:id e /emails/:id: escopo por dono', async () => {
  await request(USER, 'DELETE', '/deals/9');
  assert.match(findCall(/^DELETE FROM deals/).sql, /created_by = \?/);
  await request(USER, 'DELETE', '/emails/9');
  assert.match(findCall(/^DELETE FROM emails/).sql, /created_by = \?/);
});

test('POST /companies grava o autor em created_by', async () => {
  await request(USER, 'POST', '/companies', { nome: 'ACME' });
  const q = findCall(/^INSERT INTO companies/);
  assert.match(q.sql, /\(user_id, created_by,/);
  assert.deepEqual(q.params.slice(0, 2), [1, 7]);
});

test('POST /activities grava o autor em created_by', async () => {
  await request(USER, 'POST', '/activities', { titulo: 'Ligar', tipo: 'Ligação' });
  const q = findCall(/^INSERT INTO activities/);
  assert.deepEqual(q.params.slice(0, 2), [1, 7]);
});

test('PUT /deals/:id/stage: usuário comum não move negócio de outro usuário (404)', async () => {
  const { status } = await request(USER, 'PUT', '/deals/9/stage', { stageKey: 'fechado' }, () => []);
  assert.equal(status, 404);
  assert.match(findCall(/FROM deals WHERE id/).sql, /created_by = \?/);
});

test('POST /proposals/:id/send-email: proposta de outro usuário dá 404', async () => {
  const { status } = await request(USER, 'POST', '/proposals/3/send-email', null, () => []);
  assert.equal(status, 404);
});

test('PUT /contacts/assign-owner: usuário comum recebe 403 e nada é alterado', async () => {
  const { status } = await request(USER, 'PUT', '/contacts/assign-owner', { ids: [1, 2], userId: 7 });
  assert.equal(status, 403);
  assert.equal(findCalls(/^UPDATE contacts/).length, 0);
});

test('PUT /contacts/assign-owner: administrador move contatos e o histórico ligado a eles', async () => {
  const { status } = await request(ADMIN, 'PUT', '/contacts/assign-owner', { ids: [1, 2, 2, 'x'], userId: 7 });
  assert.equal(status, 200);
  const contacts = findCall(/^UPDATE contacts SET created_by/);
  assert.deepEqual(contacts.params, [7, 1, 1, 2]); // dono, workspace, ids únicos e numéricos
  for (const table of ['deals', 'activities', 'proposals', 'emails']) {
    assert.ok(findCall(new RegExp(`^UPDATE ${table} SET created_by = \\? WHERE user_id = \\? AND contact_id IN`)), table);
  }
});

test('PUT /contacts/assign-owner: userId null remove o responsável; lista vazia é recusada', async () => {
  await request(ADMIN, 'PUT', '/contacts/assign-owner', { ids: [3], userId: null });
  assert.equal(findCall(/^UPDATE contacts SET created_by/).params[0], null);
  const empty = await request(ADMIN, 'PUT', '/contacts/assign-owner', { ids: [], userId: 7 });
  assert.equal(empty.status, 400);
});

test('PUT /contacts/assign-owner: usuário de fora do workspace é recusado', async () => {
  installDb((sql) => {
    if (/account_id = \?\)/.test(sql)) return []; // não é membro
    if (/FROM users/.test(sql)) return [userRow({ id: 1, role: 'admin', account_id: 1 })];
    return undefined;
  });
  const app = await startApp({ '/crm': crmRouter });
  try {
    const res = await fetch(`${app.url}/crm/contacts/assign-owner`, {
      method: 'PUT',
      headers: authHeader(signToken({ id: 1, role: 'admin' })),
      body: JSON.stringify({ ids: [1], userId: 999 }),
    });
    assert.equal(res.status, 400);
    assert.equal(findCalls(/^UPDATE contacts SET created_by/).length, 0);
  } finally {
    await app.close();
  }
});

// ---------- listagem paginada de contatos ----------
const pagedHandler = (sql) => {
  if (/COUNT\(\*\)/.test(sql)) return [{ total: 120 }];
  if (/FROM contacts c/.test(sql)) return [{ id: 1, nome: 'Ana', ownerid: 7 }];
  return undefined;
};

test('GET /contacts?page=2: devolve { items, total, page, pageSize } e usa LIMIT/OFFSET', async () => {
  const { status, body } = await request(ADMIN, 'GET', '/contacts?page=2&pageSize=50', null, pagedHandler);
  assert.equal(status, 200);
  assert.equal(body.total, 120);
  assert.equal(body.page, 2);
  assert.equal(body.pageSize, 50);
  assert.equal(body.items[0].ownerId, 7);
  const list = findCall(/FROM contacts c WHERE .* LIMIT \? OFFSET \?/);
  assert.deepEqual(list.params.slice(-2), [50, 50]); // pageSize, offset
});

test('GET /contacts?page=1: usuário comum continua limitado aos próprios contatos (lista e contagem)', async () => {
  await request(USER, 'GET', '/contacts?page=1', null, pagedHandler);
  for (const re of [/COUNT\(\*\)/, /LIMIT \? OFFSET \?/]) {
    const q = findCall(re);
    assert.match(q.sql, /c\.created_by = \?/);
    assert.deepEqual(q.params.slice(0, 2), [1, 7]);
  }
});

test('GET /contacts?page=1&unowned=1: só administrador filtra "sem responsável"', async () => {
  await request(ADMIN, 'GET', '/contacts?page=1&unowned=1', null, pagedHandler);
  assert.match(findCall(/COUNT\(\*\)/).sql, /c\.created_by IS NULL/);

  await request(USER, 'GET', '/contacts?page=1&unowned=1', null, pagedHandler);
  const q = findCall(/COUNT\(\*\)/);
  assert.doesNotMatch(q.sql, /IS NULL/); // usuário comum não consegue enxergar contatos sem dono
  assert.match(q.sql, /c\.created_by = \?/);
});

test('GET /contacts: busca por texto, telefone e tipo são parametrizados (sem SQL injection)', async () => {
  const evil = "x'; DROP TABLE contacts; --";
  await request(ADMIN, 'GET', `/contacts?page=1&tipo=Lead&q=${encodeURIComponent(evil)}`, null, pagedHandler);
  const q = findCall(/COUNT\(\*\)/);
  assert.doesNotMatch(q.sql, /DROP TABLE/);
  assert.match(q.sql, /c\.tipo = \?/);
  assert.ok(q.params.includes('Lead'));
  assert.ok(q.params.some((p) => typeof p === 'string' && p.includes('DROP TABLE')));

  await request(ADMIN, 'GET', '/contacts?page=1&q=41%2099690-2905', null, pagedHandler);
  const phone = findCall(/COUNT\(\*\)/);
  assert.match(phone.sql, /REGEXP_REPLACE\(c\.telefone/);
  assert.ok(phone.params.includes('%41996902905%'));
});

test('GET /contacts: curingas do LIKE digitados pelo usuário são escapados; tipo inválido é ignorado', async () => {
  await request(ADMIN, 'GET', '/contacts?page=1&tipo=Hacker&q=100%25_', null, pagedHandler);
  const q = findCall(/COUNT\(\*\)/);
  assert.doesNotMatch(q.sql, /c\.tipo = \?/);
  assert.ok(q.params.includes('%100\\%\\_%')); // "%" e "_" digitados viram literais (\% e \_)
});

test('GET /contacts: pageSize é limitado a 200 e page mínimo é 1', async () => {
  await request(ADMIN, 'GET', '/contacts?page=-5&pageSize=9999', null, pagedHandler);
  const list = findCall(/LIMIT \? OFFSET \?/);
  assert.deepEqual(list.params.slice(-2), [200, 0]);
});

test('GET /contacts?contatados=nao|sim: "Todos" exclui os contatados e "Contatados" lista só eles', async () => {
  const pagedHandler = (sql) => (/COUNT\(\*\)/.test(sql) ? [{ total: 0 }] : []);
  await request(ADMIN, 'GET', '/contacts?page=1&contatados=nao', null, pagedHandler);
  assert.match(findCall(listSql('contacts')).sql, /NOT \(\s*EXISTS \(SELECT 1 FROM whatsapp_chats/);
  await request(ADMIN, 'GET', '/contacts?page=1&contatados=sim', null, pagedHandler);
  const sql = findCall(listSql('contacts')).sql;
  assert.match(sql, /EXISTS \(SELECT 1 FROM whatsapp_chats/);
  assert.doesNotMatch(sql, /NOT \(\s*EXISTS/);
});
