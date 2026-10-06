import test from 'node:test';
import assert from 'node:assert/strict';
import { installDb, startApp, signToken, userRow, authHeader, findCall } from './helpers.js';
import crmRouter from '../routes/crm.js';

const stages = [
  { stageKey: 'entrada', titulo: 'Entrada' },
  { stageKey: 'em_contato', titulo: 'Em contato' },
  { stageKey: 'proposta', titulo: 'Proposta' },
  { stageKey: 'fechado', titulo: 'Fechado' },
];

async function request(method, path, body, { hasDeal = true } = {}) {
  installDb((sql, params) => {
    if (/FROM users WHERE id = \? AND \(id = \? OR account_id = \?\)/.test(sql)) return [{ id: params[0] }];
    if (/FROM users/.test(sql)) return [userRow({ id: 1, role: 'admin', account_id: 1 })];
    if (/FROM deals/.test(sql)) return hasDeal ? [{ id: 9, pipelineid: 2, stagekey: 'entrada' }] : [];
    if (/FROM pipeline_stages/.test(sql)) return stages;
    return undefined;
  });
  const app = await startApp({ '/crm': crmRouter });
  try {
    const res = await fetch(`${app.url}/crm${path}`, {
      method,
      headers: authHeader(signToken({ id: 1, role: 'admin' })),
      body: body ? JSON.stringify(body) : undefined,
    });
    const text = await res.text();
    return { status: res.status, body: text ? JSON.parse(text) : null };
  } finally {
    await app.close();
  }
}

test('PUT /contacts/:id/stage move o negócio, atualiza a etapa do contato e tira a tag Novo', async () => {
  const res = await request('PUT', '/contacts/5/stage', { stageKey: 'em_contato' });
  assert.equal(res.status, 200);
  assert.equal(findCall(/UPDATE deals/).params[0], 'em_contato');
  const up = findCall(/UPDATE contacts/);
  assert.match(up.sql, /precisa_followup = FALSE/);
  assert.equal(up.params[0], 'Em contato');
});

test('PUT /contacts/:id/stage rejeita etapa que não existe no funil do contato', async () => {
  const res = await request('PUT', '/contacts/5/stage', { stageKey: 'inexistente' });
  assert.equal(res.status, 400);
  assert.equal(findCall(/UPDATE deals/), undefined);
});

test('GET /contacts/:id/stage devolve 404 quando o contato não tem negócio', async () => {
  const res = await request('GET', '/contacts/5/stage', undefined, { hasDeal: false });
  assert.equal(res.status, 404);
});
