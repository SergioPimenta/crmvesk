// Utilitários de teste: troca pool.query por um simulador (não precisa de banco) e sobe routers Express
// reais em uma porta efêmera. Formato de retorno do pool: SELECT -> [linhas, meta]; INSERT/UPDATE/DELETE -> [meta, linhas].
import './setupEnv.js';
import 'express-async-errors'; // igual ao app real: erros lançados em rotas async viram resposta
import http from 'node:http';
import express from 'express';
import jwt from 'jsonwebtoken';
import pool from '../db.js';
import { invalidateAuthCache } from '../middleware/auth.js';

export const calls = [];
const squash = (sql) => sql.replace(/\s+/g, ' ').trim();
const isMutation = (sql) => /^\s*(INSERT|UPDATE|DELETE)\b/i.test(sql);

/** @param handler (sql, params) => linhas | { rows, affectedRows } | undefined (padrão: vazio / 1 linha afetada) */
export function installDb(handler = () => undefined) {
  calls.length = 0;
  invalidateAuthCache();
  pool.query = async (text, params = []) => {
    const sql = squash(text);
    calls.push({ sql, params });
    const out = handler(sql, params);
    const rows = Array.isArray(out) ? out : out?.rows ?? [];
    const affectedRows = out && !Array.isArray(out) && out.affectedRows !== undefined ? out.affectedRows : 1;
    return isMutation(sql) ? [{ affectedRows, insertId: rows[0]?.id }, rows] : [rows, { affectedRows: rows.length }];
  };
}

export const findCall = (pattern) => calls.find((c) => pattern.test(c.sql));
export const findCalls = (pattern) => calls.filter((c) => pattern.test(c.sql));

export const userRow = (overrides = {}) => ({
  id: 7,
  email: 'u@test.com',
  role: 'user',
  active: true,
  account_id: 1,
  ...overrides,
});

export function signToken(claims = {}, options = { expiresIn: '4h' }) {
  return jwt.sign({ id: 7, role: 'user', email: 'u@test.com', accountId: 1, ...claims }, process.env.JWT_SECRET, options);
}

/** Sobe um Express com os routers informados ({ '/api/x': router }) e devolve { url, close }. */
export async function startApp(mounts) {
  const app = express();
  app.use(express.json());
  for (const [path, router] of Object.entries(mounts)) app.use(path, router);
  // mesmo contrato do handler de erros de produção
  // eslint-disable-next-line no-unused-vars
  app.use((err, req, res, next) => {
    res.status(Number(err.statusCode) || 500).json({ message: err.message });
  });
  const server = http.createServer(app);
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const { port } = server.address();
  return { url: `http://127.0.0.1:${port}`, close: () => new Promise((resolve) => server.close(resolve)) };
}

export const authHeader = (token) => ({ Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' });
