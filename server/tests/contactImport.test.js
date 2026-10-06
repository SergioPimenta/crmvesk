import test from 'node:test';
import assert from 'node:assert/strict';
import pool from '../db.js';
import { installDb, findCalls } from './helpers.js';
import { importContactsFromRows } from '../services/contactImportService.js';

const stages = ['Entrada', 'Em contato', 'Negociação', 'Proposta', 'Fechado'].map((titulo, pos) => ({
  pipelineId: 1,
  stageKey: titulo.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/\s+/g, '_'),
  titulo,
  pos,
}));

function install() {
  let id = 100;
  installDb((sql) => {
    if (/FROM pipelines/.test(sql)) return [{ id: 1, nome: 'Principal', isDefault: true }];
    if (/FROM pipeline_stages/.test(sql)) return stages;
    if (/FROM contacts/.test(sql)) return [{ nome: 'Já Existe', telefone: '+55 41 90000-0001' }];
    if (/FROM companies/.test(sql)) return [{ id: 5, nome: 'Empresa Antiga' }];
    if (/^INSERT/.test(sql)) return [{ id: (id += 1) }];
    return undefined;
  });
  pool.transaction = async (fn) => fn({ query: pool.query });
}

const base = { email: '', site: '', tipo: 'Lead', funil: 'Principal', etapa: 'Entrada' };

test('importa a planilha padrão: funil/etapa por nome, empresa nova criada, duplicados e erros reportados', async () => {
  install();
  const data = await importContactsFromRows({
    userId: 1,
    authUserId: 2,
    ensureDefaultPipeline: async () => ({ id: 1 }),
    rows: [
      { ...base, nome: 'ZAP Arquitetura', telefone: '+55 41 98701-8228', empresa: 'ZAP Arquitetura' },
      { ...base, nome: 'Outro', telefone: '+55 41 98701-8228', empresa: '' }, // mesmo telefone da linha anterior
      { ...base, nome: 'Já Existe', telefone: '+55 41 90000-0001', empresa: '' },
      { ...base, nome: 'Com empresa antiga', telefone: '', empresa: 'empresa antiga', etapa: 'em contato' },
      { ...base, nome: '', telefone: '' },
      { ...base, nome: 'Funil errado', funil: 'Inexistente' },
      { ...base, nome: 'Etapa errada', etapa: 'Nada' },
      { ...base, nome: 'Tipo errado', tipo: 'Abc' },
    ],
  });
  assert.equal(data.saved, 2);
  assert.equal(data.skipped, 2);
  assert.deepEqual(data.errors.map((e) => e.linha), [6, 7, 8, 9]);

  const deals = findCalls(/INSERT INTO deals/);
  assert.equal(deals[0].params.at(-1), 'entrada');
  assert.equal(deals[1].params.at(-1), 'em_contato');
  assert.equal(findCalls(/INSERT INTO companies/).length, 1); // só a "ZAP"; a outra reaproveita a existente
  assert.ok(findCalls(/INSERT INTO contacts/)[0].sql.includes('precisa_followup'));
});
