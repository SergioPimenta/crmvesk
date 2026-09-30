import pool from '../db.js';

// Notas internas e eventos da conversa (assumida, transferida, finalizada...) ficam na mesma tabela das
// mensagens, com `kind` = 'note' | 'event'. Nunca são enviados ao cliente, não mudam a prévia da conversa,
// nem o contador de não lidas, nem a janela de 24 h.

export async function getUserName(userId) {
  if (!userId) return null;
  const [rows] = await pool.query('SELECT name FROM users WHERE id = ?', [userId]);
  return rows[0]?.name || null;
}

export async function addChatEvent(userId, chatId, text, authorId = null) {
  const body = String(text || '').trim().slice(0, 300);
  if (!body) return;
  try {
    await pool.query(
      `INSERT INTO whatsapp_messages (user_id, chat_id, body, from_me, message_at, status, kind, author_id)
       VALUES (?, ?, ?, TRUE, NOW(), '', 'event', ?)`,
      [userId, chatId, body, authorId]
    );
  } catch (err) {
    // O histórico é informativo: falhar aqui nunca deve impedir assumir, transferir ou finalizar.
    console.warn('addChatEvent:', err.message);
  }
}

export async function addChatNote(userId, chatId, authorId, text) {
  const body = String(text || '').trim();
  if (!body) throw new Error('A nota não pode ficar vazia');
  if (body.length > 2000) throw new Error('A nota pode ter no máximo 2000 caracteres');
  await pool.query(
    `INSERT INTO whatsapp_messages (user_id, chat_id, body, from_me, message_at, status, kind, author_id)
     VALUES (?, ?, ?, TRUE, NOW(), '', 'note', ?)`,
    [userId, chatId, body, authorId]
  );
}
