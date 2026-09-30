import pool from '../db.js';

const ARCHIVABLE = new Set(['contacts', 'deals', 'emails', 'companies', 'proposals', 'activities']);

/**
 * Guarda uma cópia (JSON) das linhas que serão excluídas em `deleted_records`, para permitir recuperação
 * manual. Nunca bloqueia a exclusão: falhas viram apenas aviso no log.
 */
export async function archiveRows(req, table, whereSql, params) {
  if (!ARCHIVABLE.has(table)) throw new Error(`Tabela não arquivável: ${table}`);
  try {
    const [rows] = await pool.query(`SELECT id, to_jsonb(t) AS data FROM ${table} t WHERE ${whereSql}`, params);
    for (const row of rows) {
      const data = typeof row.data === 'string' ? row.data : JSON.stringify(row.data);
      await pool.query(
        'INSERT INTO deleted_records (user_id, table_name, record_id, data, deleted_by) VALUES (?, ?, ?, ?::jsonb, ?)',
        [req.userId, table, row.id, data, req.authUserId]
      );
    }
  } catch (err) {
    console.warn('archiveRows:', err.message);
  }
}
