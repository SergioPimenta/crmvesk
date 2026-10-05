// Reverte contatos que foram avançados para "Em contato" (e perderam a tag Novo) por uma primeira mensagem
// que a Meta recusou. Uso (com POSTGRES_URL definida, ex.: `vercel env pull`):
//   node server/scripts/revert-failed-advances.js           -> só lista (dry-run)
//   node server/scripts/revert-failed-advances.js --apply   -> aplica
//   --since=AAAA-MM-DD  só contatos alterados a partir dessa data (use a data em que o avanço automático entrou
//                       no ar, para não desfazer movimentações feitas à mão antes disso)
// Critério: o contato tem conversa com ao menos 1 mensagem nossa "failed", nenhuma mensagem nossa
// enviada/entregue/lida, nenhuma resposta do cliente, e não está mais marcado como Novo.
import pool from '../db.js';

const apply = process.argv.includes('--apply');
const since = (process.argv.find((a) => a.startsWith('--since=')) || '').slice(8);
if (since && !/^\d{4}-\d{2}-\d{2}$/.test(since)) throw new Error('--since deve ser AAAA-MM-DD');

const [candidates] = await pool.query(
  `SELECT c.id, c.user_id, c.nome, c.etapa
   FROM contacts c
   WHERE c.precisa_followup = FALSE
     AND (?::text = '' OR (c.updated_at AT TIME ZONE 'America/Sao_Paulo')::date >= ?::date)
     AND EXISTS (SELECT 1 FROM whatsapp_chats ch JOIN whatsapp_messages m ON m.chat_id = ch.id
                 WHERE ch.contact_id = c.id AND m.from_me = TRUE AND m.status = 'failed')
     AND NOT EXISTS (SELECT 1 FROM whatsapp_chats ch JOIN whatsapp_messages m ON m.chat_id = ch.id
                     WHERE ch.contact_id = c.id AND m.from_me = TRUE AND COALESCE(m.status, '') <> 'failed')
     AND NOT EXISTS (SELECT 1 FROM whatsapp_chats ch JOIN whatsapp_messages m ON m.chat_id = ch.id
                     WHERE ch.contact_id = c.id AND m.from_me = FALSE)`,
  [since, since || '1970-01-01']
);

console.log(`${candidates.length} contato(s) a reverter${apply ? '' : ' (dry-run, use --apply)'}:`);
for (const c of candidates) {
  console.log(`- #${c.id} ${c.nome} (etapa atual: ${c.etapa})`);
  if (!apply) continue;

  const [dealRows] = await pool.query(
    'SELECT id, pipeline_id FROM deals WHERE user_id = ? AND contact_id = ? ORDER BY id DESC LIMIT 1',
    [c.user_id, c.id]
  );
  let etapa = null;
  if (dealRows[0]?.pipeline_id) {
    const [stageRows] = await pool.query(
      'SELECT stage_key, titulo FROM pipeline_stages WHERE user_id = ? AND pipeline_id = ? ORDER BY pos ASC, id ASC LIMIT 1',
      [c.user_id, dealRows[0].pipeline_id]
    );
    if (stageRows[0]) {
      await pool.query('UPDATE deals SET stage_key = ?, updated_at = NOW() WHERE id = ? AND user_id = ?', [
        stageRows[0].stage_key,
        dealRows[0].id,
        c.user_id,
      ]);
      etapa = stageRows[0].titulo;
    }
  }
  await pool.query(
    'UPDATE contacts SET precisa_followup = TRUE, etapa = COALESCE(?, etapa), updated_at = NOW() WHERE id = ? AND user_id = ?',
    [etapa, c.id, c.user_id]
  );
}
process.exit(0);
