import test from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import { installDb, startApp, signToken, userRow, authHeader } from './helpers.js';
import { verifyToken, requireAdmin } from '../middleware/auth.js';

const router = express.Router();
router.get('/me', verifyToken, (req, res) =>
  res.json({ userId: req.userId, authUserId: req.authUserId, role: req.userRole })
);
router.get('/admin', verifyToken, requireAdmin, (req, res) => res.json({ ok: true }));

async function get(path, token, dbUser) {
  installDb((sql) => (/FROM users/.test(sql) ? (dbUser === null ? [] : [dbUser]) : []));
  const app = await startApp({ '/t': router });
  try {
    const res = await fetch(`${app.url}/t${path}`, { headers: token ? authHeader(token) : {} });
    return { status: res.status, body: await res.json().catch(() => null), headers: res.headers };
  } finally {
    await app.close();
  }
}

test('sem token: 403; token inválido: 401', async () => {
  assert.equal((await get('/me', null, userRow())).status, 403);
  assert.equal((await get('/me', 'lixo', userRow())).status, 401);
});

test('usuário ativo passa e recebe identidade e workspace do banco', async () => {
  const { status, body } = await get('/me', signToken(), userRow({ id: 7, account_id: 1 }));
  assert.equal(status, 200);
  assert.deepEqual(body, { userId: 1, authUserId: 7, role: 'user' });
});

test('conta desativada ou removida: 401', async () => {
  assert.equal((await get('/me', signToken(), userRow({ active: false }))).status, 401);
  assert.equal((await get('/me', signToken(), null)).status, 401);
});

test('o perfil vem do banco, não do token: admin rebaixado perde o acesso na hora', async () => {
  const stale = signToken({ role: 'admin' }); // o token ainda diz admin
  const { status, body } = await get('/admin', stale, userRow({ role: 'user' }));
  assert.equal(status, 403);
  assert.equal(body.message, 'Acesso restrito a administradores');
});

test('usuário promovido a admin acessa rotas de admin sem novo login', async () => {
  const { status } = await get('/admin', signToken({ role: 'user' }), userRow({ role: 'admin' }));
  assert.equal(status, 200);
});

test('sem account_id, o próprio usuário é o workspace', async () => {
  const { body } = await get('/me', signToken(), userRow({ id: 5, account_id: null }));
  assert.equal(body.userId, 5);
});

test('token com mais de 30 min recebe um token renovado; token novo não', async () => {
  const old = signToken({ iat: Math.floor(Date.now() / 1000) - 3600 });
  const refreshed = await get('/me', old, userRow());
  assert.equal(refreshed.status, 200);
  assert.ok(refreshed.headers.get('x-refresh-token'));

  const fresh = await get('/me', signToken(), userRow());
  assert.equal(fresh.headers.get('x-refresh-token'), null);
});

test('falha do banco vira 503 (não derruba a sessão com 401)', async () => {
  installDb(() => {
    throw new Error('db down');
  });
  const app = await startApp({ '/t': router });
  try {
    const res = await fetch(`${app.url}/t/me`, { headers: authHeader(signToken()) });
    assert.equal(res.status, 503);
  } finally {
    await app.close();
  }
});
