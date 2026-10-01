import test from 'node:test';
import assert from 'node:assert/strict';
import { installDb, startApp, signToken, userRow, authHeader, findCall, findCalls } from './helpers.js';
import crmRouter from '../routes/crm.js';
import googleRouter from '../routes/google.js';
import { decryptToken, encryptToken } from '../services/googleCrypto.js';
import { buildAuthUrl, signState, verifyState } from '../services/googleAuth.js';
import { buildEventBody } from '../services/googleCalendar.js';
import { pullGoogleChanges } from '../services/googleActivityService.js';

process.env.GOOGLE_CLIENT_ID = 'cid';
process.env.GOOGLE_CLIENT_SECRET = 'secret';
process.env.GOOGLE_REDIRECT_URI = 'http://app.test/api/google/callback';
process.env.FRONTEND_URL = 'http://front.test';

const realFetch = globalThis.fetch;
const START = '2026-10-05T13:00:00.000Z';

/** Troca o fetch: chamadas locais (127.0.0.1) passam; as do Google vão para o handler e ficam registradas. */
function mockGoogle(handler) {
  const log = [];
  globalThis.fetch = async (url, init = {}) => {
    if (String(url).startsWith('http://127.0.0.1')) return realFetch(url, init);
    const entry = { url: String(url), method: init.method || 'GET', body: init.body ? String(init.body) : '' };
    log.push(entry);
    const out = handler(entry);
    return new Response(out.body === undefined ? null : JSON.stringify(out.body), {
      status: out.status ?? 200,
      headers: { 'Content-Type': 'application/json' },
    });
  };
  return log;
}
const restoreFetch = () => {
  globalThis.fetch = realFetch;
};

const futureIso = () => new Date(Date.now() + 3_600_000).toISOString();
const accountRow = (over = {}) => ({
  user_id: 7,
  email: 'me@gmail.com',
  refresh_token_enc: encryptToken('refresh-1'),
  access_token_enc: encryptToken('access-1'),
  access_expires_at: futureIso(),
  calendar_id: 'primary',
  sync_token: null,
  import_events: false,
  ...over,
});
const activityRow = (over = {}) => ({
  id: 11,
  titulo: 'Reunião de proposta',
  descricao: 'Pauta',
  local: '',
  link: '',
  start_at: START,
  end_at: '2026-10-05T14:00:00.000Z',
  all_day: false,
  status: 'Pendente',
  remind_minutes: 15,
  attendees: '[]',
  google_event_id: null,
  google_owner_id: null,
  google_etag: null,
  ...over,
});

function db({ account = accountRow(), activity = activityRow(), role = 'user' } = {}) {
  installDb((sql, params) => {
    if (/FROM users WHERE id = \? AND \(id = \? OR account_id = \?\)/.test(sql)) return [{ id: params[0] }];
    if (/FROM users WHERE id = \?$/.test(sql) && /account_id/.test(sql) && !/role/.test(sql)) return [{ account_id: 1 }];
    if (/FROM users/.test(sql)) return [userRow({ id: 7, role, account_id: 1 })];
    if (/FROM google_accounts WHERE user_id/.test(sql)) return account ? [account] : [];
    if (/^SELECT \* FROM activities WHERE id = \? AND user_id = \?/.test(sql)) return activity ? [activity] : [];
    if (/FROM activities a LEFT JOIN users u/.test(sql)) return [{ id: 11, titulo: 'x', status: 'Pendente', googleeventid: activity?.google_event_id }];
    if (/^INSERT INTO activities/.test(sql)) return [{ id: 11 }];
    return undefined;
  });
}

async function api(method, path, body) {
  const app = await startApp({ '/crm': crmRouter, '/google': googleRouter });
  try {
    const res = await fetch(`${app.url}${path}`, {
      method,
      headers: authHeader(signToken({ id: 7 })),
      body: body ? JSON.stringify(body) : undefined,
      redirect: 'manual',
    });
    const text = await res.text();
    return { status: res.status, location: res.headers.get('location'), body: text && text.startsWith('{') ? JSON.parse(text) : null };
  } finally {
    await app.close();
  }
}

const EVENT_OK = { id: 'ev1', etag: '"e1"', htmlLink: 'https://calendar.google.com/ev1', hangoutLink: 'https://meet.google.com/abc-defg-hij' };

test('criptografia de tokens: ida e volta, e valor adulterado é recusado', () => {
  const enc = encryptToken('segredo');
  assert.notEqual(enc, 'segredo');
  assert.equal(decryptToken(enc), 'segredo');
  assert.equal(decryptToken(enc.slice(0, -4) + 'AAAA'), null);
  assert.equal(decryptToken('lixo'), null);
});

