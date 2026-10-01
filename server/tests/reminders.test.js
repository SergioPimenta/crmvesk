import test from 'node:test';
import assert from 'node:assert/strict';
import { installDb, startApp, signToken, userRow, authHeader, findCall, findCalls, calls } from './helpers.js';
import notificationsRouter from '../routes/notifications.js';
import cronRouter from '../routes/cron.js';
import crmRouter from '../routes/crm.js';
import { maybeProcessReminders, processDueReminders, resetReminderThrottle } from '../services/reminderService.js';

const START = '2026-10-05T13:00:00.000Z'; // 10:00 em Brasília

// Linha devolvida pelo UPDATE ... RETURNING que "reivindica" o lembrete (colunas em snake_case, como no Postgres).
const claimedRow = (overrides = {}) => ({
  id: 5,
  user_id: 1,
  created_by: 7,
  assigned_to: null,
  contact_id: 3,
  titulo: 'Reunião de proposta',
  tipo: 'Reunião',
  start_at: START,
  local: 'Sala 2',
  link: '',
  remind_minutes: 15,
  ...overrides,
});

function dbWith({ claimed = [], throwOnInsertFor = null, user = { email: 'u@test.com', name: 'U', remind_email: false } } = {}) {
  installDb((sql, params) => {
    if (/^UPDATE activities SET reminded_at = NOW\(\)/.test(sql)) return claimed;
    if (/^SELECT id, nome FROM contacts/.test(sql)) return [{ id: 3, nome: 'Ana Acme' }];
    if (/^INSERT INTO notifications/.test(sql)) {
      if (throwOnInsertFor !== null && params[4] === throwOnInsertFor) throw new Error('db down');
      return [{ id: 1 }];
    }
    if (/^SELECT email, name, remind_email FROM users/.test(sql)) return [user];
    return undefined;
  });
}

// ---------- disparo dos lembretes ----------
test('processDueReminders: só reivindica atividades pendentes, com horário, não avisadas e ainda não terminadas', async () => {
  dbWith({ claimed: [] });
  const summary = await processDueReminders();
  assert.deepEqual(summary, { claimed: 0, notified: 0, pushed: 0, emailed: 0 });
  const claim = findCall(/^UPDATE activities SET reminded_at = NOW\(\)/);
  for (const part of [
    /status = 'Pendente'/,
    /start_at IS NOT NULL/,
    /all_day IS NOT TRUE/,
    /remind_minutes IS NOT NULL/,
    /reminded_at IS NULL/,
    /start_at - \(remind_minutes \* INTERVAL '1 minute'\) <= NOW\(\)/,
    /COALESCE\(end_at, start_at \+ INTERVAL '60 minutes'\) > NOW\(\)/,
  ]) {
    assert.match(claim.sql, part);
  }
  // a re-checagem do reminded_at no UPDATE externo é o que impede envio em dobro entre execuções paralelas
  assert.match(claim.sql, /\) AND reminded_at IS NULL RETURNING/);
  assert.equal(findCalls(/^INSERT INTO notifications/).length, 0);
});

test('processDueReminders: cria a notificação para o responsável, com horário de Brasília e contato', async () => {
  dbWith({ claimed: [claimedRow({ assigned_to: 9 })] });
  const summary = await processDueReminders();
  assert.equal(summary.claimed, 1);
  assert.equal(summary.notified, 1);
  const ins = findCall(/^INSERT INTO notifications/);
  const [recipient, account, title, body, ref] = ins.params;
  assert.equal(recipient, 9); // o responsável, e não quem criou
  assert.equal(account, 1);
  assert.equal(title, 'Reunião em 15 min · 10:00');
  assert.equal(body, 'Reunião de proposta · Ana Acme · Sala 2');
  assert.equal(ref, 5);
});

test('processDueReminders: sem responsável, quem criou a atividade recebe', async () => {
  dbWith({ claimed: [claimedRow({ assigned_to: null, created_by: 7 })] });
  await processDueReminders();
  assert.equal(findCall(/^INSERT INTO notifications/).params[0], 7);
});

