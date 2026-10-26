import test from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import { installDb, startApp, findCall } from './helpers.js';
import formPublicRouter from '../routes/formPublic.js';

const CODE = 'f'.repeat(32);
const widgetRow = {
  id: 4,
  userId: 1,
  siteUrl: 'https://vesk.com.br',
  siteName: 'VESK',
  active: true,
  monitorCode: CODE,
  formSelector: 'form',
  fieldMappings: '[]',
  pipelineId: null,
  stageKey: 'prospeccao',
};

// Igual ao app.js: o script do site envia JSON como text/plain (sem preflight CORS).
const formRouter = express.Router();
formRouter.use(express.json({ type: ['application/json', 'text/plain'] }));
formRouter.use(formPublicRouter);

function formDb() {
  installDb((sql) => (/FROM contact_form_widgets WHERE monitor_code/.test(sql) ? [widgetRow] : undefined));
}

async function submit(app, body, headers = {}) {
  return fetch(`${app.url}/api/form/${CODE}/submit`, {
    method: 'POST',
    headers: { 'Content-Type': 'text/plain;charset=UTF-8', ...headers },
    body,
  });
}

test('formulário: envio que falha fica guardado com o corpo original', async () => {
  formDb();
  const app = await startApp({ '/api/form': formRouter });
  try {
    const res = await submit(app, JSON.stringify({ mensagem: 'Quero um orçamento', pageUrl: 'https://vesk.com.br/' }), {
      'User-Agent': 'Instagram 300.0',
      Referer: 'https://vesk.com.br/',
    });
    assert.equal(res.status, 400);
    assert.match((await res.json()).message, /Informe ao menos nome, e-mail ou telefone/);

    const saved = findCall(/INSERT INTO contact_form_failed_submissions/);
    assert.ok(saved, 'envio com falha é registrado');
    const [code, payload, error, userAgent, referer] = saved.params;
    assert.equal(code, CODE);
    assert.deepEqual(JSON.parse(payload), { mensagem: 'Quero um orçamento', pageUrl: 'https://vesk.com.br/' });
    assert.match(error, /Informe ao menos/);
    assert.equal(userAgent, 'Instagram 300.0');
    assert.equal(referer, 'https://vesk.com.br/');
  } finally {
    await app.close();
  }
});

test('formulário: se o registro da falha também falhar, o visitante ainda recebe a resposta de erro', async () => {
  installDb((sql) => {
    if (/FROM contact_form_widgets WHERE monitor_code/.test(sql)) return [widgetRow];
    if (/INSERT INTO contact_form_failed_submissions/.test(sql)) throw new Error('tabela ausente');
    return undefined;
  });
  const app = await startApp({ '/api/form': formRouter });
  const originalError = console.error;
  console.error = () => {};
  try {
    const res = await submit(app, JSON.stringify({ mensagem: 'oi' }));
    assert.equal(res.status, 400);
  } finally {
    console.error = originalError;
    await app.close();
  }
});

test('formulário: envio válido não é registrado como falha', async () => {
  installDb((sql) => {
    if (/FROM contact_form_widgets WHERE monitor_code/.test(sql)) return [widgetRow];
    if (/FROM pipelines WHERE id = \? AND user_id/.test(sql)) return [{ id: 9, nome: 'Funil' }];
    if (/FROM pipelines WHERE user_id/.test(sql)) return [{ id: 9 }];
    if (/FROM pipeline_stages/.test(sql)) return [{ stageKey: 'prospeccao', titulo: 'Prospecção' }];
    if (/INSERT INTO contacts/.test(sql)) return [{ id: 31 }];
    return undefined;
  });
  const app = await startApp({ '/api/form': formRouter });
  try {
    const res = await submit(app, JSON.stringify({ nome: 'Ana', telefone: '41999990000' }));
    assert.equal(res.status, 200);
    assert.equal(findCall(/INSERT INTO contact_form_failed_submissions/), undefined);
  } finally {
    await app.close();
  }
});