test('state do OAuth: assinado, só serve para o fim certo', () => {
  assert.equal(verifyState(signState(7)), 7);
  assert.equal(verifyState('x.y.z'), null);
  assert.equal(verifyState(signToken({ id: 7 })), null); // token de sessão não vale como state
  const url = new URL(buildAuthUrl(7));
  assert.equal(url.searchParams.get('access_type'), 'offline');
  assert.equal(url.searchParams.get('client_id'), 'cid');
  assert.match(url.searchParams.get('scope'), /calendar\.events/);
});

test('evento: horário com fuso, lembrete, Meet e cancelamento', () => {
  const base = { id: 3, titulo: 'T', descricao: 'D', local: 'Sala', link: 'https://zoom.us/j/1', startAt: START, endAt: null, allDay: false, remindMinutes: 30 };
  const b = buildEventBody(base, { attendees: ['a@x.com'], meet: true });
  assert.equal(b.start.dateTime, START);
  assert.equal(b.start.timeZone, 'America/Sao_Paulo');
  assert.equal(b.end.dateTime, '2026-10-05T14:00:00.000Z'); // sem término: 1 hora
  assert.deepEqual(b.attendees, [{ email: 'a@x.com' }]);
  assert.equal(b.conferenceData.createRequest.conferenceSolutionKey.type, 'hangoutsMeet');
  assert.deepEqual(b.reminders.overrides, [{ method: 'popup', minutes: 30 }]);
  assert.match(b.description, /Link: https:\/\/zoom\.us\/j\/1/);
  assert.equal(b.extendedProperties.private.vesk_activity_id, '3');
  assert.equal(b.status, 'confirmed');
  assert.equal(buildEventBody({ ...base, status: 'Cancelada' }).status, 'cancelled');
  assert.equal(buildEventBody(base).conferenceData, undefined);
});

test('evento de dia inteiro usa date e o fim é o dia seguinte', () => {
  const b = buildEventBody({ id: 1, titulo: 'F', startAt: '2026-10-05T03:00:00.000Z', allDay: true, remindMinutes: 15 });
  assert.deepEqual(b.start, { date: '2026-10-05' });
  assert.deepEqual(b.end, { date: '2026-10-06' });
  assert.deepEqual(b.reminders, { useDefault: true });
});

test('GET /google/status: indica conectado e e-mail; sem conta, desconectado', async () => {
  db();
  let r = await api('GET', '/google/status');
  assert.equal(r.body.configured, true);
  assert.equal(r.body.connected, true);
  assert.equal(r.body.email, 'me@gmail.com');
  db({ account: null });
  r = await api('GET', '/google/status');
  assert.equal(r.body.connected, false);
});