test('processDueReminders: texto da antecedência (na hora, 1 h, amanhã)', async () => {
  dbWith({
    claimed: [
      claimedRow({ id: 1, remind_minutes: 0 }),
      claimedRow({ id: 2, remind_minutes: 60 }),
      claimedRow({ id: 3, remind_minutes: 1440 }),
    ],
  });
  await processDueReminders();
  const titles = findCalls(/^INSERT INTO notifications/).map((c) => c.params[2]);
  assert.deepEqual(titles, ['Reunião agora · 10:00', 'Reunião em 1 h · 10:00', 'Reunião amanhã · 10:00']);
});

test('processDueReminders: falha em uma atividade não impede as demais', async () => {
  dbWith({ claimed: [claimedRow({ id: 1 }), claimedRow({ id: 2 })], throwOnInsertFor: 1 });
  const summary = await processDueReminders();
  assert.equal(summary.claimed, 2);
  assert.equal(summary.notified, 1);
});

test('processDueReminders: e-mail só sai para quem ligou o lembrete por e-mail (envio falso, sem rede)', async () => {
  const sent = [];
  const mailer = async (mail) => {
    sent.push(mail);
    return { success: true };
  };

  dbWith({ claimed: [claimedRow()], user: { email: 'u@test.com', name: 'U', remind_email: true } });
  let summary = await processDueReminders({ mailer });
  assert.equal(summary.emailed, 1);
  assert.equal(sent.length, 1);
  assert.equal(sent[0].to, 'u@test.com');
  assert.equal(sent[0].subject, 'Lembrete: Reunião de proposta às 10:00');
  assert.match(sent[0].text, /Ana Acme/);

  sent.length = 0;
  dbWith({ claimed: [claimedRow()], user: { email: 'u@test.com', name: 'U', remind_email: false } });
  summary = await processDueReminders({ mailer });
  assert.equal(summary.emailed, 0);
  assert.equal(sent.length, 0);
});

test('processDueReminders: falha no envio do e-mail não derruba o lembrete', async () => {
  dbWith({ claimed: [claimedRow()], user: { email: 'u@test.com', name: 'U', remind_email: true } });
  const summary = await processDueReminders({
    mailer: async () => {
      throw new Error('smtp fora do ar');
    },
  });
  assert.equal(summary.notified, 1);
  assert.equal(summary.emailed, 0);
});

test('os testes não têm SMTP configurado (nenhum e-mail real pode sair)', () => {
  assert.equal(process.env.EMAIL_HOST, '');
  assert.equal(process.env.EMAIL_USER, '');
});

test('maybeProcessReminders: no máximo uma execução a cada 20 segundos', async () => {
  resetReminderThrottle();
  dbWith({ claimed: [] });
  await maybeProcessReminders();
  await maybeProcessReminders();
  await maybeProcessReminders();
  assert.equal(findCalls(/^UPDATE activities SET reminded_at = NOW\(\)/).length, 1);
});

