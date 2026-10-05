import test from 'node:test';
import assert from 'node:assert/strict';
import { installDb, findCall } from './helpers.js';
import { advanceContactOnFirstMessage } from '../services/contactProgressService.js';

const stages = [
  { stageKey: 'prospeccao', titulo: 'Prospecção', pos: 0 },
  { stageKey: 'em_contato', titulo: 'Em contato', pos: 1 },
  { stageKey: 'proposta', titulo: 'Proposta', pos: 2 },
];

function install({ dealStage = 'prospeccao', stageList = stages, newContact = true } = {}) {
  installDb((sql) => {
    if (/FROM whatsapp_chats/.test(sql)) return [{ contactId: 7, remoteJid: '5541999991111@s.whatsapp.net' }];
    if (/FROM contacts/.test(sql)) return newContact ? [{ id: 7 }] : [];
    if (/FROM deals/.test(sql)) return [{ id: 3, pipelineId: 1, stageKey: dealStage }];
    if (/FROM pipeline_stages/.test(sql)) return stageList;
    return undefined;
  });
}

test('primeira mensagem move o negócio para "Em contato" e remove a tag Novo', async () => {
  install();
  await advanceContactOnFirstMessage(1, 10);
  assert.equal(findCall(/UPDATE deals/).params[0], 'em_contato');
  const up = findCall(/UPDATE contacts/);
  assert.match(up.sql, /precisa_followup = FALSE/);
  assert.equal(up.params[0], 'Em contato');
});

test('sem etapa "Em contato", avança para a etapa seguinte', async () => {
  install({ stageList: [stages[0], stages[2]] });
  await advanceContactOnFirstMessage(1, 10);
  assert.equal(findCall(/UPDATE deals/).params[0], 'proposta');
});

test('negócio já adiante não volta para trás, mas a tag Novo some', async () => {
  install({ dealStage: 'proposta' });
  await advanceContactOnFirstMessage(1, 10);
  assert.equal(findCall(/UPDATE deals/), undefined);
  assert.match(findCall(/UPDATE contacts/).sql, /precisa_followup = FALSE/);
});

test('contato que não é novo não é alterado', async () => {
  install({ newContact: false });
  await advanceContactOnFirstMessage(1, 10);
  assert.equal(findCall(/UPDATE/), undefined);
});

import { updateMessageStatus } from '../services/whatsappService.js';

function installStatusDb(currentStatus) {
  installDb((sql) => {
    if (/FROM whatsapp_messages WHERE user_id/.test(sql)) return [{ id: 1, status: currentStatus, chatId: 10, fromMe: true }];
    if (/FROM whatsapp_chats/.test(sql)) return [{ contactId: 7, remoteJid: '5541999991111@s.whatsapp.net' }];
    if (/FROM contacts/.test(sql)) return [{ id: 7 }];
    if (/FROM deals/.test(sql)) return [{ id: 3, pipelineId: 1, stageKey: 'prospeccao' }];
    if (/FROM pipeline_stages/.test(sql)) return stages;
    return undefined;
  });
}

test('mensagem entregue avança o contato; recusada pela Meta não', async () => {
  installStatusDb('sent');
  await updateMessageStatus(1, 'wamid.X', 'delivered');
  assert.ok(findCall(/UPDATE deals/));

  installStatusDb('sent');
  await updateMessageStatus(1, 'wamid.X', 'failed', 'erro');
  assert.equal(findCall(/UPDATE deals/), undefined);
  assert.equal(findCall(/UPDATE contacts/), undefined);
});
