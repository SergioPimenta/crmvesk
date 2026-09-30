import test from 'node:test';
import assert from 'node:assert/strict';
import { installDb } from './helpers.js';
import { rateLimit, clientIp } from '../middleware/rateLimit.js';

function fakeRes() {
  const res = { statusCode: 200, headers: {}, body: null };
  res.setHeader = (k, v) => {
    res.headers[k] = v;
  };
  res.status = (c) => {
    res.statusCode = c;
    return res;
  };
  res.json = (b) => {
    res.body = b;
    return res;
  };
  return res;
}

const counters = new Map();
function installCounterDb() {
  counters.clear();
  installDb((sql, params) => {
    if (/^INSERT INTO rate_limits/.test(sql)) {
      const key = `${params[0]}|${params[1]}`;
      counters.set(key, (counters.get(key) || 0) + 1);
      return [{ hits: counters.get(key) }]; // RETURNING hits
    }
    return [];
  });
}

test('bloqueia a partir da tentativa seguinte ao limite e informa Retry-After', async () => {
  installCounterDb();
  const mw = rateLimit({ name: 't', limit: 3, windowSec: 600, key: () => 'k' });
  const statuses = [];
  let last;
  for (let i = 0; i < 5; i += 1) {
    const res = fakeRes();
    await mw({ headers: {}, socket: {} }, res, () => {});
    statuses.push(res.statusCode);
    last = res;
  }
  assert.deepEqual(statuses, [200, 200, 200, 429, 429]);
  assert.ok(Number(last.headers['Retry-After']) > 0);
});

test('chaves diferentes têm contadores independentes', async () => {
  installCounterDb();
  let passed = 0;
  const mw = rateLimit({ name: 't', limit: 1, windowSec: 600, key: (req) => req.k });
  for (const k of ['a', 'b', 'c']) {
    const res = fakeRes();
    await mw({ headers: {}, socket: {}, k }, res, () => {
      passed += 1;
    });
    assert.equal(res.statusCode, 200);
  }
  assert.equal(passed, 3);
});

test('se o banco falhar, a requisição passa (o limitador não derruba o login)', async () => {
  installDb(() => {
    throw new Error('db down');
  });
  const mw = rateLimit({ name: 't', limit: 1, windowSec: 600, key: () => 'k' });
  let passed = false;
  await mw({ headers: {}, socket: {} }, fakeRes(), () => {
    passed = true;
  });
  assert.ok(passed);
});

test('onLimited personalizado substitui a resposta 429', async () => {
  installCounterDb();
  const mw = rateLimit({
    name: 't',
    limit: 0,
    windowSec: 600,
    key: () => 'k',
    onLimited: (req, res) => res.status(204),
  });
  const res = fakeRes();
  await mw({ headers: {}, socket: {} }, res, () => {});
  assert.equal(res.statusCode, 204);
});

test('clientIp usa o primeiro IP de x-forwarded-for', () => {
  assert.equal(clientIp({ headers: { 'x-forwarded-for': '1.2.3.4, 5.6.7.8' }, socket: {} }), '1.2.3.4');
  assert.equal(clientIp({ headers: {}, socket: { remoteAddress: '9.9.9.9' } }), '9.9.9.9');
});
