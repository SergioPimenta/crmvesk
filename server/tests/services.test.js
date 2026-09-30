import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import express from 'express';
import { installDb, startApp, findCall } from './helpers.js';
import { processWebhook } from '../services/whatsappService.js';
import { normalizeOwnerSetting, resolveLeadOwner } from '../services/leadOwnerService.js';
import { listDispatchGroups, updateDispatchGroup } from '../services/dispatchGroupService.js';
import healthRouter from '../routes/health.js';

// ---------- webhook da Meta ----------
const SECRET = 'app-secret';
const payload = { object: 'whatsapp_business_account', entry: [] };
const rawBody = JSON.stringify(payload);
const sign = (body) => `sha256=${crypto.createHmac('sha256', SECRET).update(body).digest('hex')}`;

function installWebhookDb() {
  installDb((sql) =>
    /FROM whatsapp_settings/.test(sql)
      ? [{ userId: 1, provider: 'meta', webhookSecret: 'hook', appSecret: SECRET, status: 'connected' }]
      : undefined
  );
}

test('webhook: assinatura válida é processada', async () => {
  installWebhookDb();
  const res = await processWebhook(1, 'hook', payload, { rawBody, signature: sign(rawBody), rawBodyTrusted: true });
  assert.equal(res.ok, true);
});

test('webhook: assinatura inválida ou ausente é rejeitada', async () => {
  installWebhookDb();
  await assert.rejects(
    processWebhook(1, 'hook', payload, { rawBody, signature: sign('outro corpo'), rawBodyTrusted: true }),
    /Assinatura do webhook inválida/
  );
  await assert.rejects(
    processWebhook(1, 'hook', payload, { rawBody, signature: '', rawBodyTrusted: true }),
    /Assinatura do webhook inválida/
  );
});

test('webhook: segredo da URL errado é rejeitado antes de qualquer coisa', async () => {
  installWebhookDb();
  await assert.rejects(
    processWebhook(1, 'errado', payload, { rawBody, signature: sign(rawBody), rawBodyTrusted: true }),
    /Webhook não autorizado/
  );
});

test('webhook: WHATSAPP_SIGNATURE_MODE=warn deixa passar mesmo com assinatura inválida', async () => {
  installWebhookDb();
  process.env.WHATSAPP_SIGNATURE_MODE = 'warn';
  try {
    const res = await processWebhook(1, 'hook', payload, { rawBody, signature: 'sha256=00', rawBodyTrusted: true });
    assert.equal(res.ok, true);
  } finally {
    delete process.env.WHATSAPP_SIGNATURE_MODE;
  }
});

// ---------- responsável pelos leads ----------
test('responsável fixo e ativo recebe o lead', async () => {
  installDb((sql) => (/FROM users WHERE id = \? AND active/.test(sql) ? [{ id: 7 }] : []));
  assert.equal(await resolveLeadOwner(1, { ownerUserId: 7 }), 7);
});

test('responsável fixo desativado, sem rodízio: lead fica sem dono', async () => {
  installDb(() => []);
  assert.equal(await resolveLeadOwner(1, { ownerUserId: 7 }), null);
});

test('rodízio escolhe o usuário comum ativo há mais tempo sem lead', async () => {
  installDb((sql) => (/ORDER BY/.test(sql) && /role = 'user'/.test(sql) ? [{ id: 12 }] : []));
  assert.equal(await resolveLeadOwner(1, { ownerRoundRobin: true }), 12);
  const q = findCall(/role = 'user'/);
  assert.match(q.sql, /NULLS FIRST/);
  assert.match(q.sql, /Lead via botão%/);
});

test('rodízio sem ninguém elegível e sem configuração: null', async () => {
  installDb(() => []);
  assert.equal(await resolveLeadOwner(1, { ownerRoundRobin: true }), null);
  assert.equal(await resolveLeadOwner(1, {}), null);
});

test('normalizeOwnerSetting: rodízio vence usuário fixo; membro inválido lança erro', async () => {
  installDb(() => []);
  assert.deepEqual(await normalizeOwnerSetting(1, { ownerUserId: 3, ownerRoundRobin: true }), {
    ownerUserId: null,
    ownerRoundRobin: true,
  });
  assert.deepEqual(await normalizeOwnerSetting(1, { ownerUserId: '', ownerRoundRobin: false }), {
    ownerUserId: null,
    ownerRoundRobin: false,
  });
  await assert.rejects(normalizeOwnerSetting(1, { ownerUserId: 99 }), /Responsável inválido/);
});

// ---------- grupos de disparo ----------
test('grupos de disparo: usuário comum só lista os que criou; admin lista todos', async () => {
  installDb(() => []);
  await listDispatchGroups(1, 7);
  assert.match(findCall(/FROM whatsapp_dispatch_groups/).sql, /created_by = \?/);
  installDb(() => []);
  await listDispatchGroups(1, null);
  assert.doesNotMatch(findCall(/FROM whatsapp_dispatch_groups/).sql, /created_by/);
});

test('grupos de disparo: editar grupo de outro usuário dá "Grupo não encontrado"', async () => {
  installDb(() => []);
  await assert.rejects(updateDispatchGroup(1, 5, { name: 'x', contactIds: [] }, 7), /Grupo não encontrado/);
  assert.match(findCall(/SELECT id FROM whatsapp_dispatch_groups/).sql, /created_by = \?/);
});

test('grupos de disparo: usuário comum só pode incluir contatos que ele criou', async () => {
  installDb((sql) => {
    if (/SELECT id FROM whatsapp_dispatch_groups/.test(sql)) return [{ id: 5 }];
    if (/SELECT id FROM contacts/.test(sql)) return [{ id: 1 }]; // o banco só devolve os contatos dele
    return undefined;
  });
  const group = await updateDispatchGroup(1, 5, { name: 'x', contactIds: [1, 2, 3] }, 7);
  assert.deepEqual(group.contactIds, ['1']);
  assert.match(findCall(/SELECT id FROM contacts/).sql, /created_by = \?/);
});

// ---------- saúde e erros do navegador ----------
test('GET /health: 200 com banco ok', async () => {
  installDb(() => [{ '?column?': 1 }]);
  const app = await startApp({ '/api': healthRouter });
  try {
    const res = await fetch(`${app.url}/api/health`);
    const body = await res.json();
    assert.equal(res.status, 200);
    assert.equal(body.status, 'ok');
    assert.equal(body.db, 'ok');
  } finally {
    await app.close();
  }
});

test('POST /client-errors: responde 204 e não quebra com corpo vazio', async () => {
  installDb((sql) => (/INSERT INTO rate_limits/.test(sql) ? [{ hits: 1 }] : undefined));
  const app = await startApp({ '/api': healthRouter });
  try {
    const res = await fetch(`${app.url}/api/client-errors`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message: 'x'.repeat(2000), stack: 'y'.repeat(9000) }),
    });
    assert.equal(res.status, 204);
    const empty = await fetch(`${app.url}/api/client-errors`, { method: 'POST' });
    assert.equal(empty.status, 204);
  } finally {
    await app.close();
  }
});

// garante que o helper de app não esconde falhas assíncronas de rotas
test('rota async que lança vira resposta 500 (express-async-errors)', async () => {
  await import('express-async-errors');
  const router = express.Router();
  router.get('/boom', async () => {
    throw new Error('falha');
  });
  const app = await startApp({ '/t': router });
  try {
    const res = await fetch(`${app.url}/t/boom`);
    assert.equal(res.status, 500);
  } finally {
    await app.close();
  }
});