// ---------- feed e preferências ----------
async function api(method, path, body, { actor = { id: 7, role: 'user' } } = {}) {
  const app = await startApp({ '/n': notificationsRouter });
  try {
    const res = await fetch(`${app.url}/n${path}`, {
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

const feedDb = (extra = () => undefined) =>
  installDb((sql, params) => {
    if (/FROM users WHERE id = \?$/.test(sql) && /SELECT id, email, role, active, account_id/.test(sql)) return [userRow()];
    if (/^SELECT id, email, role, active, account_id FROM users/.test(sql)) return [userRow()];
    if (/FROM notifications WHERE user_id = \? ORDER BY/.test(sql)) {
      return [
        { id: 2, type: 'reminder', title: 'Reunião em 15 min · 10:00', body: 'x', url: '/admin/agenda', refid: 5, createdat: START, readat: null },
        { id: 1, type: 'reminder', title: 'Antigo', body: '', url: '/admin/agenda', refid: 4, createdat: START, readat: START },
      ];
    }
    if (/COUNT\(\*\)::int AS total FROM notifications/.test(sql)) return [{ total: 1 }];
    return extra(sql, params);
  });

test('GET /notifications/feed: lista as notificações do próprio usuário e a contagem de não lidas', async () => {
  resetReminderThrottle();
  feedDb((sql) => (/^UPDATE activities SET reminded_at/.test(sql) ? [] : undefined));
  const { status, body } = await api('GET', '/feed');
  assert.equal(status, 200);
  assert.equal(body.unread, 1);
  assert.equal(body.items[0].id, '2');
  assert.equal(body.items[0].read, false);
  assert.equal(body.items[1].read, true);
  assert.equal(body.items[0].refId, 5);
  const list = findCall(/FROM notifications WHERE user_id = \? ORDER BY/);
  assert.equal(list.params[0], 7); // só as do usuário logado
  assert.ok(findCall(/^UPDATE activities SET reminded_at/), 'abrir o feed também dispara lembretes vencidos');
});

test('POST /notifications/feed/:id/read e /read-all: só mexem nas notificações do próprio usuário', async () => {
  feedDb();
  assert.equal((await api('POST', '/feed/abc/read')).status, 400);

  await api('POST', '/feed/2/read');
  const one = findCall(/^UPDATE notifications SET read_at = NOW\(\) WHERE id = \?/);
  assert.match(one.sql, /AND user_id = \?/);
  assert.deepEqual(one.params, [2, 7]);

  await api('POST', '/feed/read-all');
  const all = findCall(/^UPDATE notifications SET read_at = NOW\(\) WHERE user_id = \?/);
  assert.deepEqual(all.params, [7]);
});

test('preferência de lembrete por e-mail: lê e grava só para o próprio usuário', async () => {
  feedDb((sql) => (/^SELECT remind_email FROM users/.test(sql) ? [{ remind_email: true }] : undefined));
  const got = await api('GET', '/prefs');
  assert.deepEqual(got.body, { remindEmail: true });

  await api('PUT', '/prefs', { remindEmail: true });
  const upd = findCall(/^UPDATE users SET remind_email = \? WHERE id = \?/);
  assert.deepEqual(upd.params, [true, 7]);

  await api('PUT', '/prefs', { remindEmail: 'sim' }); // só true de verdade liga
  assert.equal(findCalls(/^UPDATE users SET remind_email/).pop().params[0], false);
});

// ---------- agendador ----------
async function cron(headers = {}) {
  installDb((sql) => (/^UPDATE activities SET reminded_at/.test(sql) ? [] : undefined));
  const app = await startApp({ '/api/cron': cronRouter });
  try {
    const res = await fetch(`${app.url}/api/cron/reminders`, { headers });
    return { status: res.status, body: await res.json() };
  } finally {
    await app.close();
  }
}

test('GET /api/cron/reminders: sem CRON_SECRET no servidor responde 503', async () => {
  delete process.env.CRON_SECRET;
  assert.equal((await cron({ Authorization: 'Bearer qualquer' })).status, 503);
});

test('GET /api/cron/reminders: exige o segredo no cabeçalho', async () => {
  process.env.CRON_SECRET = 'segredo-de-teste';
  try {
    assert.equal((await cron()).status, 401);
    assert.equal((await cron({ Authorization: 'Bearer errado' })).status, 401);
    assert.equal((await cron({ Authorization: 'segredo-de-teste' })).status, 401); // sem "Bearer"
    const ok = await cron({ Authorization: 'Bearer segredo-de-teste' });
    assert.equal(ok.status, 200);
    assert.deepEqual(ok.body, { claimed: 0, notified: 0, pushed: 0, emailed: 0 });
  } finally {
    delete process.env.CRON_SECRET;
  }
});

// ---------- antecedência na atividade ----------
async function activity(method, path, body, existing) {
  installDb((sql, params) => {
    if (/FROM users WHERE id = \? AND \(id = \? OR account_id = \?\)/.test(sql)) return [{ id: params[0] }];
    if (/^SELECT id, email, role, active, account_id FROM users/.test(sql)) return [userRow({ role: 'admin', id: 1, account_id: 1 })];
    if (/FROM activities a LEFT JOIN users u/.test(sql)) return existing === null ? [] : [existing];
    if (/^INSERT INTO activities/.test(sql)) return [{ id: 11 }];
    return undefined;
  });
  const app = await startApp({ '/crm': crmRouter });
  try {
    const res = await fetch(`${app.url}/crm${path}`, {
      method,
      headers: authHeader(signToken({ id: 1, role: 'admin' })),
      body: JSON.stringify(body),
    });
    const text = await res.text();
    return { status: res.status, body: text ? JSON.parse(text) : null };
  } finally {
    await app.close();
  }
}

const BASE = { titulo: 'Reunião', tipo: 'Reunião', startAt: START, endAt: '2026-10-05T14:00:00.000Z' };

test('atividade: antecedência inválida é recusada; válida é gravada; dia inteiro e sem data ficam sem lembrete', async () => {
  assert.equal((await activity('POST', '/activities', { ...BASE, remindMinutes: 7 })).status, 400);
  assert.equal(findCalls(/^INSERT INTO activities/).length, 0);

  await activity('POST', '/activities', { ...BASE, remindMinutes: 15 });
  assert.equal(findCall(/^INSERT INTO activities/).params.at(-2), 15);

  await activity('POST', '/activities', { ...BASE, remindMinutes: 0 });
  assert.equal(findCall(/^INSERT INTO activities/).params.at(-2), 0); // "na hora" é diferente de "sem lembrete"

  await activity('POST', '/activities', { ...BASE, remindMinutes: null });
  assert.equal(findCall(/^INSERT INTO activities/).params.at(-2), null);

  await activity('POST', '/activities', { titulo: 'Feriado', tipo: 'Tarefa', startAt: '2026-10-05T03:00:00.000Z', allDay: true, remindMinutes: 15 });
  assert.equal(findCall(/^INSERT INTO activities/).params.at(-2), null);

  await activity('POST', '/activities', { titulo: 'Sem data', tipo: 'Tarefa', remindMinutes: 15 });
  assert.equal(findCall(/^INSERT INTO activities/).params.at(-2), null);
});

test('atividade: remarcar ou mudar a antecedência reabilita o lembrete; salvar sem mudar mantém', async () => {
  const existing = { id: 5, titulo: 'x', status: 'Pendente', allday: false, startat: START, remindminutes: 15 };

  // nada mudou -> reminded_at é mantido
  await activity('PUT', '/activities/5', { ...BASE, remindMinutes: 15 }, existing);
  let p = findCall(/^UPDATE activities SET contact_id/).params;
  assert.equal(p[16], 15); // remind_minutes
  assert.equal(p[18], false); // resetReminder

  // remarcou -> reabilita
  await activity('PUT', '/activities/5', { ...BASE, startAt: '2026-10-06T13:00:00.000Z', endAt: '2026-10-06T14:00:00.000Z', remindMinutes: 15 }, existing);
  p = findCall(/^UPDATE activities SET contact_id/).params;
  assert.equal(p[18], true);

  // mudou só a antecedência -> reabilita
  await activity('PUT', '/activities/5', { ...BASE, remindMinutes: 60 }, existing);
  p = findCall(/^UPDATE activities SET contact_id/).params;
  assert.equal(p[16], 60);
  assert.equal(p[18], true);
  assert.match(findCall(/^UPDATE activities SET contact_id/).sql, /reminded_at = CASE WHEN \? THEN NULL ELSE reminded_at END/);
  assert.ok(calls.length > 0);
});
