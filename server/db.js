import { neon } from '@neondatabase/serverless';
import dotenv from 'dotenv';

import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(__dirname, '.env') });

const connectionString =
  process.env.POSTGRES_URL || process.env.DATABASE_URL || process.env.POSTGRES_PRISMA_URL;

if (!connectionString) {
  console.warn('POSTGRES_URL não definida — necessária para Vercel Postgres / Neon.');
}

const sql = neon(connectionString || 'postgresql://localhost:5432/placeholder');

function toPgSql(text) {
  let i = 0;
  return text.replace(/\?/g, () => `$${++i}`);
}

function prepareSql(text) {
  let pg = toPgSql(text);
  if (/^\s*INSERT\b/i.test(pg) && !/\bRETURNING\b/i.test(pg)) {
    pg = pg.replace(/;?\s*$/i, ' RETURNING *');
  }
  if (/^\s*DELETE\b/i.test(pg) && !/\bRETURNING\b/i.test(pg)) {
    pg = pg.replace(/;?\s*$/i, ' RETURNING *');
  }
  if (/^\s*UPDATE\b/i.test(pg) && !/\bRETURNING\b/i.test(pg)) {
    pg = pg.replace(/;?\s*$/i, ' RETURNING *');
  }
  return pg;
}

function resolveInsertId(row) {
  if (!row || typeof row !== 'object') return undefined;
  if (row.id != null) return row.id;
  if (row.user_id != null) return row.user_id;
  return undefined;
}

function buildMeta(text, rows) {
  if (/^\s*INSERT\b/i.test(text)) {
    return { insertId: resolveInsertId(rows[0]), affectedRows: rows.length || 1 };
  }
  if (/^\s*(UPDATE|DELETE)\b/i.test(text)) {
    return { insertId: resolveInsertId(rows[0]), affectedRows: rows.length };
  }
  return { affectedRows: rows.length };
}

function isMutation(text) {
  return /^\s*(INSERT|UPDATE|DELETE)\b/i.test(text);
}

async function runQuery(client, text, params = []) {
  const pgSql = prepareSql(text);
  const raw = await client(pgSql, params);
  const list = Array.isArray(raw) ? raw : [];
  const meta = buildMeta(text, list);
  if (isMutation(text)) {
    return [meta, list];
  }
  return [list, meta];
}

function createConn(client) {
  return {
    query: (text, params) => runQuery(client, text, params),
    async beginTransaction() {},
    async commit() {},
    async rollback() {
      throw new Error('ROLLBACK');
    },
    async release() {},
  };
}

const pool = {
  query: (text, params) => runQuery(sql, text, params),

  async transaction(fn) {
    return sql.transaction(async (tx) => {
      const conn = createConn(tx);
      return fn(conn);
    });
  },

  async getConnection() {
    return createConn(sql);
  },
};

export { sql };
export default pool;
