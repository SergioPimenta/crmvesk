import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { passwordPolicyError, MIN_PASSWORD_LENGTH } from '../utils/passwordPolicy.js';
import { normalizeRow } from '../utils/rows.js';
import { canonicalWhatsAppPhone, phonesMatch, phoneToCanonicalJid } from '../utils/whatsappPhone.js';
import { normalizeMetaMime, assertMetaMimeSupported, detectMediaKind } from '../utils/waMessageBody.js';
import { verifySignature } from '../services/metaWhatsAppClient.js';

test('senha curta ou vazia é recusada; o tamanho mínimo é aceito', () => {
  assert.equal(MIN_PASSWORD_LENGTH, 8);
  assert.match(passwordPolicyError('1234567'), /pelo menos 8/);
  assert.match(passwordPolicyError(''), /pelo menos 8/);
  assert.match(passwordPolicyError(undefined), /pelo menos 8/);
  assert.equal(passwordPolicyError('12345678'), null);
  assert.match(passwordPolicyError('a'.repeat(129)), /no máximo 128/);
});

test('normalizeRow recupera as chaves camelCase que o Postgres devolve em minúsculas', () => {
  const row = normalizeRow({ id: 1, useform: false, owneruserid: 9, ownerroundrobin: true, ownerid: 3, siteurl: 'x' });
  assert.equal(row.useForm, false);
  assert.equal(row.ownerUserId, 9);
  assert.equal(row.ownerRoundRobin, true);
  assert.equal(row.ownerId, 3);
  assert.equal(row.siteUrl, 'x');
});

test('normalizeRow não sobrescreve uma chave camelCase já existente', () => {
  assert.equal(normalizeRow({ useForm: true, useform: false }).useForm, true);
});

test('telefones brasileiros: DDI, nono dígito e comparação', () => {
  assert.equal(canonicalWhatsAppPhone('(41) 99690-2905'), '5541996902905');
  assert.equal(canonicalWhatsAppPhone('554196902905'), '5541996902905'); // celular sem o 9º dígito
  assert.equal(phoneToCanonicalJid('41996902905'), '5541996902905@s.whatsapp.net');
  assert.ok(phonesMatch('41 99690-2905', '+55 41 99690 2905'));
  assert.ok(!phonesMatch('41 99690-2905', '41 99690-2906'));
  assert.equal(canonicalWhatsAppPhone(''), '');
});

test('normalizeMetaMime remove parâmetros de codec e usa a extensão quando o tipo é genérico', () => {
  assert.equal(normalizeMetaMime('a.mp3', 'audio/mpeg; codecs=x', Buffer.from('abcd')), 'audio/mpeg');
  assert.equal(normalizeMetaMime('voz.ogg', 'application/octet-stream', Buffer.from('abcd')), 'audio/ogg');
  assert.equal(normalizeMetaMime('f.jpg', 'image/jpg', Buffer.from('abcd')), 'image/jpeg');
});

test('WebM não é aceito pela Meta; MP3 e OGG são', () => {
  assert.throws(() => assertMetaMimeSupported('audio/webm'), /Formato não suportado/);
  assert.doesNotThrow(() => assertMetaMimeSupported('audio/mpeg'));
  assert.doesNotThrow(() => assertMetaMimeSupported('audio/ogg'));
  assert.equal(detectMediaKind('audio/mpeg'), 'audio');
  assert.equal(detectMediaKind('application/pdf'), 'document');
});

test('verifySignature valida o HMAC do webhook da Meta', () => {
  const secret = 's3cr3t';
  const body = '{"a":1}';
  const good = `sha256=${crypto.createHmac('sha256', secret).update(body).digest('hex')}`;
  assert.equal(verifySignature(secret, body, good), true);
  assert.equal(verifySignature(secret, body, good.replace(/.$/, '0')), false);
  assert.equal(verifySignature(secret, body, ''), false);
  assert.equal(verifySignature(secret, body, 'sha1=abc'), false);
  assert.equal(verifySignature('', body, ''), true); // sem segredo cadastrado não há o que verificar
});
