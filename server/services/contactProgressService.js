import pool from '../db.js';
import { canonicalWhatsAppPhone } from '../utils/whatsappPhone.js';
import { normalizeRows } from '../utils/rows.js';
import { logger } from '../utils/logger.js';

const stripAccents = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '');
const isEmContato = (titulo) => /\bem\s+contato\b/.test(stripAccents(titulo).toLowerCase());

async function findNewContactId(userId, chatId) {
  const [chatRows] = await pool.query(
    'SELECT contact_id AS contactId, remote_jid AS remoteJid FROM whatsapp_chats WHERE id = ? AND user_id = ?',
    [chatId, userId]
  );
  const chat = normalizeRows(chatRows)[0];
  if (!chat) return null;

  if (chat.contactId) {
    const [rows] = await pool.query(
      'SELECT id FROM contacts WHERE id = ? AND user_id = ? AND precisa_followup = TRUE',
      [chat.contactId, userId]
    );
    return rows[0]?.id ?? null;
  }

  // Conversa sem vínculo: tenta achar o contato novo pelo telefone.
  const phone = canonicalWhatsAppPhone(String(chat.remoteJid || '').split('@')[0]);
  if (phone.length < 10) return null;
  const [rows] = await pool.query(
    "SELECT id FROM contacts WHERE user_id = ? AND precisa_followup = TRUE AND REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(telefone, ' ', ''), '-', ''), '+', ''), '(', ''), ')', '') LIKE ? ORDER BY id DESC LIMIT 1",
    [userId, `%${phone.slice(-8)}`]
  );
  return rows[0]?.id ?? null;
}

/**
 * Primeira mensagem enviada a um contato novo: o negócio avança para a etapa "Em contato" do funil
 * (ou, se o funil não tiver essa etapa, para a etapa seguinte) e a tag "Novo" some.
 * Nunca lança erro: não pode atrapalhar o envio da mensagem.
 */
export async function advanceContactOnFirstMessage(userId, chatId) {
  try {
    const contactId = await findNewContactId(userId, chatId);
    if (!contactId) return;

    const [dealRows] = await pool.query(
      'SELECT id, pipeline_id AS pipelineId, stage_key AS stageKey FROM deals WHERE user_id = ? AND contact_id = ? ORDER BY id DESC LIMIT 1',
      [userId, contactId]
    );
    const deal = normalizeRows(dealRows)[0];

    let etapa = null;
    if (deal?.pipelineId) {
      const [stageRows] = await pool.query(
        'SELECT stage_key AS stageKey, titulo, pos FROM pipeline_stages WHERE user_id = ? AND pipeline_id = ? ORDER BY pos ASC, id ASC',
        [userId, deal.pipelineId]
      );
      const stages = normalizeRows(stageRows);
      const currentIdx = stages.findIndex((s) => s.stageKey === deal.stageKey);
      const target = stages.find((s) => isEmContato(s.titulo)) ?? stages[currentIdx + 1];
      const targetIdx = stages.indexOf(target);
      // Só avança: nunca puxa para trás um negócio que já está adiante.
      if (target && targetIdx > currentIdx) {
        await pool.query('UPDATE deals SET stage_key = ?, updated_at = NOW() WHERE id = ? AND user_id = ?', [
          target.stageKey,
          deal.id,
          userId,
        ]);
        etapa = target.titulo;
      }
    }

    if (etapa) {
      await pool.query(
        'UPDATE contacts SET precisa_followup = FALSE, etapa = ?, updated_at = NOW() WHERE id = ? AND user_id = ?',
        [etapa, contactId, userId]
      );
    } else {
      await pool.query('UPDATE contacts SET precisa_followup = FALSE, updated_at = NOW() WHERE id = ? AND user_id = ?', [
        contactId,
        userId,
      ]);
    }
  } catch (err) {
    logger.error('advance_contact_failed', { userId, chatId, error: err });
  }
}
