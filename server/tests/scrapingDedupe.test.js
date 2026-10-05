import test from 'node:test';
import assert from 'node:assert/strict';
import { installDb, findCall } from './helpers.js';
import { filterNewResults } from '../services/scrapingDedupeService.js';

const results = [
  { nome: 'Clínica A', telefone: '(41) 99999-1111', site: 'https://www.clinicaa.com.br/', endereco: 'Rua 1' },
  { nome: 'Clínica B', telefone: '(41) 98888-2222', site: '', endereco: 'Rua 2' },
  { nome: 'Clínica C', telefone: '(41) 97777-3333', site: '', endereco: 'Rua 3' },
  { nome: 'Clínica D', telefone: '(41) 96666-4444', site: '', endereco: 'Rua 4' },
  { nome: 'Clínica E', telefone: '(41) 95555-5555', site: '', endereco: 'Rua 5' },
  { nome: 'Clínica E dup', telefone: '(41) 95555-5555', site: '', endereco: 'Rua 5' },
];

function install({ seen = [] } = {}) {
  installDb((sql) => {
    if (/FROM scraping_seen/.test(sql)) return seen.map((result_key) => ({ result_key }));
    if (/FROM contacts/.test(sql)) return [{ nome: 'Outro nome', telefone: '41 98888-2222', site: '' }];
    if (/FROM whatsapp_chats/.test(sql)) return [{ remote_jid: '5541977773333@s.whatsapp.net', name: 'C' }];
    return undefined;
  });
}

test('descarta já salvos, já com conversa no WhatsApp, já vistos (qualquer termo) e repetidos no lote', async () => {
  install({ seen: ['site:clinicaa.com.br'] });
  const data = await filterNewResults(1, 'dentistas em curitiba', results, 10);
  assert.deepEqual(data.results.map((r) => r.nome), ['Clínica D', 'Clínica E']);
  assert.deepEqual(data.skipped, { seen: 1, contact: 1, whatsapp: 1, batch: 1 });
});

test('marca como vistos só os devolvidos, com todas as chaves', async () => {
  install();
  await filterNewResults(1, 'outro termo', results.slice(3, 4), 10);
  const ins = findCall(/INSERT INTO scraping_seen/);
  assert.ok(ins.params.includes('tel:5541966664444'));
});

test('respeita o limite pedido', async () => {
  install();
  const data = await filterNewResults(1, 'x', results.slice(3, 5), 1);
  assert.equal(data.results.length, 1);
});
