import test from 'node:test';
import assert from 'node:assert/strict';
import { installDb, startApp, signToken, userRow, authHeader, findCall, findCalls } from './helpers.js';
import waRouter from '../routes/whatsapp.js';
import { normalizeShortcut } from '../services/quickReplyService.js';

// Workspace 1; usuário comum #7 (Maria) e administrador #1 (Sergio).
const USER = { role: 'user', id: 7 };
const ADMIN = { role: 'admin', id: 1 };

/**
 * chat: linha de whatsapp_chats devolvida ao conferir acesso (ex.: { assignedTo: 7 }); null = não existe.
 * extra: (sql, params) => resposta adicional para a consulta em teste.
 */
async function call(actor, method, path, body, { chat = { assignedTo: null }, extra = () => undefined } = {}) {
  installDb((sql, params) => {
    if (/FROM users WHERE id = \? AND \(id = \? OR account_id = \?\)/.test(sql)) return [{ id: params[0] }];
    if (/^SELECT name FROM users WHERE id = \?/.test(sql)) return [{ name: params[0] === 1 ? 'Sergio' : params[0] === 7 ? 'Maria' : 'Outro' }];
    if (/FROM users/.test(sql)) return [userRow({ id: actor.id, role: actor.role, account_id: 1 })];
    if (/SELECT assigned_to AS assignedTo FROM whatsapp_chats/.test(sql)) return chat ? [chat] : [];
    return extra(sql, params);
  });
  const app = await startApp({ '/wa': waRouter });
  try {
    const res = await fetch(`${app.url}/wa${path}`, {
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

// ---------- respostas rápidas ----------
test('normalizeShortcut remove a barra, acentos e maiúsculas', () => {
  assert.equal(normalizeShortcut('/Olá-Bom_Dia'), 'ola-bom_dia');
  assert.equal(normalizeShortcut('  //PREÇO '), 'preco');
});

test('POST /quick-replies: atalho e texto inválidos são recusados', async () => {
  for (const body of [
    { shortcut: '', text: 'oi' },
    { shortcut: 'tem espaço', text: 'oi' },
    { shortcut: 'a'.repeat(31), text: 'oi' },
    { shortcut: 'ok', text: '   ' },
    { shortcut: 'ok', text: 'x'.repeat(1001) },
  ]) {
    const { status } = await call(USER, 'POST', '/quick-replies', body);
    assert.equal(status, 400, JSON.stringify(body).slice(0, 40));
  }
  assert.equal(findCalls(/^INSERT INTO quick_replies/).length, 0);
});

test('POST /quick-replies: cria com o atalho normalizado, no workspace e com o autor', async () => {
  const { status, body } = await call(USER, 'POST', '/quick-replies', { shortcut: '/Boas-Vindas', text: ' Olá! ' }, {
    extra: (sql) =>
      /^INSERT INTO quick_replies/.test(sql) ? [{ id: 5, shortcut: 'boas-vindas', text: 'Olá!', createdby: 7 }] : [],
  });
  assert.equal(status, 201);
  assert.equal(body.reply.shortcut, 'boas-vindas');
  assert.deepEqual(body.reply, { id: '5', shortcut: 'boas-vindas', text: 'Olá!', createdBy: 7 });
  const ins = findCall(/^INSERT INTO quick_replies/);
  assert.deepEqual(ins.params, [1, 7, 'boas-vindas', 'Olá!']);
});

test('POST /quick-replies: atalho repetido no workspace é recusado', async () => {
  const { status, body } = await call(USER, 'POST', '/quick-replies', { shortcut: 'oi', text: 'x' }, {
    extra: (sql) => (/SELECT id FROM quick_replies WHERE user_id = \? AND shortcut = \?/.test(sql) ? [{ id: 1 }] : []),
  });
  assert.equal(status, 400);
  assert.match(body.message, /Já existe uma resposta com o atalho \/oi/);
});

test('PUT/DELETE /quick-replies/:id: usuário comum só mexe nas que criou; administrador mexe em todas', async () => {
  const theirs = (sql) => (/SELECT id, created_by FROM quick_replies/.test(sql) ? [{ id: 9, created_by: 2 }] : []);
  assert.equal((await call(USER, 'PUT', '/quick-replies/9', { shortcut: 'x', text: 'y' }, { extra: theirs })).status, 403);
  assert.equal((await call(USER, 'DELETE', '/quick-replies/9', null, { extra: theirs })).status, 403);
  assert.equal(findCalls(/^DELETE FROM quick_replies/).length, 0);

  assert.equal((await call(ADMIN, 'DELETE', '/quick-replies/9', null, { extra: theirs })).status, 204);
  assert.ok(findCall(/^DELETE FROM quick_replies/));

  const mine = (sql) => (/SELECT id, created_by FROM quick_replies/.test(sql) ? [{ id: 9, created_by: 7 }] : []);
  assert.equal((await call(USER, 'DELETE', '/quick-replies/9', null, { extra: mine })).status, 204);
});

test('PUT /quick-replies/:id: resposta inexistente dá 400 com mensagem', async () => {
  const { status, body } = await call(ADMIN, 'PUT', '/quick-replies/9', { shortcut: 'x', text: 'y' }, { extra: () => [] });
  assert.equal(status, 400);
  assert.match(body.message, /não encontrada/);
});

// ---------- acesso por conversa ----------
test('conversa de outro usuário: GET mensagens, enviar, anotar, finalizar e transferir dão 403', async () => {
  const other = { chat: { assignedTo: 2 } };
  const requests = [
    ['GET', '/chats/4/messages'],
    ['POST', '/chats/4/messages', { text: 'oi' }],
    ['POST', '/chats/4/notes', { text: 'x' }],
    ['POST', '/chats/4/attendance', { status: 'closed' }],
    ['PUT', '/chats/4/assign', { userId: 7 }],
    ['POST', '/chats/4/media', { blobUrl: 'https://x/y.png' }],
  ];
  for (const [method, path, body] of requests) {
    const { status } = await call(USER, method, path, body, other);
    assert.equal(status, 403, `${method} ${path}`);
  }
  assert.equal(findCalls(/^INSERT INTO whatsapp_messages/).length, 0);
});

test('conversa inexistente dá 404; sem responsável ou atribuída ao próprio usuário passa; administrador sempre passa', async () => {
  assert.equal((await call(USER, 'GET', '/chats/4/messages', null, { chat: null })).status, 404);
  assert.equal((await call(USER, 'GET', '/chats/4/messages', null, { chat: { assignedTo: null } })).status, 200);
  assert.equal((await call(USER, 'GET', '/chats/4/messages', null, { chat: { assignedTo: 7 } })).status, 200);
  assert.equal((await call(ADMIN, 'GET', '/chats/4/messages', null, { chat: { assignedTo: 2 } })).status, 200);
});

// ---------- notas internas ----------
test('POST /chats/:id/notes grava nota com autor, sem enviar nada ao cliente', async () => {
  const { status } = await call(USER, 'POST', '/chats/4/notes', { text: '  Cliente pediu desconto  ' });
  assert.equal(status, 201);
  const ins = findCall(/^INSERT INTO whatsapp_messages/);
  assert.match(ins.sql, /'note'/);
  assert.deepEqual(ins.params, [1, 4, 'Cliente pediu desconto', 7]);
});

test('POST /chats/:id/notes: nota vazia ou muito longa é recusada', async () => {
  assert.equal((await call(USER, 'POST', '/chats/4/notes', { text: '   ' })).status, 400);
  assert.equal((await call(USER, 'POST', '/chats/4/notes', { text: 'x'.repeat(2001) })).status, 400);
  assert.equal(findCalls(/^INSERT INTO whatsapp_messages/).length, 0);
});

test('GET /chats/:id/messages devolve kind e autor das notas e dos eventos', async () => {
  const { body } = await call(USER, 'GET', '/chats/4/messages', null, {
    extra: (sql) =>
      /FROM whatsapp_messages m LEFT JOIN users u/.test(sql)
        ? [
            { id: 1, text: 'Oi', fromMe: false, messageAt: '2026-09-30T10:00:00Z', kind: 'message' },
            { id: 2, text: 'Falar com o gerente', fromMe: true, messageAt: '2026-09-30T10:01:00Z', kind: 'note', authorname: 'Maria' },
            { id: 3, text: 'Maria assumiu a conversa', fromMe: true, messageAt: '2026-09-30T10:02:00Z', kind: 'event' },
          ]
        : undefined,
  });
  const [msg, note, event] = body.messages;
  assert.equal(msg.kind, 'message');
  assert.equal(note.kind, 'note');
  assert.equal(note.authorName, 'Maria');
  assert.equal(note.status, undefined); // nota não tem status de entrega
  assert.equal(event.kind, 'event');
  assert.equal(event.text, 'Maria assumiu a conversa');
});

// ---------- eventos da conversa ----------
const events = () => findCalls(/^INSERT INTO whatsapp_messages/).map((c) => c.params[2]);

test('assumir, transferir e devolver a conversa registram o evento com nome de quem fez', async () => {
  await call(USER, 'PUT', '/chats/4/assign', { userId: 7, claim: true }); // Maria assume
  assert.deepEqual(events(), ['Maria assumiu a conversa']);

  await call(ADMIN, 'PUT', '/chats/4/assign', { userId: 7 }); // Sergio transfere para Maria
  assert.deepEqual(events(), ['Sergio transferiu a conversa para Maria']);

  await call(ADMIN, 'PUT', '/chats/4/assign', { userId: null }); // Sergio devolve à equipe
  assert.deepEqual(events(), ['Sergio devolveu a conversa para a equipe']);
});

test('finalizar registra evento; repetir o mesmo status não duplica', async () => {
  const open = (sql) => (/AS attendanceStatus FROM whatsapp_chats/.test(sql) ? [{ attendancestatus: 'open' }] : undefined);
  await call(USER, 'POST', '/chats/4/attendance', { status: 'closed' }, { extra: open });
  assert.deepEqual(events(), ['Maria finalizou o atendimento']);

  const closed = (sql) => (/AS attendanceStatus FROM whatsapp_chats/.test(sql) ? [{ attendancestatus: 'closed' }] : undefined);
  await call(USER, 'POST', '/chats/4/attendance', { status: 'closed' }, { extra: closed });
  assert.deepEqual(events(), []);

  await call(USER, 'POST', '/chats/4/attendance', { status: 'open' }, { extra: closed });
  assert.deepEqual(events(), ['Maria reabriu o atendimento']);
});

test('falha ao gravar o evento não impede assumir a conversa', async () => {
  const { status } = await call(USER, 'PUT', '/chats/4/assign', { userId: 7, claim: true }, {
    extra: (sql) => {
      if (/^INSERT INTO whatsapp_messages/.test(sql)) throw new Error('db down');
      return undefined;
    },
  });
  assert.equal(status, 200);
});