test('GET /google/connect-url exige login e devolve a URL do Google', async () => {
  db();
  const r = await api('GET', '/google/connect-url');
  assert.match(r.body.url, /^https:\/\/accounts\.google\.com\//);
});

test('callback: state inválido volta com erro e não grava nada', async () => {
  db();
  const app = await startApp({ '/google': googleRouter });
  try {
    const res = await fetch(`${app.url}/google/callback?code=abc&state=falso`, { redirect: 'manual' });
    assert.equal(res.status, 302);
    assert.equal(res.headers.get('location'), 'http://front.test/admin/agenda?google=error');
  } finally {
    await app.close();
  }
  assert.equal(findCalls(/INSERT INTO google_accounts/).length, 0);
});

test('callback: troca o code, grava a conta criptografada e volta conectado', async () => {
  db();
  const idToken = `${Buffer.from('{"alg":"none"}').toString('base64url')}.${Buffer.from(JSON.stringify({ email: 'me@gmail.com' })).toString('base64url')}.y`;
  const log = mockGoogle(() => ({ body: { access_token: 'acc', refresh_token: 'ref', expires_in: 3600, id_token: idToken, scope: 's' } }));
  const app = await startApp({ '/google': googleRouter });
  try {
    const res = await fetch(`${app.url}/google/callback?code=abc&state=${signState(7)}`, { redirect: 'manual' });
    assert.equal(res.headers.get('location'), 'http://front.test/admin/agenda?google=connected');
  } finally {
    await app.close();
    restoreFetch();
  }
  assert.match(log[0].body, /grant_type=authorization_code/);
  const ins = findCall(/INSERT INTO google_accounts/);
  assert.equal(ins.params[0], 7);
  assert.equal(ins.params[1], 'me@gmail.com');
  assert.equal(decryptToken(ins.params[2]), 'ref');
  assert.ok(!ins.params.includes('ref'), 'refresh token nunca vai em texto puro');
});

test('criar atividade com Google: Meet, convidados, convite e vínculo gravado', async () => {
  db();
  const log = mockGoogle(() => ({ body: EVENT_OK }));
  let r;
  try {
    r = await api('POST', '/crm/activities', {
      titulo: 'Reunião de proposta', tipo: 'Reunião', startAt: START, endAt: '2026-10-05T14:00:00.000Z',
      googleSync: true, meet: true, invite: true, attendees: ['Cliente@Empresa.com', 'cliente@empresa.com'],
    });
  } finally {
    restoreFetch();
  }
  assert.equal(r.status, 201);
  assert.equal(r.body.google.status, 'ok');
  assert.equal(r.body.google.meetUrl, EVENT_OK.hangoutLink);
  const g = log[0];
  assert.equal(g.method, 'POST');
  assert.match(g.url, /\/calendars\/primary\/events\?.*conferenceDataVersion=1/);
  assert.match(g.url, /sendUpdates=all/);
  const body = JSON.parse(g.body);
  assert.deepEqual(body.attendees, [{ email: 'cliente@empresa.com' }]);
  assert.ok(body.conferenceData);
  const up = findCall(/^UPDATE activities SET google_event_id/);
  assert.equal(up.params[0], 'ev1');
  assert.equal(up.params[5], EVENT_OK.hangoutLink); // Meet vira o link da atividade
});

test('sem convite: o Google não envia e-mail (sendUpdates=none)', async () => {
  db();
  const log = mockGoogle(() => ({ body: EVENT_OK }));
  try {
    await api('POST', '/crm/activities', { titulo: 'X', tipo: 'Reunião', startAt: START, googleSync: true, attendees: ['a@b.com'] });
  } finally {
    restoreFetch();
  }
  assert.match(log[0].url, /sendUpdates=none/);
});

test('falha do Google não impede salvar a atividade', async () => {
  db();
  mockGoogle(() => ({ status: 500, body: { error: { message: 'boom' } } }));
  let r;
  try {
    r = await api('POST', '/crm/activities', { titulo: 'X', tipo: 'Reunião', startAt: START, googleSync: true });
  } finally {
    restoreFetch();
  }
  assert.equal(r.status, 201);
  assert.equal(r.body.id, 11);
  assert.equal(r.body.google.status, 'error');
  assert.match(r.body.google.message, /boom/);
});

test('sem conta conectada: atividade salva e aviso para conectar', async () => {
  db({ account: null });
  const r = await api('POST', '/crm/activities', { titulo: 'X', tipo: 'Reunião', startAt: START, googleSync: true });
  assert.equal(r.status, 201);
  assert.equal(r.body.google.status, 'error');
  assert.match(r.body.google.message, /não conectada/);
});

test('e-mail de convidado inválido é recusado antes de gravar', async () => {
  db();
  const r = await api('POST', '/crm/activities', { titulo: 'X', tipo: 'Reunião', attendees: ['sem-arroba'] });
  assert.equal(r.status, 400);
  assert.equal(findCalls(/^INSERT INTO activities/).length, 0);
});

test('token expirado é renovado; invalid_grant desconecta a conta', async () => {
  db({ account: accountRow({ access_expires_at: new Date(Date.now() - 1000).toISOString() }) });
  const log = mockGoogle((e) => (e.url.includes('oauth2.googleapis.com/token') ? { body: { access_token: 'novo', expires_in: 3600 } } : { body: EVENT_OK }));
  try {
    await api('POST', '/crm/activities', { titulo: 'X', tipo: 'Reunião', startAt: START, googleSync: true });
  } finally {
    restoreFetch();
  }
  assert.match(log[0].body, /grant_type=refresh_token/);
  assert.match(log[0].body, /refresh_token=refresh-1/);

  db({ account: accountRow({ access_expires_at: new Date(Date.now() - 1000).toISOString() }) });
  mockGoogle(() => ({ status: 400, body: { error: 'invalid_grant' } }));
  let r;
  try {
    r = await api('POST', '/crm/activities', { titulo: 'X', tipo: 'Reunião', startAt: START, googleSync: true });
  } finally {
    restoreFetch();
  }
  assert.equal(r.status, 201);
  assert.equal(r.body.google.status, 'error');
  assert.ok(findCall(/^DELETE FROM google_accounts/));
});

test('editar atividade já vinculada atualiza o mesmo evento (PATCH) no calendário do dono', async () => {
  db({ activity: activityRow({ google_event_id: 'ev1', google_owner_id: 7 }) });
  const log = mockGoogle(() => ({ body: EVENT_OK }));
  try {
    await api('PUT', '/crm/activities/11', { titulo: 'Novo título', tipo: 'Reunião', startAt: START });
  } finally {
    restoreFetch();
  }
  assert.equal(log[0].method, 'PATCH');
  assert.match(log[0].url, /\/events\/ev1\?/);
});

test('excluir atividade vinculada remove o evento no Google', async () => {
  db({ activity: activityRow() });
  const log = mockGoogle(() => ({ status: 204 }));
  installDbDelete();
  try {
    const r = await api('DELETE', '/crm/activities/11');
    assert.equal(r.status, 204);
  } finally {
    restoreFetch();
  }
  assert.equal(log[0].method, 'DELETE');
  assert.match(log[0].url, /\/events\/ev9/);

  function installDbDelete() {
    installDb((sql, params) => {
      if (/FROM users WHERE id = \? AND \(id = \? OR account_id = \?\)/.test(sql)) return [{ id: params[0] }];
      if (/FROM users/.test(sql)) return [userRow({ id: 7, account_id: 1 })];
      if (/FROM google_accounts WHERE user_id/.test(sql)) return [accountRow()];
      if (/SELECT google_event_id, google_owner_id, attendees FROM activities/.test(sql)) return [{ google_event_id: 'ev9', google_owner_id: 7, attendees: '[]' }];
      return undefined;
    });
  }
});

function pullDb(rowsByEvent, account = accountRow()) {
  installDb((sql, params) => {
    if (/FROM google_accounts WHERE user_id/.test(sql)) return [account];
    if (/SELECT account_id FROM users/.test(sql)) return [{ account_id: 1 }];
    if (/FROM activities WHERE google_owner_id = \? AND google_event_id = \?/.test(sql)) return rowsByEvent[params[1]] ? [rowsByEvent[params[1]]] : [];
    return undefined;
  });
}

test('pull: Google vence (atualiza), cancelado vira Cancelada, eco do próprio envio é ignorado', async () => {
  pullDb({
    a: activityRow({ id: 1, google_event_id: 'a', google_etag: '"old"' }),
    b: activityRow({ id: 2, google_event_id: 'b', google_etag: '"old"' }),
    c: activityRow({ id: 3, google_event_id: 'c', google_etag: '"same"' }),
  });
  mockGoogle(() => ({
    body: {
      nextSyncToken: 'T2',
      items: [
        { id: 'a', etag: '"new"', status: 'confirmed', summary: 'Remarcada', start: { dateTime: '2026-10-06T15:00:00Z' }, end: { dateTime: '2026-10-06T16:00:00Z' } },
        { id: 'b', etag: '"x"', status: 'cancelled' },
        { id: 'c', etag: '"same"', status: 'confirmed', summary: 'Eco', start: { dateTime: '2026-10-06T15:00:00Z' } },
      ],
    },
  }));
  let out;
  try {
    out = await pullGoogleChanges(7);
  } finally {
    restoreFetch();
  }
  assert.deepEqual(out, { created: 0, updated: 1, cancelled: 1, skipped: 1 });
  const upd = findCall(/^UPDATE activities SET titulo/);
  assert.equal(upd.params[0], 'Remarcada');
  assert.equal(upd.params[3], '2026-10-06T15:00:00.000Z');
  assert.ok(findCall(/SET status = 'Cancelada'/));
  assert.equal(findCall(/^UPDATE google_accounts SET sync_token/).params[0], 'T2');
});

test('pull: eventos novos só são importados se o usuário ligou; sync usa o syncToken salvo', async () => {
  const items = [{ id: 'n', etag: '"n"', status: 'confirmed', summary: 'Novo', start: { date: '2026-10-08' } }];
  pullDb({}, accountRow({ import_events: false, sync_token: 'T1' }));
  let log = mockGoogle(() => ({ body: { items, nextSyncToken: 'T2' } }));
  try {
    assert.equal((await pullGoogleChanges(7)).created, 0);
  } finally {
    restoreFetch();
  }
  assert.match(log[0].url, /syncToken=T1/);

  pullDb({}, accountRow({ import_events: true }));
  log = mockGoogle(() => ({ body: { items, nextSyncToken: 'T2' } }));
  try {
    assert.equal((await pullGoogleChanges(7)).created, 1);
  } finally {
    restoreFetch();
  }
  assert.match(log[0].url, /timeMin=/);
  const ins = findCall(/^INSERT INTO activities/);
  assert.equal(ins.params[5], '2026-10-08T03:00:00.000Z'); // dia inteiro = meia-noite de Brasília
});

test('pull: syncToken vencido (410) refaz a leitura completa', async () => {
  pullDb({}, accountRow({ sync_token: 'velho' }));
  let n = 0;
  const log = mockGoogle(() => (++n === 1 ? { status: 410, body: { error: { message: 'gone' } } } : { body: { items: [], nextSyncToken: 'T9' } }));
  try {
    await pullGoogleChanges(7);
  } finally {
    restoreFetch();
  }
  assert.equal(log.length, 2);
  assert.doesNotMatch(log[1].url, /syncToken=/);
});
